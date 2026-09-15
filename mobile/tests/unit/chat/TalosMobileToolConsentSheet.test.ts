// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileToolConsentSheet from '@/components/chat/TalosMobileToolConsentSheet.vue'

function mountCard(allowPersistent = true) {
    return mount(TalosMobileToolConsentSheet, {
        props: {
            title: 'Create a document',
            description: 'Writes a real file to the encrypted Library.',
            input: { title: 'Q2', body: 'x'.repeat(5_000) },
            actions: ['write'],
            sessionTitle: 'Quarterly planning',
            pendingCount: 2,
            allowPersistent,
        },
        global: { stubs: { Teleport: true } },
    })
}

function mountSenzaArgomenti(input: unknown) {
    return mount(TalosMobileToolConsentSheet, {
        props: {
            title: 'Leggi le notifiche a schermo',
            description: 'Legge titolo e testo delle notifiche in corso.',
            input,
            actions: ['read'] as const,
            sessionTitle: 'Nuova chat',
            pendingCount: 1,
            allowPersistent: true,
        },
        global: { stubs: { Teleport: true } },
    })
}

/**
 * ⛔ Visto sul Pad il 2026-08-09 provando «elenca le notifiche»: lo strumento non
 * prende argomenti, e la scheda mostrava lo stesso il riquadro grigio con dentro
 * `{}`. Due parentesi graffe non aiutano a decidere se dare un permesso — e
 * sembrano un guasto.
 *
 * Il test non chiede «il riquadro esiste». Chiede che la persona NON veda mai la
 * nostra sintassi: cerca le graffe nel testo a schermo.
 */
describe('⛔ la scheda non mostra mai sintassi al posto di informazione', () => {
    it('senza argomenti il riquadro non c’e’, e `{}` non compare a schermo', () => {
        const wrapper = mountSenzaArgomenti({})
        expect(wrapper.find('[data-testid="talos-tool-consent-input"]').exists()).toBe(false)
        expect(wrapper.text()).not.toContain('{}')
        // ⛔ E cio' che serve a decidere resta tutto.
        expect(wrapper.text()).toContain('Leggi le notifiche a schermo')
        expect(wrapper.text()).toContain('Legge titolo e testo delle notifiche in corso.')
        wrapper.unmount()
    })

    it('e nemmeno quando gli argomenti non arrivano affatto', () => {
        for (const vuoto of [undefined, null, {}, []]) {
            const wrapper = mountSenzaArgomenti(vuoto)
            expect(
                wrapper.find('[data-testid="talos-tool-consent-input"]').exists(),
                `riquadro comparso per ${JSON.stringify(vuoto) ?? 'undefined'}`,
            ).toBe(false)
            wrapper.unmount()
        }
    })

    it('ma con argomenti VERI il riquadro c’e’, perche’ li si deve poter leggere', () => {
        // Dal 12/8 gli argomenti piatti sono RIGHE e non piu' JSON: l'invariante
        // non cambia — quello che decide il si' o il no deve restare leggibile.
        const wrapper = mountSenzaArgomenti({ key: 'n7', text: 'ci sono' })
        const riquadro = wrapper.get('[data-testid="talos-tool-consent-arguments"]')
        expect(riquadro.text()).toContain('n7')
        expect(riquadro.text()).toContain('ci sono')
        wrapper.unmount()
    })
})

/**
 * ⛔⛔ Owner 2026-08-27, trovato dal vivo sul Pad: `escapeParameter` di
 * vue-i18n è acceso su tutta l'app (src/i18n/index.ts), e la riga "Requested
 * by {title}" interpolava `sessionTitle` — spesso il primo messaggio
 * dell'utente — DENTRO `t()`. Un apostrofo ci arrivava come `&apos;`
 * letterale, mai decodificato perché questa riga si rende come testo
 * semplice (`{{ }}`), non `v-html`. Stessa famiglia di difetto già chiusa in
 * `localModelsSection.test.ts` per uno slash in un repository id.
 */
