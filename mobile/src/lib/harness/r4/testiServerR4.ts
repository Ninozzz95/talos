/**
 * ⛔ K3-C3a2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): i testi che r4 manda alla persona, nella lingua dell'app.
 *
 * Il contratto è quello di r4 (`harness-ui/frontend/src/components/testo-server.js` @ 99ffa3d38): accanto alla frase INGLESE
 * (riserva) il server manda `<campo>Chiave` (`server.<area>.<nome>`) e `<campo>Params`.
 *   · la chiave c'è nel dizionario → la frase nella lingua, coi valori (`interpola` di `lingua.js:117`: `{nome}` si sostituisce
 *     solo se il valore c'è);
 *   · una chiave senza voce ma con `<chiave>One` e `<chiave>Many` è un PLURALE: si sceglie col numero `params.n`;
 *   · un parametro `<nome>Chiave` dice che il valore `<nome>` è a sua volta un testo del dizionario;
 *   · altrimenti la frase del server, MAI la chiave grezza.
 * Il dizionario (`testi/server-r4.json`) si rigenera da r4 con lo script `testi-server-r4.mjs` (dal commit fissato), mai a mano.
 */
import dizionario from './testi/server-r4.json'

export interface TestiServerR4 {
    origine: { commit: string; percorso: string; sha256: string }
    it: Record<string, string>
    en: Record<string, string>
}

export const TESTI_SERVER_R4: TestiServerR4 = dizionario

/** La funzione che l'adattatore riceve: la chiave, i valori e la riserva inglese → la frase da mostrare. */
export type TestoDelServerR4 = (chiave: string | null | undefined, params: unknown, riserva: string) => string

const PREFISSO = 'server.'
const RISERVA = 'en'
/** `it`, `it-IT`… sono l'italiano; ogni altra lingua ricade sull'inglese, come `t()` di r4. */
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)

/** Solo le voci proprie del dizionario: `server.toString` non è un testo. */
function propria(tabella: Record<string, string>, nome: string): string | undefined {
    return Object.hasOwn(tabella, nome) ? tabella[nome] : undefined
}

function voce(chiave: string): string | undefined {
    return chiave.startsWith(PREFISSO) ? propria(TESTI_SERVER_R4.en, chiave.slice(PREFISSO.length)) : undefined
}

function interpola(frase: string, valori: Record<string, unknown> | undefined): string {
    if (!valori) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, nome: string) => (nome in valori ? String(valori[nome]) : tutto))
}

function nellaLingua(chiave: string, lingua: string, valori: Record<string, unknown> | undefined): string {
    const nome = chiave.slice(PREFISSO.length)
    const tabella = italiano(lingua) ? TESTI_SERVER_R4.it : TESTI_SERVER_R4.en
    return interpola(propria(tabella, nome) ?? propria(TESTI_SERVER_R4.en, nome) ?? '', valori)
}

/*
 * pin r4 4cee78f33 (`testo-server.js` `QUANTITA_DI_TOKEN`, 29/10): le QUANTITÀ di token si dicono col separatore delle migliaia della
 * lingua; solo i parametri che lo sono per nome (`tokens…`, `…Tokens`, `finestra`, `riserva`) e solo se interi: una porta o un id restano.
 */
const QUANTITA_DI_TOKEN = /^(?:tokens[A-Z]\w*|\w+Tokens|finestra|riserva)$/u
const numeroNellaLingua = (n: number, lingua: string) => n.toLocaleString(italiano(lingua) ? 'it-IT' : 'en-US')

function valoriDellaFrase(params: unknown, lingua: string): Record<string, unknown> | undefined {
    if (!params || typeof params !== 'object') return undefined
    const dentro = params as Record<string, unknown>
    const fuori: Record<string, unknown> = {}
    for (const [nome, valore] of Object.entries(dentro)) {
        if (nome.endsWith('Chiave') && nome.length > 'Chiave'.length) continue
        const chiaveDelNome = dentro[`${nome}Chiave`]
        fuori[nome] = typeof chiaveDelNome === 'string' && voce(chiaveDelNome) !== undefined ? nellaLingua(chiaveDelNome, lingua, undefined)
            : QUANTITA_DI_TOKEN.test(nome) && Number.isSafeInteger(valore) ? numeroNellaLingua(valore as number, lingua)
                : valore
    }
    return fuori
}

