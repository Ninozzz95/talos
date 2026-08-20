#!/usr/bin/env node
/**
 * La guardia davanti a `git push`.
 *
 * ## ⛔ La regola è CAMBIATA il 2026-08-16
 *
 * Prima era **«MA MAI PUSH»**: negare sempre, senza via d'uscita. Adesso
 * l'owner ha detto:
 *
 * > «D'ora in poi sei autorizzato a fare push. Ma sempre **solo dopo la mia
 * > autorizzazione**. Quindi me lo chiedi, se io ti dico così, fai push.»
 *
 * Il muro diventa una **porta con un campanello**. Il file tiene il nome
 * vecchio di proposito: è citato nelle impostazioni e nella memoria, e
 * rinominarlo perderebbe il filo di com'è nato.
 *
 * ## Perché resta un hook, se ora il push è permesso
 *
 * Perché «autorizzazione» non è una frase in un prompt: è un **gesto**. Qui
 * diventa `permissionDecision: 'ask'` — Claude Code mostra all'owner il comando
 * esatto e aspetta che sia lui a dire sì. Non posso approvarlo io, non posso
 * saltarlo, e soprattutto **non posso dedurlo**: un «vai» detto ieri per un
 * altro push non apre questa porta, perché la porta la apre lui adesso.
 *
 * ⇒ È l'unica forma di autorizzazione che non posso confondere con una mia
 * interpretazione di un messaggio.
 *
 * ## E due cose restano NEGATE, perché non sono ciò che ha autorizzato
 *
 * **1. Il push che non dice DA QUALE repository parte.** Il 2026-08-16 è quasi
 * successo: `cd C:\…` è fallito dentro bash — i backslash mangiati — e il
 * `git push` che seguiva è partito dalla cartella corrente, cioè dal repo di
 * sviluppo con 392 documenti interni dentro, verso il remoto pubblico. L'ha
 * fermato solo un rifiuto `non-fast-forward`: fortuna, non progetto.
 *
 * ⛔ E la trappola vera è che il `cd` può stare in una chiamata PRECEDENTE — la
 * cartella della shell sopravvive fra un comando e l'altro. Un hook che
 * guardasse solo «c'è un cd in questa riga?» non vedrebbe niente. Quindi la
 * regola è più semplice e più forte: **il push deve dire da dove parte**, con
 * `git -C <percorso> push` o `--git-dir`. Se il percorso è sbagliato git si
 * ferma; se è la cartella corrente a essere sbagliata, nessuno se ne accorge.
 *
 * **2. Il push che riscrive o cancella quello che è già uscito.** `--force`,
 * `--delete`, `--mirror`, un refspec con `+` o che comincia per `:`. L'owner ha
 * autorizzato a **pubblicare**, che è aggiungere; riscrivere la storia di un
 * repo pubblico è un'altra cosa e la decide lui, con le sue mani.
 *
 * Il costo dell'errore resta tutto da una parte: negare per sbaglio costa un
 * comando da lanciare a mano; lasciar passare costa una cosa che non si disfa.
 *
 * ## Cosa non guarda
 *
 * `git fetch`, `git pull`, `gh pr` — portano roba DENTRO, e chi porta dentro
 * non pubblica niente.
 */

