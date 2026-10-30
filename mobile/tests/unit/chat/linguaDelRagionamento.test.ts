import { describe, expect, it } from 'vitest'
import { buildTalosSystemPrompt } from '@/lib/tone'
import { rigaLinguaDelleRisposte } from '@/lib/chat/linguaDelleRisposte'

/*
 * ⛔ La riga si controlla per CONTENUTO e non importandone la costante: quella
 * costante, esportata, non si minifica — e il grafo d'avvio ha sforato per 95
 * byte proprio per questo (600.195 contro 600.100). Un test non deve costare
 * peso all'app di chi non lo esegue mai.
 */
const RIGA = 'Reasoning is SHOWN to the user: write it in their language.'

/**
 * ⛔⛔ «ANSWER in the user's language» NON copriva il ragionamento.
 *
 * Owner 2026-08-11, dal Pad: app in italiano, domanda in italiano, risposta in
 * italiano — e dentro il blocco «Ragionamento»: «The user wants to check if
 * bartowski/Llama-3.2-3B-Instruct-GGUF runs on their phone…».
 *
 * La riga sulla lingua c'era da sempre e parlava della RISPOSTA. Il
 * ragionamento e' un canale suo, e nessuno gliel'aveva mai detto.
 *
 * ⛔ Questi casi provano che la riga c'e' in TUTTE E DUE le colonne — chiave e
 * locale — perche' e' la regola dell'owner: una colonna sola non chiude niente.
 * Che i provider OBBEDISCANO e' un'altra cosa, e si misura sul telefono.
 */
describe('⛔ la lingua del ragionamento, nelle due colonne', () => {
    it('c\'e\' nel prompt di un modello A CHIAVE', () => {
        expect(buildTalosSystemPrompt('neutral', { provider: 'deepseek', model: 'deepseek-v4' }))
            .toContain(RIGA)
    })

    it('c\'e\' nel prompt del motore LOCALE, in forma piu\' corta', () => {
        /*
         * ⛔ Non la stessa riga, e il perche' e' misurato: il prompt locale ha
         * un tetto di 600 caratteri — un modello da 360M ripeteva il protocollo
         * invece di rispondere — e aggiungendocela in coda si arrivava a 635.
         * Il test l'ha detto subito. La cura non e' alzare il tetto (sarebbe
         * rimettere il difetto che l'ha creato): e' dire la stessa cosa in meno
         * parole, che su un modello piccolo e' anche piu' probabile che venga
         * seguita.
         */
        const locale = buildTalosSystemPrompt('neutral', { provider: 'local', model: 'qwen3-1.7b' })
        /*
         * ⛔⛔ E NIENTE PAROLE IN MAIUSCOLO, imparato rompendolo.
         *
         * La prima versione diceva «Answer, and REASON, in the user's
         * language». Sul Pad, l'11 agosto, Qwen3-1.7B ha risposto «REASON: The
         * user provided a problem involving three boxes…»: aveva preso la
         * parola in maiuscolo per un'etichetta da stampare. Su un modello
         * piccolo tutto ciò che sembra un marcatore diventa uscita.
         */
        const urlate = (locale.match(/\b[A-Z]{3,}\b/g) ?? [])
            // ⛔ I nomi propri restano: «TALOS» e «AVM» sono chi siamo, non
            // enfasi. Tutto il resto in maiuscolo è un marcatore travestito.
            .filter((parola) => !['TALOS', 'AVM'].includes(parola))
        expect(urlate).toEqual([])
        expect(locale).toContain('Reply in the user\'s language, and think in it too')
        expect(locale).toContain('your reasoning is shown to them')
        expect(locale.length).toBeLessThan(600)
    })

    it('e anche senza identita\' dichiarata', () => {
        expect(buildTalosSystemPrompt('neutral')).toContain(RIGA)
    })

    it('⛔ dice che il ragionamento e\' VISIBILE, non solo «scrivi in italiano»', () => {
        // Il motivo regge anche nei casi che non abbiamo previsto; un divieto
        // secco no. Se sparisce «shown», e' sparita la ragione della regola.
        expect(RIGA).toMatch(/shown/i)
        expect(RIGA).toMatch(/their language/i)
    })
})

/**
 * ⛔⛔ E LA LINGUA DELLA RISPOSTA — che per un modello a chiave NON C'ERA.
 *
 * MISURATO sul Pad il 2026-08-15, mentre preparavo le viste per il README:
 * interfaccia in inglese, domanda scritta in inglese, risposta in italiano:
 *
 *     «Ancora il Burj Khalifa, a Dubai: 828 metri, 163 piani, inaugurato nel
 *      2010. Chi lo insidia: Jeddah Tower…»
 *
 * ⛔ Il modello non stava disobbedendo: nessuno gli aveva detto niente.
 * `BASE_PROMPT` parlava solo del RAGIONAMENTO, e la riga sulla risposta viveva
 * unicamente nel ramo del motore locale.
 *
 * ⇒ E dirlo non basta se lo si dice per allusione. «Reply in the user's
 * language» obbliga il modello a DEDURRE quale sia, e la deduzione la fa sul
 * contesto: su questo telefono fino a venti memorie italiane vengono infilate
 * intorno all'ultimo turno, e i nostri identificatori di attrezzo sono italiani
 * per scelta. Con il nome esplicito non c'è niente da dedurre.
 */
