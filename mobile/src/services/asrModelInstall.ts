import { watch } from 'vue'
import { TALOS_MODELLO_PARAKEET } from '@/lib/voice/modelloParakeet'
import { TALOS_ASR_DOVE, talosAsrLocalePonte, talosMotoreLocale } from '@/services/dictationLocale'
import {
    talosBeginModelTransfer,
    talosKeepWatchingTransfers,
    talosModelTransfers,
    talosRefreshModelTransfer,
    talosResumeManagedModelTransfer,
    talosRetainModelTransferObserver,
} from '@/stores/modelTransfers'

/**
 * N12 — scaricare il modello del riconoscimento vocale locale (Parakeet, ~670 MB) dalle Impostazioni.
 *
 * Decisione dell'owner del 12/10/2026: scaricato al primo uso, col centro download che c'è già. Quindi si riusa il motore
 * di trasferimento GENERICO (`stores/modelTransfers.ts`), come fa la voce personale (`voiceModelInstall.ts`): riprende se
 * interrotto, compare nel centro download, e soprattutto VERIFICA l'impronta di ogni file e lo sigilla.
 *
 * ⛔ Il modello è «pronto» solo quando il motore locale lo dice (`disponibile()`): quattro file, col peso giusto e col
 * sigillo dell'impronta fissata alla fonte (`lib/voice/modelloParakeet.ts`). Un trasferimento sparito dalla lista non basta.
 */
export type TalosAsrInstallProgress =
    | { fase: 'avvio' }
    | { fase: 'scarico', fatti: number, totali: number }
    | { fase: 'verifica' }
    | { fase: 'pronto' }
    | { fase: 'fallito', motivo: string }

export const TALOS_ASR_NOME_DEL_TRASFERIMENTO = TALOS_MODELLO_PARAKEET.nome

export function talosModelloVocalePronto(): Promise<boolean> {
    return talosMotoreLocale().disponibile()
}

/**
 * ⛔ MISURATO sul Pad il 13/10/2026: a scaricamento finito i file c'erano ma il sigillo no (nasce nello stesso secondo
 * dell'ultima modifica, e la regola dei sigilli lo scarta). Quindi dopo un arrivo — e prima di riscaricare file che ci sono
 * già — si fa ricalcolare l'impronta dal file com'è e la si sigilla; «pronto» resta il confronto con le impronte fissate.
 */
async function verificaEPronto(): Promise<boolean> {
    if (await talosModelloVocalePronto()) return true
    await talosAsrLocalePonte().verifica(TALOS_ASR_DOVE).catch(() => null)
    return talosModelloVocalePronto()
}

export async function talosInstallaModelloVocale(
    onProgress?: (progresso: TalosAsrInstallProgress) => void,
): Promise<{ ok: true } | { ok: false, motivo: string }> {
    onProgress?.({ fase: 'avvio' })
    if (await verificaEPronto()) {
        onProgress?.({ fase: 'pronto' })
        return { ok: true }
    }
    const avviato = await talosBeginModelTransfer({
        repo: TALOS_MODELLO_PARAKEET.deposito,
        revision: TALOS_MODELLO_PARAKEET.revisione,
        files: TALOS_MODELLO_PARAKEET.file.map((f) => ({ path: f.nome, bytes: f.byte, sha256: f.sha256 })),
        modelName: TALOS_ASR_NOME_DEL_TRASFERIMENTO,
    })
    if (!avviato.ok) {
        onProgress?.({ fase: 'fallito', motivo: avviato.reason })
        return { ok: false, motivo: avviato.reason }
    }
    // Come per la voce personale (misurato il 22/08/2026): un trasferimento già esistente e fermo non riparte con `start`.
    await talosRefreshModelTransfer()
    const fermo = talosModelTransfers.items.find((i) => i.modelName === TALOS_ASR_NOME_DEL_TRASFERIMENTO)
    if (fermo && fermo.resumable && (fermo.phase === 'failed' || fermo.phase === 'paused')) {
        const ripreso = await talosResumeManagedModelTransfer(fermo.id)
        if (!ripreso.ok) {
            onProgress?.({ fase: 'fallito', motivo: ripreso.reason })
            return { ok: false, motivo: ripreso.reason }
        }
    }
    talosKeepWatchingTransfers()

    return new Promise((risolvi) => {
        const lascia = talosRetainModelTransferObserver()
        let chiuso = false
        let smetti: (() => void) | undefined
        const fine = (esito: { ok: true } | { ok: false, motivo: string }): void => {
            if (chiuso) return
            chiuso = true
            smetti?.()
            lascia()
            risolvi(esito)
        }
        smetti = watch(
            () => talosModelTransfers.items,
            (voci) => {
                const mia = voci.find((i) => i.modelName === TALOS_ASR_NOME_DEL_TRASFERIMENTO)
                if (mia?.failure) {
                    onProgress?.({ fase: 'fallito', motivo: mia.failure })
                    fine({ ok: false, motivo: mia.failure })
                    return
                }
                if (mia) {
                    onProgress?.({ fase: 'scarico', fatti: mia.haveBytes, totali: mia.totalBytes })
                    return
                }
                // Sparito dalla lista: arrivato. Ma «pronto» lo dice solo il sigillo delle impronte.
                void (async () => {
                    onProgress?.({ fase: 'verifica' })
                    if (await verificaEPronto()) {
                        onProgress?.({ fase: 'pronto' })
                        fine({ ok: true })
                    } else {
                        onProgress?.({ fase: 'fallito', motivo: 'not-verified' })
                        fine({ ok: false, motivo: 'not-verified' })
                    }
                })()
            },
            { immediate: true },
        )
    })
}

/** Toglie il modello dal telefono. Torna quanti file ha tolto. */
export async function talosRimuoviModelloVocale(): Promise<number> {
    return (await talosAsrLocalePonte().rimuovi(TALOS_ASR_DOVE)).tolti
}