/** Separatori di comando dentro una riga di shell. */
const SEPARATORI = /[;&|\n]+|\$\(|\)|`/

/** Il verbo, in mezzo a `git … push`. */
const PUSH = /^push$/i

/**
 * I comandi `git … push` dentro una riga di shell, comprese le catene.
 *
 * Ritorna, per ognuno, le parole **prima** e **dopo** il verbo: servono a
 * distinguere le opzioni di `git` (che stanno prima) da quelle di `push`.
 *
 * ## ⛔ Perché NON è una regex sola
 *
 * La prima versione era `git\s+(-[^\s]+\s+)*push`, e la sua prova l'ha bocciata
 * subito: **`git -C mobile push` passava**. Le opzioni con argomento — `-C
 * <cartella>`, `-c <chiave=valore>`, `--git-dir <x>` — mettono in mezzo un
 * token che non comincia per trattino, e il conto salta.
 *
 * Vale la pena notarlo: il buco l'ha trovato la prova, non io. Una guardia
 * senza prova è una guardia di cui non si conosce il buco.
 *
 * Si tolgono prima le stringhe fra virgolette — così `git commit -m "push"` non
 * conta, e non deve — poi si spezza sui separatori, e in ogni pezzo si cerca
 * `git` seguito, prima o poi, dalla PAROLA `push`.
 */
export function comandiGit(riga, verbo) {
    /*
     * ⛔⛔ IL CORPO DI UN HEREDOC NON È UN COMANDO — misurato addosso a me il
     * 2026-08-16, poche ore dopo aver scritto questa guardia.
     *
     * Stavo committando con `git commit -F - <<'MSG' … MSG`, e dentro il
     * messaggio c'era la frase «git push» dentro una SPIEGAZIONE. La guardia
     * l'ha letta come un comando e ha bloccato il commit.
     *
     * Un filtro che blocca tutto è inutile quanto uno che non blocca niente: è
     * la stessa lezione dei confini di parola nel filtro della privacy, dove
     * «TIM» dentro «ottimizzazione» faceva scattare l'allarme.
     *
     * ⇒ Il testo fra `<<'FINE'` e `FINE` è un DATO che viaggia sullo stdin di
     * un programma, non una riga di shell. Si toglie prima di cercare.
     */
    const senzaCorpi = String(riga ?? '').replace(
        /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[\s\S]*?^\s*\2\s*$/gm,
        ' ',
    )
    const senzaVirgolette = senzaCorpi
        .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
        .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
    const GIT = /^(.*[/\\])?git(\.exe)?$/i
    const trovati = []
    for (const pezzo of senzaVirgolette.split(SEPARATORI)) {
        const parole = pezzo.trim().split(/\s+/).filter(Boolean)
        const dove = parole.findIndex((parola) => GIT.test(parola))
        if (dove < 0) continue
        const dopoGit = parole.slice(dove + 1)
        const ilVerbo = dopoGit.findIndex((parola) => verbo.test(parola))
        if (ilVerbo < 0) continue
        trovati.push({
            verbo: dopoGit[ilVerbo],
            prima: dopoGit.slice(0, ilVerbo),
            dopo: dopoGit.slice(ilVerbo + 1),
        })
    }
    return trovati
}

/**
 * I `git … push` di una riga.
 *
 * ⛔ Resta il nome storico: è citato nelle prove e nella memoria. Il corpo è
 * diventato generico il 2026-08-17, quando `mai-perdere-lavoro.mjs` ha avuto
 * bisogno della stessa scomposizione per `clean`, `checkout`, `restore` e
 * `reset`. Duplicarla avrebbe duplicato anche i suoi buchi — e quello degli
 * heredoc l'avevo già pagato una volta.
 */
export function comandiPush(riga) {
    return comandiGit(riga, PUSH)
}

/** Conservata per compatibilità: c'è un push, sì o no. */
export function contienePush(riga) {
    return comandiPush(riga).length > 0
}

/**
 * Il comando dice da quale repository parte?
 *
 * `-C <cartella>` e `--git-dir` legano il push a un percorso; senza, decide la
 * cartella corrente della shell, che può essere stata cambiata da un comando
 * che non vedo.
 */
function diceDaDoveParte({ prima }) {
    return prima.some((parola) => (
        parola === '-C' || /^-C./.test(parola)
        || parola === '--git-dir' || /^--git-dir=/.test(parola)
    ))
}

/**
 * Il push riscrive o cancella qualcosa che è già pubblico?
 *
 * Oltre alle opzioni dichiarate, un refspec può farlo da solo: `+ramo:ramo`
 * forza, `:ramo` cancella il ramo remoto.
 */
function riscriveLaStoria({ dopo }) {
    const OPZIONI = /^(--force(-with-lease.*|-if-includes)?|-f|--delete|-d|--mirror|--prune)$/i
    return dopo.some((parola) => (
        OPZIONI.test(parola)
        || (!parola.startsWith('-') && (parola.startsWith('+') || parola.startsWith(':')))
    ))
}

const NEGA_SENZA_PERCORSO = [
    '⛔ Questo `git push` non dice DA QUALE repository parte, e la cartella',
    'corrente della shell può essere stata cambiata da un comando precedente:',
    'la shell se la ricorda fra una chiamata e l\'altra.',
    '',
    'Il 2026-08-16 è quasi finita male così — un `cd` fallito dentro bash e il',
    'push partito dal repo di sviluppo, coi 392 documenti interni dentro, verso',
    'il remoto pubblico. L\'ha fermato solo un rifiuto non-fast-forward.',
    '',
    'Riscrivilo legando il percorso al comando:',
    '',
    '    git -C /c/Users/Antonino/Desktop/projects/AVM-PUBBLICA push',
    '',
    'Così se il percorso è sbagliato git si ferma, invece di spingere il repo',
    'sbagliato senza che nessuno se ne accorga.',
].join(' ')

const NEGA_RISCRITTURA = [
    '⛔ Questo push riscrive o cancella qualcosa che è già uscito (`--force`,',
    '`--delete`, `--mirror`, o un refspec con `+` o `:`).',
    '',
    'L\'owner ha autorizzato a **pubblicare**, cioè ad aggiungere. Riscrivere la',
    'storia di un repo pubblico è un\'altra cosa, e la fa lui con le sue mani.',
    '',
    'Se serve davvero, spiegagli cosa andrebbe riscritto e perché, e lascia che',
    'sia lui a lanciarlo.',
].join(' ')

const CHIEDI = [
    '⚠️ Sei autorizzato a pushare, ma **solo dopo un sì esplicito per QUESTO',
    'push** — regola dell\'owner del 2026-08-16. Un «vai» detto prima, per',
    'un\'altra cosa, non vale qui: il repo è pubblico e ciò che esce non rientra.',
    '',
    'Se non gliel\'hai ancora chiesto, annulla e chiediglielo dicendo **cosa',
    'esce**: quanti commit, e cosa cambia per chi legge il repo.',
].join(' ')

function nega(motivo) {
    return {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: motivo,
        },
    }
}

/**
 * @returns `null` per «non mi riguarda», o l'oggetto da stampare.
 */
export function decidiPush(input) {
    const strumento = input?.tool_name ?? ''
    if (strumento !== 'Bash' && strumento !== 'PowerShell') return null
    const comando = input?.tool_input?.command
    if (typeof comando !== 'string') return null
    const push = comandiPush(comando)
    if (push.length === 0) return null

    if (push.some(riscriveLaStoria)) return nega(NEGA_RISCRITTURA)
    if (!push.every(diceDaDoveParte)) return nega(NEGA_SENZA_PERCORSO)
    return {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'ask',
            permissionDecisionReason: CHIEDI,
        },
    }
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
        // ⛔ Qui il fallimento è CHIUSO, al contrario degli altri hook: se non
        // riesco a leggere il comando non posso escludere che sia un push, e
        // l'errore da evitare è uno solo.
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'ask',
                permissionDecisionReason: 'Comando illeggibile: chiedo, invece di indovinare.',
            },
        }))
        process.exit(0)
    }
    const esito = decidiPush(input)
    if (esito) process.stdout.write(JSON.stringify(esito))
    process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('mai-push.mjs')) void main()
