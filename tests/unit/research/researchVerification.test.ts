import { describe, expect, it } from 'vitest'
import {
    talosResearchJudgePrompt,
    talosResearchLocate,
    talosResearchParseVerdict,
    talosResearchPickJudge,
    talosResearchVerify,
    talosResearchVerifiedStanding,
    type TalosResearchJudgeIdentity,
} from '@/lib/research/researchVerification'
import type { TalosResearchClaim } from '@/lib/research/researchSynthesis'
import type { TalosResearchSource } from '@/lib/research/researchCollector'

const PAGE: TalosResearchSource = {
    url: 'https://rainews.it/x',
    title: 'Il resoconto',
    publishedAt: '2026-07-26',
    // Deliberately awkward: doubled spaces and curly quotes BEFORE the passage,
    // so an offset computed on the normalised string lands in the wrong place.
    text: 'Cronaca  della  gara. Il direttore ha detto “niente penalità”.  '
        + 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026 davanti a Verstappen.',
    obtained: 'page',
}

const SNIPPET: TalosResearchSource = {
    url: 'https://oasport.it/y',
    title: 'Ordine d’arrivo',
    publishedAt: null,
    text: 'Antonelli è arrivato terzo.',
    obtained: 'snippet',
}

const AUTHOR: TalosResearchJudgeIdentity = { id: 'deepseek:deepseek-chat', provider: 'deepseek', model: 'deepseek-chat' }
const LOCAL: TalosResearchJudgeIdentity = { id: 'local:qwen3-3b', provider: 'local', model: 'qwen3-3b' }

function claim(over: Partial<TalosResearchClaim> = {}): TalosResearchClaim {
    return {
        text: 'Norris ha vinto il Gran Premio d’Ungheria 2026.',
        sourceIndex: 1,
        quote: 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026',
        quotePresent: 'yes',
        ...over,
    }
}

