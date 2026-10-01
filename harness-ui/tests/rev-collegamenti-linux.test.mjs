/*
 * ⛔⛔ 5a, programma «filesystem guest» (owner 01/10/2026: «errore onesto e spiegato», mai «non esiste») — i collegamenti
 *   simbolici creati da Linux (WSL) su un disco di Windows. Finding AUDITV2-F10, T08, B03. Misure e fonti in
 *   `src/kernel/collegamento-linux.mjs`. NAMESPACE26: il codice EACCES non si riscrive in ENOENT.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    destinazioneInFormaLinux, collegamentoNonSeguito, collegamentoLinuxSulPercorso, spiegazioneCollegamentoLinux,
    erroriDiRipgrep, avvisoCollegamentiDiRipgrep,
} from '../src/kernel/collegamento-linux.mjs'
import { talosLavora, convertiPercorsoWsl } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const cartellaDiProva = (t, nome) => {
    const c = mkdtempSync(join(tmpdir(), `talos-5a-${nome}-`))
    t.after(() => rimuoviCartellaDiProva(c))
    return c
}
const finto = (link) => ({ isSymbolicLink: () => link, isDirectory: () => !link })

test('5A-01: la destinazione «alla Linux» si riconosce, quella di Windows no', () => {
    for (const d of ['vero.txt', '/etc/hostname', '../a/b', 'd', '/mnt/c/Users/x']) assert.equal(destinazioneInFormaLinux(d), true, d)
    for (const d of ['', 'C:\\Users', 'c:/Users', '\\\\server\\share', 'a\\b', null]) assert.equal(destinazioneInFormaLinux(d), false, String(d))
})

test('5A-02: la regola — collegamento, seguirlo fallisce con EACCES/EPERM, destinazione Linux; tutto il resto è null', () => {
    assert.deepEqual(collegamentoNonSeguito('C:\\x\\l', finto(true), 'EACCES', 'vero.txt'), { collegamento: 'C:\\x\\l', destinazione: 'vero.txt' })
    assert.deepEqual(collegamentoNonSeguito('C:\\x\\l', finto(true), 'EPERM', '/etc/x'), { collegamento: 'C:\\x\\l', destinazione: '/etc/x' })
    assert.equal(collegamentoNonSeguito('C:\\x\\l', finto(true), true, 'vero.txt'), null, 'Windows lo segue')
    assert.equal(collegamentoNonSeguito('C:\\x\\l', finto(true), 'ENOENT', 'manca'), null, 'un collegamento di Windows rotto')
    assert.equal(collegamentoNonSeguito('C:\\x\\l', finto(true), 'EPERM', 'C:\\Users'), null, 'una giunzione di sistema')
    assert.equal(collegamentoNonSeguito('C:\\x\\l', finto(false), 'EACCES', 'vero.txt'), null, 'non è un collegamento')
})

test('5A-03: la frase dice che cos è, dove punta e cosa fare — e tiene il codice vero in testa', (t) => {
    const c = cartellaDiProva(t, 'frase')
    writeFileSync(join(c, 'vero.txt'), 'ciao')
    mkdirSync(join(c, 'd'))
    const base = (dest, extra = {}) => spiegazioneCollegamentoLinux({ collegamento: join(c, 'l'), destinazione: dest }, { cartella: c, ...extra })
    const vivo = base('vero.txt')
    assert.match(vivo, /^EACCES — "l" is a symbolic link created by Linux \(WSL\) on a Windows drive, pointing to "vero\.txt"\. Windows cannot follow Linux symbolic links/)
    assert.match(vivo, /it is not a missing file, and not a permission that can be granted\. Its target is "vero\.txt": use that path instead\.$/)
    assert.match(base('manca.txt'), /Its target does not exist: the link is broken\.$/)
    assert.match(base('/etc/hostname'), /a path inside Linux that Windows cannot see: use the shell \(for example cat "\/etc\/hostname"/)
    assert.match(spiegazioneCollegamentoLinux({ collegamento: join(c, 'l'), destinazione: 'vero.txt' }, { cartella: c, codice: 'EPERM' }), /^EPERM — /)
    const sulPercorso = spiegazioneCollegamentoLinux({ collegamento: join(c, 'ld'), destinazione: 'd' }, { cartella: c, richiesto: join(c, 'ld', 'f.txt') })
    assert.match(sulPercorso, /"ld" is a symbolic link.*It is a folder on the way to "ld\/f\.txt"\. Its target is "d": use "d\/f\.txt" instead\.$/s)
    assert.doesNotMatch(vivo, /ENOENT|does not exist[^:]/, 'mai «non esiste» per un collegamento valido')
})

test('5A-04: /mnt/<x>/… si legge come il disco di Windows', (t) => {
    const c = cartellaDiProva(t, 'mnt')
    writeFileSync(join(c, 'vero.txt'), 'ciao')
    const lettera = c[0].toLowerCase()
    const comeMnt = `/mnt/${lettera}/${c.slice(3).split('\\').join('/')}/vero.txt`
    assert.match(spiegazioneCollegamentoLinux({ collegamento: join(c, 'l'), destinazione: comeMnt }, { cartella: c }), /Its target is "vero\.txt": use that path instead\.$/)
})

test('5A-05: fuori da Windows il caso non esiste (un collegamento rotto lì risponde ENOENT)', async () => {
    assert.equal(await collegamentoLinuxSulPercorso('/tmp/x', { piattaforma: 'linux' }), null)
    assert.deepEqual(erroriDiRipgrep('rg: a: x (os error 1920)\n', '/tmp', { piattaforma: 'linux' }), { collegamenti: [], collegamentiTotali: 0, altri: 1 })
})

test('5A-06: lo stderr di rg — un errore che non è un collegamento Linux resta un errore generico', (t) => {
    const c = cartellaDiProva(t, 'rg')
    writeFileSync(join(c, 'normale.txt'), 'x')
    const esito = erroriDiRipgrep(`rg: normale.txt: Impossibile accedere al file. (os error 1920)\nrg: altro: Accesso negato. (os error 5)\nnon è una riga di rg\n`, c, { piattaforma: 'win32' })
    assert.deepEqual(esito, { collegamenti: [], collegamentiTotali: 0, altri: 2 })
    assert.equal(avvisoCollegamentiDiRipgrep(esito), '')
    const avviso = avvisoCollegamentiDiRipgrep({ collegamenti: [{ percorso: 'l', destinazione: 'v' }], collegamentiTotali: 3 })
    assert.equal(avviso, '⚠ incomplete scan: 3 symbolic link(s) created by Linux (WSL) on this Windows drive cannot be read by Windows and were not searched: l → v and 2 more. Search their targets instead, or use the shell (for example grep -rn).')
})

const suWindows = { skip: process.platform === 'win32' ? false : 'serve Windows' }

test('5A-07 (Windows): le giunzioni di Windows — sane, rotte, o di sistema — non sono collegamenti Linux', suWindows, async (t) => {
    const c = cartellaDiProva(t, 'giunzioni')
    mkdirSync(join(c, 'vera'))
    symlinkSync(join(c, 'vera'), join(c, 'giunzione'), 'junction')
    symlinkSync(join(c, 'manca'), join(c, 'rotta'), 'junction')
    assert.equal(await collegamentoLinuxSulPercorso(join(c, 'giunzione', 'f.txt')), null)
    assert.equal(await collegamentoLinuxSulPercorso(join(c, 'rotta', 'f.txt')), null)
    assert.equal(await collegamentoLinuxSulPercorso('C:\\Documents and Settings\\x.txt'), null, 'stat riesce, l elenco no: non è il nostro caso')
})

/* ── WSL vero: collegamenti creati da Linux, gli attrezzi del kernel come li vede il modello ─────────────────────── */

