// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TalosToolPermissionsBoard from '@/components/talos/permissions/TalosToolPermissionsBoard.vue'
import { TALOS_AGENT_TOOL_CONTROLS, TALOS_AZIONI_GOVERNATE } from '@/lib/tools/toolControlCatalog'
import { TALOS_TOOL_ACTIONS, type TalosToolPermissions } from '@/lib/tools/permissionTypes'

function scheda(iniziali: Partial<TalosToolPermissions> = {}) {
    const modello = ref<TalosToolPermissions>({
        read: 'ask', write: 'ask', outbound: 'ask', ...iniziali,
    })
    const wrapper = mount(TalosToolPermissionsBoard, {
        props: {
            modelValue: modello.value,
            'onUpdate:modelValue': (v: TalosToolPermissions) => {
                modello.value = v
                void wrapper.setProps({ modelValue: v })
            },
        },
    })
    return { wrapper, modello }
}

/**
 * Owner 2026-08-06: «una pagina dedicata di tutti i permessi per i tool, in modo
 * di impostarli in one shot al primo accesso».
 *
 * Prima c'erano due bottoni — «chiedimelo» o «lascialo fare» — per tre poteri
 * molto diversi, e nessun modo di sapere cosa fosse «tutto»: chi premeva il
 * secondo autorizzava anche l'uscita in rete senza che gliel'avesse detto
 * nessuno.
 */
