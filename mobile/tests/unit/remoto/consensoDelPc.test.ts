import { describe, expect, it, vi } from 'vitest'
import { creaPonteRemotoR4, type ClientePerIlPonte } from '@/lib/remoto/ponteRemotoR4'
import {
    PERCORSO_ATTENDI_CONSENSO, PERCORSO_CHIEDI_CONSENSO, attendiConsenso, chiediConsenso, consensoRichiesto, fraseDelConsenso, leggiAttesaConsenso,
} from '@/lib/remoto/consensoDelPc'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

/**
 * ⛔ D-MOCK-11 (dal vivo, 24/10/2026; contratto `CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-2026-10-23.md`, parte 1, punti 2-4): il
 * dispositivo non mandava mai `consent.request`. Qui le due operazioni del canale (`operazioni.mjs` `OPERAZIONI_CONSENSO`, r4
 * `feat/cartelle-dispositivi-r5-12`) viste dal ponte, e l'attesa lunga (`consent.wait`, 25 s per giro sul PC) fino all'esito.
 */
function clienteFinto(rispondi: (op: string, args: Record<string, unknown>) => unknown) {
    const chiamate: Array<{ op: string, args: Record<string, unknown> }> = []
    const cliente: ClientePerIlPonte = {
        richiesta: vi.fn(async (op, args) => {
            chiamate.push({ op, args })
            const r = rispondi(op, args)
            if (r instanceof Error) throw r
            return r
        }),
        iscrivi: vi.fn(async () => ({ sub: 's1', disiscrivi: async () => {} })),
        onChiuso: () => {},
    }
    return { cliente, chiamate }
}
const rifiutoDelPc = (code: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(code), { code }, extra)
const posta = (percorso: string, corpo?: unknown) => ({ metodo: 'POST' as const, percorso, ...(corpo === undefined ? {} : { corpo: JSON.stringify(corpo) }) })

