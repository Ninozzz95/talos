import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('LOCAL-PARITY-TOOL-RESULT-02 confine Android', () => {
    it('inoltra i messaggi completi invece di appiattirli in due array', () => {
        const plugin = read('android/app/src/main/java/ai/talos/TalosLlamaPlugin.java')

        expect(plugin).toContain('final String messagesJson = turns.toString();')
        expect(plugin).toContain('TalosLlamaEngine.planPrompt(path, messagesJson, toolsJson, pensa)')
        expect(plugin).toContain('attivo.chatPrompt(messagesJson, toolsJson, pensa)')
    })

    it('delega il parsing al contratto OpenAI-compatible di llama.cpp', () => {
        const native = read('android/app/src/main/cpp/talos_llama_jni.cpp')

        expect(native).toContain('common_chat_msgs_parse_oaicompat')
        expect(native).toMatch(/talos_apply_chat_template\([^]*jstring messagesJson/)
        expect(native).not.toMatch(/talos_apply_chat_template\([^]*jobjectArray roles[^]*jobjectArray contents/)
    })

    it('non inserisce il motivo del parser nei log che potrebbero contenere la conversazione', () => {
        const native = read('android/app/src/main/cpp/talos_llama_jni.cpp')

        expect(native).not.toContain('"messaggi chat non interpretabili: %s", failure.what()')
        expect(native.match(/TALOS_LOGE\("messaggi chat non interpretabili"\);/g)).toHaveLength(2)
    })

    it('LOCAL-PARITY-TEMPLATE-CAPS-07 interroga le capability upstream senza esportare il template', () => {
        const native = read('android/app/src/main/cpp/talos_llama_jni.cpp')
        const javaNative = read('android/app/src/main/java/ai/talos/TalosLlamaNative.java')
        const engine = read('android/app/src/main/java/ai/talos/TalosLlamaEngine.java')
        const plugin = read('android/app/src/main/java/ai/talos/TalosLlamaPlugin.java')

        expect(native).toContain('common_chat_templates_get_caps')
        expect(native).toContain('Java_ai_talos_TalosLlamaNative_nativeTemplateCapabilities')
        expect(javaNative).toContain('nativeTemplateCapabilities(String modelPath)')
        expect(engine).toContain('templateCapabilities(String modelPath)')
        expect(plugin).toContain('public void templateCapabilities(PluginCall call)')
        expect(plugin).toContain('TalosLlamaEngine.templateCapabilities(path)')
        expect(native).not.toContain('templateSource')
    })
})
