import { Capacitor } from '@capacitor/core'
import {
    talosPrivilegedReason,
    talosPrivilegedReady,
    talosRunAsShell,
} from '@/lib/device/privilegedShell'
import { TalosDeviceBridge } from '@/lib/device/devicePlugin'
import type { TalosPrivilegedToolSources } from '@/lib/tools/privilegedTools'
import { BRIGHTNESS, SCREEN_TIMEOUT } from '@/lib/device/unitaImpostazioni'

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

/**
 * ⛔⛔ LE UNITÀ VERE (ASS-145, ASS-146; owner 28/10). Prima la descrizione diceva «secondi» e «0-255», il controllo voleva millisecondi
 * e il OnePlus 13 legge 1352: il modello che seguiva la descrizione veniva sempre respinto. Una costante sola, usata dal controllo E dal
 * testo per il modello (`privilegedTools.ts`), così le due cose non possono più divergere.
 */
export { BRIGHTNESS, SCREEN_TIMEOUT }

type EsitoImpostazione = { done: boolean, via: 'shell' | 'panel' | 'none', value?: string, output?: string, reason?: string, detail?: string }

const rifiuto = (detail: string): EsitoImpostazione => ({ done: false, via: 'none', reason: 'value-out-of-range', detail })
const numeroDi = (uscita: string): number | null => {
    const n = Number(uscita.trim())
    return uscita.trim() !== '' && Number.isFinite(n) ? n : null
}
const comeDurata = (s: number): string => (s % 60 === 0 && s >= 60 ? ` (${s / 60} minute${s === 60 ? '' : 's'})` : '')

/*
 * ⛔ Il ripiego di Android 16 (dove `--unit percentage` non c'è) è LINEARE sulla scala del telefono, e non la curva di `BrightnessUtils`
 * di AOSP. MISURATO sul Pad (OxygenOS 16) il 28/10 col cursore della tendina: grezzo 145 → cursore ~8%, 436 → ~25%, 872 → ~51%, con
 * `BrightnessNormalMaximum=1745`. Con la curva di AOSP «50%» avrebbe scritto 145, cioè il cursore all'8%.
 */
const percentualeDaGrezzo = (grezzo: number, massimo: number): number => Math.round(Math.max(0, Math.min(1, grezzo / massimo)) * 100)

async function leggiTimeout(): Promise<EsitoImpostazione> {
    const r = await talosRunAsShell(['settings', 'get', 'system', 'screen_off_timeout'])
    if (!r.ok) return { done: false, via: 'none', reason: r.reason }
    const ms = numeroDi(r.output)
    // un valore che non sta in secondi interi (alcuni OEM usano 2147483647 per «mai») si dichiara per quello che è
    if (ms === null || ms % SCREEN_TIMEOUT.msPerS !== 0 || ms > 24 * 3600 * SCREEN_TIMEOUT.msPerS) {
        return { done: true, via: 'shell', value: r.output.trim(), output: `Screen timeout: raw value ${r.output.trim()} ms on this phone.` }
    }
    const s = ms / SCREEN_TIMEOUT.msPerS
    return { done: true, via: 'shell', value: String(s), output: `Screen timeout is ${s} seconds${comeDurata(s)}.` }
}

async function scriviTimeout(valore: string): Promise<EsitoImpostazione> {
    const s = Number(valore)
    const { minS, maxS, msPerS } = SCREEN_TIMEOUT
    if (!Number.isInteger(s) || s < minS || s > maxS) {
        const sembraMs = Number.isInteger(s) && s >= minS * msPerS && s / msPerS <= maxS
        return rifiuto(`screen_timeout is in SECONDS, from ${minS} to ${maxS} (30 minutes). You sent ${valore}`
            + (sembraMs ? `, which looks like milliseconds: send ${s / msPerS}.` : '.'))
    }
    const r = await talosRunAsShell(['settings', 'put', 'system', 'screen_off_timeout', String(s * msPerS)])
    if (!r.ok) return { done: false, via: 'none', reason: r.reason }
    // ⛔ L'esito dice il valore RILETTO, non quello mandato
    const dopo = await leggiTimeout()
    return dopo.done ? { ...dopo, output: `Screen timeout set: the phone now reports ${dopo.value} seconds${comeDurata(Number(dopo.value))}.` } : dopo
}

