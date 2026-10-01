/*
 * ⛔⛔ F009 (audit 28-29/09/2026) — con che utente girano i comandi Linux, e che cosa protegge. Decisioni owner 01/10/2026:
 *   «come gli altri, insieme» (dichiararlo sempre; un'impostazione per usare l'utente normale della distro se c'è; accesso
 *   pieno + shell di WSL come root = una conferma esplicita), «esito e foglio della shell», impostazione «accesa»,
 *   conferma «una volta per sessione». TALOS non crea utenti.
 * Misurato il 01/10/2026 sulla macchina dell'owner: Ubuntu esegue come root (uid 0), `C:` è drvfs senza `metadata`
 *   (`uid=0;gid=0`), `/mnt/c/Users/<utente>` è `777 root:root`, l'interop è accesa.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { leggiFattiWsl, sceltaUtenteWsl, discoDellaCartella, SCRIPT_FATTI_WSL } from '../src/kernel/utente-wsl.mjs'
import { etichettaSandbox } from '../src/kernel/etichetta-sandbox.mjs'
import { argomentiWslPerScript, talosLavora, eseguiComandoSandboxato, statoWsl } from '../src/kernel/talosHarness.mjs'
import { createPreferenzeWslStore } from '../src/preferenze-wsl-store.mjs'
import { avviaSessione, eseguiComandoDiretto } from '../src/agent-service.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

/* La risposta VERA della sonda sulla macchina dell'owner, 01/10/2026 (Ubuntu, root, nessun utente normale). */
const RISPOSTA_VERA = [
    'utente=root',
    'uid=0',
    'montaggio=/mnt/c rw,noatime,aname=drvfs;path=C:\\;uid=0;gid=0;symlinkroot=/mnt/,cache=0x5,access=client,msize=65536,trans=fd,rfd=6,wfd=6',
    'montaggio=/mnt/d rw,noatime,aname=drvfs;path=D:\\;uid=0;gid=0;symlinkroot=/mnt/,cache=0x5,access=client,msize=65536,trans=fd,rfd=6,wfd=6',
].join('\n')

const LETTORE_REGISTRO = /^exit (-?\d+)(?: \[sandbox: ([^\]]*)\])?/
const LETTORE_ADB = /^exit\s+-?\d+\s+\[sandbox:[^\]]+\](?:\r?\n|$)/i

test('F009-01: la sonda si legge com è sulla macchina vera — root, nessun utente normale, C: e D: senza metadata', () => {
    const fatti = leggiFattiWsl(RISPOSTA_VERA)
    assert.deepEqual(fatti, { utente: 'root', uid: 0, utenteNormale: null, montaggi: { c: { metadata: false }, d: { metadata: false } } })
    const conMetadata = leggiFattiWsl('utente=mario\nuid=1000\nnormale=mario\nmontaggio=/mnt/c rw,noatime,aname=drvfs;path=C:\\;metadata;uid=1000\n')
    assert.equal(conMetadata.montaggi.c.metadata, true)
    assert.equal(conMetadata.utenteNormale, 'mario')
})

test('F009-02: una risposta che non dice utente e uid non è un fatto; un nome utente con la shell dentro non passa', () => {
    assert.equal(leggiFattiWsl(''), null)
    assert.equal(leggiFattiWsl('Utente non trovato.'), null)
    assert.equal(leggiFattiWsl('utente=root'), null, 'senza uid')
    const fatti = leggiFattiWsl('utente=root\nuid=0\nnormale=mario;rm -rf /\nnormale=anna\n')
    assert.equal(fatti.utenteNormale, 'anna', 'il nome con `;` si scarta, il primo valido resta')
    assert.equal(leggiFattiWsl('utente=x]y\nuid=0'), null, 'una quadra romperebbe i lettori dell etichetta')
})

test('F009-03: con che utente — si cambia SOLO se il predefinito è root, c è un utente normale e la preferenza è accesa', () => {
    const root = { utente: 'root', uid: 0, utenteNormale: 'mario', montaggi: {} }
    assert.deepEqual(sceltaUtenteWsl(root, { usaUtenteNormale: true }), { utente: 'mario', root: false, passaUtente: true })
    assert.deepEqual(sceltaUtenteWsl(root, { usaUtenteNormale: false }), { utente: 'root', root: true, passaUtente: false })
    assert.deepEqual(sceltaUtenteWsl({ ...root, utenteNormale: null }, { usaUtenteNormale: true }), { utente: 'root', root: true, passaUtente: false })
    assert.deepEqual(sceltaUtenteWsl({ utente: 'anna', uid: 1000, utenteNormale: 'anna', montaggi: {} }, { usaUtenteNormale: true }),
        { utente: 'anna', root: false, passaUtente: false }, 'già normale: nessun -u')
    assert.deepEqual(sceltaUtenteWsl(root), { utente: 'mario', root: false, passaUtente: true }, 'il valore di partenza è «accesa» (owner)')
    assert.equal(sceltaUtenteWsl(null), null)
})

