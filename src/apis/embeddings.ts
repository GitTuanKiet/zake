import { Elysia, t } from "elysia";
import { estimateToken } from "../utils";
import { EmbeddingsService } from '../services/embeddings';

const chunk = t.String({
    minLength: 1,
    maxLength: EmbeddingsService.maxChunkSize * 1.25,
    description: 'Value to embed',
    error: `Max length is ${EmbeddingsService.maxChunkSize * 1.25}`,
});

const queryDTO = t.Object({ query: chunk }, { description: 'Query to embed' });
const documentsDTO = t.Object({ documents: t.Array(chunk, { description: 'Documents to embed' }) });

const responseSchema = t.Object({
    status: t.Union([t.Literal('success'), t.Literal('error')]),
    vector: t.Nullable(t.Array(t.Number())),
    metadata: t.Object({
        tokens: t.Number(),
        duration: t.Number(),
    }),
}, {
    description: 'Embedding vector'
});

const responseSchemaArray = t.Object({
    status: t.Union([t.Literal('success'), t.Literal('error')]),
    vectors: t.Nullable(t.Array(t.Array(t.Number()))),
    metadata: t.Object({
        tokens: t.Number(),
        duration: t.Number(),
    }),
}, {
    description: 'Embedding vectors'
});

export const embeddings = new Elysia({ prefix: '/embeddings' })
    .decorate('embeddings', new (EmbeddingsService))
    .get('', async ({ embeddings, query }) => {
        const start = Date.now();
        const vector = await embeddings.embedQuery(query.query);
        const duration = Date.now() - start;
        const token = estimateToken(query.query);

        return {
            status: vector.length ? 'success' : 'error',
            vector,
            metadata: { tokens: token, duration },
        };
    }, {
        query: queryDTO,
        response: responseSchema,
        detail: { tags: ['Embeddings'], description: 'Embed query value' },
    })
    .post('', async ({ embeddings, body }) => {
        const start = Date.now();
        const vectors = await embeddings.embedDocuments(body.documents);
        const duration = Date.now() - start;
        const tokens = estimateToken(body.documents);

        return {
            status: vectors.length ? 'success' : 'error',
            vectors,
            metadata: { tokens, duration },
        }
    }, {
        body: documentsDTO,
        response: responseSchemaArray,
        detail: { tags: ['Embeddings'], description: 'Embed documents' },
    })
    .group('/cache', (cache) => cache
        .get('', async ({ embeddings, query }) => {
            
            const start = Date.now();
            const vector = await embeddings.cacheEmbedQuery(query.query);
            const duration = Date.now() - start;
            const token = estimateToken(query.query);

            return {
                status: vector.length ? 'success' : 'error',
                vector,
                metadata: { tokens: token, duration },
            };
        }, {
            query: queryDTO,
            response: responseSchema,
            detail: { tags: ['Embeddings'], description: 'Cache backed embedding for query' },
        })
        .post('', async ({ embeddings, body }) => {
            const start = Date.now();
            const vectors = await embeddings.cacheEmbedDocuments(body.documents);
            const duration = Date.now() - start;
            const tokens = estimateToken(body.documents);

            return {
                status: vectors.length ? 'success' : 'error',
                vectors,
                metadata: { tokens, duration },
            }
        }, {
            body: documentsDTO,
            response: responseSchemaArray,
            detail: { tags: ['Embeddings'], description: 'Cache backed embedding for documents' },
        })
    );