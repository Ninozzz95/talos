import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ⭐⭐ REG-COMP-12 — la forma del modello APERTO sbagliava la testa (P4-ter passo 2-bis, 02/10/2026).
 *
 * ## Il fatto, misurato sul Pad
 *
 * Spark-X2.5-4B sulla NPU: lo stato del motore dichiarava `headDim 160` (`n_embd / n_head`), la pianificazione 256
 * (`attention.key_length` letto dal file). La RAM libera con il contesto aperto a 2048 e a 8192 dà 0,904 GB per 6144
 * token, cioè ~147.100 byte a token = 2 × 36 × 4 × **256** × 2. Con 160 la cache era sotto-stimata del 37,5% e il
 * tetto saliva oltre il vero — il contrario della «parte prudente» che il commento prometteva.
 *
 * ## Perché questa prova legge il C++
 *
 * Il calcolo vive nel JNI, dove Vitest non arriva (stesso schema di `llamaRiusoVietatoSuGpuConSwa.test.ts`). Qui si
 * difende una SCELTA: la testa dichiarata dal file vince, tramite l'API pubblica di llama.cpp
 * (`llama_model_meta_val_str`), e `n_embd / n_head` resta solo il ripiego per i file che non la dichiarano.
 */
const jni = readFileSync(resolve(process.cwd(), 'android/app/src/main/cpp/talos_llama_jni.cpp'), 'utf8')

function corpoDi(nome: string): string {
    const inizio = jni.indexOf(`Java_ai_talos_TalosLlamaNative_${nome}(`)
    expect(inizio).toBeGreaterThanOrEqual(0)
    const fine = jni.indexOf('\n}\n', inizio)
    expect(fine).toBeGreaterThan(inizio)
    return jni.slice(inizio, fine)
}

describe('REG-COMP-12 — la testa del modello aperto viene dal file, come nella pianificazione', () => {
    it('FORMA-01 nativeModelShape legge attention.key_length dal modello aperto con l\'API pubblica', () => {
        const corpo = corpoDi('nativeModelShape')
        expect(corpo).toContain('talos_meta_intero(model, architettura + ".attention.key_length")')
        const inizio = jni.indexOf('static int64_t talos_meta_intero(const llama_model * model, const std::string & chiave) {')
        expect(inizio).toBeGreaterThanOrEqual(0)
        expect(jni.slice(inizio, jni.indexOf('\n}\n', inizio))).toContain('llama_model_meta_val_str(')
    })

    it('FORMA-02 n_embd / n_head è solo il ripiego, dentro il ramo «non dichiarata»', () => {
        const corpo = corpoDi('nativeModelShape')
        const dichiarata = corpo.indexOf('.attention.key_length")')
        const ripiego = corpo.indexOf('embedding / heads')
        expect(dichiarata).toBeGreaterThan(0)
        expect(ripiego).toBeGreaterThan(dichiarata)
        // Il ripiego sta dentro `if (headDim <= 0)`: mai una divisione che scavalca un valore dichiarato.
        expect(corpo.slice(dichiarata, ripiego)).toMatch(/if \(headDim <= 0\)/)
    })

    it('FORMA-03 l\'architettura viene da general.architecture', () => {
        const corpo = corpoDi('nativeModelShape')
        expect(corpo).toContain('talos_meta_testo(model, "general.architecture")')
    })
})
