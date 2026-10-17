/**
 * ⛔ K2-C — il portachiavi di r4 sul telefono (ledger `LEDGER-K2C-PORTACHIAVI-ANDROID-2026-10-14.md`; owner 14/10 «Modulo nostro»).
 *
 * r4 lo carica con `TALOS_HARNESS_UI_KEYRING=modulo:<percorso di questo file>` (Nino1, `adattatore-keyring.mjs`,
 * `creaAdattatorePortachiaviDaModulo`): un export con nome `creaPortachiavi({ env })`, sincrono, chiamato una volta all'avvio,
 * che torna `{ get, set, remove }` con la semantica del portachiavi in memoria.
 *
 * Sul telefono l'archivio sicuro di Android sta dal lato Kotlin, e le sue chiavi non si esportano. Si usa la busta: l'app tiene
 * una chiave dati da 32 byte cifrata con l'archivio sicuro e la passa a questo processo all'avvio. Le voci stanno in un file
 * cifrato AES-256-GCM nella cartella privata dell'app (`TALOS_R4_PORTACHIAVI_FILE`). Chiuso per difetto: un file che non si
 * apre o non si autentica ferma l'avvio. Ripartire vuoti sopra chiavi che esistono le perderebbe alla prima scrittura.
 *
 * ⛔ Owner 14/10, «Dallo stdin»: la chiave dati arriva SOLO dallo standard input (l'app la scrive e lo chiude). Nell'ambiente
 * resterebbe in `/proc/<pid>/environ` anche dopo un `delete` (misurato sul Pad), leggibile dai comandi del Codice, che girano con
 * lo stesso utente dell'app. Se la si trova nell'ambiente, il portachiavi non parte.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, readSync, renameSync, rmSync, writeSync } from 'node:fs'
import { isAbsolute } from 'node:path'

export const SCHEMA_PORTACHIAVI = 'talos.mobile.portachiavi.v1'
export const VAR_FILE = 'TALOS_R4_PORTACHIAVI_FILE'
/** Da dove arriva la chiave dati: l'unico valore ammesso è `stdin`. */
export const VAR_ORIGINE = 'TALOS_R4_PORTACHIAVI_CHIAVE_DA'
/** Il nome che la chiave NON deve avere nell'ambiente: se c'è, è un errore. */
export const VAR_CHIAVE = 'TALOS_R4_PORTACHIAVI_CHIAVE'
/** Più che abbastanza per 32 byte in base64 e un a capo: lo stdin non si legge oltre. */
const MASSIMO_STDIN = 256

/** Lo stdin fino alla fine (l'app lo chiude dopo la chiave), entro MASSIMO_STDIN byte. */
function leggiDaStdin() {
    const pezzi = []
    let totale = 0
    const buffer = Buffer.alloc(MASSIMO_STDIN)
    for (;;) {
        let letti
        try {
            letti = readSync(0, buffer, 0, buffer.length, null)
        } catch (guasto) {
            if (guasto?.code === 'EAGAIN') continue
            if (guasto?.code === 'EOF') break
            throw guasto
        }
        if (letti === 0) break
        totale += letti
        if (totale > MASSIMO_STDIN) throw errore('PORTACHIAVI_CONFIG', 'too much data on standard input.')
        pezzi.push(Buffer.from(buffer.subarray(0, letti)))
    }
    return Buffer.concat(pezzi).toString('utf8')
}

const ALGORITMO = 'aes-256-gcm'
const BYTE_IV = 12
const BYTE_TAG = 16

function errore(code, messaggio) {
    return Object.assign(new Error(`portachiavi Android: ${messaggio}`), { code })
}

/** Nomi che, come chiavi di un oggetto, ne toccherebbero il prototipo. */
const NOMI_RISERVATI = new Set(['__proto__', 'constructor', 'prototype'])

function stringhe(servizio, account, ...valori) {
    if (![servizio, account, ...valori].every((v) => typeof v === 'string')) {
        throw errore('PORTACHIAVI_VOCE', 'service, account and value must be strings.')
    }
    if (NOMI_RISERVATI.has(servizio) || NOMI_RISERVATI.has(account)) throw errore('PORTACHIAVI_VOCE', 'reserved service or account name.')
}

function apri(file, chiave) {
    if (!existsSync(file)) return {}
    try {
        const busta = JSON.parse(readFileSync(file, 'utf8'))
        if (busta?.schema !== SCHEMA_PORTACHIAVI) throw new Error('schema')
        const iv = Buffer.from(busta.iv, 'base64')
        const tag = Buffer.from(busta.tag, 'base64')
        if (iv.length !== BYTE_IV || tag.length !== BYTE_TAG) throw new Error('forma')
        const decifra = createDecipheriv(ALGORITMO, chiave, iv, { authTagLength: BYTE_TAG })
        decifra.setAAD(Buffer.from(SCHEMA_PORTACHIAVI))
        decifra.setAuthTag(tag)
        const chiaro = Buffer.concat([decifra.update(Buffer.from(busta.dati, 'base64')), decifra.final()])
        const voci = JSON.parse(chiaro.toString('utf8'))
        if (!voci || typeof voci !== 'object' || Array.isArray(voci)) throw new Error('voci')
        return voci
    } catch {
        // Né la causa né il contenuto nel messaggio: potrebbe finire in un registro.
        throw errore('PORTACHIAVI_ILLEGGIBILE', 'the keychain file cannot be opened with this key; it was left untouched.')
    }
}

