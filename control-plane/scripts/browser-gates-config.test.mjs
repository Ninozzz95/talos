import assert from 'node:assert/strict'
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(scriptDirectory, '..', '..')

function readYaml(relativePath) {
    return parse(readFileSync(path.join(workspaceRoot, relativePath), 'utf8'))
}

function stepIndex(steps, predicate, description) {
    const index = steps.findIndex(predicate)
    assert.notEqual(index, -1, `Missing browser-worker-live step: ${description}`)
    return index
}

function environmentValue(environment, name) {
    if (Array.isArray(environment)) {
        const entry = environment.find((value) => typeof value === 'string' && value.startsWith(`${name}=`))
        return entry?.slice(name.length + 1)
    }
    return environment?.[name]
}

function assertComposeModel(compose) {
    const services = compose?.services
    assert.equal(typeof services, 'object')
    assert.match(String(services['browser-worker']?.build?.dockerfile), /Dockerfile\.browser-worker$/)
    assert.equal(environmentValue(services['browser-worker']?.environment, 'HOST'), '0.0.0.0')
    assert.equal(String(environmentValue(services['browser-worker']?.environment, 'PORT')), '3100')
    assert.match(String(environmentValue(services['browser-worker']?.environment, 'TALOS_BROWSER_WORKER_TOKEN')), /TALOS_BROWSER_WORKER_TOKEN|^[a-f0-9]{64}$/)
    assert.match(String(environmentValue(services['browser-worker']?.environment, 'TALOS_BROWSER_ACTION_PUBLIC_KEY_B64')), /TALOS_BROWSER_ACTION_PUBLIC_KEY_B64|public-key-material/)
    assert.match(String(environmentValue(services['browser-worker']?.environment, 'TALOS_BROWSER_ACTION_KEY_ID')), /TALOS_BROWSER_ACTION_KEY_ID|browser-action-key/)
    assert.equal(environmentValue(services['browser-worker']?.environment, 'TALOS_BROWSER_ACTION_PRIVATE_KEY_B64'), undefined)
    assert.match(JSON.stringify(services['browser-worker']?.healthcheck?.test), /talos\.browser\.worker\.v2/)
    assert.match(JSON.stringify(services['browser-worker']?.healthcheck?.test), /talos_browser_hmi_runtime_v2\.1\.0/)
    assert.equal(services.talos?.depends_on?.['browser-worker']?.condition, 'service_healthy')
    assert.equal(environmentValue(services.talos?.environment, 'TALOS_BROWSER_WORKER_URL'), 'http://browser-worker:3100')
    assert.match(String(environmentValue(services.talos?.environment, 'TALOS_BROWSER_WORKER_TOKEN')), /TALOS_BROWSER_WORKER_TOKEN|^[a-f0-9]{64}$/)
    assert.match(String(environmentValue(services.talos?.environment, 'TALOS_BROWSER_ACTION_PRIVATE_KEY_B64')), /TALOS_BROWSER_ACTION_PRIVATE_KEY_B64|private-key-material/)
    assert.match(String(environmentValue(services.talos?.environment, 'TALOS_BROWSER_ACTION_KEY_ID')), /TALOS_BROWSER_ACTION_KEY_ID|browser-action-key/)
    assert.equal(environmentValue(services.talos?.environment, 'TALOS_BROWSER_ACTION_PUBLIC_KEY_B64'), '')
    assert.match(String(environmentValue(services['talos-queue']?.environment, 'TALOS_BROWSER_ACTION_PRIVATE_KEY_B64')), /TALOS_BROWSER_ACTION_PRIVATE_KEY_B64|private-key-material/)
    assert.match(String(environmentValue(services['talos-queue']?.environment, 'TALOS_BROWSER_ACTION_KEY_ID')), /TALOS_BROWSER_ACTION_KEY_ID|browser-action-key/)
    assert.equal(environmentValue(services['talos-queue']?.environment, 'TALOS_BROWSER_ACTION_PUBLIC_KEY_B64'), '')
    assert.equal(environmentValue(services.validator?.environment, 'TALOS_BROWSER_ACTION_PRIVATE_KEY_B64'), undefined)
    assert.equal(environmentValue(services.validator?.environment, 'TALOS_BROWSER_ACTION_PUBLIC_KEY_B64'), undefined)
    assert.equal(environmentValue(services.validator?.environment, 'TALOS_BROWSER_ACTION_KEY_ID'), undefined)
    assert.equal(String(environmentValue(services.talos?.environment, 'TALOS_BROWSER_WORKER_ALLOW_INSECURE_INTERNAL_TRANSPORT')), 'true')
}

