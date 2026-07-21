/**
 * Provider API keys held in the OS secure enclave (Android Keystore / iOS Keychain
 * via @aparajita/capacitor-secure-storage) — never in Preferences/localStorage
 * plaintext, never logged or sent to telemetry. Keys are namespaced per provider.
 * The store never surfaces the secret to persisted app state; the UI only learns a
 * boolean `has_secret` from `hasProviderKey`.
 */
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

const KEY_PREFIX = 'talos.provider.key.'

/** The subset of the Keystore backend the service needs; injectable for tests. */
export interface SecureKeyBackend {
    get(key: string): Promise<unknown>
    set(key: string, value: string): Promise<void>
    remove(key: string): Promise<boolean>
}

const defaultBackend: SecureKeyBackend = {
    get: (key) => SecureStorage.get(key) as Promise<unknown>,
    set: (key, value) => SecureStorage.set(key, value),
    remove: (key) => SecureStorage.remove(key),
}

function storageKey(provider: string): string {
    return `${KEY_PREFIX}${provider}`
}

export async function setProviderKey(
    provider: string,
    key: string,
    backend: SecureKeyBackend = defaultBackend,
): Promise<void> {
    const trimmed = key.trim()
    if (trimmed === '') {
        throw new Error('Provider key must not be empty.')
    }
    await backend.set(storageKey(provider), trimmed)
}

export async function getProviderKey(
    provider: string,
    backend: SecureKeyBackend = defaultBackend,
): Promise<string | null> {
    const value = await backend.get(storageKey(provider))
    return typeof value === 'string' && value !== '' ? value : null
}

export async function hasProviderKey(
    provider: string,
    backend: SecureKeyBackend = defaultBackend,
): Promise<boolean> {
    return (await getProviderKey(provider, backend)) !== null
}

export async function clearProviderKey(
    provider: string,
    backend: SecureKeyBackend = defaultBackend,
): Promise<void> {
    await backend.remove(storageKey(provider))
}