describe('⛔ il titolo della sessione non passa da t(), gli apostrofi restano veri', () => {
    it('un apostrofo in sessionTitle resta un apostrofo, non &apos;', () => {
        const wrapper = mountCard()
        // mountCard usa 'Quarterly planning' di suo: rimonta con un titolo
        // che contiene davvero il carattere in questione.
        wrapper.unmount()
        const conApostrofo = mount(TalosMobileToolConsentSheet, {
            props: {
                title: 'Create a document',
                description: 'Writes a real file to the encrypted Library.',
                input: { title: 'Q2', body: 'x' },
                actions: ['write'] as const,
                sessionTitle: "l'assunzione che e' stata",
                pendingCount: 1,
                allowPersistent: true,
            },
            global: { stubs: { Teleport: true } },
        })
        expect(conApostrofo.text()).toContain("l'assunzione che e' stata")
        expect(conApostrofo.text()).not.toContain('&apos;')
        conApostrofo.unmount()
    })
})

describe('TalosMobileToolConsentSheet', () => {
    it('TOOL-AUTH-18 is a non-modal card without backdrop or focus trap', () => {
        const wrapper = mountCard()
        const card = wrapper.get('[data-testid="talos-tool-consent"]')

        expect(card.attributes('role')).toBe('dialog')
        expect(card.attributes('aria-modal')).toBeUndefined()
        expect(card.classes()).not.toContain('bg-black/50')
        expect(wrapper.text()).toContain('Quarterly planning')
        expect(wrapper.text()).toContain('2')
        // ⛔ Il tetto vale su QUALUNQUE forma: passando alle righe si era perso,
        // e questo assert e' quello che l'ha scoperto.
        expect(wrapper.get('[data-testid="talos-tool-consent-arguments"]').text().length)
            .toBeLessThan(4_500)
        wrapper.unmount()
    })

    it('TOOL-AUTH-18 expone tre scelte distinte, piu il rimandare', async () => {
        const wrapper = mountCard()

        await wrapper.get('[data-testid="talos-tool-consent-deny"]').trigger('click')
        await wrapper.get('[data-testid="talos-tool-consent-allow-once"]').trigger('click')
        await wrapper.get('[data-testid="talos-tool-consent-always"]').trigger('click')
        await wrapper.get('[data-testid="talos-tool-consent-later"]').trigger('click')

        expect(wrapper.emitted('deny')).toHaveLength(1)
        /*
         * ⛔ «Consenti» emette `allowTurn`, non `allowOnce`.
         *
         * Owner 2026-08-07: «qual è la differenza tra "consenti una volta" e
         * "per questa richiesta"? Non possiamo unirli?» — sì, ed erano due
         * perché noi distinguiamo la chiamata dal messaggio. Chi legge pensa al
         * messaggio che ha appena scritto.
         */
        expect(wrapper.emitted('allowTurn')).toHaveLength(1)
        expect(wrapper.emitted('allowOnce')).toBeUndefined()
        expect(wrapper.emitted('alwaysAllow')).toHaveLength(1)
        expect(wrapper.emitted('later')).toHaveLength(1)
        wrapper.unmount()
    })

    it('e dice a voce quanto dura un si, invece di lasciarlo dedurre', () => {
        // «Consenti» da solo si legge come «per sempre» a chi non ha mai visto
        // questa scheda, e chi lo scopre dopo non si fida piu'.
        const wrapper = mountCard()
        expect(wrapper.text()).toContain('covers this message')
        wrapper.unmount()
    })

    it('hides permanent authorization for a force-confirmed action', () => {
        const wrapper = mountCard(false)
        expect(wrapper.find('[data-testid="talos-tool-consent-always"]').exists()).toBe(false)
        wrapper.unmount()
    })
})

/**
 * ⛔⛔ I DUE DIFETTI DELLA SCHEDA VISTI DALL'OWNER IL 12 AGOSTO.
 *
 * (a) «c'è solo nega e consenti questa volta e non consenti sempre. Per questo
 *     lo dobbiamo aggiungere». Il bottone c'era: era tolto APPOSTA, perché
 *     guidare lo schermo è `R4` e `irreversible`. Il difetto era il SILENZIO —
 *     una scelta assente senza una ragione si legge come una funzione mancante,
 *     e infatti l'ha chiesta credendo di chiedere una comodità.
 *
 * (b) dal suo screenshot, la scheda mostrava `{ "obiettivo": "Apri WhatsApp…" }`
 *     con graffe e virgolette: la nostra sintassi addosso a chi possiede il
 *     telefono.
 */
