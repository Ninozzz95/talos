<script setup lang="ts">
/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M3: il dettaglio di un computer collegato (mockup v5: Stato, Percorso, Collegato,
 * «Dimentica questo computer»). Lo stato è quello VERO di adesso — `controlla` collega, manda un ping, legge il percorso e chiude —
 * mai un «in linea» supposto. «Dimentica» cancella dal telefono le chiavi di quel computer, con conferma.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobilePageHeader from '@/components/talos/ui/TalosMobilePageHeader.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosComputerNotifiche from '@/components/remoto/TalosComputerNotifiche.vue'
import { ATTESA_CONTROLLO_MS, useComputerRemoti, type CartellaDelPc, type StatoDelComputer } from '@/lib/remoto/computerRemoti'
import type { TalosRigaSessioneR4 } from '@/lib/harness/r4/elencoSessioniR4'
import { ChevronRight, Code2, Plus } from '@lucide/vue'
import { fraseErroreRemoto } from '@/lib/remoto/frasiRemoto'
import { talosNotify } from '@/stores/notificationCentre'

// `tTesto` per i testi con date e nomi messi con `{{ }}`: senza, la «/» di una data diventava «&#x2F;» (dal Pad, 20/10/2026).
const { t, tTesto, locale } = useTalosI18n()
const route = useRoute()
const router = useRouter()
const remoti = useComputerRemoti()

const pcId = computed(() => String(route.params.pcId ?? ''))
const caricato = ref(false)
const pc = computed(() => remoti?.elenco.value.find((c) => c.pcId === pcId.value) ?? null)
const stato = ref<StatoDelComputer | null>(null)
const controllo = ref(false)
const conferma = ref(false)
const dimenticando = ref(false)

const nome = computed(() => pc.value?.nome || t('computer.unnamed'))

/** R-M4: le sessioni del PC, lette quando è in linea; una si apre nella schermata del Codice sul canale remoto. */
const sessioniPc = ref<TalosRigaSessioneR4[] | null>(null)
/**
 * ⛔ RA-12 (revisione avversariale R-M4, 21/10/2026): un elenco che non si legge diventava `[]` e la pagina diceva «Su questo computer
 * non ci sono ancora sessioni», falso. Ora la frase del guasto (`fraseErroreRemoto`, come il resto della pagina) e «Riprova».
 */
const erroreSessioni = ref<string | null>(null)
/**
 * ⛔ RA-12: `sessioni()` e `cartelle()` aprono il ponte senza tetto (`ATTESA_CONTROLLO_MS` vale per `controlla`): un PC che non
 * risponde lasciava «Nuova sessione» spento per sempre. Qui lo stesso tetto; scaduto, il codice `TIMEOUT` con la sua frase.
 */
async function entroIlTetto<T>(lavoro: Promise<T>): Promise<T | { ok: false, code: 'TIMEOUT' }> {
    let tetto: ReturnType<typeof setTimeout> | undefined
    const scaduto = new Promise<{ ok: false, code: 'TIMEOUT' }>((fatto) => {
        tetto = setTimeout(() => fatto({ ok: false, code: 'TIMEOUT' }), ATTESA_CONTROLLO_MS)
    })
    try {
        return await Promise.race([lavoro, scaduto])
    } finally {
        clearTimeout(tetto)
    }
}
const fraseDelGuasto = (code: string) => (code === 'TIMEOUT' ? 'computer.errors.timeout' : fraseErroreRemoto(code) ?? 'computer.errors.unreachable')
/** «Riprova» sparisce al tocco (la frase del guasto si azzera subito): un secondo tocco non apre una seconda lettura. */
async function leggiSessioni(): Promise<void> {
    if (!remoti) return
    erroreSessioni.value = null
    const esito = await entroIlTetto(remoti.sessioni(pcId.value))
    sessioniPc.value = esito.ok ? esito.righe : null
    if (!esito.ok) erroreSessioni.value = fraseDelGuasto(esito.code)
}

async function ricontrolla(): Promise<void> {
    if (!remoti || !pc.value) return
    controllo.value = true
    try {
        stato.value = await remoti.controlla(pcId.value)
    } finally {
        controllo.value = false
    }
    if (stato.value?.inLinea) await leggiSessioni()
}

function apriSessione(id: string): void {
    void router.push({ name: 'computer-codice', params: { pcId: pcId.value, id } })
}

