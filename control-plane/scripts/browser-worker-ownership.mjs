import net from 'node:net'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultWorkspaceRoot = path.resolve(scriptDirectory, '..', '..')
const workerServiceName = 'talos-browser-worker'
export const requiredBrowserHmiProtocol = 'talos_browser_hmi_runtime_v2.1.0'

export function evaluateBrowserWorkerOwnership({ expectedUrl, lease, probes }) {
    const expectedProbe = probes.find((probe) => probe.url === expectedUrl) ?? { url: expectedUrl, state: 'closed' }
    const liveLease = lease?.alive === true && lease.browserWorkerUrl === expectedUrl
    const staleLease = lease !== null && lease?.alive === false
    const issues = []
    let expectedState = 'available'

    if (staleLease) {
        issues.push({
            code: 'TALOS_BROWSER_WORKER_STALE_LEASE',
            url: lease.browserWorkerUrl,
            blocking: false,
        })
    }

    if (expectedProbe.state === 'talos') {
        if (liveLease) {
            expectedState = 'managed'
            issues.push({
                code: 'TALOS_BROWSER_WORKER_STACK_ALREADY_RUNNING',
                url: expectedUrl,
                blocking: true,
            })
        } else {
            expectedState = 'orphaned'
            issues.push({
                code: 'TALOS_BROWSER_WORKER_ORPHANED',
                url: expectedUrl,
                blocking: true,
            })
        }
    } else if (expectedProbe.state === 'incompatible') {
        expectedState = 'incompatible'
        issues.push({
            code: 'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH',
            url: expectedUrl,
            blocking: true,
        })
    } else if (expectedProbe.state === 'conflict') {
        expectedState = 'conflict'
        issues.push({
            code: 'TALOS_BROWSER_WORKER_PORT_CONFLICT',
            url: expectedUrl,
            blocking: true,
        })
    } else if (liveLease) {
        expectedState = 'missing'
        issues.push({
            code: 'TALOS_BROWSER_WORKER_MANAGED_ENDPOINT_MISSING',
            url: expectedUrl,
            blocking: true,
        })
    }

    for (const probe of probes) {
        if (probe.url === expectedUrl) continue
        if (probe.state === 'talos') {
            issues.push({
                code: 'TALOS_BROWSER_WORKER_ORPHANED',
                url: probe.url,
                blocking: true,
            })
        } else if (probe.state === 'incompatible') {
            issues.push({
                code: 'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH',
                url: probe.url,
                blocking: true,
            })
        }
    }

    return {
        expectedUrl,
        expectedState,
        lease,
        probes,
        issues,
        canStart: expectedState === 'available' && !issues.some((issue) => issue.blocking),
    }
}

export function assertBrowserWorkerCanStart(report) {
    if (report.canStart) return
    const failures = report.issues.filter((issue) => issue.blocking)
    const details = failures.map((issue) => `${issue.code} ${issue.url}`).join('\n')
    throw new Error(`Browser worker ownership check failed.\n${details}`)
}

export function isBrowserWorkerOwnershipHealthy(report) {
    if (report.expectedState !== 'available' && report.expectedState !== 'managed') return false

    return !report.issues.some((issue) => (
        issue.blocking
        && issue.code !== 'TALOS_BROWSER_WORKER_STACK_ALREADY_RUNNING'
    ))
}

export function formatBrowserWorkerDoctor(report) {
    const lines = []
    if (report.expectedState === 'available') {
        lines.push(`browser worker slot OK   available at ${report.expectedUrl}`)
    } else if (report.expectedState === 'managed') {
        lines.push(`browser worker slot OK   managed at ${report.expectedUrl}`)
    } else if (report.expectedState === 'orphaned') {
        lines.push(`browser worker slot WARN orphaned worker at ${report.expectedUrl}`)
    } else if (report.expectedState === 'conflict') {
        lines.push(`browser worker slot FAIL conflicting service at ${report.expectedUrl}`)
    } else if (report.expectedState === 'incompatible') {
        lines.push(`browser worker slot FAIL protocol mismatch at ${report.expectedUrl}`)
    } else {
        lines.push(`browser worker slot WARN managed endpoint missing at ${report.expectedUrl}`)
    }

    for (const issue of report.issues) {
        if (issue.code === 'TALOS_BROWSER_WORKER_STALE_LEASE') {
            lines.push(`browser worker lease WARN stale lease for ${issue.url}`)
        } else if (issue.code === 'TALOS_BROWSER_WORKER_ORPHANED' && issue.url !== report.expectedUrl) {
            lines.push(`browser worker extra WARN orphaned worker at ${issue.url}`)
        } else if (issue.code === 'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH' && issue.url !== report.expectedUrl) {
            lines.push(`browser worker extra FAIL protocol mismatch at ${issue.url}`)
        }
    }

    return lines.join('\n')
}

