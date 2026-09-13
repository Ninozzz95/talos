import { describe, expect, it } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createTalosResearchRuntime } from '@/services/researchRuntime'
import { talosResearchCardOf, talosResearchNeedsAttention, talosResearchReportRefOf } from '@/lib/research/researchCard'
import { talosResearchCompletionOf } from '@/lib/research/researchCompletion'
import { talosResearchReportDocument } from '@/lib/research/researchReport'
import { talosResearchReplay, talosResearchSpent, type TalosResearchEvent } from '@/lib/research/researchRun'
import type { TalosRunKeeper } from '@/services/longRunKeeper'
import type { TalosResearchSource } from '@/lib/research/researchCollector'
import type { TalosResearchVerifiedClaim } from '@/lib/research/researchVerification'

/**
 * MB-1 · C20, dal motore fino alla scheda.
 *
 * Il cancello e la scheda si provano insieme perche' sono due meta' di una
 * frase sola: il motore trattiene «conclusa», e la scheda deve dire in che modo
 * non ha concluso. Provarne una senza l'altra lascia passare il caso in cui il
 * motore fa la cosa giusta e a schermo non cambia niente.
 */

const SCUSA_VERBATIM = 'La sessione è in sola lettura, quindi non posso creare documenti direttamente. '
    + 'Tuttavia, posso darti il contenuto completo in un formato pronto per essere salvato.'

const FONTI: readonly TalosResearchSource[] = [{
    url: 'https://example.org/a',
    title: 'La pagina',
    publishedAt: '2026-09-01',
    text: 'Il tetto per pagina è di 15.000 caratteri.',
    obtained: 'page',
}]

const AFFERMAZIONE: TalosResearchVerifiedClaim = {
    claim: { text: 'Il tetto per pagina è di 15.000 caratteri.', sourceIndex: 1, quote: 'tetto', quotePresent: 'yes' },
    passage: 'Il tetto per pagina è di 15.000 caratteri.',
    checks: { quoteFound: 'yes', claimSupported: 'yes', supportReason: null, judge: 'giudice-locale' },
}

const RAPPORTO_VERO = talosResearchReportDocument({
    question: 'Quanto testo si tiene per pagina?',
    summary: 'Quindicimila caratteri.',
    judge: 'giudice-locale',
    claims: [AFFERMAZIONE],
    sources: FONTI,
})

const BRANCHES = [{ id: 'b1', question: 'prezzi', estimate: { tokens: 10, searches: 1, pages: 1 } }]
const SPESA_SINTESI = { tokens: 4_200, searches: 0, pages: 0 }

function keeper(): TalosRunKeeper {
    return { engage: () => undefined, describe: () => undefined, release: () => undefined }
}

async function corsa(documento: string) {
    const repository = createMemoryChatRepository()
    let tick = 0
    const runtime = createTalosResearchRuntime({
        repository,
        keeper,
        now: () => new Date(Date.UTC(2026, 8, 12, 11, 0, tick++)).toISOString(),
        perform: async () => ({ spend: { tokens: 10, searches: 1, pages: 1 }, resultRef: 'vault:b1' }),
        synthesise: async () => ({ spend: SPESA_SINTESI, resultRef: 'vault:rapporto' }),
        readReport: async () => documento,
    })
    const run = await runtime.start({ id: 'run-1', sessionId: 's', question: 'q', depth: 'quick', branches: BRANCHES })
    return { run, repository }
}

