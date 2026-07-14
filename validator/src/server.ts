import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { validateMutations } from './schemas/validate.js';
import { registerToolValidationRoutes } from './routes/toolValidation.js';

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

function isSafeScenarioName(value: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

function redactSensitiveText(
  message: string,
  knownSecrets: Array<string | undefined | null> = [],
  maxLength: number | null = 800,
): string {
  let redacted = message;
  for (const secret of knownSecrets) {
    if (!secret) continue;
    redacted = redacted.split(secret).join('[redacted]');
    redacted = redacted.split(encodeURIComponent(secret)).join('[redacted]');
  }

  const sanitized = redacted
    .replace(/(Bearer|Token|Api-Key|x-api-key)\s+[^\s]+/gi, '$1 [redacted]')
    .replace(/\bsk-[A-Za-z0-9._-]+/gi, '[redacted]')
    .replace(/(?<=:\/\/)[^\/@\s]+:[^\/@\s]+@/g, '[redacted]@')
    .replace(/([?&](?:api_key|key|token|secret)=)[^&\s]+/gi, '$1[redacted]');

  return maxLength === null ? sanitized : sanitized.slice(0, maxLength);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  if (new Set([
    'secret', 'token', 'password', 'passphrase', 'api_key', 'authorization', 'cookie',
    'access_token', 'refresh_token', 'client_secret', 'private_key', 'credential', 'credentials',
  ]).has(normalized)) return true;

  return /_(?:secret|token|password|passphrase|api_key|access_token|refresh_token|private_key|authorization|cookie|credential|credentials)$/.test(normalized);
}

function redactSensitiveValue(value: unknown, knownSecrets: string[]): unknown {
  if (typeof value === 'string') return redactSensitiveText(value, knownSecrets, null);
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(item, knownSecrets));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key,
    isSensitiveKey(key) && typeof child !== 'boolean' && typeof child !== 'number' && child !== null
      ? '[redacted]'
      : redactSensitiveValue(child, knownSecrets),
  ]));
}

function handleSpawnError(
  child: ReturnType<typeof spawn>,
  resolve: (value: unknown) => void,
  code: string,
  message: string,
  knownSecrets: string[] = configuredSecrets(),
): void {
  child.stdin?.on('error', () => undefined);
  child.once('error', (error) => {
    resolve({
      error: message,
      code,
      details: redactSensitiveText(error.message, knownSecrets),
    });
  });
}

function configuredSecrets(...requestSecrets: Array<string | undefined | null>): string[] {
  const environmentSecrets = Object.entries(process.env)
    .filter(([key, value]) => /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION|CREDENTIAL)/i.test(key)
      && typeof value === 'string'
      && value.length >= 4)
    .map(([, value]) => value as string);

  return [...new Set([
    ...requestSecrets.filter((value): value is string => typeof value === 'string' && value.length >= 4),
    ...environmentSecrets,
  ])];
}