describe('L2 — where exactly the passage sits in the text we kept', () => {
    it('gives offsets into the ORIGINAL text, not into a tidied copy', () => {
        const span = talosResearchLocate(PAGE.text, 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026')

        // The outcome that matters: cutting the kept text at those offsets
        // returns the passage. This is what the report highlights when the
        // reader taps a citation, so an offset that is merely "close" shows
        // the reader a sentence that is not the one being cited.
        expect(span).not.toBeNull()
        expect(PAGE.text.slice(span!.from, span!.to)).toBe('Lando Norris ha vinto il Gran Premio d’Ungheria 2026')
    })

    it('still finds a passage the model retyped with different spacing and quotes', () => {
        const span = talosResearchLocate(PAGE.text, 'il direttore   ha detto "niente penalità"')

        expect(span).not.toBeNull()
        expect(PAGE.text.slice(span!.from, span!.to)).toBe('Il direttore ha detto “niente penalità”')
    })

    it('refuses what is not there instead of finding the nearest thing', () => {
        expect(talosResearchLocate(PAGE.text, 'Verstappen ha vinto')).toBeNull()
    })
})

describe('who is allowed to judge', () => {
    /**
     * THE refusal, and the one with a number behind it: a model judging its own
     * output is up to 50% more likely to mark as satisfied a criterion it
     * actually failed (arXiv 2604.06996). So this is not a preference for
     * variety — a self-judged claim is worth less than an unjudged one, because
     * it carries a stamp it did not earn.
     */
    it('never lets the author judge itself, even when it is the only one there', () => {
        expect(talosResearchPickJudge(AUTHOR, [AUTHOR])).toBeNull()
    })

    it('takes the first candidate that is not the author', () => {
        expect(talosResearchPickJudge(AUTHOR, [AUTHOR, LOCAL])?.id).toBe(LOCAL.id)
    })

    it('recognises the author by model, not by the label it happens to carry', () => {
        const renamed: TalosResearchJudgeIdentity = { id: 'altro-nome', provider: 'deepseek', model: 'deepseek-chat' }

        expect(talosResearchPickJudge(AUTHOR, [renamed])).toBeNull()
    })
})

describe('L3 — does the passage actually support the claim', () => {
    it('judges on the text from the page, not on what the model typed', async () => {
        const seen: { claim: string, quote: string }[] = []
        const verified = await talosResearchVerify({
            judge: LOCAL,
            at: () => '2026-08-02T10:00:00.000Z',
            ask: async (text, quote) => {
                seen.push({ claim: text, quote })
                return 'SI — il passaggio lo dice apertamente.'
            },
        // The model retyped the passage with straight quotes and loose spacing.
        }, [claim({ quote: 'Lando  Norris ha vinto il Gran Premio d\'Ungheria 2026' })], [PAGE])

        // What goes to the judge is the span cut out of the source, so a model
        // cannot smuggle a doctored passage past the one check that reads it.
        expect(seen[0]!.quote).toBe('Lando Norris ha vinto il Gran Premio d’Ungheria 2026')
        expect(verified[0]!.checks.claimSupported).toBe('yes')
        expect(verified[0]!.checks.judge).toBe('local:qwen3-3b')
    })

    it('does not pay a model to judge a passage that is not in the source', async () => {
        const verified = await talosResearchVerify({
            judge: LOCAL,
            at: () => '2026-08-02T10:00:00.000Z',
            // Behaves like the real thing would if it were wrongly reached:
            // it costs something. Here that cost is a failed test.
            ask: async () => { throw new Error('il giudice non doveva essere chiamato') },
        }, [claim({ quote: 'una frase mai apparsa su quella pagina' })], [PAGE])

        expect(verified[0]!.checks.quotePresent).toBe(false)
        expect(verified[0]!.checks.claimSupported).toBe('unchecked')
        expect(verified[0]!.checks.judge).toBeNull()
        // The reason is what proves the judge was never reached. Without this
        // line the test passes either way: a judge that was called and threw
        // also ends up `unchecked` with no judge recorded, so the three
        // assertions above cannot tell "skipped" from "tried and failed".
        expect(verified[0]!.checks.supportReason).toBe('il passaggio non è nel testo della fonte')
    })

    it('marks unchecked, with the reason, when no independent judge exists', async () => {
        const verified = await talosResearchVerify({
            judge: null,
            at: () => '2026-08-02T10:00:00.000Z',
            ask: async () => { throw new Error('non c’è nessun giudice da chiamare') },
        }, [claim()], [PAGE])

        expect(verified[0]!.checks.claimSupported).toBe('unchecked')
        expect(verified[0]!.checks.supportReason).toMatch(/giudice/i)
    })

    it('keeps a judge that fails from taking the rest of the report down with it', async () => {
        const verified = await talosResearchVerify({
            judge: LOCAL,
            at: () => '2026-08-02T10:00:00.000Z',
            ask: async (text) => {
                if (text.startsWith('Norris')) throw new Error('rete caduta')
                return 'NO — il passaggio parla d’altro.'
            },
        }, [claim(), claim({ text: 'Antonelli è arrivato terzo.', sourceIndex: 2, quote: 'Antonelli è arrivato terzo' })], [PAGE, SNIPPET])

        expect(verified[0]!.checks.claimSupported).toBe('unchecked')
        expect(verified[1]!.checks.claimSupported).toBe('no')
    })
})

describe('L1 — how the source was obtained', () => {
    it('separates a page that was read from a snippet that never was', async () => {
        const verified = await talosResearchVerify({
            judge: LOCAL,
            at: () => '2026-08-02T10:00:00.000Z',
            ask: async () => 'PARZIALE — dice il fatto ma non la data.',
        }, [claim(), claim({ text: 'Antonelli terzo.', sourceIndex: 2, quote: 'Antonelli è arrivato terzo' })], [PAGE, SNIPPET])

        expect(verified[0]!.checks.resolved).toBe('page')
        // Never opened: the evidence is whatever the search engine chose to
        // show, which is weaker, and saying so is the whole point.
        expect(verified[1]!.checks.resolved).toBe('snippet')
        expect(verified[1]!.checks.claimSupported).toBe('partial')
    })

    it('calls a citation to a source nobody handed out what it is', async () => {
        const verified = await talosResearchVerify({
            judge: LOCAL,
            at: () => '2026-08-02T10:00:00.000Z',
            ask: async () => 'SI',
        }, [claim({ sourceIndex: 9 })], [PAGE])

        expect(verified[0]!.checks.resolved).toBe('missing')
        expect(verified[0]!.checks.claimSupported).toBe('unchecked')
    })
})

describe('reading the judge’s answer', () => {
    it('understands the three verdicts and keeps the reason', () => {
        expect(talosResearchParseVerdict('SI — lo dice testualmente.')).toEqual({
            support: 'yes',
            reason: 'lo dice testualmente.',
        })
        expect(talosResearchParseVerdict('PARZIALE: dice il fatto, non la portata.').support).toBe('partial')
        expect(talosResearchParseVerdict('NO, il passaggio riguarda un’altra gara.').support).toBe('no')
        expect(talosResearchParseVerdict('Sì').support).toBe('yes')
    })

    it('does not read a verdict into an answer that has none', () => {
        // An unparseable answer is not a pass. The claim simply was not judged.
        expect(talosResearchParseVerdict('Non posso rispondere a questa domanda.').support).toBe('unchecked')
        expect(talosResearchParseVerdict('').support).toBe('unchecked')
    })

    it('is not fooled by a verdict word buried in a sentence', () => {
        expect(talosResearchParseVerdict('Nonostante tutto il passaggio regge').support).toBe('unchecked')
    })
})

describe('the prompt the judge sees', () => {
    it('carries the claim and the passage, and asks it to look nowhere else', () => {
        const prompt = talosResearchJudgePrompt('Norris ha vinto.', 'Lando Norris ha vinto')

        expect(prompt).toContain('Norris ha vinto.')
        expect(prompt).toContain('Lando Norris ha vinto')
        // Without this the model answers from what it already knows, and a true
        // statement gets a pass from a passage that never said it.
        expect(prompt.toLowerCase()).toContain('solo')
    })
})

describe('what the reader is told up front', () => {
    it('counts unchecked and partial apart from supported', async () => {
        const verified = await talosResearchVerify({
            judge: LOCAL,
            at: () => '2026-08-02T10:00:00.000Z',
            ask: async (text) => (text.startsWith('Norris') ? 'SI' : 'PARZIALE — solo in parte.'),
        }, [
            claim(),
            claim({ text: 'Antonelli terzo.', sourceIndex: 2, quote: 'Antonelli è arrivato terzo' }),
            claim({ text: 'Inventata.', quote: 'mai scritto da nessuna parte' }),
        ], [PAGE, SNIPPET])

        expect(talosResearchVerifiedStanding(verified)).toEqual({
            total: 3,
            supported: 1,
            partial: 1,
            unsupported: 0,
            unchecked: 1,
            // ⛔ CONTESA-01, aggiunto il 2026-08-20: qui è zero perché nessuna
            // fonte contraria è stata raccolta in questa verifica. Il campo sta
            // nel conto anche quando è zero — un esito che compare solo quando
            // succede si legge come un errore la prima volta che appare.
            contested: 0,
        })
    })
})


/**
 * ⛔⛔ CONTESA-02 — il disaccordo entra nei DATI, non solo nella prosa.
 *
 * MISURATO sul Pad il 2026-08-20: il rapporto su GGUF scriveva «le fonti… non
 * specificano però formalmente un maintainer unico» e la barra sopra diceva
 * 7 su 7 sostenute, 0 contese. `talosResearchContestedVerdict` esisteva coi
 * suoi test, e non lo chiamava nessuno.
 */
describe('la contesa, dal giudice fino al verdetto', () => {
    const SMENTITA: TalosResearchSource = {
        url: 'https://smentita.example/x',
        title: 'La rettifica',
        publishedAt: null,
        text: 'La giuria non ha mai assegnato il Gran Premio a Norris: la vittoria è stata di Verstappen.',
        obtained: 'page',
    }

    it('una sostenuta che qualcun altro nega diventa CONTESA, col passaggio', async () => {
        const chieste: string[] = []
        const verified = await talosResearchVerify({
            judge: LOCAL,
            at: () => '2026-08-02T10:00:00.000Z',
            ask: async () => 'SI — il passaggio lo dice apertamente.',
            askOpposing: async (_claim, passage) => {
                chieste.push(passage)
                return 'SI — la fonte dice esattamente il contrario.'
            },
        }, [claim()], [PAGE, SMENTITA])

        expect(verified[0]!.checks.claimSupported).toBe('contested')
        expect(verified[0]!.checks.opposing).toHaveLength(1)
        expect(verified[0]!.checks.opposing![0]!.url).toBe('https://smentita.example/x')
        // ⛔ Il passaggio mandato al giudice viene dalla fonte, non dal modello.
        expect(SMENTITA.text).toContain(chieste[0]!)
    })

    it('⛔ e AL CONTRARIO: se il giudice dice NO, il verdetto resta quello di prima', async () => {
        const verified = await talosResearchVerify({
            judge: LOCAL,
            at: () => '2026-08-02T10:00:00.000Z',
            ask: async () => 'SI — il passaggio lo dice apertamente.',
            askOpposing: async () => 'NO — parla di un altro anno.',
        }, [claim()], [PAGE, SMENTITA])

        expect(verified[0]!.checks.claimSupported).toBe('yes')
        // ⛔ E `opposing` non c'è: «guardato e niente» non deve scriversi come
        //   un elenco vuoto, che si legge uguale a «guardato».
        expect(verified[0]!.checks.opposing).toBeUndefined()
    })

    it('⛔ e senza la seconda domanda NIENTE cambia: la porta chiusa non altera i dati', async () => {
        const verified = await talosResearchVerify({
            judge: LOCAL,
            at: () => '2026-08-02T10:00:00.000Z',
            ask: async () => 'SI — il passaggio lo dice apertamente.',
        }, [claim()], [PAGE, SMENTITA])

        expect(verified[0]!.checks.claimSupported).toBe('yes')
        expect(verified[0]!.checks.opposing).toBeUndefined()
    })

    it('⛔ e una SMENTITA non si contesta: sarebbe la stessa cosa detta due volte', async () => {
        let chiesto = false
        const verified = await talosResearchVerify({
            judge: LOCAL,
            at: () => '2026-08-02T10:00:00.000Z',
            ask: async () => 'NO — il passaggio non lo sostiene.',
            askOpposing: async () => { chiesto = true; return 'SI' },
        }, [claim()], [PAGE, SMENTITA])

        expect(verified[0]!.checks.claimSupported).toBe('no')
        // E non si paga per chiederlo: su un «no» la contesa non esiste.
        expect(chiesto).toBe(false)
    })

    it('⛔ e un giudice che cade sulla seconda domanda non porta via il rapporto', async () => {
        const verified = await talosResearchVerify({
            judge: LOCAL,
            at: () => '2026-08-02T10:00:00.000Z',
            ask: async () => 'SI — il passaggio lo dice apertamente.',
            askOpposing: async () => { throw new Error('il giudice non ha risposto') },
        }, [claim()], [PAGE, SMENTITA])

        expect(verified[0]!.checks.claimSupported).toBe('yes')
        expect(verified[0]!.checks.judge).toBe('local:qwen3-3b')
    })
})


/**
 * ⛔⛔ MENU-RICOPIATO-01 — «Sì | PARZIALE | motivo» non è una scelta.
 *
 * MISURATO sul Pad il 2026-08-20. A schermo si leggeva «contesa» sopra e
 * «| PARZIALE |» sotto: due parole diverse per lo stesso stato, il formato
 * grezzo del protocollo dato in pasto a una persona, e il verdetto era il più
 * generoso dei due che il modello aveva scritto.
 */
describe('quando il giudice ricopia il menu invece di scegliere', () => {
    it('⛔ due voci del formato in una riga = nessun verdetto', () => {
        const letto = talosResearchParseVerdict('Sì | PARZIALE | Il passaggio indica che è il creatore.')
        expect(letto.support).toBe('unchecked')
        // ⛔ E nessun motivo: un motivo salvato da una riga illeggibile
        //   sarebbe la metà comprensibile di una risposta che non lo era.
        expect(letto.reason).toBe('')
    })

    it('e il menu intero ricopiato nemmeno', () => {
        expect(talosResearchParseVerdict('SI | PARZIALE | NO — motivo, massimo quindici parole').support).toBe('unchecked')
    })

    it('⛔ e AL CONTRARIO: una barra sola è punteggiatura, non un secondo verdetto', () => {
        const letto = talosResearchParseVerdict('SI | il passaggio lo dice apertamente')
        expect(letto.support).toBe('yes')
        // La barra non entra nel motivo: è un separatore, come il trattino.
        expect(letto.reason).toBe('il passaggio lo dice apertamente')
    })

    it('e un verdetto con le barre davanti resta leggibile', () => {
        const letto = talosResearchParseVerdict('| PARZIALE | riguarda l’argomento ma non la misura')
        expect(letto.support).toBe('partial')
        expect(letto.reason).toBe('riguarda l’argomento ma non la misura')
    })

    it('la riga normale non cambia di una virgola', () => {
        const letto = talosResearchParseVerdict('NO — la fonte non ne parla')
        expect(letto.support).toBe('no')
        expect(letto.reason).toBe('la fonte non ne parla')
    })
})


/**
 * ⛔⛔ MENU-NEL-PROMPT-01 — il formato con le barre lo faceva RICOPIARE.
 *
 * MISURATO sul Pad il 2026-08-20 con gemma-3-4b come giudice: le risposte
 * arrivavano come «Sì | PARZIALE | Il passaggio indica che…». Il parser
 * prendeva la prima parola, e quei rapporti uscivano al 100%: erano verdetti
 * che il giudice non aveva mai dato. La cura sta a monte — nella domanda.
 */
describe('la domanda al giudice non contiene un menu da ricopiare', () => {
    it('⛔ le tre parole NON sono su una riga separate da barre', () => {
        const prompt = talosResearchJudgePrompt('afferma X', 'passaggio Y')
        expect(prompt).not.toContain('SI | PARZIALE | NO')
    })

    it('le tre restano offerte, una per riga, con un esempio', () => {
        const prompt = talosResearchJudgePrompt('afferma X', 'passaggio Y')
        for (const parola of ['SI', 'PARZIALE', 'NO']) {
            expect(prompt.split(String.fromCharCode(10))).toContain(parola)
        }
        // ⛔ L'esempio è la parte che sostituisce il menu: senza, «comincia con
        //   una di queste tre parole» resta un'istruzione senza forma.
        expect(prompt).toContain('Esempio di risposta:')
    })
})
