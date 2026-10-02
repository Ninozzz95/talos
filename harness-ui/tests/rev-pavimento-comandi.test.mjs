/*
 * ⛔⛔⛔ N-02 (owner 02/10/2026, «il pavimento di Hermes di oggi, per intero», parti 1+2+3) — `src/kernel/pavimento-comandi.mjs`.
 *   Le prove di Hermes sono la SPECIFICA: i loro casi stanno in `aiuto/pavimento-casi-hermes.json`, estratti dai file di
 *   Hermes senza ritocchi; qui si dice solo che cosa ci si aspetta da ciascuna lista, come nelle loro funzioni di prova.
 *   ⛔ Le prove dalla porta del kernel NON eseguono mai un comando: l'esecutore è finto (`eseguiComandoSandboxatoFn`), così
 *   un mutante che spegne il pavimento non può far girare `rm -rf /` sul disco vero.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import {
    rilevaComandoSenzaRecupero, sudoDaStdin, comandoCancellaIlRuntime, bloccoDelPavimento, rifiutoDelPavimento, percorsoCanonico,
    percorsiDelRuntime, tokenConEstremi, estremiPatternGrep, shlexDividi, DESCRIZIONE_PAYLOAD_ILLEGGIBILE, DESCRIZIONE_LIMITE_PARSER,
} from '../src/kernel/pavimento-comandi.mjs'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'
import { generaCorpusPavimento } from './aiuto/genera-corpus-pavimento.mjs'

const CASI = JSON.parse(readFileSync(new URL('./aiuto/pavimento-casi-hermes.json', import.meta.url), 'utf8'))
const lista = (file, nome) => {
    const v = CASI[file].costanti[nome] ?? CASI[file].parametri[nome]?.valori
    assert.ok(Array.isArray(v) && v.length, `${file} ${nome}: lista assente`)
    return v
}
const BLOCCO = 'test_hardline_blocklist.py', VIRGOLETTE = 'test_hardline_escaped_quote_state.py'
const GREP = 'test_approval_grep_in_substitution.py', ESECUZIONE = 'test_execution_flag_detection.py'
const bloccati = (casi, nome) => { for (const c of casi) assert.ok(rilevaComandoSenzaRecupero(c), `${nome}: doveva fermare ${JSON.stringify(c)}`) }
const lasciati = (casi, nome) => {
    for (const c of casi) {
        assert.equal(rilevaComandoSenzaRecupero(c), null, `${nome}: NON doveva fermare ${JSON.stringify(c)}`)
        assert.equal(bloccoDelPavimento(c), null, `${nome}: nemmeno il resto del pavimento, ${JSON.stringify(c)}`)
    }
}

test('PAV-01 (Hermes, test_hardline_blocklist): ciò che il pavimento ferma', () => {
    bloccati(lista(BLOCCO, '_HARDLINE_BLOCK'), '_HARDLINE_BLOCK')
    bloccati(lista(BLOCCO, '_QUOTED_NEWLINE_THREATS_BLOCK'), '_QUOTED_NEWLINE_THREATS_BLOCK')
    bloccati(lista(BLOCCO, '_COMMAND_POSITION_ROOT_WIPES'), '_COMMAND_POSITION_ROOT_WIPES')
    bloccati(lista(BLOCCO, '_TRUE_POSITIVES_93392'), '_TRUE_POSITIVES_93392')
    // test_yolo_env_var_cannot_bypass_hardline e test_hardline_patterns_unchanged (liste dentro la funzione)
    bloccati(['rm -rf /', 'rm -rf "/"', 'rm -rf "$HOME"', 'rm -rf ${HOME}', 'shutdown -h now', 'mkfs.ext4 /dev/sda', 'reboot',
        'echo "$(rm -rf /)"', 'sudo shutdown -h now'], 'liste interne')
})

test('PAV-02 (Hermes, test_hardline_blocklist): ciò che il pavimento NON ferma — prosa, dati fra virgolette, percorsi veri', () => {
    lasciati(lista(BLOCCO, '_HARDLINE_ALLOW'), '_HARDLINE_ALLOW')
    lasciati(lista(BLOCCO, '_QUOTED_NEWLINE_DATA_ALLOW'), '_QUOTED_NEWLINE_DATA_ALLOW')
    lasciati(lista(BLOCCO, '_QUOTED_PROSE_ALLOW_93392'), '_QUOTED_PROSE_ALLOW_93392')
    // in Hermes questa lista non ha una funzione di prova: il suo commento dice «must NOT fire» e la si prende alla lettera
    lasciati(lista(BLOCCO, '_DATA_ARG_NOT_A_COMMAND'), '_DATA_ARG_NOT_A_COMMAND')
    lasciati(['rm -rf /tmp', 'rm -rf /home/user/x', 'rm -rf /.ssh', 'rm -rf /.config', 'rm -rf ./build', 'rm -rf /opt/foo', 'rm -rf /...',
        'rm -rf /....', 'rm -rf /.foo'], 'test_root_collapse_pattern_leaves_real_paths_alone')
    lasciati(['gh pr create --title "block (reboot) spellings"', 'git commit -m "(rm -rf /) note"', 'echo "(reboot)"', 'echo "{ reboot; }"',
        "echo '(poweroff)'", 'find . -name "*(reboot)*"'], 'test_quoted_paren_brace_prose_not_blocked_under_yolo')
    lasciati(['rm -rf /tmp/x', 'chmod -R 777 .', 'git reset --hard', 'git push --force'], 'test_recoverable_dangerous_commands_still_pass_yolo')
})

test('PAV-03 (Hermes): a capo di continuazione, virgolette scappate, grep dentro le sostituzioni — con la descrizione GIUSTA', () => {
    for (const [c, pezzo] of lista(BLOCCO, '_HARDLINE_LINE_CONTINUATION')) assert.match(rilevaComandoSenzaRecupero(c) ?? '', new RegExp(pezzo, 'u'), JSON.stringify(c))
    lasciati(lista(VIRGOLETTE, 'test_escaped_quotes_in_a_valid_grep_pattern_are_not_malformed'), 'virgolette scappate in un grep')
    for (const [c, descrizione] of lista(VIRGOLETTE, 'test_escaped_quote_before_a_hardline_command_does_not_hide_it')) {
        assert.equal(rilevaComandoSenzaRecupero(c), descrizione, JSON.stringify(c))
    }
    for (const c of lista(GREP, 'test_grep_inside_a_substitution_is_not_malformed')) {
        assert.equal(estremiPatternGrep(c)[1], false, JSON.stringify(c))
        assert.equal(rilevaComandoSenzaRecupero(c), null, JSON.stringify(c))
    }
    assert.equal(tokenConEstremi("grep 'unterminated", 0), null)
    assert.equal(rilevaComandoSenzaRecupero("grep 'unterminated"), DESCRIZIONE_PAYLOAD_ILLEGGIBILE, 'virgolette che non tornano: chiuso, non aperto')
    for (const c of lista(GREP, 'TestExecutableSubstitutionBodiesStayExecutable.test_hardline_command_inside_a_quoted_substitution_blocks_as_itself')) {
        assert.equal(rilevaComandoSenzaRecupero(c), 'system shutdown/reboot', JSON.stringify(c))
    }
    lasciati(lista(GREP, 'TestExecutableSubstitutionBodiesStayExecutable.test_benign_shapes_stay_allowed'), 'forme benigne')
})

test('PAV-04 (Hermes, test_execution_flag_detection): i programmi dentro le opzioni arrivano al pavimento; gli altri argomenti no', () => {
    lasciati(lista(ESECUZIONE, 'test_read_tool_exec_like_operands_owned_by_other_syntax_are_not_flagged'), 'operandi di altre opzioni')
    for (const nome of ['test_leading_dash_program_payloads_reach_hardline_floor', 'test_exec_flag_payload_reaches_hardline_floor']) {
        for (const c of lista(ESECUZIONE, nome)) assert.equal(rilevaComandoSenzaRecupero(c), 'recursive delete of root filesystem', `${nome}: ${c}`)
    }
    lasciati(lista(ESECUZIONE, 'test_non_executing_flags_are_not_flagged'), 'opzioni che non eseguono')
    lasciati(lista(ESECUZIONE, 'test_unrelated_options_do_not_promote_payload_text_to_hardline'), 'opzioni estranee')
    lasciati(["grep -P '(?:safe|rm -rf --no-preserve-root /)' audit.log"], 'test_grep_pcre_pattern_with_grouped_root_delete_text_stays_safe')
})

test('PAV-05: i limiti del parser falliscono CHIUSI, e il caso più lungo accettato resta veloce', () => {
    assert.equal(rilevaComandoSenzaRecupero('x'.repeat(4_097)), DESCRIZIONE_LIMITE_PARSER, 'oltre 4.096 caratteri senza separatori')
    assert.equal(rilevaComandoSenzaRecupero(`echo ${'a'.repeat(128_001)};`), DESCRIZIONE_LIMITE_PARSER, 'oltre 128.000 caratteri')
    assert.equal(rilevaComandoSenzaRecupero(Array.from({ length: 25_001 }, () => 'true').join(';')), DESCRIZIONE_LIMITE_PARSER, '25.000 separatori')
    const inizio = performance.now()
    assert.equal(rilevaComandoSenzaRecupero('x'.repeat(4_096)), null)
    assert.ok(performance.now() - inizio < 2_000, 'test_max_accepted_separator_free_input_is_fast: sotto i 2 s')
    assert.match(rifiutoDelPavimento({ tipo: 'senza-recupero', motivo: DESCRIZIONE_LIMITE_PARSER }), /write the script to a file with scrivi, then run that file with shell\. Do not retry inline\.$/u)
})

test('PAV-06 (Hermes): sudo -S — una password indovinata passata a sudo; «sudo» senza -S passa', () => {
    for (const c of lista(BLOCCO, '_SUDO_STDIN_BLOCK')) assert.match(sudoDaStdin(c) ?? '', /sudo/u, JSON.stringify(c))
    for (const c of lista(BLOCCO, '_SUDO_STDIN_ALLOW')) assert.equal(sudoDaStdin(c), null, JSON.stringify(c))
    assert.deepEqual(bloccoDelPavimento('echo x | sudo -S whoami'), { tipo: 'sudo', motivo: 'sudo password guessing via stdin (sudo -S)' })
})

test('PAV-07: adattati a TALOS — classi Unicode di Python, home nelle grafie di WSL e git-bash, shlex POSIX', () => {
    assert.equal(rilevaComandoSenzaRecupero('env Ä=1 reboot'), 'system shutdown/reboot', '`\\w` di Python è Unicode')
    assert.equal(rilevaComandoSenzaRecupero('mkfsé /dev/sda'), null, '`\\b` di Python è Unicode: «mkfsé» è un altro nome')
    assert.deepEqual(shlexDividi(`a 'b c' "d\\"e" f\\ g ''`), ['a', 'b c', 'd"e', 'f g', ''])
    assert.deepEqual(shlexDividi('cat <file >>out', { punteggiatura: '<>' }), ['cat', '<', 'file', '>>', 'out'])
    assert.throws(() => shlexDividi("a 'b"), /No closing quotation/u)
    if (process.platform === 'win32') {
        const home = process.env.USERPROFILE
        const unita = home[0].toLowerCase(), resto = home.slice(3).replaceAll('\\', '/')
        for (const c of [`rm -rf ${home}\\`, `rm -rf "${home}\\"`, `rm -rf /mnt/${unita}/${resto}/`, `rm -rf /${unita}/${resto}/`, `rm -rf ${home.toUpperCase()}\\*`]) {
            assert.equal(rilevaComandoSenzaRecupero(c), 'recursive delete of home directory', c)
        }
        assert.equal(rilevaComandoSenzaRecupero(`rm -rf /mnt/${unita}/${resto}/progetti/vecchio`), null, 'una sottocartella della home non è la home')
    }
})

/* ── (2) Il runtime: una copia finta, come il `fake_runtime` di Hermes ─────────────────────────────────────────────────── */
function runtimeFinto(t) {
    const radice = mkdtempSync(join(tmpdir(), 'talos-pav-'))
    t.after(() => rimuoviCartellaDiProva(radice))
    const cartellaRuntime = join(radice, 'runtime'), eseguibile = join(cartellaRuntime, 'node.exe'), altra = join(radice, 'altro-runtime')
    mkdirSync(cartellaRuntime); mkdirSync(altra); writeFileSync(eseguibile, '')
    const protetti = [[percorsoCanonico(eseguibile), 'the Node runtime this TALOS server is running from'], [percorsoCanonico(cartellaRuntime), 'the folder of the runtime this TALOS server is running from']]
    return { radice, cartellaRuntime, eseguibile, altra, protetti }
}

