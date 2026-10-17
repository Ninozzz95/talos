/**
 * ⛔ K2-A — Node autosufficiente fra le librerie native (ledger `LEDGER-K2A-NODE-AUTOSUFFICIENTE-2026-10-14.md`).
 *
 * Il linker di Android cerca le dipendenze in `DT_RUNPATH`, con `${ORIGIN}` = la cartella del file, dall'API 24 (AOSP
 * `bionic/android-changes-for-ndk-developers.md`); `DT_RPATH` lo ignora. Qui si legge la sezione dinamica dei file ritoccati per
 * provare che ognuno cerca accanto a sé e dipende solo da librerie nostre o di sistema: niente più `LD_LIBRARY_PATH`, che r4
 * toglie ai processi figli.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Le librerie che Android dà a ogni processo (NDK «stable APIs»): le uniche dipendenze ammesse oltre alle nostre. */
export const LIBRERIE_DI_SISTEMA = Object.freeze(['libc.so', 'libm.so', 'libdl.so', 'liblog.so'])

const PT_LOAD = 1, PT_DYNAMIC = 2
const DT_NULL = 0n, DT_NEEDED = 1n, DT_STRTAB = 5n, DT_STRSZ = 10n, DT_SONAME = 14n, DT_RPATH = 15n, DT_RUNPATH = 29n

/** La sezione dinamica di un ELF64 little-endian: `{ runpath, rpath, needed, soname }` (`null` dove la voce manca). */
export function leggiSezioneDinamica(byte) {
    if (byte.length < 64 || byte.toString('latin1', 0, 4) !== '\x7fELF') throw new Error('non è un file ELF')
    if (byte[4] !== 2 || byte[5] !== 1) throw new Error('solo ELF a 64 bit little-endian')
    const phoff = Number(byte.readBigUInt64LE(32))
    const phentsize = byte.readUInt16LE(54)
    const phnum = byte.readUInt16LE(56)
    const carichi = []
    let dinamica = null
    for (let i = 0; i < phnum; i++) {
        const o = phoff + i * phentsize
        const tipo = byte.readUInt32LE(o)
        const segmento = { offset: Number(byte.readBigUInt64LE(o + 8)), vaddr: Number(byte.readBigUInt64LE(o + 16)), dimensione: Number(byte.readBigUInt64LE(o + 32)) }
        if (tipo === PT_LOAD) carichi.push(segmento)
        else if (tipo === PT_DYNAMIC) dinamica = segmento
    }
    if (!dinamica) throw new Error('ELF senza sezione dinamica')
    const voci = []
    let strtab = null
    for (let o = dinamica.offset; o + 16 <= dinamica.offset + dinamica.dimensione; o += 16) {
        const tag = byte.readBigUInt64LE(o)
        if (tag === DT_NULL) break
        const valore = byte.readBigUInt64LE(o + 8)
        if (tag === DT_STRTAB) strtab = Number(valore)
        else if (tag !== DT_STRSZ) voci.push([tag, Number(valore)])
    }
    if (strtab === null) throw new Error('ELF senza tabella delle stringhe dinamiche')
    const carico = carichi.find((c) => strtab >= c.vaddr && strtab < c.vaddr + c.dimensione)
    if (!carico) throw new Error('la tabella delle stringhe non sta in nessun segmento')
    const base = strtab - carico.vaddr + carico.offset
    const stringa = (p) => { const inizio = base + p; return byte.toString('utf8', inizio, byte.indexOf(0, inizio)) }
    const esito = { runpath: null, rpath: null, needed: [], soname: null }
    for (const [tag, valore] of voci) {
        if (tag === DT_NEEDED) esito.needed.push(stringa(valore))
        else if (tag === DT_RUNPATH) esito.runpath = stringa(valore)
        else if (tag === DT_RPATH) esito.rpath = stringa(valore)
        else if (tag === DT_SONAME) esito.soname = stringa(valore)
    }
    return esito
}

/** Tutti i file del manifesto fra le librerie native: sha «dopo», RUNPATH, niente RPATH, dipendenze ammesse. */
export function verificaNodeNativo(cartellaJniLibs, manifesto) {
    const problemi = []
    const nostri = new Set(manifesto.file.map((f) => f.nuovo))
    for (const f of manifesto.file) {
        const percorso = join(cartellaJniLibs, f.nuovo)
        if (!existsSync(percorso)) { problemi.push(`${f.nuovo}: manca`); continue }
        const byte = readFileSync(percorso)
        if (createHash('sha256').update(byte).digest('hex') !== f.sha256Dopo) problemi.push(`${f.nuovo}: sha256 diverso dal manifesto`)
        let d
        try { d = leggiSezioneDinamica(byte) } catch (errore) { problemi.push(`${f.nuovo}: ${errore.message}`); continue }
        if (d.runpath !== manifesto.runpath) problemi.push(`${f.nuovo}: RUNPATH ${d.runpath} invece di ${manifesto.runpath}`)
        if (d.rpath !== null) problemi.push(`${f.nuovo}: ha un RPATH (${d.rpath}), che il linker di Android ignora`)
        for (const n of d.needed) {
            if (!nostri.has(n) && !LIBRERIE_DI_SISTEMA.includes(n)) problemi.push(`${f.nuovo}: dipende da ${n}, né nostra né di sistema`)
        }
        if (f.nuovo !== 'libtalosnode.so' && d.soname !== f.nuovo) problemi.push(`${f.nuovo}: SONAME ${d.soname}`)
    }
    return { ok: problemi.length === 0, problemi }
}
