/*
 * ⛔⛔ Fase B «casa di esecuzione» (owner 01/10/2026) — il canale fra TALOS (Windows) e il servente nella casa Linux.
 *   Prima metà: il protocollo, con un processo finto al confine (`spawnFn`): richieste, risposte, errori col loro codice, Stop di
 *   una richiesta, uscita del processo e riaccensione, chiusura. Seconda metà: WSL vero coi binari preparati
 *   (`scripts/prepara-casa-linux.mjs`), saltata — e detta — se mancano.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { creaCasaLinux, percorsoWindowsInWsl } from '../src/kernel/casa-linux.mjs'
import { verificaCasaLinux, BINARI_CASA_LINUX } from '../src/casa-linux-binari.mjs'
import { ambienteSenzaCredenziali } from '../src/kernel/talosHarness.mjs'
import { wslDiPreparazione } from './aiuto/wsl-di-preparazione.mjs'

/* Un processo finto: registra ciò che riceve su stdin e risponde con `rispondi(messaggio, processo)`. */
/* `pronto(p)` dice se QUEL processo annuncia di essere partito (il servente vero lo fa appena ha importato il kernel). */
function processoFinto(rispondi, { pronto = () => true } = {}) {
    const nati = []
    const spawnFn = (programma, argomenti) => {
        const p = new EventEmitter()
        p.argomenti = argomenti
        p.programma = programma
        p.ricevuti = []
        p.stdout = new PassThrough()
        p.stderr = new PassThrough()
        /* Come un processo vero: prima `exit`, poi `close` quando stdout è finito. */
        p.esci = (codice) => { p.emit('exit', codice); p.stdout.end(); setImmediate(() => p.emit('close', codice)) }
        p.stdin = new Writable({
            write(pezzo, _c, fatto) {
                for (const riga of String(pezzo).split('\n').filter(Boolean)) {
                    const m = JSON.parse(riga)
                    p.ricevuti.push(m)
                    rispondi(m, p)
                }
                fatto()
            },
            final(fatto) { p.chiusoStdin = true; fatto(); setImmediate(() => p.esci(0)) },
        })
        p.rispondi = (oggetto) => p.stdout.write(`${JSON.stringify(oggetto)}\n`)
        p.kill = () => { p.ucciso = true; p.esci(null) }
        nati.push(p)
        if (pronto(p, nati.length)) p.rispondi({ pronto: true, node: 'v24.18.0' })
        return p
    }
    return { spawnFn, nati }
}
const binari = { node: 'C:\\talos\\casa-linux\\node', rg: 'C:\\talos\\casa-linux\\rg', env: { SystemRoot: 'C:\\Windows', SEGNO: 'di prova' } }

test('CL-01: l avvio — wsl -d <distro> [-u <utente F009>] --exec <node su C:> <servente> <rg>, tutto in percorsi di Linux', async () => {
    const { spawnFn, nati } = processoFinto((m, p) => m.id && p.rispondi({ id: m.id, ok: true, valore: 'pong' }))
    const casa = creaCasaLinux({ distro: 'Ubuntu', utente: 'mario', ...binari, spawnFn })
    assert.equal(casa.accesa, false, 'acceso solo alla prima chiamata')
    assert.equal(await casa.chiama('ping'), 'pong')
    assert.equal(nati[0].programma, 'wsl.exe')
    const a = nati[0].argomenti
    assert.deepEqual(a.slice(0, 5), ['-d', 'Ubuntu', '-u', 'mario', '--exec'])
    assert.equal(a[5], '/mnt/c/talos/casa-linux/node')
    assert.match(a[6], /^\/mnt\/[a-z]\/.*\/src\/kernel\/casa-linux-servente\.mjs$/)
    assert.equal(a[7], '/mnt/c/talos/casa-linux/rg')
    const senzaUtente = processoFinto((m, p) => m.id && p.rispondi({ id: m.id, ok: true, valore: 1 }))
    await creaCasaLinux({ distro: 'Ubuntu', ...binari, spawnFn: senzaUtente.spawnFn }).chiama('ping')
    assert.deepEqual(senzaUtente.nati[0].argomenti.slice(0, 3), ['-d', 'Ubuntu', '--exec'])
})

test('CL-02: un errore della casa Linux arriva col suo codice e il suo percorso (EACCES, ENOENT restano quelli)', async () => {
    const { spawnFn } = processoFinto((m, p) => p.rispondi({ id: m.id, ok: false, errore: { message: 'ENOENT: no such file', code: 'ENOENT', path: '/tmp/x', name: 'Error' } }))
    const casa = creaCasaLinux({ distro: 'Ubuntu', ...binari, spawnFn })
    await assert.rejects(casa.chiama('leggiTestoLimitato', { cartella: '/tmp', percorso: 'x' }), (e) => e.code === 'ENOENT' && e.path === '/tmp/x' && /no such file/.test(e.message))
})

