<script setup lang="ts">
/**
 * Il FAB a ventaglio: una porta sola per cominciare qualsiasi cosa.
 *
 * ## Cosa risolve
 *
 * Owner 2026-08-06: «nella sidebar il pulsante nuova chat diventa un FAB nuovo,
 * che si espande e mostra pulsanti fab action uno sopra l'altro per iniziare
 * velocemente chat, ricerca, memoria, nota, attività».
 *
 * Prima la sidebar sapeva cominciare **una** cosa. Per ogni altra bisognava
 * andare nella sua stazione e trovarci il suo FAB: cinque gesti diversi per
 * cinque cose che sono lo stesso gesto — «voglio cominciare qualcosa».
 *
 * ## Cinque, e non è un caso
 *
 * La ricerca è netta: **da tre a sei azioni**, oltre le sei serve un'altra
 * forma. Le cinque dell'owner ci stanno esattamente, e il tetto va difeso: la
 * sesta voce che qualcuno vorrà aggiungere è quella che trasforma un gesto
 * rapido in un menu da leggere.
 *
 * ## Il movimento è quello che c'è già
 *
 * `data-talos-motion-intent="menu-open"` è un intento che il motore di TALOS
 * dichiara da sempre; qui viene usato per la prima volta. Durata e curva
 * arrivano da `--talos-motion-duration-surface-enter`, cioè dalle preferenze di
 * movimento dell'utente, e il rispetto di `prefers-reduced-motion` è già scritto
 * una volta sola nel CSS del motore — non riscritto qui.
 *
 * Lo scaglionamento è l'unica cosa nuova, ed è un ritardo per indice: le voci
 * salgono una dopo l'altra invece che in blocco. Una colonna che compare tutta
 * insieme si legge come un pannello; una che sale si legge come un gesto.
 *
 * ## Accessibilità: le regole vengono dalla ricerca, non dal gusto
 *
 * `aria-haspopup` + `aria-expanded` + `aria-controls` sul FAB; `role="menu"`
 * con `aria-orientation="vertical"` sulla colonna; `role="menuitem"` sulle voci.
 * Le frecce muovono fra le voci, Escape chiude **e riporta il fuoco al FAB** —
 * senza quel ritorno, chi naviga da tastiera resta in un punto che non esiste
 * più.
 *
 * L'etichetta sta ACCANTO all'icona e non dentro un tooltip: un ventaglio di
 * cinque icone senza parole è un indovinello, e questa è la superficie che deve
 * far cominciare in fretta.
 */
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { BookMarked, ListTodo, MessageSquarePlus, Plus, Search, StickyNote } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'

const { t } = useTalosI18n()
const router = useRouter()

/**
 * La chat NON viene creata qui.
 *
 * Le altre quattro voci sono navigazioni: portano a una pagina di creazione e
 * lì finisce il compito del ventaglio. La chat invece è una *sessione*, che
 * nasce da chi possiede il controller e sa mostrare l'attesa — perciò il
 * ventaglio la chiede a chi sta sopra, con lo stesso evento che il vecchio FAB
 * emetteva. Duplicare qui la creazione avrebbe significato due strade per la
 * stessa cosa, e una delle due senza stato di attesa.
 */
const emit = defineEmits<{ started: []; chat: [] }>()

const props = withDefaults(defineProps<{
    /**
     * Una sessione è già in corso di creazione. Spegne SOLO la voce chat: le
     * altre quattro non c'entrano nulla con quell'attesa, e spegnerle tutte
     * bloccherebbe il ventaglio intero per un lavoro che non le riguarda.
     */
    creatingChat?: boolean
}>(), { creatingChat: false })

const open = ref(false)
const fab = ref<HTMLButtonElement | null>(null)
const voci = ref<HTMLButtonElement[]>([])

type Voce = {
    id: string
    icon: typeof Plus
    label: string
    disabled?: boolean
    /**
     * `unknown` e non `void`: `router.push` restituisce un esito di navigazione
     * che qui non serve a nessuno, e obbligarlo a `void` costringerebbe ogni
     * voce a incartarlo in una funzione in più per far tacere il compilatore.
     */
    run: () => unknown
}

/**
 * L'ordine è quello dell'owner, e conta: la voce più vicina al pollice è quella
 * che si usa di più. La chat sta in fondo alla colonna, cioè attaccata al FAB.
 */
const azioni = computed<Voce[]>(() => [
    { id: 'task', icon: ListTodo, label: t('speedDial.task'), run: () => router.push({ name: 'task-new' }) },
    { id: 'memory', icon: BookMarked, label: t('speedDial.memory'), run: () => router.push({ name: 'memory-new' }) },
    { id: 'note', icon: StickyNote, label: t('speedDial.note'), run: () => router.push({ name: 'note-new' }) },
    { id: 'research', icon: Search, label: t('speedDial.research'), run: () => router.push({ name: 'research-new' }) },
    { id: 'chat', icon: MessageSquarePlus, label: t('speedDial.chat'), disabled: props.creatingChat, run: () => emit('chat') },
])

async function apri(): Promise<void> {
    open.value = true
    await nextTick()
    // Il fuoco entra sulla voce PIÙ VICINA al FAB, che è l'ultima della colonna:
    // è quella sotto il dito, e sarebbe strana da saltare.
    voci.value[voci.value.length - 1]?.focus()
}

