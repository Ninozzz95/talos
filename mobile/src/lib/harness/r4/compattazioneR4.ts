/*
 * ⭐ Ledger `LEDGER-RIGA-VIVA-CODICE-2026-10-21.md` — la compattazione di r4 nel Codice del telefono: la riga viva del riassunto che il
 * giro aspetta e la riga dell'esito (anche quando il riassunto l'ha fatto TALOS senza il modello). Prima il Codice non disegnava
 * niente (D-MO-12): gli eventi `talos.compattazione*` non avevano un lettore.
 *
 * Le regole e le frasi sono quelle del desktop, che l'owner ha approvato (B1, mockup alla terza versione), in r4 `f87c8f800`:
 * `harness-ui/frontend/src/components/compattazione-legacy.js` (`interpretaEventoCompattazione`, `fineMuta`, `testoRigaCompattazione`,
 * `formattaTokenBreve`) e `context-progress.js` (`descriviRigaViva`, `stimaBreveRigaViva`, `durataBreveRigaViva`). Contratto
 * `CONTRATTO-RIGA-VIVA-E-TETTO-RIASSUNTO-2026-10-21.md` §2-§5 e §8.
 *
 * ⛔ Mai numeri inventati: un campo che il motore non dà resta fuori dalla frase — niente percento senza `letti`/`totale`, niente
 * tempo senza `stimaRestanteSec`. Un campo storto è `null`, mai uno zero. Pura: le parole arrivano da `t`, la lingua da `lingua`.
 */
export type TraduttoreR4 = (chiave: string, valori?: Record<string, string | number>) => string
export type LinguaR4 = string

const EVENTO = 'talos.compattazione'
const EVENTO_PROGRESSO = 'talos.compattazione-progresso'
const EVENTO_ANNULLATA = 'talos.compattazione-annullata'

/** Contratto §3: perché un riassunto è stato fatto SENZA il modello. Un valore fuori elenco resta `null`. */
export const RAGIONI_RIPIEGO_R4 = ['tempo', 'saltato', 'rifiutato', 'stima', 'esaurito'] as const
export type RagioneRipiegoR4 = typeof RAGIONI_RIPIEGO_R4[number]

/** `giro` c'è quando il riassunto è DENTRO un giro (r4 `session-registry.mjs:8833` li distingue così); quello in sottofondo non l'ha. */
export interface InizioCompattazioneR4 { tipo: 'inizio'; motivo: string | null; giro?: number }
export interface FineCompattazioneR4 {
    tipo: 'fine'
    giro?: number
    compattato: boolean
    at: string | null
    tokenPrima: number | null
    tokenDopo: number | null
    /** La compattazione a mano (`motivo:'manuale'`) sostituisce la storia con un checkpoint senza record: non si annulla. */
    annullabile: boolean
    ripiego: boolean
    ragione: RagioneRipiegoR4 | null
    motivo: string | null
    dettaglio: string | null
}
export interface AnnullataCompattazioneR4 { tipo: 'annullata'; at: string }
export interface ProgressoCompattazioneR4 {
    tipo: 'progresso'
    fase: string | null
    motivo: string | null
    origine: string | null
    tentativo: number | null
    tentativi: number | null
    trascorsoMs: number | null
    letti: number | null
    inCache: number | null
    totale: number | null
    stimaRestanteSec: number | null
    tokenScritti: number | null
}
export type CompattazioneR4 = InizioCompattazioneR4 | FineCompattazioneR4 | AnnullataCompattazioneR4 | ProgressoCompattazioneR4
/** Ciò che la riga viva mostra: l'inizio (nessun numero) o l'ultimo passo, che SOSTITUISCE il precedente. */
export type StatoRigaVivaR4 = InizioCompattazioneR4 | Partial<ProgressoCompattazioneR4> & { tipo: 'progresso' }

const intero = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
/** I token di una compattazione: un numero finito e non negativo, arrotondato (il desktop li accetta così; r4 può stimarli). */
const token = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null)
/** Il giro, solo quando c'è: chi legge la forma di sempre non vede un campo in più. */
const conGiro = (v: Record<string, unknown>) => (intero(v.giro) ? { giro: v.giro } : {})
const testo = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const oggetto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)

