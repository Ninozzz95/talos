import { describe, expect, it } from 'vitest'
import {
    talosResearchOpposingCandidate,
    talosResearchOpposingPrompt,
    talosResearchParseOpposingVerdict,
} from '@/lib/research/researchOpposing'
import type { TalosResearchSource } from '@/lib/research/researchCollector'

/**
 * ⛔⛔ CONTESA-02 — cercare chi dice il CONTRARIO.
 *
 * ## Il difetto che ha fatto nascere questo file
 *
 * Sul Pad, 2026-08-20: il rapporto su GGUF scriveva in chiaro «le fonti… non
 * specificano però formalmente un maintainer unico» — una divergenza — e la
 * barra sopra diceva **7 su 7 sostenute · 0 contese**. La regola della contesa
 * esisteva coi suoi test e **non la chiamava nessuno**: il disaccordo poteva
 * stare nella prosa e mai nei dati.
 */

function fonte(over: Partial<TalosResearchSource>): TalosResearchSource {
    return {
        url: 'https://a.example',
        title: 'A',
        publishedAt: null,
        text: '',
        obtained: 'page',
        ...over,
    } as TalosResearchSource
}

describe('trovare la frase che parla della stessa cosa', () => {
    const FONTI = [
        fonte({ url: 'https://uno.example', title: 'Uno', text: 'GGUF was developed by Georgi Gerganov and the llama.cpp community.' }),
        fonte({
            url: 'https://due.example',
            title: 'Due',
            text: 'Le ricette di cucina siciliana sono antiche. The specification does not name a single maintainer for the GGUF format. Altro testo qui.',
        }),
    ]

    it('prende la frase con più parole in comune, da un\'ALTRA fonte', () => {
        const trovata = talosResearchOpposingCandidate(
            'GGUF has a single formally declared maintainer.', 0, FONTI)

        expect(trovata?.sourceIndex).toBe(1)
        expect(trovata?.url).toBe('https://due.example')
        expect(trovata?.passage).toBe('The specification does not name a single maintainer for the GGUF format.')
    })

    it('e lo span punta davvero a quelle parole nel testo della fonte', () => {
        const trovata = talosResearchOpposingCandidate(
            'GGUF has a single formally declared maintainer.', 0, FONTI)
        const testo = FONTI[1]!.text
        expect(testo.slice(trovata!.span.from, trovata!.span.to)).toBe(trovata!.passage)
    })

    it('⛔ e AL CONTRARIO: la fonte GIÀ CITATA è esclusa', () => {
        // Riproporre al giudice la pagina che ha appena letto significherebbe
        // farsi contraddire da chi ha appena detto di sì, e chiamare «contesa»
        // un disaccordo con sé stesso.
        const trovata = talosResearchOpposingCandidate(
            'The specification does not name a single maintainer.', 1, FONTI)
        expect(trovata?.sourceIndex).not.toBe(1)
    })

    it('⛔ e una frase che non c\'entra NON viene proposta', () => {
        // Chiedere al giudice di confrontare l'affermazione con un paragrafo
        // fuori tema produce un «no» che sembra una verifica e non lo è — e
        // costa comunque una chiamata.
        const soloRicette = [FONTI[0]!, fonte({ url: 'https://tre.example', text: 'Le ricette di cucina siciliana sono antiche e buone.' })]
        expect(talosResearchOpposingCandidate('GGUF has a single formally declared maintainer.', 0, soloRicette)).toBeNull()
    })

    it('⛔ e con UNA fonte sola non c\'è nessun altro che possa contraddire', () => {
        expect(talosResearchOpposingCandidate('qualsiasi affermazione lunga abbastanza', 0, [FONTI[0]!])).toBeNull()
        expect(talosResearchOpposingCandidate('qualsiasi affermazione lunga abbastanza', 0, [])).toBeNull()
    })

    it('un muro di testo senza punti non diventa UNA frase lunga una pagina', () => {
        // Mandarla al giudice sarebbe mandargli la pagina intera, e la domanda
        // diventerebbe «questa fonte dice il contrario», che non è verificabile.
        const muro = fonte({ url: 'https://muro.example', text: ('maintainer single specification format ').repeat(80) })
        const trovata = talosResearchOpposingCandidate('single maintainer specification format', 9, [muro])
        expect(trovata).not.toBeNull()
        expect(trovata!.passage.length).toBeLessThanOrEqual(400)
    })

    it('un\'affermazione fatta di parole cortissime non fa scegliere a caso', () => {
        expect(talosResearchOpposingCandidate('a b c di e', 9, FONTI)).toBeNull()
    })
})

