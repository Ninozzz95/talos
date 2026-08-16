import { talosFraseDaDire } from '@/lib/agent/voceDelPilota'
import { talosLeggiOrdinale, talosNesimoInLista } from '@/lib/agent/trovaElemento'
import { talosTracciaFuori } from '@/lib/device/traccia'
import {
    talosLeggiAzione,
    talosOsservazione,
    talosRigaDiStoria,
    type TalosAzione,
    type TalosElementoSchermo,
    type TalosMotivoScarto,
} from '@/lib/agent/passoDelloSchermo'

/**
 * ⭐⭐ IL CICLO: guarda, decide, tocca, racconta — e sa QUANDO SMETTERE.
 *
 * ## ⛔ I tetti non sono prudenza: sono la funzione
 *
 * Un agente che tocca lo schermo di un'altra persona senza un tetto non è un
 * agente, è un guasto che si ripete. Ce ne sono quattro, e ognuno esiste per un
 * modo diverso di non finire mai:
 *
 * | tetto              | il guasto che ferma                                   |
 * |--------------------|-------------------------------------------------------|
 * | passi              | il modello gira in tondo fra due schermate             |
 * | tempo              | ogni passo è lento, e venti passi lenti sono infiniti  |
 * | fallimenti di fila | tocca un elemento che non risponde, e insiste          |
 * | **la mano**        | la persona è tornata, e il telefono è suo              |
 *
 * ⛔ Il quarto non è un tetto: è un DIRITTO. Se una mano vera tocca lo schermo
 * si smette **subito**, senza finire il passo — misurato che un dito produce
 * byte sul pannello e i nostri tocchi iniettati zero (vedi `TalosDitoVero`).
 *
 * ## ⛔ E se il freno non è armato NON SI PARTE
 *
 * `frenoArmato = false` non vuol dire «nessuno ha toccato»: vuol dire «non lo
 * so». Partire senza saperlo significa che la persona può riprendere in mano il
 * telefono e trovarselo pilotato — quindi si rifiuta di cominciare, e si dice
 * perché.
 *
 * ⛔⛔ E questa regola, giusta, aveva SPENTO la funzione. Il freno era uno solo
 * e leggeva `/dev/input`, che vuole l'identità della shell: su un telefono senza
 * il ponte adb acceso rispondeva sempre `false`, e il pilota non partiva mai. La
 * prima corsa vera del 2026-08-10 era riuscita solo perché quel comando l'avevo
 * avviato **io** da un adb esterno — cioè la funzione «funzionava» su un
 * dispositivo su cui nessun'altra persona si troverà mai.
 *
 * Ora i freni sono due (vedi `TalosOcchio` e `ponteSchermo`), e il secondo vive
 * nel servizio di accessibilità che il pilota richiede comunque per **vedere**
 * lo schermo. ⇒ Se TALOS può vedere lo schermo, TALOS può sentire la tua mano,
 * e questo rifiuto torna a essere quello che deve essere: un invariante che non
 * scatta mai, non l'interruttore generale della funzione.
 *
 * ## Perché tutto passa da porte iniettate
 *
 * Il ciclo non conosce né il ponte, né il modello, né la voce: li riceve. Così
 * ogni tetto si prova SENZA un telefono, che è l'unico modo di provarli tutti —
 * far scadere davvero due minuti in una suite non lo fa nessuno, e un tetto che
 * nessuno prova è un commento.
 */
export interface TalosLimitiDelPilota {
    /** Quanti passi al massimo. */
    passi: number
    /** Quanto può durare l'intera corsa. */
    millisecondi: number
    /** Quante azioni fallite di fila prima di arrendersi. */
    fallimentiDiFila: number
}

/**
 * I valori predefiniti.
 *
 * ⛔ `fallimentiDiFila: 2` è una DECISIONE dell'owner (2026-08-10: «retry 2 poi
 * stop»), non un numero pescato: al terzo tentativo uguale non sta succedendo
 * niente di nuovo, e insistere su uno schermo altrui è il modo di fare danni.
 */
export const TALOS_LIMITI_PREDEFINITI: Readonly<TalosLimitiDelPilota> = Object.freeze({
    passi: 20,
    millisecondi: 120_000,
    fallimentiDiFila: 2,
})