/** Un evento `CUSTOM` di r4 (`name`, `value`) letto nella forma del desktop; tutto ciò che non è una di queste forme è `null`. */
export function interpretaCompattazioneR4(nome: unknown, valore: unknown): CompattazioneR4 | null {
    const v = oggetto(valore)
    if (nome === EVENTO_ANNULLATA) return v && testo(v.at) ? { tipo: 'annullata', at: v.at as string } : null
    if (!v) return null
    if (nome === EVENTO) {
        if (v.fase === 'inizio') return { tipo: 'inizio', motivo: testo(v.motivo), ...conGiro(v) }
        if (v.fase === 'annullata') return testo(v.at) ? { tipo: 'annullata', at: v.at as string } : null
        if (v.fase !== 'fine') return null
        const compattato = v.compattato === true
        const record = oggetto(v.record)
        let motivo = testo(v.motivo)
        let dettaglio: string | null = null
        // `errore: <testo>` del registro (e `error: <testo>` del riassunto in sottofondo, `session-registry.mjs:5630`) diventa
        // motivo + dettaglio: nessun nome tecnico a schermo
        if (motivo && /^(errore|error):\s*/iu.test(motivo)) {
            dettaglio = motivo.replace(/^(errore|error):\s*/iu, '').trim() || null
            motivo = 'errore'
        }
        const ripiego = compattato && v.ripiego === true
        return {
            tipo: 'fine',
            ...conGiro(v),
            compattato,
            at: compattato ? testo(v.at) ?? testo(record?.at) : null,
            tokenPrima: compattato ? token(v.tokenPrima) : null,
            tokenDopo: compattato ? token(v.tokenDopo) : null,
            annullabile: compattato && v.annullabile !== false,
            ripiego,
            ragione: ripiego && (RAGIONI_RIPIEGO_R4 as readonly unknown[]).includes(v.ragione) ? v.ragione as RagioneRipiegoR4 : null,
            motivo,
            dettaglio,
        }
    }
    if (nome === EVENTO_PROGRESSO) {
        const positivo = (x: unknown) => (intero(x) && x > 0 ? x : null)
        return {
            tipo: 'progresso',
            fase: testo(v.fase),
            motivo: testo(v.motivo),
            origine: testo(v.origine),
            tentativo: positivo(v.tentativo),
            tentativi: positivo(v.tentativi),
            trascorsoMs: intero(v.trascorsoMs) ? v.trascorsoMs : null,
            letti: intero(v.letti) ? v.letti : null,
            inCache: intero(v.inCache) ? v.inCache : null,
            totale: intero(v.totale) ? v.totale : null,
            stimaRestanteSec: intero(v.stimaRestanteSec) ? v.stimaRestanteSec : null,
            // `tokenRiassunto` è il nome che il contatore del kernel dà oggi, `tokenScritti` quello del contratto: vince il secondo
            tokenScritti: intero(v.tokenScritti) ? v.tokenScritti : intero(v.tokenRiassunto) ? v.tokenRiassunto : null,
        }
    }
    return null
}

/**
 * Contratto §8 (21/10/2026): il riassunto di fine giro che CEDE il motore a posto unico al giro che parte. È voluto, non è un
 * fallimento: nessuna riga, la riga viva si chiude e basta (desktop `fineMuta`, CLI `COMPACTION_QUIET`).
 * Desktop 21/10 notte: anche `'motore'`, la fine del riassunto atteso sulla strada del motore del contesto (il suo separatore racconta
 * già com'è andata).
 */
const MOTIVI_MUTI: ReadonlySet<string> = new Set(['ceduta', 'motore'])
export function fineMutaR4(c: CompattazioneR4 | null): boolean {
    return c?.tipo === 'fine' && !c.compattato && c.motivo !== null && MOTIVI_MUTI.has(c.motivo)
}

const formato = (lingua: LinguaR4, opzioni?: Intl.NumberFormatOptions) => new Intl.NumberFormat(lingua === 'it' ? 'it-IT' : 'en-US', opzioni)

/** I secondi rimasti in breve, come il mockup («~1 min», «~40 s»): passi di 5 s, mai «~0 s» e mai «~60 s». */
export function stimaBreveR4(secondi: number | null | undefined, t: TraduttoreR4): string {
    if (!intero(secondi) || secondi < 1) return ''
    const arrotondati = Math.max(5, Math.round(secondi / 5) * 5)
    if (arrotondati < 60) return t('chat.compaction.live.etaSeconds', { n: arrotondati })
    return t('chat.compaction.live.etaMinutes', { n: Math.max(1, Math.round(secondi / 60)) })
}

