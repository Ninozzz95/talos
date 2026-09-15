import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
    TALOS_DETTAGLI_STRUMENTO,
    talosDimenticaSvelati,
    talosIndiceCompatto,
    talosPreVelatiSempreVisibili,
    talosRichiestaDirettaSenzaTool,
    talosRispostaDirettaDeterministica,
    talosStrumentoDettagli,
    talosSvelatiIn,
    talosSvelatiInConSempreVisibili,
    talosToolDelCatalogoEseguibile,
    talosTurnoDiretto,
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

/**
 * ⛔⛔ IL GAP TROVATO IL 24/8: il ramo Anthropic (`aperturaProgressiva.ts`)
 * ha quattro nomi che non pagano mai il giro `tool_details`; il catalogo
 * locale non ne aveva — ogni prima chiamata a QUALUNQUE strumento in una
 * chat nuova pagava un giro intero, anche per uno banale come l'ora.
 */
describe('talosPreVelatiSempreVisibili — il locale riusa la stessa lista', () => {
    const oraCorrente = defineTalosTool<Record<string, never>>({
        name: 'time_now',
        title: 'Current time',
        description: 'Return the current date and time on the phone.',
        action: 'read',
        input: z.object({}),
        run: async () => ({ ok: true, content: '' }),
    }) as TalosToolDefinition<never>

    it('pre-svela un nome sempre-in-vista SOLO se è fra gli offerti', () => {
        const offerti = talosPreVelatiSempreVisibili([oraCorrente, torcia])
        expect(offerti).toEqual(['time_now'])
    })

    it('⛔ AL CONTRARIO — un nome sempre-in-vista MAI offerto non compare', () => {
        // Nessuno dei due strumenti qui sotto si chiama come i quattro della
        // lista Anthropic: coerente con `web_search` assente quando nessun
        // motore di ricerca è configurato (WEB-SENZA-MOTORE-01).
        const offerti = talosPreVelatiSempreVisibili([torcia, notifiche])
        expect(offerti).toEqual([])
    })

    it('⛔ AL CONTRARIO — un tool offerto ma non sempre-in-vista resta fuori', () => {
        const offerti = talosPreVelatiSempreVisibili([torcia])
        expect(offerti).not.toContain('device_torch')
    })

    it('più nomi sempre-in-vista offerti insieme: tutti tornano', () => {
        const ricercaLibreria = defineTalosTool<{ query: string }>({
            name: 'library_search',
            title: 'Library search',
            description: 'Search the library.',
            action: 'read',
            input: z.object({ query: z.string() }),
            run: async () => ({ ok: true, content: '' }),
        }) as TalosToolDefinition<never>
        const offerti = talosPreVelatiSempreVisibili([oraCorrente, ricercaLibreria, torcia])
        expect(offerti).toEqual(['time_now', 'library_search'])
    })

    it('talosSvelatiInConSempreVisibili pre-svela dal PRIMO messaggio', () => {
        const sessione = 'sessione-ora'
        talosDimenticaSvelati(sessione)
        const svelati = talosSvelatiInConSempreVisibili(sessione, [oraCorrente, torcia])
        // Nessun tool_details chiamato: eppure e' gia' chiamabile.
        expect(svelati.has('time_now')).toBe(true)
        expect(svelati.has('device_torch')).toBe(false)
    })

    it('talosSvelatiInConSempreVisibili non cancella ciò che era già svelato', () => {
        const sessione = 'sessione-mista'
        talosDimenticaSvelati(sessione)
        talosSvelatiIn(sessione).add('device_torch')
        const svelati = talosSvelatiInConSempreVisibili(sessione, [oraCorrente, torcia])
        expect(svelati.has('device_torch')).toBe(true)
        expect(svelati.has('time_now')).toBe(true)
    })
})

