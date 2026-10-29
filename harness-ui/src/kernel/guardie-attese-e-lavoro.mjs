/*
 * ⛔⛔ R-21 e R-26 (Performance 29/10/2026; owner 29/10 notte, le opzioni consigliate; contratto con la CLI, OK lo stesso giorno).
 *   Ricerca: `Downloads/handoff-talos-2026-09-27/in-corso/RICERCA-R21-R26-ONE-UP-2026-10-29.md` (codice dei concorrenti, file:riga).
 *
 * R-21 D2 — LE ATTESE A VUOTO. In E-segreti r1 272 s dei 317 s di attrezzi erano `sleep 90`, `sleep 60` e riletture del registro.
 *   Come Claude Code (byte 259481774 `Ows`: un comando che COMINCIA con `sleep N`, N ≥ 25 s, non in sottofondo, non parte —
 *   byte 259489226 «Blocked: … Do not chain shorter sleeps to work around this block»), più due cose che Claude Code non fa:
 *   le forme dei tre interpreti (bash `sleep 1m`, PowerShell `Start-Sleep -Seconds`/`-Milliseconds`, cmd `timeout /t`, il
 *   classico `ping -n N 127.0.0.1`, e le stesse dentro `bash -c`, `powershell -Command`, `cmd /c`, `wsl`), e le attese corte
 *   IN FILA nello stesso turno (Claude Code lo chiede solo a parole): da `SOGLIA_ATTESE_DEL_TURNO_S` in su si ferma anche quella.
 *   Vale anche in Accesso pieno (owner): non è una domanda, è un'attesa che non serve.
 *
 * R-26 B — IL LAVORO DELLA PERSONA. `git stash` 14 volte contro 2 di Claude Code; nessun concorrente lo intercetta. Owner, con
 *   l'estensione del 29/10 notte: `git stash` (che nasconde), `git reset --hard`, `git checkout -- <percorsi>` / `git checkout .`,
 *   `git restore` sull'albero di lavoro (non il solo `--staged`) e `git clean -f…` NON partono se toccano modifiche che non sono
 *   dell'agente — anche in Accesso pieno, con le alternative nell'esito. Se sono tutte dell'agente, passano: è il suo lavoro.
 *   Qui solo il RICONOSCIMENTO (puro); la lettura di `git status` e il verdetto stanno nel kernel, che sa chi ha scritto cosa.
 *   ⛔ Limiti dichiarati, come `comandoNominaUnaBloccata` (path-policy): un alias di git, uno script che chiama git da sé, una
 *   variabile che contiene il comando non si riconoscono. Il riconoscimento non è un confine: la foto del turno (R5.11) resta.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { radiceScratch } from '../scratch.mjs' // la cartella proposta per `git worktree add`: mai la TEMP di sistema (SCRATCH-CANCELLO-01)

import { segmentiDiPrimoLivello } from './pavimento-comandi.mjs'

export const SOGLIA_ATTESA_S = 25 // Claude Code: `var XLr=25` (byte 257756591)
export const SOGLIA_ATTESE_DEL_TURNO_S = 60

/* Le parole di un segmento: virgolette tolte, barre rovesce LASCIATE (un percorso di Windows resta intero). Niente espansioni. */
export function paroleDelSegmento(segmento) {
    const parole = []
    let parola = '', aperta = null, presente = false
    for (const c of String(segmento)) {
        if (aperta) { if (c === aperta) aperta = null; else parola += c; continue }
        if (c === '"' || c === "'") { aperta = c; presente = true; continue }
        if (/\s/u.test(c)) { if (parola || presente) parole.push(parola); parola = ''; presente = false; continue }
        parola += c
    }
    if (parola || presente) parole.push(parola)
    return parole
}

