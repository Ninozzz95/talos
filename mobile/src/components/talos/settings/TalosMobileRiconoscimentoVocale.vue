<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { useTalosI18n } from '@/i18n'
import { TALOS_MODELLO_PARAKEET } from '@/lib/voice/modelloParakeet'
import type { TalosAsrInstallProgress } from '@/services/asrModelInstall'

/**
 * N12 — «Riconoscimento vocale sul dispositivo» nelle Impostazioni della voce: scaricare o togliere il modello che dà alla
 * dettatura il testo finale (Parakeet). Decisioni dell'owner del 12/10/2026: modello scaricato al primo uso (~670 MB),
 * il riconoscitore di oggi resta come riserva.
 *
 * ⛔ Dice solo cose vere: «pronto» quando il motore lo conferma (file e impronte), il progresso quello del trasferimento, e
 * il costo in chiaro — spazio e memoria. ⛔ Azioni una sotto l'altra, mai affiancate.
 *
 * Il servizio arriva come proprietà solo per le prove; di serie si carica a richiesta (niente nel pacchetto d'avvio).
 */
interface Servizio {
    pronto(): Promise<boolean>
    installa(onProgress: (p: TalosAsrInstallProgress) => void): Promise<{ ok: true } | { ok: false, motivo: string }>
    rimuovi(): Promise<number>
}
const props = withDefaults(defineProps<{ servizio?: Servizio }>(), { servizio: undefined })
const { t, locale } = useTalosI18n()

async function servizio(): Promise<Servizio> {
    if (props.servizio) return props.servizio
    const m = await import('@/services/asrModelInstall')
    return { pronto: m.talosModelloVocalePronto, installa: m.talosInstallaModelloVocale, rimuovi: m.talosRimuoviModelloVocale }
}

const pronto = ref<boolean | null>(null)
const progresso = ref<TalosAsrInstallProgress | null>(null)
const chiedeConferma = ref(false)
const inCorso = computed(() => ['avvio', 'scarico', 'verifica'].includes(progresso.value?.fase ?? ''))
const percento = computed(() => {
    const p = progresso.value
    return p?.fase === 'scarico' && p.totali > 0 ? Math.min(100, Math.floor((p.fatti / p.totali) * 100)) : 0
})
const megabyte = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 0 }).format(Math.round(TALOS_MODELLO_PARAKEET.byteTotali / 1e6)))

async function rileggi(): Promise<void> {
    try { pronto.value = await (await servizio()).pronto() } catch { pronto.value = false }
}
onMounted(rileggi)

async function scarica(): Promise<void> {
    if (inCorso.value) return
    progresso.value = { fase: 'avvio' }
    try {
        const esito = await (await servizio()).installa((p) => { progresso.value = p })
        progresso.value = esito.ok ? null : { fase: 'fallito', motivo: esito.motivo }
    } catch (guasto) {
        progresso.value = { fase: 'fallito', motivo: guasto instanceof Error ? guasto.message : 'unavailable' }
    }
    await rileggi()
}

async function rimuovi(): Promise<void> {
    chiedeConferma.value = false
    try { await (await servizio()).rimuovi() } catch { /* lo stato riletto dice la verità */ }
    progresso.value = null
    await rileggi()
}
</script>

<template>
    <div data-testid="talos-voice-recognition" class="mt-4 border-t border-[var(--talos-border)] pt-3">
        <p class="text-sm font-semibold text-[var(--talos-text)]">{{ t('voiceRecognition.title') }}</p>
        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ t('voiceRecognition.body') }}</p>
        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ t('voiceRecognition.cost', { size: megabyte }) }}</p>

        <p data-testid="talos-voice-recognition-status" role="status" class="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[var(--talos-surface-2)] px-2 py-0.5 text-xs text-[var(--talos-text)]">
            <span class="size-1.5 rounded-full" :class="pronto ? 'bg-[var(--talos-success)]' : 'bg-[var(--talos-muted)]'" aria-hidden="true" />
            {{ pronto ? t('voiceRecognition.ready') : t('voiceRecognition.notInstalled') }}
        </p>

        <template v-if="pronto && chiedeConferma">
            <div data-testid="talos-voice-recognition-confirm" class="mt-3 flex flex-col gap-[var(--talos-space-control)]">
                <p class="text-sm text-[var(--talos-text)]">{{ t('voiceRecognition.removeBody', { size: megabyte }) }}</p>
                <Button data-testid="talos-voice-recognition-remove-yes" variant="destructive" class="min-h-touch w-full" @click="rimuovi">{{ t('voiceRecognition.removeYes') }}</Button>
                <Button data-testid="talos-voice-recognition-remove-no" variant="outline" class="min-h-touch w-full" @click="chiedeConferma = false">{{ t('voiceRecognition.removeNo') }}</Button>
            </div>
        </template>
        <Button
            v-else-if="pronto" data-testid="talos-voice-recognition-remove" variant="ghost"
            class="talos-pressable mt-3 min-h-touch w-full justify-center text-[var(--talos-muted)]" @click="chiedeConferma = true"
        >{{ t('voiceRecognition.remove') }}</Button>
        <template v-else-if="pronto === false">
            <Button
                data-testid="talos-voice-recognition-download" class="talos-pressable mt-3 min-h-touch w-full rounded-xl"
                :disabled="inCorso" @click="scarica"
            >{{ inCorso ? t('voiceRecognition.downloading') : t('voiceRecognition.download', { size: megabyte }) }}</Button>
            <p v-if="progresso?.fase === 'scarico'" data-testid="talos-voice-recognition-progress" role="status" class="mt-2 text-xs text-[var(--talos-muted)]">
                {{ t('voiceRecognition.progress', { percent: percento }) }}
            </p>
            <p v-else-if="progresso?.fase === 'verifica'" role="status" class="mt-2 text-xs text-[var(--talos-muted)]">{{ t('voiceRecognition.verifying') }}</p>
            <p v-else-if="progresso?.fase === 'fallito'" data-testid="talos-voice-recognition-error" role="alert" class="mt-2 text-xs text-[var(--talos-danger)]">
                {{ t('voiceRecognition.failed', { reason: progresso.motivo }) }}
            </p>
        </template>
    </div>
</template>
