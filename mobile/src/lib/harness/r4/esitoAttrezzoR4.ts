/**
 * ⛔ ESITO-RIGA (Pad, 27/10/2026, prova dal vivo con la CLI): la scrittura nella cartella bloccata è stata rifiutata dal PC, ma la
 * riga «Scrittura di un file» sul dispositivo era identica a una riuscita, perché l'esito di `ToolCallResult` si buttava. Desktop,
 * 27/10: «parità, copia il PC». Questo modulo è la decisione del PC portata 1:1 da r4 @ c5ce4e453:
 * - l'ordine di `legacy/app.js:23388` (`impostaEsitoRiga`): doppione, interrotta, non eseguita, errore;
 * - «fallito» di `esitoAttrezzoFallito` (`app.js:16081`) con `leggiEsitoComando` ed `esitoDichiaraFallimento`
 *   (`components/esito-comando.js`), le sue prove in `esitoAttrezzoR4.test.ts`.
 * In più, PRIMA del testo, la ricevuta (contratto Desktop/CLI del 27/10): `receipt.status` 'denied' o `consentito: false`, e
 * 'failed'; senza ricevuta `isError: true`. Il testo resta il ripiego finché i rifiuti in anticipo del kernel non portano la
 * ricevuta (K1): senza, il dispositivo direbbe verde dove il PC dice rosso.
 */
import type { TalosEsitoAttrezzo } from '@/lib/chat/sequenzaDelTurno'

/** L'intestazione che il kernel antepone all'esito di un comando; il codice può essere `null` (nessun codice d'uscita). */
const INTESTAZIONE = /^exit (-?\d+|null)(?: \[sandbox: ([^\]]*)\])?\n?/u
/** Le righe che il server mette PRIMA dell'intestazione e parlano al modello (`separaLeRigheDelModello`). */
const AVVISO_CANALE_COMBINATO = '[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]\n'
const AVVISO_POWERSHELL = /^⚠ SHELL_DIAGNOSTIC_WITH_ZERO_EXIT: [^\n]*\n/u

/* H-05 (owner 02/10/2026): NOT FOUND, AMBIGUOUS e INVALID sono un no del kernel come REFUSED. NO CHANGE no. */
const INIZIO_FALLITO = /^(?:REFUSED\.|NOT FOUND\.|AMBIGUOUS\.|INVALID\.|ERROR\b|ERRORE\b|FAILED\b|FALLITO\b|NON RIUSCITO\b)/i
const ALIAS_ESITO_FALLITO: Readonly<Record<string, readonly string[]>> = { web_search: ['search'], delega_sottotask: ['delegation'] }
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface EsitoComandoR4 {
    /** Se c'è l'intestazione del kernel: senza, non è l'esito di un comando. */
    comando: boolean
    riuscito: boolean
    /** 130/143: fermato su richiesta o SIGTERM. */
    annullato: boolean
    /** 124/137: fermato dal tempo o SIGKILL. */
    terminato: boolean
    /** T8 (27/10/2026): il codice d'uscita (`null` = nessun codice), il posto come lo scrive il kernel, e l'output da mostrare. */
    uscita: number | null
    livello: string | null
    output: string
}

/*
 * T8: la riga che il server mette subito DOPO l'intestazione quando conserva l'output (`senzaRiferimentoOutput` di
 * `esito-comando.js`): parla al MODELLO, in inglese e con un identificativo. Si toglie solo la forma esatta, solo in testa.
 * CDF-04 (27/10/2026): anche la forma di un comando ancora in sottofondo (r4 b377932e7 `process-output-session.mjs:65`), che la
 * regex del desktop non copre. La riga «[TALOS output retention failed …]» resta: dice una cosa vera.
 */
const RIFERIMENTO_OUTPUT = /^\[TALOS output reference: [0-9a-f-]{36}; (?:retained \d+ of \d+ bytes(?:; the retention limit was reached)?|the command is still running in the background: \d+ bytes retained up to that point(?: \(the retention limit was reached\))?; what it prints next goes to its output file)\.\](?: Read retained bytes with process_output\(\{"outputId":"[0-9a-f-]{36}"\}\); follow nextOffset, and select stderr separately\.)?(?:\n|$)/u

