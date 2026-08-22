import { describe, expect, it, vi } from 'vitest'
import { talosStrumentoDettagli } from '@/lib/tools/catalogoCompatto'
import { defineTalosTool } from '@/lib/tools/registry'
import { z } from 'zod'

/**
 * ⛔⛔⛔ SCHEMA-SCAMBIATO-PER-RISULTATO-01 — svela l'attrezzo e poi INVENTA.
 *
 * ## Misurato sul Pad il 2026-08-19, e il registro lo dice in due righe
 *
 * Qwen3-1.7B, «Dimmi le coordinate del telefono». Nel registro del motore:
 *
 * ```
 *   23:11:07  formato di chat: peg-native (… tool: 1, grammatica: pigra)
 *   23:11:53  formato di chat: peg-native (… tool: 2, grammatica: pigra)
 * ```
 *
 * Gli strumenti esposti passano da **1 a 2**. Cioè: il primo giro aveva solo
 * `tool_details`, il modello l'ha **chiamato davvero**, `device_location` è
 * stato svelato ed era chiamabile al secondo giro.
 *
 * E al secondo giro ha risposto «La posizione del telefono è: 41.8996° N,
 * 12.4347° E» — **senza chiamarlo**. Coordinate inventate: il Pad era a
 * Catania, e quel numero ha sei decimali dove il nostro codice ne fa quattro.
 * Vedi `posizionePrecisa.test.ts`.
 *
 * ## ⛔ Perché si ferma lì: gli abbiamo dato una cosa che SEMBRA una risposta
 *
 * `tool_details` restituiva `JSON.stringify([...schemi])` e basta. Dentro c'è
 * il nome dello strumento, la sua descrizione, i suoi campi — per un modello
 * da 1,7 miliardi quel blob è indistinguibile da un esito. Ha letto qualcosa
 * di pertinente e ha scritto la risposta.
 *
 * Il difetto non è che non sappia chiamare: **il primo salto lo fa**. È che
 * dopo il primo salto crede di aver finito. Non gliel'aveva detto nessuno che
 * mancava il pezzo che conta.
 *
 * ⇒ Il risultato dice, in fondo — dove il modello guarda per ultimo, la stessa
 * lezione di [[LINGUA-DOPO-IL-TOOL-01]] — che quelli sono **soltanto schemi**,
 * che **non è stato eseguito niente**, e che il messaggio dopo dev'essere la
 * chiamata. E soprattutto: che non deve affermare nessun fatto che quegli
 * strumenti fornirebbero finché non li ha chiamati.
 */

const posizione = defineTalosTool({
    name: 'device_location',
    title: 'Where the user is',
    description: 'Read where the phone is now.',
    action: 'read',
    input: z.object({}),
    async run() {
        return { ok: true, content: '' }
    },
})

function dettagli() {
    const svelati: string[] = []
    const tool = talosStrumentoDettagli(
        [posizione as never],
        (t) => ({ type: 'function', function: { name: t.name } }),
        (nomi) => svelati.push(...nomi),
    )
    return { tool, svelati }
}

describe('SCHEMA-SCAMBIATO-PER-RISULTATO-01 lo schema non è il risultato', () => {
    it('⛔ dice che NON è stato eseguito niente', async () => {
        const { tool } = dettagli()
        const esito = await tool.run({ names: ['device_location'] } as never, {} as never)

        expect(esito.content).toMatch(/not (been )?(called|executed|run)|no results/i)
    })

    it('⛔ ordina la CHIAMATA come passo successivo, e nomina lo strumento', async () => {
        const { tool } = dettagli()
        const esito = await tool.run({ names: ['device_location'] } as never, {} as never)

        expect(esito.content).toMatch(/next/i)
        expect(esito.content).toContain('device_location')
    })

    it('⛔ vieta di affermare fatti che lo strumento fornirebbe — è l\'invenzione', async () => {
        const { tool } = dettagli()
        const esito = await tool.run({ names: ['device_location'] } as never, {} as never)

        expect(esito.content).toMatch(/do not (state|answer|give)/i)
    })

    it('l\'ordine conta: l\'avvertimento sta DOPO lo schema, non prima', async () => {
        const { tool } = dettagli()
        const esito = await tool.run({ names: ['device_location'] } as never, {} as never)

        // Se stesse prima, l'ultima cosa letta tornerebbe a essere il blob JSON —
        // cioè la cosa che il modello ha già scambiato per una risposta.
        const schema = esito.content.indexOf('"device_location"')
        const ordine = esito.content.search(/next/i)
        expect(schema).toBeGreaterThanOrEqual(0)
        expect(ordine).toBeGreaterThan(schema)
    })

    it('lo schema c\'è ancora, e lo strumento resta svelato', async () => {
        const { tool, svelati } = dettagli()
        const esito = await tool.run({ names: ['device_location'] } as never, {} as never)

        expect(esito.ok).toBe(true)
        expect(esito.content).toContain('"function"')
        expect(svelati).toEqual(['device_location'])
    })

    it('⛔ e al contrario: un nome inesistente resta il rifiuto di prima', async () => {
        const { tool, svelati } = dettagli()
        const esito = await tool.run({ names: ['non_esiste'] } as never, {} as never)

        expect(esito.ok).toBe(false)
        expect(esito.content).toContain('non_esiste')
        expect(svelati).toEqual([])
        // Un rifiuto non ordina di chiamare niente: non c'è niente da chiamare.
        expect(esito.content).not.toMatch(/your next message/i)
    })
})
