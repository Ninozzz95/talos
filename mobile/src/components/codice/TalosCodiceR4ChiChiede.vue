<script setup lang="ts">
/**
 * K3-AP3 (ledger `LEDGER-K3-FIGLIE-2026-10-16.md`): la riga «L'agente «…» chiede» in testa alla carta di una sotto-sessione disegnata
 * nella madre (`creaChiChiede`, `legacy/app.js:15330`): icona degli agenti, frase spezzata attorno al nome, nome accorciato con
 * l'intero nel suggerimento. Owner 16/10 «link discreto»: il nome apre la sotto-sessione (Codex lo fa col tasto `o`); senza nome è
 * la frase intera ad aprirla.
 */
import { computed, inject } from 'vue'
import { Bot } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import type { FigliaR4 } from '@/lib/harness/r4/approvazioneChiave'
import { TALOS_APPROVAZIONI_R4 } from '@/lib/harness/r4/approvazioniPonte'
import { chiChiedeR4 } from '@/lib/harness/r4/approvazioniR4'

const props = defineProps<{ figlia: FigliaR4 }>()
const ponte = inject(TALOS_APPROVAZIONI_R4, null)
const { locale } = useTalosI18n()
const frase = computed(() => chiChiedeR4(props.figlia.chi, locale.value))
const apri = () => ponte?.apriFiglia(props.figlia.sessionId)
</script>

<template>
    <p data-parte="chi" class="talos-codice-r4-chi mb-1 flex min-w-0 items-center gap-1.5 text-2xs leading-4 text-[var(--talos-muted)]">
        <Bot class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="min-w-0">
            <template v-if="frase.nome">{{ frase.prima }}<button
                type="button"
                data-parte="apri-figlia"
                class="talos-codice-r4-chi__nome"
                :title="frase.nome"
                @click="apri"
            ><span class="talos-codice-r4-chi__testo">{{ frase.nome }}</span></button>{{ frase.dopo }}</template>
            <button v-else type="button" data-parte="apri-figlia" class="talos-codice-r4-chi__nome" @click="apri">{{ frase.prima }}</button>
        </span>
    </p>
</template>
