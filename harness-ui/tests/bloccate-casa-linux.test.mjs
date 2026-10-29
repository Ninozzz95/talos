/*
 * Revisione avversaria del blocco 11 (27/10/2026), riserva A-R1 (ALTA) — CARTELLE BLOCCATE NELLA CASA LINUX.
 *   La casa Linux (WSL) è la casa di serie di una sessione su un PC con WSL. Lì `elenca` e `cerca` passavano al servente SENZA le
 *   radici bloccate, e `bloccataDa` confrontava i percorsi Linux solo a parole, senza togliere `.`, `..` e le barre doppie:
 *     L2 `elenca` depth 2 entrava nella bloccata; L3 `cerca` ne restituiva le righe;
 *     L6/L7 `shell cat /mnt/c/…/Utenti/./Documenti/segreto.txt` (e con `//`) — un comando che NOMINA la cartella — usciva 0 col contenuto.
 *   Trovato provando la cura (BLOC-LINUX-06): un collegamento creato da Linux (`ln -s`) è un punto di rianalisi che Windows non segue,
 *   e `leggi`/`elenca`/`file_edit` attraverso di lui leggevano e cambiavano il segreto — il percorso vero ora lo dice Linux.
 *   Contratto CONTRATTO-CARTELLE-BLOCCATE-2026-10-27, giro 2, B2 e B3 punti 2, 3 e 4. Prove portate da
 *   `revisione-blocco-11-prove-2026-10-27/A-casa-linux-b11.test.mjs` e `A-bloccate-b11.test.mjs` (A4).
 *   WSL vero coi binari della casa (`npm run prepara:casa-linux`, o `TALOS_CASA_LINUX`); senza, le prove del giro si saltano e lo dicono.
 *   Ogni prova afferma il comportamento GIUSTO: rossa = il difetto c'è.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, ambienteSenzaCredenziali, convertiPercorsoWsl } from '../src/kernel/talosHarness.mjs'
import { creaCasaLinuxSessione } from '../src/kernel/casa-linux.mjs'
import { verificaCasaLinux } from '../src/casa-linux-binari.mjs'
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs'
import { bloccataDa, comandoNominaUnaBloccata } from '../src/path-policy.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const suWindows = process.platform === 'win32'
const binari = suWindows ? await verificaCasaLinux() : { pronta: false, motivo: 'non è Windows' }
const wsl = suWindows ? spawnSync('wsl.exe', ['--exec', 'sh', '-c', 'echo ok'], { encoding: 'utf8', timeout: 20_000, windowsHide: true }) : null
const vero = { skip: !binari.pronta ? `casa Linux non preparata: ${binari.motivo}` : wsl?.status === 0 ? false : 'WSL non disponibile' }

/* Il percorso Linux di un percorso Windows, come lo vede la casa (`/mnt/c/…`). */
const linuxDi = (p) => convertiPercorsoWsl(p)

function preparazione(t, { giunzione = false, rg = binari.rg } = {}) {
    const cartella = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-bloccate-linux-')))
    mkdirSync(join(cartella, 'Documenti'))
    writeFileSync(join(cartella, 'Documenti', 'segreto.txt'), 'PIN-4242 del conto\n')
    mkdirSync(join(cartella, 'Pubblica'))
    writeFileSync(join(cartella, 'Pubblica', 'nota.txt'), 'NOTA-7777 pubblica\n')
    writeFileSync(join(cartella, 'libero.txt'), 'libero\n')
    /* una giunzione DENTRO la cartella della sessione che porta alla bloccata (il caso 1 del contratto) */
    if (giunzione) spawnSync('cmd.exe', ['/c', 'mklink', '/J', join(cartella, 'Scorciatoia'), join(cartella, 'Documenti')], { windowsHide: true })
    const sessione = creaCasaLinuxSessione({ node: binari.node, rg, env: ambienteSenzaCredenziali() })
    t.after(() => {
        sessione.chiudi()
        if (giunzione) spawnSync('cmd.exe', ['/c', 'rmdir', join(cartella, 'Scorciatoia')], { windowsHide: true })
        /* i collegamenti creati da Linux Windows non li cancella («The file cannot be accessed by the system»): prima li toglie Linux */
        spawnSync('wsl.exe', ['--exec', 'rm', '-rf', '--', linuxDi(cartella)], { windowsHide: true })
        rimuoviCartellaDiProva(cartella)
    })
    return { cartella, bloccata: join(cartella, 'Documenti'), sessione }
}

