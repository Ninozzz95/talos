import { TalosDeviceBridge } from '@/lib/device/devicePlugin'

/**
 * ⭐⭐ IL TOCCO SULLA LEVETTA — e perché parla col telefono, non col modello.
 *
 * Deciso dall'owner il 2026-08-13, dopo il testa a testa con Gemini:
 *
 * > «A» — il tocco della persona **è** il consenso.
 *
 * ## Cosa cambia, in numeri
 *
 * MISURATO sul Pad: chiedere a Gemini di spegnere la torcia costa **11,1 s** —
 * il modello legge, decide, chiama. Toccare una levetta che parla direttamente
 * col ponte costa il tempo di un `setTorchMode`. Passare dal cancello dei
 * permessi qui avrebbe voluto dire far comparire una richiesta di consenso per
 * una cosa che la persona ha **appena premuto con un dito**.
 *
 * ⛔ E non è un buco nella grammatica dei permessi: la levetta compare **solo**
 * dentro una scheda nata da un'azione **già autorizzata e già avvenuta**. Non
 * apre capacità nuove — rimette a portata di dito quella che è appena successa,
 * e nella direzione opposta.
 *
 * ## ⛔ Perché una tabellina, qui, è inevitabile
 *
 * «Come si commuta questa cosa» non si può chiedere al telefono: è il nostro
 * ponte a saperlo. Ma resta **piccola e dichiarata** — una riga per capacità a
 * due stati — e ciò che NON c'è dentro conta quanto ciò che c'è: un tool
 * sconosciuto rende `false` e la levetta torna indietro, invece di toccare
 * qualcosa a caso.
 */
type Commutatore = (acceso: boolean) => Promise<boolean>

const COMANDI: Readonly<Record<string, Commutatore>> = {
    device_torch: async (acceso) => TalosDeviceBridge
        .torch({ on: acceso })
        .then((r) => r.done === true, () => false),
}

/**
 * Commuta ciò che la scheda mostra, e dice se ci è riuscita.
 *
 * ⛔ `false` NON è un dettaglio: chi chiama deve rimettere la levetta dov'era.
 * Una levetta che si sposta mentre la torcia resta accesa è la stessa bugia del
 * segno «Fatto» su una cosa non fatta, spostata dentro un comando.
 */
export async function talosCommutaDaScheda(tool: string, acceso: boolean): Promise<boolean> {
    const comando = COMANDI[tool]
    if (!comando) return false
    return comando(acceso)
}

/**
 * ⭐⭐⭐ SCEGLIERE L'APP COL DITO, invece di ridire un nome che TALOS ha già.
 *
 * MISURATO sul Pad il 2026-08-13: avendo in mano l'elenco vero delle app che
 * sanno fare una cosa, il modello ha risposto «WhatsApp, Telegram, Signal,
 * Messenger, ChatGPT» — **tre non installate e una inventata**. La scheda porta
 * l'elenco intatto dal telefono allo schermo; questo è il tocco che lo usa.
 *
 * ⛔ Il lavoro vero sta in `intentiTools`, e ci si arriva con un `import()`
 * pigro: quel modulo tira dentro zod e il registro degli intenti, e questo file
 * viene già caricato pigramente dalle due schermate. Chi apre l'app e non tocca
 * nessuna scheda non paga niente di tutto questo.
 */
export async function talosApriDaScheda(
    capacita: string,
    valori: Readonly<Record<string, string>>,
    pacchetto: string,
): Promise<boolean> {
    const { talosApriConApp } = await import('@/lib/tools/intentiTools')
    return talosApriConApp(capacita, valori, pacchetto).catch(() => false)
}

/**
 * ⭐⭐⭐ IL FILE SCELTO COL DITO — e prima era un giro chiuso.
 *
 * MISURATO sul Pad il 2026-08-17. Due `nota-talos.txt` nella Libreria. L'esito
 * dello strumento portava i numeri, gli id, e a lettere «call this tool again
 * with "file" set to that entry's id». La persona ha risposto «1», e il modello
 * ha rifatto la STESSA domanda: richiamava col nome, riotteneva l'ambiguità,
 * riscriveva l'elenco.
 *
 * ⛔ È la lezione già scritta due volte in `intentiTools`: un'istruzione scritta
 * NON vincola il modello. Se una cosa deve succedere, la fa il codice.
 *
 * ⇒ Il dito porta l'id, che è l'unica cosa che distingue due omonimi — il nome
 * no, e nemmeno il contenuto, che sul Pad era identico.
 */
export async function talosMandaFileDaScheda(
    id: string,
    dove: { readonly app?: string, readonly contatto?: string, readonly testo?: string },
): Promise<boolean> {
    const { talosMandaFilePerId } = await import('@/lib/tools/intentiTools')
    return talosMandaFilePerId(id, dove).catch(() => false)
}

/**
 * ⭐⭐⭐ IL COMANDO INVECE DELLA GARA — e la gara l'avevamo persa.
 *
 * MISURATO sul Pad il 2026-08-17, dal registro delle activity. L'invio fallisce
 * perché la lettura dello schermo è spenta, e TALOS apriva da solo le
 * impostazioni. In 900 millesimi:
 *
 *     05:31:14.098  TALOS      apre WhatsApp  (wa.me)
 *     05:31:14.135  TALOS      apre ACCESSIBILITY_SETTINGS   ← 37 ms dopo
 *     05:31:14.155  WhatsApp   .contact.ui.picker.ContactPicker
 *     05:31:14.927  WhatsApp   .Conversation
 *     05:31:14.959  WhatsApp   .home.ui.HomeActivity
 *     05:31:14.980  WhatsApp   .Conversation
 *
 * ⇒ Le impostazioni si erano aperte **davvero**. Poi WhatsApp ha continuato a
 * lanciare finestre per altri 850 ms e le ha sepolte. Stavamo correndo contro
 * la catena di lancio di un'altra app — e la frase «le impostazioni sono già
 * aperte» era vera per 37 millesimi e falsa da lì in poi. Sullo schermo c'era
 * WhatsApp, e a chi legge dicevamo di guardare un elenco che non c'era.
 *
 * ⛔ E la cura NON è aspettare un po' di più: quanto duri la catena di lancio è
 * un fatto di QUELL'app e di QUEL telefono, e un numero scritto a mano sarebbe
 * indovinato. Un'altra app, un altro esito.
 *
 * ⇒ Si smette di correre. La scheda porta **il comando**, e lo schermo cambia
 * quando lo tocca la persona — che è anche l'unico momento in cui è pronta a
 * usarlo. È la regola già in vigore: la scheda porta il comando, non la parola
 * «fatto».
 */
export async function talosApriImpostazioniDaScheda(azione: string): Promise<boolean> {
    /*
     * ⛔ `forThisApp: false`: l'elenco dei servizi di accessibilità è UNO per il
     * telefono. La pagina «per questa app» qui non esiste, e chiederla porterebbe
     * a una schermata che non contiene la levetta che serve.
     */
    return TalosDeviceBridge
        .openSettingsScreen({ action: azione, forThisApp: false })
        .then((r) => r.done === true, () => false)
}
