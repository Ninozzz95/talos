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
    assert.ok(importTargets.length > 0, 'the registry must expose dynamic window loaders')

    const staticEntries = staticClosure(entryKey)
    const dynamicEntries = new Set(entry.dynamicImports ?? [])
    for (const target of importTargets) {
        const moduleName = basename(target, '.vue')
        const manifestEntry = Object.entries(manifest).find(([, value]) => value.name === moduleName)
        assert.ok(manifestEntry, `${moduleName} must have a generated chunk`)
        assert.ok(dynamicEntries.has(manifestEntry[0]), `${moduleName} must remain reachable through a dynamic boundary`)
        assert.ok(!staticEntries.has(manifestEntry[0]), `${moduleName} leaked into the initial static import closure`)
    }
})

test('initial application chunk stays below the warning threshold', () => {
    const bytes = statSync(resolve(root, 'public/build', entry.file)).size
    assert.ok(bytes < 500 * 1024, `initial app chunk is ${bytes} bytes; expected less than 512000`)
})

test('the stable Markdown sanitizer stack has an explicit cacheable chunk', () => {
    const markdownRuntime = Object.values(manifest).find((value) => value.name === 'markdown-runtime')
    assert.ok(markdownRuntime, 'the production manifest must contain the markdown-runtime chunk')
    assert.ok((entry.imports ?? []).some((key) => manifest[key]?.file === markdownRuntime.file), 'the app entry must import the markdown runtime')
})

test('interactive browser evidence remains outside the initial static closure', () => {
    const evidenceKey = 'resources/js/components/talos/chat/TalosBrowserScreenshotEvidence.vue'
    assert.ok(manifest[evidenceKey]?.isDynamicEntry, 'browser evidence must remain a dynamic entry')
    assert.ok((entry.dynamicImports ?? []).includes(evidenceKey), 'app must load browser evidence through a dynamic boundary')
    assert.ok(!staticClosure(entryKey).has(evidenceKey), 'browser evidence leaked into the initial static import closure')
})