test('PAV-08 (Hermes, test_runtime_self_protection): il runtime da cui gira TALOS non si cancella — in ogni grafia', (t) => {
    const r = runtimeFinto(t), opz = { protetti: r.protetti }
    for (const c of [`rm "${r.eseguibile}"`, `rm -rf ${r.cartellaRuntime}`, `sudo rm -f '${r.eseguibile}'`, `find '${r.cartellaRuntime}' -delete`,
        `find '${r.cartellaRuntime}' -name __pycache__ -delete`, `del "${r.eseguibile}"`, `Remove-Item -Recurse -Force "${r.eseguibile}"`,
        `rd /s /q ${r.cartellaRuntime}`, `rm -rf ${r.radice}`, 'ls && rm -rf runtime']) {
        assert.ok(comandoCancellaIlRuntime(c, { ...opz, cartella: r.radice }), `doveva fermare: ${c}`)
    }
    for (const c of [`rm -rf ${r.altra}`, `mkdir -p ${r.cartellaRuntime}`, 'find /tmp -name __pycache__ -delete', 'ls -la', 'rm -rf build', `cat "${r.eseguibile}"`]) {
        assert.equal(comandoCancellaIlRuntime(c, { ...opz, cartella: r.radice }), null, `NON doveva fermare: ${c}`)
    }
    if (process.platform === 'win32') {
        const unita = r.radice[0].toLowerCase(), resto = r.cartellaRuntime.slice(3).replaceAll('\\', '/')
        for (const c of [`rm -rf /mnt/${unita}/${resto}`, `rm -rf /${unita}/${resto}`, `rd /s /q ${r.radice.slice(0, 3)}`]) {
            assert.ok(comandoCancellaIlRuntime(c, { ...opz, cartella: r.radice }), `grafia di WSL/git-bash, o la radice con la barra: ${c}`)
        }
    }
})

