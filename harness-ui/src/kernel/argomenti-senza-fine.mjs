/*
 * R-47 (1/11/2026): la chiamata di attrezzo che si perde in spazi vuoti. Sul piano un `file_edit` ha mandato spazi e a capo per quasi 24 minuti:
 *   il flusso era vivo, quindi la sorveglianza del silenzio non scattava.
 *
 * Fuori da qui lo stesso guasto: Hermes PR #144745, da openclaw#177659, circa l'1% delle richieste Responses di una flotta; useomnia/hermes-agent
 *   PR #136; oh-my-pi #15921. Da lì vengono le tre scelte di questa forma:
 *   · fuori da una stringa JSON ogni fila di spazi conta (Hermes);
 *   · dentro una stringa, una fila di soli spazi è contenuto: una riga da 5.000 spazi è un file vero, ed è il falso positivo trovato sulla PR di Hermes;
 *   · dentro una stringa, una fila con a capo conta. Un a capo grezzo è già JSON non valido; quelli scritti `\n` contano da OTTO_RIGHE in su,
 *     perché il ciclo catturato da useomnia è proprio `\n` più quattro spazi, che a Hermes sfugge.
 *
 * Misurato sul banco, 527 corse e 18.961 chiamate: fila più lunga nelle chiamate buone 60 caratteri, in quella guasta 81.033. Il tetto è quello di Hermes.
 * Il conto è per chiamata e passa da un pezzo all'altro; un `\` in coda a un pezzo aspetta il pezzo dopo.
 */
export const TETTO_SPAZI_NEGLI_ARGOMENTI = 4096
/* Non il tetto di 10 della caduta: dieci giri da ~75 s sono 12 minuti che sembrano vivi, e se il guasto è legato alla richiesta non guarisce (Desktop, 1/11/2026).
   Sulla PR di Hermes un revisore ha visto lo stesso guasto ripetersi su ogni tentativo; il freno di oh-my-pi ricampiona al più due volte. */
export const RITENTATIVI_ARGOMENTI_SENZA_FINE = 2
const OTTO_RIGHE = 8

const eSpazio = (c) => c === ' ' || c === '\t'
const eACapo = (c) => c === '\n' || c === '\r'

export function creaSorveglianzaArgomenti(tetto = TETTO_SPAZI_NEGLI_ARGOMENTI) {
    let inStringa = false
    let inEscape = false
    let fila = 0
    let aCapoScritti = 0
    let aCapoGrezzo = false
    const azzera = () => { fila = 0; aCapoScritti = 0; aCapoGrezzo = false }
    const superato = () => fila > tetto && (!inStringa || aCapoGrezzo || aCapoScritti >= OTTO_RIGHE)
    /** @returns {boolean} vero quando la chiamata è da scartare */
    return function scrivi(pezzo) {
        for (const c of pezzo) {
            if (inEscape) {
                inEscape = false
                if (c === 'n' || c === 'r') { fila += 2; aCapoScritti += 1 } else if (c === 't') fila += 2
                else azzera()
            } else if (inStringa && c === '\\') {
                inEscape = true
            } else if (c === '"') {
                inStringa = !inStringa
                azzera()
            } else if (eSpazio(c)) {
                fila += 1
            } else if (eACapo(c)) {
                fila += 1
                aCapoGrezzo = true
            } else {
                azzera()
            }
            if (superato()) return true
        }
        return false
    }
}
