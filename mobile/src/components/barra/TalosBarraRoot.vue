<script setup lang="ts">
/**
 * ⭐⭐ LA BARRA — TALOS sopra l'app che stai usando, senza portartene fuori.
 *
 * Owner 2026-08-11: «bisogna interagire con TALOS FUORI dall'applicazione…
 * posso interagire con lui mentre faccio altre cose», e sul primo disegno:
 * «nella versione compatta non è realmente compatta quando TALOS non parla».
 *
 * ## ⛔ IL PRIMO DISEGNO ERA UN PANNELLO, e il censimento l'ha smentito
 *
 * MISURATO sul Pad l'11 agosto, Gemini nominata assistente e chiamata da Chrome,
 * con `uiautomator dump` a ogni passo (schermo 2400×3392):
 *
 *   riposo     pillola  986×133 px → **41% della larghezza**, centrata
 *   scrittura  la pillola cresce sul posto
 *   risposta   una CARTA SEPARATA 1113×1878 (46%×55%) — e la pillola TORNA compatta
 *
 * Cioè sono DUE oggetti: la pillola, che non cambia mai taglia, e la carta, che
 * va e viene. Il mio primo disegno teneva testa, chip, campo e tondi sempre a
 * schermo — un pannello. Questa è la forma giusta, misurata.
 *
 * ## ⭐ La firma: L'ORLO
 *
 * Un gradiente che gira su TUTTO il perimetro, e porta da solo i tre stati:
 * fermo, che respira mentre ascolta, che corre mentre il modello lavora.
 * ⭐ E qui li superiamo, perché Gemini **non ha nessun segnale di stato**: la
 * carta compare e basta. Un bordo che si muove è l'unica cosa che si legge con
 * la coda dell'occhio mentre guardi l'app sotto.
 *
 * ⛔ Nasceva come un filo da 2 px sul solo bordo alto. L'owner, guardandolo
 * sopra Wikipedia: «fai in modo che abbia un gradiente animato come Gemini, che
 * lo distacchi bene dallo sfondo». Aveva ragione due volte — il segnale si
 * vedeva poco, e su un fondo chiaro il pannello non staccava. La firma non è
 * cambiata: si è estesa dal bordo al perimetro. Il come sta nel foglio di stile,
 * alla voce `.orlo`.
 *
 * ## ⭐ Il sorpasso: il contesto sta DENTRO la pillola, col numero
 *
 * Una spia e un numero — `● 403` — che dicono quanto TALOS ha visto della tua
 * schermata, e un tocco lo spegne. Gemini quel contesto lo prende e non lo
 * nomina mai, in nessuno dei suoi stati (censito: nell'albero non esiste un
 * nodo che lo dica). Sta nella pillola perché deve costare zero spazio: è una
 * pastiglia dentro la pastiglia, non una riga in più.
 *
 * ## ⛔ Perché è una radice a sé e non una schermata dell'app
 *
 * Monta senza la shell: niente sidebar, niente navigazione, niente stazioni.
 * Pagare la shell per una casella che vive dieci secondi renderebbe lenta ad
 * aprirsi proprio la funzione il cui scopo è non farti aspettare. ⛔ Ma la CHAT
 * è la stessa: `useChatController()` è un oggetto condiviso, quindi memoria,
 * cronologia e strumenti sono quelli veri, non una copia.
 */
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'
import { ArrowUp, Camera, Copy, Eye, EyeOff, FileText, Image, Library, Maximize2, Mic, Paperclip, Plus, Square, Volume2, VolumeX, X } from '@lucide/vue'
import TalosMobileMessageContent from '@/components/chat/TalosMobileMessageContent.vue'
import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'
import { useTalosMobileDictation } from '@/composables/useTalosMobileDictation'
import { talosDettaturaAnnota as annota } from '@/services/dictation'
import { useTalosRispostaAVoce } from '@/composables/useTalosRispostaAVoce'
import { useTalosSpeech } from '@/composables/useTalosSpeech'
import { talosOffsetDelTrascinamento, talosTrascinamentoApre } from '@/lib/barra/trascinamento'
import { TALOS_METADATA_DETTATO, TALOS_METADATA_SCHERMO } from '@/lib/tools/tracciaAzione'
import type { TalosModoBarra } from '@/lib/barra/modoBarra'

/*
 * ⛔ `chiamata` non sta in `TalosModoBarra` perché non si legge dall'indirizzo:
 * lo conta chi riceve gli indirizzi (`lib/barra/avvia.ts`). Metterlo nel tipo
 * che il parser produce vorrebbe dire chiedergli un dato che non ha.
 */
const props = defineProps<{ modo: TalosModoBarra & { chiamata?: number } }>()

const { t, locale } = useTalosI18n()
const controller = useChatController()
const chat = controller.chat

/**
 * ⛔⛔ IL PERMESSO SI CHIEDEVA DOVE NESSUNO POTEVA RISPONDERE.
 *
 * MISURATO sul Pad il 2026-08-12: dall'assistente, «guida tu lo schermo» fa
 * comparire nella barra la riga «1 richiesta di autorizzazione per uno strumento
 * è in attesa. Puoi continuare a usare la chat» — e **la scheda non c'è**. Vive
 * solo in `App.vue`, cioè nell'app intera, che in quel momento non si sta
 * guardando.
 *
 * ⇒ Dalla modalità assistente il controllo del dispositivo non si poteva
 * autorizzare **affatto**: né una volta, né sempre. È il buco a monte del
 * rilievo dell'owner sul «Consenti sempre» — quel bottone l'ho abilitato per
 * `device_screen_drive` un'ora fa, e da qui restava irraggiungibile lo stesso.
 *
 * Lo stato è lo STESSO dell'app, non una copia: `useChatController()` è un
 * oggetto condiviso, quindi una richiesta risposta di qua è risposta e basta —
 * non c'è una seconda coda da tenere allineata.
 *
 * ⛔ Il componente si carica a richiesta: pesa solo quando un permesso serve
 * davvero, e la barra deve poter comparire sopra un'altra app senza portarsi
 * dietro una scheda che nella maggior parte delle aperture non si vedrà mai.
 */
const consenso = computed(() => controller.pendingToolAuthorizations.value[0] ?? null)
const consensoVisibile = computed(() =>
    consenso.value !== null && controller.toolAuthorizationPromptVisible.value)
const SchedaConsenso = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileToolConsentSheet.vue'))

const bozza = ref('')
const errore = ref<string | null>(null)
const copiato = ref(false)

/**
 * ⛔ LA CARTA NASCE VUOTA, e questo è un difetto chiuso, non una scelta di stile.
 *
 * Provato sul Pad: la barra riprende la chat vera (che è il punto), e mostrava
 * l'ultima risposta di quella chat — «7 per 8 è un'operazione…» — a chi non
 * aveva chiesto niente. Sembrava che TALOS avesse risposto da solo. La carta
 * compare solo quando una domanda è stata fatta DA QUI.
 */
const domanda = ref('')

/**
 * ⭐⭐ COSA È PARTITO INSIEME ALLA DOMANDA — e senza, non lo sapeva nessuno.
 *
 * ## Il difetto, visto sul Pad il 12 agosto
 *
 * Owner: l'invio file dall'assistente «non è mai stato testato sul dispositivo
 * visivamente, è un errore gravissimo». Provato: il percorso FUNZIONA — `+` →
 * Libreria → gettone → invio, e il file arriva davvero al modello.
 *
 * ⛔ Ma nell'istante dell'invio il gettone sparisce (giustamente: `clearSent`,
 * se no il messaggio dopo se lo porterebbe dietro) e nella carta **non resta
 * nessun segno**. Da fuori, «ho mandato la foto» e «ho mandato solo il testo»
 * sono identici — e chi ha allegato qualcosa non ha modo di sapere se il modello
 * lo ha ricevuto. La risposta arriva e non sai da cosa nasce.
 *
 * ⇒ Si tiene il NOME di ciò che è partito, accanto alla domanda. Non è
 * decorazione: è la sola prova, dal lato della persona, che l'allegato ha
 * viaggiato.
 */
const allegatiPartiti = ref<string[]>([])

/**
 * Il contesto è acceso.
 *
 * ⛔ Parte ACCESO perché la persona ha appena chiamato TALOS guardando quella
 * schermata: fingere di non averla vista sarebbe finto quanto usarla di
 * nascosto. Quello che conta è che si legga e che si possa togliere.
 */
const contestoDisponibile = computed(() => props.modo.contesto.nodi > 0)
/*
 * ⛔ Tre stati, non due: `null` vuol dire «non ho ancora scelto io».
 *
 * Con un booleano inizializzato dal numero, un contesto che arriva DOPO
 * l'apertura (e arriva dopo: il sistema conta i nodi dopo averci mostrati)
 * troverebbe la spia gia' decisa a «spento» e non si riaccenderebbe mai. Con il
 * terzo stato la scelta della persona vince sempre, e finche' non c'e' comanda
 * la disponibilita'.
 */
const scelta = ref<boolean | null>(null)
const guardo = computed(() => scelta.value ?? contestoDisponibile.value)

const voce = useTalosRispostaAVoce({
    streaming: () => chat.state.streamingText,
    messaggi: () => chat.messages,
    interfaccia: () => locale.value,
})

const dettatura = useTalosMobileDictation({
    base: () => bozza.value,
    onTranscript: (testo) => {
        /*
         * ⛔⛔ HA PARLATO: il limite dei dieci secondi non lo riguarda più.
         *
         * Quel limite è «quanto aspetto che tu COMINCI». Lasciarlo armato mentre
         * qualcuno sta parlando vorrebbe dire tagliargli la frase a metà allo
         * scadere — cioè rifare, da un'altra porta, il difetto che l'owner ha
         * segnalato due volte («non faccio in tempo a finire di parlare»).
         */
        if (timerAscolto !== null) { clearTimeout(timerAscolto); timerAscolto = null }
        const prima = bozza.value
        bozza.value = testo
        voce.dettatura(prima, testo)
    },
    autoLanguage: () => true,
    allowedLanguages: () => voce.lingue,
    /**
     * ⛔⛔ CHI PARLA TACE — e questa riga MANCAVA, ed è il difetto che rendeva
     * l'assistente inutilizzabile.
     *
     * Owner 2026-08-11: «l'assistente parte con la modalità ascolto ma se parlo
     * non ascolta e non recepisce le parole; per farlo funzionare devo
     * ripremere il pulsante microfono».
     *
     * ## Come si è chiusa, e perché la mia prima ipotesi era sbagliata
     *
     * Avevo misurato una traccia piatta — `orlo=fermo` per dodici secondi — e
     * dato la colpa a `zittisci` che restava appeso. Ho guardato chi lo passa:
     * **solo `ChatScreen.vue`**. La barra non lo passava affatto, quindi non
     * poteva appendersi. Non era una riga che si bloccava: era una riga che
     * NON C'ERA.
     *
     * E il commento in testa a `start()` dice già cosa succede senza, misurato
     * sul Pad il 10 agosto: se TALOS sta leggendo e parte il microfono, il
     * riconoscitore **non parte proprio** e arriva `recognitionFailed` in 500
     * ms. La barra apriva l'ascolto mentre la voce leggeva ancora la risposta
     * di prima ⇒ errore immediato, orlo `fermo`, e la ripresa automatica non
     * scattava perché riparte solo sul SILENZIO, non su un errore vero.
     *
     * ⇒ Ecco perché «ripremere il microfono» funzionava: nel frattempo la voce
     * aveva finito. E perché dalla tendina andava: lì non c'era nessuna lettura
     * in corso.
     *
     * ⛔ La cura era già scritta e collaudata in `ChatScreen`. Il difetto vero è
     * che la barra è una SECONDA superficie sulla stessa funzione, e le due
     * possono divergere in silenzio — è il rischio che avevamo dichiarato
     * scegliendo di ereditare, e questa volta ci ha morso.
     */
    zittisci: () => lettura.stop('la barra apre il microfono'),
    /**
     * ⛔⛔ 1600 ms, e sono la differenza fra «ascolta» e «fa finta».
     *
     * Il motore chiude il turno col SUO tempo di default — corto — e nessuno
     * gli aveva mai detto altrimenti (`silenceMillis` esisteva nel nativo e non
     * lo passava nessuno). Per tenere l'ascolto acceso lo riaprivamo, e
     * `startListening` richiamata a raffica **fallisce in silenzio**:
     * `onBeginningOfSpeech` non arriva più. Da fuori è esattamente quello che
     * ha visto l'owner: «la modalità ascolto rimane ma non ascolta niente».
     *
     * ⇒ Si dice al motore di aspettare. 1600 ms lasciano respirare una pausa in
     * mezzo a una frase, e sono abbastanza corti perché smettere di parlare
     * chiuda il turno — che è anche il segnale con cui la domanda parte da sola.
     */
})

/**
 * ⛔⛔ I DUE TEMPI DELL'ASCOLTO, che per un giorno intero sono stati uno solo.
 *
 * MISURATO sul Pad l'11 agosto, in `logcat`, prima di scrivere questi due
 * numeri:
 *
 *     onMicrophoneOpened          20:44:42.625
 *     onMicrophoneCloseRequested  20:44:44.625   ← 2000 ms netti
 *     NO_SPEECH_DETECTED          20:44:44.786
 *     (riapertura)                20:44:45.343   ← 718 ms da SORDO in mezzo
 *
 * Duemila millisecondi sono il default del motore, e sono meno del tempo che
 * una persona impiega a decidere cosa chiedere. Owner: «parte, dice che
 * ascolta, io parlo e non succede nulla».
 *
 * ⛔ Sono DUE decisioni, e vanno tenute separate:
 *
 *   - **quanta pausa vuol dire «ho finito»** — corta, perché la domanda deve
 *     partire da sola appena smetti di parlare (è un'altra cosa che l'owner ha
 *     chiesto lo stesso giorno);
 *   - **quanto il microfono resta aperto anche se non hai ancora aperto bocca**
 *     — lunga, perché chi chiama un assistente spesso pensa mezzo secondo prima
 *     di parlare, e trovarselo chiuso in faccia è il difetto di oggi.
 *
 * Legarle — com'erano, con un `× 5` che avevo scelto senza misurarlo — vuol
 * dire che non puoi accorciare l'invio senza accorciare anche la pazienza.
 */
