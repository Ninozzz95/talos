import { TalosSchermoBridge, talosArmaIlFreno } from '@/lib/device/ponteSchermo'
import { creaManoDelloSchermo } from '@/lib/device/manoDelloSchermo'
import { creaChiediDelPilota } from '@/lib/agent/chiediAlPilota'
import {
    talosFraseDiFine,
    talosGuidaLoSchermo,
    type TalosCorsaDelPilota,
} from '@/lib/agent/pilotaDelloSchermo'
import { talosWithTimeout } from '@/lib/talosDeviceLog'
import { talosTracciaFuori } from '@/lib/device/traccia'
import type { ChatCompletion } from '@/stores/chat'

/**
 * Quanto si aspetta il modello per UN passo, prima di chiamarlo passo perso.
 *
 * ⛔ Deve stare **sotto** il tetto dell'intera corsa (120 s), altrimenti non
 * servirebbe a niente: un passo che può durare quanto tutta la corsa è di
 * nuovo un'attesa senza fine. 25 s lascia spazio a tre passi lenti di fila e
 * resta lontano dai «qualche secondo» oltre i quali la persona fa da sé.
 */
const TETTO_DI_UN_PASSO_MS = 25_000

/**
 * ⭐ Una corsa intera, montata: freno, occhio, mano, modello, voce.
 *
 * ## ⛔ Perché sta in un file suo e non nel controller
 *
 * MISURATO: scritta dentro `chatController.ts` questa funzione ha portato il
 * grafo d'avvio a **600.880 byte** contro un tetto di 600.000 — cioè il
 * pilota, che serve a una persona su cento e solo dopo un consenso esplicito,
 * si faceva pagare da TUTTI all'apertura dell'app.
 *
 * Il controller ora tiene solo la cucitura: chi guida, con quale modello, e con
 * quale voce. Il montaggio è qui, in un modulo che si carica quando la corsa
 * comincia — e chi non guida mai non lo carica mai.
 */
export interface TalosMontaggioCorsa {
    obiettivo: string
    /** Il modello che decide i passi: quello della chat, risolto adesso. */
    completa: ChatCompletion
    /** Aprire un'app: la stessa strada di `device_open_app`. */
    apriApp(nomePacchetto: string): Promise<{ done: boolean, reason?: string }>
    /** L'elenco «Nome<TAB>pacchetto», per non far indovinare un id al modello. */
    elencoApp(): Promise<string>
    /** ⭐ La voce. Owner: sempre, quando guida. */
    parla(frase: string): void
}

