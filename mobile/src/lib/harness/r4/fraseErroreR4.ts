/**
 * ⛔ FRASI-UNICHE (censimento «Avvisi ed errori», punto b; Desktop 27/10/2026): UNA regola per dire nella lingua dell'app il rifiuto di
 * r4, la stessa della riga d'errore, dei fogli e degli avvisi. Prima erano due: la riga sceglieva la voce per chiave senza guardare il
 * testo del server (una frase generica poteva coprire un motivo più preciso), il foglio del modo confrontava il testo ma su due sole
 * tabelle (un SESSION_NOT_READY restava in inglese).
 *
 * È `testoErroreServer` del desktop (`components/errori.js:1206` @ r4 79ea996de), la parte `message`: le candidate sono le voci dei
 * MOTIVI del codice (il suo motivo per primo) e poi `<CODICE>.message`; vale la voce la cui versione INGLESE, coi parametri, è IDENTICA
 * al testo del server. Se nessuna coincide resta il testo del server; solo senza testo del server vale la frase del codice. Così la
 * frase generica non copre mai un motivo più preciso (test del desktop API-ERROR-LINGUA, «AL CONTRARIO»).
 *
 * Le tabelle sono i dizionari del desktop estratti da `testi-server-r4.mjs`, mai a mano.
 */
import erroriModello from './testi/errori-modello-r4.json'
import erroriChatgpt from './testi/errori-chatgpt-r4.json'
import erroriLocale from './testi/errori-locale-r4.json'
import erroriDelPc from './testi/errori-generici-r4.json'
import erroriSessioni from './testi/errori-sessioni-r4.json'
import erroriRemoti from './testi/errori-remoti-r4.json'
import erroriMotivi from './testi/errori-motivi-r4.json'
import erroriProcessi from './testi/errori-processi-r4.json'
import erroriDomande from './testi/errori-domande-r4.json'
import erroriFile from './testi/errori-file-r4.json'
import erroriPiano from './testi/errori-piano-r4.json'

type Tabella = { it: Record<string, string>; en: Record<string, string> }
/** L'ordine conta solo per una chiave ripetuta in due tabelle: vince la prima, le generiche (il piano) per ultime. */
const TABELLE: readonly Tabella[] = [erroriModello, erroriChatgpt, erroriLocale, erroriDelPc, erroriSessioni, erroriRemoti, erroriMotivi,
    erroriProcessi, erroriDomande, erroriFile, erroriPiano] as Tabella[]
/** Le parti di un problema che non sono motivi (`SUFFISSI_DELLE_PARTI` del desktop). */
const PARTI = new Set(['message', 'title', 'explanation', 'action'])

const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)

function voce(chiave: string, lingua: 'it' | 'en'): string | undefined {
    for (const t of TABELLE) if (Object.hasOwn(t[lingua], chiave)) return t[lingua][chiave]
    return undefined
}

function interpola(frase: string, params: Record<string, unknown> | undefined): string {
    if (!params) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/gu, (tutto, nome: string) => (nome in params ? String(params[nome]) : tutto))
}

const indiceDeiMotivi = new Map<string, string[]>()
/** `chiaviDeiMotivi` del desktop: tutte le voci `<CODICE>.<motivo>` del codice, il suo motivo per primo. */
function chiaviDeiMotivi(codice: string, motivo: string): string[] {
    let tutte = indiceDeiMotivi.get(codice)
    if (!tutte) {
        const prefisso = `${codice}.`
        tutte = [...new Set(TABELLE.flatMap((t) => Object.keys(t.en)))]
            .filter((k) => k.startsWith(prefisso) && !k.slice(prefisso.length).includes('.') && !PARTI.has(k.slice(prefisso.length)))
        indiceDeiMotivi.set(codice, tutte)
    }
    if (!motivo) return tutte
    const sua = `${codice}.${motivo.replace(/-/gu, '_')}`
    return [sua, ...tutte.filter((k) => k !== sua)]
}

/**
 * `fraseDelMotivo` del desktop (`components/errori.js` @ r4 79ea996de): la frase del MOTIVO, solo quando il server l'ha pubblicata per
 * la persona, cioè quando la sua `explanation` è esattamente l'inglese della voce `<CODICE>.<motivo con _>`. Sulla busta HTTP il
 * `message` è la frase generica del codice (`MESSAGE_BY_CODE`) e quella precisa sta in `explanation` (`public-problem.mjs:141-152`).
 * Cerca in TUTTE le tabelle, come `TESTI.en` del desktop. Torna `''` se no, e chi chiama fa come prima.
 */
export function fraseDelMotivoR4(errore: unknown, lingua: string): string {
    const e = (errore && typeof errore === 'object' ? errore : {}) as Record<string, unknown>
    const problema = (e.problem && typeof e.problem === 'object' ? e.problem : e) as Record<string, unknown>
    const codice = String(problema.code ?? e.code ?? '')
    const motivo = problema.reason ?? e.reason
    if (!codice || typeof motivo !== 'string' || motivo === '') return ''
    const chiave = `${codice}.${motivo.replace(/-/gu, '_')}`
    const inglese = voce(chiave, 'en')
    if (inglese === undefined) return ''
    const params = problema.params && typeof problema.params === 'object' ? problema.params as Record<string, unknown> : undefined
    if (interpola(inglese, params) !== String(problema.explanation ?? '').trim()) return ''
    return interpola((italiano(lingua) ? voce(chiave, 'it') : undefined) ?? inglese, params)
}

/**
 * La frase di un rifiuto nella lingua dell'app. Accetta la busta di r4 (`{code, message, reason, params}`) o un oggetto con `problem`.
 * Torna `''` solo senza codice né testo del server.
 */
export function fraseErroreR4(errore: unknown, lingua: string): string {
    const e = (errore && typeof errore === 'object' ? errore : {}) as Record<string, unknown>
    const problema = (e.problem && typeof e.problem === 'object' ? e.problem : e) as Record<string, unknown>
    const codice = String(problema.code ?? e.code ?? '')
    const params = problema.params && typeof problema.params === 'object' ? problema.params as Record<string, unknown> : undefined
    const motivo = typeof (problema.reason ?? e.reason) === 'string' ? String(problema.reason ?? e.reason) : ''
    const server = String(problema.message ?? e.message ?? '').trim()
    const lang = italiano(lingua) ? 'it' : 'en'
    const delCodice = codice ? `${codice}.message` : null
    if (server) {
        const candidate = codice ? [...chiaviDeiMotivi(codice, motivo), `${codice}.message`] : []
        const chiave = candidate.find((k) => voce(k, 'en') !== undefined && interpola(voce(k, 'en') as string, params) === server)
        return chiave ? interpola(voce(chiave, lang) ?? voce(chiave, 'en') as string, params) : server
    }
    return delCodice && voce(delCodice, 'en') !== undefined ? interpola(voce(delCodice, lang) ?? voce(delCodice, 'en') as string, params) : ''
}
