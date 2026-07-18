import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(fileURLToPath(new URL('../../../css/app.css', import.meta.url)), 'utf8')

const NEW_SHELL_TOKENS = [
    '--talos-space-1:',
    '--talos-space-2:',
    '--talos-space-3:',
    '--talos-space-4:',
    '--talos-space-5:',
    '--talos-space-6:',
    '--talos-space-7:',
    '--talos-space-8:',
    '--talos-font-chrome:',
    '--talos-font-prose:',
    '--talos-text-title:',
    '--talos-text-body:',
    '--talos-text-label:',
    '--talos-text-caption:',
    '--talos-surface-0:',
    '--talos-surface-1:',
    '--talos-surface-2:',
    '--talos-font-readable:',
]

const NEW_UTILITIES = [
    '.talos-type-title',
    '.talos-type-body',
    '.talos-type-label',
    '.talos-type-caption',
    '.talos-elev-0',
    '.talos-elev-1',
    '.talos-elev-2',
    '.talos-elev-3',
    '.talos-rule',
    '.talos-rule-danger',
    '.talos-rule-label',
    '.talos-readout',
]

function r0Block(): string {
    const start = appCss.indexOf('/* v7 R0 */')
    expect(start, 'app.css must contain one delimited /* v7 R0 */ block').toBeGreaterThan(-1)
    const end = appCss.indexOf('/* end v7 R0 */', start)
    expect(end, 'the /* v7 R0 */ block must be closed with /* end v7 R0 */').toBeGreaterThan(start)
    return appCss.slice(start, end)
}

describe('v7 R0 token ladder contract', () => {
    it('every talos alias token resolves to a concrete value in the shell scope, talos-light and all 12 preset scopes', () => {
        const block = r0Block()

        for (const token of NEW_SHELL_TOKENS) {
            expect(block, `${token} must be defined in the v7 R0 block`).toContain(token)
        }

        const referenced = new Set<string>()
        for (const match of block.matchAll(/var\((--talos-[a-z0-9-]+)/g)) {
            referenced.add(match[1])
        }
        for (const name of referenced) {
            expect(appCss, `${name} is referenced in the R0 block but never defined`).toMatch(
                new RegExp(`${name}\\s*:`),
            )
        }

        const surfaceBases = ['--talos-background:', '--talos-card:', '--talos-panel:']
        const shellStart = appCss.indexOf('.talos-shell {')
        expect(shellStart).toBeGreaterThan(-1)
        for (const base of surfaceBases) {
            expect(appCss.indexOf(base, shellStart), `${base} must exist for the surface ladder`).toBeGreaterThan(-1)
        }
    })

    it('ships the four type roles, elevation ladder, rule and readout utilities', () => {
        for (const utility of NEW_UTILITIES) {
            expect(appCss, `${utility} utility must exist`).toContain(`${utility} {`)
        }
    })

    it('reserves the readable font token on the OpenDyslexic family without importing it yet', () => {
        expect(r0Block()).toContain("--talos-font-readable: 'OpenDyslexic'")
        const appJs = readFileSync(fileURLToPath(new URL('../../app.js', import.meta.url)), 'utf8')
        expect(appJs).not.toContain('opendyslexic')
    })

    it('keeps density scaling on spacing tokens, not a second global font-size override', () => {
        const block = r0Block()
        expect(block).toContain('var(--talos-density')
    })
})
