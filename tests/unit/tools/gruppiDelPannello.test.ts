/**
 * La guardia che impedisce «un insieme di tool che nessuno può spegnere».
 *
 * ## Perché esiste
 *
 * Il pannello delle impostazioni disegna i gruppi nell'ordine di
 * `TALOS_AGENT_TOOL_GROUP_ORDER`, e disegna **solo quelli**. Finché
 * quell'elenco viveva dentro il componente, aggiungere un gruppo nuovo al
 * catalogo e scordarsi di aggiungerlo lì non faceva cadere nulla: la pagina
 * restava valida, il conteggio dei tool restava giusto, i test passavano — e i
 * tool di quel gruppo semplicemente **non comparivano più fra gli
 * interruttori**. Il modello poteva usarli e nessuno poteva spegnerli.
 *
 * Non è un'ipotesi: lo stesso difetto è già stato scovato due volte per via
 * diversa (`memory_write` e `research_list`, tool esistenti che il catalogo non
 * conosceva). La differenza è che quelli li ha trovati un test di copertura,
 * mentre un gruppo mancante non aveva nessuno che lo cercasse.
 *
 * ## Cosa afferma, nei DUE sensi
 *
 * Un solo senso non basterebbe, e le due direzioni falliscono per motivi
 * opposti: un gruppo usato e non elencato **nasconde** dei tool; un gruppo
 * elencato e vuoto lascia un titolo di sezione **senza niente sotto**.
 */
import { describe, expect, it } from 'vitest'
import {
    TALOS_AGENT_TOOL_CONTROLS,
    TALOS_AGENT_TOOL_GROUP_ORDER,
} from '@/lib/tools/toolControlCatalog'

describe('TALOS_AGENT_TOOL_GROUP_ORDER', () => {
    it('GRUPPI-01 elenca ogni gruppo che il catalogo usa davvero', () => {
        const usati = [...new Set(TALOS_AGENT_TOOL_CONTROLS.map((c) => c.group))].sort()
        const elencati = [...TALOS_AGENT_TOOL_GROUP_ORDER].sort()

        // Il messaggio dice quale manca, non solo che qualcosa non torna: chi
        // aggiunge un gruppo lo fa una volta sola e non deve indovinare.
        const mancanti = usati.filter((g) => !TALOS_AGENT_TOOL_GROUP_ORDER.includes(g))
        expect(mancanti, `gruppi usati dal catalogo ma non mostrati nel pannello: ${mancanti.join(', ')}`)
            .toEqual([])
        expect(elencati).toEqual(usati)
    })

    it('GRUPPI-02 non elenca gruppi vuoti', () => {
        for (const gruppo of TALOS_AGENT_TOOL_GROUP_ORDER) {
            const quanti = TALOS_AGENT_TOOL_CONTROLS.filter((c) => c.group === gruppo).length
            expect(quanti, `il gruppo «${gruppo}» non ha nessun tool: sarebbe un titolo vuoto`)
                .toBeGreaterThan(0)
        }
    })

    it('GRUPPI-03 morde: un gruppo tolto dall’ordine viene visto', () => {
        /*
         * ⛔ La prova che il test controlla qualcosa. Un test che afferma
         * un'uguaglianza fra due liste costruite dallo stesso dato può essere
         * vero per costruzione; qui simulo l'errore vero — l'elenco del
         * pannello a cui manca un gruppo — e verifico che il confronto lo
         * rilevi. Se un domani qualcuno lo riscrivesse in un modo che non
         * distingue, questo caso cadrebbe.
         */
        const ordineMutilato = TALOS_AGENT_TOOL_GROUP_ORDER.filter((g) => g !== 'device')
        const usati = [...new Set(TALOS_AGENT_TOOL_CONTROLS.map((c) => c.group))]
        const nascosti = usati.filter((g) => !ordineMutilato.includes(g))

        expect(nascosti).toEqual(['device'])
        const tolti = TALOS_AGENT_TOOL_CONTROLS.filter((c) => nascosti.includes(c.group))
        expect(tolti.length).toBeGreaterThan(0)
    })
})
