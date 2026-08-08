import { Capacitor } from '@capacitor/core'
import {
    talosPrivilegedReason,
    talosPrivilegedReady,
    talosRunAsShell,
} from '@/lib/device/privilegedShell'
import { TalosDeviceBridge } from '@/lib/device/devicePlugin'
import type { TalosPrivilegedToolSources } from '@/lib/tools/privilegedTools'

/**
 * Le due strade di ogni capacità T2, e la regola che le tiene oneste.
 *
 * 1. **La shell**, via Shizuku: la cosa succede davvero.
 * 2. **Il pannello**, quando la shell non c'è: si apre il riquadro di sistema
 *    sopra TALOS e tocca la persona.
 *
 * ⛔ E la risposta dice **sempre quale delle due**. Un `via: 'panel'` che si
 * facesse passare per `'shell'` racconterebbe come conclusa una cosa che è solo
 * cominciata — che è il difetto peggiore del capitolo, misurato il 2026-08-08
 * quando il modello locale disse «torcia spenta» senza aver fatto niente.
 *
 * ## Perché il pannello non è un ripiego triste
 *
 * `Settings.Panel` compare **sopra** l'app che chiama, dal 2019: la persona
 * tocca un interruttore vero e resta dov'era. Non è «ti mando altrove» — è la
 * cosa più vicina a ciò che fa Siri che Android conceda a un'app di terze parti.
 */

/** I nomi che diciamo al modello, tradotti nelle chiavi vere di Android. */
const IMPOSTAZIONI: Record<string, { spazio: 'system', chiave: string }> = {
    brightness: { spazio: 'system', chiave: 'screen_brightness' },
    screen_timeout: { spazio: 'system', chiave: 'screen_off_timeout' },
    auto_rotate: { spazio: 'system', chiave: 'accelerometer_rotation' },
}

async function apriPannello(azione: string): Promise<boolean> {
    try {
        const r = await TalosDeviceBridge.openSettingsScreen({ action: azione, forThisApp: false })
        return r.done === true
    }
    catch {
        return false
    }
}

