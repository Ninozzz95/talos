<script setup lang="ts">
/**
 * ⛔ R-M5a (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, 21/10/2026): «Notifiche da questo computer». Owner R-M5 Q3: dopo
 * l'accoppiamento, con «Prova la notifica»; la stessa riga sta nella scheda del computer. L'interruttore è quello dell'app
 * (`TalosThemedSwitch`: controllato, il nome non cambia con lo stato); lo stato si rilegge dal nativo, mai supposto.
 *
 * Ciò che non si può fare lo dice: senza Google Play services non c'è ancora una strada (R-M5b, la connessione nostra, viene dopo),
 * senza il permesso di Android si apre la sua pagina, un accoppiamento di prima senza VAPID chiede di ricollegare il computer.
 */
import { computed, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import { useComputerRemoti, type EsitoProva, type StatoNotifiche } from '@/lib/remoto/computerRemoti'
import { fraseErroreRemoto } from '@/lib/remoto/frasiRemoto'
import { openTalosAppSettings } from '@/services/devicePermissions'

const props = defineProps<{ pcId: string }>()
const { t, tTesto } = useTalosI18n()
const remoti = useComputerRemoti()

const stato = ref<StatoNotifiche | null>(null)
const occupato = ref(false)
/** La frase sotto la riga: l'esito dell'ultima azione, o perché non si può. */
const frase = ref<string | null>(null)
const permessoNegato = ref(false)

const FRASI_DEL_CODICE: Record<string, string> = {
    NOTIFICATIONS_DENIED: 'computer.notifications.denied',
    WAKE_UNAVAILABLE: 'computer.notifications.noWakeKey',
    WAKE_REGISTRATION_FAILED: 'computer.notifications.registrationFailed',
}

async function rileggi(): Promise<void> {
    if (!remoti) return
    stato.value = await remoti.notifiche(props.pcId)
}

onMounted(() => { void rileggi() })

const disponibili = computed(() => stato.value?.disponibili !== false)
/** Revisione R-M5a (14): un accoppiamento senza la chiave del PC non può accendere niente, e lo dice prima del tocco. */
const senzaChiave = computed(() => stato.value?.vapid === false && !stato.value.accese)
/** Revisione R-M5a (13): accese, ma Android non lascia mostrare notifiche a TALOS. */
const bloccateDaAndroid = computed(() => stato.value?.accese === true && !stato.value.consentite)

async function cambia(accese: boolean): Promise<void> {
    if (!remoti || occupato.value) return
    occupato.value = true
    frase.value = null
    permessoNegato.value = false
    try {
        if (accese) {
            const r = await remoti.attivaNotifiche(props.pcId)
            if (r.ok) frase.value = r.alPc ? null : t('computer.notifications.notReachedPc')
            else {
                permessoNegato.value = r.code === 'NOTIFICATIONS_DENIED'
                frase.value = t(FRASI_DEL_CODICE[r.code] ?? fraseErroreRemoto(r.code) ?? 'computer.notifications.registrationFailed')
            }
        } else {
            await remoti.disattivaNotifiche(props.pcId)
        }
    } catch {
        frase.value = t('computer.notifications.failed')
    } finally {
        await rileggi()
        occupato.value = false
    }
}

function fraseDellaProva(r: EsitoProva): string {
    switch (r.esito) {
        case 'inviata': return t('computer.notifications.sent')
        case 'troppo-presto': return tTesto('computer.notifications.tooSoon', { seconds: Math.max(1, Math.ceil((r.attendiMs ?? 10_000) / 1000)) })
        case 'senza-iscrizione': return t('computer.notifications.noSubscription')
        case 'dimenticata': return t('computer.notifications.forgotten')
        case 'non-raggiunto': return t(fraseErroreRemoto(r.code) ?? 'computer.errors.unreachable')
        default: return t('computer.notifications.failed')
    }
}

async function prova(): Promise<void> {
    if (!remoti || occupato.value) return
    occupato.value = true
    frase.value = null
    try {
        const r = await remoti.provaNotifica(props.pcId)
        frase.value = fraseDellaProva(r)
        // `dimenticata` spegne la sveglia, `senza-iscrizione` la rimette da mandare: lo stato si rilegge sempre
        await rileggi()
    } finally {
        occupato.value = false
    }
}
</script>

<template>
    <section v-if="remoti" data-testid="talos-computer-notifications" :aria-label="t('computer.notifications.label')">
        <label class="flex min-h-touch items-center justify-between gap-[var(--talos-space-control)] py-2">
            <span class="min-w-0">
                <span class="block text-sm text-[var(--talos-text)]">{{ t('computer.notifications.label') }}</span>
                <span class="block max-w-[46ch] text-xs leading-[1.6] text-[var(--talos-muted)]">{{ t('computer.notifications.hint') }}</span>
            </span>
            <TalosThemedSwitch
                :model-value="stato?.accese === true"
                :aria-label="t('computer.notifications.label')"
                :disabled="!stato || occupato || !disponibili || senzaChiave"
                test-id="talos-computer-notifications-switch"
                @update:model-value="cambia($event)"
            />
        </label>
        <p v-if="stato && !disponibili" role="status" class="max-w-[46ch] text-sm leading-[1.7] text-[var(--talos-muted)]">
            {{ t('computer.notifications.unavailable') }}
        </p>
        <p v-else-if="senzaChiave" data-testid="talos-computer-notifications-no-key" role="status" class="max-w-[46ch] text-sm leading-[1.7] text-[var(--talos-muted)]">
            {{ t('computer.notifications.noWakeKey') }}
        </p>
        <p v-else-if="stato?.accese && stato.daMandare" data-testid="talos-computer-notifications-pending" role="status" class="max-w-[46ch] text-sm leading-[1.7] text-[var(--talos-muted)]">
            {{ t('computer.notifications.pendingPc') }}
        </p>
        <template v-if="bloccateDaAndroid">
            <p data-testid="talos-computer-notifications-blocked" role="status" class="max-w-[46ch] text-sm leading-[1.7] text-[var(--talos-muted)]">
                {{ t('computer.notifications.denied') }}
            </p>
        </template>
        <Button
            v-if="stato?.accese"
            type="button"
            variant="outline"
            data-testid="talos-computer-notifications-test"
            class="talos-pressable mt-[var(--talos-space-inline)] min-h-touch"
            :disabled="occupato"
            @click="prova()"
        >
            {{ t('computer.notifications.test') }}
        </Button>
        <p v-if="frase" data-testid="talos-computer-notifications-note" role="status" class="mt-[var(--talos-space-inline)] max-w-[46ch] text-sm leading-[1.7] text-[var(--talos-muted)]">
            {{ frase }}
        </p>
        <Button
            v-if="permessoNegato || bloccateDaAndroid"
            type="button"
            variant="outline"
            data-testid="talos-computer-notifications-settings"
            class="talos-pressable mt-[var(--talos-space-inline)] min-h-touch"
            @click="openTalosAppSettings('notifications')"
        >
            {{ t('computer.notifications.openSettings') }}
        </Button>
    </section>
</template>
