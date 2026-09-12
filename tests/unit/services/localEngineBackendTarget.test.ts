import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⭐⭐⭐ IL BERSAGLIO SI NOMINA — e queste prove seguono il nome fino al C++.
 *
 * ## Perché esistono
 *
 * Owner, 2026-09-10: «LA SCELTA RESTA ALL UTENTE, SCEGLIE SEMPRE LUI, CPU GPU
 * O HEXAGON, DI DEFAULT SCEGLIAMO QUELLO PIU VELOCE (DI SOLITO GPU)».
 *
 * Fino a oggi la produzione poteva dire QUANTI strati spostare (`gpuLayers`) e
 * non DOVE: `nativeOpen` passava due stringhe vuote e il bersaglio esplicito
 * viveva solo in `nativeOpenTargeted`, che la produzione non chiama. Con un
 * solo acceleratore nell'APK la differenza non si vedeva; con due — OpenCL e
 * HTP, la direzione decisa dall'owner — diventa una lotteria.
 *
 * ## ⛔ Perché metà di queste prove legge il SORGENTE
 *
 * Stessa forma e stesso motivo di `localEngineLoadMode.test.ts`: la catena
 * attraversa JNI, e vitest non esegue né il C++ né il Java. Una prova che si
 * fermasse alla funzione TypeScript dimostrerebbe che la funzione **accetta**
 * un parametro — che è esattamente il difetto «misurato-ma-non-usato» già
 * pagato una volta da questo file. Qui si vuole sapere se il nome **arriva**
 * fino a `llama_model_params.devices`.
 */

const cpp = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/cpp/talos_llama_jni.cpp',
), 'utf8')

const plugin = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/java/ai/talos/TalosLlamaPlugin.java',
), 'utf8')

const engine = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/java/ai/talos/TalosLlamaEngine.java',
), 'utf8')

const nativo = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/java/ai/talos/TalosLlamaNative.java',
), 'utf8')

const bridge = vi.hoisted(() => ({
    open: vi.fn(),
    chatPrompt: vi.fn(),
    templateCapabilities: vi.fn(),
    generate: vi.fn(),
    addListener: vi.fn(),
    qualifyBackend: vi.fn(),
    available: vi.fn(),
    performanceSignals: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    registerPlugin: () => bridge,
}))

const {
    talosLocalEngineBackendFacts,
    talosLocalEngineOpen,
} = await import('@/services/localEngine')

describe('il nome del motore arriva al ponte', () => {
    beforeEach(() => {
        bridge.open.mockReset()
        bridge.open.mockResolvedValue({ contextTokens: 4096 })
    })

    it('consegna esattamente il registry e il dispositivo richiesti', async () => {
        await talosLocalEngineOpen('/models/qwen.gguf', {
            gpuLayers: -1, backend: 'OpenCL', device: 'GPUOpenCL',
        })
        const [options] = bridge.open.mock.calls[0]
        expect(options.backend).toBe('OpenCL')
        expect(options.device).toBe('GPUOpenCL')
        expect(options.gpuLayers).toBe(-1)
    })

    /**
     * ⛔ IL VERSO CONTRARIO, ed è quello che morde: se il ponte ricevesse
     * comunque le due chiavi — anche a `undefined` — non si distinguerebbe più
     * «non ho chiesto niente» da «ho chiesto il predefinito», e il lato Java,
     * che legge `call.getString("backend", "")`, si troverebbe una richiesta
     * dove non ce n'era una.
     */
    it('non inventa nessuna delle due quando nessuno le ha chieste', async () => {
        await talosLocalEngineOpen('/models/qwen.gguf', { contextTokens: 4096 })
        const [options] = bridge.open.mock.calls[0]
        expect('backend' in options).toBe(false)
        expect('device' in options).toBe(false)
    })
})

