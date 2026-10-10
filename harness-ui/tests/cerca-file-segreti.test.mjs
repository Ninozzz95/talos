/*
 * ⛔⛔⛔ F-S-001 (stress test della CLI rc.2, 08/10/2026; riprodotto sul desktop dfab19d54 da talos desktop) — la RICERCA nei
 * file restituiva al modello il contenuto di `.env` e delle chiavi private senza chiedere, mentre `leggi` e la shell chiedono.
 * Misurato prima della cura: `cerca {"testo": canarino}` → `.env:1:API_KEY=sk-test-…`, `id_ed25519:2:…`.
 * Owner: «la risposta è sempre quella di Hermes, Claude e Codex». Hermes (clone 65ad529) `tools/file_tools.py:234`
 * `_filter_read_blocked_search_results`, applicata in `search_tool` (`:1099`) a righe, NOMI e conteggi, più la frase
 * «N result(s) omitted because they target … secret-bearing environment files» (`:1107-1110`).
 * Le prove girano sulle TRE strade (contenuto con ripgrep, nomi con ripgrep, camminata JS) e su `continua`, nei due versi.
 */
import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cercaNelProgetto } from '../src/kernel/talosHarness.mjs'
import { creaRegistroRicerche } from '../src/kernel/ricerche-in-corso.mjs'
import { eUnFileSegreto, motivoDaChiedere } from '../src/path-policy.mjs'
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const childProcess = createRequire(import.meta.url)('node:child_process')
const C = 'CANARINOFS001'
/* Owner 09/10/2026 («Insieme stretto»), stress test 0.5.0: `secrets.json` era visibile alla ricerca; ora con i suoi pari stretti. */
const SEGRETI = ['.env', '.env.local', 'config/.env', 'id_ed25519', 'deploy/key.pem', '.envrc', '.ssh/config', 'Prod.ENV',
    'config/secrets.json', 'secrets.yaml', 'secrets.yml', 'secrets.toml', '.secrets', 'credentials.json', 'keys/gcp-service-account-prod.json', 'service_account.json']
const PUBBLICI = ['normale.txt', 'src/app.js', '.env.example', 'id_ed25519.pub', 'secret_manager.py', 'secrets.example.json', 'secrets.json.example']

function progetto(t) {
    const radice = mkdtempSync(join(tmpdir(), 'talos-cerca-segreti-'))
    t.after(() => rimuoviCartellaDiProva(radice))
    for (const p of [...SEGRETI, ...PUBBLICI]) {
        mkdirSync(join(radice, ...p.split('/').slice(0, -1)), { recursive: true })
        writeFileSync(join(radice, ...p.split('/')), `riga ${C} di ${p}\n`)
    }
    const disco = {
        async elenca(dentro = '') {
            const { readdir, stat } = await import('node:fs/promises')
            const voci = await readdir(dentro ? join(radice, dentro) : radice, { withFileTypes: true })
            return Promise.all(voci.map(async (v) => ({ nome: v.name, cartella: v.isDirectory(), byte: v.isDirectory() ? 0 : (await stat(join(radice, dentro, v.name))).size })))
        },
        async leggi(percorso) { const { readFile } = await import('node:fs/promises'); return readFile(join(radice, ...percorso.split('/')), 'utf8') },
    }
    return { radice, disco }
}
async function soloJs(corpo) {
    const prima = process.env.TALOS_RG_PATH
    process.env.TALOS_RG_PATH = join(tmpdir(), 'rg-inesistente-per-fs001.exe')
    try { return await corpo() } finally { if (prima === undefined) delete process.env.TALOS_RG_PATH; else process.env.TALOS_RG_PATH = prima }
}
const NOTA = /\[TALOS: (\d+) file\(s\) omitted because they hold secrets .*`leggi` opens one only after asking the person\.\]/u
function nessunSegretoNellUscita(esito) {
    for (const p of SEGRETI) {
        // a fine riga: «di .env» è anche l'inizio di «di .env.example», che è pubblico e deve restare
        assert.ok(!esito.split('\n').some((r) => r.endsWith(`di ${p}`)), `il contenuto di ${p} non esce:\n${esito}`)
        assert.ok(!esito.split('\n').some((r) => r === p || r.startsWith(`${p}:`)), `nemmeno il nome di ${p}:\n${esito}`)
    }
}

