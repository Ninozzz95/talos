import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ⭐⭐⭐ D-45 — IL RIUSO CHE DAVA RISPOSTE SBAGLIATE, e i tre cancelli che lo fermano.
 *
 * ## Il fatto, misurato sul Pad il 2026-09-10
 *
 * `gemma-4-E2B-it-Q4_0` sulla GPU (`GPUOpenCL Adreno 830`) con la KV riusata ha
 * risposto **vuoto quattro volte**, e la quinta ha scritto
 * `model 원: ? 어 (Translation **Model 어 (Translation ) ) )`. Lo stesso
 * modello, lo stesso file, lo stesso codice, **sulla CPU** rispondeva
 * «Sto bene, grazie. Come posso assisterti oggi?» in 288 ms con 2.802 token
 * riusati su 2.810.
 *
 * ⛔ La forma del difetto e' la peggiore che esista: **i numeri erano
 * splendidi**. 490 ms al primo token, 2.802 token riusati — e a schermo niente.
 * Nessun test poteva accorgersene guardando le misure, perche' le misure erano
 * giuste.
 *
 * ## ⛔ Perche' questa prova legge il C++ invece di eseguirlo
 *
 * Il divieto vive nel JNI, dove Vitest non arriva. Ma la regola di questo
 * progetto e' che il nativo si prova lo stesso — e cio' che qui va difeso non e'
 * un calcolo, e' una **posizione**: il divieto deve stare nell'unico punto in
 * cui il riuso NASCE, e nei due versi del prefisso congelato. Se domani qualcuno
 * lo spostasse nei chiamanti, la cura sopravviverebbe solo finche' ognuno se ne
 * ricorda, e questa prova cade.
 *
 * ⛔ E le prove che mordono sono le ultime due: **il divieto non deve valere
 * quando una sola delle due condizioni e' vera.** Vietare su ogni GPU, o su ogni
 * finestra scorrevole, farebbe ripagare il prefill dove non serve — sarebbe una
 * cura che costa piu' del male, e nessun altro test se ne accorgerebbe.
 */
const jni = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/cpp/talos_llama_jni.cpp',
), 'utf8')

/** Il corpo di una funzione JNI, dal suo nome alla chiusura in colonna zero. */
function corpoDi(nome: string): string {
    const inizio = jni.indexOf(`Java_ai_talos_TalosLlamaNative_${nome}(`)
    expect(inizio).toBeGreaterThanOrEqual(0)
    const fine = jni.indexOf('\n}\n', inizio)
    expect(fine).toBeGreaterThan(inizio)
    return jni.slice(inizio, fine)
}

