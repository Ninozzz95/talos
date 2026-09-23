import type { TalosMobileModelProfileView, TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'
import { talosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { providerAdapterFor } from '@/lib/chat/providerRegistry'
import { talosMobileModelProfiles } from '@/lib/mobileModelCatalog'
import {
    TALOS_DEFAULT_MODEL_LAB_PREFERENCES,
    type TalosMobileModelLabPreferences,
} from '@/lib/modelLabContracts'
import { TALOS_MOBILE_PROVIDERS } from '@/lib/mobileProviders'
import { getProviderEndpoint } from '@/services/providerEndpointStore'
import { getProviderKey, hasProviderKey } from '@/services/secureKeyStore'

const PROVIDER_IDS = TALOS_MOBILE_PROVIDERS.map((provider) => provider.id)
    .filter((provider): provider is TalosMobileProviderId => provider !== 'unknown')

/**
 * ⭐⭐⭐ 28/8, "procedi in ordine" punto 4 — owner: «io devo poter usare
 * qualunque modello di qualunque provider voglio, esattamente come
 * abbiamo fatto nella sezione Chat, quindi ogni componente già esistente
 * deve essere utilizzato e riutilizzato nella sezione codice». Sostituisce
 * `CODE_MODEL_PROFILES` (un solo profilo finto, `gpt-5.6-sol`, mai
 * esistito davvero) in `HarnessSessionScreen.vue`.
 *
 * ⛔ Deliberatamente NON `useChatController()`: `HarnessSessionScreen.vue`
 * non lo importa per costruzione (CODE-COMPOSER-SINGLE-SOURCE-01) — la
 * sua `discoveredModels`/`secrets` vive dentro un composable enorme e
 * stateful, non riusabile in isolamento senza portarsi dietro tutta la
 * chat. Questa funzione chiama invece DIRETTAMENTE gli stessi pezzi
 * riusabili che chatController.ts stesso chiama (`providerAdapterFor`,
 * `talosMobileModelProfiles`, `secureKeyStore`, `providerEndpointStore`)
 * — stesso catalogo, stessa logica di readiness, un secondo composable
 * indipendente invece di un secondo copione.
 *
 * Per ogni provider CONFIGURATO (stessa regola di `refreshProvider` in
 * chatController.ts: una chiave se il provider la vuole, un endpoint se
 * la vuole), scarica il catalogo VERO — mai un elenco statico. Un
 * provider che fallisce (rete, chiave scaduta) non svuota gli altri: si
 * ignora e si continua, lo stesso principio del `try/catch` per-provider
 * già in chatController.ts, qui senza uno stato reattivo da aggiornare.
 */
export async function caricaProfiliModelloCodice(
    preferences: TalosMobileModelLabPreferences = TALOS_DEFAULT_MODEL_LAB_PREFERENCES,
): Promise<TalosMobileModelProfileView[]> {
    const haSegretoPerProvider: Partial<Record<TalosMobileProviderId, boolean>> = {}
    const modelliScoperti: TalosMobileProviderModel[] = []

    await Promise.all(PROVIDER_IDS.map(async (provider) => {
        const adapter = providerAdapterFor(provider)
        const [apiKey, endpoint, haChiave] = await Promise.all([
            getProviderKey(provider),
            getProviderEndpoint(provider),
            hasProviderKey(provider),
        ])
        haSegretoPerProvider[provider] = haChiave
        const mancaSegreto = adapter.requiresSecret && !apiKey
        const mancaEndpoint = adapter.requiresEndpoint && !endpoint
        if (mancaSegreto || mancaEndpoint) return

        const timeoutSeconds = preferences.provider_runtime[provider]?.timeout_seconds
        const timeoutMs = timeoutSeconds ? timeoutSeconds * 1000 : undefined
        try {
            const catalogo = await adapter.listModels({ apiKey, endpoint, timeoutMs }, talosMobileHttpTransport)
            modelliScoperti.push(...catalogo.models)
        } catch {
            // Un provider che fallisce non deve svuotare gli altri.
        }
    }))

    return talosMobileModelProfiles(
        modelliScoperti,
        // Stesso caso speciale di chatController.ts: il motore locale non ha
        // bisogno di nessuna chiave, "ce l'ha" per costruzione.
        (provider) => provider === 'local' || haSegretoPerProvider[provider] === true,
        preferences,
    )
}