test('F009-04: il disco della cartella, nelle due forme che la sessione usa', () => {
    const fatti = leggiFattiWsl(RISPOSTA_VERA)
    assert.deepEqual(discoDellaCartella(fatti, 'C:\\Users\\persona\\Desktop'), { montaggio: '/mnt/c', metadata: false })
    assert.deepEqual(discoDellaCartella(fatti, '/mnt/d/lavoro'), { montaggio: '/mnt/d', metadata: false })
    assert.deepEqual(discoDellaCartella(fatti, 'E:\\x'), { montaggio: '/mnt/e', metadata: null })
    assert.equal(discoDellaCartella(fatti, '\\\\wsl$\\Ubuntu\\home'), null)
    assert.equal(discoDellaCartella(fatti, '/mnt/cc/x'), null)
})

test('F009-05: `-u <utente>` solo quando si sceglie un utente; senza, l argv è quello di prima bit per bit', () => {
    assert.deepEqual(argomentiWslPerScript('Ubuntu', 'id -un'), ['-d', 'Ubuntu', '--exec', 'bash', '-lc', 'id -un'])
    assert.deepEqual(argomentiWslPerScript('Ubuntu', 'cd -- "$1"', ['/mnt/c']), ['-d', 'Ubuntu', '--exec', 'bash', '-lc', 'cd -- "$1"', 'bash', '/mnt/c'])
    assert.deepEqual(argomentiWslPerScript('Ubuntu', 'id -un', [], { utente: 'mario' }), ['-d', 'Ubuntu', '-u', 'mario', '--exec', 'bash', '-lc', 'id -un'])
})

test('F009-06: l etichetta non promette più un isolamento, e dice con che utente e che cosa vale sul disco', () => {
    const nuda = etichettaSandbox('wsl2')
    assert.doesNotMatch(nuda, /namespace|separat/i, 'la frase falsa di prima')
    assert.match(nuda, /^wsl2 \(Linux in WSL; nessun isolamento: /)
    const root = etichettaSandbox('wsl2', { utente: 'root', disco: { montaggio: '/mnt/c', metadata: false } })
    assert.equal(root, "wsl2 (Linux in WSL come root; nessun isolamento: /mnt/c è il disco di Windows con i diritti dell'utente Windows di TALOS, e lì i permessi Linux non valgono)")
    assert.doesNotMatch(etichettaSandbox('wsl2', { utente: 'mario', disco: { montaggio: '/mnt/c', metadata: true } }), /permessi Linux non valgono/)
    assert.match(etichettaSandbox('wsl2', { utente: null, disco: null }), /con un utente non verificato; nessun isolamento: i dischi di Windows sono in \/mnt/)
    for (const sporco of [{ utente: 'x]y' }, { utente: 'root', disco: { montaggio: '/mnt/c]', metadata: false } }]) {
        const riga = `exit 0 [sandbox: ${etichettaSandbox('wsl2', sporco)}]\nciao`
        assert.doesNotMatch(etichettaSandbox('wsl2', sporco), /\]/)
        assert.match(riga, LETTORE_ADB)
        assert.equal(LETTORE_REGISTRO.exec(riga)[2].split(' ')[0], 'wsl2')
    }
    assert.equal(etichettaSandbox('none', { utente: 'root' }), etichettaSandbox('none'), 'i dettagli valgono solo per wsl2')
})

/* ── la conferma di root nel kernel ─────────────────────────────────────────────────────────────────────────── */

function fornitore(chiamate) {
    let n = 0
    return async () => {
        const c = chiamate[n]
        n++
        const message = c
            ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] }
            : { role: 'assistant', content: 'fatto' }
        return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
    }
}

