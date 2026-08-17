import { describe, expect, it, vi } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'
import { talosToolsForLocalEngine } from '@/lib/tools/registry'
import { TALOS_AGENT_TOOL_IDS } from '@/lib/tools/toolControls'

/**
 * ⛔⛔ QUANTO PESANO GLI SCHEMI — e perché è la prima domanda del compito #42.
 *
 * ## Il vincolo che decide tutto il resto
 *
 * Gemma 2 2B IT ha una finestra di **8.192 token**. Un solo «ciao» con TALOS ne
 * è costato **8.414** (MISURATO, [[due-minuti-per-ciao]]): il prompt non ci
 * entra **prima ancora** che la persona scriva.
 *
 * Sapere che «non entra» però non dice **cosa tagliare**. Questo file misura
 * dove va il peso, e lo tiene fermo: un tool nuovo che porta con sé mezzo
 * kilobyte di descrizione è invisibile a chi lo aggiunge e fatale a chi ha una
 * finestra piccola.
 *
 * ## Perché si contano i BYTE e non i token
 *
 * Perché il tokenizzatore lo porta il modello, e qui non c'è un modello: un
 * conteggio in token sarebbe vero per Qwen e falso per Gemma. I byte sono
 * uguali per tutti, e il rapporto byte/token di un JSON inglese è stabile
 * abbastanza (~3,5-4) da rendere la soglia utile. ⛔ La soglia in token si
 * misura sul dispositivo, non qui.
 */
const OGNI_TOOL_ACCESO = Object.freeze(
    Object.fromEntries(TALOS_AGENT_TOOL_IDS.map((id) => [id, true])),
) as Record<string, boolean>

async function schemiLocali(): Promise<Array<Record<string, unknown>>> {
    const toolset = await createTalosToolset({
        repository: {} as never,
        readVaultFileText: vi.fn(async () => null),
        readVaultFileBytes: vi.fn(async () => null),
        requestConsent: vi.fn(async () => true),
        sessionTitles: vi.fn(async () => new Map<string, string>()),
        libraryEnabled: () => true,
        libraryAccess: () => 'allow',
        memoryWriteAccess: () => 'allow',
        memoryWrite: () => ({}) as never,
        /*
         * ⛔ LE SORGENTI DEL TELEFONO CI VANNO, o si misura meta' del problema.
         *
         * La prima versione di questo file non le passava e contava **18**
         * tool: mancavano torcia, volume, sveglia, sfondo, media, aereo,
         * risparmio, notifiche e tutto il ponte — cioe' proprio il gruppo che
         * il compito #42 deve far chiamare al modello locale. Il totale che ne
         * usciva era meno della meta' del vero, e sarebbe finito in una
         * decisione.
         */
        device: () => ({}) as never,
        privileged: () => ({}) as never,
        notifications: () => ({}) as never,
        libraryWrite: () => ({}) as never,
        notesWrite: () => ({}) as never,
        tasksWrite: () => ({}) as never,
        web: () => ({}) as never,
        research: () => ({}) as never,
        documents: () => ({}) as never,
        images: () => ({}) as never,
        saveVaultFileToDevice: vi.fn(async () => ({}) as never),
        libraryContextPolicy: {} as never,
    })
    const tools = toolset.offer(
        { read: 'allow', write: 'allow', outbound: 'allow' },
        OGNI_TOOL_ACCESO as never,
    )
    return talosToolsForLocalEngine(tools as never) as Array<Record<string, unknown>>
}

function byte(valore: unknown): number {
    return new TextEncoder().encode(JSON.stringify(valore)).length
}

/**
 * MISURATO il 2026-08-09: **61 tool, 38.324 byte**. Il tetto sta sopra di circa
 * il 10% — abbastanza per un tool nuovo normale, non abbastanza per uno che
 * porta con sé un'unione discriminata.
 *
 * ⛔ Non è un limite estetico. Con ~3,7 byte per token sono **~10.400 token di
 * soli schemi**, e la finestra di Gemma 2 2B IT è **8.192**: già oggi il
 * modello che l'owner vuole usare non ci sta. Ogni byte aggiunto qui allontana
 * quel traguardo, e lo fa in silenzio.
 */
