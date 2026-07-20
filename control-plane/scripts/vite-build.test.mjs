import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import * as viteBuild from './vite-build.mjs'

const { runViteBuildPreservingHotFile } = viteBuild

async function exists(file) {
    try {
        await stat(file)
        return true
    } catch (error) {
        if (error?.code === 'ENOENT') return false
        throw error
    }
}

async function fixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'talos-vite-build-'))
    const hotFile = path.join(root, 'hot')
    return { root, hotFile }
}

async function provenanceFixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'talos-vite-provenance-'))
    const files = new Map([
        ['package.json', '{"scripts":{"build":"node scripts/vite-build.mjs"}}\n'],
        ['package-lock.json', '{"lockfileVersion":3}\n'],
        ['tsconfig.json', '{"compilerOptions":{}}\n'],
        ['vite.config.js', 'export default {}\n'],
        ['scripts/vite-build.mjs', 'export const fixture = true\n'],
        ['resources/css/app.css', ':root { color: black; }\n'],
        ['resources/js/app.js', 'export const app = true\n'],
    ])
    for (const [relativePath, contents] of files) {
        const absolutePath = path.join(root, relativePath)
        await mkdir(path.dirname(absolutePath), { recursive: true })
        await writeFile(absolutePath, contents, 'utf8')
    }
    return { root, hotFile: path.join(root, 'public', 'hot') }
}

test('restores the active Vite hot marker after a successful production build', async (context) => {
    const { root, hotFile } = await fixture()
    context.after(() => rm(root, { recursive: true, force: true }))
    await writeFile(hotFile, 'http://127.0.0.1:5173', 'utf8')

    await runViteBuildPreservingHotFile({
        hotFile,
        runBuild: async () => {
            assert.equal(await exists(hotFile), false)
        },
    })

    assert.equal(await readFile(hotFile, 'utf8'), 'http://127.0.0.1:5173')
})

test('restores the active Vite hot marker when the build fails', async (context) => {
    const { root, hotFile } = await fixture()
    context.after(() => rm(root, { recursive: true, force: true }))
    await writeFile(hotFile, 'http://localhost:5173', 'utf8')

    await assert.rejects(() => runViteBuildPreservingHotFile({
        hotFile,
        runBuild: async () => {
            assert.equal(await exists(hotFile), false)
            throw new Error('build failed')
        },
    }), /build failed/)

    assert.equal(await readFile(hotFile, 'utf8'), 'http://localhost:5173')
})

test('does not create a hot marker when the build started without one', async (context) => {
    const { root, hotFile } = await fixture()
    context.after(() => rm(root, { recursive: true, force: true }))

    await runViteBuildPreservingHotFile({ hotFile, runBuild: async () => {} })

    assert.equal(await exists(hotFile), false)
})

test('writes and verifies provenance for one successful build with stable frontend source', async (context) => {
    const { root, hotFile } = await provenanceFixture()
    context.after(() => rm(root, { recursive: true, force: true }))
    assert.equal(typeof viteBuild.runViteBuildWithProvenance, 'function')
    assert.equal(typeof viteBuild.verifyFrontendBuildProvenance, 'function')

    const built = await viteBuild.runViteBuildWithProvenance({ root, hotFile, runBuild: async () => {} })
    const verified = await viteBuild.verifyFrontendBuildProvenance({ root })

    assert.equal(built.protocol, 'talos.frontend_build.v1')
    assert.match(built.source_sha256, /^sha256:[a-f0-9]{64}$/u)
    assert.deepEqual(verified, built)
})

test('rejects provenance after any frontend build input changes', async (context) => {
    const { root, hotFile } = await provenanceFixture()
    context.after(() => rm(root, { recursive: true, force: true }))
    assert.equal(typeof viteBuild.runViteBuildWithProvenance, 'function')
    assert.equal(typeof viteBuild.verifyFrontendBuildProvenance, 'function')
    await viteBuild.runViteBuildWithProvenance({ root, hotFile, runBuild: async () => {} })

    await writeFile(path.join(root, 'resources', 'js', 'app.js'), 'export const app = false\n', 'utf8')

    await assert.rejects(
        () => viteBuild.verifyFrontendBuildProvenance({ root }),
        /frontend build is stale/i,
    )
})

test('refuses provenance when frontend source changes during the build', async (context) => {
    const { root, hotFile } = await provenanceFixture()
    context.after(() => rm(root, { recursive: true, force: true }))
    assert.equal(typeof viteBuild.runViteBuildWithProvenance, 'function')

    await assert.rejects(() => viteBuild.runViteBuildWithProvenance({
        root,
        hotFile,
        runBuild: async () => {
            await writeFile(path.join(root, 'resources', 'css', 'app.css'), ':root { color: white; }\n', 'utf8')
        },
    }), /frontend source changed during the build/i)

    assert.equal(await exists(path.join(root, 'public', 'build', 'talos-build-provenance.json')), false)
})
