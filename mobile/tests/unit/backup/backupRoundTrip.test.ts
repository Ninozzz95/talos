import { describe, expect, it, vi } from 'vitest'
import { talosDecryptBackup, talosEncryptBackup } from '@/lib/backup/backupCrypto'
import { talosCreateBackupBundle, talosVerifyBackupBundle } from '@/services/backupExport'
import {
    talosApplyBackupRestore,
    talosOpenBackup,
    talosPlanBackupRestore,
} from '@/services/backupImport'
import { talosRestoreTotals } from '@/lib/backup/bundle'

/**
 * ⭐ Il giro intero, che è l'unica prova che conta davvero.
 *
 * Le prove sulle singole parti dicono che ogni pezzo fa il suo mestiere. Questa
 * dice che **i dati escono e rientrano uguali** — che è la sola domanda a cui un
 * backup deve rispondere, e quella a cui si risponde il giorno in cui l'originale
 * non c'è più.
 *
 * Percorso: leggi il dispositivo → scrivi il pacchetto → cifra con una
 * passphrase → (il file dorme fuori dall'app) → decifra → apri → pianifica →
 * scrivi. E alla fine si confronta riga per riga con ciò che c'era.
 */

const DISPOSITIVO = {
    sessions: [
        { id: 's1', title: 'Q3 report' },
        { id: 's2', title: 'Idraulico' },
    ],
    notes: [{ id: 'n1', title: 'Idee', content: 'comprare il pane' }],
    tasks: [{ id: 't1', title: 'Chiamare idraulico', priority: 'high' }],
    memories: [{ id: 'me1', title: 'Compleanno', content: 'il 2 giugno' }],
}

function fonti(includeKeys: boolean) {
    return {
        repository: {
            listSessions: vi.fn(async () => DISPOSITIVO.sessions),
            listMessages: vi.fn(async (id: string) => [
                { id: `${id}-m1`, session_id: id, role: 'user', content: 'ciao' },
            ]),
            listSessionAttachmentFileIds: vi.fn(async () => []),
            listVaultFiles: vi.fn(async () => [{ id: 'f1', name: 'fattura.pdf' }]),
            listNotes: vi.fn(async () => DISPOSITIVO.notes),
            listTasks: vi.fn(async () => DISPOSITIVO.tasks),
            listMemories: vi.fn(async () => DISPOSITIVO.memories),
            listResearchRuns: vi.fn(async () => []),
        } as never,
        readVaultBytes: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
        readProviderKeys: vi.fn(async () => ({ openrouter: 'sk-or-v1-segretissimo' })),
        readSettings: vi.fn(async () => ({ tone: 'balanced', locale: 'it' })),
        deviceModel: vi.fn(async () => 'OPD2415'),
        appBuild: '4e42364d',
        now: () => '2026-08-07T12:00:00.000Z',
        ...(includeKeys ? {} : {}),
    }
}

/** Il file, come vive fuori dall'app: una stringa sola, cifrata. */
async function scriviFile(includeKeys: boolean, passphrase: string) {
    const bundle = await talosCreateBackupBundle(fonti(includeKeys), {
        includeProviderKeys: includeKeys,
    })
    const verifica = await talosVerifyBackupBundle(bundle)
    expect(verifica.ok, 'il pacchetto si rilegge prima di essere consegnato').toBe(true)

    const chiaro = new TextEncoder().encode(JSON.stringify(bundle))
    const { envelope, ciphertext } = await talosEncryptBackup(chiaro, passphrase)
    return { envelope, ciphertext, manifest: bundle.manifest }
}

