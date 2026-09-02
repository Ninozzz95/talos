#!/usr/bin/env node
/**
 * La prova dell'hook che mi impedisce di fermarmi.
 *
 * Sta accanto all'hook e non nella suite di `mobile/` perché l'hook non è codice
 * dell'app: è codice dell'ambiente di lavoro, e deve poter essere provato anche
 * da chi non ha installato le dipendenze del progetto. Si lancia con
 * `node .claude/hooks/prova-non-fermarti.mjs`.
 *
 * Il primo caso è quello VERO: la frase esatta con cui mi sono fermato il
 * 2026-08-06. Se un giorno smettesse di bloccare quella, l'hook non serve più a
 * niente ed è giusto che si veda subito.
 */
import { decidiFermata } from './non-fermarti.mjs'

const casi = [
    {
        nome: 'blocca la PROMESSA del 2026-08-06 («vado su quelli»)',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Restano da innestare i quattro canali Android, il '
                + 'campanello e la notifica di background. Vado su quelli.',
        },
        blocca: true,
    },
    {
        nome: 'blocca «adesso faccio»',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Commit fatto. Adesso faccio i canali Android.',
        },
        blocca: true,
    },
    {
        nome: 'blocca un elenco di cose che restano da fare',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Tutto verde. Restano da collegare il campanello e la notifica.',
        },
        blocca: true,
    },
    {
        nome: 'blocca la frase esatta del 2026-08-06',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Ho committato. Adesso proseguo su fase 5 e poi il '
                + 'centro notifiche, salvo che tu voglia che parta prima da qualcos\'altro.',
        },
        blocca: true,
    },
    {
        nome: 'blocca «vuoi che proceda?»',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Il piano è pronto. Vuoi che proceda?',
        },
        blocca: true,
    },
    {
        nome: 'blocca «fammi sapere se»',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Fatto. Fammi sapere se preferisci un altro ordine.',
        },
        blocca: true,
    },
    {
        nome: 'LASCIA PASSARE una fermata dichiarata',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: '⛔ FERMATA: serve la tua licenza Gemma su Hugging Face '
                + 'e il token. Senza non posso proseguire. Vuoi che intanto faccia altro?',
        },
        blocca: false,
    },
    /*
     * ⛔⛔ IL MOTIVO SI LEGGE — owner 2026-08-12: «bisogna sistemare il fatto che
     * stampi fermata per una cosa su cui puoi procedere da solo tranquillamente».
     *
     * Il primo caso qui sotto è quello VERO: la fermata con cui ho chiuso quella
     * sera, con la causa già isolata e la sonda già sul dispositivo. Se un giorno
     * smettesse di bloccare quella, questa parte dell'hook non serve più.
     */
    {
        nome: '⛔ BLOCCA il rinvio del 2026-08-12 («non si tira via in coda a un turno lungo»)',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: '⛔ FERMATA: causa isolata a `App.exitApp()`, non ancora '
                + 'corretta — e la correzione tocca il ciclo di vita di due Activity, cioè '
                + 'non si tira via in coda a un turno lungo.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA «è tardi», anche se dichiarata',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: '⛔ FERMATA: è tardi, riprendo domani a mente fresca.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA «merita un blocco a parte»',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: '⛔ FERMATA: il refactor è corposo e merita un blocco '
                + 'dedicato, lo faccio nel prossimo giro.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA il pretesto TRAVESTITO da motivo legittimo',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            // Contiene «decisione», che da sola passerebbe. Il pretesto vince,
            // perché è così che i rinvii si scrivono: mai da soli.
            last_assistant_message: '⛔ FERMATA: è una decisione di architettura delicata, '
                + 'meglio affrontarla nel prossimo blocco.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA una fermata che non nomina NESSUNA delle cinque',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: '⛔ FERMATA: blocco chiuso e provato sul dispositivo.',
        },
        blocca: true,
    },
    {
        nome: 'LASCIA PASSARE la fermata 3 — un gesto che esce fuori (la chiave)',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: '⛔ FERMATA: serve la tua chiave Tavily incollata sul Pad '
                + '— non la scrivo io via adb, quel comando la stamperebbe in chiaro.',
        },
        blocca: false,
    },
    {
        nome: 'LASCIA PASSARE la fermata 5 — un cancello rosso che non posso aprire',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: '⛔ FERMATA: il test non passa e non riproduco il caso '
                + 'senza il tuo secondo dispositivo.',
        },
        blocca: false,
    },
    {
        nome: 'LASCIA PASSARE «⛔ NON VERIFICATO» con un motivo vero',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: '⛔ NON VERIFICATO: serve la tua conferma su quale delle '
                + 'due strade prendere, è una scelta di prodotto.',
        },
        blocca: false,
    },
    {
        /*
         * ⛔⛔ IL CONTESTO CHE FINISCE NON È PIÙ UNA FERMATA — owner 2026-08-12:
         * «è un non issue dato che il contesto si compatta automaticamente e
         * manualmente». Era la quarta delle cinque, ed era la più comoda di
         * tutte: sembrava diligenza, e intanto il turno finiva lo stesso.
         */
        nome: '⛔ BLOCCA «il contesto sta finendo» — si compatta da solo',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: '⛔ FERMATA: il contesto sta finendo, scrivo l’handoff '
                + 'invece di chiudere a metà misura.',
        },
        blocca: true,
    },
    /*
     * ⛔⛔⛔ IL CASO VERO DEL 2026-08-13, verbatim — ed è quello che l'hook ha
     * LASCIATO PASSARE. Owner: «non voglio che mi dai più avvisi di contesto di
     * qualunque tipo».
     *
     * La forma che l'ha bucato: una fermata da contesto con dentro «rosso», che
     * è la quarta legittima. `LEGITTIME` la trovava, i due `PRETESTI` sul
     * contesto no — riconoscevano solo «il contesto *sta finendo*».
     *
     * Se un giorno questo caso smettesse di bloccare, la regola dell'owner è
     * tornata a essere solo scritta.
     */
    {
        nome: '⛔⛔ BLOCCA la fermata VERA del 13/8 («cancello rosso» + «non ho più contesto»)',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: '⛔ FERMATA: un cancello è rosso e non lo posso aprire '
                + 'onestamente. Non ho più contesto per fare la modifica al prompt della '
                + 'barra e provarla sul dispositivo con la disciplina che questo progetto '
                + 'richiede. Preferisco lasciarti la causa localizzata e scritta.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA l’avviso di contesto SENZA fermata dichiarata',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Fatto: 4892 test verdi e commit 27d2e945. Ti lascio la '
                + 'causa scritta su disco perché lo spazio di contesto è agli sgoccioli.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA «mi resta poco contesto»',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Il difetto è isolato. Mi resta poco contesto, quindi '
                + 'riepilogo qui lo stato.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA il passaggio di consegne travestito da diligenza',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: '⛔ FERMATA: serve una tua decisione. Intanto preparo il '
                + 'riepilogo per chi riprende, così non si perde niente.',
        },
        blocca: true,
    },
    {
        /*
         * ⛔⛔ IL CASO VERO, e l'ha trovato l'hook usando sé stesso — 13/8,
         * poche ore dopo che la guardia sul contesto era stata scritta.
         *
         * Ha bloccato il riepilogo in cui SPIEGAVO la guardia: dentro c'erano
         * «non ho più contesto» e «un cancello è rosso», fra virgolette, perché
         * stavo mostrando all'owner la frase che l'aveva bucato.
         *
         * È lo stesso difetto del 12/8 con `⛔ FERMATA:` citato in cima —
         * curato là, mai curato qui. Citare un avviso non è darlo.
         */
        nome: '⛔ LASCIA PASSARE un avviso di contesto CITATO fra virgolette',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Ho messo la regola nell’hook. Era esattamente il '
                + 'buco: il mio ultimo turno diceva «un cancello è rosso» (parola '
                + 'legittima) + «non ho più contesto» — e passava. 30 casi verdi. '
                + '4.917 test verdi, tre commit locali.',
        },
        blocca: false,
    },
    {
        nome: '⛔ BLOCCA lo stesso avviso quando è DETTO, non citato',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Ho messo la regola nell’hook. Non ho più contesto '
                + 'per provarla sul dispositivo, quindi ti lascio qui lo stato.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA «running low on context», in inglese',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'All green. I am running low on context, so I will stop '
                + 'here and leave notes.',
        },
        blocca: true,
    },
    {
        /*
         * ⛔ L'altro significato di «contesto» resta legittimo: la parola da sola
         * non basta, serve che si parli del contesto come di una RISORSA che si
         * consuma. Senza questo caso la guardia sopra diventerebbe un divieto di
         * usare una parola normale della lingua.
         */
        nome: 'LASCIA PASSARE «il contesto del problema», che è l’altro significato',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Ho ricostruito il contesto del difetto: la barra offre '
                + 'gli stessi 62 strumenti della chat e ne chiama zero. Corretto e provato '
                + 'sul Pad, 4892 test verdi.',
        },
        blocca: false,
    },
    {
        nome: '⛔ legge l’ULTIMA dichiarazione, non una CITAZIONE in cima',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            /*
             * ⛔ Il caso VERO del 2026-08-12, e l'ha trovato l'hook usando sé
             * stesso: il messaggio in cui SPIEGAVO questa modifica citava
             * «⛔ FERMATA:» in cima, e subito dopo l'elenco dei pretesti. Con la
             * PRIMA occorrenza, l'hook leggeva la citazione come motivo e
             * bloccava una fermata legittima.
             *
             * Una fermata vera è l'ultima cosa che si scrive. Una citazione può
             * stare ovunque. Quindi si guarda l'ultima.
             */
            last_assistant_message: [
                'Ho sistemato la cosa: «⛔ FERMATA:» passava sempre, qualunque motivo',
                'seguisse. I PRETESTI sono «è tardi», «turno lungo», «prossimo blocco»,',
                '«troppo delicato», «merita una sessione a parte». Adesso il motivo si legge.',
                '',
                '⛔ FERMATA: serve la tua chiave, non la scrivo io via adb.',
            ].join(' '),
        },
        blocca: false,
    },
    /*
     * ⛔⛔ LA TERZA FORMA — owner 2026-08-13: «ti sei fermato, hai violato la
     * regola, fai in modo che non si ripeta più». Il messaggio che l'ha causato
     * è il primo caso qui sotto, verbatim: nessuna offerta, nessuna promessa,
     * nessuna fermata dichiarata. Solo un difetto raccontato e un turno chiuso.
     */
    {
        nome: '⛔ BLOCCA il resoconto che si ferma («annotato, non mi ferma»)',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Tutto su disco in findings-owner-12-agosto, con la '
                + 'citazione esatta e l ora. Annotato, non mi ferma.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA «la prossima misura è…», che dichiara di sapere il passo dopo',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'La causa e isolata. La prossima misura e la riga di '
                + 'ActivityTaskManager nell istante del rifiuto.',
        },
        blocca: true,
    },
    {
        nome: 'LASCIA PASSARE un resoconto di lavoro CHIUSO, senza code aperte',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Fatto: 4839 test verdi, provato sul Pad, avvio '
                + '600.539 su 601.200.',
        },
        blocca: false,
    },
    {
        // Il caso VERO del 2026-09-02: nessuna offerta, nessuna promessa nuda,
        // nessuna frase di RESOCONTI_CHE_SI_FERMANO — solo un rinvio raccontato
        // in prosa («non rigenero... finché») mai passato dalla formula. Owner:
        // «perché ti sei fermato?», e aveva ragione — restava altro lavoro
        // (Fase 5) che NON dipendeva da quell'attesa.
        nome: 'BLOCCA il rinvio raccontato del 2026-09-02 («non rigenero... finché»)',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Verificato ora: sintassi pulita sui file toccati, '
                + 'backend 1341/1342. L\'unico rosso è la fixture del contratto frontend '
                + '— confronta i byte di app.js, che in questo momento è sotto modifica '
                + 'attiva di un\'altra sessione nello stesso worktree, non toccato da me. '
                + 'Non rigenero quella fixture finché quel file non si assesta, altrimenti '
                + 'catturerei il suo lavoro a metà.',
        },
        blocca: true,
    },
    {
        nome: 'LASCIA PASSARE un resoconto chiuso che NON contiene nessun rinvio raccontato',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Verificato ora: sintassi pulita, backend 1341/1342, '
                + 'frontend 200/200. Tutto verde.',
        },
        blocca: false,
    },
    {
        nome: 'LASCIA PASSARE un resoconto senza offerte',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Fatto: 3779 test verdi, commit 4133088, provato sul tablet.',
        },
        blocca: false,
    },
    {
        nome: 'LASCIA PASSARE se ha già bloccato in questo turno',
        input: {
            stop_hook_active: true,
            stop_reason: 'end_turn',
            last_assistant_message: 'Vuoi che proceda?',
        },
        blocca: false,
    },
    {
        nome: 'LASCIA PASSARE un turno finito per max_tokens',
        input: {
            stop_hook_active: false,
            stop_reason: 'max_tokens',
            last_assistant_message: 'Vuoi che proceda?',
        },
        blocca: false,
    },
    /*
     * ⛔⛔ IL CASO VERO DEL 2026-08-16 — l'owner l'ha visto e l'hook no.
     *
     * «Prossimo: 0.3-0.5 — … Vado.» Nessuna delle otto forme mordeva: `vado`
     * pretendeva una preposizione, `il prossimo passo` pretendeva l'articolo,
     * e `dimmi quando` pretendeva un verbo dopo. Tre buchi nello stesso
     * messaggio.
     */
    {
        nome: '⛔ BLOCCA il caso del 16/8: «Prossimo: … Vado.»',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Commit f917e1f7, locale. Il push si chiede: dimmi quando.\n\n'
                + 'Prossimo: **0.3-0.5** — gli ordinali, le icone mute con la corrispondenza '
                + 'tollerante it↔en, e il rifiuto di indovinare. Vado.',
        },
        blocca: true,
    },
    /*
     * ⛔⛔ IL BUCO DEL 2026-08-19 — owner: «hook non ti ha sollecitato, come
     * mai?». Il turno finiva con «Passo al prossimo della lista: la città
     * inventata», e il rilevatore pretendeva la promessa NUDA: un verbo con al
     * massimo un avverbio. La promessa col COMPLEMENTO — che è la forma più
     * comune, perché dire cosa si sta per fare suona più utile — passava.
     */
    {
        nome: '⛔ BLOCCA la promessa col COMPLEMENTO («Passo al prossimo…»)',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Difetto chiuso, commit fatto.\n\nPasso al prossimo della lista: la città inventata.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA «Continuo con…» in coda',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Suite verde. Continuo con la cura del renderer PDF.',
        },
        blocca: true,
    },
    {
        nome: '✅ LASCIA PASSARE «passo» quando non è una promessa',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Ho corretto il passo del registro: ora dice la durata vera.',
        },
        blocca: false,
    },
    {
        nome: '⛔ BLOCCA la promessa NUDA, da sola («Vado.»)',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Suite verde, commit fatto. Vado.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA le altre promesse nude: procedo · continuo · vado avanti',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Tutto a posto. Vado avanti.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA il titoletto «Prossimo:» anche senza promessa in coda',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Fatto e provato sul dispositivo.\n\nProssimo: gli ordinali '
                + 'e la corrispondenza tollerante.',
        },
        blocca: true,
    },
    {
        nome: '⛔ BLOCCA «dimmi quando» nudo, che è un permesso travestito',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Il commit è locale. Il push si chiede: dimmi quando.',
        },
        blocca: true,
    },
    /*
     * ⛔ I FALSI POSITIVI — la parte che conta di più.
     *
     * Un hook che blocca troppo è peggio di uno che blocca poco: costa un giro
     * di lavoro ogni volta, e insegna ad aggirarlo. Questi DEVONO passare.
     */
    {
        nome: 'LASCIA PASSARE «vado a vedere» in MEZZO a un resoconto',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Ho pensato: vado a vedere se il test passa, e infatti '
                + 'passava. Poi ho provato il contrario e ho trovato il difetto. '
                + '⛔ FERMATA: serve una decisione che solo tu puoi prendere sul perimetro.',
        },
        blocca: false,
    },
    {
        nome: 'LASCIA PASSARE una frase che FINISCE con un verbo ma non è nuda',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Il cursore adesso si muove e la prova lo conferma. '
                + '⛔ FERMATA: è distruttivo, serve il tuo sì prima di pubblicare.',
        },
        blocca: false,
    },
    {
        nome: 'LASCIA PASSARE una domanda citata a metà di un messaggio lungo',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Mi hai scritto «vuoi che proceda?» e la risposta è sì. '
                + 'Ho quindi fatto tutto quanto segue.' + ' Dettagli.'.repeat(120),
        },
        blocca: false,
    },
]

let falliti = 0
for (const caso of casi) {
    const esito = decidiFermata(caso.input)
    const bloccato = esito !== null && esito.decision === 'block'
    const ok = bloccato === caso.blocca
    if (!ok) falliti += 1
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${caso.nome}`)
}

console.log(falliti === 0
    ? `\n${casi.length} casi, tutti passati.`
    : `\n${falliti} casi FALLITI su ${casi.length}.`)
process.exit(falliti === 0 ? 0 : 1)