/** La percentuale del cursore se il telefono la sa dire (Android 17), se no `null`. */
async function percentualeVera(): Promise<number | null> {
    const r = await talosRunAsShell(['cmd', 'display', 'get-brightness', '--unit', 'percentage'])
    return r.ok ? numeroDi(r.output) : null
}

/** Il massimo della scala del cursore (Pad: `BrightnessNormalMaximum=1745.0`), se `dumpsys display` lo dice. */
async function massimoDelTelefono(): Promise<number | null> {
    const r = await talosRunAsShell(['dumpsys', 'display'])
    const m = r.ok ? /BrightnessNormalMaximum=([\d.]+)/u.exec(r.output) : null
    const n = m ? Number(m[1]) : NaN
    return Number.isFinite(n) && n > 1 ? n : null
}

async function automaticaAccesa(): Promise<boolean> {
    const r = await talosRunAsShell(['settings', 'get', 'system', 'screen_brightness_mode'])
    return r.ok && r.output.trim() === '1'
}

async function leggiLuminosita(): Promise<EsitoImpostazione> {
    const auto = (await automaticaAccesa()) ? ' Auto-brightness is on.' : ' Auto-brightness is off.'
    const p = await percentualeVera()
    if (p !== null) return { done: true, via: 'shell', value: String(Math.round(p)), output: `Brightness is ${Math.round(p)}%.${auto}` }
    const r = await talosRunAsShell(['settings', 'get', 'system', 'screen_brightness'])
    if (!r.ok) return { done: false, via: 'none', reason: r.reason }
    const grezzo = numeroDi(r.output)
    const massimo = await massimoDelTelefono()
    if (grezzo !== null && massimo !== null) {
        const stima = percentualeDaGrezzo(grezzo, massimo)
        return { done: true, via: 'shell', value: String(stima), output: `Brightness is about ${stima}% (raw ${grezzo} of ${massimo} on this phone's scale).${auto}` }
    }
    // ⛔ Mai «0-255»: il OnePlus 13 legge 1352, il Pad arriva a 1745
    return { done: true, via: 'shell', value: r.output.trim(), output: `Brightness: raw value ${r.output.trim()} on this phone's own scale, which it does not tell; no percentage available.${auto}` }
}

async function scriviLuminosita(valore: string): Promise<EsitoImpostazione> {
    const p = Number(valore)
    if (valore.trim() === '' || !Number.isFinite(p) || p < BRIGHTNESS.minP || p > BRIGHTNESS.maxP) {
        return rifiuto(`brightness is in PERCENT, from 0 to 100, like the slider. You sent ${valore}.`)
    }
    // owner 28/10: «Spegne l'automatica e la imposta», e lo dice
    let nota = ''
    if (await automaticaAccesa()) {
        const r = await talosRunAsShell(['settings', 'put', 'system', 'screen_brightness_mode', '0'])
        if (!r.ok) return { done: false, via: 'none', reason: r.reason }
        nota = ' TALOS turned auto-brightness off first, otherwise the phone would move it again: tell the user.'
    }
    const diretta = await talosRunAsShell(['cmd', 'display', 'set-brightness', String(p), '--unit', 'percentage'])
    if (diretta.ok && !/error/iu.test(diretta.output)) {
        const riletta = await percentualeVera()
        if (riletta !== null) return { done: true, via: 'shell', value: String(Math.round(riletta)), output: `Brightness set: the phone now reports ${Math.round(riletta)}%.${nota}` }
    }
    // Android 16: la scala del telefono, lineare come il suo cursore
    const massimo = await massimoDelTelefono()
    if (massimo === null) return { done: false, via: 'none', reason: 'brightness-scale-unknown' }
    const r = await talosRunAsShell(['settings', 'put', 'system', 'screen_brightness', String(Math.round(massimo * p / 100))])
    if (!r.ok) return { done: false, via: 'none', reason: r.reason }
    const dopo = await leggiLuminosita()
    return dopo.done ? { ...dopo, output: `Brightness set: the phone now reports about ${dopo.value}%.${nota}` } : dopo
}

