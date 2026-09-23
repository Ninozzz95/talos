import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * FASE 1 — le manopole di CARICAMENTO dei pesi: mmap, mlock, ripacchettamento.
 *
 * ## Perché queste prove esistono
 *
 * PocketPal risponde quasi subito con un 2B, TALOS no, e PocketPal espone tre
 * interruttori che noi non avevamo affatto: *Use Memory Lock*, *Memory
 * Mapping*, *Enable Weight Repacking*. Non avevamo un valore sbagliato — non
 * avevamo **la manopola**: `llama_model_params.load_mode` restava al
 * predefinito di upstream perché nessuno lo toccava.
 *
 * ## ⛔ Perché metà di queste prove legge il SORGENTE
 *
 * Perché la catena attraversa JNI e vitest non esegue né il C++ né il Java.
 * È la stessa forma — e lo stesso motivo — di `tests/unit/android/`. Una prova
 * che si limitasse a chiamare la funzione TypeScript dimostrerebbe soltanto che
 * la funzione **accetta** un parametro: esattamente il difetto
 * «misurato-ma-non-usato» che questo progetto ha già pagato. Qui si vuole
 * sapere se il valore **arriva** fino a `llama_model_params`.
 *
 * ## Il verso contrario
 *
 * Diverse prove qui sotto non controllano che una cosa ci sia: controllano che
 * una cosa NON ci sia. Che il predefinito non sia già stato cambiato di
 * nascosto; che la modalità sia letta da una variabile e non da una costante
 * scolpita; che una manopola sconosciuta faccia FALLIRE invece di caricare come
 * sempre. Un cancello mai provato nel verso in cui doveva fallire non è un
 * cancello.
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
    TalosLocalEngineOpenError,
    talosLocalEngineOpen,
    talosLocalEngineOpenWithFallback,
} = await import('@/services/localEngine')

function nativeFailure(stage: string): Error {
    return Object.assign(new Error('TALOS_LLAMA_OPEN_FAILED'), {
        code: 'TALOS_LLAMA_OPEN_FAILED',
        data: { stage },
    })
}

describe('la manopola di caricamento arriva fino al ponte nativo', () => {
    beforeEach(() => {
        bridge.open.mockReset()
        bridge.open.mockResolvedValue({ contextTokens: 4096 })
    })

    it('consegna al ponte esattamente la modalità e il repack richiesti', async () => {
        await talosLocalEngineOpen('/models/qwen.gguf', {
            loadMode: 'mmap+mlock',
            weightRepack: false,
        })

        const [options] = bridge.open.mock.calls[0]
        expect(options.loadMode).toBe('mmap+mlock')
        expect(options.weightRepack).toBe(false)
    })

    /**
     * ⛔ IL VERSO CONTRARIO della prova qui sopra, ed è quella che morde
     * davvero: se il ponte ricevesse comunque una chiave — anche a `undefined`
     * — non si distinguerebbe più «non ho chiesto niente» da «ho chiesto il
     * predefinito», e il tri-stato del repack (assente ≠ acceso) sarebbe già
     * perso qui, prima ancora di JNI.
     */
    it('non inventa nessuna delle due quando nessuno le ha chieste', async () => {
        await talosLocalEngineOpen('/models/qwen.gguf', { contextTokens: 4096 })

        const [options] = bridge.open.mock.calls[0]
        expect('loadMode' in options).toBe(false)
        expect('weightRepack' in options).toBe(false)
    })

    it('le porta anche nel secondo tentativo, quando il contesto ripiega', async () => {
        bridge.open.mockReset()
        bridge.open
            .mockRejectedValueOnce(nativeFailure('context'))
            .mockResolvedValueOnce({ contextTokens: 2048 })

        await talosLocalEngineOpenWithFallback('/models/qwen.gguf', {
            contextTokens: 4096,
            loadMode: 'none',
            weightRepack: true,
        })

        expect(bridge.open.mock.calls.map(([o]) => [o.contextTokens, o.loadMode, o.weightRepack]))
            .toEqual([[4096, 'none', true], [2048, 'none', true]])
    })

    /**
     * Una modalità sconosciuta è un errore di chi chiama, non del dispositivo:
     * riaprire con meno contesto non la farebbe diventare comprensibile.
     */
    it('non riprova una modalità di caricamento che il motore non conosce', async () => {
        bridge.open.mockReset()
        bridge.open.mockRejectedValue(nativeFailure('load-mode'))

        await expect(talosLocalEngineOpenWithFallback('/models/qwen.gguf', {
            contextTokens: 4096,
            loadMode: 'mmap',
        })).rejects.toBeInstanceOf(TalosLocalEngineOpenError)

        expect(bridge.open).toHaveBeenCalledTimes(1)
    })
})