export function buildServer() {
  const server = Fastify({ logger: false });

  server.register(fastifyWebsocket);
  registerToolValidationRoutes(server);

  // Health
  server.get('/health', async () => ({
    status: 'ok',
    service: 'avm-validator',
  }));

  // JMP Validation
  server.post('/validate', async (request) => {
    const rawBody = request.body;
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return { valid: false, errors: [{
        field: 'body',
        expected: '{mutations: array, context: object}',
        received: rawBody === null ? 'null' : typeof rawBody,
        message: 'Request body must contain mutations array and context object',
      }]};
    }
    const body = rawBody as Record<string, unknown>;
    const mutations = body.mutations;
    const context = body.context;
    if (!Array.isArray(mutations) || !context || typeof context !== 'object' || Array.isArray(context)) {
      return { valid: false, errors: [{
        field: 'body',
        expected: '{mutations: array, context: object}',
        received: typeof rawBody,
        message: 'Request body must contain mutations array and context object',
      }]};
    }
    for (const policyKey of ['allowed_node_types', 'allowed_browser_operations'] as const) {
      const policy = body[policyKey];
      if (Object.prototype.hasOwnProperty.call(body, policyKey)
        && policy !== null
        && (!Array.isArray(policy) || policy.some((value) => typeof value !== 'string'))
      ) {
        return { valid: false, errors: [{
          field: policyKey,
          expected: 'null or an array of strings',
          received: Array.isArray(policy) ? 'array with non-string values' : typeof policy,
          message: `${policyKey} must be null or an array containing only strings.`,
        }] };
      }
    }
    const allowedNodeTypes = Array.isArray(body.allowed_node_types) ? body.allowed_node_types as string[] : undefined;
    const allowedBrowserOperations = Array.isArray(body.allowed_browser_operations) ? body.allowed_browser_operations as string[] : undefined;

    return validateMutations(mutations, context as Record<string, string>, allowedNodeTypes, allowedBrowserOperations, body.browser_mode_enabled === true);
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

  // Canonical UI lives in the Laravel control-plane. The validator remains API/telemetry only.
  server.get('/dashboard', async (_request, reply) => {
    const talosUrl = process.env.TALOS_CHAT_URL ?? process.env.TALOS_DASHBOARD_URL ?? 'http://127.0.0.1:8000/';
    reply.redirect(talosUrl, 302);
  });

  // Legacy telemetry screen kept explicit for local diagnostics.
  server.get('/validator-dashboard', async (_request, reply) => {
    reply.type('text/html');
    try {
      return readFileSync(join(process.cwd(), 'src', 'dashboard.html'), 'utf-8');
    } catch {
      return '<h1>Dashboard not found</h1>';
    }
  });

  // Chat relay to PHP
  server.post('/chat', async (request) => {
    const { message, api_key, provider, model, base_url, tool_context, browser_mode } = request.body as {
      message?: string;
      api_key?: string;
      provider?: string;
      model?: string;
      base_url?: string | null;
      tool_context?: unknown;
      browser_mode?: unknown;
    };
    if (!message) return { error: 'message required' };

    // Use absolute path to PHP binary — env var override if set
    const phpBin = process.env.PHP_BIN || join(process.cwd(), '..', '.tools', 'php', 'php.exe');
    const chatScript = process.env.KADMOS_CHAT_SCRIPT || join(process.cwd(), '..', 'core', 'kadmos-chat.php');

    const knownSecrets = configuredSecrets(api_key);
    return new Promise((resolve) => {
      const php = spawn(phpBin, [chatScript], {
        env: {
          ...process.env,
          DEEPSEEK_API_KEY: api_key || process.env.DEEPSEEK_API_KEY || '',
          KADMOS_PROVIDER: provider || process.env.KADMOS_PROVIDER || '',
          KADMOS_MODEL: model || process.env.KADMOS_MODEL || '',
          KADMOS_BASE_URL: base_url || process.env.KADMOS_BASE_URL || '',
        },
      });
      handleSpawnError(php, resolve, 'CORE_CHAT_PROCESS_FAILED', 'Core chat process failed.', knownSecrets);
      let output = '';
      let errorOutput = '';
      php.stdout.on('data', (data: Buffer) => { output += data.toString(); });
      php.stderr.on('data', (data: Buffer) => { errorOutput += data.toString(); });
      php.on('close', (code) => {
        const lastLine = output.trim().split('\n').filter(Boolean).pop() || '';
        if (lastLine !== '') {
          try { resolve(redactSensitiveValue(JSON.parse(lastLine), knownSecrets)); return; }
          catch {
            resolve({
              error: 'Core chat process returned invalid JSON.',
              code: 'CORE_CHAT_INVALID_JSON',
              exit_code: code,
              details: redactSensitiveText(lastLine || output.slice(-500), knownSecrets),
            });
            return;
          }
        }

        if (code !== 0 || errorOutput.trim() !== '') {
          resolve({
            error: 'Core chat process failed.',
            code: 'CORE_CHAT_PROCESS_FAILED',
            exit_code: code,
            details: redactSensitiveText(errorOutput.trim() || 'Process exited without output.', knownSecrets),
          });
          return;
        }

        resolve({ error: 'Core chat process returned no output.', code: 'CORE_CHAT_EMPTY_OUTPUT' });
      });
      php.stdin.write(JSON.stringify({ message, api_key, provider, model, base_url, tool_context, browser_mode }) + '\n');
      php.stdin.end();
    });
  });

  // Headless API: execute JMP batch directly
  server.post('/execute', async (request) => {
    const { mutations, api_key } = request.body as { mutations?: unknown[]; api_key?: string };
    if (!mutations || !Array.isArray(mutations)) return { error: 'mutations array required' };

    const phpBin = process.env.PHP_BIN || join(process.cwd(), '..', '.tools', 'php', 'php.exe');
    const script = join(process.cwd(), '..', 'core', 'kadmos-execute.php');

    return new Promise((resolve) => {
      const php = spawn(phpBin, [script], { env: { ...process.env } });
      handleSpawnError(php, resolve, 'CORE_EXECUTE_PROCESS_FAILED', 'Core execute process failed.', configuredSecrets(api_key));
      let output = '';
      php.stdout.on('data', (data: Buffer) => { output += data.toString(); });
      php.stderr.on('data', () => {});
      php.on('close', () => {
        try { resolve(JSON.parse(output.trim() || '{}')); }
        catch { resolve({ error: 'execute error' }); }
      });
      php.stdin.write(JSON.stringify({ mutations }) + '\n');
      php.stdin.end();
    });
  });

  // Benchmark Lab: run a single scenario live
  server.post('/benchmark', async (request, reply) => {
    const { scenario, api_key, use_live } = request.body as { scenario?: string; api_key?: string; use_live?: boolean };
    if (!scenario || !isSafeScenarioName(scenario)) {
      reply.status(400);
      return { error: 'scenario must be a safe benchmark scenario name' };
    }

    const phpBin = process.env.PHP_BIN || join(process.cwd(), '..', '.tools', 'php', 'php.exe');
    const benchScript = process.env.KADMOS_BENCHMARK_SCRIPT || join(process.cwd(), '..', 'core', 'kadmos-bench-live.php');
    const scenarioFile = join(process.cwd(), '..', 'core', 'tests', 'benchmarks', 'scenarios', scenario + '.json');
    const liveApiKey = use_live ? (api_key || process.env.DEEPSEEK_API_KEY || '') : '';
    const knownSecrets = configuredSecrets(api_key, liveApiKey);

    return new Promise((resolve) => {
      const args = [benchScript, scenarioFile];
      const php = spawn(phpBin, args, {
        env: { ...process.env, DEEPSEEK_API_KEY: liveApiKey },
      });
      handleSpawnError(php, resolve, 'BENCHMARK_PROCESS_FAILED', 'Benchmark process failed.', knownSecrets);
      let output = '';
      php.stdout.on('data', (data: Buffer) => { output += data.toString(); });
      php.stderr.on('data', () => {});
      php.on('close', () => {
        try { resolve(redactSensitiveValue(JSON.parse(output.trim() || '{}'), knownSecrets)); }
        catch { resolve({ error: 'benchmark error', raw: redactSensitiveText(output.slice(-200), knownSecrets) }); }
      });
    });
  });

  // Benchmark Lab 2.0: deterministic AVM ON/OFF/tool-agent comparison
  server.post('/benchmark/compare', async (request, reply) => {
    const { scenario, runs } = request.body as { scenario?: string; runs?: number };
    if (!scenario || !isSafeScenarioName(scenario)) {
      reply.status(400);
      return { error: 'scenario must be a safe benchmark scenario name' };
    }

    const runCount = Number.isFinite(runs) ? Math.max(1, Math.min(50, Number(runs))) : 1;
    const phpBin = process.env.PHP_BIN || join(process.cwd(), '..', '.tools', 'php', 'php.exe');
    const kadmosCli = process.env.KADMOS_CLI || join(process.cwd(), '..', 'core', 'kadmos');
    const scenarioFile = join(process.cwd(), '..', 'core', 'tests', 'benchmarks', 'scenarios', scenario + '.json');
    const knownSecrets = configuredSecrets();

    return new Promise((resolve) => {
      const php = spawn(phpBin, [
        kadmosCli,
        'benchmark',
        'compare',
        '--scenario=' + scenarioFile,
        '--runs=' + String(runCount),
        '--json',
      ], { env: { ...process.env } });
      handleSpawnError(php, resolve, 'BENCHMARK_COMPARE_PROCESS_FAILED', 'Benchmark comparison process failed.', knownSecrets);

      let output = '';
      let errorOutput = '';
      php.stdout.on('data', (data: Buffer) => { output += data.toString(); });
      php.stderr.on('data', (data: Buffer) => { errorOutput += data.toString(); });
      php.on('close', (code) => {
        if (code !== 0) {
          resolve({ error: 'benchmark compare failed', code, details: redactSensitiveText(errorOutput.slice(-500) || output.slice(-500), configuredSecrets()) });
          return;
        }

        try {
          resolve(redactSensitiveValue(JSON.parse(output.trim() || '{}'), knownSecrets));
        } catch {
          resolve({ error: 'benchmark compare returned invalid JSON', raw: redactSensitiveText(output.slice(-500), configuredSecrets()) });
        }
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
    const talosUrl = process.env.TALOS_CHAT_URL ?? process.env.TALOS_DASHBOARD_URL ?? 'http://127.0.0.1:8000/';
    console.log(`AVM at http://${host}:${port} | Talos: ${talosUrl} | Validator telemetry: http://${host}:${port}/validator-dashboard | WS: ws://${host}:${port}/ws`);
  }).catch((e: unknown) => { console.error(e); process.exit(1); });
}
