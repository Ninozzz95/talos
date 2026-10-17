/**
 * ⛔ K3-AP2 (ledger `LEDGER-K3-DOMANDE-2026-10-16.md`; owner 16/10: carta nella conversazione, una domanda alla volta, parità col
 * desktop). Le regole della carta delle domande di TALOS come le fa il desktop @ `701c6c0d2` (invariate da `2161afb32`), trascritte da
 * `components/user-question-dock.js`:
 *   · `readDraft` (:222) → `rispostaDallaBozzaR4`; `dopoLaScelta` + `tutteSingoleSenzaAltro` (:276-289) → `dopoLaSceltaR4`;
 *   · la testata di `render` (:448) → `progressoDomandaR4`; i pulsanti visibili per fase (:452-458) → `pulsantiDomandaR4`;
 *   · la revisione (:469-489) → `revisioneDomandaR4`; `fraseEsito` (:81) → `esitoDomandaR4`; `fraseChiEQuando` (:97);
 *   · `disegnaRicevuta` (:377) → `ricevutaDomandaR4`; i rami d'errore di `submit` (:503-513) → `erroreInvioDomandaR4`.
 * Le parole sono del desktop (`chat.js`, area `chat-domande`). Unica frase del mobile: l'annuncio al lettore di schermo, perché
 * quella del desktop dice «Le risposte sono sopra il campo di scrittura» e qui la domanda sta nella conversazione.
 */
import chat from './testi/chat-domande-r4.json'
import errori from './testi/errori-domande-r4.json'
import type { DomandaUtenteR4, EsitoDomandaR4 } from './domandaChiave'

type Tabella = Record<string, string>
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const propria = (t: Tabella, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)

/** `t()` del desktop sulle frasi `chat.*` della carta: la lingua, poi l'inglese; i `{segnaposto}` noti si sostituiscono. */
export function testoDomandaR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const nome = chiave.startsWith('chat.') ? chiave.slice(5) : chiave
    const frase = propria((italiano(lingua) ? chat.it : chat.en) as Tabella, nome) ?? propria(chat.en as Tabella, nome) ?? chiave
    if (!valori) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto))
}
const tn = (uno: string, molti: string, n: number, lingua: string, valori: Record<string, unknown> = {}) =>
    testoDomandaR4(new Intl.PluralRules(italiano(lingua) ? 'it' : 'en').select(n) === 'one' ? uno : molti, lingua, { n, ...valori })

/** Ciò che la persona ha messo per una domanda: le opzioni toccate, «Altro», il testo libero. */
export interface BozzaDellaDomandaR4 { scelte: string[]; altro: string; testo: string }
export type BozzaDomandaR4 = Record<string, BozzaDellaDomandaR4>
export type FaseDomandaR4 = 'answer' | 'review' | 'skip-review' | 'stale' | 'resolved'

const VUOTA: BozzaDellaDomandaR4 = { scelte: [], altro: '', testo: '' }
/** L'id di una domanda come lo usa il dock (`'q' + indice` se manca). */
export const idDomandaR4 = (d: DomandaUtenteR4, indice: number) => (typeof d.id === 'string' && d.id ? d.id : `q${indice}`)
const opzioni = (d: DomandaUtenteR4) => (Array.isArray(d.options) ? d.options : [])
const etichette = (d: DomandaUtenteR4) => opzioni(d).map((o) => String(o.label || ''))

/** `readDraft`: la risposta che partirebbe adesso. Le scelte seguono l'ordine delle opzioni, come gli `<input>` del dock. */
export function rispostaDallaBozzaR4(domande: DomandaUtenteR4[], bozza: BozzaDomandaR4): Record<string, string | string[]> {
    const risposte: Record<string, string | string[]> = {}
    for (const [indice, d] of domande.entries()) {
        const id = idDomandaR4(d, indice)
        const b = bozza[id] ?? VUOTA
        const altro = opzioni(d).length ? b.altro.trim() : ''
        if (opzioni(d).length === 0) {
            const valore = b.testo.trim()
            if (valore) risposte[id] = valore
        } else if (d.multiSelect === true) {
            const valori = [...etichette(d).filter((l) => b.scelte.includes(l)), ...(altro ? [altro] : [])]
            if (valori.length) risposte[id] = valori
        } else {
            const valore = altro || etichette(d).find((l) => b.scelte.includes(l)) || ''
            if (valore) risposte[id] = valore
        }
    }
    return risposte
}