async function giro(t, { chiamate = [['shell', { comando: 'echo ciao' }]], livelloAccesso = 'accesso-pieno', consensiSessione, rootWslDelComandoFn,
    risposta = true, preferenzeWslFn, permessiPerAttrezzo, ambienteComandiFn, stop, comandoProva, sandbox } = {}) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-f009-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    const chieste = [], eseguiti = [], esiti = [], ricevute = [], interrogati = []
    await talosLavora({
        cartella, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 4,
        /* 'nessuno' = la politica «Scrive nel progetto», che arriva al kernel SENZA livello (livelloDaPermessi). */
        livelloAccesso: livelloAccesso === 'nessuno' ? undefined : livelloAccesso,
        ...(comandoProva ? { comandoProva } : {}),
        fetchDiRete: fornitore(chiamate),
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)); if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        chiediApprovazioneFn: async (a) => { chieste.push(a); if (stop) { stop.abort(); return new Promise(() => {}) } return risposta },
        eseguiComandoSandboxatoFn: sandbox ?? (async (comando, _cartella, opzioni) => { eseguiti.push({ comando, opzioni }); return { codice: 0, testo: 'ciao', enforcement: 'wsl2', wsl: { utente: 'root', root: true, disco: { montaggio: '/mnt/c', metadata: false } } } }),
        ...(consensiSessione !== undefined ? { consensiSessione } : {}),
        ...(rootWslDelComandoFn !== undefined ? { rootWslDelComandoFn: async (comando, opzioni) => { interrogati.push({ comando, opzioni }); return rootWslDelComandoFn(comando, opzioni) } } : {}),
        ...(preferenzeWslFn ? { preferenzeWslFn } : {}),
        ...(permessiPerAttrezzo ? { permessiPerAttrezzo } : {}),
        ...(ambienteComandiFn ? { ambienteComandiFn } : {}),
        ...(stop ? { segnaleStop: stop.signal } : {}),
    })
    return { chieste, eseguiti, esiti, ricevute, interrogati }
}

const comeRoot = async () => ({ distro: 'Ubuntu', utente: 'root' })

test('F009-07: WSL come root senza nessuno interpellato — si chiede UNA volta per sessione, con la ragione scritta per una persona', async (t) => {
    const consensiSessione = {}
    const primo = await giro(t, { consensiSessione, rootWslDelComandoFn: comeRoot, chiamate: [['shell', { comando: 'echo uno' }], ['shell', { comando: 'echo due' }]] })
    assert.equal(primo.chieste.length, 1, 'due comandi, una domanda sola')
    const [domanda] = primo.chieste
    assert.equal(domanda.tipo, 'shell')
    assert.equal(domanda.comando, 'echo uno')
    assert.equal(domanda.wslRoot.utente, 'root')
    assert.equal(domanda.wslRoot.frase, 'Questo comando gira in Linux (WSL, Ubuntu) come root, e con i permessi di questa sessione nessuno lo approva: può cambiare tutto il sistema Linux e scrivere sui dischi di Windows. Se lo confermi, vale per tutta la sessione.')
    assert.deepEqual(primo.eseguiti.map((e) => e.comando), ['echo uno', 'echo due'])
    assert.equal(consensiSessione.rootWsl, true)
    const secondo = await giro(t, { consensiSessione, rootWslDelComandoFn: comeRoot })
    assert.equal(secondo.chieste.length, 0, 'un altro giro della stessa sessione non chiede di nuovo')
    assert.equal(secondo.interrogati.length, 0, 'e non spende nemmeno la sonda')
    assert.equal(secondo.eseguiti.length, 1)
})

test('F009-08: un «no» non esegue niente, non si ricorda, e lo dice al modello e alla ricevuta', async (t) => {
    const consensiSessione = {}
    const { chieste, eseguiti, esiti, ricevute } = await giro(t, { consensiSessione, rootWslDelComandoFn: comeRoot, risposta: false })
    assert.equal(chieste.length, 1)
    assert.equal(eseguiti.length, 0, 'il comando non parte')
    assert.equal(consensiSessione.rootWsl, undefined)
    assert.match(esiti[0], /^REFUSED\. the command would run in WSL as root without anyone approving it.*did not confirm it\. The command was not run\./)
    assert.equal(ricevute[0].status, 'denied', 'la ricevuta dice rifiutato, non riuscito')
})