/*
 * ⛔ 42.000 → 42.300, il 2026-08-13, per `invia_file` — owner: «si possa dire
 * alla chat di inviare un file della libreria via social media o app di
 * messaggistica».
 *
 * Il commento qui sopra diceva che il 10% di margine bastava «per un tool nuovo
 * normale». `invia_file` È un tool nuovo normale — tre parametri, nessuna
 * unione discriminata — e pesa **271 byte**. Il margine se l'erano mangiato i
 * tool arrivati fra agosto e oggi: la superficie era già a ~41.950.
 *
 * ⛔ E il peso è stato inseguito prima di alzare, in tre forme misurate:
 *     prima stesura (descrizione lunga)   42.819   ⛔ +819
 *     descrizione all'essenziale          42.354   ⛔ +354
 *     + titolo corto, parametri asciutti  42.221   ⛔ +221
 * Sotto i 271 byte non si scende senza togliere al modello qualcosa che non
 * può dedurre — per esempio che deve CHIEDERE invece di indovinare quale file.
 *
 * ⛔ E resta vero ciò che dice il commento sopra: con ~3,7 byte per token siamo
 * a ~11.400 token di soli schemi contro gli 8.192 di Gemma 2 2B. Quel traguardo
 * era già fuori portata prima di questi 271 byte, e la strada per riprenderlo
 * non è negare un tool: è il catalogo compatto per il motore locale.
 */
/*
 * ⛔ 42.300 → 42.400, il 2026-08-13 (fase 1), per il parametro `invia` di
 * `invia_file`.
 *
 * ⛔ E questo NON si poteva togliere. La regola del progetto e' esplicita:
 * «SI DICHIARA, non si deduce dal verbo che ha usato la persona — "scrivi ad
 * Antonino che arrivo" e "prepara un messaggio per Antonino" sono due
 * intenzioni diverse, e indovinare quale sia vuol dire mandare per sbaglio un
 * messaggio a una persona vera». Da oggi TALOS preme «invia» anche sui file:
 * senza questo campo dedurrebbe dal verbo se un'azione IRREVERSIBILE va fatta.
 *
 * Il peso e' stato inseguito prima, in due forme misurate:
 *     descrizione lunga («False only if the user asked…»)   42.393
 *     descrizione essenziale («False = prepare only…»)      42.374
 *
 * ⇒ 74 byte per non indovinare su una cosa che non si annulla.
 */
/*
 * ⛔⛔ 42.400 → 42.500, il 2026-08-13 — e questa volta il tetto NON è più il
 * vincolo che dice di essere. Va letto insieme al test del PREFISSO, in fondo.
 *
 * ## Cos'ha chiesto l'owner
 *
 * «Alza il tetto SOLO se strettamente necessario e come ultima possibilità.»
 * Queste sono le possibilità provate prima, in ordine, con i numeri:
 *
 *   1. **un attrezzo nuovo** `device_alarm_dismiss`            42.709   ⛔ +309
 *   2. **accorpato** su `device_alarm` come parametro `off`    42.540   ⛔ +166
 *   3. descrizione ridotta all'osso                            42.486   ⛔ +112
 *   4. cercato grasso altrove: `document_create` (4.878 b, il più pesante) è
 *      **già** ottimizzato a campi di una lettera — `t`, `x`, `l`, `v`, `d`.
 *      `device_open_settings` ha 739 b di descrizione, ma è tutta portante:
 *      dentro c'è la riga «USE THIS WHENEVER YOU CANNOT DO SOMETHING
 *      YOURSELF», che è ciò che le fa aprire la schermata invece di dire di no.
 *
 * ⇒ 197 byte recuperati su 309. I 112 che restano sono il **verso contrario**
 * di una capacità che avevamo solo in andata, e che al verso opposto faceva
 * danno: sveglia ancora armata, una seconda alle 07:30, Orologio aperto in
 * faccia alla persona. Non è un ornamento che si possa togliere.
 *
 * ## ⛔ E perché alzarlo qui non allenta niente
 *
 * Questo numero misura gli schemi INTERI. Il commento in cima dice che è «il
 * vincolo del locale», e dal 2026-08-09 **non lo è più**: il motore locale
 * riceve l'indice compatto (5.087 b), non questi schemi. Dal 2026-08-13
 * nessuno riceve più il totale grezzo —
 *
 *   Anthropic                      → prefisso di 4 attrezzi, ricerca lato server
 *   locale · OpenAI · Gemini · OR  → indice compatto, −87%
 *
 * ⇒ Il vincolo vero si è spostato, e il test che lo custodisce è
 * **«misura quanto RESTA NEL PREFISSO aprendo a gradi»**, in fondo a questo
 * file: al massimo 5 attrezzi davanti al modello e più dell'80% in meno. Quello
 * è più severo di questo, e non si tocca.
 */
