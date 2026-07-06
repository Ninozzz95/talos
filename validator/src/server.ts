import Fastify from 'fastify';

const server = Fastify({ logger: true });

server.get('/health', async () => ({
  status: 'ok',
  service: 'avm-validator',
}));

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

server.listen({ port, host }).catch((error: unknown) => {
  server.log.error(error);
  process.exit(1);
});
