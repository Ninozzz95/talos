import { describe, expect, it } from 'vitest'

import {
    TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE,
    TALOS_LOCAL_BACKEND_KINDS,
    parseTalosLocalBackendPreference,
    talosBackendKindOfRegistry,
    talosDecideLocalBackend,
    talosLocalBackendInUse,
    talosLocalBackendOptions,
    talosLocalBackendRequest,
    type TalosLocalBackendDevice,
} from '@/lib/models/localBackendChoice'
import type { TalosProfileForSelection } from '@/lib/models/localProfileSelector'

/**
 * ⛔ I dispositivi qui sotto portano i nomi VERI che il motore dichiara, letti
 * nel sottomodulo il 2026-09-10: `OpenCL` (`ggml-opencl.cpp:10903`), `HTP`
 * (`ggml-hexagon.cpp:4317`), `CPU`. Un test che inventasse nomi proverebbe che
 * la funzione sa leggere i nomi del test, non quelli del motore.
 */
const ADRENO: TalosLocalBackendDevice = {
    registry: 'OpenCL', name: 'GPUOpenCL', canOffload: true,
}
const HEXAGON: TalosLocalBackendDevice = {
    registry: 'HTP', name: 'HTP0', canOffload: true,
}
const CPU: TalosLocalBackendDevice = {
    registry: 'CPU', name: 'CPU', canOffload: false,
}

function profilo(overrides: Partial<TalosProfileForSelection>): TalosProfileForSelection {
    return {
        backendRegistry: 'CPU',
        backendDevice: null,
        outcome: 'CORRECT',
        ttftMs: 1000,
        decodeTokPerSec: 10,
        ...overrides,
    }
}

describe('le famiglie si riconoscono dal nome del registry, non dal tipo', () => {
    it('HTP è Hexagon, non una scheda grafica', () => {
        // ⛔ Il caso che il TIPO non saprebbe distinguere: nel sottomodulo
        // ggml-hexagon dichiara GGML_BACKEND_DEVICE_TYPE_GPU esattamente come
        // ggml-opencl. Se questa riga tornasse 'gpu', TALOS offrirebbe «GPU»
        // per un DSP.
        expect(talosBackendKindOfRegistry('HTP')).toBe('hexagon')
    })

    it('OpenCL e Vulkan sono entrambi «la scheda grafica»', () => {
        expect(talosBackendKindOfRegistry('OpenCL')).toBe('gpu')
        expect(talosBackendKindOfRegistry('Vulkan')).toBe('gpu')
    })

    it('CPU è CPU, e il confronto è sul nome intero', () => {
        expect(talosBackendKindOfRegistry('CPU')).toBe('cpu')
        expect(talosBackendKindOfRegistry('cpu')).toBe('cpu')
        // Un `includes('cpu')` prenderebbe anche questo, e sbaglierebbe.
        expect(talosBackendKindOfRegistry('CPU_REPACK')).toBe('gpu')
    })
})

describe('l elenco offre sempre tre voci', () => {
    it('anche quando due backend su tre non esistono in questa build', () => {
        const opzioni = talosLocalBackendOptions([CPU])
        expect(opzioni.map((o) => o.kind)).toEqual([...TALOS_LOCAL_BACKEND_KINDS])
        expect(opzioni.find((o) => o.kind === 'cpu')?.available).toBe(true)
        expect(opzioni.find((o) => o.kind === 'gpu')?.available).toBe(false)
        expect(opzioni.find((o) => o.kind === 'hexagon')?.available).toBe(false)
    })

    it('e nomina i registry che li realizzano quando ci sono', () => {
        const opzioni = talosLocalBackendOptions([CPU, ADRENO, HEXAGON])
        expect(opzioni.find((o) => o.kind === 'gpu')?.registries).toEqual(['OpenCL'])
        expect(opzioni.find((o) => o.kind === 'hexagon')?.registries).toEqual(['HTP'])
    })

    it('un dispositivo che non accetta offload non rende disponibile la sua famiglia', () => {
        const opzioni = talosLocalBackendOptions([{ ...ADRENO, canOffload: false }])
        expect(opzioni.find((o) => o.kind === 'gpu')?.available).toBe(false)
    })
})