describe('la scheda dei permessi degli strumenti', () => {
    it('mostra i poteri GOVERNATI, ciascuno coi suoi tre stati', () => {
        const { wrapper } = scheda()
        for (const azione of TALOS_AZIONI_GOVERNATE) {
            expect(wrapper.find(`[data-testid="talos-tool-permission-${azione}"]`).exists()).toBe(true)
            for (const stato of ['allow', 'ask', 'deny']) {
                expect(wrapper.find(`[data-testid="talos-tool-permission-${azione}-${stato}"]`).exists()).toBe(true)
            }
        }
    })

    /**
     * Tre scelte che si escludono devono SUONARE come tali a chi naviga con
     * TalkBack: tre bottoni sciolti si annunciano come tre azioni indipendenti,
     * e chi non vede non ha modo di capire che sceglierne una spegne le altre.
     */
    it('le tre scelte sono un gruppo di opzioni, non tre bottoni sciolti', () => {
        const { wrapper } = scheda()
        const gruppi = wrapper.findAll('[role="radiogroup"]')
        expect(gruppi).toHaveLength(3)
        const radio = wrapper.findAll('[role="radio"]')
        expect(radio).toHaveLength(9)
        // Uno solo per gruppo risulta scelto.
        expect(radio.filter((r) => r.attributes('aria-checked') === 'true')).toHaveLength(3)
    })

    it('«decidi tutto» decide davvero tutti e tre', async () => {
        const { wrapper, modello } = scheda()
        await wrapper.get('[data-testid="talos-tool-permissions-all-deny"]').trigger('click')
        expect(modello.value).toEqual({ read: 'deny', write: 'deny', outbound: 'deny' })
    })

    it('un potere alla volta si cambia da solo, senza toccare gli altri', async () => {
        const { wrapper, modello } = scheda()
        await wrapper.get('[data-testid="talos-tool-permission-outbound-deny"]').trigger('click')
        expect(modello.value).toEqual({ read: 'ask', write: 'ask', outbound: 'deny' })
    })

    /**
     * L'elenco degli strumenti viene dal catalogo VERO.
     *
     * Un elenco scritto a mano sarebbe giusto oggi e falso al primo tool nuovo,
     * e nessuno se ne accorgerebbe: una pagina di permessi che dimentica uno
     * strumento non sbaglia in modo visibile — sbaglia in silenzio, che qui
     * significa far autorizzare qualcosa che non è stato nominato.
     */
    it('dice quali strumenti stanno dentro ogni potere, e li prende dal catalogo', () => {
        const { wrapper } = scheda()
        for (const azione of TALOS_AZIONI_GOVERNATE) {
            const dettaglio = wrapper.get(`[data-testid="talos-tool-permission-${azione}-tools"]`)
            const attesi = TALOS_AGENT_TOOL_CONTROLS.filter((c) => c.actions.includes(azione))
            expect(attesi.length).toBeGreaterThan(0)

            /*
             * ⛔ Le CIFRE della riga chiusa, non i nomi.
             *
             * Dal 2026-08-08 l'elenco sta dentro un collapse — owner: «voglio
             * che le categorie vengano raggruppate in un collapse» — e la riga
             * che si legge senza aprire dice «copre N strumenti in M
             * categorie». È quella riga a portare adesso la garanzia di prima:
             * nessuno strumento del catalogo può mancare dal suo potere. Se un
             * tool nuovo non arrivasse fin qui, N smetterebbe di tornare.
             *
             * I nomi restano fuori dalla verifica per la stessa ragione di
             * prima: passano dalle traduzioni e cambiano. I due numeri no.
             */
            const cifre = (dettaglio.get('summary').text().match(/\d+/g) ?? []).map(Number)
            expect(cifre).toEqual([
                new Set(attesi.map((c) => c.id)).size,
                new Set(attesi.map((c) => c.group)).size,
            ])

            // E le categorie ci sono davvero, non solo contate: una categoria
            // per riga, con i suoi strumenti sotto.
            expect(dettaglio.findAll('li').length).toBe(new Set(attesi.map((c) => c.group)).size)
        }
    })

    it('mentre salva non si può cambiare idea a metà', () => {
        const modello = ref<TalosToolPermissions>({ read: 'ask', write: 'ask', outbound: 'ask' })
        const wrapper = mount(TalosToolPermissionsBoard, {
            props: { modelValue: modello.value, busy: true },
        })
        expect(wrapper.get('[data-testid="talos-tool-permission-read-allow"]').attributes('disabled')).toBeDefined()
        expect(wrapper.get('[data-testid="talos-tool-permissions-all-allow"]').attributes('disabled')).toBeDefined()
    })

    /**
     * Visto sul OnePlus Pad 3 il 2026-08-06: toccando due poteri diversi in
     * rapida successione, **il primo tocco spariva**. Il modello arriva da fuori
     * e, finché chi sta sopra non ha propagato, la lettura risponde col valore
     * vecchio: il secondo tocco ricostruiva l'oggetto da prima del primo.
     *
     * In una pagina di permessi non è un fastidio: è una persona che crede di
     * aver negato la rete e non l'ha negata. Il test tocca DUE volte senza
     * attendere in mezzo, che è ciò che fa un dito.
     */
    it('due tocchi ravvicinati contano tutti e due', () => {
        const { wrapper, modello } = scheda()
        wrapper.get('[data-testid="talos-tool-permission-outbound-deny"]').element.dispatchEvent(new Event('click'))
        wrapper.get('[data-testid="talos-tool-permission-read-allow"]').element.dispatchEvent(new Event('click'))
        expect(modello.value).toEqual({ read: 'allow', write: 'ask', outbound: 'deny' })
    })

    /*
     * ⭐⭐⭐ LA DECISIONE DEL 2026-08-20, pinnata.
     *
     * `execute` e entrata nel vocabolario per l'esecuzione di codice, e nessun
     * attrezzo la dichiara ancora. Mostrarla lo stesso avrebbe prodotto una
     * riga senza attrezzi sotto, per un potere non esercitabile — e, misurato,
     * avrebbe reso FALSA l'autonomia gia concessa di chi l'aveva concessa.
     *
     * ⇒ La scheda mostra i poteri che ESISTONO. Questo test cade il giorno che
     * il primo attrezzo dichiara `execute` — ed e giusto che cada: quel giorno
     * la riga deve comparire, con la sua icona e la sua domanda.
     */
    it('⛔ NON mostra un potere che nessun attrezzo dichiara', () => {
        const nonGovernate = TALOS_TOOL_ACTIONS.filter((a) => !TALOS_AZIONI_GOVERNATE.includes(a))
        const { wrapper } = scheda()
        for (const azione of nonGovernate) {
            expect(wrapper.find(`[data-testid="talos-tool-permission-${azione}"]`).exists())
                .toBe(false)
        }
        // ⛔ E il verso contrario: ogni potere governato HA la sua riga. Senza
        // questo, una lista vuota passerebbe il test qui sopra a mani basse.
        expect(TALOS_AZIONI_GOVERNATE.length).toBeGreaterThan(0)
        for (const azione of TALOS_AZIONI_GOVERNATE) {
            expect(wrapper.find(`[data-testid="talos-tool-permission-${azione}"]`).exists())
                .toBe(true)
        }
    })
})