test('PAV-09: il runtime VERO è process.execPath e la sua cartella; il pavimento lo dice come Hermes', () => {
    const veri = percorsiDelRuntime().map(([p]) => p)
    assert.ok(veri.includes(percorsoCanonico(process.execPath)), JSON.stringify(veri))
    const blocco = bloccoDelPavimento(`rm "${process.execPath}"`)
    assert.equal(blocco.tipo, 'runtime')
    assert.equal(blocco.motivo, 'recursive/any delete of the Node runtime this TALOS server is running from')
})

/* ── La porta vera: l'attrezzo `shell` del kernel, con un esecutore FINTO ───────────────────────────────────────────────── */
async function giro(t, comandiOFunzione, { annidata = 0 } = {}) {
    const radice = mkdtempSync(join(tmpdir(), 'talos-pav-porta-'))
    t.after(() => rimuoviCartellaDiProva(radice))
    const cartella = join(radice, ...Array.from({ length: annidata }, (_, i) => `livello${i}`))
    mkdirSync(cartella, { recursive: true })
    const comandi = typeof comandiOFunzione === 'function' ? comandiOFunzione(cartella) : comandiOFunzione
    const esiti = [], eseguiti = [], ricevute = []
    let domande = 0, n = 0
    await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: comandi.length + 2, livelloAccesso: 'accesso-pieno',
        chiediApprovazioneFn: async () => { domande += 1; return true },
        eseguiComandoSandboxatoFn: async (comando) => { eseguiti.push(comando); return { codice: 0, testo: 'ok\n', enforcement: 'prova' } },
        fetchDiRete: async () => {
            const comando = comandi[n++]
            const message = comando !== undefined
                ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando }) } }] }
                : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: comando !== undefined ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)); if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
    })
    return { esiti, eseguiti, ricevute, domande }
}

