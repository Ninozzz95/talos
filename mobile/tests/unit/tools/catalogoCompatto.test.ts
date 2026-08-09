import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
    TALOS_DETTAGLI_STRUMENTO,
    talosDimenticaSvelati,
    talosIndiceCompatto,
    talosStrumentoDettagli,
    talosSvelatiIn,
} from '@/lib/tools/catalogoCompatto'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'

const torcia = defineTalosTool<{ on: boolean }>({
    name: 'device_torch',
    title: 'Torch',
    description: 'Turn the phone torch on or off. Works with no permission at all, '
        + 'and reports what the camera service did.',
    action: 'write',
    input: z.object({ on: z.boolean() }),
    run: async () => ({ ok: true, content: '' }),
}) as TalosToolDefinition<never>

const notifiche = defineTalosTool<Record<string, never>>({
    name: 'notification_list',
    title: 'Notifications',
    description: 'List the notifications currently on the phone.',
    action: 'read',
    input: z.object({}),
    run: async () => ({ ok: true, content: '' }),
}) as TalosToolDefinition<never>

const TUTTI = [torcia, notifiche]
const schemaDi = (tool: TalosToolDefinition<never>) => ({ name: tool.name, parameters: {} })

describe('l indice compatto', () => {
    it('nomina OGNI strumento — la parità non si tocca', () => {
        // ⛔ È il vincolo dell'owner: parità vuol dire che il modello PUÒ
        // chiamare tutto, non che deve avere ogni schema sotto gli occhi.
        const indice = talosIndiceCompatto(TUTTI)
        for (const tool of TUTTI) expect(indice).toContain(tool.name)
    })

    it('prende la PRIMA FRASE, non un riassunto nostro', () => {
        // Riscrivere la descrizione qui creerebbe due verità sullo stesso
        // strumento, che un giorno divergono.
        const indice = talosIndiceCompatto(TUTTI)
        expect(indice).toContain('Turn the phone torch on or off.')
        expect(indice).not.toContain('Works with no permission')
    })

    it('una riga per strumento, e nessuna vuota', () => {
        const righe = talosIndiceCompatto(TUTTI).split('\n')
        expect(righe).toHaveLength(TUTTI.length)
        expect(righe.every((riga) => riga.trim().length > 0)).toBe(true)
    })
})

describe('lo strumento che svela gli schemi', () => {
    it('consegna lo schema E rende chiamabile lo strumento', async () => {
        const svelati: string[] = []
        const dettagli = talosStrumentoDettagli(TUTTI, schemaDi, (n) => svelati.push(...n))
        const esito = await dettagli.run({ names: ['device_torch'] }, {} as never)

        expect(esito.ok).toBe(true)
        expect(esito.content).toContain('device_torch')
        // ⛔ L'esito che conta non è il testo: è che da adesso quel tool si
        // possa chiamare. Senza questa riga il modello riceve la forma e poi
        // sente dirsi che il tool non esiste.
        expect(svelati).toEqual(['device_torch'])
    })

    it('ne svela più di uno in un colpo solo', async () => {
        const svelati: string[] = []
        const dettagli = talosStrumentoDettagli(TUTTI, schemaDi, (n) => svelati.push(...n))
        await dettagli.run({ names: ['device_torch', 'notification_list'] }, {} as never)
        expect(svelati).toEqual(['device_torch', 'notification_list'])
    })

    it('⛔ un nome sbagliato NON butta via il giro', async () => {
        // È il caso più probabile con un modello piccolo: si dice quale non
        // esiste e si consegna comunque quello buono.
        const svelati: string[] = []
        const dettagli = talosStrumentoDettagli(TUTTI, schemaDi, (n) => svelati.push(...n))
        const esito = await dettagli.run({ names: ['torcia', 'device_torch'] }, {} as never)

        expect(esito.ok).toBe(true)
        expect(svelati).toEqual(['device_torch'])
        expect(esito.content).toContain('torcia')
    })

    it('⛔ tutti sbagliati: fallisce, e NON svela niente', async () => {
        const svelati: string[] = []
        const dettagli = talosStrumentoDettagli(TUTTI, schemaDi, (n) => svelati.push(...n))
        const esito = await dettagli.run({ names: ['inventato'] }, {} as never)

        expect(esito.ok).toBe(false)
        expect(svelati).toEqual([])
    })

    it('si chiama come il resto del catalogo si aspetta', () => {
        const dettagli = talosStrumentoDettagli(TUTTI, schemaDi, () => {})
        expect(dettagli.name).toBe(TALOS_DETTAGLI_STRUMENTO)
        // ⛔ `read`: non tocca niente e non esce dal telefono. Se un giorno
        // diventasse `write` chiederebbe un consenso per una domanda senza
        // contenuto, e ogni domanda senza contenuto insegna a dire sì.
        expect(dettagli.action).toBe('read')
    })
})

/**
 * ⛔⛔ MISURATO sul Pad il 2026-08-09, ed è il difetto peggiore che il catalogo
 * abbia prodotto.
 *
 * Prima versione: l'insieme degli svelati nasceva e moriva dentro un singolo
 * invio. «Accendi la torcia» → due passi corretti, scheda, torcia accesa
 * DAVVERO (registro fotocamera 06:30:44). Subito dopo «spegni la torcia» →
 * nessuna scheda, nessun evento, e la risposta «La torcia è stata spegna».
 *
 * Il modello vedeva nella conversazione uno strumento che aveva appena usato e
 * che non gli era più offerto: invece di richiederne la forma, ha RACCONTATO
 * l'azione. La tassa dei due passi a ogni messaggio è un invito a saltare il
 * passo, e chi salta il passo afferma il falso.
 */
describe('cio che e stato svelato resta svelato', () => {
    it('⛔ lo stesso strumento è ancora chiamabile al messaggio DOPO', async () => {
        const sessione = 'sessione-torcia'
        talosDimenticaSvelati(sessione)

        // Primo messaggio: il modello chiede la forma.
        const primo = talosSvelatiIn(sessione)
        const dettagli = talosStrumentoDettagli(TUTTI, schemaDi, (n) => {
            for (const nome of n) primo.add(nome)
        })
        await dettagli.run({ names: ['device_torch'] }, {} as never)

        // Secondo messaggio: insieme NUOVO chiesto per la stessa conversazione.
        const secondo = talosSvelatiIn(sessione)
        expect(secondo.has('device_torch')).toBe(true)
    })

    it('⛔ ma NON passa a un altra conversazione', () => {
        // I permessi e gli interruttori cambiano per chat: offrire altrove
        // cio' che li' potrebbe non esserci e' il difetto opposto.
        talosDimenticaSvelati('chat-a')
        talosDimenticaSvelati('chat-b')
        talosSvelatiIn('chat-a').add('device_torch')
        expect(talosSvelatiIn('chat-b').has('device_torch')).toBe(false)
    })

    it('dimenticare una conversazione la svuota', () => {
        talosSvelatiIn('chat-c').add('device_torch')
        talosDimenticaSvelati('chat-c')
        expect(talosSvelatiIn('chat-c').size).toBe(0)
    })
})