describe('che cosa si chiede al motore', () => {
    it('la CPU si chiede per nome: zero strati e nessun bersaglio', () => {
        expect(talosLocalBackendRequest('cpu', ['CPU'])).toEqual({ gpuLayers: 0, backend: null })
    })

    it('un acceleratore si NOMINA, così il nativo può dire quale ha preso', () => {
        expect(talosLocalBackendRequest('gpu', ['OpenCL', 'HTP']))
            .toEqual({ gpuLayers: -1, backend: 'OpenCL' })
        expect(talosLocalBackendRequest('hexagon', ['OpenCL', 'HTP']))
            .toEqual({ gpuLayers: -1, backend: 'HTP' })
    })

    it('senza un registry che lo realizzi il bersaglio resta senza nome', () => {
        expect(talosLocalBackendRequest('hexagon', ['OpenCL']))
            .toEqual({ gpuLayers: -1, backend: null })
    })
})

describe('la preferenza salvata', () => {
    it('qualunque forma inattesa torna al predefinito', () => {
        for (const valore of [null, undefined, 42, 'gpu', [], { mode: 'boh' }]) {
            expect(parseTalosLocalBackendPreference(valore))
                .toEqual(TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE)
        }
    })

    it('«manual» senza una scelta dentro NON è manuale', () => {
        expect(parseTalosLocalBackendPreference({ mode: 'manual', manual: null }))
            .toEqual(TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE)
        expect(parseTalosLocalBackendPreference({ mode: 'manual', manual: 'vulkan' }))
            .toEqual(TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE)
    })

    it('la scelta esplicita sopravvive anche in modalità automatica', () => {
        expect(parseTalosLocalBackendPreference({ mode: 'auto', manual: 'hexagon' }))
            .toEqual({ mode: 'auto', manual: 'hexagon' })
    })
})

describe('la decisione: la persona vince sempre', () => {
    const opzioni = talosLocalBackendOptions([CPU, ADRENO])

    it('la scelta manuale batte una misura che direbbe il contrario', () => {
        // La misura griderebbe «GPU»: TTFT dieci volte più basso e decodifica
        // doppia. La persona ha detto CPU, e quella è la risposta.
        const decisione = talosDecideLocalBackend({
            preference: { mode: 'manual', manual: 'cpu' },
            options: opzioni,
            profiles: [
                profilo({ backendRegistry: 'CPU', ttftMs: 10_000, decodeTokPerSec: 10 }),
                profilo({ backendRegistry: 'OpenCL', ttftMs: 1_000, decodeTokPerSec: 20 }),
            ],
            activeRegistry: null,
            expectedOutputTokens: 256,
        })
        expect(decisione).toEqual({
            kind: 'cpu', requested: 'cpu', source: 'user', reason: 'user',
        })
    })

    it('una scelta manuale che qui non esiste NON viene sostituita in silenzio', () => {
        const decisione = talosDecideLocalBackend({
            preference: { mode: 'manual', manual: 'hexagon' },
            options: opzioni,
            profiles: [],
            activeRegistry: null,
            expectedOutputTokens: 256,
        })
        // Gira su CPU — ma `requested` conserva che cosa era stato chiesto, ed
        // è la sola cosa che permette di dirlo a chi ha scelto.
        expect(decisione).toEqual({
            kind: 'cpu', requested: 'hexagon', source: 'floor', reason: 'unavailable',
        })
    })
})

