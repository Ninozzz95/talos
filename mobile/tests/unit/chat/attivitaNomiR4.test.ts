// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileAttivitaDelTurno from '@/components/chat/TalosMobileAttivitaDelTurno.vue'
import TalosMobileRunningToolRow from '@/components/chat/TalosMobileRunningToolRow.vue'
import { TALOS_TOOL_LABEL_KEYS } from '@/lib/tools/toolLabels'

/*
 * ⛔ Incoerenza vista sul Pad (15/10, foto della scheda Agenti): nella conversazione del Codice su r4 la riga dell'attrezzo mostrava il
 * nome tecnico («delega_sottotask», «shell: ls -la», «scrivi: slug-pannello.mjs»), perché gli attrezzi di r4 non sono nella tabella della
 * chat. Il desktop r4 li nomina con `nomeUmanoAttrezzo` (`nomi-attrezzi.js` @ fc5) e il titolo con l'iniziale maiuscola (`comeTitolo`,
 * `legacy/app.js:9859`). Un attrezzo che la chat conosce resta com'è; uno che nessuno conosce resta col suo nome.
 */
const etichette = async (attivi: { name: string; detail: string | null }[]) => {
    const w = mount(TalosMobileAttivitaDelTurno, { props: { attivi } })
    await flushPromises()
    const righe = w.findAllComponents(TalosMobileRunningToolRow).map((r) => r.props('label'))
    w.unmount()
    return righe
}

describe('i nomi degli attrezzi di r4 nella riga del giro', () => {
    it('ANR4-01 nome umano del desktop con l\'iniziale maiuscola, poi il dettaglio; la chat e gli sconosciuti restano', async () => {
        expect(TALOS_TOOL_LABEL_KEYS.shell, 'la chat non ha già una parola per shell').toBeUndefined()
        expect(await etichette([
            { name: 'delega_sottotask', detail: null },
            { name: 'shell', detail: 'ls -la' },
            { name: 'leggi', detail: 'NOTA.md' },
            { name: 'attrezzo_mai_visto', detail: null },
        ])).toEqual(['Delegating to a sub-agent', 'Terminal command: ls -la', 'Reading a file: NOTA.md', 'attrezzo_mai_visto'])
        // un attrezzo della chat tiene la parola della chat, non quella di r4
        const conosciuto = Object.keys(TALOS_TOOL_LABEL_KEYS)[0]
        const [riga] = await etichette([{ name: conosciuto, detail: null }])
        expect(riga).not.toBe(conosciuto)
        expect(riga).not.toMatch(/^[A-Z][a-z]+ing a /u)
    })
})
