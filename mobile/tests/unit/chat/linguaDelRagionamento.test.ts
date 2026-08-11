import { describe, expect, it } from 'vitest'
import { buildTalosSystemPrompt } from '@/lib/tone'

/*
 * ⛔ La riga si controlla per CONTENUTO e non importandone la costante: quella
 * costante, esportata, non si minifica — e il grafo d'avvio ha sforato per 95
 * byte proprio per questo (600.195 contro 600.100). Un test non deve costare
 * peso all'app di chi non lo esegue mai.
 */
const RIGA = 'Your reasoning is SHOWN to the user: write it in their language too.'

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
        expect(locale).toContain('REASON, in the user\'s language')
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
