import { talosAzioniGovernate, type TalosToolAction } from '@/lib/tools/permissionTypes'
import type { TalosAgentToolId } from '@/lib/tools/toolControls'

export type TalosAgentToolGroup = 'library' | 'personal' | 'web' | 'create' | 'models' | 'device'

/**
 * L'ordine in cui i gruppi si leggono nelle impostazioni.
 *
 * ⛔ Vive QUI, non nel pannello, per una ragione precisa: finché era un `const`
 * privato dentro il componente **non era controllabile da nessun test**, e un
 * gruppo dimenticato in quell'elenco non fa cadere niente — semplicemente i
 * suoi tool spariscono dalla pagina. Cioè un insieme di tool che il modello può
 * usare e che nessuno può spegnere, esattamente il difetto che il test di
 * copertura aveva già scovato due volte (`memory_write`, `research_list`).
 *
 * Spostarlo qui rende possibile la guardia; la guardia sta in
 * `tests/unit/tools/toolControlCatalog.test.ts` e vale nei due sensi: ogni
 * gruppo usato dal catalogo compare qui, e ogni gruppo elencato qui ha almeno
 * un tool.
 */
export const TALOS_AGENT_TOOL_GROUP_ORDER = Object.freeze([
    'library', 'personal', 'web', 'create', 'models', 'device',
]) as readonly TalosAgentToolGroup[]

/**
 * ⛔⛔ Un pezzo che deve ESISTERE a monte, o l'interruttore mente.
 *
 * ## Il difetto, misurato il 2026-08-12
 *
 * L'owner: «l'assistente non ha accesso alla ricerca web, cosa che dovrebbe
 * essere tranquillamente accessibile dalla chat». Nelle Impostazioni
 * `web_search` era **acceso**, i permessi erano `allow`, e la sonda diceva
 * `offerti=59` **senza `web_search`**: il tool non veniva costruito affatto,
 * perché in `chatController` la sua dipendenza fa
 *
 *     const source = sendRuntime.search.source
 *     if (!source) return null      // nessun motore ⇒ nessun tool web
 *
 * e nessun motore di ricerca era mai stato scelto. Messa la chiave, la stessa
 * sonda ha detto `offerti=61 [web_search, web_read, …]`: la differenza di due è
 * la prova che la causa era quella.
 *
 * ## Perché il requisito sta nel CATALOGO e non nel pannello
 *
 * Un interruttore acceso su una capacità che **non può esistere** è la stessa
 * famiglia del comando morto: promette, e la promessa non è mantenibile. Chi
 * guarda quel pannello non ha modo di sapere che manca il pezzo a monte — e
 * infatti ha dedotto «me lo stanno bloccando», che era la spiegazione
 * sbagliata.
 *
 * Scritto qui, il requisito è un dato: il pannello lo legge invece di
 * conoscerlo, e un test può controllare che ogni tool che dipende da un
 * motore lo dichiari. Scritto nel pannello sarebbe stata una condizione privata
 * che nessuno può verificare — l'errore già pagato con l'ordine dei gruppi.
 */
export type TalosAgentToolRequisito = 'motoreDiRicerca'

export interface TalosAgentToolControl {
    id: TalosAgentToolId
    group: TalosAgentToolGroup
    actions: readonly TalosToolAction[]
    /** Ciò che deve esistere PRIMA, o il tool non viene nemmeno offerto. */
    richiede?: TalosAgentToolRequisito
}