describe('⛔ la scheda dice PERCHÉ, e non parla in JSON', () => {
    function scheda(over: Record<string, unknown> = {}) {
        return mount(TalosMobileToolConsentSheet, {
            props: {
                title: 'Guida lo schermo',
                description: 'TALOS tocca lo schermo al posto tuo.',
                input: { obiettivo: 'Apri WhatsApp, trova la chat con un contatto' },
                actions: ['write', 'outbound'] as const,
                sessionTitle: 'Nuova chat',
                pendingCount: 1,
                allowPersistent: false,
                ...over,
            },
            global: { stubs: { Teleport: true } },
        })
    }

    it('⭐ senza «sempre» la scheda ne dice la RAGIONE, non tace', () => {
        const wrapper = scheda()

        expect(wrapper.find('[data-testid="talos-tool-consent-always"]').exists()).toBe(false)
        const riga = wrapper.get('[data-testid="talos-tool-consent-no-always"]').text()
        // La ragione, non «non disponibile»: è l'unica cosa che distingue una
        // decisione da una funzione mancante.
        expect(riga.toLowerCase()).toContain('undone')
    })

    it('⛔ e col «sempre» disponibile quella riga NON compare', () => {
        // Il verso contrario: una spiegazione stampata sempre sarebbe rumore, e
        // passerebbe la metà «lo dice» pur essendo un difetto nuovo.
        const wrapper = scheda({ allowPersistent: true })

        expect(wrapper.find('[data-testid="talos-tool-consent-always"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-tool-consent-no-always"]').exists()).toBe(false)
    })

    it('⭐ gli argomenti PIATTI si leggono a righe, senza graffe né virgolette', () => {
        const wrapper = scheda()
        const testo = wrapper.get('[data-testid="talos-tool-consent-arguments"]').text()

        expect(testo).toContain('Apri WhatsApp, trova la chat con un contatto')
        expect(testo).not.toContain('{')
        expect(testo).not.toContain('"')
        // E il riquadro JSON non c'è più affatto per questa forma.
        expect(wrapper.find('[data-testid="talos-tool-consent-input"]').exists()).toBe(false)
    })

    /**
     * ⛔⛔ Owner 2026-08-27 — il comportamento QUI SOTTO è cambiato apposta,
     * non è una regressione: prima un SOLO campo annidato faceva cadere
     * l'INTERA scheda sul JSON grezzo (anche se altri campi erano titolo e
     * descrizione perfettamente leggibili — trovato progettando `bulk-tasks`
     * e un tool che ne crea altri). Ora il fallback è per RIGA: i campi
     * piatti restano righe leggibili, e solo il campo davvero strutturato
     * porta JSON — dentro la SUA riga, con l'etichetta accanto, non al posto
     * dell'intera scheda.
     */
    it('⭐ un campo ANNIDATO diventa una riga con JSON dentro, non fa sparire le righe piatte accanto', () => {
        const wrapper = scheda({ input: { titolo: 'Un piano', piano: { passi: ['apri', 'scrivi'] } } })
        const testo = wrapper.get('[data-testid="talos-tool-consent-arguments"]').text()

        expect(testo).toContain('Un piano')
        expect(testo).toContain('passi')
        // Ancora nessun riquadro-scheda-intera: la struttura vive nella riga.
        expect(wrapper.find('[data-testid="talos-tool-consent-input"]').exists()).toBe(false)
    })

    it('⭐ un array di valori semplici si legge unito da virgole, non "[object Object]" né JSON', () => {
        const wrapper = scheda({ input: { titoli: ['Comprare il latte', 'Pagare la bolletta'] } })
        const testo = wrapper.get('[data-testid="talos-tool-consent-arguments"]').text()

        expect(testo).toContain('Comprare il latte, Pagare la bolletta')
        expect(testo).not.toContain('[object Object]')
        expect(testo).not.toContain('[')
    })

    it('⛔ e senza argomenti non compare NESSUNO dei due riquadri', () => {
        const wrapper = scheda({ input: {} })

        expect(wrapper.find('[data-testid="talos-tool-consent-arguments"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-tool-consent-input"]').exists()).toBe(false)
    })
})
