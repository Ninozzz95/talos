// M1 runtime preflight (charter V8 section 2). Fails closed before any
// dependency installation when Node/npm are outside the frozen ranges.
// Fixture flags --node-version/--npm-version make the RED reproducible
// without installing a second runtime.
import process from 'node:process'

const NODE_RANGE = { label: '>=24.18.0 <25', min: [24, 18, 0], maxMajorExclusive: 25 }
const NPM_RANGE = { label: '>=11.16.0 <12', min: [11, 16, 0], maxMajorExclusive: 12 }

function parseSemver(text) {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(text).trim())
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function inRange(version, range) {
    if (version === null) return false
    if (version[0] >= range.maxMajorExclusive) return false
    const [a, b, c] = version
    const [x, y, z] = range.min
    if (a !== x) return a > x
    if (b !== y) return b > y
    return c >= z
}

function readArg(name) {
    const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))
    return raw ? raw.slice(name.length + 3) : null
}

const nodeVersion = readArg('node-version') ?? process.versions.node
const userAgent = process.env.npm_config_user_agent ?? ''
const npmFromAgent = /npm\/(\d+\.\d+\.\d+)/.exec(userAgent)?.[1] ?? null
const npmVersion = readArg('npm-version') ?? npmFromAgent

if (!inRange(parseSemver(nodeVersion), NODE_RANGE)) {
    process.stderr.write(`unsupported node ${nodeVersion}; required ${NODE_RANGE.label}\n`)
    process.exit(1)
}
// npm version is only enforceable when invoked through npm (or via fixture);
// devEngines with onFail error covers the npm-native path in parallel.
if (npmVersion !== null && !inRange(parseSemver(npmVersion), NPM_RANGE)) {
    process.stderr.write(`unsupported npm ${npmVersion}; required ${NPM_RANGE.label}\n`)
    process.exit(1)
}
process.exit(0)
