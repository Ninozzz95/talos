import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseTalosMobileDesignTokens } from '@talos-mobile/design-tokens'
import bundled from '@/theme/telemetry.identity.json'

/**
 * ⭐ TEMA-HASH (owner 25/09/2026, «hash nel manifesto»; dossier `.claude/ricerche/2026-09-25-release-mobile-v0138-10x4.md`,
 * domanda 5).
 *
 * Prima questo test importava il tema dal desktop (`control-plane/resources/js/motion-v6/themeIdentity.ts`, fuori da
 * `mobile/`) e, dove il desktop mancava, saltava per intero — anche il controllo sul contratto mobile, che il desktop non
 * lo usa. Il pacchetto mobile si rilascia da solo e non legge file delle altre lane (regola dell'owner del 25/09).
 *
 * Ora la copia porta il suo hash in `upstream/desktop-theme-identity-manifest.json`, come i file portati dal desktop
 * (R3-13): cambiarla per sbaglio fa rosso; cambiarla apposta vuol dire riconciliarla col desktop e aggiornare il
 * manifesto. Il contratto mobile si controlla sempre.
 */

const MOBILE = resolve(__dirname, '..', '..', '..')

describe('TEMA-HASH: il tema «telemetry» del mobile', () => {
    it('TEMA-01: la copia coincide con quella riconciliata col desktop (hash nel manifesto)', () => {
        const manifesto = JSON.parse(readFileSync(join(MOBILE, 'upstream', 'desktop-theme-identity-manifest.json'), 'utf8'))
        expect(Object.keys(manifesto).sort()).toEqual(['desktop_reconciled_revision', 'desktop_source', 'mobile_path', 'reconciliation', 'schema_version', 'sha256'])
        expect(manifesto.schema_version).toBe(1)
        expect(manifesto.mobile_path).toBe('mobile/src/theme/telemetry.identity.json')
        const hash = createHash('sha256').update(readFileSync(join(MOBILE, 'src', 'theme', 'telemetry.identity.json'))).digest('hex')
        expect(hash, 'tema cambiato: riconcilialo col desktop e aggiorna il manifesto').toBe(manifesto.sha256)
    })

    it('TEMA-02: rispetta il contratto mobile, sempre (anche senza il desktop accanto)', () => {
        const parsed = parseTalosMobileDesignTokens(bundled)
        expect(parsed.id).toBe('telemetry')
        expect(parsed.assets.poster.path).toBe('/talos/backgrounds/telemetry-poster.webp')
        expect(parsed.schema_version).toBe(1)
    })
})

/*
 * ⭐ LANE-01 (owner 25/09/2026, «il pacchetto funziona da solo, non chiama file delle altre lane»): nessun sorgente,
 * script o test del mobile nomina in una stringa un percorso delle altre lane. I commenti che le citano restano: qui si
 * guardano solo le stringhe tra apici, cioè ciò che il codice può importare, leggere o eseguire.
 */
describe('LANE-01: il mobile non legge file delle altre lane', () => {
    it('LANE-01: nessuna stringa in src/, scripts/, tests/ punta a control-plane, harness-ui, context-engine o alla CLI', () => {
        const ALTRE_LANE = /['"](?:\.\.\/)*(?:control-plane|harness-ui\/src|context-engine|kadmos|AVM-harness-desktop)\//
        const trovati: string[] = []
        const visita = (cartella: string) => {
            for (const voce of readdirSync(cartella)) {
                if (voce === 'node_modules' || voce === 'dist') continue
                const percorso = join(cartella, voce)
                if (statSync(percorso).isDirectory()) visita(percorso)
                else if (/\.(ts|mts|mjs|cjs|js|vue)$/.test(voce)) {
                    readFileSync(percorso, 'utf8').split('\n').forEach((riga, indice) => {
                        const testo = riga.trim()
                        if (testo.startsWith('//') || testo.startsWith('*') || testo.startsWith('/*')) return
                        if (ALTRE_LANE.test(riga)) trovati.push(`${percorso.slice(MOBILE.length + 1)}:${indice + 1}`)
                    })
                }
            }
        }
        for (const radice of ['src', 'scripts', 'tests']) visita(join(MOBILE, radice))
        expect(trovati).toEqual([])
    })
})