describe('la domanda al giudice', () => {
    it('chiede di CONTRADDIRE, e dice che tacere non è contraddire', () => {
        const prompt = talosResearchOpposingPrompt('afferma X', 'passaggio Y')
        expect(prompt).toContain('CONTRADDICE')
        // ⛔ Senza questa riga un passaggio che semplicemente non parla
        //   dell'affermazione verrebbe letto come una smentita, e le contese
        //   comparirebbero ovunque.
        expect(prompt).toContain('non parla')
        expect(prompt).toContain('afferma X')
        expect(prompt).toContain('passaggio Y')
    })

    it('⛔ e nemmeno qui c’è un menu con le barre da ricopiare', () => {
        expect(talosResearchOpposingPrompt('x', 'y')).not.toContain('SI | NO')
        expect(talosResearchOpposingPrompt('x', 'y')).toContain('Esempio di risposta:')
    })

    it('non è la domanda del primo giro', () => {
        expect(talosResearchOpposingPrompt('x', 'y')).not.toContain('sostiene l’affermazione?')
    })
})

describe('leggere la risposta', () => {
    it('riconosce il sì', () => {
        expect(talosResearchParseOpposingVerdict('SI — dice esattamente il contrario')).toBe(true)
        expect(talosResearchParseOpposingVerdict('sì, lo nega')).toBe(true)
        expect(talosResearchParseOpposingVerdict('  Yes - it contradicts  ')).toBe(true)
    })

    it('⛔ e AL CONTRARIO: nel dubbio è NO', () => {
        // Una contesa inventata è peggio di una contesa non trovata: toglie
        // forza a quelle vere.
        expect(talosResearchParseOpposingVerdict('NO — non ne parla')).toBe(false)
        expect(talosResearchParseOpposingVerdict('')).toBe(false)
        expect(talosResearchParseOpposingVerdict('non saprei')).toBe(false)
        expect(talosResearchParseOpposingVerdict('{"verdict": true}')).toBe(false)
    })

    it('⛔ e un «no» dentro il MOTIVO non ribalta un sì, né viceversa', () => {
        expect(talosResearchParseOpposingVerdict('SI — la fonte dice che non esiste un mantenitore')).toBe(true)
        expect(talosResearchParseOpposingVerdict('NO — non c’è dubbio, si tratta del contrario')).toBe(false)
    })
})


/**
 * ⛔⛔ ECO-01 — due siti che ricopiano la stessa frase non si contraddicono.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20, prima contesa vera trovata dal giudice:
 * «Dice di sì» e «Dice di no» portavano il testo IDENTICO, parola per parola,
 * da due siti diversi. Il giudice aveva risposto «sì, contraddice» a una frase
 * uguale a quella che aveva appena approvato — perché nessuno gliel’aveva
 * risparmiata.
 */
describe('l’eco non è una contesa', () => {
    const FRASE = 'GGUF was developed by ggerganov who is also the developer of llama.cpp framework.'

    it('⛔ la stessa frase su un altro sito NON viene proposta come contraria', () => {
        const fonti = [
            fonte({ url: 'https://uno.example', text: FRASE }),
            fonte({ url: 'https://eco.example', text: FRASE }),
        ]
        // Senza il passaggio approvato la candidata c’è: è il difetto di prima.
        expect(talosResearchOpposingCandidate('GGUF was developed by ggerganov', 0, fonti)).not.toBeNull()
        // Con il passaggio approvato, sparisce — e non si paga il giudice.
        expect(talosResearchOpposingCandidate('GGUF was developed by ggerganov', 0, fonti, FRASE)).toBeNull()
    })

    it('e una frase che ricopia E AGGIUNGE resta un’eco', () => {
        const fonti = [
            fonte({ url: 'https://uno.example', text: FRASE }),
            fonte({ url: 'https://eco.example', text: FRASE }),
        ]
        const piuLungo = FRASE + ' Il formato nasce nel 2023 dentro il progetto.'
        expect(talosResearchOpposingCandidate('GGUF was developed by ggerganov', 0, fonti, piuLungo)).toBeNull()
    })

    it('⛔ e AL CONTRARIO: una frase che dice il contrario passa lo stesso', () => {
        // Se il filtro dell’eco togliesse anche i contrari veri, la contesa
        // tornerebbe a non poter esistere — che è il difetto da cui si parte.
        const fonti = [
            fonte({ url: 'https://uno.example', text: FRASE }),
            fonte({
                url: 'https://contro.example',
                text: 'The GGUF specification does not name ggerganov nor anyone else as maintainer.',
            }),
        ]
        const trovata = talosResearchOpposingCandidate('GGUF was developed by ggerganov maintainer', 0, fonti, FRASE)
        expect(trovata?.url).toBe('https://contro.example')
    })
})


/**
 * ⛔⛔ ECO-02 — l'eco nel VERSO OPPOSTO, quello che il primo filtro lasciava
 * passare.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20, seconda contesa vera: «Dice di sì» e
 * «Dice di no» affiancati, e il secondo CONTENEVA il primo più un paragrafo di
 * contorno. Il filtro guardava quanta parte della frase contraria fosse nel
 * passaggio a favore: il contorno abbassava il rapporto e l'eco entrava.
 *
 * ⛔ Il mio test di prima provava solo il verso comodo — passaggio approvato
 * lungo, frase corta — e per questo dava conforto senza mordere.
 */
