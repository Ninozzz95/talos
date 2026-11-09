/*
 * R-58 (02/11/2026, forma `performance-2026-10-29/FORMA-R58-RIPARTENZA-SU-PROVA-ROSSA-2026-11-02.md`, OK di CLI, Mobile e Desktop):
 * la ripartenza R-53 guarda l'ultimo COMANDO; qui si guarda l'ultima PROVA. Caso misurato: G-confine r5 (campagna pubblica-luna-491251d6f),
 * suite del kernel exit 1, poi `git status` e `git diff` verdi, chiusura senza ripartenza. Su 161 corse: 13 con «ultima prova rossa,
 * ultimo comando verde», 2 fallite.
 * Concorrenti letti nel codice: Codex lo lascia al prompt («Do not attempt to fix unrelated bugs or broken tests … You may mention them»,
 * `codex-rs/core/gpt_5_2_prompt.md:124`); Hermes lo controlla solo prima di partire, nei suoi agenti delegati («[Pre-flight] tests pass?»,
 * `optional-skills/software-development/subagent-driven-development/references/gates-taxonomy.md:82`). Qui il controllo sta nel ciclo.
 *
 * Tre regole della forma, scritte qui perché si leggono male dal codice:
 * - un comando è «di prove» se UN suo pezzo (`&&`, `||`, `;`, `|`, a capo) lancia un esecutore di prove riconosciuto dal NOME del programma
 *   (più il sottocomando): `cat test.log`, `grep pytest`, `ls tests` non sono prove;
 * - il riepilogo letto nell'uscita spinge solo verso il rosso, mai verso il verde (con `npm test | tail` il codice d'uscita è quello di `tail`);
 * - un comando di shell che non è di sola lettura, finito con 0, conta come modifica dei file (`sed -i`, un formattatore, `git apply`):
 *   nell'incertezza conta come modifica, perché il costo di un risveglio in più è di pochi secondi.
 */

/* I pezzi di una riga di comando: si divide su `&&`, `||`, `;`, `|` e a capo, mai dentro le virgolette (`grep "a|b"` è un pezzo solo). */
const pezziDelComando = (comando) => {
    const testo = String(comando ?? '')
    const pezzi = []
    let corrente = ''
    let virgoletta = null
    for (let i = 0; i < testo.length; i += 1) {
        const c = testo[i]
        if (virgoletta) { if (c === virgoletta) virgoletta = null; corrente += c; continue }
        if (c === '"' || c === "'") { virgoletta = c; corrente += c; continue }
        /* `&` singolo: in cmd.exe separa i comandi, in bash manda in sottofondo; in tutti e due il pezzo dopo è un comando a sé (revisione
           della CLI, C). Non divide `2>&1`, `>&2` né `&>file`. */
        const eSeparatoreE = c === '&' && (testo[i + 1] === '&' || (testo[i - 1] !== '>' && testo[i + 1] !== '>'))
        if (c === ';' || c === '\n' || c === '\r' || c === '|' || eSeparatoreE) {
            if ((c === '&' && testo[i + 1] === '&') || (c === '|' && testo[i + 1] === '|')) i += 1
            pezzi.push(corrente); corrente = ''; continue
        }
        corrente += c
    }
    pezzi.push(corrente)
    return pezzi.map((pezzo) => pezzo.trim()).filter(Boolean)
}
const paroleDi = (pezzo) => {
    /* le virgolette tengono insieme un percorso con spazi: `"C:\Program Files\nodejs\node.exe" --test` */
    const parole = (pezzo.match(/"[^"]*"|'[^']*'|\S+/gu) ?? []).map((p) => p.replace(/^["']|["']$/gu, ''))
    while (parole.length && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(parole[0])) parole.shift() // `FOO=1 npm test`
    if (/^(?:env|time|nice|sudo|command|exec)$/iu.test(parole[0] ?? '')) parole.shift()
    return parole
}
/* `C:\x\node.exe`, `./gradlew`, `npm.cmd` → `node`, `gradlew`, `npm` */
const nomeDelProgramma = (parola) => String(parola ?? '').replace(/^.*[\\/]/u, '').replace(/\.(?:exe|cmd|bat|ps1)$/iu, '').toLowerCase()

