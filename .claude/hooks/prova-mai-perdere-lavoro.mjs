#!/usr/bin/env node
/**
 * Le prove della guardia davanti ai comandi che cancellano lavoro.
 *
 * ⛔⛔ QUI IL VERSO CONTRARIO CONTA PIÙ DEL VERSO GIUSTO.
 *
 * Una guardia che blocca `git checkout main` o `git status` viene disattivata
 * dopo tre volte, e da quel momento non protegge più niente. Metà di queste
 * prove servono a dimostrare che i comandi innocui **passano**.
 *
 * Gli esiti sono tre, come in `mai-push`:
 *
 *     passa    non tocca lavoro, o non è distruttivo
 *     chiedi   butta via qualcosa che il reflog può ancora ridare
 *     nega     ⛔ butta via qualcosa che non torna in nessun modo
 */
import { decidi, haLavoroNonCommittato, percorsoPerGit, pesaIlComando } from './mai-perdere-lavoro.mjs'

let falliti = 0

/** Un repository che si dichiara PULITO, senza toccare il disco. */
const pulito = () => ''
/** Uno che ha del lavoro non committato. */
const sporco = () => ' M mobile/src/lib/tools/intentiTools.ts\n?? nuovo.ts\n'

const esitoDi = (comando, chiedi) => {
    const d = decidi({ tool_name: 'Bash', tool_input: { command: comando } }, chiedi ? { chiedi } : {})
    if (d === null) return 'passa'
    return d.hookSpecificOutput.permissionDecision === 'deny' ? 'nega' : 'chiedi'
}

const p = (nome, atteso, comando, chiedi) => {
    const avuto = esitoDi(comando, chiedi)
    if (avuto === atteso) console.log(`  ok       ${nome}`)
    else { falliti += 1; console.log(`  NO       ${nome}  — atteso ${atteso}, avuto ${avuto}`) }
}

console.log('\n— ciò che NON deve essere toccato, se no la guardia si disattiva')
p('git status', 'passa', 'git status --porcelain')
p('cambiare ramo', 'passa', 'git checkout main')
p('creare un ramo', 'passa', 'git checkout -b lane/nuova')
p('un ramo con un punto nel nome', 'passa', 'git checkout v0.1.5')
p('clean in prova, senza -f', 'passa', 'git clean -n')
p('reset --soft non tocca i file', 'passa', 'git -C . reset --soft HEAD~1', sporco)
p('reset --mixed nemmeno', 'passa', 'git -C . reset --mixed HEAD~1', sporco)
p('restore --staged tocca solo l index', 'passa', 'git restore --staged mobile/src/a.ts')
p('cancellare un ramo già fuso', 'passa', 'git branch -d vecchio')
p('⛔ e la parola dentro un messaggio di commit non è un comando', 'passa',
    'git commit -m "spiego perche git clean -fd e pericoloso"')

console.log('\n— ⛔ ciò che non torna più: si NEGA')
p('clean -fd butta i non tracciati', 'nega', 'git clean -fd')
p('clean -f da solo basta', 'nega', 'git clean -f')
p('clean -fdx porta via anche gli ignorati', 'nega', 'git clean -fdx')
p('checkout . sovrascrive le modifiche', 'nega', 'git checkout .')
p('checkout -- <file> pure', 'nega', 'git checkout -- mobile/src/lib/tools/intentiTools.ts')
p('restore sul working tree', 'nega', 'git restore mobile/src/a.ts')
p('restore --staged --worktree tocca ANCHE il disco', 'nega',
    'git restore --staged --worktree mobile/src/a.ts')

console.log('\n— ⭐ reset --hard: lo decide il REPOSITORY, non una tabella')
p('a repo sporco è irrecuperabile', 'nega', 'git -C . reset --hard HEAD~1', sporco)
p('a repo pulito è solo reflog', 'chiedi', 'git -C . reset --hard HEAD~1', pulito)
p('⛔ senza -C non so in quale repo sono: caso peggiore', 'nega', 'git reset --hard HEAD~1', pulito)

console.log('\n— recuperabile via reflog: si CHIEDE, e si dice come tornare')
p('branch -D', 'chiedi', 'git branch -D lane/talos-mobile')
p('branch -d --force è lo stesso comando', 'chiedi', 'git branch -d --force lane/x')

