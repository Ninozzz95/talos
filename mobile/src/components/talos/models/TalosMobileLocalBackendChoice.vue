<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
    TALOS_LOCAL_BACKEND_KINDS,
    TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE,
    talosLocalBackendOptions,
    type TalosLocalBackendKind,
    type TalosLocalBackendOption,
    type TalosLocalBackendPreference,
} from '@/lib/models/localBackendChoice'
import { useTalosI18n } from '@/i18n'

/**
 * ⭐⭐⭐ DOVE GIRA IL MODELLO — e la scelta è di chi usa l'app.
 *
 * ## L'ordine, e perché fino a oggi non poteva essere eseguito
 *
 * Owner, 2026-09-10: *«LA SCELTA RESTA ALL'UTENTE, SCEGLIE SEMPRE LUI, CPU GPU
 * O HEXAGON, DI DEFAULT SCEGLIAMO QUELLO PIÙ VELOCE (DI SOLITO GPU)»*.
 *
 * Tutto il necessario esisteva già — la chiave, la forma, il lettore, la
 * decisione, perfino il confronto fra richiesto e in uso — tranne **chi
 * scrive**. Il file della preferenza lo dichiarava di sé: *«la sola metà che
 * LEGGE»*. Senza scrittore, il ramo manuale della decisione era **codice
 * morto**: nessun ingresso poteva raggiungerlo.
 *
 * ## ⛔ Perché una lista e non una pillola segmentata
 *
 * Una segmentata `CPU | GPU | Hexagon` è il modo ovvio di disegnare tre stati
 * esclusivi, ed è sbagliato **qui**: due voci su quattro possono essere
 * indisponibili e ognuna porta un **motivo** — «non in questa versione», «non
 * su questo telefono» — e una segmentata non ha dove metterlo. Diventerebbero
 * due segmenti grigi senza spiegazione, cioè esattamente il difetto che
 * abbiamo passato la giornata a togliere: uno stato che non dice perché.
 *
 * ## ⛔ SCELTO non è IN USO, e stanno separati
 *
 * La riga in fondo, sotto un divisore, dice cosa gira **adesso**. Non è una
 * quinta opzione e non si mescola con le altre: è un fatto sul presente, non
 * una scelta. È il differenziatore contro PocketPal, che mostra solo la scelta
 * — «backend selezionabile non equivale a backend realmente utilizzato».
 *
 * ## Un solo accento pieno
 *
 * L'ambra è spesa **una volta**, sul pallino della riga scelta. Il resto è
 * grigio e spazio, come vuole il tema Calm. Nessuno stile nuovo: `--talos-border`,
 * `--talos-panel`, `--talos-active`, `--talos-accent`, `text-2xs`, mono per i dati.
 */
const props = defineProps<{
    /** I dispositivi che il motore dichiara. Vuoto = non lo sappiamo ancora. */
    devices: ReadonlyArray<{ registry: string, name: string, canOffload: boolean }>
    /** Cosa sta girando ADESSO, dal nativo. `null` = nessun modello aperto. */
    inUse: TalosLocalBackendKind | null
    /** Il nome vero del dispositivo scelto dal motore, quando lo dice. */
    inUseDevice?: string | null
    /**
     * ⛔ Il formato dei pesi del modello scelto — `Q4_0`, `Q4_K_M`… Decide se
     * l'NPU ha senso: misurato l'11/09, lo stesso Qwen3-4B legge a 1.126 t/s
     * sull'NPU in Q4_0 e a **55,7** in Q4_K_M. Assente = non letto = NPU fuori.
     */
    quantisation?: string | null
}>()

const { t } = useTalosI18n()

const preferenza = ref<TalosLocalBackendPreference>(TALOS_DEFAULT_LOCAL_BACKEND_PREFERENCE)
const salvataggioFallito = ref(false)

