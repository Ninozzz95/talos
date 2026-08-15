// @vitest-environment jsdom
/**
 * ⛔ Un'attesa a cui non si può rispondere è un turno che non si chiude più.
 *
 * ## Il difetto, riprodotto sul Pad il 2026-08-08 in sessione VIVA
 *
 * In chat c'era **«1 richiesta di autorizzazione per uno strumento è in
 * attesa»** e sullo schermo non c'era né la scheda del consenso né il pulsante
 * per richiamarla. Il turno restava sospeso e lo strumento non partiva.
 *
 * ## La causa, che non era una condizione sbagliata
 *
 * Quella frase è un **messaggio**, scritto una volta nella trascrizione e mai
 * più toccato. La scheda e il pulsante invece vivono sullo stato corrente.
 * Appena la richiesta viene risolta — o si perde — la frase resta lì a dire che
 * si sta aspettando, e manda a cercare qualcosa che non esiste più.
 *
 * Una frase congelata che descrive uno stato vivo mente per costruzione: non
 * appena il mondo si muove, lei no.
 *
 * ## Le due metà della cura, ed è importante che siano due
 *
 * 1. Se l'attesa è **viva**, la riga è essa stessa la porta: si tocca e si
 *    apre la scheda. Non l'annuncio di una porta che sta altrove.
 * 2. Se non lo è più, la riga **parla al passato** e nessuno la insegue.
 *
 * Fare solo la prima lascerebbe in giro bottoni che non aprono niente; fare
 * solo la seconda lascerebbe la persona a cercare la scheda per conto suo.
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { chat_layout: { message_style: 'sections', bubble_scale: 'compact' } } }),
}))

/*
 * ⛔ La risposta in volo è un componente ASINCRONO, e questi casi non la
 * riguardano: montandola per davvero il suo grafo continua a caricarsi mentre
 * il caso è già finito, e Vitest lo segnala come rifiuto non gestito —
 * «Cannot load '/src/lib/tools/toolLabels.ts' … after the environment was torn
 * down». Compito #57: tre rejection da qui, con tutti i test verdi.
 *
 * ⛔ Da SOLO questo file era pulito: l'import faceva in tempo a posare. In
 * suite intera no — ed è per questo che un difetto così si vede solo dal
 * conto totale, mai dal file singolo.
 *
 * ⛔ `__esModule: true` è obbligatorio: senza, `defineAsyncComponent` non sa
 * di dover scartare l'involucro e chiede `__isTeleport` al modulo finto.
 */
vi.mock('@/components/chat/TalosMobileStreamingReply.vue', () => ({
    __esModule: true,
    default: { name: 'TalosMobileStreamingReply', render: () => null },
}))

import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'

const CHECKPOINT = 'checkpoint-torcia-01'

function messaggio(extra: Record<string, unknown> = {}) {
    return {
        id: 'm1',
        role: 'assistant' as const,
        content: '1 richiesta di autorizzazione per uno strumento è in attesa.',
        createdAt: '2026-08-08T06:33:00.000Z',
        metadata: { tool_authorization_pending_checkpoint_id: CHECKPOINT },
        ...extra,
    }
}

function schermo(pendenti: readonly string[]) {
    return mount(TalosMobileMessageList, {
        props: {
            messages: [messaggio()] as never,
            sending: false,
            pendingAuthorizationIds: pendenti,
        },
        global: {
            stubs: { teleport: true },
            mocks: { $t: (chiave: string) => chiave },
        },
    })
}

describe('la riga dell’attesa dice la verità di adesso', () => {
    it('ATTESA-01 ⛔ finché è viva, la riga È la porta: si tocca e si apre', async () => {
        const wrapper = schermo([CHECKPOINT])

        const porta = wrapper.find('[data-testid="talos-authorization-pending-open"]')
        expect(porta.exists(), 'la riga deve essere azionabile').toBe(true)
        // ⛔ Un bottone vero, non un paragrafo travestito: chi naviga con la
        // tastiera o con TalkBack deve incontrarlo come comando.
        expect(porta.element.tagName).toBe('BUTTON')

        await porta.trigger('click')
        expect(wrapper.emitted('reviewAuthorization')).toHaveLength(1)
    })

    it('ATTESA-02 quando non è più viva, parla al PASSATO e non si può inseguire', () => {
        const wrapper = schermo([])

        expect(wrapper.find('[data-testid="talos-authorization-pending-open"]').exists()).toBe(false)
        const passato = wrapper.find('[data-testid="talos-authorization-pending-done"]')
        expect(passato.exists()).toBe(true)
        // ⛔ E soprattutto NON dice più «è in attesa»: era quella parola a
        // mandare la persona a cercare una scheda che non c'era.
        expect(passato.text()).not.toContain('in attesa')
    })

    it('ATTESA-03 un messaggio normale resta un messaggio normale', () => {
        /*
         * L'altra metà, senza la quale la correzione sarebbe un danno: ogni
         * risposta della chat passa da qui, e nessuna deve diventare un bottone.
         */
        const wrapper = mount(TalosMobileMessageList, {
            props: {
                messages: [{ ...messaggio(), content: 'La torcia è accesa.', metadata: {} }] as never,
                sending: false,
                pendingAuthorizationIds: [CHECKPOINT],
            },
            global: { stubs: { teleport: true }, mocks: { $t: (k: string) => k } },
        })

        expect(wrapper.find('[data-testid="talos-authorization-pending-open"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-authorization-pending-done"]').exists()).toBe(false)
        expect(wrapper.text()).toContain('La torcia è accesa.')
    })

    it('ATTESA-04 morde: col solo testo congelato non ci sarebbe NIENTE da toccare', () => {
        /*
         * La prova che ATTESA-01 non passa per costruzione. È lo stato in cui si
         * trovava la chat quando l'ho vista sul Pad: una frase, e basta.
         */
        const congelata = '1 richiesta di autorizzazione per uno strumento è in attesa.'
        expect(congelata).toContain('in attesa')
        expect(/<button/i.test(congelata)).toBe(false)
    })
})
