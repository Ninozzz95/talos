import { describe, expect, it } from 'vitest'
import {
    talosBuildPlan,
    talosPlanReplacesConsent,
    type TalosPlanCandidate,
} from '@/lib/tools/plan'
import type { TalosToolSecurity } from '@/lib/tools/security'

/**
 * B5 — un piano approvato SOSTITUISCE la scheda del singolo passo.
 *
 * E' il punto in cui il piano guadagna davvero. Senza, la persona vedrebbe il
 * piano E POI le quattro conferme: una in piu' invece di quattro in meno, e
 * tutto il macroblocco B diventerebbe rumore aggiunto.
 *
 * ⛔ Ma l'approvazione di un piano non compra cio' che nemmeno «consenti
 * sempre» compra. Questi test fissano i DUE pavimenti, perche' sono la
 * differenza fra una comodita' e un buco.
 */

function sicurezza(patch: Partial<TalosToolSecurity> = {}): TalosToolSecurity {
    return {
        risk: 'R2',
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
        tool: 'web_search',
        title: 'Cerca sul web',
        input: { q: 'x' },
        digest: 'impronta-x',
        security: sicurezza(),
        actions: ['outbound'],
        allowed: true,
        asks: true,
        critical: false,
        ...patch,
    }
}

const PULITA = { privateDataSeen: false, untrustedSeen: false }

describe('il piano al posto della scheda', () => {
    const approvato = () => ({
        ...talosBuildPlan('x', [passo(), passo({ id: 'p2', tool: 'library_read', digest: 'imp-2' })]),
        state: 'approved' as const,
    })

    it('un passo del piano non chiede piu: e il guadagno', () => {
        expect(talosPlanReplacesConsent(approvato(), { tool: 'web_search', digest: 'impronta-x' }, PULITA)).toBe(true)
    })

    it('⛔ PAVIMENTO 1 — la trifecta chiusa chiede COMUNQUE', () => {
        // Non e' una domanda sul singolo tool: e' su cosa e' successo prima nel
        // discorso, e il piano e' stato letto PRIMA che succedesse.
        expect(talosPlanReplacesConsent(approvato(), {
            tool: 'web_search', digest: 'impronta-x', reason: 'trifecta',
        }, PULITA)).toBe(false)
    })

    it('⛔ PAVIMENTO 2 — R4 chiede COMUNQUE', () => {
        // Le azioni che non si ritirano non entrano nemmeno nel piano; questo e'
        // il secondo controllo, nel caso ci si arrivi per via della catena.
        expect(talosPlanReplacesConsent(approvato(), {
            tool: 'web_search', digest: 'impronta-x', risk: 'R4',
        }, PULITA)).toBe(false)
    })

    it('argomenti diversi: chiede, perche l approvazione era su QUELLA cosa', () => {
        expect(talosPlanReplacesConsent(approvato(), {
            tool: 'web_search', digest: 'un-altra-impronta',
        }, PULITA)).toBe(false)
    })

    it('un tool fuori dal piano chiede: e la deviazione', () => {
        expect(talosPlanReplacesConsent(approvato(), { tool: 'notes_delete', digest: 'qualunque' }, PULITA))
            .toBe(false)
    })

    it('un piano solo PROPOSTO non salta niente', () => {
        // Finche' non e' approvato, non ha comprato nulla.
        const proposto = talosBuildPlan('x', [passo()])
        expect(talosPlanReplacesConsent(proposto, { tool: 'web_search', digest: 'impronta-x' }, PULITA)).toBe(false)
    })

    it('e su portata CONVERSAZIONE, la contaminazione riporta la scheda', () => {
        const perConversazione = {
            ...talosBuildPlan('x', [passo()], { privateDataSeen: false, untrustedSeen: false }, 'conversation'),
            state: 'approved' as const,
        }
        expect(talosPlanReplacesConsent(
            perConversazione,
            { tool: 'web_search', digest: 'impronta-x' },
            { privateDataSeen: true, untrustedSeen: true },
        )).toBe(false)
    })
})
