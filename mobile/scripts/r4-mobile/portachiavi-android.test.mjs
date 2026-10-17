import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { SCHEMA_PORTACHIAVI, VAR_CHIAVE, VAR_FILE, VAR_ORIGINE, creaPortachiavi as creaVero } from './portachiavi-android.mjs'

/**
 * ⛔ K2-C (ledger `LEDGER-K2C-PORTACHIAVI-ANDROID-2026-10-14.md`; owner 14/10 «Modulo nostro»): il portachiavi che r4 carica con
 * `TALOS_HARNESS_UI_KEYRING=modulo:<percorso>` sul telefono. Chiavi in un file cifrato AES-256-GCM nella cartella privata; la
 * chiave di cifratura arriva dall'app all'avvio e non resta nell'ambiente.
 */

function cartella(t) {
    const c = mkdtempSync(join(tmpdir(), 'talos-portachiavi-'))
    t.after(() => rmSync(c, { recursive: true, force: true }))
    return c
}

/*
 * Owner 14/10 «Dallo stdin»: la chiave dati NON passa dall'ambiente (resterebbe in /proc/<pid>/environ, leggibile dai comandi
 * del Codice che girano con lo stesso utente — misurato sul Pad). L'app la scrive nello stdin del server e lo chiude; qui
 * `leggiChiave` sostituisce lo stdin, e PORTA-07 prova lo stdin vero in un processo figlio.
 */
const ambiente = (file) => ({ [VAR_FILE]: file, [VAR_ORIGINE]: 'stdin', ALTRO: 'resta' })
const creaPortachiavi = ({ env }, chiave) => creaVero({ env }, { leggiChiave: () => `${chiave.toString('base64')}
` })
const codice = (atteso) => (errore) => errore?.code === atteso

