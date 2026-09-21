import { describe, expect, it } from 'vitest'
import {
    TALOS_BACKUP_FORMAT,
    TALOS_BACKUP_SECRET_SECTIONS,
    talosParseBackupManifest,
    talosPlanRestore,
    talosRestoreTotals,
    type TalosBackupManifest,
} from '@/lib/backup/bundle'

/**
 * Il backup, provato dove si rompono i backup.
 *
 * Owner 2026-08-07, correggendosi subito dopo aver detto che disinstallare non
 * era un problema: «**dobbiamo usare un metodo di export**». La chiave di firma
 * dell'APK è persa, e rifarla significa disinstallare — cioè perdere chat,
 * Libreria, memorie e chiavi, se non c'è un modo di portarle fuori.
 *
 * Queste prove guardano le tre cose che rendono un backup una promessa vuota:
 * un manifesto indulgente, un ripristino che non dice cosa farà, e un file che
 * contiene chiavi senza dirlo.
 */

const DIGEST = 'a'.repeat(64)

function manifesto(patch: Partial<TalosBackupManifest> = {}): TalosBackupManifest {
    return {
        format: TALOS_BACKUP_FORMAT,
        appBuild: '82d2cee6 @ 2026-08-07T10:00:00.000Z',
        createdAt: '2026-08-07T10:00:00.000Z',
        deviceModel: 'OPD2415',
        containsSecrets: true,
        sections: {
            sessions: { count: 12, digest: DIGEST },
            messages: { count: 340, digest: DIGEST },
            providerKeys: { count: 5, digest: DIGEST },
        },
        ...patch,
    }
}

describe('⛔ il manifesto fallisce CHIUSO', () => {
    /**
     * Un file di backup arriva dal disco, da un cloud, da una chat — cioè da
     * fuori, come una pagina web. Un import indulgente è una porta.
     */
    it('apre un manifesto valido', () => {
        expect(talosParseBackupManifest(JSON.parse(JSON.stringify(manifesto())))).not.toBeNull()
    })

    it('rifiuta un formato di un\'altra versione, invece di provarci', () => {
        expect(talosParseBackupManifest({ ...manifesto(), format: 2 })).toBeNull()
        expect(talosParseBackupManifest({ ...manifesto(), format: '1' })).toBeNull()
    })

    /**
     * ⛔ La riga che conta di più: una sezione che non conosciamo NON si ignora.
     *
     * Ignorarla vorrebbe dire aprire il backup di una versione futura, scrivere
     * ciò che si è capito e buttare il resto — cioè perdere dati in silenzio,
     * nel momento in cui l'utente crede di averli appena recuperati.
     */
    it('rifiuta una sezione sconosciuta, invece di saltarla', () => {
        const futuro = manifesto()
        const conNovita = {
            ...futuro,
            sections: { ...futuro.sections, calendarEvents: { count: 3, digest: DIGEST } },
        }
        expect(talosParseBackupManifest(conNovita)).toBeNull()
    })

    it('rifiuta un\'impronta che non è un\'impronta', () => {
        for (const cattiva of ['', 'nonesadecimale', 'A'.repeat(64), 'a'.repeat(63)]) {
            const rotto = { ...manifesto(), sections: { sessions: { count: 1, digest: cattiva } } }
            expect(talosParseBackupManifest(rotto), cattiva).toBeNull()
        }
    })

    it('rifiuta un conteggio che non è un intero non negativo', () => {
        for (const cattivo of [-1, 1.5, '3', null]) {
            const rotto = { ...manifesto(), sections: { sessions: { count: cattivo, digest: DIGEST } } }
            expect(talosParseBackupManifest(rotto), String(cattivo)).toBeNull()
        }
    })

    it('rifiuta una data che non è una data', () => {
        expect(talosParseBackupManifest({ ...manifesto(), createdAt: 'ieri' })).toBeNull()
    })
})

describe('⭐ il ripristino si annuncia PRIMA', () => {
    /**
     * È il piano (D15) applicato al backup. Nessuno degli export in circolazione
     * lo fa: si preme «importa» e si scopre dopo cosa è cambiato. Il numero che
     * fa decidere è `willOverwrite`, e va mostrato prima del tocco.
     */
    it('con «unisci» non sovrascrive niente, e scrive solo ciò che manca', () => {
        const piano = talosPlanRestore(
            manifesto(),
            { sessions: 8, messages: 200, providerKeys: 5 },
            { sessions: 4, messages: 120, providerKeys: 5 },
            'merge',
        )
        const sessioni = piano.steps.find((passo) => passo.section === 'sessions')!
        expect(sessioni.incoming).toBe(12)
        expect(sessioni.willWrite).toBe(8)
        expect(sessioni.willOverwrite).toBe(0)
        expect(talosRestoreTotals(piano).willOverwrite).toBe(0)
    })

    it('con «sostituisci» dice ESATTAMENTE quante ne sovrascrive', () => {
        const piano = talosPlanRestore(
            manifesto(),
            { sessions: 8, messages: 200, providerKeys: 5 },
            { sessions: 4, messages: 120, providerKeys: 5 },
            'replace',
        )
        expect(piano.steps.find((passo) => passo.section === 'sessions')!.willOverwrite).toBe(4)
        // 4 sessioni + 120 messaggi + 5 chiavi: il numero che fa fermare la mano.
        expect(talosRestoreTotals(piano).willOverwrite).toBe(129)
    })

    it('e non conta collisioni che il file non contiene', () => {
        // Il dispositivo dice 100 collisioni su 12 righe in arrivo: impossibile.
        // Se il conto non venisse limitato, «sostituisci» direbbe di sovrascrivere
        // più righe di quante ne stia scrivendo.
        const piano = talosPlanRestore(manifesto(), { sessions: 500 }, { sessions: 100 }, 'replace')
        const sessioni = piano.steps.find((passo) => passo.section === 'sessions')!
        expect(sessioni.willOverwrite).toBe(12)
        expect(sessioni.willWrite).toBe(12)
    })

    it('salta le sezioni che il backup non contiene, invece di inventarle a zero', () => {
        const piano = talosPlanRestore(manifesto(), {}, {}, 'merge')
        expect(piano.steps.map((passo) => passo.section)).toEqual(['sessions', 'messages', 'providerKeys'])
    })

    /**
     * L'ordine non è estetico: al ripristino le sezioni si scrivono in
     * quest'ordine, e un messaggio scritto prima della sua sessione è una riga
     * orfana.
     */
    it('mantiene l\'ordine dichiarato, non quello del file', () => {
        const disordinato = manifesto({
            sections: {
                providerKeys: { count: 1, digest: DIGEST },
                messages: { count: 1, digest: DIGEST },
                sessions: { count: 1, digest: DIGEST },
            },
        })
        const piano = talosPlanRestore(disordinato, {}, {}, 'merge')
        expect(piano.steps.map((passo) => passo.section)).toEqual(['sessions', 'messages', 'providerKeys'])
    })
})

describe('⛔ i segreti si dichiarano', () => {
    /**
     * Un file che contiene le chiavi dei provider e non lo dice è una trappola
     * per chi lo appoggia su un cloud o lo manda in una chat di supporto.
     */
    it('le chiavi dei provider sono una sezione segreta', () => {
        expect(TALOS_BACKUP_SECRET_SECTIONS).toContain('providerKeys')
    })

    it('e il manifesto porta la dichiarazione, leggibile senza aprire il file', () => {
        const letto = talosParseBackupManifest(JSON.parse(JSON.stringify(manifesto())))
        expect(letto?.containsSecrets).toBe(true)
    })
})