export function createTalosPrivilegedSources(): TalosPrivilegedToolSources | null {
    if (!Capacitor.isNativePlatform()) return null

    return {
        reasonOf: talosPrivilegedReason,
        ready: talosPrivilegedReady,

        async wifi(on) {
            const r = await talosRunAsShell(['cmd', 'wifi', 'set-wifi-enabled', on ? 'enabled' : 'disabled'])
            if (r.ok) return { done: true, via: 'shell' }
            /*
             * ⭐ Il pannello della connettività, non la schermata delle
             * impostazioni: galleggia sopra TALOS e la persona non perde il
             * posto in cui era.
             */
            const aperto = await apriPannello('android.settings.panel.action.INTERNET_CONNECTIVITY')
            return aperto
                ? { done: true, via: 'panel', reason: r.reason }
                : { done: false, via: 'none', reason: r.reason }
        },

        async bluetooth(on) {
            const r = await talosRunAsShell(['cmd', 'bluetooth_manager', on ? 'enable' : 'disable'])
            if (r.ok) return { done: true, via: 'shell' }
            // ⛔ Il Bluetooth non ha un pannello galleggiante: si apre la sua
            // schermata, che è meno bello e va detto com'è.
            const aperto = await apriPannello('android.settings.BLUETOOTH_SETTINGS')
            return aperto
                ? { done: true, via: 'panel', reason: r.reason }
                : { done: false, via: 'none', reason: r.reason }
        },

        /**
         * ⭐ Aereo e risparmio energetico: due righe del censimento (#34) dove
         * Gemini pretende di essere **l'assistente predefinito del telefono**.
         * Noi le facciamo dal ponte, da app qualunque.
         *
         * MISURATO sul Pad il 2026-08-09: `airplane_mode_on` 0 → 1 → 0, e per il
         * risparmio energetico non solo la riga ma il sistema che la recepisce —
         * `mSettingBatterySaverEnabled=true` in `dumpsys power`.
         *
         * ⛔ E la MODALITÀ AEREO SPEGNE IL PONTE. Il ponte parla col telefono
         * sulla rete locale: accendere l'aereo taglia il ramo su cui si è
         * seduti. Il comando parte e riesce — l'abbiamo misurato — ma la
         * connessione dopo cade, e la prossima cosa che TALOS chiede troverà il
         * ponte spento. Non è un difetto da correggere qui: è un fatto che la
         * descrizione dello strumento deve dire al modello.
         */
        async airplane(on) {
            const r = await talosRunAsShell(['cmd', 'connectivity', 'airplane-mode', on ? 'enable' : 'disable'])
            if (r.ok) return { done: true, via: 'shell' }
            const aperto = await apriPannello('android.settings.AIRPLANE_MODE_SETTINGS')
            return aperto
                ? { done: true, via: 'panel', reason: r.reason }
                : { done: false, via: 'none', reason: r.reason }
        },

        async powerSaving(on) {
            // ⛔ `settings put global low_power` e non `cmd power set-mode`: il
            // secondo esiste ma su questa ROM non e' quello che l'interruttore
            // delle impostazioni guarda. Misurato: con `low_power` a 1,
            // `dumpsys power` riporta `mSettingBatterySaverEnabled=true`.
            const r = await talosRunAsShell(['settings', 'put', 'global', 'low_power', on ? '1' : '0'])
            if (r.ok) return { done: true, via: 'shell' }
            const aperto = await apriPannello('android.settings.BATTERY_SAVER_SETTINGS')
            return aperto
                ? { done: true, via: 'panel', reason: r.reason }
                : { done: false, via: 'none', reason: r.reason }
        },

        async doNotDisturb(mode) {
            const r = await talosRunAsShell(['cmd', 'notification', 'set_dnd', mode])
            if (r.ok) return { done: true, via: 'shell' }
            const aperto = await apriPannello('android.settings.ZEN_MODE_SETTINGS')
            return aperto
                ? { done: true, via: 'panel', reason: r.reason }
                : { done: false, via: 'none', reason: r.reason }
        },

        async systemSetting(name, value) {
            const voce = IMPOSTAZIONI[name]
            if (!voce) return { done: false, via: 'none', reason: 'program-not-allowed' }

            if (value === undefined) {
                const r = await talosRunAsShell(['settings', 'get', voce.spazio, voce.chiave])
                return r.ok
                    ? { done: true, via: 'shell', value: r.output, output: r.output }
                    : { done: false, via: 'none', reason: r.reason }
            }
            /*
             * ⛔ Il valore si valida QUI, prima di arrivare al sistema. Zod ha
             * accettato «una stringa»; che quella stringa sia un numero nei
             * limiti giusti lo sa solo chi conosce l'impostazione — e una
             * luminosità a 99999 non è un errore da scoprire dal telefono.
             */
            const numero = Number(value)
            const valido = Number.isFinite(numero)
                && (name === 'brightness' ? numero >= 0 && numero <= 255
                    : name === 'auto_rotate' ? numero === 0 || numero === 1
                        : numero >= 5_000 && numero <= 1_800_000)
            if (!valido) return { done: false, via: 'none', reason: 'value-out-of-range' }

            const r = await talosRunAsShell(['settings', 'put', voce.spazio, voce.chiave, String(numero)])
            if (r.ok) return { done: true, via: 'shell' }
            const aperto = await apriPannello('android.settings.DISPLAY_SETTINGS')
            return aperto
                ? { done: true, via: 'panel', reason: r.reason }
                : { done: false, via: 'none', reason: r.reason }
        },

        async appUsage(days) {
            const r = await talosRunAsShell(['dumpsys', 'usagestats'])
            if (!r.ok) return { done: false, via: 'none', reason: r.reason }
            /*
             * ⛔ `dumpsys usagestats` produce megabyte. Non si dà in pasto al
             * modello: si tiene solo ciò che risponde alla domanda, e si dice
             * quanti giorni si stanno guardando.
             */
            const righe = r.output.split('\n')
                .filter((riga) => riga.includes('package=') && riga.includes('totalTime'))
                .slice(0, 40)
            return {
                done: true,
                via: 'shell',
                output: righe.length
                    ? `Last ${days} day(s), most-used first:\n${righe.join('\n')}`
                    : 'The phone has no usage data to show.',
            }
        },

        async listApps() {
            const r = await talosRunAsShell(['cmd', 'package', 'list', 'packages', '-3'])
            if (!r.ok) return { done: false, via: 'none', reason: r.reason }
            const pacchetti = r.output.split('\n')
                .map((riga) => riga.replace(/^package:/, '').trim())
                .filter(Boolean)
            return { done: true, via: 'shell', output: pacchetti.join('\n') }
        },
    }
}
