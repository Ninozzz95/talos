#!/usr/bin/env node
/** Le prove del muro davanti a `git push`. */
import { decidiPush } from './mai-push.mjs'

let falliti = 0
const p = (nome, atteso, input) => {
    const negato = decidiPush(input) !== null
    if (negato === atteso) console.log(`  ok   ${nome}`)
    else { falliti += 1; console.log(`  NO   ${nome}`) }
}
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } })

p('git push nudo', true, bash('git push'))
p('git push con remoto e ramo', true, bash('git push origin lane/talos-mobile'))
p('git push --force', true, bash('git push --force origin main'))
p('in fondo a una catena &&', true, bash('npm test && git push'))
p('in fondo a una catena ;', true, bash('git add -A ; git commit -m x ; git push'))
p('con una opzione prima del verbo', true, bash('git -C mobile push'))
p('da PowerShell', true, bash('git push') && { ...bash('git push'), tool_name: 'PowerShell' })

p('git commit passa', false, bash('git commit -m "x"'))
p('git pull passa', false, bash('git pull --rebase'))
p('git fetch passa', false, bash('git fetch origin'))
p('git log passa', false, bash('git log --oneline -5'))
p('«pushd» non è push', false, bash('pushd mobile'))
p('una parola che finisce per git non basta', false, bash('./mygit push'))
p('un altro strumento non riguarda questo hook', false, { tool_name: 'Read', tool_input: { file_path: 'git push' } })

console.log(falliti === 0 ? '\nTutte le prove passano.' : `\n${falliti} prove fallite.`)
process.exit(falliti === 0 ? 0 : 1)