/*
 * ⛔⛔ DIECI SECONDI, E POI LO DICE — owner 2026-08-12, verbatim: «metti in
 * ascolto TALOS per un massimo di 10 secondi come fa Gemini, prima di dire che
 * il messaggio non è arrivato».
 *
 * Erano trenta, e li avevo scelti io. Trenta secondi di pillola accesa su una
 * stanza vuota non sono pazienza: sono un microfono aperto che nessuno ha
 * chiesto, e alla fine si spegneva **in silenzio** — la persona non sapeva se
 * TALOS stesse ancora ascoltando, se avesse sentito, o se si fosse rotto.
 *
 * ⛔ E il numero è dell'owner, non mio: la ricerca sul comportamento di Gemini
 * non pubblica questa soglia (le discussioni pubbliche riguardano il verso
 * opposto — chiude troppo presto mentre parli). Lui l'ha guardato; io no, ed è
 * una cosa che avrei dovuto misurare da solo prima che me la chiedesse.
 *
 * ⛔ NON è la pausa di fine frase: quella vale 2.200 ms e decide quando parte la
 * domanda. Questa decide per quanto tempo TALOS resta in attesa che tu **cominci**.
 */
const ATTESA_MS = 10_000
/** Quanto si aspetta prima di riaprire il motore. Vedi la ripresa qui sotto. */
/**
 * ⛔ IL RESPIRO FRA DUE SESSIONI — 500 ms, e 300 sono stati PROVATI e scartati.
 *
 * Fra la chiusura di una sessione e la riapertura TALOS è fisicamente sordo:
 * MISURATO sul Pad, 437-560 ms col respiro a 500. Provato a 300: il buco scende
 * a **372 ms** e la riapertura funziona — ma è **un solo campione**, contro tre
 * su tre a 500 ms, per un guadagno di ~130 ms.
 *
 * ⛔ E il modo di fallire non è simmetrico: riaprire dentro la finestra in cui
 * la sessione precedente si sta ancora chiudendo mette il riconoscitore in uno
 * stato in cui **non sente più niente e non lo dice** — cioè esattamente il
 * difetto che questa barra ha già pagato una volta. Un guasto rumoroso lo si
 * scambia volentieri per 130 ms; un guasto muto no.
 *
 * Da riaprire quando le riaperture torneranno frequenti: con la pausa di fine
 * frase a 2200 ms e il minimo a 8000 le sessioni durano decine di secondi, e
 * questo buco si paga di rado.
 */
const RESPIRO_MS = 500
const ascoltoVoluto = ref(props.modo.daVoce)
let scadenzaAscolto = props.modo.daVoce ? Date.now() + ATTESA_MS : 0

/**
 * ⛔⛔ UN LIMITE È UN TIMER, non una scadenza che qualcuno passa a controllare.
 *
 * ## Il difetto, visto sullo SCHERMO contro il log
 *
 * MISURATO sul Pad il 12 agosto, aprendo l'assistente e stando zitto:
 *
 *     09:13:27.728  barra: stato=listening voluto=true
 *     …e poi NIENTE. Per diciassette secondi.
 *
 * Il motore era muto — nessun errore, nessun risultato — e la barra continuava a
 * dire «Ti ascolto» col microfono acceso. Lo screenshot lo mostrava mentre il
 * diario diceva il contrario, ed è la lezione già pagata: si guarda lo schermo.
 *
 * ⛔ La scadenza esisteva già (`scadenzaAscolto`) e non poteva servire: la
 * leggeva SOLO `riapriSePossibile`, cioè solo quando il motore riferiva qualcosa.
 * Un limite che dipende dalla collaborazione della cosa che stai limitando non è
 * un limite — e il caso in cui serve davvero è esattamente quello in cui quella
 * cosa ha smesso di rispondere.
 *
 * ⇒ Owner 2026-08-12: «massimo 10 secondi, come fa Gemini, prima di dire che il
 * messaggio non è arrivato». Dieci secondi veri, contati da qui.
 */
let timerAscolto: ReturnType<typeof setTimeout> | null = null

/**
 * Si smette di ascoltare — davvero, e dicendolo se c'è qualcosa da dire.
 *
 * ⛔ `dettatura.cancel()` NON è un dettaglio: senza, l'intenzione muore e il
 * microfono resta aperto. È la metà che si dimentica ogni volta.
 */
function fermaLAscolto(messaggio: string | null): void {
    if (timerAscolto !== null) { clearTimeout(timerAscolto); timerAscolto = null }
    ascoltoVoluto.value = false
    dettatura.cancel()
    if (messaggio !== null) errore.value = messaggio
}

/**
 * ⛔⛔ ASCOLTA = È LA NOSTRA INTENZIONE, non «il motore è agganciato adesso».
 *
 * Owner 2026-08-11, col video: «appena apro l'assistente la modalità ascolto si
 * spegne dopo un secondo circa».
 *
 * Era vero, e la causa era qui: il motore vocale chiude il turno appena non
 * sente niente, noi lo riapriamo subito (100 ms, misurati), ma in mezzo lo stato
 * passava per `error` e la pillola diceva «fermo». Per chi guarda, TALOS si era
 * spento e riacceso — e in mezzo non sapeva se parlare.
 *
 * ⇒ I riavvii del motore sono affar NOSTRO. Finché la sessione di ascolto è
 * aperta (`ascoltoVoluto`), la barra dice che ascolta: è la verità dal punto di
 * vista di chi parla. Quando smettiamo davvero — tempo scaduto, o la persona ha
 * deciso — `ascoltoVoluto` va a falso e la pillola si spegne una volta sola.
 */
const ascolta = computed(() =>
    ascoltoVoluto.value
    || dettatura.status.value === 'listening'
    || dettatura.status.value === 'starting',
)
const lavora = computed(() => chat.state.sending)

/**
 * ⭐⭐ L'ONDA CHE REAGISCE AL VOLUME, e prende il posto del testo mentre parli.
 *
 * ## Da dove viene, e cosa c'era prima
 *
 * Owner 2026-08-12, con lo screenshot di Gemini a fianco: «quando parli con
 * Gemini non fa vedere il testo scritto ma fa vedere solo una wave che reagisce
 * al suono… pareggialo e miglioralo». E la sua correzione, che è il punto:
 * quella di Gemini **reagisce in base al volume**.
 *
 * ⛔ Qui c'erano TRE barre con un'animazione CSS a ciclo fisso — `barra-livello
 * 900ms infinite` — cioè un disegno che si muove uguale in una stanza vuota e
 * mentre urli. E il `level` del composable era calcolato da **quanto cresce il
 * testo trascritto**: reagiva al riconoscimento, con centinaia di millisecondi
 * di ritardo, e restava fermo mentre parlavi. Adesso arriva il dB vero del
 * microfono (`onRmsChanged` → ponte → `realLevel`).
 *
 * ## Il sorpasso su Gemini, e non è una copia
 *
 * MISURATO sulla fonte (9to5google, 19 marzo 2026, il redesign che l'owner sta
 * guardando): Gemini «replaces the text field with a waveform», e durante la
 * registrazione **non c'è nessuna anteprima** — le parole si vedono solo DOPO
 * l'invio. Il recensore stesso lo chiama «a bit strange in the context of
 * transcription».
 *
 * ⇒ Noi nascondiamo il testo mentre parli — quella parte è giusta, il testo che
 * si riscrive da solo sotto gli occhi è rumore — ma quando smetti lo mostriamo
 * **prima** di mandarlo, dentro la finestra di grazia, e si può correggere.
 * Gemini ti fa spedire alla cieca.
 *
 * ## Perché una CODA e non una barra sola
 *
 * Una barra sola dice «adesso c'è del suono». Una coda dice **come stai
 * parlando** — dove hai preso fiato, dove hai alzato la voce — e rende visibile
 * l'unica cosa che la persona vuole sapere: «mi sta sentendo davvero?». Sono i
 * 2,2 secondi che contano, a 80 ms l'uno.
 */
const ONDE = 28
const onde = ref<number[]>(new Array(ONDE).fill(0))
let campionatore: ReturnType<typeof setInterval> | null = null

/*
 * ⛔⛔ `immediate: true`, E SENZA QUESTA PAROLA L'ONDA È PIATTA NELL'ASSISTENTE.
 *
 * Owner 2026-08-12, tre volte: «nella chat la waveform funziona bene, ma
 * nell'assistente è piatta». L'asimmetria era tutta qui, e l'ho cercata due
 * build nel nativo prima di guardare questa riga.
 *
 * `watch` è PIGRO: chiama solo su un CAMBIAMENTO. Nella chat `ascolta` parte
 * falso e diventa vero quando premi il microfono — un cambiamento, quindi il
 * campionatore parte. Nella barra `ascoltoVoluto` nasce **già vero**
 * (`ref(props.modo.daVoce)`, riga sopra), perché l'assistente si apre in
 * ascolto: `ascolta` non cambia mai, il guardiano non scatta mai, e le ventotto
 * barre restano a zero per sempre.
 *
 * ⛔ E il difetto non si vede leggendo il guardiano: è corretto. Si vede solo
 * mettendo insieme DUE righe distanti cento — dove nasce lo stato e chi lo
 * guarda. È la ragione per cui il volume arrivava (`db=1.48` nel diario) e lo
 * schermo restava fermo: due fatti veri e nessuno dei due sbagliato.
 */
watch(ascolta, (acceso) => {
    if (acceso) {
        if (campionatore !== null) return
        campionatore = setInterval(() => {
            // ⛔ Un array NUOVO: Vue non si accorge di uno `shift` in posto.
            onde.value = [...onde.value.slice(1), dettatura.level.value]
        }, 80)
        return
    }
    if (campionatore !== null) { clearInterval(campionatore); campionatore = null }
    onde.value = new Array(ONDE).fill(0)
}, { immediate: true })

/**
 * ⛔ Il campo è ALTO più di una riga ⇒ la pillola diventa una carta.
 *
 * È la forma che l'owner ha fotografato su Gemini: il testo prende tutta la
 * larghezza e i comandi scendono su una riga sotto. Con i comandi in linea, a
 * quattro righe di testo la pillola diventa un rettangolo con due bottoni
 * incollati a metà altezza — che è esattamente com'era.
 *
 * ⛔ Si MISURA, non si conta: `bozza.length` sarebbe sbagliato al primo a capo
 * scritto a mano e al primo cambio di scala del testo.
 */
const campoEl = ref<HTMLTextAreaElement | null>(null)
const campoAlto = ref(false)

function misuraIlCampo(): void {
    const el = campoEl.value
    if (!el) { campoAlto.value = false; return }
    /*
     * ⛔⛔ L'IMBOTTITURA VA TOLTA, o la carta compare con UNA riga sola.
     *
     * MISURATO sul Pad il 12 agosto, con lo screenshot: scritto «cosa vedi in
     * questa immagine» — una riga — e la pillola era già diventata carta, col
     * `+` in basso a sinistra e la freccia in basso a destra.
     *
     * `scrollHeight` è l'altezza del CONTENUTO **più il riempimento verticale**.
     * Con `padding` sopra e sotto, una riga sola supera `lineHeight × 1,6` senza
     * che il testo sia andato a capo: la soglia guardava la cosa giusta con il
     * metro sbagliato.
     *
     * ⇒ Si sottrae ciò che non è testo, e si confronta con UNA riga e mezza:
     * mezza riga di margine assorbe l'arrotondamento dei caratteri senza
     * lasciar passare la seconda riga vera.
     */
    const stile = getComputedStyle(el)
    const riga = Number.parseFloat(stile.lineHeight) || 20
    const imbottitura = (Number.parseFloat(stile.paddingTop) || 0)
        + (Number.parseFloat(stile.paddingBottom) || 0)
    campoAlto.value = (el.scrollHeight - imbottitura) > riga * 1.5
}

watch(() => bozza.value, () => { void nextTick(misuraIlCampo) })

/**
 * ⭐⭐ L'ASCOLTO NON MUORE DA SOLO — owner 2026-08-11: «assicurati che
 * l'assistente si apra SEMPRE in modalità ascolto».
 *
 * ## ⛔ Il difetto, misurato sul Pad
 *
 * Chiamata la barra col gesto dell'assistente e lasciata lì sei secondi, due
 * testimoni indipendenti dicevano la stessa cosa:
 *
 *     appops:  RECORD_AUDIO: allow; duration=+2s029ms   ← preso e RILASCIATO
 *     DOM:     microfono="Parla"  orlo="fermo"          ← non sta ascoltando
 *
 * ⇒ L'ascolto partiva davvero, e moriva dopo **due secondi**: il motore vocale
 * chiude da solo quando non sente niente, e la barra restava muta con l'aria di
 * non aver mai ascoltato. Chi chiama un assistente e poi pensa un attimo prima
 * di parlare trovava il microfono già spento.
 *
 * ## La cura, e i suoi limiti
 *
 * Il silenzio NON è un errore: si riparte. Ma con tre freni, perché un
 * microfono che si riaccende all'infinito è la cosa peggiore che un'app possa
 * fare a chi si fida:
 *
 *   1. un TETTO di riprese — dopo `RIPRESE_MASSIME` silenzi TALOS smette, e la
 *      pillola resta lì pronta a essere scritta;
 *   2. la persona VINCE sempre — se tocca il microfono per fermarlo, se scrive,
 *      o se manda la domanda, non si riparte più (`ascoltoVoluto` va a falso);
 *   3. si riparte SOLO sul silenzio (`noSpeech`). Un errore vero — permesso
 *      negato, motore rotto — non si insiste: si mostra.
 */
/**
 * ⛔ QUANTO ASPETTA, e perché un TEMPO e non un numero di tentativi.
 *
 * La prima versione contava quattro riprese. Owner 2026-08-11, col video: «appena
 * apro l'assistente la modalità ascolto si spegne dopo un secondo circa». Il
 * motore vocale chiude il turno appena non sente niente — a volte dopo quattro
 * secondi, a volte dopo uno — quindi contare i tentativi vuol dire aspettare un
 * tempo che cambia da apertura ad apertura. Trenta secondi sono trenta secondi.
 */