test('browser-worker-live workflow installs both workspaces before executing the real HMI gate', () => {
    const workflow = readYaml('.github/workflows/ci.yml')
    const job = workflow?.jobs?.['browser-worker-live']
    assert.equal(job?.['runs-on'], 'ubuntu-latest')
    assert.equal(job?.['timeout-minutes'], 20)
    assert.ok(Array.isArray(job?.steps))

    const setupNode = job.steps.find((step) => step?.uses === 'actions/setup-node@v4')
    const cachePaths = String(setupNode?.with?.['cache-dependency-path'] ?? '').split(/\s+/).filter(Boolean)
    assert.deepEqual(cachePaths, [
        'browser-worker/package-lock.json',
        'control-plane/package-lock.json',
    ])

    const workerInstall = stepIndex(job.steps, (step) => step?.run === 'cd browser-worker && npm ci', 'browser-worker npm ci')
    const controlPlaneInstall = stepIndex(job.steps, (step) => step?.run === 'cd control-plane && npm ci', 'control-plane npm ci')
    const semanticGate = stepIndex(job.steps, (step) => step?.run === 'cd control-plane && npm run test:browser-gates-config', 'semantic workflow/Compose gate')
    const liveGate = stepIndex(job.steps, (step) => step?.run === 'bash scripts/tests/talos-live-browser-worker-ci.sh', 'live worker gate')
    const diagnostics = stepIndex(job.steps, (step) => step?.uses === 'actions/upload-artifact@v4', 'Playwright diagnostics upload')

    assert.ok(workerInstall < controlPlaneInstall)
    assert.ok(controlPlaneInstall < semanticGate)
    assert.ok(semanticGate < liveGate)
    assert.ok(liveGate < diagnostics)

    const semanticStep = job.steps[semanticGate]
    assert.equal(String(semanticStep?.env?.TALOS_REQUIRE_DOCKER_COMPOSE_CONFIG), '1')
    const uploadStep = job.steps[diagnostics]
    assert.equal(uploadStep?.if, 'failure()')
    const uploadPaths = String(uploadStep?.with?.path ?? '').split(/\s+/).filter(Boolean)
    assert.deepEqual(uploadPaths, [
        'control-plane/storage/playwright-report',
        'control-plane/test-results',
    ])
})

test('live browser worker gate resolves the repo npm wrapper before lifecycle commands', () => {
    const script = readFileSync(path.join(workspaceRoot, 'scripts/tests/talos-live-browser-worker-ci.sh'), 'utf8')

    assert.match(script, /resolve_npm_bin\(\)/)
    assert.match(script, /TALOS_NPM_BIN/)
    assert.match(script, /\.tools\/bin\/npm\.cmd/)
    assert.match(script, /command -v npm/)
    assert.match(script, /NPM_BIN="\$\(resolve_npm_bin\)"/)
    assert.match(script, /"\$NPM_BIN" test --/)
    assert.match(script, /"\$NPM_BIN" run build/)
    assert.doesNotMatch(script, /^\s+npm (?:test|run build)\b/m)
})

test('browser worker Compose wiring has the required production protocol and fail-closed dependency', () => {
    assertComposeModel(readYaml('docker-compose.yml'))
})

test('Docker accepts the canonical browser worker Compose model when the executable gate is required', (context) => {
    const required = process.env.TALOS_REQUIRE_DOCKER_COMPOSE_CONFIG === '1'
    const version = spawnSync('docker', ['compose', 'version'], { cwd: workspaceRoot, encoding: 'utf8' })
    if (version.status !== 0 && !required) {
        context.skip('Docker Compose is unavailable; raw YAML semantics were still verified.')
        return
    }
    assert.equal(version.status, 0, 'Docker Compose is required for this integration gate.')

    const envPath = path.join(workspaceRoot, '.env')
    const createdEnv = !existsSync(envPath)
    if (createdEnv) copyFileSync(path.join(workspaceRoot, '.env.example'), envPath)

    const workerToken = 'a'.repeat(64)
    const actionPrivateKey = 'private-key-material'
    const actionPublicKey = 'public-key-material'
    const actionKeyId = 'browser-action-key'
    try {
        const result = spawnSync('docker', ['compose', 'config', '--format', 'json'], {
            cwd: workspaceRoot,
            encoding: 'utf8',
            env: {
                ...process.env,
                TALOS_BROWSER_WORKER_TOKEN: workerToken,
                TALOS_BROWSER_ACTION_PRIVATE_KEY_B64: actionPrivateKey,
                TALOS_BROWSER_ACTION_PUBLIC_KEY_B64: actionPublicKey,
                TALOS_BROWSER_ACTION_KEY_ID: actionKeyId,
            },
        })
        const diagnostic = `${result.stderr ?? ''}`
            .replaceAll(workerToken, '[REDACTED]')
            .replaceAll(actionPrivateKey, '[REDACTED]')
            .replaceAll(actionPublicKey, '[REDACTED]')
        assert.equal(result.status, 0, diagnostic)
        assertComposeModel(JSON.parse(result.stdout))
    } finally {
        if (createdEnv) rmSync(envPath, { force: true })
    }
})