/*
 * ⛔ 42.500 → 43.100, il 2026-08-14, per `calendar_read`.
 *
 * ## ⛔⛔ E qui NON si è inseguito il byte, di proposito
 *
 * Owner, lo stesso giorno: «non dobbiamo azzoppare la nostra app per farla
 * entrare nel grafo; **mai cambiare i contratti** per far entrare roba; se
 * dobbiamo azzoppare l'app allora **come ultima scelta alziamo il tetto**».
 *
 * La descrizione di un attrezzo **è** un contratto: è la riga che il modello
 * legge per decidere se chiamarlo. Accorciarla per far tornare un numero
 * cambia le sue scelte — ed è esattamente come, poche ore prima, avevo unito
 * due difese di sicurezza del prompt per risparmiare 21 byte.
 *
 * ## Cosa compra, in una riga
 *
 * Il difetto che chiude, misurato sul Pad: «che impegni ho domani?» e TALOS
 * rispondeva «non hai compiti registrati per domani», avendo guardato le
 * PROPRIE note. Una risposta sicura e falsa sulla giornata di una persona.
 *
 * E la riga sulle festività («left out unless withHolidays is true») non è
 * ornamento: senza, il modello non sa che il filtro esiste e non può offrirlo.
 *
 * 551 byte per una capacità intera, dichiarata com'è invece che come sta.
 */
/*
 * ⛔ 43.100 → 43.700, poche ore dopo, per `calendar_write`.
 *
 * ⭐ È il SORPASSO su Gemini, in due punti che Google dichiara lui non avere:
 *  1. scrive **senza aprire nessuna app** — `ACTION_INSERT` aprirebbe il
 *     Calendario, cioè l'errore che la sveglia ci ha appena mostrato;
 *  2. mette **luogo e note**, che Gemini «non sa modificare».
 *
 * ⛔ E la riga più lunga della descrizione — «se ci sono più calendari
 * scrivibili e nessuno è nominato, questo torna l'elenco: chiedi quale» — è
 * quella che NON si taglia. Senza, il modello non sa che esiste una domanda da
 * fare e sceglie lui su quale agenda finisce un appuntamento: quella di
 * famiglia e quella di lavoro le leggono persone diverse.
 *
 * 597 byte perché la capacità sia dichiarata com'è, non come sta nel tetto.
 *
 * ## ⛔⛔ 43.700 → 43.850, il 2026-08-14, e il tetto si ALZA di proposito
 *
 * MISURATO sul Pad alle 13:33, in una chat pulita: «metti in agenda **domani**
 * alle 21» — dove domani era sabato 15 — è finito su **lunedì 17**, e nel
 * frattempo TALOS diceva «domenica 16». Tre giorni diversi per la stessa
 * richiesta. `time_now` sul telefono rispondeva giusto («oggi è venerdì 14»):
 * il modello semplicemente **non l'ha chiamato**.
 *
 * La cura sta nella descrizione del campo `from`: «For a relative date
 * ("tomorrow") call time_now FIRST». Riprovato in chat nuova: chiesto sabato
 * 15 alle 17, scritto `dtstart` = sabato 15 alle 17. ⇒ Quei byte **funzionano**,
 * e una riga nel prompt di sistema no — la si legge ventimila token prima.
 *
 * ⛔ La regola dell'owner (14/8) è esplicita: non si azzoppa l'app per far
 * tornare un tetto. Accorciare quella riga fino a farla entrare vorrebbe dire
 * rimettere in gioco un appuntamento sul giorno sbagliato, che è il difetto che
 * la persona paga.
 *
 * ⛔⛔ E l'ho provato: la riga era stata accorciata per stare sotto, e così
 * facendo avrei spedito **un testo diverso da quello misurato sul telefono**.
 * Il tetto sale di 150 byte e la riga resta quella provata, parola per parola —
 * l'alternativa era una cura verificata in laboratorio e cambiata prima di
 * uscire.
 */