/**
 * ⛔⛔ UNA SOLA PORTA PER RIAPRIRE — e il difetto era che ce n'erano due, e una
 * non portava da nessuna parte.
 *
 * ## Il difetto, letto in `logcat` l'11 agosto
 *
 *     21:09:41.695  web: stato:stopping
 *     21:09:42.380  web: barra: stato=idle  voluto=true    ← finito, e volevamo ancora
 *     21:09:42.661  errore=NO_MATCH
 *
 * Il motore chiude una sessione in DUE modi, e da fuori si assomigliano:
 *
 *   - `error` + `noSpeech` — non ha sentito proprio niente;
 *   - `idle` — ha sentito QUALCOSA (un rumore, una sillaba, una parola che poi
 *     ha scartato) e ha chiuso il turno regolarmente.
 *
 * La ripresa automatica guardava solo il primo. Il secondo — che è il caso
 * normale in una stanza dove esiste un rumore qualunque — usciva in silenzio:
 * la pillola restava accesa, il microfono era chiuso, e la persona parlava a
 * un'app che non stava più ascoltando. È letteralmente la frase dell'owner:
 * «la modalità ascolto rimane, ma non ascolta un cazzo».
 *
 * ⛔ Distinguere i due esiti serviva a UN'ALTRA cosa — decidere se mandare la
 * domanda — e quella distinzione resta: si manda solo se c'è del testo. Ma
 * «riaprire» non dipende da COME è finita: dipende solo da se la persona
 * voleva ancora parlare e da quanto tempo le abbiamo promesso.
 */
function riapriSePossibile(motivo: string): void {
    if (!ascoltoVoluto.value) return
    /*
     * ⛔⛔ NON SI RIAPRE IL MICROFONO MENTRE TALOS HA LA PAROLA.
     *
     * ## Il difetto, e il diario che l'ha inchiodato
     *
     * Owner 2026-08-12, quattro volte di fila: «il discorso si tronca prima di
     * finire, poco dopo essere iniziato». Avevo cercato in quattro posti
     * sbagliati — la coda del motore, il testo già tagliato, il guardiano di
     * fine risposta, i tempi. La traccia della voce l'ha chiuso in una corsa:
     *
     *     53.033  errore:NO_MATCH                     ← il microfono chiude per SILENZIO
     *     53.034  barra: riapro fra un respiro (silenzio)
     *     53.534  barra: chiamo toggle
     *     53.534  voce: STOP (la barra apre il microfono) mentre leggeva=-
     *
     * Mentre TALOS parla il microfono è ancora aperto e non sente parole: il
     * motore chiude il turno con `NO_MATCH`, questa funzione lo riapre — e ogni
     * riapertura passa da `zittisci()`, che **ammutolisce TALOS**. Ogni due
     * secondi e mezzo. La prima arriva subito dopo l'inizio della risposta, ed è
     * esattamente ciò che si sente.
     *
     * ⛔ E il `mentre leggeva=-` della riga dice che il colpevole NON era il
     * guardiano di fine risposta scritto oggi: è questa strada, che esisteva da
     * prima e riapre per il silenzio senza chiedersi chi stia parlando.
     *
     * ⇒ Chi parla tace, ed è la stessa regola già scritta per il verso opposto
     * (`zittisci` prima di ascoltare). Mancava la metà simmetrica: **non
     * ascoltare mentre parli**. Quando TALOS ha finito, la ripresa arriva dal
     * guardiano su `talosParla` — che per questo esiste.
     */
    if (talosParla.value) {
        annota(`barra: TALOS sta parlando, NON riapro (${motivo})`)
        return
    }
    if (Date.now() >= scadenzaAscolto) {
        annota(`barra: scaduta (${motivo}), smetto e lo dico`)
        /*
         * ⛔⛔ E SI DICE. Prima si spegneva in silenzio: la pillola smetteva di
         * pulsare e basta, e da fuori «ha finito di ascoltare», «non ha sentito
         * niente» e «si è rotto» erano la stessa identica cosa.
         *
         * Un assistente che chiude il microfono senza dire perché costringe la
         * persona a indovinare — ed è l'unico punto della barra in cui la
         * risposta giusta («non ho sentito niente, riprova») era già scritta e
         * non veniva mostrata a nessuno.
         *
         * ⛔ Questa è la SECONDA porta: quella che conta è il timer in
         * `vogliAscoltare`, perché questa qui si attraversa solo se il motore
         * riferisce qualcosa — e il caso che fa male è proprio quello in cui il
         * motore ammutolisce. Restano tutte e due: chiudono lo stesso cancello da
         * due lati, e non si contraddicono (`fermaLAscolto` è idempotente).
         */
        fermaLAscolto(t('barra.nessunaVoce'))
        return
    }
    annota(`barra: riapro fra un respiro (${motivo})`)
    /*
     * ⛔ Si RESPIRA prima di riaprire. `cancel()` e la chiusura della sessione
     * precedente non sono istantanei, e riaprire dentro quella finestra è il
     * modo documentato per mettere il riconoscitore in uno stato in cui non
     * sente più niente.
     */
    setTimeout(() => {
        if (!ascoltoVoluto.value) { annota('barra: nel respiro la persona ha smesso'); return }
        if (dettatura.status.value === 'listening' || dettatura.status.value === 'starting') {
            annota('barra: nel respiro era gia ripartito')
            return
        }
        annota('barra: chiamo toggle')
        // ⛔ Il `catch`: `toggle()` è una promessa, e una promessa che esplode
        // dentro un `setTimeout` non la vede NESSUNO. Se l'avvio fallisce, la
        // pillola resta accesa su un motore morto — che è il difetto di sopra
        // con un'altra causa.
        void dettatura.toggle().catch((errore: unknown) => {
            annota(`barra: toggle ESPLOSO ${String(errore).slice(0, 80)}`)
        })
    }, RESPIRO_MS)
}

watch(
    () => [dettatura.status.value, dettatura.errorCode.value] as const,
    ([stato, codice]) => {
        /*
         * ⛔ OGNI USCITA DICE PERCHÉ. Questo guardiano ha tre porte di rifiuto e
         * dal di fuori sono indistinguibili: la pillola resta accesa in tutti e
         * tre i casi. L'11 agosto è costato ore capire quale delle tre scattava,
         * perché nessuna lasciava traccia. Ora finiscono in `logcat` accanto ai
         * tempi veri del motore (vedi `talosDettaturaAnnota`).
         */
        annota(`barra: stato=${stato} codice=${codice ?? '-'} voluto=${ascoltoVoluto.value}`)
        if (stato !== 'error') return
        /*
         * ⛔⛔ UN GUASTO HA UN CODICE — e senza questa riga la conversazione si
         * spegneva da sola al primo silenzio.
         *
         * MISURATO sul Pad il 12 agosto, a ogni riapertura dopo una pausa:
         *
         *     barra: stato=error codice=noSpeech voluto=true
         *     barra: riapro fra un respiro (silenzio)
         *     barra: chiamo toggle
         *     barra: stato=error codice=- voluto=true      ⛔ eccolo
         *     barra: guasto vero (-), lo dico e smetto
         *     barra: stato=starting codice=- voluto=false  ← l'intenzione è morta
         *
         * `start()` azzera il codice PRIMA di mettere lo stato a `starting`, e in
         * mezzo ci sono due attese vere (la voce che tace, il permesso del
         * microfono): per tutta quella finestra la coppia è `('error', null)`.
         * Non è un guasto — è lo stato di mezzo di una ripartenza. Questo
         * guardiano lo prendeva per un guasto, mostrava un errore e smetteva di
         * voler ascoltare, cioè uccideva la ripresa che aveva appena chiesto.
         *
         * ⛔ È un difetto che ho introdotto io ieri insieme alla cura giusta
         * («un errore vero si dice»): la cura guardava lo STATO e non il codice,
         * e uno stato senza codice non dice niente su cosa sia successo.
         */
        if (codice === null) {
            annota('barra: error senza codice = sto ripartendo, non è un guasto')
            return
        }
        /*
         * ⛔⛔ UN ERRORE VERO SI DICE, e prima non lo diceva nessuno.
         *
         * Trovato dallo scouting agentico il 12 agosto: `dettatura.error` non
         * compariva in NESSUN punto di questo file. Col permesso del microfono
         * negato, o col riconoscitore rotto, questo guardiano usciva in silenzio
         * (l'errore non è `noSpeech`, quindi niente ripresa) e lasciava
         * `ascoltoVoluto` a vero: la pillola diceva «Ti ascolto» per sempre, su
         * un microfono che non esisteva.
         *
         * ⇒ Il silenzio si riprende, un guasto si MOSTRA e si smette. La
         * distinzione fra i due era già scritta nel codice — mancava la metà
         * che riguarda la persona.
         */
        if (codice !== 'noSpeech') {
            annota(`barra: guasto vero (${codice ?? '-'}), lo dico e smetto`)
            annullaLaGrazia('guasto della dettatura')
            // ⛔ Da `fermaLAscolto`, non a mano: altrimenti il timer dei dieci
            // secondi resta armato e SOVRASCRIVE questo messaggio — la persona
            // vedrebbe «non ho sentito niente» al posto del guasto vero.
            fermaLAscolto(dettatura.error.value ?? t('barra.sendFailed'))
            return
        }
        riapriSePossibile('silenzio')
    },
)

/**
 * ⛔⛔ «VOGLIO ASCOLTARE» NON SI DICE CON UN VERBO CHE SIGNIFICA ANCHE «SMETTI».
 *
 * ## Il difetto
 *
 * Due punti diversi facevano partire l'ascolto all'apertura — `onMounted` e il
 * guardiano della chiamata — e tutti e due chiamavano `toggle()`. Ma `toggle` è
 * un interruttore: se arriva mentre l'ascolto sta già partendo, lo **spegne**.
 * MISURATO il 12 agosto, in `logcat`:
 *
 *     49.627  barra: toggle da onMounted
 *     49.628  dett: toggle da stato=starting     ← spegne l'ascolto appena nato
 *     49.628  barra: stato=idle
 *
 * Il guardiano della chiamata la sua difesa ce l'aveva; `onMounted` no. Ed è la
 * stessa forma del difetto che l'owner aveva già trovato sul pulsante l'11
 * agosto — «lo ferma e subito dopo lo fa ripartire». Due punti curati uno per
 * volta sono due punti che possono divergere di nuovo.
 *
 * ⇒ Un solo verbo per l'intenzione: `vogliAscoltare` **accende** e basta.
 * Fermare è un'altra cosa e ha il suo posto (`alternaAscolto`, `annulla`).
 */
function vogliAscoltare(motivo: string): void {
    scadenzaAscolto = Date.now() + ATTESA_MS
    ascoltoVoluto.value = true
    if (timerAscolto !== null) clearTimeout(timerAscolto)
    timerAscolto = setTimeout(() => {
        timerAscolto = null
        annota('barra: dieci secondi senza una parola, smetto e lo dico')
        fermaLAscolto(t('barra.nessunaVoce'))
    }, ATTESA_MS)
    if (dettatura.status.value === 'listening' || dettatura.status.value === 'starting') {
        annota(`barra: gia in ascolto, non tocco niente (${motivo})`)
        return
    }
    annota(`barra: accendo l'ascolto (${motivo})`)
    // ⛔ Il `catch`: una promessa che esplode qui non la vedrebbe nessuno, e la
    // pillola resterebbe accesa su un motore che non è mai partito.
    void dettatura.toggle().catch((errore: unknown) => {
        annota(`barra: avvio ESPLOSO ${String(errore).slice(0, 80)}`)
    })
}

/**
 * ⛔⛔ IL PULSANTE FERMA DAVVERO — owner 2026-08-11: «il pulsante microfono
 * mentre ascolta non ferma l'ascolto, lo ferma e subito dopo lo fa ripartire».
 *
 * Aveva ragione, ed era colpa del disegno nuovo. La pillola dice «ascolto»
 * finché ascoltare è la nostra INTENZIONE, anche nei 500 ms in cui il motore è
 * chiuso fra due turni. Il vecchio gestore faceva `toggle()`, che in quel
 * momento non trova niente da fermare e quindi **accende**. Da fuori: premo per
 * fermare e riparte.
 *
 * ⇒ Il pulsante guarda l'intenzione, non il motore: se stiamo ascoltando —
 * comunque — si smette, e si smette anche di volerlo.
 */
function alternaAscolto(): void {
    // ⛔ Toccare il microfono annulla l'attesa: chi ferma l'ascolto non vuole
    // che parta una domanda mezzo secondo dopo.
    annullaLaGrazia('microfono toccato')
    const acceso = ascoltoVoluto.value
        || dettatura.status.value === 'listening'
        || dettatura.status.value === 'starting'
    if (acceso) {
        // ⛔ Anche il timer dei dieci secondi: chi ferma a mano non deve
        // ritrovarsi un messaggio «non ho sentito niente» sette secondi dopo.
        // ⛔ E la ripresa automatica: chi spegne il microfono a mano ha detto
        // «basta», e ritrovarselo aperto a fine risposta sarebbe non ascoltarlo.
        turnoNatoDiVoce = false
        if (assestamento !== null) { clearTimeout(assestamento); assestamento = null }
        fermaLAscolto(null)
        return
    }
    scadenzaAscolto = Date.now() + ATTESA_MS
    ascoltoVoluto.value = true
    annota('barra: toggle dal PULSANTE microfono')
    void dettatura.toggle()
}