const sonda = process.platform === 'win32' ? spawnSync('wsl.exe', ['--exec', 'sh', '-c', 'echo ok'], { encoding: 'utf8', timeout: 15_000, windowsHide: true }) : null
const wslVero = { skip: sonda?.status === 0 && sonda.stdout.includes('ok') ? false : 'WSL non disponibile: integrazione non eseguita' }

/* Windows non sa cancellare un collegamento LX ("The file cannot be accessed by the system", misurato): la cartella si toglie
   da WSL, che li vede come file normali. Solo la cartella di questa prova, creata qui con mkdtemp. */
function conCollegamenti(t) {
    const c = mkdtempSync(join(tmpdir(), 'talos-5a-vero-'))
    t.after(() => { spawnSync('wsl.exe', ['--exec', 'rm', '-rf', '--', convertiPercorsoWsl(c)], { windowsHide: true }) })
    const r = spawnSync('wsl.exe', ['--exec', 'sh', '-c', `cd "${convertiPercorsoWsl(c)}" && printf ciao > vero.txt && ln -s vero.txt link.txt && ln -s /etc/hostname fuori.txt && mkdir d && printf dentro > d/f.txt && ln -s d linkdir && ln -s manca.txt rotto.txt`], { encoding: 'utf8', windowsHide: true })
    assert.equal(r.status, 0, r.stderr)
    return c
}

