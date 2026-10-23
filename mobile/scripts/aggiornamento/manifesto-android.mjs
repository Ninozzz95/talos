// Il manifesto dell'aggiornamento automatico del mobile, scritto e firmato dalla CI accanto all'APK della release.
//
//   TALOS_MOBILE_UPDATE_SIGN_KEY=<PEM> node scripts/aggiornamento/manifesto-android.mjs <APK> <versione> <cartella-di-uscita>
//
// Forma `latest.yml` di electron-builder, la stessa del desktop (owner 22/10/2026, decisione 6), col nome `latest-android.yml`;
// la firma `latest-android.yml.sig` è Ed25519 in base64 dei byte ESATTI del manifesto (desktop `firma-aggiornamenti.mjs:18-19`).
// Come il desktop (`release-assets.mjs:78-99`) si ferma se il segreto manca o non è il gemello della pubblica dentro l'app, e
// riverifica la firma appena fatta. Il lettore dell'app è `TalosLettoreManifesto.kt`: le due forme devono restare uguali.
//
// Scrive anche le novità del cassetto, `note-android.json` + `.sig`, da `note-di-rilascio/<versione>.json` ({"en":[…],"it":[…]}):
// il corpo della release su GitHub è in inglese e TALOS dice ogni parola nelle due lingue. ⛔ Senza quel file la release si ferma.
// Il lettore dell'app è `TalosNoteAggiornamento.kt`: stessa forma, stessi limiti.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBBLICA } from './crea-chiave.mjs'

export const MANIFESTO = 'latest-android.yml'
export const FIRMA = 'latest-android.yml.sig'
export const NOTE = 'note-android.json'
export const FIRMA_NOTE = 'note-android.json.sig'
const qui = dirname(fileURLToPath(import.meta.url))
export const CARTELLA_NOTE = resolve(qui, '../../note-di-rilascio')
const CONTROLLO = /[\u0000-\u001f\u007f]/

/** Le novità di una versione, nella forma che `TalosNoteAggiornamento.kt` accetta; lancia con un messaggio che dice cosa manca. */
export function scriviNote(versione, sorgente) {
    const note = JSON.parse(sorgente)
    const chiavi = Object.keys(note).sort().join(',')
    if (chiavi !== 'en,it') throw new Error(`le note della ${versione} devono avere solo "en" e "it" (trovato: ${chiavi})`)
    for (const lingua of ['en', 'it']) {
        const voci = note[lingua]
        if (!Array.isArray(voci) || voci.length < 1 || voci.length > 8) throw new Error(`note ${lingua}: da 1 a 8 voci`)
        for (const voce of voci) {
            if (typeof voce !== 'string' || !voce.trim() || voce.length > 240 || CONTROLLO.test(voce)) {
                throw new Error(`note ${lingua}: ogni voce è una riga sola, non vuota, al massimo 240 caratteri`)
            }
        }
    }
    return JSON.stringify({ version: versione, en: note.en.map((v) => v.trim()), it: note.it.map((v) => v.trim()) }) + '\n'
}

export function scriviManifesto({ apk, versione, data = new Date() }) {
    if (!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(versione)) throw new Error(`versione non x.y.z: ${versione}`)
    const nome = basename(apk)
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.apk$/.test(nome)) throw new Error(`nome dell'APK non semplice: ${nome}`)
    const sha512 = createHash('sha512').update(readFileSync(apk)).digest('base64')
    const size = statSync(apk).size
    return [
        `version: ${versione}`,
        'files:',
        `  - url: ${nome}`,
        `    sha512: ${sha512}`,
        `    size: ${size}`,
        `path: ${nome}`,
        `sha512: ${sha512}`,
        `releaseDate: '${data.toISOString()}'`,
        '',
    ].join('\n')
}

export function firmaManifesto(manifesto, privataPem, pubblicaPem) {
    if (!privataPem || !privataPem.includes('PRIVATE KEY')) throw new Error('manca il segreto TALOS_MOBILE_UPDATE_SIGN_KEY')
    const privata = createPrivateKey(privataPem)
    if (privata.asymmetricKeyType !== 'ed25519') throw new Error('il segreto non è una chiave Ed25519')
    const gemella = createPublicKey(privata).export({ type: 'spki', format: 'der' })
    const dellApp = createPublicKey(pubblicaPem).export({ type: 'spki', format: 'der' })
    if (!gemella.equals(dellApp)) throw new Error('il segreto non è il gemello della chiave pubblica dentro l\'app')
    const byte = Buffer.from(manifesto, 'utf8')
    const firma = sign(null, byte, privata)
    if (!verify(null, byte, createPublicKey(pubblicaPem), firma)) throw new Error('la firma appena fatta non si verifica')
    return firma.toString('base64')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [apk, versione, uscita] = process.argv.slice(2)
    if (!apk || !versione || !uscita) {
        console.error('uso: node scripts/aggiornamento/manifesto-android.mjs <APK> <versione> <cartella-di-uscita>')
        process.exit(2)
    }
    try {
        const sorgenteNote = join(CARTELLA_NOTE, `${versione}.json`)
        if (!existsSync(sorgenteNote)) throw new Error(`mancano le novità in due lingue: ${sorgenteNote}`)
        const note = scriviNote(versione, readFileSync(sorgenteNote, 'utf8'))
        const manifesto = scriviManifesto({ apk, versione })
        const pubblica = readFileSync(PUBBLICA, 'utf8')
        const firma = firmaManifesto(manifesto, process.env.TALOS_MOBILE_UPDATE_SIGN_KEY, pubblica)
        const firmaNote = firmaManifesto(note, process.env.TALOS_MOBILE_UPDATE_SIGN_KEY, pubblica)
        writeFileSync(join(uscita, MANIFESTO), manifesto)
        writeFileSync(join(uscita, FIRMA), firma + '\n')
        writeFileSync(join(uscita, NOTE), note)
        writeFileSync(join(uscita, FIRMA_NOTE), firmaNote + '\n')
        console.log(`${MANIFESTO}, ${NOTE} e le firme scritti per ${basename(apk)} ${versione}`)
    } catch (errore) {
        console.error(`::error::${errore.message}`)
        process.exit(1)
    }
}
