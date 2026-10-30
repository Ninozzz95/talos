import { describe, expect, it, vi } from 'vitest'
import { decidiLinguaDelTesto, identificaLinguaDelTesto, testoDaRiconoscere } from '@/services/linguaDelTesto'

/**
 * LTESTO-01..04 — la lingua di un testo SCRITTO (owner 28/10/2026, lingua delle risposte). Sul Pad, senza la nota, gemma in una chat
 * lunga in italiano ha risposto in italiano a una domanda in persiano, e granite in inglese a una in italiano: la nota che NOMINA la
 * lingua serve anche per ciò che si scrive. Il riconoscitore è quello di Android (`TalosLinguaPlugin`, `TextClassifier.detectLanguage`).
 * Il servizio decide soglia e tempi: sotto 0,5 di confidenza, testi troppo corti, errori o lentezza ⇒ niente lingua (vale la riga).
 */
describe('LTESTO la lingua di un testo scritto', () => {
    const plugin = (risposta: unknown, ritardo = 0) => ({
        identifica: vi.fn(() => new Promise((ok) => setTimeout(() => ok(risposta), ritardo))),
    })

    it('LTESTO-01 rende il codice quando Android è sicuro', async () => {
        const p = plugin({ lingua: 'ja', confidenza: 0.97 })
        expect(await identificaLinguaDelTesto('このファイルを読んでください', { plugin: p, nativo: true })).toBe('ja')
        expect(p.identifica).toHaveBeenCalledWith({ testo: 'このファイルを読んでください' })
    })

    it('LTESTO-02 sotto la soglia, un codice storto o «und»: niente', async () => {
        for (const r of [{ lingua: 'it', confidenza: 0.31 }, { lingua: 'und', confidenza: 0.9 }, { lingua: 'zz-nonsense', confidenza: 0.9 }, { lingua: null }]) {
            expect(await identificaLinguaDelTesto('Ciao! Qual è la capitale della Francia?', { plugin: plugin(r), nativo: true }), JSON.stringify(r)).toBeNull()
        }
    })

    it('LTESTO-03 testo troppo corto, fuori dal telefono o senza plugin: non si chiede niente', async () => {
        const p = plugin({ lingua: 'it', confidenza: 0.99 })
        expect(await identificaLinguaDelTesto('ok', { plugin: p, nativo: true })).toBeNull()
        expect(await identificaLinguaDelTesto('Una frase abbastanza lunga', { plugin: p, nativo: false })).toBeNull()
        expect(p.identifica).not.toHaveBeenCalled()
    })

    it('LTESTO-04 un errore o un riconoscitore lento non fermano l\'invio: niente lingua entro il tetto', async () => {
        const rotto = { identifica: vi.fn(() => Promise.reject(new Error('NO_CLASSIFIER'))) }
        expect(await identificaLinguaDelTesto('Una frase abbastanza lunga', { plugin: rotto, nativo: true })).toBeNull()
        const lento = plugin({ lingua: 'it', confidenza: 0.99 }, 5_000)
        const inizio = Date.now()
        expect(await identificaLinguaDelTesto('Una frase abbastanza lunga', { plugin: lento, nativo: true, tettoMs: 50 })).toBeNull()
        expect(Date.now() - inizio).toBeLessThan(1_000)
    })
})

/**
 * LTESTO-PULIZIA e LTESTO-L1 — la cura del Desktop portata IDENTICA (regola delle tre app, 28/10/2026): `6e404535f` (il codice, gli
 * indirizzi e le righe di stack non decidono; almeno 6 lettere; persiano e cirillico dalle loro lettere) e `6f2fb48a6`, RIV14B-L1 (un passo
 * CITATO non è la voce di chi scrive; una cornice prima dei primi due punti, abbastanza lunga e in un'altra lingua, vuol dire testo
 * incollato ⇒ nessuna nota). Misurate sul Pad col TextClassifier vero, 114 frasi: sbagliate da 16 a 6, nessuna giusta persa
 * (`.claude/ragionamento/corpus-lingua-2026-10-28/misura-l1.txt`).
 */
