/**
 * ⛔ K3 pin r4 701c6c0d2 (ledger `LEDGER-K3-PIN-R4-701-2026-10-17.md`; #44 del desktop, `a4bdf73e4`, segnalato da noi il 15/10):
 * la frase del MOTIVO di un rifiuto, nella lingua dell'interfaccia. COPIA FISSATA di `fraseDelMotivo` (`components/errori.js` @
 * 701c6c0d2), provata sul golden calcolato dal suo codice vero con le buste dei moduli veri del server (`nome-motivi-701c6c0d2.json`).
 *   · Solo quando il server l'ha pubblicata per la persona: la sua `explanation` è ESATTAMENTE l'inglese della voce
 *     `errori.<CODICE>.<motivo con _>` (`public-problem.mjs`, MOTIVI_CON_FRASE_PER_LA_PERSONA). Altrimenti '' e chi chiama fa come prima.
 *   · I motivi: i rifiuti dell'albero dei file (`motivi-dei-file.mjs`), la chiave del fornitore che manca, i terminali senza sessione.
 */
import motivi from './testi/errori-motivi-r4.json'

const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const propria = (t: Record<string, string>, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)

/** `interpola` di `lingua.js`: i segnaposto `{nome}` che i parametri portano; gli altri restano. */
function interpola(frase: string, parametri: Record<string, unknown> | undefined): string {
    if (!parametri) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, nome: string) => (nome in parametri ? String(parametri[nome]) : tutto))
}

export function fraseDelMotivoR4(errore: unknown, lingua: string): string {
    const e = errore && typeof errore === 'object' ? errore as Record<string, unknown> : null
    const problema = (e && typeof e.problem === 'object' && e.problem ? e.problem : (e ?? {})) as Record<string, unknown>
    const codice = String(problema.code ?? e?.code ?? '')
    const motivo = problema.reason ?? e?.reason
    if (!codice || typeof motivo !== 'string' || motivo === '') return ''
    const nome = `${codice}.${motivo.replace(/-/g, '_')}` // `chiaveDelMotivo`, senza l'area `errori.`
    const inglese = propria(motivi.en, nome)
    if (inglese === undefined) return ''
    const params = problema.params && typeof problema.params === 'object' ? problema.params as Record<string, unknown> : undefined
    if (interpola(inglese, params) !== String(problema.explanation ?? '').trim()) return ''
    return interpola((italiano(lingua) ? propria(motivi.it, nome) : undefined) ?? inglese, params)
}
