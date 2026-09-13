import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ⭐⭐⭐ IL SONDAGGIO GIUDICAVA IL TESTO, E BOCCIAVA I BACKEND SANI.
 *
 * ## Il fatto, misurato sul Pad l'11/09/2026
 *
 * Sondaggio su `Llama-3.2-3B-Instruct-Q4_0`, dal log del dispositivo:
 *
 * ```
 *   cpu:      verdetto=VALID          ttft 62.538 ms
 *   opencl:   verdetto=WRONG_ANSWER   ttft  7.505 ms
 *   hexagon:  verdetto=WRONG_ANSWER   ttft  2.505 ms
 * ```
 *
 * ⛔ `TalosBackendChoice.choose` scarta chi non ha risposto correttamente. ⇒
 * Con quel criterio **nessun acceleratore poteva mai essere scelto in
 * automatico** su questo telefono — pur essendo l'NPU **25 volte** piu' veloce
 * della CPU al primo token. Owner, 11/09: «con automatico dovrebbe farlo
 * automaticamente». Non era la decisione: era il metro.
 *
 * ## Perche' il confronto per caratteri non poteva funzionare
 *
 * [«Give Me FP32 or Give Me Death?», arXiv 2506.09501](https://arxiv.org/html/2506.09501v1),
 * letto l'11/09/2026: **anche a parita' di prompt e di seed, e anche in
 * decodifica greedy**, l'uscita cambia fra configurazioni hardware diverse. La
 * causa e' la **non associativita' della virgola mobile** — `(a+b)+c` non e'
 * `a+(b+c)`. Un token diverso all'inizio, e tutto il seguito diverge.
 *
 * ⇒ Pretendere 48 caratteri identici fra CPU e NPU chiede una cosa che
 * l'aritmetica non garantisce.
 *
 * ## ⛔ Perche' queste prove leggono il Java
 *
 * Il cancello vive in `TalosLlamaProbe`, dove Vitest non esegue. Ma cio' che va
 * difeso non e' un calcolo: e' **quale domanda** il cancello pone. Se domani
 * qualcuno tornasse al confronto per caratteri, gli acceleratori tornerebbero
 * invisibili all'automatico senza che un solo test diventi rosso — ed e'
 * esattamente com'e' andata finora.
 */
const sorgente = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/java/ai/talos/TalosLlamaProbe.java',
), 'utf8')

describe('SONDA — si giudica il compito, non il testo', () => {
    it('SND-01 il cancello guarda se ha CONTATO, non se i caratteri combaciano', () => {
        expect(sorgente).toContain('haContatoInOrdine(right) && haContatoInOrdine(left)')
    })

    /**
     * ⛔ La via rapida resta: due prefissi identici sono un accordo certo e
     * costano niente. Toglierla renderebbe il cancello piu' lento senza
     * renderlo piu' giusto.
     */
    it('SND-02 il confronto per prefisso resta come SCORCIATOIA, non come giudizio', () => {
        const corpo = sorgente.slice(sorgente.indexOf('agreesWithReference'))
        const prefisso = corpo.indexOf('regionMatches')
        const compito = corpo.indexOf('haContatoInOrdine')
        expect(prefisso).toBeGreaterThan(0)
        // ⛔ Prima la scorciatoia, poi il giudizio: se l'ordine si invertisse,
        // il prefisso diventerebbe di nuovo l'ultima parola.
        expect(prefisso).toBeLessThan(compito)
    })

    /**
     * ⛔⛔ IL TEST CHE MORDE. Cinque numeri, non venti: la generazione si ferma
     * sul TEMPO, non sul conteggio, e su un telefono lento puo' arrivare a otto
     * e fermarsi. Pretendere venti boccerebbe il telefono lento invece del
     * backend rotto — l'opposto di cio' che il cancello deve fare.
     */
    it('SND-03 bastano CINQUE numeri in salita, e il perche e scritto accanto', () => {
        expect(sorgente).toContain('NUMERI_IN_SALITA = 5')
        expect(sorgente).toContain('boccerebbe il telefono lento')
    })

    /**
     * ⛔ «in ordine» vuol dire che il 2 viene DOPO il 1. Cercare ogni numero da
     * capo accetterebbe «5 4 3 2 1», che non e' aver contato.
     */
    it('SND-04 la ricerca riparte DOPO l’occorrenza trovata, non da capo', () => {
        const corpo = sorgente.slice(sorgente.indexOf('static boolean haContatoInOrdine'))
        expect(corpo).toContain('da = dove + 1')
        expect(corpo).toContain('cercaNumeroIntero(basso, numero, da)')
    })

    /**
     * ⛔⛔ IL NUMERO SI CERCA INTERO, e questo test e' arrivato dopo il difetto.
     *
     * Un `indexOf("2")` nudo trova il 2 **dentro** «20», e il prompt dice
     * proprio «write the numbers from 1 to 20»: un modello che si limita a
     * ripetere la consegna avrebbe superato il cancello senza contare niente.
     * Le due guardie sono i caratteri ai lati — se uno dei due sparisse, la
     * cifra tornerebbe a combaciare dentro un numero piu' lungo.
     */
    it('SND-04b una cifra non combacia DENTRO un numero piu lungo', () => {
        const corpo = sorgente.slice(sorgente.indexOf('static int cercaNumeroIntero'))
        expect(corpo).toContain('!Character.isDigit(testo.charAt(dove - 1))')
        expect(corpo).toContain('!Character.isDigit(testo.charAt(fine))')
    })

    /**
     * ⛔ Cifre E parole: il prompt e' in inglese e chiede di contare, e due
     * modelli sani possono scegliere forme diverse. Bocciare per la forma
     * sarebbe rifare lo stesso errore del confronto per caratteri.
     */
    it('SND-05 accetta sia «1» sia «one»', () => {
        expect(sorgente).toContain('"one", "two", "three"')
    })

    /**
     * ⛔⛔ AL CONTRARIO — il cancello deve restare capace di BOCCIARE. Le due
     * uscite guaste viste sul Pad l'11/09 sono citate nel sorgente proprio
     * perche' chi lo legge sappia cosa deve continuare a fallire: una risposta
     * vuota, e `model 원: ? 어 (Translation **Model 어`.
     */
    it('SND-06 il sorgente nomina le due uscite che devono continuare a fallire', () => {
        expect(sorgente).toContain('Translation')
        expect(sorgente).toContain('vuota')
    })

    it('SND-07 un testo vuoto non concorda mai, nemmeno con un riferimento vuoto', () => {
        const corpo = sorgente.slice(sorgente.indexOf('agreesWithReference'))
        expect(corpo).toContain('if (left.isEmpty() || right.isEmpty()) return false')
    })

    /**
     * ⛔ E la ricerca che ha giustificato il cambio va citata: senza fonte e
     * data, «l'aritmetica non lo garantisce» e' un'opinione.
     */
    it('SND-08 la fonte del perche e citata, con la data', () => {
        expect(sorgente).toContain('2506.09501')
        expect(sorgente).toContain("11/09/2026")
    })
})