async function giro(cartella, chiamate) {
    const esiti = []
    let n = 0
    await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: chiamate.length + 2, livelloAccesso: 'accesso-pieno',
        fetchDiRete: async () => {
            const c = chiamate[n++]
            const message = c ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] } : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)) },
    })
    return esiti
}

test('5A-08 (WSL vero): leggi, scrivi, file_edit ed elenca dicono che cos è il collegamento, dove punta e cosa fare', wslVero, async (t) => {
    const c = conCollegamenti(t)
    const esiti = await giro(c, [
        ['leggi', { percorso: 'link.txt' }], ['leggi', { percorso: 'fuori.txt' }], ['leggi', { percorso: 'rotto.txt' }], ['leggi', { percorso: 'linkdir/f.txt' }],
        ['elenca', { percorso: 'linkdir' }], ['scrivi', { percorso: 'link.txt', contenuto: 'nuovo' }], ['scrivi', { percorso: 'linkdir/g.txt', contenuto: 'g' }],
        ['file_edit', { percorso: 'link.txt', vecchio: 'ciao', nuovo: 'salve' }],
    ])
    const [vivo, fuori, rotto, sulPercorso, elencaLink, scriviLink, scriviDentro, modifica] = esiti
    assert.match(vivo, /^error: EACCES — "link\.txt" is a symbolic link created by Linux \(WSL\) on a Windows drive, pointing to "vero\.txt"\..*Its target is "vero\.txt": use that path instead\.$/s)
    assert.match(fuori, /pointing to "\/etc\/hostname".*use the shell/s)
    assert.match(rotto, /pointing to "manca\.txt".*the link is broken\.$/s)
    assert.match(sulPercorso, /"linkdir" is a symbolic link.*folder on the way to "linkdir\/f\.txt".*use "d\/f\.txt" instead\.$/s)
    assert.match(elencaLink, /^EACCES — "linkdir" is a symbolic link/)
    assert.match(scriviLink, /^error: EACCES — "link\.txt" is a symbolic link/)
    assert.match(scriviDentro, /^error: EACCES — "linkdir" is a symbolic link.*use "d\/g\.txt" instead\.$/s)
    assert.match(modifica, /^REFUSED\. Nothing was changed: EACCES — "link\.txt" is a symbolic link/)
    for (const e of esiti) assert.doesNotMatch(e, /does not exist, or it cannot be read|not a readable folder|permission denied/, 'le frasi di prima, che mentivano o non spiegavano')
    assert.equal(readFileSync(join(c, 'vero.txt'), 'utf8'), 'ciao', 'niente è stato scritto')
})

test('5A-09 (WSL vero): cerca nomina i collegamenti che rg non ha letto, al posto della frase generica', wslVero, async (t) => {
    const c = conCollegamenti(t)
    const [risultato] = await giro(c, [['cerca', { testo: 'ciao' }]])
    assert.match(risultato, /^vero\.txt:1:ciao/)
    assert.match(risultato, /⚠ incomplete scan: 4 symbolic link\(s\) created by Linux \(WSL\) on this Windows drive cannot be read by Windows and were not searched: fuori\.txt → \/etc\/hostname, link\.txt → vero\.txt, linkdir → d, rotto\.txt → manca\.txt\./)
    assert.doesNotMatch(risultato, /ripgrep reported an error/, 'tutti gli errori erano collegamenti: la frase generica non serve')
})

test('5A-10 (WSL vero): un file normale e una cartella normale non cambiano di un byte', wslVero, async (t) => {
    const c = conCollegamenti(t)
    const [leggi, elenca] = await giro(c, [['leggi', { percorso: 'vero.txt' }], ['elenca', { percorso: 'd' }]])
    assert.match(leggi, /ciao/)
    assert.doesNotMatch(leggi, /symbolic link/)
    assert.match(elenca, /d\/f\.txt/)
})

