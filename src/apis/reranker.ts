import { Elysia, t } from "elysia";
import { estimateToken } from "../utils";
import { RerankerService } from '../services/reranker';

const rerankDTO = t.Object({
    model: t.Optional(t.String({ description: 'Model to use', default: 'mixedbread-ai/mxbai-rerank-xsmall-v1' })),
    query: t.String({ minLength: 1, description: 'Query to rerank' }),
    documents: t.Array(t.String({ minLength: 1, description: 'Documents to rerank' }), { description: 'Documents to rerank' }),
    topK: t.Optional(t.Number({ description: 'Top K documents to return', default: 10 })),
    returnDocuments: t.Optional(t.Boolean({ description: 'Return documents', default: false })),
});

const responseSchema = t.Object({
    status: t.Union([t.Literal('success'), t.Literal('error')]),
    results: t.Array(t.Object({
        corpus_id: t.Number(),
        score: t.Number(),
        text: t.Optional(t.String()),
    })),
    metadata: t.Object({
        tokens: t.Number(),
        duration: t.Number(),
    }),
}, {
    description: 'Reranking results'
});

export const reranker = new Elysia({ prefix: '/reranker' })
    .post('', async ({ body }) => {
        const reranker = new RerankerService({
            model: body.model,
            topK: body.topK,
            returnDocuments: body.returnDocuments,
        });
        const start = Date.now();
        const results = await reranker.rank(body.query, body.documents);
        const duration = Date.now() - start;
        const tokens = estimateToken(body.query);

        return {
            status: results.length ? 'success' : 'error',
            results,
            metadata: { tokens, duration },
        };
    }, {
        body: rerankDTO,
        response: responseSchema,
        detail: { tags: ['Reranker'], description: 'Rerank documents' },
    });