<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { CircleAlert, CircleCheck, CircleDashed, ShieldCheck } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
    talosBackgroundExtraSteps,
    talosPermissionAction,
    talosPermissionStateTranslationKey,
    talosOnboardingPermissionRows,
    visibleTalosPermissionRows,
    type TalosPermissionRow,
    type TalosPermissionState,
} from '@/lib/permissions/permissionRows'
import {
    openTalosAppSettings,
    readTalosDeviceState,
    requestTalosMicrophone,
    requestTalosBatteryExemption,
    requestTalosNotifications,
    requestTalosRuntimePermission,
    type TalosDeviceState,
} from '@/services/devicePermissions'

/**
 * What TALOS can ask this device for, why, and where it stands.
 *
 * NOT a copy of the Android permission page. Google's own settings guidance is
 * "avoid replicating preferences available at the device settings level", and
 * of twelve open-source apps surveyed not one ships a management clone — the OS
 * is always the final word, and a second set of switches pretending otherwise
 * is a lie waiting to happen. This screen explains and diagnoses: why each
 * permission exists, the boundary of what TALOS does with it, and a way out to
 * the setting that governs it once asking is no longer possible.
 */
const props = withDefaults(defineProps<{ onboarding?: boolean }>(), {
    onboarding: false,
})

const device = ref<TalosDeviceState>({
    microphone: 'prompt',
    notifications: 'prompt',
    notificationsRuntime: false,
    biometricHardware: false,
    accessibilityEnabled: false,
    // Falso finché non l'abbiamo chiesto al sistema: la riga dirà «da
    // sistemare» per un istante e poi la verità, che è meglio del contrario.
    batteryExempt: false,
    manufacturer: '',
    brand: '',
    // Vuota finché il sistema non risponde: una riga senza stato tace, e non
    // dice «non richiesto» a un permesso che magari c'è.
    runtime: {},
})
const { t } = useTalosI18n()
const busy = ref<string | null>(null)

const rows = computed(() => {
    const visible = visibleTalosPermissionRows({
        // Below Android 13 there is no notification permission to show at all.
        notifications: device.value.notificationsRuntime,
        biometricHardware: device.value.biometricHardware,
    })
    return props.onboarding ? talosOnboardingPermissionRows(visible) : visible
})

function stateOf(row: TalosPermissionRow): TalosPermissionState | null {
    if (row.id === 'microphone') return device.value.microphone
    if (row.id === 'notifications') return device.value.notifications
    if (row.id === 'accessibility') return device.value.accessibilityEnabled ? 'granted' : 'not-enabled'
    /*
     * ⭐⭐ LE QUATTRO RIGHE CHE NON DICEVANO SE ERANO CONCESSE — 2026-08-14.
     *
     * Contatti, Calendario, Conteggio della posta e Fotocamera comparivano con
     * un cerchio vuoto e nient'altro: né stato, né pulsante. È il difetto
     * peggiore che una pagina di permessi possa avere, perché la domanda per
     * cui una persona la apre è esattamente quella: «ce l'ha, o no?».
     *
     * ⛔ `?? null` e non `?? 'prompt'`: se il sistema non ha risposto, la riga
     * torna a TACERE. Dire «non richiesto» quando non lo sappiamo è inventare
     * un fatto, e su questa pagina un fatto inventato vale doppio.
     */
    const runtime = device.value.runtime[row.id]
    if (runtime !== undefined) return runtime
    /**
     * La riga che prima non aveva stato NE pulsante.
     *
     * Si diceva concessa all'installazione e non toglibile — tre affermazioni
     * false su tre — e quindi non mostrava niente su cui agire. E' l'esenzione
     * dal risparmio energetico: o c'e' o non c'e', e quando non c'e' si puo'
     * chiedere, quindi entra nella stessa macchina a stati delle altre.
     */
    if (row.id === 'background') return device.value.batteryExempt ? 'granted' : 'prompt'
    return null
}

/**
 * I passi che Android non sa fare da solo, mostrati solo finche' servono.
 *
 * Spariscono appena l'esenzione c'e': una lista di istruzioni sopra una cosa
 * gia' sistemata e' rumore, e insegna a scorrere oltre proprio la sezione che
 * un giorno tornera' a servire — su ColorOS l'impostazione si riazzera da sola.
 */
