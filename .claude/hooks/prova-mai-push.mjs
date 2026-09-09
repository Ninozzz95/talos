#!/usr/bin/env node
/**
 * Le prove della guardia davanti a `git push`.
 *
 * ⛔ Gli esiti sono TRE, non due — ed è la differenza fra la regola vecchia
 * («mai») e quella nuova («chiedi»):
 *
 *     passa    non è un push, la guardia non c'entra
 *     chiedi   è un push fatto bene: decide l'owner, adesso
 *     nega     è un push che l'owner non ha autorizzato in nessun caso
 *
 * Un esito nudo sì/no non distinguerebbe «nega» da «chiedi», che è proprio la
 * cosa che questo file deve provare.
 */
import { decidiPush } from './mai-push.mjs'

let falliti = 0

const esitoDi = (input) => {
    const d = decidiPush(input)
    if (d === null) return 'passa'
    return d.hookSpecificOutput.permissionDecision === 'deny' ? 'nega' : 'chiedi'
}

const p = (nome, atteso, input) => {
    const avuto = esitoDi(input)
    if (avuto === atteso) console.log(`  ok       ${nome}`)
    else { falliti += 1; console.log(`  NO       ${nome}  — atteso ${atteso}, avuto ${avuto}`) }
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } })
const pwsh = (command) => ({ tool_name: 'PowerShell', tool_input: { command } })
const PUBBLICA = '/c/Users/Antonino/Desktop/projects/AVM-PUBBLICA'

console.log('\n— il push fatto bene arriva all\'owner, non passa da solo')
p('la forma legata al percorso', 'chiedi', bash(`git -C ${PUBBLICA} push`))
p('con remoto e ramo', 'chiedi', bash(`git -C ${PUBBLICA} push origin main`))
p('la forma attaccata -C<percorso>', 'chiedi', bash(`git -C${PUBBLICA} push`))
p('--git-dir invece di -C', 'chiedi', bash('git --git-dir=/x/.git push'))
p('da PowerShell', 'chiedi', pwsh(`git -C ${PUBBLICA} push`))
p('in fondo a una catena', 'chiedi', bash(`npm test && git -C ${PUBBLICA} push`))

console.log('\n— ⛔ il push che non dice DA DOVE parte resta negato')
p('git push nudo', 'nega', bash('git push'))
p('nudo con remoto e ramo', 'nega', bash('git push origin lane/talos-mobile'))
p('dopo un cd, che è il quasi-disastro del 16/8', 'nega', bash('cd /c/x ; git push'))
p('in fondo a una catena &&', 'nega', bash('npm test && git push'))
p('uno legato e uno no: basta quello sciolto', 'nega', bash(`git -C ${PUBBLICA} push && git push`))
p('-C dopo il verbo non lega niente', 'nega', bash('git push -C /x'))

console.log('\n— ⛔ e riscrivere quello che è già uscito resta suo')
p('--force', 'nega', bash(`git -C ${PUBBLICA} push --force origin main`))
p('-f', 'nega', bash(`git -C ${PUBBLICA} push -f`))
p('--force-with-lease', 'nega', bash(`git -C ${PUBBLICA} push --force-with-lease`))
p('--delete di un ramo remoto', 'nega', bash(`git -C ${PUBBLICA} push --delete origin vecchio`))
p('--mirror', 'nega', bash(`git -C ${PUBBLICA} push --mirror`))
p('il refspec +ramo:ramo forza senza dirlo', 'nega', bash(`git -C ${PUBBLICA} push origin +main:main`))
p('il refspec :ramo cancella senza dirlo', 'nega', bash(`git -C ${PUBBLICA} push origin :vecchio`))

console.log('\n— quello che non riguarda la guardia')
p('git commit', 'passa', bash('git commit -m "x"'))
p('git commit con la parola push nel messaggio', 'passa', bash('git commit -m "prova del push"'))
p('git pull', 'passa', bash('git pull --rebase'))
p('git fetch', 'passa', bash('git fetch origin'))
p('git log', 'passa', bash('git log --oneline -5'))
p('«pushd» non è push', 'passa', bash('pushd mobile'))
p('una parola che finisce per git non basta', 'passa', bash('./mygit push'))
p('un altro strumento', 'passa', { tool_name: 'Read', tool_input: { file_path: 'git push' } })
p('comando assente', 'passa', { tool_name: 'Bash', tool_input: {} })


/*
 * ⛔⛔ Il corpo di un heredoc è un DATO, non un comando.
 *
 * Misurato addosso a me il 2026-08-16: stavo committando con `-F -` e dentro il
 * MESSAGGIO c'era la frase «git push» in una spiegazione. La guardia l'ha letta
 * come un comando e ha bloccato il commit. Un filtro che blocca tutto è inutile
 * quanto uno che non blocca niente.
 */
console.log('\n— ⛔ il corpo di un heredoc è un DATO, non un comando')
const CORPO_APERTO = ['git commit -F - <<MSG', 'si spiega perche git push va chiesto', 'MSG'].join('\n')
const CORPO_QUOTATO = ["git commit -F - <<'MSG'", 'qui dentro git push e solo testo', 'MSG'].join('\n')
const CORPO_POI_PUSH = ['git commit -F - <<MSG', 'testo', 'MSG', `git -C ${PUBBLICA} push`].join('\n')

p('un messaggio di commit che PARLA di push', 'passa', bash(CORPO_APERTO))
p('lo stesso, con il delimitatore quotato', 'passa', bash(CORPO_QUOTATO))
p('ma un push VERO dopo un heredoc si vede ancora', 'chiedi', bash(CORPO_POI_PUSH))

console.log(falliti === 0 ? '\nTutte le prove passano.\n' : `\n${falliti} prove fallite.\n`)
process.exit(falliti === 0 ? 0 : 1)
