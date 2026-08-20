#!/usr/bin/env node
/**
 * ⛔⛔ LA GUARDIA DAVANTI AI COMANDI CHE CANCELLANO LAVORO NON PUBBLICATO.
 *
 * ## Da dove viene
 *
 * Il 2026-08-17, guardando le dodici skill che l'owner mi aveva mandato, una
 * — `git-guardrails-claude-code` di Matt Pocock — elencava i comandi che un
 * agente non dovrebbe poter lanciare:
 *
 *     git push · git reset --hard · git clean -f · git branch -D
 *     git checkout . · git restore .
 *
 * Di quei sei ne coprivamo **uno**: `mai-push.mjs`. Gli altri cinque non
 * passano da nessun push, e sono esattamente i comandi che io lancerei «per
 * pulire» — cancellando ore di lavoro dell'owner.
 *
 * ⇒ Non vale la pena installare quella skill. Vale la pena rubarle la lista.
 *
 * ## ⛔ MA LA SUA LISTA È SBAGLIATA: quei comandi NON hanno la stessa gravità
 *
 * La ricerca del 2026-08-17 (git reflog, documentazione e sul campo) divide i
 * sei in due mucchi, e la differenza è netta:
 *
 * **Recuperabile** — è passato dal database degli oggetti, quindi il reflog ce
 * l'ha ancora. Git pota le voci irraggiungibili a **30 giorni**, le altre a 90:
 *   · `git reset --hard` che butta via dei COMMIT
 *   · `git branch -D`
 *
 * **⛔ Irrecuperabile** — non è MAI stato scritto nel database, quindi non c'è
 * nessun reflog da interrogare, nessun `fsck`, niente:
 *   · `git clean -fd` — i file non tracciati spariscono
 *   · `git checkout -- <file>` / `git restore <file>` — la versione modificata
 *     viene sovrascritta da quella committata, e l'originale non è esistito
 *   · `git reset --hard` **quando c'è del lavoro non committato**
 *
 * Trattarli allo stesso modo è il difetto della lista di Pocock: o si blocca
 * troppo (e la guardia diventa un fastidio che si aggira), o troppo poco.
 *
 * ## ⭐⭐⭐ E QUI NON SI INDOVINA: SI CHIEDE AL REPOSITORY
 *
 * `git reset --hard` sta in tutti e due i mucchi, e cosa distrugge dipende da
 * un fatto che nessuna tabella scritta a mano può sapere: **c'è del lavoro non
 * committato in questo momento?**
 *
 * Un registro scritto a mano invecchia e mente — è la stessa lezione di
 * `chiedi-al-telefono-non-alla-tabella`. Quindi la guardia lancia
 * `git status --porcelain` e lascia rispondere il repository.
 *
 *   sporco  → ⛔ NEGA: c'è roba che non tornerà
 *   pulito  → ⚠️ CHIEDE, e dice come si torna indietro col reflog
 *
 * ## ⛔ E al buio si nega, come in `mai-push`
 *
 * Se il comando non dice `-C <cartella>`, la cartella la decide la shell — che
 * un comando precedente può aver cambiato senza che io lo veda. Se `git status`
 * non risponde entro due secondi, o esce male, non so in che stato è il repo.
 *
 * In tutti e due i casi si assume il caso peggiore. Il costo è tutto da una
 * parte: negare per sbaglio costa un comando da rilanciare a mano; lasciar
 * passare costa del lavoro che non si riscrive.
 *
 * ## Cosa NON guarda, di proposito
 *
 * `git checkout <ramo>`, `git checkout -b <nuovo>`, `git restore --staged` —
 * spostano il puntatore o l'index e non toccano un file modificato. Una guardia
 * che blocca anche quelli diventa una guardia che si disattiva.
 */
import { execFileSync } from 'node:child_process'
import { comandiGit } from './mai-push.mjs'

/** I quattro verbi che possono cancellare del lavoro. */
const VERBI = /^(clean|checkout|restore|reset|branch)$/i

/** Le voci del reflog irraggiungibili si potano dopo tanti giorni. */
const GIORNI_DI_REFLOG = 30

/**
 * Il comando dice da quale repository parte?
 *
 * Stessa domanda di `mai-push`, e stessa ragione: la cartella della shell
 * sopravvive fra una chiamata e l'altra, quindi non la conosco.
 *
 * @returns il percorso, o `null` se non lo dice
 */
