import { describe, expect, it } from 'vitest'
import {
    TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS,
    TALOS_GRUPPI_CHE_RIVELANO,
    TALOS_TENUTI_COMUNQUE,
} from '@/lib/chat/anonymousTools'
import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'

/**
 * ⛔⛔ IL CANCELLO CHE RENDE LECITA UNA LISTA SCRITTA A MANO.
 *
 * `TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS` è l'unico elenco del progetto scritto
 * invece che derivato, e la ragione è misurata: derivarlo tirava
 * `toolControlCatalog` — **8,8 KB pre-minify** — dentro il grafo d'avvio, perché
 * quel modulo era l'unico arco che lo importava e il controller è l'unico che
 * importa quel modulo. Cioè ogni persona che apre TALOS pagava il catalogo
 * intero delle impostazioni per una funzione che nella chat normale rende i suoi
 * argomenti immutati.
 *
 * ⇒ Una lista scritta a mano invecchia in silenzio. Questo test le toglie il
 * silenzio: la **ricalcola dal catalogo** e pretende che coincida. È lo stesso
 * patto delle impronte dei contratti — un valore fissato vale solo se un
 * cancello lo rifà.
 *
 * ⛔ Se sei qui perché è diventato rosso: hai aggiunto o spostato un tool in
 * `library` o `personal`. La cura è aggiornare la lista in `anonymousTools.ts`,
 * non allentare questo test — quei tool sono quelli che una chat temporanea non
 * deve poter usare, e uno dimenticato è una chat che rivela la Libreria.
 */
describe('⛔ la lista degli anonimi resta D\'ACCORDO col catalogo', () => {
    it('⛔ ricalcolata dal catalogo, coincide voce per voce', () => {
        const dalCatalogo = TALOS_AGENT_TOOL_CONTROLS
            .filter((tool) => TALOS_GRUPPI_CHE_RIVELANO.has(tool.group)
                && !TALOS_TENUTI_COMUNQUE.has(tool.id))
            .map((tool) => tool.id)
        expect([...TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS]).toEqual(dalCatalogo)
    })

    /*
     * ⛔ E non è vuota per sbaglio: una lista vuota soddisfa «coincide» solo se
     * anche il catalogo lo è, ma un refuso nei nomi dei gruppi darebbe due
     * insiemi vuoti e un test verde su una funzione che non nasconde più niente.
     */
    it('⛔ non è vuota, e contiene le cose che rivelano davvero', () => {
        expect(TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS.length).toBeGreaterThan(20)
        expect(TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS).toContain('library_read')
        expect(TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS).toContain('memory_search')
        expect(TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS).toContain('calendar_read')
        // ⛔ E `time_now` resta: non rivela niente e serve a rispondere.
        expect(TALOS_TOOLS_HIDDEN_WHEN_ANONYMOUS).not.toContain('time_now')
    })
})
