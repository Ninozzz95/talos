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