describe('il cancello della consegna, nel motore', () => {
    it('AL DRITTO: un rapporto vero si guadagna «conclusa»', async () => {
        const { run } = await corsa(RAPPORTO_VERO)
        expect(run.status).toBe('done')

        const scheda = talosResearchCardOf(run, {
            isRunning: false,
            completion: talosResearchCompletionOf({
                reportRef: talosResearchReportRefOf(run),
                report: RAPPORTO_VERO,
            }),
        })
        expect(scheda.bucket).toBe('done')
    })

    it('AL CONTRARIO: con la scusa del modello NON scrive «conclusa»', async () => {
        const { run } = await corsa(SCUSA_VERBATIM)
        expect(run.status).not.toBe('done')

        const scheda = talosResearchCardOf(run, {
            isRunning: false,
            completion: talosResearchCompletionOf({
                reportRef: talosResearchReportRefOf(run),
                report: SCUSA_VERBATIM,
            }),
        })
        expect(scheda.bucket).toBe('bloccata-dal-permesso')
        expect(talosResearchNeedsAttention(scheda)).toBe(true)
    })

    it('⛔ e il giro di sintesi già pagato resta scritto per intero', async () => {
        // Ciò che è costato denaro non si cancella per far tornare uno stato:
        // il passo resta `done`, col suo `spend` e il suo `resultRef`.
        const { run } = await corsa(SCUSA_VERBATIM)
        const sintesi = run.steps.find((step) => step.kind === 'synthesise')!
        expect(sintesi.state).toBe('done')
        expect(sintesi.resultRef).toBe('vault:rapporto')
        expect(talosResearchSpent(run).tokens).toBe(SPESA_SINTESI.tokens + 10)
    })

    it('un motore senza lettore del rapporto NON blocca: non poter guardare ≠ aver guardato', async () => {
        const repository = createMemoryChatRepository()
        let tick = 0
        const runtime = createTalosResearchRuntime({
            repository,
            keeper,
            now: () => new Date(Date.UTC(2026, 8, 12, 12, 0, tick++)).toISOString(),
            perform: async () => ({ spend: { tokens: 10, searches: 1, pages: 1 }, resultRef: 'vault:b1' }),
            synthesise: async () => ({ spend: SPESA_SINTESI, resultRef: 'vault:rapporto' }),
        })
        const run = await runtime.start({ id: 'run-2', sessionId: 's', question: 'q', depth: 'quick', branches: BRANCHES })
        expect(run.status).toBe('done')
    })
})

/** Una corsa già su disco, conclusa quando il cancello non esisteva ancora. */
function corsaVecchia(): TalosResearchEvent[] {
    return [
        { kind: 'run_started', at: '2026-08-01T08:00:00.000Z', id: 'old-1', sessionId: 's', question: 'q', depth: 'quick', engine: 'device' },
        { kind: 'plan_approved', at: '2026-08-01T08:00:01.000Z', branches: BRANCHES },
        { kind: 'step_started', at: '2026-08-01T08:00:02.000Z', stepId: 'b1:search', branchId: 'b1', stepKind: 'search' },
        { kind: 'step_finished', at: '2026-08-01T08:00:03.000Z', stepId: 'b1:search', spend: { tokens: 10, searches: 1, pages: 1 }, resultRef: 'vault:b1' },
        { kind: 'step_started', at: '2026-08-01T08:00:04.000Z', stepId: 'synthesis', branchId: 'synthesis', stepKind: 'synthesise' },
        { kind: 'step_finished', at: '2026-08-01T08:00:05.000Z', stepId: 'synthesis', spend: SPESA_SINTESI, resultRef: 'vault:rapporto' },
        { kind: 'run_finished', at: '2026-08-01T08:00:06.000Z' },
    ]
}