/**
 * `dopoLaScelta` dopo un tocco esplicito su un'opzione (sul telefono ogni tocco lo è: il problema D2 della freccia non c'è):
 * una scelta singola sulla domanda a vista porta alla successiva; sull'ultima invia, se tutte sono singole senza «Altro» e hanno
 * risposta. `bozzaDopo` è la bozza col tocco già applicato (e «Altro» svuotato, se la scelta è singola).
 */
export function dopoLaSceltaR4(domande: DomandaUtenteR4[], bozzaDopo: BozzaDomandaR4, indice: number, corrente: number): 'avanti' | 'invia' | null {
    const d = domande[indice]
    if (!d || d.multiSelect === true) return null
    if (indice < domande.length - 1) return indice === corrente ? 'avanti' : null
    const tutteSingoleSenzaAltro = domande.every((x, i) => opzioni(x).length > 0 && x.multiSelect !== true && !(bozzaDopo[idDomandaR4(x, i)]?.altro ?? '').trim())
    return tutteSingoleSenzaAltro && Object.keys(rispostaDallaBozzaR4(domande, bozzaDopo)).length === domande.length ? 'invia' : null
}

/** La testata: «Una decisione» o «Domanda n di totale». */
export function progressoDomandaR4(corrente: number, totale: number, lingua: string): string {
    return totale === 1 ? testoDomandaR4('chat.question.oneDecision', lingua) : testoDomandaR4('chat.question.progress', lingua, { n: corrente + 1, totale })
}

export type PulsanteDomandaR4 = { id: 'indietro' | 'salta' | 'modifica' | 'confermaSalto' | 'avanti' | 'rivedi' | 'invia'; testo: string; tono: 'ghost' | 'secondary' | 'primary' }
/** I pulsanti visibili per fase, nell'ordine del dock (indietro, salta, modifica, conferma salto, avanti, rivedi, invia). */
export function pulsantiDomandaR4(fase: FaseDomandaR4, corrente: number, totale: number, lingua: string): PulsanteDomandaR4[] {
    const ultima = corrente === totale - 1
    const tutti: Array<[PulsanteDomandaR4['id'], string, PulsanteDomandaR4['tono'], boolean]> = [
        ['indietro', 'chat.common.back', 'ghost', fase === 'answer' && corrente > 0],
        ['salta', 'chat.question.skip', 'ghost', fase === 'answer'],
        ['modifica', 'chat.question.review.edit', 'secondary', fase === 'review' || fase === 'skip-review'],
        ['confermaSalto', 'chat.question.confirmSkip', 'secondary', fase === 'skip-review'],
        ['avanti', 'chat.question.next', 'primary', fase === 'answer' && !ultima],
        ['rivedi', 'chat.question.review.open', 'primary', fase === 'answer' && ultima],
        ['invia', 'chat.question.review.confirm', 'primary', fase === 'review'],
    ]
    return tutti.filter(([, , , visibile]) => visibile).map(([id, chiave, tono]) => ({ id, testo: testoDomandaR4(chiave, lingua), tono }))
}