/* I segmenti di primo livello (`;`, `&&`, `||`, `|`, `&`, a capo), senza le parentesi di un sottoguscio o di un blocco. */
function segmenti(comando) {
    let elenco
    try { elenco = [...segmentiDiPrimoLivello(String(comando))] } catch { elenco = String(comando).split(/[;&|\n]+/u) }
    return elenco.map((s) => s.trim().replace(/^[({]\s*/u, '').replace(/\s*[)}]$/u, '').trim()).filter(Boolean)
}

const nomeDelComando = (parola) => String(parola ?? '').replaceAll('\\', '/').split('/').pop().toLowerCase().replace(/\.exe$/u, '')
/* Toglie davanti le assegnazioni `X=1`, `env …`, `command`, `exec`, `builtin`, `nohup`, `time`, `call` di cmd. */
function senzaPrefissi(parole) {
    let i = 0
    while (i < parole.length) {
        const p = parole[i], n = nomeDelComando(p)
        if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(p)) { i += 1; continue }
        if (['command', 'exec', 'builtin', 'nohup', 'time', 'call', 'env', 'busybox'].includes(n)) { i += 1; continue }
        break
    }
    return parole.slice(i)
}
/* Il comando portato da un'altra shell: `bash -c "…"`, `sh -c`, `powershell -Command …`, `pwsh -c`, `cmd /c …`, `wsl [-e] …`. */
function carico(parole) {
    const n = nomeDelComando(parole[0])
    if (['bash', 'sh', 'zsh', 'dash', 'ksh'].includes(n)) {
        const k = parole.findIndex((p, i) => i > 0 && /^-[a-z]*c[a-z]*$/u.test(p))
        return k > 0 && parole[k + 1] !== undefined ? parole[k + 1] : null
    }
    if (n === 'powershell' || n === 'pwsh') {
        const k = parole.findIndex((p, i) => i > 0 && /^[-/](c|command)$/iu.test(p))
        return k > 0 ? parole.slice(k + 1).join(' ') : null
    }
    if (n === 'cmd') {
        const k = parole.findIndex((p, i) => i > 0 && /^\/[ck]$/iu.test(p))
        return k > 0 ? parole.slice(k + 1).join(' ') : null
    }
    if (n === 'wsl') {
        let i = 1
        while (i < parole.length && /^-/u.test(parole[i])) {
            if (['-e', '--exec', '--'].includes(parole[i])) { i += 1; break }
            i += ['-d', '--distribution', '-u', '--user', '--cd'].includes(parole[i]) ? 2 : 1
        }
        return i < parole.length ? parole.slice(i).map((p) => (/\s/u.test(p) ? `"${p}"` : p)).join(' ') : null
    }
    return null
}