export async function talosCorsaDelloSchermo(
    montaggio: TalosMontaggioCorsa,
): Promise<TalosCorsaDelPilota> {
    /*
     * ⛔ Il freno PRIMA di tutto, e non si controlla qui se è riuscito: il
     * ciclo lo rilegge a ogni sguardo e si rifiuta di partire se non è armato.
     * Un secondo controllo qui sarebbe un secondo posto da tenere allineato.
     */
    await talosArmaIlFreno()
    // Una volta sola: dentro la lambda si ricostruirebbe a ogni passo.
    const chiediAlModello = creaChiediDelPilota({
        obiettivo: montaggio.obiettivo,
        completa: montaggio.completa,
    })
    const esegui = creaManoDelloSchermo({
        apriApp: montaggio.apriApp,
        elencoApp: montaggio.elencoApp,
        aspetta: (ms) => new Promise((ok) => { setTimeout(ok, ms) }),
    })
    const corsa = await talosGuidaLoSchermo({
        // ⛔ Le parole della PERSONA, non il prompt costruito: la guardia degli
        // ordinali deve leggere «il primo contatto» come è stato detto.
        obiettivo: montaggio.obiettivo,
        guarda: () => TalosSchermoBridge.guarda().catch(() => null),
        agisci: esegui,
        /*
         * ⛔⛔ IL TETTO DEI 2 MINUTI NON COPRIVA L'UNICA ATTESA CHE CONTA.
         *
         * MISURATO sul Pad il 2026-08-13: consenso dato, `occhioAperto=true`,
         * WhatsApp in primo piano — e poi **niente** per oltre due minuti.
         * Nessun tocco, e soprattutto nessuna riga di fine corsa: il ciclo non
         * era uscito, era **fermo dentro**.
         *
         * Il limite di tempo del pilota si controlla a INIZIO giro. Se la
         * chiamata al modello non torna, quel controllo non viene mai
         * raggiunto: il tetto c'è, e non copre la sola attesa che può durare
         * per sempre. ⇒ Da fuori si vede un telefono che smette di muoversi
         * senza dire niente, che è esattamente ciò che l'owner non deve vedere:
         * «se utente aspetta per piu di qualche secondo si stufa e lo fara
         * manualmente».
         *
         * Il tetto sta QUI e non dentro il ciclo, per la stessa ragione della
         * voce qui sotto: il ciclo si prova senza telefono e senza rete, e
         * legarlo a un orologio vero renderebbe i suoi test dipendenti dal
         * tempo. Un passo che non risponde diventa un passo fallito — e due
         * fallimenti di fila il ciclo li sa già gestire.
         */
        chiedi: (input) => talosWithTimeout(
            chiediAlModello(input),
            TETTO_DI_UN_PASSO_MS,
            'pilota: il modello non ha risposto in tempo',
        /*
         * ⛔ Il rigetto NON esce di qui.
         *
         * `talosWithTimeout` rigetta, e un rigetto attraverserebbe il ciclo
         * fino a fuori: la corsa finirebbe senza passare da `chiudi`, cioè
         * senza la riga che dice come è finita — lo stesso silenzio di prima,
         * spostato di un metro. Una risposta vuota invece è un passo che il
         * ciclo NON capisce, e i passi non capiti li sa già contare: due di
         * fila e chiude da solo, raccontandolo.
         */
        /*
         * ⛔⛔ E L'ERRORE SI DICE — 2026-08-13, un'ora dopo averlo scritto male.
         *
         * La prima versione era `.catch(() => '')` e basta. MISURATO subito
         * dopo: `pilota: fine={"motivo":"modello-non-capito"} passi=0 ms=388`.
         * 388 ms è troppo poco perché una chiamata di rete a Gemini sia
         * davvero andata e tornata ⇒ non era il modello a non capire: era
         * QUESTO catch che trasformava un rigetto immediato in una risposta
         * vuota, e la risposta vuota in «il modello non ha capito».
         *
         * Avevo appena scritto, in questo stesso file, un cerotto della stessa
         * famiglia di quelli che questo progetto insegue da giorni: un catch
         * che risponde al posto di chi ha fallito. La regola vale anche quando
         * il codice è mio e ha un'ora di vita.
         */
        ).catch((errore: unknown) => {
            talosTracciaFuori(`pilota: chiedi-in-errore ${String(errore)}`)
            return ''
        }),
        /*
         * ⛔⛔ QUELLO CHE TALOS DICE A VOCE DEVE ESSERE LEGGIBILE — owner
         * 2026-08-13:
         *
         * > «TI HO SENTITO TOCCARE LO SCHERMO QUINDI MI FERMO QUI, ha detto
         * > così ma tu non lo senti, devi fare in modo di rilevare cosa dice»
         *
         * Il pilota parla — annuncia ogni mossa PRIMA di farla, e dice perché
         * si ferma. Ma la voce esce dall'altoparlante e basta: chi collauda da
         * un altro schermo non la sente, e la corsa diventa muta proprio nel
         * momento in cui sta spiegando sé stessa.
         *
         * ⇒ La frase esce DUE volte: dall'altoparlante per la persona, e in
         * `logcat` per chi guarda. Non cambia niente per chi ascolta, e rende
         * verificabile una funzione che finora si poteva solo sentire.
         */
        racconta: (frase: string) => {
            talosTracciaFuori(`pilota dice: ${frase}`)
            montaggio.parla(frase)
        },
        adesso: () => Date.now(),
    })
    /*
     * ⛔⛔ LA FRASE PER LA PERSONA ESISTEVA E NON LA DICEVA NESSUNO.
     *
     * `talosFraseDiFine` era scritta, provata dai test, esportata due volte — e
     * cercandone i chiamanti non ne aveva **uno**. Quando il pilota si fermava,
     * l'unica voce che restava era il modello, che ripete a modo suo il
     * racconto tecnico in inglese: è così che l'owner si è ritrovato
     * «schermoCambiato» scritto in chat il 2026-08-11.
     *
     * ⛔ Si dice SOLO quando la corsa NON è finita bene. A fine riuscita la
     * risposta del modello racconta già cosa ha ottenuto, e aggiungerci «Fatto.»
     * a voce vorrebbe dire dirlo due volte — che è il difetto opposto e si
     * sente uguale.
     *
     * ⛔ E si dice qui, non dentro il ciclo: il ciclo non conosce la voce, la
     * riceve. Metterla lì legherebbe i tetti — che si provano senza telefono —
     * a un motore vocale.
     */
    if (corsa.fine.motivo !== 'fine') montaggio.parla(talosFraseDiFine(corsa.fine))
    return corsa
}