test('PAV-10 (porta vera): il pavimento ferma con accesso pieno e un sì pronto; dice cosa è e cosa NON è; il resto gira', async (t) => {
    const { esiti, eseguiti, ricevute, domande } = await giro(t, [
        'rm -rf /', 'git commit -m "fix: never run rm -rf / or reboot"', 'echo x | sudo -S whoami', `rm "${process.execPath}"`, 'r\\m -rf /', 'npm test',
    ])
    assert.equal(esiti[0], 'REFUSED. This command matches a hardline pattern (recursive delete of root filesystem): it was not run, and no '
        + 'permission level unlocks it. This floor stops direct cases only; it is not a sandbox, so do not try to rephrase the command to get around it.')
    assert.match(esiti[2], /^REFUSED\. sudo password guessing via stdin \(sudo -S\): it was not run, and no permission level unlocks it\. /u)
    assert.match(esiti[3], /^REFUSED\. This command matches a hardline pattern \(recursive\/any delete of the Node runtime this TALOS server is running from\)/u)
    assert.match(esiti[4], /^REFUSED\. This command matches a hardline pattern \(recursive delete of root filesystem\)/u, 'r\\m è rm')
    assert.deepEqual(eseguiti, ['git commit -m "fix: never run rm -rf / or reboot"', 'npm test'], 'solo i due comandi legittimi sono partiti')
    assert.equal(domande, 0, 'accesso pieno: nessuna domanda, e il pavimento non ne fa')
    assert.deepEqual(ricevute.filter((r) => r.via === 'floor-comando-senza-recupero').length, 4)
})