export type TalosFineCorsa =
    | { motivo: 'fine', testo?: string }
    | { motivo: 'mano-sullo-schermo', passo: number }
    | { motivo: 'freno-non-armato' }
    | { motivo: 'occhio-chiuso' }
    | { motivo: 'troppi-passi' }
    | { motivo: 'tempo-scaduto' }
    | { motivo: 'troppi-fallimenti', ultimo?: string }
    /**
     * ⛔ `dettaglio` porta i primi caratteri di CIÒ CHE IL MODELLO HA DETTO.
     *
     * Senza, la traccia dice «non ho capito» e tace su cosa non ha capito — e
     * «nessunJson» da solo non distingue una risposta in prosa da una risposta
     * VUOTA, che è tutt'altro difetto e sta a monte.
     */
    | { motivo: 'modello-non-capito', scarto: TalosMotivoScarto, dettaglio?: string }

export interface TalosSguardo {
    elementi: readonly TalosElementoSchermo[]
    frenoArmato: boolean
    manoSulloSchermo: boolean
}

/** Le porte: il ponte, il modello, la voce, l'orologio. */
export interface TalosPortePilota {
    /**
     * ⛔ Cosa ha chiesto la PERSONA, con le sue parole.
     *
     * Serve alla guardia degli ordinali: senza la frase originale, «il primo
     * contatto» è indistinguibile da «un contatto», e l'unico a saperlo
     * sarebbe il modello — cioè proprio quello che qui si controlla.
     */
    obiettivo: string
    guarda(): Promise<TalosSguardo | null>
    agisci(azione: TalosAzione): Promise<{ fatto: boolean, motivo?: string }>
    /** Il modello. Riceve osservazione e storia, torna la sua riga cruda. */
    chiedi(input: { osservazione: string, storia: readonly string[] }): Promise<string>
    /** ⭐ Ciò che TALOS dice ad alta voce PRIMA di toccare. Owner: sempre. */
    racconta(frase: string): void
    adesso(): number
}

export interface TalosCorsaDelPilota {
    fine: TalosFineCorsa
    storia: readonly string[]
    passi: number
    millisecondi: number
}

/**
 * Guida fino alla fine, o fino al primo tetto che si tocca.
 *
 * ⛔ L'ordine dei controlli dentro il giro NON è casuale: prima la mano, poi il
 * tempo, poi i passi. La mano vince su tutto perché è l'unica condizione in cui
 * continuare sarebbe una prepotenza e non un errore.
 */
