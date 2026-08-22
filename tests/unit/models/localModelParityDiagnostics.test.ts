import { describe, expect, it } from 'vitest'
import {
    buildTalosLocalModelParityReport,
    talosContainsLocalProtocol,
    type TalosLocalParityCheck,
} from '@/lib/models/localModelParityDiagnostics'

const check = (
    id: TalosLocalParityCheck['id'],
    status: TalosLocalParityCheck['status'],
): TalosLocalParityCheck => ({ id, status, durationMs: 12, code: `TALOS_${status}` })

const BASE = {
    modelPath: '/storage/emulated/0/Android/data/ai.talos/files/models/repo/main/model.gguf',
    modelBytes: 1_234_567,
    modelModifiedAt: 42,
    appBuild: 'R-test',
    engineBuild: 'llama-test',
}

describe('LOCAL-PARITY-DIAGNOSTICS-03 verdetto fail-closed', () => {
    it('è compatible soltanto quando ogni controllo obbligatorio passa', () => {
        const report = buildTalosLocalModelParityReport({
            ...BASE,
            checks: [
                check('plain_text', 'pass'),
                check('no_false_tool', 'pass'),
                check('tool_call', 'pass'),
                check('tool_result_roundtrip', 'pass'),
                check('protocol_hygiene', 'pass'),
                check('cancel', 'pass'),
            ],
        })
        expect(report.verdict).toBe('compatible')
        expect(report.summary).toEqual({ passed: 6, failed: 0, skipped: 0 })
    })

    it('uno skipped non viene dipinto di verde', () => {
        const report = buildTalosLocalModelParityReport({
            ...BASE,
            checks: [check('plain_text', 'pass'), check('cancel', 'skipped')],
        })
        expect(report.verdict).toBe('incomplete')
    })

    it('un fallimento domina gli skipped', () => {
        const report = buildTalosLocalModelParityReport({
            ...BASE,
            checks: [check('plain_text', 'fail'), check('cancel', 'skipped')],
        })
        expect(report.verdict).toBe('incompatible')
    })

    it('non esporta il percorso del dispositivo', () => {
        const report = buildTalosLocalModelParityReport({
            ...BASE,
            checks: [check('plain_text', 'pass')],
        })
        expect(report.model.name).toBe('model.gguf')
        expect(JSON.stringify(report)).not.toContain('/storage/emulated')
        expect(report.fingerprint).toMatch(/^[a-f0-9]{16}$/)
    })

    it('mantiene la stessa impronta se lo stesso GGUF cambia soltanto cartella', () => {
        const first = buildTalosLocalModelParityReport({
            ...BASE,
            checks: [check('plain_text', 'pass')],
        })
        const moved = buildTalosLocalModelParityReport({
            ...BASE,
            modelPath: '/data/user/0/ai.talos/files/another/model.gguf',
            checks: [check('plain_text', 'pass')],
        })

        expect(moved.fingerprint).toBe(first.fingerprint)
    })

    it('LOCAL-PARITY-TEMPLATE-TRANSPORT-06 riporta la corsia e cambia impronta senza esportare il path', () => {
        const native = buildTalosLocalModelParityReport({
            ...BASE,
            toolTransport: 'native-template',
            templateCapabilities: {
                supportsTools: true,
                supportsToolCalls: true,
                supportsSystemRole: true,
            },
            checks: [check('plain_text', 'pass')],
        })
        const prompted = buildTalosLocalModelParityReport({
            ...BASE,
            toolTransport: 'prompt-json-v1',
            templateCapabilities: {
                supportsTools: false,
                supportsToolCalls: false,
                supportsSystemRole: true,
            },
            checks: [check('plain_text', 'pass')],
        })

        expect(native.toolTransport).toBe('native-template')
        expect(native.templateCapabilities).toEqual({
            supportsTools: true, supportsToolCalls: true, supportsSystemRole: true,
        })
        expect(prompted.fingerprint).not.toBe(native.fingerprint)
        expect(JSON.stringify(prompted)).not.toContain('/storage/emulated')
    })
})

describe('vocabolario tecnico che non deve raggiungere la chat', () => {
    for (const sample of [
        'TOOL_CODE\ntool: memory_search\nargs:\nquery: x',
        '<tool_call>{"name":"memory_search"}</tool_call>',
        '<tools><tool_details>...</tool_details></tools>',
        'tool_details: library_list, notes_list',
    ]) {
        it(`riconosce ${sample.slice(0, 18)}`, () => {
            expect(talosContainsLocalProtocol(sample)).toBe(true)
        })
    }

    it('non segnala prosa che nomina genericamente un tool', () => {
        expect(talosContainsLocalProtocol('Puoi usare gli strumenti disponibili.')).toBe(false)
    })
})