/**
 * R-M4 Q2 (owner 20/10/2026 «Sì, fra le cartelle ammesse»): una sessione nuova si apre in una cartella che il PC apre al telefono
 * (`projects.list`: id e nome, mai il percorso). Preselezionata quella col nome della sessione più recente (`progetto`), se c'è;
 * altrimenti la sceglie la persona. «Apri» porta al Codice del PC con la cartella: il primo messaggio crea la sessione lì.
 */
const cartelle = ref<CartellaDelPc[] | null>(null)
const cartellaScelta = ref<string | null>(null)
const leggoCartelle = ref(false)
const erroreCartelle = ref<string | null>(null)
async function nuovaSessione(): Promise<void> {
    if (!remoti || leggoCartelle.value) return
    leggoCartelle.value = true
    erroreCartelle.value = null
    try {
        const esito = await entroIlTetto(remoti.cartelle(pcId.value))
        if (!esito.ok) {
            erroreCartelle.value = fraseDelGuasto(esito.code)
            return
        }
        cartelle.value = esito.cartelle
        const ultimo = sessioniPc.value?.[0]?.progetto
        cartellaScelta.value = esito.cartelle.find((c) => c.nome === ultimo)?.id ?? null
    } finally {
        leggoCartelle.value = false
    }
}
function apriNuova(): void {
    if (!cartellaScelta.value) return
    void router.push({ name: 'computer-codice', params: { pcId: pcId.value }, query: { cartella: cartellaScelta.value } })
}
/** Frecce dentro il gruppo (come `TalosCodiceR4ModoSheet`): il fuoco passa alla riga vicina, la scelta resta un tocco o Invio/Spazio. */
async function frecceCartelle(evento: KeyboardEvent): Promise<void> {
    if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(evento.key)) return
    const righe = [...(evento.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="radio"]')]
    const i = righe.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    evento.preventDefault()
    await nextTick()
    righe[(i + (evento.key === 'ArrowDown' || evento.key === 'ArrowRight' ? 1 : -1) + righe.length) % righe.length].focus()
}

onMounted(async () => {
    await remoti?.aggiorna().catch(() => undefined)
    caricato.value = true
    await ricontrolla()
})

const percorso = computed(() => {
    const s = stato.value
    if (!s || !s.inLinea || !s.percorso) return null
    const ms = s.rttMs ?? 0
    return s.percorso === 'relay' ? t('computer.pathRelay', { ms }) : t('computer.pathDirect', { ms })
})
const fraseNonInLinea = computed(() => {
    const s = stato.value
    if (!s || s.inLinea) return null
    const chiave = fraseErroreRemoto(s.code)
    return chiave ? t(chiave) : null
})

