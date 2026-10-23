<script setup lang="ts">
/**
 * Il cassetto dell'aggiornamento (owner 22/10/2026: «drawer che si alza dal basso con le novità e scegliere se riavviare»; mockup
 * https://claude.ai/artifact/4dFkSo8Dr61j1YaFikKs58, tavole 1-5 e 7). Sopra il foglio comune `TalosMobileComposerSheet`.
 *
 * Un pulsante primario per stato, e le azioni una SOTTO l'altra (regola dell'owner: mai affiancate):
 * - pronta: novità in en/it, «Riavvia ora» / «Al prossimo avvio»;
 * - con lavoro in corso, prima di riavviare: «N attività stanno lavorando» / «Riavvia lo stesso» (come il desktop);
 * - permesso una volta (tavola 3): Android vuole «Installa app sconosciute» per TALOS; tornati con il permesso, si riparte da qui;
 * - installazione: firma verificata, TALOS si chiude;
 * - aggiornata (tavola 5) e scartata (tavola 7).
 */
import { computed, ref, watch } from 'vue'
import { Check, CircleAlert, ShieldCheck } from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import { talosCurrentLocale, useTalosI18n } from '@/i18n'
import {
    talosAggiornamenti,
    talosAggiornamentoVisto,
    talosAlProssimoAvvio,
    talosApriPermessoAggiornamenti,
    talosControllaOra,
    talosRiavviaOra,
} from '@/services/appUpdates'
import { talosLavoriInCorso } from '@/lib/updates/avvioAggiornamenti'

const props = defineProps<{
    /** La chat sta scrivendo una risposta (lo sa `App.vue`); Codice e scaricamenti li conta `talosLavoriInCorso`. */
    chatAlLavoro: boolean
}>()
const emit = defineEmits<{ close: [] }>()
const { t } = useTalosI18n()

/** Quante attività «Riavvia ora» interromperebbe: chat che scrive, Codice al lavoro, scaricamento di un modello. */
const lavori = computed(() => talosLavoriInCorso({ chatAlLavoro: () => props.chatAlLavoro }))

type Vista = 'pronta' | 'conferma' | 'permesso'
const vista = ref<Vista>('pronta')
const inCorso = ref(false)
/** La persona ha chiesto di riavviare ma mancava il permesso: tornata con il permesso, si riparte da qui (tavola 3, passo 3). */
const riavvioAtteso = ref(false)

const stato = computed<'aggiornata' | 'fallita' | 'installo' | 'pronta'>(() => {
    if (talosAggiornamenti.appenaAggiornata) return 'aggiornata'
    if (talosAggiornamenti.fase === 'FALLITA') return 'fallita'
    if (talosAggiornamenti.fase === 'IN_INSTALLAZIONE') return 'installo'
    return 'pronta'
})

const versione = computed(() => talosAggiornamenti.appenaAggiornata ?? talosAggiornamenti.versione ?? '')

const novita = computed<readonly string[]>(() => {
    const note = talosAggiornamenti.note
    if (!note) return []
    return talosCurrentLocale().startsWith('it') ? note.it : note.en
})

const firmaSbagliata = computed(() => {
    const motivo = talosAggiornamenti.motivo ?? ''
    return motivo === 'firma' || motivo === 'impronta' || motivo.startsWith('manifesto') || motivo.startsWith('apk-')
        || motivo === 'versione-del-tag'
})

const ragione = computed(() => {
    switch (talosAggiornamenti.motivo) {
        case 'spazio': return t('updates.reasons.space')
        case 'conferma': return t('updates.reasons.confirm')
        case 'bloccata': return t('updates.reasons.blocked')
        default: return t('updates.reasons.other')
    }
})

const titolo = computed(() => {
    switch (stato.value) {
        case 'aggiornata': return t('updates.updatedTitle')
        case 'fallita': return t('updates.failedTitle')
        case 'installo': return t('updates.installingTitle')
        default: return vista.value === 'permesso' ? t('updates.permissionTitle') : t('updates.readyTitle')
    }
})