function cartellaDichiarata(prima) {
    for (let i = 0; i < prima.length; i += 1) {
        const parola = prima[i]
        if (parola === '-C' && prima[i + 1]) return prima[i + 1]
        if (/^-C.+/.test(parola)) return parola.slice(2)
    }
    return null
}

/**
 * C'è del lavoro non committato in quel repository?
 *
 * ⛔ Torna `true` anche quando non riesce a saperlo: al buio si assume il caso
 * peggiore, perché è quello che non si disfa.
 */
export function haLavoroNonCommittato(cartella, { chiedi = interrogaGit } = {}) {
    try {
        const risposta = chiedi(cartella)
        if (typeof risposta !== 'string') return true
        return risposta.trim().length > 0
    } catch {
        return true
    }
}

/**
 * ⛔⛔ IL PERCORSO DI GIT BASH NON È UN PERCORSO PER `git.exe`.
 *
 * Misurato addosso a me il 2026-08-17, poche ore dopo aver scritto questa
 * guardia: `git -C /c/Users/…/AVM reset --hard` è stato NEGATO con il repo
 * perfettamente pulito. Il difetto non era nel giudizio — era che la domanda
 * non arrivava mai.
 *
 * In Git Bash i percorsi si scrivono `/c/Users/…`, e la shell li traduce lei
 * quando lancia un programma. Ma qui `git.exe` lo lancia **Node**, che quella
 * traduzione non la fa: `git` riceve `/c/Users/…`, non trova niente, esce male,
 * e `haLavoroNonCommittato` fa la cosa giusta per la ragione sbagliata —
 * assume il caso peggiore, cioè nega.
 *
 * ⇒ Il risultato era una guardia che diceva sempre no. Ed è il modo esatto in
 * cui una guardia muore: dopo tre volte la si disattiva, e da quel momento non
 * protegge più niente. Un filtro che blocca tutto è inutile quanto uno che non
 * blocca niente — la stessa lezione dell'heredoc in `mai-push`.
 */
export function percorsoPerGit(cartella) {
    return String(cartella ?? '').replace(/^\/([A-Za-z])\//, (_, lettera) => `${lettera.toUpperCase()}:/`)
}

/** La domanda vera al repository, isolata così le prove possono sostituirla. */
function interrogaGit(cartella) {
    return execFileSync('git', ['-C', percorsoPerGit(cartella), 'status', '--porcelain'], {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
    })
}

/**
 * Cosa fa questo `git <verbo>`, e quanto costa disfarlo.
 *
 * @returns `null` se è innocuo, altrimenti `{grado, cosa}` dove `grado` è
 *          `'irrecuperabile'` oppure `'reflog'`
 */
export function pesaIlComando({ prima, dopo }, verbo, { sporco = null } = {}) {
    const opzioni = dopo.filter((p) => p.startsWith('-'))
    const argomenti = dopo.filter((p) => !p.startsWith('-'))
    const ha = (re) => opzioni.some((p) => re.test(p))

    if (/^clean$/i.test(verbo)) {
        /*
         * ⛔ Senza `-f` git si rifiuta da solo (`clean.requireForce`), quindi
         * un `git clean -n` è una domanda, non un'azione. Con `-f` i file non
         * tracciati escono dall'esistenza: non sono mai stati in un commit.
         */
        if (!ha(/^(-[a-z]*f|--force)/i)) return null
        return { grado: 'irrecuperabile', cosa: 'i file non tracciati, che non sono mai stati in un commit' }
    }

    if (/^checkout$/i.test(verbo)) {
        /*
         * `git checkout <ramo>` e `-b` sono il pane quotidiano e non toccano
         * niente. Diventa distruttivo quando nomina dei PERCORSI: `--` o un `.`.
         */
        const nominaPercorsi = dopo.includes('--') || argomenti.includes('.')
        if (!nominaPercorsi) return null
        return { grado: 'irrecuperabile', cosa: 'le modifiche non salvate di quei file' }
    }

    if (/^restore$/i.test(verbo)) {
        // `--staged` da solo tocca l'index: il file sul disco resta com'è.
        if (ha(/^--staged$/i) && !ha(/^--worktree$/i)) return null
        return { grado: 'irrecuperabile', cosa: 'le modifiche non salvate di quei file' }
    }

    if (/^reset$/i.test(verbo)) {
        // `--soft` e `--mixed` lasciano il working tree intatto.
        if (!ha(/^--hard$/i)) return null
        /*
         * ⭐ IL CASO CHE STA IN TUTTI E DUE I MUCCHI, e lo decide il repo.
         */
        if (sporco === true) {
            return { grado: 'irrecuperabile', cosa: 'il lavoro non ancora committato, che il reflog non ha mai visto' }
        }
        return { grado: 'reflog', cosa: 'i commit da qui indietro' }
    }

    if (/^branch$/i.test(verbo)) {
        if (!ha(/^-D$/) && !(ha(/^-d$/) && ha(/^--force$/i))) return null
        return { grado: 'reflog', cosa: 'quel ramo' }
    }

    return null
}

const NEGA = (cosa) => [
    `⛔ Questo comando cancella **${cosa}**, e non c'è modo di riaverlo:`,
    'non è mai passato dal database degli oggetti, quindi non c\'è nessun reflog',
    'da interrogare e nessun `git fsck` che lo ritrovi.',
    '',
    'Non è una cosa che decido io. Se serve davvero, spiega all\'owner cosa',
    'andrebbe buttato e perché, e lascia che sia lui a lanciarlo.',
    '',
    'Se invece volevi solo vedere, ci sono le versioni che non toccano niente:',
    '`git clean -n`, `git diff`, `git stash` — che mette da parte invece di buttare.',
].join(' ')

const CHIEDI = (cosa) => [
    `⚠️ Questo comando butta via **${cosa}**. È recuperabile — il reflog tiene`,
    `le voci irraggiungibili per ${GIORNI_DI_REFLOG} giorni — ma solo se qualcuno`,
    'si accorge in tempo che serviva.',
    '',
    'Se non è l\'owner ad avertelo chiesto, annulla. Se lo lanci, la via di',
    'ritorno è:',
    '',
    '    git reflog            # trova la riga giusta',
    '    git reset --hard HEAD@{1}',
].join(' ')

function esito(decisione, motivo) {
    return {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: decisione,
            permissionDecisionReason: motivo,
        },
    }
}

