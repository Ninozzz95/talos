import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { runViteBuildPreservingHotFile } from './vite-build.mjs'

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
