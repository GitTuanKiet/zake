import type { FileSink } from 'bun';
import { totalmem } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
    type Tensor,
    type FeatureExtractionPipelineOptions,
    FeatureExtractionPipeline,
} from "@huggingface/transformers";
import {
    AsyncCaller,
    chunkArray,
    insecureHash,
    parsePartialJson,
} from '../utils';
import { PipelineFactory } from '../pipeline';

class FeatureExtractionPipelineFactory extends PipelineFactory {
    static task = 'feature-extraction';
    static model = 'Xenova/all-MiniLM-L6-v2';
}

export class EmbeddingsCacheManager {
    private storageRoot = '.cache';
    static instance: EmbeddingsCacheManager;

    static getInstance() {
        if (!this.instance) {
            this.instance = new EmbeddingsCacheManager();
        }

        return this.instance;
    }

    async ensureDir(dirPath: string): Promise<boolean> {
        try {
            const { stat } = await import('node:fs/promises');
            const s = await stat(dirPath);
            return s.isDirectory();
        } catch {
            const { mkdir } = await import('node:fs/promises');
            await mkdir(dirPath, { recursive: true });
            return true;
        }
    }

    cacheEmbeddingsDir() {
        return 'embeddings';
    }

    tempDir() {
        const t = new Date().toLocaleDateString().split('/');

        return join(t[2], t[1].padStart(2, '0'), t[0].padStart(2, '0'));
    }

    tempFile() {
        return `${randomUUID()}.tmp`;
    }

    private async getFilePath(dirName: string, fileName: string, ensure = true): Promise<string> {
        const dirPath = resolve(this.storageRoot, dirName);
        if (ensure)
            await this.ensureDir(dirPath);
        return join(dirPath, fileName);
    }

    async readFile(dirName: string, fileName: string): Promise<string> {
        const filePath = await this.getFilePath(dirName, fileName, false);
        if ('Bun' in globalThis) {
            return await Bun.file(filePath).text();
        } else {
            const { readFile } = await import('node:fs/promises');
            return await readFile(filePath, 'utf-8');
        }
    }

    async storeBuffer(buffer: Buffer, dirName: string, fileName: string): Promise<void> {
        const filePath = await this.getFilePath(dirName, fileName);
        if ('Bun' in globalThis) {
            await Bun.write(filePath, buffer);
        } else {
            const { writeFile } = await import('node:fs/promises');
            await writeFile(filePath, buffer);
        }
    }

    async getWriteStream(dirName: string, fileName: string): Promise<FileSink | NodeJS.WritableStream> {
        const filePath = await this.getFilePath(dirName, fileName);
        if ('Bun' in globalThis) {
            return Bun.file(filePath).writer({ highWaterMark: 1024 * 1024 });
        } else {
            const { createWriteStream } = await import('node:fs');
            return createWriteStream(filePath);
        }
    }

    async removeFile(dirName: string, fileName: string): Promise<void> {
        const filePath = await this.getFilePath(dirName, fileName, false);
        if ('Bun' in globalThis) {
            const { $ } = await import('bun');
            await $`rm -f ${filePath}`;
        } else {
            const { rm } = await import('node:fs/promises');
            await rm(filePath);
        }
    }

    async clear() {
        if ('Bun' in globalThis) {
            const { $ } = await import('bun');

            await $`rm -rf ${this.storageRoot}`;
        } else {
            const { rm } = await import('node:fs/promises');
            await rm(this.storageRoot, { recursive: true, force: true });
        }
    }

    async mget(keys: string[]): Promise<(number[] | null)[]> {
        return await Promise.all(keys.map((key) => this.readFile(this.cacheEmbeddingsDir(), insecureHash(key))
            .then((data) => {
                if (!data) return null;
                return parsePartialJson(data);
            })
            .catch(() => null)));
    }

    async mset(keyValuePairs: [string, number[]][]): Promise<void> {
        await Promise.all(keyValuePairs.map(([key, value]) => this.storeBuffer(Buffer.from(JSON.stringify(value)), this.cacheEmbeddingsDir(), insecureHash(key))));
    }
}