describe('la catena nativa, letta nel sorgente', () => {
    it('il plugin LEGGE i due parametri dalla chiamata', () => {
        expect(plugin).toContain('call.getString("backend", "")')
        expect(plugin).toContain('call.getString("device", "")')
    })

    it('e li PASSA al motore, non li tiene per sé', () => {
        expect(plugin).toMatch(/tryOpen\([\s\S]{0,400}?backendName, deviceName\)/)
    })

    /**
     * ⛔⛔ LA GUARDIA CHE RENDE LA MANOPOLA EFFICACE.
     *
     * `reopenContext` riusa i pesi già in memoria — è tutto il suo valore, 111 s
     * contro 195 ms — ma il bersaglio di offload vive in
     * `llama_model_params.devices`, cioè in DOVE quei pesi sono stati allocati.
     * Senza questo confronto, passare da CPU a GPU tornerebbe `ok` e lascerebbe
     * tutto dov'era: «backend selezionabile ≠ backend realmente utilizzato»,
     * ereditato invece che tolto di mezzo.
     */
    it('un cambio di motore NON può passare dalla strada veloce', () => {
        expect(plugin).toContain('backendName.equals(openBackend.get())')
        expect(plugin).toContain('deviceName.equals(openDevice.get())')
    })

    it('e lo stato si azzera quando il modello si chiude', () => {
        expect(plugin).toMatch(/closeOpenModel\(\)[\s\S]{0,600}?openBackend\.set\(""\)/)
    })

    it('la firma nativa porta i due nomi fino al C++', () => {
        expect(nativo).toMatch(
            /nativeOpen\([\s\S]{0,400}?String backendName, String deviceName\)/,
        )
        expect(engine).toMatch(
            /nativeOpen\([\s\S]{0,600}?backendName == null \? "" : backendName/,
        )
    })

    /**
     * ⛔ Il punto d'arrivo: il C++ deve passare i due nomi a
     * `talos_apri_modello`, che è la sola funzione che li traduce in
     * `model_params.devices`. Prima di oggi al loro posto c'erano due
     * `std::string()` vuote, ed è quella riga che questa prova sorveglia.
     */
    it('il JNI di produzione converte i due nomi invece di passare stringhe vuote', () => {
        const nativeOpen = cpp.slice(
            cpp.indexOf('Java_ai_talos_TalosLlamaNative_nativeOpen(JNIEnv'),
        ).slice(0, 1600)
        expect(nativeOpen).toContain('jstring_to_utf8(env, backendName)')
        expect(nativeOpen).toContain('jstring_to_utf8(env, deviceName)')
    })
})

describe('SCELTO non è IN USO: i fatti che il nativo dichiara', () => {
    beforeEach(() => {
        bridge.available.mockReset()
    })

    it('legge i quattro campi quando il ponte li dichiara', async () => {
        bridge.available.mockResolvedValue({
            available: true, backends: '', loadedPath: '/models/qwen.gguf',
            backendDevice: 'GPUOpenCL', gpuLayersEffective: -1,
            offloadDevices: 1, threadPoolSplit: true,
        })
        expect(await talosLocalEngineBackendFacts()).toEqual({
            backendDevice: 'GPUOpenCL', gpuLayersEffective: -1,
            offloadDevices: 1, threadPoolSplit: true,
        })
    })

    /**
     * ⛔⛔ Il caso che non deve mai diventare una risposta: un ponte più vecchio
     * non dichiara `offloadDevices`, e ZERO sarebbe una conclusione («nessun
     * acceleratore esiste, quindi gira su CPU») presa da un campo che non c'è.
     * `null` è la sola cosa vera.
     */
    it('un ponte più vecchio dà «non lo so», mai zero', async () => {
        bridge.available.mockResolvedValue({
            available: true, backends: '', loadedPath: null,
        })
        const fatti = await talosLocalEngineBackendFacts()
        expect(fatti.offloadDevices).toBeNull()
        expect(fatti.threadPoolSplit).toBeNull()
        expect(fatti.backendDevice).toBeNull()
    })

    it('un ponte assente non solleva: risponde «non lo so»', async () => {
        bridge.available.mockRejectedValue(new Error('nessun ponte'))
        expect(await talosLocalEngineBackendFacts()).toEqual({
            backendDevice: null, gpuLayersEffective: 0,
            offloadDevices: null, threadPoolSplit: null,
        })
    })

    it('zero acceleratori è un FATTO e attraversa come zero, non come null', async () => {
        bridge.available.mockResolvedValue({
            available: true, backends: '', loadedPath: null,
            offloadDevices: 0, threadPoolSplit: false, gpuLayersEffective: 0,
        })
        const fatti = await talosLocalEngineBackendFacts()
        expect(fatti.offloadDevices).toBe(0)
        expect(fatti.threadPoolSplit).toBe(false)
    })
})

describe('la snapshot nativa dichiara i due fatti nuovi', () => {
    it('lo schema è salito, così un campo assente non si confonde con zero', () => {
        expect(cpp).toContain('out["schema"] = 3;')
        expect(cpp).toContain('out["offloadDevices"] = talos_conta_dispositivi_offload();')
        expect(cpp).toContain('out["threadPoolSplit"] = session->thread_pool_split;')
    })

    /**
     * ⛔ `threadPoolSplit` deve venire dal POOL creato, non dal confronto fra i
     * due numeri richiesti: llama.cpp crea UN pool solo quando coincidono, e
     * nessun pool esterno se la creazione fallisce. Una riga che confrontasse
     * `n_threads != n_threads_batch` direbbe «diviso» in casi in cui non lo è.
     */
    it('e lo split è letto dal pool creato, non dai numeri chiesti', () => {
        expect(cpp).toContain('session->thread_pool_split  = pool_batch != nullptr;')
    })

    it('il plugin li propaga solo quando ci sono davvero', () => {
        expect(plugin).toContain('if (snapshot.has("offloadDevices"))')
    })
})
