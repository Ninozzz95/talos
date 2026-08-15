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
