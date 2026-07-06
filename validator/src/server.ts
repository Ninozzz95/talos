import Fastify from 'fastify';
import { validateMutations } from './schemas/validate.js';

export function buildServer() {
  const server = Fastify({ logger: false });

  server.get('/health', async () => ({
    status: 'ok',
    service: 'avm-validator',
  }));

  server.post('/validate', async (request) => {
    const { mutations, context } = request.body as {
      mutations?: unknown[];
      context?: Record<string, string>;
    };

    if (!Array.isArray(mutations) || !context || typeof context !== 'object') {
      return {
        valid: false,
        errors: [{
          field: 'body',
          expected: '{mutations: array, context: object}',
          received: typeof request.body,
          message: 'Request body must contain mutations array and context object',
        }],
      };
    }

    return validateMutations(mutations, context);
  });

  return server;
}

// Avvio standalone solo se eseguito direttamente
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('server.ts') ||
  process.argv[1].endsWith('server.js')
);

if (isMainModule) {
  const server = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';

  server.listen({ port, host }).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