function quando(ms: number): string {
    return new Intl.DateTimeFormat(String(locale.value ?? 'it'), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(ms)
}

async function dimentica(): Promise<void> {
    if (!remoti) return
    dimenticando.value = true
    try {
        const { avvisato } = await remoti.dimentica(pcId.value)
        // Il PC spento non ha saputo niente (contratto §12): le chiavi sul telefono sono comunque cancellate, la persona lo sa.
        if (!avvisato) {
            talosNotify({ key: `computer:forget:${pcId.value}`, channel: 'jobs', weight: 'notable', title: t('computer.forgetOffline'), at: Date.now() })
        }
        conferma.value = false
        void router.replace({ name: 'computer' })
    } finally {
        dimenticando.value = false
    }
}
</script>

<template>
    <div
        class="flex min-h-full flex-col px-[var(--talos-space-page)] pb-[max(var(--talos-space-page),env(safe-area-inset-bottom))] pt-[var(--talos-space-section)]"
        data-testid="talos-computer-item-screen"
    >
        <TalosMobilePageHeader :title="pc ? nome : t('computer.title')" :subtitle="t('computer.itemSubtitle')" />

        <p v-if="!remoti" role="status" class="mt-[var(--talos-space-section)] text-sm text-[var(--talos-muted)]">{{ t('computer.onlyInApp') }}</p>
        <p v-else-if="caricato && !pc" role="status" class="mt-[var(--talos-space-section)] text-sm text-[var(--talos-muted)]">{{ t('computer.notFound') }}</p>

        <template v-else-if="pc">
            <dl class="mt-[var(--talos-space-section)] flex flex-col divide-y divide-[var(--talos-border)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] px-[var(--talos-space-card)]">
                <div class="flex min-h-touch items-center justify-between gap-[var(--talos-space-control)] py-3" data-testid="talos-computer-status" role="status">
                    <dt class="text-sm text-[var(--talos-muted)]">{{ t('computer.status') }}</dt>
                    <dd v-if="controllo" data-testid="talos-computer-checking" class="text-sm text-[var(--talos-muted)]">{{ t('computer.checking') }}</dd>
                    <dd v-else-if="stato?.inLinea" class="flex items-center gap-2 text-sm text-[var(--talos-text)]">
                        <span class="size-2 rounded-full bg-[var(--talos-success)]" aria-hidden="true" />{{ t('computer.online') }}
                    </dd>
                    <dd v-else class="text-sm text-[var(--talos-text)]">{{ t('computer.offline') }}</dd>
                </div>
                <div v-if="percorso" class="flex min-h-touch items-center justify-between gap-[var(--talos-space-control)] py-3" data-testid="talos-computer-path">
                    <dt class="text-sm text-[var(--talos-muted)]">{{ t('computer.path') }}</dt>
                    <dd class="text-sm tabular-nums text-[var(--talos-text)]">{{ percorso }}</dd>
                </div>
                <div class="flex min-h-touch items-center justify-between gap-[var(--talos-space-control)] py-3" data-testid="talos-computer-since">
                    <dt class="text-sm text-[var(--talos-muted)]">{{ t('computer.since') }}</dt>
                    <!-- solo la data: l'etichetta della riga dice già «Collegato» (dal Pad, 20/10/2026) -->
                    <dd class="text-sm tabular-nums text-[var(--talos-text)]">{{ quando(pc.accoppiatoAlle) }}</dd>
                </div>
            </dl>

            <!-- R-M5a: l'interruttore delle notifiche di questo computer, con «Prova la notifica» -->
            <TalosComputerNotifiche
                :pc-id="pcId"
                class="mt-[var(--talos-space-section)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] px-[var(--talos-space-card)] py-[var(--talos-space-inline)]"
            />

            <section v-if="sessioniPc || erroreSessioni" class="mt-[var(--talos-space-section)]" :aria-label="t('computer.sessions')">
                <div class="flex items-center justify-between gap-[var(--talos-space-control)]">
                    <h2 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('computer.sessions') }}</h2>
                    <!-- RA-12: senza un elenco vero niente sessione nuova (la cartella preselezionata viene dall'elenco) -->
                    <Button
                        v-if="cartelle === null && sessioniPc"
                        type="button"
                        variant="outline"
                        data-testid="talos-computer-new-session"
                        class="talos-pressable min-h-touch"
                        :disabled="leggoCartelle"
                        @click="nuovaSessione()"
                    >
                        <Plus class="size-4" aria-hidden="true" />{{ t('computer.newSession') }}
                    </Button>
                </div>
                <p v-if="erroreCartelle" role="status" class="mt-1 text-sm text-[var(--talos-muted)]">{{ t(erroreCartelle) }}</p>
                <div v-if="cartelle" class="mt-[var(--talos-space-inline)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]">
                    <p v-if="!cartelle.length" role="status" class="text-sm text-[var(--talos-muted)]">{{ t('computer.noFolders') }}</p>
                    <template v-else>
                        <h3 id="talos-computer-folders-title" class="text-sm font-medium text-[var(--talos-text)]">{{ t('computer.folders') }}</h3>
                        <div role="radiogroup" aria-labelledby="talos-computer-folders-title" class="mt-1.5 flex flex-col gap-1.5" @keydown="frecceCartelle">
                            <button
                                v-for="(c, i) in cartelle"
                                :key="c.id"
                                type="button"
                                role="radio"
                                data-testid="talos-computer-folder"
                                :aria-checked="cartellaScelta === c.id ? 'true' : 'false'"
                                :tabindex="cartellaScelta === c.id || (!cartellaScelta && i === 0) ? 0 : -1"
                                class="talos-pressable flex min-h-touch w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm text-[var(--talos-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--talos-ring)]"
                                :class="cartellaScelta === c.id ? 'border-[var(--talos-accent)] bg-[color-mix(in_srgb,var(--talos-accent)_14%,var(--talos-panel))]' : 'border-[var(--talos-border)] bg-[var(--talos-panel)]'"
                                @click="cartellaScelta = c.id"
                            >
                                <span
                                    class="inline-flex size-[1.125rem] shrink-0 rounded-full border"
                                    :class="cartellaScelta === c.id ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] shadow-[inset_0_0_0_3px_var(--talos-panel)]' : 'border-[var(--talos-border)]'"
                                    aria-hidden="true"
                                />
                                <span class="min-w-0 flex-1 truncate">{{ c.nome }}</span>
                            </button>
                        </div>
                    </template>
                    <!-- ⛔ RA-13 (revisione avversariale R-M4, 21/10/2026): «Annulla» anche senza cartelle, se no la persona restava bloccata -->
                    <div class="mt-[var(--talos-space-inline)] flex justify-end gap-[var(--talos-space-control)]">
                        <Button type="button" variant="ghost" data-testid="talos-computer-folders-cancel" class="min-h-touch" @click="cartelle = null">{{ t('common.cancel') }}</Button>
                        <Button v-if="cartelle.length" type="button" data-testid="talos-computer-open-session" class="min-h-touch" :disabled="!cartellaScelta" @click="apriNuova()">
                            {{ t('computer.openSession') }}
                        </Button>
                    </div>
                </div>
                <div v-if="erroreSessioni" class="mt-1">
                    <p data-testid="talos-computer-sessions-error" role="status" class="max-w-[46ch] text-sm leading-[1.7] text-[var(--talos-muted)]">{{ t(erroreSessioni) }}</p>
                    <Button
                        type="button"
                        variant="outline"
                        data-testid="talos-computer-sessions-retry"
                        class="talos-pressable mt-[var(--talos-space-inline)] min-h-touch"
                        @click="leggiSessioni()"
                    >
                        {{ t('computer.retry') }}
                    </Button>
                </div>
                <p v-else-if="!sessioniPc?.length" class="mt-1 text-sm text-[var(--talos-muted)]">{{ t('computer.sessionsEmpty') }}</p>
                <ul v-else class="mt-1 flex flex-col divide-y divide-[var(--talos-border)]">
                    <li v-for="s in sessioniPc" :key="s.id">
                        <button
                            type="button"
                            data-testid="talos-computer-session"
                            class="talos-pressable talos-pressable-row flex min-h-touch w-full items-center gap-[var(--talos-space-control)] py-3 text-left"
                            @click="apriSessione(s.id)"
                        >
                            <Code2 class="size-5 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            <span class="min-w-0 flex-1 truncate text-sm text-[var(--talos-text)]">{{ s.title || t('computer.untitledSession') }}</span>
                            <ChevronRight class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                        </button>
                    </li>
                </ul>
            </section>

            <div v-if="fraseNonInLinea && !controllo" class="mt-[var(--talos-space-section)]">
                <p class="max-w-[46ch] text-sm leading-[1.7] text-[var(--talos-muted)]">{{ fraseNonInLinea }}</p>
                <Button
                    type="button"
                    variant="outline"
                    data-testid="talos-computer-recheck"
                    class="talos-pressable mt-[var(--talos-space-inline)] min-h-touch"
                    @click="ricontrolla()"
                >
                    {{ t('computer.retry') }}
                </Button>
            </div>

            <!-- ⛔ D-RM4-9 (revisione avversariale R-M4, 21/10/2026): la variante outline porta `dark:bg-input/30 dark:border-input`, che nel tema
                 scuro vincono (sul tablet era un pulsante grigio); la coppia di pericolo del tema, come la conferma qui sotto (PER-01/PER-02) -->
            <Button
                type="button"
                data-testid="talos-computer-forget"
                class="talos-pressable mt-[calc(var(--talos-space-section)*2)] min-h-touch self-start border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] text-[var(--talos-danger)]"
                @click="conferma = true"
            >
                {{ t('computer.forget') }}
            </Button>
        </template>

        <TalosMobileConfirmDialog
            v-if="conferma"
            :title="tTesto('computer.forgetTitle', { name: nome })"
            :description="t('computer.forgetBody')"
            @close="dimenticando ? undefined : conferma = false"
        >
            <template #footer>
                <Button type="button" variant="outline" :disabled="dimenticando" class="min-h-12" @click="conferma = false">
                    {{ t('common.cancel') }}
                </Button>
                <Button
                    type="button"
                    data-testid="talos-computer-forget-confirm"
                    :disabled="dimenticando"
                    class="min-h-12 border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] text-[var(--talos-danger)]"
                    @click="dimentica()"
                >
                    {{ t('computer.forgetConfirm') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>
    </div>
</template>
