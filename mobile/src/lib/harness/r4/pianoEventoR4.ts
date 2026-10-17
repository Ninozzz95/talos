/**
 * ⛔ K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`): la lettura dell'evento `talos.plan.v1`, trascrizione di `parsePlanEvent` del
 * desktop r4 @ 701c6c0d2 (`components/plan-artifact.js:20`). Modulo a parte e senza dizionari: lo usa l'adattatore degli eventi
 * (`eventiR4.ts`), e `pianoR4.ts` lo riesporta.
 */
import type { DecisionePianoFattaR4, DecisionePianoR4, PropostaPianoR4 } from './pianoChiave'

const IMPRONTA = /^sha256:[0-9a-f]{64}$/u
const MOTIVI_CHIUSURA = ['fermato', 'reindirizzamento', 'nuovo-messaggio', 'interrotta']
const APPROVATE: DecisionePianoR4[] = ['procedi-con-conferma', 'procedi-accetta-modifiche', 'conversazione-pulita']

/** `parsePlanEvent` (`plan-artifact.js:20`): il valore di `talos.plan.v1` di QUESTA sessione, o `null`. */
export function leggiEventoPianoR4(value: unknown, sessionId: string | null | undefined): PropostaPianoR4 | DecisionePianoFattaR4 | null {
    const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
    if (v.schema !== 'talos.plan.v1' || v.sessionId !== sessionId
        || typeof v.planId !== 'string' || !v.planId || v.planId.length > 256
        || !Number.isSafeInteger(v.revision) || (v.revision as number) < 1
        || typeof v.at !== 'string' || !Number.isFinite(Date.parse(v.at))) return null
    const planId = v.planId
    const revision = v.revision as number
    const at = v.at
    const richiesta = typeof v.requestId === 'string' && v.requestId.length > 0 && v.requestId.length <= 256
        && typeof v.hash === 'string' && IMPRONTA.test(v.hash)
    if (v.status === 'proposed' && typeof v.content === 'string' && v.content.trim() && v.content.length <= 100_000) {
        // solo il piano presentato con l'attrezzo è approvabile: ha la sua richiesta e la sua impronta
        return { planId, revision, status: 'proposed', text: v.content, at, ...(richiesta ? { requestId: v.requestId as string, hash: v.hash as string } : {}) }
    }
    if (v.status === 'unavailable' && v.content === null && v.reason === 'PLAN_CONTENT_TOO_LARGE') {
        return { planId, revision, status: 'unavailable', text: null, at }
    }
    if (!richiesta) return null
    const requestId = v.requestId as string
    const hash = v.hash as string
    if (v.status === 'approved' && APPROVATE.includes(v.decisione as DecisionePianoR4)) {
        return { planId, revision, status: 'approved', decisione: v.decisione as DecisionePianoR4, requestId, hash, at, da: v.da === 'sistema' ? 'sistema' : 'persona',
            ...(v.decisione === 'conversazione-pulita' && typeof v.nuovaSessionId === 'string' && v.nuovaSessionId ? { nuovaSessionId: v.nuovaSessionId } : {}) }
    }
    if (v.status === 'changes-requested' && v.decisione === 'continua-a-pianificare') {
        return { planId, revision, status: 'changes-requested', decisione: 'continua-a-pianificare', requestId, hash, at, da: 'persona',
            ...(typeof v.feedback === 'string' && v.feedback.trim() ? { feedback: v.feedback.slice(0, 4_000) } : {}) }
    }
    if (v.status === 'cancelled') {
        return { planId, revision, status: 'cancelled', requestId, hash, at, da: v.da === 'sistema' ? 'sistema' : 'persona',
            motivo: MOTIVI_CHIUSURA.includes(v.motivo as string) ? v.motivo as string : null }
    }
    return null
}
