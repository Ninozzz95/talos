<script setup lang="ts">
import { useTalosI18n } from '@/i18n'
import TalosMobileRunningToolRow from '@/components/chat/TalosMobileRunningToolRow.vue'
import type { TalosBozzaAttrezzo } from '@/lib/chat/providerContracts'
import { talosParolaAttrezzo } from '@/lib/chat/parolaAttrezzo'
import { talosToolActivityLabel, talosToolIconName } from '@/lib/tools/toolLabels'
import { TALOS_TOOL_ICONS } from '@/lib/tools/toolIcons'

/**
 * ⛔ Owner 20/10/2026 (difetto 1 delle righe degli attrezzi): l'attrezzo che il modello sta SCRIVENDO, prima che il giro parta.
 *
 * Dal Pad, piano ChatGPT: per 52 s «Cerco come si fa…» mentre il modello scriveva già il documento negli argomenti. Qui la riga
 * dice quell'attrezzo appena il nome arriva, con quanto è cresciuto e da quanto. Sta dopo la coda della risposta: è lì che
 * comparirà la riga vera quando il giro parte (il testo arrivato prima le passa sopra). Hermes fa lo stesso
 * (`hermes_cli/cli_stream_mixin.py:646`, «so a large payload … doesn't look like a frozen screen»).
 *
 * Caricato a richiesta, come le altre righe del giro.
 */
const props = defineProps<{ bozze: readonly TalosBozzaAttrezzo[] }>()
const { t, locale } = useTalosI18n()

function riga(bozza: TalosBozzaAttrezzo) {
    return {
        label: talosToolActivityLabel({ name: bozza.name, detail: null }, talosParolaAttrezzo(bozza.name, t, locale.value)),
        icon: TALOS_TOOL_ICONS[talosToolIconName(bozza.name)],
    }
}

/** I caratteri degli argomenti in KB, con un decimale; a zero non c'è niente da dire. */
function crescita(caratteri: number): string | undefined {
    if (!(caratteri > 0)) return undefined
    const size = new Intl.NumberFormat(locale.value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        .format(Math.max(0.1, caratteri / 1024))
    return t('chat.toolDraftSize', { size })
}
</script>

<template>
    <div class="mb-0.5" data-testid="talos-tool-draft">
        <!-- La chiave è la posizione e il nome: l'orologio parte quando il modello comincia QUESTA chiamata. -->
        <TalosMobileRunningToolRow
            v-for="(bozza, posizione) in props.bozze"
            :key="`${posizione}:${bozza.name}`"
            :label="riga(bozza).label"
            :progress="crescita(bozza.caratteri)"
        >
            <template #icon>
                <component :is="riga(bozza).icon" class="size-3.5" />
            </template>
        </TalosMobileRunningToolRow>
    </div>
</template>
