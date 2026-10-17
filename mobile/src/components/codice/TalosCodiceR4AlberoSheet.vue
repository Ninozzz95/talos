<script setup lang="ts">
/**
 * ⛔ K3-C2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): «Albero della sessione», il foglio che il ⌄ del titolo apre.
 * Come nel Codice di oggi (`mobile/public/harness-ui/app.js:2288`): la sessione principale e le deleghe VERE (`GET /:id/children`);
 * toccando una delega la si apre. Niente righe inventate: senza deleghe lo si dice.
 * Pin r4 701c6c0d2 (L3-17, `rigaFiglio` del desktop): la delega si chiama col nome dell'agente (`nomeDellAgenteR4`); senza, l'id.
 */
import { onMounted, ref } from 'vue'
import { CircleCheck, GitBranch, List, LoaderCircle } from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import type { FiglioR4 } from '@/composables/useConversazioneR4'
import { nomeDellAgenteR4 } from '@/lib/harness/r4/agentiR4'
import './codiceR4.css'

const props = defineProps<{
    titolo: string
    carica: () => Promise<FiglioR4[] | null>
}>()
const emit = defineEmits<{ close: [], apri: [sessionId: string] }>()

const stato = ref<'carica' | 'pronto' | 'guasto'>('carica')
const deleghe = ref<FiglioR4[]>([])

onMounted(async () => {
    const figli = await props.carica()
    if (figli === null) stato.value = 'guasto'
    else {
        deleghe.value = figli
        stato.value = 'pronto'
    }
})
</script>

<template>
    <TalosMobileComposerSheet :title="$t('harness.r4Tree')" testid="talos-codice-r4-albero" @close="emit('close')">
        <ul class="talos-codice-r4-elenco" role="list">
            <li>
                <div class="talos-codice-r4-azione" role="group">
                    <List class="talos-codice-r4-azione-icona" aria-hidden="true" />
                    <span class="talos-codice-r4-azione-testo">
                        <strong class="truncate">{{ titolo }}</strong>
                        <small>{{ $t('harness.r4MainSession') }}</small>
                    </span>
                </div>
            </li>
            <li v-if="stato === 'carica'" class="talos-codice-r4-nota" role="status">
                <LoaderCircle class="inline size-4 animate-spin" aria-hidden="true" /> {{ $t('harness.r4Loading') }}
            </li>
            <li v-else-if="stato === 'guasto'" class="talos-codice-r4-nota" role="alert">{{ $t('harness.r4LoadFailed') }}</li>
            <li v-else-if="deleghe.length === 0" class="talos-codice-r4-nota">{{ $t('harness.r4NoDelegations') }}</li>
            <li v-for="delega in deleghe" v-else :key="delega.sessionId">
                <button
                    type="button"
                    class="talos-codice-r4-azione"
                    :data-sessione="delega.sessionId"
                    @click="emit('apri', delega.sessionId)"
                >
                    <GitBranch class="talos-codice-r4-azione-icona" aria-hidden="true" />
                    <span class="talos-codice-r4-azione-testo">
                        <strong class="truncate">{{ nomeDellAgenteR4(delega) || delega.sessionId }}</strong>
                        <small>{{ delega.conclusa ? $t('harness.r4DelegationDone') : $t('harness.r4DelegationRunning') }}</small>
                    </span>
                    <CircleCheck v-if="delega.conclusa" class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                </button>
            </li>
        </ul>
    </TalosMobileComposerSheet>
</template>
