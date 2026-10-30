import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * UNITA-01..15 (ASS-145, ASS-146, ASS-147; LEDGER-CONTRATTI-DISPOSITIVO-ASS-145-146-147-2026-10-28.md, OK del Desktop 28/10).
 *
 * L'audit v2 dell'owner sul OnePlus 13 col ponte attivo: tre attrezzi del telefono dicevano al modello un'unità e ne controllavano un'altra.
 *
 * - Timeout: la descrizione diceva secondi, il controllo voleva millisecondi (5 000-1 800 000), la lettura dava millisecondi senza dirlo.
 *   Owner: secondi, «Da 15 s a 30 minuti».
 * - Luminosità: «0-255», ma il OnePlus 13 legge 1352 e il Pad sale fino a 1745. Owner: percentuale come il cursore; con l'automatica
 *   accesa «Spegne l'automatica e la imposta», e lo dice.
 * - Risparmio: «Battery saver on.» senza rileggere, e Android lo rifiuta in silenzio col cavo attaccato
 *   (`BatterySaverStateMachine.java:820-822`). Owner: «Dice la verità e spiega».
 *
 * Misure: OnePlus 13 (Android 17) `cmd display get-brightness --unit percentage` → 79.22. Pad (Android 16): `--unit` non esiste,
 * `set-brightness <0..1>` resta fermo a 2, `BrightnessNormalMaximum=1745.0` in `dumpsys display`, `settings put screen_brightness` funziona.
 */

