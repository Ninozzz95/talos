import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { validateMutations } from './schemas/validate.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
// In-memory state store
let currentDagState = null;
const wsClients = new Set();
function broadcast(message) {
    const json = JSON.stringify(message);
    for (const client of wsClients) {
        try {
            client.send(json);
        }
        catch {
            wsClients.delete(client);
        }
    }
}
function isSafeScenarioName(value) {
    return /^[a-zA-Z0-9_-]+$/.test(value);
}
function redactSensitiveText(message, knownSecrets = []) {
    let redacted = message;
    for (const secret of knownSecrets) {
        if (!secret)
            continue;
        redacted = redacted.split(secret).join('[redacted]');
        redacted = redacted.split(encodeURIComponent(secret)).join('[redacted]');
    }
    return redacted
        .replace(/(Bearer|Token|Api-Key|x-api-key)\s+[^\s]+/gi, '$1 [redacted]')
        .replace(/\bsk-[A-Za-z0-9._-]+/gi, '[redacted]')
        .replace(/([?&](?:api_key|key|token|secret)=)[^&\s]+/gi, '$1[redacted]')
        .slice(0, 800);
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
        const { mutations, context } = request.body;
        if (!Array.isArray(mutations) || !context || typeof context !== 'object') {
            return { valid: false, errors: [{
                        field: 'body',
                        expected: '{mutations: array, context: object}',
                        received: typeof request.body,
                        message: 'Request body must contain mutations array and context object',
                    }] };
        }
        const body = request.body;
        for (const policyKey of ['allowed_node_types', 'allowed_browser_operations']) {
            const policy = body[policyKey];
            if (Object.prototype.hasOwnProperty.call(body, policyKey)
                && policy !== null
                && (!Array.isArray(policy) || policy.some((value) => typeof value !== 'string'))) {
                return { valid: false, errors: [{
                            field: policyKey,
                            expected: 'null or an array of strings',
                            received: Array.isArray(policy) ? 'array with non-string values' : typeof policy,
                            message: `${policyKey} must be null or an array containing only strings.`,
                        }] };
            }
        }
        const allowedNodeTypes = Array.isArray(body.allowed_node_types) ? body.allowed_node_types : undefined;
        const allowedBrowserOperations = Array.isArray(body.allowed_browser_operations) ? body.allowed_browser_operations : undefined;
        return validateMutations(mutations, context, allowedNodeTypes, allowedBrowserOperations, request.body.browser_mode_enabled === true);
    });
    // Get DAG state (polling fallback)
    server.get('/state', async () => ({ dag: currentDagState ?? null }));
    // PHP pushes state → broadcasts to WebSocket clients
    server.post('/broadcast', async (request) => {
        const { dag } = request.body;
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
        }
        catch {
            return '<h1>Dashboard not found</h1>';
        }
    });
    // Chat relay to PHP
    server.post('/chat', async (request) => {
        const { message, api_key, provider, model, base_url, tool_context, browser_mode } = request.body;
        if (!message)
            return { error: 'message required' };
        // Use absolute path to PHP binary — env var override if set
        const phpBin = process.env.PHP_BIN || join(process.cwd(), '..', '.tools', 'php', 'php.exe');
        const chatScript = process.env.KADMOS_CHAT_SCRIPT || join(process.cwd(), '..', 'core', 'kadmos-chat.php');
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
            let output = '';
            let errorOutput = '';
            php.stdout.on('data', (data) => { output += data.toString(); });
            php.stderr.on('data', (data) => { errorOutput += data.toString(); });
            php.on('close', (code) => {
                const lastLine = output.trim().split('\n').filter(Boolean).pop() || '';
                if (lastLine !== '') {
                    try {
                        resolve(JSON.parse(lastLine));
                        return;
                    }
                    catch {
                        resolve({
                            error: 'Core chat process returned invalid JSON.',
                            code: 'CORE_CHAT_INVALID_JSON',
                            exit_code: code,
                            details: redactSensitiveText(lastLine || output.slice(-500), [api_key]),
                        });
                        return;
                    }
                }
                if (code !== 0 || errorOutput.trim() !== '') {
                    resolve({
                        error: 'Core chat process failed.',
                        code: 'CORE_CHAT_PROCESS_FAILED',
                        exit_code: code,
                        details: redactSensitiveText(errorOutput.trim() || 'Process exited without output.', [api_key]),
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
        const { mutations, api_key } = request.body;
        if (!mutations || !Array.isArray(mutations))
            return { error: 'mutations array required' };
        const phpBin = process.env.PHP_BIN || join(process.cwd(), '..', '.tools', 'php', 'php.exe');
        const script = join(process.cwd(), '..', 'core', 'kadmos-execute.php');
        return new Promise((resolve) => {
            const php = spawn(phpBin, [script], { env: { ...process.env } });
            let output = '';
            php.stdout.on('data', (data) => { output += data.toString(); });
            php.stderr.on('data', () => { });
            php.on('close', () => {
                try {
                    resolve(JSON.parse(output.trim() || '{}'));
                }
                catch {
                    resolve({ error: 'execute error' });
                }
            });
            php.stdin.write(JSON.stringify({ mutations }) + '\n');
            php.stdin.end();
        });
    });
    // Benchmark Lab: run a single scenario live
    server.post('/benchmark', async (request) => {
        const { scenario, api_key, use_live } = request.body;
        if (!scenario)
            return { error: 'scenario name required' };
        const phpBin = process.env.PHP_BIN || join(process.cwd(), '..', '.tools', 'php', 'php.exe');
        const benchScript = join(process.cwd(), '..', 'core', 'talos-bench-live.php');
        const scenarioFile = join(process.cwd(), '..', 'core', 'tests', 'benchmarks', 'scenarios', scenario + '.json');
        return new Promise((resolve) => {
            const args = [benchScript, scenarioFile];
            if (use_live && api_key)
                args.push(api_key);
            const php = spawn(phpBin, args, {
                env: { ...process.env, DEEPSEEK_API_KEY: api_key || '' },
            });
            let output = '';
            php.stdout.on('data', (data) => { output += data.toString(); });
            php.stderr.on('data', () => { });
            php.on('close', () => {
                try {
                    resolve(JSON.parse(output.trim() || '{}'));
                }
                catch {
                    resolve({ error: 'benchmark error', raw: output.slice(-200) });
                }
            });
        });
    });
    // Benchmark Lab 2.0: deterministic AVM ON/OFF/tool-agent comparison
    server.post('/benchmark/compare', async (request, reply) => {
        const { scenario, runs } = request.body;
        if (!scenario || !isSafeScenarioName(scenario)) {
            reply.status(400);
            return { error: 'scenario must be a safe benchmark scenario name' };
        }
        const runCount = Number.isFinite(runs) ? Math.max(1, Math.min(50, Number(runs))) : 1;
        const phpBin = process.env.PHP_BIN || join(process.cwd(), '..', '.tools', 'php', 'php.exe');
        const kadmosCli = join(process.cwd(), '..', 'core', 'kadmos');
        const scenarioFile = join(process.cwd(), '..', 'core', 'tests', 'benchmarks', 'scenarios', scenario + '.json');
        return new Promise((resolve) => {
            const php = spawn(phpBin, [
                kadmosCli,
                'benchmark',
                'compare',
                '--scenario=' + scenarioFile,
                '--runs=' + String(runCount),
                '--json',
            ], { env: { ...process.env } });
            let output = '';
            let errorOutput = '';
            php.stdout.on('data', (data) => { output += data.toString(); });
            php.stderr.on('data', (data) => { errorOutput += data.toString(); });
            php.on('close', (code) => {
                if (code !== 0) {
                    resolve({ error: 'benchmark compare failed', code, details: errorOutput.slice(-500) || output.slice(-500) });
                    return;
                }
                try {
                    resolve(JSON.parse(output.trim() || '{}'));
                }
                catch {
                    resolve({ error: 'benchmark compare returned invalid JSON', raw: output.slice(-500) });
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
        }
        catch {
            return [];
        }
    });
    // Static theme engine CSS
    server.get('/theme-engine.css', async (_request, reply) => {
        reply.type('text/css');
        try {
            return readFileSync(join(process.cwd(), 'src', 'theme-engine.css'), 'utf-8');
        }
        catch {
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
        const file = request.params['*'];
        const filePath = join(process.cwd(), '..', 'core', 'media', 'talos_png_media_suite', file);
        try {
            const data = readFileSync(filePath);
            reply.type('image/png');
            return data;
        }
        catch {
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
    }).catch((e) => { console.error(e); process.exit(1); });
}
//# sourceMappingURL=server.js.map