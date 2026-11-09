/*
 * ⛔ COD-207 (F-W-001, S2 dello stress test del telefono 0.1.47, Mobile 30/10/2026) — quando nel Codice manca un programma (git,
 *   npm, python3 escono con 127) il modello riceveva solo «not found» e ci riprovava due volte per programma.
 *
 * Concorrenti letti nel codice (30/10/2026): nessuno aggiunge un'indicazione al modello. Codex usa il 127 solo per dire «non è la
 *   sandbox» (`codex-rs/sandboxing/src/violation.rs:36-37`, `QUICK_REJECT_EXIT_CODES [2, 126, 127]`); Hermes completa il PATH
 *   perché i programmi installati si trovino (`tools/environments/local.py:719`, #111778); opencode niente.
 *
 * Forma approvata da CLI, Mobile e Performance (30/10/2026), con le loro correzioni:
 *   - una riga in inglese IN CODA all'esito; codice d'uscita e output restano identici; niente per i comandi in sottofondo;
 *   - il nome si prende SOLO dal messaggio d'errore (CLI e Mobile: nei comandi composti — `cd app && npm test` — il primo token è
 *     `cd`, e con `npm test` senza jest è npm a uscire 127: dire «"cd"/"npm" is not available» è peggio del silenzio); errore
 *     riconosciuto ma senza un nome leggibile ⇒ la riga non nomina niente; solo il codice 127 senza messaggio ⇒ niente riga;
 *   - ⛔ SICUREZZA (Mobile): il nome viene dallo stderr, cioè da fuori, e la riga sta FUORI dal confine dei dati. Passa solo un nome
 *     `[A-Za-z0-9._+-]{1,64}`; un nome con `/` o `\` è un FILE che manca, non un programma ⇒ niente riga;
 *   - «is not available in this environment», mai «not installed» (CLI: il 127 può venire anche da un PATH ristretto);
 *   - sul telefono gli attrezzi si nominano col loro nome VERO e solo se offerti in quel giro (Mobile: nel Piano `scrivi` e
 *     `file_edit` non ci sono);
 *   - una volta per programma per giro: cambiare solo gli argomenti dello stesso programma non la ripete;
 *   - la riga è per il modello: `testoPerLoSchermo` (confine-dati.mjs) la toglie da ciò che vede la persona.
 */

/** Messaggi d'errore che nominano il programma mancante: bash, sh/dash, la shell di Android, cmd.exe (inglese e italiano), PowerShell.
 *  ⛔ Misurato su questo PC (Windows 11 in italiano, 30/10/2026): cmd.exe lanciato dal nucleo scrive il nome fra virgolette DOPPIE,
 *  la «è» arriva rovinata dalla codepage («non � riconosciuto»), e il codice d'uscita è 1, non 9009. */
/* ⛔ Mobile, 30/10/2026 (falso positivo): una suite che esce 1 e stampa «bash: line 1: git: command not found» in una riga di log
   ricevava la riga, e il modello veniva spinto a non ritentare un comando che non aveva quel problema. ⇒ Ogni forma è ANCORATA a
   inizio riga col prefisso della sua shell, e le forme Unix valgono SOLO col codice 127; cmd e PowerShell con ogni codice ≠ 0
   (cmd esce con 1, misurato). */