const backgroundSteps = computed(() => (device.value.batteryExempt
    ? []
    : talosBackgroundExtraSteps(device.value)))
function rowTitle(row: TalosPermissionRow): string {
    return t(`privacyPermissions.rows.${row.id}.title`)
}
function rowPurpose(row: TalosPermissionRow): string {
    return t(`privacyPermissions.rows.${row.id}.purpose`)
}

/**
 * ⭐⭐ COSA DICE UNA RIGA CHE NON HA UNO STATO DA LEGGERE — 2026-08-16.
 *
 * MISURATO sul Pad: «Dove ti trovi» e «File scelti da te» non dicevano niente,
 * né a schermo né nel nome accessibile. Le altre otto dicevano «Consentito», e
 * l'unica differenza era un cerchietto tratteggiato: l'ASSENZA di una parola
 * faceva il lavoro di una parola. È lo stesso difetto del 14 agosto, quando
 * quattro righe comparivano con un cerchio vuoto e nient'altro.
 *
 * Per la posizione la causa era nel nativo — il plugin non la raccontava, ed è
 * stata aggiunta. Ma restano righe che uno stato **non ce l'hanno per natura**:
 *
 *     kind 'none'    → non è un permesso. I file si concedono SCEGLIENDOLI nel
 *                      selettore di sistema; il blocco app, il controllo del
 *                      telefono e i modelli locali non chiedono niente a nessuno.
 *     kind 'install' → concesso all'installazione, non revocabile.
 *
 * ⛔ E resta il caso in cui lo stato è ignoto perché il sistema non ha ancora
 * risposto: lì si TACE, ed è voluto. Dire «non richiesto» quando non lo
 * sappiamo è inventare un fatto, e su questa pagina un fatto inventato vale
 * doppio. Per questo la funzione torna `null` invece di una frase generica.
 */
function etichettaSenzaStato(row: TalosPermissionRow): string | null {
    if (row.kind === 'install') return t('privacyPermissions.grantedAtInstall')
    if (row.kind === 'none') return t('privacyPermissions.nothingToGrant')
    return null
}

/** Ciò che una riga dice di sé: lo stato se c'è, altrimenti la sua natura. */
function etichettaDellaRiga(row: TalosPermissionRow): string | null {
    const stato = stateOf(row)
    return stato ? permissionLabel(stato) : etichettaSenzaStato(row)
}
function permissionLabel(state: TalosPermissionState): string {
    return t(`privacyPermissions.states.${talosPermissionStateTranslationKey(state)}`)
}

/**
 * Re-read on every return to the app.
 *
 * Android resets permissions for apps left unused for a few months, and the
 * user can revoke one in system settings at any moment. A remembered value
 * would confidently say "Allowed" for something taken away last week.
 */
async function refresh(): Promise<void> {
    device.value = await readTalosDeviceState()
}

function onVisible(): void {
    if (document.visibilityState === 'visible') void refresh()
}

async function act(row: TalosPermissionRow): Promise<void> {
    const state = stateOf(row)
    if (state === null) return
    busy.value = row.id
    try {
        if (row.id === 'accessibility') {
            const { talosApriImpostazioniDaScheda } = await import('@/lib/tools/schedaComandi')
            await talosApriImpostazioniDaScheda('android.settings.ACCESSIBILITY_SETTINGS')
            return
        }
        if (talosPermissionAction(state) === 'settings') {
            await openTalosAppSettings(row.id === 'notifications' ? 'notifications' : 'app')
            return
        }
        if (row.id === 'microphone') await requestTalosMicrophone()
        if (row.id === 'notifications') await requestTalosNotifications()
        if (row.id === 'background') await requestTalosBatteryExemption()
        /*
         * ⭐ Le quattro si CHIEDONO col dialogo di sistema — un tocco — invece
         * di mandare la persona a cercare un interruttore. Le Impostazioni
         * restano per quando il dialogo non può più comparire, e quel caso lo
         * decide `talosPermissionAction` qui sopra, non un'ipotesi.
         */
        if (device.value.runtime[row.id] !== undefined) {
            await requestTalosRuntimePermission(row.id)
        }
        await refresh()
    } finally {
        busy.value = null
    }
}