describe('⭐ il giro intero: esce e rientra uguale', () => {
    it('dal dispositivo al file cifrato e ritorno, senza perdere una riga', async () => {
        const passphrase = 'una passphrase che l\'owner ricorda'
        const { envelope, ciphertext, manifest } = await scriviFile(false, passphrase)

        // ── il file dorme fuori dall'app: qui non esiste altro che questi byte
        const riletto = await talosDecryptBackup(envelope, ciphertext, passphrase)
        const bundle = JSON.parse(new TextDecoder().decode(riletto))

        // ── un dispositivo VUOTO, come dopo una reinstallazione
        const scritte: Record<string, unknown[]> = {}
        const aperto = await talosOpenBackup(bundle)
        const piano = await talosPlanBackupRestore(aperto, {
            countExisting: async () => 0,
            findCollisions: async () => [],
            write: async () => undefined,
        }, 'merge')

        // Il piano dice quello che il manifesto prometteva
        expect(piano.steps.find((p) => p.section === 'sessions')!.willWrite).toBe(2)
        expect(talosRestoreTotals(piano).willOverwrite).toBe(0)

        await talosApplyBackupRestore(aperto, {
            countExisting: async () => 0,
            findCollisions: async () => [],
            write: async (section, rows) => { scritte[section] = [...rows] },
        }, 'merge')

        // ── e adesso il confronto che vale: riga per riga
        expect(scritte.sessions).toEqual(DISPOSITIVO.sessions)
        expect(scritte.notes).toEqual(DISPOSITIVO.notes)
        expect(scritte.tasks).toEqual(DISPOSITIVO.tasks)
        expect(scritte.memories).toEqual(DISPOSITIVO.memories)
        expect(scritte.messages).toHaveLength(2)
        expect(manifest.containsSecrets).toBe(false)
    }, 60_000)

    /**
     * ⛔ I byte di un file della Libreria devono tornare IDENTICI.
     *
     * Passano da base64 e da JSON: se un solo byte cambia, un PDF non si apre
     * più. È il difetto che F2 ha già pagato una volta — un xlsx salvato come
     * testo — e non si ripete.
     */
    it('e i byte della Libreria tornano identici', async () => {
        const passphrase = 'p'
        const { envelope, ciphertext } = await scriviFile(false, passphrase)
        const bundle = JSON.parse(new TextDecoder().decode(
            await talosDecryptBackup(envelope, ciphertext, passphrase),
        ))
        const files = JSON.parse(bundle.payload.vaultFiles)
        // %PDF, i quattro byte con cui comincia ogni PDF del mondo
        expect(files[0].bytesBase64).toBe(btoa('%PDF'))
    }, 60_000)

    /**
     * Il caso vero della D9: si esporta CON le chiavi, perché dopo la
     * reinstallazione servono. Il manifesto lo dichiara, e il file va trattato
     * come una chiave.
     */
    it('col backup che contiene le chiavi, il manifesto lo dichiara e le chiavi tornano', async () => {
        const passphrase = 'p'
        const { envelope, ciphertext, manifest } = await scriviFile(true, passphrase)
        expect(manifest.containsSecrets).toBe(true)

        const bundle = JSON.parse(new TextDecoder().decode(
            await talosDecryptBackup(envelope, ciphertext, passphrase),
        ))
        const scritte: Record<string, unknown[]> = {}
        await talosApplyBackupRestore(await talosOpenBackup(bundle), {
            countExisting: async () => 0,
            findCollisions: async () => [],
            write: async (section, rows) => { scritte[section] = [...rows] },
        }, 'merge')

        expect(scritte.providerKeys).toEqual([{ provider: 'openrouter', key: 'sk-or-v1-segretissimo' }])
    }, 60_000)

    /**
     * ⛔ E senza la passphrase quel file è inservibile — che è il punto.
     *
     * Un backup con dentro le chiavi API e ogni conversazione, appoggiato nei
     * Download, deve essere illeggibile per chi lo trova.
     */
    it('e senza la passphrase quel file non dice niente a nessuno', async () => {
        const { envelope, ciphertext } = await scriviFile(true, 'quella giusta')
        await expect(talosDecryptBackup(envelope, ciphertext, 'tentativo'))
            .rejects.toMatchObject({ code: 'TALOS_BACKUP_OPEN_FAILED' })
    }, 60_000)
})
