/**
 * ⛔ K3-AP3 (ledger `LEDGER-K3-FIGLIE-2026-10-16.md`; owner 16/10 «Carta nella conversazione principale»): le richieste delle
 * sotto-sessioni viste dalla madre, come il desktop @ `2161afb32` (`legacy/app.js:11286-11420`); dal pin `701c6c0d2` chi chiede si
 * chiama col nome unico dell'agente (L3-17, `nomeDellAgenteR4`).
 *   · la madre non si abbona al flusso della figlia: lo snapshot `talos.agenti` dice «in attesa» o «risolta» col `requestId`
 *     (`operazioneAgenteDaEvento`, `session-registry.mjs:3516-3548`), e la domanda vera si legge da `/:figlia/pending`;
 *   · alla ripresa (gli snapshot sono effimeri) le discendenti che aspettano ancora si trovano nell'elenco delle sessioni
 *     (`padreId`, `inAttesaApprovazione`, `inAttesaDomanda`), come `riprendiCarteDelleFiglie`.
 * Misurato sul Pad il 16/10 (`tests/fixtures/r4/figlie-701c6c0d2.json`).
 */
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import { nomeDellAgenteR4, voceAgenteR4 } from './agentiR4'
import { TALOS_METADATA_APPROVAZIONE, type FigliaR4, type VoceApprovazioneR4 } from './approvazioneChiave'
import { TALOS_METADATA_DOMANDA, type DomandaUtenteR4, type VoceDomandaR4 } from './domandaChiave'

export interface OperazioneFigliaR4 {
    kind: 'approval' | 'question'
    status: 'waiting' | 'resolved'
    requestId: string | null
    approvato?: boolean
    ambito?: string
    esito?: string
}
export interface RichiestaDellaFigliaR4 { childId: string; chi: string | null; operazione: OperazioneFigliaR4 }

/** Chi chiede, sulla carta di una figlia: `nomeDellAgente(agente) || null`, come `legacy/app.js:11367/11373` @ 701c6c0d2 (L3-17). */
export function chiDellAgenteR4(agente: unknown): string | null {
    return nomeDellAgenteR4(agente) || null
}

/** Lo snapshot di una figlia (o nipote) di `radice` che chiede alla persona o ha avuto risposta; `null` per ogni altro evento. */
export function richiestaDellaFigliaR4(evento: Record<string, unknown>, radice: string | null): RichiestaDellaFigliaR4 | null {
    const voce = voceAgenteR4(evento as Record<string, any>)
    if (!voce || !radice || voce.radice !== radice) return null
    const op = (evento.value as Record<string, unknown>)?.operation as Record<string, unknown> | undefined
    if ((op?.kind !== 'approval' && op?.kind !== 'question') || (op.status !== 'waiting' && op.status !== 'resolved')) return null
    const operazione: OperazioneFigliaR4 = { kind: op.kind, status: op.status, requestId: typeof op.requestId === 'string' ? op.requestId : null }
    if (op.kind === 'approval' && op.status === 'resolved') {
        operazione.approvato = op.approvato === true
        if (typeof op.ambito === 'string') operazione.ambito = op.ambito
    }
    if (op.kind === 'question' && op.status === 'resolved' && typeof op.esito === 'string') operazione.esito = op.esito
    return { childId: (evento.value as Record<string, string>).childId, chi: chiDellAgenteR4(voce.agente), operazione }
}