test('CL-03: richieste in parallelo — ognuna riceve la SUA risposta, anche fuori ordine', async () => {
    const { spawnFn, nati } = processoFinto(() => {})
    const casa = creaCasaLinux({ distro: 'Ubuntu', ...binari, spawnFn })
    const a = casa.chiama('leggiTestoLimitato', { percorso: 'a' })
    const b = casa.chiama('leggiTestoLimitato', { percorso: 'b' })
    const [ra, rb] = nati[0].ricevuti
    nati[0].rispondi({ id: rb.id, ok: true, valore: 'B' })
    nati[0].rispondi({ id: ra.id, ok: true, valore: 'A' })
    assert.deepEqual(await Promise.all([a, b]), ['A', 'B'])
    assert.equal(nati.length, 1, 'un processo solo per la sessione')
})

test('CL-04: lo Stop annulla QUELLA richiesta (il servente riceve «annulla») e il processo resta acceso', async () => {
    const { spawnFn, nati } = processoFinto((m, p) => { if (m.op === 'ping') p.rispondi({ id: m.id, ok: true, valore: 'ancora qui' }) })
    const casa = creaCasaLinux({ distro: 'Ubuntu', ...binari, spawnFn })
    const stop = new AbortController()
    const lenta = casa.chiama('cerca', { argomenti: { testo: 'x' } }, { segnale: stop.signal })
    stop.abort()
    await assert.rejects(lenta, { name: 'AbortError' })
    const idLenta = nati[0].ricevuti[0].id
    assert.deepEqual(nati[0].ricevuti[1], { annulla: idLenta })
    assert.equal(await casa.chiama('ping'), 'ancora qui')
    assert.equal(nati.length, 1)
    await assert.rejects(casa.chiama('ping', {}, { segnale: AbortSignal.abort() }), { name: 'AbortError' }, 'già fermato: non parte nemmeno')
    assert.equal(nati[0].ricevuti.filter((m) => m.op === 'ping').length, 1)
})

/* Ciò che scrive wsl.exe quando il servizio di WSL non risponde (misurato il 01/10/2026: su STDOUT, in UTF-16 con i NUL). */
const WSL_NON_RISPONDE = 'I\0m\0p\0o\0s\0s\0i\0b\0i\0l\0e\0 \0s\0t\0a\0b\0i\0l\0i\0r\0e\0 \0l\0a\0 \0c\0o\0n\0n\0e\0s\0s\0i\0o\0n\0e\0.\0\r\0\n\0C\0o\0d\0i\0c\0e\0 \0e\0r\0r\0o\0r\0e\0:\0 \0W\0s\0l\0/\0S\0e\0r\0v\0i\0c\0e\0/\0x\0\n'

test('CL-05a: il processo muore PRIMA di annunciarsi (WSL non risponde) — la richiesta non è arrivata di là, si rimanda UNA volta', async () => {
    const { spawnFn, nati } = processoFinto((m, p) => {
        if (p === nati[0]) return
        p.rispondi({ id: m.id, ok: true, valore: 'di nuovo' })
    }, { pronto: (_p, n) => n > 1 })
    const avvisi = []
    const casa = creaCasaLinux({ distro: 'Ubuntu', ...binari, spawnFn, avvisa: (t) => avvisi.push(t) })
    const scrittura = casa.chiama('discoScrivi', { percorso: 'a.txt', testo: 'x', modalita: 'accoda' })
    nati[0].stdout.write(WSL_NON_RISPONDE)
    nati[0].esci(4294967295)
    assert.equal(await scrittura, 'di nuovo')
    assert.equal(nati.length, 2)
    assert.deepEqual(nati[1].ricevuti.map((m) => m.op), ['discoScrivi'], 'rimandata al processo nuovo, una volta sola')
    assert.equal(avvisi.length, 1, 'il rinvio si dice nel registro del server')
    assert.match(avvisi[0], /uscita 4294967295: Impossibile stabilire la connessione\.[\s\S]*1 richiesta rimandata a un processo nuovo\.$/u)
})