/* Il file che `node` esegue: la prima parola che non è un'opzione, saltando il valore delle opzioni che ne hanno uno
   (`node --import tsx tests/x.mjs`, `node -r ts-node/register test/a.spec.ts`: seconda lettura della CLI). */
const OPZIONI_NODE_CON_VALORE = /^(?:--import|--require|-r|--loader|--experimental-loader|--env-file|--conditions|-C|--input-type|--watch-path)$/u
const fileDelloScript = (argomenti) => {
    for (let i = 0; i < argomenti.length; i += 1) {
        if (OPZIONI_NODE_CON_VALORE.test(argomenti[i])) { i += 1; continue }
        if (!argomenti[i].startsWith('-')) return argomenti[i]
    }
    return ''
}
/* «test» come PAROLA del percorso (`run-tests`, `a.test`, `tests/…`, `test-unit`), mai dentro un'altra parola (`fetch-latest`,
   `attestation`: revisione della CLI, B), e mai un aiutante delle prove (`test_utils`, `tests/helpers`, `test/setup`: seconda lettura). */
const AIUTANTE_DELLE_PROVE = /(?:^|[._-])(?:utils?|helpers?|setup|fixtures?|support|common|mocks?)$/iu
const eFileDiProve = (percorso) => {
    const senzaEstensione = String(percorso ?? '').replace(/\.[cm]?[jt]sx?$/iu, '')
    const nome = senzaEstensione.replace(/^.*[\\/]/u, '')
    return /(?:^|[\\/._-])(?:tests?|spec)(?:[\\/._-]|$)/iu.test(senzaEstensione) && !AIUTANTE_DELLE_PROVE.test(nome)
}

const RUNNER_DIRETTI = new Set(['vitest', 'jest', 'pytest', 'rspec', 'phpunit', 'tox', 'mocha', 'ava'])
const SOTTOCOMANDO_TEST = /^(?:test|t)$/iu

const ePezzoDiProve = (pezzo) => {
    const parole = paroleDi(pezzo)
    const nome = nomeDelProgramma(parole[0])
    const a1 = String(parole[1] ?? '').toLowerCase()
    const a2 = String(parole[2] ?? '').toLowerCase()
    if (RUNNER_DIRETTI.has(nome)) return true
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(nome)) {
        /* `npm --prefix harness-ui test`, `pnpm -C web run test:unit`: le opzioni (e il valore di quelle che ne hanno uno) non sono il sottocomando */
        const resto = []
        for (let i = 1; i < parole.length; i += 1) {
            if (/^(?:--prefix|-C|--dir|--cwd|--filter|-F|-w|--workspace)$/u.test(parole[i])) { i += 1; continue }
            if (!parole[i].startsWith('-')) resto.push(parole[i].toLowerCase())
        }
        const [s1 = '', s2 = ''] = resto
        return SOTTOCOMANDO_TEST.test(s1) || (s1 === 'run' && /^test/u.test(s2)) || /^test[:\-]/u.test(s1)
    }
    if (['npx', 'bunx', 'pnpx'].includes(nome)) return ['vitest', 'jest', 'playwright', 'mocha', 'ava'].includes(nomeDelProgramma(a1)) && (nomeDelProgramma(a1) !== 'playwright' || a2 === 'test')
    if (nome === 'playwright') return a1 === 'test'
    if (['cargo', 'go', 'deno', 'dotnet', 'mvn', 'mvnw', 'gradle', 'gradlew', 'make'].includes(nome)) return a1 === 'test'
    /* «test» come PAROLA del percorso del file: `run-tests`, `a.test`, `tests/…`, `test-unit`; mai dentro un'altra parola
       (`fetch-latest`, `attestation`: revisione della CLI, B) */
    if (nome === 'node') return parole.slice(1).some((p) => p === '--test') || eFileDiProve(fileDelloScript(parole.slice(1)))
    if (/^python[0-9.]*$|^py$/u.test(nome)) return a1 === '-m' && ['pytest', 'unittest'].includes(a2)
    if (nome === 'uv') return a1 === 'run' && nomeDelProgramma(a2) === 'pytest'
    if (nome === 'bundle') return a1 === 'exec' && ['rspec', 'rake'].includes(a2)
    if (nome === 'php') return a1 === 'artisan' && a2 === 'test'
    return false
}