/**
 * @returns `null` per «non mi riguarda», o l'oggetto da stampare.
 */
export function decidi(input, { chiedi } = {}) {
    const strumento = input?.tool_name ?? ''
    if (strumento !== 'Bash' && strumento !== 'PowerShell') return null
    const comando = input?.tool_input?.command
    if (typeof comando !== 'string') return null

    const trovati = comandiGit(comando, VERBI)
    if (trovati.length === 0) return null

    let daChiedere = null
    for (const pezzo of trovati) {
        const verboVero = pezzo.verbo
        if (!verboVero) continue

        /*
         * ⛔ La domanda al repository si fa SOLO quando serve — cioè per un
         * `reset --hard`. Lanciare `git status` a ogni `git checkout` metterebbe
         * due secondi di possibile attesa davanti al comando più frequente che
         * esista.
         */
        let sporco = null
        if (/^reset$/i.test(verboVero) && pezzo.dopo.some((p) => /^--hard$/i.test(p))) {
            const dove = cartellaDichiarata(pezzo.prima)
            // Senza `-C` non so in quale repo sono: caso peggiore.
            sporco = dove === null ? true : haLavoroNonCommittato(dove, chiedi ? { chiedi } : {})
        }

        const peso = pesaIlComando(pezzo, verboVero, { sporco })
        if (!peso) continue
        if (peso.grado === 'irrecuperabile') return esito('deny', NEGA(peso.cosa))
        daChiedere = daChiedere ?? peso
    }

    return daChiedere ? esito('ask', CHIEDI(daChiedere.cosa)) : null
}

function leggiStdin() {
    return new Promise((resolve) => {
        let dati = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (pezzo) => { dati += pezzo })
        process.stdin.on('end', () => resolve(dati))
        setTimeout(() => resolve(dati), 4000)
    })
}

async function main() {
    let input = {}
    try {
        input = JSON.parse(await leggiStdin())
    } catch {
        // ⛔ Come in `mai-push`: al buio si chiede, non si lascia passare.
        process.stdout.write(JSON.stringify(esito(
            'ask',
            'Comando illeggibile: chiedo, invece di indovinare.',
        )))
        process.exit(0)
    }
    const risposta = decidi(input)
    if (risposta) process.stdout.write(JSON.stringify(risposta))
    process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('mai-perdere-lavoro.mjs')) void main()