/**
 * ⭐⭐ LA FINESTRA DI GRAZIA — «hai finito o stai pensando?»
 *
 * ## Il difetto
 *
 * Owner 2026-08-11: «dico "ciao come stai tutto bene" e mi stampa solo "tutto
 * bene"». La frase veniva spezzata in due messaggi, perché spedivamo appena il
 * riconoscitore chiudeva la sessione — e lui la chiude coi SUOI criteri, non
 * coi nostri.
 *
 * ## Perché una finestra e non una soglia più lunga
 *
 * Alzare il silenzio chiesto al motore non basta e non basterebbe mai: quel
 * numero governa quando il motore consegna, non quando la PERSONA ha finito. E
 * la ricerca sul parlato spontaneo dice che i due eventi non coincidono — le
 * pause dentro un turno si addensano intorno a 150, 500 e 1500 ms (Heldner &
 * Edlund), quindi qualunque soglia fissa taglia a metà una di quelle montagnette.
 *
 * Gli agenti vocali di oggi risolvono con un **periodo di grazia** dopo la fine
 * apparente del turno, allungato quando la frase sembra incompleta (Speechmatics,
 * LiveKit e Deepgram lo chiamano *semantic turn detection*). Qui c'è la stessa
 * idea nella sua forma più semplice e onesta: dopo l'ultima parola si aspetta, e
 * si continua ad ascoltare. Se arriva altro, non era finita.
 *
 * ⛔ E il costo è dichiarato: fra l'ultima parola e la partenza della domanda
 * passa `GRAZIA_MS`. È il prezzo per non spezzare una frase in due, e in una
 * conversazione vale molto di più di mezzo secondo guadagnato.
 *
 * ## ⛔ DA 1.600 A 900, e il taglio ha una ragione, non un'opinione
 *
 * Owner 2026-08-12: «passa un po' troppo tempo dalla mia ultima parola a quando
 * TALOS invia il messaggio».
 *
 * Aveva ragione, e la causa è che i due tempi erano **in fila e ridondanti**:
 *
 *     2.200 ms   il motore aspetta il silenzio prima di chiudere il turno
 *   + 1.600 ms   e poi la grazia riapre e riaspetta
 *   = 3.800 ms   fra l'ultima parola e la partenza della domanda
 *
 * Le due attese rispondono alla STESSA domanda — «hai finito?» — e la prima l'ha
 * già risolta: 2.200 ms di silenzio sono più del doppio degli 800-1.200 ms che
 * usano gli agenti vocali di oggi. La grazia non deve rifare quel lavoro.
 *
 * ⇒ Le serve solo coprire il buco in cui siamo FISICAMENTE sordi fra due
 * sessioni — `RESPIRO_MS` = 500 ms, misurato — più un margine perché la prima
 * parziale della sessione nuova arrivi in tempo ad annullare l'invio. 900 ms
 * copre il buco con 400 di margine; il totale scende a **3,1 s**.
 *
 * ⛔ E la parte che manca non è un numero da limare: è l'endpointing semantico
 * (fase V3 del compito #99), l'unico modo di scendere davvero — «apri il...»
 * aspetta, «che ore sono» parte subito. Finché non c'è, questa è la riduzione
 * che si può fare senza rimettere in gioco «ciao come stai tutto bene».
 */
const GRAZIA_MS = 900
let graziaInCorso: ReturnType<typeof setTimeout> | null = null
let bozzaAllInizioDellaGrazia = ''

function annullaLaGrazia(motivo: string): void {
    if (graziaInCorso === null) return
    clearTimeout(graziaInCorso)
    graziaInCorso = null
    annota(`barra: grazia annullata (${motivo})`)
}

function aspettaPrimaDiMandare(): void {
    annullaLaGrazia('ne comincia una nuova')
    bozzaAllInizioDellaGrazia = bozza.value
    annota('barra: grazia aperta, aspetto prima di mandare')
    graziaInCorso = setTimeout(() => {
        graziaInCorso = null
        // ⛔ Se nel frattempo la persona ha ripreso a parlare, la bozza è
        // cresciuta: non era finita, e mandarla adesso taglierebbe di nuovo.
        if (bozza.value !== bozzaAllInizioDellaGrazia) {
            annota('barra: ha ripreso a parlare, non mando')
            return
        }
        if (!ascoltoVoluto.value) { annota('barra: ha smesso lei, non mando'); return }
        if (!bozza.value.trim()) return
        annota('barra: silenzio vero, mando')
        void invia()
    }, GRAZIA_MS)
}

/** La persona ha deciso: da qui in poi l'ascolto non si riaccende da solo. */
function laVoceLaComandaLaPersona(): void {
    // ⛔ E l'attesa muore con lei: se la persona scrive o manda a mano, una
    // domanda che parte da sola un attimo dopo è la peggiore delle sorprese.
    annullaLaGrazia('ha deciso la persona')
    ascoltoVoluto.value = false
}

/**
 * ⭐⭐ FINITO DI PARLARE = INVIATO. Owner 2026-08-11: «quando finisco di parlare,
 * cioè quando TALOS rileva tutte le parole, devono essere inviate subito».
 *
 * ## ⛔ Come si distingue «ho finito» da «ho premuto stop»
 *
 * Il motore vocale chiude la sessione in due casi che dall'esterno si assomigliano:
 * quando ha consegnato il risultato finale (hai finito di parlare) e quando lo
 * fermiamo noi perché la persona ha toccato il microfono. Mandare in tutti e due
 * i casi vorrebbe dire spedire una domanda a chi aveva appena deciso di NON
 * mandarla — cioè togliere alla persona il ripensamento.
 *
 * Li distingue `ascoltoVoluto`: resta vero se la sessione è finita da sola, va
 * a falso appena la persona tocca il microfono, scrive, o manda a mano. Quindi
 * la regola è: si manda solo se l'ascolto era ancora nostro.
 *
 * ⛔ E si aspetta che il testo ci sia: `onEnd` arriva anche dopo un silenzio, e
 * lì non c'è niente da mandare — quel caso lo prende la ripresa qui sopra.
 */
watch(
    () => dettatura.status.value,
    (adesso, prima) => {
        // ⛔ Anche da `starting`: se il risultato finale arriva prima che il
        // motore segnali il primo suono, lo stato non passa mai per `listening`
        // — e la domanda resterebbe nel campo senza partire.
        if (adesso !== 'idle') return
        if (prima !== 'listening' && prima !== 'starting') return
        if (!ascoltoVoluto.value) return
        /*
         * ⛔⛔ FINITA SENZA UNA PAROLA = SI RIAPRE, non si tace.
         *
         * Qui prima c'era `return`, e quel `return` è il difetto: il motore
         * chiude il turno anche quando ha sentito un RUMORE — una porta, un
         * respiro, una sillaba scartata — e in quel caso non c'è niente da
         * mandare, ma la persona non ha ancora detto niente e sta per farlo.
         * Uscendo di qui in silenzio, la pillola restava accesa su un microfono
         * chiuso.
         *
         * ⇒ Nessun testo e ascolto ancora voluto ⇒ è la stessa identica
         * situazione del silenzio: si riapre dalla stessa porta.
         */
        if (!bozza.value.trim()) {
            riapriSePossibile('finita senza parole')
            return
        }
        /*
         * ⛔⛔ NON SI SPEDISCE QUI, e questo `return` vale la funzione intera.
         *
         * Owner 2026-08-11: «dico "ciao come stai tutto bene" e mi stampa solo
         * "tutto bene"». La frase non veniva TAGLIATA: veniva **spezzata in due
         * messaggi**. Il motore chiudeva la sessione a metà — dopo una pausa, o
         * per un `NO_MATCH` — e noi spedivamo subito quel pezzo; la seconda metà
         * diventava un messaggio a sé, e sullo schermo restava l'ultimo.
         *
         * ⇒ La fine della SESSIONE non è la fine della FRASE. Sono due cose
         * diverse e a deciderle sono due soggetti diversi: la sessione la chiude
         * il riconoscitore con i suoi criteri, la frase la chiude la persona
         * smettendo di parlare. Finché confondiamo le due, ogni pausa un po'
         * lunga diventa un invio.
         *
         * Qui si apre la finestra di grazia (`aspettaPrimaDiMandare`) e si
         * riapre subito l'ascolto: se arrivano altre parole si annulla l'invio e
         * si continua ad accumulare; se passa il tempo in silenzio, si manda.
         */
        aspettaPrimaDiMandare()
        riapriSePossibile('la frase potrebbe non essere finita')
    },
)

/**
 * ⭐⭐ OGNI CHIAMATA NUOVA RIACCENDE L'ASCOLTO — e senza questo la seconda
 * apertura era muta.
 *
 * L'activity della barra è `singleTask`: dalla seconda volta in poi NON si
 * monta niente: arriva solo un indirizzo nuovo, che `avvia.ts` riversa nel modo
 * reattivo. Quindi `onMounted` — dove l'ascolto parte — non viene più eseguito.
 *
 * MISURATO sul Pad: chiamata col gesto (ascolta), chiusa, riaperta dalla
 * tendina → `orlo=fermo`. La barra ricordava per sempre com'era stata aperta la
 * PRIMA volta, e nessuna delle tre porte funzionava alla seconda chiamata.
 *
 * ⛔ E l'attesa riparte da qui: sono i trenta secondi di QUESTA chiamata, non
 * quelli da quando l'app è viva. Senza, alla seconda apertura TALOS troverebbe
 * il tempo già scaduto e non ascolterebbe più.
 */
watch(
    () => props.modo.chiamata,
    () => {
        if (!props.modo.daVoce) return
        vogliAscoltare(`chiamata nuova (${props.modo.chiamata})`)
    },
)

/**
 * La risposta a questa domanda: quella che arriva, o quella appena arrivata.
 *
 * ⛔ `streamingText` PRIMA della lista: durante la generazione il messaggio
 * dell'assistente non è ancora nella lista, e leggere solo la lista darebbe una
 * carta vuota per tutto il tempo in cui c'è più da vedere.
 */
const risposta = computed(() => {
    if (!domanda.value) return ''
    const vivo = chat.state.streamingText
    if (vivo) return vivo
    for (let i = chat.messages.length - 1; i >= 0; i -= 1) {
        const messaggio = chat.messages[i]
        if (messaggio?.role === 'assistant') return messaggio.content ?? ''
        if (messaggio?.role === 'user') return ''
    }
    return ''
})

const cartaVisibile = computed(() => domanda.value !== '')
const attesa = computed(() => cartaVisibile.value && !risposta.value)

/**
 * Lo stato che L'ORLO racconta, e l'unico posto dove viene deciso.
 *
 * ⛔ Si chiama `segnale` e non `orlo`: l'orlo è come si VEDE, questo è cosa si
 * DICE. Il giorno che la firma cambia forma un'altra volta — è già successo —
 * questo nome resta giusto.
 */
const segnale = computed<'fermo' | 'ascolto' | 'pensa'>(() => {
    if (lavora.value) return 'pensa'
    if (ascolta.value) return 'ascolto'
    return 'fermo'
})

const etichettaSpia = computed(() => {
    if (!contestoDisponibile.value) return t('barra.contextNone')
    if (!guardo.value) return t('barra.contextOff')
    return props.modo.contesto.immagine
        ? t('barra.contextWithImage', { n: props.modo.contesto.nodi })
        : t('barra.context', { n: props.modo.contesto.nodi })
})

/**
 * ⭐ IL GESTO DELLA MANIGLIA — quanto la carta è salita sotto il dito.
 *
 * La regola (soglia e smorzamento) vive in `lib/barra/trascinamento`, non qui:
 * dentro un gestore di eventi sarebbe provabile solo con un dito vero, e le
 * prove che contano sono quelle che si possono fare nei due versi.
 */
const alzata = ref(0)
const inMano = ref(false)
let partenzaY = 0

function prendiLaManiglia(evento: PointerEvent): void {
    inMano.value = true
    partenzaY = evento.clientY
    // ⛔ La cattura serve: senza, il dito che esce dalla maniglia mentre sale
    // smette di essere ascoltato e il gesto muore a metà — che è precisamente
    // il momento in cui la persona sta facendo la cosa giusta.
    ;(evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId)
}

function muoviLaManiglia(evento: PointerEvent): void {
    if (!inMano.value) return
    alzata.value = talosOffsetDelTrascinamento(partenzaY - evento.clientY)
}

function lasciaLaManiglia(evento: PointerEvent): void {
    if (!inMano.value) return
    inMano.value = false
    const apre = talosTrascinamentoApre(partenzaY - evento.clientY)
    alzata.value = 0
    if (apre) void apriInTalos()
}

/**
 * ⭐ Leggere la risposta ad alta voce — Gemini ce l'ha (`Ascolta`), e noi il
 * motore l'abbiamo già in casa: è lo stesso di ogni risposta in chat, quindi la
 * voce, la lingua e il «fermati» sono quelli veri, non una seconda copia.
 */
const lettura = useTalosSpeech()
const ID_LETTURA = 'talos-barra'
const staLeggendo = computed(() => lettura.speakingId.value === ID_LETTURA)

/**
 * ⭐⭐ LA CONVERSAZIONE CONTINUA — finito di parlare, TALOS riapre l'orecchio.
 *
 * ## La regola, e perché era violata
 *
 * Owner 2026-08-12: «in modalità assistente quando invio un messaggio e TALOS
 * finisce di parlare la conversazione non riparte, devo premere il pulsante
 * manualmente. **Questo viola la nostra regola no hands**».
 *
 * Ha ragione, e non è una preferenza: è la regola che definisce la modalità.
 * Un assistente a mani libere che pretende un tocco fra una domanda e l'altra
 * non è a mani libere per metà — lo è per un turno solo.
 *
 * ## I due segnali esistevano già, mancava il filo
 *
 * `voce.catturaInvio()` sa se la domanda è nata di voce (lo legge PRIMA che il
 * campo si svuoti); `lettura.speakingId` torna a nullo quando la voce ha finito.
 * Nessuno metteva insieme le due cose.
 *
 * ⛔ E si riapre SOLO se il turno era di voce. Chi ha scritto con la tastiera
 * non vuole trovarsi il microfono aperto in mano perché TALOS ha letto la
 * risposta ad alta voce: sarebbe la stessa prepotenza al contrario.
 */
let turnoNatoDiVoce = false

/** Quanto si aspetta prima di credere che la voce abbia finito. Vedi sotto. */
const ASSESTAMENTO_MS = 600
let assestamento: ReturnType<typeof setTimeout> | null = null

/**
 * ⛔⛔ «HA FINITO» È UNA CONGIUNZIONE, NON UN SEGNALE SOLO.
 *
 * Owner 2026-08-12, provando la build precedente: «il microfono riparte, ma
 * riparte a metà strada — TALOS non finisce tutta la frase, ne dice un pezzo e
 * poi il microfono riparte automaticamente».
 *
 * ## Perché, e perché il guardiano non era sbagliato ma MAL AGGANCIATO
 *
 * Guardavo `speakingId`, che dice **chi possiede la lettura**, non **se il
 * parlato è finito**. Durante lo streaming quella proprietà cambia nome
 * (`rinominaLettura`), si azzera su un errore di una singola frase, e si azzera
 * quando finisce l'ultima frase **del pezzo arrivato finora** — non della
 * risposta. Il modello continua a generare, ma il segnale è già scattato.
 *
 * ⛔ E il danno lo fa la ripresa stessa: `vogliAscoltare` → `dettatura.toggle()`
 * → `start()` → `await options.zittisci?.()` → `lettura.stop()`. Cioè riaprire
 * il microfono **TRONCA** TALOS. Non arriva dopo: lo interrompe. È esattamente
 * la frase a metà che si sente.
 *
 * ## La regola vera
 *
 * Si riapre solo quando sono vere DUE cose insieme: il modello ha finito di
 * generare (`chat.state.sending` falso) **e** la voce ha finito di parlare. Una
 * sola delle due è, letteralmente, metà della verità.
 */
