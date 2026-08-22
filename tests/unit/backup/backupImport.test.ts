import { describe, expect, it, vi } from 'vitest'
import { talosBackupDigest } from '@/lib/backup/backupCrypto'
import { TALOS_BACKUP_FORMAT, type TalosBackupSection } from '@/lib/backup/bundle'
import {
    TalosBackupImportError,
    talosApplyBackupRestore,
    talosOpenBackup,
    talosPlanBackupRestore,
    type TalosBackupSinks,
} from '@/services/backupImport'

/**
 * Il ripristino, provato dove i ripristini fanno danni.
 *
 * Un import sbagliato non è come un export sbagliato: l'export lascia le cose
 * come stanno, l'import le cambia. Le prove guardano il file che arriva da fuori
 * (manomesso, troncato, di un'altra versione) e la scrittura che si ferma a
 * metà.
 */

async function fileDi(
    sezioni: Partial<Record<TalosBackupSection, unknown[]>>,
    patch: Record<string, unknown> = {},
) {
    const payload: Partial<Record<TalosBackupSection, string>> = {}
    const sections: Record<string, { count: number, digest: string }> = {}
    for (const [nome, righe] of Object.entries(sezioni) as [TalosBackupSection, unknown[]][]) {
        const json = JSON.stringify(righe)
        payload[nome] = json
        sections[nome] = { count: righe.length, digest: await talosBackupDigest(json) }
    }
    return {
        manifest: {
            format: TALOS_BACKUP_FORMAT,
            appBuild: 'test',
            createdAt: '2026-08-07T12:00:00.000Z',
            deviceModel: 'OPD2415',
            containsSecrets: false,
            sections,
            ...patch,
        },
        payload,
    }
}

function pozzi(patch: Partial<TalosBackupSinks> = {}): TalosBackupSinks {
    return {
        countExisting: vi.fn(async () => 0),
        findCollisions: vi.fn(async () => []),
        write: vi.fn(async () => undefined),
        ...patch,
    }
}

describe('⛔ il file che arriva da fuori', () => {
    it('apre un backup sano', async () => {
        const aperto = await talosOpenBackup(await fileDi({
            sessions: [{ id: 's1' }, { id: 's2' }],
            notes: [{ id: 'n1' }],
        }))
        expect(aperto.manifest.sections.sessions?.count).toBe(2)
        expect(aperto.sezioni.sessions).toHaveLength(2)
    })

    it('rifiuta un manifesto che non è un manifesto', async () => {
        await expect(talosOpenBackup({ manifest: { format: 99 }, payload: {} }))
            .rejects.toMatchObject({ code: 'TALOS_BACKUP_MANIFEST_INVALID' })
    })

    /**
     * ⛔ L'impronta si controlla PRIMA di guardare cosa c'è dentro: un file
     * manomesso non deve nemmeno arrivare al passo in cui si contano le righe.
     */
    it('vede un contenuto manomesso e non lo apre', async () => {
        const file = await fileDi({ notes: [{ id: 'n1', title: 'Idee' }] })
        file.payload.notes = JSON.stringify([{ id: 'n1', title: 'MANOMESSO' }])
        await expect(talosOpenBackup(file))
            .rejects.toMatchObject({ code: 'TALOS_BACKUP_SECTION_CORRUPT', section: 'notes' })
    })

    /**
     * ⛔ Il troncamento è la perdita di dati più silenziosa che ci sia: il file
     * si apre, le righe si leggono, e mancano — e nessuno lo nota finché non
     * cerca quella nota.
     */
    it('vede un file TRONCATO, che altrimenti si aprirebbe benissimo', async () => {
        const file = await fileDi({ messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] })
        // Il manifesto dice 3, il contenuto ne porta 1 — e l'impronta viene
        // ricalcolata, come farebbe chi tronca il file e lo "ripara".
        const troncato = JSON.stringify([{ id: 'm1' }])
        file.payload.messages = troncato
        file.manifest.sections.messages = {
            count: 3,
            digest: await talosBackupDigest(troncato),
        }
        await expect(talosOpenBackup(file))
            .rejects.toMatchObject({ code: 'TALOS_BACKUP_SECTION_TRUNCATED', section: 'messages' })
    })

    it('e una sezione dichiarata che il file non contiene', async () => {
        const file = await fileDi({ tasks: [{ id: 't1' }] })
        delete file.payload.tasks
        await expect(talosOpenBackup(file))
            .rejects.toMatchObject({ code: 'TALOS_BACKUP_SECTION_MISSING', section: 'tasks' })
    })
})

