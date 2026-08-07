import {
    TALOS_BACKUP_SECTIONS,
    talosParseBackupManifest,
    talosPlanRestore,
    type TalosBackupManifest,
    type TalosBackupRestorePlan,
    type TalosBackupSection,
    type TalosBackupStrategy,
} from '@/lib/backup/bundle'
import { talosBackupDigest } from '@/lib/backup/backupCrypto'

/**
 * Il ripristino: prima si legge, poi si dice cosa succederà, e solo dopo si
 * scrive.
 *
 * ## I tre passi, e perché in quest'ordine
 *
 * 1. **Aprire e verificare.** Un file di backup arriva da fuori — dal disco, da
 *    un cloud, da una chat — come una pagina web. Le impronte si controllano
 *    PRIMA di guardare cosa c'è dentro: un file manomesso non deve nemmeno
 *    arrivare al passo in cui si contano le righe.
 * 2. **Pianificare.** Quante ne arrivano, quante ci sono già, quante verranno
 *    **sovrascritte**. È il piano (D15) applicato al backup: nessun export in
 *    circolazione lo fa, si preme «importa» e si scopre dopo cosa è cambiato.
 * 3. **Scrivere**, nell'ordine dichiarato delle sezioni. Un messaggio scritto
 *    prima della sua sessione è una riga orfana.
 *
 * ## ⛔ Cosa NON fa
 *
 * Non ripara. Se una sezione non torna, il ripristino si ferma e lo dice, invece
 * di scrivere «il resto». Un ripristino a metà lascia un archivio in uno stato
 * che nessuno ha mai progettato — peggio di non averlo cominciato, perché adesso
 * non si sa più cosa c'è.
 */

export class TalosBackupImportError extends Error {
    readonly code: string
    readonly section: TalosBackupSection | null
    constructor(code: string, section: TalosBackupSection | null, message: string) {
        super(message)
        this.code = code
        this.section = section
    }
}

/** Il file, già decifrato e diviso in manifesto e sezioni. */
export interface TalosBackupFile {
    manifest: unknown
    payload: Partial<Record<TalosBackupSection, string>>
}

/** Dove si scrive, e cosa si sa già. Iniettati: la prova non vuole un dispositivo. */
export interface TalosBackupSinks {
    /** Quante righe di questa sezione ci sono ADESSO sul dispositivo. */
    countExisting(section: TalosBackupSection): Promise<number>
    /** Quali id, fra quelli in arrivo, esistono già. */
    findCollisions(section: TalosBackupSection, ids: readonly string[]): Promise<readonly string[]>
    /** Scrive le righe di una sezione. Riceve solo ciò che la strategia ha lasciato passare. */
    write(section: TalosBackupSection, rows: readonly unknown[], strategy: TalosBackupStrategy): Promise<void>
}

interface Aperto {
    manifest: TalosBackupManifest
    sezioni: Partial<Record<TalosBackupSection, unknown[]>>
}

/** Gli id di una sezione, per contare le collisioni. Una riga senza id non collide. */
function idsDi(righe: readonly unknown[]): string[] {
    const ids: string[] = []
    for (const riga of righe) {
        if (riga !== null && typeof riga === 'object') {
            const id = (riga as Record<string, unknown>).id
            if (typeof id === 'string') ids.push(id)
        }
    }
    return ids
}

/**
 * Apre il file: valida il manifesto, verifica ogni impronta, e restituisce le
 * righe già lette.
 *
 * ⛔ L'impronta si verifica **prima** del `JSON.parse` del contenuto? No: si
 * verifica sulla STRINGA, che è esattamente ciò su cui è stata calcolata. Fare
 * il contrario — parse, ri-serializza, confronta — introdurrebbe la differenza
 * fra due serializzazioni e farebbe fallire backup sani.
 */
