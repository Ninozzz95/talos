import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/filesystem', () => ({
    Directory: { Documents: 'DOCUMENTS' },
    Filesystem: {
        writeFile: vi.fn(async () => ({ uri: 'file:///x' })),
        readFile: vi.fn(async () => ({ data: '' })),
        getUri: vi.fn(async () => ({ uri: 'file:///Documents/x.talosbak' })),
        readdir: vi.fn(async () => ({ files: [] })),
    },
}))

const {
    TalosBackupFileError,
    talosBackupFileName,
    talosBackupFileText,
    talosOpenBackupFile,
    talosReadBackupHeader,
} = await import('@/services/backupFile')

/**
 * Il backup come file su disco.
 *
 * La domanda che queste prove chiudono: **cosa si può sapere del file senza la
 * passphrase?** La risposta giusta è «abbastanza per decidere se aprirlo, e
 * niente del suo contenuto» — perché un import che chiede la password e poi dice
 * «guarda, è di un'altra versione» è un giro sprecato, e un file che rivela le
 * conversazioni a chi lo trova è il disastro che la cifratura doveva evitare.
 */

const BUNDLE = {
    manifest: {
        format: 1 as const,
        appBuild: 'test',
        createdAt: '2026-08-07T12:34:56.000Z',
        deviceModel: 'OPD2415',
        containsSecrets: true,
        sections: { sessions: { count: 2, digest: 'a'.repeat(64) } },
    },
    payload: { sessions: '[{"id":"s1","title":"Q3 riservato"}]' },
}

describe('il nome del file', () => {
    it('è ordinabile e senza due punti', () => {
        const nome = talosBackupFileName('2026-08-07T12:34:56.000Z')
        expect(nome).toBe('TALOS-backup-2026-08-07T123456.talosbak')
        // Alcuni filesystem rifiutano i due punti, e il file diventa
        // impossibile da copiare proprio quando serve.
        expect(nome).not.toContain(':')
    })
})

describe('⭐ cosa si legge SENZA la passphrase', () => {
    it('l\'envelope e il manifesto sì — servono a decidere prima di chiedere', async () => {
        const testo = await talosBackupFileText(BUNDLE as never, 'la passphrase')
        const testa = talosReadBackupHeader(testo)

        expect(testa.envelope.kdf).toBe('argon2id')
        expect((testa.manifest as { deviceModel: string }).deviceModel).toBe('OPD2415')
        expect((testa.manifest as { containsSecrets: boolean }).containsSecrets).toBe(true)
    }, 30_000)

    /**
     * ⛔ E il contenuto NO. È il punto della cifratura: un backup nei Download
     * non deve dire niente a chi lo trova.
     */
    it('il contenuto no: nel file non compare una riga di conversazione', async () => {
        const testo = await talosBackupFileText(BUNDLE as never, 'la passphrase')
        expect(testo).not.toContain('Q3 riservato')
        expect(testo).not.toContain('"id":"s1"')
    }, 30_000)

    it('e un file che non è nostro viene rifiutato subito', () => {
        for (const cattivo of ['', '{}', 'non json', '{"talos":"altro","body":"x"}']) {
            expect(() => talosReadBackupHeader(cattivo), cattivo)
                .toThrow(TalosBackupFileError)
        }
    })
})

describe('l\'apertura', () => {
    it('con la passphrase giusta restituisce le sezioni', async () => {
        const testo = await talosBackupFileText(BUNDLE as never, 'giusta')
        const aperto = await talosOpenBackupFile(testo, 'giusta')
        expect(aperto.payload.sessions).toBe('[{"id":"s1","title":"Q3 riservato"}]')
    }, 30_000)

    it('con quella sbagliata non apre', async () => {
        const testo = await talosBackupFileText(BUNDLE as never, 'giusta')
        await expect(talosOpenBackupFile(testo, 'sbagliata'))
            .rejects.toMatchObject({ code: 'TALOS_BACKUP_OPEN_FAILED' })
    }, 30_000)
})
