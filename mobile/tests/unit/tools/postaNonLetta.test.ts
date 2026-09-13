/**
 * ⭐⭐ LA POSTA NON LETTA — e i TRE stati che non si appiattiscono in due.
 *
 * ## Da dove nasce
 *
 * Censimento contro Gemini del 2026-08-14: «quante email non lette ho» era una
 * delle due domande a cui **nessun attrezzo** rispondeva. Il numero arriva dal
 * content provider pubblico di Gmail sul telefono — non dall'API di Google, che
 * per `gmail.readonly` pretende uno scope ristretto (verifica, assessment CASA
 * fino al penetration test, revalidazione annuale) e, finché l'app resta in
 * «Testing», un refresh token che **scade ogni 7 giorni**.
 *
 * ## ⛔ Ciò che questo file difende
 *
 * **Il silenzio del provider non è una casella vuota.** «Zero non lette»,
 * «nessun account Google» e «Gmail non ha risposto» sono tre fatti diversi, e
 * schiacciarli in un `ok:false` unico farebbe dire «non hai posta» a chi ce
 * l'ha. È lo stesso difetto già misurato su questo progetto quando un elenco
 * vero viaggiava dentro un fallimento — e lì il modello si mise a inventare.
 *
 * **E il limite dichiarato al modello.** Da questa strada il testo di una email
 * non è raggiungibile: se la descrizione smettesse di dirlo, TALOS
 * prometterebbe di leggere una email e non potrebbe. La mossa successiva
 * (`device_notifications_list`, che porta mittente e oggetto di ciò che è
 * comparso sullo schermo) sta nella stessa riga, perché un limite senza ripiego
 * è un vicolo cieco.
 */
import { describe, expect, it, vi } from 'vitest'
import { createTalosDeviceTools } from '@/lib/tools/deviceTools'

type Posta = {
    letto: boolean
    motivo?: string
    caselle: Array<{ conto: string, nonLette: number }>
}

type Esito = { ok: boolean, content: string, code?: string }

function attrezzo(posta: Posta) {
    const tools = createTalosDeviceTools({
        postaNonLetta: vi.fn(async () => posta),
    } as never)
    const trovato = tools.find((t) => t.name === 'device_unread_mail')
    expect(trovato, 'l\'attrezzo della posta deve esistere').toBeDefined()
    return trovato!
}

async function chiedi(posta: Posta): Promise<Esito> {
    return await (attrezzo(posta).run as (input: unknown) => Promise<Esito>)({})
}

describe('la posta non letta, e i tre stati', () => {
    it('conta le caselle e dice il totale, con il conto quando è uno solo', async () => {
        const esito = await chiedi({ letto: true, caselle: [{ conto: 'persona@example.com', nonLette: 3 }] })
        expect(esito.ok).toBe(true)
        expect(esito.content).toContain('3 unread email')
        expect(esito.content).toContain('persona@example.com')
    })

    it('con due account li elenca tutti e due, e somma', async () => {
        const esito = await chiedi({
            letto: true,
            caselle: [
                { conto: 'casa@gmail.com', nonLette: 2 },
                { conto: 'lavoro@gmail.com', nonLette: 5 },
            ],
        })
        expect(esito.ok).toBe(true)
        // ⛔ Il totale, perché è la domanda; e i due conti, perché «7» su due
        // caselle diverse non dice dove guardare.
        expect(esito.content).toContain('7 unread emails')
        expect(esito.content).toContain('casa@gmail.com: 2')
        expect(esito.content).toContain('lavoro@gmail.com: 5')
    })

    it('⛔ LE SEZIONI si dicono, se la posta in arrivo è divisa', async () => {
        /*
         * MISURATO sul Pad il 2026-08-14: su questo account `^i` non esiste e la
         * posta in arrivo è divisa in quattro. Il totale è 27.953, di cui 21.951
         * di pubblicità — «hai 27.953 email non lette» è vero e inutile.
         */
        const esito = await chiedi({
            letto: true,
            caselle: [{
                conto: 'casa@gmail.com',
                nonLette: 27953,
                sezioni: [
                    { nome: 'Principale', nonLette: 3804 },
                    { nome: 'Promozioni', nonLette: 21951 },
                    { nome: 'Social', nonLette: 1783 },
                    { nome: 'Aggiornamenti', nonLette: 415 },
                ],
            }],
        })
        expect(esito.ok).toBe(true)
        expect(esito.content).toContain('27953 unread emails')
        expect(esito.content).toContain('Principale: 3804')
        expect(esito.content).toContain('Promozioni: 21951')
        // ⛔ E l'istruzione di dirle: il totale da solo nasconde la risposta.
        expect(esito.content).toContain('total AND the sections')
    })

    it('senza sezioni non si inventa una divisione', async () => {
        const esito = await chiedi({ letto: true, caselle: [{ conto: 'casa@gmail.com', nonLette: 4 }] })
        expect(esito.content).not.toContain('sections')
    })

    it('⛔ ZERO NON LETTE È UNA RISPOSTA, non un fallimento', async () => {
        const esito = await chiedi({ letto: true, caselle: [{ conto: 'casa@gmail.com', nonLette: 0 }] })
        expect(esito.ok).toBe(true)
        expect(esito.content).toContain('0 unread emails')
    })

    it('una sola email si dice al singolare', async () => {
        const esito = await chiedi({ letto: true, caselle: [{ conto: 'casa@gmail.com', nonLette: 1 }] })
        expect(esito.content).toContain('is 1 unread email in')
    })

    it('⛔ senza account Google NON dice che la posta è vuota, e offre la strada', async () => {
        const esito = await chiedi({ letto: false, motivo: 'nessun-account', caselle: [] })
        expect(esito.ok).toBe(false)
        expect(esito.content).toContain('no Google account')
        expect(esito.content).toContain('device_open_settings')
        expect(esito.content.toLowerCase()).not.toContain('inbox is empty')
        expect(esito.code).toBe('TALOS_POSTA_NESSUN_ACCOUNT')
    })

    it('⛔ se il provider tace lo VIETA a parole: «non si sa», non «non hai posta»', async () => {
        const esito = await chiedi({ letto: false, motivo: 'provider-muto', caselle: [] })
        expect(esito.ok).toBe(false)
        expect(esito.content).toContain('did not answer')
        // La riga che conta: il modello non deve tradurre un silenzio in uno zero.
        expect(esito.content).toContain('do NOT say the inbox is empty')
        expect(esito.code).toBe('TALOS_POSTA_PROVIDER_MUTO')
    })

    it('fuori da un telefono lo dice, invece di fingere una casella vuota', async () => {
        const esito = await chiedi({ letto: false, motivo: 'not-on-this-platform', caselle: [] })
        expect(esito.ok).toBe(false)
        expect(esito.content).toContain('not running on a phone')
    })

    it('⛔ la descrizione dichiara il limite E la mossa successiva', async () => {
        const descrizione = attrezzo({ letto: true, caselle: [] }).description
        // Senza questa riga il modello promette di leggere una email.
        expect(descrizione).toContain('NUMBERS ONLY')
        // E senza questa, il limite resta un vicolo cieco.
        expect(descrizione).toContain('device_notifications_list')
    })

    it('⛔ LEGGE, quindi chiede il permesso di leggere', async () => {
        // Il conteggio è roba della persona: chi ha chiuso «leggi» dev'essere
        // fermato anche qui, e non scoprire una via traversa.
        expect(attrezzo({ letto: true, caselle: [] }).action).toBe('read')
    })
})
