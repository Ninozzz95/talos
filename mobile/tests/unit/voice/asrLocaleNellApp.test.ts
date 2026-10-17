// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TALOS_NATIVE_COMPONENTS } from '@/lib/legal/nativeComponents'
import { TALOS_MODELLO_PARAKEET } from '@/lib/voice/modelloParakeet'

/**
 * N12 (mobile, 13/10/2026) — ciò che il riconoscimento vocale locale porta nell'app: una libreria nativa ufficiale fissata
 * per impronta, la sua interfaccia Kotlin, il modello delle pause. Tre cose che devono restare vere a ogni build:
 * la scheda di provenienza le dichiara tutte, la build di rilascio non toglie le classi che il JNI legge per nome, e le
 * Note legali nominano ogni pezzo con la sua licenza.
 */
const radice = resolve(__dirname, '../../../android/app')
const scheda = readFileSync(resolve(radice, 'src/main/jniLibs/PROVENIENZA-ASR.md'), 'utf8')
const righe = [...scheda.matchAll(/^\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|\s*`([0-9a-f]{64})`\s*\|$/gmu)].map((m) => ({ nome: m[1]!, byte: Number(m[2]) }))

describe('N12 — il riconoscimento vocale locale dentro l app', () => {
    it('N12-PROV-01: la scheda dichiara archivio, libreria, sorgenti Kotlin e modello delle pause, ognuno con peso e impronta', () => {
        expect(scheda).toMatch(/^Archivio: `https:\/\/github\.com\/k2-fsa\/sherpa-onnx\/releases\/download\/v1\.13\.8\/\S+static-link-onnxruntime\.tar\.bz2`$/mu)
        const nomi = righe.map((r) => r.nome)
        expect(nomi.filter((n) => n.endsWith('.tar.bz2'))).toHaveLength(1)
        expect(nomi).toContain('jniLibs/arm64-v8a/libsherpa-onnx-jni.so')
        expect(nomi).toContain('asr/silero_vad.onnx')
        for (const necessario of ['OfflineRecognizer.kt', 'OfflineStream.kt', 'Vad.kt', 'FeatureConfig.kt']) {
            expect(nomi, necessario).toContain(`kotlin/${necessario}`)
        }
        // una sola architettura nell'APK, come il resto dell'app
        expect(nomi.filter((n) => n.startsWith('jniLibs/'))).toEqual(['jniLibs/arm64-v8a/libsherpa-onnx-jni.so'])
    })

    it('N12-PROV-02: la build scarica e verifica da quella scheda, e la build di rilascio tiene le classi che il JNI legge per nome', () => {
        const gradle = readFileSync(resolve(radice, 'build.gradle'), 'utf8')
        expect(gradle).toContain("tasks.register('preparaAsrLocale')")
        expect(gradle).toMatch(/dependsOn[^\n]*'preparaAsrLocale'/u)
        // sherpa-onnx costruisce le sue configurazioni leggendo i campi Kotlin PER NOME dal nativo: rinominati, non parte
        const regole = readFileSync(resolve(radice, 'proguard-rules.pro'), 'utf8')
        expect(regole).toContain('-keep class com.k2fsa.sherpa.onnx.** { *; }')
    })

    it('N12-LEGALE-01: le Note legali nominano sherpa-onnx, il suo runtime, il modello delle pause e Parakeet, con le licenze', () => {
        const trova = (pezzo: string) => TALOS_NATIVE_COMPONENTS.find((c) => c.name.includes(pezzo))
        expect(trova('sherpa-onnx')).toMatchObject({ version: '1.13.8', license: 'Apache-2.0' })
        expect(trova('Silero VAD')).toMatchObject({ license: 'MIT' })
        expect(trova('Parakeet')).toMatchObject({ license: TALOS_MODELLO_PARAKEET.licenza })
        // il modello non è nell'APK: lo dice
        expect(trova('Parakeet')!.note).toMatch(/primo uso/u)
        // il runtime ONNX dentro sherpa è un'altra copia, di un'altra versione
        expect(trova('sherpa-onnx')!.note).toMatch(/ONNX Runtime 1\.28\.2/u)
    })
})
