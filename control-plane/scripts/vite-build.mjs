import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
    await runViteBuildPreservingHotFile()
}