/** La revisione: una riga per domanda, l'avviso (doppione di «Altro», mancanti, tutto pronto) e se si può confermare. */
export function revisioneDomandaR4(domande: DomandaUtenteR4[], bozza: BozzaDomandaR4, lingua: string) {
    const risposte = rispostaDallaBozzaR4(domande, bozza)
    const righe = domande.map((d, i) => {
        const valore = risposte[idDomandaR4(d, i)]
        return { domanda: d.question, risposta: Array.isArray(valore) ? valore.join(', ') : valore || testoDomandaR4('chat.question.review.unanswered', lingua) }
    })
    const mancanti = domande.length - Object.keys(risposte).length
    const doppione = domande.some((d, i) => {
        const b = bozza[idDomandaR4(d, i)] ?? VUOTA
        const altro = b.altro.trim()
        return d.multiSelect === true && Boolean(altro) && etichette(d).some((l) => b.scelte.includes(l) && l === altro)
    })
    const avviso = doppione ? testoDomandaR4('chat.question.review.otherDuplicatesChoice', lingua)
        : mancanti ? tn('chat.question.review.unansweredOne', 'chat.question.review.unansweredMany', mancanti, lingua)
            : testoDomandaR4('chat.question.review.allReady', lingua)
    return { titolo: testoDomandaR4('chat.question.review.title', lingua), righe, avviso, puoInviare: mancanti === 0 && !doppione }
}

/** `fraseEsito`: una frase per stato, e per `cancelled` una per motivo. */
export function esitoDomandaR4(status: string, motivo: string | null | undefined, altrove: boolean, lingua: string): string {
    const t = (k: string) => testoDomandaR4(`chat.question.outcome.${k}`, lingua)
    if (status === 'answered') return altrove ? t('answeredElsewhere') : t('answered')
    if (status === 'skipped') return altrove ? t('skippedElsewhere') : t('skipped')
    if (status === 'expired') return t('expired')
    if (status === 'unanswerable') return t('unanswerable')
    if (motivo === 'fermato') return t('stopped')
    if (motivo === 'reindirizzamento') return t('redirected')
    if (motivo === 'nuovo-messaggio') return t('newMessage')
    if (motivo === 'interrotta') return t('interrupted')
    if (motivo === 'non-salvata') return t('notSaved')
    return t('cancelled')
}

/** L'ora di un istante, «15:02», nel fuso di chi guarda; un istante illeggibile non diventa un'ora inventata. */
function ora(at: unknown): string | null {
    const data = typeof at === 'string' ? new Date(at) : null
    if (!data || Number.isNaN(data.getTime())) return null
    return String(data.getHours()).padStart(2, '0') + ':' + String(data.getMinutes()).padStart(2, '0')
}

/** `fraseChiEQuando`: «Chiesta alle 15:01 in modalità Piano · hai risposto alle 15:02». Vuota se non si sa niente. */
export function chiEQuandoDomandaR4(richiesta: { at?: string | null; origine?: { modalita?: string } | null }, status: string,
    esito: Partial<EsitoDomandaR4> | null, altrove: boolean, lingua: string): string {
    const t = (k: string, v?: Record<string, unknown>) => testoDomandaR4(`chat.question.${k}`, lingua, v)
    const parti: string[] = []
    const chiesta = ora(richiesta?.at)
    const modalita = richiesta?.origine?.modalita
    const modo = modalita === 'piano' ? t('mode.plan') : modalita ? t('mode.normal') : null
    if (chiesta || modo) parti.push(t('asked', { ora: chiesta ? t('at', { ora: chiesta }) : '', modo: modo ? t('inMode', { modo }) : '' }))
    const chiusa = ora(esito?.at)
    if (chiusa) {
        const chi = esito?.da === 'sistema' ? t('closedBy.system')
            : status === 'answered' ? (altrove ? t('closedBy.answeredElsewhere') : t('closedBy.youAnswered'))
                : status === 'skipped' ? (altrove ? t('closedBy.skippedElsewhere') : t('closedBy.youSkipped')) : t('closedBy.closed')
        parti.push(t('closedAt', { chi, ora: chiusa }))
    }
    return parti.join(' · ')
}

