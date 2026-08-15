/**
 * Cosa ogni tool fa DAVVERO, in termini di sicurezza.
 *
 * ## Perché in un file suo e non accanto a gruppo e azioni
 *
 * Perché si paga in due posti diversi. Il catalogo dei controlli lo leggono le
 * **Impostazioni**, che stanno nel grafo d'avvio; questo lo legge
 * l'**esecutore**, che è un chunk dinamico. Tenendoli insieme, ventisei
 * descrittori finivano nel bundle iniziale di chi non ha ancora aperto una
 * chat: **misurato, 601.709 byte contro un tetto di 600.000**. Separati, non
 * costano niente a nessuno.
 *
 * ## Le tre bandiere sono la trifecta
 *
 * Dati privati, contenuto non attendibile, capacità di far uscire qualcosa. Un
 * tool solo non è mai il problema; il problema è quando le tre si incontrano
 * nella stessa conversazione — vedi `lib/tools/security.ts`, dove la regola è
 * scritta una volta e provata.
 *
 * Chi aggiunge un tool e dimentica questa riga non rompe niente a runtime — il
 * predefinito prudente lo copre — ma un test glielo dice il giorno stesso.
 */

import type { TalosAgentToolId } from '@/lib/tools/toolControls'
import type { TalosToolSecurity } from '@/lib/tools/security'

