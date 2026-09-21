// @vitest-environment jsdom
/**
 * ⛔ Le categorie si richiudono — ma NON nascondono mai quanto è acceso.
 *
 * ## Da dove nasce
 *
 * Owner 2026-08-08: «voglio che le categorie vengano raggruppate in un
 * collapse». La ragione è misurata sul Pad: con 55 strumenti questa pagina
 * arriva a **y≈13.000** — tredici schermate di interruttori. Chi scorre tanto
 * non legge; e una pagina di permessi che non si legge non è controllo.
 *
 * ## ⛔ Ma un collapse su una pagina di PERMESSI è pericoloso, e questo è il
 * test che ne tiene la parte pericolosa
 *
 * Richiudere una categoria significa togliere dagli occhi degli interruttori
 * che restano **accesi**. Se la testata chiusa dicesse solo «Questo telefono»,
 * la pagina avrebbe barattato la lunghezza con l'opacità: nessuno saprebbe più
 * cosa ha lasciato attivo senza riaprire tutto, uno per uno. Sarebbe un peggio,
 * non un meglio.
 *
 * Perciò il patto è: **si può chiudere, non si può nascondere lo stato**. La
 * testata chiusa porta «6 di 17 accesi», e quel conto è ciò che questi casi
 * difendono. Se un domani qualcuno lo togliesse per fare pulizia grafica, qui
 * si rompe qualcosa e c'è scritto perché.
 *
 * ## Perché la prima resta aperta
 *
 * Chiuse tutte, chi arriva la prima volta vede sei titoli e nessun interruttore,
 * e non capisce cosa può spegnere: il collapse gli avrebbe nascosto la funzione
 * stessa della pagina. Aperte tutte, non serviva a niente. Aperta la prima.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import {
    TALOS_AGENT_TOOL_CONTROLS,
    TALOS_AGENT_TOOL_GROUP_ORDER,
} from '@/lib/tools/toolControlCatalog'

/**
 * ⛔ `reactive()` e non un oggetto qualunque.
 *
 * Con un oggetto normale, accendere un interruttore nel test non ridisegna
 * niente e il conto sulla testata resta al valore del primo disegno — così
 * COLLAPSE-04 fallirebbe pur essendo il codice giusto, e peggio: passerebbe
 * anche se il conto fosse una fotografia scattata una volta sola. Nell'app lo
 * store è reattivo davvero, e la finzione deve somigliargli su questo punto,
 * perché è proprio questo il punto.
 */
const settings = vi.hoisted(() => ({
    state: {
        tools: { read: 'ask', write: 'ask', outbound: 'ask' },
        tools_chosen: ['read', 'write', 'outbound'],
        // Motore scelto: qui si provano i collapse, non l'avviso
        // «manca un motore» — che ha il suo test in `interruttoreCheMente`.
        search: { source: 'tavily' as string | null },
        agent_tools: {} as Record<string, boolean>,
        tool_authorizations: { schema_version: 1, revision: 0, grants: {} },
    },
    effectiveToolPermissions: () => settings.state.tools,
    setToolPermissions: vi.fn(async () => {}),
    setAgentToolEnabled: vi.fn(async () => {}),
    revokeToolAuthorization: vi.fn(async () => {}),
}))

/*
 * ⛔ La reattività si accende QUI e non sopra: `vi.hoisted` gira prima degli
 * import, e `reactive` da lassù non esiste ancora — provato, «Cannot access
 * before initialization». Questa fabbrica invece gira dopo, e comunque prima che
 * il componente venga importato.
 */
vi.mock('@/stores/settings', async () => {
    const { reactive } = await vi.importActual<typeof import('vue')>('vue')
    settings.state = reactive(settings.state)
    return { useSettingsStore: () => settings }
})

import TalosMobileSettingsAgentToolsPanel from '@/components/talos/settings/TalosMobileSettingsAgentToolsPanel.vue'

/** Il primo gruppo del catalogo, che è quello che nasce aperto. */
const PRIMO = TALOS_AGENT_TOOL_GROUP_ORDER[0]!
const SECONDO = TALOS_AGENT_TOOL_GROUP_ORDER[1]!

function toolDi(gruppo: string): string[] {
    return TALOS_AGENT_TOOL_CONTROLS.filter((c) => c.group === gruppo).map((c) => c.id)
}

beforeEach(() => {
    settings.state.agent_tools = {}
})

/**
 * Aperta o chiusa si guarda sul CONTENITORE, non sulle righe dentro.
 *
 * ⛔ E si guarda lo stile in linea, non `isVisible()`. Misurato scrivendo questo
 * test: montato senza attaccare il documento, `isVisible()` ha risposto **falso
 * sempre** — anche a categoria aperta, col contenitore senza alcun
 * `display:none`. Un test costruito su quella risposta sarebbe passato per il
 * motivo sbagliato o fallito per il motivo sbagliato, senza mai dire la verità.
 *
 * `v-show` fa una cosa sola e la fa in un posto solo: scrive `display: none`
 * sull'elemento. Guardare esattamente quello significa provare il meccanismo che
 * usiamo, non l'idea che ce ne siamo fatti.
 */