/* Un giro vero del kernel nella casa Linux: il modello chiama gli attrezzi dati, uno per giro, poi chiude. */
async function giro(p, chiamate, { bloccati } = {}) {
    const esiti = []
    let n = 0
    await talosLavora({
        cartella: p.cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: chiamate.length + 2, livelloAccesso: 'accesso-pieno',
        ambienteComandiFn: async () => ({ dove: null, revisione: 0 }),
        casaLinuxSessione: p.sessione,
        ...(bloccati ? { percorsiBloccatiFn: Object.assign(async () => bloccati, { attiva: () => true }) } : {}),
        fetchDiRete: async () => {
            const c = chiamate[n++]
            const message = c ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] } : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(togliConfiniDati(String(e.content))) },
    })
    return esiti
}

test('BLOC-LINUX-A4 la funzione: un percorso Linux /mnt/c/… che passa da «.», «//» o «..» e torna dentro si riconosce bloccato', (t) => {
    const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-bloccate-a4-')))
    t.after(() => rimuoviCartellaDiProva(radice))
    mkdirSync(join(radice, 'Utenti', 'Documenti'), { recursive: true })
    const cartella = join(radice, 'Utenti')
    const bloccata = join(cartella, 'Documenti')
    const linux = linuxDi(bloccata)
    const casi = {
        diretto: `${linux}/segreto.txt`,
        conPunto: `${linux.replace('/Documenti', '/./Documenti')}/segreto.txt`,
        doppiaBarra: `${linux.replace('/Documenti', '//Documenti')}/segreto.txt`,
        risalita: `${linux.replace('/Documenti', '/Documenti/../Documenti')}/segreto.txt`,
        barraFinale: `${linux}/`,
        doppiaBarraInTesta: `/${linux}/segreto.txt`,
    }
    const esiti = Object.fromEntries(Object.entries(casi).map(([k, p]) => [k, Boolean(bloccataDa(p, { cartella, bloccati: [bloccata] }))]))
    assert.deepEqual(esiti, { diretto: true, conPunto: true, doppiaBarra: true, risalita: true, barraFinale: true, doppiaBarraInTesta: true }, JSON.stringify({ casi, esiti }))
    /* AL CONTRARIO: un «..» che ESCE dalla bloccata non è un rifiuto; la vicina col nome che comincia uguale nemmeno */
    assert.equal(bloccataDa(`${linux}/../libero.txt`, { cartella, bloccati: [bloccata] }), null, 'un «..» che torna fuori non è bloccato')
    assert.equal(bloccataDa(`${linux}2/x.txt`, { cartella, bloccati: [bloccata] }), null, '«Documenti2» non sta dentro «Documenti»')
    /* e nella shell, sugli stessi pezzi */
    assert.ok(comandoNominaUnaBloccata(`cat ${casi.conPunto}`, { cartella, bloccati: [bloccata] }), 'la shell con «/./»')
    assert.ok(comandoNominaUnaBloccata(`cat ${casi.doppiaBarra}`, { cartella, bloccati: [bloccata] }), 'la shell con «//»')
    assert.equal(comandoNominaUnaBloccata(`cat ${linux}/../libero.txt`, { cartella, bloccati: [bloccata] }), null, 'la shell con un «..» che esce')
})

test('BLOC-LINUX-A4b al contrario, Windows: i percorsi di Windows si decidono come prima (la normalizzazione tocca solo i percorsi che cominciano con «/»)', { skip: !suWindows && 'solo Windows' }, (t) => {
    const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-bloccate-a4b-')))
    t.after(() => rimuoviCartellaDiProva(radice))
    mkdirSync(join(radice, 'Documenti'), { recursive: true })
    const bloccata = join(radice, 'Documenti')
    const opz = { cartella: radice, bloccati: [bloccata] }
    assert.ok(bloccataDa('Documenti\\.\\segreto.txt', opz))
    assert.ok(bloccataDa(`${radice}\\\\Documenti\\x`, opz))
    assert.ok(bloccataDa('DOCUMENTI/x', opz))
    assert.equal(bloccataDa('Documenti\\..\\libero.txt', opz), null)
    assert.equal(bloccataDa('Documenti2\\x', opz), null)
})