/** Il tempo trascorso in breve («3m 12s», in italiano «3 min 12 s»). */
export function durataBreveR4(ms: number | null | undefined, t: TraduttoreR4): string {
    if (!intero(ms)) return ''
    const tutti = Math.floor(ms / 1000)
    if (tutti < 60) return t('chat.compaction.live.durationSeconds', { s: tutti })
    return t('chat.compaction.live.durationMinutes', { m: Math.floor(tutti / 60), s: tutti % 60 })
}

export interface VistaRigaVivaR4 {
    etichetta: string
    /** «62% · ~1 min», «scrivo · 1.234 token»: fuori dalla live region, cambia a ogni passo. */
    dettaglio: string
    /** Il resto (da leggere, in cache, trascorso, tentativo): sotto la riga sul telefono, dove il desktop ha il suggerimento. */
    titolo: string
    determinato: boolean
    letti: number | null
    totale: number | null
    /** Le due larghezze del filo, in percento: la cache tenue, poi ciò che è stato letto davvero. */
    tratti: { cache: number; letto: number } | null
    /** Per `aria-valuetext` del `<progress>`. */
    valoreTesto: string
}

/** Che cosa dice la riga viva, senza il DOM. Pura: si prova nei due versi (desktop `descriviRigaViva`). */
export function descriviRigaVivaR4(stato: StatoRigaVivaR4 | null | undefined, t: TraduttoreR4, lingua: LinguaR4): VistaRigaVivaR4 {
    const s: Partial<ProgressoCompattazioneR4> = stato?.tipo === 'progresso' ? stato : {}
    const totale = intero(s.totale) && s.totale > 0 ? s.totale : null
    const letti = totale !== null && intero(s.letti) ? Math.min(s.letti, totale) : null
    const determinato = letti !== null
    // la cache è una parte di ciò che è letto (llama.cpp `prompt_progress`: `cache` ≤ `processed`): un numero incoerente non sfora
    const inCache = determinato && intero(s.inCache) ? Math.min(s.inCache, letti) : 0
    const percento = determinato ? Math.floor((letti * 100) / (totale as number)) : null
    const stima = stimaBreveR4(s.stimaRestanteSec, t)
    const numero = (n: number) => formato(lingua).format(n)

    const dettaglio: string[] = []
    if (s.fase === 'riassunto') {
        dettaglio.push(intero(s.tokenScritti)
            ? t(s.tokenScritti === 1 ? 'chat.compaction.live.writingOne' : 'chat.compaction.live.writingMany', { n: numero(s.tokenScritti) })
            : t('chat.compaction.live.writingPlain'))
    } else if (determinato) dettaglio.push(t('chat.compaction.live.percent', { n: percento as number }))
    if (stima) dettaglio.push(stima)

    const titolo: string[] = []
    if (totale !== null) {
        const daLeggere = t(totale === 1 ? 'chat.compaction.live.tipToReadOne' : 'chat.compaction.live.tipToReadMany', { n: numero(totale) })
        titolo.push(inCache > 0 ? `${daLeggere}, ${t('chat.compaction.live.tipCached', { c: numero(inCache) })}` : daLeggere)
    }
    const trascorso = durataBreveR4(s.trascorsoMs, t)
    if (trascorso) titolo.push(t('chat.compaction.live.tipElapsed', { t: trascorso }))
    if (intero(s.tentativo) && s.tentativo > 0) {
        titolo.push(intero(s.tentativi) && s.tentativi >= s.tentativo
            ? t('chat.compaction.live.tipAttemptOf', { n: s.tentativo, m: s.tentativi })
            : t('chat.compaction.live.tipAttempt', { n: s.tentativo }))
    }

    return {
        etichetta: t('chat.compaction.live.summarizing'),
        dettaglio: dettaglio.join(' · '),
        titolo: titolo.join(' · '),
        determinato,
        letti,
        totale,
        tratti: determinato ? { cache: (inCache * 100) / (totale as number), letto: (((letti as number) - inCache) * 100) / (totale as number) } : null,
        valoreTesto: determinato ? [t('chat.compaction.live.percent', { n: percento as number }), stima].filter(Boolean).join(' · ') : '',
    }
}

/** I token in breve, come il mockup: «31.2k» (in italiano «31,2k»); sotto il migliaio il numero intero; senza numero `null`. */
export function formattaTokenBreveR4(n: number | null | undefined, lingua: LinguaR4, t: TraduttoreR4): string | null {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null
    if (n < 1000) return formato(lingua).format(Math.round(n))
    return t('chat.compaction.row.thousands', { n: formato(lingua, { maximumFractionDigits: 1 }).format(Math.round(n / 100) / 10) })
}