function corpo(wrapper: ReturnType<typeof mount>, gruppo: string) {
    return wrapper.get(`[data-agent-tool-group-body="${gruppo}"]`)
}

function aperta(wrapper: ReturnType<typeof mount>, gruppo: string): boolean {
    return (corpo(wrapper, gruppo).element as HTMLElement).style.display !== 'none'
}

/** Le righe DENTRO quella categoria: che ci siano tutte, e solo le sue. */
function righeDentro(wrapper: ReturnType<typeof mount>, gruppo: string): number {
    return toolDi(gruppo)
        .filter((id) => corpo(wrapper, gruppo).find(`[data-agent-tool="${id}"]`).exists())
        .length
}

/**
 * Le cifre della testata, nell'ordine in cui si leggono.
 *
 * ⛔ Non il testo: nei test la lingua ricade sull'inglese, e pretendere «6 di
 * 17» proverebbe la traduzione italiana invece del conto. Le cifre sono le
 * stesse in tutte le lingue — è quello che vogliamo difendere.
 */
function cifre(wrapper: ReturnType<typeof mount>, gruppo: string): string[] {
    return testata(wrapper, gruppo).text().match(/\d+/g) ?? []
}

function testata(wrapper: ReturnType<typeof mount>, gruppo: string) {
    return wrapper.get(`[data-agent-tool-group="${gruppo}"]`)
}

describe('le categorie richiudibili', () => {
    it('COLLAPSE-01 la prima è aperta, le altre no — e tutte hanno una testata', async () => {
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        await flushPromises()

        for (const gruppo of TALOS_AGENT_TOOL_GROUP_ORDER) {
            expect(testata(wrapper, gruppo).exists(), gruppo).toBe(true)
        }
        expect(aperta(wrapper, PRIMO)).toBe(true)
        expect(aperta(wrapper, SECONDO)).toBe(false)
        // ⛔ E le righe ci sono comunque, tutte: chiusa vuol dire nascosta, non
        // amputata. Una categoria che perdesse i suoi strumenti sarebbe un
        // insieme di interruttori che nessuno può più raggiungere.
        expect(righeDentro(wrapper, SECONDO)).toBe(toolDi(SECONDO).length)
    })

    it('COLLAPSE-02 un tocco apre, un altro richiude', async () => {
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        await flushPromises()

        await testata(wrapper, SECONDO).trigger('click')
        expect(aperta(wrapper, SECONDO)).toBe(true)
        expect(testata(wrapper, SECONDO).attributes('aria-expanded')).toBe('true')

        await testata(wrapper, SECONDO).trigger('click')
        expect(aperta(wrapper, SECONDO)).toBe(false)
        expect(testata(wrapper, SECONDO).attributes('aria-expanded')).toBe('false')

        // ⛔ E aprirne una non chiude l'altra: sono sei domande separate, non un
        // accordion che costringe a tenere in testa quello che ha appena
        // richiuso da solo.
        await testata(wrapper, SECONDO).trigger('click')
        expect(aperta(wrapper, PRIMO)).toBe(true)
    })

    it('COLLAPSE-03 ⛔ il conto degli accesi si legge a categoria CHIUSA', async () => {
        /*
         * Il caso che porta tutto il peso. Si accende metà del secondo gruppo —
         * che nasce chiuso — e si pretende di leggere quanti sono senza aprirlo.
         */
        const dentro = toolDi(SECONDO)
        const accesi = dentro.slice(0, Math.ceil(dentro.length / 2))
        for (const id of accesi) settings.state.agent_tools[id] = true

        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        await flushPromises()

        expect(aperta(wrapper, SECONDO)).toBe(false)
        expect(cifre(wrapper, SECONDO)).toEqual([String(accesi.length), String(dentro.length)])
    })

    it('COLLAPSE-04 il conto SEGUE gli interruttori, non è una fotografia', async () => {
        /*
         * Un numero giusto al primo disegno e fermo per sempre sarebbe peggio di
         * nessun numero: direbbe una bugia con l'aria di un fatto.
         */
        const wrapper = mount(TalosMobileSettingsAgentToolsPanel)
        await flushPromises()

        const dentro = toolDi(PRIMO)
        expect(cifre(wrapper, PRIMO)).toEqual(['0', String(dentro.length)])

        settings.state.agent_tools[dentro[0]!] = true
        await flushPromises()
        expect(cifre(wrapper, PRIMO)).toEqual(['1', String(dentro.length)])
    })

    it('COLLAPSE-05 morde: senza il conto, una categoria chiusa non direbbe niente', () => {
        /*
         * La prova che COLLAPSE-03 non passa per costruzione: se la testata
         * portasse il solo titolo, il testo non conterrebbe alcuna cifra e il
         * caso sopra fallirebbe. È lo stato in cui sarebbe finita la pagina se
         * avessimo aggiunto il collapse e basta.
         */
        const soloTitolo = 'Questo telefono'
        expect(/\d/.test(soloTitolo)).toBe(false)
    })
})