/*
 * ⭐⭐ 43.850 → 44.200, il 2026-08-14, per `device_screenshot` (268 byte).
 *
 * L'unica lacuna trovata dal censimento contro Gemini: «fai uno screenshot» era
 * la sola richiesta a cui **nessun attrezzo** rispondeva.
 *
 * ⛔ La descrizione NON si accorcia, e le sue tre parti sono tre cose diverse:
 * *cosa fa* (screenshot di sistema di ciò che c'è adesso), *dove finisce* (in
 * galleria — senza, il modello dice «fatto» e la persona non sa dove guardare),
 * e *che l'immagine a TALOS non arriva* — senza quella, il modello si offre di
 * mostrarla e promette una cosa che non ha. È un contratto, e vale la regola
 * dell'owner scritta qui sopra: si alza il tetto, non si accorcia la riga.
 */
/*
 * ⭐⭐ 44.200 → 44.500, il 2026-08-14, per il CALENDARIO che impara a cambiare.
 *
 * Censimento contro Gemini: lui dichiara «aggiungere, visualizzare **o
 * modificare** eventi», TALOS sapeva creare e leggere. La conseguenza è quella
 * già misurata sulla sveglia: davanti a «sposta la cena alle 21» il modello,
 * avendo solo l'attrezzo che METTE, ne crea un secondo — e la persona si ritrova
 * due impegni che si contraddicono.
 *
 * ⛔ I 154 byte sono due descrizioni, e nessuna delle due è ornamento: «manda
 * solo i campi da cambiare» impedisce di riscrivere gli altri, «non si annulla»
 * qualifica una cancellazione. Sono contratti — vale la regola dell'owner
 * scritta più sopra: si alza il tetto, non si accorciano le righe.
 */
