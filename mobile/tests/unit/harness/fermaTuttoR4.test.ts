import { describe, expect, it } from 'vitest'
import {
    agenteVivoR4, corpoStopR4, decidiStopR4, figlieAlLavoroR4, figlieFermateDallaRispostaR4, leggiPreferenzaStopR4, preferenzaDopoLaSceltaR4, pulsanteStopR4,
    statoConAgentiR4,
    scelteImpostazioneStopR4, testoFermaTuttoR4, voceFiglieFermateR4,
} from '@/lib/harness/r4/fermaTuttoR4'

/*
 * «Ferma tutto» (owner 29/10/2026; contratto `CONTRATTO-FERMA-TUTTE-2026-10-29.md` §3-§5). Prove del PEZZO VERO: spostato in
 * `tests/unit/harness/fermaTuttoR4.test.ts`, cambia solo l'import. Nomi FT-UI-xx (le FT-01..12 sono del server, `tests/ferma-tutte.test.mjs`).
 */

const radice = 'chat'
const albero = [
    { sessionId: 'chat', padreId: null, conclusa: false },
    { sessionId: 'a', padreId: 'chat', conclusa: false },
    { sessionId: 'b', padreId: 'chat', conclusa: false },
    { sessionId: 'a1', padreId: 'a', conclusa: false }, // nipote: conta
    { sessionId: 'c', padreId: 'chat', conclusa: true }, // già finita: non conta
    { sessionId: 'd', padreId: 'chat', conclusa: false, interrotta: true }, // fermata: non conta
    { sessionId: 'altra', padreId: 'un-altra-chat', conclusa: false }, // di un'altra chat: non conta
]

describe('FT-UI — chi è al lavoro', () => {
    it('FT-UI-01 tutto il sottoalbero lungo padreId, con le nipoti; non le finite, non le fermate, non quelle di altre chat', () => {
        expect(figlieAlLavoroR4(albero, radice)).toEqual(['a', 'b', 'a1'])
    })
    it('FT-UI-02 la voce dal vivo arrivata dopo vince sull’elenco (una figlia appena finita non conta più)', () => {
        expect(figlieAlLavoroR4([...albero, { sessionId: 'b', conclusa: true }], radice)).toEqual(['a', 'a1'])
    })
    it('FT-UI-03 un ciclo nei padri non fa girare, la radice non conta mai sé stessa; senza radice: nessuno', () => {
        const ciclo = [{ sessionId: 'x', padreId: 'y', conclusa: false }, { sessionId: 'y', padreId: 'x', conclusa: false }, { sessionId: 'chat', padreId: 'x', conclusa: false }]
        expect(figlieAlLavoroR4(ciclo, 'chat')).toEqual([])
        expect(figlieAlLavoroR4(albero, null)).toEqual([])
        expect(figlieAlLavoroR4([null, 3, 'x', { sessionId: 7 }] as unknown[], radice)).toEqual([])
    })
    it('FT-UI-04 «conclusa» assente non è «al lavoro» (un dato che non c’è non diventa un agente vivo)', () => {
        expect(figlieAlLavoroR4([{ sessionId: 'z', padreId: 'chat' }], radice)).toEqual([])
    })
})