const avvisoLavori = computed(() => lavori.value === 1 ? t('updates.busyOne') : t('updates.busyMany', { n: lavori.value }))

async function installa(): Promise<void> {
    if (inCorso.value) return
    if (!talosAggiornamenti.permessoConcesso) {
        riavvioAtteso.value = true
        vista.value = 'permesso'
        return
    }
    inCorso.value = true
    try {
        await talosRiavviaOra()
    } finally {
        inCorso.value = false
    }
}

function riavviaOra(): void {
    if (lavori.value > 0 && vista.value !== 'conferma') {
        vista.value = 'conferma'
        return
    }
    void installa()
}

async function alProssimoAvvio(): Promise<void> {
    await talosAlProssimoAvvio()
    emit('close')
}

async function riprova(): Promise<void> {
    if (inCorso.value) return
    inCorso.value = true
    try {
        await talosControllaOra()
    } finally {
        inCorso.value = false
    }
}

function chiudi(): void {
    if (stato.value === 'aggiornata') void talosAggiornamentoVisto()
    emit('close')
}

// tornata dalle impostazioni di Android con il permesso: l'aggiornamento riparte da qui, senza un altro tocco
watch(() => talosAggiornamenti.permessoConcesso, (concesso) => {
    if (concesso && riavvioAtteso.value && vista.value === 'permesso') {
        riavvioAtteso.value = false
        vista.value = 'pronta'
        void installa()
    }
})

const primario = 'talos-pressable inline-flex min-h-touch w-full items-center justify-center rounded-full bg-[var(--talos-accent)] px-4 text-sm font-semibold text-[var(--talos-accent-contrast)] disabled:opacity-60'
const secondario = 'talos-pressable inline-flex min-h-touch w-full items-center justify-center rounded-full border border-[var(--talos-border)] px-4 text-sm font-semibold text-[var(--talos-text)]'
</script>

