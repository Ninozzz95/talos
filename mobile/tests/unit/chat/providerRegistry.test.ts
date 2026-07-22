import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    TALOS_MOBILE_PROVIDER_ADAPTERS,
    providerAdapterFor,
} from '@/lib/chat/providerRegistry'

describe('mobile provider registry', () => {
    it('registers exactly the six supported provider protocols', () => {
        expect(Object.keys(TALOS_MOBILE_PROVIDER_ADAPTERS).sort()).toEqual([
            'anthropic',
            'deepseek',
            'gemini',
            'ollama',
            'openai',
            'openrouter',
        ])
    })

    it('fails closed for an unknown provider', () => {
        expect(() => providerAdapterFor('made-up-provider')).toThrow(/unsupported provider/i)
    })

    it('keeps every provider implementation behind a dynamic import', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/lib/chat/providerRegistry.ts'), 'utf8')
        expect(source).not.toMatch(/^import .*providers\//m)
        expect(source.match(/import\('@\/lib\/chat\/providers\//g)).toHaveLength(4)
    })
})
