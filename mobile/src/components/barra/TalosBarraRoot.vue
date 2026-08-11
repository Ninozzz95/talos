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
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowUp, Camera, Copy, Eye, EyeOff, FileText, Image, Library, Maximize2, Mic, Plus, Square, Volume2, VolumeX, X } from '@lucide/vue'
import TalosMobileMessageContent from '@/components/chat/TalosMobileMessageContent.vue'
import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'
import { useTalosMobileDictation } from '@/composables/useTalosMobileDictation'
import { useTalosRispostaAVoce } from '@/composables/useTalosRispostaAVoce'
import { useTalosSpeech } from '@/composables/useTalosSpeech'
import { talosOffsetDelTrascinamento, talosTrascinamentoApre } from '@/lib/barra/trascinamento'
import { TALOS_METADATA_DETTATO } from '@/lib/tools/tracciaAzione'
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
        const prima = bozza.value
        bozza.value = testo
        voce.dettatura(prima, testo)
    },
    autoLanguage: () => true,
    allowedLanguages: () => voce.lingue,
})

const ascolta = computed(() => dettatura.status.value === 'listening' || dettatura.status.value === 'starting')
const lavora = computed(() => chat.state.sending)

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
const RIPRESE_MASSIME = 4
const ascoltoVoluto = ref(props.modo.daVoce)
let riprese = 0

watch(
    () => [dettatura.status.value, dettatura.errorCode.value] as const,
    ([stato, codice]) => {
        if (!ascoltoVoluto.value) return
        if (stato !== 'error' || codice !== 'noSpeech') return
        if (riprese >= RIPRESE_MASSIME) {
            ascoltoVoluto.value = false
            return
        }
        riprese += 1
        void dettatura.toggle()
    },
)

/** La persona ha deciso: da qui in poi l'ascolto non si riaccende da solo. */
function laVoceLaComandaLaPersona(): void {
    ascoltoVoluto.value = false
}

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
 * ⛔ E il contatore delle riprese si azzera qui: sono i silenzi di QUESTA
 * chiamata, non di tutte quelle da quando l'app è viva. Senza, alla quinta
 * apertura TALOS non ascolterebbe più.
 */
watch(
    () => props.modo.chiamata,
    () => {
        if (!props.modo.daVoce) return
        riprese = 0
        ascoltoVoluto.value = true
        if (!ascolta.value) void dettatura.toggle()
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
 * ⭐ Porta la conversazione dentro TALOS intero.
 *
 * Censito su Gemini: ha DUE strade per la stessa cosa — un tondo «Apri l'app
 * Gemini» e la maniglia trascinabile — e la conversazione arriva di là completa,
 * con la domanda in bolla e un titolo generato. Qui la chat è già la stessa, per
 * costruzione: non c'è niente da trasferire, basta aprire.
 */
async function apriInTalos(): Promise<void> {
    try {
        const [{ App }, { TalosDeviceBridge }] = await Promise.all([
            import('@capacitor/app'),
            import('@/lib/device/devicePlugin'),
        ])
        const info = await App.getInfo()
        // ⛔ Il pacchetto si CHIEDE: fra `ai.talos` e `ai.talos.dev` scritto a
        // mano sbaglierei metà delle installazioni, e in quella metà il pulsante
        // non farebbe niente senza dirlo.
        await TalosDeviceBridge.openApp({ package: info.id })
        await App.exitApp()
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

async function invia(): Promise<void> {
    const testo = bozza.value.trim()
    if (!testo || lavora.value) return
    // ⛔ La domanda è partita: da qui l'ascolto non si riaccende da solo.
    // Senza questa riga il microfono tornerebbe su mentre TALOS risponde.
    laVoceLaComandaLaPersona()
    dettatura.cancel()
    const dettato = voce.catturaInvio()
    domanda.value = testo
    errore.value = null
    const metadati: Record<string, unknown> = {}
    if (dettato) metadati[TALOS_METADATA_DETTATO] = true
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
    if (props.modo.daVoce) void dettatura.toggle()
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
        <form class="pillola" data-testid="talos-barra" @submit.prevent="invia">
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

            <span v-if="ascolta" class="livello" aria-hidden="true"><i /><i /><i /></span>

            <textarea
                v-model="bozza"
                class="campo"
                @beforeinput="laVoceLaComandaLaPersona"
                rows="1"
                :placeholder="ascolta ? t('barra.listening') : t('barra.write')"
                :aria-label="t('barra.write')"
                data-testid="talos-barra-campo"
                @input="voce.aggiornaBozza(bozza)"
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
                @click="laVoceLaComandaLaPersona(); dettatura.toggle()"
            >
                <Mic class="icona" aria-hidden="true" />
            </button>
        </form>
    </div>
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

.campo {
    flex: 1;
    min-width: 0;
    max-height: 6rem;
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

.livello { display: flex; align-items: flex-end; gap: 3px; height: 15px; flex: none; }
.livello i {
    width: 3px;
    border-radius: 2px;
    background: var(--primary);
    animation: barra-livello 900ms ease-in-out infinite;
}
.livello i:nth-child(1) { height: 6px; }
.livello i:nth-child(2) { height: 14px; animation-delay: 140ms; }
.livello i:nth-child(3) { height: 9px; animation-delay: 280ms; }
@keyframes barra-livello { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }

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