describe('il valore arriva davvero a llama_model_params, non solo alla firma', () => {
    it('la funzione che apre il modello riceve entrambe le manopole', () => {
        expect(cpp).toContain('const std::string & caricamentoRichiesto')
        expect(cpp).toContain('jint ripacchettamento')
    })

    /**
     * ⛔ La prova che conta. `model_params.load_mode` deve essere scritto da
     * una VARIABILE che viene dal chiamante — se fosse assegnato a una costante
     * `LLAMA_LOAD_MODE_*` il parametro sarebbe accettato e buttato via, e ogni
     * misura sarebbe una misura di `auto` con un'etichetta sbagliata.
     */
    it('scrive load_mode leggendo la richiesta, non una costante scolpita', () => {
        expect(cpp).toContain('model_params.load_mode = modalitaCarico;')
        expect(cpp).not.toMatch(/model_params\.load_mode\s*=\s*LLAMA_LOAD_MODE_/)
    })

    it('scrive il repack sul campo di upstream, tri-stato', () => {
        expect(cpp).toContain('model_params.use_extra_bufts = ripacchettamento != 0;')
        expect(cpp).toContain('if (ripacchettamento >= 0) {')
    })

    /**
     * L'apertura di produzione deve inoltrare i due valori. ⛔ Passava tre
     * stringhe vuote alle manopole di ricerca ed era giusto così; se le nuove
     * finissero nella stessa lista di vuoti, la catena sarebbe completa e
     * inerte.
     */
    it('l apertura di produzione inoltra i due valori invece di azzerarli', () => {
        expect(cpp).toContain('jstring loadMode, jint weightRepack')
        expect(cpp).toContain('jstring_to_utf8(env, loadMode), weightRepack);')
    })

    /**
     * ⛔ Il verso contrario di tutti: un nome sconosciuto deve FERMARE
     * l'apertura. Ignorarlo e caricare come sempre farebbe credere a chi misura
     * di aver misurato `mmap` mentre misurava `auto` — e nessun test se ne
     * accorgerebbe, perché una riga plausibile uscirebbe lo stesso.
     */
    it('una modalità sconosciuta fa fallire l apertura invece di caricare come sempre', () => {
        expect(cpp).toContain('talos_last_open_error = "load-mode";')
        expect(engine).toContain('LOAD_MODE("load-mode")')
    })

    it('la modalità applicata torna indietro nella snapshot, con lo schema alzato', () => {
        /*
         * ⛔ 2026-09-10 — era `toContain('out["schema"] = 2;')`, cioè
         * ancorata al NUMERO esatto. Ma lo schema esiste apposta per salire:
         * il 3 è arrivato lo stesso giorno con `offloadDevices` e
         * `threadPoolSplit`, e la prova è diventata rossa proprio perché il
         * meccanismo che sorveglia aveva funzionato.
         *
         * ⇒ Ciò che questa prova vuole dire è «lo schema NON è più 1», cioè
         * «chi legge una snapshot vecchia non può confondere un campo assente
         * con `false`». Quello si sorveglia con una disuguaglianza, non con
         * un numero fisso che va aggiornato a mano a ogni campo nuovo.
         */
        const schema = Number(cpp.match(/out\["schema"\] = (\d+);/)?.[1])
        expect(schema).toBeGreaterThanOrEqual(2)
        expect(cpp).toContain('out["loadMode"] = session->load_mode_effective;')
        expect(cpp).toContain('out["weightRepack"] = session->weight_repack_effective;')
    })

    /**
     * `mmapSupported`/`mlockSupported` sono risposte della libreria, non nostre
     * deduzioni sul sistema operativo: servono a leggere un `auto`, che da solo
     * non dice quale delle due strade abbia poi preso.
     */
    it('dichiara che cosa la build supporta chiedendolo alla libreria', () => {
        expect(cpp).toContain('llama_supports_mmap()')
        expect(cpp).toContain('llama_supports_mlock()')
    })

    /**
     * ⛔ I nomi accettati non sono ricopiati a mano: li riconosce upstream. Se
     * qualcuno un giorno li scrivesse qui con una catena di confronti, la lista
     * comincerebbe a invecchiare dal giorno dopo.
     */
    it('non ricopia a mano i nomi delle modalità', () => {
        expect(cpp).toContain('llama_load_mode_from_str(richiesta.c_str())')
        expect(cpp).not.toMatch(/richiesta == "mmap\+mlock"/)
    })
})