export async function inspectBrowserWorkerOwnership({
    expectedUrl = 'http://127.0.0.1:3100',
    workspaceRoot = defaultWorkspaceRoot,
    candidateUrls = defaultCandidateUrls(expectedUrl),
    probe = probeBrowserWorkerEndpoint,
    processAlive = isProcessAlive,
} = {}) {
    const storedLease = readDevStackLease(workspaceRoot)
    const lease = storedLease === null
        ? null
        : { ...storedLease, alive: processAlive(storedLease.pid) }
    const probes = await Promise.all(candidateUrls.map(async (url) => ({
        url,
        state: await probe(url),
    })))

    return evaluateBrowserWorkerOwnership({ expectedUrl, lease, probes })
}

export function acquireDevStackLease({
    expectedUrl = 'http://127.0.0.1:3100',
    workspaceRoot = defaultWorkspaceRoot,
    pid = process.pid,
    processAlive = isProcessAlive,
} = {}) {
    const target = devStackLeasePath(workspaceRoot)
    mkdirSync(path.dirname(target), { recursive: true })
    const existing = readDevStackLease(workspaceRoot)
    if (existing !== null) {
        if (processAlive(existing.pid)) {
            throw new Error(`TALOS_BROWSER_WORKER_STACK_ALREADY_RUNNING ${existing.browserWorkerUrl}`)
        }
        rmSync(target, { force: true })
    }

    const lease = {
        schema_version: 'talos_dev_stack_lease_v1',
        pid,
        browserWorkerUrl: expectedUrl,
        startedAt: new Date().toISOString(),
    }
    writeFileSync(target, `${JSON.stringify(lease)}\n`, { encoding: 'utf8', flag: 'wx' })
    return { ...lease, path: target }
}

export function releaseDevStackLease(lease) {
    if (!lease?.path || !existsSync(lease.path)) return
    try {
        const current = JSON.parse(readFileSync(lease.path, 'utf8'))
        if (current.pid === lease.pid) rmSync(lease.path, { force: true })
    } catch {
        // Never remove a lease that cannot be proven to belong to this process.
    }
}

export async function probeBrowserWorkerEndpoint(url, {
    portOpen = isTcpEndpointOpen,
    fetchImpl = globalThis.fetch,
} = {}) {
    if (!await portOpen(url)) return 'closed'
    try {
        const response = await fetchImpl(`${url.replace(/\/$/, '')}/health`, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(750),
        })
        if (!response.ok) return 'conflict'
        const payload = await response.json()
        if (payload?.data?.service !== workerServiceName) return 'conflict'
        return payload?.data?.protocols?.hmi === requiredBrowserHmiProtocol
            ? 'talos'
            : 'incompatible'
    } catch {
        return 'conflict'
    }
}

function defaultCandidateUrls(expectedUrl) {
    const expected = new URL(expectedUrl)
    const urls = new Set([expectedUrl])
    for (let port = 3100; port <= 3110; port += 1) {
        const candidate = new URL(expectedUrl)
        candidate.port = String(port)
        urls.add(candidate.origin)
    }
    return [...urls]
}

function devStackLeasePath(workspaceRoot) {
    return path.join(workspaceRoot, '.tools', 'run', 'talos-dev-stack.json')
}

function readDevStackLease(workspaceRoot) {
    const target = devStackLeasePath(workspaceRoot)
    if (!existsSync(target)) return null
    try {
        const lease = JSON.parse(readFileSync(target, 'utf8'))
        if (!Number.isSafeInteger(lease.pid) || lease.pid <= 0 || typeof lease.browserWorkerUrl !== 'string') return null
        return { pid: lease.pid, browserWorkerUrl: lease.browserWorkerUrl }
    } catch {
        return null
    }
}

function isProcessAlive(pid) {
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        return error?.code === 'EPERM'
    }
}

function isTcpEndpointOpen(url) {
    const endpoint = new URL(url)
    const port = Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80))
    return new Promise((resolve) => {
        const socket = net.createConnection({ host: endpoint.hostname, port })
        const finish = (open) => {
            socket.removeAllListeners()
            socket.destroy()
            resolve(open)
        }
        socket.setTimeout(300)
        socket.once('connect', () => finish(true))
        socket.once('timeout', () => finish(false))
        socket.once('error', () => finish(false))
    })
}

async function main() {
    const report = await inspectBrowserWorkerOwnership()
    process.stdout.write(`${formatBrowserWorkerDoctor(report)}\n`)
    if (!isBrowserWorkerOwnershipHealthy(report)) process.exitCode = 1
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url) && process.argv.includes('--doctor')) {
    await main()
}