describe('il cancello del catalogo compatto', () => {
    it('LOCAL-PARITY-CATALOG-GATE-08 ammette solo dettagli o strumenti svelati', () => {
        const svelati = new Set<string>(['device_torch'])

        expect(talosToolDelCatalogoEseguibile('tool_details', svelati)).toBe(true)
        expect(talosToolDelCatalogoEseguibile('device_torch', svelati)).toBe(true)
        expect(talosToolDelCatalogoEseguibile('notification_list', svelati)).toBe(false)
    })

    it('LOCAL-PARITY-DIRECT-TURN-10 toglie gli schemi solo su richiesta esplicita', () => {
        expect(talosRichiestaDirettaSenzaTool(
            'Rispondi esattamente con TALOS_TESTO_101 e basta.',
        )).toBe(true)
        expect(talosRichiestaDirettaSenzaTool('Answer exactly with TALOS_TEXT_101.')).toBe(true)
        expect(talosRichiestaDirettaSenzaTool(
            'Adesso ripeti solo l ultima parola della tua risposta precedente.',
        )).toBe(true)
        expect(talosRichiestaDirettaSenzaTool('Now repeat only the last word.')).toBe(true)
        expect(talosRichiestaDirettaSenzaTool(
            'Salutami in una frase senza usare strumenti.',
        )).toBe(true)
        expect(talosRichiestaDirettaSenzaTool('Say hello without using any tools.')).toBe(true)

        expect(talosRichiestaDirettaSenzaTool('Cerca il contratto nella Libreria.')).toBe(false)
        expect(talosRichiestaDirettaSenzaTool('Accendi la torcia e rispondi solo dopo.')).toBe(false)
        expect(talosRichiestaDirettaSenzaTool('Spiegami cosa e un GGUF.')).toBe(false)
    })

    it('LOCAL-PARITY-DIRECT-TURN-10 rende solo i due contratti deterministici chiusi', () => {
        expect(talosRispostaDirettaDeterministica(
            'Rispondi esattamente con TALOS_GEMMA_202 e basta.',
            null,
        )).toBe('TALOS_GEMMA_202')
        expect(talosRispostaDirettaDeterministica(
            'Adesso ripeti solo l ultima parola della tua risposta precedente.',
            'Un GGUF e un formato locale versatile.',
        )).toBe('versatile')
        expect(talosRispostaDirettaDeterministica(
            'Now repeat only the last word of your previous answer.',
            'It stays fully local.',
        )).toBe('local')

        expect(talosRispostaDirettaDeterministica('Accendi la torcia.', 'spenta'))
            .toBeNull()
        expect(talosRispostaDirettaDeterministica('Spiegami cosa e un GGUF.', null))
            .toBeNull()
    })

    it('LOCAL-PARITY-DIRECT-TURN-10 deriva il literal dalla conversazione', () => {
        expect(talosTurnoDiretto([
            { role: 'user', content: 'Spiegami un GGUF.' },
            { role: 'assistant', content: 'E un formato locale versatile.' },
            { role: 'user', content: 'Adesso ripeti solo l ultima parola della tua risposta precedente.' },
        ])).toMatchObject({
            senzaTool: true,
            risposta: 'versatile',
        })
    })
})

/**
 * ⛔⛔ LOCAL-CATALOGO-DISAMBIGUA-01 — l'indice tagliava via la riga che
 * DISTINGUE due strumenti simili, e il modello locale sceglieva a caso.
 *
 * MISURATO sul Pad il 2026-08-19, Qwen3-1.7B, «fai una ricerca web sulle
 * novità di Android 16»: nessun tool chiamato, novità inventate a memoria.
 * L'owner ha visto il caso gemello: chiede una ricerca web e parte la Deep
 * Research, che costa minuti e credito vero.
 *
 * La causa è nella forma dell'indice, non nel modello: `talosIndiceCompatto`
 * teneva SOLO la prima frase della descrizione, e in `research_start` la frase
 * che lo separa da `web_search` — «For a single fact or a quick check, use
 * web_search instead» — è la TERZA. Un modello che non la vede non ha modo di
 * scegliere: gli restano due nomi che promettono la stessa cosa.
 */
describe('LOCAL-CATALOGO-DISAMBIGUA-01 la riga che distingue non si taglia', () => {
    const ricercaProfonda = defineTalosTool<{ question: string }>({
        name: 'research_start',
        title: 'Start a deep research',
        description: [
            'Start a deep research: TALOS plans several lines of enquiry, searches, reads the sources and writes a report with verified claims.',
            'It takes MINUTES and spends real search credit.',
            'For a single fact or a quick check, use web_search instead: it answers in seconds and costs almost nothing.',
        ].join(' '),
        action: 'write',
        input: z.object({ question: z.string() }),
        run: async () => ({ ok: true, content: '' }),
    }) as TalosToolDefinition<never>

    it('conserva il rimando allo strumento alternativo', () => {
        const indice = talosIndiceCompatto([ricercaProfonda])

        expect(indice).toContain('research_start')
        // Senza questa riga il modello non puo' distinguere i due strumenti.
        expect(indice).toContain('web_search')
    })

    it('conserva l\'avviso di costo, che decide se vale la pena chiamarlo', () => {
        const indice = talosIndiceCompatto([ricercaProfonda])
        expect(indice).toMatch(/MINUTES|credit/)
    })

    it('non allunga l\'indice degli strumenti che non hanno nulla da distinguere', () => {
        // `notification_list` ha una descrizione di una frase: resta com'era.
        const indice = talosIndiceCompatto([notifiche])
        expect(indice).toBe('notification_list: List the notifications currently on the phone.')
    })
})