test('BLOC-LINUX-01 (WSL vero) elenca, cerca e la shell che nomina la bloccata con «/./» e «//» non la toccano', vero, async (t) => {
    const p = preparazione(t)
    const linux = linuxDi(p.cartella)
    const esiti = await giro(p, [
        ['shell', { comando: 'uname -s' }],
        ['leggi', { percorso: 'Documenti/segreto.txt' }],
        ['elenca', { percorso: '', depth: 2 }],
        ['cerca', { testo: 'PIN-4242' }],
        ['cerca', { nome: 'segreto' }],
        ['shell', { comando: 'cat Documenti/segreto.txt' }],
        ['shell', { comando: `cat ${linux}/./Documenti/segreto.txt` }],
        ['shell', { comando: `cat ${linux}//Documenti/segreto.txt` }],
        ['shell', { comando: `cat ${linux}/Pubblica/../Documenti/segreto.txt` }],
    ], { bloccati: [p.bloccata] })
    t.diagnostic(JSON.stringify({ linux, esiti }, null, 1))
    assert.match(esiti[0], /sandbox: wsl2/u, 'premessa: il giro è nella casa Linux')
    assert.match(esiti[1], /REFUSED[\s\S]*blocked/u, 'controllo: leggi relativo rifiutato')
    assert.match(esiti[2], /Documenti\/ \(blocked for this device\)/u, 'L2: elenca nomina la bloccata')
    assert.doesNotMatch(esiti[2], /segreto\.txt/u, 'L2: elenca non ci entra')
    assert.match(esiti[2], /Pubblica\/nota\.txt/u, 'L2: la vicina si elenca')
    /* «no file matches "PIN-4242"» ripete solo la chiave: si guarda la RIGA del file, non la parola cercata */
    assert.doesNotMatch(esiti[3], /segreto\.txt|PIN-4242 del conto/u, 'L3: cerca non la apre')
    assert.match(esiti[3], /1 folder blocked for the device that sent this turn was not searched/u, 'L3: e lo dice')
    assert.doesNotMatch(esiti[4], /segreto\.txt/u, 'L3: nemmeno per nome')
    assert.match(esiti[5], /REFUSED[\s\S]*blocked/u, 'controllo: shell col percorso relativo rifiutata')
    for (const [i, caso] of [[6, 'L6 «/./»'], [7, 'L7 «//»'], [8, '«..» che torna dentro']]) {
        assert.doesNotMatch(esiti[i], /PIN-4242/u, `${caso}: la shell non legge il segreto`)
        assert.match(esiti[i], /REFUSED[\s\S]*blocked/u, `${caso}: rifiutata`)
    }
})

test('BLOC-LINUX-02 (WSL vero) al contrario: la cartella NON bloccata si elenca e si cerca, un «..» che esce non si rifiuta', vero, async (t) => {
    const p = preparazione(t)
    const linux = linuxDi(p.cartella)
    const esiti = await giro(p, [
        ['elenca', { percorso: 'Pubblica' }],
        ['cerca', { testo: 'NOTA-7777' }],
        ['shell', { comando: `cat ${linux}/Documenti/../libero.txt` }],
        ['shell', { comando: `cat ${linux}/./Pubblica//nota.txt` }],
    ], { bloccati: [p.bloccata] })
    t.diagnostic(JSON.stringify(esiti, null, 1))
    assert.match(esiti[0], /Pubblica\/nota\.txt/u)
    assert.match(esiti[1], /Pubblica\/nota\.txt:1:NOTA-7777/u)
    assert.match(esiti[2], /^exit 0[\s\S]*libero/u, 'un «..» che esce dalla bloccata non è un rifiuto')
    assert.match(esiti[3], /^exit 0[\s\S]*NOTA-7777/u)
})

test('BLOC-LINUX-03 (WSL vero) al contrario: con la lista dei blocchi VUOTA elenca e cerca sono byte per byte quelli di un giro senza blocchi', vero, async (t) => {
    const p = preparazione(t)
    const chiamate = [['elenca', { percorso: '', depth: 2 }], ['cerca', { testo: 'PIN-4242' }], ['cerca', { nome: 'nota' }]]
    const senza = await giro(p, chiamate)
    const vuoti = await giro(p, chiamate, { bloccati: [] })
    assert.match(senza[0], /Documenti\/segreto\.txt/u, 'premessa: senza blocchi la cartella si elenca')
    assert.match(senza[1], /Documenti\/segreto\.txt:1:PIN-4242/u, 'premessa: senza blocchi si cerca')
    assert.deepEqual(vuoti, senza)
})

test('BLOC-LINUX-04 (WSL vero) una giunzione dentro la cartella della sessione che porta alla bloccata: elenca non ci entra, cerca non la legge', vero, async (t) => {
    const p = preparazione(t, { giunzione: true })
    const esiti = await giro(p, [
        ['elenca', { percorso: '', depth: 2 }],
        ['cerca', { testo: 'PIN-4242' }],
        ['elenca', { percorso: 'Scorciatoia' }],
    ], { bloccati: [p.bloccata] })
    t.diagnostic(JSON.stringify(esiti, null, 1))
    assert.doesNotMatch(esiti[0], /segreto\.txt/u, 'elenca non entra dalla giunzione')
    assert.doesNotMatch(esiti[1], /segreto\.txt|PIN-4242 del conto/u, 'cerca non legge dalla giunzione')
    assert.doesNotMatch(esiti[2], /segreto\.txt/u, 'elenca della giunzione stessa')
})

