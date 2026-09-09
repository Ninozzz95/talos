/**
 * ⛔⛔⛔ IL CANCELLO CONTRO IL TYPECHECK CHE NON CONTROLLA NIENTE.
 *
 * In `mobile/`, `tsconfig.json` è *solution-style*: contiene `"files": []` e
 * delega a `tsconfig.app.json` / `tsconfig.node.json` via `references`.
 *
 * ⇒ `tsc --noEmit -p tsconfig.json` **non guarda un solo file** ed esce 0
 * qualunque cosa ci sia nel codice.
 *
 * ## Perché un cancello e non una nota
 *
 * La nota c'era già, scritta il 2026-08-07 dopo aver fatto passare per
 * «verificati» tre round di modifiche che nessuno aveva guardato. Il
 * 2026-08-18 è successo di nuovo: quattro «typecheck verde» riportati
 * all'owner, tutti su zero file. Alla prima esecuzione del comando giusto —
 * `npm run typecheck` — sono comparsi **venti errori veri**, tutti da una riga
 * scritta quella notte.
 *
 * ⇒ Una regola che serve proprio quando si è convinti di ricordarla non può
 * vivere nella memoria di chi la deve applicare. E il numero lo dice: i divieti
 * decadono dal 73% al 33% fra il turno 5 e il turno 16.
 *
 * ⛔ Un comando di verifica che esce 0 la prima volta che lo si usa va provato
 * **con un errore deliberato** prima di fidarsene — vale per i typecheck come
 * per i test.
 */

/** Le forme che NON controllano niente, e la forma che controlla. */
const INUTILE = /\b(vue-)?tsc\b[^|;&]*?-p\s+(\.\/)?tsconfig\.json\b/
const INUTILE_PROGETTO = /\b(vue-)?tsc\b[^|;&]*?--project\s+(\.\/)?tsconfig\.json\b/

/**
 * ⛔ Anche `tsc --noEmit` da solo, lanciato dentro `mobile/`, prende il
 * `tsconfig.json` della cartella — cioè quello vuoto. Non serve nominarlo.
 */
const INUTILE_IMPLICITO = /\b(vue-)?tsc\s+(--noEmit|--build\s+false)?\s*$/

export const MOTIVO = '⛔ QUESTO TYPECHECK NON CONTROLLA NIENTE.\n\n'
    + 'In mobile/ il `tsconfig.json` ha "files": [] — è un file solution che delega\n'
    + 'a tsconfig.app.json e tsconfig.node.json. `tsc -p tsconfig.json` guarda ZERO\n'
    + 'file ed esce 0 sempre, qualunque errore ci sia.\n\n'
    + 'MISURATO due volte: il 2026-08-07 e di nuovo il 2026-08-18, quando quattro\n'
    + '«typecheck verde» erano su zero file e il comando giusto ne ha trovati venti.\n\n'
    + 'Usa:  npm run typecheck        (vue-tsc -b --force)\n\n'
    + 'E se un comando di verifica esce 0 la prima volta che lo usi, provalo con un\n'
    + 'errore deliberato prima di fidartene.'

/**
 * La decisione, come funzione pura — così si prova senza lanciare un processo.
 *
 * @param {object} input il payload dell'hook `PreToolUse`
 * @returns `null` per «lascia passare», o l'oggetto da stampare per fermare.
 */
export function decidiTypecheck(input) {
    const strumento = input?.tool_name ?? ''
    if (strumento !== 'Bash' && strumento !== 'PowerShell') return null

    const comando = String(input?.tool_input?.command ?? '')
    if (!comando) return null

    /*
     * ⛔ Solo dentro `mobile/`: negli altri progetti un `tsc -p tsconfig.json`
     * è legittimo, e un cancello che grida dove non serve viene spento.
     */
    if (!/mobile/.test(comando) && !/mobile/.test(String(input?.cwd ?? ''))) return null

    const colpevole = INUTILE.test(comando) || INUTILE_PROGETTO.test(comando)
        || INUTILE_IMPLICITO.test(comando.trim())
    if (!colpevole) return null

    return {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: MOTIVO,
        },
    }
}

/*
 * ⛔⛔ IL BASENAME ESATTO, e non `endsWith`.
 *
 * `prova-typecheck-vero.mjs`.endsWith('typecheck-vero.mjs') è **vero**: con
 * quella guardia il listener su stdin si attaccava dentro il file di prova e il
 * test restava appeso per sempre — nessun errore, solo silenzio.
 */
export function basenameDi(percorso) {
    /* ⛔ Tutt'e due i separatori: su Windows `process.argv[1]` usa il backslash,
     * e uno split sul solo `/` restituirebbe il percorso intero — cioè la
     * guardia non scatterebbe MAI e l'hook non funzionerebbe da hook. */
    return String(percorso ?? '').split(/[\\/]/).pop()
}

if (basenameDi(process.argv[1]) === 'typecheck-vero.mjs') {
    let grezzo = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (d) => { grezzo += d })
    process.stdin.on('end', () => {
        let input
        try {
            input = JSON.parse(grezzo || '{}')
        } catch {
            /* ⛔ Un payload illeggibile LASCIA PASSARE: un cancello che si rompe
             * e blocca tutto viene disattivato il giorno stesso. */
            process.exit(0)
        }
        const esito = decidiTypecheck(input)
        if (esito) {
            process.stdout.write(JSON.stringify(esito))
            process.exit(0)
        }
        process.exit(0)
    })
}
