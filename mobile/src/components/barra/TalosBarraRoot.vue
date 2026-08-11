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
 * ## ⭐ La firma: IL FILO
 *
 * Una riga da 2 px sul bordo alto: ferma, che respira mentre ascolta, che corre
 * mentre il modello lavora. ⭐ E qui li superiamo, perché Gemini **non ha nessun
 * segnale di stato**: la carta compare e basta. Un filo che si muove è l'unica
 * cosa che si legge con la coda dell'occhio mentre guardi l'app sotto.
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
import { computed, onMounted, ref } from 'vue'
import { ArrowUp, Copy, Eye, EyeOff, Maximize2, Mic, Square, X } from '@lucide/vue'
import TalosMobileMessageContent from '@/components/chat/TalosMobileMessageContent.vue'
import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'
import { useTalosMobileDictation } from '@/composables/useTalosMobileDictation'
import { useTalosRispostaAVoce } from '@/composables/useTalosRispostaAVoce'
import { TALOS_METADATA_DETTATO } from '@/lib/tools/tracciaAzione'
import type { TalosModoBarra } from '@/lib/barra/modoBarra'

const props = defineProps<{ modo: TalosModoBarra }>()

const { t, locale } = useTalosI18n()
const controller = useChatController()
const chat = controller.chat

const bozza = ref('')
const campo = ref<HTMLTextAreaElement | null>(null)
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

/** Lo stato che IL FILO racconta, e l'unico posto dove viene deciso. */
const filo = computed<'fermo' | 'ascolto' | 'pensa'>(() => {
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
        undefined,
        () => { bozza.value = '' },
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
    // Chi ha chiamato con la voce vuole parlare, non trovarsi una tastiera in
    // faccia; chi ha chiamato col gesto sta già guardando il campo.
    if (props.modo.daVoce) void dettatura.toggle()
    else campo.value?.focus()
})
</script>

<template>
    <!-- ⛔ Il tocco FUORI chiude, ed è `.self` di proposito: un tocco dentro non
         deve mai buttare via quello che stai scrivendo. Sopra non c'è nessun
         velo — l'app sotto si vede intera, che è tutto il punto. -->
    <div class="scena" data-testid="talos-barra-scena" @click.self="chiudi">

        <!-- LA CARTA: un oggetto separato, che va e viene. La pillola non si
             gonfia mai — è la forma misurata su Gemini l'11 agosto. -->
        <article
            v-if="cartaVisibile"
            class="carta"
            :aria-label="t('barra.title')"
            data-testid="talos-barra-carta"
        >
            <div class="filo" :data-stato="filo" aria-hidden="true" />
            <button
                type="button"
                class="maniglia"
                :aria-label="t('barra.open')"
                data-testid="talos-barra-maniglia"
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

        <!-- LA PILLOLA: la forma a riposo, e non cambia mai taglia. -->
        <form class="pillola" data-testid="talos-barra" @submit.prevent="invia">
            <div class="filo" :data-stato="filo" data-testid="talos-barra-filo" aria-hidden="true" />

            <button
                type="button"
                class="spia"
                :class="{ 'spia--spenta': !guardo || !contestoDisponibile }"
                :disabled="!contestoDisponibile"
                :aria-pressed="guardo && contestoDisponibile"
                :aria-label="etichettaSpia"
                :title="etichettaSpia"
                data-testid="talos-barra-contesto"
                @click="alternaContesto"
            >
                <Eye v-if="guardo && contestoDisponibile" class="icona-piccola" aria-hidden="true" />
                <EyeOff v-else class="icona-piccola" aria-hidden="true" />
                <span class="numero">{{ contestoDisponibile && guardo ? props.modo.contesto.nodi : '—' }}</span>
            </button>

            <span v-if="ascolta" class="livello" aria-hidden="true"><i /><i /><i /></span>

            <textarea
                ref="campo"
                v-model="bozza"
                class="campo"
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
                @click="dettatura.toggle()"
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
    padding: 0 12px max(env(safe-area-inset-bottom), 10px);
}

