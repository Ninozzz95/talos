/**
 * ⛔ K3 Revisione (ledger `LEDGER-K3-REVISIONE-2026-10-17.md`): le parole e le regole della Revisione, COPIA FISSATA del desktop r4
 * @ 701c6c0d2 (provata contro il golden calcolato dal codice vero, `tests/fixtures/r4/revisione-golden-701c6c0d2.json`):
 *   · `components/review.js`: `riassuntoReview`, `sottotitoloFile`, `suggerimentoFile`, `etichettaFileReview` (con `accorciaPercorso`
 *     di `components/schede.js`), `AZIONI_FILE`, `aggiornaDiffReview` (la testa e l'avviso dei simboli);
 *   · `legacy/app.js`: `testoDiffDiUnFile`/`testoDiffCompleto` (:18033-18043), le parole delle copie (`#copyAllDiffs` :28745).
 * Le righe del diff e i conteggi li fa `pannelloR4.ts` (`diffRigheR4.ts`), una voce per percorso come la `Map` del desktop.
 */
import type { FileR4 } from './pannelloR4'
import varie from './testi/varie-pannello-r4.json'
import modello from './testi/modello-revisione-r4.json'
import app from './testi/app-revisione-r4.json'

type Tabella = { it: Record<string, string>; en: Record<string, string> }
const AREE: Record<string, Tabella> = { varie, modello, app }

const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const propria = (t: Record<string, string>, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)

/** `t('varie.review.…' | 'modello.review.…' | 'app.review.…')` di r4: la voce nella lingua, altrimenti l'inglese. */
export function testoRevisioneR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const punto = chiave.indexOf('.')
    const area = AREE[chiave.slice(0, punto)]
    const nome = chiave.slice(punto + 1)
    const frase = area ? propria(italiano(lingua) ? area.it : area.en, nome) ?? propria(area.en, nome) ?? chiave : chiave
    if (!valori) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto))
}

function plurale(uno: string, molti: string, n: number, lingua: string, valori?: Record<string, unknown>): string {
    const regole = new Intl.PluralRules(italiano(lingua) ? 'it' : 'en')
    return testoRevisioneR4(regole.select(Number(n)) === 'one' ? uno : molti, lingua, { n, ...(valori ?? {}) })
}

/** «3 file modificati · +112 −2», o «Nessuna modifica in questa sessione». */
export function riassuntoReviewR4(file: readonly FileR4[], lingua: string): string {
    if (file.length === 0) return testoRevisioneR4('varie.review.summary.none', lingua)
    let aggiunte = 0
    let rimozioni = 0
    for (const f of file) { aggiunte += f.aggiunte; rimozioni += f.rimozioni }
    return plurale('varie.review.summary.filesOne', 'varie.review.summary.filesMany', file.length, lingua, { added: aggiunte, removed: rimozioni })
}

/** «giro 5 · nuovo file», «giro 5 · file modificato · ⚠ 1 simbolo sparito». */
export function sottotitoloFileR4(voce: FileR4, lingua: string): string {
    const pezzi: string[] = []
    if (Number.isFinite(voce.giro)) pezzi.push(testoRevisioneR4('varie.review.turn', lingua, { n: voce.giro }))
    pezzi.push(testoRevisioneR4(voce.nuovo ? 'varie.review.subtitle.newFile' : 'varie.review.subtitle.modifiedFile', lingua))
    const persi = voce.simboliPersi?.length ?? 0
    if (persi > 0) pezzi.push(plurale('varie.review.subtitle.symbolsGoneOne', 'varie.review.subtitle.symbolsGoneMany', persi, lingua))
    return pezzi.join(' · ')
}

/** Il percorso intero e il sottotitolo: quello che la linguetta non scrive. */
export function suggerimentoFileR4(voce: FileR4, lingua: string): string {
    return [voce.path, sottotitoloFileR4(voce, lingua)].filter(Boolean).join(' — ')
}

/** Il tetto della linguetta quando nemmeno il nome del file basta (`PERCORSO_SU_LINGUETTA`). */
const PERCORSO_SU_LINGUETTA = 34