test('F009-09: la domanda scatta solo quando nessuno è interpellato per QUEL comando — «Chiede prima», un attrezzo su «chiedi» e un segreto hanno già la loro carta', async (t) => {
    const suRichiesta = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: comeRoot, livelloAccesso: 'su-richiesta' })
    assert.equal(suRichiesta.interrogati.length, 0, 'su richiesta chiede già comando per comando')
    assert.equal(suRichiesta.chieste.length, 1)
    assert.equal(suRichiesta.chieste[0].wslRoot, undefined)
    const attrezzoSuChiedi = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: comeRoot, permessiPerAttrezzo: { shell: 'chiedi' } })
    assert.equal(attrezzoSuChiedi.chieste.length, 1, 'una carta sola, quella del comando')
    assert.equal(attrezzoSuChiedi.chieste[0].wslRoot, undefined)
    const segreto = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: comeRoot, chiamate: [['shell', { comando: 'cat ~/.ssh/id_rsa' }]] })
    assert.equal(segreto.chieste.length, 1)
    assert.ok(segreto.chieste[0].segreto, 'la carta del segreto')
    assert.equal(segreto.chieste[0].wslRoot, undefined)
})

test('F009-09b: owner 01/10 sera, «ogni volta che nessuno è interpellato» — «Scrive nel progetto» (nessun livello al kernel) e la shell su «Sempre» chiedono come l accesso pieno', async (t) => {
    const scriveNelProgetto = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: comeRoot, livelloAccesso: 'nessuno' })
    assert.equal(scriveNelProgetto.chieste.length, 1)
    assert.equal(scriveNelProgetto.chieste[0].wslRoot.utente, 'root')
    const sempre = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: comeRoot, livelloAccesso: 'nessuno', permessiPerAttrezzo: { shell: 'sempre' } })
    assert.equal(sempre.chieste.length, 1)
    assert.ok(sempre.chieste[0].wslRoot)
    const lettura = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: comeRoot, livelloAccesso: 'lettura' })
    assert.equal(lettura.interrogati.length, 0, 'un comando già negato non apre una domanda')
})

test('F009-10: senza registro della sessione (TALOS-BANCO, CLI, mobile) non si chiede; con un utente normale nemmeno', async (t) => {
    const senza = await giro(t, { rootWslDelComandoFn: comeRoot })
    assert.equal(senza.chieste.length, 0)
    assert.equal(senza.eseguiti.length, 1)
    const normale = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: async () => null })
    assert.equal(normale.interrogati.length, 1)
    assert.equal(normale.chieste.length, 0)
    assert.equal(normale.eseguiti.length, 1)
})

test('F009-11: con un esecutore proprio (la CLI) il kernel non indovina dove gira: nessuna sonda, nessuna domanda', async (t) => {
    const { chieste, eseguiti } = await giro(t, { consensiSessione: {} })
    assert.equal(chieste.length, 0)
    assert.equal(eseguiti.length, 1)
})

test('F009-12: chi non riesce a valutare CHIEDE — una sonda che lancia vale «forse root»', async (t) => {
    const { chieste, eseguiti } = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: async () => { throw new Error('wsl.exe muto') } })
    assert.equal(chieste.length, 1)
    assert.equal(chieste[0].wslRoot.utente, null)
    assert.match(chieste[0].wslRoot.frase, /non è stato possibile verificare con che utente: potrebbe essere root/)
    assert.equal(eseguiti.length, 1)
})

test('F009-13: lo Stop mentre la domanda è a schermo ferma il giro e non esegue', async (t) => {
    const { chieste, eseguiti, esiti } = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: comeRoot, stop: new AbortController() })
    assert.equal(chieste.length, 1)
    assert.equal(eseguiti.length, 0)
    assert.ok(esiti.every((e) => !/^exit /.test(e)))
})

test('F009-14: la preferenza arriva all esecuzione e alla sonda; un lettore che lancia vale «accesa»', async (t) => {
    const spenta = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: async () => null, preferenzeWslFn: () => ({ usaUtenteNormale: false }) })
    assert.deepEqual(spenta.eseguiti[0].opzioni.wsl, { usaUtenteNormale: false })
    assert.equal(spenta.interrogati[0].opzioni.usaUtenteNormale, false)
    const rotta = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: async () => null, preferenzeWslFn: () => { throw new Error('file illeggibile') } })
    assert.deepEqual(rotta.eseguiti[0].opzioni.wsl, { usaUtenteNormale: true })
    const assente = await giro(t, {})
    assert.equal(assente.eseguiti[0].opzioni.wsl, null, 'senza lettore: come prima')
})

test('F009-15: l esito della shell dichiara con che utente ha girato e che cosa vale sul disco', async (t) => {
    const { esiti } = await giro(t, {})
    assert.match(esiti[0], /^exit 0 \[sandbox: wsl2 \(Linux in WSL come root; nessun isolamento: \/mnt\/c è il disco di Windows .*permessi Linux non valgono\)\]\nciao/)
})