describe('FT-UI — che cosa fa lo Stop', () => {
    it('FT-UI-05 niente foglio senza agenti al lavoro, né fuori da r4: immediato come oggi', () => {
        expect(decidiStopR4({ suR4: true, alLavoro: 0, preferenza: 'chiedi' })).toEqual({ tipo: 'immediato' })
        expect(decidiStopR4({ suR4: false, alLavoro: 3, preferenza: 'chiedi' })).toEqual({ tipo: 'immediato' })
        expect(decidiStopR4({ suR4: true, alLavoro: Number.NaN, preferenza: 'tutte' })).toEqual({ tipo: 'immediato' })
    })
    it('FT-UI-06 con agenti al lavoro e «chiedi»: il foglio, col numero giusto', () => {
        expect(decidiStopR4({ suR4: true, alLavoro: 3, preferenza: 'chiedi' })).toEqual({ tipo: 'chiedi', quante: 3 })
    })
    it('FT-UI-07 «Ricorda la scelta» salta il foglio la volta dopo', () => {
        const dopo = preferenzaDopoLaSceltaR4('chiedi', 'tutte', true)
        expect(dopo).toBe('tutte')
        expect(decidiStopR4({ suR4: true, alLavoro: 2, preferenza: dopo })).toEqual({ tipo: 'invia', scelta: 'tutte', quante: 2 })
        expect(decidiStopR4({ suR4: true, alLavoro: 2, preferenza: preferenzaDopoLaSceltaR4('chiedi', 'solo-chat', true) }))
            .toEqual({ tipo: 'invia', scelta: 'solo-chat', quante: 2 })
    })
    it('FT-UI-08 senza la casella la preferenza resta «chiedi»: il foglio torna', () => {
        expect(preferenzaDopoLaSceltaR4('chiedi', 'tutte', false)).toBe('chiedi')
    })
    it('FT-UI-09 il corpo della rotta: {} come oggi, «tutte» / «nessuna» con la scelta; il redirectId resta', () => {
        expect(corpoStopR4(null)).toEqual({})
        expect(corpoStopR4('tutte')).toEqual({ figlie: 'tutte' })
        expect(corpoStopR4('solo-chat')).toEqual({ figlie: 'nessuna' })
        expect(corpoStopR4('tutte', 'r1')).toEqual({ redirectId: 'r1', figlie: 'tutte' })
    })
    it('FT-UI-10 la preferenza dal disco: le tre valgono, il resto è «chiedi»', () => {
        expect(leggiPreferenzaStopR4('tutte')).toBe('tutte')
        expect(leggiPreferenzaStopR4('solo-chat')).toBe('solo-chat')
        for (const v of [undefined, null, '', 'TUTTE', 'nessuna', 1, {}]) expect(leggiPreferenzaStopR4(v)).toBe('chiedi')
    })
    it('FT-UI-11 la risposta: figlieFermate (anche dentro data); un numero storto è null, mai un numero finto', () => {
        expect(figlieFermateDallaRispostaR4({ stopped: true, figlieFermate: 3 })).toBe(3)
        expect(figlieFermateDallaRispostaR4({ data: { stopped: true, figlieFermate: 0 } })).toBe(0)
        expect(figlieFermateDallaRispostaR4({ stopped: true })).toBeNull()
        expect(figlieFermateDallaRispostaR4({ figlieFermate: -1 })).toBeNull()
        expect(figlieFermateDallaRispostaR4({ figlieFermate: '3' })).toBeNull()
    })
})

describe('FT-UI — la riga della chat dall’evento durevole', () => {
    const evento = (value: unknown) => ({ type: 'CUSTOM', name: 'talos.figlie-fermate', value })
    it('FT-UI-12 l’evento giusto dà la voce; «da» sconosciuto vale «persona»', () => {
        expect(voceFiglieFermateR4(evento({ quante: 3, ids: ['a', 'b', 'a1'], da: 'persona' }))).toEqual({ quante: 3, ids: ['a', 'b', 'a1'], da: 'persona', chatFerma: false })
        expect(voceFiglieFermateR4(evento({ quante: 2, ids: ['a', 'b'], da: 'modello' }))?.da).toBe('modello')
        expect(voceFiglieFermateR4(evento({ quante: 1, ids: ['a'], da: '???' }))?.da).toBe('persona')
    })
    it('FT-UI-13 nessuna riga per zero agenti, per un evento storto o di un altro nome', () => {
        expect(voceFiglieFermateR4(evento({ quante: 0, ids: [] }))).toBeNull()
        expect(voceFiglieFermateR4(evento({ quante: 1.5 }))).toBeNull()
        expect(voceFiglieFermateR4(evento(null))).toBeNull()
        expect(voceFiglieFermateR4({ type: 'CUSTOM', name: 'talos.plan', value: { quante: 3 } })).toBeNull()
        expect(voceFiglieFermateR4({ type: 'RunError', name: 'talos.figlie-fermate', value: { quante: 3 } })).toBeNull()
    })
})

