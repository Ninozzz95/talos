import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'public/build/manifest.json'), 'utf8'))
const registrySource = readFileSync(resolve(root, 'resources/js/lib/talosWindowRegistry.ts'), 'utf8')
const entryKey = 'resources/js/app.js'
const entry = manifest[entryKey]

function staticClosure(startKey) {
    const visited = new Set()
    const visit = (key) => {
        if (visited.has(key)) return
        visited.add(key)
        for (const imported of manifest[key]?.imports ?? []) visit(imported)
    }
    visit(startKey)
    return visited
}

test('production manifest keeps every registered window behind a dynamic boundary', () => {
    assert.ok(entry?.isEntry, 'resources/js/app.js must remain the production entry')
    const importTargets = [...registrySource.matchAll(/loader:\s*\(\)\s*=>\s*import\('\.\.\/components\/talos\/window\/modules\/([^']+)'\)/g)]
        .map((match) => match[1])
    assert.equal(importTargets.length, 15, 'the registry must expose exactly 15 dynamic window loaders')
    assert.equal(new Set(entry.dynamicImports ?? []).size, 15, 'the app entry must retain 15 distinct dynamic boundaries')

    const staticEntries = staticClosure(entryKey)
    for (const target of importTargets) {
        const moduleName = basename(target, '.vue')
        const manifestEntry = Object.entries(manifest).find(([, value]) => value.name === moduleName)
        assert.ok(manifestEntry, `${moduleName} must have a generated chunk`)
        assert.ok(!staticEntries.has(manifestEntry[0]), `${moduleName} leaked into the initial static import closure`)
    }
})

test('initial application chunk stays below the warning threshold', () => {
    const bytes = statSync(resolve(root, 'public/build', entry.file)).size
    assert.ok(bytes < 500 * 1024, `initial app chunk is ${bytes} bytes; expected less than 512000`)
})
