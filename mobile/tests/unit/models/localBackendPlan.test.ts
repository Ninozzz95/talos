import { describe, expect, it } from 'vitest'
import {
    TALOS_LOCAL_EXPECTED_OUTPUT_TOKENS,
    talosLocalBackendDevicesOf,
    talosLocalBackendPlan,
} from '@/lib/models/localBackendPlan'
import type { TalosProfileForSelection } from '@/lib/models/localProfileSelector'

/**
 * ⭐⭐⭐ Il ponte fra la decisione e l'apertura, provato dove è puro.
 *
 * ⛔ Queste prove NON dimostrano che il percorso di apertura lo chiami: quella
 * è la parte che conta e vive in `tests/unit/chat/localAdapter.test.ts` e in
 * `tests/unit/services/localEngine.test.ts`, perché un modulo con i suoi test
 * verdi e nessun chiamante è esattamente com'era `localBackendChoice.ts` fino a
 * oggi. Qui si prova la traduzione, riga per riga, senza telefono.
 */

const AUTO = { mode: 'auto' as const, manual: null }

function profilo(
    backendRegistry: string,
    ttftMs: number,
    decodeTokPerSec: number,
): TalosProfileForSelection {
    return { backendRegistry, backendDevice: null, outcome: 'CORRECT', ttftMs, decodeTokPerSec }
}

describe('talosLocalBackendDevicesOf — da ciò che il ponte dichiara a un inventario', () => {
    it('legge i registry dalla stringa, e la CPU non è mai un bersaglio di offload', () => {
        expect(talosLocalBackendDevicesOf('CPU,OpenCL', null)).toEqual([
            { registry: 'CPU', name: 'CPU', canOffload: false },
            { registry: 'OpenCL', name: 'OpenCL', canOffload: true },
        ])
    })

    it('tollera spazi e voci vuote, che è come arrivano da un elenco concatenato', () => {
        expect(talosLocalBackendDevicesOf(' CPU , OpenCL ,', null).map((d) => d.registry))
            .toEqual(['CPU', 'OpenCL'])
    })

    /**
     * ⛔ Zero bersagli è un FATTO: il registry si è caricato ma non espone
     * niente su cui fare offload. Nessuna famiglia diventa disponibile.
     */
    it('AL CONTRARIO — zero dispositivi di offload spegne ogni bersaglio', () => {
        expect(talosLocalBackendDevicesOf('CPU,OpenCL', 0).every((d) => !d.canOffload)).toBe(true)
    })

    /**
     * ⛔ E `null` NON è zero: il campo arriva solo con un modello già aperto,
     * quindi alla prima apertura manca sempre. Trattarlo come zero
     * cancellerebbe la GPU proprio nel momento in cui la si sta scegliendo.
     */
    it('AL CONTRARIO — «non lo dichiara» non è «non ce n è»', () => {
        expect(talosLocalBackendDevicesOf('CPU,OpenCL', null)[1]!.canOffload).toBe(true)
    })

    it('un motore senza nessun registry non inventa nemmeno la CPU', () => {
        expect(talosLocalBackendDevicesOf('', null)).toEqual([])
    })
})