describe('l’eco quando è la CONTRARIA a essere più lunga', () => {
    const CORTA = 'Sviluppato da Georgi Gerganov e dal team del progetto llama.cpp come evoluzione del precedente GGML.'
    const LUNGA = 'Sviluppato da Georgi Gerganov e dal team del progetto llama.cpp come evoluzione del precedente GGML, il GGUF racchiude in un unico file tutto il necessario per far funzionare un modello: pesi, metadati, dettagli di quantizzazione e tokenizer.'

    it('⛔ una frase che CONTIENE il passaggio approvato è un’eco, non un contrario', () => {
        const fonti = [
            fonte({ url: 'https://uno.example', text: CORTA }),
            fonte({ url: 'https://lunga.example', text: LUNGA }),
        ]
        expect(talosResearchOpposingCandidate('formato sviluppato Gerganov progetto llama', 0, fonti, CORTA)).toBeNull()
    })

    it('e nell’altro verso pure: il contorno può stare da una parte o dall’altra', () => {
        const fonti = [
            fonte({ url: 'https://uno.example', text: LUNGA }),
            fonte({ url: 'https://corta.example', text: CORTA }),
        ]
        expect(talosResearchOpposingCandidate('formato sviluppato Gerganov progetto llama', 0, fonti, LUNGA)).toBeNull()
    })

    it('⛔ e AL CONTRARIO: due frasi CORTE con due parole in comune non sono la stessa', () => {
        // Senza il pavimento, 2 su 2 farebbe 100% e scarterebbe un contrario
        // legittimo solo perché è breve.
        const fonti = [
            fonte({ url: 'https://uno.example', text: 'Il formato GGUF esiste.' }),
            fonte({ url: 'https://due.example', text: 'Nessun mantenitore formale del formato GGUF risulta dichiarato oggi.' }),
        ]
        const trovata = talosResearchOpposingCandidate('formato GGUF mantenitore dichiarato', 0, fonti, 'Il formato GGUF esiste.')
        expect(trovata?.url).toBe('https://due.example')
    })
})


/**
 * ⛔⛔ TABELLA-SROTOLATA-01 — quello che arrivava al giudice non era una frase.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20, terza contesa: come passaggio contrario è
 * arrivato l'infobox di una pagina, estratto senza spazi fra le celle. Il
 * giudice ha risposto «sì, contraddice» a un blocco che in realtà CONFERMAVA la
 * data: gli era stata data spazzatura, e ha risposto lo stesso.
 *
 * E finiva a metà parola — «distributing quantized large lang» — perché il
 * taglio cadeva al carattere esatto.
 */
describe('quello che si manda al giudice deve essere una frase', () => {
    const INFOBOX = 'GGML and is typically produced by converting models developed with a different library. [4]GGUFFilename extension.ggufMagic number0x47 0x46Developed byGeorgi Gerganov and communityInitial releaseAugust 22, 2023 formatMachine-learning tensors.'

    it('⛔ una tabella srotolata NON viene proposta come passaggio contrario', () => {
        const fonti = [
            fonte({ url: 'https://uno.example', text: 'GGUF ha sostituito GGML nel 2023.' }),
            fonte({ url: 'https://tabella.example', text: INFOBOX }),
        ]
        expect(talosResearchOpposingCandidate('GGUF sostituito formato GGML agosto 2023', 0, fonti, 'GGUF ha sostituito GGML nel 2023.')).toBeNull()
    })

    it('⛔ e AL CONTRARIO: una maiuscola dentro una parola non basta a scartare la prosa', () => {
        // Un nome proprio attaccato capita: «iPhone», «macOS». Tre volte in una
        // frase sola è una tabella, una volta è italiano.
        const fonti = [
            fonte({ url: 'https://uno.example', text: 'Il formato nasce nel 2023.' }),
            fonte({ url: 'https://prosa.example', text: 'Su iPhone il formato GGUF non è mai nato nel 2023 secondo questa fonte.' }),
        ]
        const trovata = talosResearchOpposingCandidate('formato GGUF nato 2023', 0, fonti, 'Il formato nasce nel 2023.')
        expect(trovata?.url).toBe('https://prosa.example')
    })

    it('⛔ e il taglio dei 400 caratteri cade su uno SPAZIO, non a metà parola', () => {
        const lungo = ('alfa beta gamma delta '.repeat(40)) + 'ultimissimaparolalunghissima'
        const fonti = [
            fonte({ url: 'https://uno.example', text: 'niente di simile qui' }),
            fonte({ url: 'https://lungo.example', text: lungo }),
        ]
        const trovata = talosResearchOpposingCandidate('alfa beta gamma', 0, fonti)
        expect(trovata).not.toBeNull()
        // La fetta sta nel testo così com'è, e dopo di lei c'è uno spazio o la
        // fine: cioè il taglio è caduto FRA due parole, non dentro una.
        const dove = lungo.indexOf(trovata!.passage)
        expect(dove).toBeGreaterThanOrEqual(0)
        const dopo = lungo[dove + trovata!.passage.length]
        expect(dopo === undefined || dopo === String.fromCharCode(32)).toBe(true)
    })
})