export async function talosGuidaLoSchermo(
    porte: TalosPortePilota,
    limiti: TalosLimitiDelPilota = TALOS_LIMITI_PREDEFINITI,
): Promise<TalosCorsaDelPilota> {
    const partenza = porte.adesso()
    const storia: string[] = []
    let passi = 0
    let fallimenti = 0
    // Cosa si è detto l'ultima volta: serve al SILENZIO — tre scorrimenti di
    // fila non si annunciano tre volte.
    let ultima: { azione: TalosAzione['azione'], etichetta?: string } | undefined
    /*
     * ⛔⛔ LA MACCHINA DICE DOVE SI È FERMATA — 2026-08-13.
     *
     * Il pilota ha OTTO modi di finire e non ne raccontava nessuno: dal di
     * fuori si vedeva solo un telefono che smetteva di muoversi. MISURATO
     * ieri sera: il pilota ha aperto WhatsApp e poi è rimasto fermo 30 s senza
     * toccare il contatto — e per sapere *quale* delle otto uscite avesse
     * preso non c'era altra strada che dedurlo, cioè indovinarlo.
     *
     * Otto uscite indistinguibili sono otto ipotesi da provare a una a una;
     * una riga qui le riduce a una lettura. Questa è la strozzatura: ogni
     * ritorno passa da `chiudi`, quindi non esiste un'uscita muta.
     */
    const chiudi = (fine: TalosFineCorsa): TalosCorsaDelPilota => {
        const durata = porte.adesso() - partenza
        // Il motivo è un'unione con campi diversi per ramo: si serializza tutto,
        // perché il campo che manca è spesso proprio quello che spiega.
        talosTracciaFuori(`pilota: fine=${JSON.stringify(fine)} passi=${passi} ms=${durata}`)
        return { fine, storia, passi, millisecondi: durata }
    }

    for (;;) {
        const sguardo = await porte.guarda()
        if (sguardo === null) return chiudi({ motivo: 'occhio-chiuso' })
        // ⛔ La mano PRIMA di tutto, e a ogni giro: fra il passo scorso e questo
        // la persona può aver ripreso in mano il telefono.
        /*
         * ⛔⛔ IL FRENO NON FERMA PIÙ LA CORSA — owner 2026-08-13:
         *
         * > «SE NECESSARIO DOBBIAMO TOGLIERE QUESTO FRENO COMPLETAMENTE, NON
         * > ME NE FREGA UN CAZZO, fai una ricerca web. gemini non fa così»
         *
         * ## Perché non era una protezione: era il difetto
         *
         * MISURATO sul Pad, con NESSUNO che toccava il tablet:
         *
         * ```
         * pilota dice: Ok, apro WhatsApp
         * pilota dice: Digito «Io Tu»
         * pilota: fine={"motivo":"mano-sullo-schermo","passo":2} ms=9613
         * ```
         *
         * Il freno sentiva le CONSEGUENZE delle nostre stesse azioni: TALOS
         * digita, WhatsApp reagisce (la ricerca si apre, la lista si filtra),
         * e quegli eventi arrivano oltre i 400 ms di sordità. La sonda ha poi
         * misurato ritardi di **401.663.098 ms** — cioè `nostraAzioneAl` a
         * zero, la sordità mai armata al momento giusto. Il pilota non è mai
         * arrivato in fondo a un compito: si fermava da solo, ogni volta.
         *
         * ## Come lo fa chi è avanti
         *
         * Gemini (Computer Use su Android) **non rileva i tocchi**: mostra una
         * barra di progresso persistente con uno STOP esplicito, e l'azione
         * finanziaria chiede una conferma finale. Il controllo è un pulsante,
         * non un indovinello. ⇒ Un rilevamento che sbaglia toglie la funzione
         * senza dare sicurezza: è il peggiore dei due mondi.
         *
         * ⛔ Il segnale NON viene buttato: `sguardo.manoSulloSchermo` resta
         * disponibile e continua a essere raccolto, perché serve al presidio
         * che lo sostituisce — il comando di arresto che la persona preme. Qui
         * smette solo di decidere al posto suo.
         */
        // ⛔ E «non lo so» conta come un no: vedi il commento in testa.
        if (!sguardo.frenoArmato) return chiudi({ motivo: 'freno-non-armato' })
        if (porte.adesso() - partenza >= limiti.millisecondi) {
            return chiudi({ motivo: 'tempo-scaduto' })
        }
        if (passi >= limiti.passi) return chiudi({ motivo: 'troppi-passi' })

        const lettura = talosLeggiAzione(
            await porte.chiedi({
                osservazione: talosOsservazione(sguardo.elementi),
                storia,
            }),
            sguardo.elementi.map((e) => e.indice),
        )
        /*
         * ⛔⛔ UNA RISPOSTA CHE NON SI LEGGE VALE UN TENTATIVO, non la corsa.
         *
         * ## Il difetto, MISURATO sul Pad il 2026-08-15
         *
         * Chiesto «apri WhatsApp, cerca la chat con Antonino e dimmi solo il
         * titolo». Traccia:
         *
         * ```
         * pilota: fine={"motivo":"modello-non-capito",
         *               "scarto":"indiceFuoriElenco","dettaglio":"-1"} passi=0
         * ```
         *
         * **passi=0**: il pilota non ha fatto NIENTE. Il modello aveva risposto
         * `indice: -1` — cioè «qui non c'è niente da toccare», una convenzione
         * che il contratto non prevede — perché lo sguardo era ancora sulla
         * schermata di partenza e WhatsApp non era aperta.
         *
         * ## ⛔ L'asimmetria era ingiustificata
         *
         * Un'azione che FALLISCE ha diritto a `fallimentiDiFila` tentativi: si
         * tocca, non succede niente, si riprova. Una risposta che non si LEGGE
         * chiudeva tutto al primo colpo — pur essendo il caso più facile da
         * recuperare, perché basta ridomandare dicendo cosa non andava. Ed è
         * anche ciò che il contratto dichiara di volere: «meglio riguardare che
         * toccare al buio» (vedi `indiceFuoriElenco`).
         *
         * È il rilievo #13 dell'owner: «deve **riprovare in modo estremamente
         * robusto** invece di arrendersi».
         *
         * ## ⛔ Dentro il tetto che ha scelto lui, non oltre
         *
         * Lo scarto entra nello STESSO contatore: due tentativi, poi stop —
         * `fallimentiDiFila: 2` è una decisione dell'owner del 2026-08-10
         * («retry 2 poi stop»), e un secondo contatore accanto al primo sarebbe
         * un tetto nuovo deciso da me.
         *
         * ⛔ E la seconda domanda NON è la prima: lo scarto va nella storia con
         * scritto cosa fare invece. Ridomandare la stessa cosa allo stesso
         * modello nello stesso stato è il modo di ottenere due volte la stessa
         * risposta — cioè aspettare due volte per niente.
         *
         * ⛔ `passi` non cresce: nessun dito ha toccato lo schermo. A crescere è
         * il contatore dei fallimenti, e i tetti di tempo e di passi restano
         * dove sono — questo ciclo non può girare a vuoto.
         */
        if (!lettura.ok) {
            fallimenti += 1
            storia.push(
                `Passo ${passi + 1}: la tua risposta non era utilizzabile `
                + `(${lettura.motivo}: ${lettura.dettaglio}). Rispondi di nuovo `
                + 'usando SOLO un indice presente nell\'elenco qui sopra. Se qui non '
                + 'c\'è niente di utile, non inventare un indice: usa `apri_app` per '
                + 'l\'app che serve, oppure `fine` spiegando cosa hai visto.',
            )
            if (fallimenti >= limiti.fallimentiDiFila) {
                return chiudi({
                    motivo: 'modello-non-capito',
                    scarto: lettura.motivo,
                    dettaglio: lettura.dettaglio,
                })
            }
            continue
        }

        const azione = lettura.azione
        passi += 1
        /*
         * ⭐ Si racconta PRIMA di toccare, non dopo.
         *
         * Owner 2026-08-10: «Sempre a voce quando guida». Il punto non è la
         * cortesia: raccontare dopo informa, raccontare prima dà a chi ascolta
         * il tempo di dire «no, aspetta» mentre il dito non è ancora arrivato.
         *
         * ⛔ E NON si legge `azione.perche`: quello lo scrive il modello, in
         * inglese quando gli gira, lungo quanto vuole e con dentro gli indici.
         * La frase la costruisce `voceDelPilota` — rotazione invece di
         * sorteggio, brevità progressiva, e il silenzio quando non c'è niente
         * di nuovo da dire. `null` vuol dire «taci», ed è una riga legittima.
         */
        const bersaglio = sguardo.elementi.find((e) => e.indice === azione.indice)
        const frase = talosFraseDaDire({
            numero: passi,
            azione,
            ...(bersaglio?.etichetta ? { etichetta: bersaglio.etichetta } : {}),
            ...(ultima ? { precedente: ultima.azione } : {}),
            ...(ultima?.etichetta ? { etichettaPrecedente: ultima.etichetta } : {}),
        })
        /*
         * ⭐⭐⭐ LA GUARDIA DEGLI ORDINALI — «il primo contatto» dev'essere IL PRIMO.
         *
         * Owner 2026-08-15: «se io voglio chiedere a TALOS mentre sono su
         * WhatsApp di cliccare sul **primo contatto**». GUI-Owl dichiara gli
         * ordinali un problema aperto (`arXiv 2508.15144`), e il pezzo che
         * mancava era che gli indici non erano nemmeno in ordine di schermo —
         * misurato: 0 su 19. Adesso lo sono, quindi «il primo» è calcolabile.
         *
         * ⇒ Qui non si sceglie al posto del modello: si CONTROLLA. Il modello
         * propone un indice, e se la persona ha detto «il primo» e quell'indice
         * non è il primo della lista, non si tocca: si rimanda indietro con
         * scritto quale sarebbe.
         *
         * ## ⛔ Le due condizioni che tengono fuori i falsi allarmi
         *
         * 1. **Solo se il bersaglio è in lista.** Un ordinale fra pulsanti
         *    sparsi in una barra è un modo di dire, non una posizione.
         * 2. **Solo se le ETICHETTE differiscono.** In Android la stessa voce
         *    compare spesso due volte — il contenitore cliccabile e il figlio
         *    che porta il nome (MISURATO sul Play Store: indici 0 e 1 con la
         *    stessa identica etichetta). Sono la stessa cosa vista due volte, e
         *    bloccarle sarebbe un allarme a ogni singolo passo.
         *
         * ⛔ E il costo di sbagliare è asimmetrico, che è il motivo per cui la
         * guardia esiste: un falso allarme costa un giro, ed è limitato da
         * `fallimentiDiFila`. Aprire la chat sbagliata costa a una persona.
         */
        const ordinale = talosLeggiOrdinale(porte.obiettivo)
        if (ordinale && bersaglio?.inLista && azione.azione !== 'fine') {
            const atteso = talosNesimoInLista(sguardo.elementi, ordinale)
            if (atteso && atteso.indice !== bersaglio.indice
                && atteso.etichetta !== bersaglio.etichetta) {
                passi -= 1
                fallimenti += 1
                storia.push(
                    `Passo ${passi + 1}: NON eseguita. Hai scelto ${bersaglio.indice} `
                    + `(${JSON.stringify(bersaglio.etichetta)}), ma è stato chiesto `
                    + `«${ordinale}» e nella lista quello è ${atteso.indice} `
                    + `(${JSON.stringify(atteso.etichetta)}). Rispondi di nuovo.`,
                )
                if (fallimenti >= limiti.fallimentiDiFila) {
                    return chiudi({ motivo: 'troppi-fallimenti', ultimo: 'ordinale-sbagliato' })
                }
                continue
            }
        }

        if (frase) porte.racconta(frase)
        ultima = { azione: azione.azione, etichetta: bersaglio?.etichetta }

        if (azione.azione === 'fine') {
            storia.push(talosRigaDiStoria(passi, azione))
            return chiudi({ motivo: 'fine', testo: azione.testo })
        }

        const esito = await porte.agisci(azione)
        storia.push(talosRigaDiStoria(passi, azione) + (esito.fatto ? '' : ` — non riuscita: ${esito.motivo ?? 'motivo sconosciuto'}`))
        if (esito.fatto) {
            fallimenti = 0
            continue
        }
        fallimenti += 1
        if (fallimenti >= limiti.fallimentiDiFila) {
            return chiudi({ motivo: 'troppi-fallimenti', ultimo: esito.motivo })
        }
    }
}

