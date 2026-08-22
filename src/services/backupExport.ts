import type { TalosChatRepository } from '@/repositories/chatRepository'
import {
    TALOS_BACKUP_FORMAT,
    TALOS_BACKUP_SECTIONS,
    TALOS_BACKUP_SECRET_SECTIONS,
    type TalosBackupManifest,
    type TalosBackupSection,
} from '@/lib/backup/bundle'
import { talosBackupDigest } from '@/lib/backup/backupCrypto'

/**
 * Legge tutto quello che c'è, e lo scrive una volta sola.
 *
 * ## La regola che decide se un backup vale
 *
 * **Nessuna sezione si salta in silenzio.** Se una lettura fallisce — il vault
 * non risponde, una chiave non si decifra — il backup **non si scrive**. Un
 * backup parziale è peggio di nessun backup: si scopre incompleto il giorno in
 * cui serve, cioè quando non c'è più l'originale da cui rifarlo.
 *
 * È la stessa disciplina della postcondizione (D18) portata a monte: qui non si
 * verifica dopo aver scritto, si rifiuta di scrivere qualcosa che non regge.
 *
 * ## Perché ogni sezione porta la sua impronta
 *
 * Perché il ripristino deve poter dire «ho riletto ciò che era stato scritto»
 * invece di «ho letto un file». Sono due frasi diverse, e solo la prima è una
 * verifica.
 */

/** Da dove si legge. Iniettate, così la prova non ha bisogno di un dispositivo. */
export interface TalosBackupSources {
    repository: TalosChatRepository
    /** I byte di un file della Libreria, per id. `null` se non si possono leggere. */
    readVaultBytes(fileId: string): Promise<Uint8Array | null>
    /** Le chiavi dei provider, in chiaro. Chi le fornisce sa già cosa sta facendo. */
    readProviderKeys(): Promise<Record<string, string>>
    /** Le impostazioni serializzabili. Mai segreti: quelli stanno in `providerKeys`. */
    readSettings(): Promise<Record<string, unknown>>
    deviceModel(): Promise<string | null>
    appBuild: string
    now(): string
}

export class TalosBackupExportError extends Error {
    readonly code: string
    readonly section: TalosBackupSection | null
    constructor(code: string, section: TalosBackupSection | null, message: string) {
        super(message)
        this.code = code
        this.section = section
    }
}

/** Cosa esce: il manifesto e, per ogni sezione, il suo contenuto JSON canonico. */
export interface TalosBackupBundle {
    manifest: TalosBackupManifest
    /** JSON per sezione. Separati, perché il ripristino li scrive uno alla volta. */
    payload: Partial<Record<TalosBackupSection, string>>
}

/** Cosa includere. Le chiavi sono FUORI per difetto: si chiedono, non si presumono. */
export interface TalosBackupOptions {
    /**
     * ⛔ Per difetto `false`.
     *
     * Un backup senza chiavi si può appoggiare ovunque; uno con le chiavi è una
     * chiave. Chi lo vuole lo chiede, e il manifesto lo dichiara.
     */
    includeProviderKeys?: boolean
}

async function sezione(
    nome: TalosBackupSection,
    leggi: () => Promise<unknown[]>,
): Promise<{ json: string, count: number }> {
    let righe: unknown[]
    try {
        righe = await leggi()
    } catch (cause) {
        /*
         * ⛔ Qui si ferma tutto.
         *
         * La tentazione è saltare la sezione e continuare: il backup verrebbe
         * scritto, l'utente vedrebbe «fatto», e il giorno del ripristino
         * mancherebbero le note. Un errore che si scopre un anno dopo, quando
         * l'originale non c'è più.
         */
        throw new TalosBackupExportError(
            'TALOS_BACKUP_SECTION_UNREADABLE',
            nome,
            `The backup was not written: the "${nome}" section could not be read. `
            + 'A partial backup is worse than none.',
        )
    }
    return { json: JSON.stringify(righe), count: righe.length }
}

