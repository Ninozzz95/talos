#!/usr/bin/env node
/**
 * Il muro davanti a `git push`.
 *
 * ## Perché è un hook e non una regola
 *
 * Owner, testuale: **«MA MAI PUSH»**. I commit a ogni fase vanno bene; spingere
 * è sempre e solo suo, perché il repo di AVM/TALOS è pubblico e ciò che esce
 * non rientra.
 *
 * La regola è in memoria da settimane e non è mai stata violata. Non è questo
 * il punto: è che **una regola è una richiesta cortese, un hook è una
 * garanzia**. La differenza si vede una volta sola nella vita di un progetto, e
 * quella volta è irreversibile — un segreto in un commit spinto è indicizzato
 * prima che qualcuno se ne accorga.
 *
 * Il costo dell'errore è tutto da una parte: bloccare per sbaglio costa
 * all'owner un comando da lanciare a mano; lasciar passare costa una cosa che
 * non si disfa.
 *
 * ## Cosa blocca, e cosa no
 *
 * Solo `git push`, in qualunque forma, compresi gli alias del comando dentro
 * catene (`&&`, `;`, `|`). Non tocca `git fetch`, `git pull`, `gh pr` — quelli
 * portano roba DENTRO, e chi porta dentro non pubblica niente.
 *
 * ⛔ Non ha una via d'uscita dichiarabile, di proposito. Le altre due guardie
 * (`⛔ FERMATA:`, `⛔ NON VERIFICATO:`) esistono perché lì il giudizio è mio.
 * Qui il giudizio non è mio: l'owner ha detto **mai**, e una porta di servizio
 * che posso aprire io renderebbe il muro un suggerimento.
 */

/**
 * `git push` dentro una riga di shell, comprese le catene.
 *
 * ## ⛔ Perché NON è una regex sola
 *
 * La prima versione era `git\s+(-[^\s]+\s+)*push`, e la sua prova l'ha bocciata
 * subito: **`git -C mobile push` passava**. Le opzioni con argomento — `-C
 * <cartella>`, `-c <chiave=valore>`, `--git-dir <x>` — mettono in mezzo un
 * token che non comincia per trattino, e il conto salta. È esattamente il
 * comando che userei io lavorando dentro `mobile/`.
 *
 * Vale la pena notarlo: il buco l'ha trovato la prova, non io. Una guardia
 * senza prova è una guardia di cui non si conosce il buco.
 *
 * ## Come si guarda davvero
 *
 * Si tolgono prima le stringhe fra virgolette — così `git commit -m "push"` non
 * conta, e non deve — poi si spezza sui separatori di comando, e in ogni pezzo
 * si cerca `git` seguito, prima o poi, dalla PAROLA `push`. Nessuna ipotesi su
 * quali opzioni prendano un argomento: se dentro un comando `git` compare
 * `push` fuori dalle virgolette, si nega.
 *
 * Più severo del necessario? Sì, di proposito: qui l'errore da evitare è uno
 * solo, e non si disfa.
 */
export function contienePush(riga) {
    const senzaVirgolette = String(riga ?? '')
        .replace(/"(?:[^"\\]|\\.)*"/g, ' ')
        .replace(/'(?:[^'\\]|\\.)*'/g, ' ')
    const GIT = /^(.*[/\\])?git(\.exe)?$/i
    for (const pezzo of senzaVirgolette.split(/[;&|\n]+|\$\(|\)|`/)) {
        const parole = pezzo.trim().split(/\s+/).filter(Boolean)
        const dove = parole.findIndex((parola) => GIT.test(parola))
        if (dove < 0) continue
        if (parole.slice(dove + 1).some((parola) => /^push$/i.test(parola))) return true
    }
    return false
}

const RAGIONE = [
    '⛔ `git push` è bloccato da un hook, ed è una decisione dell\'owner, non un',
    'controllo che puoi aggirare: «MAI PUSH». I commit vanno fatti a ogni fase;',
    'spingere è sempre e solo suo, perché il repo è pubblico e ciò che esce non',
    'rientra.',
    '',
    'Hai già fatto la cosa giusta committando. Diglielo, e fermati qui.',
].join(' ')

/**
 * @returns `null` per «lascia passare», o l'oggetto da stampare per negare.
 */
export function decidiPush(input) {
    const strumento = input?.tool_name ?? ''
    if (strumento !== 'Bash' && strumento !== 'PowerShell') return null
    const comando = input?.tool_input?.command
    if (typeof comando !== 'string' || !contienePush(comando)) return null
    return {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: RAGIONE,
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
