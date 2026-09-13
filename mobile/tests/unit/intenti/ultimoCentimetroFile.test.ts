import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⭐⭐⭐ L'ULTIMO CENTIMETRO DELL'ALLEGATO — la SORELLA, e nessuno la guardava.
 *
 * ## Come è saltata fuori
 *
 * Il 17 agosto ho curato la bugia dell'invio dei MESSAGGI. Chi tocca una
 * superficie la guarda tutta, e la sorella qui accanto aveva tre buchi:
 *
 * | buco | cosa succedeva |
 * |---|---|
 * | «inviato» su UNA prova sola | `sparito` bastava a dire «was SENT» |
 * | nessuna scheda | la verità dipendeva dalle parole del modello |
 * | «apri le impostazioni» al modello | apriva l'ACCESSO ALLE NOTIFICHE |
 *
 * ⛔ E i 13 test che c'erano non toccavano NIENTE di tutto questo: provavano
 * solo la scelta del file e dell'app. Cambiare la condizione di successo non ha
 * fatto diventare rosso niente — che è il modo in cui una suite verde non prova
 * niente.
 *
 * ## La prima, e la più grave
 *
 * Il 15 agosto l'owner aveva già detto, del messaggio: «"invio un messaggio a un
 * contatto" non significa che l'abbia inviato veramente». Il messaggio è passato
 * a TRE prove concordi; l'allegato era rimasto a `sparito`, e un pulsante può
 * sparire perché la schermata è cambiata per altro. Un file mandato per sbaglio
 * a una persona vera non si annulla più di un messaggio.
 */
const ponte = {
    chiamate: [] as Array<Record<string, unknown>>,
    esito: {} as Record<string, unknown>,
}

vi.mock('@/lib/device/ponteSchermo', () => ({
    TalosSchermoBridge: {
        premiPulsante: async (opzioni: Record<string, unknown>) => {
            ponte.chiamate.push(opzioni)
            return ponte.esito
        },
        chiEDavanti: async () => ({ pacchetto: 'com.whatsapp', sipuoSapere: true }),
        confermaDialogo: async () => ({ fatto: false }),
    },
}))

vi.mock('@/lib/device/devicePlugin', () => ({
    TalosDeviceBridge: {
        apriUri: async () => ({ done: true }),
        apriAzione: async () => ({ done: true }),
        chiAccetta: async () => ({
            app: [{ pacchetto: 'com.whatsapp', nome: 'WhatsApp', attivita: 'a' }],
        }),
        rigaDiContatto: async () => ({ uri: null, motivo: 'riga-assente' }),
        appInstallata: async () => ({ presente: true }),
        condividiFile: async () => ({ done: true }),
    },
}))

vi.mock('@/lib/intenti/rubrica', () => ({
    talosRisolviContatto: async () => ({
        stato: 'uno' as const,
        contatto: { nome: 'Antonino Rizzo', numeri: ['+39 333 111 2222'] },
    }),
}))

import { talosIntentiTools } from '@/lib/tools/intentiTools'

const NOTA = {
    id: 'f1', nome: 'nota-talos.txt', tipo: 'text/plain', percorso: 'talos-vault/files/f1.txt',
}

const strumento = talosIntentiTools({
    fileDellaLibreria: async () => [NOTA],
}).find((t) => t.name === 'invia_file')!

async function chiedi(input: Record<string, unknown>) {
    return await (strumento.run as (i: unknown, c: unknown) => Promise<{
        ok: boolean
        content: string
        senzaEffetto?: boolean
        scheda?: Record<string, unknown>
    }>)(input, {})
}

const MANDA = { file: 'nota-talos.txt', app: 'WhatsApp', contatto: 'Antonino Rizzo' }

beforeEach(() => {
    ponte.chiamate = []
    ponte.esito = { fatto: false, motivo: 'occhio-chiuso' }
})

