import { describe, expect, it } from 'vitest'
import {
    talosResearchCompletionOf,
    talosResearchMayFinish,
    talosResearchPermissionRefusal,
    talosResearchReportHolds,
} from '@/lib/research/researchCompletion'
import { talosResearchReportDocument } from '@/lib/research/researchReport'
import type { TalosResearchVerifiedClaim } from '@/lib/research/researchVerification'
import type { TalosResearchSource } from '@/lib/research/researchCollector'

/**
 * MB-1 · C20 — «Conclusa» solo con un artefatto che si rilegge.
 *
 * ⛔ La fixture che conta e' la prima: e' la scusa VERBATIM del modello copiata
 * dal disegno dell'owner (§2.1), cioe' il rapporto da 290 byte che sul desktop
 * ha fatto dichiarare `done` a una ricerca che non aveva prodotto niente. Se un
 * giorno questo test diventa verde con `con-rapporto`, il difetto e' tornato.
 */
const SCUSA_VERBATIM = 'La sessione è in sola lettura, quindi non posso creare documenti direttamente. '
    + 'Tuttavia, posso darti il contenuto completo in un formato pronto per essere salvato, o posso provare a '
    + 'scriverlo in un file del workspace. Vuoi che cerchi il modo per salvarlo in un file markdown nel workspace?'

const FONTI: readonly TalosResearchSource[] = [{
    url: 'https://example.org/a',
    title: 'La pagina',
    publishedAt: '2026-09-01',
    text: 'Il tetto per pagina è di 15.000 caratteri.',
    obtained: 'page',
}]

function affermazione(): TalosResearchVerifiedClaim {
    return {
        claim: { text: 'Il tetto per pagina è di 15.000 caratteri.', sourceIndex: 1, quote: 'tetto per pagina', quotePresent: 'yes' },
        passage: 'Il tetto per pagina è di 15.000 caratteri.',
        checks: { quoteFound: 'yes', claimSupported: 'yes', supportReason: null, judge: 'giudice-locale' },
    }
}

/** Un rapporto VERO, scritto dalla stessa funzione che scrive quelli veri. */
function rapportoVero(): string {
    return talosResearchReportDocument({
        question: 'Quanto testo si tiene per pagina?',
        summary: 'Quindicimila caratteri, testa e coda.',
        judge: 'giudice-locale',
        claims: [affermazione()],
        sources: FONTI,
    })
}

describe('talosResearchPermissionRefusal', () => {
    it('riconosce il permesso NOMINATO da solo', () => {
        expect(talosResearchPermissionRefusal('EACCES: permission denied, open /tmp/report.md')).toBe(true)
        expect(talosResearchPermissionRefusal('Il volume è in sola lettura.')).toBe(true)
    })

    it('riconosce impotenza + atto di scrivere, ma non l’impotenza da sola', () => {
        expect(talosResearchPermissionRefusal('Non posso creare il documento.')).toBe(true)
        // ⛔ Al contrario: «non posso» senza niente da scrivere non e' un
        // permesso negato. Se questa passasse, ogni frase prudente del modello
        // diventerebbe una diagnosi di permessi.
        expect(talosResearchPermissionRefusal('Non posso dire con certezza chi abbia vinto.')).toBe(false)
    })

    it('su niente non inventa niente', () => {
        expect(talosResearchPermissionRefusal(null)).toBe(false)
        expect(talosResearchPermissionRefusal('')).toBe(false)
    })
})

describe('talosResearchReportHolds', () => {
    it('regge quando il record si rilegge con almeno un’affermazione e una fonte', () => {
        expect(talosResearchReportHolds(rapportoVero())).toBe(true)
    })

    it('non regge con zero affermazioni, nemmeno se il record è valido', () => {
        const vuoto = talosResearchReportDocument({
            question: 'Domanda',
            summary: 'Niente da dire.',
            judge: null,
            claims: [],
            sources: FONTI,
        })
        expect(talosResearchReportHolds(vuoto)).toBe(false)
    })

    it('non regge con zero fonti', () => {
        const senzaFonti = talosResearchReportDocument({
            question: 'Domanda',
            summary: 'Riassunto.',
            judge: null,
            claims: [affermazione()],
            sources: [],
        })
        expect(talosResearchReportHolds(senzaFonti)).toBe(false)
    })

    it('non regge su prosa senza record recintato', () => {
        expect(talosResearchReportHolds('# Un titolo\n\nDel testo, e basta.')).toBe(false)
        expect(talosResearchReportHolds(null)).toBe(false)
    })
})

describe('talosResearchCompletionOf', () => {
    it('AL DRITTO: un rapporto vero conclude', () => {
        expect(talosResearchCompletionOf({ reportRef: 'vault-1', report: rapportoVero() })).toBe('con-rapporto')
        expect(talosResearchMayFinish({ reportRef: 'vault-1', report: rapportoVero() })).toBe(true)
    })

    it('AL CONTRARIO: la scusa verbatim del disegno è «bloccata-dal-permesso», mai «done»', () => {
        const esito = talosResearchCompletionOf({ reportRef: 'vault-1', report: SCUSA_VERBATIM })
        expect(esito).toBe('bloccata-dal-permesso')
        expect(esito).not.toBe('con-rapporto')
        expect(talosResearchMayFinish({ reportRef: 'vault-1', report: SCUSA_VERBATIM })).toBe(false)
    })

    it('vede il permesso negato anche quando è solo negli errori dei passi', () => {
        expect(talosResearchCompletionOf({
            reportRef: 'vault-1',
            report: 'Rapporto tronc',
            evidence: ['EACCES: permission denied'],
        })).toBe('bloccata-dal-permesso')
    })

    it('nessun rapporto mai scritto ⇒ giri-esauriti', () => {
        expect(talosResearchCompletionOf({ reportRef: null, report: null })).toBe('giri-esauriti')
    })

    it('un rapporto che c’è e non si rilegge ⇒ senza-rapporto', () => {
        expect(talosResearchCompletionOf({
            reportRef: 'vault-1',
            report: '# Titolo\n\n```talos-research-report\n{"version":1,"claims":[',
        })).toBe('senza-rapporto')
    })

    it('un rapporto valido VINCE su una prosa che nomina i permessi', () => {
        // ⛔ Il verso contrario del riconoscimento: una ricerca SU i permessi di
        // Android produce un rapporto pieno di «permission denied» ed è
        // conclusa. Il record vince sul testo, sempre.
        const suiPermessi = talosResearchReportDocument({
            question: 'Che cosa risponde Android a un accesso negato?',
            summary: 'Risponde EACCES: permission denied, in sola lettura.',
            judge: 'giudice-locale',
            claims: [affermazione()],
            sources: FONTI,
        })
        expect(talosResearchCompletionOf({ reportRef: 'vault-1', report: suiPermessi })).toBe('con-rapporto')
    })
})