describe('il ponte Java non lascia che la manopola sia inefficace in silenzio', () => {
    /**
     * ⛔⛔ Il difetto peggiore possibile, e per questo ha una prova sua: la
     * strada veloce riusa i pesi già in memoria (111 s contro 195 ms, misurato)
     * ma `load_mode` descrive **come quei pesi sono stati letti dal disco**.
     * Senza il confronto, chiedere `mmap+mlock` su un modello già aperto
     * risponderebbe `ok` lasciando in memoria i pesi caricati in `auto`.
     */
    it('non riusa i pesi quando le manopole di caricamento sono cambiate', () => {
        expect(plugin).toContain('final boolean stesseManopoleDiCarico =')
        expect(plugin).toContain('loadMode.equals(openLoadMode.get()) && weightRepack == openWeightRepack')
        expect(plugin).toMatch(/path\.equals\(openPath\.get\(\)\)\s*&&\s*stesseManopoleDiCarico/)
    })

    /**
     * ⛔ 2026-09-10 — le tre righe qui sotto erano ancorate alla PARENTESI
     * CHIUSA (`weightRepack);`), cioè al fatto che quelle due manopole
     * fossero le ULTIME della firma. Non lo sono più: la stessa catena porta
     * ora anche il nome del motore su cui aprire (`backendName`,
     * `deviceName` — la scelta CPU/GPU/Hexagon dell'utente), e le prove sono
     * diventate rosse pur essendo il comportamento intatto.
     *
     * ⇒ L'ancora si sposta su ciò che la prova vuole davvero dire — «le due
     * manopole ARRIVANO alla chiamata» — invece che su dove finisce la riga.
     * Una prova che si rompe quando si aggiunge un parametro accanto stava
     * sorvegliando la punteggiatura, non l'intenzione.
     */
    it('passa entrambe al motore invece di fermarsi al ponte', () => {
        expect(plugin).toMatch(/threadsBatch, microBatch, kvType, loadMode, weightRepack[,)]/)
        expect(engine).toContain('String kvType, String loadMode, int weightRepack) {')
        expect(engine).toMatch(/loadMode, weightRepack[,)]/)
    })

    /** Assente non è «acceso»: il predefinito deve restare quello di upstream. */
    it('tiene il repack a tri-stato fino a JNI', () => {
        expect(plugin).toContain('call.getBoolean("weightRepack", null)')
        expect(plugin).toContain('repackChiesto == null ? -1 : (repackChiesto ? 1 : 0)')
    })
})

describe('il predefinito è in attesa della misura, e lo dice', () => {
    /**
     * ⛔⛔ LA PROVA CHE VALE PIÙ DI TUTTE, finché il numero non c'è. Il compito
     * era esporre la manopola, NON scegliere il valore: la matrice
     * `auto/none/mmap/mmap+mlock` × CPU/GPU × Q4_0/Q4_K_M si sta misurando sul
     * Pad vero mentre questo codice viene scritto. Un predefinito cambiato ora
     * sarebbe una previsione su dispositivi mai visti — la stessa classe di
     * errore che ha già ucciso `TALOS_LOCAL_MAX_CONTEXT_TOKENS`.
     *
     * Questa prova fallisce il giorno in cui qualcuno cambia il predefinito, ed
     * è voluto: a quel punto si cambia anche questa riga, e la si cambia avendo
     * il numero in mano.
     */
    it('il predefinito resta il comportamento di oggi', () => {
        expect(plugin).toContain('call.getString("loadMode", "default")')
        expect(plugin).toContain('final int weightRepack = repackChiesto == null ? -1')
        expect(cpp).toContain('if (richiesta.empty() || richiesta == "default") return true;')
    })

    /** Dove finirà la misura sta scritto nel codice, non solo in una chat. */
    it('dichiara dove va a finire la misura che deciderà il predefinito', () => {
        expect(plugin).toContain('.claude/TACCUINO-VELOCITA-LOCALE-2026-09-10.md')
        expect(cpp).toContain('.claude/TACCUINO-VELOCITA-LOCALE-2026-09-10.md')
    })
})
