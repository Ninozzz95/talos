/*
 * ⛔⛔⛔ N-02, owner 02/10/2026 — IL PAVIMENTO DEI COMANDI: «il pavimento di Hermes di oggi, per intero», parti «1 + 2 + 3».
 *
 * Il pavimento è ciò che la shell NON esegue mai, a nessun livello di permesso e con nessuna approvazione. Prima di questo
 * modulo erano 5 espressioni copiate il 28/8 (`COMANDI_SENZA_RECUPERO`): `rm` voleva `-r` e scattava su qualunque percorso
 * che FINISSE con «/» (`rm -rf /tmp/x/` rifiutato, `rm -r /` no), e `git commit -m "… reboot …"` era rifiutato perché la
 * parola compariva fra virgolette.
 *
 * Porto di Hermes (NousResearch/hermes-agent, commit 65ad529 del 23/09/2026), letto riga per riga:
 *   (1) comandi senza recupero — `tools/approval_detection.py:60-215` (`_CMDPOS`, `_hardline_rm_path`, `HARDLINE_PATTERNS`,
 *       `detect_hardline_command`) col rilevatore che li rende difficili da aggirare: `:497-1483` (normalizzazione: ANSI, NUL,
 *       NFKC, `\`+a capo, home, escape, `''`, `$IFS`; virgolette lette sul testo dell'AUTORE; inizi di comando veri, anche
 *       dentro `$(…)`, backtick, `( … )` e `{ …; }`; parole del comando de-offuscate; payload di `bash -c`, `sh -c`,
 *       `rg --pre`, `sort --compress-program`, `man -P`, `ag --pager`; operandi di `grep -P` trattati come dati; limiti del
 *       parser che falliscono CHIUSI). Prove di Hermes portate come specifica: `tests/tools/test_hardline_blocklist.py`,
 *       `test_hardline_escaped_quote_state.py`, `test_approval_grep_in_substitution.py`, `test_execution_flag_detection.py`;
 *   (2) cancellare il runtime da cui gira l'agente — `agent/runtime_self_protection.py` (`command_deletes_runtime`);
 *   (3) `sudo -S` (una password indovinata passata a sudo) — `tools/approval_detection.py:176-185`.
 * Il «dove» di Hermes è `tools/approval.py:1051-1072` (`_floor_block`), prima di yolo, approvals.mode=off e cron.
 *
 * Adattato a TALOS, e detto:
 *   - le regex di Python (`\w`, `\b`, `\d` Unicode) diventano classi Unicode esplicite (`\p{L}\p{N}_`, `\p{Nd}`): con le
 *     classi ASCII di JS `env Ä=1 reboot` non sarebbe stato riconosciuto;
 *   - la home si piega a `~` anche scritta come la vede WSL (`/mnt/c/Users/…`) e git-bash (`/c/Users/…`), e senza badare
 *     alle maiuscole su Windows: i comandi di TALOS girano anche nella casa Linux;
 *   - (2) protegge il Node/Electron che esegue il server (`process.execPath`) e la sua cartella — l'equivalente del
 *     `sys.executable` e della `home` di `pyvenv.cfg`; i percorsi relativi si risolvono nella cartella della sessione, non
 *     in quella del processo; un percorso di Windows con le barre rovesce si legge come tale (Hermes lo passa a shlex POSIX,
 *     che le mangia); un ANTENATO protetto vale anche se scritto con la barra finale (`C:\`). Il ramo `uv python uninstall`
 *     non ha un equivalente: TALOS non installa il suo runtime con un gestore di versioni;
 *   - (3) TALOS non ha una password di sudo configurata (Hermes la legge da SUDO_PASSWORD e aggiunge lui `-S`): sempre
 *     bloccato. Come in Hermes, la regola è senza maiuscole e prende anche `sudo -s`;
 *   - per i comandi troppo grandi o illeggibili Hermes salva il comando in un file; qui il rifiuto dice di scriverlo con
 *     `scrivi` ed eseguire il file: nessuna scrittura nascosta.
 * Prove: tests/rev-pavimento-comandi.test.mjs.
 */
import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, normalize, resolve, sep } from 'node:path'