describe('FT-UI — le parole approvate (IT e EN, singolare e plurale)', () => {
    it('FT-UI-14 titolo del foglio, aiuto, riga e «continuano» col numero giusto', () => {
        expect(testoFermaTuttoR4('foglio.titolo', 'it', 1)).toBe('1 agente sta ancora lavorando')
        expect(testoFermaTuttoR4('foglio.titolo', 'it', 3)).toBe('3 agenti stanno ancora lavorando')
        expect(testoFermaTuttoR4('foglio.titolo', 'en-US', 3)).toBe('3 agents are still working')
        expect(testoFermaTuttoR4('foglio.tuttoAiuto', 'it-IT', 1)).toBe('La chat e 1 agente')
        expect(testoFermaTuttoR4('foglio.tuttoAiuto', 'en', 4)).toBe('The chat and 4 agents')
        expect(testoFermaTuttoR4('riga.fermate', 'it', 1)).toBe('Fermato anche 1 agente')
        expect(testoFermaTuttoR4('riga.fermate', 'it', 3)).toBe('Fermati anche 3 agenti')
        expect(testoFermaTuttoR4('riga.fermate', 'en', 3)).toBe('Stopped 3 agents too')
        expect(testoFermaTuttoR4('riga.continuano', 'it', 1)).toBe('1 agente continua a lavorare')
        expect(testoFermaTuttoR4('riga.continuano', 'it', 3)).toBe('3 agenti continuano a lavorare')
        expect(testoFermaTuttoR4('foglio.ricorda', 'en', 3)).toBe('Remember my choice')
    })
    it('FT-UI-15 le Impostazioni: tre scelte, «Chiedi ogni volta» per prima', () => {
        expect(scelteImpostazioneStopR4('it').map((s) => s.etichetta)).toEqual(['Chiedi ogni volta', 'Ferma tutto', 'Ferma solo la chat'])
        expect(scelteImpostazioneStopR4('en').map((s) => s.valore)).toEqual(['chiedi', 'tutte', 'solo-chat'])
    })
})

describe('FT-UI — il numero del contratto (Desktop 29/10 sera: chi aspetta conta, chi è in pausa no)', () => {
    it('FT-UI-16 aspetta un permesso o una risposta: non è concluso, è vivo e conta; interrotto no', () => {
        const voci = [
            { sessionId: 'chiede', padreId: 'chat', conclusa: false, inAttesaApprovazione: true },
            { sessionId: 'domanda', padreId: 'chat', conclusa: false, inAttesaDomanda: true },
            { sessionId: 'interrotta', padreId: 'chat', conclusa: false, interrotta: true },
        ]
        expect(figlieAlLavoroR4(voci, 'chat')).toEqual(['chiede', 'domanda'])
        expect(agenteVivoR4({ conclusa: true })).toBe(false)
    })
    it('FT-UI-22 una delega in pausa chiude il suo giro (r4 la segna conclusa): non è viva e non conta', () => {
        const voci = [
            { sessionId: 'pausa', padreId: 'chat', conclusa: true, motivoChiusura: 'in-pausa', esitoDelega: 'in-pausa' },
            { sessionId: 'lavora', padreId: 'chat', conclusa: false },
        ]
        expect(figlieAlLavoroR4(voci, 'chat')).toEqual(['lavora'])
        expect(agenteVivoR4({ conclusa: true, esitoDelega: 'in-pausa' })).toBe(false)
    })
})

