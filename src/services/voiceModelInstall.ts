import { watch } from 'vue'
import { talosVoiceModelInstallManifest, talosActivateVoiceModel } from '@/services/personalVoice'
import {
    talosBeginModelTransfer,
    talosKeepWatchingTransfers,
    talosModelTransfers,
    talosRefreshModelTransfer,
    talosResumeManagedModelTransfer,
    talosRetainModelTransferObserver,
} from '@/stores/modelTransfers'

/**
 * ⭐⭐⭐ FASE 5, BLOCCO 3b — installare il motore voce dal composer/dalle
 * impostazioni, non da `adb push`.
 *
 * ⛔⛔ Riusa il motore di trasferimento GENERICO che c'è già
 * (`stores/modelTransfers.ts`), non ne inventa uno per la voce — stessa
 * ragione del Blocco 2: un `Request` è un `Request`.
 *
 * ⛔ Il motivo per cui questo file esiste e non chiama semplicemente
 * `talosBeginModelTransfer` due volte e basta: quel motore NON ha una fase
 * «completato» — un trasferimento riuscito SPARISCE dalla lista invece di
 * restare con uno stato finale (misurato il 2026-08-06, vedi il commento in
 * cima a `lib/models/transferNotices.ts`). L'unico canale di completamento
 * dichiarato una-volta-sola (`status().completed`) è già consumato in
 * esclusiva dallo STESSO store — leggerlo una seconda volta da qui
 * perderebbe l'arrivo per le altre schermate, o viceversa.
 *
 * ⇒ Si osserva `talosModelTransfers.items` (stato reattivo, sicuro da
 * guardare in tanti punti) invece del canale one-shot: quando i due
 * `modelName` della voce non compaiono più nella lista, si tenta
 * l'attivazione nativa — che è essa stessa idempotente e onesta
 * (`not-downloaded:...` se in realtà non è ancora tutto arrivato, mai
 * un'attivazione a metà). Nessuna nuova esclusività da rispettare.
 */
export type TalosVoiceModelInstallProgress =
    | { phase: 'starting' }
    | { phase: 'downloading', haveBytes: number, totalBytes: number }
    | { phase: 'activating' }
    | { phase: 'done' }
    | { phase: 'failed', reason: string }