const FORME_UNIX = [
    /^(?:\S*\/)?(?:ba|da|z)?sh: (?:line \d+: )?([^\s:'"`]+): command not found$/mu,
    /^(?:\S*\/)?(?:da)?sh: \d+: ([^\s:'"`]+): not found$/mu,
    /^(?:\S*\/)?sh: ([^\s:'"`]+): inaccessible or not found$/mu, // Android, /system/bin/sh (stress 0.1.47)
    /^(?:\S*\/)?zsh: command not found: ([^\s:'"`]+)$/mu, // zsh, ordine rovesciato (Mobile 30/10)
]
const FORME_WINDOWS = [
    /^['"]([^'"\n]+)['"] is not recognized as an internal or external command/mu,
    /^['"]([^'"\n]+)['"] non .{1,2} riconosciuto come comando interno o esterno/mu,
    /^(?:\S+ : )?The term ['"]([^'"\n]+)['"] is not recognized as (?:the )?name of a cmdlet/mu,
]
/** Il nome che può salire fuori dal confine dei dati. Tutto il resto ⇒ la riga non lo nomina. */
const NOME_SICURO = /^[A-Za-z0-9._+-]{1,64}$/u
/** Gli attrezzi dei file che sostituiscono git, npm, python sul telefono — coi nomi che il modello vede. */
const ATTREZZI_AL_POSTO = ['leggi', 'scrivi', 'file_edit', 'cerca', 'elenca']

/**
 * Il programma mancante di un comando finito, o `null` se l'esito non è un «comando non trovato» riconoscibile dal messaggio.
 * ⇒ `{ nome }`, con `nome` stringa sicura o `null` (riconosciuto, ma senza un nome che si possa ripetere).
 * Un nome con `/` o `\` è un file che manca (`./x.sh`): `null` del tutto, niente riga.
 */
export function programmaMancante({ codice, testo }) {
    if (codice === 0 || codice === null || codice === undefined) return null
    const scritto = typeof testo === 'string' ? testo : ''
    for (const forma of codice === 127 ? [...FORME_UNIX, ...FORME_WINDOWS] : FORME_WINDOWS) {
        const trovato = forma.exec(scritto)
        if (!trovato) continue
        const nome = trovato[1]
        if (/[/\\]/u.test(nome)) return null
        return { nome: NOME_SICURO.test(nome) ? nome : null }
    }
    return null
}

/** La riga in coda all'esito della shell. `mobile`: il telefono; `attrezzi`: i nomi degli attrezzi offerti in questo giro. */
export function rigaProgrammaMancante({ nome, mobile = false, attrezzi = null }) {
    const chi = nome ? `"${nome}" is` : 'A program in this command is'
    let consiglio = 'Tell the person it is missing, or reach the goal another way.'
    if (mobile) {
        const offerti = ATTREZZI_AL_POSTO.filter((a) => !attrezzi || attrezzi.has(a))
        consiglio = offerti.length > 0
            ? `This device has no ${nome ? `"${nome}"` : 'such program'}: use your tools (${offerti.join(', ')}) instead.`
            : `This device has no ${nome ? `"${nome}"` : 'such program'}: reach the goal another way.`
    }
    return `[TALOS] ${chi} not available in this environment; retrying the same command will fail again. ${consiglio}`
}

/**
 * La nota da aggiungere all'esito, una volta per programma per giro (`detti`: un Set del giro). `''` se non serve.
 * Cambiare solo gli argomenti dello stesso programma non la ripete; un errore senza nome certo la dice una volta sola.
 */
export function notaProgrammaMancante({ codice, testo, mobile = false, attrezzi = null, detti, piattaforma = process.platform, ambiente = process.env }) {
    const trovato = programmaMancante({ codice, testo })
    if (!trovato) return ''
    const chiave = trovato.nome ?? ''
    if (detti?.has(chiave)) return ''
    detti?.add(chiave)
    /* Correzione del Mobile (30/10 sera): `mobile` vuol dire «telefono attaccato al PC via adb» (`body.client === 'mobile'`); r4 che gira
       DENTRO il telefono non lo manda (`useConversazioneR4.ts:1117`), e la riga del telefono non scattava proprio dove è nata (F-W-001).
       La verità di «sono sul telefono» è la piattaforma, come `shellDeiComandi(piattaforma = process.platform)`: il Node del Pad è
       `android`. Parametro, così si prova sul PC.
       ⛔ CLI (30/10 sera): sotto TERMUX anche la CLI ha `android`, ma lì la shell è un Linux vero e il programma si installa
       (`pkg install git`): il consiglio giusto è quello del PC. Termux si riconosce come di solito, da `TERMUX_VERSION` o dal `PREFIX`. */
    const suTermux = Boolean(ambiente?.TERMUX_VERSION) || /com\.termux/u.test(ambiente?.PREFIX ?? '')
    const sulTelefono = mobile === true || (piattaforma === 'android' && !suTermux)
    return rigaProgrammaMancante({ nome: trovato.nome, mobile: sulTelefono, attrezzi })
}