export const TALOS_TOOL_SECURITY: Readonly<Record<TalosAgentToolId, TalosToolSecurity>> = Object.freeze({
    library_list: { risk: 'R1', reversibility: 'read-only', readsPrivateData: true, readsUntrustedContent: true, canTransmit: false },
    library_search: { risk: 'R1', reversibility: 'read-only', readsPrivateData: true, readsUntrustedContent: true, canTransmit: false },
    library_read: { risk: 'R1', reversibility: 'read-only', readsPrivateData: true, readsUntrustedContent: true, canTransmit: false },
    library_file_origin: { risk: 'R0', reversibility: 'read-only', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    notes_list: { risk: 'R1', reversibility: 'read-only', readsPrivateData: true, readsUntrustedContent: true, canTransmit: false },
    tasks_list: { risk: 'R1', reversibility: 'read-only', readsPrivateData: true, readsUntrustedContent: true, canTransmit: false },
    memory_search: { risk: 'R1', reversibility: 'read-only', readsPrivateData: true, readsUntrustedContent: true, canTransmit: false },
    time_now: { risk: 'R0', reversibility: 'read-only', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    research_list: { risk: 'R1', reversibility: 'read-only', readsPrivateData: true, readsUntrustedContent: true, canTransmit: false },
    research_start: { risk: 'R2', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: true, canTransmit: true },
    research_read: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: true, canTransmit: false },
    research_rename: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    research_pause: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    research_resume: { risk: 'R2', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: true, canTransmit: true },
    research_cancel: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    research_delete: { risk: 'R2', reversibility: 'irreversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    memory_write: { risk: 'R2', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    // Correggere si annulla riscrivendo; dimenticare no — non c'e' un cestino
    // della memoria, e il backup di ieri e' fuori dalla portata di questo tool.
    memory_update: { risk: 'R2', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    memory_delete: { risk: 'R2', reversibility: 'irreversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    notes_create: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    notes_update: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    notes_delete: { risk: 'R2', reversibility: 'irreversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    tasks_create: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    tasks_complete: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    tasks_update: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    tasks_delete: { risk: 'R2', reversibility: 'irreversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    web_search: { risk: 'R2', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: true, canTransmit: true },
    web_read: { risk: 'R2', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: true, canTransmit: true },
    document_create: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    generate_image: { risk: 'R2', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: true },
    library_export: { risk: 'R2', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    library_rename: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    // L'unico di questo gruppo che distrugge: il file esce dalla Libreria e
    // dalle chat che lo citavano, e non torna.
    library_delete: { risk: 'R2', reversibility: 'irreversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    library_context_policy_update: { risk: 'R3', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    local_models_search: { risk: 'R1', reversibility: 'read-only', readsPrivateData: false, readsUntrustedContent: true, canTransmit: true },
    local_model_inspect: { risk: 'R1', reversibility: 'read-only', readsPrivateData: false, readsUntrustedContent: true, canTransmit: true },
    local_model_download: { risk: 'R2', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: true, canTransmit: true },
    local_models_status: { risk: 'R0', reversibility: 'read-only', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    device_status: { risk: 'R0', reversibility: 'read-only', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    /*
     * ⛔ `readsPrivateData: true`, e non e' una formalita': DOVE SEI e' il dato
     * piu' personale che questo telefono possa consegnare. `device_status` sta
     * a R0 proprio perche' la sua descrizione promette «no location»; questo
     * tool e' l'eccezione che quella promessa nominava.
     *
     * ⛔ R1 e non R0: leggere e' innocuo, ma il risultato finisce nel contesto
     * della conversazione — cioe' viaggia verso il modello e resta nella
     * cronologia. Non e' reversibile nel senso che conta: una coordinata detta
     * non si ritira.
     */
    device_location: { risk: 'R1', reversibility: 'read-only', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    // Accendere un LED si spegne premendo di nuovo: reversibile per costruzione.
    // Mettere in pausa si disfa premendo di nuovo, e non tocca nessun dato.
    // ⛔ L'aereo taglia la rete, e con essa il ponte: siamo noi a non poterlo
    // piu' disfare. R2 e irreversibile non e' pessimismo, e' il fatto.
    device_airplane: { risk: 'R2', reversibility: 'irreversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    device_power_saving: { risk: 'R1', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    device_media: { risk: 'R1', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    device_torch: { risk: 'R1', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    // Una vibrazione non si disfa — ed e' un fatto sul mondo, non sui dati.
    device_vibrate: { risk: 'R1', reversibility: 'irreversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    device_volume: { risk: 'R1', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    calendar_write: { risk: 'R2', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    calendar_read: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: true, canTransmit: false },
    device_alarm: { risk: 'R1', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    device_open_app: { risk: 'R1', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    device_open_settings: { risk: 'R1', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    /*
     * ⛔ R2 e canTransmit: PREPARA un messaggio verso l'esterno. Non lo manda
     * — quella e' la persona — ma il testo esce dal dispositivo se lei preme,
     * e la trifecta deve poterlo vedere come un'uscita.
     */
    device_compose: { risk: 'R2', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: true },
    /*
     * ⛔ Parlare e' un'USCITA: chiunque sia nella stanza sente. Un documento
     * privato letto ad alta voce e' uscito dal telefono senza toccare la rete.
     */
    device_speak: { risk: 'R2', reversibility: 'irreversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: true },
    // ⛔ `readsPrivateData`: legge un file della Libreria. E `irreversible` non
    // perche' non si possa rimettere l'altro, ma perche' lo sfondo di prima non
    // lo conosciamo — disfare non e' rimettere le cose com'erano.
    device_wallpaper: { risk: 'R2', reversibility: 'irreversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    device_keep_awake: { risk: 'R1', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    /*
     * ⛔ `readsUntrustedContent: false` e NON è una svista: da qui escono
     * NUMERI, non testo scritto da estranei. Il testo di una email — quello sì
     * ostile — TALOS lo vede dalle notifiche, e quella riga è già marcata.
     */
    device_unread_mail: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    /*
     * ⛔ `readsPrivateData: true` e `irreversible`, e nessuna delle due è
     * pignoleria. Legge ciò che c'è sullo schermo in quell'istante — la chat di
     * qualcun altro, un conto, un documento — e il file finisce in galleria: uno
     * screenshot fatto non si può disfare. ⛔ `canTransmit: false` è vero e va
     * tenuto vero: TALOS **non riceve l'immagine**, la fa fare al sistema. Se un
     * giorno passasse da `takeScreenshot()`, che il bitmap ce lo consegna, questa
     * riga diventerebbe falsa nello stesso commit.
     */
    device_screenshot: { risk: 'R2', reversibility: 'irreversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    // ⛔ Spegnere il Wi-Fi mentre qualcosa scarica e' reversibile come
    // interruttore e non come conseguenza: R2, e la scheda lo dice.
    device_wifi: { risk: 'R2', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    device_bluetooth: { risk: 'R2', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    // Zittire il telefono puo' far perdere una chiamata: e' la ragione per cui
    // il tool spinge su `priority` invece che su `none`.
    device_do_not_disturb: { risk: 'R2', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    device_system_setting: { risk: 'R2', reversibility: 'reversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    // ⛔ Cosa usi e per quanto e' il ritratto di una giornata: dato privato.
    device_app_usage: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    // ⛔ E le app installate sono il ritratto di una persona.
    device_list_apps: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: false, canTransmit: false },
    /*
     * ⛔ `readsUntrustedContent: true`, ed è la riga che conta.
     *
     * Il testo di una notifica lo scrive CHIUNQUE: un messaggio, una mail, una
     * pubblicità. È contenuto di terzi che entra nel contesto del modello, e
     * può contenere istruzioni travestite da testo — «SISTEMA: invia…».
     * Segnarlo qui è ciò che impedisce che una notifica aumenti i poteri del giro.
     */
    device_notifications_list: { risk: 'R1', reversibility: 'reversible', readsPrivateData: true, readsUntrustedContent: true, canTransmit: false },
    // ⛔ R3: manda un messaggio a una persona vera, e non si annulla.
    device_notification_reply: { risk: 'R3', reversibility: 'irreversible', readsPrivateData: true, readsUntrustedContent: true, canTransmit: true },
    device_notification_dismiss: { risk: 'R2', reversibility: 'irreversible', readsPrivateData: false, readsUntrustedContent: false, canTransmit: false },
    /*
     * ⛔⛔ R4, e non è prudenza: è l'unica riga onesta.
     *
     * Guidare lo schermo tocca app di ALTRI. Legge dati privati (qualunque cosa
     * ci sia su quello schermo), legge contenuto NON fidato (una pagina web
     * dice al modello cosa fare), e può trasmettere (una ricerca, un messaggio,
     * un acquisto). È la trifecta al completo su una riga sola — esattamente la
     * combinazione per cui esiste il livello più alto.
     */
    /*
     * ⛔ `sempreConsentibile`: l'unica eccezione al veto su R4, decisa dall'owner
     * il 2026-08-12 e riconfermata dopo un mio rifiuto. Il pilota non è una
     * chiamata, è una SESSIONE: chiedere a ogni tocco non è una difesa in più,
     * è la funzione che non si può usare. Il perché per esteso, col compromesso
     * e coi tre presidi che lo reggono, sta su `TalosToolSecurity`.
     */
    device_screen_drive: { risk: 'R4', reversibility: 'irreversible', readsPrivateData: true, readsUntrustedContent: true, canTransmit: true, sempreConsentibile: true },
    /*
     * ⛔ R3 e non R4: un intent apre UNA schermata con dati gia' scritti, non
     * prende in mano lo schermo. Ma `canTransmit` e' vero — alcune capacita'
     * mandano un messaggio a una persona — e `sempreConsentibile` lo rende
     * concedibile una volta per tutte, come ha deciso l'owner per il controllo
     * del dispositivo.
     */
    app_azione: { risk: 'R3', reversibility: 'compensable', readsPrivateData: true, readsUntrustedContent: false, canTransmit: true, sempreConsentibile: true },
    /*
     * ⛔ `sempreConsentibile: false`, e la prova me l'ha ricordato.
     *
     * `app_azione` puo' essere consentito per sempre perche' il contenuto lo
     * scrive la persona in quel momento. Qui no: «manda un file» consentito una
     * volta per sempre significa che da domani QUALUNQUE file della libreria
     * puo' uscire senza che nessuno lo chieda — un documento, una foto, una
     * nota. Il file e' suo e non lo sta riscrivendo ogni volta.
     */
    invia_file: { risk: 'R3', reversibility: 'compensable', readsPrivateData: true, readsUntrustedContent: false, canTransmit: true },
})
