import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/*
 * ⛔ Owner 24/10/2026 (`compositore-unico-chat-codice-24-10`): «condiviso da tutti i componenti del composer, sia chat che codice …
 * non sfori nelle due righe, perfettamente coerente e simmetrico … Mai distaccati.»
 * ⭐ Owner 27/10/2026 (mockup del compositore approvato): la pillola del ragionamento J3 non c'è più; il chip è UNO, «modello livello»,
 * e il livello si sceglie nel piede del foglio «Modello e ragionamento». Questi test, nati per la pillola unica, ora proteggono il chip
 * unico e il piede unico.
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

describe('UN chip «modello livello» e UN piede del ragionamento, nel compositore unico', () => {
    it('PILL-UNICA-01 la pillola J3 non esiste più e nessuno la importa; Chat, Codice e sessione montano lo stesso compositore', () => {
        const pillola = ['components/chat/TalosMobileReasoningPill.vue', 'components/chat/TalosMobileReasoningMenu.vue']
        expect(sorgenti.filter((f) => pillola.includes(f.rel))).toEqual([])
        expect(sorgenti.filter((f) => /TalosMobileReasoning(?:Pill|Menu)\.vue'/u.test(f.testo)).map((f) => f.rel)).toEqual([])
        for (const schermata of ['screens/ChatScreen.vue', 'screens/CodiceR4Screen.vue', 'screens/HarnessSessionScreen.vue']) {
            expect(leggi(schermata), schermata).toMatch(/import TalosMobileComposer from '@\/components\/chat\/TalosMobileComposer\.vue'/u)
        }
        // nessuna seconda regola dei livelli scritta a mano: la porta fissata la usano solo l'adattatore, il chip, il piede e il foglio
        const regola = sorgenti.filter((f) => /from '(?:\.\/|@\/lib\/chat\/)pillolaRagionamento'/u.test(f.testo)).map((f) => f.rel).sort()
        expect(regola).toEqual([
            'components/chat/TalosMobileComposer.vue',
            'components/chat/TalosMobileEffortPicker.vue',
            'components/chat/TalosMobileModelEffortDrawer.vue',
            'lib/chat/statoPillolaRagionamento.ts',
        ])
    })

    // MARCO5 (era «sparito»): il cursore è tornato, UNO, nel piede del foglio. L'anomalia 4 di Marco (il ragionamento fuori dallo
    // schermo, sotto l'elenco dei modelli) la evita il piede fisso in fondo (FOGLIO-03).
    it('MARCO5-UNICO il piede del ragionamento lo monta solo il foglio «Modello e ragionamento», e il cursore solo il piede', () => {
        const chi = sorgenti.filter((f) => f.rel !== 'components/chat/TalosMobileEffortPicker.vue'
            && /TalosMobileEffortPicker\.vue'/u.test(f.testo)).map((f) => f.rel)
        expect(chi).toEqual(['components/chat/TalosMobileModelEffortDrawer.vue'])
        const cursore = sorgenti.filter((f) => f.rel !== 'components/talos/ui/TalosThemedSegmentedSlider.vue'
            && /TalosThemedSegmentedSlider\.vue'/u.test(f.testo)).map((f) => f.rel)
        expect(cursore).toEqual(['components/chat/TalosMobileEffortPicker.vue'])
    })
})

/*
 * ⛔ PILL-RIGHE-01 — al più due righe a 360 px. jsdom non impagina, quindi questa è una prova di COSTRUZIONE, non una misura: legge le
 * regole che reggono la fila e rifà i conti col caso peggiore. La misura vera è la foto sul telefono. I conti: compositore a 360 px ⇒
 * 360 − 2×0,5rem (fascia agganciata, ≤ 860 px) − 2×0,75rem (compositore) − 2×1 px = 318 px.
 * Col chip unico (owner 27/10) la riga 1 è il chip «modello livello» (al più largo quanto lascia due tocchi) + la Libreria.
 */
describe('la fila del compositore sta in due righe a 360 px', () => {
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

    /*
     * ⭐ Owner 27/10/2026 («Approvato», mockup v6/v7): la fila non va più a capo. Sta nella seconda riga del compositore aperto,
     * fra «+» e microfono · invio; il permesso del Codice è uno scudo in alto a destra e «Controlla azioni» una riga sua in cima,
     * quindi nella fila restano il chip, la Libreria e (solo sul tablet) la pastiglia del piano.
     */
    it('PILL-RIGHE-01 la fila sta su una riga: niente a capo, il chip cede lo spazio, e a 360 px resta posto per il nome', () => {
        expect(regola(css, '.talos-composer-tools')).not.toContain('flex-wrap: wrap')
        expect(css).toContain('.talos-composer-tools > .talos-model-chip { flex-wrap: nowrap; min-width: 0; }')
        expect(css).toContain('.talos-composer-tools .talos-model-chip__nome { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }')
        expect(codice).not.toContain('.talos-composer-tools .talos-codice-r4-permesso')
        // seconda riga a 360 px: «+» · fila · microfono · invio, tre spazi fra le quattro colonne
        const fila = LARGO - 3 * TOCCO - 3 * SPAZIO
        // nella fila del telefono: il chip e la Libreria; al chip restano almeno 6rem per nome e livello
        expect(fila - SPAZIO - TOCCO).toBeGreaterThanOrEqual(6 * REM)
    })

    it('PILL-RIGHE-02 nel chip si accorcia il nome, mai il livello', () => {
        const compositore = leggi('components/chat/TalosMobileComposer.vue')
        expect(compositore).toContain('<span class="talos-model-chip__nome">')
        expect(compositore).toContain('data-testid="talos-composer-model-level"\n                        class="shrink-0 text-[var(--talos-muted)]"')
    })
})