/* ── Le classi di Python, scritte per JS ──────────────────────────────────────────────────────────────────────────────── */
const W = '[\\p{L}\\p{N}_]' // `\w` di Python (str): lettere e cifre Unicode più «_»
const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))` // `\b` di Python, su quella `\w`
const py = (sorgente) => sorgente.replaceAll('\\b', B).replaceAll('\\w', W).replaceAll('\\d', '\\p{Nd}')
/* `str.isspace()` di Python. */
const SPAZIO_PY = /[\t\n\v\f\r\x1c-\x1f\x85\p{Zs}\u2028\u2029]/u
const eSpazio = (c) => c !== undefined && c !== '' && SPAZIO_PY.test(c)
/* `os.path.basename`: sul nostro sistema conta anche la barra rovescia. */
const nomeBase = (p) => { const s = String(p); return s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1) }

/* ── (1) I comandi senza recupero — `tools/approval_detection.py:60-139` ─────────────────────────────────────────────── */
// Posizione di comando: inizio, a capo, `$(` o backtick, con sudo/env/exec/nohup/setsid/time davanti. I separatori veri
// `;&|` li rende a capo `marcaInizi`, che conosce le virgolette: qui sarebbero dati fra virgolette scambiati per comandi.
const CMDPOS = py(/(?:^|[\n`]|\$\()\s*(?:sudo\s+(?:-[^\s]+\s+)*)?(?:env\s+(?:\w+=\S*\s+)*)?(?:(?:exec|nohup|setsid|time)\s+)*\s*/.source)
// Il percorso di `rm`: chiuso fra due virgolette uguali, o nudo con un terminatore (spazio, fine, `)`, backtick, `;|&`).
const percorsoRm = (alternative, coda = /(?:\s|$|[)`;|&])/.source) => `(?:["'](?:${alternative})["']|(?:${alternative})${coda})`
const CARTELLE_DI_SISTEMA = /\/home|\/home\/\*|\/root|\/root\/\*|\/etc|\/etc\/\*|\/usr|\/usr\/\*|\/var|\/var\/\*|\/bin|\/bin\/\*|\/sbin|\/sbin\/\*|\/boot|\/boot\/\*|\/lib|\/lib\/\*/.source
const PREFISSO_RM = CMDPOS + /rm\s+(-[^\s]*\s+)*/.source
export const DESCRIZIONE_LIMITE_PARSER = 'command parser limit exceeded'
export const DESCRIZIONE_PAYLOAD_ILLEGGIBILE = 'command parser limit or malformed executable payload'
const SCHEMI = [
    // la radice in ogni grafia che la shell riporta a «/» («//», «/.», «/../..», glob finale, «/ *»); «/...» e «/.foo» no
    [PREFISSO_RM + percorsoRm(/\/(?:(?:\.\.?)?\/)*(?:\.\.?)?\**|\/ \*/.source), 'recursive delete of root filesystem'],
    [PREFISSO_RM + percorsoRm(CARTELLE_DI_SISTEMA), 'recursive delete of system directory'],
    [PREFISSO_RM + percorsoRm(/(?:~|\$\{?HOME\}?)(?:\/?|\/\*)?/.source), 'recursive delete of home directory'],
    [CMDPOS + py(/mkfs(\.[a-z0-9]+)?\b/.source), 'format filesystem (mkfs)'],
    [CMDPOS + py(/dd\b[^\n]*\bof=\/dev\/(sd|nvme|hd|mmcblk|vd|xvd)[a-z0-9]*/.source), 'dd to raw block device'],
    // senza nome di comando: si cercano sulla variante con le virgolette mascherate (`mascheraProsaTraVirgolette`)
    [py(/>\s*\/dev\/(sd|nvme|hd|mmcblk|vd|xvd)[a-z0-9]*\b/.source), 'redirect to raw block device'],
    [/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.source, 'fork bomb'],
    [CMDPOS + py(/kill\s+(-[^\s]+\s+)*-1\b/.source), 'kill all processes'],
    [CMDPOS + py(/(shutdown|reboot|halt|poweroff)\b/.source), 'system shutdown/reboot'],
    [CMDPOS + py(/init\s+[06]\b/.source), 'init 0/6 (shutdown/reboot)'],
    [CMDPOS + py(/systemctl\s+(poweroff|reboot|halt|kexec)\b/.source), 'systemctl poweroff/reboot'],
    [CMDPOS + py(/telinit\s+[06]\b/.source), 'telinit 0/6 (shutdown/reboot)'],
]
const MASCHERATI = new Set(['redirect to raw block device', 'fork bomb'])
export const SCHEMI_SENZA_RECUPERO = SCHEMI.map(([sorgente, descrizione]) => [new RegExp(sorgente, 'isu'), descrizione, MASCHERATI.has(descrizione)])
// Comandi che passano un argomento fra virgolette a un'altra shell da ESEGUIRE: lì le virgolette sono codice, non prosa.
const PORTATORI_DI_SHELL = new Set(['eval', 'sh', 'bash', 'zsh', 'ksh', 'dash', 'source', '.'])
const NOMI_DI_SHELL = new Set(['bash', 'sh', 'zsh', 'ksh', 'dash'])

/* ── shlex di Python (modo POSIX, `whitespace_split`, niente commenti), per `shlex.split` e `shlex.shlex(…, "<>")` ───── */
const SPAZI_SHLEX = ' \t\r\n'
export function shlexDividi(testo, { punteggiatura = '' } = {}) {
    const caratteri = Array.from(String(testo)), indietro = [], parole = []
    let pos = 0, stato = ' '
    const leggi = () => (indietro.length ? indietro.pop() : pos < caratteri.length ? caratteri[pos++] : '')
    const virgolette = `'"`, escape = '\\'
    for (;;) {
        let quoted = false, escapedstate = ' ', token = ''
        while (stato !== null) {
            const c = leggi()
            if (stato === ' ') {
                if (!c) { stato = null; break }
                if (SPAZI_SHLEX.includes(c)) { if (token || quoted) break; continue }
                if (c === escape) { escapedstate = 'a'; stato = c }
                else if (punteggiatura.includes(c)) { token = c; stato = 'c' }
                else if (virgolette.includes(c)) stato = c
                else { token = c; stato = 'a' }
            } else if (virgolette.includes(stato)) {
                quoted = true
                if (!c) throw new Error('No closing quotation')
                if (c === stato) stato = 'a'
                else if (c === escape && stato === '"') { escapedstate = stato; stato = c }
                else token += c
            } else if (stato === escape) {
                if (!c) throw new Error('No escaped character')
                if (virgolette.includes(escapedstate) && c !== stato && c !== escapedstate) token += stato
                token += c
                stato = escapedstate
            } else { // 'a' o 'c'
                if (!c) { stato = null; break }
                if (SPAZI_SHLEX.includes(c)) { stato = ' '; if (token || quoted) break; continue }
                if (stato === 'c') {
                    if (punteggiatura.includes(c)) token += c
                    else { indietro.push(c); stato = ' '; break }
                } else if (virgolette.includes(c)) stato = c
                else if (c === escape) { escapedstate = 'a'; stato = c }
                else if (!punteggiatura.includes(c)) token += c
                else { indietro.push(c); stato = ' '; if (token || quoted) break; continue }
            }
        }
        if (!quoted && token === '') { if (stato === null) return parole; continue }
        parole.push(token)
        if (stato === null) return parole
    }
}
const shlexDividiOppure = (testo, opzioni) => { try { return shlexDividi(testo, opzioni) } catch { return null } }

/* ── Lo scanner delle virgolette — `_scan_shell` e i suoi aiutanti (`:996-1066`) ─────────────────────────────────────── */
const saltaSpazi = (c, pos) => { while (pos < c.length && eSpazio(c[pos])) pos += 1; return pos }
const eInizioCommento = (c, i) => c[i] === '#' && (i === 0 || eSpazio(c[i - 1]) || ';&|()<>'.includes(c[i - 1]))
/* Passi lessicali `[tipo, i, j, virgoletta]`: 'char', 'esc' (barra rovescia + carattere, mai fra apici), 'quote',
   'subst' (`$(…)`, backtick, `${…}`), 'comment'. Le sostituzioni contano fuori dalle virgolette con 'u' in `subst`,
   dentro le doppie con 'q'. */
function* scansiona(testo, inizio = 0, fine = null, { subst = '', graffe = false, fermaSeAperta = false, backtickIngenuo = false, commenti = false } = {}) {
    const n = fine === null ? testo.length : fine
    let virg = null, i = inizio
    while (i < n) {
        const ch = testo[i]
        let tipo = 'char', j = i + 1
        if (commenti && virg === null && eInizioCommento(testo, i)) {
            const k = testo.indexOf('\n', i)
            tipo = 'comment'; j = k < 0 || k >= n ? n : k
        } else if (virg !== "'" && ch === '\\' && i + 1 < n) {
            tipo = 'esc'; j = i + 2
        } else if (ch === virg || (virg === null && (ch === "'" || ch === '"'))) {
            tipo = 'quote'
        } else if (virg !== "'" && subst.includes(virg ? 'q' : 'u')
            && (ch === '`' || testo.startsWith('$(', i) || (graffe && !virg && testo.startsWith('${', i)))) {
            let chiusura
            if (ch === '`') chiusura = backtickIngenuo ? (testo.indexOf('`', i + 1) + 1 || null) : fineBacktick(testo, i)
            else if (testo[i + 1] === '(') chiusura = fineDollaroParentesi(testo, i)
            else chiusura = testo.indexOf('}', i + 2) + 1 || null
            if (chiusura !== null) { tipo = 'subst'; j = chiusura }
            else if (fermaSeAperta) { yield ['subst', i, null, virg]; return }
        }
        yield [tipo, i, j, virg]
        if (tipo === 'quote') virg = virg ? null : ch
        i = j
    }
}
function fineDollaroParentesi(c, inizio) {
    let profondita = 1
    for (const [tipo, i, , virg] of scansiona(c, inizio + 2)) {
        if (tipo === 'char' && !virg) {
            profondita += (c.startsWith('$(', i) ? 1 : 0) - (c[i] === ')' ? 1 : 0)
            if (profondita === 0) return i + 1
        }
    }
    return null
}
function fineBacktick(c, inizio) { // nessuna virgoletta conta: solo la barra rovescia protegge il carattere dopo
    const re = /(?:\\.|[^`\\])*`/ys
    re.lastIndex = inizio + 1
    return re.exec(c) ? re.lastIndex : null
}
function leggiParola(c, pos) {
    const inizio = saltaSpazi(c, pos)
    let fine = inizio
    for (const [tipo, i, j, virg] of scansiona(c, inizio, null, { subst: 'u', graffe: true })) {
        if (tipo === 'char' && virg === null && (eSpazio(c[i]) || ';&|<>()'.includes(c[i]))) break
        fine = j
    }
    return [inizio, fine, c.slice(inizio, fine)]
}
const giunta = (c, modifiche) => {
    const parti = []
    let prima = 0
    for (const [a, b, t] of modifiche) { parti.push(c.slice(prima, a), t); prima = b }
    return parti.join('') + c.slice(prima)
}

/* ── Inizi di comando (`_iter_shell_command_starts`, `_mark_command_starts`) ─────────────────────────────────────────── */
const TRANSIZIONI = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!'])
function* iniziDiComando(c) {
    const inizi = [0]
    const scansione = (inizio, fine) => {
        let salta = -1
        for (const [tipo, i, j, virg] of scansiona(c, inizio, fine, { subst: 'uq', fermaSeAperta: true, commenti: true })) {
            if (tipo === 'subst') {
                const dentro = i + (c[i] === '`' ? 1 : 2)
                inizi.push(dentro)
                scansione(dentro, j === null ? fine : j - 1)
            } else if (tipo === 'char' && virg === null && i !== salta) {
                // `{` apre un gruppo solo come parola a sé: `${IFS}` e `-{delete,print}` non sono inizi
                if ('(;\n'.includes(c[i]) || (c[i] === '{' && (i === 0 || eSpazio(c[i - 1]) || '(;&|)'.includes(c[i - 1])))) inizi.push(i + 1)
                else if ('&|'.includes(c[i])) {
                    const doppio = i + 1 < fine && c[i + 1] === c[i]
                    if (doppio) salta = i + 1
                    inizi.push(i + 1 + (doppio ? 1 : 0))
                }
            }
        }
    }
    scansione(0, c.length)
    const visti = new Set()
    for (let k = 0; k < inizi.length; k++) {
        const inizio = saltaSpazi(c, inizi[k])
        if (inizio >= c.length || visti.has(inizio) || eInizioCommento(c, inizio)) continue
        visti.add(inizio)
        yield inizio
        const [, fine, parola] = leggiParola(c, inizio)
        if (TRANSIZIONI.has(parola)) inizi.push(fine)
    }
}
function marcaInizi(c, marcatore = '\n') {
    const posizioni = [...iniziDiComando(c)].filter((o) => o > 0).sort((a, b) => a - b)
    return posizioni.length ? giunta(c, posizioni.map((o) => [o, o, marcatore])) : c
}
/* Un a capo fra virgolette è un DATO: diventa uno spazio. Una sostituzione dentro le doppie è CODICE: si riscansiona. */
function mascheraAcapoTraVirgolette(c) { return c.includes('\n') ? mascheraTratto(c, 0, c.length) : c }
function mascheraTratto(c, inizio, fine) {
    const fuori = []
    for (const [tipo, i, j, virg] of scansiona(c, inizio, fine, { subst: 'q' })) {
        if (tipo === 'subst') {
            const corpo = i + (c.startsWith('$(', i) ? 2 : 1), fineCorpo = j - 1
            fuori.push(c.slice(i, corpo), mascheraTratto(c, corpo, fineCorpo), c.slice(fineCorpo, j))
        } else if (virg && tipo === 'char' && c[i] === '\n') fuori.push(' ')
        else fuori.push(c.slice(i, j))
    }
    return fuori.join('')
}
/* Per le regole senza nome di comando: il contenuto fra virgolette diventa spazi (le `$(…)` dentro le doppie restano). */
function mascheraProsaTraVirgolette(c) {
    let fuori = ''
    for (const [tipo, i, j, virg] of scansiona(c, 0, null, { subst: 'q', backtickIngenuo: true })) {
        fuori += virg === null || tipo === 'quote' || tipo === 'subst' ? c.slice(i, j) : ' '.repeat(j - i)
    }
    return fuori
}

/* ── Le parole in posizione di comando (`_iter_shell_command_word_spans`) e la de-offuscazione ───────────────────────── */
const PAROLE_INVOLUCRO = new Set(['sudo', 'env', 'exec', 'nohup', 'setsid', 'time', 'command', 'builtin', 'nice', 'timeout', 'stdbuf', 'ionice', 'chrt', 'taskset', 'chroot'])
const OPZIONI_SUDO_CON_ARGOMENTO = new Set(['-c', '--close-from', '-g', '--group', '-h', '--host', '-p', '--prompt', '-u', '--user'])
const OPZIONI_INVOLUCRO_CON_ARGOMENTO = {
    chroot: new Set(['--groups', '--userspec']), sudo: OPZIONI_SUDO_CON_ARGOMENTO,
    env: new Set(['-a', '--argv0', '-C', '--chdir', '-S', '--split-string', '-u', '--unset']),
    exec: new Set(['-a']), nice: new Set(['-n', '--adjustment']), time: new Set(['-f', '--format', '-o', '--output']),
    timeout: new Set(['-k', '--kill-after', '-s', '--signal']), stdbuf: new Set(['-e', '--error', '-i', '--input', '-o', '--output']),
    ionice: new Set(['-c', '--class', '-n', '--classdata']),
}
const OPZIONI_INVOLUCRO_CHE_NON_ESEGUONO = {
    command: new Set(['-v', '-V']), chrt: new Set(['-p', '--pid']), ionice: new Set(['-p', '--pid', '--pgid', '--uid']), taskset: new Set(['-p', '--pid']),
}
const POSIZIONALI_INVOLUCRO = { chroot: 1, chrt: 1, taskset: 1, timeout: 1 }
const RE_REDIREZIONE = /(?:[0-9]+)?(?:>>|<<|<>|>&|<&|>\||[<>])/y
const RE_ASSEGNAZIONE = /^[A-Za-z_][A-Za-z0-9_]*=[^\n]*$/
function* paroleDiComando(c) {
    for (let pos of iniziDiComando(c)) {
        let involucro = null, posizionali = 0, opzioni = true, saltaArgomento = false
        while (pos < c.length) {
            RE_REDIREZIONE.lastIndex = saltaSpazi(c, pos)
            const redirezione = RE_REDIREZIONE.exec(c)
            if (redirezione) { pos = leggiParola(c, RE_REDIREZIONE.lastIndex)[1]; continue }
            const [inizioParola, fineParola, parola] = leggiParola(c, pos)
            if (inizioParola === fineParola) break
            pos = fineParola
            const chiara = deoffusca(parola)
            const nome = nomeBase(chiara).toLowerCase()
            if (saltaArgomento) { saltaArgomento = false; continue }
            if (involucro && opzioni && chiara === '--') { opzioni = false; continue }
            if (involucro && opzioni && chiara.startsWith('-')) {
                const opzione = chiara.split('=')[0]
                if (involucro === 'env' && (opzione === '--split-string' || chiara.startsWith('-S'))) break
                const domande = OPZIONI_INVOLUCRO_CHE_NON_ESEGUONO[involucro] ?? new Set()
                if (domande.has(opzione) || (involucro === 'command' && !opzione.startsWith('--') && /[vV]/u.test(opzione.slice(1)))) break
                saltaArgomento = !chiara.includes('=') && (OPZIONI_INVOLUCRO_CON_ARGOMENTO[involucro]?.has(opzione) ?? false)
                continue
            }
            if (posizionali) { posizionali -= 1; continue }
            if (RE_ASSEGNAZIONE.test(parola)) continue
            yield [inizioParola, fineParola, parola]
            if (!PAROLE_INVOLUCRO.has(nome)) break
            involucro = nome; opzioni = true
            posizionali = POSIZIONALI_INVOLUCRO[nome] ?? 0
        }
    }
}
const RE_SOSTITUZIONE_PARAMETRO = /\$\{[^}/\s]+\/[^}/]*\/(?<sostituto>[^}]*)\}/gu
const RE_VALORE_PREDEFINITO = /\$\{[^}:}\s]+:-(?<predefinito>[^}]*)\}/gu
const RE_LETTERALE = /^[A-Za-z0-9_./:@%+=,-]+$/
/* `$(echo rm)` / `` `printf %s rm` ``: l'uscita letterale, senza eseguire niente. */
function uscitaLetterale(script) {
    const parole = shlexDividiOppure(script) ?? []
    if (!parole.length) return null
    const comando = parole[0].toLowerCase()
    let argomenti = parole.slice(1)
    if (comando === 'echo') { while (argomenti.length && /^-[nEe]+$/u.test(argomenti[0])) argomenti = argomenti.slice(1) }
    else if (comando !== 'printf') return null
    if (argomenti.length === 1 && RE_LETTERALE.test(argomenti[0])) return argomenti[0]
    if (comando === 'printf' && argomenti.length === 2 && argomenti[0] === '%s' && RE_LETTERALE.test(argomenti[1])) return argomenti[1]
    return null
}
function sostituisciSostituzioniSemplici(parola) {
    const pezzi = []
    let i = 0
    while (i < parola.length) {
        const apertura = parola.startsWith('$(', i) ? 2 : parola[i] === '`' ? 1 : 0
        let fine = apertura ? (apertura === 2 ? fineDollaroParentesi : fineBacktick)(parola, i) : null
        let sostituto = fine !== null ? uscitaLetterale(parola.slice(i + apertura, fine - 1)) : null
        if (sostituto === null) { sostituto = parola[i]; fine = i + 1 }
        pezzi.push(sostituto)
        i = fine
    }
    return pezzi.join('')
}
const sostituisciEspansioniSemplici = (parola) => sostituisciSostituzioniSemplici(parola)
    .replace(RE_SOSTITUZIONE_PARAMETRO, (...m) => m.at(-1).sostituto)
    .replace(RE_VALORE_PREDEFINITO, (...m) => m.at(-1).predefinito)