/** Settings-only metadata; executable-factory conformance is test-guarded. */
export const TALOS_AGENT_TOOL_CONTROLS = Object.freeze([
    // I nomi dei file sono scritti da chi li ha portati: possono contenere istruzioni.
    { id: 'library_list', group: 'library', actions: ['read'] },
    { id: 'library_search', group: 'library', actions: ['read'] },
    // Il contenuto di un documento è il vettore classico dell'iniezione indiretta.
    { id: 'library_read', group: 'library', actions: ['read'] },
    // Metadati nostri, non testo di qualcun altro.
    { id: 'library_file_origin', group: 'library', actions: ['read'] },
    // Le note sono già marcate «non attendibili» in tutta l'app.
    { id: 'notes_list', group: 'personal', actions: ['read'] },
    { id: 'tasks_list', group: 'personal', actions: ['read'] },
    { id: 'memory_search', group: 'personal', actions: ['read'] },
    // L'unico tool che non tocca niente di nessuno.
    { id: 'time_now', group: 'personal', actions: ['read'] },
    // Stessa storia di `memory_write`: esisteva e il catalogo non lo sapeva.
    { id: 'research_list', group: 'personal', actions: ['read'] },
    { id: 'research_start', group: 'personal', actions: ['write', 'outbound'] },
    { id: 'research_read', group: 'personal', actions: ['read'] },
    { id: 'research_rename', group: 'personal', actions: ['write'] },
    { id: 'research_pause', group: 'personal', actions: ['write'] },
    { id: 'research_resume', group: 'personal', actions: ['write', 'outbound'] },
    { id: 'research_cancel', group: 'personal', actions: ['write'] },
    { id: 'research_delete', group: 'personal', actions: ['write'] },
    // Scovato dal test di copertura il 2026-08-06: esisteva come tool ma NON
    // era nel catalogo, quindi non compariva né fra gli interruttori né
    // nell'elenco «Riguarda:» della pagina dei permessi. Un tool invisibile ai
    // permessi è un tool che nessuno ha autorizzato consapevolmente.
    { id: 'memory_write', group: 'personal', actions: ['write'] },
    // Correggere una memoria e' una scrittura come un'altra; toglierla no —
    // sta nello stesso gruppo ma la sua scheda di consenso lo dice.
    { id: 'memory_update', group: 'personal', actions: ['write'] },
    { id: 'memory_delete', group: 'personal', actions: ['write'] },
    { id: 'notes_create', group: 'personal', actions: ['write'] },
    { id: 'notes_update', group: 'personal', actions: ['write'] },
    // Cancellare una nota non si annulla: non esiste un cestino.
    { id: 'notes_delete', group: 'personal', actions: ['write'] },
    { id: 'tasks_create', group: 'personal', actions: ['write'] },
    { id: 'tasks_complete', group: 'personal', actions: ['write'] },
    { id: 'tasks_update', group: 'personal', actions: ['write'] },
    { id: 'tasks_delete', group: 'personal', actions: ['write'] },
    // Esce dal dispositivo E porta dentro testo di altri: due terzi della trifecta in un tool solo.
    { id: 'web_search', group: 'web', actions: ['outbound','write'], richiede: 'motoreDiRicerca' },
    { id: 'web_read', group: 'web', actions: ['outbound','write'], richiede: 'motoreDiRicerca' },
    { id: 'document_create', group: 'create', actions: ['write'] },
    // Il prompt esce verso il provider: è trasmissione, anche se sembra creazione.
    { id: 'generate_image', group: 'create', actions: ['write','outbound'] },
    // L'HTML gira isolato (TalosArtifactActivity, connect-src 'none'): mai trasmissione, verificato sul Pad.
    { id: 'artifact_create', group: 'create', actions: ['write'] },
    // Esce dalla sandbox ma resta sul dispositivo. Canale obliquo noto: un file esportato può finire in una cartella sincronizzata — da rivedere se nasce la sincronizzazione.
    { id: 'library_export', group: 'library', actions: ['write','read'] },
    // Nel gruppo `library` e non in `personal`: chi toglie l'accesso alla
    // Libreria toglie ANCHE il permesso di svuotarla, in un colpo solo.
    { id: 'library_rename', group: 'library', actions: ['write'] },
    { id: 'library_delete', group: 'library', actions: ['write'] },
    // Cambia CHI può vedere cosa: è una modifica di sicurezza, non di contenuto.
    { id: 'library_context_policy_update', group: 'library', actions: ['write'] },
    // Le schede dei modelli su Hugging Face sono testo scritto da estranei.
    { id: 'local_models_search', group: 'models', actions: ['outbound'] },
    { id: 'local_model_inspect', group: 'models', actions: ['outbound'] },
    { id: 'local_model_download', group: 'models', actions: ['write','outbound'] },
    { id: 'local_models_status', group: 'models', actions: ['read'] },
    /**
     * ⭐ Il telefono. Non sono dati: sono cose che SUCCEDONO nel mondo.
     *
     * Tutte in regime «chiedi» o «leggi» — un intent, un'API pubblica — mai
     * «indovina». Il 43% di riuscita dell'automazione UI e' il soffitto di chi
     * deduce dai pixel, ed e' la misura di un metodo che qui non si usa.
     */
    { id: 'device_status', group: 'device', actions: ['read'] },
    { id: 'device_location', group: 'device', actions: ['read'] },
    { id: 'device_torch', group: 'device', actions: ['write'] },
    { id: 'device_media', group: 'device', actions: ['write'] },
    { id: 'device_vibrate', group: 'device', actions: ['write'] },
    { id: 'device_volume', group: 'device', actions: ['write'] },
    { id: 'device_alarm', group: 'device', actions: ['write'] },
    { id: 'device_open_app', group: 'device', actions: ['write'] },
    /*
     * ⛔ Lo screenshot è `write` E `read`: scrive un file in galleria, ma
     * soprattutto LEGGE ciò che c'è sullo schermo in quel momento — che può
     * essere la chat di un'altra persona, un conto in banca, un documento.
     * L'ordine di questa riga segue la FABBRICA, non il gusto: un cancello
     * confronta le due liste voce per voce.
     */
    { id: 'device_screenshot', group: 'device', actions: ['write', 'read'] },
    { id: 'device_open_settings', group: 'device', actions: ['write'] },
    /*
     * ⛔ `outbound` anche se e' la persona a premere: il testo ESCE dal
     * telefono se lo fa, e chi ha chiuso «mai in uscita» dev'essere fermato
     * qui — non davanti al pulsante di un'altra app.
     */
    { id: 'device_compose', group: 'device', actions: ['write', 'outbound'] },
    /*
     * ⛔ PARLARE E' UN'USCITA. Un documento privato letto ad alta voce e'
     * uscito dal dispositivo senza toccare la rete, e chiunque sia nella
     * stanza l'ha sentito. Il canale non e' un cavo, ma il dato e' fuori.
     */
    { id: 'device_speak', group: 'device', actions: ['write', 'outbound'] },
    // Lo sfondo LEGGE un file della Libreria per poterlo applicare: e' un dato
    // privato che esce dalla Libreria e finisce su una superficie che chiunque
    // guardi il telefono vede. Quindi `read` insieme a `write`.
    { id: 'device_wallpaper', group: 'device', actions: ['write', 'read'] },
    { id: 'device_keep_awake', group: 'device', actions: ['write'] },
    /*
     * ⛔ Solo `read`, e legge roba della PERSONA: quanta posta non ha ancora
     * aperto. Non manda niente e non tocca niente — ma chi ha chiuso «leggi»
     * dev'essere fermato anche qui.
     */
    { id: 'device_unread_mail', group: 'device', actions: ['read'] },
    /*
     * T2 — le capacita' che passano dalla shell via Shizuku, o dal pannello
     * che galleggia quando la shell non c'e'. Misurato il 2026-08-08: il
     * monitoraggio del produttore blocca solo il CONCEDERE permessi.
     */
    { id: 'device_wifi', group: 'device', actions: ['write'] },
    { id: 'device_bluetooth', group: 'device', actions: ['write'] },
    { id: 'device_airplane', group: 'device', actions: ['write'] },
    { id: 'device_power_saving', group: 'device', actions: ['write'] },
    { id: 'device_do_not_disturb', group: 'device', actions: ['write'] },
    // Senza valore LEGGE, con un valore SCRIVE: servono entrambe.
    { id: 'device_system_setting', group: 'device', actions: ['write', 'read'] },
    { id: 'device_app_usage', group: 'device', actions: ['read'] },
    { id: 'device_list_apps', group: 'device', actions: ['read'] },
    { id: 'device_notifications_list', group: 'device', actions: ['read'] },
    // ⛔ Rispondere manda un testo FUORI, a una persona vera: `outbound`
    // insieme a `write`, non una semplice scrittura locale.
    { id: 'device_notification_reply', group: 'device', actions: ['write', 'outbound'] },
    { id: 'device_notification_dismiss', group: 'device', actions: ['write'] },
    // ⛔ `outbound` insieme a `write`: guidare uno schermo può cercare sul web,
    // mandare un messaggio, comprare. Non è una scrittura locale.
    { id: 'device_screen_drive', group: 'device', actions: ['write', 'outbound'] },
    { id: 'app_azione', group: 'device', actions: ['write', 'outbound'] },
    { id: 'invia_file', group: 'device', actions: ['write', 'outbound'] },
    /*
     * ⭐⭐⭐ IL CALENDARIO — 2026-08-14, in LETTURA.
     *
     * ⛔ Sta in `personal` perché è roba della persona, non del telefono: chi
     * vuole spegnerlo lo cerca accanto a note e attività, non fra torcia e
     * volume. Ma sta IN FONDO alla lista, e non è un dettaglio: la guardia
     * AGENT-TOOLS-01 pretende che l'ordine di questo catalogo sia **identico**
     * a quello con cui il toolset costruisce gli attrezzi, e lì il calendario
     * si aggiunge per ultimo. Il raggruppamento a schermo lo fa `group`, non
     * la posizione.
     */
    { id: 'calendar_read', group: 'personal', actions: ['read'] },
    { id: 'calendar_write', group: 'personal', actions: ['write'] },
    // Crea un ARTEFATTO nuovo (un tool), non un contenuto per la persona —
    // gruppo 'create' come document_create/generate_image (il pannello
    // raggruppa per `group`, non per posizione nell'elenco: qui sta
    // ALLA FINE per combaciare con l'ordine reale in `toolset.ts`, dove
    // vive appena prima dei tool forgiati — l'ultimo innesto prima del
    // Forge, coerente con "un utente finale crea un tool con questo".
    { id: 'tool_create', group: 'create', actions: ['write'] },
] as const satisfies readonly TalosAgentToolControl[])