/*
 * ⭐ Il confronto DIFFERENZIALE: 12.000 comandi generati (separatori, virgolette, sostituzioni, involucri, payload di -c/--pre,
 *   offuscamenti: barre rovesce, $IFS, '', continuazioni, caratteri a larghezza piena, ANSI, NUL, troncamenti) e, per ciascuno,
 *   la risposta del rilevatore VERO di Hermes eseguito in Python dal suo clone (`aiuto/pavimento-oracolo-hermes.json`).
 *   Misurato il 02/10/2026 anche su 30.000 comandi con un altro seme: 0 differenze.
 */
test('PAV-11: 12.000 comandi — «solo Hermes» dà la risposta del rilevatore VERO di Hermes, uno per uno; il +1 aggiunge e non toglie', () => {
    const oracolo = JSON.parse(readFileSync(new URL('./aiuto/pavimento-oracolo-hermes.json', import.meta.url), 'utf8'))
    const corpus = generaCorpusPavimento(oracolo.quanti, oracolo.seme)
    assert.equal(corpus.length, oracolo.esiti.length, 'il generatore è cambiato: rigenerare il fissaggio con l oracolo')
    const diversi = [], tolti = []
    let inPiu = 0
    for (let i = 0; i < corpus.length; i++) {
        const codice = oracolo.esiti[i]
        const atteso = [codice >> 1 ? oracolo.descrizioni[(codice >> 1) - 1] : null, codice & 1 ? oracolo.sudo : null]
        const nostro = [rilevaComandoSenzaRecupero(corpus[i], { soloHermes: true }), sudoDaStdin(corpus[i])]
        if (nostro[0] !== atteso[0] || nostro[1] !== atteso[1]) diversi.push({ comando: corpus[i], hermes: atteso, talos: nostro })
        const pieno = rilevaComandoSenzaRecupero(corpus[i])
        if (atteso[0] && pieno !== atteso[0]) tolti.push({ comando: corpus[i], hermes: atteso[0], talos: pieno })
        if (!atteso[0] && pieno) inPiu += 1
    }
    assert.equal(oracolo.esiti.filter((c) => c > 1).length, 7013, 'il fissaggio è quello misurato')
    assert.deepEqual(diversi.slice(0, 5), [], `${diversi.length} comandi con una risposta diversa da Hermes`)
    assert.deepEqual(tolti.slice(0, 5), [], 'il +1 non lascia passare niente che Hermes ferma, e col suo stesso motivo')
    // il +1 (involucri ed eval): 647 comandi in più, letti a campione il 02/10/2026 — comandi veri fuori dalle virgolette o corpi
    // di heredoc, che Hermes stesso tratta come codice. Un numero diverso è una differenza nuova da guardare, non da assorbire.
    assert.equal(inPiu, 647, 'i comandi che solo il +1 ferma')
})