test('BLOC-LINUX-06 (WSL vero) un collegamento creato da Linux (che Windows non segue) verso la bloccata: leggi, elenca, file_edit e scrivi si rifiutano; verso la vicina passa', vero, async (t) => {
    const p = preparazione(t)
    const L = linuxDi(p.cartella)
    for (const [bersaglio, nome] of [['Documenti/segreto.txt', 'collegamento.txt'], ['Documenti', 'cartellacoll'], ['Pubblica/nota.txt', 'vicino.txt']]) {
        const ln = spawnSync('wsl.exe', ['--exec', 'ln', '-s', bersaglio, `${L}/${nome}`], { encoding: 'utf8', windowsHide: true })
        assert.equal(ln.status, 0, `premessa: il collegamento ${nome} si crea (${ln.stderr})`)
    }
    const esiti = await giro(p, [
        ['leggi', { percorso: 'collegamento.txt' }],
        ['leggi', { percorso: 'cartellacoll/segreto.txt' }],
        ['elenca', { percorso: 'cartellacoll' }],
        ['file_edit', { percorso: 'cartellacoll/segreto.txt', old_string: 'PIN', new_string: 'XXX' }],
        ['scrivi', { percorso: 'cartellacoll/nuovo.txt', contenuto: 'no' }],
        ['leggi', { percorso: 'vicino.txt' }],
    ], { bloccati: [p.bloccata] })
    t.diagnostic(JSON.stringify(esiti, null, 1))
    for (const i of [0, 1, 2, 3, 4]) {
        assert.doesNotMatch(esiti[i], /PIN-4242|segreto\.txt\n|^edited|^wrote/u, `${i}: niente letto né scritto`)
        assert.match(esiti[i], /^REFUSED[\s\S]*blocked for the device/u, `${i}: rifiutato`)
    }
    assert.equal(readFileSync(join(p.bloccata, 'segreto.txt'), 'utf8'), 'PIN-4242 del conto\n', 'il segreto non è cambiato')
    assert.equal(existsSync(join(p.bloccata, 'nuovo.txt')), false, 'niente scritto nella bloccata')
    assert.match(esiti[5], /NOTA-7777/u, 'al contrario: un collegamento verso la vicina si legge')
})

test('BLOC-LINUX-05 (WSL vero) senza ripgrep nella casa (la camminata JS) la bloccata non si legge; la vicina sì', vero, async (t) => {
    /* rg che non c'è: `cercaNelProgetto` ripiega sulla camminata JS, che nel servente riceve lo stesso `salta` */
    const p = preparazione(t, { rg: join(binari.rg, '..', 'rg-che-non-esiste') })
    /* un collegamento di Linux a un FILE della bloccata, fuori da lei: la camminata lo leggerebbe come un file qualunque. Lo ferma
       solo il percorso VERO (`salta` nel servente guarda anche `realpath`). */
    const ln = spawnSync('wsl.exe', ['--exec', 'ln', '-s', 'Documenti/segreto.txt', `${linuxDi(p.cartella)}/collegamento.txt`], { encoding: 'utf8', windowsHide: true })
    assert.equal(ln.status, 0, `premessa: il collegamento si crea (${ln.stderr})`)
    const esiti = await giro(p, [
        ['cerca', { testo: 'PIN-4242' }],
        ['cerca', { testo: 'NOTA-7777' }],
        ['shell', { comando: 'cat collegamento.txt' }],
    ], { bloccati: [p.bloccata] })
    t.diagnostic(JSON.stringify(esiti, null, 1))
    assert.doesNotMatch(esiti[0], /ripgrep/u, 'premessa: la ricerca non è passata da rg')
    assert.doesNotMatch(esiti[0], /segreto\.txt|collegamento\.txt|PIN-4242 del conto/u, 'la camminata non apre la bloccata, nemmeno dal collegamento')
    assert.match(esiti[1], /Pubblica\/nota\.txt/u, 'la vicina si trova')
    /* il limite dichiarato della shell: un comando che arriva alla bloccata SENZA nominarla non si ferma (contratto, B3 punto 4) */
    assert.match(esiti[2], /PIN-4242 del conto/u, 'limite dichiarato: la shell per un collegamento che non nomina la cartella')
})
