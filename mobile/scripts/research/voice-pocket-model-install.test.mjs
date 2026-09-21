import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
    PINNED_REVISION,
    installPinnedBundle,
    parsePinnedManifest,
    verifyBundleFiles,
} from './voice-pocket-model-install.mjs'


const sha256 = value => createHash('sha256').update(value).digest('hex')

const manifestFor = files => ({
    schemaVersion: 1,
    engine: 'pocket-v2',
    language: 'italian',
    source: {
        repository: 'KevinAHM/pocket-tts-onnx',
        revision: PINNED_REVISION,
    },
    files,
})

test('POCKET-MODEL-01 parses only the exact Italian pinned source', () => {
    const manifest = manifestFor([
        { path: 'bundle.json', size: 2, sha256: sha256('{}') },
    ])
    assert.equal(parsePinnedManifest(JSON.stringify(manifest)).language, 'italian')

    const wrongRevision = structuredClone(manifest)
    wrongRevision.source.revision = '0'.repeat(40)
    assert.throws(() => parsePinnedManifest(JSON.stringify(wrongRevision)), /revision/i)

    const wrongEngine = structuredClone(manifest)
    wrongEngine.engine = 'moss'
    assert.throws(() => parsePinnedManifest(JSON.stringify(wrongEngine)), /engine/i)
})

test('POCKET-MODEL-02 rejects duplicate, absolute and traversal paths before I/O', () => {
    const valid = { path: 'bundle.json', size: 2, sha256: sha256('{}') }
    for (const files of [
        [valid, valid],
        [{ ...valid, path: '../bundle.json' }],
        [{ ...valid, path: path.resolve('bundle.json') }],
    ]) {
        assert.throws(() => parsePinnedManifest(JSON.stringify(manifestFor(files))), /path/i)
    }
})

test('POCKET-MODEL-03 byte, size and SHA mutations fail closed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'talos-pocket-source-'))
    const expected = Buffer.from('pocket-v2')
    await writeFile(path.join(root, 'model.onnx'), expected)
    const manifest = parsePinnedManifest(JSON.stringify(manifestFor([
        { path: 'model.onnx', size: expected.length, sha256: sha256(expected) },
    ])))
    const verified = await verifyBundleFiles(root, manifest)
    assert.equal(verified[0].sha256, sha256(expected))

    await writeFile(path.join(root, 'model.onnx'), Buffer.concat([expected, Buffer.from('x')]))
    await assert.rejects(() => verifyBundleFiles(root, manifest), /size/i)

    await writeFile(path.join(root, 'model.onnx'), Buffer.from('pocket-v3'))
    await assert.rejects(() => verifyBundleFiles(root, manifest), /sha256/i)
})

test('POCKET-MODEL-04 promotion is atomic and keeps the prior active bundle as rollback', async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), 'talos-pocket-install-'))
    const source = path.join(sandbox, 'source')
    const targetRoot = path.join(sandbox, 'target')
    await mkdir(source)
    await mkdir(path.join(targetRoot, 'italian'), { recursive: true })
    await writeFile(path.join(targetRoot, 'italian', 'generation.txt'), 'old')

    const payload = Buffer.from('new-model')
    await writeFile(path.join(source, 'model.onnx'), payload)
    const manifest = parsePinnedManifest(JSON.stringify(manifestFor([
        { path: 'model.onnx', size: payload.length, sha256: sha256(payload) },
    ])))

    const outcome = await installPinnedBundle({ sourceRoot: source, targetRoot, manifest })
    assert.equal(outcome.active, path.resolve(targetRoot, 'italian'))
    assert.equal(await readFile(path.join(targetRoot, 'italian', 'model.onnx'), 'utf8'), 'new-model')
    assert.equal(await readFile(path.join(targetRoot, 'italian.previous', 'generation.txt'), 'utf8'), 'old')
    assert.equal(JSON.parse(await readFile(path.join(targetRoot, 'italian', 'installed.json'), 'utf8')).source.revision, PINNED_REVISION)
})

test('POCKET-MODEL-05 a failed staging copy never mutates active', async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), 'talos-pocket-install-fail-'))
    const source = path.join(sandbox, 'source')
    const targetRoot = path.join(sandbox, 'target')
    await mkdir(source)
    await mkdir(path.join(targetRoot, 'italian'), { recursive: true })
    await writeFile(path.join(targetRoot, 'italian', 'generation.txt'), 'old')

    const payload = Buffer.from('new-model')
    await writeFile(path.join(source, 'model.onnx'), payload)
    const manifest = parsePinnedManifest(JSON.stringify(manifestFor([
        { path: 'model.onnx', size: payload.length, sha256: sha256(payload) },
    ])))
    const failingCopy = async () => { throw new Error('injected-copy-failure') }

    await assert.rejects(
        () => installPinnedBundle({ sourceRoot: source, targetRoot, manifest, copyFileImpl: failingCopy }),
        /injected-copy-failure/,
    )
    assert.equal(await readFile(path.join(targetRoot, 'italian', 'generation.txt'), 'utf8'), 'old')
})