function salva(file, chiave, voci) {
    const iv = randomBytes(BYTE_IV)
    const cifra = createCipheriv(ALGORITMO, chiave, iv, { authTagLength: BYTE_TAG })
    cifra.setAAD(Buffer.from(SCHEMA_PORTACHIAVI))
    const dati = Buffer.concat([cifra.update(Buffer.from(JSON.stringify(voci), 'utf8')), cifra.final()])
    const busta = JSON.stringify({ schema: SCHEMA_PORTACHIAVI, iv: iv.toString('base64'), tag: cifra.getAuthTag().toString('base64'), dati: dati.toString('base64') })
    // Atomica senza `link` (vietato all'app, K0): file temporaneo, fsync, rename sopra il vecchio.
    const provvisorio = `${file}.${process.pid}.tmp`
    const fd = openSync(provvisorio, 'w', 0o600)
    try {
        writeSync(fd, busta)
        fsyncSync(fd)
    } finally {
        closeSync(fd)
    }
    try {
        renameSync(provvisorio, file)
    } catch (guasto) {
        rmSync(provvisorio, { force: true })
        throw guasto
    }
}

/**
 * Due modi, mai insieme:
 *   - `segreti` (Nino1, 14/10): con `TALOS_HARNESS_UI_SEGRETI_DA=stdin` r4 legge lo stdin una volta (righe `NOME=valore`) e passa
 *     qui le voci che non consuma, congelate. La chiave dati è `segreti.TALOS_R4_PORTACHIAVI_CHIAVE`, e lo stdin non si rilegge;
 *   - lo stdin, quando il modulo gira da solo: `TALOS_R4_PORTACHIAVI_CHIAVE_DA=stdin`.
 * `leggiChiave` è lo stdin vero; le prove lo sostituiscono.
 */
export function creaPortachiavi({ env, segreti }, { leggiChiave = leggiDaStdin } = {}) {
    const file = env?.[VAR_FILE]
    if (typeof file !== 'string' || !isAbsolute(file) || file.includes('\0')) {
        throw errore('PORTACHIAVI_CONFIG', `${VAR_FILE} must be an absolute path.`)
    }
    if (env?.[VAR_CHIAVE] !== undefined) {
        throw errore('PORTACHIAVI_CONFIG', `the data key must not travel in the environment (${VAR_CHIAVE}): pass it on standard input.`)
    }
    const daiSegreti = segreti?.[VAR_CHIAVE]
    const dalloStdin = env?.[VAR_ORIGINE] === 'stdin'
    if (daiSegreti !== undefined && dalloStdin) throw errore('PORTACHIAVI_CONFIG', 'the data key has two sources: secrets and standard input.')
    if (daiSegreti === undefined && !dalloStdin) {
        throw errore('PORTACHIAVI_CONFIG', `no data key: pass ${VAR_CHIAVE} among the secrets r4 reads on standard input.`)
    }
    const testoChiave = String(daiSegreti !== undefined ? daiSegreti : leggiChiave()).trim()
    const chiave = /^[A-Za-z0-9+/]+={0,2}$/u.test(testoChiave) ? Buffer.from(testoChiave, 'base64') : null
    if (!chiave || chiave.length !== 32) throw errore('PORTACHIAVI_CONFIG', 'the data key on standard input must be 32 bytes in base64.')

    const voci = apri(file, chiave)
    return {
        get(servizio, account) {
            stringhe(servizio, account)
            const valore = voci[servizio]?.[account]
            return typeof valore === 'string' ? valore : null
        },
        set(servizio, account, valore) {
            stringhe(servizio, account, valore)
            const prossime = { ...voci, [servizio]: { ...voci[servizio], [account]: valore } }
            salva(file, chiave, prossime)
            voci[servizio] = prossime[servizio]
        },
        remove(servizio, account) {
            stringhe(servizio, account)
            if (typeof voci[servizio]?.[account] !== 'string') return
            const { [account]: _tolto, ...resto } = voci[servizio]
            const prossime = { ...voci }
            if (Object.keys(resto).length) prossime[servizio] = resto
            else delete prossime[servizio]
            salva(file, chiave, prossime)
            if (Object.keys(resto).length) voci[servizio] = resto
            else delete voci[servizio]
        },
    }
}