/* Il vetro, uguale per la pillola e per la carta: una materia sola. */
.pillola,
.carta {
    position: relative;
    background: color-mix(in oklab, var(--card) 86%, transparent);
    backdrop-filter: blur(24px) saturate(160%);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
    border: 1px solid color-mix(in oklab, var(--primary) 16%, var(--border));
    box-shadow:
        0 1px 0 0 color-mix(in oklab, var(--foreground) 7%, transparent) inset,
        0 20px 50px -16px rgb(0 0 0 / 72%);
    color: var(--foreground);
    font-family: var(--talos-font-ui);
}

/* ── LA PILLOLA ──────────────────────────────────────────────────────────── */
.pillola {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    /* Gemini misurata: 41% su un Pad da 2400. Qui il tetto è in px perché su un
       telefono stretto una percentuale darebbe una pillola inusabile. */
    max-width: 440px;
    padding: 6px 6px 6px 8px;
    border-radius: 999px;
    animation: barra-entra 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes barra-entra {
    from { opacity: 0; transform: translate3d(0, 20px, 0) scale(0.98); }
    to { opacity: 1; transform: none; }
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

.spia--spenta {
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

/* La maniglia: il gesto per portare la conversazione dentro TALOS intero.
   Per ora è un TOCCO — il trascinamento è il passo dopo, e finché non c'è
   sarebbe disonesto disegnare qualcosa che sembra trascinabile e non lo è. */
.maniglia {
    display: grid;
    place-items: center;
    height: 22px;
    flex: none;
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

/* ── IL FILO — la firma, e Gemini non ha niente del genere ───────────────── */
.filo {
    position: absolute;
    top: 0;
    left: 22px;
    right: 22px;
    height: 2px;
    border-radius: 2px;
    overflow: hidden;
    background: color-mix(in oklab, var(--primary) 24%, transparent);
    pointer-events: none;
}

.filo::after {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0;
    background: linear-gradient(
        90deg,
        transparent,
        var(--primary) 46%,
        color-mix(in oklab, var(--primary) 45%, white) 50%,
        var(--primary) 54%,
        transparent
    );
    transform: translate3d(-100%, 0, 0);
}

/* Ascolto: il filo RESPIRA, piano, come chi aspetta che tu finisca. */
.filo[data-stato='ascolto']::after {
    opacity: 1;
    transform: none;
    background: color-mix(in oklab, var(--primary) 85%, transparent);
    animation: barra-respiro 1900ms ease-in-out infinite;
}
@keyframes barra-respiro { 0%, 100% { opacity: 0.26; } 50% { opacity: 1; } }

/* Pensiero: il filo CORRE. Un passaggio solo, non un rimbalzo. */
.filo[data-stato='pensa']::after {
    opacity: 1;
    animation: barra-corsa 1250ms cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
@keyframes barra-corsa {
    from { transform: translate3d(-100%, 0, 0); }
    to { transform: translate3d(100%, 0, 0); }
}

:where(.pillola, .carta) :focus-visible {
    outline: 2px solid var(--ring, var(--primary));
    outline-offset: 2px;
}

/*
 * ⛔ Chi ha chiesto meno movimento non perde NESSUNA informazione: il filo resta
 * acceso mentre si lavora invece di correre. Lo stato si legge lo stesso — è
 * l'unico modo onesto di spegnere un'animazione che dice qualcosa.
 */
@media (prefers-reduced-motion: reduce) {
    .pillola, .carta { animation: none; }
    .filo[data-stato='ascolto']::after,
    .filo[data-stato='pensa']::after {
        animation: none;
        opacity: 1;
        transform: none;
        background: var(--primary);
    }
    .azione--ascolta::after { animation: none; opacity: 0.6; }
    .livello i, .scheletro span { animation: none; }
}
</style>