function togliSintassiDellaParola(parola) {
    let fuori = ''
    for (const [tipo, i] of scansiona(parola)) if (tipo !== 'quote') fuori += tipo === 'esc' ? parola[i + 1] : parola[i]
    return fuori
}
/* Come la shell può SCRIVERE il nome di un comando (r\m, r''m, $(echo rm)). Stretta e senza eseguire niente. */
export function deoffusca(parola) {
    for (let k = 0; k < 2; k++) {
        const prima = parola
        parola = togliSintassiDellaParola(sostituisciEspansioniSemplici(parola))
        if (parola === prima) break
    }
    return parola
}
const contienePortatoreDiShell = (c) => {
    for (const [, , parola] of paroleDiComando(c)) if (PORTATORI_DI_SHELL.has(nomeBase(deoffusca(parola)).toLowerCase())) return true
    return false
}

/* ── I segmenti, gli interpreti e i payload eseguibili (`_execution_flag_findings`) ──────────────────────────────────── */
function* segmentiDiPrimoLivello(c) {
    let inizio = 0
    for (const [tipo, i, j, virg] of scansiona(c, 0, null, { commenti: true })) {
        if (tipo === 'comment' || (tipo === 'char' && virg === null && ';&|\n'.includes(c[i]))) {
            if (inizio < i) yield c.slice(inizio, i)
            inizio = j
        }
    }
    if (inizio < c.length) yield c.slice(inizio)
}
const INTERPRETI = [
    ['python', /^(?:py(?:\.exe)?|python[23]?(?:\.\p{Nd}+)*(?:\.exe)?)$/u], ['node', /^node(?:js)?(?:\.exe)?$/u],
    ['perl', /^perl[0-9]*(?:\.\p{Nd}+)*(?:\.exe)?$/u], ['ruby', /^ruby[0-9.]*(?:\.exe)?$/u], ['php', /^php(?:\.exe)?$/u],
    ['powershell', /^(?:powershell(?:\.exe)?|pwsh(?:\.exe)?)$/u], ['bun', /^bun(?:\.exe)?$/u], ['deno', /^deno(?:\.exe)?$/u],
]
const OPZIONI_CHE_ESEGUONO = {
    python: new Set(['-c']), node: new Set(['-e', '--eval', '-p', '--print']), perl: new Set(['-e', '--eval']), ruby: new Set(['-e']),
    php: new Set(['-r']), powershell: new Set(['-command', '-c', '-file', '-f']), bun: new Set(['-e', '--eval']), deno: new Set(['eval', '-e', '--eval']),
}
const OPZIONI_INTERPRETE_CON_ARGOMENTO = {
    python: new Set(['-W', '-X', '--check-hash-based-pycs']),
    node: new Set(['-C', '--conditions', '--cpu-prof-dir', '--diagnostic-dir', '--icu-data-dir', '--import', '--loader', '--openssl-config', '--require', '--title']),
    perl: new Set(['-0', '-F', '-I', '-M', '-m', '-x']), ruby: new Set(['-C', '-E', '-F', '-I', '-K', '-r']), php: new Set(['-c', '-d', '-z']),
    powershell: new Set(['-configurationname', '-custompipename', '-executionpolicy', '-inputformat', '-outputformat', '-settingsfile', '-version', '-windowstyle', '-workingdirectory']),
    bun: new Set(['--config', '--cwd', '--env-file', '--preload', '--require']), deno: new Set(['-L', '--log-level']),
}
const OPZIONI_STRUMENTI_DI_LETTURA = {
    sort: new Set(['--compress-program']), rg: new Set(['--pre', '--hostname-bin']), ag: new Set(['--pager']), man: new Set(['--pager', '--html', '-P', '-H']),
}
const OPZIONI_LUNGHE_CON_ARGOMENTO = {
    rg: new Set(['--after-context', '--before-context', '--color', '--colors', '--context', '--context-separator', '--dfa-size-limit', '--encoding', '--engine',
        '--field-context-separator', '--field-match-separator', '--file', '--generate', '--glob', '--hostname-bin', '--hyperlink-format', '--iglob', '--ignore-file',
        '--max-columns', '--max-count', '--max-depth', '--max-filesize', '--path-separator', '--pre', '--pre-glob', '--regex-size-limit', '--regexp', '--replace',
        '--sort', '--sortr', '--threads', '--type', '--type-add', '--type-clear', '--type-not']),
    sort: new Set(['--batch-size', '--buffer-size', '--compress-program', '--field-separator', '--files0-from', '--key', '--output', '--parallel', '--random-source',
        '--sort', '--temporary-directory']),
    man: new Set(['--config-file', '--encoding', '--extension', '--locale', '--manpath', '--pager', '--preprocessor', '--prompt', '--recode', '--sections', '--systems']),
    ag: new Set(['--ackmate-dir-filter', '--color-line-number', '--color-match', '--color-path', '--depth', '--filename-pattern', '--file-search-regex', '--ignore',
        '--ignore-dir', '--max-count', '--pager', '--path-to-ignore', '--width', '--workers']),
}
const OPZIONI_CORTE_CON_ARGOMENTO = { rg: new Set('efEmjgdtTABCMr'), sort: new Set('koStT'), man: new Set('CRLmMSserEPp'), ag: new Set('gGmpW') }
const OPZIONI_GREP_CON_ARGOMENTO = new Set(['--after-context', '--before-context', '--binary-files', '--context', '--directories', '--devices', '--exclude',
    '--exclude-dir', '--exclude-from', '--include', '--label', '--max-count', '--regexp', '--file'])
