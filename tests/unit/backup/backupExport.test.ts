import { describe, expect, it, vi } from 'vitest'
import {
    TalosBackupExportError,
    talosCreateBackupBundle,
    talosVerifyBackupBundle,
    type TalosBackupSources,
} from '@/services/backupExport'

/**
 * L'export, provato dove gli export mentono.
 *
 * Un backup si giudica il giorno del ripristino, cioè quando l'originale non
 * c'è più. Le prove qui sotto guardano le tre bugie che rendono un backup
 * inutile proprio quel giorno: una sezione saltata in silenzio, le chiavi
 * incluse senza dirlo, e un manifesto che dichiara qualcosa che il file non ha.
 */

function fonti(patch: Partial<TalosBackupSources> = {}): TalosBackupSources {
    const repository = {
        listSessions: vi.fn(async () => [{ id: 's1', title: 'Q3' }, { id: 's2', title: 'Note' }]),
        listMessages: vi.fn(async (id: string) => [{ id: `${id}-m1`, session_id: id, content: 'ciao' }]),
        listSessionAttachmentFileIds: vi.fn(async () => ['f1']),
        listVaultFiles: vi.fn(async () => [{ id: 'f1', name: 'fattura.pdf' }]),
        listNotes: vi.fn(async () => [{ id: 'n1', title: 'Idee' }]),
        listTasks: vi.fn(async () => [{ id: 't1', title: 'Chiamare' }]),
        listMemories: vi.fn(async () => [{ id: 'me1', title: 'Preferenze' }]),
        listResearchRuns: vi.fn(async () => []),
    } as never

    return {
        repository,
        readVaultBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
        readProviderKeys: vi.fn(async () => ({ openrouter: 'sk-or-v1-segreto' })),
        readSettings: vi.fn(async () => ({ tone: 'balanced' })),
        deviceModel: vi.fn(async () => 'OPD2415'),
        appBuild: 'test-build',
        now: () => '2026-08-07T12:00:00.000Z',
        ...patch,
    }
}

describe('cosa finisce dentro', () => {
    it('legge tutte le sezioni che il dispositivo ha', async () => {
        const bundle = await talosCreateBackupBundle(fonti())
        expect(Object.keys(bundle.manifest.sections).sort()).toEqual([
            'attachments', 'memories', 'messages', 'notes',
            'researchRuns', 'sessions', 'settings', 'tasks', 'vaultFiles',
        ])
        expect(bundle.manifest.sections.sessions?.count).toBe(2)
        // Un messaggio per sessione, due sessioni: i messaggi si leggono PER
        // sessione, e la somma dev'essere quella.
        expect(bundle.manifest.sections.messages?.count).toBe(2)
    })

    /**
     * ⛔ Le chiavi sono FUORI per difetto.
     *
     * Un backup senza chiavi si appoggia ovunque; uno con le chiavi È una
     * chiave. Chi lo vuole lo chiede.
     */
    it('per difetto NON include le chiavi, e lo dichiara', async () => {
        const bundle = await talosCreateBackupBundle(fonti())
        expect(bundle.manifest.sections.providerKeys).toBeUndefined()
        expect(bundle.manifest.containsSecrets).toBe(false)
        expect(JSON.stringify(bundle.payload)).not.toContain('sk-or-v1-segreto')
    })

    it('quando le include, il manifesto lo dice a chiare lettere', async () => {
        const bundle = await talosCreateBackupBundle(fonti(), { includeProviderKeys: true })
        expect(bundle.manifest.sections.providerKeys?.count).toBe(1)
        expect(bundle.manifest.containsSecrets).toBe(true)
    })

    /**
     * Un file della Libreria di cui non si leggono i byte è un riferimento che
     * al ripristino punterebbe al nulla. Si dichiara `null` invece di far finta.
     */
    it('un file illeggibile viene dichiarato, non taciuto', async () => {
        const bundle = await talosCreateBackupBundle(fonti({
            readVaultBytes: vi.fn(async () => null),
        }))
        const files = JSON.parse(bundle.payload.vaultFiles!)
        expect(files[0].bytesBase64).toBeNull()
        expect(files[0].name).toBe('fattura.pdf')
    })
})

describe('⛔ quello che NON si scrive', () => {
    /**
     * La tentazione è saltare la sezione e continuare: il backup verrebbe
     * scritto, l'utente vedrebbe «fatto», e il giorno del ripristino
     * mancherebbero le note. Un errore che si scopre un anno dopo, quando
     * l'originale non c'è più.
     */
    it('se una sezione non si legge, il backup NON viene scritto', async () => {
        const rotto = fonti()
        ;(rotto.repository as never as { listNotes: () => Promise<never> }).listNotes =
            vi.fn(async () => { throw new Error('vault chiuso') })

        await expect(talosCreateBackupBundle(rotto)).rejects.toBeInstanceOf(TalosBackupExportError)
        await expect(talosCreateBackupBundle(rotto)).rejects.toMatchObject({
            code: 'TALOS_BACKUP_SECTION_UNREADABLE',
            section: 'notes',
        })
    })

    it('e il messaggio dice PERCHÉ, invece di un codice muto', async () => {
        const rotto = fonti()
        ;(rotto.repository as never as { listTasks: () => Promise<never> }).listTasks =
            vi.fn(async () => { throw new Error('x') })
        await expect(talosCreateBackupBundle(rotto)).rejects.toThrow(/partial backup is worse than none/i)
    })
})

describe('⭐ si rilegge prima di consegnarlo', () => {
    /**
     * «L'ho scritto» e «l'ho riletto e torna» sono due frasi diverse, e solo la
     * seconda è una verifica. Stessa regola dei documenti generati: si riapre il
     * file prima di consegnarlo.
     */
    it('un backup sano si verifica', async () => {
        const bundle = await talosCreateBackupBundle(fonti())
        expect(await talosVerifyBackupBundle(bundle)).toEqual({ ok: true, mismatched: [] })
    })

    it('un contenuto manomesso viene visto', async () => {
        const bundle = await talosCreateBackupBundle(fonti())
        bundle.payload.notes = '[{"id":"n1","title":"Manomesso"}]'
        const esito = await talosVerifyBackupBundle(bundle)
        expect(esito.ok).toBe(false)
        expect(esito.mismatched).toContain('notes')
    })

    /**
     * ⛔ Il buco che la sola verifica delle impronte non vedrebbe: una sezione
     * dichiarata nel manifesto e ASSENTE dal contenuto. Il conto delle impronte
     * tornerebbe — non c'è niente da confrontare — e mancherebbe una sezione.
     */
    it('e una sezione dichiarata ma assente pure', async () => {
        const bundle = await talosCreateBackupBundle(fonti())
        delete bundle.payload.tasks
        const esito = await talosVerifyBackupBundle(bundle)
        expect(esito.ok).toBe(false)
        expect(esito.mismatched).toContain('tasks')
    })
})