<template>
    <TalosMobileComposerSheet :title="titolo" testid="talos-update-sheet" @close="chiudi">
        <div class="flex flex-col gap-4 px-4 pb-4" :data-update-state="stato" :data-update-view="vista">
            <!-- aggiornata (tavola 5) -->
            <template v-if="stato === 'aggiornata'">
                <p class="flex items-center gap-2 text-base font-semibold text-[var(--talos-text)]">
                    <Check class="size-5 text-[var(--talos-accent)]" aria-hidden="true" />
                    {{ t('updates.updatedTo', { version: versione }) }}
                </p>
                <section v-if="novita.length" :aria-label="t('updates.whatsNew')">
                    <h3 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('updates.whatsNew') }}</h3>
                    <ul class="mt-2 space-y-1.5 text-sm text-[var(--talos-muted)]">
                        <li v-for="voce in novita" :key="voce" data-testid="talos-update-note">{{ voce }}</li>
                    </ul>
                </section>
                <button type="button" data-testid="talos-update-close" :class="primario" @click="chiudi">{{ t('updates.close') }}</button>
            </template>

            <!-- scartata (tavola 7) -->
            <template v-else-if="stato === 'fallita'">
                <p class="flex items-start gap-2 text-base font-semibold text-[var(--talos-text)]">
                    <CircleAlert class="mt-0.5 size-5 shrink-0 text-[var(--talos-danger)]" aria-hidden="true" />
                    {{ firmaSbagliata ? t('updates.failedSignature') : t('updates.failedOther') }}
                </p>
                <p data-testid="talos-update-failed-body" class="text-sm text-[var(--talos-muted)]">
                    {{ firmaSbagliata
                        ? t('updates.failedSignatureBody', { version: versione, installed: talosAggiornamenti.installata })
                        : t('updates.failedOtherBody', { reason: ragione, installed: talosAggiornamenti.installata }) }}
                </p>
                <div class="flex flex-col gap-2">
                    <button type="button" data-testid="talos-update-retry" :class="primario" :disabled="inCorso" @click="riprova">{{ t('updates.retry') }}</button>
                    <button type="button" data-testid="talos-update-close" :class="secondario" @click="chiudi">{{ t('updates.close') }}</button>
                </div>
            </template>

            <!-- installazione (tavola 4) -->
            <template v-else-if="stato === 'installo'">
                <p class="text-base font-semibold text-[var(--talos-text)]" role="status">{{ t('updates.installing', { version: versione }) }}</p>
                <p class="flex items-center gap-2 text-sm text-[var(--talos-text)]">
                    <ShieldCheck class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                    {{ t('updates.signatureVerified') }}
                </p>
                <p class="text-sm text-[var(--talos-muted)]">{{ t('updates.installingHint') }}</p>
            </template>

            <!-- permesso una volta (tavola 3) -->
            <template v-else-if="vista === 'permesso'">
                <p class="text-base font-semibold text-[var(--talos-text)]">{{ t('updates.permissionReady', { version: versione }) }}</p>
                <p class="text-sm text-[var(--talos-muted)]">{{ t('updates.permissionBody') }}</p>
                <ol class="space-y-2 text-sm text-[var(--talos-text)]">
                    <li v-for="(passo, indice) in [t('updates.permissionStep1'), t('updates.permissionStep2'), t('updates.permissionStep3')]" :key="indice" class="flex gap-3">
                        <span class="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--talos-border)] text-xs tabular-nums" aria-hidden="true">{{ indice + 1 }}</span>
                        <span>{{ passo }}</span>
                    </li>
                </ol>
                <p class="text-xs text-[var(--talos-muted)]">{{ t('updates.permissionSafety') }}</p>
                <div class="flex flex-col gap-2">
                    <button type="button" data-testid="talos-update-open-permission" :class="primario" @click="talosApriPermessoAggiornamenti()">{{ t('updates.openAndroidSettings') }}</button>
                    <button type="button" data-testid="talos-update-not-now" :class="secondario" @click="chiudi">{{ t('updates.notNow') }}</button>
                </div>
            </template>

            <!-- pronta (tavola 1), con la conferma se qualcosa lavora -->
            <template v-else>
                <p data-testid="talos-update-version" class="text-base font-semibold text-[var(--talos-text)]">{{ t('updates.readyVersion', { version: versione }) }}</p>
                <section v-if="novita.length" :aria-label="t('updates.whatsNew')">
                    <h3 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('updates.whatsNew') }}</h3>
                    <ul class="mt-2 space-y-1.5 text-sm text-[var(--talos-muted)]">
                        <li v-for="voce in novita" :key="voce" data-testid="talos-update-note">{{ voce }}</li>
                    </ul>
                </section>
                <a
                    v-if="talosAggiornamenti.pagina"
                    data-testid="talos-update-all-notes"
                    :href="talosAggiornamenti.pagina"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="talos-pressable inline-flex min-h-touch items-center self-start text-sm font-semibold text-[var(--talos-accent)]"
                >{{ t('updates.allNotes') }}</a>
                <p v-if="vista === 'conferma'" data-testid="talos-update-busy" class="text-sm font-medium text-[var(--talos-text)]" role="status">{{ avvisoLavori }}</p>
                <p v-else-if="talosAggiornamenti.allUscita" data-testid="talos-update-next-launch-set" class="text-sm text-[var(--talos-muted)]">{{ t('updates.nextLaunchSet') }}</p>
                <div class="flex flex-col gap-2">
                    <button type="button" data-testid="talos-update-restart" :class="primario" :disabled="inCorso" :aria-busy="inCorso || undefined" @click="riavviaOra">
                        {{ vista === 'conferma' ? t('updates.restartAnyway') : t('updates.restartNow') }}
                    </button>
                    <button v-if="!talosAggiornamenti.allUscita" type="button" data-testid="talos-update-next-launch" :class="secondario" @click="alProssimoAvvio">{{ t('updates.nextLaunch') }}</button>
                </div>
                <p class="text-xs text-[var(--talos-muted)]">{{ t('updates.restartHint') }}</p>
            </template>
        </div>
    </TalosMobileComposerSheet>
</template>
