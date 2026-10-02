import type { TalosLocalBackendQualification } from '@/services/localEngine'
import type { TalosLocalEngineProbeConsent } from '@/lib/localEngineProbeConsent'

/**
 * Fa girare il sondaggio e, se ha girato, garantisce che il consenso sia
 * `granted` — premere il comando manuale è il sì più esplicito che esista,
 * più esplicito del «sì» della modale stessa, e riaccende anche da
 * `declined`. Vedi `spegnere-non-e-dimenticare`: «declined» non deve mai
 * significare irraggiungibile.
 *
 * ⛔ Puro e con le dipendenze da fuori — niente Capacitor, niente Pinia qui
 * dentro — perché il chiamante vero è uno screen lazy (le impostazioni) e
 * questo file non deve trascinarsi dietro né l'uno né l'altro nel grafo
 * d'avvio. `qualify`/`getConsent`/`setConsent` sono le stesse forme che
 * `chatController` già usa per l'equivalente automatico, cablate qui a mano
 * invece che importate: un doppio che salta la regola non protegge niente.
 */
export async function talosRunLocalEngineProbeAndEnsureGranted(
    path: string,
    deps: {
        qualify: (path: string) => Promise<TalosLocalBackendQualification>
        getConsent: () => TalosLocalEngineProbeConsent
        setConsent: (consent: TalosLocalEngineProbeConsent) => Promise<void>
    },
): Promise<TalosLocalBackendQualification> {
    const result = await deps.qualify(path)
    if (result.ran && deps.getConsent() !== 'granted') {
        await deps.setConsent('granted')
    }
    return result
}

/**
 * ⭐ A3 (01/10/2026) — la frase dell'esito, UNA per l'avviso e per le
 * Impostazioni; il traduttore arriva da fuori, come le altre dipendenze qui.
 *
 * ⛔ A3-REG-02: prima si traducevano solo `opencl` e `cpu`, quindi una vittoria
 * dell'NPU diventava «non abbastanza stabile». ⛔ A3-REG-03: «Fatto. … vanno più
 * veloci con …» compariva anche quando nessun motore era stato misurato (sul
 * Pad, Qwen3-4B Q4_K_M: la CPU scadeva prima del primo token e GPU e NPU non
 * partivano). Il nome del motore è quello per persone, mai il registry.
 */
export function talosLocalEngineProbeMessage(
    result: TalosLocalBackendQualification,
    t: (key: string, params?: Record<string, string>) => string,
): string {
    if (!result.ran) {
        if (result.reason === 'hot') return t('privacyPermissions.localEngineProbe.resultNotRun.hot')
        if (result.reason === 'already-proven') {
            return t('privacyPermissions.localEngineProbe.resultNotRun.alreadyProven')
        }
        return t('privacyPermissions.localEngineProbe.resultInconclusive')
    }
    if (!result.probedCpu && !result.probedGpu && !result.probedNpu) {
        return t('privacyPermissions.localEngineProbe.resultNothingMeasured')
    }
    const chiave = result.decisionBackend !== null
        && ['cpu', 'opencl', 'vulkan', 'hexagon'].includes(result.decisionBackend)
        ? result.decisionBackend : 'unknown'
    return t('privacyPermissions.localEngineProbe.resultRan', {
        backend: t(`privacyPermissions.localEngineProbe.backendLabels.${chiave}`),
    })
}
