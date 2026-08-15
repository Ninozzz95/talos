import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import type {
    TalosEsitoCalendario,
    TalosEsitoScrittura,
    TalosEsitoModifica,
    TalosEventoCalendario,
} from '@/lib/device/calendario'

/**
 * ⭐⭐⭐ LEGGERE IL CALENDARIO — la capacità che mancava, e la bugia che curava.
 *
 * ## Il difetto, misurato sul Pad il 2026-08-14
 *
 * «Che impegni ho domani?» → «Non hai compiti registrati per domani». TALOS
 * aveva guardato le PROPRIE note e attività e risposto **come se avesse
 * controllato l'agenda**, non avendo nessuna capacità di calendario.
 *
 * ⇒ Non è «non lo so»: è una risposta **sicura e falsa sulla giornata di una
 * persona**, che chiude il telefono convinta di avere il giorno libero.
 *
 * ## ⭐ Il sorpasso su Gemini è nel MECCANISMO
 *
 * Gemini legge dall'**account Google**. Sul Pad il calendario `1` è **locale** e
 * lui non lo vede — verificato. Leggendo il provider si vede tutto: locali,
 * Google, OEM, qualunque account sincronizzato.
 */

/** Come si scrive un istante per una persona, sapendo se è tutto il giorno. */
function quando(evento: TalosEventoCalendario): string {
    /*
     * ⛔ Un evento «tutto il giorno» è memorizzato a **mezzanotte UTC**. Letto
     * col fuso del telefono compare a cavallo di due giorni — o sparisce dal
     * giorno giusto. Qui si legge in UTC, ed è l'unico posto in cui succede.
     */
    const fuso = evento.tuttoIlGiorno ? 'UTC' : undefined
    const giorno = new Date(evento.inizio).toLocaleDateString('en-CA', { timeZone: fuso })
    if (evento.tuttoIlGiorno) return `${giorno} (all day)`
    const ora = (quando: number): string => new Date(quando).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: fuso,
    })
    /*
     * ⛔⛔ ANCHE L'ORA DI FINE — misurato contro Gemini il 2026-08-14.
     *
     * Sulla stessa domanda lui rispondeva «Dentista: 17:00 – 18:00», noi
     * «17:00». Il dato ce l'avevamo già — `fine` viaggia nel ponte dal primo
     * giorno — ed era la formattazione a buttarlo via.
     *
     * ⇒ E non è un dettaglio estetico: «sono libero domani pomeriggio?» si
     * risponde bene solo sapendo **quando finisce** ciò che occupa. Senza, un
     * appuntamento di dieci minuti e uno di quattro ore si leggono uguali.
     */
    return `${giorno} ${ora(evento.inizio)}–${ora(evento.fine)}`
}

/**
 * Le righe che il modello legge.
 *
 * ⛔ Si dice ANCHE quale calendario: «Dentista» sul calendario di lavoro e
 * «Dentista» su quello di famiglia sono due fatti diversi, e la persona che
 * chiede sa distinguerli solo se glielo diciamo.
 */
function righe(eventi: readonly TalosEventoCalendario[]): string {
    return eventi.map((evento) => [
        /*
         * ⭐ L'ID davanti, ed è ciò che rende possibile CAMBIARE un impegno.
         *
         * Senza, il modello può solo descrivere: davanti a «sposta la cena alle
         * 21» non ha niente da indirizzare e ne crea una seconda — lo stesso
         * difetto già misurato sulla sveglia.
         *
         * ⛔ Fra parentesi quadre e con l'etichetta: un numero nudo in mezzo a
         * un orario e un titolo, un modello lo legge come un'ora.
         */
        `[id ${evento.id}]`,
        quando(evento),
        evento.titolo,
        evento.luogo ? `at ${evento.luogo}` : '',
        `[${evento.calendario}]`,
    ].filter(Boolean).join(' · ')).join('\n')
}

