<script setup lang="ts">
/**
 * ⛔ K3-C3a: «Rinomina» dalla tavolozza dei comandi del Codice su r4. Il campo parte dal nome di adesso; «Salva» vale solo per un
 * nome nuovo e non vuoto. Il nome lo salva r4 (`POST /:id/rename {nome}`), chi monta il foglio lo manda.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import './codiceR4.css'

const props = defineProps<{ titolo: string }>()
const emit = defineEmits<{ close: [], salva: [nome: string] }>()

const nome = ref(props.titolo)
const campo = ref<HTMLInputElement | null>(null)
const puoSalvare = computed(() => nome.value.trim().length > 0 && nome.value.trim() !== props.titolo.trim())

function salva(): void {
    if (puoSalvare.value) emit('salva', nome.value.trim())
}

onMounted(() => { void nextTick(() => { campo.value?.focus(); campo.value?.select() }) })
</script>

<template>
    <TalosMobileComposerSheet :title="$t('harness.r4RenameTitle')" testid="talos-codice-r4-rinomina" @close="emit('close')">
        <form class="flex items-center gap-2 px-3 pb-3" @submit.prevent="salva">
            <input
                ref="campo"
                v-model="nome"
                type="text"
                data-testid="talos-codice-r4-rinomina-campo"
                class="talos-codice-r4-campo"
                :aria-label="$t('harness.r4RenameField')"
                maxlength="200"
                autocomplete="off"
                enterkeyhint="done"
            >
            <button
                type="submit"
                data-testid="talos-codice-r4-rinomina-salva"
                class="talos-pressable min-h-touch shrink-0 rounded-full bg-[var(--talos-accent)] px-4 text-sm font-medium text-[var(--talos-accent-text)] disabled:opacity-50"
                :disabled="!puoSalvare"
            >{{ $t('harness.r4RenameSave') }}</button>
        </form>
    </TalosMobileComposerSheet>
</template>
