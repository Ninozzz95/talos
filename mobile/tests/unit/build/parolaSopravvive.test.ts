import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⛔⛔ «HEY TALOS» DEVE SOPRAVVIVERE ALLA NOTTE.
 *
 * Owner 2026-08-12: «hey TALOS non dà segni di vita». MISURATO sul Pad con
 * `dumpsys activity services ai.talos.dev`: fra i servizi vivi c'erano
 * `TalosAssistente`, la sua sessione e la WebView — e `TalosParola` **non
 * c'era**. Non era sordo: non esisteva.
 *
 * Il servizio è `START_NOT_STICKY` di proposito (un microfono non deve
 * resuscitare da solo) e nessuno lo riaccendeva MAI: bastava un riavvio, un
 * `force-stop`, o il sistema che recupera memoria, e la funzione era finita per
 * sempre — con l'interruttore che diceva ancora «sì».
 */

const RADICE = resolve(__dirname, '../../..')
const leggi = (f: string): string => readFileSync(resolve(RADICE, f), 'utf8')

describe('⛔ la parola di attivazione non muore in silenzio', () => {
    it('l\'intenzione si RICORDA, e si onora quando l\'app torna davanti', () => {
        const servizio = leggi('android/app/src/main/java/ai/talos/parola/TalosParola.kt')
        const activity = leggi('android/app/src/main/java/ai/talos/MainActivity.java')

        expect(servizio).toContain('fun riprendiSeVoluta(contesto: Context)')
        // Accendere e spegnere scrivono l'intenzione: senza, non c'è niente da onorare.
        expect(servizio).toMatch(/fun accendi\(contesto: Context\) \{\s*\n\s*ricorda\(contesto, true\)/)
        expect(servizio).toMatch(/fun spegni\(contesto: Context\) \{\s*\n\s*ricorda\(contesto, false\)/)
        // E l'aggancio: il primo istante legittimo è l'app in primo piano.
        expect(activity).toContain('TalosParola.riprendiSeVoluta(this)')
        expect(activity).toMatch(/public void onResume\(\)[\s\S]{0,160}?riprendiSeVoluta/)
    })

    it('⛔ e NON da un ricevitore d\'avvio: sarebbe un\'eccezione, non una cura', () => {
        const manifest = leggi('android/app/src/main/AndroidManifest.xml')

        /*
         * Documentazione Android, verbatim: «Apps that target Android 14 or
         * higher are not allowed to launch a microphone foreground service from
         * a BOOT_COMPLETED broadcast receiver» — chi ci prova riceve
         * `ForegroundServiceStartNotAllowedException`. `RECORD_AUDIO` è
         * *while-in-use*: dal fondo non si esercita, ed è una regola giusta.
         */
        expect(manifest).not.toMatch(/<receiver[\s\S]{0,400}?BOOT_COMPLETED/)
    })

    it('⛔ e l\'interruttore non MENTE: «accesa» si controlla, non si augura', () => {
        const plugin = leggi('android/app/src/main/java/ai/talos/parola/TalosParolaPlugin.kt')

        // Prima rispondeva `accesa = true` subito dopo `startForegroundService`,
        // senza guardare niente: tre esiti diversi, tutti indistinguibili da un
        // successo. È il motivo per cui la persona non poteva accorgersene.
        expect(plugin).not.toMatch(
            /TalosParola\.accendi\(context\)\s*\n\s*call\.resolve\(JSObject\(\)\.put\("accesa", true\)\)/,
        )
        expect(plugin).toContain('if (TalosParola.accesa())')
        expect(plugin).toContain('.put("motivo", "nonPartito")')
    })
})
