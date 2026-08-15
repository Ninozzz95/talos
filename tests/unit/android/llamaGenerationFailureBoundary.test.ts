import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/java/ai/talos/TalosLlamaPlugin.java',
), 'utf8')

function generateBody(): string {
    const start = source.indexOf('public void generate(PluginCall call) {')
    const end = source.indexOf('\n    /** Emits what is new since `sent`', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end)
}

describe('C45-RED-18I Java generation failure boundary', () => {
    it('rejects budget and runtime failures and always releases the busy flag', () => {
        const body = generateBody()

        expect(body).toContain('TALOS_LLAMA_CONTEXT_REQUIRED')
        expect(body).toContain('catch (RuntimeException failure)')
        expect(body).toContain('TALOS_LLAMA_GENERATION_FAILED')
        expect(body).toMatch(/finally \{[^]*generating\.set\(false\);[^]*\}/)
    })
})