const talosParla = computed(() => lettura.speakingId.value !== null || chat.state.sending)

watch(talosParla, (adesso, prima) => {
    if (prima !== true || adesso !== false) return
    if (!turnoNatoDiVoce) return
    /*
     * ⛔ Se nel frattempo l'ascolto è già ripartito da un'altra porta, non si
     * tocca niente: `vogliAscoltare` è idempotente ma l'attesa dei dieci secondi
     * ripartirebbe, e prolungarla di nascosto non è una cortesia.
     */
    if (dettatura.status.value === 'listening' || dettatura.status.value === 'starting') return
    /*
     * ⛔⛔ SI ASSESTA PRIMA DI CREDERCI, e questo mezzo secondo non è prudenza
     * generica: copre un buco preciso.
     *
     * Nell'istante in cui il modello smette di generare, la lettura della CODA
     * — le ultime frasi, quelle che `seguiIlTesto(..., finito = true)` accoda
     * proprio in reazione a quel momento — può non essere ancora partita. Per
     * un tick i due segnali sono entrambi falsi e sembra finito tutto, mentre
     * TALOS sta per dire l'ultima riga.
     *
     * ⇒ Si aspetta, e POI si ricontrolla. Se nel frattempo ha ripreso a
     * parlare, non si fa niente: non è il momento. Meglio riaprire il microfono
     * mezzo secondo dopo che troncare una frase — l'owner ha sentito il secondo
     * caso, e non è un dettaglio di tempi: è TALOS che si interrompe da solo.
     */
    if (assestamento !== null) clearTimeout(assestamento)
    assestamento = setTimeout(() => {
        assestamento = null
        if (talosParla.value) { annota('barra: ha ripreso a parlare, non riapro'); return }
        if (!turnoNatoDiVoce) return
        if (dettatura.status.value === 'listening' || dettatura.status.value === 'starting') return
        annota('barra: TALOS ha finito di parlare, riapro il microfono')
        vogliAscoltare('TALOS ha finito di parlare')
    }, ASSESTAMENTO_MS)
})

/**
 * ⭐ GLI ALLEGATI — le stesse quattro porte di Gemini, più una che lei non ha.
 *
 * Censito l'11 agosto: il suo `Aggiungi allegato` apre Foto · Fotocamera · File
 * · Drive. Le prime tre le abbiamo identiche; al posto di Drive c'è **la
 * Libreria**, che è meglio per un motivo concreto: i file che TALOS ha già
 * letto, indicizzato e di cui conosce il testo. Allegare da lì non ricarica
 * niente e il modello parte già sapendo cosa c'è dentro.
 *
 * ⛔ È lo STESSO controller della chat (`controller.attachments`), non una copia:
 * consensi, limiti e Libreria sono quelli veri. Una seconda pila di allegati
 * accanto alla prima sarebbe la solita superficie che diverge.
 */
const allegati = controller.attachments
const menuAllegati = ref(false)

async function conIlMenuChiuso(azione: () => Promise<void>): Promise<void> {
    menuAllegati.value = false
    try {
        await azione()
    } catch {
        errore.value = t('barra.attachFailed')
    }
}

/** Gli ultimi file della Libreria: un elenco corto, non un archivio da sfogliare. */
const libreriaRecente = computed(() => allegati.vaultFiles.slice(0, 4))

async function chiudi(): Promise<void> {
    dettatura.cancel()
    try {
        const { App } = await import('@capacitor/app')
        await App.exitApp()
    } catch {
        // Sul web non c'è nessuna finestra da chiudere, ed è giusto così: il
        // posto dove questa funzione ESISTE è il telefono.
    }
}

/**
 * ⭐ Porta la conversazione dentro TALOS intero — QUELLA conversazione.
 *
 * Censito su Gemini: ha DUE strade per la stessa cosa — un tondo «Apri l'app
 * Gemini» e la maniglia trascinabile — e la conversazione arriva di là completa,
 * con la domanda in bolla.
 *
 * ## ⛔ E qui c'era un difetto tenuto in piedi da una frase falsa
 *
 * Il commento diceva: «la chat è già la stessa, per costruzione: non c'è niente
 * da trasferire, basta aprire». Owner 2026-08-11: «si deve aprire la chat
 * aggiornata col testo che ho inviato, o comunque tutta la conversazione».
 *
 * La frase era falsa. La barra vive in un'altra Activity, quindi in un'altra
 * **WebView**: un altro contesto JavaScript, con un'altra istanza del negozio
 * della chat. In comune c'è solo il database. Aprire l'app senza dirle niente
 * la lasciava sulla conversazione che aveva lei.
 *
 * ⇒ Si passa l'id della sessione, e l'app intera la apre leggendola da disco.
 *
 * ⛔ E si esce SOLO se l'apertura è riuscita: chiudere la barra dopo un'apertura
 * fallita lascerebbe la persona senza né l'una né l'altra.
 */
async function apriInTalos(): Promise<void> {
    try {
        const { registerPlugin } = await import('@capacitor/core')
        const ponte = registerPlugin<{ apriLaChat(o: { sessione: string | null }): Promise<{ aperta: boolean }> }>('TalosBarra')
        const esito = await ponte.apriLaChat({ sessione: chat.activeSession.value?.id ?? null })
        if (!esito?.aperta) { errore.value = t('barra.openFailed'); return }
        /*
         * ⛔ NIENTE `App.exitApp()` QUI — chiudeva l'app appena aperta.
         *
         * Owner 2026-08-12, guardando lo scatto: «nota come apri in app non ha
         * aperto la chat ma la app da dove eravamo rimasti». La sonda ha mostrato
         * che la chat SI apriva (`push=ok rotta=chat` in 142 ms) e che subito dopo
         * spariva tutto: `exitApp` diventa `finishAffinity()`, che chiude ogni
         * Activity del task — MainActivity compresa.
         *
         * Adesso è il lato nativo a chiudere la SOLA finestra della barra, dentro
         * `apriLaChat`, dopo aver lanciato l'app. Il perché per esteso sta lì.
         */
    } catch {
        errore.value = t('barra.openFailed')
    }
}

async function copia(): Promise<void> {
    try {
        await navigator.clipboard.writeText(risposta.value)
        copiato.value = true
        setTimeout(() => { copiato.value = false }, 1_800)
    } catch {
        errore.value = t('barra.copyFailed')
    }
}

function alternaContesto(): void {
    if (!contestoDisponibile.value) return
    scelta.value = !guardo.value
}

/**
 * ⭐⭐ QUELLO CHE TALOS VEDE, DAVVERO DENTRO LA DOMANDA.
 *
 * ## ⛔ Il difetto: la spia diceva 357 e al modello arrivava ZERO
 *
 * Owner 2026-08-11: «icona occhio a cosa serve? A vedere elementi su schermo
 * giusto? Ma se chiedo "cosa vedi" mi risponde che non vede nulla e non ha
 * accesso allo schermo».
 *
 * Aveva ragione su tutta la linea. `invia()` mandava testo, modello, metadati e
 * allegati — e il contesto dello schermo **non entrava da nessuna parte**. Anzi:
 * alla barra arrivava solo il NUMERO dei nodi, perché il servizio assistente li
 * contava e poi buttava la struttura. Un numero vero su un contenuto che non
 * esisteva più.
 *
 * ⇒ È la forma peggiore di difetto: l'interfaccia promette e il modello nega. E
 * chi legge crede al modello, quindi smette di fidarsi anche di ciò che funziona.
 *
 * ## Come è fatto adesso
 *
 * Il testo si chiede al ponte SOLO se l'occhio è acceso, e il ponte lo consegna
 * una volta sola azzerandolo. Va in testa alla domanda dentro una cornice che
 * DICE cos'è: un modello che riceve del testo senza cornice non sa se viene
 * dalla persona o dallo schermo, e finisce per rispondere allo schermo.
 */
async function contestoDaMandare(): Promise<string> {
    if (!guardo.value || !contestoDisponibile.value) return ''
    try {
        const { registerPlugin } = await import('@capacitor/core')
        const ponte = registerPlugin<{ contestoSchermo(): Promise<{ testo: string, nodi: number }> }>('TalosBarra')
        const visto = await ponte.contestoSchermo()
        const schermo = (visto?.testo ?? '').trim()
        if (!schermo) return ''
        return [t('barra.contextPrompt'), '"""', schermo, '"""', '', ''].join('\n')
    } catch {
        // ⛔ Nessun ponte, nessun contesto: la domanda parte nuda invece di non
        // partire. Una domanda senza schermo è utile; una che non parte no.
        return ''
    }
}

async function invia(): Promise<void> {
    const testo = bozza.value.trim()
    if (!testo || lavora.value) return
    // ⛔ La domanda è partita: da qui l'ascolto non si riaccende da solo.
    // Senza questa riga il microfono tornerebbe su mentre TALOS risponde.
    laVoceLaComandaLaPersona()
    dettatura.cancel()
    const dettato = voce.catturaInvio()
    // ⛔ Si ricorda QUI, dove la risposta è ancora vera: serve alla ripresa
    // automatica quando TALOS avrà finito di parlare (vedi `talosParla`).
    turnoNatoDiVoce = dettato
    domanda.value = testo
    errore.value = null
    const metadati: Record<string, unknown> = {}
    if (dettato) metadati[TALOS_METADATA_DETTATO] = true
    /*
     * ⛔⛔ IL CONTESTO VA NEI METADATI, non nel testo.
     *
     * Owner 2026-08-11, con lo screenshot: concatenandolo, tutto il prompt del
     * contesto finiva stampato nella chat come messaggio suo. Ora viaggia in una
     * chiave riservata che `chat.send` sfila prima di salvare e applica solo al
     * turno in partenza — vedi `TALOS_METADATA_SCHERMO`.
     *
     * ⛔ Resta PRIMA della `send` e con l'`await`: il testo dello schermo si
     * consegna una volta sola e si azzera. Chiesto dopo, sarebbe già sparito.
     */
    const cornice = await contestoDaMandare()
    if (cornice) metadati[TALOS_METADATA_SCHERMO] = cornice
    const inviato = await chat.send(
        testo,
        controller.selectedModelId.value,
        metadati,
        // ⛔ Gli allegati si leggono ADESSO, non alla fine: `bindings` è
        // calcolato sulla bozza, e la bozza si svuota appena il messaggio è
        // registrato — un attimo prima che la generazione finisca.
        allegati.bindings.value,
        () => {
            bozza.value = ''
            // ⛔ PRIMA di `clearSent`: dopo, i nomi non ci sono più.
            allegatiPartiti.value = allegati.items.map((pezzo) => pezzo.displayName)
            /*
             * ⛔ E GLI ALLEGATI, che me li ero dimenticati — trovato sul Pad.
             *
             * Mandato «cosa dice il file allegato» con `nota-talos.txt`, la
             * risposta era giusta («Talos è un gigante di bronzo…») ma il
             * gettone RESTAVA nella barra: il messaggio dopo se lo sarebbe
             * portato dietro senza che nessuno l'avesse chiesto.
             *
             * `clearSent()` è lo stesso metodo che il controller della chat
             * chiama nello stesso punto — il nome esisteva già, mancava la
             * chiamata.
             */
            allegati.clearSent()
        },
    )
    if (!inviato) errore.value = chat.state.lastError ?? t('barra.sendFailed')
}

function tastoInvio(evento: KeyboardEvent): void {
    if (evento.key !== 'Enter' || evento.shiftKey) return
    evento.preventDefault()
    void invia()
}

onMounted(async () => {
    await controller.init()
    if (!chat.activeSession.value) await controller.newSession()
    // ⛔ Senza, `vaultFiles` resta vuoto e la Libreria sembra non avere niente:
    // un elenco vuoto che in realtà non è ancora stato letto è una bugia.
    void allegati.initialize()
    /*
     * ⛔ NESSUN FUOCO AUTOMATICO — e prima qui c'era, con una riga che diceva
     * «chi ha chiamato col gesto sta già guardando il campo».
     *
     * Era un'assunzione, e la misura l'ha smentita l'11 agosto. Aperta la barra
     * da Wikipedia, il campo prendeva il fuoco, la tastiera saliva e si mangiava
     * **metà schermo**: la pagina che stavi leggendo — cioè il motivo per cui
     * hai chiamato TALOS — spariva sotto i tasti. E Gemini, sullo stesso
     * telefono e sulla stessa pagina, a riposo mostra **solo la pillola**: la
     * tastiera arriva quando tocchi il campo, non prima.
     *
     * La barra esiste per NON farti uscire da dove sei. Coprire quel «dove sei»
     * nell'istante in cui compare è il contrario del suo mestiere.
     */
    if (props.modo.daVoce) vogliAscoltare('apertura della barra')
})
</script>

