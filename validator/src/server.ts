import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMutations } from './schemas/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// In-memory state store
let currentDagState: unknown = null;
const wsClients = new Set<import('@fastify/websocket').WebSocket>();

function broadcast(message: unknown): void {
  const json = JSON.stringify(message);
  for (const client of wsClients) {
    try { client.send(json); } catch { wsClients.delete(client); }
  }
}

export function buildServer() {
  const server = Fastify({ logger: false });

  server.register(fastifyWebsocket);

  // Health
  server.get('/health', async () => ({
    status: 'ok',
    service: 'avm-validator',
  }));

  // JMP Validation
  server.post('/validate', async (request) => {
    const { mutations, context } = request.body as {
      mutations?: unknown[];
      context?: Record<string, string>;
    };

    if (!Array.isArray(mutations) || !context || typeof context !== 'object') {
      return { valid: false, errors: [{
        field: 'body',
        expected: '{mutations: array, context: object}',
        received: typeof request.body,
        message: 'Request body must contain mutations array and context object',
      }]};
    }
    return validateMutations(mutations, context);
  });

  // Get DAG state (polling fallback)
  server.get('/state', async () => ({ dag: currentDagState ?? null }));

  // PHP pushes state → broadcasts to WebSocket clients
  server.post('/broadcast', async (request) => {
    const { dag } = request.body as { dag?: unknown };
    if (dag) {
      currentDagState = dag;
      broadcast({ type: 'dag-update', dag, timestamp: Date.now() });
      return { ok: true, clients: wsClients.size };
    }
    return { ok: false, error: 'missing dag field' };
  });

  // Vue 3 Dashboard
  server.get('/dashboard', async (_request, reply) => {
    reply.type('text/html');
    try {
      return readFileSync(join(__dirname, 'dashboard.html'), 'utf-8');
    } catch {
      return '<h1>Dashboard not found</h1>';
    }
  });

  // WebSocket
  server.get('/ws', { websocket: true }, (socket, _req) => {
    wsClients.add(socket);
    if (currentDagState) {
      socket.send(JSON.stringify({
        type: 'dag-update', dag: currentDagState, timestamp: Date.now(),
      }));
    }
    socket.on('close', () => { wsClients.delete(socket); });
  });

  return server;
}

// Standalone
const isMainModule = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMainModule) {
  const server = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  server.listen({ port, host }).then(() => {
    console.log(`AVM at http://${host}:${port} | Dashboard: http://${host}:${port}/dashboard | WS: ws://${host}:${port}/ws`);
  }).catch((e: unknown) => { console.error(e); process.exit(1); });
}
