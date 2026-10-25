import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/*
 * ⛔ Owner 24/10/2026 (`compositore-unico-chat-codice-24-10`): «condiviso da tutti i componenti del composer, sia chat che codice …
 * non sfori nelle due righe, perfettamente coerente e simmetrico … Mai distaccati.»
 */
const SRC = resolve(__dirname, '..', '..', '..', 'src')
const leggi = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
function tutti(radice: string): string[] {
    return readdirSync(radice, { withFileTypes: true }).flatMap((v) => {
        const p = join(radice, v.name)
        return v.isDirectory() ? tutti(p) : /\.(vue|ts)$/u.test(v.name) ? [p] : []
    })
}
const sorgenti = tutti(SRC).map((p) => ({ rel: relative(SRC, p).replaceAll('\\', '/'), testo: readFileSync(p, 'utf8') }))

describe('UNA pillola del ragionamento, nel compositore unico (J3)', () => {
    it('PILL-UNICA-01 la pillola la monta SOLO TalosMobileComposer, una volta; Chat, Codice e sessione montano quel compositore', () => {
        const chiImporta = sorgenti.filter((f) => /from '@\/components\/chat\/TalosMobileReasoningPill\.vue'/u.test(f.testo)).map((f) => f.rel)
        expect(chiImporta).toEqual(['components/chat/TalosMobileComposer.vue'])
        expect(leggi('components/chat/TalosMobileComposer.vue').match(/<TalosMobileReasoningPill\b/gu)).toHaveLength(1)
        for (const schermata of ['screens/ChatScreen.vue', 'screens/CodiceR4Screen.vue', 'screens/HarnessSessionScreen.vue']) {
            expect(leggi(schermata), schermata).toMatch(/import TalosMobileComposer from '@\/components\/chat\/TalosMobileComposer\.vue'/u)
        }
        // nessuna seconda regola dei livelli scritta a mano: la porta fissata la usano solo l'adattatore e i suoi tipi
        const regola = sorgenti.filter((f) => /from '(?:\.\/|@\/lib\/chat\/)pillolaRagionamento'/u.test(f.testo)).map((f) => f.rel).sort()
        expect(regola).toEqual(['components/chat/TalosMobileComposer.vue', 'components/chat/TalosMobileReasoningPill.vue', 'lib/chat/statoPillolaRagionamento.ts'])
    })

    it('MARCO5-SPARITO nessun cursore del ragionamento resta montato: TalosMobileEffortPicker non lo importa più nessuno', () => {
        const chi = sorgenti.filter((f) => f.rel !== 'components/chat/TalosMobileEffortPicker.vue'
            && /TalosMobileEffortPicker\.vue'/u.test(f.testo)).map((f) => f.rel)
        expect(chi).toEqual([])
        const cursore = sorgenti.filter((f) => f.rel !== 'components/chat/TalosMobileEffortPicker.vue'
            && /TalosThemedSegmentedSlider\.vue'/u.test(f.testo)).map((f) => f.rel)
        expect(cursore).toEqual([])
    })
})

/*
 * ⛔ PILL-RIGHE-01 — al più due righe a 360 px. jsdom non impagina, quindi questa è una prova di COSTRUZIONE, non una misura: legge le
 * regole che reggono la fila e rifà i conti col caso peggiore. La misura vera è la foto sul telefono (rapporto J3, «da guardare dal
 * vivo»). I conti: compositore a 360 px ⇒ 360 − 2×0,5rem (fascia agganciata, ≤ 860 px) − 2×0,75rem (compositore) − 2×1 px = 318 px.
 */
describe('la fila delle pillole sta in due righe a 360 px (J3)', () => {
    const css = leggi('style.css')
    const codice = leggi('components/codice/codiceR4.css')
    const REM = 16
    const LARGO = 360 - 2 * 0.5 * REM - 2 * 0.75 * REM - 2
    const TOCCO = 3 * REM // --talos-touch-target
    const SPAZIO = 0.5 * REM / 2 // gap della fila
    const PASTIGLIA = 58 // la pastiglia del piano a 360 px: pallino 8 + 4 + «Piano»/«Plan» ~30 + 2×8 di margine, misurata sul disegno
    const regola = (testo: string, selettore: string) => {
        const i = testo.indexOf(`${selettore} {`)
        expect(i, selettore).toBeGreaterThanOrEqual(0)
        return testo.slice(i, testo.indexOf('}', i))
    }

    it('PILL-RIGHE-01 riga 1 = modello + ragionamento (il modello lascia sempre il posto); riga 2 = il resto, che ci sta', () => {
        // le regole che lo reggono (J3-bis: compattate per il tetto del foglio d'avvio, stessa resa)
        expect(regola(css, '.talos-model-chip.has-reasoning-pill')).toContain('max-width: calc(100% - 9rem);')
        expect(css).toContain('.talos-model-chip.has-reasoning-pill, .talos-model-chip.talos-reasoning-pill, .talos-model-chip.talos-composer-review { flex-wrap: nowrap; }')
        expect(css).toContain('.has-reasoning-pill > .talos-model-chip__nome, .talos-reasoning-pill > span, .talos-composer-review__testo { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }')
        expect(leggi('components/chat/TalosMobileReasoningPill.vue')).toContain('style="max-width: 8.75rem"')
        expect(leggi('components/chat/TalosMobileComposer.vue')).toContain('style="max-width: calc(100% - 3 * var(--talos-touch-target) - 2.5rem)"')
        expect(regola(codice, '.talos-composer-tools .talos-codice-r4-permesso')).toContain('max-width: calc(100% - 2 * var(--talos-touch-target) - 2rem);')
        // riga 1: il modello al massimo + lo spazio + la pillola al massimo
        const stanza = 9 * REM
        expect((LARGO - stanza) + SPAZIO + (stanza - SPAZIO)).toBeLessThanOrEqual(LARGO)
        // riga 2 del Codice: pastiglia + permesso al massimo + «Espandi»
        const permesso = LARGO - 2 * TOCCO - 2 * REM
        expect(PASTIGLIA + SPAZIO + permesso + SPAZIO + TOCCO).toBeLessThanOrEqual(LARGO)
        // riga 2 della Chat: «Controlla azioni» al massimo + biblioteca + pastiglia + «Espandi»
        const controlla = LARGO - 3 * TOCCO - 2.5 * REM
        expect(controlla + SPAZIO + TOCCO + SPAZIO + PASTIGLIA + SPAZIO + TOCCO).toBeLessThanOrEqual(LARGO)
        // la pillola del ragionamento col nome più lungo («Molto alto» / «Extra high», ~62 px a 12 px) entra nella sua stanza
        expect(8 + 16 + 8 + 62 + 8 + 14 + 8).toBeLessThanOrEqual(stanza - SPAZIO)
    })

    it('PILL-RIGHE-02 la pillola del ragionamento non va mai a capo dentro di sé, e il modello si accorcia solo quando c’è', () => {
        expect(css).toContain('.talos-model-chip.talos-reasoning-pill { flex: none; }')
        expect(leggi('components/chat/TalosMobileComposer.vue')).toContain(':class="{ \'has-reasoning-pill\': !reasoningPill.nascosta }"')
    })
})
