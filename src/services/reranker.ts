import {
    type PreTrainedTokenizer,
    type PreTrainedModel,
} from "@huggingface/transformers";
import {
    AsyncCaller,
} from '../utils';
import { TokenizerSingleton } from '../singleton';

class CrossEncoderSingleton extends TokenizerSingleton {
    static model_id = 'mixedbread-ai/mxbai-rerank-xsmall-v1';
}

export class RerankerService {
    protected caller: AsyncCaller;

    returnDocuments: boolean;
    topK: number;
    model: string;

    constructor(fields: {
        maxConcurrency?: number;
        maxRetries?: number;
        returnDocuments?: boolean;
        topK?: number;
        model?: string;
    } = {}) {
        this.caller = new AsyncCaller({
            maxConcurrency: fields.maxConcurrency ?? Infinity,
            maxRetries: fields.maxRetries ?? 3,
        });
        this.returnDocuments = fields.returnDocuments ?? false;
        this.topK = fields.topK ?? 10;
        this.model = fields.model ?? 'mixedbread-ai/mxbai-rerank-xsmall-v1';
    }

    async rank(query: string, documents: string[]) {
        try {
            if (CrossEncoderSingleton.model_id !== this.model) {
                CrossEncoderSingleton.model_id = this.model;
            }
            const [tokenizer, model] = await CrossEncoderSingleton.getInstance() as [PreTrainedTokenizer, PreTrainedModel];

            const inputs = tokenizer(
                new Array(documents.length).fill(query),
                {
                    text_pair: documents,
                    padding: true,
                    truncation: true,
                }
            )

            const { logits } = await model(inputs);

            return (logits.sigmoid().tolist() as number[][])
                .map(([score], i) => ({
                    corpus_id: i,
                    score,
                    ...(this.returnDocuments ? { text: documents[i] } : {})
                })).sort((a, b) => b.score - a.score).slice(0, this.topK);
        } catch (error) {
            console.log("🚀 ~ RerankerService ~ rank ~ error:", error)
            throw error;
        }
    }
}