console.log('\n— il caso peggiore quando la domanda al repo non riesce')
{
    const esplode = () => { throw new Error('non è un repository') }
    const avuto = haLavoroNonCommittato('/nessun/posto', { chiedi: esplode })
    if (avuto === true) console.log('  ok       git che fallisce vale SPORCO, non pulito')
    else { falliti += 1; console.log('  NO       git che fallisce è stato preso per pulito') }

    const muto = () => undefined
    if (haLavoroNonCommittato('/x', { chiedi: muto }) === true) {
        console.log('  ok       e una risposta non-stringa pure')
    } else { falliti += 1; console.log('  NO       risposta non-stringa presa per pulita') }
}

/*
 * ⛔⛔⛔ IL DIFETTO CHE HA NEGATO UN COMANDO LEGITTIMO, il 2026-08-17.
 *
 * `git -C /c/Users/…/AVM reset --hard` negato con il repo PULITO. In Git Bash i
 * percorsi si scrivono `/c/…`, ma `git.exe` lanciato da Node non li capisce:
 * la domanda al repository falliva, e il caso peggiore diceva «sporco».
 *
 * Una guardia che nega sempre viene disattivata dopo tre volte. Questa prova
 * esiste perché non torni a farlo.
 */
console.log('\n— ⛔⛔ il percorso di Git Bash, che faceva negare tutto')
{
    const casi = [
        ['/c/Users/Antonino/Desktop/projects/AVM', 'C:/Users/Antonino/Desktop/projects/AVM'],
        ['/d/lavoro/repo', 'D:/lavoro/repo'],
        // ⛔ E ciò che è già in stile Windows NON si tocca.
        ['C:/Users/Antonino/AVM', 'C:/Users/Antonino/AVM'],
        ['C:\\Users\\Antonino\\AVM', 'C:\\Users\\Antonino\\AVM'],
        // Un percorso relativo resta relativo.
        ['.', '.'],
        // ⛔ E una cartella che comincia per barra ma NON è una lettera di unità
        // non va storpiata: `/casa/x` su un sistema vero è un percorso valido.
        ['/casa/progetti', '/casa/progetti'],
    ]
    for (const [dato, atteso] of casi) {
        const avuto = percorsoPerGit(dato)
        if (avuto === atteso) console.log(`  ok       ${dato}  →  ${avuto}`)
        else { falliti += 1; console.log(`  NO       ${dato}  →  ${avuto}  (atteso ${atteso})`) }
    }

    // ⛔ E la prova che morde davvero: la domanda al repo VERO deve riuscire.
    const suQuestoRepo = haLavoroNonCommittato('/c/Users/Antonino/Desktop/projects/AVM')
    if (suQuestoRepo === false) {
        console.log('  ok       ⭐ e su questo repo, pulito, risponde PULITO — la domanda arriva')
    } else {
        falliti += 1
        console.log('  NO       ⛔ dice ancora «sporco» su un repo pulito: la domanda non arriva')
    }
}

console.log('\n— ⛔ le catene: un comando innocuo davanti non fa passare quello dietro')
p('due comandi, il secondo distrugge', 'nega', 'git status && git clean -fd')
p('e con il punto e virgola', 'nega', 'npm test ; git checkout .')

console.log('\n— ⛔⛔ e la prova che la guardia MORDE davvero')
{
    /*
     * Se `pesaIlComando` smettesse di guardare `--hard`, tutte le prove del
     * reset diventerebbero «passa» e sopra si vedrebbe. Qui si prova il
     * contrario: che il peso NON sia sempre nullo per costruzione.
     */
    const peso = pesaIlComando({ verbo: 'clean', prima: [], dopo: ['-fd'] }, 'clean')
    if (peso && peso.grado === 'irrecuperabile') console.log('  ok       pesaIlComando dà un grado, non null per inerzia')
    else { falliti += 1; console.log('  NO       pesaIlComando non pesa niente') }

    const innocuo = pesaIlComando({ verbo: 'clean', prima: [], dopo: ['-n'] }, 'clean')
    if (innocuo === null) console.log('  ok       e sa anche dire «innocuo», quindi distingue')
    else { falliti += 1; console.log('  NO       pesaIlComando pesa tutto allo stesso modo') }
}

console.log(falliti === 0 ? '\n✔ tutte verdi\n' : `\n⛔ ${falliti} rosse\n`)
process.exit(falliti === 0 ? 0 : 1)