describe('il consenso del PC visto dal dispositivo (D-MOCK-11)', () => {
    it('CONS-DISP-01 il ponte: le due operazioni del canale, gli id validati, gli stati dei codici nuovi', async () => {
        const f = clienteFinto((op, args) => {
            if (op === 'consent.request' && args.cartellaId === 'sparita') return rifiutoDelPc('FOLDER_NOT_LISTED', { reason: 'folder-not-listed' })
            if (op === 'consent.request' && args.cartellaId === 'troppe') return rifiutoDelPc('RATE_LIMITED')
            if (op === 'consent.request') return { stato: 'attesa-consenso', richiestaId: 'rq-12345678', scadeAlle: '2026-10-24T10:02:00.000Z', attesaMs: 120_000 }
            if (op === 'session.send') return rifiutoDelPc('CONSENT_REQUIRED', { reason: 'consent-required', params: { cartellaId: 'c-1', nome: 'talos' } })
            return { stato: 'attesa' }
        })
        const p = creaPonteRemotoR4(f.cliente)
        const chiedi = await p.richiesta(posta(PERCORSO_CHIEDI_CONSENSO, { cartellaId: 'c-1', altro: 'no' }))
        expect(chiedi.stato).toBe(200)
        expect(JSON.parse(chiedi.corpo).data).toMatchObject({ stato: 'attesa-consenso', richiestaId: 'rq-12345678' })
        await p.richiesta(posta(PERCORSO_ATTENDI_CONSENSO, { richiestaId: 'rq-12345678' }))
        expect(f.chiamate).toEqual([
            { op: 'consent.request', args: { cartellaId: 'c-1' } },
            { op: 'consent.wait', args: { richiestaId: 'rq-12345678' } },
        ])
        // un id storto o mancante non parte; il GET non è una voce
        for (const r of [posta(PERCORSO_CHIEDI_CONSENSO, { cartellaId: '../su' }), posta(PERCORSO_CHIEDI_CONSENSO), posta(PERCORSO_ATTENDI_CONSENSO, { richiestaId: '..' })]) {
            const esito = await p.richiesta(r)
            expect(esito.stato).toBe(400)
            expect(JSON.parse(esito.corpo).error.code).toBe('BAD_MESSAGE')
        }
        expect((await p.richiesta({ metodo: 'GET', percorso: PERCORSO_CHIEDI_CONSENSO })).stato).toBe(403)
        expect(f.chiamate).toHaveLength(2)
        // gli stati dei codici nuovi, anche quando il PC non li manda
        const sparita = await p.richiesta(posta(PERCORSO_CHIEDI_CONSENSO, { cartellaId: 'sparita' }))
        expect([sparita.stato, JSON.parse(sparita.corpo).error.code]).toEqual([404, 'FOLDER_NOT_LISTED'])
        const troppe = await p.richiesta(posta(PERCORSO_CHIEDI_CONSENSO, { cartellaId: 'troppe' }))
        expect([troppe.stato, JSON.parse(troppe.corpo).error.code]).toEqual([429, 'RATE_LIMITED'])
        const scrivi = await p.richiesta(posta('/api/v1/sessions/s1/resume', { messaggio: 'ciao' }))
        expect(scrivi.stato).toBe(403)
        expect(JSON.parse(scrivi.corpo).error).toMatchObject({ code: 'CONSENT_REQUIRED', params: { cartellaId: 'c-1', nome: 'talos' } })
    })

    it('CONS-DISP-02 l\'attesa: `{stato:"attesa"}` si ripete, poi consentita (col `sessionId`), negata o scaduta', async () => {
        const attesa = { richiestaId: 'rq-12345678', scadeAlle: 200_000 }
        // J1-bis (revisione del Desktop): finite le risposte scritte, il PC finto ne dà una SCONOSCIUTA. Un giro in più non resta nascosto
        // (prima un tetto di 10 giri lo copriva): cade su BAD_MESSAGE, e il numero delle chiamate si controlla
        const giri = (risposte: unknown[]) => {
            const f = clienteFinto(() => risposte.shift() ?? { inatteso: true })
            return { ponte: creaPonteRemotoR4(f.cliente), chiamate: f.chiamate }
        }
        const a = giri([{ stato: 'attesa' }, { stato: 'attesa' }, { esito: 'consentita', sessionId: 's-9' }])
        await expect(attendiConsenso(a.ponte, attesa, { ora: () => 1_000, pausa: async () => {} })).resolves.toEqual({ esito: 'consentita', sessionId: 's-9' })
        expect(a.chiamate.map((c) => c.op)).toEqual(['consent.wait', 'consent.wait', 'consent.wait'])
        await expect(attendiConsenso(giri([{ esito: 'negata' }]).ponte, attesa, { ora: () => 1_000 })).resolves.toEqual({ esito: 'negata' })
        await expect(attendiConsenso(giri([{ esito: 'scaduta' }]).ponte, attesa, { ora: () => 1_000 })).resolves.toEqual({ esito: 'scaduta' })
        // consentita senza sessione (una scrittura in una sessione che c'è già) e un `sessionId` storto
        await expect(attendiConsenso(giri([{ esito: 'consentita' }]).ponte, attesa, { ora: () => 1_000 })).resolves.toEqual({ esito: 'consentita', sessionId: null })
        await expect(attendiConsenso(giri([{ esito: 'consentita', sessionId: '../x' }]).ponte, attesa, { ora: () => 1_000 })).resolves.toEqual({ esito: 'consentita', sessionId: null })
    })

    it('CONS-DISP-02b la scadenza col MIO orologio, una caduta che si ritenta, la richiesta sparita, «Annulla»', async () => {
        const attesa = { richiestaId: 'rq-12345678', scadeAlle: 10_000 }
        // il PC dice sempre «attesa», l'orologio del dispositivo passa la scadenza: scaduta, mai un giro infinito
        let adesso = 0
        // J1-bis: ogni giro dura 6 s (lunga attesa vera, niente pausa); dal terzo il PC finto risponde una cosa sconosciuta, così un
        // giro oltre la scadenza si vede (BAD_MESSAGE) invece di restare nascosto
        const f = clienteFinto(() => { adesso += 6_000; return f.chiamate.length > 2 ? { inatteso: true } : { stato: 'attesa' } })
        await expect(attendiConsenso(creaPonteRemotoR4(f.cliente), attesa, { ora: () => adesso })).resolves.toEqual({ esito: 'scaduta' })
        expect(f.chiamate).toHaveLength(2)
        // il canale cade una volta: si richiama (il PC ridà lo stato di adesso)
        const cadute = [rifiutoDelPc('DISCONNECTED'), { esito: 'consentita', sessionId: 's-1' }]
        const g = clienteFinto(() => cadute.shift())
        const pausa = vi.fn(async () => {})
        await expect(attendiConsenso(creaPonteRemotoR4(g.cliente), attesa, { ora: () => 0, pausa })).resolves.toEqual({ esito: 'consentita', sessionId: 's-1' })
        expect(pausa).toHaveBeenCalledTimes(1)
        // il PC non ha più la richiesta (riavviato): come «non ha risposto»
        const h = clienteFinto(() => rifiutoDelPc('NOT_FOUND'))
        await expect(attendiConsenso(creaPonteRemotoR4(h.cliente), attesa, { ora: () => 0 })).resolves.toEqual({ esito: 'scaduta' })
        // «Annulla»: nessun giro in più
        const k = clienteFinto(() => ({ stato: 'attesa' }))
        let fermo = false
        const corsa = attendiConsenso(creaPonteRemotoR4(k.cliente), attesa, { ora: () => 0, fermato: () => fermo })
        fermo = true
        await expect(corsa).resolves.toEqual({ esito: 'annullata' })
        expect(k.chiamate.length).toBeLessThanOrEqual(1)
    })

    it('CONS-DISP-10 J1-bis: una risposta che non è un esito né «attesa» chiude l\'attesa con BAD_MESSAGE, dopo UNA sola chiamata', async () => {
        const f = clienteFinto(() => ({ boh: 1 }))
        // un secondo giro è già il difetto: la pausa che lo precederebbe cade subito, così non si gira per sempre
        const pausa = vi.fn(async () => { throw new Error('GIRO_A_VUOTO') })
        await expect(attendiConsenso(creaPonteRemotoR4(f.cliente), { richiestaId: 'rq-12345678', scadeAlle: 120_000 }, { ora: () => 0, pausa }))
            .rejects.toMatchObject({ code: 'BAD_MESSAGE', reason: 'consent-bad-answer' })
        expect(f.chiamate).toHaveLength(1)
        expect(pausa).not.toHaveBeenCalled()
        // la frase è del consenso, in inglese e in italiano; un BAD_MESSAGE di altri (il QR) resta fuori
        expect(fraseDelConsenso({ code: 'BAD_MESSAGE', reason: 'consent-bad-answer' })).toBe('computer.consent.badAnswer')
        expect(fraseDelConsenso({ code: 'BAD_MESSAGE' })).toBeNull()
        expect(TALOS_EN_MESSAGES.computer.consent.badAnswer).toBe('The PC gave an answer this device doesn’t understand. Try again.')
        expect(TALOS_IT_MESSAGES.computer.consent.badAnswer).toBe('Il PC ha dato una risposta che questo dispositivo non capisce. Riprova.')
    })

    it('CONS-DISP-11 J1-bis: un PC che non tiene la lunga attesa («attesa» subito) ⇒ ~1 s di pausa prima di ogni nuova chiamata', async () => {
        const ordine: string[] = []
        const risposte: unknown[] = [{ stato: 'attesa' }, { stato: 'attesa' }, { stato: 'attesa' }, { esito: 'consentita' }]
        const f = clienteFinto(() => { ordine.push('chiamata'); return risposte.shift() })
        const pausa = vi.fn(async (ms: number) => { ordine.push(`pausa ${ms}`) })
        await expect(attendiConsenso(creaPonteRemotoR4(f.cliente), { richiestaId: 'rq-12345678', scadeAlle: 120_000 }, { ora: () => 0, pausa }))
            .resolves.toEqual({ esito: 'consentita', sessionId: null })
        expect(ordine).toEqual(['chiamata', 'pausa 1000', 'chiamata', 'pausa 1000', 'chiamata', 'pausa 1000', 'chiamata'])
        // una lunga attesa vera (il giro dura 25 s) richiama subito: niente pausa
        let adesso = 0
        const lunghe: unknown[] = [{ stato: 'attesa' }, { esito: 'negata' }]
        const g = clienteFinto(() => { adesso += 25_000; return lunghe.shift() })
        const pausaLunga = vi.fn(async () => {})
        await expect(attendiConsenso(creaPonteRemotoR4(g.cliente), { richiestaId: 'rq-12345678', scadeAlle: 120_000 }, { ora: () => adesso, pausa: pausaLunga }))
            .resolves.toEqual({ esito: 'negata' })
        expect(pausaLunga).not.toHaveBeenCalled()
    })

    it('CONS-DISP-02cla risposta d\'attesa del PC e la richiesta: il conto alla rovescia parte dal mio orologio; un rifiuto risale col codice', async () => {
        expect(leggiAttesaConsenso({ stato: 'attesa-consenso', richiestaId: 'rq-12345678', scadeAlle: '2099-01-01T00:00:00Z', attesaMs: 120_000 }, 1_000))
            .toEqual({ richiestaId: 'rq-12345678', scadeAlle: 121_000 })
        expect(leggiAttesaConsenso({ stato: 'attesa-consenso', richiestaId: 'x', attesaMs: 1 }, 0)).toBeNull()
        expect(leggiAttesaConsenso({ sessionId: 's1' }, 0)).toBeNull()
        expect(leggiAttesaConsenso({ stato: 'attesa-consenso', richiestaId: 'rq-12345678', attesaMs: -5 }, 0)).toBeNull()

        const f = clienteFinto((_op, args) => (args.cartellaId === 'troppe' ? rifiutoDelPc('RATE_LIMITED')
            : { stato: 'attesa-consenso', richiestaId: 'rq-abcdefgh', scadeAlle: '2026-10-24T10:02:00.000Z', attesaMs: 60_000 }))
        const p = creaPonteRemotoR4(f.cliente)
        await expect(chiediConsenso(p, 'c-1', { ora: () => 5 })).resolves.toEqual({ richiestaId: 'rq-abcdefgh', scadeAlle: 60_005 })
        await expect(chiediConsenso(p, 'troppe', { ora: () => 5 })).rejects.toMatchObject({ code: 'RATE_LIMITED', reason: 'consent-rate-limited' })
    })

    it('CONS-DISP-06 le parole: `CONSENT_REQUIRED` porta la cartella; ogni esito ha la sua frase, in inglese e in italiano', () => {
        expect(consensoRichiesto({ code: 'CONSENT_REQUIRED', params: { cartellaId: 'c-1', nome: 'talos' } })).toEqual({ cartellaId: 'c-1', nome: 'talos' })
        expect(consensoRichiesto({ code: 'CONSENT_REQUIRED', params: { cartellaId: '../x' } })).toBeNull()
        expect(consensoRichiesto({ code: 'NOT_FOUND', params: { cartellaId: 'c-1' } })).toBeNull()
        // RATE_LIMITED è del consenso solo se viene da una richiesta di consenso (il PC lo usa anche per le iscrizioni)
        expect(fraseDelConsenso({ code: 'RATE_LIMITED' })).toBeNull()
        const chiavi = ['CONSENT_REQUIRED', 'CONSENT_DENIED', 'CONSENT_EXPIRED', 'FOLDER_NOT_LISTED'].map((code) => fraseDelConsenso({ code }))
            .concat(fraseDelConsenso({ code: 'RATE_LIMITED', reason: 'consent-rate-limited' }))
        const leggi = (catalogo: unknown, chiave: string) => chiave.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], catalogo)
        for (const chiave of chiavi) {
            expect(chiave).toMatch(/^computer\.consent\./u)
            expect(typeof leggi(TALOS_EN_MESSAGES, chiave!)).toBe('string')
            expect(typeof leggi(TALOS_IT_MESSAGES, chiave!)).toBe('string')
            expect(leggi(TALOS_IT_MESSAGES, chiave!)).not.toBe(leggi(TALOS_EN_MESSAGES, chiave!))
        }
        expect(leggi(TALOS_IT_MESSAGES, fraseDelConsenso({ code: 'RATE_LIMITED', reason: 'consent-rate-limited' })!))
            .toBe('Ci sono già 3 richieste in attesa sul PC: rispondi lì')
        expect(leggi(TALOS_EN_MESSAGES, fraseDelConsenso({ code: 'RATE_LIMITED', reason: 'consent-rate-limited' })!))
            .toBe('There are already 3 requests waiting on the PC: answer them there')
    })

    /*
     * Dal Pad, prova della CLI (27/10/2026): «Non ora» sulla carta del PC arriva come `negata` e il telefono diceva «Il PC ha detto di no».
     * Il Desktop: il PC non salva MAI un rifiuto dalla carta, `negata` vale solo per quella richiesta; l'unico no che dura è la cartella
     * BLOCCATA dopo una revoca (`FOLDER_BLOCKED`, 409), che ha la sua frase.
     */
    it('CONS-FRASI-02 «negata» dice «per ora» e invita a richiedere; FOLDER_BLOCKED ha la frase sua, nelle due lingue', () => {
        const leggi = (catalogo: unknown, chiave: string) => chiave.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], catalogo)
        expect(leggi(TALOS_EN_MESSAGES, fraseDelConsenso({ code: 'CONSENT_DENIED' })!)).toBe('The computer didn’t allow it, for now. You can ask again.')
        expect(leggi(TALOS_IT_MESSAGES, fraseDelConsenso({ code: 'CONSENT_DENIED' })!)).toBe('Il PC non l’ha consentita, per ora. Puoi chiederla di nuovo.')
        expect(fraseDelConsenso({ code: 'FOLDER_BLOCKED' })).toBe('computer.consent.folderBlocked')
        expect(leggi(TALOS_EN_MESSAGES, 'computer.consent.folderBlocked')).toBe('This folder is blocked on the computer: unblock it from the computer.')
        expect(leggi(TALOS_IT_MESSAGES, 'computer.consent.folderBlocked')).toBe('Questa cartella è bloccata sul PC: si sblocca dal PC.')
    })
})