describe('⛔ la lingua della RISPOSTA, detta per nome', () => {
    it('nomina la lingua quando il locale c\'e\'', () => {
        expect(buildTalosSystemPrompt('neutral', null, 'en'))
            .toContain('Write your reply and your reasoning in English')
        expect(buildTalosSystemPrompt('neutral', null, 'it'))
            .toContain('Write your reply and your reasoning in Italian')
    })

    it('⛔ e copre il caso che l\'ha rotta: il materiale in un\'ALTRA lingua', () => {
        /*
         * MISURATO sul Pad il 2026-08-15, due domande inglesi di fila con la
         * stessa app in inglese e lo stesso modello:
         *
         *   «check my battery, storage, network…»  → risposta in INGLESE ✓
         *   «read the document in my library…»     → risposta in ITALIANO ✗
         *
         * `library_read` aveva riversato nel contesto un documento italiano e
         * il modello ha seguito quello invece della riga. La riga senza questa
         * clausola era corretta e insufficiente.
         */
        const prompt = buildTalosSystemPrompt('neutral', null, 'en')
        expect(prompt).toMatch(/even when documents/i)
        expect(prompt).toMatch(/another language/i)
    })

    it('⛔ non dice «la lingua dell\'utente»: dice il NOME', () => {
        // Questo è il punto della cura. Se qualcuno riscrivesse la riga in
        // forma allusiva il difetto tornerebbe, e il test non se ne
        // accorgerebbe cercando solo la presenza di una riga qualsiasi.
        const prompt = buildTalosSystemPrompt('neutral', null, 'en')
        const riga = prompt.split('. ').find((frase) => frase.includes('Write your reply'))
        expect(riga).toBeDefined()
        expect(riga).not.toMatch(/user's language|their language|the language they/i)
    })

    it('regge un locale con la regione', () => {
        expect(buildTalosSystemPrompt('neutral', null, 'en-US'))
            .toContain('in English,')
        expect(buildTalosSystemPrompt('neutral', null, 'pt-BR'))
            .toContain('in Portuguese,')
    })

    it('⛔ TACE su un locale che non conosce, invece di scrivere un codice', () => {
        // `Intl.DisplayNames.of()` ripete il codice quando non sa: «zz» → «zz».
        // «Write your reply in zz» non aiuta nessuno e occupa il prompt.
        const ignoto = buildTalosSystemPrompt('neutral', null, 'zz')
        expect(ignoto).not.toContain('Write your reply')
        expect(buildTalosSystemPrompt('neutral', null, null)).not.toContain('Write your reply')
        expect(buildTalosSystemPrompt('neutral', null, '')).not.toContain('Write your reply')
    })

    it('⛔ non tocca il ramo del motore locale, che ha un tetto di 600 caratteri', () => {
        const locale = buildTalosSystemPrompt('neutral', { provider: 'local', model: 'qwen3-1.7b' }, 'en')
        expect(locale.length).toBeLessThan(600)
    })
})

/**
 * TONE-LINGUA-01..03 — la lingua delle risposte (owner 28/10/2026: «se parlo in persiano a Talos mi risponde in inglese»). Con
 * l'impostazione «Lingua» arrivata il prompt NON ordina più la lingua dell'app: dice la riga del nucleo r4 (Automatica: la lingua di chi
 * scrive o parla, anche con memoria e attrezzi in un'altra lingua; ripiego sulla lingua dell'interfaccia). Le regole dell'owner su
 * questo prompt restano: il ragionamento nella stessa lingua, il locale sotto 600 caratteri, nessuna parola in maiuscolo.
 */
describe('TONE-LINGUA la riga del nucleo al posto della lingua dell\'app', () => {
    const AUTOMATICA = 'Always reply in the same language the person writes or speaks in, even when documents, memory or tool output are in another language, unless they ask for another one. If you cannot tell which language that is, reply in English.'
    it('TONE-LINGUA-01 a chiave, Automatica: la riga del nucleo; mai più «Write your reply … in English»', () => {
        const prompt = buildTalosSystemPrompt('neutral', { provider: 'deepseek', model: 'deepseek-v4' }, 'en', rigaLinguaDelleRisposte({ lingua: 'auto', linguaInterfaccia: 'en' }))
        expect(prompt).toContain(AUTOMATICA)
        expect(prompt).not.toContain('Write your reply and your reasoning in')
        expect(prompt).toContain(RIGA)
    })

    it('TONE-LINGUA-02 locale, Automatica: la stessa riga, il ragionamento con lei, sotto 600 e senza maiuscole', () => {
        const locale = buildTalosSystemPrompt('neutral', { provider: 'local', model: 'qwen3-1.7b' }, 'it', rigaLinguaDelleRisposte({ lingua: 'auto', linguaInterfaccia: 'it' }))
        expect(locale).toContain('Always reply in the same language the person writes or speaks in')
        expect(locale).toContain('reply in Italian.')
        expect(locale).toContain('your reasoning is shown to them')
        expect(locale).not.toContain('Reply and think in Italian')
        expect((locale.match(/\b[A-Z]{3,}\b/g) ?? []).filter((p) => !['TALOS', 'AVM'].includes(p))).toEqual([])
        // ⛔ owner 28/10/2026: il tetto passa da 600 a 800 per la riga del nucleo (identica sulle tre app), SOLO dopo la prova sul Pad
        // col modello locale più piccolo e altri 4 (nessuno deve ripetere il protocollo); misurato: 772 caratteri
        expect(locale.length).toBeLessThan(800)
    })

    it('TONE-LINGUA-03 una lingua scelta comanda, a chiave e in locale', () => {
        expect(buildTalosSystemPrompt('neutral', { provider: 'openai', model: 'gpt' }, 'it', rigaLinguaDelleRisposte({ lingua: 'fa-IR' }))).toContain('Always reply in Persian (Iran), unless the person asks for another language.')
        expect(buildTalosSystemPrompt('neutral', { provider: 'local', model: 'lfm' }, 'it', rigaLinguaDelleRisposte({ lingua: 'fa' }))).toContain('Always reply in Persian, unless the person asks for another language.')
    })
})