function chiudi(tornaAlFab = true): void {
    open.value = false
    if (tornaAlFab) void nextTick(() => fab.value?.focus())
}

function alterna(): void {
    if (open.value) chiudi()
    else void apri()
}

async function scegli(voce: Voce): Promise<void> {
    // Chiusa PRIMA di navigare, e senza rimandare il fuoco al FAB: fra un istante
    // il FAB non sarà più la cosa che si sta guardando.
    chiudi(false)
    emit('started')
    await Promise.resolve(voce.run())
}

function muovi(indice: number, passo: number): void {
    const prossimo = (indice + passo + voci.value.length) % voci.value.length
    voci.value[prossimo]?.focus()
}
</script>

<template>
    <div class="relative z-50 flex flex-col items-stretch">
        <!--
            Toccare fuori chiude.

            Visto sul OnePlus Pad 3 il 2026-08-06: aperto il ventaglio, l'unica
            uscita era ripremere il FAB — e chi apre per sbaglio non lo sa. Un
            menu che si apre col pollice deve chiudersi col pollice, e il gesto
            che tutti provano per primo è toccare da un'altra parte.

            Il velo è lo stesso del foglio del compositore — `bg-black/30` con
            due pixel di sfocatura — e non è decorazione: sul tablet le voci del
            ventaglio finiscono ESATTAMENTE sopra la lista Strumenti, e senza
            qualcosa che stacchi i due piani «Attività» del menu si leggeva in
            fila con «Note» dell'elenco dietro. Trenta per cento e non di più:
            qui non si chiede una decisione, si offre una scorciatoia.

            Nessun intento di movimento: `menu-open` fa salire la superficie di
            otto pixel, e su un velo a tutto schermo quegli otto pixel sarebbero
            una striscia scoperta in cima per tutta la durata dell'entrata.
        -->
        <div
            v-if="open"
            data-testid="talos-speed-dial-scrim"
            aria-hidden="true"
            class="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            @click="chiudi()"
        />

        <!--
            La colonna sta SOPRA il FAB, che è dove il pollice non la copre — e
            sta FUORI DAL FLUSSO.

            Owner 2026-08-06, guardando il tablet: «il pulsante Nuovo deve essere
            allineato nella stessa linea della sezione utente, non deve andare
            sotto». In colonna il ventaglio faceva crescere il contenitore, e la
            barra in fondo — che centra i suoi figli — spingeva il FAB più in
            basso dell'avatar: aprire il menu SPOSTAVA il tasto che si era appena
            premuto. In assoluto il contenitore resta alto quanto il FAB, la
            barra non si muove di un pixel e il menu galleggia sopra.

            `w-max min-w-full`: largo almeno quanto il FAB per stare in colonna
            con lui, ma libero di crescere per la parola più lunga invece di
            tagliarla.
        -->
        <div
            v-if="open"
            id="talos-speed-dial-menu"
            role="menu"
            aria-orientation="vertical"
            data-testid="talos-speed-dial-menu"
            class="absolute bottom-full right-0 z-50 mb-[var(--talos-space-inline)] flex w-max min-w-full flex-col gap-[var(--talos-space-inline)]"
        >
            <button
                v-for="(voce, indice) in azioni"
                :key="voce.id"
                ref="voci"
                type="button"
                role="menuitem"
                :data-testid="`talos-speed-dial-${voce.id}`"
                :disabled="voce.disabled === true"
                data-talos-motion-intent="menu-open"
                :style="{ animationDelay: `calc(var(--talos-motion-duration-surface-enter, 0ms) * ${indice * 0.12})` }"
                class="talos-pressable flex min-h-touch w-full items-center gap-[var(--talos-space-inline)] rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] px-[var(--talos-space-control)] text-left text-sm text-[var(--talos-text)] disabled:opacity-60"
                @click="scegli(voce)"
                @keydown.down.prevent="muovi(indice, 1)"
                @keydown.up.prevent="muovi(indice, -1)"
                @keydown.esc.prevent="chiudi()"
            >
                <component :is="voce.icon" class="size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                <span class="min-w-0 truncate">{{ voce.label }}</span>
            </button>
        </div>

        <button
            ref="fab"
            type="button"
            data-testid="talos-speed-dial-trigger"
            aria-haspopup="menu"
            :aria-expanded="open"
            aria-controls="talos-speed-dial-menu"
            :aria-label="open ? t('speedDial.close') : t('speedDial.open')"
            class="talos-pressable relative z-50 flex min-h-touch w-full items-center justify-center gap-[var(--talos-space-inline)] rounded-full bg-[var(--talos-accent)] px-[var(--talos-space-control)] text-sm font-semibold text-[var(--talos-accent-contrast,var(--primary-foreground))]"
            @click="alterna()"
            @keydown.esc.prevent="chiudi()"
        >
            <!-- La croce che diventa una X: la stessa icona ruotata, così il
                 tasto dice sempre cosa farà il prossimo tocco. -->
            <Plus
                class="size-[var(--talos-icon-size)] shrink-0 transition-transform duration-[var(--talos-motion-duration-control,160ms)] motion-reduce:transition-none"
                :class="open ? 'rotate-45' : ''"
                aria-hidden="true"
            />
            <span>{{ t('speedDial.new') }}</span>
        </button>
    </div>
</template>
