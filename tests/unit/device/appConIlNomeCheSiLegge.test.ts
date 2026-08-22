import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⛔⛔ DUE PROVIDER SU TRE DICEVANO CHE TELEGRAM NON ERA INSTALLATO.
 *
 * MISURATO sul Pad il 2026-08-10, stesso telefono, stessa domanda «Apri
 * Telegram», con Telegram X installato e avviabile:
 *
 * ```
 *   anthropic/claude-sonnet-5   «Non ho trovato Telegram»          ⛔
 *   openai/gpt-5.6              «Non trovo Telegram»               ⛔
 *   google/gemini-3.6-flash     apre org.thunderdog.challegram     ✅
 * ```
 *
 * Non è pigrizia dei modelli: l'elenco passava dal ponte e restituiva **solo
 * nomi di pacchetto**. `org.thunderdog.challegram` non contiene la parola
 * «telegram», e dei 65 pacchetti avviabili molti non dicono cosa sono —
 * `cn.wps.moffice_eng`, `com.wispr.flowapp`, `com.binary.hyperdroid`. Dare un
 * id opaco e pretendere che il modello ne conosca la mappa è chiedergli di
 * indovinare.
 *
 * ⭐ E la descrizione del tool prometteva già «with the name the user sees»:
 * la promessa c'era, il dato no.
 *
 * La cura passa dal `PackageManager` dell'app — `<queries>` per MAIN/LAUNCHER
 * è già nel manifest — quindi dà l'etichetta E non vuole nessun privilegio:
 * l'elenco funziona anche su un telefono dove il ponte non si accenderà mai.
 */

const finto = vi.hoisted(() => ({
    comandi: [] as string[][],
    uscitaShell: '',
    shellOk: true,
    nativo: null as null | { done: boolean, output?: string, reason?: string },
    nativoEsplode: false,
    chiamateNative: 0,
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))
vi.mock('@/lib/device/devicePlugin', () => ({
    TalosDeviceBridge: {
        listApps: async () => {
            finto.chiamateNative += 1
            if (finto.nativoEsplode) throw new Error('plugin assente')
            return finto.nativo
        },
    },
}))
vi.mock('@/lib/device/privilegedShell', () => ({
    talosPrivilegedReason: () => null,
    talosPrivilegedReady: async () => true,
    talosRunAsShell: async (comando: readonly string[]) => {
        finto.comandi.push([...comando])
        return { ok: finto.shellOk, output: finto.uscitaShell, reason: finto.shellOk ? undefined : 'no' }
    },
}))

import { createTalosPrivilegedSources } from '@/lib/device/privilegedSources'

beforeEach(() => {
    finto.comandi = []
    finto.uscitaShell = ''
    finto.shellOk = true
    finto.nativo = null
    finto.nativoEsplode = false
    finto.chiamateNative = 0
})

const CON_ETICHETTE = [
    'Calcolatrice\tcom.oneplus.calculator',
    'Impostazioni\tcom.android.settings',
    'Telegram X\torg.thunderdog.challegram',
    'WPS Office\tcn.wps.moffice_eng',
].join('\n')

describe('⛔ le app hanno il NOME che la persona legge, non solo il pacchetto', () => {
    it('il caso che ha trovato il difetto: cercare «telegram» trova challegram', async () => {
        finto.nativo = { done: true, output: CON_ETICHETTE }
        const fonti = createTalosPrivilegedSources()!
        const r = await fonti.listApps!()

        const trovate = r.output!.split('\n')
            .filter((riga) => riga.toLowerCase().includes('telegram'))
        expect(
            trovate,
            'il pacchetto non contiene «telegram»: senza etichetta la ricerca non trova niente',
        ).toEqual(['Telegram X\torg.thunderdog.challegram'])
    })

    it('ogni riga porta il pacchetto DOPO una tabulazione, che è ciò che si apre', async () => {
        finto.nativo = { done: true, output: CON_ETICHETTE }
        const fonti = createTalosPrivilegedSources()!
        const r = await fonti.listApps!()
        for (const riga of r.output!.split('\n')) {
            const [etichetta, pacchetto, ...resto] = riga.split('\t')
            expect(resto, 'una sola tabulazione per riga').toHaveLength(0)
            expect(etichetta.trim().length).toBeGreaterThan(0)
            expect(pacchetto, 'il pacchetto è un id, non una frase').toMatch(/^[a-z][\w.]*\.[\w.]+$/)
        }
    })

    it('⛔ NON passa dal ponte quando il nativo risponde: l\'elenco non vuole privilegi', async () => {
        finto.nativo = { done: true, output: CON_ETICHETTE }
        const fonti = createTalosPrivilegedSources()!
        const r = await fonti.listApps!()

        expect(finto.chiamateNative).toBe(1)
        expect(finto.comandi, 'nessun comando di shell').toEqual([])
        expect(r.via, '«native» e «shell» non sono la stessa strada, e si dice quale').toBe('native')
    })

    it('se il nativo non c\'è si ripiega sul ponte, invece di non dire niente', async () => {
        finto.nativoEsplode = true
        finto.uscitaShell = '    com.oneplus.calculator/com.android.calculator2.Calculator\n'
        const fonti = createTalosPrivilegedSources()!
        const r = await fonti.listApps!()

        expect(r.done).toBe(true)
        expect(r.via).toBe('shell')
        expect(r.output).toContain('com.oneplus.calculator')
        expect(finto.comandi[0]!.join(' '), 'e il ripiego chiede comunque le app AVVIABILI').toContain('LAUNCHER')
    })

    it('un nativo che risponde «non fatto» non conta come elenco: si ripiega', async () => {
        finto.nativo = { done: false, reason: 'SecurityException' }
        finto.uscitaShell = '    com.android.settings/.Settings\n'
        const fonti = createTalosPrivilegedSources()!
        const r = await fonti.listApps!()
        expect(r.done).toBe(true)
        expect(r.via).toBe('shell')
    })

    it('se non risponde NESSUNO dei due si DICE, non si finge un elenco vuoto', async () => {
        finto.nativo = { done: true, output: '' }
        finto.shellOk = false
        const fonti = createTalosPrivilegedSources()!
        const r = await fonti.listApps!()
        expect(r.done).toBe(false)
        expect(r.reason).toBeTruthy()
    })
})