/* ── R-21 D2: le attese ─────────────────────────────────────────────────────────────────────────────────────────────────── */
const UNITA = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }
function durataPosix(argomenti) {
    if (argomenti.length === 0) return null
    let somma = 0
    for (const a of argomenti) {
        const m = /^(\d+(?:\.\d*)?|\.\d+)([smhd]?)$/iu.exec(a)
        if (!m) return null
        somma += Number(m[1]) * UNITA[m[2].toLowerCase()]
    }
    return somma
}
function durataStartSleep(argomenti) {
    let secondi = null
    for (let i = 0; i < argomenti.length; i += 1) {
        const a = argomenti[i].toLowerCase()
        const valore = Number(argomenti[i + 1])
        if (/^-(s|se|sec|seco|secon|second|seconds)$/u.test(a) && Number.isFinite(valore)) { secondi = valore; i += 1 }
        else if (/^-(m|mi|mil|milli|millis|millisecond|milliseconds|ms)$/u.test(a) && Number.isFinite(valore)) { secondi = valore / 1000; i += 1 }
        else if (/^-(s|seconds):(\d+(?:\.\d+)?)$/u.test(a)) secondi = Number(a.split(':')[1])
        else if (!a.startsWith('-') && Number.isFinite(Number(a)) && secondi === null) secondi = Number(a)
    }
    return secondi
}
const LOCALE = /^(127\.\d+\.\d+\.\d+|localhost|::1|0\.0\.0\.0)$/iu
/** Quanto aspetta il comando di UN segmento, in secondi, e in che forma; `null` se non è un'attesa. */
export function attesaDelSegmento(segmento, profondita = 0) {
    const parole = senzaPrefissi(paroleDelSegmento(segmento))
    if (parole.length === 0) return null
    const n = nomeDelComando(parole[0]), argomenti = parole.slice(1)
    if (n === 'sleep') {
        const secondi = argomenti.some((a) => a.startsWith('-')) ? durataStartSleep(argomenti) : durataPosix(argomenti)
        return secondi === null ? null : { secondi, forma: parole.join(' ') }
    }
    if (n === 'start-sleep') {
        const secondi = durataStartSleep(argomenti)
        return secondi === null ? null : { secondi, forma: parole.join(' ') }
    }
    if (n === 'timeout') { // di cmd: `timeout /t N` (il `timeout DURATA comando` di coreutils non è un'attesa)
        const k = argomenti.findIndex((a) => /^[/-]t$/iu.test(a))
        const secondi = k >= 0 ? Number(argomenti[k + 1]) : NaN
        return Number.isFinite(secondi) && secondi >= 0 ? { secondi, forma: parole.join(' ') } : null
    }
    if (n === 'ping') { // `ping -n N 127.0.0.1 > nul`: l'attesa di cmd più vecchia, N-1 secondi
        const k = argomenti.findIndex((a) => /^-[nc]$/iu.test(a))
        const volte = k >= 0 ? Number(argomenti[k + 1]) : NaN
        const bersaglio = argomenti.filter((a, i) => !a.startsWith('-') && i !== k + 1 && !/^>|^nul$|^\/dev\/null$/iu.test(a))
        if (!Number.isFinite(volte) || bersaglio.length !== 1 || !LOCALE.test(bersaglio[0])) return null
        return { secondi: Math.max(0, volte - 1), forma: parole.join(' ') }
    }
    const interno = profondita < 3 ? carico(parole) : null
    if (interno) {
        const primo = segmenti(interno)[0]
        return primo ? attesaDelSegmento(primo, profondita + 1) : null
    }
    return null
}

/**
 * L'attesa che un comando della shell farebbe, guardando il PRIMO segmento come Claude Code (`Ows`): `{ secondi, forma, seguito }`
 * oppure `null`. `seguito` è il resto del comando (Claude Code: «sleep N followed by: …»).
 */
export function attesaDelComando(comando) {
    const pezzi = segmenti(comando)
    if (pezzi.length === 0) return null
    const attesa = attesaDelSegmento(pezzi[0])
    return attesa ? { ...attesa, seguito: pezzi.slice(1).join('; ') } : null
}

/**
 * Il verdetto: `{ ferma: true, secondi, forma, seguito, nelTurno }` se l'attesa va fermata, `{ ferma: false, secondi }` se passa
 * (e si conta), `null` se non è un'attesa. `giaAttesiS`: le attese passate in questo turno.
 */
export function decidiAttesa(comando, { giaAttesiS = 0, inSfondo = false } = {}) {
    if (inSfondo) return null // `background:true`: non tiene il giro in ostaggio
    const attesa = attesaDelComando(comando)
    if (!attesa) return null
    if (attesa.secondi >= SOGLIA_ATTESA_S) return { ferma: true, ...attesa, nelTurno: giaAttesiS }
    if (attesa.secondi > 0 && giaAttesiS + attesa.secondi >= SOGLIA_ATTESE_DEL_TURNO_S) return { ferma: true, ...attesa, nelTurno: giaAttesiS }
    return { ferma: false, secondi: attesa.secondi }
}

