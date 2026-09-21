import { describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createTalosVaultService, talosRigaPrometteUnFile } from '@/services/talosVaultService'
import type { TalosAttachmentAnalysisClient } from '@/services/attachmentAnalysisClient'
import type { TalosAttachmentFileStore } from '@/services/attachmentFileStore'

/**
 * ⛔⛔ LA DIFESA CHE AVEVA MARCATO 22 RIGHE SANE, RIFATTA CON LA DOMANDA GIUSTA.
 *
 * La prima versione chiedeva «questa riga ha un file su disco?» e marcava
 * `failed` chi rispondeva no. Sul Pad, il 2026-08-08: **22 righe sane
 * marcate**. `existsPrivate` diceva il vero — era la DOMANDA a essere
 * sbagliata.
 *
 * ⛔ Un allarme che sbaglia è un allarme spento: ventidue falsi insegnano a non
 * credere al vero.
 *
 * ⇒ La domanda giusta è **«questa riga PROMETTE un file, e la promessa
 * regge?»**, e la risposta è nel contratto dello schema — misurato il
 * 2026-08-10 leggendo le due sole strade che creano una riga:
 *
 * ```
 *   pending   + private_uri ''   la riga nasce PRIMA dei byte
 *   available + percorso pieno   l'unica che promette qualcosa
 *   failed    + private_uri ''   la copia è fallita, ed è dichiarato
 *   revoked                      tolto apposta
 * ```
 *
 * ⛔ E il test di allora, `ORFANA-02`, PASSAVA: la finzione di `existsPrivate`
 * rispondeva «sì» per ogni riga sana, mentre quella vera risponde «no» anche
 * per le righe che un file non l'hanno mai avuto. Difendeva l'idea che avevo
 * del mondo, non il mondo. ⇒ Qui la finzione risponde **no per default**, che
 * è la realtà scomoda, e sono le righe sane a dover sopravvivere lo stesso.
 */

const ANALISI: TalosAttachmentAnalysisClient = {
    analyze: vi.fn().mockResolvedValue({
        mediaType: 'text/plain', extension: 'txt', sha256: 'x',
        extractedText: '', pageCount: null, sizeBytes: 1,
    }),
}

function servizio(esiste: (uri: string) => Promise<boolean> | boolean) {
    const repository = createMemoryChatRepository({ now: () => '2026-08-10T00:00:00.000Z' })
    const fileStore = {
        copyToPrivate: vi.fn(),
        readPrivate: vi.fn().mockResolvedValue(new Uint8Array([1])),
        deletePrivate: vi.fn(),
        existsPrivate: vi.fn(async (uri: string) => esiste(uri)),
    } as unknown as TalosAttachmentFileStore
    const service = createTalosVaultService({
        repository,
        fileStore,
        analysisClient: ANALISI,
        idFactory: () => 'nuovo',
        now: () => '2026-08-10T00:00:00.000Z',
    } as never)
    return { repository, fileStore, service }
}

async function riga(repository: ReturnType<typeof createMemoryChatRepository>, r: {
    id: string, status: string, private_uri: string,
}) {
    await repository.createVaultFile({
        id: r.id,
        display_name: `${r.id}.txt`,
        media_type: 'text/plain',
        size_bytes: 1,
        private_uri: r.private_uri,
        status: r.status,
        trust: 'untrusted',
        sha256: null,
        extracted_text: null,
        failure_code: null,
        created_at: '2026-08-10T00:00:00.000Z',
    } as never)
}

describe('quale riga PROMETTE un file', () => {
    it('solo «available» con un percorso: tutto il resto non promette niente', () => {
        expect(talosRigaPrometteUnFile({ status: 'available', private_uri: 'a/b.txt' })).toBe(true)
        // ⛔ Queste quattro sono le righe che i 22 falsi avevano marcato.
        expect(talosRigaPrometteUnFile({ status: 'pending', private_uri: '' })).toBe(false)
        expect(talosRigaPrometteUnFile({ status: 'failed', private_uri: '' })).toBe(false)
        expect(talosRigaPrometteUnFile({ status: 'revoked', private_uri: '' })).toBe(false)
        expect(talosRigaPrometteUnFile({ status: 'available', private_uri: '   ' }),
            'un percorso di soli spazi non è un percorso').toBe(false)
    })
})

describe('⛔ la riconciliazione marca SOLO le promesse tradite', () => {
    it('una riga «available» il cui file non c\'è più diventa failed, col motivo', async () => {
        const { repository, service } = servizio(() => false)
        await riga(repository, { id: 'perso', status: 'available', private_uri: 'talos-vault/files/perso.txt' })

        await service.reconcilePending()

        const dopo = await repository.getVaultFile('perso')
        expect(dopo?.status).toBe('failed')
        expect(dopo?.failure_code).toBe('TALOS_VAULT_FILE_MISSING')
        expect(dopo?.private_uri, 'e il percorso morto non resta in giro').toBe('')
    })

    it('⛔⛔ I VENTIDUE: le righe che un file NON LO PROMETTONO restano intatte', async () => {
        /*
         * Il deposito risponde «no» a tutto — la realtà scomoda che aveva
         * prodotto i falsi. Queste righe devono sopravvivere lo stesso, perché
         * non hanno mai promesso niente.
         */
        const { repository, service } = servizio(() => false)
        await riga(repository, { id: 'fallita', status: 'failed', private_uri: '' })
        await riga(repository, { id: 'sospesa', status: 'pending', private_uri: '' })

        await service.reconcilePending()

        expect((await repository.getVaultFile('fallita'))?.failure_code,
            'una riga già fallita non si ri-accusa').toBeNull()

        /*
         * ⛔ La riga `pending` FINISCE in `failed` — ma per la strada VECCHIA,
         * quella che riprova l'analisi e non trova i byte, non per la difesa
         * nuova. La distinzione sta nel motivo, e conta: se un giorno
         * `TALOS_VAULT_FILE_MISSING` comparisse qui, vorrebbe dire che la difesa
         * ha ricominciato a guardare righe che non promettono niente — cioè i
         * ventidue, di nuovo.
         */
        const sospesa = await repository.getVaultFile('sospesa')
        expect(sospesa?.failure_code).not.toBe('TALOS_VAULT_FILE_MISSING')
    })

    it('una riga sana con il suo file non viene toccata', async () => {
        const { repository, service } = servizio(() => true)
        await riga(repository, { id: 'sana', status: 'available', private_uri: 'talos-vault/files/sana.txt' })

        await service.reconcilePending()

        const dopo = await repository.getVaultFile('sana')
        expect(dopo?.status).toBe('available')
        expect(dopo?.private_uri).toBe('talos-vault/files/sana.txt')
    })

    it('⛔ se non si riesce nemmeno a CHIEDERE, non si accusa', async () => {
        // Un errore del deposito non è la prova che il file manchi. Marcare su
        // un dubbio è esattamente come sono nati i ventidue.
        const { repository, service } = servizio(() => { throw new Error('deposito rotto') })
        await riga(repository, { id: 'dubbia', status: 'available', private_uri: 'talos-vault/files/dubbia.txt' })

        await service.reconcilePending()

        expect((await repository.getVaultFile('dubbia'))?.status).toBe('available')
    })
})