const finto = vi.hoisted(() => ({
    comandi: [] as string[][],
    /** Risposta per comando (le parole unite da spazi); quello che manca risponde ok con uscita vuota. */
    risposte: new Map<string, { ok: boolean, output: string }>(),
    /** Per le riletture che cambiano dopo la scrittura: se c'è, vince sulla mappa dal secondo uso in poi. */
    dopo: new Map<string, string>(),
    usati: new Map<string, number>(),
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))
vi.mock('@/lib/device/devicePlugin', () => ({ TalosDeviceBridge: { openSettingsScreen: async () => ({ done: false }) } }))
vi.mock('@/lib/device/privilegedShell', () => ({
    talosPrivilegedReason: (reason: string | undefined) => `motivo:${reason}`,
    talosPrivilegedReady: async () => true,
    talosRunAsShell: async (comando: readonly string[]) => {
        finto.comandi.push([...comando])
        const chiave = comando.join(' ')
        const volte = (finto.usati.get(chiave) ?? 0) + 1
        finto.usati.set(chiave, volte)
        if (volte > 1 && finto.dopo.has(chiave)) return { ok: true, output: finto.dopo.get(chiave)! }
        const r = finto.risposte.get(chiave)
        return r ? { ok: r.ok, output: r.output, reason: r.ok ? undefined : 'no' } : { ok: true, output: '' }
    },
}))

import { createTalosPrivilegedSources, SCREEN_TIMEOUT } from '@/lib/device/privilegedSources'
import { createTalosPrivilegedTools } from '@/lib/tools/privilegedTools'

const risponde = (comando: string, output: string, ok = true) => finto.risposte.set(comando, { ok, output })
const scritti = () => finto.comandi.filter((c) => c.includes('put') || c.includes('set-brightness')).map((c) => c.join(' '))

const ENERGIA_SPENTA = 'Battery saver state machine:\n  Enabled=false\n    full=false\n  mState=1\n'
const ENERGIA_ACCESA = 'Battery saver state machine:\n  Enabled=true\n    full=true\n  mState=2\n'
const SPINA = (usb: boolean) => `  AC powered: false\n  USB powered: ${usb}\n  Wireless powered: false\n  level: 89\n`

beforeEach(() => {
    finto.comandi = []
    finto.risposte = new Map()
    finto.dopo = new Map()
    finto.usati = new Map()
})

describe('ASS-145 il timeout dello schermo è in SECONDI', () => {
    it('UNITA-01 la costante dei limiti è quella dell\'owner: da 15 s a 30 minuti', () => {
        expect(SCREEN_TIMEOUT).toEqual({ minS: 15, maxS: 1800, msPerS: 1000 })
    })

    it('UNITA-02 30 secondi diventano 30000 ms, e l\'esito riporta il valore RILETTO', async () => {
        // la sola lettura è quella DOPO la scrittura
        risponde('settings get system screen_off_timeout', '30000\n')
        const r = await createTalosPrivilegedSources()!.systemSetting('screen_timeout', '30')
        expect(scritti()).toEqual(['settings put system screen_off_timeout 30000'])
        expect(r.done).toBe(true)
        expect(r.value).toBe('30')
        expect(r.output).toMatch(/30 seconds/u)
    })

    it('UNITA-03 la lettura dice secondi, non millisecondi', async () => {
        risponde('settings get system screen_off_timeout', '60000\n')
        const r = await createTalosPrivilegedSources()!.systemSetting('screen_timeout')
        expect(r.value).toBe('60')
        expect(r.output).toMatch(/60 seconds \(1 minute\)/u)
    })

    it('UNITA-04 30000 si rifiuta e dice che sembrano millisecondi: «send 30»', async () => {
        const r = await createTalosPrivilegedSources()!.systemSetting('screen_timeout', '30000')
        expect(r.done).toBe(false)
        expect(r.reason).toBe('value-out-of-range')
        expect(r.detail).toMatch(/SECONDS, from 15 to 1800/u)
        expect(r.detail).toMatch(/looks like milliseconds: send 30\./u)
        expect(scritti()).toEqual([])
    })

    it('UNITA-05 5 si rifiuta col minimo 15, senza parlare di millisecondi', async () => {
        const r = await createTalosPrivilegedSources()!.systemSetting('screen_timeout', '5')
        expect(r.done).toBe(false)
        expect(r.detail).toMatch(/from 15 to 1800/u)
        expect(r.detail).not.toMatch(/milliseconds/u)
    })
})

describe('ASS-146 la luminosità è in PERCENTUALE, come il cursore', () => {
    it('UNITA-06 Android 17: legge la percentuale e dice se l\'automatica è accesa', async () => {
        risponde('cmd display get-brightness --unit percentage', '79.22\n')
        risponde('settings get system screen_brightness_mode', '1\n')
        const r = await createTalosPrivilegedSources()!.systemSetting('brightness')
        expect(r.value).toBe('79')
        expect(r.output).toMatch(/79%/u)
        expect(r.output).toMatch(/Auto-brightness is on/u)
    })

    it('UNITA-07 con l\'automatica accesa la spegne, imposta la percentuale, rilegge, e lo dice', async () => {
        risponde('settings get system screen_brightness_mode', '1\n')
        risponde('cmd display get-brightness --unit percentage', '50.0\n')
        const r = await createTalosPrivilegedSources()!.systemSetting('brightness', '50')
        expect(scritti()).toEqual([
            'settings put system screen_brightness_mode 0',
            'cmd display set-brightness 50 --unit percentage',
        ])
        expect(r.done).toBe(true)
        expect(r.value).toBe('50')
        expect(r.output).toMatch(/50%/u)
        expect(r.output).toMatch(/turned auto-brightness off/u)
    })

    it('UNITA-08 Android 16 (il Pad): senza --unit usa la scala del telefono, lineare come il suo cursore, e dice «about»', async () => {
        risponde('cmd display get-brightness --unit percentage', 'Error: invalid displayId=--unit not int\n')
        risponde('cmd display set-brightness 50 --unit percentage', 'Error: invalid brightness\n')
        risponde('settings get system screen_brightness_mode', '0\n')
        risponde('dumpsys display', '  BrightnessNormalMaximum=1745.0\n  BrightnessRangeMaximum=2047.0\n')
        risponde('settings get system screen_brightness', '873\n')
        const r = await createTalosPrivilegedSources()!.systemSetting('brightness', '50')
        // misurato sul Pad: il cursore di OxygenOS 16 è lineare sul grezzo (872 → ~51%), quindi 50% = 1745 / 2 ≈ 873
        expect(scritti()).toEqual(['cmd display set-brightness 50 --unit percentage', 'settings put system screen_brightness 873'])
        expect(r.done).toBe(true)
        expect(r.output).toMatch(/about 50%/u)
    })

    it('UNITA-09 il grezzo senza scala nota non si spaccia MAI per 0-255', async () => {
        risponde('cmd display get-brightness --unit percentage', 'Error: invalid displayId=--unit not int\n')
        risponde('settings get system screen_brightness_mode', '0\n')
        risponde('dumpsys display', 'niente di utile\n')
        risponde('settings get system screen_brightness', '1240\n')
        const r = await createTalosPrivilegedSources()!.systemSetting('brightness')
        expect(r.output).toMatch(/raw value 1240/u)
        expect(r.output).not.toMatch(/0-255/u)
    })

    it('UNITA-10 150 si rifiuta: la percentuale va da 0 a 100', async () => {
        const r = await createTalosPrivilegedSources()!.systemSetting('brightness', '150')
        expect(r.done).toBe(false)
        expect(r.detail).toMatch(/PERCENT, from 0 to 100/u)
        expect(scritti()).toEqual([])
    })
})

describe('ASS-147 il risparmio energetico si RILEGGE', () => {
    it('UNITA-11 acceso e riletto acceso: fatto', async () => {
        risponde('dumpsys battery', SPINA(false))
        risponde('dumpsys power', ENERGIA_SPENTA)
        finto.dopo.set('dumpsys power', ENERGIA_ACCESA)
        const r = await createTalosPrivilegedSources()!.powerSaving(true)
        expect(scritti()).toEqual(['settings put global low_power 1'])
        expect(r.done).toBe(true)
        expect(r.via).toBe('shell')
    })

    it('UNITA-12 col cavo attaccato e riletto spento: la spiegazione è la carica', async () => {
        risponde('dumpsys battery', SPINA(true))
        risponde('dumpsys power', ENERGIA_SPENTA)
        const r = await createTalosPrivilegedSources()!.powerSaving(true)
        expect(scritti()).toEqual(['settings put global low_power 1'])
        expect(r.done).toBe(false)
        expect(r.reason).toBe('power-saver-while-charging')
    }, 5000)

    it('UNITA-12b col cavo attaccato ma acceso davvero (OxygenOS 16, misurato sul Pad): fatto, il cavo non si giudica prima', async () => {
        risponde('dumpsys battery', SPINA(true))
        risponde('dumpsys power', ENERGIA_SPENTA)
        finto.dopo.set('dumpsys power', ENERGIA_ACCESA)
        const r = await createTalosPrivilegedSources()!.powerSaving(true)
        expect(scritti()).toEqual(['settings put global low_power 1'])
        expect(r.done).toBe(true)
    })

    it('UNITA-13 scritto ma riletto spento: NON è fatto', async () => {
        risponde('dumpsys battery', SPINA(false))
        risponde('dumpsys power', ENERGIA_SPENTA)
        const r = await createTalosPrivilegedSources()!.powerSaving(true)
        expect(r.done).toBe(false)
        expect(r.reason).toBe('not-applied')
    }, 5000)

    it('UNITA-14 già acceso: non si riscrive e lo si dice', async () => {
        risponde('dumpsys battery', SPINA(false))
        risponde('dumpsys power', ENERGIA_ACCESA)
        const r = await createTalosPrivilegedSources()!.powerSaving(true)
        expect(scritti()).toEqual([])
        expect(r.done).toBe(true)
        expect(r.output).toMatch(/already on/u)
    })
})

describe('gli attrezzi dicono le unità vere al modello', () => {
    const fonti = {
        wifi: vi.fn(), bluetooth: vi.fn(), doNotDisturb: vi.fn(), airplane: vi.fn(), appUsage: vi.fn(), listApps: vi.fn(),
        ready: async () => true,
        reasonOf: (reason: string | undefined) => `motivo:${reason}`,
        powerSaving: vi.fn(async () => ({ done: false, via: 'none' as const, reason: 'not-applied' })),
        systemSetting: vi.fn(async () => ({ done: false, via: 'none' as const, reason: 'value-out-of-range', detail: 'screen_timeout is in SECONDS' })),
    }
    const attrezzo = (nome: string) => createTalosPrivilegedTools(fonti).find((t) => t.name === nome)!

    it('UNITA-15 la descrizione porta i limiti della costante, e niente «0-255»', () => {
        const d = attrezzo('device_system_setting').description
        expect(d).toMatch(new RegExp(`${SCREEN_TIMEOUT.minS}.*${SCREEN_TIMEOUT.maxS}`, 'u'))
        expect(d).toMatch(/percent/u)
        expect(d).not.toMatch(/0-255/u)
    })

    it('UNITA-16 il rifiuto passa al modello il dettaglio con l\'unità', async () => {
        const r = await attrezzo('device_system_setting').run({ setting: 'screen_timeout', value: '30000' } as never) as { ok: boolean, content: string }
        expect(r.ok).toBe(false)
        expect(r.content).toMatch(/SECONDS/u)
    })

    it('UNITA-17 risparmio non applicato: ok false e NESSUNA levetta', async () => {
        const r = await attrezzo('device_power_saving').run({ on: true } as never) as { ok: boolean, scheda?: unknown }
        expect(r.ok).toBe(false)
        expect(r.scheda).toBeUndefined()
    })
})