/** `accorciaPercorso` di `schede.js`: si taglia nel mezzo, su un confine di cartella; la radice e la coda restano. */
function accorciaPercorso(percorso: string, massimo: number): string {
    const testo = String(percorso ?? '')
    if (testo.length <= massimo) return testo
    const pezzi = testo.split(/(?<=[\\/])/)
    const radice = pezzi[0] + (pezzi[1] ?? '')
    let coda = ''
    for (let i = pezzi.length - 1; i > 1; i -= 1) {
        const prova = pezzi[i] + coda
        if (radice.length + 1 + prova.length > massimo) break
        coda = prova
    }
    if (!coda) coda = testo.slice(-Math.max(6, massimo - radice.length - 1))
    return `${radice}…${coda}`
}

/** Sulla linguetta il NOME del file; con un omonimo anche la cartella madre; se non basta, il percorso accorciato. */
export function etichettaFileReviewR4(voce: FileR4, tutte: readonly FileR4[] = [voce]): string {
    const percorso = String(voce?.path ?? '')
    const pezzi = percorso.split('/').filter(Boolean)
    const nome = pezzi.at(-1) || percorso
    const omonimi = tutte.filter((v) => v !== voce && String(v?.path ?? '').split('/').filter(Boolean).at(-1) === nome)
    if (omonimi.length === 0) return nome
    const conCartella = pezzi.slice(-2).join('/')
    const ancoraOmonimi = omonimi.filter((v) => String(v?.path ?? '').split('/').filter(Boolean).slice(-2).join('/') === conCartella)
    return ancoraOmonimi.length === 0 ? conCartella : accorciaPercorso(percorso, PERCORSO_SU_LINGUETTA)
}

/** La testa del diff (`aggiornaDiffReview`): percorso, «+A», «−R» solo se ci sono righe tolte, «giro N» se c'è. */
export function testaDiffR4(voce: FileR4, lingua: string): { percorso: string; piu: string; meno: string | null; giro: string | null } {
    return {
        percorso: voce.path,
        piu: `+${voce.aggiunte}`,
        meno: voce.rimozioni === 0 ? null : `−${voce.rimozioni}`,
        giro: Number.isFinite(voce.giro) ? testoRevisioneR4('varie.review.turn', lingua, { n: voce.giro }) : null,
    }
}

/** L'avviso sopra il diff quando la riscrittura fa sparire funzioni o classi; `null` se non ne sparisce nessuna. */
export function avvisoSimboliR4(voce: FileR4, lingua: string): { badge: string; titolo: string; elenco: string } | null {
    const persi = voce.simboliPersi ?? []
    if (persi.length === 0) return null
    return {
        badge: testoRevisioneR4('varie.review.warning', lingua),
        titolo: testoRevisioneR4(persi.length === 1 ? 'varie.review.removesOneSymbol' : 'varie.review.removesManySymbols', lingua, { n: persi.length }),
        elenco: persi.join(', '),
    }
}

/** Il diff di UN file come testo semplice, per gli appunti. */
export function testoDiffDiUnFileR4(voce: FileR4, lingua: string): string {
    return [
        `### ${voce.path}${voce.nuovo ? ` (${testoRevisioneR4('app.review.newFileSuffix', lingua)})` : ''}`,
        ...(voce.code ?? []).map(([, testo]) => testo),
        '',
    ].join('\n')
}

/** Il diff di TUTTI i file scritti nella sessione. */
export function testoDiffCompletoR4(file: readonly FileR4[], lingua: string): string {
    return file.map((f) => testoDiffDiUnFileR4(f, lingua)).join('\n')
}

/**
 * Il numero sulla scheda «Review»: i file scritti; `null` mentre la storia si carica (A1-bis 5 del desktop, `legacy/app.js:24909`:
 * durante la storia il conto sale fra numeri intermedi, «Review 50» poi «82»).
 */
export function numeroSchedaRevisioneR4(file: readonly FileR4[], storiaFinita: boolean): number | null {
    return storiaFinita ? file.length : null
}

/** «Diff di 2 file copiato». */
export function testoCopiatiR4(n: number, lingua: string): string {
    return plurale('app.review.diffCopiedFilesOne', 'app.review.diffCopiedFilesMany', n, lingua)
}
