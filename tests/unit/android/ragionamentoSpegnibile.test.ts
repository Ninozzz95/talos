import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ⭐⭐⭐ «QUESTO MODELLO RAGIONA» E «NON PUOI FARNE A MENO» SONO DUE COSE.
 *
 * ## Il numero che ha reso necessaria la domanda — Pad, 11/09/2026
 *
 * `LFM2.5-2.6B-Q4_0`, dalla riga sotto la risposta:
 *
 * ```
 *   10,7 s alla prima parola · 3,1 s al primo token del motore · 16,8 token/s
 * ```
 *
 * I 7,6 secondi in mezzo non sono lentezza e non sono nostri: aprendo
 * «Ragionamento» ci sono ~130 token di deliberazione in inglese, e a 16,8
 * token al secondo fanno 7,7 s. Combacia.
 *
 * ⛔ E la chat chiedeva GIA' `enable_thinking = false` — nella nostra
 * interfaccia il ragionamento nasce spento. Non e' servito a niente.
 *
 * ## Perche' la risposta non poteva venire da upstream
 *
 * `common_chat_templates_support_enable_thinking()` esiste, ma legge
 * `params.supports_thinking`, e il parser LFM2 lo scrive `true`
 * **incondizionatamente** (`common/parsers/lfm2.cpp:39`). Risponde «questo
 * modello ragiona», che e' un'altra domanda.
 *
 * La bandierina invece arriva fino al Jinja: `chat.cpp` la inietta nel
 * contesto del template. ⇒ Se il template la LEGGE, il prompt cambia; se la
 * ignora, resta identico. La prova e' il CONFRONTO — la stessa che usa
 * upstream in `common/chat-diff-analyzer.cpp` per analizzare i template.
 *
 * ## ⛔ Perche' queste prove leggono il sorgente
 *
 * Vive nel JNI, dove Vitest non esegue. Ma cio' che va difeso e' **quale
 * domanda** si pone: il giorno che qualcuno la sostituisse con un elenco di
 * nomi di modello, o con la funzione upstream che risponde ad altro, la
 * risposta tornerebbe sbagliata senza che un test diventi rosso.
 */
const jni = readFileSync(resolve(
    process.cwd(), 'android/app/src/main/cpp/talos_llama_jni.cpp',
), 'utf8')
const inizio = jni.indexOf('static bool talos_template_spegne_il_ragionamento')
/** Solo il CODICE: e' li' che non devono comparire nomi di modello. */
const corpo = jni.slice(inizio, inizio + 1400)
/** Il codice PIU' la spiegazione sopra: e' li' che vivono le citazioni. */
const conSpiegazione = jni.slice(Math.max(0, inizio - 2600), inizio + 1400)

describe('RAGIONAMENTO — si chiede al template, non a una tabella di nomi', () => {
    it('RAG-01 il template si applica DUE volte, e cambia solo enable_thinking', () => {
        expect(corpo).toContain('inputs.enable_thinking = pensa')
        expect(corpo).toContain('prompt_con(true)')
        expect(corpo).toContain('prompt_con(false)')
    })

    /**
     * ⛔⛔ IL TEST CHE MORDE: il verdetto e' la DIFFERENZA fra i due prompt.
     * Qualunque altra cosa — un flag upstream, un nome di modello — risponde a
     * una domanda diversa.
     */
    it('RAG-02 il verdetto e che i due prompt siano DIVERSI', () => {
        expect(corpo).toContain('return acceso != spento')
    })

    /**
     * ⛔ AL CONTRARIO: due prompt VUOTI sono uguali fra loro, e direbbero
     * «spegnibile» per silenzio. Un template che non si applica non e' un
     * interruttore.
     */
    it('RAG-03 due prompt vuoti non valgono come prova', () => {
        expect(corpo).toContain('if (acceso.empty() || spento.empty()) return false')
    })

    it('RAG-04 in dubbio vale NO, non «vedremo»', () => {
        expect(corpo).toMatch(/catch \(const std::exception &\) \{[^}]*return false;/)
    })

    /**
     * ⛔ Niente elenchi di nomi: un modello nuovo di Hugging Face deve
     * rispondere da solo il giorno che entra nel telefono — e' il vincolo
     * dell'owner, ed e' `nothing-hardcoded-must-adapt`.
     */
    it('RAG-05 nessun nome di modello scritto a mano nella sonda', () => {
        for (const nome of ['LFM2', 'Qwen', 'gemma', 'llama-3', 'granite']) {
            expect(corpo.toLowerCase()).not.toContain(nome.toLowerCase())
        }
    })

    it('RAG-06 e la risposta attraversa il ponte, invece di restare nel nativo', () => {
        expect(jni).toContain('out["thinkingCanBeDisabled"]')
        const ts = readFileSync(resolve(process.cwd(), 'src/services/localEngine.ts'), 'utf8')
        expect(ts).toContain('record.thinkingCanBeDisabled === true')
    })

    /**
     * ⛔ La fonte del perche' upstream non basta va citata, con riga: senza,
     * «supports_thinking dice un'altra cosa» e' un'opinione.
     */
    it('RAG-07 la ragione per cui la funzione upstream non risponde e citata alla fonte', () => {
        expect(conSpiegazione).toContain('lfm2.cpp:39')
        expect(conSpiegazione).toContain('chat-diff-analyzer.cpp')
        const parser = readFileSync(resolve(
            process.cwd(), 'third_party/llama.cpp/common/parsers/lfm2.cpp',
        ), 'utf8')
        // ⛔ Se upstream un giorno lo rendesse condizionale, questa prova cade
        // ed e' giusto che cada: la premessa della sonda sarebbe cambiata.
        expect(parser).toContain('data.supports_thinking = true;')
    })
})