describe('talosLocalBackendPlan — cosa si chiede al motore, e perché', () => {
    it('le voci offerte sono SEMPRE tre, anche quando due non ci sono', () => {
        const piano = talosLocalBackendPlan({
            preference: AUTO, backends: 'CPU', offloadDevices: null,
            profiles: [], activeRegistry: null,
        })
        expect(piano.choices.map((c) => c.kind)).toEqual(['cpu', 'gpu', 'hexagon'])
        expect(piano.choices.map((c) => c.available)).toEqual([true, false, false])
    })

    /**
     * ⛔ (b) IL BUCO SI DICHIARA, e dichiararlo qui vuol dire non passare
     * niente: `gpuLayers: 0` sarebbe un default silenzioso, e spegnerebbe
     * l'arbitro nativo che legge l'evidenza del sondaggio.
     */
    it('senza scelta e senza misura: `unmeasured`, e NESSUNA opzione', () => {
        const piano = talosLocalBackendPlan({
            preference: AUTO, backends: 'CPU,OpenCL', offloadDevices: null,
            profiles: [], activeRegistry: null,
        })
        expect(piano.decision.reason).toBe('unmeasured')
        expect(piano.decision.source).toBe('floor')
        expect(piano.options).toEqual({})
    })

    it('con la misura vince il più veloce, e il bersaglio viene NOMINATO', () => {
        const piano = talosLocalBackendPlan({
            preference: AUTO, backends: 'CPU,OpenCL', offloadDevices: null,
            profiles: [profilo('CPU', 3_000, 9), profilo('OpenCL', 1_200, 24)],
            activeRegistry: null,
        })
        expect(piano.decision).toMatchObject({ kind: 'gpu', reason: 'fastest', source: 'measured' })
        expect(piano.options).toEqual({ gpuLayers: -1, backend: 'OpenCL' })
    })

    /**
     * ⛔ (a) LA SCELTA MANUALE VINCE SEMPRE. Stessi profili della prova qui
     * sopra — dove l'euristica sceglieva la GPU — e la persona ottiene la CPU.
     */
    it('AL CONTRARIO — la scelta manuale non viene sovrascritta dall euristica', () => {
        const piano = talosLocalBackendPlan({
            preference: { mode: 'manual', manual: 'cpu' },
            backends: 'CPU,OpenCL', offloadDevices: null,
            profiles: [profilo('CPU', 3_000, 9), profilo('OpenCL', 1_200, 24)],
            activeRegistry: null,
        })
        expect(piano.decision).toMatchObject({ kind: 'cpu', reason: 'user', requested: 'cpu' })
        expect(piano.options).toEqual({ gpuLayers: 0 })
    })

    it('la persona chiede la GPU e la ottiene, anche senza nessuna misura', () => {
        const piano = talosLocalBackendPlan({
            preference: { mode: 'manual', manual: 'gpu' },
            backends: 'CPU,OpenCL', offloadDevices: null,
            profiles: [], activeRegistry: null,
        })
        expect(piano.options).toEqual({ gpuLayers: -1, backend: 'OpenCL' })
    })

    /**
     * ⛔ Chiedere Hexagon oggi (non compilato) NON diventa «GPU» né un silenzio:
     * si resta sul pavimento e si dichiara CHE COSA era stato chiesto.
     */
    it('AL CONTRARIO — un backend chiesto e assente si dichiara, non si sostituisce', () => {
        const piano = talosLocalBackendPlan({
            preference: { mode: 'manual', manual: 'hexagon' },
            backends: 'CPU,OpenCL', offloadDevices: null,
            profiles: [profilo('OpenCL', 1_200, 24)],
            activeRegistry: null,
        })
        expect(piano.decision).toMatchObject({
            kind: 'cpu', requested: 'hexagon', reason: 'unavailable', source: 'floor',
        })
        // Qui `gpuLayers: 0` SÌ: è la conseguenza di una richiesta della
        // persona, non l'assenza di una decisione.
        expect(piano.options).toEqual({ gpuLayers: 0 })
    })

    /**
     * ⛔ Una misura su un backend che questa build non ha non lo riporta in
     * vita: sulle build di DEBUG l'acceleratore non è a bordo (§9 del ledger
     * 2026-09-10) e il registro contiene il solo `CPU`.
     */
    it('AL CONTRARIO — una misura su un registry assente non viene nominata', () => {
        const piano = talosLocalBackendPlan({
            preference: AUTO, backends: 'CPU', offloadDevices: null,
            profiles: [profilo('OpenCL', 1_200, 24)],
            activeRegistry: null,
        })
        expect(piano.decision.reason).toBe('unmeasured')
        expect(piano.options).toEqual({})
    })

    /**
     * ⛔ Hexagon non è cancellato: il giorno in cui il registry `HTP` compare,
     * questa riga si accende senza che nessuno tocchi il codice. È la prova che
     * le famiglie sono tre per davvero e non due più un'etichetta.
     */
    it('il giorno in cui `HTP` si registra, la famiglia Hexagon è scegliibile', () => {
        const piano = talosLocalBackendPlan({
            preference: { mode: 'manual', manual: 'hexagon' },
            backends: 'CPU,OpenCL,HTP', offloadDevices: null,
            profiles: [], activeRegistry: null,
            // ⛔ Il formato entra nella prova dall'11/09: registrare `HTP` non
            // basta piu', perche' su un Q4_K_M l'NPU misura 55,7 t/s contro i
            // 206 della GPU. Qui il modello e' Q4_0, quindi l'NPU ha senso.
            quantisation: 'Q4_0',
        })
        expect(piano.decision).toMatchObject({ kind: 'hexagon', reason: 'user' })
        expect(piano.options).toEqual({ gpuLayers: -1, backend: 'HTP' })
    })

    /**
     * ⛔⛔ AL CONTRARIO — lo stesso telefono, lo stesso `HTP` registrato, e la
     * stessa scelta manuale della persona: ma il modello e' Q4_K_M, e allora
     * l'NPU NON si accende.
     *
     * Misurato l'11/09 sul Pad: `Qwen3-4B` in Q4_0 legge a 1.126 t/s sull'NPU,
     * lo stesso modello in Q4_K_M a **55,7**, contro i 206 della GPU. Onorare
     * la scelta qui vorrebbe dire rendere l'app quattro volte piu' lenta di
     * quanto sarebbe senza NPU — e il catalogo e' 14 Q4_K_M contro 7 Q4_0.
     *
     * ⛔ E non diventa un ALTRO backend in silenzio: resta `requested:
     * 'hexagon'` con `reason: 'unavailable'`, che e' la regola gia' scritta
     * per «ho scelto una cosa e ne gira un'altra».
     */
    it('AL CONTRARIO — su Q4_K_M la stessa scelta NON accende l’NPU', () => {
        const piano = talosLocalBackendPlan({
            preference: { mode: 'manual', manual: 'hexagon' },
            backends: 'CPU,OpenCL,HTP', offloadDevices: null,
            profiles: [], activeRegistry: null,
            quantisation: 'Q4_K_M',
        })
        expect(piano.decision.kind).not.toBe('hexagon')
        expect(piano.decision).toMatchObject({ requested: 'hexagon', reason: 'unavailable' })
    })

    /**
     * ⛔ E senza il formato — un ponte piu' vecchio, un file illeggibile —
     * l'NPU resta fuori: «non lo so» non e' un permesso.
     */
    it('AL CONTRARIO — senza formato dichiarato l’NPU resta fuori', () => {
        const piano = talosLocalBackendPlan({
            preference: { mode: 'manual', manual: 'hexagon' },
            backends: 'CPU,OpenCL,HTP', offloadDevices: null,
            profiles: [], activeRegistry: null,
        })
        expect(piano.decision.kind).not.toBe('hexagon')
    })

    /**
     * ⛔ Un profilo FAILED non è un candidato per quanto sia stato veloce a
     * sbagliare: senza altri profili validi si torna al buco dichiarato.
     */
    it('AL CONTRARIO — un profilo FAILED non vince niente', () => {
        const piano = talosLocalBackendPlan({
            preference: AUTO, backends: 'CPU,OpenCL', offloadDevices: null,
            profiles: [{
                backendRegistry: 'OpenCL', backendDevice: null,
                outcome: 'FAILED', ttftMs: 100, decodeTokPerSec: 99,
            }],
            activeRegistry: null,
        })
        expect(piano.decision.reason).toBe('unmeasured')
        expect(piano.options).toEqual({})
    })

    /** Il tetto atteso di generazione è quello della chat, non un numero a caso. */
    it('il predefinito dei token attesi è il tetto della chat', () => {
        expect(TALOS_LOCAL_EXPECTED_OUTPUT_TOKENS).toBe(1024)
    })
})