/** Lo stato VERO del risparmio: `Enabled=` sotto «Battery saver state machine:», non la copia `mSettingBatterySaverEnabled`. */
async function risparmioAcceso(): Promise<boolean | null> {
    const r = await talosRunAsShell(['dumpsys', 'power'])
    const m = r.ok ? /Battery saver state machine:\s*\n\s*Enabled=(true|false)/u.exec(r.output) : null
    return m ? m[1] === 'true' : null
}

async function inCarica(): Promise<boolean> {
    const r = await talosRunAsShell(['dumpsys', 'battery'])
    return r.ok && /powered: true/u.test(r.output)
}

const RILETTURA = { volte: 5, attesaMs: 300 }

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
            /*
             * ⛔⛔ SCRIVI → RILEGGI → ESITO ONESTO (ASS-147, owner 28/10: «Dice la verità e spiega»). Prima: «Battery saver on.» senza
             * rileggere. Ma Android col cavo attaccato rifiuta in silenzio (`BatterySaverStateMachine.java:820-822`, AOSP 17), e
             * `low_power` resta 1 mentre il risparmio è spento: né l'uscita del comando né `mSettingBatterySaverEnabled` provano niente.
             *
             * ⛔ E il cavo NON si giudica prima: MISURATO sul Pad (OxygenOS 16) il 28/10, con «USB powered: true», `low_power 1` accende
             * davvero (`Enabled=true`). Rifiutare in anticipo sarebbe la bugia opposta. Si scrive, si rilegge, e solo se non si è acceso
             * il cavo diventa la spiegazione.
             */
            const prima = await risparmioAcceso()
            if (prima === on) return { done: true, via: 'shell', output: on ? 'Battery saver was already on.' : 'Battery saver was already off.' }
            // ⛔ `settings put global low_power` e non `cmd power set-mode`: il
            // secondo esiste ma su questa ROM non e' quello che l'interruttore
            // delle impostazioni guarda (misurato sul Pad il 2026-08-09).
            const r = await talosRunAsShell(['settings', 'put', 'global', 'low_power', on ? '1' : '0'])
            if (r.ok) {
                for (let i = 0; i < RILETTURA.volte; i++) {
                    if (await risparmioAcceso() === on) return { done: true, via: 'shell' }
                    await new Promise((fine) => setTimeout(fine, RILETTURA.attesaMs))
                }
                return { done: false, via: 'none', reason: on && await inCarica() ? 'power-saver-while-charging' : 'not-applied' }
            }
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

            // ASS-145, ASS-146: timeout in secondi, luminosità in percentuale; scritti e poi riletti
            if (name === 'screen_timeout') return value === undefined ? leggiTimeout() : scriviTimeout(value)
            if (name === 'brightness') return value === undefined ? leggiLuminosita() : scriviLuminosita(value)

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
            if (numero !== 0 && numero !== 1) return rifiuto(`auto_rotate is 0 or 1. You sent ${value}.`)

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
                    : 'The device has no usage data to show.',
            }
        },

        /**
         * Le app che una persona può APRIRE — cioè quelle con un'icona.
         *
         * ## ⛔ Il difetto, e stava in due caratteri
         *
         * Qui c'era `cmd package list packages **-3**`, e `-3` vuol dire «solo
         * le app di terze parti»: quelle installate dalla persona. Tutto il
         * preinstallato — calcolatrice, orologio, fotocamera, telefono,
         * impostazioni — restava invisibile.
         *
         * MISURATO sul Pad il 2026-08-10, dallo stesso ponte:
         *
         * ```
         *   con -3 (quello che TALOS vedeva)     49
         *   tutti i pacchetti                   439
         *   app con un'icona da toccare          68
         * ```
         *
         * ⇒ TALOS era cieco su 19 app avviabili su 68, e le cieche erano
         * proprio quelle che una persona nomina. Provato in chat: «Apri la
         * calcolatrice» → «Non trovo un'app Calcolatrice installata sul
         * telefono», mentre `com.oneplus.calculator` è installata e ha la sua
         * attività di avvio.
         *
         * ## ⛔ E NON BASTAVA: i pacchetti non dicono cosa sono
         *
         * Corretto il filtro, restava il secondo difetto — trovato lo stesso
         * giorno incrociando i provider (vedi il `try` nel corpo). Il ponte dà
         * solo nomi di pacchetto, e `org.thunderdog.challegram` è Telegram X.
         * ⇒ Adesso l'elenco lo fa il NATIVO, che sa l'etichetta; questo resta
         * il ripiego.
         *
         * ## ⭐ E la domanda giusta allinea ELENCO e APERTURA
         *
         * L'apertura passa da `getLaunchIntentForPackage`, cioè può aprire
         * esattamente le app con un'attività MAIN/LAUNCHER — le stesse che il
         * manifest dichiara in `<queries>`. Chiedere QUELLE, e non «le app di
         * terze parti», fa combaciare ciò che TALOS nomina con ciò che TALOS sa
         * aprire: prima l'elenco e l'apertura vedevano due mondi diversi, e un
         * assistente che nomina una cosa e poi nega che esista è peggio di uno
         * che non la nomina.
         */
        async listApps() {
            /*
             * ⭐⭐ PRIMA IL NATIVO, perché sa il NOME che la persona legge.
             *
             * MISURATO il 2026-08-10 incrociando tre provider sulla stessa
             * domanda «Apri Telegram», con Telegram X installato:
             *
             * ```
             *   anthropic/claude-sonnet-5   «Non ho trovato Telegram»       ⛔
             *   openai/gpt-5.6              «Non trovo Telegram»            ⛔
             *   google/gemini-3.6-flash     apre org.thunderdog.challegram  ✅
             * ```
             *
             * Il ponte restituisce **solo pacchetti**, e `org.thunderdog.challegram`
             * non contiene la parola «telegram»: chi non sa la mappa a memoria
             * risponde che l'app non c'è. Due modelli su tre.
             *
             * Il `PackageManager` dell'app, con le `<queries>` già nel
             * manifest, dà `Etichetta<TAB>pacchetto` — e in più non vuole
             * nessun privilegio, quindi l'elenco funziona anche dove il ponte
             * non si accenderà mai.
             *
             * ⛔ Il ponte resta come ripiego e NON viene tolto: se un domani il
             * nativo non c'è (piattaforma diversa, plugin non caricato), un
             * elenco di soli pacchetti è comunque meglio del silenzio.
             */
            try {
                const nativo = await TalosDeviceBridge.listApps()
                if (nativo?.done && typeof nativo.output === 'string' && nativo.output) {
                    return { done: true, via: 'native' as const, output: nativo.output }
                }
            }
            catch {
                // il nativo non c'è: si prova il ponte, sotto
            }

            const r = await talosRunAsShell([
                'cmd', 'package', 'query-activities', '--brief',
                '-a', 'android.intent.action.MAIN',
                '-c', 'android.intent.category.LAUNCHER',
            ])
            if (!r.ok) return { done: false, via: 'none', reason: r.reason }
            /*
             * L'uscita alterna intestazioni e righe `pacchetto/attività`: si
             * tiene il pacchetto, una volta sola, in ordine. Un'app con due
             * icone comparirebbe due volte, e sarebbe rumore.
             *
             * ⛔ Scritto stretto apposta: il grafo d'avvio ha meno di cento
             * byte di margine (compito #51), e questo modulo ci viaggia dentro
             * perché `chatController` lo importa staticamente. Finché quella
             * dipendenza non diventa pigra, ogni riga qui si paga all'avvio.
             */
            const pacchetti = [...new Set(
                (r.output.match(/^\s*[\w.]+\//gm) ?? []).map((s) => s.trim().slice(0, -1)),
            )].sort()
            return { done: true, via: 'shell', output: pacchetti.join('\n') }
        },
    }
}