test('F009-16: `prova` chiede solo quando la sessione ha scelto Linux — col ripiego automatico gira su Windows', { skip: process.platform !== 'win32' ? 'la scelta di Linux esiste solo su Windows' : false }, async (t) => {
    const automatico = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: comeRoot, chiamate: [['prova', {}]], comandoProva: 'node -e 0' })
    assert.equal(automatico.interrogati.length, 0)
    const linux = await giro(t, { consensiSessione: {}, rootWslDelComandoFn: comeRoot, chiamate: [['prova', {}]], comandoProva: 'node -e 0', risposta: false,
        ambienteComandiFn: async () => ({ dove: 'wsl2', revisione: 0 }) })
    assert.equal(linux.chieste.length, 1)
    assert.equal(linux.chieste[0].tipo, 'prova')
    assert.match(linux.esiti[0], /^REFUSED\. .*The test command was not run\./)
})

/* ── cablaggio e rotte ──────────────────────────────────────────────────────────────────────────────────────── */

test('F009-17: agent-service porta preferenza e consensi al kernel com sono; il comando `!` porta la preferenza e dichiara l utente', async () => {
    let visto
    const consensiSessione = {}
    const preferenzeWslFn = () => ({ usaUtenteNormale: true })
    await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, preferenzeWslFn, consensiSessione,
        talosLavoraFn: async (input) => { visto = input; return { comeFinita: 'concluso', detto: 'fatto' } } })
    assert.equal(visto.preferenzeWslFn, preferenzeWslFn)
    assert.equal(visto.consensiSessione, consensiSessione)
    const eventi = []
    let opzioni
    await eseguiComandoDiretto({ cartella: 'C:\\x', comando: 'id -un', onEvento: (e) => eventi.push(e), preferenzeWsl: { usaUtenteNormale: false },
        eseguiComandoSandboxatoFn: async (_c, _d, o) => { opzioni = o; return { codice: 0, testo: 'root', enforcement: 'wsl2', wsl: { utente: 'root', root: true, disco: null } } } })
    assert.deepEqual(opzioni.wsl, { usaUtenteNormale: false })
    assert.match(eventi.find((e) => e.type === 'ToolCallResult').content, /^exit 0 \[sandbox: wsl2 \(Linux in WSL come root; /)
})