describe('⭐⭐⭐ l\'allegato non dice «inviato» su una prova sola', () => {
    /*
     * ⛔⛔ IL TEST CHE MORDE DI PIÙ. Prima bastava `sparito` e questo passava
     * dicendo «was SENT»: il pulsante non c'è più, quindi è partito. Ma un
     * pulsante sparisce anche quando la schermata cambia per altro — ed è
     * esattamente il ragionamento che il 15 agosto era stato buttato per i
     * messaggi.
     */
    it('⛔⛔ «il pulsante e sparito» da SOLO non e «inviato»', async () => {
        ponte.esito = { fatto: true, sparito: true, obiettivo: 'NON_CONFERMATO', prove: 1 }
        const esito = await chiedi(MANDA)
        expect(esito.content).not.toMatch(/was SENT/)
        expect(esito.content).toMatch(/of 3 checks confirm/i)
    })

    it('«inviato» si dice SOLO con le tre prove concordi', async () => {
        ponte.esito = { fatto: true, sparito: true, obiettivo: 'PARTITO', prove: 3 }
        const esito = await chiedi(MANDA)
        expect(esito.content).toMatch(/was SENT/)
        expect(esito.scheda).toMatchObject({ tipo: 'invio', partito: true })
    })

    /*
     * ⛔ E nel dubbio NIENTE scheda: una scheda che dicesse «forse»
     * insegnerebbe a non fidarsi anche delle altre. Lì parla solo la frase.
     */
    it('⛔ nel DUBBIO nessuna scheda, e nessun retry', async () => {
        ponte.esito = { fatto: true, sparito: false, obiettivo: 'NON_CONFERMATO', prove: 1 }
        const esito = await chiedi(MANDA)
        expect(esito.scheda).toBeUndefined()
        expect(esito.content).toMatch(/do NOT press again/i)
        // ⛔ E il preambolo RESTA: il file potrebbe essere partito davvero.
        expect(esito.senzaEffetto).toBeUndefined()
    })

    it('⛔ «premuto ma l\'allegato e ancora li» e NON partito, e riprovare e sicuro', async () => {
        ponte.esito = { fatto: true, obiettivo: 'NON_PARTITO', prove: 1 }
        const esito = await chiedi(MANDA)
        expect(esito.content).toMatch(/^NOT sent/)
        expect(esito.content).toMatch(/safe/i)
        expect(esito.scheda).toMatchObject({ tipo: 'invio', partito: false })
        expect(esito.senzaEffetto).toBe(true)
    })
})

describe('⭐⭐⭐ e la scheda c\'e anche per l\'allegato', () => {
    it.each([
        ['occhio-chiuso', 'occhio'],
        ['app-non-in-primo-piano', 'altra-app'],
        ['non-trovato', 'pulsante'],
        ['ponte-chiuso', 'ponte'],
    ])('⛔ «%s» disegna la scheda col motivo «%s»', async (motivo, atteso) => {
        ponte.esito = { fatto: false, motivo }
        const esito = await chiedi(MANDA)
        expect(esito.scheda).toMatchObject({ tipo: 'invio', partito: false, perche: atteso })
    })

    /*
     * ⛔ Un motivo NUOVO è proprio quello per cui nessuno ha scritto la regola:
     * «non inviato» resta vero comunque, ed è la sola cosa che decide cosa fa
     * la persona dopo. Il `perche` invece sparisce, perché non lo sappiamo.
     */
    it('⛔ e un motivo MAI VISTO ha la scheda lo stesso, senza motivo', async () => {
        ponte.esito = { fatto: false, motivo: 'un-motivo-mai-visto' }
        const esito = await chiedi(MANDA)
        expect(esito.scheda).toMatchObject({ tipo: 'invio', partito: false })
        expect((esito.scheda as { perche?: string }).perche).toBeUndefined()
    })

    it.each([
        ['occhio-chiuso'],
        ['app-non-in-primo-piano'],
        ['un-motivo-mai-visto'],
    ])('⛔ «%s» dichiara senzaEffetto: il preambolo falso sparisce', async (motivo) => {
        ponte.esito = { fatto: false, motivo }
        const esito = await chiedi(MANDA)
        expect(esito.senzaEffetto).toBe(true)
    })
})

