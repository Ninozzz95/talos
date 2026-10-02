import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { verifyNpuUnmodified, readZipEntries } from './verify-npu-unmodified.mjs'

/** Uno zip minimo e vero (deflate), come lo scrive AGP con useLegacyPackaging. */
function zip(entries) {
    const locali = []
    const centrali = []
    let offset = 0
    for (const [nome, dati] of entries) {
        const compressi = deflateRawSync(dati)
        const n = Buffer.from(nome)
        const locale = Buffer.alloc(30)
        locale.writeUInt32LE(0x04034b50, 0); locale.writeUInt16LE(20, 4); locale.writeUInt16LE(8, 8)
        locale.writeUInt32LE(compressi.length, 18); locale.writeUInt32LE(dati.length, 22)
        locale.writeUInt16LE(n.length, 26)
        const centrale = Buffer.alloc(46)
        centrale.writeUInt32LE(0x02014b50, 0); centrale.writeUInt16LE(20, 6); centrale.writeUInt16LE(8, 10)
        centrale.writeUInt32LE(compressi.length, 20); centrale.writeUInt32LE(dati.length, 24)
        centrale.writeUInt16LE(n.length, 28); centrale.writeUInt32LE(offset, 42)
        locali.push(locale, n, compressi)
        centrali.push(centrale, n)
        offset += 30 + n.length + compressi.length
    }
    const cd = Buffer.concat(centrali)
    const fine = Buffer.alloc(22)
    fine.writeUInt32LE(0x06054b50, 0); fine.writeUInt16LE(entries.length, 8); fine.writeUInt16LE(entries.length, 10)
    fine.writeUInt32LE(cd.length, 12); fine.writeUInt32LE(offset, 16)
    return Buffer.concat([...locali, cd, fine])
}

const FILE = {
    'libggml-hexagon.so': Buffer.from('lato ARM'),
    'libggml-htp-v73.so': Buffer.from('skel v73'),
    'libggml-htp-v75.so': Buffer.from('skel v75'),
    'libggml-htp-v79.so': Buffer.from('skel v79'),
    'libggml-htp-v81.so': Buffer.from('skel v81'),
}

function scenario(nell_apk) {
    const dir = mkdtempSync(path.join(tmpdir(), 'npu-'))
    const origine = path.join(dir, 'origine')
    mkdirSync(origine)
    for (const [nome, dati] of Object.entries(FILE)) writeFileSync(path.join(origine, nome), dati)
    const apk = path.join(dir, 'app.apk')
    writeFileSync(apk, zip(nell_apk))
    return { apk, origine }
}

const IDENTICI = Object.entries(FILE).map(([nome, dati]) => [
    `lib/arm64-v8a/${nome === 'libggml-hexagon.so' ? 'libtalos-npu-hexagon.so' : nome}`, dati,
])

describe('verify-npu-unmodified — PKLA Qualcomm 3.9: i file NPU escono come li ha fatti l\'SDK', () => {
    it('NPU-V-01 il lettore zip legge una voce compressa', () => {
        const { apk } = scenario(IDENTICI)
        const voci = readZipEntries(apk)
        assert.deepEqual(voci.get('lib/arm64-v8a/libggml-htp-v79.so'), FILE['libggml-htp-v79.so'])
    })

    it('NPU-V-02 identici (col modulo ARM rinominato): PASS', () => {
        const { apk, origine } = scenario(IDENTICI)
        assert.equal(verifyNpuUnmodified(apk, origine).verdict, 'PASS')
    })

    it('NPU-V-03 uno skel accorciato (strip): FAIL, e lo nomina', () => {
        const strippato = IDENTICI.map(([n, d]) => [n, n.endsWith('v79.so') ? d.subarray(0, 4) : d])
        const { apk, origine } = scenario(strippato)
        const esito = verifyNpuUnmodified(apk, origine)
        assert.equal(esito.verdict, 'FAIL')
        assert.match(esito.issues.join('\n'), /libggml-htp-v79\.so/)
    })

    it('NPU-V-04 il modulo col VECCHIO nome (caricato senza consenso): FAIL', () => {
        const vecchio = IDENTICI.map(([n, d]) => [n.replace('libtalos-npu-hexagon.so', 'libggml-hexagon.so'), d])
        const { apk, origine } = scenario(vecchio)
        const esito = verifyNpuUnmodified(apk, origine)
        assert.equal(esito.verdict, 'FAIL')
        assert.match(esito.issues.join('\n'), /libggml-hexagon\.so/)
    })
})
