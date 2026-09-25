import { Capacitor } from '@capacitor/core'

/**
 * Se la stazione Codice (Harness UI) è raggiungibile su QUESTO build.
 *
 * ⛔ Non è `import.meta.env.DEV`: quello riflette come Vite ha compilato il
 * bundle JS (dev server o `vite build`), non se Gradle ha assemblato un APK
 * `debug` o `release`. Il segnale vero è la presenza del plugin nativo
 * `TalosHarnessUiPlugin`.
 *
 * ⛔ Dal 3/9 (commit 7ffee9e9f, owner: «CODICE DEVE ESSERE PRESENTE NELLA APP
 * DI PRODUZIONE») il plugin vive nel source set `main`, quindi in OGNI
 * variante, release compresa: MainActivity lo registra per stringa e
 * proguard-rules.pro lo tiene. Qui `isPluginAvailable` torna `false` solo in
 * un install parziale o in un artefatto rotto, mai per scelta della variante.
 * Dal 24/8 al 3/9 il plugin stava nel source set `debug`: chi legge vecchi
 * documenti che dicono «Codice solo nei debug» legge quel periodo.
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