/**
 * ⛔ Vero appena la persona tocca qualcosa — e serve a una gara vera.
 *
 * La lettura iniziale passa da un `import()` dinamico: fra il montaggio e la
 * sua risposta passano millisecondi in cui la scheda e' gia' a schermo e gia'
 * toccabile. Chi sceglie in quella finestra si vedeva la scelta **cancellata**
 * dalla lettura che arrivava dopo, con l'aria di non aver premuto.
 *
 * ⭐ Non l'avevo previsto: l'ha trovato `BK-05`, che verificava tutt'altro
 * (che tornare ad automatico non dimentichi la scelta manuale) e ha sbattuto
 * contro questa gara perche' nel test i due eventi capitano nello stesso
 * respiro. E' il motivo per cui il verso contrario si prova davvero.
 */
const scelteDallaPersona = ref(false)

onMounted(async () => {
    const { talosStoredLocalBackendPreference } = await import('@/lib/models/localBackendPreferenceStore')
    const salvata = await talosStoredLocalBackendPreference()
    // Chi e' arrivato prima vince, e chi e' arrivato prima e' la persona.
    if (!scelteDallaPersona.value) preferenza.value = salvata
})

const opzioni = computed<readonly TalosLocalBackendOption[]>(
    () => talosLocalBackendOptions(props.devices, props.quantisation ?? null),
)

function opzioneDi(kind: TalosLocalBackendKind): TalosLocalBackendOption | undefined {
    return opzioni.value.find((opzione) => opzione.kind === kind)
}

/**
 * ⛔ Il motivo dell'indisponibilità, e i due casi NON si confondono.
 *
 * Hexagon assente perché non l'abbiamo ancora compilato, e Hexagon assente
 * perché questo chip non ce l'ha, dall'app si vedono uguali — è scritto nel
 * tipo stesso dell'opzione. ⇒ Si dice la cosa vera, che è **«qui non c'è»**,
 * senza inventare quale delle due.
 */
function motivoDi(kind: TalosLocalBackendKind): string | null {
    if (kind === 'auto' as TalosLocalBackendKind) return null
    const opzione = opzioneDi(kind)
    if (opzione === undefined) return null
    if (opzione.available) {
        const nome = props.devices.find(
            (device) => opzione.registries.includes(device.registry),
        )?.name
        return nome ?? null
    }
    /*
     * ⛔⛔ DUE «NON DISPONIBILE» DIVERSI, e dirli uguali sarebbe una bugia.
     *
     * «Il telefono non ce l'ha» e «ce l'ha, ma su QUESTO modello andrebbe venti
     * volte piu' piano» portano la persona a due azioni opposte: nel primo caso
     * non c'e' niente da fare, nel secondo basta scaricare lo stesso modello in
     * Q4_0. Il primo ha `registries` vuoto, il secondo li ha pieni — il tipo
     * porta gia' la differenza, e qui si legge.
     */
    if (opzione.registries.length > 0) return t('localModels.backendWrongFormat')
    return t('localModels.backendUnavailable')
}

const scelto = computed<'auto' | TalosLocalBackendKind>(
    () => (preferenza.value.mode === 'manual' && preferenza.value.manual !== null
        ? preferenza.value.manual
        : 'auto'),
)

async function scegli(valore: 'auto' | TalosLocalBackendKind): Promise<void> {
    scelteDallaPersona.value = true
    const nuova: TalosLocalBackendPreference = valore === 'auto'
        // ⛔ `manual` NON si azzera tornando ad automatico: spegnere non è
        // dimenticare. Chi torna alla scelta manuale ritrova la sua.
        ? { mode: 'auto', manual: preferenza.value.manual }
        : { mode: 'manual', manual: valore }
    preferenza.value = nuova
    const { talosSetLocalBackendPreference } = await import('@/lib/models/localBackendPreferenceStore')
    salvataggioFallito.value = !(await talosSetLocalBackendPreference(nuova))
}

/** Automatico più i tre motori, nell'ordine in cui la persona li incontra. */
const righe = computed<Array<{ valore: 'auto' | TalosLocalBackendKind, disponibile: boolean }>>(() => [
    { valore: 'auto', disponibile: true },
    ...TALOS_LOCAL_BACKEND_KINDS.map((kind) => ({
        valore: kind,
        disponibile: opzioneDi(kind)?.available === true,
    })),
])
</script>

