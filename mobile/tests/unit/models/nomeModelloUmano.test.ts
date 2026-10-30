/**
 * NOME-01..07 — il nome breve del modello nella pillola del compositore (owner 28/10/2026: «il logo provider e SOLO il nome del
 * modello, non il nome del provider + il modello»). Porta identica di `nomeModelloUmano`/`nomeDaTarga` del desktop
 * (`harness-ui/frontend/src/components/chat-foot.js:228-278`); i casi sono quelli delle sue prove (`tests/unit/chat-foot.test.mjs:52`,
 * `:239`, `:281`, `:298`, `:303`; `nome-modello-locale-revisione-9.test.mjs:41`), con la differenza che qui il file del modello
 * locale è il `model` del profilo (un percorso), non un catalogo da registrare.
 */
import { describe, expect, it } from 'vitest'
import { talosNomeBreveDelProfilo, talosNomeModelloUmano } from '@/lib/models/nomeModelloUmano'

const attivi = (totali: string, quanti: string) => `${totali} (${quanti} attivi)`

describe('NOME il nome breve del modello', () => {
    it('NOME-01 (PIEDE-MODELLO) un id locale diventa un nome; un modello di rete resta com\'è', () => {
        expect(talosNomeModelloUmano('local:bartowski-nvidia_Nemotron-Cascade-2-30B-A3B-GGUF-931b595fc71b-nvidia-Nemotron-Cascade-2-30B-A3B-Q4-0-gguf', { attivi }))
            .toBe('nvidia Nemotron Cascade 2 · 30B (3B attivi) · Q4_0')
        expect(talosNomeModelloUmano('local:unsloth-Qwen3.5-35B-A3B-GGUF-abc123-Qwen3.5-35B-A3B-Q4_K_M-gguf', { attivi })).toBe('Qwen3.5 · 35B (3B attivi) · Q4_K_M')
        expect(talosNomeModelloUmano('z-ai/glm-5.3-flash', { attivi })).toBe('glm-5.3-flash')
        expect(talosNomeModelloUmano('claude-opus-5', { attivi })).toBe('claude-opus-5')
        expect(talosNomeModelloUmano('local:strano', { attivi })).toBe('strano')
    })

    it('NOME-02 (NOME-MODELLO-PREFISSO) il prefisso di un fornitore diretto non arriva a schermo; un due punti che non è un fornitore resta', () => {
        expect(talosNomeModelloUmano('chatgpt:gpt-5.6-luna', { attivi })).toBe('gpt-5.6-luna')
        expect(talosNomeModelloUmano('deepseek:deepseek-chat', { attivi })).toBe('deepseek-chat')
        expect(talosNomeModelloUmano('openai:gpt-6-sol', { attivi })).toBe('gpt-6-sol')
        expect(talosNomeModelloUmano('meta-llama/llama-4-scout:free', { attivi })).toBe('llama-4-scout:free')
        expect(talosNomeModelloUmano('zai-anthropic:glm-5.3', { attivi })).toBe('glm-5.3')
        expect(talosNomeModelloUmano('qualcosa:', { attivi })).toBe('qualcosa:')
    })

    it('NOME-03 (NOME-LOCALE-01) col file del modello il punto della versione resta, e chi pubblica non c\'è', () => {
        expect(talosNomeModelloUmano('local:LiquidAI-LFM2-5-24B-A2B-GGUF-0912d33141f7-LFM2-5-24B-A2B-Q4-K-M', { attivi, file: 'LFM2.5-24B-A2B-Q4_K_M.gguf' }))
            .toBe('LFM2.5 · 24B (2B attivi) · Q4_K_M')
        expect(talosNomeModelloUmano('local:unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M', { attivi, file: 'GLM-4.7-Flash-Q4_K_M.gguf' }))
            .toBe('GLM 4.7 Flash · Q4_K_M')
    })

    it('NOME-04 (NOME-LOCALE-02) un modello in più file dice il nome, non «00001 of»', () => {
        expect(talosNomeModelloUmano('local:x-Big-GGUF-1-Big', { attivi, file: 'Qwen3.5-122B-A10B-Q4_K_M-00001-of-00003.gguf' }))
            .toBe('Qwen3.5 · 122B (10B attivi) · Q4_K_M')
    })

    it('NOME-05 (NOME-LOCALE-03) un file dal nome generico non cancella il nome che l\'id sa dire', () => {
        expect(talosNomeModelloUmano('local:TheBloke-Llama-2-7B-GGUF-abc-llama-2-7b-q4_0', { attivi, file: 'ggml-model-q4_0.gguf' })).toMatch(/^Llama 2/u)
        expect(talosNomeModelloUmano('local:microsoft-Phi-3-mini-gguf-def-phi3', { attivi, file: 'model.gguf' })).toMatch(/^Phi 3 mini/u)
        expect(talosNomeModelloUmano('local:x-Qwen3-8B-GGUF-ghi-Qwen3-8B-Q4_K_M', { attivi, file: 'Scaricato (1).gguf' })).not.toMatch(/Scaricato/u)
        expect(talosNomeModelloUmano('local:LiquidAI-LFM2-5-1B-GGUF-x-LFM2-5-1B-Q8-0', { attivi, file: 'LFM2.5-1B-Q8_0.gguf' })).toMatch(/^LFM2\.5/u)
    })

    it('NOME-06 (A10-9) il trattino davanti a uno zero è una virgola: «Qwen3-0-6B» è 0.6B', () => {
        expect(talosNomeModelloUmano('local:Qwen-Qwen3-0-6B-GGUF-x-Qwen3-0-6B-Q8-0', { attivi })).toBe('Qwen3 · 0.6B · Q8_0')
    })

    it('NOME-07 il profilo del telefono: i locali dal file del percorso (la cartella del repo se il file è generico), il resto dal modello', () => {
        expect(talosNomeBreveDelProfilo({ provider: 'local', model: '/sdcard/Android/data/ai.talos.dev/files/models/unsloth/Qwen3.5-0.8B-GGUF/6ab4/Qwen3.5-0.8B-Q4_K_M.gguf', display_name: 'Qwen3.5-0.8B-Q4_K_M' }, attivi))
            .toBe('Qwen3.5 · 0.8B · Q4_K_M')
        expect(talosNomeBreveDelProfilo({ provider: 'local', model: '/x/models/microsoft/Phi-3-mini-4k-instruct-gguf/main/model.gguf', display_name: 'model' }, attivi))
            .toMatch(/^Phi 3 mini/u)
        expect(talosNomeBreveDelProfilo({ provider: 'chatgpt', model: 'gpt-6-luna', display_name: 'ChatGPT · GPT-6-Luna' }, attivi)).toBe('gpt-6-luna')
        expect(talosNomeBreveDelProfilo({ provider: 'openrouter', model: 'z-ai/glm-5.3-flash', display_name: 'Z.ai: GLM 5.3 Flash' }, attivi)).toBe('glm-5.3-flash')
        // senza modello leggibile: il nome che c'è, mai una stringa vuota
        expect(talosNomeBreveDelProfilo({ provider: 'chatgpt', model: '', display_name: 'GPT-6-Luna' }, attivi)).toBe('GPT-6-Luna')
    })
})
