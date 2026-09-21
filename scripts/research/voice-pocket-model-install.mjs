#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
    access,
    copyFile,
    mkdir,
    open,
    readFile,
    rename,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'


export const PINNED_REVISION = '58a6d00cf13d239b6748cb0769f35c580a8f606c'
const PINNED_REPOSITORY = 'KevinAHM/pocket-tts-onnx'
const SHA256 = /^[0-9a-f]{64}$/


function fail(message) {
    throw new Error(message)
}


function isSafeRelativePath(value) {
    if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) return false
    const normalized = value.replaceAll('\\', '/')
    const segments = normalized.split('/')
    return !segments.some(segment => segment === '' || segment === '.' || segment === '..')
}


function safeChild(root, relativePath) {
    if (!isSafeRelativePath(relativePath)) fail(`unsafe model path: ${relativePath}`)
    const resolvedRoot = path.resolve(root)
    const resolved = path.resolve(resolvedRoot, relativePath)
    const relation = path.relative(resolvedRoot, resolved)
    if (relation.startsWith('..') || path.isAbsolute(relation)) fail(`unsafe model path: ${relativePath}`)
    return resolved
}


export function parsePinnedManifest(raw) {
    let value
    try {
        value = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw)
    } catch (error) {
        fail(`invalid manifest JSON: ${error.message}`)
    }
    if (value?.schemaVersion !== 1) fail('manifest schemaVersion must be 1')
    if (value?.engine !== 'pocket-v2') fail('manifest engine must be pocket-v2')
    if (value?.language !== 'italian') fail('manifest language must be italian')
    if (value?.source?.repository !== PINNED_REPOSITORY) fail('manifest repository is not pinned')
    if (value?.source?.revision !== PINNED_REVISION) fail('manifest revision is not pinned')
    if (!Array.isArray(value.files) || value.files.length === 0) fail('manifest files must be non-empty')

    const seen = new Set()
    for (const file of value.files) {
        if (!isSafeRelativePath(file?.path)) fail(`unsafe model path: ${file?.path}`)
        const canonical = file.path.replaceAll('\\', '/')
        if (seen.has(canonical)) fail(`duplicate model path: ${canonical}`)
        seen.add(canonical)
        if (!Number.isSafeInteger(file.size) || file.size <= 0) fail(`invalid size for path: ${canonical}`)
        if (typeof file.sha256 !== 'string' || !SHA256.test(file.sha256)) {
            fail(`invalid sha256 for path: ${canonical}`)
        }
        file.path = canonical
    }
    return value
}


async function hashFile(filename) {
    const digest = createHash('sha256')
    await new Promise((resolve, reject) => {
        const input = createReadStream(filename)
        input.on('data', chunk => digest.update(chunk))
        input.on('error', reject)
        input.on('end', resolve)
    })
    return digest.digest('hex')
}


export async function verifyBundleFiles(root, manifest) {
    const verified = []
    for (const file of manifest.files) {
        const source = safeChild(root, file.path)
        let details
        try {
            details = await stat(source)
        } catch {
            fail(`missing model path: ${file.path}`)
        }
        if (!details.isFile()) fail(`model path is not a file: ${file.path}`)
        if (details.size !== file.size) {
            fail(`size mismatch for ${file.path}: expected ${file.size}, found ${details.size}`)
        }
        const actual = await hashFile(source)
        if (actual !== file.sha256) {
            fail(`sha256 mismatch for ${file.path}: expected ${file.sha256}, found ${actual}`)
        }
        verified.push({ path: file.path, size: details.size, sha256: actual })
    }
    return verified
}


async function exists(filename) {
    try {
        await access(filename)
        return true
    } catch {
        return false
    }
}


async function syncDirectoryBestEffort(directory) {
    let handle
    try {
        handle = await open(directory, 'r')
        await handle.sync()
    } catch {
        // Android/Windows filesystems do not all permit opening a directory.
        // Recovery is still guaranteed by active/previous/staging names.
    } finally {
        await handle?.close()
    }
}


export async function installPinnedBundle({
    sourceRoot,
    targetRoot,
    manifest,
    copyFileImpl = copyFile,
}) {
    const source = path.resolve(sourceRoot)
    const target = path.resolve(targetRoot)
    if (source === target) fail('source and target roots must differ')
    await verifyBundleFiles(source, manifest)
    await mkdir(target, { recursive: true })

    const nonce = `${process.pid}-${Date.now()}`
    const active = safeChild(target, 'italian')
    const previous = safeChild(target, 'italian.previous')
    const staging = safeChild(target, `italian.staging-${nonce}`)
    let activeMoved = false
    try {
        await mkdir(staging, { recursive: false })
        for (const file of manifest.files) {
            const sourceFile = safeChild(source, file.path)
            const destination = safeChild(staging, file.path)
            await mkdir(path.dirname(destination), { recursive: true })
            await copyFileImpl(sourceFile, destination)
        }
        await writeFile(
            safeChild(staging, 'installed.json'),
            `${JSON.stringify(manifest, null, 2)}\n`,
            { encoding: 'utf8', flag: 'wx' },
        )
        await verifyBundleFiles(staging, manifest)

        if (await exists(previous)) await rm(previous, { recursive: true, force: true })
        if (await exists(active)) {
            await rename(active, previous)
            activeMoved = true
            await syncDirectoryBestEffort(target)
        }
        try {
            await rename(staging, active)
            await syncDirectoryBestEffort(target)
        } catch (error) {
            if (activeMoved && !(await exists(active)) && await exists(previous)) {
                await rename(previous, active)
                activeMoved = false
                await syncDirectoryBestEffort(target)
            }
            throw error
        }
        return { active, previous: activeMoved ? previous : null, verifiedFileCount: manifest.files.length }
    } catch (error) {
        if (await exists(staging)) await rm(staging, { recursive: true, force: true })
        throw error
    }
}


function parseCli(argv) {
    const values = new Map()
    for (let index = 0; index < argv.length; index += 2) {
        const flag = argv[index]
        const value = argv[index + 1]
        if (!flag?.startsWith('--') || value === undefined) fail(`invalid CLI argument: ${flag ?? ''}`)
        values.set(flag, value)
    }
    for (const required of ['--source', '--target', '--manifest']) {
        if (!values.has(required)) fail(`missing CLI argument: ${required}`)
    }
    return values
}


async function main() {
    const argumentsMap = parseCli(process.argv.slice(2))
    const manifest = parsePinnedManifest(await readFile(argumentsMap.get('--manifest'), 'utf8'))
    const outcome = await installPinnedBundle({
        sourceRoot: argumentsMap.get('--source'),
        targetRoot: argumentsMap.get('--target'),
        manifest,
    })
    process.stdout.write(`${JSON.stringify(outcome)}\n`)
}


const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntryPoint) {
    main().catch(error => {
        process.stderr.write(`${error.message}\n`)
        process.exitCode = 1
    })
}