test('CL-05b: se muore due volte prima di annunciarsi, la richiesta fallisce col testo di wsl.exe (stdout compreso, senza NUL)', async () => {
    const { spawnFn, nati } = processoFinto(() => {}, { pronto: () => false })
    const avvisi = []
    const casa = creaCasaLinux({ distro: 'Ubuntu', ...binari, spawnFn, avvisa: (t) => avvisi.push(t) })
    const richiesta = casa.chiama('ping')
    nati[0].stdout.write(WSL_NON_RISPONDE)
    nati[0].esci(4294967295)
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
    nati[1].stdout.write(WSL_NON_RISPONDE)
    nati[1].esci(4294967295)
    await assert.rejects(richiesta, (e) => e.code === 'CASA_LINUX_USCITA' && /uscita 4294967295/.test(e.message)
        && /Impossibile stabilire la connessione\./.test(e.message) && /Wsl\/Service/.test(e.message) && !e.message.includes('\0'))
    assert.equal(nati.length, 2, 'un rinvio solo')
    assert.equal(avvisi.length, 1, 'un avviso per il rinvio; il secondo fallimento è l errore della richiesta')
    assert.equal(casa.accesa, false)
})

test('CL-05c: se muore DOPO essersi annunciato, non si rimanda niente (una scrittura potrebbe essere già avvenuta); la chiamata dopo lo riaccende', async () => {
    const { spawnFn, nati } = processoFinto((m, p) => {
        if (p !== nati[0]) p.rispondi({ id: m.id, ok: true, valore: 'di nuovo' })
    })
    const avvisi = []
    const casa = creaCasaLinux({ distro: 'Ubuntu', ...binari, spawnFn, avvisa: (t) => avvisi.push(t) })
    const scrittura = casa.chiama('discoScrivi', { percorso: 'a.txt', testo: 'x' })
    await new Promise((r) => setImmediate(r))
    nati[0].stderr.write('Segmentation fault\n')
    nati[0].esci(139)
    await assert.rejects(scrittura, (e) => e.code === 'CASA_LINUX_USCITA' && /uscita 139/.test(e.message) && /Segmentation fault/.test(e.message))
    assert.equal(nati.length, 1, 'nessun rinvio')
    assert.deepEqual(avvisi, [], 'nessun rinvio, nessun avviso: l errore arriva alla richiesta')
    assert.equal(await casa.chiama('ping'), 'di nuovo')
    assert.equal(nati.length, 2)
})

test('CL-05d: si annuncia, esegue e muore, e `exit` arriva PRIMA dei suoi dati di stdout — niente rinvio: si decide a `close`, quando stdout è letto tutto', async () => {
    /* Node: «When the 'exit' event is triggered, child process stdio streams might still be open»; `close` viene dopo. */
    const { spawnFn, nati } = processoFinto((m, p) => {
        if (p !== nati[0]) { p.rispondi({ id: m.id, ok: true, valore: 'rimandata due volte' }); return }
        p.emit('exit', 139)
        p.stdout.write(`${JSON.stringify({ pronto: true, node: 'v24.18.0' })}\n`)
        p.stdout.end()
        setImmediate(() => p.emit('close', 139))
    }, { pronto: () => false })
    const casa = creaCasaLinux({ distro: 'Ubuntu', ...binari, spawnFn, avvisa: () => {} })
    await assert.rejects(casa.chiama('discoScrivi', { percorso: 'a.txt', testo: 'x', modalita: 'accoda' }), { code: 'CASA_LINUX_USCITA' })
    assert.equal(nati.length, 1, 'una scrittura forse già eseguita non si rimanda')
})

test('CL-06: chiudi con la sessione — le richieste in volo falliscono, stdin si chiude, e il processo esce', async () => {
    const { spawnFn, nati } = processoFinto(() => {})
    const casa = creaCasaLinux({ distro: 'Ubuntu', ...binari, spawnFn })
    const appesa = casa.chiama('cerca', {})
    casa.chiudi()
    await assert.rejects(appesa, { code: 'CASA_LINUX_CHIUSA' })
    assert.equal(nati[0].chiusoStdin, true)
    assert.equal(casa.accesa, false)
    casa.chiudi()
})

test('CL-07: righe che non sono del protocollo (e risposte a richieste ignote) non rompono il canale', async () => {
    const { spawnFn } = processoFinto((m, p) => { p.stdout.write('rumore\n'); p.rispondi({ id: 999, ok: true, valore: 'di nessuno' }); p.rispondi({ id: m.id, ok: true, valore: 'mia' }) })
    assert.equal(await creaCasaLinux({ distro: 'Ubuntu', ...binari, spawnFn }).chiama('ping'), 'mia')
})

test('CL-08: i percorsi di Windows in WSL — solo dischi', () => {
    assert.equal(percorsoWindowsInWsl('C:\\Users\\x\\node'), '/mnt/c/Users/x/node')
    assert.equal(percorsoWindowsInWsl('d:/a/b/'), '/mnt/d/a/b')
    assert.throws(() => percorsoWindowsInWsl('\\\\server\\share\\x'), /CASA_LINUX_PERCORSO/)
    assert.throws(() => percorsoWindowsInWsl('/mnt/c/x'), /CASA_LINUX_PERCORSO/)
})