/*
 * Casi trovati dalla revisione avversaria (mutanti vivi dopo PAV-01..11), ciascuno con la risposta del rilevatore VERO di
 * Hermes misurata il 02/10/2026: la grafia di Windows, la radice «/ *» fra virgolette, le opzioni con argomento degli involucri.
 * ⛔ E i BUCHI di Hermes: `sudo -u root reboot` (le opzioni con argomento di sudo non sono in `_CMDPOS`) e `eval "reboot"` (il
 *   comando di eval non arriva alle regole). In modalità «solo Hermes» passano come in Hermes; il +1 li chiude (PAV-14).
 */
test('PAV-12: casi misurati sull oracolo — Windows, «/ *» fra virgolette, involucri con argomenti; e i buchi di Hermes', () => {
    const CASI_MISURATI = [
        ['dd if=/dev/zero of=\\dev\\sda bs=1M # C:\\backup', 'dd to raw block device'], ['rm -rf \\ C:\\x', 'recursive delete of root filesystem'],
        ['dd if=C:\\img of=\\dev\\sdb', 'dd to raw block device'], ['rm -rf \\etc C:\\x', 'recursive delete of system directory'],
        ['rm -rf \\home\\* D:\\y', 'recursive delete of system directory'], ['cat C:\\f > \\dev\\sda', 'redirect to raw block device'],
        ['rm -rf "/ *"', 'recursive delete of root filesystem'], ["rm -rf '/ *'", 'recursive delete of root filesystem'],
        ['sudo -u root bash -c "reboot"', 'system shutdown/reboot'], ['timeout -s KILL 5 bash -c "reboot"', 'system shutdown/reboot'],
        ['env -u X bash -c "reboot"', 'system shutdown/reboot'], ['nice -n 5 sh -c "reboot"', 'system shutdown/reboot'],
        ['sudo --user=root reboot', 'system shutdown/reboot'], ['a &&& reboot', 'system shutdown/reboot'], ['a |&& reboot', 'system shutdown/reboot'],
        ['sudo -u root reboot', null], ['eval "reboot"', null], ["eval 'reboot'", null],
    ]
    for (const [c, atteso] of CASI_MISURATI) assert.equal(rilevaComandoSenzaRecupero(c, { soloHermes: true }), atteso, JSON.stringify(c))
})

/*
 * ⭐ +1 su Hermes (owner 02/10/2026, «Involucri di Hermes + eval»). Ogni caso qui sotto è stato misurato sul rilevatore VERO di
 *   Hermes: PASSA. Il +1 li ferma tutti col motivo giusto. In fondo, ciò che resta aperto per nome (`doas`, `xargs`, `<<<`, e le
 *   opzioni di sudo che la tabella di Hermes non ha: `-D`, `-C` — Hermes scrive `-c`) e ciò che deve continuare a passare.
 */