export async function talosCreateBackupBundle(
    sources: TalosBackupSources,
    options: TalosBackupOptions = {},
): Promise<TalosBackupBundle> {
    const repository = sources.repository
    const payload: Partial<Record<TalosBackupSection, string>> = {}
    const sections: Partial<Record<TalosBackupSection, { count: number, digest: string }>> = {}

    const sessions = await repository.listSessions()

    /**
     * I lettori, uno per sezione, nell'ordine dichiarato.
     *
     * I messaggi e gli allegati si leggono **per sessione**: non esiste un
     * `listAllMessages`, e inventarne uno significherebbe una query nuova sul
     * percorso più caldo del repository per una funzione che gira una volta ogni
     * tanto.
     */
    const lettori: Partial<Record<TalosBackupSection, () => Promise<unknown[]>>> = {
        sessions: async () => sessions,
        messages: async () => {
            const tutti: unknown[] = []
            for (const sessione of sessions) tutti.push(...await repository.listMessages(sessione.id))
            return tutti
        },
        attachments: async () => {
            const tutti: unknown[] = []
            for (const sessione of sessions) {
                const ids = await repository.listSessionAttachmentFileIds(sessione.id)
                tutti.push({ sessionId: sessione.id, fileIds: ids })
            }
            return tutti
        },
        vaultFiles: async () => {
            const files = await repository.listVaultFiles()
            const conByte: unknown[] = []
            for (const file of files) {
                const bytes = await sources.readVaultBytes(file.id)
                /*
                 * Un file della Libreria di cui non si leggono i byte è un
                 * riferimento che al ripristino punterebbe al nulla. Si dichiara
                 * `bytes: null` invece di far finta: chi legge il backup deve
                 * poter sapere che quel documento non tornerà.
                 */
                conByte.push({
                    ...file,
                    bytesBase64: bytes ? talosBase64(bytes) : null,
                })
            }
            return conByte
        },
        notes: () => repository.listNotes(),
        tasks: () => repository.listTasks(),
        memories: () => repository.listMemories(),
        researchRuns: () => repository.listResearchRuns(),
        settings: async () => [await sources.readSettings()],
    }

    if (options.includeProviderKeys === true) {
        lettori.providerKeys = async () => {
            const chiavi = await sources.readProviderKeys()
            return Object.entries(chiavi).map(([provider, key]) => ({ provider, key }))
        }
    }

    for (const nome of TALOS_BACKUP_SECTIONS) {
        const leggi = lettori[nome]
        if (!leggi) continue
        const { json, count } = await sezione(nome, leggi)
        payload[nome] = json
        sections[nome] = { count, digest: await talosBackupDigest(json) }
    }

    const contieneSegreti = TALOS_BACKUP_SECRET_SECTIONS
        .some((nome) => sections[nome] !== undefined && (sections[nome]?.count ?? 0) > 0)

    return {
        manifest: {
            format: TALOS_BACKUP_FORMAT,
            appBuild: sources.appBuild,
            createdAt: sources.now(),
            deviceModel: await sources.deviceModel().catch(() => null),
            containsSecrets: contieneSegreti,
            sections,
        },
        payload,
    }
}

/**
 * Rilegge il backup appena costruito e verifica le impronte.
 *
 * ⭐ È il passo che quasi nessuno fa: «l'ho scritto» e «l'ho riletto e torna»
 * sono due frasi diverse, e solo la seconda è una verifica. La stessa regola che
 * F2 applica ai documenti generati — si riapre il file prima di consegnarlo.
 */
export async function talosVerifyBackupBundle(bundle: TalosBackupBundle): Promise<{
    ok: boolean
    mismatched: TalosBackupSection[]
}> {
    const mismatched: TalosBackupSection[] = []
    for (const [nome, json] of Object.entries(bundle.payload) as [TalosBackupSection, string][]) {
        const atteso = bundle.manifest.sections[nome]?.digest
        if (atteso === undefined || await talosBackupDigest(json) !== atteso) mismatched.push(nome)
    }
    // Una sezione dichiarata nel manifesto e assente dal contenuto e' un buco
    // che la sola verifica delle impronte non vedrebbe.
    for (const nome of Object.keys(bundle.manifest.sections) as TalosBackupSection[]) {
        if (bundle.payload[nome] === undefined && !mismatched.includes(nome)) mismatched.push(nome)
    }
    return { ok: mismatched.length === 0, mismatched }
}

/** base64 senza dipendenze: i file della Libreria sono byte, il backup è testo. */
function talosBase64(bytes: Uint8Array): string {
    let binario = ''
    const blocco = 0x8000
    for (let index = 0; index < bytes.length; index += blocco) {
        binario += String.fromCharCode(...bytes.subarray(index, index + blocco))
    }
    return btoa(binario)
}
