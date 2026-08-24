import { Capacitor } from '@capacitor/core'

/**
 * Se il mockup Harness UI (Codex, 24/8) e' raggiungibile su QUESTO build.
 *
 * ⛔ Non e' `import.meta.env.DEV`: quello riflette come Vite ha compilato il
 * bundle JS (dev server o `vite build`), non se Gradle ha assemblato un APK
 * `debug` o `release` — un `npm run build` di produzione, sincronizzato in
 * ENTRAMBE le varianti Android, avrebbe `DEV === false` anche dentro un
 * `assembleDebug` locale. Il segnale vero e' la presenza del plugin nativo
 * `TalosHarnessUiPlugin`, che vive SOLO nel source set Android `debug`
 * (stesso meccanismo della bolla, vedi MainActivity.registerPlugin): in un
 * APK di release la classe non compila affatto, quindi
 * `isPluginAvailable` torna `false` per costruzione, non per un controllo
 * che si potrebbe scavalcare passando un flag.
 */
export function talosHarnessUiAvailable(): boolean {
    return Capacitor.isPluginAvailable('TalosHarnessUi')
}

/**
 * Il mockup e' file locali statici serviti dallo stesso WebView
 * (`public/harness-ui/`, riuso byte-per-byte del bundle che Codex ha gia'
 * verificato responsive su 6 stati canonici) — non un componente Vue: gli
 * basta un percorso assoluto, non serve un nuovo plugin per "aprirlo".
 * Assoluto e non relativo: un link toccato da `/settings` risolverebbe
 * `harness-ui/index.html` a `/settings/harness-ui/index.html`, che non
 * esiste.
 */
export const TALOS_HARNESS_UI_PATH = '/harness-ui/index.html'