/** La voce della carta da `GET /:figlia/pending` (`leggiDomandaDellaFiglia`): un permesso o una domanda, o niente da disegnare. */
export function voceDellaFigliaR4(pendente: unknown, figlia: { sessionId: string; chi: string | null }):
    { tipo: 'approvazione'; voce: VoceApprovazioneR4 } | { tipo: 'domanda'; voce: VoceDomandaR4 } | null {
    const p = pendente && typeof pendente === 'object' ? pendente as Record<string, unknown> : null
    if (!p || typeof p.requestId !== 'string' || !p.requestId) return null
    if (p.tipo === 'approvazione') {
        if (!p.azione || typeof p.azione !== 'object' || Array.isArray(p.azione)) return null
        const politica = p.politica && typeof p.politica === 'object' ? p.politica as FigliaR4['politica'] : null
        return { tipo: 'approvazione', voce: { requestId: p.requestId, azione: p.azione as Record<string, unknown>, esito: null, figlia: { ...figlia, politica } } }
    }
    if (p.tipo === 'domanda') {
        const domande = Array.isArray(p.questions) ? p.questions : []
        if (!domande.length || !domande.every((d) => d && typeof d === 'object' && typeof (d as Record<string, unknown>).question === 'string')) return null
        const at = typeof p.at === 'string' ? p.at : null
        return { tipo: 'domanda', voce: { requestId: p.requestId, questions: domande as DomandaUtenteR4[], at, origine: null, esito: null, figlia: { ...figlia } } }
    }
    return null
}

/** Le discendenti di `radice` che aspettano la persona, dall'elenco delle sessioni (con le nipoti), nell'ordine dell'elenco. */
export function discendentiInAttesaR4(sessioni: unknown, radice: string): { sessionId: string; padreId: string }[] {
    const voci = (Array.isArray(sessioni) ? sessioni : []).filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object'
        && typeof (s as Record<string, unknown>).sessionId === 'string')
    const padreDi = new Map(voci.map((s) => [s.sessionId as string, typeof s.padreId === 'string' ? s.padreId : null]))
    const discende = (id: string) => {
        const visti = new Set<string>()
        for (let p = padreDi.get(id) ?? null; p && !visti.has(p); p = padreDi.get(p) ?? null) {
            if (p === radice) return true
            visti.add(p)
        }
        return false
    }
    return voci.filter((s) => (s.inAttesaApprovazione === true || s.inAttesaDomanda === true) && s.sessionId !== radice && discende(s.sessionId as string))
        .map((s) => ({ sessionId: s.sessionId as string, padreId: s.padreId as string }))
}

/** Una carta di una figlia nella conversazione della madre, ancorata al messaggio che era l'ultimo quando è arrivata. */
export interface CartaDellaFigliaR4 { messaggio: TalosMobileMessageView; ancora: string | null }

/** Il messaggio di sistema della carta: la stessa riga delle carte di AP1/AP2 (approvazione o domanda), con la voce della figlia. */
export function messaggioDellaFigliaR4(v: NonNullable<ReturnType<typeof voceDellaFigliaR4>>): TalosMobileMessageView {
    return {
        id: `figlia:${v.voce.requestId}`, role: 'system', content: '', created_at: '', state: 'persisted', model_profile_id: null, run_id: null,
        metadata: { origine: 'r4', [v.tipo === 'approvazione' ? TALOS_METADATA_APPROVAZIONE : TALOS_METADATA_DOMANDA]: v.voce }, reasoning: null,
    }
}

/** I messaggi della madre con le carte delle figlie dopo la loro àncora (in fondo se l'àncora non c'è più, in testa se era vuota). */
export function conCarteDelleFiglieR4(messaggi: TalosMobileMessageView[], carte: CartaDellaFigliaR4[]): TalosMobileMessageView[] {
    if (!carte.length) return messaggi
    const ids = new Set(messaggi.map((m) => m.id))
    const testa = carte.filter((c) => c.ancora === null).map((c) => c.messaggio)
    const coda = carte.filter((c) => c.ancora !== null && !ids.has(c.ancora)).map((c) => c.messaggio)
    const dopo = new Map<string, TalosMobileMessageView[]>()
    for (const c of carte) if (c.ancora !== null && ids.has(c.ancora)) dopo.set(c.ancora, [...(dopo.get(c.ancora) ?? []), c.messaggio])
    return [...testa, ...messaggi.flatMap((m) => [m, ...(dopo.get(m.id) ?? [])]), ...coda]
}