describe('FT-UI — «Stop anche a chat ferma» (owner 29/10 sera)', () => {
    it('FT-UI-17 il pulsante: chat al lavoro → lo Stop di oggi; chat ferma con agenti → «agenti»; senza agenti, col testo o fuori da r4 → Invio', () => {
        expect(pulsanteStopR4({ suR4: true, chatAlLavoro: true, alLavoro: 0 })).toEqual({ tipo: 'giro' })
        expect(pulsanteStopR4({ suR4: false, chatAlLavoro: true, alLavoro: 3 })).toEqual({ tipo: 'giro' })
        expect(pulsanteStopR4({ suR4: true, chatAlLavoro: false, alLavoro: 2 })).toEqual({ tipo: 'agenti', quante: 2 })
        expect(pulsanteStopR4({ suR4: true, chatAlLavoro: false, alLavoro: 0 })).toBeNull()
        expect(pulsanteStopR4({ suR4: true, chatAlLavoro: false, alLavoro: 2, conTesto: true })).toBeNull()
        expect(pulsanteStopR4({ suR4: false, chatAlLavoro: false, alLavoro: 2 })).toBeNull()
    })
    it('FT-UI-18 a chat ferma lo Stop ferma gli agenti e basta: niente foglio, la preferenza non conta, il corpo è «tutte»', () => {
        for (const preferenza of ['chiedi', 'tutte', 'solo-chat'] as const) {
            expect(decidiStopR4({ suR4: true, alLavoro: 2, preferenza, chatAlLavoro: false })).toEqual({ tipo: 'agenti', quante: 2 })
        }
        expect(decidiStopR4({ suR4: true, alLavoro: 0, preferenza: 'chiedi', chatAlLavoro: false })).toEqual({ tipo: 'niente' })
        expect(decidiStopR4({ suR4: false, alLavoro: 2, preferenza: 'chiedi', chatAlLavoro: false })).toEqual({ tipo: 'niente' })
        // senza `chatAlLavoro` (chi chiama come prima) vale «al lavoro»: il foglio
        expect(decidiStopR4({ suR4: true, alLavoro: 2, preferenza: 'chiedi' })).toEqual({ tipo: 'chiedi', quante: 2 })
        expect(corpoStopR4('tutte')).toEqual({ figlie: 'tutte' })
    })
    it('FT-UI-19 l\u2019elenco: «conclusa» con agenti vivi sta «in corso»; gli stati che chiedono qualcosa restano', () => {
        expect(statoConAgentiR4('concluse', 2)).toBe('in-corso')
        expect(statoConAgentiR4('concluse', 0)).toBe('concluse')
        expect(statoConAgentiR4('aspettano-te', 2)).toBe('aspettano-te')
        expect(statoConAgentiR4('interrotte', 2)).toBe('interrotte')
        expect(statoConAgentiR4('da-riprendere', 2)).toBe('da-riprendere')
    })
    it('FT-UI-20 le parole della chat ferma e dell’elenco (approvate col mockup del PC): «Ferma i N agenti», «N agenti al lavoro» (e i singolari)', () => {
        expect(testoFermaTuttoR4('stop.agenti', 'it', 2)).toBe('Ferma i 2 agenti')
        expect(testoFermaTuttoR4('stop.agenti', 'it', 1)).toBe("Ferma l'agente")
        expect(testoFermaTuttoR4('stop.agenti', 'en', 2)).toBe('Stop the 2 agents')
        expect(testoFermaTuttoR4('elenco.agenti', 'it', 2)).toBe('2 agenti al lavoro')
        expect(testoFermaTuttoR4('elenco.agenti', 'en', 1)).toBe('1 agent working')
    })
})

describe('FT-UI — «anche» solo se lo Stop ha fermato anche la chat (owner 29/10 sera)', () => {
    const evento = (value: unknown) => ({ type: 'CUSTOM', name: 'talos.figlie-fermate', value })
    it('FT-UI-21 a chat ferma «Fermati 2 agenti», con la chat «Fermati anche 2 agenti»; il modello senza «anche»', () => {
        expect(voceFiglieFermateR4(evento({ quante: 2, ids: ['a', 'b'], da: 'persona', chatFerma: true }))?.chatFerma).toBe(true)
        expect(voceFiglieFermateR4(evento({ quante: 2, ids: ['a', 'b'], da: 'persona' }))?.chatFerma).toBe(false)
        expect(voceFiglieFermateR4(evento({ quante: 2, ids: ['a', 'b'], da: 'modello' }))?.da).toBe('modello')
        expect(testoFermaTuttoR4('riga.fermateSenzaGiro', 'it', 2)).toBe('Fermati 2 agenti')
        expect(testoFermaTuttoR4('riga.fermateSenzaGiro', 'it', 1)).toBe('Fermato 1 agente')
        expect(testoFermaTuttoR4('riga.fermateSenzaGiro', 'en', 2)).toBe('Stopped 2 agents')
        expect(testoFermaTuttoR4('riga.fermateSenzaGiro', 'en', 1)).toBe('Stopped 1 agent')
        expect(testoFermaTuttoR4('stop.agenti', 'it', 1)).toBe("Ferma l'agente")
    })
})
