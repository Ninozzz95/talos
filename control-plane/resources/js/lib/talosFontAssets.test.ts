import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const appEntry = readFileSync(resolve(projectRoot, 'resources/js/app.js'), 'utf8')
const appCss = readFileSync(resolve(projectRoot, 'resources/css/app.css'), 'utf8')
const viteConfig = readFileSync(resolve(projectRoot, 'vite.config.js'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
}

const localFamilies = [
    'instrument-sans',
    'manrope',
    'jetbrains-mono',
    'sora',
    'source-serif-4',
]

describe('TALOS local font assets', () => {
    it('loads only the required latin weights from local Fontsource packages', () => {
        for (const family of localFamilies) {
            expect(packageJson.dependencies?.[`@fontsource/${family}`], family).toBeTruthy()
            expect(appEntry, family).toContain(`@fontsource/${family}/latin-400.css`)
        }

        expect(appEntry).toContain('@fontsource/orbitron/600.css')
        expect(appEntry).not.toContain('@fontsource-variable/')
    })

    it('does not download runtime fonts through the Vite Laravel plugin', () => {
        expect(viteConfig).not.toMatch(/\bbunny\s*\(/)
        expect(viteConfig).not.toContain('laravel-vite-plugin/fonts')
    })

    it('keeps removed unbundled families out of theme CSS and Orbitron brand-only', () => {
        const removedFamilies = [
            'Aptos',
            'Cascadia Mono',
            'DM Sans',
            'Geist',
            'IBM Plex Mono',
            'Inter',
            'Lora',
            'Poppins',
            'Roboto',
            'Roboto Mono',
            'Source Sans 3',
        ]

        for (const family of removedFamilies) {
            expect(appCss, family).not.toMatch(new RegExp(`\\b${family.replace(/ /g, '\\s+')}\\b`))
        }

        expect(appCss.match(/\bOrbitron\b/g)).toHaveLength(1)
        expect(appCss).toMatch(/\.talos-orbitron-brand\s*\{[^}]*font-family:\s*Orbitron/s)
    })
})