const arrotonda = (s) => (Number.isInteger(s) ? String(s) : s.toFixed(1))
/** Il rifiuto per il modello (inglese). `svegliaDisponibile`: se la fine di un comando in sottofondo lo sveglierà a turno chiuso. */
export function messaggioAttesaFermata(verdetto, { svegliaDisponibile = true } = {}) {
    const quanto = verdetto.secondi >= SOGLIA_ATTESA_S
        ? `it would only wait ${arrotonda(verdetto.secondi)} s${verdetto.seguito ? ` before running: ${verdetto.seguito}` : ''}`
        : `you already waited ${arrotonda(verdetto.nelTurno)} s with sleep in this turn, and this would add ${arrotonda(verdetto.secondi)} s more`
    const sfondo = svegliaDisponibile
        ? 'A command you started in the background tells you itself when it ends: keep working on what does not depend on it, or end your turn if there is nothing else — you will be woken when it finishes.'
        : 'A command you started in the background reports its end with your next tool result while this turn lasts: meanwhile do useful work, or read its output file with leggi.'
    return `NOT RUN. \`${verdetto.forma}\`: ${quanto}, and waiting with sleep is blocked (${SOGLIA_ATTESA_S} s or more at once, or ${SOGLIA_ATTESE_DEL_TURNO_S} s in all in one turn). Nothing was run. `
        + `${sfondo} To wait for a condition, run a short check loop instead (e.g. \`until <check>; do sleep 2; done\`); to let a long command finish, start it with background:true. `
        + 'Do not chain shorter sleeps to get around this.'
}

/* ── R-26 B: il lavoro della persona ────────────────────────────────────────────────────────────────────────────────────── */
const OPZIONI_GIT_CON_ARGOMENTO = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env'])
const SOTTOCOMANDI_STASH_INNOCUI = new Set(['list', 'show', 'apply', 'pop', 'drop', 'clear', 'branch', 'create', 'store'])

/**
 * Che cosa fa al lavoro un comando git di UN segmento: `{ tipo, forma, cartelle: [-C…], percorsi: [] | null, nonTracciati, ignorati }`
 * oppure `null`. `percorsi: null` = tutto l'albero; `tipo` ∈ 'stash' | 'reset-hard' | 'checkout' | 'restore' | 'clean'.
 */