function regolePlurale(lingua: string): Intl.PluralRules {
    try { return new Intl.PluralRules(lingua) } catch { return new Intl.PluralRules(RISERVA) }
}

/** Il testo di una chiave del server nella lingua data (`it`, `en`; un'altra ricade sull'inglese), o la riserva. */
export function testoDelServerR4(chiave: string | null | undefined, params: unknown, riserva: string, lingua: string): string {
    if (typeof chiave !== 'string') return riserva
    const valori = valoriDellaFrase(params, lingua)
    if (voce(chiave) !== undefined) return nellaLingua(chiave, lingua, valori)
    const n = Number(valori?.n)
    if (voce(`${chiave}One`) !== undefined && voce(`${chiave}Many`) !== undefined && valori?.n !== undefined && Number.isFinite(n)) {
        const forma = regolePlurale(italiano(lingua) ? 'it' : RISERVA).select(n) === 'one' ? `${chiave}One` : `${chiave}Many`
        return nellaLingua(forma, lingua, { ...valori, n })
    }
    return riserva
}

/** `testoDelCampo` di r4 (`testo-server.js:52-55`): il campo di un oggetto del server (`<campo>`, `<campo>Chiave`, `<campo>Params`). */
export function testoDelCampoR4(oggetto: unknown, campo: string, lingua: string): string | undefined {
    if (!oggetto || typeof oggetto !== 'object') return undefined
    const o = oggetto as Record<string, unknown>
    const riserva = o[campo]
    const chiave = o[`${campo}Chiave`]
    if (typeof chiave !== 'string') return typeof riserva === 'string' ? riserva : undefined
    const detto = testoDelServerR4(chiave, o[`${campo}Params`], '\u0000', lingua)
    if (detto !== '\u0000') return detto
    return typeof riserva === 'string' ? riserva : undefined
}

/* `testo-server.js:58-89` @ fc5e25d62 (invariato a 2161afb32): i fornitori con una parola italiana nel nome e gli stati di esecuzione mostrati dal Doctor. */
const NOMI_DEI_FORNITORI: Record<string, string> = {
    esterno: 'server.provider.label.externalAgent',
    'zai-anthropic': 'server.provider.label.zaiAnthropic',
    'minimax-anthropic': 'server.provider.label.minimaxAnthropic',
    local: 'server.provider.label.localEngine',
}
const ESECUZIONE_DEI_FORNITORI: Record<string, string> = {
    collegato: 'server.provider.execution.connected',
    'runtime locale': 'server.provider.execution.localRuntime',
    'motore locale': 'server.provider.execution.localEngine',
    configurato: 'server.provider.execution.configured',
    'da configurare': 'server.provider.execution.toConfigure',
    'da configurare sul computer': 'server.provider.execution.toConfigureOnComputer',
}

/** Il nome di un fornitore nella lingua: `label` del server, tranne per i quattro che hanno una parola italiana. */
export function nomeDelFornitoreR4(riga: { id?: unknown; label?: unknown } | null | undefined, lingua: string): string {
    const id = typeof riga?.id === 'string' ? riga.id : ''
    const chiave = Object.hasOwn(NOMI_DEI_FORNITORI, id) ? NOMI_DEI_FORNITORI[id] : undefined
    if (chiave && voce(chiave) !== undefined) return nellaLingua(chiave, lingua, undefined)
    return (typeof riga?.label === 'string' && riga.label) || id
}

/** Lo stato di esecuzione di un fornitore nella lingua; un valore che il dizionario non conosce torna com'è. */
export function esecuzioneDelFornitoreR4(valore: string, lingua: string): string {
    const chiave = Object.hasOwn(ESECUZIONE_DEI_FORNITORI, valore) ? ESECUZIONE_DEI_FORNITORI[valore] : undefined
    return chiave && voce(chiave) !== undefined ? nellaLingua(chiave, lingua, undefined) : valore
}

/** Le regole di r4 (`lingua.js` @ fc5e25d62 (invariato a 2161afb32)) riusate dagli altri dizionari d'area del mobile. */
export const regoleTestiR4 = { italiano, interpola, propria, regolePlurale: (lingua: string) => regolePlurale(italiano(lingua) ? 'it' : RISERVA) }
