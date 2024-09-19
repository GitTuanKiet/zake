process.on('unhandledRejection', (_err) => `Unhandled rejection: ${_err}`);

process.on('uncaughtException', (err) => {
    console.log(`Uncaught exception: ${err}`);
    process.nextTick(() => process.exit(1));
    console.error('Uncaught exception, process quit.');
    throw err;
});

import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import logixlysia from 'logixlysia';
import { api } from './apis';
import { ZAKE_PORT, ZAKE_API_URL } from './constant';

new Elysia()
    .use(swagger({
        documentation: {
            info: {
                title: 'ZAKE API',
                description: 'ZAKE API Documentation',
                version: '0.0.1',
            },
            components: {
                securitySchemes: {
                    JwtAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                        description: 'Enter JWT Bearer token **_only_**',
                    },
                },
            },
            servers: [{ url: ZAKE_API_URL }],
        },
        swaggerOptions: {
            persistAuthorization: true,
        },
    }))
    .use(logixlysia())
    .use(api)
    .listen({
        port: ZAKE_PORT,
        hostname: "0.0.0.0",
        reusePort: true
    });