export function azioneDelSegmento(segmento, profondita = 0) {
    const parole = senzaPrefissi(paroleDelSegmento(segmento))
    if (parole.length === 0) return null
    if (nomeDelComando(parole[0]) !== 'git') {
        const interno = profondita < 3 ? carico(parole) : null
        if (!interno) return null
        for (const s of segmenti(interno)) { const a = azioneDelSegmento(s, profondita + 1); if (a) return a }
        return null
    }
    const cartelle = []
    let i = 1
    while (i < parole.length && parole[i].startsWith('-')) {
        const p = parole[i]
        if (p === '-C') { if (parole[i + 1] !== undefined) cartelle.push(parole[i + 1]); i += 2; continue }
        if (OPZIONI_GIT_CON_ARGOMENTO.has(p)) { i += 2; continue }
        i += 1
    }
    const sotto = parole[i], resto = parole.slice(i + 1)
    const forma = parole.join(' ')
    const dopoIlDoppioTrattino = () => { const k = resto.indexOf('--'); return k >= 0 ? resto.slice(k + 1) : null }
    const base = { forma, cartelle }
    if (sotto === 'stash') {
        if (resto[0] && SOTTOCOMANDI_STASH_INNOCUI.has(resto[0])) return null
        const opzioni = resto[0] === 'push' || resto[0] === 'save' ? resto.slice(1) : resto
        const tutti = opzioni.includes('-a') || opzioni.includes('--all')
        const percorsi = dopoIlDoppioTrattino()
        return { ...base, tipo: 'stash', percorsi: percorsi && percorsi.length ? percorsi : null,
            nonTracciati: tutti || opzioni.includes('-u') || opzioni.includes('--include-untracked'), ignorati: tutti }
    }
    if (sotto === 'reset') {
        return resto.some((a) => /^--h(a(r(d)?)?)?$/u.test(a)) ? { ...base, tipo: 'reset-hard', percorsi: null, nonTracciati: false, ignorati: false } : null
    }
    if (sotto === 'checkout') {
        const percorsi = dopoIlDoppioTrattino()
        if (percorsi && percorsi.length) return { ...base, tipo: 'checkout', percorsi, nonTracciati: false, ignorati: false }
        if (resto.includes('.') || resto.includes('-f') || resto.includes('--force')) return { ...base, tipo: 'checkout', percorsi: null, nonTracciati: false, ignorati: false }
        return null
    }
    if (sotto === 'restore') {
        const staged = resto.some((a) => a === '--staged' || a === '-S' || /^-[A-Za-z]*S[A-Za-z]*$/u.test(a) && !a.startsWith('--'))
        const worktree = resto.some((a) => a === '--worktree' || a === '-W' || /^-[A-Za-z]*W[A-Za-z]*$/u.test(a) && !a.startsWith('--'))
        if (staged && !worktree) return null
        const percorsi = []
        for (let k = 0; k < resto.length; k += 1) {
            const a = resto[k]
            if (a === '--') { percorsi.push(...resto.slice(k + 1)); break }
            if (a === '-s' || a === '--source' || a === '--pathspec-from-file') { k += 1; continue }
            if (!a.startsWith('-')) percorsi.push(a)
        }
        return { ...base, tipo: 'restore', percorsi: percorsi.length && !percorsi.includes('.') ? percorsi : null, nonTracciati: false, ignorati: false }
    }
    if (sotto === 'clean') {
        const corte = resto.filter((a) => /^-[A-Za-z]+$/u.test(a)).join('')
        const forza = corte.includes('f') || resto.includes('--force')
        const prova = corte.includes('n') || resto.includes('--dry-run')
        if (!forza || prova) return null
        const percorsi = dopoIlDoppioTrattino() ?? resto.filter((a) => !a.startsWith('-'))
        return { ...base, tipo: 'clean', percorsi: percorsi.length ? percorsi : null, nonTracciati: true,
            ignorati: corte.includes('x') || corte.includes('X'), soloIgnorati: corte.includes('X') && !corte.includes('x') }
    }
    return null
}

/** Le azioni sul lavoro di tutto un comando (ogni segmento: `git stash && npm test` conta). */
export function azioniSulLavoro(comando) {
    const azioni = []
    for (const s of segmenti(comando)) { const a = azioneDelSegmento(s); if (a) azioni.push(a) }
    return azioni
}

/* Le voci di `git status --porcelain=v1 -z` (percorsi relativi alla radice del repository), con le rinomine (due percorsi). */
export function vociDelloStato(uscita) {
    const pezzi = String(uscita).split('\0')
    const voci = []
    for (let k = 0; k < pezzi.length; k += 1) {
        const r = pezzi[k]
        if (r.length < 4) continue
        const xy = r.slice(0, 2), percorso = r.slice(3)
        voci.push({ xy, percorso })
        if (xy[0] === 'R' || xy[0] === 'C') k += 1 // il percorso d'origine segue
    }
    return voci
}

