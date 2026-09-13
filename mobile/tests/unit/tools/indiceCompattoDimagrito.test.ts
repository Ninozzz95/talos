import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { TALOS_ATTREZZI_SEMPRE_IN_VISTA } from '@/lib/tools/aperturaProgressiva'
import {
    TALOS_INDICE_MAX_CARATTERI,
    talosDimenticaSvelati,
    talosIndiceCompatto,
    talosIstruzioneCatalogo,
    talosPreVelatiSempreVisibili,
    talosSvelatiIn,
    talosSvelatiInConSempreVisibili,
} from '@/lib/tools/catalogoCompatto'

/**
 * ⛔⛔⛔ L'INDICE COMPATTO DIMAGRITO — 2026-09-10, e ogni caso MORDE.
 *
 * ## Il numero che ha fatto nascere questi casi
 *
 * MISURATO col tokenizer ufficiale di Gemma 3 sul codice vero (68 attrezzi,
 * impostazioni di fabbrica): il prompt di sistema del motore locale pesava
 * **3.262 token**, e l'indice — le sole righe che NOMINANO gli attrezzi — ne
 * pesava **2.036**, il 62%. PocketPal, sullo stesso telefono, ne spende 17.
 *
 * ⇒ Due tagli, e sono di due specie diverse. Qui si prova che tolgono **solo**
 * ciò che era doppio o inutile, e che ciò che decide una scelta è rimasto.
 *
 * ## ⛔ Perché ogni caso ha il suo VERSO CONTRARIO
 *
 * Un indice più corto che fa perdere al modello un attrezzo è un
 * PEGGIORAMENTO, anche se i token scendono: «MAI azzoppare l'app per far
 * tornare un tetto». Quindi non basta provare che ciò che resta c'è: serve
 * provare che ciò che è uscito **non è sparito**, cioè che è uscito dall'indice
 * perché è entrato altrove. È il cancello che in questo progetto è già mancato
 * per mesi ([[il-cancello-semantico-era-spento-da-sempre]]): un cancello mai
 * provato nel verso in cui deve fallire non è un cancello.
 */

const finto = (nome: string, descrizione: string) => defineTalosTool({
    name: nome,
    title: nome,
    description: descrizione,
    action: 'read',
    input: z.object({ x: z.string().optional() }),
    async run() { return { ok: true, content: '' } },
}) as TalosToolDefinition<never>

const torcia = finto('device_torch', 'Turn the phone torch on or off.')
const ora = finto('time_now', 'Give the current date and time on this phone.')
const memoria = finto('memory_search', 'Search what the user has told TALOS before.')

