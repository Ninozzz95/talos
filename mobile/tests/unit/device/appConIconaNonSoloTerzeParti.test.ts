import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⛔⛔ L'ELENCO DELLE APP VEDEVA SOLO QUELLE INSTALLATE DALLA PERSONA.
 *
 * Qui c'era `cmd package list packages **-3**`, e `-3` significa «solo le app
 * di terze parti». Tutto il preinstallato — calcolatrice, orologio,
 * fotocamera, telefono, impostazioni — restava invisibile: cioè esattamente le
 * app che una persona nomina quando dice «apri…».
 *
 * MISURATO sul Pad il 2026-08-10, dallo stesso ponte:
 *
 * ```
 *   con -3 (quello che TALOS vedeva)     49
 *   tutti i pacchetti                   439
 *   app con un'icona da toccare          68
 * ```
 *
 * E provato in chat con la chiave: «Apri la calcolatrice» →
 * «Non trovo un'app Calcolatrice installata sul telefono», mentre
 * `com.oneplus.calculator/com.android.calculator2.Calculator` è installata e
 * ha la sua attività di avvio.
 *
 * ⭐ La domanda giusta allinea ELENCO e APERTURA: l'apertura passa da
 * `getLaunchIntentForPackage`, che apre esattamente le app con un'attività
 * MAIN/LAUNCHER — le stesse dichiarate in `<queries>`. Prima i due lati
 * vedevano due mondi diversi, e un assistente che nomina una cosa e poi nega
 * che esista è peggio di uno che non la nomina.
 */

const finto = vi.hoisted(() => ({
    comandi: [] as string[][],
    uscita: '',
    ok: true,
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))
vi.mock('@/lib/device/devicePlugin', () => ({ TalosDeviceBridge: {} }))
vi.mock('@/lib/device/privilegedShell', () => ({
    talosPrivilegedReason: () => null,
    talosPrivilegedReady: async () => true,
    talosRunAsShell: async (comando: readonly string[]) => {
        finto.comandi.push([...comando])
        return { ok: finto.ok, output: finto.uscita, reason: finto.ok ? undefined : 'no' }
    },
}))

import { createTalosPrivilegedSources } from '@/lib/device/privilegedSources'

beforeEach(() => {
    finto.comandi = []
    finto.uscita = ''
    finto.ok = true
})

describe('⛔ le app che si possono APRIRE, non quelle «di terze parti»', () => {
    it('NON chiede più il filtro -3, e chiede le attività MAIN/LAUNCHER', async () => {
        const fonti = createTalosPrivilegedSources()!
        await fonti.listApps!()
        const comando = finto.comandi[0]!.join(' ')
        expect(comando, 'il filtro -3 nasconde tutto il preinstallato').not.toContain('-3')
        expect(comando).toContain('query-activities')
        expect(comando).toContain('android.intent.category.LAUNCHER')
    })

    it('estrae il PACCHETTO, una volta sola e in ordine', async () => {
        // L'uscita vera del Pad: intestazioni, righe di attributi, e le righe
        // `pacchetto/attività` in mezzo.
        finto.uscita = [
            '68 activities found:',
            '  Activity #0:',
            '    priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=true',
            '    com.android.settings/.Settings',
            '  Activity #1:',
            '    com.oneplus.calculator/com.android.calculator2.Calculator',
            '  Activity #2:',
            '    com.android.settings/.OtherEntry',
        ].join('\n')

        const fonti = createTalosPrivilegedSources()!
        const r = await fonti.listApps!()

        expect(r.done).toBe(true)
        expect(r.output!.split('\n'), 'una app con due icone non si conta due volte').toEqual([
            'com.android.settings',
            'com.oneplus.calculator',
        ])
    })

    it('⛔ la calcolatrice del Pad — il caso che ha trovato il difetto — c\'è', async () => {
        finto.uscita = '    com.oneplus.calculator/com.android.calculator2.Calculator\n'
        const fonti = createTalosPrivilegedSources()!
        const r = await fonti.listApps!()
        expect(r.output).toContain('com.oneplus.calculator')
    })

    it('se il ponte non risponde si DICE, non si finge un elenco vuoto', async () => {
        finto.ok = false
        const fonti = createTalosPrivilegedSources()!
        const r = await fonti.listApps!()
        expect(r.done).toBe(false)
        expect(r.reason).toBeTruthy()
    })
})
