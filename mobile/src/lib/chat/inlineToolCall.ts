/**
 * Una chiamata a uno strumento scritta dal modello COME TESTO, letta e resa vera.
 *
 * ## Il difetto (D-F1-2, ledger UI Calm, 12/09/2026)
 *
 * Nella chat «Which e-ink tablets» (GLM 5.3 Flash via OpenRouter) un messaggio
 * mostrava a schermo `</arg_key><arg_value>…</tool_call>`: il modello aveva
 * scritto la chiamata nel testo della risposta invece che nel campo
 * `tool_calls`, e l'adattatore cloud la passava alla bolla così com'era. Sul
 * motore locale lo stesso blocco viene già buttato (`thinkStream.ts`); qui
 * però buttarlo non basta: nessuno l'aveva eseguita, e la persona avrebbe
 * perso quello che il modello voleva fare.
 *
 * ## Le due forme riconosciute
 *
 * - JSON, quella dei template Qwen: `{"name": "x", "arguments": {...}}`.
 * - XML di GLM 4.5/4.6/5.x (la famiglia lo dichiara nel proprio template e
 *   llama.cpp la riconosce dai tag `<arg_key>`/`<arg_value>`, PR #15904 e
 *   #16932, letti il 12/09/2026):
 *   `nome\n<arg_key>k</arg_key>\n<arg_value>v</arg_value>…`.
 *   Ogni valore si prova come JSON e, se non lo è, resta una stringa.
 *
 * Tutto il resto torna `null`: un blocco che non si capisce non diventa una
 * chiamata a caso.
 */

export interface TalosInlineToolCall {
    name: string
    /** Gli argomenti già serializzati, come li porta `TalosToolCall`. */
    arguments: string
}

const NOME_VALIDO = /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/

function valoreGlm(grezzo: string): unknown {
    const testo = grezzo.trim()
    if (!testo) return ''
    try {
        return JSON.parse(testo)
    } catch {
        return testo
    }
}

function daJson(blocco: string): TalosInlineToolCall | null {
    let letto: unknown
    try {
        letto = JSON.parse(blocco)
    } catch {
        return null
    }
    if (!letto || typeof letto !== 'object') return null
    const nome = (letto as { name?: unknown }).name
    if (typeof nome !== 'string' || !NOME_VALIDO.test(nome)) return null
    const argomenti = (letto as { arguments?: unknown, parameters?: unknown }).arguments
        ?? (letto as { parameters?: unknown }).parameters
        ?? {}
    return {
        name: nome,
        arguments: typeof argomenti === 'string' ? argomenti : JSON.stringify(argomenti),
    }
}

function daGlm(blocco: string): TalosInlineToolCall | null {
    const primoTag = blocco.indexOf('<arg_key>')
    const nome = (primoTag < 0 ? blocco : blocco.slice(0, primoTag)).trim()
    if (!NOME_VALIDO.test(nome)) return null
    const argomenti: Record<string, unknown> = {}
    const coppia = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/g
    let m: RegExpExecArray | null
    let trovate = 0
    while ((m = coppia.exec(blocco))) {
        const chiave = m[1]!.trim()
        if (!chiave) continue
        argomenti[chiave] = valoreGlm(m[2]!)
        trovate += 1
    }
    // Un nome senza coppie è una chiamata senza argomenti solo se non c'è
    // nessun tag: un `<arg_key>` aperto e mai chiuso è un blocco troncato.
    if (trovate === 0 && primoTag >= 0) return null
    return { name: nome, arguments: JSON.stringify(argomenti) }
}

/**
 * Legge il CONTENUTO di un blocco `<tool_call>…</tool_call>` (senza i tag) e
 * torna la chiamata, o `null` se non è né JSON né la forma di GLM.
 */
export function talosParseInlineToolCall(blocco: string): TalosInlineToolCall | null {
    const testo = blocco.trim()
    if (!testo) return null
    return testo.startsWith('{') ? daJson(testo) : daGlm(testo)
}