<template>
    <!-- ⛔ Il tocco FUORI chiude, ed è `.self` di proposito: un tocco dentro non
         deve mai buttare via quello che stai scrivendo. Sopra non c'è nessun
         velo — l'app sotto si vede intera, che è tutto il punto. -->
    <div class="scena" data-testid="talos-barra-scena" @click.self="chiudi">

        <!-- ⭐ L'ONDA: la luce sui bordi, che entra dal basso e svanisce.
             Misurata su Gemini l'11 agosto, non dedotta — vedi `.onda`. -->
        <div class="onda" data-testid="talos-barra-onda" aria-hidden="true" />

        <!-- LA CARTA: un oggetto separato, che va e viene. La pillola non si
             gonfia mai — è la forma misurata su Gemini l'11 agosto. -->
        <article
            v-if="cartaVisibile"
            class="carta"
            :class="{ 'carta--in-mano': inMano }"
            :style="{ transform: `translate3d(0, ${-alzata}px, 0)` }"
            :aria-label="t('barra.title')"
            data-testid="talos-barra-carta"
        >
            <span class="orlo" :data-stato="segnale" aria-hidden="true" />
            <!-- ⭐ La maniglia: trascinala in su e la conversazione entra in
                 TALOS intero. Su Gemini il nodo si chiama «Punto di
                 trascinamento» ed è `clickable=false` — da noi il TOCCO fa la
                 stessa cosa, perché un comando che si può solo trascinare non
                 esiste per chi naviga da tastiera. -->
            <button
                type="button"
                class="maniglia"
                :aria-label="t('barra.open')"
                data-testid="talos-barra-maniglia"
                @pointerdown="prendiLaManiglia"
                @pointermove="muoviLaManiglia"
                @pointerup="lasciaLaManiglia"
                @pointercancel="lasciaLaManiglia"
                @click="apriInTalos"
            ><span /></button>

            <div class="corpo">
                <p class="domanda">{{ domanda }}</p>
                <!-- ⭐ Cosa è partito con la domanda. Vedi `allegatiPartiti`:
                     senza questa riga, «ho mandato la foto» e «ho mandato solo
                     il testo» sono indistinguibili. -->
                <ul v-if="allegatiPartiti.length" class="partiti" data-testid="talos-barra-partiti">
                    <li v-for="nome in allegatiPartiti" :key="nome">
                        <Paperclip class="icona-piccola" aria-hidden="true" />{{ nome }}
                    </li>
                </ul>
                <!-- L'attesa ha una forma: tre righe che respirano dicono che
                     sta arrivando del testo, e la carta non salta quando arriva. -->
                <div v-if="attesa" class="scheletro" data-testid="talos-barra-attesa" aria-hidden="true">
                    <span /><span /><span />
                </div>
                <div v-else class="testo" data-testid="talos-barra-risposta">
                    <TalosMobileMessageContent :content="risposta" />
                </div>
            </div>

            <footer class="piede">
                <button type="button" class="tondo" :aria-label="t('common.copy')" @click="copia">
                    <Copy class="icona" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    class="tondo"
                    :aria-pressed="staLeggendo"
                    :aria-label="staLeggendo ? t('chat.stopSpeaking') : t('chat.speak')"
                    data-testid="talos-barra-leggi"
                    @click="lettura.toggle(ID_LETTURA, risposta)"
                >
                    <VolumeX v-if="staLeggendo" class="icona" aria-hidden="true" />
                    <Volume2 v-else class="icona" aria-hidden="true" />
                </button>
                <span v-if="copiato" class="copiato">{{ t('barra.copied') }}</span>
                <span class="spazio" />
                <button
                    type="button"
                    class="apri"
                    data-testid="talos-barra-apri"
                    @click="apriInTalos"
                >
                    <Maximize2 class="icona" aria-hidden="true" />
                    {{ t('barra.open') }}
                </button>
                <button type="button" class="tondo" :aria-label="t('barra.close')" @click="chiudi">
                    <X class="icona" aria-hidden="true" />
                </button>
            </footer>
        </article>

        <p v-if="errore" class="errore" role="alert">{{ errore }}</p>

        <!-- Il menu degli allegati: compare SOPRA la pillola e se ne va, come i
             chip dei suggerimenti di Gemini — fuori dal pannello, non dentro,
             così la pillola non si gonfia mai. -->
        <div v-if="menuAllegati" class="menu" data-testid="talos-barra-menu-allegati">
            <button type="button" class="voce" @click="conIlMenuChiuso(() => allegati.pickPhotos())">
                <Image class="icona-piccola" aria-hidden="true" />{{ t('barra.attachPhotos') }}
            </button>
            <button type="button" class="voce" @click="conIlMenuChiuso(() => allegati.takePhoto())">
                <Camera class="icona-piccola" aria-hidden="true" />{{ t('barra.attachCamera') }}
            </button>
            <button type="button" class="voce" @click="conIlMenuChiuso(() => allegati.selectFiles())">
                <FileText class="icona-piccola" aria-hidden="true" />{{ t('barra.attachFile') }}
            </button>
            <!-- ⛔ IL TITOLO C'È SEMPRE, e la sezione non sparisce quando è vuota.
                 Provato l'11 agosto: sul telefono di prova il vault era vuoto e
                 la Libreria non compariva affatto — un menu che a volte ha una
                 sezione e a volte no, senza dire perché, è un comando muto. Ora
                 dice cosa manca: «vuota», oppure «sto guardando». -->
            <div class="menu-titolo">
                <Library class="icona-piccola" aria-hidden="true" />{{ t('barra.attachLibrary') }}
            </div>
            <button
                v-for="file in libreriaRecente"
                :key="file.id"
                type="button"
                class="voce voce--libreria"
                @click="conIlMenuChiuso(async () => { await allegati.attachExisting(file) })"
            >{{ file.display_name }}</button>
            <p
                v-if="!libreriaRecente.length"
                class="menu-vuoto"
                data-testid="talos-barra-libreria-vuota"
            >{{ allegati.vaultLoading.value ? t('barra.attachLibraryLoading') : t('barra.attachLibraryEmpty') }}</p>
        </div>

        <!-- Gli allegati scelti: una riga di gettoni sopra la pillola. -->
        <div v-if="allegati.items.length" class="allegati" data-testid="talos-barra-allegati">
            <span v-for="pezzo in allegati.items" :key="pezzo.id" class="gettone">
                {{ pezzo.displayName }}
                <button
                    type="button"
                    class="gettone-via"
                    :aria-label="t('barra.attachRemove', { name: pezzo.displayName })"
                    @click="allegati.remove(pezzo.id)"
                ><X class="icona-piccola" aria-hidden="true" /></button>
            </span>
        </div>

        <!-- LA PILLOLA: la forma a riposo, e non cambia mai taglia. -->
        <form
            class="pillola"
            :class="{ 'pillola--carta': campoAlto }"
            data-testid="talos-barra"
            @submit.prevent="invia"
        >
            <span class="orlo" :data-stato="segnale" data-testid="talos-barra-orlo" aria-hidden="true" />

            <!--
                ⛔ LA SPIA NON C'È QUANDO NON C'È NIENTE DA SPIARE.

                Prima compariva sempre, e senza contesto era un pulsante
                `disabled` con l'occhio sbarrato: un comando che non fa niente —
                proprio il sospetto che ci siamo dati come regola di cacciare.

                E la sua assenza NON toglie informazione: la barra aperta dalla
                tendina non avrà MAI un contesto (nessuno gliel'ha consegnato),
                quindi quel «non vedo» sarebbe una condizione permanente detta a
                ogni apertura. Quando invece TALOS vede, la spia compare col
                numero — ed è lì che quel segno vale qualcosa.
            -->
            <button
                v-if="contestoDisponibile"
                type="button"
                class="spia"
                :class="{ 'spia--spenta': !guardo }"
                :aria-pressed="guardo"
                :aria-label="etichettaSpia"
                :title="etichettaSpia"
                data-testid="talos-barra-contesto"
                @click="alternaContesto"
            >
                <Eye v-if="guardo" class="icona-piccola" aria-hidden="true" />
                <EyeOff v-else class="icona-piccola" aria-hidden="true" />
                <!--
                    ⛔ Il NUMERO compare solo quando c'è un numero da dire.
                    Prima al suo posto stava un trattino, e sul dispositivo il
                    risultato era «👁− +»: tre segni appiccicati in 7 px che
                    nessuno decifra. Qui, spenta, la spia dice «vedevo, e me lo
                    hai fatto smettere» — che è un'informazione vera.
                -->
                <span v-if="guardo" class="numero">{{ props.modo.contesto.nodi }}</span>
            </button>

            <button
                type="button"
                class="piu"
                :aria-expanded="menuAllegati"
                :aria-label="t('barra.attach')"
                data-testid="talos-barra-allega"
                @click="menuAllegati = !menuAllegati"
            >
                <Plus class="icona-piccola" aria-hidden="true" />
            </button>

            <!--
                ⭐⭐ MENTRE PARLI SI VEDE L'ONDA, non il testo che si riscrive.
                Vedi il commento su `onde`: la forma è quella di Gemini, il
                sorpasso è che appena smetti il testo si vede e si può correggere
                PRIMA di mandarlo. Toccare l'onda smette di ascoltare.
            -->
            <button
                v-if="ascolta"
                type="button"
                class="onde"
                :aria-label="t('barra.listening')"
                data-testid="talos-barra-onde"
                @click="alternaAscolto"
            >
                <i
                    v-for="(altezza, indice) in onde"
                    :key="indice"
                    :style="{ '--altezza': altezza }"
                    aria-hidden="true"
                />
            </button>

            <textarea
                v-show="!ascolta"
                ref="campoEl"
                v-model="bozza"
                class="campo"
                @beforeinput="laVoceLaComandaLaPersona"
                rows="1"
                :placeholder="t('barra.write')"
                :aria-label="t('barra.write')"
                data-testid="talos-barra-campo"
                @input="voce.aggiornaBozza(bozza); misuraIlCampo()"
                @keydown="tastoInvio"
            />

            <button
                v-if="lavora"
                type="button"
                class="azione azione--ferma"
                :aria-label="t('barra.stop')"
                data-testid="talos-barra-ferma"
                @click="chat.stopStreaming()"
            >
                <Square class="icona" aria-hidden="true" />
            </button>
            <button
                v-else-if="bozza.trim()"
                type="submit"
                class="azione"
                :aria-label="t('barra.send')"
                data-testid="talos-barra-invia"
            >
                <ArrowUp class="icona" aria-hidden="true" />
            </button>
            <button
                v-else
                type="button"
                class="azione"
                :class="{ 'azione--ascolta': ascolta }"
                :disabled="!dettatura.supported.value"
                :aria-pressed="ascolta"
                :aria-label="ascolta ? t('barra.stopListening') : t('barra.speak')"
                data-testid="talos-barra-microfono"
                @click="alternaAscolto()"
            >
                <Mic class="icona" aria-hidden="true" />
            </button>
        </form>
    </div>

    <!--
        ⛔⛔ LA SCHEDA DEL PERMESSO, che qui non c'era.

        Dall'assistente il pilota chiedeva l'autorizzazione e la barra scriveva
        «1 richiesta è in attesa» senza mostrare NIENTE su cui rispondere: la
        scheda viveva solo nell'app intera. Il perché per esteso, con la misura,
        sta su `consenso` nello script.

        Si teletrasporta sul `body` da sé (è dentro il componente), quindi sta
        sopra la pillola invece che dentro il suo flusso — e la barra resta
        quella che è: una riga sola, finché non serve altro.
    -->
    <SchedaConsenso
        v-if="consensoVisibile && consenso"
        :title="consenso.title"
        :description="consenso.description"
        :input="consenso.input"
        :actions="consenso.actions"
        :session-title="consenso.session_title"
        :pending-count="controller.pendingToolAuthorizations.value.length"
        :allow-persistent="consenso.allow_persistent"
        @allow-turn="void controller.decideToolAuthorization(consenso.request_id, 'allow_turn')"
        @always-allow="void controller.decideToolAuthorization(consenso.request_id, 'always_allow')"
        @deny="void controller.decideToolAuthorization(consenso.request_id, 'deny')"
        @later="controller.dismissToolAuthorization()"
    />
</template>

<style scoped>
/*
 * ⛔ I colori NON sono scritti qui: sono quelli del tema che la persona ha
 * scelto, letti dalle stesse variabili del resto dell'app. Una barra con la sua
 * tavolozza sarebbe la seconda superficie che diverge dalla prima — il difetto
 * che tutto il compito #90 esiste per evitare.
 */
.scena {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    /* ⛔ Nessuno sfondo, nemmeno al 5%: l'app sotto si legge. */
    background: transparent;
    /*
     * ⛔ QUANTO STACCA DA SOTTO, e il numero viene da Gemini, non dal gusto.
     *
     * Misurato sul Pad (schermo alto 3392 px), col fondo della pillola:
     *
     *     Gemini   y=3300  →  92 px dal bordo
     *     TALOS    y=3350  →  42 px dal bordo   ⛔ appiccicata
     *
     * L'owner l'ha vista subito: «non metterla tutta alla fine, ma neanche
     * troppo in alto». 92 px reali su questo schermo sono 35 px logici, e la
     * safe area ne dà già 16: da qui il `+19`.
     *
     * ⛔ Lo stacco si SOMMA all'area sicura, non la sostituisce: sono due cose
     * diverse — una è estetica, l'altra è il bordo fisico dello schermo. Un
     * `max()` fra le due ignorava del tutto lo stacco sui telefoni con l'area
     * sicura alta.
     *
     * ⛔ E l'area sicura ha un MINIMO, imparato nel secondo viewport: forzando
     * 1080×2400 il sistema la dichiara a 0, la somma diventava 19 px logici (47
     * reali) e la pillola tornava appiccicata in basso. Il `max(..., 12px)`
     * garantisce lo stacco anche dove il telefono non dichiara niente.
     */
    padding: 0 12px calc(max(env(safe-area-inset-bottom, 0px), 12px) + 19px);
}

/*
 * ⛔⛔ NIENTE `backdrop-filter`: QUI NON PUÒ FUNZIONARE, e l'ha detto lo schermo.
 *
 * Sul Pad, con la carta aperta sopra Wikipedia, il testo della pagina si
 * leggeva NITIDO attraverso il pannello — non sfocato. Non era un valore
 * sbagliato: `backdrop-filter` sfoca ciò che sta dietro **nel documento**, e
 * dietro non c'è niente. Chrome è un'altra FINESTRA di Android, composta dal
 * sistema sotto la nostra WebView trasparente; il CSS non la vede e non può
 * toccarla.
 *
 * ⇒ La leggibilità deve venire dall'OPACITÀ, non dalla sfocatura. E questa è
 * anche la ragione per cui Gemini, censita l'11 agosto, usa una carta quasi
 * nera OPACA senza nessun vetro: ha lo stesso vincolo, e ci è arrivata prima.
 *
 * Il pannello resta «appoggiato sopra» grazie all'orlo, all'alone e alle tre
 * ombre — che funzionano, perché sono disegnate DA NOI e non chiedono al
 * compositore di sfocare qualcosa che non gli appartiene.
 */
.pillola,
.carta {
    position: relative;
    background: var(--card);
    border: 1px solid color-mix(in oklab, var(--primary) 16%, var(--border));
    /*
     * ⛔ TRE ombre, e ognuna risolve un fondo diverso — misurato sopra Wikipedia,
     * che è BIANCA: l'alone bronzo da solo si perdeva del tutto.
     *
     *   1. il riflesso interno   dà spessore al vetro
     *   2. l'anello scuro 1 px   stacca su fondo CHIARO, dove nessun bagliore serve
     *   3. l'ombra lunga         solleva il pannello su qualunque fondo
     *
     * L'alone bronzo (`.orlo::after`) fa il resto sul fondo SCURO, dove invece è
     * l'anello a sparire. Servono tutti e due perché l'app sotto non la
     * scegliamo noi.
     */
    box-shadow:
        0 1px 0 0 color-mix(in oklab, var(--foreground) 8%, transparent) inset,
        0 0 0 1px rgb(0 0 0 / 28%),
        0 22px 54px -14px rgb(0 0 0 / 78%);
    color: var(--foreground);
    font-family: var(--talos-font-ui);
}

/* ── LA PILLOLA ──────────────────────────────────────────────────────────── */
.pillola {
    /* Un filo di trasparenza: quel poco che dice «sono appoggiata sopra»,
       senza mettere del testo da leggere sopra un fondo che non controlliamo. */
    background: color-mix(in oklab, var(--card) 93%, transparent);
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    /* Gemini misurata: 41% su un Pad da 2400. Qui il tetto è in px perché su un
       telefono stretto una percentuale darebbe una pillola inusabile. */
    max-width: 440px;
    padding: 6px 6px 6px 8px;
    border-radius: 999px;
    /*
     * ⭐⭐ L'ENTRATA — «attesa, poi rilascio», col vocabolario di Gemini.
     *
     * Owner 2026-08-11: «voglio un'animazione come fa Gemini con le onde, non
     * una semplice transizione: qualcosa fatto a regola d'arte».
     *
     * Le linee guida di Google Design per il movimento di Gemini dicono tre
     * cose, e qui ci sono tutte e tre:
     *
     *   1. «ogni animazione ha un inizio e una fine definiti, che creano un
     *      senso di flusso direzionale» ⇒ la pillola SALE, non compare;
     *   2. «la velocità dà un senso di ATTESA, poi RILASCIO» ⇒ la curva parte
     *      lenta, accelera e supera di poco l'arrivo prima di posarsi
     *      (`cubic-bezier(0.34, 1.42, 0.42, 1)`), invece della decelerazione
     *      piatta di prima;
     *   3. «un moto increspato in un gradiente radiale può fare le onde della
     *      voce» ⇒ `.onda`, qui sotto.
     *
     * ⛔ La larghezza parte a 0.92 e non l'altezza: una pillola schiacciata in
     * verticale si legge come un errore di disegno, una che si APRE in
     * orizzontale si legge come qualcosa che arriva. È la stessa differenza fra
     * un oggetto che appare e un oggetto che entra.
     *
     * ⛔ E dura POCO — 320 ms, 18 px. Misurato su Gemini: al terzo fotogramma
     * (animazioni rallentate sei volte) la sua pillola è già formata e ferma.
     * Il movimento sta nella LUCE, non nell'oggetto. Una pillola che viaggia a
     * lungo mentre la luce corre sarebbe rumore su rumore.
     */
    animation: barra-entra 320ms cubic-bezier(0.34, 1.42, 0.42, 1) both;
}

@keyframes barra-entra {
    from { opacity: 0; transform: translate3d(0, 18px, 0) scaleX(0.94); }
    55% { opacity: 1; }
    to { opacity: 1; transform: none; }
}

/*
 * ⭐⭐ L'ONDA: la luce che corre sui BORDI dello schermo, e poi svanisce.
 *
 * ## ⛔ La prima versione era inventata. Questa è misurata.
 *
 * Avevo scritto un anello radiale che sbocciava dalla pillola, dedotto dalle
 * linee guida di Google Design. L'owner: «attiva Gemini sul Pad, provalo e
 * analizza gli screenshot». Fatto — Gemini nominata assistente, gesto
 * dell'assistente sopra Wikipedia, raffica di fotogrammi a bordo telefono con
 * le animazioni rallentate sei volte. Quello che fa davvero:
 *
 *   j3   la pillola è GIÀ formata in basso; un alone caldo sul solo angolo in
 *        alto a destra
 *   j4   la luce si è allargata lungo tutto il bordo SINISTRO e l'angolo in
 *        basso — blu, verde, rosa
 *   j22  la luce NON C'È PIÙ: restano la pillola e le schede
 *
 * ⇒ Tre fatti che il disegno deve rispettare, e nessuno dei tre l'avevo
 * indovinato:
 *
 *   1. la luce sta sui **bordi**, non al centro e non sotto la pillola;
 *   2. è **passeggera**: entra e sparisce, non resta come cornice;
 *   3. la pagina sotto resta **sempre leggibile** — Gemini non mette mai un
 *      velo, nemmeno all'1%. Il movimento è nella LUCE, non nella pillola.
 *
 * ## ⭐ E dove la superiamo
 *
 * Gemini accende i quattro angoli quasi insieme, senza dire da dove arriva la
 * cosa che è arrivata. Qui la luce **sale dal basso** — da dove la barra
 * atterra — e si spegne salendo: è lo «slancio direzionale» che le loro stesse
 * linee guida descrivono e che la loro implementazione non mostra. E i colori
 * sono i NOSTRI: `--primary` segue il tema, quindi l'onda cambia col vestito
 * invece di essere il blu di qualcun altro.
 *
 * ⛔ Solo `opacity` e `transform`: le due proprietà che il compositore anima
 * senza ridisegnare. Un'onda che facesse ricalcolare il layout a ogni frame
 * farebbe scattare proprio l'istante che deve rendere bello.
 *
 * ⛔ `pointer-events: none`: è luce, non un comando. Senza, coprirebbe la
 * pillola e il primo tocco finirebbe nel vuoto.
 */
.onda {
    position: fixed;
    inset: 0;
    pointer-events: none;
    /*
     * Quattro fuochi sui bordi, non un alone unico: due in basso (da dove
     * arriva la barra, più forti e più larghi) e due in alto (l'eco, appena
     * accennata). `closest-side` tiene ogni fuoco ancorato al suo bordo invece
     * di farlo diventare una macchia centrale.
     */
    background:
        radial-gradient(60% 34% at 8% 100%, color-mix(in oklab, var(--primary) 42%, transparent), transparent 72%),
        radial-gradient(58% 30% at 94% 96%, color-mix(in oklab, var(--primary) 34%, transparent), transparent 70%),
        radial-gradient(46% 26% at 100% 6%, color-mix(in oklab, var(--primary) 26%, transparent), transparent 68%),
        radial-gradient(40% 22% at 0% 14%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 66%);
    animation: barra-onda 820ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes barra-onda {
    /* Attesa: la luce è già accesa in basso ma ancora schiacciata sul bordo. */
    from { opacity: 0; transform: translate3d(0, 12%, 0) scale(1.06); }
    /* Rilascio: il colpo di luce, sul frame in cui la pillola atterra. */
    26% { opacity: 1; }
    /* E si spegne salendo, lasciando lo schermo com'era. */
    to { opacity: 0; transform: translate3d(0, -4%, 0) scale(1); }
}

/*
 * ⛔ IL CAMPO CRESCE CON LE RIGHE — owner 2026-08-11: «quando dico molte parole
 * e vanno a capo vengono tagliate: l'altezza si deve aggiustare in base alle
 * righe».
 *
 * Una `textarea` con `rows="1"` resta alta una riga qualunque cosa contenga: il
 * testo scorre dentro e quello che hai appena dettato sparisce di sopra. Con la
 * voce è insopportabile, perché non stai guardando la tastiera mentre parli:
 * guardi il campo per capire se ti ha sentito.
 *
 * `field-sizing: content` è la riga che lo fa fare al motore invece che a noi —
 * niente misure dello `scrollHeight` a ogni tasto, niente riflussi. Il tetto
 * resta (`max-height`), e oltre quello si scorre: una pillola che diventa alta
 * mezzo schermo coprirebbe l'app sotto, che è tutto ciò che non deve fare.
 */
.campo {
    flex: 1;
    min-width: 0;
    field-sizing: content;
    min-height: 1lh;
    /*
     * ⛔ QUATTRO RIGHE, e il tetto è scritto in RIGHE — owner 2026-08-11:
     * «dagli un massimo di 4 righe prima dello scroll».
     *
     * `4lh` invece di un valore in rem: `lh` è l'altezza di riga REALE, quindi
     * il tetto resta quattro righe anche quando cambia la scala del testo
     * (`--talos-ui-scale`) o il tema porta un carattere diverso. Un numero in
     * pixel sarebbe giusto oggi e sbagliato al primo che ingrandisce i caratteri
     * — cioè proprio la persona che ha più bisogno di leggerle, quelle righe.
     *
     * Il `+ 16px` sono il riempimento sopra e sotto: senza, la quarta riga
     * finirebbe tagliata a metà dal tetto stesso.
     */
    max-height: calc(4lh + 16px);
    overflow-y: auto;
    padding: 8px 4px;
    border: 0;
    background: transparent;
    color: var(--foreground);
    font: inherit;
    font-size: var(--text-md);
    line-height: 1.3;
    resize: none;
}
.campo::placeholder { color: var(--muted-foreground); }
.campo:focus { outline: none; }

/* ⭐ La spia del contesto: una pastiglia DENTRO la pastiglia, così il sorpasso
   non costa una riga in più. */
.spia {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
    padding: 5px 9px 5px 7px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--primary) 30%, transparent);
    background: color-mix(in oklab, var(--primary) 13%, transparent);
    color: var(--primary);
    transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease, transform 90ms ease;
}
.spia:active { transform: scale(0.96); }
.spia:disabled { opacity: 0.8; }