onMounted(() => {
    void refresh()
    document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
</script>

<template>
    <section data-testid="talos-settings-privacy" class="flex flex-col gap-3">
        <p class="flex items-start gap-2 text-xs leading-5 text-[var(--talos-muted)]">
            <ShieldCheck class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            {{ t('privacyPermissions.intro') }}
        </p>

        <div
            v-for="row in rows"
            :key="row.id"
            :data-permission-row="row.id"
            class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
            role="group"
            :aria-label="etichettaDellaRiga(row) ? `${rowTitle(row)}, ${etichettaDellaRiga(row)}` : rowTitle(row)"
        >
            <div class="flex items-center gap-2">
                <CircleCheck
                    v-if="stateOf(row) === 'granted'"
                    class="size-4 shrink-0 text-[var(--talos-success,#3f9d6b)]"
                    aria-hidden="true"
                />
                <CircleAlert
                    v-else-if="stateOf(row) === 'denied'"
                    class="size-4 shrink-0 text-[var(--talos-danger,#dc5b5b)]"
                    aria-hidden="true"
                />
                <CircleDashed v-else class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                <span class="text-sm font-semibold text-[var(--talos-text)]">{{ rowTitle(row) }}</span>
                <!-- The state is TEXT, not colour alone: a badge nobody can read
                     is not a state, and a screen reader gets it from the group's
                     own label. -->
                <span
                    v-if="etichettaDellaRiga(row)"
                    class="ml-auto text-2xs uppercase tracking-wide text-[var(--talos-muted)]"
                    :aria-live="stateOf(row) ? 'polite' : undefined"
                >{{ etichettaDellaRiga(row) }}</span>
            </div>

            <p class="mt-1.5 text-xs leading-5 text-[var(--talos-muted)]">{{ rowPurpose(row) }}</p>

            <!-- Past a permanent denial the system dialog never opens again, so
                 the only honest button is the one that goes to the setting — with
                 the steps, because no API can deep-link a single toggle. -->
            <template v-if="stateOf(row) === 'denied'">
                <p class="mt-2 text-2xs leading-4 text-[var(--talos-muted)]">
                    {{ t('privacyPermissions.allowSteps', { permission: rowTitle(row) }) }}
                </p>
                <Button
                    type="button"
                    variant="outline"
                    data-testid="talos-permission-settings"
                    class="mt-2 min-h-touch w-full rounded-xl text-sm"
                    :disabled="busy === row.id"
                    @click="act(row)"
                >{{ t('privacyPermissions.openSystemSettings') }}</Button>
            </template>
            <Button
                v-else-if="stateOf(row) === 'not-enabled'"
                type="button"
                variant="outline"
                data-testid="talos-permission-accessibility-settings"
                class="mt-2 min-h-touch w-full rounded-xl text-sm"
                :disabled="busy === row.id"
                @click="act(row)"
            >{{ t('privacyPermissions.openAccessibilitySettings') }}</Button>
            <Button
                v-else-if="stateOf(row) && talosPermissionAction(stateOf(row)!) === 'request'"
                type="button"
                variant="outline"
                data-testid="talos-permission-allow"
                class="mt-2 min-h-touch w-full rounded-xl text-sm"
                :disabled="busy === row.id"
                @click="act(row)"
            >{{ t('privacyPermissions.allow') }}</Button>

            <!--
                I passi che Android non sa fare da solo.

                Solo sotto la riga del background, solo finché serve, e solo per
                i produttori di cui abbiamo una fonte. Istruzioni e non
                scorciatoie: i nomi dei componenti OEM cambiano fra una versione
                e l'altra, e un collegamento profondo che atterra sulla
                schermata sbagliata è peggio di una frase che dice dove andare.
            -->
            <template v-if="row.id === 'background' && backgroundSteps.length">
                <p class="mt-2 text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                    {{ t('privacyPermissions.makerStepsTitle') }}
                </p>
                <ol data-testid="talos-permission-maker-steps" class="mt-1 flex list-decimal flex-col gap-1 pl-4">
                    <li v-for="stepKey in backgroundSteps" :key="stepKey" class="text-2xs leading-4 text-[var(--talos-muted)]">
                        {{ t(stepKey) }}
                    </li>
                </ol>
            </template>
        </div>
    </section>
</template>