/** `disegnaRicevuta`: per ogni domanda la risposta («Altro: «…»», «Nessuna risposta»), il perché e le opzioni offerte. */
export function ricevutaDomandaR4(domande: DomandaUtenteR4[], status: string, esito: Partial<EsitoDomandaR4> | null, lingua: string) {
    const risposte = status === 'answered' && esito?.answers && typeof esito.answers === 'object' ? esito.answers : {}
    return domande.map((d, indice) => {
        const id = idDomandaR4(d, indice)
        const valore = (risposte as Record<string, unknown>)[id]
        const scelte = Array.isArray(valore) ? valore.map(String) : typeof valore === 'string' ? [valore] : []
        const note = new Set(etichette(d))
        const risposta = scelte.length === 0 ? testoDomandaR4('chat.question.receipt.noAnswer', lingua)
            : scelte.map((voce) => (opzioni(d).length && !note.has(voce) ? testoDomandaR4('chat.question.receipt.otherAnswer', lingua, { voce }) : voce)).join(', ')
        const perche = typeof d.why === 'string' ? d.why.trim() : ''
        return {
            id,
            domanda: d.question || testoDomandaR4('chat.question.label', lingua),
            risposta,
            perche: perche ? testoDomandaR4('chat.question.whyItMatters', lingua, { perche }) : null,
            contoOfferte: opzioni(d).length ? testoDomandaR4('chat.question.receipt.optionsOffered', lingua, { n: opzioni(d).length }) : null,
            offerte: opzioni(d).map((o) => ({ label: String(o.label || ''), consigliata: o.recommended === true, scelta: scelte.includes(String(o.label || '')) })),
        }
    })
}

/**
 * I rami d'errore di `submit`: 404/409/410 → la domanda non è più attiva (carta ferma); 400/422 → riapre col motivo del server;
 * il resto (nessuno status, 5xx) → esito non verificato, e la carta resta bloccata finché l'esito non arriva dal flusso.
 */
export function erroreInvioDomandaR4(stato: number | null, messaggio: string, lingua: string): { fase: 'stale' | null; testo: string; bloccata: boolean } {
    if (stato === 404 || stato === 409 || stato === 410) return { fase: 'stale', testo: testoDomandaR4('chat.question.submit.stale', lingua, { errore: messaggio }), bloccata: false }
    if (stato === 400 || stato === 422) return { fase: null, testo: testoDomandaR4('chat.question.submit.failed', lingua, { errore: messaggio }), bloccata: false }
    return { fase: null, testo: testoDomandaR4('chat.question.submit.unverified', lingua), bloccata: true }
}

/** Il motivo di un rifiuto di `POST /question` come lo dice il desktop (`testoErroreServer`: `errori.<CODICE>.message`, poi il server). */
export function messaggioRifiutoDomandaR4(codice: string | null, messaggio: string, lingua: string): string {
    if (codice) {
        const chiave = `${codice}.message`
        const frase = propria((italiano(lingua) ? errori.it : errori.en) as Tabella, chiave) ?? propria(errori.en as Tabella, chiave)
        if (frase) return frase
    }
    return messaggio
}

/** L'annuncio al lettore di schermo (`testoAnnuncio` del dock), con la frase finale del mobile: la domanda è nella conversazione. */
const ANNUNCIO_MOBILE = {
    it: { uno: 'TALOS chiede una decisione: {corpo}{pausa}La domanda è nella conversazione.', molti: 'TALOS chiede {n} decisioni: {corpo}{pausa}Le domande sono nella conversazione.' },
    en: { uno: 'TALOS asks for one decision: {corpo}{pausa}The question is in the conversation.', molti: 'TALOS asks for {n} decisions: {corpo}{pausa}The questions are in the conversation.' },
}
export function annuncioDomandaR4(domande: DomandaUtenteR4[], lingua: string): string {
    const testi = domande.map((d) => String(d?.question || '').trim()).filter(Boolean)
    const corpo = testi.join(' · ') || testoDomandaR4('chat.question.withoutText', lingua)
    const frasi = italiano(lingua) ? ANNUNCIO_MOBILE.it : ANNUNCIO_MOBILE.en
    const forma = new Intl.PluralRules(italiano(lingua) ? 'it' : 'en').select(domande.length) === 'one' ? frasi.uno : frasi.molti
    const valori: Record<string, string | number> = { n: domande.length, corpo, pausa: /[.?!…]$/.test(corpo) ? ' ' : '. ' }
    return forma.replace(/\{([a-z]+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto))
}
