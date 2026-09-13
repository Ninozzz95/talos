import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/cpp/talos_llama_jni.cpp',
), 'utf8')

function applyGrammarBody(): string {
    const start = source.indexOf('void applyGrammar(talos_session * session) {')
    const end = source.indexOf('\n}\n\n} // namespace', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end + 2)
}

describe('C45-RED-18G native grammar failure boundary', () => {
    it('contains both upstream throws and falls back to a fresh unconstrained sampler', () => {
        const body = applyGrammarBody()

        // `common_sampler_init` throws when generated GBNF does not compile.
        // C++ exceptions may never cross a JNI entry point: Android terminates
        // the whole process instead of turning one failed constraint into one
        // failed request.
        expect(body.match(/common_sampler_init\(/g)).toHaveLength(2)
        expect(body.match(/catch \(const std::exception & [a-z_]+\)/g)).toHaveLength(2)

        // The second build starts from the model/session defaults, not from the
        // object carrying the invalid grammar. This also prevents a previous
        // turn's grammar from remaining attached to the live sampler.
        expect(body).toContain('common_params_sampling fallback = session->sampling;')
        expect(body).toMatch(/catch \(const std::exception & failure\)[^]*common_sampler_init\(session->model, fallback\)/)
        expect(body).toMatch(/catch \(const std::exception & fallback_failure\)[^]*return;/)
    })
})
