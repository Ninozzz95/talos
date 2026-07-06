import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
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
      return readFileSync(join(process.cwd(), 'src', 'dashboard.html'), 'utf-8');
    } catch {
      return '<h1>Dashboard not found</h1>';
    }
  });

  // Chat relay to PHP
  server.post('/chat', async (request) => {
    const { message, api_key } = request.body as { message?: string; api_key?: string };
    if (!message) return { error: 'message required' };

    // Use absolute path to PHP binary — env var override if set
    const phpBin = process.env.PHP_BIN || join(process.cwd(), '..', '.tools', 'php', 'php.exe');
    const chatScript = join(process.cwd(), '..', 'core', 'talos-chat.php');

    return new Promise((resolve) => {
      const php = spawn(phpBin, [chatScript], {
        env: { ...process.env, DEEPSEEK_API_KEY: api_key || process.env.DEEPSEEK_API_KEY || '' },
      });
      let output = '';
      php.stdout.on('data', (data: Buffer) => { output += data.toString(); });
      php.stderr.on('data', () => {});
      php.on('close', () => {
        try { resolve(JSON.parse(output.trim().split('\n').pop() || '{}')); }
        catch { resolve({ error: 'chat error', raw: output.slice(-200) }); }
      });
      php.stdin.write(JSON.stringify({ message, api_key }) + '\n');
      php.stdin.end();
    });
  });

  // Benchmark Lab: run a single scenario live
  server.post('/benchmark', async (request) => {
    const { scenario, api_key, use_live } = request.body as { scenario?: string; api_key?: string; use_live?: boolean };
    if (!scenario) return { error: 'scenario name required' };

    const phpBin = process.env.PHP_BIN || join(process.cwd(), '..', '.tools', 'php', 'php.exe');
    const benchScript = join(process.cwd(), '..', 'core', 'talos-bench-live.php');
    const scenarioFile = join(process.cwd(), '..', 'core', 'tests', 'benchmarks', 'scenarios', scenario + '.json');

    return new Promise((resolve) => {
      const args = [benchScript, scenarioFile];
      if (use_live && api_key) args.push(api_key);
      const php = spawn(phpBin, args, {
        env: { ...process.env, DEEPSEEK_API_KEY: api_key || '' },
      });
      let output = '';
      php.stdout.on('data', (data: Buffer) => { output += data.toString(); });
      php.stderr.on('data', () => {});
      php.on('close', () => {
        try { resolve(JSON.parse(output.trim() || '{}')); }
        catch { resolve({ error: 'benchmark error', raw: output.slice(-200) }); }
      });
    });
  });

  // List available benchmark scenarios
  server.get('/benchmarks', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = join(process.cwd(), '..', 'core', 'tests', 'benchmarks', 'scenarios');
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.json'));
      return files.map(f => {
        const data = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
        return { file: f.replace('.json', ''), name: data.name, difficulty: data.difficulty, description: data.description };
      });
    } catch { return []; }
  });

  // Static theme engine CSS
  server.get('/theme-engine.css', async (_request, reply) => {
    reply.type('text/css');
    try {
      return readFileSync(join(process.cwd(), 'src', 'theme-engine.css'), 'utf-8');
    } catch {
      return '/* theme engine not found */';
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

  // Static media files
  server.get('/media/*', async (request, reply) => {
    const file = (request.params as { '*': string })['*'];
    const filePath = join(process.cwd(), '..', 'core', 'media', 'talos_png_media_suite', file);
    try {
      const data = readFileSync(filePath);
      reply.type('image/png');
      return data;
    } catch {
      reply.status(404);
      return { error: 'not found' };
    }
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
