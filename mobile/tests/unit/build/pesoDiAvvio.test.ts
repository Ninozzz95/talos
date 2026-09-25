import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * AVVIO (25/09/2026, owner «procedi in ordine», punto 1: i tetti del pezzo d'avvio erano a 96 byte di JS e 33 di CSS).
 * Regola dell'owner del 14/08 (`scripts/verify-initial-chunk.mjs`): prima peso vero, poi pezzi a richiesta, mai un
 * contratto accorciato, il tetto per ultimo. Misurato sulla build (sourcemap + blocchi CSS di primo livello):
 * - `talos-motion-v6-simple.css` (le scene animate di sfondo dei temi, 16.819 byte nel CSS d'avvio) era importato da
 *   `main.ts`, ma le sue classi le usa solo lo sfondo (`TalosProceduralBackground` → `TalosMotionStage`), che `App.vue`
 *   carica già a richiesta. Vite carica il CSS di un pezzo a richiesta prima di eseguirlo: nessuno sfondo senza stile.
 * - i loghi dei fornitori sotto i 4 KB venivano incorporati come data URL nel JS d'avvio (Vite `assetsInlineLimit`);
 *   i tre più grossi escono con `?no-inline` (https://vite.dev/guide/assets, letto il 25/09/2026). Il riquadro del logo
 *   ha misura fissa: niente spostamenti mentre arriva.
 */
const src = (percorso: string) => readFileSync(resolve(__dirname, '../../../src', percorso), 'utf8')

describe('AVVIO — ciò che serve solo dopo non viaggia nel pezzo d’avvio', () => {
    it('AVVIO-01 le scene di sfondo le importa lo sfondo, non main.ts', () => {
        const importa = /^import\s+['"]@\/css\/talos-motion-v6-simple\.css['"]/m
        expect(src('main.ts')).not.toMatch(importa)
        expect(src('components/talos/workspace/TalosProceduralBackground.vue')).toMatch(importa)
    })

    it('AVVIO-02 i loghi più grossi dei fornitori non sono incorporati', () => {
        const icona = src('components/models/TalosMobileProviderIcon.vue')
        for (const logo of ['deepseek', 'openai', 'anthropic']) {
            expect(icona).toContain(`@/assets/providers/${logo}.svg?no-inline`)
        }
    })
})
