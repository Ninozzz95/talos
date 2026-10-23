<script setup lang="ts">
/**
 * ⛔ K3-C2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): «Hook del progetto». Come nel Codice di oggi
 * (`mobile/public/harness-ui/app.js:1677`): gli hook dichiarati nel progetto (`GET /:id/hooks`), con «Fida» per quelli non ancora
 * fidati (`POST /:id/hooks/:id/trust`). Doctor non è qui: il suo contratto su r4 è chiesto a Nino1 (15/10).
 */
import { onMounted, ref } from 'vue'
import { LoaderCircle, Zap } from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import type { HookDelProgettoR4 } from '@/composables/useConversazioneR4'
import './codiceR4.css'

const props = defineProps<{
    carica: () => Promise<HookDelProgettoR4 | null>
    fida: (id: string) => Promise<boolean>
    /** ⛔ RA-11 (revisione avversariale R-M4, 21/10/2026): sulla sessione di un PC un hook si fida dal PC; «Fida» spento, col perché. */
    soloDalPc?: string
}>()
const emit = defineEmits<{ close: [] }>()

const stato = ref<'carica' | 'pronto' | 'guasto'>('carica')
const dati = ref<HookDelProgettoR4>({ hooks: [], errore: null })
const inCorso = ref<string | null>(null)

async function ricarica(): Promise<void> {
    const risposta = await props.carica()
    if (risposta === null) {
        stato.value = 'guasto'
        return
    }
    dati.value = risposta
    stato.value = 'pronto'
}

async function fidati(id: string): Promise<void> {
    if (inCorso.value) return
    inCorso.value = id
    try {
        if (await props.fida(id)) await ricarica()
    } finally {
        inCorso.value = null
    }
}

onMounted(ricarica)
</script>

<template>
    <TalosMobileComposerSheet :title="$t('harness.r4Hooks')" testid="talos-codice-r4-hook-foglio" @close="emit('close')">
        <ul class="talos-codice-r4-elenco" role="list">
            <li v-if="stato === 'carica'" class="talos-codice-r4-nota" role="status">
                <LoaderCircle class="inline size-4 animate-spin" aria-hidden="true" /> {{ $t('harness.r4Loading') }}
            </li>
            <li v-else-if="stato === 'guasto'" class="talos-codice-r4-nota" role="alert">{{ $t('harness.r4LoadFailed') }}</li>
            <li v-else-if="dati.errore" class="talos-codice-r4-nota" role="alert">{{ $t('harness.r4HooksInvalid', { reason: dati.errore }) }}</li>
            <li v-else-if="dati.hooks.length === 0" class="talos-codice-r4-nota">{{ $t('harness.r4NoHooks') }}</li>
            <li v-for="voce in dati.hooks" v-else :key="voce.id">
                <div class="talos-codice-r4-azione" role="group" :data-hook="voce.id">
                    <Zap class="talos-codice-r4-azione-icona" aria-hidden="true" />
                    <span class="talos-codice-r4-azione-testo">
                        <strong class="truncate">{{ voce.id }}</strong>
                        <small>{{ voce.eventi.join(', ') }}</small>
                    </span>
                    <span v-if="voce.fidato" class="shrink-0 text-xs text-[var(--talos-muted)]">{{ $t('harness.r4HookActive') }}</span>
                    <button
                        v-else
                        type="button"
                        class="talos-pressable min-h-touch shrink-0 rounded-full border border-[var(--talos-border)] px-3 text-sm text-[var(--talos-text)]"
                        :disabled="inCorso !== null || Boolean(soloDalPc)"
                        @click="fidati(voce.id)"
                    >{{ soloDalPc || (inCorso === voce.id ? $t('harness.r4HookTrusting') : $t('harness.r4HookTrust')) }}</button>
                </div>
            </li>
        </ul>
    </TalosMobileComposerSheet>
</template>
