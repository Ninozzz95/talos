import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIBRERIE_DI_SISTEMA, leggiSezioneDinamica, verificaNodeNativo } from './node-nativo.mjs'

/**
 * ⛔ K2-A (ledger `LEDGER-K2A-NODE-AUTOSUFFICIENTE-2026-10-14.md`; owner 14/10 «Ritocco al build» e «Una copia sola»): Node e le
 * sue 9 librerie stanno SOLO fra le librerie native, ognuna con `DT_RUNPATH=$ORIGIN` e nomi `libtalos*.so`. Così un `node` figlio
 * parte anche quando r4 gli toglie `LD_LIBRARY_PATH` (K0: 18 prove rosse, `CANNOT LINK EXECUTABLE … libz.so.1`).
 */

const QUI = dirname(fileURLToPath(import.meta.url))
const MOBILE = resolve(QUI, '..', '..')
const JNILIBS = join(MOBILE, 'android', 'app', 'src', 'main', 'jniLibs', 'arm64-v8a')
const ASSET = join(MOBILE, 'android', 'app', 'src', 'main', 'assets', 'talos-node-lib')
const manifesto = JSON.parse(readFileSync(join(QUI, 'node-nativo.json'), 'utf8'))

/** Un ELF64 little-endian minimo: un PT_LOAD che copre tutto e un PT_DYNAMIC con le voci date. */
function elfDiProva({ runpath, rpath, needed = [], soname }) {
    const stringhe = ['']
    const posizione = (testo) => { const p = Buffer.byteLength(stringhe.join('\0') + '\0'); stringhe.push(testo); return p }
    const voci = []
    for (const n of needed) voci.push([1, posizione(n)])
    if (soname) voci.push([14, posizione(soname)])
    if (rpath) voci.push([15, posizione(rpath)])
    if (runpath) voci.push([29, posizione(runpath)])
    const tabella = Buffer.from(stringhe.join('\0') + '\0')
    const VADDR = 0x400000
    const intestazione = 64, programmi = 56 * 2
    const inizioStringhe = intestazione + programmi
    const inizioDinamica = inizioStringhe + tabella.length + ((8 - (tabella.length % 8)) % 8)
    voci.push([5, VADDR + inizioStringhe], [10, tabella.length], [0, 0])
    const totale = inizioDinamica + voci.length * 16
    const b = Buffer.alloc(totale)
    b.write('\x7fELF', 0, 'latin1'); b[4] = 2; b[5] = 1; b[6] = 1
    b.writeUInt16LE(3, 16); b.writeUInt16LE(183, 18); b.writeUInt32LE(1, 20)
    b.writeBigUInt64LE(64n, 32); b.writeUInt16LE(64, 52); b.writeUInt16LE(56, 54); b.writeUInt16LE(2, 56)
    const programma = (i, tipo, offset, vaddr, dimensione) => {
        const o = intestazione + i * 56
        b.writeUInt32LE(tipo, o); b.writeBigUInt64LE(BigInt(offset), o + 8); b.writeBigUInt64LE(BigInt(vaddr), o + 16)
        b.writeBigUInt64LE(BigInt(vaddr), o + 24); b.writeBigUInt64LE(BigInt(dimensione), o + 32); b.writeBigUInt64LE(BigInt(dimensione), o + 40)
    }
    programma(0, 1, 0, VADDR, totale)
    programma(1, 2, inizioDinamica, VADDR + inizioDinamica, voci.length * 16)
    tabella.copy(b, inizioStringhe)
    voci.forEach(([tag, valore], i) => { b.writeBigUInt64LE(BigInt(tag), inizioDinamica + i * 16); b.writeBigUInt64LE(BigInt(valore), inizioDinamica + i * 16 + 8) })
    return b
}

describe('Node autosufficiente fra le librerie native (K2-A)', () => {
    it('NODE-NAT-05 leggiSezioneDinamica legge RUNPATH, RPATH, NEEDED e SONAME di un ELF64', () => {
        const letto = leggiSezioneDinamica(elfDiProva({ runpath: '$ORIGIN', needed: ['libtalosz.so', 'libc.so'], soname: 'libtalosssl.so' }))
        assert.deepEqual(letto, { runpath: '$ORIGIN', rpath: null, needed: ['libtalosz.so', 'libc.so'], soname: 'libtalosssl.so' })
        assert.equal(leggiSezioneDinamica(elfDiProva({ rpath: '/data/data/com.termux/files/usr/lib' })).rpath, '/data/data/com.termux/files/usr/lib')
        assert.throws(() => leggiSezioneDinamica(Buffer.from('non un elf')), /ELF/u)
    })

    it('NODE-NAT-01 i 10 file stanno fra le librerie native con gli sha256 «dopo» del manifesto', () => {
        assert.equal(manifesto.file.length, 10)
        for (const f of manifesto.file) {
            const percorso = join(JNILIBS, f.nuovo)
            assert.ok(existsSync(percorso), `manca ${f.nuovo}`)
            assert.equal(createHash('sha256').update(readFileSync(percorso)).digest('hex'), f.sha256Dopo, f.nuovo)
        }
    })

    it('NODE-NAT-02 e 03 RUNPATH=$ORIGIN, nessun RPATH, dipendenze solo nostre o di sistema', () => {
        const esito = verificaNodeNativo(JNILIBS, manifesto)
        assert.deepEqual(esito.problemi, [])
        assert.equal(esito.ok, true)
        assert.ok(LIBRERIE_DI_SISTEMA.includes('libc.so'))
    })

    it('NODE-NAT-04 negli asset non resta né Node né le sue librerie: solo talos-exec.js', () => {
        assert.deepEqual(readdirSync(ASSET).sort(), ['talos-exec.js'])
    })
})