test('5A-11 (WSL vero): anche la ricerca che continua, ripresa con «continua», nomina i collegamenti non letti', wslVero, async (t) => {
    const { cercaNelProgetto } = await import('../src/kernel/talosHarness.mjs')
    const { creaRegistroRicerche } = await import('../src/kernel/ricerche-in-corso.mjs')
    const c = conCollegamenti(t)
    const ricerche = creaRegistroRicerche()
    t.after(() => ricerche.fermaTutte('fermata'))
    const disco = { async elenca() { assert.fail('nessuna camminata JS') }, async leggi() { assert.fail('nessuna camminata JS') } }
    const primo = await cercaNelProgetto(disco, { testo: 'ciao' }, { radice: c, ricerche, tempoRgMs: 1 })
    if (!/still running as search "r1"/u.test(primo)) {
        /* rg è stato più veloce di 1 ms: la risposta immediata deve comunque nominarli (è il ramo di 5A-09). */
        assert.match(primo, /4 symbolic link\(s\) created by Linux/)
        return
    }
    let finale
    for (let i = 0; i < 50 && !/finished/u.test(finale ?? ''); i++) finale = await cercaNelProgetto(disco, { continua: 'r1' }, { radice: c, ricerche, tempoRgMs: 2000 })
    assert.match(finale, /\[TALOS: search "r1" finished/u)
    assert.match(finale, /4 symbolic link\(s\) created by Linux \(WSL\) on this Windows drive cannot be read by Windows/)
})

/* Una risposta del modello con PIÙ chiamate insieme: le letture partono in anticipo (`lettureAvviate`), un'altra strada. */
async function giroInsieme(cartella, chiamate, extra = {}) {
    const esiti = []
    let primo = true
    await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 3, livelloAccesso: 'accesso-pieno', ...extra,
        fetchDiRete: async () => {
            const message = primo
                ? { role: 'assistant', content: null, tool_calls: chiamate.map((c, i) => ({ id: `c${i}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } })) }
                : { role: 'assistant', content: 'fatto' }
            const fine = primo ? 'tool_calls' : 'stop'
            primo = false
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: fine }] }), { headers: { 'Content-Type': 'application/json' } })
        },
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)) },
    })
    return esiti
}

test('5A-12 (WSL vero): letture partite INSIEME (stessa risposta) — anche lì il collegamento si spiega', wslVero, async (t) => {
    const c = conCollegamenti(t)
    const [leggi, elenca] = await giroInsieme(c, [['leggi', { percorso: 'link.txt' }], ['elenca', { percorso: 'linkdir' }]])
    assert.match(leggi, /^error: EACCES — "link\.txt" is a symbolic link created by Linux/)
    assert.match(elenca, /^EACCES — "linkdir" is a symbolic link created by Linux/)
})

test('5A-13 (WSL vero): una giunzione di Windows che Windows segue non ferma il cammino — il collegamento Linux dietro si trova', wslVero, async (t) => {
    const c = conCollegamenti(t)
    symlinkSync(join(c, 'd'), join(c, 'giunzione'), 'junction')
    const r = spawnSync('wsl.exe', ['--exec', 'sh', '-c', `cd "${convertiPercorsoWsl(join(c, 'd'))}" && ln -s f.txt dentro.txt`], { encoding: 'utf8', windowsHide: true })
    assert.equal(r.status, 0, r.stderr)
    const [leggi] = await giroInsieme(c, [['leggi', { percorso: 'giunzione/dentro.txt' }]])
    assert.match(leggi, /^error: EACCES — "giunzione\/dentro\.txt" is a symbolic link created by Linux \(WSL\) on a Windows drive, pointing to "f\.txt"\./)
})

test('5A-14 (WSL vero): in una sessione mobile la shell gira sul telefono — niente consiglio «usa la shell», resta il messaggio di prima', wslVero, async (t) => {
    const c = conCollegamenti(t)
    const [leggi] = await giroInsieme(c, [['leggi', { percorso: 'link.txt' }]], { mobile: true })
    assert.doesNotMatch(leggi, /symbolic link/)
    assert.match(leggi, /EACCES/)
})