export async function talosInstallPersonalVoiceModel(
    onProgress?: (progress: TalosVoiceModelInstallProgress) => void,
): Promise<{ ok: true } | { ok: false, reason: string }> {
    onProgress?.({ phase: 'starting' })

    const manifest = await talosVoiceModelInstallManifest().catch((error: unknown) => {
        throw error instanceof Error ? error : new Error('manifest unavailable')
    })
    if (manifest.artifacts.length === 0) return { ok: false, reason: 'empty-manifest' }
    const modelNames = new Set(manifest.artifacts.map((artifact) => artifact.modelName))

    for (const artifact of manifest.artifacts) {
        const started = await talosBeginModelTransfer({
            repo: artifact.repo,
            revision: artifact.revision,
            files: artifact.files,
            modelName: artifact.modelName,
        })
        if (!started.ok) {
            onProgress?.({ phase: 'failed', reason: started.reason })
            return { ok: false, reason: started.reason }
        }
    }
    // ⛔⛔ TROVATO SUL DISPOSITIVO, non ipotizzato: `talosBeginModelTransfer`
    // chiama il nativo `start()`, e per un id GIA' ESISTENTE in stato
    // terminale (`failed`/`paused`) quello non riparte da solo — restituisce
    // lo stesso record fermo, `ok: true` incluso. Un secondo tocco su
    // "Scarica il motore voce" dopo un fallimento tornava quindi a fallire
    // ISTANTANEAMENTE con la stessa ragione vecchia, senza aver ritentato
    // nulla: `resume()` e' la chiamata che rimette davvero in coda il job
    // (misurato 2026-08-22 — stesso `createdAtMs` su ogni "retry" finche' non
    // si e' chiamato `resume()` a mano).
    await talosRefreshModelTransfer()
    for (const artifact of manifest.artifacts) {
        const item = talosModelTransfers.items.find((candidate) => candidate.modelName === artifact.modelName)
        if (!item || !item.resumable) continue
        if (item.phase !== 'failed' && item.phase !== 'paused') continue
        const resumed = await talosResumeManagedModelTransfer(item.id)
        if (!resumed.ok) {
            onProgress?.({ phase: 'failed', reason: resumed.reason })
            return { ok: false, reason: resumed.reason }
        }
    }
    // ⛔⛔ Senza questo l'orologio del poller può non partire mai: se chi
    // chiama questa funzione lascia subito la schermata (il caso più
    // naturale — "avvia e torna in chat"), nessun osservatore resta montato
    // e senza un trasferimento già "in corso" al momento giusto il poller
    // non si accende da solo. Owner 2026-08-06, lo stesso difetto che ha
    // fatto nascere questa chiamata nello store.
    talosKeepWatchingTransfers()

    return new Promise((resolve) => {
        const release = talosRetainModelTransferObserver()
        let settled = false
        // ⛔⛔ TROVATO DAL TEST, non ipotizzato: `watch(..., {immediate:true})`
        // può chiamare la callback SINCRONAMENTE dentro la stessa `watch()`,
        // prima che l'assegnazione a `stopWatching` sia completata — un
        // primo giro che arriva già fallito ci cadeva dentro. `let`
        // dichiarato PRIMA di chiamare `watch()`, mai `const` sul suo
        // risultato, cosi la callback trova sempre una variabile assegnabile
        // anche quando scatta durante la chiamata stessa.
        let stopWatching: (() => void) | undefined
        const finish = (result: { ok: true } | { ok: false, reason: string }): void => {
            if (settled) return
            settled = true
            stopWatching?.()
            release()
            resolve(result)
        }

        stopWatching = watch(
            () => talosModelTransfers.items,
            (items) => {
                const mine = items.filter((item) => item.modelName !== null && modelNames.has(item.modelName))
                const failed = mine.find((item) => item.failure !== null)
                if (failed) {
                    onProgress?.({ phase: 'failed', reason: failed.failure ?? 'transfer-failed' })
                    finish({ ok: false, reason: failed.failure ?? 'transfer-failed' })
                    return
                }
                if (mine.length > 0) {
                    const haveBytes = mine.reduce((sum, item) => sum + item.haveBytes, 0)
                    const totalBytes = mine.reduce((sum, item) => sum + item.totalBytes, 0)
                    onProgress?.({ phase: 'downloading', haveBytes, totalBytes })
                    return
                }
                // Nessuno dei due modelName è più nella lista: o sono
                // arrivati, o sono spariti per un motivo che il nativo non
                // ha raccontato come `failure`. L'attivazione stessa dice
                // quale dei due era.
                void (async () => {
                    onProgress?.({ phase: 'activating' })
                    try {
                        const activated = await talosActivateVoiceModel()
                        if (activated.activated) {
                            onProgress?.({ phase: 'done' })
                            finish({ ok: true })
                        } else {
                            onProgress?.({ phase: 'failed', reason: 'not-activated' })
                            finish({ ok: false, reason: 'not-activated' })
                        }
                    } catch (error) {
                        const reason = error instanceof Error ? error.message : 'activation-failed'
                        onProgress?.({ phase: 'failed', reason })
                        finish({ ok: false, reason })
                    }
                })()
            },
            // ⛔ NIENTE `deep: true`, e non per dimenticanza — controllato,
            // non assunto: il primo sospetto era che servisse (`state.items`
            // sembra mutato con `.splice()`/`.push()` guardando SOLO
            // `talosBeginModelTransfer`), ma `applyStatus()` — la funzione
            // che il POLLER chiama davvero a ogni giro — fa
            // `state.items = rows.map(...)`: RIASSEGNA l'array, non lo muta.
            // Un `watch` superficiale su `() => talosModelTransfers.items`
            // vede quindi un riferimento nuovo a ogni giro del poller e si
            // ri-attiva da solo. Provato togliendo `deep` e rilanciando
            // `tracks progress across MULTIPLE poll ticks`: passa lo stesso
            // — la prova che serviva prima di scrivere il commento sbagliato
            // che c'era qui.
            { immediate: true },
        )
    })
}
