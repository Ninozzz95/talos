import { describe, expect, it } from 'vitest'
import {
    TALOS_PREFIX_FREE_SPACE_MARGIN,
    TALOS_PREFIX_MAX_BYTES,
    TALOS_PREFIX_MIN_TOKENS,
    talosPrefixCacheBytes,
    talosPrefixCacheFileName,
    talosPrefixFingerprint,
    talosPrefixesToEvict,
    talosShouldFreezePrefix,
    type TalosPrefixIdentity,
} from '@/lib/models/prefixCache'

/**
 * ⛔ L'impronta di un prefisso congelato è la parte pericolosa del lavoro.
 *
 * Uno stato caricato sul modello sbagliato **non dà errore**: dà risposte
 * sbagliate, e nessuno va a cercare la causa in un file di cache. Si accusa il
 * modello, o il prompt, o il caso.
 *
 * Quindi questi test non chiedono «l'impronta funziona». Chiedono, campo per
 * campo, che **cambiare quel campo cambi il nome del file** — perché il nome È
 * l'impronta, e un'impronta che non distingue è peggio di nessuna impronta: dà
 * la sicurezza senza darne la sostanza.
 */

const BASE: TalosPrefixIdentity = {
    modelPath: '/storage/emulated/0/Android/data/ai.talos/files/models/unsloth/Qwen3-1.7B-GGUF/main/Qwen3-1.7B-Q4_K_M.gguf',
    modelBytes: 1_107_409_472,
    modelModifiedAt: 1_786_000_000_000,
    contextTokens: 16_384,
    kvCacheType: 'f16',
    engineBuild: 'b10218',
    prefixText: 'You are TALOS.\n[38 tool schemas…]',
}

describe('l’impronta distingue OGNI campo che la invaliderebbe', () => {
    /**
     * Il ciclo è la prova. Un test per campo scritto a mano si dimentica il
     * giorno che il campo si aggiunge — ed è esattamente il modo in cui questa
     * difesa smetterebbe di difendere senza che nessuno se ne accorga.
     */
    const MUTAZIONI: ReadonlyArray<{ campo: string, muta: (id: TalosPrefixIdentity) => TalosPrefixIdentity }> = [
        { campo: 'modelPath', muta: (id) => ({ ...id, modelPath: id.modelPath + '.copia' }) },
        { campo: 'modelBytes', muta: (id) => ({ ...id, modelBytes: id.modelBytes + 1 }) },
        { campo: 'modelModifiedAt', muta: (id) => ({ ...id, modelModifiedAt: id.modelModifiedAt + 1 }) },
        { campo: 'contextTokens', muta: (id) => ({ ...id, contextTokens: id.contextTokens * 2 }) },
        { campo: 'kvCacheType', muta: (id) => ({ ...id, kvCacheType: 'q8_0' }) },
        { campo: 'engineBuild', muta: (id) => ({ ...id, engineBuild: 'b10219' }) },
        { campo: 'prefixText', muta: (id) => ({ ...id, prefixText: id.prefixText + ' ' }) },
    ]

    it('ogni singolo campo, cambiato, cambia il nome del file', () => {
        const base = talosPrefixCacheFileName(BASE)
        const uguali: string[] = []
        for (const { campo, muta } of MUTAZIONI) {
            if (talosPrefixCacheFileName(muta(BASE)) === base) uguali.push(campo)
        }
        expect(uguali, `campi che NON cambiano l’impronta: ${uguali.join(', ')}`).toEqual([])
    })

    it('e ogni campo dell’interfaccia è coperto da una mutazione', () => {
        // Se domani si aggiunge un campo e nessuno scrive la sua mutazione,
        // questo test diventa rosso il giorno stesso — invece di lasciare un
        // campo che non protegge niente.
        expect([...MUTAZIONI.map((m) => m.campo)].sort())
            .toEqual(Object.keys(BASE).sort())
    })

    it('due impronte uguali sono lo stesso file, sempre', () => {
        expect(talosPrefixCacheFileName({ ...BASE })).toBe(talosPrefixCacheFileName(BASE))
    })

    /**
     * ⛔ La collisione COSTRUITA da noi, non quella del caso.
     *
     * Concatenando i campi senza separatore, un modello che finisce per «a» con
     * contesto «1» e uno che finisce per «a1» con contesto vuoto darebbero la
     * stessa stringa. Non è un'ipotesi remota: è il difetto classico di ogni
     * chiave composta, e costa una riga evitarlo.
     */
    it('non confonde due identità che si concatenerebbero uguali', () => {
        // ⛔ I due campi devono essere ADIACENTI nell'ordine di composizione,
        // o la collisione non si costruisce e il test passa senza provare
        // niente. Prima scrivevo `modelPath` ed `engineBuild`, che sono
        // separati da quattro campi: la mutazione che toglieva il separatore
        // lasciava il test verde. Un test che non morde è peggio di uno
        // assente, perché occupa il posto della difesa senza esserlo.
        //
        // `modelPath` e `modelBytes` invece si toccano: senza separatore
        //   '/m/a' + '1234'  e  '/m/a1' + '234'  sono la stessa stringa.
        const uno = { ...BASE, modelPath: '/m/a', modelBytes: 1234 }
        const due = { ...BASE, modelPath: '/m/a1', modelBytes: 234 }
        expect(talosPrefixFingerprint(uno)).not.toBe(talosPrefixFingerprint(due))
    })

    it('il nome è un’impronta e un’estensione, niente che venga dall’utente', () => {
        // Un nome che contenesse il percorso del modello porterebbe dentro
        // caratteri che il filesystem non accetta, e la scrittura fallirebbe
        // per un motivo che nessuno collegherebbe alla cache.
        expect(talosPrefixCacheFileName(BASE)).toMatch(/^[0-9a-f]{16}\.prefix$/)
    })
})

