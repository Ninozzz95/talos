import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(fileURLToPath(new URL('../../../css/app.css', import.meta.url)), 'utf8')
const workspace = readFileSync(fileURLToPath(new URL('../../components/talos/workspace/TalosWorkspace.vue', import.meta.url)), 'utf8')
const componentsConfig = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../components.json', import.meta.url)), 'utf8'))
const packageManifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../package.json', import.meta.url)), 'utf8'))

describe('TALOS shadcn-vue foundation contract', () => {
    it('maps Tailwind semantic tokens to live TALOS variables', () => {
        expect(appCss).toContain('@theme inline')
        for (const token of [
            '--color-background: var(--talos-background)',
            '--color-foreground: var(--talos-text)',
            '--color-primary: var(--talos-accent)',
            '--color-primary-foreground: var(--talos-accent-text)',
            '--color-muted-foreground: var(--talos-muted)',
            '--color-border: var(--talos-border)',
            '--color-input: var(--talos-input)',
            '--color-ring: var(--talos-ring)',
        ]) {
            expect(appCss).toContain(token)
        }
        expect(appCss).toContain('@import "tw-animate-css"')
    })

    it('keeps the portal root inside the themed workspace and motion boundary', () => {
        expect(workspace).toMatch(/<main[\s\S]*:class="\['talos-shell[\s\S]*<div[^>]+id="talos-portal-root"[^>]+class="talos-portal-root"/)
        expect(appCss).toContain('.talos-ui-motion-disabled *')
        expect(appCss).toContain('@media (prefers-reduced-motion: reduce)')
    })

    it('pins the CLI and registry source used to regenerate the primitives', () => {
        expect(packageManifest.devDependencies['shadcn-vue']).toBe('2.7.4')
        expect(componentsConfig.registries['@talos-shadcn-vue-2-7-4'].url).toBe(
            'https://raw.githubusercontent.com/unovue/shadcn-vue/v2.7.4/apps/v4/public/r/styles/default/{name}.json',
        )
    })
})