describe('la decisione automatica viene da una misura, mai da una costante', () => {
    const opzioni = talosLocalBackendOptions([CPU, ADRENO])

    it('senza nessuna misura resta il pavimento, e lo DICE', () => {
        const decisione = talosDecideLocalBackend({
            preference: TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE,
            options: opzioni,
            profiles: [],
            activeRegistry: null,
            expectedOutputTokens: 256,
        })
        expect(decisione).toEqual({
            kind: 'cpu', requested: null, source: 'floor', reason: 'unmeasured',
        })
    })

    it('con la misura vince il più veloce, e sul Pad è la GPU', () => {
        const decisione = talosDecideLocalBackend({
            preference: TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE,
            options: opzioni,
            profiles: [
                profilo({ backendRegistry: 'CPU', ttftMs: 43_200, decodeTokPerSec: 52 }),
                profilo({ backendRegistry: 'OpenCL', ttftMs: 11_000, decodeTokPerSec: 46.8 }),
            ],
            activeRegistry: null,
            expectedOutputTokens: 256,
        })
        expect(decisione.kind).toBe('gpu')
        expect(decisione.source).toBe('measured')
        expect(decisione.reason).toBe('fastest')
    })

    it('un profilo per un backend che questa build non ha viene ignorato', () => {
        // ⛔ Il verso contrario: un profilo Hexagon misurato altrove (o da una
        // build precedente) non deve poter scegliere un backend che qui non
        // esiste — sarebbe un'apertura che fallisce, non un'ottimizzazione.
        const decisione = talosDecideLocalBackend({
            preference: TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE,
            options: opzioni,
            profiles: [profilo({ backendRegistry: 'HTP', ttftMs: 1, decodeTokPerSec: 999 })],
            activeRegistry: null,
            expectedOutputTokens: 256,
        })
        expect(decisione.kind).toBe('cpu')
        expect(decisione.reason).toBe('unmeasured')
    })

    it('un profilo FALLITO non è un candidato per quanto veloce sia stato a sbagliare', () => {
        const decisione = talosDecideLocalBackend({
            preference: TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE,
            options: opzioni,
            profiles: [profilo({ backendRegistry: 'OpenCL', outcome: 'FAILED', ttftMs: 1 })],
            activeRegistry: null,
            expectedOutputTokens: 256,
        })
        expect(decisione.reason).toBe('unmeasured')
    })
})

describe('SCELTO non è IN USO', () => {
    it('un bersaglio nominato e risolto è una conferma', () => {
        expect(talosLocalBackendInUse('gpu', {
            backendDevice: 'GPUOpenCL', gpuLayersEffective: -1, offloadDevices: 1,
        })).toEqual({ requested: 'gpu', actual: 'gpu', fellBack: false, reason: 'match' })
    })

    it('chiedere la GPU dove non esiste NESSUN acceleratore è un ripiego, e si sa', () => {
        expect(talosLocalBackendInUse('gpu', {
            backendDevice: null, gpuLayersEffective: 0, offloadDevices: 0,
        })).toEqual({
            requested: 'gpu', actual: 'cpu', fellBack: true, reason: 'no-offload-device',
        })
    })

    it('⛔ acceleratore presente e bersaglio non nominato: «non lo so», MAI «CPU»', () => {
        // È il buco dichiarato: llama.cpp distribuisce gli strati da sé e
        // l'header pubblico non espone dove siano finiti. Rispondere 'cpu' qui
        // sarebbe inventare; rispondere 'gpu' pure.
        expect(talosLocalBackendInUse('gpu', {
            backendDevice: null, gpuLayersEffective: -1, offloadDevices: 1,
        })).toEqual({ requested: 'gpu', actual: null, fellBack: false, reason: 'unknown' })
    })

    it('un ponte più vecchio che non dichiara i dispositivi non produce un falso ripiego', () => {
        expect(talosLocalBackendInUse('gpu', {
            backendDevice: null, gpuLayersEffective: -1, offloadDevices: null,
        }).fellBack).toBe(false)
    })
})
