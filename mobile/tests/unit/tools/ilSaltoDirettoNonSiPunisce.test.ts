import { describe, expect, it } from 'vitest'
import { talosToolDelCatalogoEseguibile } from '@/lib/tools/catalogoCompatto'

/**
 * ⛔⛔⛔ SALTO-DIRETTO-PUNITO-01 — chiama lo strumento GIUSTO, e lo buttiamo.
 *
 * ## Cosa ha visto l'owner, misurato sul Pad il 2026-08-19
 *
 * `gemma-3-4b-it-Q4_K_M`, «Dimmi le coordinate del telefono». In chat è
 * comparso questo, come se fosse la risposta:
 *
 * ```
 *   Ecco le coordinate del telefono:
 *   JSON
 *   {"name":"device_location","arguments":{"latitude":"45.4615","longitude":…}}
 * ```
 *
 * Il nome è **vero**, la forma è **giusta**, lo strumento **esiste** ed era già
 * passato da `toolset.offer` — cioè dai permessi e dagli interruttori della
 * persona. L'abbiamo rifiutato per un motivo solo: non era passato prima da
 * `tool_details`.
 *
 * ## ⛔ Il catalogo a due passi è un RISPARMIO, non un cancello di sicurezza
 *
 * Esiste per non mettere 61 schemi da 38.386 byte nel prompt di un modello
 * piccolo. Chi salta il primo passo e indovina il nome giusto sta facendo
 * **meglio** di quanto il protocollo si aspetti: punirlo produce esattamente
 * la bolla che ha visto l'owner, con dentro il nostro protocollo.
 *
 * ⛔ E non allarga niente, per la stessa ragione già scritta accanto a
 * `tool_details`: si arriva solo a strumenti che i permessi hanno già lasciato
 * passare, la scheda di consenso resta al suo posto, e gli argomenti li
 * convalida lo schema dello strumento — che è il cancello vero.
 *
 * ⇒ Uno strumento che è **nel catalogo** è eseguibile. Chiamarlo lo svela, così
 * al giro dopo il modello ne vede anche la forma.
 */

const NEL_CATALOGO = new Set(['device_location', 'library_list', 'web_search'])

describe('SALTO-DIRETTO-PUNITO-01 uno strumento del catalogo è eseguibile', () => {
    it('⛔ il salto diretto a uno strumento VERO non si rifiuta più', () => {
        expect(talosToolDelCatalogoEseguibile('device_location', new Set(), NEL_CATALOGO)).toBe(true)
    })

    it('`tool_details` resta sempre eseguibile, com\'era', () => {
        expect(talosToolDelCatalogoEseguibile('tool_details', new Set(), NEL_CATALOGO)).toBe(true)
    })

    it('uno strumento già svelato resta eseguibile, com\'era', () => {
        expect(talosToolDelCatalogoEseguibile('device_location', new Set(['device_location']), new Set())).toBe(true)
    })

    it('⛔ e al contrario: un nome che NON esiste resta rifiutato', () => {
        // È il caso che il cancello proteggeva davvero — un marcatore di testo
        // scambiato per una chiamata. Quello non passa, e non deve passare.
        expect(talosToolDelCatalogoEseguibile('TALOS_TESTO_101', new Set(), NEL_CATALOGO)).toBe(false)
        expect(talosToolDelCatalogoEseguibile('memory_search', new Set(), NEL_CATALOGO)).toBe(false)
    })

    it('⛔ senza catalogo dichiarato il comportamento è quello di prima', () => {
        // Chi non passa il terzo argomento — i test vecchi, un chiamante che non
        // conosce il catalogo — non deve vedere nessun cambiamento.
        expect(talosToolDelCatalogoEseguibile('device_location', new Set())).toBe(false)
        expect(talosToolDelCatalogoEseguibile('device_location', new Set(['device_location']))).toBe(true)
    })
})