/**
 * ⛔ Lo sfratto è la metà mancante del congelamento.
 *
 * Senza, usare TALOS riempie il telefono **in silenzio** — quasi un gigabyte
 * per ogni combinazione di modello, contesto, cache e interruttore del
 * ragionamento. È il difetto peggiore di tutti: nessun segnale finché non è
 * tardi, e chi lo subisce dà la colpa a qualcos'altro.
 */
describe('lo sfratto toglie il MENO UTILE, non il più vecchio', () => {
    const G = 900_000_000
    const voce = (path: string, giorno: number, bytes = G) => ({
        path, bytes, modifiedAt: Date.parse(`2026-08-${String(giorno).padStart(2, '0')}`),
    })

    it('sotto i due tetti non sfratta niente', () => {
        expect(talosPrefixesToEvict([voce('/a', 1), voce('/b', 2)])).toEqual([])
    })

    /**
     * Il cuore della cosa. Il file più ANTICO è quello usato oggi — il modello
     * di sempre — e quello nato ieri è una prova che nessuno riaprirà.
     * Sfrattare per età toglierebbe esattamente il file che serve.
     */
    it('tiene quello usato OGGI anche se è il più antico di data di nascita', () => {
        const usatoOggi = { path: '/preferito', bytes: G, modifiedAt: Date.parse('2026-08-08') }
        const provaDiIeri = { path: '/prova', bytes: G, modifiedAt: Date.parse('2026-08-07') }
        const sfrattati = talosPrefixesToEvict(
            [usatoOggi, provaDiIeri, voce('/c', 6), voce('/d', 5), voce('/e', 4)],
            4, Number.MAX_SAFE_INTEGER,
        )
        expect(sfrattati).toEqual(['/e'])
        expect(sfrattati).not.toContain('/preferito')
    })

    it('oltre il numero, sfratta i meno recenti — in ordine', () => {
        const sfrattati = talosPrefixesToEvict(
            [voce('/a', 1), voce('/b', 2), voce('/c', 3), voce('/d', 4), voce('/e', 5), voce('/f', 6)],
            2, Number.MAX_SAFE_INTEGER,
        )
        expect(sfrattati).toEqual(['/d', '/c', '/b', '/a'])
    })

    /**
     * Il tetto di spazio vede il caso che il numero non vede: un modello grande
     * i cui prefissi pesano tre gigabyte l'uno, dove perfino due file sono
     * troppi.
     */
    it('e sfratta per SPAZIO anche quando i file sono pochi', () => {
        const enorme = 3_000_000_000
        const sfrattati = talosPrefixesToEvict(
            [voce('/a', 3, enorme), voce('/b', 2, enorme), voce('/c', 1, enorme)],
            10, 4_000_000_000,
        )
        expect(sfrattati).toEqual(['/b', '/c'])
    })

    it('⛔ e toglie perfino il PRIMO se da solo sfonda il totale', () => {
        // Tenerlo sarebbe tenere il difetto: un file più grande di quanto sia
        // ammesso spendere non diventa accettabile per il fatto di essere solo.
        expect(talosPrefixesToEvict([voce('/gigante', 1, 9_000_000_000)], 10, 4_000_000_000))
            .toEqual(['/gigante'])
    })

    it('due esecuzioni identiche sfrattano gli STESSI file', () => {
        // Senza uno spareggio stabile, due file con la stessa data si
        // ordinerebbero a caso e lo sfratto sarebbe irriproducibile — cioè
        // impossibile da provare e da spiegare a chi ha perso una cache.
        const pari = [voce('/z', 5), voce('/a', 5), voce('/m', 5)]
        const primo = talosPrefixesToEvict(pari, 1, Number.MAX_SAFE_INTEGER)
        const secondo = talosPrefixesToEvict([...pari].reverse(), 1, Number.MAX_SAFE_INTEGER)
        expect(primo).toEqual(secondo)
    })

    it('un elenco vuoto non è un caso da trattare a parte', () => {
        expect(talosPrefixesToEvict([])).toEqual([])
    })
})