/** Le voci che l'azione toccherebbe: tracciate cambiate, e — per stash -u/-a e clean — non tracciate (ed eventualmente ignorate). */
export function vociToccate(azione, voci, { prefisso = '' } = {}) {
    const dentro = (percorso) => {
        if (!azione.percorsi) return true
        return azione.percorsi.some((p) => {
            const relativo = (prefisso + String(p).replaceAll('\\', '/').replace(/^\.\//u, '')).replace(/\/+$/u, '')
            return relativo === '' || relativo === '.' || percorso === relativo || percorso.startsWith(`${relativo}/`)
        })
    }
    return voci.filter(({ xy, percorso }) => {
        const nonTracciato = xy === '??', ignorato = xy === '!!'
        if (azione.tipo === 'clean') {
            if (azione.soloIgnorati) return ignorato && dentro(percorso)
            return (nonTracciato || (ignorato && azione.ignorati)) && dentro(percorso)
        }
        if (ignorato) return azione.ignorati && dentro(percorso)
        if (nonTracciato) return azione.nonTracciati && dentro(percorso)
        return dentro(percorso)
    })
}

const VERBI = { stash: 'set aside (stash)', 'reset-hard': 'discard', checkout: 'overwrite', restore: 'overwrite', clean: 'delete' }
/** Il rifiuto per il modello (inglese), con le alternative. `dellaPersona`: i percorsi (relativi) non scritti dall'agente. */
/*
 * ⛔ Owner 29/10/2026 sera («al modello l'alternativa pronta», dopo la ricerca: Claude Code, Codex, Hermes, opencode): il rifiuto non
 *   spezza la chat — nessuna carta, nessuna pausa — e porta il comando GIÀ SCRITTO col file vero e una cartella proposta, così il
 *   modello va avanti nello stesso passo invece di riempire uno schema (`<path>`). I percorsi sono relativi alla radice del repository,
 *   come li vuole `HEAD:`; gli eventuali `-C` del comando rifiutato si ripetono.
 */
export function messaggioLavoroProtetto(azione, dellaPersona) {
    const mostrati = dellaPersona.slice(0, 10).join(', ') + (dellaPersona.length > 10 ? `, … and ${dellaPersona.length - 10} more` : '')
    const git = ['git', ...(azione.cartelle ?? []).map((c) => `-C "${c}"`)].join(' ')
    const primo = String(dellaPersona[0] ?? '').replace(/\\/gu, '/')
    let copia
    try { copia = join(radiceScratch(), 'talos-committed') } catch { copia = '../talos-committed' } // un TALOS_SCRATCH_DIR storto non toglie il rifiuto
    return `REFUSED. Nothing was run: \`${azione.forma}\` would ${VERBI[azione.tipo]} changes you did not make in this session — `
        + `${dellaPersona.length} file(s) the person changed and has not committed: ${mostrati}. Do not hide, overwrite or discard the person's work. `
        + `To read a file as committed, run \`${git} show "HEAD:${primo}"\`${dellaPersona.length > 1 ? ' (the same for the others)' : ''}; `
        + `to work on the committed code, use a separate copy: \`${git} worktree add "${copia}" HEAD\` (then \`${git} worktree remove "${copia}"\`); `
        + 'to undo only your own edits, edit those files back. If the person asked for this, tell them it was stopped and let them run it or commit first.'
}

/* ── R-26 B: chi ha scritto cosa ────────────────────────────────────────────────────────────────────────────────────────── */
const TEMPO_GIT_MS = 10_000
function eseguiGit(cwd, argomenti) {
    return new Promise((fine) => {
        let figlio
        try {
            /* stdin chiuso: git qui non legge niente, e un canale aperto che nessuno ascolta è uno che può far cadere il server */
            figlio = spawn('git', argomenti, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } })
        } catch (errore) { fine({ codice: -1, stdout: '', errore }); return }
        const pezzi = []
        const orologio = setTimeout(() => { try { figlio.kill() } catch { /* già uscito */ } }, TEMPO_GIT_MS)
        /* ⛔ L-2 (e6abdadbd): con una cartella oltre i 260 caratteri git non parte e i canali emettono `read ENOTCONN`; senza chi li
           ascolta l'errore non è gestito e cade l'INTERO processo. Si ascoltano: il fallimento resta quello di 'error'/'close'. */
        figlio.stdout.on('error', () => {})
        figlio.stderr.on('error', () => {})
        figlio.stdout.on('data', (d) => pezzi.push(d))
        figlio.stderr.on('data', () => {})
        figlio.once('error', (errore) => { clearTimeout(orologio); fine({ codice: -1, stdout: '', errore }) })
        figlio.once('close', (codice) => { clearTimeout(orologio); fine({ codice, stdout: Buffer.concat(pezzi).toString('utf8') }) })
    })
}
/** La cartella dove gira il git di un'azione: la cartella della sessione, poi ogni `-C` in fila (relativi al precedente). */
export const cartellaDellAzione = (cartella, azione) => azione.cartelle.reduce((dove, c) => resolve(dove, c), cartella)