describe('portachiavi Android per r4 (K2-C)', () => {
    it('PORTA-01 ciò che si scrive si rilegge da un’istanza nuova, e il file non lo contiene in chiaro', (t) => {
        const file = join(cartella(t), 'portachiavi.json')
        const chiave = randomBytes(32)
        const p = creaPortachiavi({ env: ambiente(file) }, chiave)
        p.set('talos-harness-ui-provider-openrouter', 'pool', 'sk-or-v1-segretissima')
        p.set('talos-harness-ui-chatgpt', 'sessione', '{"token":"abc"}')
        const di = creaPortachiavi({ env: ambiente(file) }, chiave)
        assert.equal(di.get('talos-harness-ui-provider-openrouter', 'pool'), 'sk-or-v1-segretissima')
        assert.equal(di.get('talos-harness-ui-chatgpt', 'sessione'), '{"token":"abc"}')
        const grezzo = readFileSync(file, 'utf8')
        assert.doesNotMatch(grezzo, /segretissima|openrouter|chatgpt|token/u)
        assert.equal(JSON.parse(grezzo).schema, SCHEMA_PORTACHIAVI)
    })

    it('PORTA-02 get di ciò che non c’è è null; remove toglie, ed è idempotente senza scrivere', (t) => {
        const file = join(cartella(t), 'portachiavi.json')
        const chiave = randomBytes(32)
        const p = creaPortachiavi({ env: ambiente(file) }, chiave)
        assert.equal(p.get('s', 'a'), null)
        p.remove('s', 'a')
        assert.equal(existsSync(file), false, 'togliere ciò che non c’è non scrive')
        p.set('s', 'a', 'v')
        p.remove('s', 'a')
        assert.equal(p.get('s', 'a'), null)
        assert.equal(creaPortachiavi({ env: ambiente(file) }, chiave).get('s', 'a'), null)
        const prima = statSync(file).mtimeMs
        const contenuto = readFileSync(file)
        p.remove('s', 'a')
        assert.deepEqual(readFileSync(file), contenuto)
        assert.equal(statSync(file).mtimeMs, prima)
    })

    it('PORTA-03 chiave sbagliata, byte cambiato o schema diverso: illeggibile, e il file resta com’era', (t) => {
        const file = join(cartella(t), 'portachiavi.json')
        const chiave = randomBytes(32)
        creaPortachiavi({ env: ambiente(file) }, chiave).set('s', 'a', 'v')
        const originale = readFileSync(file)
        assert.throws(() => creaPortachiavi({ env: ambiente(file) }, randomBytes(32)), codice('PORTACHIAVI_ILLEGGIBILE'))
        const busta = JSON.parse(originale)
        const dati = Buffer.from(busta.dati, 'base64'); dati[0] ^= 1
        writeFileSync(file, JSON.stringify({ ...busta, dati: dati.toString('base64') }))
        assert.throws(() => creaPortachiavi({ env: ambiente(file) }, chiave), codice('PORTACHIAVI_ILLEGGIBILE'))
        writeFileSync(file, JSON.stringify({ ...busta, schema: 'altro.v1' }))
        assert.throws(() => creaPortachiavi({ env: ambiente(file) }, chiave), codice('PORTACHIAVI_ILLEGGIBILE'))
        writeFileSync(file, 'non json')
        assert.throws(() => creaPortachiavi({ env: ambiente(file) }, chiave), codice('PORTACHIAVI_ILLEGGIBILE'))
        writeFileSync(file, originale)
        assert.equal(creaPortachiavi({ env: ambiente(file) }, chiave).get('s', 'a'), 'v')
    })

    it('PORTA-04 configurazione sbagliata è un errore; una chiave messa nell’ambiente è rifiutata', (t) => {
        const c = cartella(t)
        const chiave = randomBytes(32)
        const p = join(c, 'p.json')
        assert.throws(() => creaPortachiavi({ env: ambiente('relativo/portachiavi.json') }, chiave), codice('PORTACHIAVI_CONFIG'))
        assert.throws(() => creaPortachiavi({ env: { [VAR_FILE]: p } }, chiave), codice('PORTACHIAVI_CONFIG'), 'senza origine della chiave')
        assert.throws(() => creaPortachiavi({ env: { [VAR_FILE]: p, [VAR_ORIGINE]: 'ambiente' } }, chiave), codice('PORTACHIAVI_CONFIG'))
        assert.throws(() => creaPortachiavi({ env: ambiente(p) }, randomBytes(16)), codice('PORTACHIAVI_CONFIG'))
        assert.throws(() => creaVero({ env: ambiente(p) }, { leggiChiave: () => 'non è base64 di 32 byte' }), codice('PORTACHIAVI_CONFIG'))
        assert.throws(() => creaVero({ env: ambiente(p) }, { leggiChiave: () => '' }), codice('PORTACHIAVI_CONFIG'), 'stdin vuoto')
        // ⛔ la chiave nell'ambiente resterebbe in /proc/<pid>/environ: se c'è, il portachiavi non parte
        const conChiave = { ...ambiente(p), [VAR_CHIAVE]: chiave.toString('base64') }
        assert.throws(() => creaPortachiavi({ env: conChiave }, chiave), codice('PORTACHIAVI_CONFIG'))
        const env = ambiente(p)
        creaPortachiavi({ env }, chiave)
        assert.deepEqual(env, ambiente(p), 'l’ambiente non si tocca')
    })

    it('PORTA-05 ogni scrittura usa un IV nuovo: lo stesso contenuto dà buste diverse', (t) => {
        const file = join(cartella(t), 'portachiavi.json')
        const p = creaPortachiavi({ env: ambiente(file) }, randomBytes(32))
        p.set('s', 'a', 'v')
        const prima = JSON.parse(readFileSync(file, 'utf8'))
        p.set('s', 'a', 'v')
        const dopo = JSON.parse(readFileSync(file, 'utf8'))
        assert.notEqual(prima.iv, dopo.iv)
        assert.notEqual(prima.dati, dopo.dati)
        assert.equal(Buffer.from(dopo.iv, 'base64').length, 12)
        assert.equal(Buffer.from(dopo.tag, 'base64').length, 16)
    })

    it('PORTA-06 nomi e valori devono essere stringhe', (t) => {
        const p = creaPortachiavi({ env: ambiente(join(cartella(t), 'p.json')) }, randomBytes(32))
        assert.throws(() => p.set('s', 'a', 7), codice('PORTACHIAVI_VOCE'))
        assert.throws(() => p.set(null, 'a', 'v'), codice('PORTACHIAVI_VOCE'))
        assert.throws(() => p.get('s', undefined), codice('PORTACHIAVI_VOCE'))
        assert.throws(() => p.remove(1, 'a'), codice('PORTACHIAVI_VOCE'))
        // nomi che toccherebbero il prototipo degli oggetti: rifiutati, mai scritti
        for (const nome of ['__proto__', 'constructor', 'prototype']) {
            assert.throws(() => p.set(nome, 'a', 'v'), codice('PORTACHIAVI_VOCE'), nome)
            assert.throws(() => p.set('s', nome, 'v'), codice('PORTACHIAVI_VOCE'), nome)
        }
        assert.equal(({}).a, undefined)
    })

    /*
     * PORTA-08 (Nino1, 14/10: forma confermata). Con `TALOS_HARNESS_UI_SEGRETI_DA=stdin` lo stdin lo legge r4, una volta, e passa
     * al portachiavi `creaPortachiavi({ env, segreti })`, con `segreti` congelato e senza il token. La chiave dati arriva da lì;
     * lo stdin non va più letto (sarebbe già a EOF). Due fonti insieme sono un errore.
     */
    it('PORTA-08 la chiave dati dai segreti che r4 ha letto dallo stdin; mai due fonti', (t) => {
        const file = join(cartella(t), 'portachiavi.json')
        const chiave = randomBytes(32)
        const segreti = Object.freeze({ [VAR_CHIAVE]: chiave.toString('base64'), ALTRO_SEGRETO: 'x' })
        const stdinVietato = { leggiChiave: () => { throw new Error('lo stdin non va letto quando i segreti ci sono') } }
        const p = creaVero({ env: { [VAR_FILE]: file }, segreti }, stdinVietato)
        p.set('s', 'a', 'dai segreti')
        assert.equal(creaPortachiavi({ env: ambiente(file) }, chiave).get('s', 'a'), 'dai segreti')
        assert.throws(() => creaVero({ env: ambiente(file), segreti }, stdinVietato), codice('PORTACHIAVI_CONFIG'), 'due fonti')
        assert.throws(() => creaVero({ env: { [VAR_FILE]: file }, segreti: Object.freeze({ [VAR_CHIAVE]: 'corta' }) }, stdinVietato), codice('PORTACHIAVI_CONFIG'))
        // segreti vuoti (r4 senza SEGRETI_DA) e nessuna origine: non parte
        assert.throws(() => creaVero({ env: { [VAR_FILE]: file }, segreti: Object.freeze({}) }, stdinVietato), codice('PORTACHIAVI_CONFIG'))
    })

    it('PORTA-07 lo stdin vero: in un processo figlio la chiave arriva dallo stdin e non compare nell’ambiente', (t) => {
        const file = join(cartella(t), 'portachiavi.json')
        const chiave = randomBytes(32)
        const modulo = new URL('./portachiavi-android.mjs', import.meta.url).href
        const sonda = `
            const { creaPortachiavi } = await import(${JSON.stringify(modulo)})
            const p = creaPortachiavi({ env: process.env })
            p.set('s', 'a', 'dallo-stdin')
            const k = ${JSON.stringify(chiave.toString('base64'))}
            console.log(JSON.stringify({ letto: p.get('s', 'a'), nellAmbiente: Object.entries(process.env).filter(([, v]) => v.includes(k)).map(([n]) => n) }))`
        const env = { ...process.env, [VAR_FILE]: file, [VAR_ORIGINE]: 'stdin' }
        delete env[VAR_CHIAVE]
        const r = spawnSync(process.execPath, ['--input-type=module', '-e', sonda], { env, input: `${chiave.toString('base64')}\n`, encoding: 'utf8' })
        assert.equal(r.status, 0, r.stderr)
        assert.deepEqual(JSON.parse(r.stdout), { letto: 'dallo-stdin', nellAmbiente: [] })
        assert.equal(creaPortachiavi({ env: ambiente(file) }, chiave).get('s', 'a'), 'dallo-stdin')
        // stdin chiuso e vuoto: non parte (mai un portachiavi con una chiave a caso)
        const vuoto = spawnSync(process.execPath, ['--input-type=module', '-e', sonda], { env, input: '', encoding: 'utf8' })
        assert.notEqual(vuoto.status, 0)
        assert.match(vuoto.stderr, /PORTACHIAVI_CONFIG/u)
    })
})
