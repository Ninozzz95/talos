import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * D-45 — le due manopole dell'esperimento sul Pad, e il divieto che le conosce.
 *
 * Sul telefono di una persona le proprieta' `talos.esperimento.*` non
 * esistono: niente cambia. Queste prove difendono tre cose che, perse in
 * silenzio, renderebbero l'esperimento una bugia: che la cache SWA piena si
 * chieda DAVVERO al motore, che il divieto di riuso si sollevi SOLO in quel
 * caso, e che la stessa regola valga anche quando il contesto viene
 * ricostruito piu' largo.
 */
const jni = readFileSync(resolve(process.cwd(), 'android/app/src/main/cpp/talos_llama_jni.cpp'), 'utf8')

describe('D-45 — esperimento swa_full / Flash Attention', () => {
    it('ESP-01 la proprieta ha un prefisso suo, e si legge dal sistema', () => {
        expect(jni).toContain('std::string("talos.esperimento.") + nome')
        expect(jni).toContain('talos_esperimento("swa_full") == "1"')
        expect(jni).toContain('talos_esperimento("fa") == "off"')
    })

    it('ESP-02 la cache piena si chiede al motore, non solo loggata', () => {
        expect(jni).toContain('ctx_params.swa_full = true;')
    })

    /** ⛔ AL CONTRARIO: senza cache piena il divieto del §47 resta intero. */
    it('ESP-03 il divieto di riuso si solleva SOLO con la cache SWA piena', () => {
        expect(jni).toContain('gpuLayers != 0 && finestra > 0 && !swa_piena')
    })

    it('ESP-04 la stessa regola vale alla ricostruzione del contesto', () => {
        const ricostruzione = jni.slice(jni.indexOf('Java_ai_talos_TalosLlamaNative_nativeReopenContext'))
        expect(ricostruzione.slice(0, 3000)).toContain('talos_applica_esperimenti(ctx_params, session->model')
    })
})
