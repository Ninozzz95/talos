<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { talosNpuTermsText } from '@/lib/models/npuTerms'

/**
 * ⛔⛔ Le condizioni del software Qualcomm, da accettare prima che l'NPU si
 * accenda — PKLA 2.1 b (owner, 01/10/2026).
 *
 * Le regole di un'accettazione che regga (clickwrap, letto il 01/10/2026):
 * il testo intero è a schermo PRIMA del consenso; il consenso è un'azione
 * esplicita — una casella da spuntare e un pulsante che dice cosa succede
 * («Accetto e accendo l'NPU», mai «Continua»); il nativo registra versione,
 * impronta del testo, lingua e ora (`TalosNpuTerms`).
 *
 * ⛔ Il testo viene da `npuTerms.ts`, non da i18n: è quello approvato, parola
 * per parola, ed è di quello che si calcola l'impronta.
 *
 * ⛔ Owner: azioni mai affiancate, niente controlli nativi. I due pulsanti
 * stanno uno sotto l'altro nel corpo (il piede del dialogo li affiancherebbe),
 * e la casella è nostra (`role="checkbox"`), non un `<input>` del sistema.
 *
 * Chiudere con la X, Indietro o lo sfondo vale «Non ora»: non accetta niente.
 */
const emit = defineEmits<{ decide: ['accepted' | 'later'] }>()

const { t, locale } = useTalosI18n()
const testo = computed(() => talosNpuTermsText(String(locale.value ?? 'it')))

const spuntata = ref(false)
const inCorso = ref(false)
const fallita = ref(false)

async function accetta(): Promise<void> {
    if (!spuntata.value || inCorso.value) return
    inCorso.value = true
    fallita.value = false
    const { talosAcceptNpuTerms } = await import('@/services/localEngine')
    const esito = await talosAcceptNpuTerms(String(locale.value ?? 'it'))
    inCorso.value = false
    if (!esito.accepted) {
        fallita.value = true
        return
    }
    emit('decide', 'accepted')
}
</script>

<template>
    <TalosMobileConfirmDialog :title="testo.title" @close="emit('decide', 'later')">
        <div
            class="max-h-[50vh] overflow-y-auto rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/60 px-3 py-2.5"
            data-testid="talos-npu-terms-text"
            tabindex="0"
        >
            <p class="text-sm leading-5 text-[var(--talos-text)]">{{ testo.intro }}</p>
            <ol class="mt-2 flex flex-col gap-2">
                <li
                    v-for="(voce, indice) in testo.items"
                    :key="indice"
                    class="text-xs leading-5 text-[var(--talos-muted)]"
                >
                    <span class="font-semibold text-[var(--talos-text)]">{{ indice + 1 }}. {{ voce.title }}</span>
                    {{ voce.body }}
                </li>
            </ol>
        </div>

        <button
            type="button"
            role="checkbox"
            :aria-checked="spuntata"
            data-testid="talos-npu-terms-checkbox"
            class="talos-pressable flex min-h-touch w-full items-center gap-2.5 rounded-xl px-1 text-left"
            @click="spuntata = !spuntata"
        >
            <span
                aria-hidden="true"
                class="flex size-5 shrink-0 items-center justify-center rounded-md border"
                :class="spuntata
                    ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-contrast)]'
                    : 'border-[var(--talos-border-strong)]'"
            >
                <Check v-if="spuntata" class="size-3.5" />
            </span>
            <span class="text-sm leading-5 text-[var(--talos-text)]">{{ testo.checkbox }}</span>
        </button>

        <p
            v-if="fallita"
            role="alert"
            data-testid="talos-npu-terms-error"
            class="text-2xs text-[var(--talos-danger)]"
        >{{ t('localModels.npuTermsSaveFailed') }}</p>

        <Button
            type="button"
            class="w-full"
            data-testid="talos-npu-terms-accept"
            :disabled="!spuntata || inCorso"
            @click="accetta"
        >{{ testo.accept }}</Button>
        <Button
            type="button"
            variant="ghost"
            class="w-full"
            data-testid="talos-npu-terms-later"
            @click="emit('decide', 'later')"
        >{{ testo.later }}</Button>
    </TalosMobileConfirmDialog>
</template>