test('PAV-14: +1 — gli involucri con opzioni e argomenti, ed eval; e il verso contrario', () => {
    const FERMATI = [
        'sudo -u root reboot', 'sudo -g wheel reboot', 'sudo -h host reboot', 'sudo -p x reboot', 'sudo -u root -E reboot', 'sudo --user root reboot',
        'env -u X reboot', 'env -C /tmp reboot', 'env -i reboot', 'env - reboot', 'timeout 5 reboot', 'timeout -s KILL 5 reboot', 'nice -n 5 reboot',
        'nice reboot', 'nohup nice reboot', 'stdbuf -o0 reboot', 'ionice -c 3 reboot', 'chrt 1 reboot', 'taskset 1 reboot', 'chroot /x reboot',
        'command reboot', 'builtin reboot', 'exec -a x reboot', 'time -p reboot', 'setsid -f reboot', 'eval reboot', 'eval "reboot"', "eval 'reboot'",
        'echo hi; eval "reboot"', 'env -S "reboot"', '/sbin/reboot', 'sudo /usr/sbin/shutdown -h now',
    ]
    for (const c of FERMATI) {
        assert.equal(rilevaComandoSenzaRecupero(c, { soloHermes: true }), null, `Hermes lo lascia passare: ${c}`)
        assert.equal(rilevaComandoSenzaRecupero(c), 'system shutdown/reboot', c)
    }
    for (const [c, motivo] of [['sudo -u root rm -rf /', 'recursive delete of root filesystem'], ['sudo -u root mkfs /dev/sda', 'format filesystem (mkfs)'],
        ['eval "rm -rf /"', 'recursive delete of root filesystem'], ["eval 'mkfs.ext4 /dev/sda1'", 'format filesystem (mkfs)'],
        ['eval rm -rf /', 'recursive delete of root filesystem'], ["env -S 'rm -rf /'", 'recursive delete of root filesystem'],
        ["timeout 5 dd if=/dev/zero of=/dev/sda", 'dd to raw block device'], ['nice -n 5 kill -9 -1', 'kill all processes']]) {
        assert.equal(rilevaComandoSenzaRecupero(c), motivo, c)
    }
    // aperti, detti per nome: non sono involucri nel modello di Hermes, o la sua tabella di sudo non li conosce
    for (const c of ['doas reboot', 'xargs reboot', 'bash <<< reboot', 'sudo -D /tmp reboot', 'sudo -C 3 reboot']) assert.equal(rilevaComandoSenzaRecupero(c), null, `aperto: ${c}`)
    // il verso contrario: involucri che NON eseguono, e prosa
    for (const c of ['command -v reboot', 'eval "echo reboot"', 'eval echo reboot', 'sudo -u root echo reboot', 'timeout 5 grep reboot f',
        'hermes send "riga1\nshutdown -h now"', "python3 -c 'x = 1\ninit 6'", '$(hermes send "riga1\nrm -rf /")']) {
        assert.equal(rilevaComandoSenzaRecupero(c), null, `deve passare: ${JSON.stringify(c)}`)
    }
})

test('PAV-13 (porta vera): un percorso RELATIVO al runtime si legge dalla cartella della sessione', async (t) => {
    const runtime = dirname(process.execPath)
    // il PROCESSO sta più in basso della sessione, apposta: da lì lo stesso relativo porta altrove. Misurato: alla stessa
    // profondità le due risoluzioni coincidevano (e `..` oltre la radice si ferma alla radice), e la prova non poteva vedere un
    // kernel che risolve nel posto sbagliato.
    const baseProcesso = mkdtempSync(join(tmpdir(), 'talos-pav-cwd-'))
    const profondo = join(baseProcesso, ...Array.from({ length: 8 }, (_, i) => `livello${i}`))
    mkdirSync(profondo, { recursive: true })
    const prima = process.cwd()
    process.chdir(profondo)
    t.after(() => { process.chdir(prima); rimuoviCartellaDiProva(baseProcesso) })
    const { esiti, eseguiti } = await giro(t, (cartella) => {
        const relativo = relative(cartella, runtime)
        assert.ok(!/^[A-Za-z]:|^\//.test(relativo), `serve un percorso relativo (stessa unità): ${relativo}`)
        assert.notEqual(join(process.cwd(), relativo).toLowerCase(), runtime.toLowerCase(), 'dal processo deve portare altrove')
        return [`rd /s /q "${relativo}"`]
    })
    // la cartella contiene l'eseguibile: vince il primo protetto in elenco, l'eseguibile (stesso ordine di Hermes)
    assert.match(esiti[0], /^REFUSED\. This command matches a hardline pattern \(recursive\/any delete of the Node runtime this TALOS server is running from\)/u)
    assert.deepEqual(eseguiti, [])
})