test('F009-18: il registro dà a ogni sessione i suoi consensi, gli stessi per i suoi giri, e la preferenza ai comandi `!`', async (t) => {
    const { createSessionRegistry } = await import('../src/session-registry.mjs')
    const runs = [], diretti = []
    const avviaSessioneFn = (input) => {
        let risolvi
        const promessa = new Promise((r) => { risolvi = r })
        const i = runs.length
        runs.push({ input, risolvi })
        input.onEvento({ type: 'RunStarted', threadId: `t${i}`, runId: `r${i}` })
        return promessa
    }
    const fine = (i) => { runs[i].input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` }); runs[i].risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'lavora' }, { role: 'assistant', content: 'ok' }] } }) }
    let preferenza = { usaUtenteNormale: false }
    const registro = createSessionRegistry({ avviaSessioneFn, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, preferenzeWslFn: () => preferenza,
        eseguiComandoDirettoFn: async (input) => { diretti.push(input); return { ok: true, comando: input.comando, testo: '', codice: 0 } },
        preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }) })
    t.after(() => registro.chiudi?.())
    const { sessionId } = registro.avvia('task')
    fine(0)
    await registro.attendiAssestamento(sessionId)
    registro.resume(sessionId, 'continua')
    assert.equal(typeof runs[0].input.consensiSessione, 'object')
    assert.equal(runs[1].input.consensiSessione, runs[0].input.consensiSessione, 'stessa sessione, stessi consensi')
    assert.deepEqual(runs[0].input.preferenzeWslFn(), { usaUtenteNormale: false })
    fine(1)
    await registro.attendiAssestamento(sessionId)
    const altra = registro.avvia('task')
    assert.notEqual(runs[2].input.consensiSessione, runs[0].input.consensiSessione, 'un altra sessione chiede da capo')
    fine(2)
    await registro.attendiAssestamento(altra.sessionId)
    preferenza = { usaUtenteNormale: true }
    registro.shell(sessionId, 'id -un')
    await new Promise((r) => setImmediate(r))
    assert.deepEqual(diretti.at(-1)?.preferenzeWsl, { usaUtenteNormale: true }, 'il comando `!` legge la preferenza di ADESSO')
})

test('F009-19: lo store vale «accesa» senza file e su un file rotto, e rifiuta tutto ciò che non è vero/falso', async (t) => {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-f009-store-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    const file = join(cartella, '.preferenze-wsl.json')
    const store = createPreferenzeWslStore({ file, statoFn: async (p) => ({ disponibile: true, utenteUsato: p.usaUtenteNormale ? 'mario' : 'root' }) })
    assert.deepEqual(store.leggi(), { usaUtenteNormale: true })
    assert.deepEqual(store.imposta({ usaUtenteNormale: false }), { usaUtenteNormale: false })
    assert.deepEqual(createPreferenzeWslStore({ file }).leggi(), { usaUtenteNormale: false }, 'sopravvive al riavvio')
    assert.deepEqual(await store.stato(), { preferenze: { usaUtenteNormale: false }, wsl: { disponibile: true, utenteUsato: 'root' } })
    for (const sbagliato of [undefined, 'false', 0, null]) assert.throws(() => store.imposta({ usaUtenteNormale: sbagliato }), { code: 'QUERY_INVALID' })
    const { writeFileSync } = await import('node:fs')
    writeFileSync(file, '{ rotto')
    assert.deepEqual(store.leggi(), { usaUtenteNormale: true })
})

test('F009-20: GET e POST /api/v1/wsl — stato coi fatti, corpo con il solo campo atteso', async (t) => {
    const { createHttpApp } = await import('../src/http-app.mjs')
    const http = await import('node:http')
    const store = createPreferenzeWslStore({ statoFn: async (p) => ({ disponibile: true, distro: 'Ubuntu', utenteUsato: 'root', root: true, usa: p.usaUtenteNormale }) })
    const app = createHttpApp({ preferenzeWslStore: store })
    const server = http.createServer(app)
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    t.after(() => new Promise((r) => server.close(r)))
    const base = `http://127.0.0.1:${server.address().port}`
    const get = await (await fetch(`${base}/api/v1/wsl`)).json()
    assert.equal(get.data.preferenze.usaUtenteNormale, true)
    assert.equal(get.data.wsl.distro, 'Ubuntu')
    const post = await fetch(`${base}/api/v1/wsl`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usaUtenteNormale: false }) })
    assert.equal(post.status, 200)
    assert.equal((await post.json()).data.wsl.usa, false)
    for (const corpo of [{}, { usaUtenteNormale: 'no' }, { usaUtenteNormale: true, altro: 1 }]) {
        const r = await fetch(`${base}/api/v1/wsl`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
        assert.equal(r.status, 400, JSON.stringify(corpo)) // QUERY_INVALID vale 400 in tutta la app (http-app.mjs)
    }
    assert.deepEqual(store.leggi(), { usaUtenteNormale: false }, 'i corpi sbagliati non hanno cambiato niente')
})

/* ── WSL vero ──────────────────────────────────────────────────────────────────────────────────────────────── */

const sonda = process.platform === 'win32' ? spawnSync('wsl.exe', ['--exec', 'sh', '-c', SCRIPT_FATTI_WSL], { encoding: 'utf8', timeout: 15_000, windowsHide: true }) : null
const fattiVeri = sonda?.status === 0 ? leggiFattiWsl(sonda.stdout) : null
const wslVero = { skip: fattiVeri ? false : 'WSL non disponibile: integrazione non eseguita' }

test('F009-21 (WSL vero): il comando gira con l utente che la sonda dice, e l esito lo dichiara', wslVero, async (t) => {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-f009-vero-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    const atteso = sceltaUtenteWsl(fattiVeri, { usaUtenteNormale: true }).utente
    const r = await eseguiComandoSandboxato('id -un', cartella, { dove: 'wsl2', wsl: { usaUtenteNormale: true } })
    assert.equal(r.codice, 0)
    assert.equal(r.testo.trim(), atteso)
    assert.equal(r.wsl.utente, atteso)
    assert.match(etichettaSandbox(r.enforcement, r.wsl), new RegExp(`^wsl2 \\(Linux in WSL come ${atteso}; nessun isolamento: `))
    const stato = await statoWsl({ usaUtenteNormale: true })
    assert.equal(stato.disponibile, true)
    assert.equal(stato.utenteUsato, atteso)
})
