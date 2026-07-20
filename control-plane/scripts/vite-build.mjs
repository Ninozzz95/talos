import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND_BUILD_PROTOCOL = 'talos.frontend_build.v1'
const FRONTEND_BUILD_INPUT_FILES = Object.freeze([
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.js',
    'scripts/vite-build.mjs',
])
const FRONTEND_BUILD_INPUT_DIRECTORIES = Object.freeze([
    'resources/css',
    'resources/js',
])

async function readHotMarker(hotFile) {
    try {
        return await readFile(hotFile, 'utf8')
    } catch (error) {
        if (error?.code === 'ENOENT') return null
        throw error
    }
}

async function defaultBuild() {
    const { build } = await import('vite')
    await build()
}

async function listFiles(root, relativeDirectory) {
    const directory = path.join(root, relativeDirectory)
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))

    const files = []
    for (const entry of entries) {
        const relativePath = path.posix.join(relativeDirectory.replaceAll('\\', '/'), entry.name)
        if (entry.isDirectory()) {
            files.push(...await listFiles(root, relativePath))
            continue
        }
        if (!entry.isFile()) {
            throw new Error(`Unsupported frontend build input: ${relativePath}`)
        }
        files.push(relativePath)
    }

    return files
}

async function frontendSourceFiles(root) {
    const directoryFiles = []
    for (const directory of FRONTEND_BUILD_INPUT_DIRECTORIES) {
        directoryFiles.push(...await listFiles(root, directory))
    }

    return [...FRONTEND_BUILD_INPUT_FILES, ...directoryFiles]
}

export async function frontendSourceFingerprint({ root = process.cwd() } = {}) {
    const files = await frontendSourceFiles(root)
    const hash = createHash('sha256')

    for (const relativePath of files) {
        const contents = await readFile(path.join(root, relativePath))
        hash.update(`file\0${relativePath}\0${contents.byteLength}\0`, 'utf8')
        hash.update(contents)
        hash.update('\0', 'utf8')
    }

    return {
        source_sha256: `sha256:${hash.digest('hex')}`,
        source_files: files,
    }
}

function provenancePath(root) {
    return path.join(root, 'public', 'build', 'talos-build-provenance.json')
}

function parseProvenance(value) {
    if (
        typeof value !== 'object'
        || value === null
        || Array.isArray(value)
        || value.protocol !== FRONTEND_BUILD_PROTOCOL
        || typeof value.source_sha256 !== 'string'
        || !/^sha256:[a-f0-9]{64}$/u.test(value.source_sha256)
        || !Array.isArray(value.source_files)
        || value.source_files.some((file) => typeof file !== 'string')
    ) {
        throw new Error('Frontend build provenance is malformed.')
    }

    return value
}

export async function writeFrontendBuildProvenance({
    root = process.cwd(),
    fingerprint,
} = {}) {
    const buildProvenance = {
        protocol: FRONTEND_BUILD_PROTOCOL,
        source_sha256: fingerprint.source_sha256,
        source_files: fingerprint.source_files,
    }
    const destination = provenancePath(root)
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(temporary, `${JSON.stringify(buildProvenance, null, 2)}\n`, 'utf8')
    await rename(temporary, destination)

    return buildProvenance
}

export async function verifyFrontendBuildProvenance({ root = process.cwd() } = {}) {
    let persisted
    try {
        persisted = parseProvenance(JSON.parse(await readFile(provenancePath(root), 'utf8')))
    } catch (error) {
        if (error?.code === 'ENOENT') {
            throw new Error('Frontend build provenance is missing; the frontend build is stale.', { cause: error })
        }
        if (error instanceof SyntaxError) {
            throw new Error('Frontend build provenance is malformed.', { cause: error })
        }
        throw error
    }

    const current = await frontendSourceFingerprint({ root })
    if (
        persisted.source_sha256 !== current.source_sha256
        || JSON.stringify(persisted.source_files) !== JSON.stringify(current.source_files)
    ) {
        throw new Error('Frontend build is stale: its provenance does not match the current frontend source.')
    }

    return persisted
}

export async function runViteBuildPreservingHotFile({
    hotFile = path.resolve(process.cwd(), 'public', 'hot'),
    runBuild = defaultBuild,
} = {}) {
    const activeHotMarker = await readHotMarker(hotFile)
    if (activeHotMarker !== null) await rm(hotFile)

    try {
        await runBuild()
    } finally {
        if (activeHotMarker !== null) await writeFile(hotFile, activeHotMarker, 'utf8')
    }
}

export async function runViteBuildWithProvenance({
    root = process.cwd(),
    hotFile = path.join(root, 'public', 'hot'),
    runBuild = defaultBuild,
} = {}) {
    const destination = provenancePath(root)
    const before = await frontendSourceFingerprint({ root })
    await rm(destination, { force: true })

    await runViteBuildPreservingHotFile({ hotFile, runBuild })

    const after = await frontendSourceFingerprint({ root })
    if (before.source_sha256 !== after.source_sha256) {
        throw new Error('Frontend source changed during the build; provenance was not written.')
    }

    const written = await writeFrontendBuildProvenance({ root, fingerprint: after })
    try {
        return await verifyFrontendBuildProvenance({ root })
    } catch (error) {
        await rm(destination, { force: true })
        throw error
    }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
    if (process.argv.slice(2).includes('--verify')) {
        const verified = await verifyFrontendBuildProvenance()
        process.stdout.write(`${JSON.stringify({ ok: true, ...verified })}\n`)
    } else {
        await runViteBuildWithProvenance()
    }
}