const OPZIONI_GREP_CORTE_CON_ARGOMENTO = new Set(['A', 'B', 'C', 'D', 'd', 'e', 'f', 'm'])
const OPZIONI_BASH_CON_ARGOMENTO = new Set(['-O', '+O', '-o', '+o', '--init-file', '--rcfile'])
const LETTERE_OPZIONI_BASH = new Set('ilrsDcabefhkmnptuvxBCEHPTOo')

const famigliaInterprete = (eseguibile) => { const nome = nomeBase(eseguibile).toLowerCase(); return INTERPRETI.find(([, re]) => re.test(nome))?.[0] ?? null }
const tokenDelSegmento = (segmento, inizio) => shlexDividiOppure(segmento.slice(inizio), { punteggiatura: '<>' })
const dividiAlUguale = (t) => { const k = t.indexOf('='); return k === -1 ? [t, '', ''] : [t.slice(0, k), '=', t.slice(k + 1)] }
function opzioneCheEsegue(famiglia, argomenti) {
    const opzioni = OPZIONI_CHE_ESEGUONO[famiglia], conArgomento = OPZIONI_INTERPRETE_CON_ARGOMENTO[famiglia], powershell = famiglia === 'powershell'
    let saltaValore = false
    for (const token of argomenti) {
        if (saltaValore) { saltaValore = false; continue }
        if (token === '--' || (!powershell && !token.startsWith('-'))) {
            if (famiglia === 'deno' && token.toLowerCase() === 'eval') return 'eval'
            break
        }
        const [opzione, uguale] = dividiAlUguale(token)
        const confrontabile = powershell ? opzione.toLowerCase() : opzione
        if (opzioni.has(confrontabile)) return confrontabile
        const lettere = Array.from(opzione)
        const valoreAttaccato = [...conArgomento].some((corta) => corta.startsWith('-') && !corta.startsWith('--') && opzione.startsWith(corta) && lettere.length > Array.from(corta).length)
        if (!powershell && !opzione.startsWith('--') && lettere.length > 2 && !valoreAttaccato) {
            const inMazzo = lettere.slice(1).map((ch) => `-${ch}`).find((f) => opzioni.has(f))
            if (inMazzo) return inMazzo
        }
        saltaValore = conArgomento.has(confrontabile) && !uguale
    }
    return null
}
function payloadDiBash(argomenti) {
    let k = 0
    while (k < argomenti.length) {
        const token = argomenti[k]
        if (token === '--' || !(token.startsWith('-') || token.startsWith('+'))) break
        if (OPZIONI_BASH_CON_ARGOMENTO.has(token)) { k += 2; continue }
        const lettere = Array.from(token.slice(1))
        if (token.startsWith('--') || !lettere.every((ch) => LETTERE_OPZIONI_BASH.has(ch))) { k += 1; continue }
        const consumata = lettere.includes('O') || lettere.includes('o') ? 1 : 0
        if (lettere.includes('c')) { const p = k + 1 + consumata; return [true, p < argomenti.length ? argomenti[p] : null] }
        k += 1 + consumata
    }
    return [false, null]
}
function opzioneStrumentoDiLettura(strumento, argomenti) {
    const opzioni = OPZIONI_STRUMENTI_DI_LETTURA[strumento]
    let k = 0
    while (k < argomenti.length) {
        const token = argomenti[k]
        if (token === '--') break
        const [opzione, uguale, resto] = dividiAlUguale(token)
        let payload = uguale ? resto : null
        let trovata = opzioni.has(opzione) ? opzione : null
        if (strumento === 'man' && (token.startsWith('-P') || token.startsWith('-H')) && token.length > 2) { trovata = token.slice(0, 2); payload = token.slice(2) }
        if (trovata) {
            if (payload === null && k + 1 < argomenti.length) payload = argomenti[k + 1]
            if (payload) return [trovata, payload] // l'opzione possiede il suo programma, anche se comincia con «-»
            k += payload !== null && !token.includes('=') ? 2 : 1
        } else if (OPZIONI_LUNGHE_CON_ARGOMENTO[strumento].has(opzione) && payload === null) k += 2
        else if (token.startsWith('-') && !token.startsWith('--') && token.length > 1) {
            const corte = OPZIONI_CORTE_CON_ARGOMENTO[strumento]
            const lettere = Array.from(token)
            const padrona = lettere.findIndex((ch, idx) => idx >= 1 && corte.has(ch))
            k += padrona !== -1 && padrona === lettere.length - 1 ? 2 : 1
        } else k += 1
    }
    return null
}
function* trovatiEsecuzione(c) {
    for (const segmento of segmentiDiPrimoLivello(c)) {
        for (const [inizio, , parola] of paroleDiComando(segmento)) {
            const eseguibile = deoffusca(parola)
            const token = tokenDelSegmento(segmento, inizio)
            const nome = nomeBase(eseguibile).toLowerCase()
            const famiglia = famigliaInterprete(eseguibile)
            if (token === null) {
                if (famiglia !== null || Object.hasOwn(OPZIONI_STRUMENTI_DI_LETTURA, nome)) yield [DESCRIZIONE_PAYLOAD_ILLEGGIBILE, null]
                continue
            }
            if (!token.length) continue
            const argomenti = token.slice(1)
            if (famiglia && opzioneCheEsegue(famiglia, argomenti)) yield ['script execution via -e/-c flag', null]
            else if (famiglia && argomenti.some((t) => t.startsWith('<<'))) yield ['script execution via heredoc', null]
            else {
                if (NOMI_DI_SHELL.has(nome)) {
                    const [trovato, payload] = payloadDiBash(argomenti)
                    if (trovato) yield ['shell command via -c/-lc flag', payload]
                }
                if (Object.hasOwn(OPZIONI_STRUMENTI_DI_LETTURA, nome)) {
                    const trovata = opzioneStrumentoDiLettura(nome, argomenti)
                    if (trovata) yield [`arbitrary program execution via ${nome} ${trovata[0]}`, trovata[1]]
                }
            }
        }
    }
}

