import { registerPlugin } from '@capacitor/core'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — «creare artefatti HTML con schemi avanzati e
 * interagibili in chat». Il ponte verso `TalosArtifactPlugin.kt`: DUE
 * chiamate, `create` (scrive l'HTML, torna solo un id) e `open` (lancia
 * `TalosArtifactActivity`, non esportata — solo questo plugin, cioè
 * solo il processo dell'app stessa, può accenderla). Vedi il commento in
 * testa a `TalosArtifactActivity.kt` per l'intera catena verificata: perché
 * NON un iframe dentro la WebView di `MainActivity` (il ponte Capacitor si
 * inietta per istanza di WebView, non per origine), perché una WebView e un
 * Profilo separati, perché fail-closed se il dispositivo non isola.
 */
interface PonteArtefatto {
    create(options: { title: string, html: string }): Promise<{ id: string }>
    open(options: { id: string }): Promise<{ opened: boolean }>
    /**
     * ⛔ Owner 2026-08-27 — «salvare l'artefatto nella Libreria». Sola
     * lettura dell'HTML già scritto da `create` — il titolo non viaggia:
     * la scheda (`s.titolo`) ce l'ha già lato JS, vedi `TalosArtifactPlugin.kt`.
     */
    read(options: { id: string }): Promise<{ html: string }>
}

export const TalosArtifactBridge = registerPlugin<PonteArtefatto>('TalosArtifact')
