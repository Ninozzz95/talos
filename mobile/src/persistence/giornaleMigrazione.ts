import {
    talosDecryptBackup,
    talosEncryptBackup,
    type TalosBackupEnvelope,
} from '@/lib/backup/backupCrypto'

/**
 * ⭐⭐⭐ IL GIORNALE DELLA MIGRAZIONE, che smette di essere in chiaro.
 *
 * Quando un'installazione vecchia adotta una chiave gestita, TALOS esporta tutto
 * il database, lo scrive su disco, distrugge l'originale e reimporta. Quel file
 * intermedio esisteva **in chiaro**: per qualche secondo, dati che per il resto
 * della loro vita stanno dietro SQLCipher e un PIN erano un JSON leggibile.
 *
 * La cartella è privata nel modello normale di Android — ma «normale» è la
 * parola che fa il lavoro pesante in quella frase, e comunque è un abbassamento
 * rispetto all'invariante che l'app mantiene tutto il resto del tempo.
 *
 * ## ⛔⛔⛔ LA COSA PIÙ PERICOLOSA QUI NON È LA CRITTOGRAFIA
 *
 * È l'aggiornamento. Qualcuno può avere un giornale IN SOSPESO — la migrazione
 * interrotta da Android che uccide l'app — e aggiornare TALOS prima di
 * riaprirla. Al riavvio, il codice nuovo trova un file vecchio, in chiaro.
 *
 * Se non sapesse leggerlo, la ripresa fallirebbe con il database GIÀ distrutto:
 * tutte le chat di quella persona, perse durante un aggiornamento pensato per
 * proteggerle. È esattamente la classe di difetto che questo pezzo di codice ha
 * già ospitato una volta.
 *
 * ⇒ Il formato nuovo si riconosce da una prima riga. Un file che non ce l'ha è
 * un giornale vecchio e si legge com'è. La compatibilità non è una gentilezza:
 * è la condizione perché il rimedio non sia peggiore del male.
 *
 * ## Perché la chiave giusta è quella NUOVA
 *
 * La migrazione esiste proprio perché la passphrase vecchia è irraggiungibile:
 * vive dentro il plugin e non si può leggere. La chiave nuova invece è nota
 * quando si scrive il giornale, ed è la stessa che si risolve prima di
 * rileggerlo alla ripresa.
 *
 * ⛔ Se un giorno quella chiave sparisse, il giornale sarebbe illeggibile. Non è
 * un peggioramento: sarebbe illeggibile anche il database che il giornale
 * contiene. Un contenitore protetto MENO del suo contenuto era l'anomalia.
 *
 * ## E si riusa la crittografia dei backup invece di scriverne un'altra
 *
 * Argon2id più AES-256-GCM, già in casa e già provata. Argon2id su una chiave
 * generata a macchina è più lavoro di quanto serva — le funzioni di derivazione
 * esistono per allungare le passphrase deboli — ma costa meno di un secondo, una
 * volta per installazione, dentro un'operazione che esporta l'intero database.
 * Una seconda strada crittografica costerebbe molto di più, per sempre.
 */

/**
 * ⛔ Una prima riga leggibile, non un byte magico binario: chi apre il file
 * capisce subito che cosa sta guardando, invece di vedere caratteri illeggibili
 * e concludere che sia corrotto.
 */
export const INTESTAZIONE_GIORNALE = 'TALOS-MIGRATION-ENCRYPTED-1'

interface GiornaleCifrato {
    envelope: TalosBackupEnvelope
    /** base64 */
    corpo: string
}

function base64(bytes: Uint8Array): string {
    let binario = ''
    for (const byte of bytes) binario += String.fromCharCode(byte)
    return btoa(binario)
}

function daBase64(value: string): Uint8Array {
    const binario = atob(value)
    const bytes = new Uint8Array(binario.length)
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i)
    return bytes
}

/** Il payload esportato, pronto per il disco: intestazione più busta cifrata. */
export async function cifraGiornale(payload: string, chiave: string): Promise<string> {
    const { envelope, ciphertext } = await talosEncryptBackup(
        new TextEncoder().encode(payload), chiave,
    )
    const dentro: GiornaleCifrato = { envelope, corpo: base64(ciphertext) }
    return `${INTESTAZIONE_GIORNALE}\n${JSON.stringify(dentro)}`
}

/**
 * Il contrario, e **accetta anche i giornali vecchi in chiaro**.
 *
 * ⛔ Il riconoscimento è sulla prima riga esatta, non su «sembra JSON»: un
 * giornale vecchio È JSON, quindi indovinare dalla forma sceglierebbe la strada
 * sbagliata proprio nel caso che conta di più.
 */
export async function decifraGiornale(contenuto: string, chiave: string): Promise<string> {
    if (!giornaleECifrato(contenuto)) return contenuto
    const aCapo = contenuto.indexOf('\n')
    const dentro = JSON.parse(contenuto.slice(aCapo + 1)) as GiornaleCifrato
    const chiaro = await talosDecryptBackup(dentro.envelope, daBase64(dentro.corpo), chiave)
    return new TextDecoder().decode(chiaro)
}

/** Un giornale è nel formato nuovo? Serve a dirlo nei log senza aprirlo. */
export function giornaleECifrato(contenuto: string): boolean {
    const aCapo = contenuto.indexOf('\n')
    return (aCapo === -1 ? contenuto : contenuto.slice(0, aCapo)).trim() === INTESTAZIONE_GIORNALE
}