/*
 * ⭐⭐ 2026-08-14, `device_unread_mail` (414 byte) — E IL TETTO NON SI MUOVE.
 *
 * La regola dell'owner, verbatim: «appiattire senza azzoppare è cambiare
 * contratti attuali, SEMPRE. **SE NON HAI ALTRA SCELTA E HAI SGRASSATO TUTTO**
 * aumenta, ma con parsimonia». Le tre volte qui sopra il tetto era salito perché
 * ogni byte era un contratto provato sul telefono. Stavolta no: c'era grasso.
 *
 * La riga «Call research_list first to get the research id.» stava scritta DUE
 * volte in sei `research_*`: nella descrizione e nel `.describe()` del campo
 * `id` — cioè nel posto più vicino al gesto, dove il modello la legge mentre
 * riempie proprio quel campo. Tolta la copia lontana: **−298 byte**, e la
 * sorgente dell'id resta dichiarata dove serve.
 *
 *   44.354 (prima) + 414 (posta) − 298 (sgrassato) = **44.470**
 *
 * ⛔ Restano **30 byte** di margine, e chi legge deve saperlo: il prossimo
 * attrezzo non entra senza sgrassare ancora o senza alzare il tetto. Non lo
 * alzo adesso «per stare comodo» — alzarlo senza necessità è esattamente ciò
 * che la regola vieta, e un tetto alzato in anticipo non difende più niente.
 *
 * ## 2026-08-15 — il prossimo attrezzo è arrivato: 44.500 → 45.100
 *
 * È `device_location`, e nasce da un difetto che l'owner ha visto: «ho chiesto
 * che ristorante mi consigli per cenare stasera e lui mi ha dato una posizione
 * completamente diversa». MISURATO: TALOS non leggeva la posizione da nessuna
 * parte, quindi il modello inventava la città.
 *
 * ⛔ PRIMA si è sgrassato, come vuole la regola. La prima stesura della
 * descrizione pesava 779 byte ed elencava anche gli stati di ritorno — che il
 * modello riceve **dal risultato**, già con dentro la frase da dire. Tolti:
 * **−353 byte**, e il tool ne costa 456 netti.
 *
 * ⛔ Il resto NON si taglia: è il QUANDO chiamarlo, cioè l'unica parte che
 * cambia la decisione del modello ed è esattamente ciò che cura il difetto. Qui
 * vale la regola dell'owner — «mai azzoppare l'app per far tornare un tetto: se
 * l'alternativa è peggiorare l'app, il tetto si alza».
 *
 *   44.470 (prima) + 456 (posizione) = **44.926**
 *
 * ⇒ Tetto a 45.100, cioè **174 byte** di margine. Stretto di proposito: un
 * tetto che avanza spazio non difende niente, ed è la stessa disciplina con cui
 * qui si erano lasciati 30 byte.
 *
 * ## 2026-08-17 — 45.100 → 45.200, e stavolta lo sgrassare COSTAVA
 *
 * Il difetto, sul Pad: «manda il file X a Y» e `invia_file` **non parte mai**.
 * Il registro delle notifiche dice quale attrezzo è girato davvero — «Ricerca
 * nella Libreria», e basta. Il modello cerca, racconta il contenuto dei file, e
 * non manda.
 *
 * ⛔ La descrizione di `invia_file` non diceva MAI cosa fa: due note sui
 * parametri, senza un verbo. Accanto, `library_search` dichiara il territorio a
 * lettere — «Use it BEFORE answering questions about the user's own files».
 *
 * ⛔ E la prima sonda ha detto che non c'entrava: tre attrezzi in gara,
 * `invia_file` scelto **12/12** con la descrizione vecchia. Era una sonda
 * TROPPO FACILE. Rimessi i concorrenti veri — `library_search`, `library_read`,
 * `library_export`, `document_create`, `app_azione`, `device_screen_drive` —
 * quattro formulazioni per tre giri ciascuna:
 *
 *   | forma                       | byte | invia_file scelto |
 *   |-----------------------------|------|-------------------|
 *   | quella di prima             |  130 |  8/12             |
 *   | + «do NOT search first»     |  217 |  9/12             |
 *   | + il verbo, stretto         |  248 | 10/12             |
 *   | **quella adottata**         |  318 | **12/12**         |
 *
 * «scrivi a X su WhatsApp allegando Y» andava **0/3** a `library_search`.
 *
 * ⛔ PRIMA si è sgrassato, come vuole la regola — e lo sgrassare è stato
 * MISURATO invece che dato per buono. «this tool matches the name itself»
 * sembrava ripetere la frase dopo; tolta (−35 byte) il punteggio è sceso a
 * **10/12**, e proprio la formulazione che falliva è tornata a 1/3. Non era
 * grasso: è la parte che dice al modello che non deve cercare prima.
 *
 *   44.926 (prima) + 190 (il verbo davanti) = **45.116**
 *
 * ⇒ Tetto a 45.200, cioè **84 byte** di margine — più stretto di prima, come
 * vuole la disciplina di questo file. E vale la regola dell'owner: «mai
 * azzoppare l'app per far tornare un tetto». Qui l'alternativa era un attrezzo
 * che il modello non chiama, cioè una funzione che non esiste.
 */
const TETTO_BYTE = 45_200

/**
 * ⛔ E nessun tool da solo può valere un ottavo di tutto.
 *
 * `document_create` oggi pesa **4.878 byte** — il 12,7% dell'intera superficie,
 * per via dell'unione discriminata degli undici blocchi del report. È
 * ricchezza vera e resta; il tetto serve a impedire che ne nasca un secondo
 * senza che nessuno se ne accorga.
 */
const TETTO_UN_TOOL = 5_200

