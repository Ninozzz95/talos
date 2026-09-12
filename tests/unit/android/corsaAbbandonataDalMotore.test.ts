import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ⭐⭐⭐ UNA CORSA CHE IL MOTORE HA MOLLATO VENIVA REGISTRATA COME PROVA.
 *
 * ## Il fatto, letto dal log del Pad l'11/09/2026
 *
 * Sondaggio dell'NPU su `LFM2.5-2.6B-Q4_0`, prompt di 2.637 token:
 *
 * ```
 *   graph_compute: ggml_backend_sched_graph_compute_async failed with error 1
 *   process_ubatch: failed to compute graph, compute status: 1
 *   llama_decode: failed to decode, ret = 2
 *   ...
 *   TalosQualify: hexagon: verdetto=VALID tps=19.98 ttft=2000 registrato=true
 * ```
 *
 * Ne avevo concluso che il backend avesse abbandonato il grafo a meta'
 * risposta, e che la corsa fosse stata registrata **VALID** proprio per questo.
 *
 * ## ⛔⛔ LA CONCLUSIONE ERA SBAGLIATA, E L'HA DETTO LO STRUMENTO
 *
 * Armato il flag e rimisurato lo stesso giorno: **non si alza mai**, e lo
 * stesso `ret = 2` compare **anche sulla CPU**, 40 ms prima del suo verdetto.
 * E' lo stop del banco alla fine di una corsa a budget, su tutti e tre i
 * motori. L'NPU sembrava colpevole solo perche' avevo guardato un log dove
 * c'era lei.
 *
 * ⇒ Il cancello resta, e queste prove con lui — non per incolpare qualcuno,
 * ma perche' finche' le due interruzioni si somigliano, una corsa che il
 * motore abbandona si registra **da sola** come prova che quel motore
 * funziona. E la differenza fra le due il motore la sapeva gia'.
 *
 * ## ⛔ Perche' nessuno se n'era accorto
 *
 * Il contratto di `llama_decode` (`include/llama.h:987` del sottomodulo
 * pinnato) dice: `2 - aborted`. **Lo Stop della persona passa esattamente di
 * li'**, ed e' per questo che il `2` era trattato come una fine pulita — una
 * lettura giusta, per meta' dei casi.
 *
 * ⇒ Le due interruzioni si somigliano solo nel numero. Quello che le separa e'
 * **chi l'ha chiesta**, e il motore lo sa gia': `session->cancelled`.
 *
 * ## ⛔ Perche' queste prove leggono il sorgente
 *
 * Vive fra JNI e plugin, dove Vitest non esegue. Ma cio' che va difeso non e'
 * un calcolo: e' che la distinzione **continui a esistere**. Se domani
 * qualcuno rimettesse `if (esito == 2) break;` nudo, i backend guasti
 * tornerebbero a qualificarsi da soli senza che un test diventi rosso — ed e'
 * esattamente com'e' andata finora.
 */
const jni = readFileSync(resolve(
    process.cwd(), 'android/app/src/main/cpp/talos_llama_jni.cpp',
), 'utf8')
const plugin = readFileSync(resolve(
    process.cwd(), 'android/app/src/main/java/ai/talos/TalosLlamaPlugin.java',
), 'utf8')

describe('MOTORE CHE MOLLA — non e una prova, e un guasto', () => {
    it('ABB-01 il flag esiste, e sta FUORI dalla struttura che si assegna per aggregato', () => {
        expect(jni).toContain('std::atomic<bool> abortita_dal_motore{false}')
        // ⛔ `tempi` ha gia' perso un membro in silenzio una volta
        // (`una-costante-travestita-da-misura`): un atomico a se' non si puo'
        // dimenticare in un inizializzatore.
        expect(jni).not.toContain('tempi.abortita_dal_motore')
    })

    /**
     * ⛔⛔ IL TEST CHE MORDE: il `2` da solo non basta piu'. Deve essere
     * accompagnato dalla domanda «l'avevamo chiesto noi?».
     */
    it('ABB-02 il flag si alza SOLO se nessuno aveva chiesto lo stop', () => {
        expect(jni).toContain(
            '!session->cancelled.load(std::memory_order_relaxed)')
        const generazione = jni.slice(jni.indexOf('decode fallito dopo %d token') - 900)
        expect(generazione).toContain('abortita_dal_motore.store(true')
    })

    /**
     * ⛔ AL CONTRARIO — lo Stop della persona NON deve marcare niente. Se lo
     * facesse, ogni volta che qualcuno interrompe una risposta il backend
     * verrebbe squalificato.
     */
    it('ABB-03 una corsa nuova azzera il flag, cosi non eredita il guasto di prima', () => {
        expect(jni).toContain(
            'session->abortita_dal_motore.store(false, std::memory_order_relaxed)')
    })

    it('ABB-04 il fatto attraversa il ponte invece di restare nel log', () => {
        expect(jni).toContain('Java_ai_talos_TalosLlamaNative_nativeEngineAborted')
        expect(plugin).toContain('engine.engineAborted()')
        expect(plugin).toContain('final boolean abortitaDalMotore')
    })

    /**
     * ⛔⛔ E NON SI REGISTRA COME FALLITO. `shouldProbe` non riprova
     * un'evidenza gia' scritta: un guasto occasionale scritto come FAILED
     * diventerebbe permanente, e quel motore non verrebbe piu' provato su
     * questo telefono. Non conclusiva = si ritenta, che e' cio' che e'.
     */
    it('ABB-05 una corsa abbandonata non e conclusiva — non e una sconfitta', () => {
        expect(plugin).toContain('if (run.abortitaDalMotore) conclusive = false')
        expect(plugin).not.toContain('if (run.abortitaDalMotore) answerCorrect = false')
    })

    it('ABB-06 e il log lo DICE, invece di lasciare un VALID inspiegabile', () => {
        expect(plugin).toContain('ABORTITA-DAL-MOTORE')
    })

    /**
     * ⛔ La fonte del contratto va citata: senza, «2 vuol dire aborted» e'
     * un'opinione. E' scritta nel sottomodulo pinnato, non in un blog.
     */
    it('ABB-07 il contratto di llama_decode e citato alla fonte', () => {
        const riga = readFileSync(resolve(
            process.cwd(), 'third_party/llama.cpp/include/llama.h',
        ), 'utf8')
        expect(riga).toContain('2 - aborted')
    })
})