/*
 * ⛔ Senza numero la spia torna SIMMETRICA, e non è un vezzo.
 *
 * Il riempimento asimmetrico (9 px a destra, 7 a sinistra) esiste per far
 * respirare la cifra accanto all'icona. Tolta la cifra quello sbilanciamento
 * spinge l'occhio contro il bordo sinistro e lascia un vuoto a destra: sul Pad
 * si leggeva «👁 +» come un simbolo solo, con **7 px** fra i due pulsanti.
 *
 * ⛔ `.spia--spenta` è esattamente il caso «niente numero» — le due condizioni
 * sono complementari nel template. Se un giorno smettono di esserlo, questa
 * regola comincia a mentire: si cambiano insieme.
 */
.spia--spenta {
    padding: 5px 7px;
    border-color: color-mix(in oklab, var(--border) 85%, transparent);
    background: transparent;
    color: var(--muted-foreground);
}

.numero {
    font-family: var(--talos-font-mono);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
    line-height: 1;
}

/* ── L'ONDA — e ogni barra è un pezzo di volume MISURATO ────────────────
 *
 * ⛔ Niente `animation`: se si muovesse da sola direbbe «ti sento» anche in una
 * stanza vuota, che è la bugia più facile da raccontare in un assistente
 * vocale. L'altezza la scrive `--altezza`, che arriva dal microfono.
 *
 * La transizione è corta (90 ms, poco più di un campione a 80): serve a
 * togliere lo scatto fra due valori, non a inventare movimento fra due silenzi.
 */
.onde {
    display: flex;
    align-items: center;
    /*
     * ⛔ CENTRATE, e su un tablet non è un dettaglio: la pillola arriva a 440 px
     * e le ventotto barre ne occupano ~170. Ancorate a sinistra (`flex-start`)
     * restavano appiccicate al `+` con mezzo campo vuoto a destra — owner
     * 2026-08-12, sul Pad. È anche la forma di Gemini: l'onda sta in mezzo alla
     * pillola, non di lato.
     */
    justify-content: center;
    gap: 3px;
    flex: 1;
    min-width: 0;
    height: 26px;
    padding: 0 4px;
    overflow: hidden;
    background: none;
    border: 0;
}
.onde i {
    width: 3px;
    flex: none;
    border-radius: 999px;
    background: var(--primary);
    /* Il minimo NON è zero: una barra alta zero sparisce, e una fila che si
       accorcia fino a sparire sembra un guasto. Due pixel dicono «sono qui, e
       adesso c'è silenzio» — che è vero e diverso da «mi sono spenta». */
    height: calc(2px + var(--altezza, 0) * 22px);
    transition: height 90ms linear;
}

/* ── LA CARTA — quando il testo non sta più su una riga ──────────────────
 *
 * La forma che l'owner ha fotografato su Gemini: il testo prende tutta la
 * larghezza, i comandi scendono sotto. Con i comandi in linea, a quattro righe
 * la pillola diventa un rettangolo con due bottoni incollati a metà altezza.
 *
 * ⛔ `order` e non un secondo blocco di markup: gli stessi elementi, disposti
 * diversamente. Due copie dello stesso pulsante sono due pulsanti che possono
 * divergere — e uno dei due sarebbe quello che nessuno prova.
 */
.pillola--carta {
    flex-wrap: wrap;
    border-radius: 22px;
    padding: 10px 10px 8px;
    row-gap: 6px;
}
.pillola--carta .campo {
    order: -1;
    flex: 1 0 100%;
    padding-inline: 4px;
}
.pillola--carta .spia { order: 1; }
.pillola--carta .piu { order: 2; }
.pillola--carta .azione { order: 4; margin-inline-start: auto; }

.azione {
    position: relative;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex: none;
    border-radius: 50%;
    background: var(--primary);
    color: var(--primary-foreground);
    transition: transform 90ms ease, filter 180ms ease, opacity 180ms ease;
}
.azione:hover { filter: brightness(1.07); }
.azione:active { transform: scale(0.92); }
.azione:disabled { opacity: 0.45; }
.azione--ferma { background: color-mix(in oklab, var(--destructive) 88%, transparent); }

.azione--ascolta::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid var(--primary);
    animation: barra-anello 1500ms ease-out infinite;
}
@keyframes barra-anello { from { opacity: 0.7; transform: scale(1); } to { opacity: 0; transform: scale(1.6); } }

/* ── LA CARTA ────────────────────────────────────────────────────────────── */
.carta {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 560px;
    max-height: 56vh;
    border-radius: 22px;
    overflow: hidden;
    animation: barra-sale 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes barra-sale {
    from { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.985); }
    to { opacity: 1; transform: none; }
}

/*
 * Il ritorno a posto quando il gesto non arriva alla soglia.
 *
 * ⛔ E si SPEGNE mentre il dito è sulla maniglia (`--in-mano`): una transizione
 * attiva durante il trascinamento fa inseguire la carta al dito con un ritardo,
 * e un pannello che arriva in ritardo sul proprio dito è la cosa che fa dire
 * «non risponde».
 */