export class EmbeddingsService {
    private cacheManager: EmbeddingsCacheManager = EmbeddingsCacheManager.getInstance();

    protected caller: AsyncCaller;
    
    static maxChunkSize = 1000;

    pipelineOptions: FeatureExtractionPipelineOptions;;
    stripNewLines: boolean;
    model: string;
    batchSize: number = 3 * (Math.floor(totalmem() / (256 * 1024 * 1024)) + 2);

    constructor(fields: {
        maxConcurrency?: number,
        maxRetries?: number,
        model?: string,
        stripNewLines?: boolean,
        pipelineOptions?: FeatureExtractionPipelineOptions
    } = {}) {
        this.caller = new AsyncCaller({
            maxConcurrency: fields?.maxConcurrency ?? Infinity,
            maxRetries: fields?.maxRetries ?? 3
        });
        this.pipelineOptions = {
            pooling: 'mean',
            normalize: true,
            ...fields?.pipelineOptions,
        };
        this.stripNewLines = fields?.stripNewLines ?? true;
        this.model = fields?.model ?? 'Xenova/all-MiniLM-L6-v2';
    }

    async cacheEmbedQuery(query: string): Promise<number[]> {
        const embeddings = await this.cacheEmbedDocuments([query]);

        return embeddings.length > 0 ? embeddings[0] : [];
    }

    async embedQuery(query: string): Promise<number[]> {
        const embeddings = await this.embedDocuments([query]);

        return embeddings.length > 0 ? embeddings[0] : [];
    }

    async cacheEmbedDocuments(documents: string[]): Promise<number[][]> {
        const vectors = await this.cacheManager.mget(documents);
        const missingIndices: number[] = [];
        const missingDocs = [];

        for (let i = 0; i < documents.length; i++) {
            if (!vectors[i]) {
                missingIndices.push(i);
                missingDocs.push(documents[i]);
            }
        }

        if (missingDocs.length) {
            const missingVectors = await this.embedDocuments(missingDocs);

            const keyValuePairs: [string, number[]][] = missingIndices.map((idx, i) => [documents[idx], missingVectors[i]]);
            await this.cacheManager.mset(keyValuePairs);
            for (let i = 0; i < missingIndices.length; i++) {
                vectors[missingIndices[i]] = missingVectors[i];
            }
        }

        return vectors as number[][];
    }

    async embedDocuments(documents: string[]): Promise<number[][]> {
        const chunkArr = chunkArray(
            this.stripNewLines ? documents.map((t) => t.replace(/\n/g, " ")) : documents,
            this.batchSize
        );
        const dirName = this.cacheManager.tempDir();
        const fileName = this.cacheManager.tempFile();
        const writer = await this.cacheManager.getWriteStream(dirName, fileName);

        for (const [idx, chunks] of chunkArr.entries()) {
            await this.caller.call(async () => {
                let content: string | null = null;
                let output: Tensor | null = null;
                let pipe: FeatureExtractionPipeline | null = null;

                if (idx === 0) writer.write(`[`)
                if (!pipe) {
                    if (FeatureExtractionPipelineFactory.model !== this.model) {
                        FeatureExtractionPipelineFactory.model = this.model;
                    }
                    pipe = await (FeatureExtractionPipelineFactory.getInstance()) as FeatureExtractionPipeline;
                }
                output = await pipe(chunks, this.pipelineOptions);
                if (!output) {
                    content = null;
                    output = null;
                    pipe = null;
                    return;
                }

                content = JSON.stringify(output.tolist());
                await this.cacheManager.storeBuffer(Buffer.from(content), dirName, fileName);

                writer.write(content);
                if (idx < chunkArr.length - 1) writer.write(`,`);
                else writer.write(`]`);
                content = null;
                output = null;
                pipe = null;
            });
        }
        writer.end();

        const embeddings: number[][][] = JSON.parse((await this.cacheManager.readFile(dirName, fileName))!);
        await this.cacheManager.removeFile(dirName, fileName);
        return embeddings.length > 0 ? embeddings.flat() : [];
    }
}