for (const [strada, avvolgi] of [['ripgrep', (f) => f()], ['camminata JS', soloJs]]) {
    test(`CS-01 (${strada}): una ricerca per CONTENUTO non mostra righe né nomi dei file segreti, e dice quanti ne ha tolti`, async (t) => {
        const { radice, disco } = progetto(t)
        const esito = await avvolgi(() => cercaNelProgetto(disco, { testo: C }, { radice }))
        nessunSegretoNellUscita(esito)
        for (const p of PUBBLICI) assert.ok(esito.includes(p), `il file pubblico ${p} resta:\n${esito}`)
        assert.equal(Number(NOTA.exec(esito)?.[1]), SEGRETI.length, esito)
    })

    test(`CS-02 (${strada}): una ricerca per NOME non mostra i file segreti (come Hermes), le esenzioni restano`, async (t) => {
        const { radice, disco } = progetto(t)
        const esito = await avvolgi(() => cercaNelProgetto(disco, { nome: 'env' }, { radice }))
        nessunSegretoNellUscita(esito)
        assert.ok(esito.includes('.env.example'), `.env.example è la forma pubblica e resta:\n${esito}`)
        assert.match(esito, NOTA)
    })

    test(`CS-03 (${strada}): \`dentro\` una cartella di segreti non mostra niente, e lo dice`, async (t) => {
        const { radice, disco } = progetto(t)
        const esito = await avvolgi(() => cercaNelProgetto(disco, { testo: C, dentro: '.ssh' }, { radice }))
        nessunSegretoNellUscita(esito)
        assert.equal(Number(NOTA.exec(esito)?.[1]), 1, esito)
    })

    test(`CS-04 (${strada}): AL CONTRARIO — senza file segreti l'uscita non porta nessuna nota`, async (t) => {
        const radice = mkdtempSync(join(tmpdir(), 'talos-cerca-pulito-'))
        t.after(() => rimuoviCartellaDiProva(radice))
        writeFileSync(join(radice, 'a.txt'), `uno ${C}\n`)
        const disco = { async elenca() { return [{ nome: 'a.txt', cartella: false, byte: 20 }] }, async leggi() { return `uno ${C}\n` } }
        const esito = await avvolgi(() => cercaNelProgetto(disco, { testo: C }, { radice }))
        assert.ok(esito.includes('a.txt'), esito)
        assert.doesNotMatch(esito, /omitted because they hold secrets/u)
    })
}

test('CS-05: la classe è quella di `leggi` — maiuscole, sottocartelle, chiavi, `.envrc` (come Hermes); le esenzioni no', () => {
    for (const p of SEGRETI) assert.equal(eUnFileSegreto(p), true, p)
    for (const p of PUBBLICI) assert.equal(eUnFileSegreto(p), false, p)
    // `.envrc` chiede anche a `leggi` (la lista è una sola)
    assert.notEqual(motivoDaChiedere({ tipo: 'leggi', percorso: '.envrc', cartella: tmpdir() }), null)
})

/* `continua`: la stessa pagina filtra anche una ricerca ripresa (spawn finto come in rev-ricerca-che-continua). */
test('CS-06: una ricerca che CONTINUA non mostra le righe dei file segreti arrivate dopo', async (t) => {
    const radice = await mkdtemp(join(tmpdir(), 'talos-cs-continua-'))
    await mkdir(join(radice, '.git'))
    const prima = process.env.TALOS_RG_PATH
    process.env.TALOS_RG_PATH = process.execPath
    const patch = mock.method(childProcess, 'spawn', () => {
        const figlio = new EventEmitter()
        figlio.stdout = new EventEmitter(); figlio.stderr = new EventEmitter()
        let chiuso = false
        const timer = [
            setTimeout(() => { if (!chiuso) figlio.stdout.emit('data', Buffer.from(`src/a.txt:1:pubblico ${C}\n`)) }, 10),
            setTimeout(() => { if (!chiuso) figlio.stdout.emit('data', Buffer.from(`.env:1:API_KEY=sk-test-${C}\nsecret/.ssh/id_rsa:2:${C}\n`)) }, 300),
            setTimeout(() => { chiuso = true; figlio.emit('close', 0, null) }, 500),
        ]
        figlio.kill = () => { timer.forEach(clearTimeout); queueMicrotask(() => figlio.emit('close', null, 'SIGTERM')); return true }
        return figlio
    })
    syncBuiltinESMExports()
    t.after(async () => {
        patch.mock.restore(); syncBuiltinESMExports()
        if (prima === undefined) delete process.env.TALOS_RG_PATH; else process.env.TALOS_RG_PATH = prima
        await rimuoviCartellaDiProvaAttesa(radice)
    })
    const disco = { async elenca() { return [] }, async leggi() { assert.fail('nessuna camminata JS') } }
    const ricerche = creaRegistroRicerche()
    const primo = await cercaNelProgetto(disco, { testo: C }, { radice, tempoRgMs: 120, ricerche })
    assert.match(primo, /still running as search "r1"/u)
    await new Promise((ok) => setTimeout(ok, 700))
    const ripresa = await cercaNelProgetto(disco, { continua: 'r1' }, { radice, tempoRgMs: 120, ricerche })
    assert.match(ripresa, /src\/a\.txt:1:pubblico/u)
    // a inizio riga: la nota stessa nomina «.env» come categoria, e va bene
    assert.doesNotMatch(ripresa, /sk-test|^\.env:|id_rsa/mu, ripresa)
    assert.equal(Number(NOTA.exec(ripresa)?.[1]), 2, ripresa)
})