<template>
    <section
        class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
        data-testid="talos-backend-choice"
    >
        <h3 class="text-sm font-semibold text-[var(--talos-text)]">
            {{ t('localModels.backendChoiceTitle') }}
        </h3>
        <p class="mt-0.5 text-2xs leading-4 text-[var(--talos-muted)]">
            {{ t('localModels.backendChoiceBody') }}
        </p>

        <div
            class="mt-2"
            role="radiogroup"
            :aria-label="t('localModels.backendChoiceTitle')"
        >
            <button
                v-for="riga in righe"
                :key="riga.valore"
                type="button"
                role="radio"
                :aria-checked="scelto === riga.valore"
                :disabled="!riga.disponibile"
                :data-testid="`talos-backend-choice-${riga.valore}`"
                class="talos-pressable flex min-h-touch w-full items-center gap-2.5 rounded-xl px-2 text-left disabled:opacity-45"
                :class="scelto === riga.valore ? 'bg-[var(--talos-active)]' : ''"
                @click="scegli(riga.valore)"
            >
                <!--
                    ⛔ Il pallino è l'UNICA cosa ambrata di questa scheda. Un
                    secondo accento qui — sul nome, sul bordo, sul badge «in
                    uso» — farebbe leggere due cose come ugualmente importanti,
                    e la scelta smetterebbe di essere evidente a colpo d'occhio.
                -->
                <!--
                    ⛔⛔ AMBRA SOLO SE E' SCELTA **E** DISPONIBILE — trovato
                    guardando lo schermo l'11/09, non da un test.
                    Con un modello Q4_K_M la riga Hexagon diventa spenta e dice
                    «non per questo formato», ma il pallino restava **ambra
                    pieno** perche' era ancora la scelta salvata: una riga
                    grigia con l'accento acceso dice due cose opposte nello
                    stesso respiro, e a colpo d'occhio vince l'accento.

                    ⛔ La scelta NON si dimentica — resta scritta, e torna
                    appena si sceglie un modello che l'NPU sa mangiare
                    ([[spegnere-non-e-dimenticare]]). Cambia solo cosa lo
                    schermo DICHIARA adesso.
                -->
                <span
                    aria-hidden="true"
                    class="size-2 shrink-0 rounded-full"
                    :class="scelto === riga.valore && riga.disponibile
                        ? 'bg-[var(--talos-accent)]'
                        : 'border border-[var(--talos-border-strong)]'"
                />
                <span class="min-w-0 flex-1 text-sm text-[var(--talos-text)]">
                    {{ t(`localModels.backendName.${riga.valore}`) }}
                </span>
                <span
                    v-if="motivoDi(riga.valore as TalosLocalBackendKind)"
                    class="shrink-0 font-mono text-3xs text-[var(--talos-muted)]"
                >{{ motivoDi(riga.valore as TalosLocalBackendKind) }}</span>
            </button>
        </div>

        <!--
            ⛔ SOTTO un divisore, e non fra le opzioni: «cosa gira adesso» è un
            fatto sul presente, non una quinta scelta. Mescolarlo insegnerebbe
            che scegliere e usare sono la stessa cosa — che è precisamente
            l'errore di PocketPal.
        -->
        <p
            v-if="inUse !== null"
            data-testid="talos-backend-in-use"
            class="mt-2 border-t border-[var(--talos-border)] pt-2 font-mono text-2xs text-[var(--talos-muted)]"
        >
            <!--
                ⛔ Il pezzo del dispositivo si OMETTE quando non c'è, invece di
                riempirlo con un trattino: «adesso gira su CPU · —» sembra un
                dato mancante in una frase completa, mentre «adesso gira su CPU»
                è una frase completa e vera.
            -->
            {{ inUseDevice
                ? t('localModels.backendInUseOn', {
                    backend: t(`localModels.backendName.${inUse}`),
                    device: inUseDevice,
                })
                : t('localModels.backendInUse', {
                    backend: t(`localModels.backendName.${inUse}`),
                }) }}
        </p>
        <p
            v-if="salvataggioFallito"
            role="alert"
            class="mt-1.5 text-2xs text-[var(--talos-danger)]"
        >
            {{ t('localModels.backendSaveFailed') }}
        </p>
        <p class="mt-1.5 text-2xs leading-4 text-[var(--talos-muted)]">
            {{ t('localModels.backendNeedsReload') }}
        </p>
    </section>
</template>