describe('quanto occupa, e quando NON vale la pena', () => {
    /**
     * MISURATO sul Pad: 15 token → 1.721.260 byte. Cioè ~114.750 byte per
     * token, che è `28 strati × 8 teste × 128 × 2 × 2` più l'intestazione.
     */
    it('il conto corrisponde alla misura sul dispositivo', () => {
        const perToken = 28 * 8 * 128 * 2 * 2
        expect(perToken).toBe(114_688)
        // A 8.410 token — il nostro prompt vero — è quasi un gigabyte.
        expect(talosPrefixCacheBytes(perToken, 8_410)).toBeGreaterThan(900_000_000)
    })

    it('un prefisso CORTO non si congela: costerebbe più scriverlo che rifarlo', () => {
        const v = talosShouldFreezePrefix({
            tokens: TALOS_PREFIX_MIN_TOKENS - 1, kvBytesPerToken: 114_688, freeBytes: 50e9,
        })
        expect(v.freeze).toBe(false)
        expect(v.reason).toBe('too-short')
    })

    it('e alla soglia esatta invece si congela', () => {
        expect(talosShouldFreezePrefix({
            tokens: TALOS_PREFIX_MIN_TOKENS, kvBytesPerToken: 114_688, freeBytes: 50e9,
        }).freeze).toBe(true)
    })

    /**
     * ⛔ Il margine non è prudenza generica: un disco pieno non rompe solo noi,
     * rompe il telefono di chi ci ha creduto. È la stessa regola per cui il
     * backup scrive a pezzi invece di tenere tutto in memoria.
     */
    it('non riempie il disco: DOPO la scrittura il margine dev’essere ancora intero', () => {
        const bytes = 114_688 * 8_410
        // Al confine esatto si scrive: dopo, resta il margine preciso — che è
        // ciò che il margine promette, non «il margine più qualcosa».
        const appena = talosShouldFreezePrefix({
            tokens: 8_410, kvBytesPerToken: 114_688,
            freeBytes: bytes + TALOS_PREFIX_FREE_SPACE_MARGIN,
        })
        expect(appena.freeze, 'al confine esatto si deve poter scrivere').toBe(true)
        // Un byte meno, e il margine verrebbe intaccato.
        const troppo = talosShouldFreezePrefix({
            tokens: 8_410, kvBytesPerToken: 114_688,
            freeBytes: bytes + TALOS_PREFIX_FREE_SPACE_MARGIN - 1,
        })
        expect(troppo.freeze).toBe(false)
        expect(troppo.reason).toBe('no-space')
    })

    it('e un file più grande del suo guadagno non si scrive nemmeno con spazio infinito', () => {
        const v = talosShouldFreezePrefix({
            tokens: Math.ceil(TALOS_PREFIX_MAX_BYTES / 114_688) + 1,
            kvBytesPerToken: 114_688,
            freeBytes: Number.MAX_SAFE_INTEGER,
        })
        expect(v.freeze).toBe(false)
        expect(v.reason).toBe('too-large')
    })

    it('il verdetto porta SEMPRE i byte, anche quando dice no', () => {
        // Chi legge il doctor deve poter vedere quanto sarebbe costato, non
        // solo che non si è fatto.
        for (const tokens of [10, 8_410, 100_000]) {
            expect(talosShouldFreezePrefix({
                tokens, kvBytesPerToken: 114_688, freeBytes: 3e9,
            }).bytes).toBe(114_688 * tokens)
        }
    })
})