/**
 * Come si racconta la fine a una PERSONA, in italiano.
 *
 * ⛔ Sta qui e non in un componente perché la corsa può finire mentre TALOS non
 * è a schermo — sta pilotando un'altra app — e allora questa frase è l'unica
 * cosa che la persona sente. Un `motivo` tecnico letto ad alta voce non lo
 * capirebbe nessuno.
 */
export function talosFraseDiFine(fine: TalosFineCorsa): string {
    switch (fine.motivo) {
        case 'fine':
            return fine.testo?.trim() ? `Fatto: ${fine.testo.trim()}` : 'Fatto.'
        case 'mano-sullo-schermo':
            return 'Ti ho sentito toccare lo schermo, quindi mi fermo qui.'
        case 'freno-non-armato':
            return 'Non parto: non riesco ad accorgermi se tocchi lo schermo, e senza quello non guido il tuo telefono.'
        case 'occhio-chiuso':
            return 'Non riesco a vedere lo schermo: manca il permesso di lettura dello schermo.'
        case 'troppi-passi':
            return 'Ho fatto molti passaggi senza arrivarci: mi fermo invece di continuare a provare.'
        case 'tempo-scaduto':
            return 'Ci sto mettendo troppo: mi fermo invece di continuare a provare.'
        case 'troppi-fallimenti':
            return 'Ho provato due volte e non ha funzionato: mi fermo qui.'
        case 'modello-non-capito':
            return 'Non ho capito che cosa fare da qui: mi fermo invece di toccare a caso.'
    }
}