/**
 * Lo stato del repository di `cwd`: `{ repository: false }` fuori da un repository, oppure `{ repository: true, radice, prefisso, voci }`.
 * Lancia se git c'è ma lo stato non si legge (chi chiama decide: qui il lavoro della persona si protegge, quindi si NEGA).
 */
export async function statoDelRepository(cwd, { ignorati = false, git = eseguiGit } = {}) {
    const radice = await git(cwd, ['rev-parse', '--show-toplevel'])
    if (radice.errore?.code === 'ENOENT') return { repository: false, gitAssente: true }
    if (radice.codice !== 0) return { repository: false }
    const prefisso = await git(cwd, ['rev-parse', '--show-prefix'])
    const stato = await git(cwd, ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all', ...(ignorati ? ['--ignored=matching'] : [])])
    if (stato.codice !== 0) throw new Error(`git status exited ${stato.codice}`)
    return { repository: true, radice: radice.stdout.trim(), prefisso: prefisso.codice === 0 ? prefisso.stdout.trim() : '', voci: vociDelloStato(stato.stdout) }
}

/** L'impronta sha256 dei byte di un file, o `null` se non c'è. */
export async function improntaDelFile(assoluto) {
    try { return createHash('sha256').update(await readFile(assoluto)).digest('hex') } catch { return null }
}
/** La chiave di confronto di un percorso assoluto: su Windows senza maiuscole e con un separatore solo. */
export const chiaveDelPercorso = (assoluto) => (process.platform === 'win32' ? resolve(assoluto).toLowerCase() : resolve(assoluto))

/* ── R-21 D1/D3: che cosa sa il modello di un comando in sottofondo ─────────────────────────────────────────────────────── */
/**
 * D1 — la riga in coda all'esito «IN BACKGROUND». Con la sveglia: come opencode (`tool/plugin/shell.ts:26-27`) e Claude Code
 *   («You will be notified when it exits — do not poll its output file while waiting»). Senza (la CLI con `-p`, le automazioni):
 *   la frase del contratto con la CLI, perché nessuno la sveglierà a turno chiuso — come la seconda frase di Hermes.
 */
export function notaDellaSveglia(svegliaDisponibile) {
    return svegliaDisponibile
        ? 'You will be told when it ends (exit code and output file): do not wait for it with sleep and do not re-read the output file to see whether it has finished. '
            + 'Keep working on what does not depend on it, or end your turn if there is nothing else: you will be woken when it finishes.'
        : 'The command keeps running only while this turn does: check its output file (or wait for its end, which arrives with your next tool result) before you finish.'
}
/**
 * D3 — la fine di un comando in sottofondo detta dentro il turno, col prossimo esito. Le parole sono quelle della nota che il
 *   desktop mette in coda a turno chiuso (`testoUscitaSfondo`, session-registry, C06), fra le quadre di TALOS.
 */
export function notaFineSfondo({ comando = null, file = null, codice = null, segnale = null, errore = false } = {}) {
    const pulito = typeof comando === 'string' && comando.trim() ? comando.trim().slice(0, 500) : null
    const chi = pulito ? `The background command \`${pulito}\`` : 'A background command'
    const come = errore ? 'failed to run'
        : Number.isSafeInteger(codice) ? (codice === 0 ? 'completed (exit code 0)' : `failed (exit code ${codice})`)
            : `was terminated${segnale ? ` (${segnale})` : ''}`
    return `[TALOS: ${chi} ${come}.${file ? ` Its full output is in ${file}.` : ''}]`
}
