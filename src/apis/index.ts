import { Elysia } from 'elysia';
import { embeddings } from './embeddings';
import { reranker } from './reranker';

export const api = new Elysia({ prefix: '/api' })
    .get('/health', async () => {
        return { status: 'ok' };
    })
    .group('/v1', (v1) => v1.use(embeddings).use(reranker));

export type ZAKE_API = typeof api;