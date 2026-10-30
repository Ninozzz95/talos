<script setup lang="ts">
/**
 * «Ferma tutto» (owner 29/10/2026): il CORPO del foglio che lo Stop apre quando sotto la chat lavorano degli agenti. PEZZO VERO: va in
 * `src/components/codice/TalosCodiceR4FermaTuttoScelte.vue`; nell'app lo monta `TalosCodiceR4FermaTuttoSheet.vue` dentro il foglio del
 * telefono (`TalosMobileComposerSheet`, il titolo è lì), nel mockup la copia del foglio senza Teleport (`../FoglioCopia.vue`).
 * ⛔ Nessun pezzo nuovo (owner 29/10: «mai inventare UI», «niente grammatica desktop sul mobile»):
 *   · i due pulsanti = quelli del foglio del consenso agli strumenti, la principale piena (`TalosMobileToolConsentSheet.vue:341-346`,
 *     «Consenti questa volta») e l'altra col bordo (`:335-340`, «Nega»), a tutta larghezza, uno sotto l'altro;
 *   · la riga d'aiuto sotto ciascuno = la nota del consenso (`:292-294`, `text-2xs leading-4` grigia);
 *   · «Ricorda la scelta» = la casella della carta delle domande a scelta multipla (`TalosCodiceR4Domanda.vue:256-272`: `role="checkbox"`,
 *     segno quadro e ✓), con le sue classi di `codiceR4.css:316-349`.
 * Un tocco su una scelta la manda subito (come il foglio del consenso: niente «Conferma»); la ✕ del foglio = annulla, nessuno si ferma.
 */
import { computed, ref } from 'vue'
import { Check } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useTalosI18n } from '@/i18n'
import { testoFermaTuttoR4, type SceltaStopR4 } from '@/lib/harness/r4/fermaTuttoR4'
import '@/components/codice/codiceR4.css'

const props = defineProps<{ quante: number; occupato?: boolean }>()
const emit = defineEmits<{ scegli: [scelta: SceltaStopR4, ricorda: boolean] }>()
const { locale } = useTalosI18n()
const tr = (k: Parameters<typeof testoFermaTuttoR4>[0]) => testoFermaTuttoR4(k, locale.value, props.quante)
const ricorda = ref(false)
const aiutoTutto = computed(() => tr('foglio.tuttoAiuto'))
</script>

<template>
    <div data-testid="talos-codice-r4-ferma-tutto" class="flex flex-col gap-3 pb-1">
        <div>
            <Button
                type="button"
                data-testid="talos-codice-r4-ferma-tutto-tutte"
                :disabled="occupato"
                :aria-describedby="'talos-ferma-tutto-aiuto-tutte'"
                class="talos-pressable min-h-touch w-full rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                @click="emit('scegli', 'tutte', ricorda)"
            >{{ tr('foglio.tutto') }}</Button>
            <p id="talos-ferma-tutto-aiuto-tutte" class="mt-1 px-3 text-2xs leading-4 text-[var(--talos-muted)]">{{ aiutoTutto }}</p>
        </div>
        <div>
            <Button
                type="button"
                data-testid="talos-codice-r4-ferma-tutto-solo-chat"
                :disabled="occupato"
                :aria-describedby="'talos-ferma-tutto-aiuto-solo-chat'"
                class="talos-pressable min-h-touch w-full rounded-full border border-[var(--talos-border)] bg-transparent text-sm text-[var(--talos-text)]"
                @click="emit('scegli', 'solo-chat', ricorda)"
            >{{ tr('foglio.soloChat') }}</Button>
            <p id="talos-ferma-tutto-aiuto-solo-chat" class="mt-1 px-3 text-2xs leading-4 text-[var(--talos-muted)]">{{ tr('foglio.soloChatAiuto') }}</p>
        </div>
        <button
            type="button"
            role="checkbox"
            data-testid="talos-codice-r4-ferma-tutto-ricorda"
            :aria-checked="ricorda ? 'true' : 'false'"
            :disabled="occupato"
            class="talos-codice-r4-domanda__opzione"
            @click="ricorda = !ricorda"
        >
            <span class="talos-codice-r4-domanda__segno" data-forma="quadro" aria-hidden="true">
                <Check v-if="ricorda" class="size-3" />
            </span>
            <span class="min-w-0 flex-1 text-left text-sm leading-5">{{ tr('foglio.ricorda') }}</span>
        </button>
    </div>
</template>
