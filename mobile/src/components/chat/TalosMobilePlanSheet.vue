<script setup lang="ts">
import { computed, ref } from 'vue'
import { ListChecks, Minus, ShieldAlert, Undo2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { TalosPlan, TalosPlanStep } from '@/lib/tools/plan'

/**
 * B6 — il piano, prima che parta.
 *
 * ## Cosa deve far vedere, e perché queste cose
 *
 * La ricerca sulle schede di approvazione (2026-08-07) dice che chi approva ha
 * bisogno di quattro cose: **l'azione esatta**, **su cosa**, **quanto è
 * reversibile** e **cosa succede se dice di no**. Le prime tre stanno qui in
 * chiaro; la quarta è la ragione per cui questa scheda esiste — dicendo di no
 * non si perde niente, perché **niente è ancora stato fatto**.
 *
 * ## Perché una scheda e non quattro
 *
 * Perché quattro conferme in fila producono il tocco automatico su «approva»:
 * misurato, e con un nome — affaticamento da conferme. Una scheda sola per
 * messaggio è il tetto che vale la pena promettere: **non ti si può chiedere
 * più di una volta per ogni messaggio che hai mandato.**
 *
 * ## I passi negati si vedono
 *
 * Un passo che il permesso nega resta nell'elenco, barrato e non selezionabile.
 * Nasconderlo darebbe l'impressione che il modello non l'avesse chiesto, e la
 * pagina dei permessi diventerebbe una cosa che agisce di nascosto.
 */

const props = defineProps<{
    plan: TalosPlan
    sessionTitle: string
}>()

const emit = defineEmits<{
    /** Approva i passi rimasti. */
    approve: [stepIds: readonly string[]]
    /** Rifiuta tutto. Niente è stato fatto, quindi non c'è niente da annullare. */
    cancel: []
    /** Chiude senza decidere: la richiesta resta in attesa. */
    later: []
}>()

/** I passi che l'utente ha tolto in questa scheda, prima di approvare. */
const tolti = ref(new Set<string>())

function togli(step: TalosPlanStep): void {
    if (step.state === 'denied') return
    const prossimo = new Set(tolti.value)
    if (prossimo.has(step.id)) prossimo.delete(step.id)
    else prossimo.add(step.id)
    tolti.value = prossimo
}

const attivi = computed(() => props.plan.steps.filter(
    (step) => step.state !== 'denied' && !tolti.value.has(step.id),
))

/**
 * Il rischio di ciò che resta, non del piano proposto.
 *
 * Se togli il passo pericoloso, il numero deve scendere sotto i tuoi occhi:
 * un rischio che non si muove è un numero che nessuno crederà una seconda volta.
 */
const rischio = computed(() => {
    const scala = ['R0', 'R1', 'R2', 'R3', 'R4']
    return attivi.value.reduce(
        (massimo, step) => (scala.indexOf(step.risk) > scala.indexOf(massimo) ? step.risk : massimo),
        'R0' as TalosPlanStep['risk'],
    )
})

const irreversibili = computed(
    () => attivi.value.filter((step) => step.reversibility === 'irreversible').length,
)

function argomenti(step: TalosPlanStep): string {
    try {
        const testo = JSON.stringify(step.input)
        return testo && testo !== '{}' ? testo.slice(0, 160) : ''
    } catch {
        return ''
    }
}
</script>

<template>
    <Teleport to="body">
        <section
            data-testid="talos-plan-sheet"
            role="dialog"
            aria-labelledby="talos-plan-title"
            tabindex="-1"
            class="pointer-events-auto fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[95] mx-auto w-auto max-w-[560px] rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-4 shadow-2xl"
            @keydown.esc.stop="emit('later')"
        >
            <div class="flex items-start gap-3">
                <ListChecks
                    class="mt-0.5 size-5 shrink-0 text-[var(--talos-accent)]"
                    aria-hidden="true"
                />
                <div class="min-w-0 flex-1">
                    <p class="text-2xs font-medium uppercase tracking-wide text-[var(--talos-muted)]">
                        {{ $t('chat.authorizationFromChat', { title: sessionTitle }) }}
                    </p>
                    <h2
                        id="talos-plan-title"
                        class="mt-0.5 text-md font-semibold text-[var(--talos-text)]"
                    >{{ $t('chat.plan.title', { count: attivi.length }) }}</h2>
                    <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">
                        {{ $t('chat.plan.nothingDoneYet') }}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-testid="talos-plan-later"
                    :aria-label="$t('chat.authorizationLater')"
                    class="talos-pressable shrink-0 rounded-full"
                    @click="emit('later')"
                >
                    <X class="size-4" aria-hidden="true" />
                </Button>
            </div>

            <ol class="mt-3 flex flex-col gap-1.5" data-testid="talos-plan-steps">
                <li
                    v-for="(step, indice) in plan.steps"
                    :key="step.id"
                    :data-plan-step="step.id"
                    class="flex items-start gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-2.5 py-2"
                    :class="{
                        'opacity-50': step.state === 'denied' || tolti.has(step.id),
                    }"
                >
                    <span class="mt-0.5 text-2xs tabular-nums text-[var(--talos-muted)]">
                        {{ indice + 1 }}
                    </span>
                    <div class="min-w-0 flex-1">
                        <p
                            class="text-sm text-[var(--talos-text)]"
                            :class="{ 'line-through': step.state === 'denied' || tolti.has(step.id) }"
                        >{{ step.title }}</p>
                        <p
                            v-if="argomenti(step)"
                            class="mt-0.5 truncate text-2xs text-[var(--talos-muted)]"
                        >{{ argomenti(step) }}</p>
                        <p
                            v-if="step.state === 'denied'"
                            class="mt-0.5 text-2xs text-[var(--talos-muted)]"
                        >{{ $t('chat.plan.deniedByPolicy') }}</p>
                        <p
                            v-else-if="step.reversibility === 'irreversible'"
                            class="mt-0.5 text-2xs font-medium text-[var(--talos-accent)]"
                        >{{ $t('chat.plan.irreversible') }}</p>
                    </div>
                    <Button
                        v-if="step.state !== 'denied'"
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        :data-testid="`talos-plan-toggle-${step.id}`"
                        :aria-label="tolti.has(step.id)
                            ? $t('chat.plan.putBack', { step: step.title })
                            : $t('chat.plan.remove', { step: step.title })"
                        class="talos-pressable shrink-0 rounded-full"
                        @click="togli(step)"
                    >
                        <Undo2 v-if="tolti.has(step.id)" class="size-4" aria-hidden="true" />
                        <Minus v-else class="size-4" aria-hidden="true" />
                    </Button>
                </li>
            </ol>

            <p
                v-if="irreversibili > 0"
                data-testid="talos-plan-irreversible-warning"
                class="mt-2.5 flex items-start gap-1.5 text-2xs leading-4 text-[var(--talos-accent)]"
            >
                <ShieldAlert class="mt-px size-3.5 shrink-0" aria-hidden="true" />
                {{ $t('chat.plan.irreversibleCount', { count: irreversibili }) }}
            </p>

            <div class="mt-4 grid grid-cols-2 gap-2">
                <Button
                    type="button"
                    data-testid="talos-plan-cancel"
                    class="talos-pressable min-h-touch rounded-full border border-[var(--talos-border)] bg-transparent text-sm text-[var(--talos-text)]"
                    @click="emit('cancel')"
                >{{ $t('chat.plan.cancel') }}</Button>
                <Button
                    type="button"
                    data-testid="talos-plan-approve"
                    :disabled="attivi.length === 0"
                    class="talos-pressable min-h-touch rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))] disabled:opacity-50"
                    @click="emit('approve', attivi.map((step) => step.id))"
                >{{ $t('chat.plan.approve', { count: attivi.length }) }}</Button>
            </div>
            <p class="mt-2 text-center text-2xs text-[var(--talos-muted)]">
                {{ $t(`chat.plan.risk.${rischio}`) }}
            </p>
        </section>
    </Teleport>
</template>
