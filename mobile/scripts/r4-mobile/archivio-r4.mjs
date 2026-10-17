#!/usr/bin/env node
/**
 * ⛔ K2-B, parte B2 — l'archivio del pacchetto r4 per l'APK (ledger `LEDGER-K2B-R4-NELL-APP-2026-10-14.md`; owner 14/10
 * «Archivio unico»).
 *
 * ustar POSIX puro e deterministico (POSIX.1-1988, pax `ustar` senza estensioni): file in ordine, mtime 0, uid/gid 0, 0644 per
 * i file e 0755 per le cartelle, nessuna intestazione pax o GNU. Così l'app lo legge con un lettore severo che accetta solo file
 * regolari e cartelle (`TalosR4Archivio.kt`). Il pacchetto di `prepara-pacchetto-r4.mjs` ci sta per intero: percorsi ASCII,
 * il più lungo da 146 caratteri, nessun collegamento.
 *
 * Uso: node scripts/r4-mobile/archivio-r4.mjs --pacchetto <cartella> --uscita <file .tar>
 */
import { lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BLOCCO = 512
const PRIMO = 'manifesto-pacchetto-r4.json'

function elenca(radice, relativo = '') {
    const voci = []
    for (const nome of readdirSync(join(radice, relativo))) {
        const percorso = relativo ? `${relativo}/${nome}` : nome
        const stato = lstatSync(join(radice, ...percorso.split('/')))
        if (stato.isSymbolicLink()) throw new Error(`archivio-r4: ${percorso} è un collegamento simbolico: nel pacchetto non ce ne sono`)
        if (stato.isDirectory()) voci.push({ tipo: 'cartella', nome: `${percorso}/` }, ...elenca(radice, percorso))
        else if (stato.isFile()) voci.push({ tipo: 'file', nome: percorso })
        else throw new Error(`archivio-r4: ${percorso} non è né un file né una cartella`)
    }
    return voci
}

/** Divide un percorso in prefisso (≤155 byte) e nome (≤100 byte), sempre su una barra; `null` se non si può. */
function dividi(percorso) {
    if (Buffer.byteLength(percorso) <= 100) return { prefisso: '', nome: percorso }
    for (let i = percorso.length - 1; i > 0; i--) {
        if (percorso[i] !== '/') continue
        const prefisso = percorso.slice(0, i)
        const nome = percorso.slice(i + 1)
        if (nome && Buffer.byteLength(nome) <= 100 && Buffer.byteLength(prefisso) <= 155) return { prefisso, nome }
    }
    return null
}

const ottale = (valore, larghezza) => `${valore.toString(8).padStart(larghezza - 1, '0')}\0`

function intestazione(percorso, tipo, misura) {
    if (/[^\x20-\x7e]/u.test(percorso)) throw new Error(`archivio-r4: ${percorso} ha caratteri fuori dall'ASCII stampabile`)
    const diviso = dividi(percorso)
    if (!diviso) throw new Error(`archivio-r4: ${percorso} non sta in un'intestazione ustar (nome ≤100, prefisso ≤155)`)
    const b = Buffer.alloc(BLOCCO)
    b.write(diviso.nome, 0, 'latin1')
    b.write(ottale(tipo === 'cartella' ? 0o755 : 0o644, 8), 100, 'latin1')
    b.write(ottale(0, 8), 108, 'latin1')
    b.write(ottale(0, 8), 116, 'latin1')
    b.write(ottale(misura, 12), 124, 'latin1')
    b.write(ottale(0, 12), 136, 'latin1')
    b.write(' '.repeat(8), 148, 'latin1')
    b.write(tipo === 'cartella' ? '5' : '0', 156, 'latin1')
    b.write('ustar\0', 257, 'latin1')
    b.write('00', 263, 'latin1')
    b.write(diviso.prefisso, 345, 'latin1')
    const somma = b.reduce((s, x) => s + x, 0)
    b.write(`${somma.toString(8).padStart(6, '0')}\0 `, 148, 'latin1')
    return b
}

/** L'archivio di una cartella, come Buffer. Il manifesto del pacchetto, se c'è, va per primo. */
export function scriviUstar(cartella) {
    const voci = elenca(cartella).sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0))
    const ordinate = [...voci.filter((v) => v.nome === PRIMO), ...voci.filter((v) => v.nome !== PRIMO)]
    const pezzi = []
    for (const voce of ordinate) {
        if (voce.tipo === 'cartella') { pezzi.push(intestazione(voce.nome, 'cartella', 0)); continue }
        const dati = readFileSync(join(cartella, ...voce.nome.split('/')))
        pezzi.push(intestazione(voce.nome, 'file', dati.length), dati)
        const resto = dati.length % BLOCCO
        if (resto) pezzi.push(Buffer.alloc(BLOCCO - resto))
    }
    pezzi.push(Buffer.alloc(BLOCCO * 2))
    return Buffer.concat(pezzi)
}

/** Legge ciò che `scriviUstar` scrive (per le prove): `{ tipo, nome, dati }`. */
export function leggiUstar(byte) {
    const voci = []
    for (let o = 0; o + BLOCCO <= byte.length;) {
        const h = byte.subarray(o, o + BLOCCO)
        if (h.every((x) => x === 0)) break
        const campo = (inizio, lunghezza) => h.toString('latin1', inizio, inizio + lunghezza).replace(/\0.*$/su, '')
        const prefisso = campo(345, 155)
        const nome = prefisso ? `${prefisso}/${campo(0, 100)}` : campo(0, 100)
        const misura = parseInt(campo(124, 12).trim() || '0', 8)
        const tipo = campo(156, 1) === '5' ? 'cartella' : 'file'
        o += BLOCCO
        voci.push({ tipo, nome, dati: Buffer.from(byte.subarray(o, o + misura)) })
        o += Math.ceil(misura / BLOCCO) * BLOCCO
    }
    return voci
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const valore = (nome) => { const i = process.argv.indexOf(nome); return i > 0 ? process.argv[i + 1] : undefined }
    const pacchetto = valore('--pacchetto')
    const uscita = valore('--uscita')
    if (!pacchetto || !uscita) {
        console.error('uso: node scripts/r4-mobile/archivio-r4.mjs --pacchetto <cartella> --uscita <file .tar>')
        process.exit(2)
    }
    const byte = scriviUstar(resolve(pacchetto))
    writeFileSync(resolve(uscita), byte)
    console.log(`✓ archivio-r4: ${(byte.length / 1024 / 1024).toFixed(1)} MB in ${uscita}`)
}