/** R-58: la riga di comando lancia delle prove (basta un suo pezzo). */
export const eComandoDiProve = (comando) => pezziDelComando(comando).some(ePezzoDiProve)

/*
 * Riepiloghi degli esecutori più usati, solo nel verso del rosso, e ognuno SOLO sulla riga di riepilogo del suo esecutore: i nomi delle prove
 * passate si stampano anch'essi, e una prova verde che si chiama «counts 2 failed requests» non è un rosso (revisione della CLI, A: lo era,
 * anche per R-53). Con il riepilogo di node:test nell'uscita conta solo quello.
 * Limite noto: `npm test | tail -3` taglia il riepilogo di node:test (circa 8 righe prima della fine); lì resta il codice d'uscita, come prima.
 */
const RIEPILOGO_NODE_TEST = /^\s*(?:#|ℹ)\s*fail\s+(\d+)\s*$/gmu
const RIEPILOGHI_ROSSI = [
    /^\s*Test(?:s| Files)\s+[1-9]\d* failed\b/mu, // vitest «      Tests  2 failed | 5 passed (7)», «Test Files  1 failed | …»
    /^\s*Tests:\s+[1-9]\d* failed\b/mu, // jest «Tests:       1 failed, 3 passed, 4 total»
    /^=+ .*\b[1-9]\d* failed\b.*=+\s*$/mu, // pytest «===== 2 failed, 10 passed in 0.31s =====»
    /^\s*[1-9]\d* failed(?:, .*)? in [\d.]+s\s*$/mu, // pytest -q «2 failed, 3 passed in 0.05s» (seconda lettura della CLI)
    /^\s*[1-9]\d* failed\s*$/mu, // playwright, riga sua «  2 failed»
    /^\s*\d+ examples?, [1-9]\d* failures?\b/mu, // rspec «3 examples, 1 failure»
    /^\s*(?:Failures|Errors):\s*[1-9]/mu, // phpunit
    /^FAILED \((?:failures|errors)=[1-9]/mu, // unittest
    /^test result: FAILED\b/mu, // cargo
    /^(?:--- FAIL:|FAIL\s)/mu, // go
]
/** R-58: l'uscita contiene un riepilogo con almeno un errore. Mai prova del verde. */
export const riepilogoRosso = (testo) => {
    if (typeof testo !== 'string') return false
    const nodeTest = [...testo.matchAll(RIEPILOGO_NODE_TEST)]
    if (nodeTest.length) return nodeTest.some((m) => Number(m[1]) > 0)
    return RIEPILOGHI_ROSSI.some((re) => re.test(testo))
}

/**
 * L'esito di un comando finito: rosso se il codice non è 0 oppure, per un comando di prove, se l'uscita ne riporta un errore.
 * La stessa funzione per R-53 e per R-58 (revisione del Mobile, S1-2).
 */
export const comandoFinitoRosso = ({ comando, codice, testo, diProve = eComandoDiProve(comando) }) =>
    codice !== 0 || (diProve === true && riepilogoRosso(testo))

/* Programmi che non scrivono nel progetto. `git` solo coi sottocomandi di lettura. Una ridirezione verso un file rende il pezzo una
   scrittura (`2>&1`, `>/dev/null`, `>nul` no). */
const SOLA_LETTURA = new Set(['ls', 'dir', 'cat', 'type', 'head', 'tail', 'less', 'more', 'grep', 'rg', 'egrep', 'fgrep', 'findstr', 'wc', 'pwd',
    'echo', 'printf', 'which', 'where', 'whoami', 'stat', 'file', 'du', 'df', 'tree', 'sort', 'uniq', 'cut', 'diff', 'cmp', 'jq', 'date', 'env',
    'cd', 'pushd', 'popd', 'true', 'test', 'get-content', 'get-childitem', 'select-string', 'get-item', 'test-path', 'get-location', 'gc', 'gci',
    'sls', 'measure-object', 'select-object', 'format-table', 'write-output', 'write-host', 'resolve-path', 'basename', 'dirname', 'realpath',
    'readlink', 'sha256sum', 'md5sum', 'certutil', 'xxd', 'od', 'hexdump', 'nl', 'column', 'awk', 'tasklist', 'ps'])
const GIT_LETTURA = new Set(['status', 'diff', 'log', 'show', 'blame', 'grep', 'rev-parse', 'ls-files', 'describe', 'shortlog', 'cat-file',
    'ls-tree', 'branch', 'remote', 'config', 'reflog', 'help', 'version', '--version'])
const RIDIREZIONE_IN_FILE = /(?:^|[^0-9&])>{1,2}\s*(?!&|\/dev\/null|nul\b|\$null)\S/iu

const ePezzoDiSolaLettura = (pezzo) => {
    if (RIDIREZIONE_IN_FILE.test(pezzo)) return false
    const parole = paroleDi(pezzo)
    const nome = nomeDelProgramma(parole[0])
    if (!nome) return true
    if (nome === 'git') {
        const sotto = parole.slice(1).find((p) => !p.startsWith('-') || p === '--version') ?? ''
        if (sotto === 'branch' || sotto === 'remote' || sotto === 'config') return parole.slice(2).every((p) => p.startsWith('-') && !/^-(?:d|D|m|M|c|C)$|^--(?:delete|move|copy|unset|add|replace-all)/u.test(p))
        return GIT_LETTURA.has(sotto)
    }
    if (nome === 'find') return !parole.some((p) => ['-delete', '-exec', '-execdir', '-ok', '-fprint', '-fprintf', '-fls'].includes(p))
    if (nome === 'sed') return !parole.some((p) => /^-[a-zA-Z]*i/u.test(p) || p.startsWith('--in-place'))
    if (nome === 'awk') return !parole.some((p) => /inplace/u.test(p))
    return SOLA_LETTURA.has(nome) || ePezzoDiProve(pezzo)
}

/**
 * R-58 (revisione del Mobile, S2-1): la riga di comando PUÒ aver scritto nel progetto. Nell'incertezza sì. Le prove contano come lettura:
 * un rosso che nasce da loro non diventa «file modificati» da solo.
 */
export const comandoCheModifica = (comando) => {
    const pezzi = pezziDelComando(comando)
    return pezzi.length > 0 && !pezzi.every(ePezzoDiSolaLettura)
}

/**
 * R-58: si riapre una volta sola (la stessa di R-53, che scatta per prima) se l'ultima prova del giro è rossa e il giro ha modificato file.
 * Le altre condizioni sono quelle di R-53, nella stessa forma.
 */
export const deveRiaprireSuProvaRossa = ({ provaRossa, fileModificati, giaRiaperto, giro, giriMassimi, finishReason, motoreLocale, testo, fermato, rifiutata, tagliata, passiMinimi }) =>
    provaRossa === true && fileModificati === true && giaRiaperto !== true && fermato !== true && rifiutata !== true && !tagliata && motoreLocale !== true
    && giro >= passiMinimi && giro + 1 < giriMassimi
    && (finishReason === null || finishReason === undefined || finishReason === 'stop')
    && String(testo ?? '').trim() !== ''