describe('le ricerche già su disco', () => {
    it('⛔ si mostrano «senza-rapporto» al volo, e il giornale resta «done»', () => {
        const run = talosResearchReplay(corsaVecchia())!
        const rotto = '# Titolo\n\n```talos-research-report\n{"version":1,"clai'

        const scheda = talosResearchCardOf(run, {
            isRunning: false,
            completion: talosResearchCompletionOf({ reportRef: talosResearchReportRefOf(run), report: rotto }),
        })

        expect(scheda.bucket).toBe('senza-rapporto')
        // Il fatto scritto sul disco non è stato toccato: la scheda racconta,
        // non riscrive.
        expect(run.status).toBe('done')
        expect(scheda.status).toBe('done')
    })

    it('la stessa corsa con un rapporto sano resta «conclusa»', () => {
        const run = talosResearchReplay(corsaVecchia())!
        const scheda = talosResearchCardOf(run, {
            isRunning: false,
            completion: talosResearchCompletionOf({ reportRef: talosResearchReportRefOf(run), report: RAPPORTO_VERO }),
        })
        expect(scheda.bucket).toBe('done')
    })

    it('senza verdetto la scheda resta «conclusa»: non ancora guardato ≠ guardato e non regge', () => {
        const run = talosResearchReplay(corsaVecchia())!
        expect(talosResearchCardOf(run, { isRunning: false }).bucket).toBe('done')
        expect(talosResearchCardOf(run, { isRunning: false }).completion).toBeNull()
    })
})

describe('⛔ il verdetto non si applica a una corsa che sta ancora raccogliendo', () => {
    it('una corsa uccisa a metà piano resta «interrotta», non «giri-esauriti»', () => {
        const run = talosResearchReplay([
            { kind: 'run_started', at: '2026-09-12T08:00:00.000Z', id: 'run-3', sessionId: 's', question: 'q', depth: 'quick', engine: 'device' },
            {
                kind: 'plan_approved',
                at: '2026-09-12T08:00:01.000Z',
                branches: [...BRANCHES, { id: 'b2', question: 'recensioni', estimate: { tokens: 10, searches: 1, pages: 1 } }],
            },
            { kind: 'step_started', at: '2026-09-12T08:00:02.000Z', stepId: 'b1:search', branchId: 'b1', stepKind: 'search' },
            { kind: 'step_finished', at: '2026-09-12T08:00:03.000Z', stepId: 'b1:search', spend: { tokens: 10, searches: 1, pages: 1 }, resultRef: 'vault:b1' },
        ])!

        // Non ha un rapporto perché non ci è ancora arrivata: chiamarla «giri
        // esauriti» sarebbe una diagnosi inventata su una corsa sana.
        const scheda = talosResearchCardOf(run, {
            isRunning: false,
            completion: talosResearchCompletionOf({ reportRef: null, report: null }),
        })
        expect(scheda.bucket).toBe('unfinished')
    })

    it('⛔ una corsa ferma su un passo FALLITO resta «interrotta»: la causa è nel passo, non nei giri', () => {
        // Misurato sul Pad il 12/09/2026: raccolta finita, sintesi caduta su
        // «HTTP 401 User not found» di OpenRouter, e la scheda diceva
        // «Riprendi: i giri sono finiti».
        const run = talosResearchReplay([
            { kind: 'run_started', at: '2026-09-12T08:00:00.000Z', id: 'run-4', sessionId: 's', question: 'q', depth: 'quick', engine: 'device' },
            { kind: 'plan_approved', at: '2026-09-12T08:00:01.000Z', branches: BRANCHES },
            { kind: 'step_started', at: '2026-09-12T08:00:02.000Z', stepId: 'b1:search', branchId: 'b1', stepKind: 'search' },
            { kind: 'step_finished', at: '2026-09-12T08:00:03.000Z', stepId: 'b1:search', spend: { tokens: 10, searches: 1, pages: 1 }, resultRef: 'vault:b1' },
            { kind: 'step_started', at: '2026-09-12T08:00:04.000Z', stepId: 'synthesis', branchId: 'synthesis', stepKind: 'synthesise' },
            { kind: 'step_failed', at: '2026-09-12T08:00:05.000Z', stepId: 'synthesis', error: 'User not found.' },
        ])!
        expect(run.steps.some((step) => step.state === 'failed')).toBe(true)

        const scheda = talosResearchCardOf(run, {
            isRunning: false,
            completion: talosResearchCompletionOf({ reportRef: null, report: null }),
        })
        expect(scheda.bucket).toBe('unfinished')
    })
})
