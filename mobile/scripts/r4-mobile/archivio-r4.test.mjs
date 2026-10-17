import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { leggiUstar, scriviUstar } from './archivio-r4.mjs'

/**
 * ⛔ K2-B, parte B2 (ledger `LEDGER-K2B-R4-NELL-APP-2026-10-14.md`; owner 14/10 «Archivio unico»): il pacchetto r4 entra
 * nell'APK come UN archivio ustar puro e deterministico, che l'app estrae con un lettore severo (`TalosR4Archivio.kt`).
 */

function scrivi(radice, percorso, testo) {
    const pieno = join(radice, ...percorso.split('/'))
    mkdirSync(join(pieno, '..'), { recursive: true })
    writeFileSync(pieno, testo)
}

function pacchetto(t) {
    const radice = mkdtempSync(join(tmpdir(), 'r4-arc-'))
    t.after(() => rmSync(radice, { recursive: true, force: true }))
    const lungo = 'harness-ui/node_modules/@ai-sdk/openai/node_modules/@ai-sdk/provider/src/speech-translation-model/v4/' +
        'speech-translation-model-v4-stream-options.ts'
    scrivi(radice, 'manifesto-pacchetto-r4.json', '{"schema":"talos.mobile.kernel-r4-pacchetto.v1"}\n')
    scrivi(radice, 'harness-ui/server.mjs', 'export const server = 1\n')
    scrivi(radice, lungo, 'x'.repeat(1300))
    scrivi(radice, 'docs/assistenza/README.md', '')
    return { radice, lungo }
}

describe('archivio ustar del pacchetto r4 (K2-B, B2)', () => {
    it('ARC-01 va e torna: nomi lunghi, contenuti, il manifesto per primo', (t) => {
        const { radice, lungo } = pacchetto(t)
        const voci = leggiUstar(scriviUstar(radice))
        const file = voci.filter((v) => v.tipo === 'file')
        assert.equal(file[0].nome, 'manifesto-pacchetto-r4.json')
        assert.deepEqual(file.map((v) => v.nome).slice(1).sort(), ['docs/assistenza/README.md', 'harness-ui/server.mjs', lungo].sort())
        assert.equal(file.find((v) => v.nome === lungo).dati.toString(), 'x'.repeat(1300))
        assert.equal(file.find((v) => v.nome === 'docs/assistenza/README.md').dati.length, 0)
        assert.ok(voci.some((v) => v.tipo === 'cartella' && v.nome === 'harness-ui/'))
    })

    it('ARC-02 intestazioni conformi: magia, checksum, dimensione ottale, blocchi da 512, due blocchi vuoti in fondo', (t) => {
        const { radice } = pacchetto(t)
        const byte = scriviUstar(radice)
        assert.equal(byte.length % 512, 0)
        assert.ok(byte.subarray(byte.length - 1024).every((b) => b === 0))
        const primo = byte.subarray(0, 512)
        assert.equal(primo.toString('latin1', 257, 263), 'ustar\0')
        assert.equal(primo.toString('latin1', 263, 265), '00')
        const dichiarato = parseInt(primo.toString('latin1', 148, 156).replace(/\0.*$/su, '').trim(), 8)
        const calcolato = [...primo].reduce((s, b, i) => s + (i >= 148 && i < 156 ? 32 : b), 0)
        assert.equal(dichiarato, calcolato)
        assert.equal(primo.toString('latin1', 156, 157), '0')
        assert.equal(parseInt(primo.toString('latin1', 124, 136), 8), Buffer.byteLength('{"schema":"talos.mobile.kernel-r4-pacchetto.v1"}\n'))
    })

    it('ARC-03 un percorso che non sta in ustar o un collegamento simbolico sono errori che li nominano', (t) => {
        const { radice } = pacchetto(t)
        scrivi(radice, `harness-ui/${'n'.repeat(120)}.js`, 'troppo lungo per il nome senza prefisso')
        assert.throws(() => scriviUstar(radice), /nnnnnnnn/u)
        rmSync(join(radice, 'harness-ui', `${'n'.repeat(120)}.js`))
        try {
            symlinkSync(join(radice, 'harness-ui', 'server.mjs'), join(radice, 'harness-ui', 'collegamento.mjs'))
        } catch {
            return // qui i collegamenti non si possono creare: la seconda metà non ha materia
        }
        assert.throws(() => scriviUstar(radice), /collegamento\.mjs/u)
    })

    it('ARC-04 la stessa cartella dà lo stesso archivio, byte per byte', (t) => {
        const { radice } = pacchetto(t)
        assert.deepEqual(scriviUstar(radice), scriviUstar(radice))
    })
})