test('CL-09: i binari dichiarati — versioni uguali al lato Windows, impronte fissate, mai senza', async () => {
    const node = BINARI_CASA_LINUX.find((b) => b.nome === 'node')
    const rg = BINARI_CASA_LINUX.find((b) => b.nome === 'rg')
    assert.equal(node.versione, '24.18.0')
    assert.match(node.sha256, /^[0-9a-f]{64}$/)
    assert.match(rg.sha512, /^[A-Za-z0-9+/]{86}==$/)
    const { readFileSync } = await import('node:fs')
    assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).dependencies['@vscode/ripgrep'], '1.18.0', 'rg per Linux e per Windows dalla stessa versione')
    const assente = await verificaCasaLinux('C:\\non\\esiste\\casa')
    assert.equal(assente.pronta, false)
    assert.match(assente.motivo, /manca manifesto\.json/)
})

test('CL-11: l ambiente si DICHIARA — senza, la casa non parte; con, arriva a wsl.exe così com è', async () => {
    const { node, rg } = binari
    assert.throws(() => creaCasaLinux({ distro: 'Ubuntu', node, rg }), /CASA_LINUX_ENV/)
    let opzioni
    const { spawnFn, nati } = processoFinto((m, p) => p.rispondi({ id: m.id, ok: true, valore: 1 }))
    await creaCasaLinux({ distro: 'Ubuntu', ...binari, spawnFn: (a, b, o) => { opzioni = o; return spawnFn(a, b) } }).chiama('ping')
    assert.deepEqual(opzioni.env, binari.env)
    assert.equal(nati.length, 1)
})

/* ── WSL vero ───────────────────────────────────────────────────────────────────────────────────────────────── */

const binariVeri = process.platform === 'win32' ? await verificaCasaLinux() : { pronta: false, motivo: 'non è Windows' }
const wsl = process.platform === 'win32' ? spawnSync('wsl.exe', ['--exec', 'sh', '-c', 'echo ok'], { encoding: 'utf8', timeout: 15_000, windowsHide: true }) : null
const vero = { skip: !binariVeri.pronta ? `casa Linux non preparata: ${binariVeri.motivo} (npm run prepara:casa-linux)` : wsl?.status === 0 ? false : 'WSL non disponibile' }

test('CL-10 (WSL vero): il Node per Linux di TALOS esegue il kernel vero — leggi, scrivi, elenca, cerca con l rg per Linux, errori, Stop', vero, async (t) => {
    const casa = creaCasaLinux({ distro: 'Ubuntu', node: binariVeri.node, rg: binariVeri.rg, env: ambienteSenzaCredenziali() })
    const radice = `/tmp/talos-cl10-${process.pid}`
    t.after(() => { casa.chiudi(); spawnSync('wsl.exe', ['--exec', 'rm', '-rf', '--', radice], { windowsHide: true }) })
    assert.equal(casa.pronta, false, 'prima della prima chiamata nessun processo')
    const ping = await casa.chiama('ping')
    assert.equal(ping.node, 'v24.18.0')
    assert.equal(casa.pronta, true, 'il servente vero si annuncia prima di rispondere')
    await casa.chiama('discoScrivi', { radice, percorso: 'vero.txt', testo: 'ago nel pagliaio\n', modalita: 'nuovo' })
    wslDiPreparazione(['--exec', 'ln', '-s', 'vero.txt', `${radice}/link.txt`])
    const letto = await casa.chiama('leggiTestoLimitato', { cartella: radice, percorso: 'link.txt' })
    assert.equal(letto.testo, 'ago nel pagliaio\n', 'nella casa Linux il collegamento si segue davvero')
    assert.match(await casa.chiama('elenca', { radice, base: '' }), /link\.txt[\s\S]*vero\.txt/)
    assert.match(await casa.chiama('cerca', { radice, argomenti: { testo: 'pagliaio' } }), /vero\.txt:1:ago nel pagliaio/)
    await assert.rejects(casa.chiama('discoLeggi', { radice, percorso: 'manca.txt' }), { code: 'ENOENT' })
    const stop = new AbortController()
    const lenta = casa.chiama('cerca', { radice: '/usr', argomenti: { testo: 'zzzz-non-ce-sicuro' } }, { segnale: stop.signal })
    setTimeout(() => stop.abort(), 30)
    await assert.rejects(lenta, { name: 'AbortError' })
    assert.equal((await casa.chiama('ping')).pid, ping.pid, 'lo stesso processo dopo lo Stop')
})
