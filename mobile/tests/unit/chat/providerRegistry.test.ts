import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    TALOS_MOBILE_PROVIDER_ADAPTERS,
    providerAdapterFor,
} from '@/lib/chat/providerRegistry'

describe('mobile provider registry', () => {
    /**
     * Seven since 2026-08-01: `local` joined, and it is the first entry that
     * reaches no network at all. It is in this list rather than beside it on
     * purpose — everything that answers a message answers through one contract,
     * so the model picker, the abort signal, the persistence and the receipts
     * all work for it without knowing it is different.
     */
    it('registers exactly the seven supported provider protocols', () => {
        expect(Object.keys(TALOS_MOBILE_PROVIDER_ADAPTERS).sort()).toEqual([
            'anthropic',
            'deepseek',
            'gemini',
            'local',
            'ollama',
            'openai',
            'openrouter',
        ])
    })

    it('fails closed for an unknown provider', () => {
        expect(() => providerAdapterFor('made-up-provider')).toThrow('TALOS_PROVIDER_UNSUPPORTED')
        try {
            providerAdapterFor('made-up-provider')
        } catch (error) {
            expect(error).toMatchObject({
                uiMessageKey: 'models.providerUnsupported',
                uiMessageParameters: { provider: 'made-up-provider' },
            })
        }
    })

    it('keeps every provider implementation behind a dynamic import', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/lib/chat/providerRegistry.ts'), 'utf8')
        expect(source).not.toMatch(/^import .*providers\//m)
        // Five since `local` arrived. It matters most for that one: its module
        // pulls in the bridge to the native engine, which has no business in
        // the entry chunk of a session that never opens a local model.
        expect(source.match(/import\('@\/lib\/chat\/providers\//g)).toHaveLength(5)
    })
})