describe('D-45 — il riuso della KV vietato dove dava risposte sbagliate', () => {
    it('RKV-01 la sessione porta il divieto come CAMPO, non come parametro di passaggio', () => {
        expect(jni).toContain('bool riuso_kv_vietato = false;')
    })

    /**
     * ⛔ La congiunzione, letta come tale: `&&` e non `||`. Un `||` scritto per
     * distrazione trasformerebbe una cura mirata in un divieto generale, e
     * tutto continuerebbe a funzionare — solo molto piu' lento, senza che
     * nessuno sappia perche'.
     */
    it('RKV-02 il divieto e\' la CONGIUNZIONE misurata: fuori dalla CPU E finestra scorrevole', () => {
        // D-45 (11/09): il terzo termine e' la manopola dell'ESPERIMENTO
        // (`setprop talos.esperimento.swa_full 1`): con la cache SWA a
        // dimensione piena il riuso si riapre apposta, per misurare la cura.
        // Di serie `swa_piena` e' falso e la congiunzione resta quella misurata.
        expect(jni).toContain('session->riuso_kv_vietato = gpuLayers != 0 && finestra > 0 && !swa_piena;')
        expect(jni).toContain('llama_model_n_swa(model)')
    })

    /**
     * ⛔ IL CANCELLO PRINCIPALE. `talos_prefisso_comune` e' la sola funzione che
     * fa nascere un riuso: se il divieto non e' qui, non e' da nessuna parte.
     */
    it('RKV-03 il divieto sta dove il riuso NASCE, non nei chiamanti', () => {
        const chiamate = jni.split('talos_prefisso_comune(session->cached, tokens)')
        expect(chiamate.length).toBe(2)
        const prima = chiamate[0].slice(-200)
        expect(prima).toContain('!session->riuso_kv_vietato')
    })

    it('RKV-04 il prefisso congelato NON si ripristina sotto divieto', () => {
        const corpo = corpoDi('nativeLoadState')
        expect(corpo).toContain('session->riuso_kv_vietato')
        expect(corpo.indexOf('session->riuso_kv_vietato'))
            .toBeLessThan(corpo.indexOf('llama_state_seq_load_file'))
    })

    /**
     * ⛔ L'altro verso, e non e' simmetria per bellezza: un file scritto da una
     * KV nata sotto divieto **sopravviverebbe al divieto stesso** e verrebbe
     * riletto piu' avanti su un contesto sano — cioe' la risposta sbagliata
     * tornerebbe dove la cura non guarda.
     */
    it('RKV-05 e NON si scrive: un file avvelenato sopravviverebbe al divieto', () => {
        const corpo = corpoDi('nativeTrimAndSaveState')
        expect(corpo).toContain('session->riuso_kv_vietato')
        expect(corpo.indexOf('session->riuso_kv_vietato'))
            .toBeLessThan(corpo.indexOf('llama_state_seq_save_file'))
    })

    /**
     * ⛔⛔ AL CONTRARIO — la prova che il divieto non e' un interruttore
     * generale. Il commento accanto alla condizione deve dire che **nessuna
     * delle due da sola** ha mai sbagliato: e' la sola cosa che impedisce a chi
     * legge di "semplificare" la congiunzione in una condizione sola.
     */
    it('RKV-06 il perche\' della congiunzione e\' scritto accanto, non altrove', () => {
        const punto = jni.indexOf('session->riuso_kv_vietato = gpuLayers')
        const intorno = jni.slice(punto - 500, punto)
        expect(intorno).toContain('Nessuna delle due da sola')
    })

    it('RKV-07 il costo del divieto e\' dichiarato, non nascosto', () => {
        expect(jni).toContain('si ripaga il prefill')
    })
})

/**
 * ⛔⛔ «ANNULLA» DEVE ANNULLARE — e fermare il caricamento non bastava.
 *
 * Provato premendolo sul Pad: il motore interrompeva davvero
 * (`modello non caricato (annullato da chi usa l'app)`) e **trentacinque
 * secondi dopo il modello si riapriva da solo**, col turno che proseguiva. Alla
 * persona restava lo stesso cerchio di prima, solo piu' a lungo.
 */
const riga = readFileSync(resolve(
    process.cwd(),
    'src/components/chat/TalosMobileStreamingReply.vue',
), 'utf8')

describe('ANNULLA — le due cose si fermano insieme', () => {
    it('ANN-01 ferma il turno, non solo il caricamento', () => {
        const corpo = riga.slice(
            riga.indexOf('async function annullaIlCarico'),
            riga.indexOf('async function annullaIlCarico') + 400,
        )
        expect(corpo).toContain('controller.chat.stopStreaming()')
        expect(corpo).toContain('talosCancelLocalModelLoad')
    })

    /**
     * ⛔ L'ordine e' la prova. Al contrario ci sarebbe una finestra in cui il
     * caricamento e' morto e il turno e' ancora vivo, e la chat riaprirebbe il
     * modello proprio in quell'istante — cioe' il difetto di partenza, tornato.
     */
    it('ANN-02 PRIMA il turno, POI il caricamento', () => {
        const corpo = riga.slice(riga.indexOf('async function annullaIlCarico'))
        expect(corpo.indexOf('stopStreaming'))
            .toBeLessThan(corpo.indexOf('talosCancelLocalModelLoad'))
    })

    /**
     * ⛔ Zero non e' «niente da mostrare»: con i pesi mappati la percentuale
     * resta a 0 per dodici secondi, e uno «0%» fermo si legge come bloccato.
     */
    it('ANN-03 lo zero NON si scrive come percentuale', () => {
        expect(riga).toContain('localLoadingModelStarting')
        expect(riga).toContain('caricoPercento === 0')
    })
})
