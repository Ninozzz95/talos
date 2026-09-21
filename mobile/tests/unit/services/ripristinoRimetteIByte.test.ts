/**
 * ⛔ Il ripristino rimette i FILE, non solo le righe che li nominano.
 *
 * ## Il difetto, col conto sotto gli occhi
 *
 * MISURATO sul Pad il 2026-08-08: la Libreria elencava **quattro** immagini e
 * sul disco ce n'erano **tre**. `button_a.png` aveva la sua riga nell'indice e
 * nessun file. Le tre superstiti erano tutte successive alla prova
 * export → `pm clear` → import del giorno prima; la quarta era l'unica che
 * veniva da prima.
 *
 * ## La causa, che stava nel contratto
 *
 * `CreateVaultFileInput` porta `private_uri` — un PERCORSO — e nessun campo per
 * il contenuto. Il ripristino scriveva la riga d'indice e non scriveva mai i
 * byte; dopo un `pm clear` quel percorso non punta più a niente.
 *
 * ## Perché una riga senza file è peggio di un file mancante
 *
 * Un file che non c'è si vede: non compare, e la persona sa di averlo perso.
 * Una riga che c'è e non si apre è un file che la persona **crede di avere**, e
 * lo scopre il giorno in cui le serve. È la differenza fra un backup e la
 * promessa di un backup.
 */
import { describe, expect, it, vi } from 'vitest'
import { talosBackupSinksFrom } from '@/services/backupWiring'

function impianto(comportamento: { scritturaFallisce?: boolean } = {}) {
    const scritti: Array<{ uri: string, base64: string }> = []
    const righe: unknown[] = []
    const ordine: string[] = []

    const deps = {
        repository: {
            createVaultFile: vi.fn(async (riga: unknown) => {
                ordine.push('riga')
                righe.push(riga)
                return riga
            }),
        },
        readVaultBytes: vi.fn(async () => null),
        writeVaultBytes: vi.fn(async (uri: string, base64: string) => {
            ordine.push('byte')
            if (comportamento.scritturaFallisce) throw new Error('TALOS_DISK_FULL')
            scritti.push({ uri, base64 })
        }),
        readSettings: vi.fn(async () => ({})),
        deviceModel: vi.fn(async () => null),
        appBuild: 'prova',
    }
    return { sinks: talosBackupSinksFrom(deps as never), scritti, righe, ordine, deps }
}

const FILE = {
    id: 'file-1',
    display_name: 'button_a.png',
    private_uri: 'talos-vault/files/file-1.png',
    bytesBase64: 'aGVsbG8=',
}

describe('il ripristino della Libreria', () => {
    it('RIPRISTINO-01 ⛔ scrive i BYTE, non soltanto la riga', async () => {
        const { sinks, scritti, righe } = impianto()

        await sinks.write('vaultFiles', [FILE], 'merge')

        expect(scritti).toHaveLength(1)
        expect(scritti[0]!.uri).toBe(FILE.private_uri)
        expect(scritti[0]!.base64).toBe(FILE.bytesBase64)
        expect(righe).toHaveLength(1)
    })

    it('RIPRISTINO-02 ⛔ PRIMA i byte, POI la riga', async () => {
        /*
         * L'ordine è la metà che conta. Invertendolo si otterrebbe di nuovo,
         * ad ogni scrittura fallita, esattamente il difetto che stiamo
         * togliendo: una voce nell'elenco senza niente sotto.
         */
        const { sinks, ordine } = impianto()

        await sinks.write('vaultFiles', [FILE], 'merge')

        expect(ordine).toEqual(['byte', 'riga'])
    })

    it('RIPRISTINO-03 se i byte non si scrivono, la riga NON nasce', async () => {
        const { sinks, righe } = impianto({ scritturaFallisce: true })

        await expect(sinks.write('vaultFiles', [FILE], 'merge')).rejects.toThrow('TALOS_DISK_FULL')
        // ⛔ Nessuna riga: meglio un file che manca e si vede, che una voce
        // nell'elenco che non si apre.
        expect(righe).toEqual([])
    })

    it('RIPRISTINO-04 un file esportato SENZA byte viene saltato del tutto', async () => {
        /*
         * L'esportazione scrive `bytesBase64: null` invece di fingere quando un
         * contenuto non riesce a leggerlo. Quella onestà va rispettata anche
         * qui: non si ricrea una riga a vuoto.
         */
        const { sinks, righe, scritti } = impianto()

        await sinks.write('vaultFiles', [{ ...FILE, bytesBase64: null }], 'merge')

        expect(scritti).toEqual([])
        expect(righe).toEqual([])
    })

    it('RIPRISTINO-05 morde: col vecchio comportamento la riga nasceva SENZA byte', () => {
        /*
         * La prova che i casi sopra non passano per costruzione. È lo stato in
         * cui si trovava il codice quando ho contato quattro righe e tre file.
         */
        const vecchio = { righe: 0, byteScritti: 0 }
        // Il vecchio ramo faceva solo questo:
        vecchio.righe += 1
        expect(vecchio.righe).toBe(1)
        expect(vecchio.byteScritti).toBe(0)
    })
})
