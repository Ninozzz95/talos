import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as modulo from '../../../scripts/prepara-prove.mjs'

/**
 * ⭐ PREPARA-PROVE (owner 25/09/2026, «uno script + README»; dossier `.claude/ricerche/2026-09-25-release-mobile-v0138-10x4.md`).
 *
 * Misurato: con solo `mobile/` in una cartella pulita `npm ci` e `npm run build` sono verdi, ma 31 prove cadono per file
 * che esistono solo sul computer di chi sviluppa: il pacchetto del kernel (`scripts/harness-talos/dist/`), i
 * `node_modules` dei due strumenti a sé (`tools/android-assets`, `tools/git-bash-launcher`) e `res/xml/config.xml`
 * scritto da `npx cap sync android`. `npm run prepara:prove` fa i passi che mancano, e solo quelli.
 */

type Passo = { perche: string, comando: string, argomenti: string[], cartella: string }
const { passiMancanti } = modulo as unknown as { passiMancanti(esiste: (percorso: string) => boolean): Passo[] }

const TUTTO = new Set([
    'scripts/harness-talos/dist/kernelPerIlBanco.js',
    'tools/android-assets/node_modules',
    'tools/git-bash-launcher/node_modules',
    'dist/index.html',
    'android/app/src/main/res/xml/config.xml',
])

describe('PREPARA-PROVE: i passi per le prove su un clone pulito', () => {
    it('PREPARA-01: su un clone pulito fa tutti i passi, nell’ordine giusto (la build prima della sincronizzazione)', () => {
        const passi = passiMancanti(() => false)
        expect(passi.map((passo) => [passo.cartella, passo.comando, ...passo.argomenti].join(' '))).toEqual([
            '. npm run harness:kernel',
            'tools/android-assets npm ci',
            'tools/git-bash-launcher npm ci',
            '. npm run build',
            '. npx cap sync android',
        ])
    })

    it('PREPARA-02: dove è già tutto pronto non fa niente', () => {
        expect(passiMancanti((percorso) => TUTTO.has(percorso))).toEqual([])
    })

    it('PREPARA-03: senza config.xml ma con la build, sincronizza soltanto', () => {
        const passi = passiMancanti((percorso) => TUTTO.has(percorso) && percorso !== 'android/app/src/main/res/xml/config.xml')
        expect(passi.map((passo) => passo.argomenti.join(' '))).toEqual(['cap sync android'])
    })

    it('PREPARA-04: package.json lo espone come «prepara:prove»', () => {
        const pacchetto = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
        expect(pacchetto.scripts['prepara:prove']).toBe('node scripts/prepara-prove.mjs')
    })
})
