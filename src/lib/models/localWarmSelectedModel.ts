import { talosLocalEngineLazy } from '@/services/localEngineLazy'

/**
 * P3-1 — raccoglie i segnali ambientali e decide se aprire un modello
 * locale in anticipo, quando `chatController.selectModel` lo chiama su
 * una scelta esplicita.
 *
 * ## Perché vive fuori da `chatController.ts`
 *
 * Non per stile: `scripts/verify-initial-chunk.mjs` misura i byte REALI
 * del chunk d'avvio, e questo file — con i suoi import e i suoi commenti
 * — pesava abbastanza da far sforare il tetto (613.261 contro 613.000,
 * misurato). `chatController.ts` è nel grafo statico (importato sia da
 * `main.ts` sia direttamente da `App.vue` e da ogni schermata), quindi
 * qualunque cosa scritta lì dentro pesa sull'avvio anche se ESEGUE i suoi
 * import in modo pigro — è il testo della funzione stessa a contare, non
 * solo cosa fa quando gira. Spostare il corpo qui, dietro un `import()`
 * dal punto di chiamata, è lo stesso pattern già in uso in questo file
 * per il comando manuale del sondaggio GPU (vedi `localEngineProbeRun.ts`).
 *
 * La DECISIONE resta in `localWarmTrigger.ts` (puro, i suoi test a sé);
 * questa funzione la esegue, non la duplica.
 */
export async function talosWarmSelectedLocalModel(path: string): Promise<void> {
    const [{ talosMeasureDevice }, { talosShouldWarmLocalModel }, { talosWarmLocalModel }] =
        await Promise.all([
            import('@/services/deviceCapacity'),
            import('@/lib/models/localWarmTrigger'),
            talosLocalEngineLazy(),
        ])
    const device = await talosMeasureDevice()
    const via = talosShouldWarmLocalModel({
        thermal: device?.thermal ?? null,
        availableRamBytes: device?.availableRamBytes ?? null,
        lowMemoryThresholdBytes: device?.lowMemoryThresholdBytes ?? null,
    })
    if (!via) return
    await talosWarmLocalModel(path)
}
