import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify, createPublicKey } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { scriviManifesto, firmaManifesto, scriviNote, CARTELLA_NOTE } from './manifesto-android.mjs'
import { creaChiave } from './crea-chiave.mjs'

/*
 * Il manifesto che la CI scrive e firma per l'aggiornamento automatico del mobile. L'altro capo è `TalosLettoreManifesto.kt`:
 * il campione `android/app/src/test/resources/aggiornamenti/` è scritto DA QUESTO script (AGG-CI-04) e letto e verificato DAL
 * lettore Kotlin (`TalosManifestoDallaCiTest`), così le due forme non possono divergere in silenzio.
 */
const qui = dirname(fileURLToPath(import.meta.url))
const CAMPIONE = resolve(qui, '../../android/app/src/test/resources/aggiornamenti')

function coppia() {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    return {
        pubblica: publicKey.export({ type: 'spki', format: 'pem' }),
        privata: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }
}

function apkFinto(cartella, nome = 'TALOS-0.1.44.apk') {
    const apk = join(cartella, nome)
    writeFileSync(apk, Buffer.from('apk finto per il campione del manifesto\n'))
    return apk
}

describe('manifesto dell\'aggiornamento mobile', () => {
    it('AGG-CI-01 scrive la forma latest.yml con impronta e dimensione dell\'APK', () => {
        const cartella = mkdtempSync(join(tmpdir(), 'talos-manifesto-'))
        try {
            const testo = scriviManifesto({ apk: apkFinto(cartella), versione: '0.1.44', data: new Date('2026-10-23T10:00:00.000Z') })
            const righe = testo.split('\n')
            assert.equal(righe[0], 'version: 0.1.44')
            assert.equal(righe[2], '  - url: TALOS-0.1.44.apk')
            assert.match(righe[3], /^ {4}sha512: [A-Za-z0-9+/]{86}==$/)
            assert.equal(righe[4], '    size: 40')
            assert.equal(righe[5], 'path: TALOS-0.1.44.apk')
            assert.equal(righe[6], righe[3].trim())
            assert.equal(righe[7], "releaseDate: '2026-10-23T10:00:00.000Z'")
            assert.throws(() => scriviManifesto({ apk: apkFinto(cartella), versione: 'v0.1.44' }), /x\.y\.z/)
        } finally {
            rmSync(cartella, { recursive: true, force: true })
        }
    })

    it('AGG-CI-02 la firma si verifica con la pubblica; senza segreto o con un segreto non gemello si ferma', () => {
        const nostra = coppia()
        const altra = coppia()
        const firma = firmaManifesto('version: 0.1.44\n', nostra.privata, nostra.pubblica)
        assert.ok(verify(null, Buffer.from('version: 0.1.44\n'), createPublicKey(nostra.pubblica), Buffer.from(firma, 'base64')))
        assert.throws(() => firmaManifesto('x', undefined, nostra.pubblica), /manca il segreto/)
        assert.throws(() => firmaManifesto('x', '', nostra.pubblica), /manca il segreto/)
        assert.throws(() => firmaManifesto('x', altra.privata, nostra.pubblica), /gemello/)
        const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' })
        assert.throws(() => firmaManifesto('x', ec, nostra.pubblica), /Ed25519/)
    })

    it('AGG-CI-03 la chiave privata nasce solo fuori dal repository e non sovrascrive', () => {
        const cartella = mkdtempSync(join(tmpdir(), 'talos-chiave-'))
        try {
            const privata = join(cartella, 'privata.pem')
            const pubblica = join(cartella, 'pubblica.pem')
            creaChiave(privata, pubblica)
            assert.match(readFileSync(privata, 'utf8'), /BEGIN PRIVATE KEY/)
            assert.match(readFileSync(pubblica, 'utf8'), /BEGIN PUBLIC KEY/)
            assert.throws(() => creaChiave(privata, pubblica), /esiste già/)
            assert.throws(() => creaChiave(resolve(qui, 'dentro-il-repo.pem'), pubblica), /FUORI dal repository/)
            assert.equal(existsSync(resolve(qui, 'dentro-il-repo.pem')), false)
        } finally {
            rmSync(cartella, { recursive: true, force: true })
        }
    })

    it('AGG-CI-06 le novità in due lingue nella forma che legge TalosNoteAggiornamento.kt', () => {
        assert.equal(
            scriviNote('0.1.44', JSON.stringify({ it: [' Motore più veloce. '], en: ['Faster engine.'] })),
            '{"version":"0.1.44","en":["Faster engine."],"it":["Motore più veloce."]}\n',
        )
        assert.throws(() => scriviNote('0.1.44', JSON.stringify({ en: ['A'] })), /solo "en" e "it"/)
        assert.throws(() => scriviNote('0.1.44', JSON.stringify({ en: [], it: ['B'] })), /da 1 a 8/)
        assert.throws(() => scriviNote('0.1.44', JSON.stringify({ en: ['riga\naltra'], it: ['B'] })), /una riga sola/)
        assert.throws(() => scriviNote('0.1.44', JSON.stringify({ en: ['x'.repeat(241)], it: ['B'] })), /240/)
    })

    it('AGG-CI-07 ogni file di note-di-rilascio ha la forma giusta e dice «dispositivo», mai telefono', () => {
        const file = readdirSync(CARTELLA_NOTE).filter((f) => f.endsWith('.json'))
        assert.ok(file.length > 0, 'nessun file di novità')
        for (const nome of file) {
            const versione = nome.replace(/\.json$/, '')
            assert.match(versione, /^\d+\.\d+\.\d+$/, `nome di file non x.y.z: ${nome}`)
            const note = JSON.parse(scriviNote(versione, readFileSync(join(CARTELLA_NOTE, nome), 'utf8')))
            // owner 22/10/2026: «dispositivo/device» in tutto ciò che si legge (cancello I18N-DEV-01 dei cataloghi)
            for (const voce of note.en) assert.doesNotMatch(voce, /\b(?:phones?|smartphones?|cellphones?)\b/i, `${nome}: ${voce}`)
            for (const voce of note.it) assert.doesNotMatch(voce, /\b(?:telefon[oi]|smartphone|cellular[ei])\b/i, `${nome}: ${voce}`)
        }
    })

    it('AGG-CI-04 il campione per il lettore Kotlin è quello che questo script scrive oggi', () => {
        const pubblica = readFileSync(join(CAMPIONE, 'pubblica-di-prova.pem'), 'utf8')
        const manifesto = readFileSync(join(CAMPIONE, 'latest-android.yml'), 'utf8')
        const firma = readFileSync(join(CAMPIONE, 'latest-android.yml.sig'), 'utf8').trim()
        const cartella = mkdtempSync(join(tmpdir(), 'talos-campione-'))
        try {
            const atteso = scriviManifesto({ apk: apkFinto(cartella), versione: '0.1.44', data: new Date('2026-10-23T10:00:00.000Z') })
            assert.equal(manifesto, atteso, 'rigenera il campione: lo script ha cambiato forma')
            assert.ok(verify(null, Buffer.from(manifesto, 'utf8'), createPublicKey(pubblica), Buffer.from(firma, 'base64')))
        } finally {
            rmSync(cartella, { recursive: true, force: true })
        }
    })
})