describe('⛔ D-3 — i sempre-in-vista NON stanno nell\'indice, perché hanno già lo schema', () => {
    it('un attrezzo sempre-in-vista non compare nell\'indice: NEMMENO il nome', () => {
        const indice = talosIndiceCompatto([ora, torcia])
        // ⛔ Il verso contrario: non «c'è una riga in meno», ma «quel nome non
        // si legge da nessuna parte». Se un giorno tornasse, questo caso cade.
        expect(indice).not.toContain('time_now')
        expect(indice).toContain('device_torch')
        expect(indice.split('\n')).toHaveLength(1)
    })

    it('⛔ e NON è sparito: è pre-svelato, quindi il modello ne ha lo schema intero', () => {
        const sessione = 'D3-non-sparito'
        talosDimenticaSvelati(sessione)
        const svelati = talosSvelatiInConSempreVisibili(sessione, [ora, torcia])
        expect(svelati.has('time_now')).toBe(true)
        // La torcia invece NON è pre-svelata: sta nell'indice e pagherà il giro.
        expect(svelati.has('device_torch')).toBe(false)
    })

    /**
     * ⛔⛔ IL CANCELLO CHE TIENE FERMA L'UNIONE — è questo che impedisce il buco.
     *
     * Se qualcuno togliesse un nome da `TALOS_ATTREZZI_SEMPRE_IN_VISTA` senza
     * toccare l'indice, o cambiasse il filtro dell'indice senza toccare la
     * pre-svelatura, un attrezzo cadrebbe **in mezzo**: fuori dall'indice e
     * senza schema. Il modello non saprebbe più che esiste, e non ci sarebbe
     * nessun rosso. Questo caso è quel rosso.
     */
    it('indice ∪ pre-svelati == offerti, e i due insiemi non si sovrappongono', () => {
        const offerti = [ora, memoria, torcia, finto('device_volume', 'Read or set a volume stream.')]
        const nellIndice = talosIndiceCompatto(offerti)
            .split('\n').filter(Boolean).map((riga) => riga.slice(0, riga.indexOf(':')))
        const preVelati = talosPreVelatiSempreVisibili(offerti)

        expect([...nellIndice, ...preVelati].sort())
            .toEqual(offerti.map((tool) => tool.name).sort())
        for (const nome of preVelati) expect(nellIndice).not.toContain(nome)
    })

    it('⛔ un sempre-in-vista NON offerto non toglie niente a nessuno', () => {
        // `web_search` sparisce dagli offerti quando manca la chiave di ricerca
        // (WEB-SENZA-MOTORE-01): non è pre-svelato e non è nell'indice, perché
        // non esiste in questo turno. Chi resta non deve accorgersene.
        const indice = talosIndiceCompatto([torcia])
        expect(indice).toBe('device_torch: Turn the phone torch on or off.')
        expect(TALOS_ATTREZZI_SEMPRE_IN_VISTA).toContain('web_search')
    })
})

describe('⛔ D-5 — il setaccio: entra la frase che fa SCEGLIERE, non quella che dice COME', () => {
    const aggiorna = finto('tasks_update', [
        'Change the title, the detail or the priority of a task that already exists.',
        'Call tasks_list first to get the task id — do not guess it from the title, because two tasks can share a name.',
        'Do NOT use this to mark something done or started: that is tasks_complete.',
    ].join(' '))
    const elenca = finto('tasks_list', 'List the tasks.')
    const completa = finto('tasks_complete', 'Mark a task as done.')

    it('tiene la frase che distingue due gemelli — LOCAL-CATALOGO-DISAMBIGUA-01 non si tocca', () => {
        const indice = talosIndiceCompatto([aggiorna, elenca, completa])
        expect(indice).toContain('Do NOT use this to mark something done or started: that is tasks_complete.')
    })

    it('⛔ e BUTTA la frase di sequenza, che il modello rilegge nello schema', () => {
        // ⛔ Il verso contrario del caso qui sopra: se il setaccio non filtrasse
        // niente, questa frase ci sarebbe e il caso cadrebbe.
        const indice = talosIndiceCompatto([aggiorna, elenca, completa])
        expect(indice).not.toContain('Call tasks_list first')
    })

    it('l\'avviso di COSTO resta anche senza nominare nessuno: decide SE chiamare', () => {
        const ricerca = finto('research_start', [
            'Start a deep research.',
            'It takes MINUTES and spends real search credit.',
        ].join(' '))
        expect(talosIndiceCompatto([ricerca])).toContain('MINUTES')
    })

    it('⛔ una frase che nomina un altro attrezzo SENZA contrapporlo non entra', () => {
        const origine = finto('library_file_origin', [
            'Report where one Library file came from.',
            'Ids come from library_list or library_search.',
        ].join(' '))
        const elencoLib = finto('library_list', 'List Library files.')
        const indice = talosIndiceCompatto([origine, elencoLib])
        expect(indice).toContain('Report where one Library file came from.')
        expect(indice).not.toContain('Ids come from')
    })
})

