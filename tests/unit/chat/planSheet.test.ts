// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobilePlanSheet from '@/components/chat/TalosMobilePlanSheet.vue'
import { talosBuildPlan, type TalosPlanCandidate } from '@/lib/tools/plan'
import type { TalosToolSecurity } from '@/lib/tools/security'

/**
 * B6 — la scheda del piano.
 *
 * Quello che deve far vedere non e' un gusto: la ricerca sulle schede di
 * approvazione dice che chi approva ha bisogno dell'azione esatta, di su cosa,
 * di quanto e' reversibile, e di cosa succede dicendo di no. Le prime tre in
 * chiaro; la quarta e' la ragione per cui la scheda esiste — **niente e'
 * ancora stato fatto**.
 */

function sicurezza(patch: Partial<TalosToolSecurity> = {}): TalosToolSecurity {
    return {
        risk: 'R1',
        reversibility: 'reversible',
        readsPrivateData: true,
        readsUntrustedContent: false,
        canTransmit: false,
        ...patch,
    }
}

function passo(patch: Partial<TalosPlanCandidate> = {}): TalosPlanCandidate {
    return {
        id: 'p1',
        tool: 'notes_list',
        title: 'Elenca le note',
        input: {},
        digest: 'aaa',
        security: sicurezza(),
        actions: ['read'],
        allowed: true,
        critical: false,
        ...patch,
    }
}

function monta(candidati: TalosPlanCandidate[]) {
    return mount(TalosMobilePlanSheet, {
        props: { plan: talosBuildPlan('piano', candidati), sessionTitle: 'Nuova chat' },
        global: {
            mocks: {
                $t: (chiave: string, valori?: Record<string, unknown>) => (
                    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave
                ),
            },
            stubs: { Teleport: true },
        },
    })
}

describe('la scheda del piano', () => {
    it('elenca ogni passo, nell ordine proposto', () => {
        const wrapper = monta([
            passo({ id: 'a', title: 'Cerca sul web' }),
            passo({ id: 'b', title: 'Scrivi un documento' }),
        ])
        const righe = wrapper.findAll('[data-plan-step]')

        expect(righe).toHaveLength(2)
        expect(righe[0]!.text()).toContain('Cerca sul web')
        expect(righe[1]!.text()).toContain('Scrivi un documento')
    })

    it('dice che dire di no non costa niente — ed e il motivo per cui esiste', () => {
        expect(monta([passo({ id: 'a' })]).text()).toContain('chat.plan.nothingDoneYet')
    })

    it('un passo NEGATO dal permesso si vede, e non si puo togliere', () => {
        const wrapper = monta([passo({ id: 'a' }), passo({ id: 'b', allowed: false })])

        // Si vede: nasconderlo darebbe l'impressione che non fosse stato chiesto.
        expect(wrapper.findAll('[data-plan-step]')).toHaveLength(2)
        expect(wrapper.text()).toContain('chat.plan.deniedByPolicy')
        // E non ha il tasto per toglierlo: non e' una scelta dell'utente.
        expect(wrapper.find('[data-testid="talos-plan-toggle-b"]').exists()).toBe(false)
    })

    it('togliere un passo lo esclude dall approvazione', async () => {
        const wrapper = monta([passo({ id: 'a' }), passo({ id: 'b' })])
        await wrapper.find('[data-testid="talos-plan-toggle-b"]').trigger('click')
        await wrapper.find('[data-testid="talos-plan-approve"]').trigger('click')

        expect(wrapper.emitted('approve')?.[0]?.[0]).toEqual(['a'])
    })

    it('e si puo RIMETTERE: togliere non e definitivo finche non approvi', async () => {
        const wrapper = monta([passo({ id: 'a' }), passo({ id: 'b' })])
        await wrapper.find('[data-testid="talos-plan-toggle-b"]').trigger('click')
        await wrapper.find('[data-testid="talos-plan-toggle-b"]').trigger('click')
        await wrapper.find('[data-testid="talos-plan-approve"]').trigger('click')

        expect(wrapper.emitted('approve')?.[0]?.[0]).toEqual(['a', 'b'])
    })

    it('un passo IRREVERSIBILE viene detto, e contato', () => {
        const wrapper = monta([
            passo({ id: 'a' }),
            passo({ id: 'b', security: sicurezza({ reversibility: 'irreversible' }) }),
        ])
        expect(wrapper.find('[data-testid="talos-plan-irreversible-warning"]').text())
            .toContain('"count":1')
    })

    it('⛔ e il conto SCENDE quando togli proprio quel passo', async () => {
        const wrapper = monta([
            passo({ id: 'a' }),
            passo({ id: 'b', security: sicurezza({ reversibility: 'irreversible' }) }),
        ])
        await wrapper.find('[data-testid="talos-plan-toggle-b"]').trigger('click')

        // Un avviso che non si muove quando togli il pezzo pericoloso e' un
        // numero che nessuno crederà una seconda volta.
        expect(wrapper.find('[data-testid="talos-plan-irreversible-warning"]').exists()).toBe(false)
    })

    it('togliere TUTTO disabilita l approvazione, invece di approvare il nulla', async () => {
        const wrapper = monta([passo({ id: 'a' })])
        await wrapper.find('[data-testid="talos-plan-toggle-a"]').trigger('click')

        expect(wrapper.find('[data-testid="talos-plan-approve"]').attributes('disabled'))
            .toBeDefined()
    })

    it('«non farlo» e «chiudi» sono due cose diverse', async () => {
        const wrapper = monta([passo({ id: 'a' })])
        await wrapper.find('[data-testid="talos-plan-cancel"]').trigger('click')
        await wrapper.find('[data-testid="talos-plan-later"]').trigger('click')

        // Rifiutare chiude la richiesta; chiudere la lascia in attesa.
        expect(wrapper.emitted('cancel')).toHaveLength(1)
        expect(wrapper.emitted('later')).toHaveLength(1)
    })
})
