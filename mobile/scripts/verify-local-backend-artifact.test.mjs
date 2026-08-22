import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { assertBackendArtifact } from './verify-local-backend-artifact.mjs'

const CPU_FLOOR = [
    'libggml-base.so',
    'libggml.so',
    'libtalos_llama.so',
    'libggml-cpu-android_armv8.0_1.so',
    'libggml-cpu-android_armv9.2_2.so',
]

describe('assertBackendArtifact() — Fase 0, il cancello backend dichiarato==spedito', () => {
    it('PASS: il pavimento CPU da solo, atteso solo cpu', () => {
        const result = assertBackendArtifact(CPU_FLOOR, ['cpu'])
        assert.equal(result.verdict, 'PASS')
        assert.deepEqual(result.issues, [])
    })

    it('PASS: CPU + OpenCL, atteso cpu e opencl', () => {
        const result = assertBackendArtifact([...CPU_FLOOR, 'libggml-opencl.so'], ['cpu', 'opencl'])
        assert.equal(result.verdict, 'PASS')
    })

    /**
     * ⛔⛔⛔ Il caso che questo script esiste per prevenire: il documento
     * `talosResearchBackend=opencl` finisce per errore nell'invocazione di
     * rilascio (o viceversa, un `-PtalosResearchBackend=cpu` esplicito
     * spegne OpenCL su un rilascio che lo dichiara). Divergenza in ENTRAMBE
     * le direzioni deve fallire, non solo "manca qualcosa".
     */
    it('AL CONTRARIO — FAIL: OpenCL presente ma NON atteso (un flag di ricerca infilato per errore in un rilascio dichiarato CPU-only)', () => {
        const result = assertBackendArtifact([...CPU_FLOOR, 'libggml-opencl.so'], ['cpu'])
        assert.equal(result.verdict, 'FAIL')
        assert.ok(result.issues.some((i) => i.includes('opencl non era nell\'elenco atteso')))
    })

    it('AL CONTRARIO — FAIL: OpenCL atteso ma assente (il rilascio dichiara un acceleratore che non ha spedito)', () => {
        const result = assertBackendArtifact(CPU_FLOOR, ['cpu', 'opencl'])
        assert.equal(result.verdict, 'FAIL')
        assert.ok(result.issues.some((i) => i.includes('libggml-opencl.so assente')))
    })

    it('FAIL: manca il pavimento CPU (nessuna variante libggml-cpu-*)', () => {
        const result = assertBackendArtifact(['libggml-base.so', 'libggml.so', 'libtalos_llama.so'], ['cpu'])
        assert.equal(result.verdict, 'FAIL')
        assert.ok(result.issues.some((i) => i.includes('pavimento CPU')))
    })

    it('FAIL: manca libtalos_llama.so, il nucleo nativo', () => {
        const result = assertBackendArtifact(
            CPU_FLOOR.filter((name) => name !== 'libtalos_llama.so'),
            ['cpu'],
        )
        assert.equal(result.verdict, 'FAIL')
        assert.ok(result.issues.some((i) => i.includes('libtalos_llama.so')))
    })

    /**
     * ⛔⛔⛔ MISURATO 2026-08-20 (build.gradle): una `libOpenCL.so` propria
     * oscura quella di sistema e fa fallire `dlopen` di
     * `libggml-opencl.so` SILENZIOSAMENTE - nessun errore, solo un backend
     * che non si registra. Vietata SEMPRE, indipendente dai backend attesi.
     */
    it('FAIL: libOpenCL.so del vendor presente, anche se OpenCL era atteso', () => {
        const result = assertBackendArtifact(
            [...CPU_FLOOR, 'libggml-opencl.so', 'libOpenCL.so'],
            ['cpu', 'opencl'],
        )
        assert.equal(result.verdict, 'FAIL')
        assert.ok(result.issues.some((i) => i.includes('libOpenCL.so')))
    })

    it('AL CONTRARIO: libOpenCL.so assente non solleva nulla di suo', () => {
        const result = assertBackendArtifact([...CPU_FLOOR, 'libggml-opencl.so'], ['cpu', 'opencl'])
        assert.ok(!result.issues.some((i) => i.includes('libOpenCL.so')))
    })

    it('FAIL: backend sconosciuto nell\'elenco atteso', () => {
        const result = assertBackendArtifact(CPU_FLOOR, ['cpu', 'hexagon'])
        assert.equal(result.verdict, 'FAIL')
        assert.ok(result.issues.some((i) => i.includes('hexagon')))
    })
})