/* ── grep: gli operandi PCRE fra virgolette sono DATI (`_quoted_grep_pattern_spans`, `_shell_tokens_with_spans`) ─────── */
function chiusuraBacktickDa(segmento, i) {
    let j = segmento.indexOf('`', i + 1)
    while (j !== -1 && segmento[j - 1] === '\\') j = segmento.indexOf('`', j + 1)
    return j === -1 ? null : j
}
/* Le parole del SOLO comando semplice che comincia a `inizio`, con i loro estremi; null se le virgolette non tornano. */
export function tokenConEstremi(segmento, inizio) {
    const token = []
    let valore = [], inizioToken = null, virg = null, profondita = 0, inBacktick = false, fineA = segmento.length
    const chiudi = (fine) => {
        const grezzo = segmento.slice(inizioToken, fine)
        const inerte = (grezzo.startsWith("'") && grezzo.endsWith("'")) || (grezzo.includes("='") && grezzo.endsWith("'"))
        token.push([valore.join(''), inizioToken, fine, inerte])
    }
    for (const [tipo, i] of scansiona(segmento, inizio)) {
        const ch = segmento[i]
        if (tipo === 'char' && !virg) {
            if (eSpazio(ch) && ch !== '\n') {
                if (inizioToken !== null) { chiudi(i); valore = []; inizioToken = null }
                continue
            }
            if (segmento.startsWith('$(', i)) profondita += 1
            else if (ch === '`') {
                if (inBacktick) inBacktick = false
                else if (profondita === 0 && chiusuraBacktickDa(segmento, i) === null) { fineA = i; break }
                else inBacktick = true
            } else if (ch === ')') {
                if (profondita === 0) { fineA = i; break }
                profondita -= 1
            } else if (';|&\n'.includes(ch)) { fineA = i; break }
        }
        if (inizioToken === null) inizioToken = i
        if (tipo === 'quote') virg = virg ? null : ch
        else if (tipo === 'esc') valore.push(segmento[i + 1])
        else if (ch === '\\' && !virg) return null // barra rovescia penzolante
        else valore.push(ch)
    }
    if (virg) return null
    if (inizioToken !== null) chiudi(fineA)
    return token
}
export function estremiPatternGrep(c) {
    const estremi = []
    let scostamento = 0
    for (const segmento of segmentiDiPrimoLivello(c)) {
        const inizioSegmento = c.indexOf(segmento, scostamento)
        scostamento = inizioSegmento + segmento.length
        for (const [inizio, , parola] of paroleDiComando(segmento)) {
            if (!['grep', 'egrep'].includes(nomeBase(deoffusca(parola)).toLowerCase())) continue
            const token = tokenConEstremi(segmento, inizio)
            if (token === null) return [[], true]
            const argomenti = token.slice(1), indiciPattern = []
            let pcre = false, patternEspliciti = false, indiceOperando = null, k = 0, opzioni = true
            while (k < argomenti.length) {
                const t = argomenti[k][0]
                if (opzioni && t === '--') opzioni = false
                else if (opzioni && t.startsWith('--')) {
                    const [opzione, uguale] = dividiAlUguale(t)
                    pcre = pcre || opzione === '--perl-regexp'
                    patternEspliciti = patternEspliciti || opzione === '--regexp' || opzione === '--file'
                    const prendeIlSeguente = OPZIONI_GREP_CON_ARGOMENTO.has(opzione) && !uguale
                    if (prendeIlSeguente && k + 1 >= argomenti.length) return [[], true]
                    if (opzione === '--regexp') indiciPattern.push(prendeIlSeguente ? k + 1 : k)
                    k += prendeIlSeguente ? 1 : 0
                } else if (opzioni && t.startsWith('-') && t !== '-') {
                    const lettere = Array.from(t.slice(1))
                    for (let j = 0; j < lettere.length; j++) {
                        const ch = lettere[j]
                        pcre = pcre || ch === 'P'
                        patternEspliciti = patternEspliciti || ch === 'e' || ch === 'f'
                        if (OPZIONI_GREP_CORTE_CON_ARGOMENTO.has(ch)) {
                            // la prima opzione con argomento possiede il resto del mazzo, o il token dopo se è l'ultima
                            const attaccato = j + 1 < lettere.length
                            if (!attaccato && k + 1 >= argomenti.length) return [[], true]
                            if (ch === 'e') indiciPattern.push(attaccato ? k : k + 1)
                            k += attaccato ? 0 : 1
                            break
                        }
                    }
                } else if (indiceOperando === null) indiceOperando = k
                k += 1
            }
            if (!patternEspliciti) {
                if (indiceOperando === null) return [[], pcre]
                indiciPattern.push(indiceOperando)
            }
            if (pcre) {
                for (const idx of indiciPattern) {
                    const [, a, b, inerte] = argomenti[idx]
                    if (inerte) estremi.push([inizioSegmento + a, inizioSegmento + b])
                }
            }
        }
    }
    return [estremi, false]
}
function varianteSenzaPatternGrep(c) {
    const [estremi, illeggibile] = estremiPatternGrep(c)
    if (illeggibile || !estremi.length) return [c, illeggibile]
    return [giunta(c, estremi.map(([a, b]) => [a, b, ' '.repeat(b - a)])), false]
}