describe('⭐⭐⭐ e non manda il modello ad aprire la schermata sbagliata', () => {
    /*
     * ⛔⛔ Questa riga diceva «Offer to open its settings page with
     * device_open_settings». MISURATO sul Pad il 2026-08-17 sul percorso
     * gemello: con quella frase il modello ha aperto l'ACCESSO ALLE NOTIFICHE e
     * ha detto alla persona di abilitare «il permesso di lettura notifiche (o
     * dello schermo, a seconda della versione)» — pagina sbagliata, ipotesi
     * travestita da istruzione, e un invito a concedere un permesso che legge
     * TUTTE le notifiche.
     */
    it('⛔⛔ NON dice piu «device_open_settings»', async () => {
        ponte.esito = { fatto: false, motivo: 'occhio-chiuso' }
        const esito = await chiedi(MANDA)
        expect(esito.content).not.toMatch(/device_open_settings/)
        expect(esito.content).toMatch(/do NOT open any settings screen yourself/i)
        expect(esito.content).toMatch(/card below/i)
    })

    /*
     * ⛔ Il divieto c'è su OGNI ramo non partito, compreso quello che non
     * sappiamo nominare: il modello ha aperto con «inviato ✓» smentendosi nella
     * riga dopo, e non c'è ragione per cui l'allegato ne sia immune.
     */
    /*
     * ⛔⛔ MISURATO sul Pad il 2026-08-17, proprio su QUESTO percorso: la riga
     * diceva «the screen-reading permission is off» e il modello ha scritto
     * «abilita il permesso di ACCESSO ALLE NOTIFICHE per TALOS». Dire qual è
     * quello giusto non basta: la frase vietata si NOMINA.
     */
    it('⛔⛔ nomina il permesso SBAGLIATO per vietarlo', async () => {
        ponte.esito = { fatto: false, motivo: 'occhio-chiuso' }
        const esito = await chiedi(MANDA)
        expect(esito.content).toMatch(/NOT notification access/i)
        expect(esito.content).toMatch(/depending on the version/i)
    })

    it.each([
        ['occhio-chiuso'],
        ['app-non-in-primo-piano'],
        ['un-motivo-mai-visto'],
    ])('⛔ «%s» porta il divieto di aprire con «inviato»', async (motivo) => {
        ponte.esito = { fatto: false, motivo }
        const esito = await chiedi(MANDA)
        expect(esito.content).toMatch(/Do NOT open with "sent"/i)
    })
})


/**
 * ⭐⭐⭐ CIECO NON È VUOTO — e la differenza l'ha detta il Pad.
 *
 * MISURATO il 2026-08-17: con `nota-talos.txt` presente in DUE copie, TALOS ha
 * risposto «il file nota-talos.txt che menzioni **non è presente nella mia
 * Library**». Una frase su un fatto che non aveva verificato, detta con la
 * sicurezza di chi ha guardato.
 *
 * A monte c'era un `catch { return [] }` con scritto accanto che il tool
 * avrebbe detto «non c'è nessun file», «che è vero da dove sta lui». Non era
 * vero: `[]` significava DUE cose, e qui diventavano la stessa.
 */
describe('⭐⭐⭐ «non ho potuto guardare» NON è «non c e»', () => {
    function conLibreria(libreria: () => Promise<unknown>) {
        return talosIntentiTools({ fileDellaLibreria: libreria as never })
            .find((t) => t.name === 'invia_file')!
    }
    const chiedi2 = async (s: { run: unknown }) => await (s.run as (i: unknown, c: unknown) => Promise<{
        ok: boolean, content: string, code?: string
    }>)(MANDA, {})

    it('⛔⛔ se la Libreria non si legge NON dice che il file manca', async () => {
        const esito = await chiedi2(conLibreria(async () => { throw new Error('TALOS_LIBRARY_DISABLED') }))
        expect(esito.code).toBe('TALOS_FILE_LIBRERIA_ILLEGGIBILE')
        expect(esito.content).toMatch(/could NOT read the Library/i)
        expect(esito.content).toMatch(/Do NOT say the file is missing/i)
    })

    /*
     * ⛔ AL CONTRARIO, ed è il caso che tiene onesto il primo: una Libreria
     * DAVVERO vuota si racconta come vuota. Confondere i due versi vorrebbe
     * dire scambiare una bugia con l'altra.
     */
    it('⛔ ma una Libreria DAVVERO vuota si dice vuota', async () => {
        const esito = await chiedi2(conLibreria(async () => []))
        expect(esito.code).not.toBe('TALOS_FILE_LIBRERIA_ILLEGGIBILE')
        expect(esito.content).toMatch(/Library is empty/i)
    })

    it('⛔ e con i file dentro si va avanti come sempre', async () => {
        const esito = await chiedi2(conLibreria(async () => [NOTA]))
        expect(esito.code).toBeUndefined()
        expect(esito.content).not.toMatch(/could NOT read/i)
    })
})