describe('⛔ il taglio è per FRASI INTERE — mai in mezzo a una parola', () => {
    /**
     * MISURATO il 2026-09-10: con `slice(0, 260)` cinque righe su 68 finivano a
     * metà di una parola — «…is org.th», «…whether a researc». Fra queste c'era
     * proprio la frase nata per LOCAL-CATALOGO-DISAMBIGUA-01.
     */
    it('nessuna riga finisce a metà di una parola', () => {
        const lungo = finto('research_start', [
            'Start a deep research: TALOS plans several lines of enquiry, searches, reads the sources and writes a report with verified claims.',
            'It takes MINUTES and spends real search credit.',
            'For a single fact or a quick check, use web_search instead: it answers in seconds and costs almost nothing.',
        ].join(' '))
        const ricerca = finto('web_search', 'Search the web.')
        const riga = talosIndiceCompatto([lungo, ricerca])
        expect(riga.endsWith('.')).toBe(true)
        expect(riga).toContain('use web_search instead: it answers in seconds and costs almost nothing.')
    })

    it('⛔ una frase che NON ci sta viene saltata intera, non troncata', () => {
        const riempitivo = 'x'.repeat(TALOS_INDICE_MAX_CARATTERI)
        const enorme = finto('web_read', [
            'Download ONE web page.',
            `It takes seconds. ${riempitivo}.`,
        ].join(' '))
        const riga = talosIndiceCompatto([enorme])
        expect(riga.length).toBeLessThanOrEqual(TALOS_INDICE_MAX_CARATTERI + 'web_read: '.length)
        expect(riga).not.toContain('xxx')
    })

    it('la PRIMA frase entra sempre, anche se da sola supera il tetto', () => {
        // Perdere la prima frase vuol dire perdere l'identità dello strumento:
        // il tetto vale per ciò che si AGGIUNGE, non per ciò che lo definisce.
        const coda = 'a'.repeat(500)
        const prolisso = finto('device_status', `Read how the phone is right now ${coda}.`)
        expect(talosIndiceCompatto([prolisso])).toContain(coda)
    })
})

describe('⛔ il cappello del catalogo non punta al nulla', () => {
    it('l\'esempio nomina uno strumento CHE STA NELL\'INDICE', () => {
        // `ora` è primo fra gli offerti ma esce dall'indice: l'esempio deve
        // parlare della torcia, o insegnerebbe a chiedere lo schema di uno
        // strumento che il modello ha già.
        const testo = talosIstruzioneCatalogo([ora, torcia])
        expect(testo).toContain('So for device_torch:')
        expect(testo).not.toContain('So for time_now:')
    })

    it('⛔ se l\'indice resta VUOTO non si spedisce nessun cappello', () => {
        // Tutti gli offerti sono sempre-in-vista: hanno già lo schema, e un
        // cappello che dice «below» seguito dal nulla è solo un invito a
        // chiamare tool_details per niente.
        expect(talosIstruzioneCatalogo([ora, memoria])).toBe('')
    })
})

describe('⛔ D-6 — il deposito degli svelati non cresce per sempre', () => {
    it('una conversazione vecchissima viene lasciata andare', () => {
        talosDimenticaSvelati('vecchia')
        talosSvelatiIn('vecchia').add('device_torch')
        expect(talosSvelatiIn('vecchia').has('device_torch')).toBe(true)
        // ⛔ Cento conversazioni nuove: lo sfratto deve arrivare con QUALUNQUE
        // tetto ragionevole, così il caso non ricopia la costante.
        for (let i = 0; i < 100; i += 1) talosSvelatiIn(`riempi-${i}`)
        expect(talosSvelatiIn('vecchia').size).toBe(0)
    })

    it('⛔ ma la conversazione ATTIVA non viene MAI sfrattata', () => {
        // È il verso contrario, ed è quello che conta: dimenticare DENTRO una
        // conversazione è il difetto del 2026-08-09 («la torcia è stata
        // spegna»), e sarebbe peggio della memoria sprecata.
        talosDimenticaSvelati('attiva')
        talosSvelatiIn('attiva').add('device_torch')
        for (let i = 0; i < 100; i += 1) {
            talosSvelatiIn(`rumore-${i}`)
            expect(talosSvelatiIn('attiva').has('device_torch')).toBe(true)
        }
    })
})