describe('⭐ prima si dice cosa succederà', () => {
    it('conta le collisioni contro ciò che c\'è sul dispositivo', async () => {
        const aperto = await talosOpenBackup(await fileDi({
            sessions: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
        }))
        const piano = await talosPlanBackupRestore(aperto, pozzi({
            countExisting: vi.fn(async () => 10),
            findCollisions: vi.fn(async () => ['s1', 's2']),
        }), 'replace')

        const passo = piano.steps.find((p) => p.section === 'sessions')!
        expect(passo.incoming).toBe(3)
        expect(passo.alreadyPresent).toBe(10)
        expect(passo.willOverwrite).toBe(2)
    })

    it('e con «unisci» dichiara zero sovrascritture', async () => {
        const aperto = await talosOpenBackup(await fileDi({ sessions: [{ id: 's1' }, { id: 's2' }] }))
        const piano = await talosPlanBackupRestore(aperto, pozzi({
            findCollisions: vi.fn(async () => ['s1']),
        }), 'merge')
        expect(piano.steps[0]!.willOverwrite).toBe(0)
        expect(piano.steps[0]!.willWrite).toBe(1)
    })
})

describe('la scrittura', () => {
    /**
     * L'ordine non è estetico: un messaggio scritto prima della sua sessione è
     * una riga orfana, e un allegato prima del suo file è un riferimento rotto.
     */
    it('scrive nell\'ordine dichiarato, non in quello del file', async () => {
        const scritte: TalosBackupSection[] = []
        const aperto = await talosOpenBackup(await fileDi({
            notes: [{ id: 'n1' }],
            messages: [{ id: 'm1' }],
            sessions: [{ id: 's1' }],
        }))
        await talosApplyBackupRestore(aperto, pozzi({
            write: vi.fn(async (section: TalosBackupSection) => { scritte.push(section) }),
        }), 'merge')
        expect(scritte).toEqual(['sessions', 'messages', 'notes'])
    })

    it('con «unisci» passa al pozzo solo le righe nuove', async () => {
        const write = vi.fn(async () => undefined)
        const aperto = await talosOpenBackup(await fileDi({
            sessions: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
        }))
        await talosApplyBackupRestore(aperto, pozzi({
            findCollisions: vi.fn(async () => ['s1', 's3']),
            write,
        }), 'merge')
        expect((write.mock.calls[0] as never as [string, unknown[]])[1]).toEqual([{ id: 's2' }])
    })

    it('con «sostituisci» le passa tutte', async () => {
        const write = vi.fn(async () => undefined)
        const aperto = await talosOpenBackup(await fileDi({ sessions: [{ id: 's1' }, { id: 's2' }] }))
        await talosApplyBackupRestore(aperto, pozzi({
            findCollisions: vi.fn(async () => ['s1']),
            write,
        }), 'replace')
        expect((write.mock.calls[0] as never as [string, unknown[]])[1]).toHaveLength(2)
    })

    /** `settings` è un oggetto solo, senza id: non deve sparire per «collisione». */
    it('una riga senza id passa comunque', async () => {
        const write = vi.fn(async () => undefined)
        const aperto = await talosOpenBackup(await fileDi({ settings: [{ tone: 'balanced' }] }))
        await talosApplyBackupRestore(aperto, pozzi({
            findCollisions: vi.fn(async () => ['qualcosa']),
            write,
        }), 'merge')
        expect((write.mock.calls[0] as never as [string, unknown[]])[1]).toHaveLength(1)
    })

    /**
     * ⛔ Ci si ferma, e non si continua col resto.
     *
     * Continuare lascerebbe un archivio metà vecchio e metà nuovo, senza modo di
     * sapere quale metà. Fermarsi lascia almeno un punto noto.
     */
    it('se una scrittura fallisce, NON scrive le sezioni successive', async () => {
        const write = vi.fn(async (section: TalosBackupSection) => {
            if (section === 'messages') throw new Error('disco pieno')
        })
        const aperto = await talosOpenBackup(await fileDi({
            sessions: [{ id: 's1' }],
            messages: [{ id: 'm1' }],
            notes: [{ id: 'n1' }],
        }))
        await expect(talosApplyBackupRestore(aperto, pozzi({ write }), 'merge'))
            .rejects.toMatchObject({ code: 'TALOS_BACKUP_WRITE_FAILED', section: 'messages' })
        // `notes` viene dopo `messages` nell'ordine: non deve essere stata scritta.
        expect(write.mock.calls.map((chiamata) => chiamata[0])).toEqual(['sessions', 'messages'])
    })

    it('e dice quante righe ha scritto per sezione, per confrontarle col piano', async () => {
        const aperto = await talosOpenBackup(await fileDi({
            sessions: [{ id: 's1' }, { id: 's2' }],
            notes: [{ id: 'n1' }],
        }))
        const scritte = await talosApplyBackupRestore(aperto, pozzi(), 'merge')
        expect(scritte).toEqual({ sessions: 2, notes: 1 })
    })
})

describe('l\'errore, quando arriva', () => {
    it('è tipizzato e dice quale sezione', async () => {
        const file = await fileDi({ notes: [{ id: 'n1' }] })
        file.payload.notes = '[]'
        try {
            await talosOpenBackup(file)
            expect.unreachable('doveva fallire')
        } catch (errore) {
            expect(errore).toBeInstanceOf(TalosBackupImportError)
            expect((errore as TalosBackupImportError).section).toBe('notes')
        }
    })
})