const RAGIONE_BREVE: Record<RagioneRipiegoR4, string> = {
    tempo: 'chat.compaction.fallback.reasonTime',
    saltato: 'chat.compaction.fallback.reasonSkipped',
    rifiutato: 'chat.compaction.fallback.reasonRejected',
    stima: 'chat.compaction.fallback.reasonEstimate',
    esaurito: 'chat.compaction.fallback.reasonExhausted',
}
const RAGIONE_PERCHE: Record<RagioneRipiegoR4, string> = {
    tempo: 'chat.compaction.fallback.whyTime',
    saltato: 'chat.compaction.fallback.whySkipped',
    rifiutato: 'chat.compaction.fallback.whyRejected',
    stima: 'chat.compaction.fallback.whyEstimate',
    esaurito: 'chat.compaction.fallback.whyExhausted',
}
const conosciuta = (ragione: unknown): ragione is RagioneRipiegoR4 => typeof ragione === 'string' && Object.hasOwn(RAGIONE_BREVE, ragione)

/** Il perché del ripiego per esteso: si apre col tocco sulla riga (decisione dell'owner, 21/10). */
export function percheRipiegoR4(ragione: unknown, t: TraduttoreR4): string {
    return t(conosciuta(ragione) ? RAGIONE_PERCHE[ragione] : 'chat.compaction.fallback.whyUnknown')
}

/*
 * I motivi di una fine fallita che il kernel e il registro dichiarano (desktop `MOTIVI`). Un motivo che non conosciamo si riporta
 * com'è: nasconderlo dietro una frase generica sarebbe dire meno del vero.
 */
const MOTIVI: Record<string, string> = {
    attrezzo: 'chat.compaction.failure.tool',
    troncato: 'chat.compaction.failure.truncated',
    vuoto: 'chat.compaction.failure.empty',
    errore: 'chat.compaction.failure.provider',
    superata: 'chat.compaction.failure.superseded',
    'non-salvata': 'chat.compaction.failure.notSaved',
    interrotta: 'chat.compaction.failure.interrupted',
    ripiego: 'chat.compaction.failure.fellBack',
}
export function motivoUmanoR4(motivo: string | null | undefined, dettaglio: string | null | undefined, t: TraduttoreR4): string {
    const frase = motivo && Object.hasOwn(MOTIVI, motivo) ? t(MOTIVI[motivo]) : String(motivo ?? '')
    return dettaglio ? `${frase} (${dettaglio})` : frase
}

export interface EsitoCompattazioneR4 {
    stato: 'riassunta' | 'non-riuscita'
    tokenPrima?: number | null
    tokenDopo?: number | null
    ripiego?: boolean
    ragione?: unknown
    motivo?: string | null
    dettaglio?: string | null
}

/**
 * La frase della riga per il ripiego e per la compattazione non riuscita (desktop `testoRigaCompattazione`). La compattazione
 * riuscita col modello resta la frase della chat del telefono («Conversazione riassunta · 14.273 → 2526 token»), che la riga
 * scrive da sé: qui torna `null`.
 */
export function testoEsitoCompattazioneR4(esito: EsitoCompattazioneR4, t: TraduttoreR4, lingua: LinguaR4): string | null {
    // l'archivio del motore riallineato alla conversazione non è un fallimento: niente si è perso (desktop `RIALLINEATO`)
    if (esito.stato === 'non-riuscita' && esito.motivo === 'archivio-riallineato') return t('chat.compaction.row.realigned')
    if (esito.stato === 'non-riuscita') {
        const motivo = esito.motivo ? motivoUmanoR4(esito.motivo, esito.dettaglio, t) : ''
        return motivo ? `${t('chat.compaction.row.notSummarized')} · ${motivo}` : t('chat.compaction.row.notSummarized')
    }
    if (esito.ripiego !== true) return null
    const base = conosciuta(esito.ragione)
        ? t('chat.compaction.row.withoutModelBecause', { reason: t(RAGIONE_BREVE[esito.ragione]) })
        : t('chat.compaction.row.withoutModel')
    const prima = formattaTokenBreveR4(esito.tokenPrima, lingua, t)
    const dopo = formattaTokenBreveR4(esito.tokenDopo, lingua, t)
    return prima && dopo ? `${base} · ${t('chat.compaction.row.beforeAfter', { before: prima, after: dopo })}` : base
}