/** `leggiEsitoComando` senza le parole (verdetto e posto li dice `corpoAttrezzoR4.ts`, caricato a richiesta coi dizionari). */
export function leggiEsitoComandoR4(grezzo: string): EsitoComandoR4 {
    let testo = String(grezzo ?? '')
    // l'avviso di PowerShell («NOT VERIFIED») resta nell'output: dice una cosa vera sul comando (`separaLeRigheDelModello`)
    let avvisi = ''
    for (let giro = 0; giro < 2; giro += 1) {
        if (testo.startsWith(AVVISO_CANALE_COMBINATO)) { testo = testo.slice(AVVISO_CANALE_COMBINATO.length); continue }
        const powershell = AVVISO_POWERSHELL.exec(testo)
        if (powershell) { avvisi += powershell[0]; testo = testo.slice(powershell[0].length) }
    }
    const trovato = INTESTAZIONE.exec(testo)
    if (!trovato) return { comando: false, riuscito: false, annullato: false, terminato: false, uscita: null, livello: null, output: String(grezzo ?? '') }
    const uscita = trovato[1] === 'null' ? null : Number(trovato[1])
    return {
        comando: true,
        riuscito: uscita === 0,
        annullato: uscita === 130 || uscita === 143,
        terminato: uscita === 124 || uscita === 137,
        uscita,
        livello: trovato[2] ? trovato[2].trim() : null,
        output: `${avvisi}${testo.slice(trovato[0].length).replace(RIFERIMENTO_OUTPUT, () => '')}`,
    }
}

/** Vero se l'esito testuale di un attrezzo (non `shell`, non `prova`: hanno il loro contratto) dichiara un fallimento. */
export function esitoDichiaraFallimento(nome: string, testo: string): boolean {
    const t = String(testo ?? '').trim()
    if (INIZIO_FALLITO.test(t)) return true
    const nomi = [String(nome ?? ''), ...(ALIAS_ESITO_FALLITO[nome] ?? [])].filter(Boolean)
    return nomi.some((n) => new RegExp(`^${escapeRegex(n)} failed(?: \\[[A-Z0-9_]+\\])?:`, 'u').test(t))
}

/** `esitoAttrezzoFallito` del PC: la prova dai test rossi, il comando dal codice d'uscita, il resto dal contratto del kernel. */
export function esitoAttrezzoFallito(nome: string, testo: string): boolean {
    if (nome === 'prova') return /ℹ?\s*fail\s+([1-9]\d*)/i.test(testo)
    if (nome === 'shell') {
        const esito = leggiEsitoComandoR4(testo)
        return esito.comando && !esito.riuscito && !esito.annullato && !esito.terminato
    }
    return esitoDichiaraFallimento(nome, testo)
}

/** La prova, il QR a remoto spento e il file oltre i 25 MB non sono partiti: «non eseguita», mai un errore (`app.js:23357`). */
function nonEseguita(nome: string, testo: string): boolean {
    return (nome === 'prova' && /^\s*NOT RUN:/u.test(testo))
        || (nome === 'remote_phone_pair' && /^REFUSED\. Remote control is (?:off|not available)/u.test(testo))
        || (nome === 'remote_device_send_file' && /^REFUSED\. FILE_TOO_LARGE:/u.test(testo))
}

/**
 * Rifiutata o non riuscita secondo la ricevuta, o secondo `isError`; `null` = non lo dicono, decide il testo.
 * ⛔ Desktop 27/10: `effect_unknown` NON è un fallimento e nemmeno una riuscita: resta al contratto del testo, come il PC.
 */
function fallitaPerLaRicevuta(evento: Record<string, unknown>): boolean | null {
    const ricevuta = evento.receipt
    if (ricevuta && typeof ricevuta === 'object') {
        const { status, consentito } = ricevuta as Record<string, unknown>
        if (status === 'denied' || status === 'failed' || consentito === false) return true
        if (status === 'succeeded') return false
    }
    return evento.isError === true ? true : null
}

/**
 * L'esito della riga per un `ToolCallResult`, o `undefined` se è riuscita. Il testo si guarda nei primi 4000 caratteri, come il PC.
 * ⛔ Una ricevuta che dice «riuscita» vince sul testo: il testo è il ripiego per chi non ha la ricevuta, non un secondo giudice.
 */
export function esitoDellaChiamataR4(nome: string, evento: Record<string, unknown>): TalosEsitoAttrezzo | undefined {
    if (evento.duplicate === true) return 'doppione'
    const testo = String(evento.content ?? '').slice(0, 4000)
    if (nome === 'shell') {
        const comando = leggiEsitoComandoR4(testo)
        if (comando.annullato || comando.terminato) return 'interrotta'
    }
    if (nonEseguita(nome, testo)) return 'non-eseguita'
    const perLaRicevuta = fallitaPerLaRicevuta(evento)
    const fallita = perLaRicevuta ?? esitoAttrezzoFallito(nome, testo)
    return fallita ? 'errore' : undefined
}