describe('LTESTO la pulizia e la cornice, come il desktop', () => {
    // un TextClassifier finto, che decide dal contenuto come quello vero sui casi misurati
    const classificatore = () => ({
        identifica: vi.fn(async ({ testo }: { testo: string }) => {
            if (/\b(?:the|is|not|to|you|type|failed|error|unable|everything)\b/iu.test(testo)) return { lingua: 'en', confidenza: 0.95 }
            if (/\p{Script=Cyrillic}/u.test(testo)) return { lingua: 'ru', confidenza: 0.9 }
            return { lingua: 'it', confidenza: 0.9 }
        }),
    })
    const testiChiesti = (p: ReturnType<typeof classificatore>) => p.identifica.mock.calls.map(([a]) => a.testo)

    it('LTESTO-PULIZIA-01 il blocco di codice, il codice in linea e gli indirizzi non arrivano ad Android', async () => {
        const p = classificatore()
        const frase = 'perché questo non va?\n```js\nconst x = foo()\n```\nguarda `npm run build` e https://example.com/the/error'
        expect(await identificaLinguaDelTesto(frase, { plugin: p, nativo: true })).toBe('it')
        // i due punti dell'indirizzo non aprono una cornice (desktop af8ac4173): una chiamata sola
        expect(testiChiesti(p)).toEqual(['perché questo non va? guarda e'])
    })

    it('LTESTO-PULIZIA-02 meno di 6 lettere dopo la pulizia: niente, senza chiedere', async () => {
        const p = classificatore()
        expect(await identificaLinguaDelTesto('fai `npm test` ok', { plugin: p, nativo: true })).toBeNull()
        expect(p.identifica).not.toHaveBeenCalled()
    })

    it('LTESTO-PULIZIA-03 persiano e cirillico si riconoscono dalle loro lettere, senza chiedere', async () => {
        const p = classificatore()
        expect(await identificaLinguaDelTesto('سلام! پایتخت ایتالیا کجاست؟', { plugin: p, nativo: true })).toBe('fa')
        expect(await identificaLinguaDelTesto('Добрый день, вы меня слышите?', { plugin: p, nativo: true })).toBe('ru')
        expect(p.identifica).not.toHaveBeenCalled()
        expect(decidiLinguaDelTesto('Добрий день, як справи сьогодні?', null)).toBe('uk')
    })

    it('LTESTO-PULIZIA-04 righe di stack, percorsi, MAIUSCOLO da errore e camelCase sono tolti', () => {
        expect(testoDaRiconoscere('perché si rompe?\n    at Object.<anonymous> (src/app.js:3:1)\nnpm ERR! code ERESOLVE in getUserName'))
            .toBe('perché si rompe? npm code in')
    })

    it('LTESTO-L1-01 un errore inglese incollato dopo una cornice italiana: nessuna nota', async () => {
        const p = classificatore()
        expect(await identificaLinguaDelTesto("il build dice: Type 'string' is not assignable to type 'number' in the return statement", { plugin: p, nativo: true })).toBeNull()
        expect(testiChiesti(p)).toHaveLength(2)
        expect(testiChiesti(p)[1]).toBe('il build dice')
    })

    it('LTESTO-L1-02 un passo citato non arriva ad Android e non decide la lingua (le tre forme di virgolette)', async () => {
        for (const frase of ['spiegami «Everything you need to know about the release schedule» per favore',
            'cosa significa "The quick brown fox jumps over the lazy dog" in pratica?',
            'che vuol dire “The server could not process your request” esattamente?']) {
            const p = classificatore()
            expect(await identificaLinguaDelTesto(frase, { plugin: p, nativo: true }), frase).toBe('it')
            expect(testiChiesti(p).join(' '), frase).not.toMatch(/Everything|quick|server/u)
        }
    })

    it('LTESTO-L1-03 una cornice troppo corta («ok:») non decide niente: una chiamata sola', async () => {
        const p = classificatore()
        expect(await identificaLinguaDelTesto('ok: leggi il file src/app.js e dimmi perché il test fallisce sempre', { plugin: p, nativo: true })).toBe('it')
        expect(p.identifica).toHaveBeenCalledTimes(1)
    })

    it('LTESTO-L1-04 cornice e testo nella stessa lingua: la nota resta', async () => {
        const p = classificatore()
        expect(await identificaLinguaDelTesto('nota bene: questo va fatto domani mattina presto', { plugin: p, nativo: true })).toBe('it')
    })

    /*
     * LTESTO-L1-05 — RIV14B-L1d del desktop (`af8ac4173`, dalla segnalazione del Mobile, 28/10): i due punti di un indirizzo, di un
     * percorso o di un orario, o quelli dentro il codice, non chiudono una cornice. Contano solo quelli fuori da codice e indirizzi,
     * seguiti da uno spazio o dalla fine. Stessi casi del desktop. Qui il finto TextClassifier decide dalla QUOTA di parole inglesi,
     * così «check this out https» è inglese come per quello vero.
     */
    it('LTESTO-L1-05 i due punti di indirizzi, percorsi, orari e codice non sono una cornice; quelli veri sì', async () => {
        const INGLESI = new Set(['check', 'this', 'out', 'see', 'please', 'open', 'meeting', 'at', 'run', 'the', 'server', 'failed', 'to', 'load',
            'resource', 'responded', 'with', 'a', 'status', 'of', 'not', 'found', 'is', 'you', 'https'])
        const aQuota = () => ({
            identifica: vi.fn(async ({ testo }: { testo: string }) => {
                const parole = testo.toLowerCase().match(/\p{L}+/gu) ?? []
                const inglesi = parole.filter((p) => INGLESI.has(p)).length
                return inglesi * 2 >= parole.length ? { lingua: 'en', confidenza: 0.9 } : { lingua: 'it', confidenza: 0.9 }
            }),
        })
        for (const frase of ['check this out https://github.com/thesysdev/openui e dimmi se secondo te vale la pena usarlo nel nostro progetto',
            'see https://example.com/docs/guida e spiegami come funziona la configurazione del server passo per passo',
            'domani alle 12:30 ho una riunione, preparami una scaletta con i punti principali da discutere col cliente',
            String.raw`please open C:\Users\nino\progetto e controlla perché la compilazione fallisce sempre al secondo passo`,
            'meeting at 12:30 domani, preparami una scaletta con i punti principali da discutere col cliente nuovo',
            'check `port: 8080` nel file di configurazione e spiegami perché il server parte sempre sulla porta sbagliata',
            'run this ```\nconst x = { a: 1 }\n``` e spiegami perché il risultato è sempre diverso da quello che mi aspetto']) {
            expect(await identificaLinguaDelTesto(frase, { plugin: aQuota(), nativo: true }), frase.slice(0, 40)).toBe('it')
        }
        // al contrario: la cornice vera resta, anche con un indirizzo DOPO i suoi due punti
        expect(await identificaLinguaDelTesto('il server risponde: Failed to load resource https://example.com/api the server responded with a status of 404 not found',
            { plugin: aQuota(), nativo: true })).toBeNull()
    })
})
