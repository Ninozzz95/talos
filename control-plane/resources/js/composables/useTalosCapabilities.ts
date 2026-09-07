import {
    getCurrentScope,
    onScopeDispose,
    ref,
    watch,
    type InjectionKey,
    type Ref,
} from 'vue'
import { talosFetch } from '../lib/api'
import {
    parseTalosCapabilityManifest,
    type TalosCapabilityId,
    type TalosCapabilityManifest,
    type TalosCapabilityRecord,
} from '../lib/talosCapabilities'

type ApiEnvelope<T> = {
    data: T
}

export type TalosCapabilityLoadState = 'idle' | 'loading' | 'loaded' | 'error'

export interface TalosCapabilitiesDependencies {
    authenticated: Readonly<Ref<boolean>>
    runtimeReady: Readonly<Ref<boolean>>
    ownerKey: Readonly<Ref<string | null>>
    fetchManifest?: (ownerKey: string) => Promise<unknown>
}

export interface TalosCapabilitiesContext {
    manifest: Readonly<Ref<TalosCapabilityManifest | null>>
    loadState: Readonly<Ref<TalosCapabilityLoadState>>
    error: Readonly<Ref<string | null>>
    capability: (id: TalosCapabilityId) => TalosCapabilityRecord
    isAvailable: (id: TalosCapabilityId) => boolean
    isUsable: (id: TalosCapabilityId) => boolean
    loadCapabilities: (force?: boolean) => Promise<TalosCapabilityManifest | null>
    dispose: () => void
}

export const TALOS_CAPABILITIES_KEY: InjectionKey<TalosCapabilitiesContext> = Symbol('talos-capabilities')

const UNVERIFIED_EVIDENCE = Object.freeze(['client:capability-manifest-unverified'])

function unverifiedCapability(id: TalosCapabilityId): TalosCapabilityRecord {
    return Object.freeze({
        id,
        state: 'blocked',
        reason: 'TALOS has not verified this capability for the current operator.',
        evidence: UNVERIFIED_EVIDENCE,
    })
}

async function fetchCapabilityManifest(): Promise<unknown> {
    const response = await talosFetch<ApiEnvelope<unknown>>('/api/talos/capabilities')
    return response.data
}

export function useTalosCapabilities(
    dependencies: TalosCapabilitiesDependencies,
): TalosCapabilitiesContext {
    const manifest = ref<TalosCapabilityManifest | null>(null)
    const loadState = ref<TalosCapabilityLoadState>('idle')
    const error = ref<string | null>(null)
    const fetchManifest = dependencies.fetchManifest ?? fetchCapabilityManifest
    let loadedOwner: string | null = null
    let requestRevision = 0
    let disposed = false

    function currentOwner(): string | null {
        if (!dependencies.authenticated.value || !dependencies.runtimeReady.value) return null
        const owner = dependencies.ownerKey.value?.trim()
        return owner || null
    }

    function reset() {
        manifest.value = null
        loadState.value = 'idle'
        error.value = null
        loadedOwner = null
    }

    async function loadCapabilities(force = false): Promise<TalosCapabilityManifest | null> {
        const owner = currentOwner()
        if (!owner || disposed) {
            reset()
            return null
        }
        if (!force && loadedOwner === owner && loadState.value === 'loaded') {
            return manifest.value
        }

        const revision = ++requestRevision
        manifest.value = null
        loadState.value = 'loading'
        error.value = null

        try {
            const parsed = parseTalosCapabilityManifest(await fetchManifest(owner))
            if (disposed || revision !== requestRevision || currentOwner() !== owner) return null

            manifest.value = parsed
            loadState.value = 'loaded'
            loadedOwner = owner
            return parsed
        } catch (cause) {
            if (disposed || revision !== requestRevision || currentOwner() !== owner) return null

            manifest.value = null
            loadState.value = 'error'
            loadedOwner = null
            error.value = cause instanceof Error
                ? cause.message
                : 'TALOS could not verify product capabilities.'
            return null
        }
    }

    function capability(id: TalosCapabilityId): TalosCapabilityRecord {
        return manifest.value?.capabilities.find((record) => record.id === id)
            ?? unverifiedCapability(id)
    }

    function isAvailable(id: TalosCapabilityId): boolean {
        return capability(id).state === 'available'
    }

    function isUsable(id: TalosCapabilityId): boolean {
        return ['available', 'degraded'].includes(capability(id).state)
    }

    const stop = watch(
        [
            dependencies.authenticated,
            dependencies.runtimeReady,
            dependencies.ownerKey,
        ],
        () => {
            requestRevision += 1
            reset()
            if (currentOwner()) {
                void loadCapabilities().catch(() => undefined)
            }
        },
        { immediate: true },
    )

    function dispose() {
        if (disposed) return
        disposed = true
        requestRevision += 1
        stop()
        reset()
    }

    if (getCurrentScope()) {
        onScopeDispose(dispose)
    }

    return {
        manifest,
        loadState,
        error,
        capability,
        isAvailable,
        isUsable,
        loadCapabilities,
        dispose,
    }
}