/**
 * ⭐⭐⭐ I POTERI CHE LA PERSONA PUO GOVERNARE OGGI — derivati, mai elencati.
 *
 * ## ⛔ Il difetto che questa costante impedisce, misurato il 2026-08-20
 *
 * Quando `execute` e entrata nel vocabolario per l'esecuzione di codice, tre
 * schermate iteravano `TALOS_TOOL_ACTIONS` per rispondere alla domanda «hai
 * gia concesso tutto?». Con una quarta parola nel vocabolario e nessun attrezzo
 * che la dichiara, quelle tre rispondevano **no** a chi aveva gia concesso
 * tutto — e gli avrebbero richiesto un permesso che aveva gia dato.
 *
 * ⇒ La domanda giusta non e «esistono altre parole?» ma «esistono altri
 * POTERI?». Qui la risposta si calcola dal catalogo degli attrezzi, una volta
 * sola, e le schermate la leggono invece di ricostruirla ognuna a modo suo.
 *
 * ⛔ E il giorno che il primo attrezzo dichiara `execute`, questa lista cresce
 * DA SOLA: la riga compare nella scheda, l'autonomia torna incompleta — ed e
 * corretto che torni incompleta, perche c'e davvero un potere nuovo da
 * concedere.
 */
export const TALOS_AZIONI_GOVERNATE: readonly TalosToolAction[] = talosAzioniGovernate(
    TALOS_AGENT_TOOL_CONTROLS.flatMap((controllo) => controllo.actions),
)