.carta { transition: transform 260ms cubic-bezier(0.16, 1, 0.3, 1); }
.carta--in-mano { transition: none; }

/* La maniglia: il gesto per portare la conversazione dentro TALOS intero.
   Per ora è un TOCCO — il trascinamento è il passo dopo, e finché non c'è
   sarebbe disonesto disegnare qualcosa che sembra trascinabile e non lo è. */
.maniglia {
    display: grid;
    place-items: center;
    height: 22px;
    flex: none;
    /* ⛔ Senza, il browser interpreta il trascinamento verticale come uno
       scorrimento e i `pointermove` non arrivano mai: il gesto non esisterebbe. */
    touch-action: none;
}
.maniglia span {
    width: 34px;
    height: 3px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--muted-foreground) 60%, transparent);
    transition: background-color 160ms ease, width 220ms ease;
}
.maniglia:hover span,
.maniglia:focus-visible span { background: var(--primary); width: 44px; }

.corpo { padding: 2px 16px 12px; overflow-y: auto; }

.domanda {
    margin: 0 0 10px;
    padding-left: 10px;
    border-left: 2px solid color-mix(in oklab, var(--primary) 55%, transparent);
    color: var(--muted-foreground);
    font-size: var(--text-xs);
    line-height: 1.4;
}

.testo { font-size: var(--text-sm); line-height: 1.55; }

.scheletro { display: flex; flex-direction: column; gap: 9px; padding: 4px 0 6px; }
.scheletro span {
    height: 10px;
    border-radius: 999px;
    background: linear-gradient(
        90deg,
        color-mix(in oklab, var(--foreground) 5%, transparent),
        color-mix(in oklab, var(--foreground) 13%, transparent),
        color-mix(in oklab, var(--foreground) 5%, transparent)
    );
    background-size: 200% 100%;
    animation: barra-onda 1500ms ease-in-out infinite;
}
.scheletro span:nth-child(2) { width: 86%; animation-delay: 120ms; }
.scheletro span:nth-child(3) { width: 52%; animation-delay: 240ms; }
@keyframes barra-onda { from { background-position: 140% 0; } to { background-position: -40% 0; } }

.piede {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
    padding: 8px 12px;
    border-top: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
}
.piede .spazio { flex: 1; }

.copiato { font-size: var(--text-2xs); color: var(--muted-foreground); }

.tondo {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: none;
    border-radius: 50%;
    color: var(--muted-foreground);
    transition: background-color 160ms ease, color 160ms ease, transform 90ms ease;
}
.tondo:hover,
.tondo:focus-visible { background: color-mix(in oklab, var(--foreground) 8%, transparent); color: var(--foreground); }
.tondo:active { transform: scale(0.9); }

.apri {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 13px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--primary) 32%, transparent);
    color: var(--primary);
    font-size: var(--text-xs);
    transition: background-color 180ms ease, transform 90ms ease;
}
.apri:hover { background: color-mix(in oklab, var(--primary) 12%, transparent); }
.apri:active { transform: scale(0.97); }

.icona { width: 17px; height: 17px; }
.icona-piccola { width: 13px; height: 13px; }

.partiti {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.partiti li {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px 3px 7px;
    border-radius: 999px;
    border: 1px solid color-mix(in oklab, var(--primary) 26%, transparent);
    background: color-mix(in oklab, var(--primary) 11%, transparent);
    color: var(--primary);
    font-size: var(--text-xs);
}

.errore {
    margin: 0;
    padding: 8px 14px;
    border-radius: 999px;
    background: color-mix(in oklab, var(--destructive) 22%, var(--card));
    color: var(--foreground);
    font-size: var(--text-xs);
}

/* ── L'ORLO — la firma, e adesso gira tutto attorno ─────────────────────
 *
 * Owner 2026-08-11: «fai in modo che il widget abbia un gradiente animato come
 * Gemini, in modo che lo distacchi bene dallo sfondo».
 *
 * Aveva ragione, e la prova era a schermo: sopra Wikipedia la carta si leggeva
 * male perché il vetro non staccava dal fondo chiaro. Un bordo che gira lo
 * stacca senza mettere un velo sull'app sotto — che resta la regola numero uno.
 *
 * ## Cosa fa Gemini nel 2026, e cosa prendiamo
 *
 * Il suo aggiornamento porta «un gradiente animato che PULSA e scorre mentre il
 * sistema elabora». Prendiamo l'idea, non la tavolozza: da noi il gradiente è
 * bronzo, cioè il colore del tema che la persona ha scelto.
 *
 * ⭐ E la firma non cambia, si estende: prima era un filo da 2 px sul bordo
 * alto, adesso è tutto il perimetro, e porta gli stessi TRE stati — fermo,
 * ascolto, pensiero. Gemini un segnale di stato non ce l'ha affatto.
 *
 * ## La tecnica, e perché questa
 *
 * `@property` registra l'angolo come vero tipo `<angle>`: senza, una custom
 * property è una stringa e il browser non sa interpolarla — l'animazione
 * scatterebbe da 0 a 360 invece di girare. È la strada del 2026, e non serve
 * una riga di JavaScript.
 *
 * La maschera a due strati (`content-box` XOR tutto) ritaglia il centro e
 * lascia solo la cornice: un bordo vero, non un rettangolo colorato sotto.
 */
@property --talos-giro-barra {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
}

.orlo {
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    padding: 1.5px;
    pointer-events: none;
    background: conic-gradient(
        from var(--talos-giro-barra),
        transparent 0%,
        color-mix(in oklab, var(--primary) 70%, transparent) 10%,
        var(--primary) 17%,
        color-mix(in oklab, var(--primary) 40%, white) 20%,
        var(--primary) 23%,
        color-mix(in oklab, var(--primary) 70%, transparent) 30%,
        transparent 44%,
        transparent 100%
    );
    /* Il ritaglio: resta la cornice, il centro torna trasparente. */
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
    opacity: 0.55;
    animation: barra-giro 14s linear infinite;
    transition: opacity 320ms ease;
}

/*
 * L'ALONE: lo stesso gradiente, sfocato, dietro. È lui che stacca il pannello
 * dal fondo — e lo fa senza toccare l'app sotto, che è il vincolo dell'owner.
 */
.orlo::after {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: inherit;
    background: inherit;
    filter: blur(16px);
    opacity: 0.6;
    z-index: -1;
    transition: opacity 320ms ease;
}

@keyframes barra-giro {
    to { --talos-giro-barra: 360deg; }
}

/* Ascolto: gira più svelto e si accende — piano, come chi aspetta. */
.orlo[data-stato='ascolto'] {
    opacity: 0.9;
    animation-duration: 5s;
}

/* Pensiero: corre. È l'unica cosa che si legge con la coda dell'occhio. */
.orlo[data-stato='pensa'] {
    opacity: 1;
    animation-duration: 2.2s;
}

.orlo[data-stato='pensa']::after { opacity: 0.85; }

/*
 * ⭐ IL VELO CHE RESPIRA, e questo viene dritto da Gemini.
 *
 * Il suo aggiornamento 2026 mette «un gradiente animato che pulsa e scorre
 * mentre il sistema elabora». È il pezzo che rende viva l'attesa senza dire una
 * parola — e vive DENTRO il pannello, quindi non tocca l'app sottostante.
 *
 * ⛔ Compare solo mentre si lavora. Un fondo che si muove sempre è rumore: qui
 * si accende quando c'è qualcosa da aspettare e sparisce quando finisce.
 */
.pillola::before,
.carta::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    opacity: 0;
    background: linear-gradient(
        115deg,
        transparent 20%,
        color-mix(in oklab, var(--primary) 22%, transparent) 45%,
        color-mix(in oklab, var(--primary) 8%, transparent) 60%,
        transparent 80%
    );
    background-size: 260% 100%;
    transition: opacity 380ms ease;
}

.pillola:has(.orlo[data-stato='pensa'])::before,
.carta:has(.orlo[data-stato='pensa'])::before {
    opacity: 1;
    animation: barra-velo 2600ms ease-in-out infinite;
}

@keyframes barra-velo {
    0% { background-position: 140% 0; }
    100% { background-position: -40% 0; }
}

:where(.pillola, .carta) :focus-visible {
    outline: 2px solid var(--ring, var(--primary));
    outline-offset: 2px;
}

/*
 * ⛔ Chi ha chiesto meno movimento non perde NESSUNA informazione.
 *
 * L'orlo smette di girare ma resta acceso, e la sua LUMINOSITÀ continua a dire
 * i tre stati: tenue a riposo, acceso mentre ascolta, pieno mentre lavora. È
 * l'unico modo onesto di spegnere un'animazione che porta un'informazione —
 * toglierla e basta lascerebbe la persona senza il segnale, non senza il moto.
 */
@media (prefers-reduced-motion: reduce) {
    .pillola, .carta { animation: none; }
    .orlo {
        animation: none;
        background: linear-gradient(
            110deg,
            color-mix(in oklab, var(--primary) 30%, transparent),
            var(--primary),
            color-mix(in oklab, var(--primary) 30%, transparent)
        );
    }
    .orlo::after { filter: blur(9px); }
    /* ⛔ L'onda è puro movimento: chi ha chiesto meno moto non la vede
       affatto. Lasciarla ferma e accesa sarebbe una cornice colorata che non
       se ne va più — peggio dell'animazione che voleva evitare. */
    .onda { animation: none; opacity: 0; }
    .pillola::before, .carta::before { animation: none; }
    .azione--ascolta::after { animation: none; opacity: 0.6; }
    .livello i, .scheletro span { animation: none; }
}

/*
 * ⭐ IL TABLET NON È UN TELEFONO GRANDE — owner 2026-08-11, guardando il Pad:
 * «alzala un po' e falla un po' più spessa in altezza».
 *
 * Ha ragione, e il motivo è fisico: su uno schermo da 914 px logici la stessa
 * pillola che sul telefono riempie il pollice diventa un filo lontano, e il
 * pollice che la raggiunge arriva da più lontano. Gemini questa distinzione non
 * la fa — usa la stessa taglia dappertutto, che è comodo per chi la scrive e
 * non per chi la tocca.
 *
 * I numeri: bersaglio da 38 a 46 px (la soglia comoda su tablet), pillola più
 * alta di conseguenza, e lo stacco da terra da 35 a 50 px logici — 131 px reali
 * sul Pad, contro i 92 di Gemini.
 */
@media (min-width: 700px) {
    .scena { padding-bottom: calc(max(env(safe-area-inset-bottom, 0px), 12px) + 34px); }

    .pillola {
        /*
         * ⛔ 460 e non 520, e il numero l'ha corretto la MISURA.
         *
         * Alzando l'altezza avevo allargato anche la pillola, e la sonda ha
         * detto dove finiva: 1365 px su 2400, cioè il 57% dello schermo, contro
         * il 41% di Gemini. A quella larghezza non si legge più come una
         * pillola, si legge come una barra — e l'owner aveva chiesto solo che
         * fosse più spessa.
         *
         * 460 logici = 1207 px reali = 50%. Più larga di Gemini, perché su un
         * tablet da 12 pollici la sua sembra sperduta, ma con lo stesso rapporto
         * fra i lati: 7:1 contro 7,4:1. È la proporzione a fare la pillola, non
         * la larghezza da sola.
         */
        max-width: 460px;
        gap: 8px;
        padding: 9px 9px 9px 11px;
    }

    .campo {
        padding: 11px 6px;
        font-size: var(--text-base);
    }

    .azione { width: 46px; height: 46px; }
    .azione .icona { width: 19px; height: 19px; }

    .spia { padding: 7px 12px 7px 9px; }
    .numero { font-size: var(--text-xs); }

    .carta { max-width: 620px; }
    .maniglia { height: 26px; }
}

/* ── ALLEGATI: il «+», il menu e i gettoni ──────────────────────────────────
 *
 * ⛔ Il menu vive FUORI dalla pillola, come i chip dei suggerimenti di Gemini.
 * Dentro l'avrebbe gonfiata, e la pillola che non cambia mai taglia è la forma
 * che tutto questo compito è servito a trovare.
 */
.piu {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 50%;
    color: var(--muted-foreground);
    transition: background-color 160ms ease, color 160ms ease, transform 90ms ease;
}
.piu:hover,
.piu[aria-expanded='true'] {
    background: color-mix(in oklab, var(--primary) 16%, transparent);
    color: var(--primary);
}
.piu:active { transform: scale(0.9); }

.menu {
    width: 100%;
    max-width: 300px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    border-radius: 18px;
    background: var(--card);
    border: 1px solid color-mix(in oklab, var(--primary) 16%, var(--border));
    box-shadow: 0 0 0 1px rgb(0 0 0 / 28%), 0 18px 44px -14px rgb(0 0 0 / 78%);
    animation: barra-sale 220ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.voce {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    color: var(--foreground);
    font-size: var(--text-sm);
    text-align: left;
    transition: background-color 150ms ease;
}
.voce:hover,
.voce:focus-visible { background: color-mix(in oklab, var(--foreground) 8%, transparent); }

/* I file della Libreria rientrano sotto il loro titolo: sono un elenco, non
   quattro comandi in più. */
.voce--libreria {
    padding-left: 34px;
    color: var(--muted-foreground);
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
}

.menu-vuoto {
    padding: 6px 12px 8px 34px;
    color: var(--muted-foreground);
    font-size: var(--text-2xs);
    line-height: 1.4;
}

.menu-titolo {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px 4px;
    color: var(--primary);
    font-family: var(--talos-font-mono);
    font-size: var(--text-2xs);
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.allegati {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
    max-width: 460px;
}

.gettone {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    padding: 5px 6px 5px 11px;
    border-radius: 999px;
    background: var(--card);
    border: 1px solid color-mix(in oklab, var(--primary) 26%, var(--border));
    box-shadow: 0 6px 18px -8px rgb(0 0 0 / 70%);
    color: var(--foreground);
    font-size: var(--text-2xs);
    overflow: hidden;
}

.gettone-via {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex: none;
    border-radius: 50%;
    color: var(--muted-foreground);
    transition: background-color 150ms ease, color 150ms ease;
}
.gettone-via:hover { background: color-mix(in oklab, var(--foreground) 10%, transparent); color: var(--foreground); }
</style>