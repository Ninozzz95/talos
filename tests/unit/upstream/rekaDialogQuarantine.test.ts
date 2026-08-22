import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// R1-1 — reka Dialog NEVER renders on the owner's WebView (F5.2 device
// evidence; F1-F6 review finding #1). The vendored files are hash-locked by
// the upstream manifest and cannot be deleted — this guard quarantines them
// instead: no product code may import the broken idiom again. Confirmations
// use TalosMobileConfirmDialog; large surfaces use a manual Teleport +
// useTalosModalSurface.
const SRC = path.resolve(__dirname, '..', '..', '..', 'src')

function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) out.push(...walk(full))
        else if (/\.(ts|vue)$/.test(entry.name)) out.push(full)
    }
    return out
}

describe('reka Dialog quarantine (R1-1)', () => {
    it('no product file imports components/ui/dialog (device-broken idiom)', () => {
        const offenders: string[] = []
        for (const file of walk(SRC)) {
            const relative = path.relative(SRC, file).replaceAll('\\', '/')
            if (relative.startsWith('components/ui/dialog/')) continue
            const content = fs.readFileSync(file, 'utf8')
            if (/from\s+['"]@\/components\/ui\/dialog['"]|components\/ui\/dialog\//.test(content)) {
                offenders.push(relative)
            }
        }
        expect(offenders, 'reka Dialog is quarantined — use TalosMobileConfirmDialog or a manual Teleport surface').toEqual([])
    })
})
