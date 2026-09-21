import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/cpp/talos_llama_jni.cpp',
), 'utf8')

/**
 * Il contesto che ricorda, e le tre cose che lo renderebbero silenziosamente
 * sbagliato.
 *
 * ## Perché queste prove guardano il sorgente
 *
 * Perché il codice sta dall'altra parte di JNI e vitest non lo esegue. È lo
 * stesso motivo — e la stessa forma — di `llamaGrammarFailureBoundary`. La
 * prova vera è sul dispositivo, dove si misurano i token riusati; queste
 * sorvegliano le decisioni che, se cambiate per distrazione, non farebbero
 * fallire nessun test e produrrebbero risposte sbagliate.
 *
 * ## Cosa è cambiato, e perché era grave
 *
 * Fino al 2026-08-06 ogni generazione cominciava con `llama_memory_clear`, e il
 * commento diceva il perché: «ogni PROVA parte da zero». Corretto per un banco
 * di prova — due giri con stati diversi non sono confrontabili — ma quella
 * funzione è anche la strada della chat, e lì significava ripagare il prefill
 * dell'intera conversazione a ogni messaggio.
 */
describe('il contesto locale ricorda quello che ha già letto', () => {
    it('azzera SOLO quando gli si dice di misurare', () => {
        // Non «esiste un clear», ma «il clear di apertura vive sotto la
        // modalità». Un azzeramento incondizionato è il difetto che questa
        // prova esiste per impedire.
        expect(source).toMatch(/if \(!reusePrefix\) \{\s*\n\s*llama_memory_clear\(llama_get_memory\(session->ctx\), true\);\s*\n\s*session->cached\.clear\(\);/)
    })

    /**
     * ⛔ Se il prefisso comune coprisse tutto il prompt non resterebbe niente
     * da decodificare, e il campionatore lavorerebbe sui logit del turno
     * precedente: risponderebbe alla domanda di prima, con l'aria di funzionare.
     */
    it('il prefisso comune lascia sempre almeno un token da rielaborare', () => {
        expect(source).toContain('if (comune >= nuovi.size() && comune > 0) comune = nuovi.size() - 1;')
    })

    /**
     * ⛔ I token GENERATI stanno nella KV quanto quelli del prompt. Non
     * registrarli farebbe calcolare al turno dopo il prefisso comune su una
     * fotografia più corta della realtà, e il taglio cadrebbe nel posto
     * sbagliato — cioè in mezzo alla risposta precedente.
     */
    it('registra anche i token generati, non solo quelli del prompt', () => {
        expect(source).toContain('session->cached.push_back(sampled);')
        expect(source).toMatch(/session->cached\.insert\(session->cached\.end\(\),/)
    })

    /**
     * Un taglio parziale può essere rifiutato dall'API per certi tipi di
     * memoria. Il ripiego deve essere «butta tutto», mai «tieni e spera»:
     * perdere il prefisso costa secondi, tenerne uno falso costa la risposta.
     */
    it('se il taglio parziale viene rifiutato, si riparte da zero', () => {
        const rifiuti = source.match(/llama_memory_clear\(memoria, true\);\s*\n\s*(session->cached\.clear\(\);|riusati = 0;)/g)
        expect(rifiuti?.length ?? 0).toBeGreaterThanOrEqual(3)
    })
})

/**
 * Fermare davvero, e lasciare la memoria in uno stato che si può ancora usare.
 *
 * Owner 2026-08-06: il tasto Stop non fermava il modello locale. Il flag
 * `cancelled` esisteva ma veniva letto solo FRA un pezzo di prefill e il
 * successivo: dentro una singola `llama_decode` non guardava nessuno.
 */
describe('lo Stop del motore locale', () => {
    it('arma una callback che llama.cpp interroga mentre calcola', () => {
        expect(source).toContain('bool talos_deve_fermarsi(void * opaco) noexcept {')
        expect(source).toContain('llama_set_abort_callback(ctx, talos_deve_fermarsi, session);')
    })

    /**
     * ⛔ Dopo un abort gli `ubatch` già elaborati RESTANO nella KV. Andarsene
     * senza pulire lascia il contesto convinto di aver letto mezza domanda, e
     * il turno successivo risponde a una frase troncata. `cached` è la nostra
     * verità su cosa c'è dentro: la KV va riportata esattamente lì.
     */
    it('dopo un\'interruzione riporta la KV su ciò che dice `cached`', () => {
        const rollback = source.match(/llama_memory_seq_rm\(memoria, 0, \(llama_pos\) session->cached\.size\(\), -1\)/g)
        // Uno per il prefill e uno per la generazione: l'interruzione può
        // arrivare in tutti e due, e ripulire in uno solo è peggio che in
        // nessuno — perché sembra fatto.
        expect(rollback).toHaveLength(2)
    })

    it('distingue l\'interruzione dal guasto: 2 non è un errore', () => {
        expect(source).toContain('if (esito == 2) break;')
        expect(source).toMatch(/if \(esito == 2\) \{[^]*prefill interrotto/)
    })
})

/**
 * La cronometria per stadi. «Nove secondi» non è una diagnosi: è la somma di
 * cinque cose che si riparano in modi diversi.
 */
describe('gli stadi del tempo fino alla prima parola', () => {
    it('espone i cinque tempi e i conti del prefisso', () => {
        for (const campo of [
            'tokenizeMs', 'prefixMs', 'prefillMs', 'firstTokenMs', 'totalMs',
            'promptTokens', 'reusedTokens', 'newTokens', 'producedTokens', 'reusedContext',
        ]) {
            expect(source).toContain(`\\"${campo}\\"`)
        }
    })

    it('misura con un orologio che nessuno può spostare', () => {
        expect(source).toContain('std::chrono::steady_clock')
        expect(source).not.toContain('std::chrono::system_clock')
    })
})