/* ── Normalizzazione (`_normalize_command_for_detection`) ─────────────────────────────────────────────────────────────── */
const RE_ANSI = /\x1b(?:\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\][\s\S]*?(?:\x07|\x1b\\)|[PX^_][\s\S]*?(?:\x1b\\)|[\x20-\x2f]+[\x30-\x7e]|[\x30-\x7e])|\x9b[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\x9d[\s\S]*?(?:\x07|\x9c)|[\x80-\x9f]/g
const togliAnsi = (t) => (!t || !/[\x1b\x80-\x9f]/.test(t) ? t : t.replace(RE_ANSI, ''))
const CODA_DEL_PERCORSO = /(?<coda>(?:[/\\][^/\\\s'"`;|&<>()]*)+)/.source
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/* Le grafie della home: quella di Node, la vera dietro i collegamenti, $HOME, e su Windows come la vedono WSL e git-bash. */
function homeDaPiegare() {
    const home = homedir()
    const percorsi = [home, process.env.HOME ?? '']
    try { percorsi.push(realpathSync.native(home)) } catch { /* home illeggibile: resta la grafia di Node */ }
    const unita = /^([A-Za-z]):[\\/](.*)$/.exec(home)
    if (unita) {
        const resto = unita[2].replaceAll('\\', '/')
        percorsi.push(`/mnt/${unita[1].toLowerCase()}/${resto}`, `/${unita[1].toLowerCase()}/${resto}`)
    }
    return percorsi
}
function piegaHome(c) {
    const visti = new Set()
    for (const p of homeDaPiegare().filter(Boolean).sort((a, b) => b.length - a.length)) {
        if (visti.has(p)) continue
        visti.add(p)
        const componenti = p.split(/[/\\]+/u).filter(Boolean)
        if (componenti.length < 2) continue // «/», «C:\», vuoto: una HOME sbagliata non riscrive prefissi qualunque
        const re = new RegExp(`[/\\\\]*${componenti.map(escapeRe).join('[/\\\\]+')}${CODA_DEL_PERCORSO}`, process.platform === 'win32' ? 'gi' : 'g')
        c = c.replace(re, (...m) => `~${m.at(-1).coda.replaceAll('\\', '/')}`)
    }
    return c
}
const RE_IFS = new RegExp(py(/\$\{IFS\b[^}]*\}|\$IFS\b/.source), 'gu')
export function normalizzaPerRilevare(comando) {
    let c = togliAnsi(String(comando)).replaceAll('\x00', '').normalize('NFKC')
    c = c.replace(/\\\r?\n/g, '') // `rm -rf \<a capo>/` gira come `rm -rf /`: PRIMA della pulizia delle barre qui sotto
    c = piegaHome(c) // PRIMA delle barre rovesce, che scioglierebbero C:\Users\x in C:Usersx
    c = c.replace(/\\([^\n])/g, (_, ch) => ch)
    c = c.replace(/''|""/g, '')
    return c.replace(RE_IFS, ' ')
}

/* ── Le varianti che il pavimento guarda (`_command_detection_variants`) ──────────────────────────────────────────────── */
const MAX_CARATTERI = 128_000, MAX_SENZA_SEPARATORI = 4_096, MAX_SEGMENTI = 25_000
export function oltreIlLimiteDelParser(c) {
    if (c.length > MAX_CARATTERI) return true
    const separatori = (c.match(/[;&|\n]/g) ?? []).length
    if (c.length > MAX_SENZA_SEPARATORI && separatori === 0) return true
    return separatori >= MAX_SEGMENTI
}
export function* variantiDaControllare(comando) {
    // le virgolette si leggono sul testo VERO: la normalizzazione toglie gli escape e ne cambierebbe la parità
    const normalizzato = normalizzaPerRilevare(mascheraAcapoTraVirgolette(comando))
    const [senzaGrep] = varianteSenzaPatternGrep(normalizzato)
    const viste = new Set([senzaGrep])
    yield senzaGrep
    const nuova = (v) => { if (!v || viste.has(v)) return false; viste.add(v); return true }
    // percorsi di Windows: la normalizzazione toglie le barre rovesce come escape; si guarda anche con le barre in avanti
    if (/(?:[A-Za-z]:|\\\\)[\\]/.test(comando) || /[A-Za-z]:\\/.test(comando)) {
        const finestre = normalizzaPerRilevare(mascheraAcapoTraVirgolette(comando.replaceAll('\\', '/')))
        if (nuova(finestre)) yield finestre
    }
    // i payload delle opzioni che eseguono un programma, e i loro inizi
    const daGuardare = [normalizzato]
    while (daGuardare.length) {
        for (const [, payload] of trovatiEsecuzione(daGuardare.pop())) {
            if (nuova(payload)) {
                yield payload
                const marcato = marcaInizi(payload)
                if (marcato !== payload && nuova(marcato)) yield marcato
                daGuardare.push(payload)
            }
        }
    }
    const marcato = marcaInizi(senzaGrep)
    if (marcato !== senzaGrep && nuova(marcato)) yield marcato
    // inizi segnati sul testo VERO, poi normalizzato (lo spazio davanti salva il segno da un `\<a capo>`)
    const fedele = normalizzaPerRilevare(marcaInizi(mascheraAcapoTraVirgolette(comando), ' \n'))
    if (nuova(fedele)) yield fedele
    // le parole di comando de-offuscate, tutte insieme; quelle annidate al giro dopo
    let inAttesa = [...paroleDiComando(normalizzato)]
        .map(([a, b, parola]) => [a, b, deoffusca(parola), parola])
        .filter(([, , chiara, parola]) => chiara && chiara !== parola)
        .map(([a, b, chiara]) => [a, b, chiara])
        .sort((x, y) => x[0] - y[0] || x[1] - y[1])
    while (inAttesa.length) {
        const applicate = [], rimandate = []
        let cursore = 0
        for (const tratto of inAttesa) {
            if (tratto[0] < cursore) rimandate.push(tratto)
            else { applicate.push(tratto); cursore = tratto[1] }
        }
        const variante = giunta(normalizzato, applicate)
        if (nuova(variante)) yield variante
        inAttesa = rimandate
    }
}

/*
 * ── +1 su Hermes: gli INVOLUCRI e `eval` (owner 02/10/2026, «Involucri di Hermes + eval») ─────────────────────────────────
 * Misurato sul rilevatore vero di Hermes: `sudo -u root rm -rf /`, `timeout 5 reboot`, `nice -n 5 reboot`, `env -i reboot`,
 * `command reboot`, `chroot /x reboot`, `exec -a x reboot`, `eval reboot` PASSANO. Le regole guardano l'inizio del comando
 * (`_CMDPOS`, con sudo/env/exec/nohup/setsid/time scritti a mano e senza opzioni con argomento), mentre il modello completo degli
 * involucri Hermes ce l'ha (`_iter_shell_command_word_spans`) e lo usa solo per le regole «nega» della persona:
 * `_deny_command_variants` (`tools/approval_detection.py:1486-1525`) proietta ogni parola di comando col resto del suo comando
 * (`nome + coda`, anche col solo nome base), segue `env -S` e i payload delle opzioni che eseguono. Qui la STESSA proiezione passa
 * anche dalle regole del pavimento, ed `eval` passa i suoi argomenti come gli passano quelli di `bash -c`.
 * ⛔ Restano aperti, detti all'owner: `doas`, `xargs`, `bash <<< …` (non sono involucri nel modello di Hermes).
 * `{ soloHermes: true }` spegne il +1: è la modalità che la prova differenziale confronta col rilevatore vero di Hermes.
 */
function segmentoDelComando(c, inizio) { // `_shell_command_segment`
    let fine = c.length
    for (const [tipo, i, , virg] of scansiona(c, inizio, null, { subst: 'uq', graffe: true, commenti: true })) {
        if (tipo === 'comment' || (tipo === 'char' && virg === null && ';&|\n)`'.includes(c[i]))) { fine = i; break }
    }
    return c.slice(inizio, fine).trim()
}
/* `_split_env_string`: gli argomenti letterali di `env -S` (GNU), non parole di shell; `${NOME}` non si valuta. */
const ESCAPE_ENV = { f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '#': '#', $: '$', '"': '"', "'": "'", '\\': '\\' }
function dividiStringaEnv(payload) {
    const caratteri = Array.from(payload), argomenti = []
    let parola = [], virg = null, iniziata = false, k = 0
    while (k < caratteri.length) {
        const ch = caratteri[k]
        k += 1
        if (ch === '\\') {
            if (k === caratteri.length) return null
            const scappato = caratteri[k]
            if (virg === "'" && scappato !== "'" && scappato !== '\\') { parola.push(ch); iniziata = true; continue }
            k += 1
            if (scappato === 'c') { if (virg) return null; break }
            if (scappato === '_' && virg === null) { if (iniziata) argomenti.push(parola.join('')); parola = []; iniziata = false; continue }
            if (!Object.hasOwn(ESCAPE_ENV, scappato) && scappato !== '_') return null
            parola.push(scappato === '_' ? ' ' : ESCAPE_ENV[scappato]); iniziata = true; continue
        }
        if ((ch === "'" || ch === '"') && (virg === null || ch === virg)) { virg = virg === null ? ch : null; iniziata = true; continue }
        if (virg === null && ' \t\n\r\v\f'.includes(ch)) { if (iniziata) argomenti.push(parola.join('')); parola = []; iniziata = false; continue }
        if (virg === null && ch === '#' && !iniziata) break
        if (ch === '$' && virg !== "'") return null
        parola.push(ch); iniziata = true
    }
    if (virg) return null
    if (iniziata) argomenti.push(parola.join(''))
    return argomenti
}
/* `shlex.quote` / `shlex.join`. */
const citaShell = (s) => (!s ? "''" : /^[%+,\-./0-9:=@A-Z_a-z]+$/.test(s) ? s : `'${s.replaceAll("'", `'"'"'`)}'`)
function payloadDiEnvS(token) { // `_env_split_payload`
    let k = 1
    while (k < token.length) {
        const t = token[k]
        if (t === '--' || !t.startsWith('-')) return null
        const [opzione, uguale, valore] = dividiAlUguale(t)
        if (opzione === '--split-string' || t.startsWith('-S')) {
            const attaccato = opzione === '--split-string' ? Boolean(uguale) : t.length > 2
            if (!attaccato) k += 1
            const payload = attaccato ? (opzione === '--split-string' ? valore : t.slice(2)) : (k < token.length ? token[k] : '')
            const argomenti = dividiStringaEnv(payload)
            return argomenti !== null ? [...argomenti, ...token.slice(k + 1)].map(citaShell).join(' ') : null
        }
        k += !uguale && OPZIONI_INVOLUCRO_CON_ARGOMENTO.env.has(opzione) ? 2 : 1
    }
    return null
}
function* proiezioniDegliInvolucri(comando) {
    const daGuardare = [comando], viste = new Set()
    while (daGuardare.length) {
        // ⛔ un a capo FRA VIRGOLETTE resta un dato: si maschera PRIMA di leggere le parole (come le varianti di Hermes), perché
        // la de-offuscazione di una parola come `$(hermes send "riga\nrm -rf /")` toglie le virgolette e l'a capo diventerebbe
        // un separatore (misurato: senza, `hermes send "riga\nshutdown -h now"` e `python3 -c '…\ninit 6'` venivano fermati)
        const sorgente = mascheraAcapoTraVirgolette(daGuardare.pop())
        if (viste.has(sorgente)) continue
        viste.add(sorgente)
        for (const [inizio, fine, parola] of paroleDiComando(sorgente)) {
            const segmento = segmentoDelComando(sorgente, inizio)
            const eseguibile = deoffusca(parola)
            // Hermes qui comprime gli spazi fuori dalle virgolette, perché le regole «nega» della persona sono testi con uno spazio
            // solo; le regole del pavimento usano `\s`, quindi la compressione non cambia niente (mutante equivalente, misurato)
            const coda = segmento.slice(fine - inizio)
            for (const nome of new Set([eseguibile, nomeBase(eseguibile)])) {
                yield nome + coda
                yield normalizzaPerRilevare(nome + coda)
            }
            const base = nomeBase(eseguibile)
            if (base === 'env') {
                const token = tokenDelSegmento(segmento, 0)
                const payload = token && payloadDiEnvS(token)
                if (payload) daGuardare.push(payload)
            } else if (base.toLowerCase() === 'eval') { // +1: gli argomenti di eval, uniti da spazi, sono un comando
                const token = tokenDelSegmento(segmento, 0)
                if (token && token.length > 1) daGuardare.push(token.slice(1).join(' '))
            }
        }
        for (const [, payload] of trovatiEsecuzione(sorgente)) if (payload) daGuardare.push(payload)
    }
}

const descrizioneDellaVariante = (variante) => {
    const minuscola = variante.toLowerCase()
    let mascherata = null
    for (const [re, descrizione, conMaschera] of SCHEMI_SENZA_RECUPERO) {
        if (conMaschera && mascherata === null) {
            mascherata = contienePortatoreDiShell(variante) ? minuscola : mascheraProsaTraVirgolette(variante).toLowerCase()
        }
        if (re.test(conMaschera ? mascherata : minuscola)) return descrizione
    }
    return null
}
/** (1) `detect_hardline_command`, più il +1 sugli involucri: la descrizione del comando senza recupero, o null. */
export function rilevaComandoSenzaRecupero(comando, { soloHermes = false } = {}) {
    const c = String(comando ?? '')
    if (oltreIlLimiteDelParser(c)) return DESCRIZIONE_LIMITE_PARSER
    if (varianteSenzaPatternGrep(mascheraAcapoTraVirgolette(c))[1]) return DESCRIZIONE_PAYLOAD_ILLEGGIBILE
    for (const variante of variantiDaControllare(c)) {
        const trovata = descrizioneDellaVariante(variante)
        if (trovata) return trovata
    }
    if (soloHermes) return null
    for (const variante of proiezioniDegliInvolucri(c)) {
        const trovata = descrizioneDellaVariante(variante)
        if (trovata) return trovata
    }
    return null
}

/* ── (3) `sudo -S`: una password indovinata passata a sudo (`:176-185`) ──────────────────────────────────────────────── */
const RE_SUDO_DA_STDIN = new RegExp(py(/(?:^|[;&|`\n]|&&|\|\||\$\()\s*sudo\s+-S\b/.source), 'iu')
export function sudoDaStdin(comando) {
    return RE_SUDO_DA_STDIN.test(normalizzaPerRilevare(String(comando ?? '')).toLowerCase()) ? 'sudo password guessing via stdin (sudo -S)' : null
}

/* ── (2) Il runtime da cui gira TALOS (`agent/runtime_self_protection.py`) ──────────────────────────────────────────────── */
const RE_SEGMENTI_RUNTIME = /\n|&&|\|\||[;|]/
const PREFISSI_DI_COMANDO = new Set(['sudo', 'command', 'nohup', 'exec', 'env', 'nice', 'time'])
const COMANDI_CHE_CANCELLANO = new Set(['rm', 'rmdir', 'rd', 'del', 'erase', 'remove-item', 'ri'])
const RE_FIND_DELETE = /(?:^|\s)-(?:delete|exec\s+rm\b)/i
const windows = () => process.platform === 'win32'
function espandi(p) {
    if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) p = homedir() + p.slice(1)
    const ambiente = (nome, intero) => process.env[nome] ?? intero
    p = p.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (intero, a, b) => ambiente(a ?? b, intero))
    return windows() ? p.replace(/%([^%]+)%/g, (intero, nome) => ambiente(nome, intero)) : p
}
/* realpath anche per una coda che non esiste: si risolve il prefisso che c'è e si riattacca il resto, come Python. */
function realpathTollerante(p) {
    try { return realpathSync.native(p) } catch {
        const genitore = dirname(p)
        return genitore === p ? p : join(realpathTollerante(genitore), basename(p))
    }
}
/** Una forma sola per le grafie della shell e i percorsi del runtime. I relativi si risolvono nella cartella della sessione. */
export function percorsoCanonico(grezzo, { cartella = process.cwd() } = {}) {
    let p = String(grezzo ?? '').trim()
    if (!p) return ''
    if (p.length >= 2 && p[0] === p.at(-1) && `"'`.includes(p[0])) p = p.slice(1, -1)
    p = espandi(p)
    if (windows()) {
        const m = /^\/(?:(mnt)\/)?([a-zA-Z])\/(.+)$/.exec(p)
        if (m) p = `${m[2]}:\\${m[3]}`
        p = p.replaceAll('/', '\\')
    }
    const assoluto = realpathTollerante(resolve(cartella, normalize(p)))
    return windows() ? assoluto.toLowerCase() : assoluto
}
/* Lo stesso percorso, o uno antenato dell'altro. Un antenato scritto con la barra finale (`C:\`) vale lo stesso. */
function siSovrappongono(a, b) {
    if (!a || !b) return false
    const conBarra = (x) => (x.endsWith(sep) ? x : x + sep)
    return a === b || a.startsWith(conBarra(b)) || b.startsWith(conBarra(a))
}
let runtimeInMemoria = null
/** I percorsi protetti: il Node/Electron che esegue il server e la sua cartella (sys.executable e `home` di pyvenv.cfg). */
export function percorsiDelRuntime() {
    if (runtimeInMemoria) return runtimeInMemoria
    const eseguibile = percorsoCanonico(process.execPath), cartella = percorsoCanonico(dirname(process.execPath))
    runtimeInMemoria = [
        [eseguibile, 'the Node runtime this TALOS server is running from'],
        [cartella, 'the folder of the runtime this TALOS server is running from'],
    ].filter(([p], i, tutti) => p && tutti.findIndex(([q]) => q === p) === i)
    return runtimeInMemoria
}
export function percorsoProtetto(percorso, { protetti = percorsiDelRuntime(), cartella } = {}) {
    const risolto = percorsoCanonico(percorso, { cartella })
    if (!risolto) return null
    return protetti.find(([protetto]) => siSovrappongono(risolto, protetto))?.[1] ?? null
}
function paroleDelSegmento(segmento) {
    // un percorso di Windows con le barre rovesce: shlex POSIX le mangerebbe (C:\Program → C:Program)
    const testo = /(?:[A-Za-z]:|\\\\)\\|[A-Za-z]:\\/.test(segmento) ? segmento.replaceAll('\\', '/') : segmento
    return shlexDividiOppure(testo) ?? testo.split(/\s+/u).filter(Boolean)
}
function senzaPrefissi(parole) {
    let k = 0
    while (k < parole.length) {
        const prima = parole[k]
        if (PREFISSI_DI_COMANDO.has(prima)) { k += 1; continue }
        if (prima.includes('=') && !prima.startsWith('-') && !prima.startsWith('/') && /^[A-Za-z_][A-Za-z0-9_]*=/.test(prima)) { k += 1; continue }
        break
    }
    return parole.slice(k)
}
/** (2) `command_deletes_runtime`: la descrizione del percorso del runtime che il comando cancellerebbe, o null. */
export function comandoCancellaIlRuntime(comando, { protetti = percorsiDelRuntime(), cartella } = {}) {
    if (!comando || !String(comando).trim() || !protetti.length) return null
    for (const segmento of String(comando).split(RE_SEGMENTI_RUNTIME)) {
        const parole = senzaPrefissi(paroleDelSegmento(segmento))
        if (!parole.length) continue
        const nome = nomeBase(parole[0]).toLowerCase()
        const bersagli = nome === 'find' && RE_FIND_DELETE.test(segmento) ? parole.slice(1)
            : COMANDI_CHE_CANCELLANO.has(nome) ? parole.slice(1) : []
        for (const parola of bersagli) {
            if (parola.startsWith('-')) continue
            const colpito = percorsoProtetto(parola, { protetti, cartella })
            if (colpito) return colpito
        }
    }
    return null
}

/* ── Il pavimento intero, nell'ordine di Hermes (`_floor_block`): (1), poi (2), poi (3) ─────────────────────────────────── */
/**
 * @returns {{ tipo: 'senza-recupero'|'runtime'|'sudo', motivo: string } | null}
 */
export function bloccoDelPavimento(comando, { cartella, protetti } = {}) {
    const senzaRecupero = rilevaComandoSenzaRecupero(comando)
    if (senzaRecupero) return { tipo: 'senza-recupero', motivo: senzaRecupero }
    const runtime = comandoCancellaIlRuntime(comando, { cartella, ...(protetti ? { protetti } : {}) })
    if (runtime) return { tipo: 'runtime', motivo: `recursive/any delete of ${runtime}` }
    const sudo = sudoDaStdin(comando)
    if (sudo) return { tipo: 'sudo', motivo: sudo }
    return null
}
/** Il rifiuto per il modello: che cosa è il pavimento, e che cosa NON è (owner 02/10/2026). */
export function rifiutoDelPavimento({ tipo, motivo }) {
    if (tipo === 'sudo') {
        return `REFUSED. ${motivo}: it was not run, and no permission level unlocks it. Do not pipe passwords to sudo -S — it is a `
            + 'brute-force vector. If a command really needs sudo, ask the person to run it in their own terminal.'
    }
    const base = `REFUSED. This command matches a hardline pattern (${motivo}): it was not run, and no permission level unlocks it. `
        + 'This floor stops direct cases only; it is not a sandbox, so do not try to rephrase the command to get around it.'
    return motivo === DESCRIZIONE_LIMITE_PARSER || motivo === DESCRIZIONE_PAYLOAD_ILLEGGIBILE
        ? `${base} This block fires on oversized or unparseable inline commands (heredocs, giant one-liners), not on the operation `
            + 'itself: write the script to a file with scrivi, then run that file with shell. Do not retry inline.'
        : base
}