export async function talosOpenBackup(file: TalosBackupFile): Promise<Aperto> {
    const manifest = talosParseBackupManifest(file.manifest)
    if (!manifest) {
        throw new TalosBackupImportError(
            'TALOS_BACKUP_MANIFEST_INVALID',
            null,
            'This file is not a TALOS backup, or was written by a version this one cannot read.',
        )
    }

    const sezioni: Partial<Record<TalosBackupSection, unknown[]>> = {}
    for (const nome of TALOS_BACKUP_SECTIONS) {
        const dichiarata = manifest.sections[nome]
        if (!dichiarata) continue
        const json = file.payload[nome]
        if (json === undefined) {
            throw new TalosBackupImportError(
                'TALOS_BACKUP_SECTION_MISSING',
                nome,
                `The backup declares a "${nome}" section that the file does not contain.`,
            )
        }
        if (await talosBackupDigest(json) !== dichiarata.digest) {
            throw new TalosBackupImportError(
                'TALOS_BACKUP_SECTION_CORRUPT',
                nome,
                `The "${nome}" section does not match its fingerprint: the file is damaged.`,
            )
        }
        let righe: unknown
        try {
            righe = JSON.parse(json)
        } catch {
            throw new TalosBackupImportError(
                'TALOS_BACKUP_SECTION_CORRUPT', nome,
                `The "${nome}" section could not be read.`,
            )
        }
        if (!Array.isArray(righe)) {
            throw new TalosBackupImportError(
                'TALOS_BACKUP_SECTION_CORRUPT', nome,
                `The "${nome}" section is not a list.`,
            )
        }
        // Il conteggio dichiarato deve tornare: se il manifesto dice 340
        // messaggi e ce ne sono 12, il file è stato troncato — e un troncamento
        // che nessuno guarda è la perdita di dati piu' silenziosa che ci sia.
        if (righe.length !== dichiarata.count) {
            throw new TalosBackupImportError(
                'TALOS_BACKUP_SECTION_TRUNCATED',
                nome,
                `The "${nome}" section declares ${dichiarata.count} entries and contains ${righe.length}.`,
            )
        }
        sezioni[nome] = righe
    }

    return { manifest, sezioni }
}

/** Cosa succederà, detto prima di scrivere. */
export async function talosPlanBackupRestore(
    aperto: Aperto,
    sinks: TalosBackupSinks,
    strategy: TalosBackupStrategy,
): Promise<TalosBackupRestorePlan> {
    const presente: Partial<Record<TalosBackupSection, number>> = {}
    const collisioni: Partial<Record<TalosBackupSection, number>> = {}
    for (const nome of TALOS_BACKUP_SECTIONS) {
        const righe = aperto.sezioni[nome]
        if (!righe) continue
        presente[nome] = await sinks.countExisting(nome)
        collisioni[nome] = (await sinks.findCollisions(nome, idsDi(righe))).length
    }
    return talosPlanRestore(aperto.manifest, presente, collisioni, strategy)
}

/**
 * Scrive. Nell'ordine dichiarato, e senza riparare niente.
 *
 * Restituisce quante righe ha scritto per sezione: chi chiama lo confronta col
 * piano, ed è l'ultima verifica — «ho fatto quello che avevo detto» invece di
 * «ho finito».
 */
export async function talosApplyBackupRestore(
    aperto: Aperto,
    sinks: TalosBackupSinks,
    strategy: TalosBackupStrategy,
): Promise<Partial<Record<TalosBackupSection, number>>> {
    const scritte: Partial<Record<TalosBackupSection, number>> = {}

    for (const nome of TALOS_BACKUP_SECTIONS) {
        const righe = aperto.sezioni[nome]
        if (!righe) continue

        let daScrivere = righe
        if (strategy !== 'replace') {
            const esistenti = new Set(await sinks.findCollisions(nome, idsDi(righe)))
            daScrivere = righe.filter((riga) => {
                const id = riga !== null && typeof riga === 'object'
                    ? (riga as Record<string, unknown>).id
                    : undefined
                // Una riga senza id non si può confrontare, quindi passa: è il
                // caso di `settings`, che è un oggetto solo.
                return typeof id !== 'string' || !esistenti.has(id)
            })
        }

        try {
            await sinks.write(nome, daScrivere, strategy)
        } catch (cause) {
            /*
             * ⛔ Ci si ferma qui.
             *
             * Continuare con le sezioni successive lascerebbe un archivio in uno
             * stato che nessuno ha progettato: metà vecchio, metà nuovo, e
             * nessun modo di sapere quale metà. Fermarsi e dirlo lascia almeno
             * un punto noto da cui ripartire.
             */
            throw new TalosBackupImportError(
                'TALOS_BACKUP_WRITE_FAILED',
                nome,
                `The restore stopped while writing "${nome}". Nothing after it was written.`,
            )
        }
        scritte[nome] = daScrivere.length
    }

    return scritte
}
