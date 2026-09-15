import { TALOS_TOOL_LABEL_KEYS, TALOS_TOOL_LABELS } from '@/lib/tools/toolLabels'
import type { TalosToolAuditRow } from '@/lib/tools/executor'

/**
 * ⛔⛔ LE RIGHE SCRITTE PER IL MODELLO NON VANNO SULLO SCHERMO DELLA PERSONA.
 *
 * ## Il difetto, visto dall'owner e non dedotto
 *
 * 2026-08-10, screenshot dal telefono: sopra il compositore, un riquadro con
 * dentro, in inglese:
 *
 * > «The user has not turned on notification access for TALOS yet. Say so and
 * > offer to open the system page. Do not retry.»
 *
 * Quella frase è un'ISTRUZIONE PER UNA MACCHINA — vive in
 * `notificationsBridge.ts`, esiste per impedire a un modello di riprovare
 * all'infinito, ed è giusta lì. Sullo schermo di chi possiede il telefono è
 * un difetto in tre modi insieme: è in un'altra lingua, dà ordini a qualcuno
 * che non è il destinatario, e non dice cosa fare.
 *
 * La strada: `toolset.audit()` pubblicava `body: row.error` — il testo del
 * modello — e `title: row.tool` — il nome INTERNO (`device_notifications_list`).
 * Il centro notifiche lo consegna al toast (`App.vue`: `evento.body ??
 * evento.title`) e alla notifica di Android. Due superfici umane, due perdite.
 *
 * ## La regola, e perché sta qui e non nel chiamante
 *
 * Un tool che fallisce si annuncia con **l'etichetta che la persona vede
 * ovunque** e una riga sola nella sua lingua; il PERCHÉ resta nella chat, dove
 * il modello lo dice per esteso — è la stessa divisione già scritta per le
 * notifiche di risposta: «la notifica ANTICIPA, la chat contiene».
 *
 * ⛔ È una funzione PURA con il traduttore iniettato, e non una riga dentro
 * `audit()`, per una ragione precisa: così la regola si può PROVARE. Un test
 * che monta mezzo toolset per controllare una stringa non lo scrive nessuno, e
 * una regola che nessuno prova torna indietro alla prima modifica.
 */
export interface TalosAvvisoDiTool {
    title: string
    body?: string
}

/**
 * Il traduttore, iniettato: questa funzione non deve sapere di i18n.
 *
 * I parametri sono `string | number` e non `unknown` per combaciare con la
 * firma vera di `talosT` — un tipo più largo qui costringerebbe il chiamante a
 * un cast, e un cast su un confine è il posto dove gli errori entrano.
 */
export type TalosTraduttore = (
    chiave: string,
    parametri?: Record<string, string | number>,
) => string

/**
 * Come si annuncia l'esecuzione di un tool a una PERSONA.
 *
 * `row.error` non compare nel risultato, in nessun ramo: è il testo del
 * modello, e questa funzione esiste per tenerlo fuori.
 */
/**
 * ⛔⛔ I RIFIUTI CHE SAPPIAMO SPIEGARE, e che finora tacevano.
 *
 * ## Il difetto, MISURATO e non dedotto (2026-08-20)
 *
 * L'owner: «il toast ricerca fallita appare solo dopo aver premuto il
 * pop-up di consenso». Misurato sul Pad, il giro intero:
 *
 *   1. `web_search` riesce;
 *   2. il modello sceglie una pagina e chiama `web_read`;
 *   3. la scheda di consenso si apre — **l’attrezzo non può ancora
 *      partire**;
 *   4. la persona tocca «Consenti sempre»;
 *   5. SOLO ORA `web_read` gira, e il client nativo rifiuta la pagina:
 *      nel registro del Doctor, `TALOS_WEB_REDIRECT_DOWNGRADE` —
 *      quel sito rimandava da `https` a `http`.
 *
 * ⇒ Il consenso non è la causa: è il CANCELLO. Il guasto può accadere
 * solo dopo che si apre, ed è per questo che sembra causato da lui.
 *
 * ## Perche' la frase generica non bastava
 *
 * «Non e' riuscito: Lettura di una pagina web» dice che qualcosa non e'
 * andato e nientaltro. Chi legge ha appena chiesto una ricerca — che
 * INVECE E' RIUSCITA — e legge quella riga come «la ricerca e' fallita».
 * TALOS aveva fatto la cosa giusta (non mandare una richiesta in chiaro)
 * e non lo aveva detto.
 *
 * ⛔ E resta vero che `row.error` non va a schermo: quello è testo per la
 * macchina. Ma fra «la prosa del modello» e «niente» c’è una terza cosa:
 * i codici sono NOSTRI, sono un insieme chiuso, e ognuno ha una frase
 * scritta da noi. Tradurre un codice non è esporre un testo altrui.
 *
 * La forma segue le linee guida sui messaggi d’errore: il codice si
 * nasconde, la frase dice COSA è successo e, quando serve, cosa si può
 * fare; una o due frasi, mai un rimando a un’altra schermata.
 */