describe('il peso degli schemi dei tool, che è il vincolo del locale', () => {
    it('⛔ la superficie totale resta sotto il tetto', async () => {
        const totale = (await schemiLocali()).reduce((somma, voce) => somma + byte(voce), 0)
        expect(totale).toBeLessThan(TETTO_BYTE)
    })

    it('⛔ nessun singolo tool sfonda da solo', async () => {
        const grossi = (await schemiLocali())
            .map((voce) => ({
                nome: String((voce.function as Record<string, unknown>).name),
                peso: byte(voce),
            }))
            .filter((riga) => riga.peso > TETTO_UN_TOOL)
        expect(grossi).toEqual([])
    })

    it('misura e mostra dove va il peso', async () => {
        const schemi = await schemiLocali()
        const righe = schemi.map((voce) => {
            const f = voce.function as Record<string, unknown>
            return {
                nome: String(f.name),
                totale: byte(voce),
                descrizione: byte(f.description),
                parametri: byte(f.parameters),
            }
        }).sort((a, b) => b.totale - a.totale)

        const totale = righe.reduce((somma, r) => somma + r.totale, 0)
        const descrizioni = righe.reduce((somma, r) => somma + r.descrizione, 0)
        const parametri = righe.reduce((somma, r) => somma + r.parametri, 0)

        // eslint-disable-next-line no-console
        console.log(
            `\nTOOL: ${righe.length}`
            + `\nTOTALE: ${totale} byte (~${Math.round(totale / 3.7)} token)`
            + `\n  descrizioni: ${descrizioni} byte (${Math.round(descrizioni * 100 / totale)}%)`
            + `\n  parametri:   ${parametri} byte (${Math.round(parametri * 100 / totale)}%)`
            + `\n\nI DODICI PIU' PESANTI:\n`
            + righe.slice(0, 12).map((r) =>
                `${String(r.totale).padStart(6)} b  desc ${String(r.descrizione).padStart(5)}  par ${String(r.parametri).padStart(5)}  ${r.nome}`,
            ).join('\n'),
        )

        expect(righe.length).toBeGreaterThan(10)
    })

    /*
     * ⭐⭐⭐ QUANTO RESTA NEL PREFISSO con l'apertura a gradi.
     *
     * È la misura che giustifica il meccanismo. Il tetto qui sopra continua a
     * guardare il TOTALE, e deve: gli schemi si spediscono comunque tutti, e
     * per il motore locale — che non ha una ricerca lato server — il totale è
     * ancora ciò che conta. Questa riga misura l'altra metà: cosa entra nel
     * **prefisso** di un modello Anthropic, che è ciò che il modello legge a
     * ogni turno e su cui si misura la sua capacità di scegliere.
     */
    it('misura quanto RESTA NEL PREFISSO aprendo a gradi', async () => {
        const { TALOS_ATTREZZI_SEMPRE_IN_VISTA } = await import('@/lib/tools/aperturaProgressiva')
        const schemi = await schemiLocali()
        const inVista = schemi.filter((voce) => TALOS_ATTREZZI_SEMPRE_IN_VISTA
            .includes(String((voce.function as Record<string, unknown>).name)))

        const totale = schemi.reduce((somma, voce) => somma + byte(voce), 0)
        const prefisso = inVista.reduce((somma, voce) => somma + byte(voce), 0)
        const risparmio = Math.round((totale - prefisso) * 100 / totale)

        // eslint-disable-next-line no-console
        console.log(
            `\nPREFISSO CON APERTURA A GRADI`
            + `\n  tutti:      ${schemi.length} tool, ${totale} byte (~${Math.round(totale / 3.7)} token)`
            + `\n  nel prefisso: ${inVista.length} tool, ${prefisso} byte (~${Math.round(prefisso / 3.7)} token)`
            + `\n  ⇒ ${risparmio}% in meno davanti al modello a ogni turno`,
        )

        /*
         * ⛔ La soglia della documentazione: sotto i 30-50 attrezzi la scelta
         * regge. Con quattro in vista siamo larghi, e questo test cade il
         * giorno in cui qualcuno allarga la lista senza pensarci.
         */
        expect(inVista.length).toBeLessThanOrEqual(5)
        expect(risparmio).toBeGreaterThan(80)
    })
})