export function createTalosCalendarTools(
    leggi: (da: number, a: number, conFestivita: boolean) => Promise<TalosEsitoCalendario>,
    scrivi: (input: {
        titolo: string
        inizio: number
        fine: number
        luogo?: string
        note?: string
        calendario?: string
    }) => Promise<TalosEsitoScrittura>,
    modifica: (input: {
        id: number
        elimina?: boolean
        titolo?: string
        inizio?: number
        fine?: number
        luogo?: string
        note?: string
    }) => Promise<TalosEsitoModifica>,
): TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'calendar_read',
            action: 'read',
            title: 'Read the calendar',
            description: [
                'Read the appointments in the phone calendar between two moments.',
                'Use this for any question about the agenda, what is on, or what the user has to do.',
                'Holidays are left out unless withHolidays is true: they do not take up the day.',
            ].join(' '),
            input: z.object({
                from: z.string().describe('Start, ISO 8601, e.g. 2026-08-15T00:00:00.'),
                to: z.string().describe('End, ISO 8601. Must be after `from`.'),
                withHolidays: z.boolean().optional(),
            }),
            async run(input) {
                const da = Date.parse(input.from)
                const a = Date.parse(input.to)
                if (!Number.isFinite(da) || !Number.isFinite(a) || a <= da) {
                    return { ok: false, content: 'Give `from` and `to` as ISO 8601, with `to` after `from`.' }
                }
                const esito = await leggi(da, a, input.withHolidays === true)
                /*
                 * ⛔⛔ TRE ESITI, NON DUE — e la ragione è la bugia di partenza.
                 *
                 * «Non ho il permesso di guardare» e «ho guardato e non c'è
                 * niente» portano a due frasi opposte per la persona. Fonderli
                 * in un `ok:false` generico è esattamente come TALOS è arrivato
                 * a dire «non hai impegni» senza aver guardato niente.
                 */
                if (esito.stato === 'permesso-mancante') {
                    return {
                        ok: false,
                        code: 'TALOS_CALENDAR_DENIED',
                        content: 'You do NOT have permission to read the calendar, so you do not know '
                            + 'what the user has on. Say exactly that — never answer from notes or tasks.',
                    }
                }
                if (esito.stato === 'ponte-chiuso') {
                    return {
                        ok: false,
                        code: 'TALOS_CALENDAR_UNAVAILABLE',
                        content: 'The calendar could not be read on this device. Say so; do not guess.',
                    }
                }
                /*
                 * ⭐⭐⭐ LE FONTI ENTRANO NELLA RISPOSTA — owner 2026-08-14.
                 *
                 * Dal suo telefono: «che impegni ho domani?» → «non hai impegni
                 * in calendario», mentre il Dentista e la Cena da Mario erano
                 * lì, sincronizzati. Sul Pad, interrogato il provider a mano,
                 * i quattro eventi c'erano tutti coi valori giusti.
                 *
                 * ⇒ Su quel telefono la risposta è nata da un insieme di
                 * calendari **diverso**, e la frase era identica a quella
                 * giusta. Nessuno poteva accorgersene.
                 *
                 * ⛔ «Non hai impegni» è la frase su cui una persona chiude il
                 * telefono e considera libera la giornata. Se è sbagliata deve
                 * poterlo mostrare da sola, e l'unico modo è dire **dove ha
                 * guardato**: chi legge riconosce all'istante il calendario che
                 * manca dall'elenco.
                 */
                /*
                 * ⛔ `?? []` e non `esito.calendari.length`: il tipo dice che
                 * l'elenco c'è sempre, ma questo attrezzo risponde sulla
                 * GIORNATA di una persona — e un `undefined` da un ponte
                 * vecchio farebbe fallire l'intera lettura invece di togliere
                 * una riga. Il difetto sarebbe peggiore della sua causa.
                 */
                const elenco = esito.calendari ?? []
                const fonti = elenco.length > 0
                    ? ` Calendars consulted: ${elenco.join(', ')}.`
                    : ''
                if (esito.eventi.length === 0) {
                    return {
                        ok: true,
                        content: 'The calendar was read and there is nothing in that period.'
                            + (input.withHolidays === true ? '' : ' Holidays were left out.')
                            + fonti
                            /*
                             * ⛔ E si DICE alla persona, non si tiene per sé:
                             * un elenco che resta nel contesto del modello non
                             * aiuta chi ha il calendario davanti e vede che ne
                             * manca uno.
                             */
                            + (fonti ? ' Tell the user which calendars you looked at,'
                                + ' so they can spot one that is missing.' : ''),
                    }
                }
                /*
                 * ⭐⭐⭐ E LA SCHEDA — misurata contro Gemini il 2026-08-14.
                 *
                 * Alla stessa domanda lui risponde col testo **e due schede**;
                 * noi rispondevamo con del testo e basta. Owner: «SCHEDA
                 * SEMPRE».
                 *
                 * ⛔ Le voci portano il testo GIÀ FORMATTATO da `quando()`: la
                 * conversione di un evento «tutto il giorno» si fa in UTC —
                 * sbagliarla sposta il giorno — e quel sapere resta in un posto
                 * solo. Rifarla nel componente sarebbe una seconda verità sullo
                 * stesso evento.
                 */
                return {
                    ok: true,
                    // ⛔ Le fonti anche a lettura PIENA: se le mandassimo solo
                    // quando non si trova niente, la risposta piena resterebbe
                    // l'unica non verificabile — ed è quella su cui la persona
                    // fa i suoi piani.
                    content: `${righe(esito.eventi)}\n${fonti.trim()}`.trim(),
                    scheda: {
                        tipo: 'agenda' as const,
                        voci: esito.eventi.map((evento) => ({
                            titolo: evento.titolo,
                            /*
                             * ⛔ Nella SCHEDA va solo l'ora, non la data —
                             * visto sul Pad il 2026-08-14: «2026-08-15 17:00»
                             * ripetuto su ogni riga occupava metà larghezza e
                             * spingeva il titolo fuori. Il giorno lo dice la
                             * frase sopra; la scheda risponde a «a che ora».
                             *
                             * ⛔ Un evento di tutto il giorno NON ha un'ora, e
                             * lì la data è l'unica cosa da dire.
                             */
                            quando: evento.tuttoIlGiorno
                                ? quando(evento)
                                : quando(evento).split(' ').slice(1).join(' '),
                            ...(evento.luogo ? { luogo: evento.luogo } : {}),
                            ...(evento.calendario ? { calendario: evento.calendario } : {}),
                        })),
                    },
                }
            },
        }) as TalosToolDefinition<never>,

        /*
         * ⭐⭐⭐ SCRIVERE IN AGENDA — e i due punti in cui superiamo Gemini.
         *
         * 1. **Senza aprire niente.** Android offre `ACTION_INSERT`, che non
         *    chiede permessi ma **apre l'app Calendario**: è l'errore che la
         *    sveglia ci ha mostrato ieri, `EXTRA_SKIP_UI` ignorato e Orologio in
         *    faccia alla persona. Qui si scrive sul provider.
         * 2. **Luogo e note.** Google dichiara che Gemini **non sa
         *    modificarli**. Qui sono due campi come gli altri.
         *
         * ⛔ `action: 'write'` ⇒ passa dalla scheda di consenso, sempre: il
         * permesso apre la porta, la scheda decide il singolo appuntamento.
         */
        defineTalosTool({
            name: 'calendar_write',
            action: 'write',
            title: 'Put an appointment in the calendar',
            description: [
                'Create an appointment in the phone calendar, without opening any app.',
                'Location and notes are supported.',
                'If the phone has more than one writable calendar and none is named, this returns the list: ask which one.',
            ].join(' '),
            input: z.object({
                title: z.string().min(1).max(200),
                /*
                 * ⛔ MISURATO il 2026-08-14: «metti in agenda domani alle 21»
                 * è finito su lunedì 17 invece che sabato 15, perché il modello
                 * ha dedotto «oggi» invece di chiederlo. `time_now` sul telefono
                 * rispondeva giusto e non è stato chiamato.
                 */
                /*
                 * ⛔ Questo è il testo PROVATO sul Pad, parola per parola. Era
                 * stato accorciato per far entrare la superficie sotto il tetto
                 * dei 43.700 byte, e accorciarlo voleva dire spedire una riga
                 * diversa da quella misurata: il tetto è salito, la riga no.
                 */
                from: z.string().describe(
                    'Start, ISO 8601. Call time_now FIRST for any relative date '
                    + '("tomorrow", "Saturday", "next week"): never assume today.',
                ),
                to: z.string().describe('End, ISO 8601. Must be after `from`.'),
                location: z.string().max(200).optional(),
                notes: z.string().max(500).optional(),
                calendar: z.string().max(120).optional().describe('Which calendar, by name.'),
                /*
                 * ⭐⭐ IL VERSO OPPOSTO STA DENTRO IL SUO VERSO — la lezione di
                 * `device_alarm`, che ha imparato a spegnere dentro sé stesso.
                 * Un `calendar_update` separato costerebbe superficie a ogni
                 * turno per la metà mancante di questo.
                 *
                 * ⛔ E senza, il modello davanti a «sposta la cena alle 21» ha
                 * solo l'attrezzo che METTE e ne crea una seconda: due impegni
                 * che si contraddicono, misurato sulla sveglia.
                 */
                event: z.string().max(40).optional().describe(
                    'Id from calendar_read, to CHANGE that appointment instead of creating one. '
                    + 'Send only the fields to change.',
                ),
                remove: z.boolean().optional().describe('With `event`: delete it. Cannot be undone.'),
            }),
            async run(input) {
                /*
                 * ⛔ Il ramo della MODIFICA sta in cima, prima dei controlli su
                 * `from`/`to`: cambiare solo il luogo di un impegno non deve
                 * pretendere di ridichiararne gli orari.
                 */
                if (input.event) {
                    const id = Number(input.event)
                    if (!Number.isFinite(id)) {
                        return { ok: false, content: 'The `event` id must be the number given by calendar_read.' }
                    }
                    const nuovoInizio = input.from ? Date.parse(input.from) : undefined
                    const nuovaFine = input.to ? Date.parse(input.to) : undefined
                    const esito = await modifica({
                        id,
                        ...(input.remove === true ? { elimina: true } : {}),
                        ...(input.title ? { titolo: input.title } : {}),
                        ...(Number.isFinite(nuovoInizio) ? { inizio: nuovoInizio } : {}),
                        ...(Number.isFinite(nuovaFine) ? { fine: nuovaFine } : {}),
                        ...(input.location ? { luogo: input.location } : {}),
                        ...(input.notes ? { note: input.notes } : {}),
                    })
                    if (esito.stato === 'permesso-mancante') {
                        return {
                            ok: false,
                            code: 'TALOS_CALENDAR_WRITE_DENIED',
                            content: 'You do NOT have permission to change the calendar. Nothing was touched.',
                        }
                    }
                    if (esito.stato === 'ponte-chiuso') {
                        return { ok: false, content: 'The calendar could not be reached. Nothing was touched.' }
                    }
                    if (esito.stato === 'non-riuscito') {
                        /*
                         * ⛔ Il motivo VIAGGIA: «cancellato-ma-ancora-li» e
                         * «niente-da-cambiare» sono fatti diversi, e un esito
                         * senza causa la fa inventare al modello — difetto già
                         * misurato più di una volta su questo progetto.
                         */
                        return {
                            ok: false,
                            content: `The calendar did not accept the change (${esito.motivo ?? 'unknown'}). `
                                + 'Say exactly that nothing changed; do not invent a cause.',
                        }
                    }
                    if (input.remove === true) {
                        return {
                            ok: true,
                            content: 'Deleted, and TALOS checked the calendar afterwards: that appointment is gone.',
                        }
                    }
                    /*
                     * ⛔ Si riporta l'ora VERA riletta dal provider, non quella
                     * chiesta: è la stessa regola della scrittura, e nasce dallo
                     * stesso difetto — un impegno finito su un altro giorno con
                     * la chat che diceva quello giusto.
                     */
                    return {
                        ok: true,
                        content: 'Changed, and TALOS read it back from the calendar: '
                            + `it is now "${esito.titoloVero ?? input.title ?? ''}"`
                            + (esito.inizioVero
                                ? ` on ${new Date(esito.inizioVero).toString()}.`
                                : '.')
                            + ' Tell the user the day in words, from that value.',
                    }
                }
                const da = Date.parse(input.from)
                const a = Date.parse(input.to)
                if (!Number.isFinite(da) || !Number.isFinite(a) || a <= da) {
                    return { ok: false, content: 'Give `from` and `to` as ISO 8601, with `to` after `from`.' }
                }
                const esito = await scrivi({
                    titolo: input.title,
                    inizio: da,
                    fine: a,
                    luogo: input.location,
                    note: input.notes,
                    calendario: input.calendar,
                })
                if (esito.stato === 'permesso-mancante') {
                    return {
                        ok: false,
                        code: 'TALOS_CALENDAR_WRITE_DENIED',
                        content: 'You do NOT have permission to write to the calendar. Say so; nothing was created.',
                    }
                }
                if (esito.stato === 'nessun-calendario') {
                    return {
                        ok: false,
                        code: 'TALOS_CALENDAR_READ_ONLY',
                        content: 'Every calendar on this phone is read-only, so nothing was created. Say so.',
                    }
                }
                /*
                 * ⛔ NON è un errore: è una domanda. Scegliere per la persona su
                 * quale agenda finisce un appuntamento è la stessa famiglia del
                 * contatto con tre numeri — quello di famiglia e quello di
                 * lavoro li vedono persone diverse.
                 */
                if (esito.stato === 'quale-calendario') {
                    /*
                     * ⛔⛔ LA RIGA DICE ANCHE COSA FARE CON LA RISPOSTA, e prima
                     * non lo diceva — misurato sul Pad il 2026-08-14.
                     *
                     * «metti in agenda domani alle 18 Cena da Mario» → TALOS
                     * chiede giustamente su quale calendario. La persona
                     * risponde «quello di Famiglia», e TALOS scrive: «Perfetto,
                     * ho messo in agenda Cena da Mario… ✓» — **senza chiamare
                     * niente**. Nessun chip «Fatto», nessun evento nel provider.
                     *
                     * ⇒ Il modello ha trattato la RISPOSTA ALLA DOMANDA come se
                     * fosse l'esito. È R-30 nella sua forma più insidiosa: non
                     * inventa un'azione mai iniziata, ma dà per conclusa una che
                     * aveva **davvero** cominciato.
                     *
                     * ⛔ Una domanda che non dice cosa fare della risposta è una
                     * domanda a metà. Qui il passo successivo è scritto per
                     * nome.
                     */
                    return {
                        ok: false,
                        code: 'TALOS_CALENDAR_WHICH',
                        content: `NOTHING was created. Ask which calendar: ${esito.calendari.join(', ')}. `
                            + 'When the user answers, call calendar_write AGAIN with `calendar` set to their '
                            + 'choice. Their answer is not the outcome: until that second call returns, the '
                            + 'appointment does not exist.',
                    }
                }
                if (esito.stato === 'ponte-chiuso') {
                    return {
                        ok: false,
                        code: 'TALOS_CALENDAR_UNAVAILABLE',
                        content: 'The calendar could not be written on this device. Say so; do not guess.',
                    }
                }
                /*
                 * ⛔⛔ I DUE MODI DI NON RIUSCIRE, tenuti separati.
                 *
                 * Owner 2026-08-14: TALOS ha detto «salvo l'impegno sul
                 * calendario persona@example.com» e nel calendario non c'era
                 * niente. La scrittura adesso si RILEGGE, e questi sono i due
                 * esiti che prima si travestivano da successo.
                 */
                if (esito.stato === 'rifiutato') {
                    return {
                        ok: false,
                        code: 'TALOS_CALENDAR_REFUSED',
                        content: 'The phone REFUSED to create the appointment. Nothing exists. '
                            + 'Say it was not created; do not say you saved it.',
                    }
                }
                if (esito.stato === 'non-rileggibile') {
                    return {
                        ok: false,
                        code: 'TALOS_CALENDAR_VANISHED',
                        content: 'The phone accepted the appointment and then it was NOT there when read '
                            + 'back. Do NOT say it is saved: tell the user it did not stick, and to '
                            + 'check the calendar app.',
                    }
                }
                /*
                 * ⛔⛔⛔ IL GIORNO VERO, RILETTO DAL PROVIDER — e non quello che
                 * il modello crede di aver scritto.
                 *
                 * MISURATO sul Pad il 2026-08-14 alle 13:33, tre versioni della
                 * stessa cosa:
                 *
                 *   chiesto      «metti in agenda DOMANI alle 21»  → sabato 15
                 *   TALOS disse  «domani (domenica 16 agosto)»     → domenica 16
                 *   il provider  dtstart=1786993200000             → LUNEDÌ 17
                 *
                 * ⇒ Sbagliato di due giorni, e la frase nemmeno d'accordo con
                 * ciò che aveva scritto. `time_now` sul telefono rispondeva
                 * giusto («oggi è venerdì 14, domani è sabato 15»): il modello
                 * semplicemente **non l'ha chiamato** e ha tirato a indovinare.
                 *
                 * ⛔ Una riga nel prompt non lega: la si legge ventimila token
                 * prima. Un numero che torna dall'attrezzo, nello stesso
                 * respiro, sì. Qui il giorno arriva dal PROVIDER — l'unica
                 * fonte che non può essere d'accordo con l'errore del modello —
                 * e la persona lo vede scritto per esteso.
                 */
                const quandoDavvero = esito.inizioVero === null
                    ? ''
                    : ` It is on ${new Date(esito.inizioVero).toLocaleString('en-GB', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    })}.`
                // ⛔ «Created» si dice solo qui, e qui vuol dire che la riga è
                // stata RILETTA dal provider dopo averla scritta.
                return {
                    ok: true,
                    content: `Created on "${esito.calendario}", and read back to confirm.${quandoDavvero}`
                        + ' Tell the user that exact day and time — it comes from the phone, not from you.'
                        + ' If it is not what they asked for, say so and offer to fix it.',
                }
            },
        }) as TalosToolDefinition<never>,
    ]
}