const MOTIVI: Readonly<Record<string, string>> = {
    TALOS_WEB_REDIRECT_DOWNGRADE: 'toolActivity.perche.webRedirectDowngrade',
    TALOS_WEB_ADDRESS_NOT_PUBLIC: 'toolActivity.perche.webNotPublic',
    TALOS_WEB_ADDRESS_NOT_FOUND: 'toolActivity.perche.webNotFound',
    TALOS_WEB_URL_BLOCKED: 'toolActivity.perche.webBlocked',
    TALOS_WEB_RESPONSE_TOO_LARGE: 'toolActivity.perche.webTooLarge',
    TALOS_WEB_TOO_MANY_REDIRECTS: 'toolActivity.perche.webTooManyRedirects',
    TALOS_WEB_REDIRECT_LOOP: 'toolActivity.perche.webTooManyRedirects',
    TALOS_WEB_REDIRECT_INVALID: 'toolActivity.perche.webRedirectInvalid',
    TALOS_WEB_BUSY: 'toolActivity.perche.webBusy',
    TALOS_WEB_NOT_AN_IMAGE: 'toolActivity.perche.webNotAnImage',
    TALOS_WEB_BYTES_UNSUPPORTED: 'toolActivity.perche.webBytesUnsupported',
    TALOS_WEB_SEARCH_NOT_CONFIGURED: 'toolActivity.perche.webSearchNotConfigured',
    TALOS_WEB_OFFLINE: 'toolActivity.perche.webOffline',
    TALOS_WEB_TIMEOUT: 'toolActivity.perche.webTimeout',
}

/**
 * La frase che spiega un codice, se lo conosciamo.
 *
 * ⛔ Prende il CODICE, non il testo dell’errore. La prima versione di
 * questa cura cercava i codici DENTRO il messaggio, e sul Pad non ha mai
 * scattato: il messaggio vero era «The page could not be read: Unable to
 * resolve host …», cioè Android, in inglese, senza nessun codice.
 * `webTools` adesso classifica il guasto e il codice viaggia a parte.
 *
 * ⛔ E il testo dell’errore NON si legge mai: può portarsi dietro prosa di
 * chiunque — un plugin, una libreria, il modello — e quella non deve
 * arrivare a schermo per nessuna strada.
 */
export function talosMotivoDiTool(codice: string | null | undefined): string | null {
    if (!codice) return null
    return MOTIVI[codice] ?? null
}

export function talosAvvisoDiTool(
    row: Pick<TalosToolAuditRow, 'tool' | 'status' | 'error' | 'code'>,
    t: TalosTraduttore,
): TalosAvvisoDiTool {
    const title = talosEtichettaUmana(row.tool, t)
    if (row.status !== 'failed') return { title }

    const chiave = talosMotivoDiTool(row.code)
    // ⛔ La frase generica resta il ripiego, non la regola: un codice che
    //   non conosciamo e' una nostra mancanza, e finche' non la colmiamo
    //   almeno il fatto si dice.
    if (!chiave) return { title, body: t('toolActivity.failedNotice', { tool: title }) }
    return { title, body: t(chiave) }
}

/**
 * Il nome che la persona conosce.
 *
 * ⛔ Il ripiego è il nome del tool, non una frase generica: una riga che dice
 * «uno strumento non è riuscito» è meno utile di una che dice
 * `device_notifications_list`. Un tool nuovo senza etichetta è una nostra
 * mancanza, e deve restare riconoscibile finché non la colmiamo — la stessa
 * scelta già presa in `talosToolActivityLabel`.
 */
export function talosEtichettaUmana(tool: string, t: TalosTraduttore): string {
    const chiave = TALOS_TOOL_LABEL_KEYS[tool]
    if (chiave) {
        const tradotta = t(chiave)
        // `talosT` restituisce la CHIAVE quando la traduzione manca: una chiave
        // a schermo è peggio del nome interno, quindi si scarta.
        if (tradotta && tradotta !== chiave) return tradotta
    }
    return TALOS_TOOL_LABELS[tool] ?? tool
}
