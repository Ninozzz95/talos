<script setup lang="ts">
/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M3: il dettaglio di un computer collegato (mockup v5: Stato, Percorso, Collegato,
 * «Dimentica questo computer»). Lo stato è quello VERO di adesso — `controlla` collega, manda un ping, legge il percorso e chiude —
 * mai un «in linea» supposto. «Dimentica» cancella dal telefono le chiavi di quel computer, con conferma.
 *
 * Mockup remoto approvato dall'owner il 23/10, tavola 2 («Impostazioni del PC»): qui ci sono solo le regole del controllo remoto —
 * notifiche, collegamento (percorso, data, codice del PC) e «Dimentica». La sezione «Sessioni su questo computer» non c'è più: al
 * suo posto «Apri le sessioni nel Codice», la lista del Codice già filtrata su questo PC. La sessione nuova sul PC si apre da lì
 * (`TalosNuovaSessioneSulPc.vue`).
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobilePageHeader from '@/components/talos/ui/TalosMobilePageHeader.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosComputerNotifiche from '@/components/remoto/TalosComputerNotifiche.vue'
import { useComputerRemoti, type StatoDelComputer } from '@/lib/remoto/computerRemoti'
import { codiceBreve, nomeConCodice, nomeECodice } from '@/lib/remoto/ricordiDelPc'
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

/** Come nel riquadro della schermata Computer: col codice breve solo se un altro PC ha lo stesso nome. */
const nome = computed(() => (pc.value && remoti ? nomeConCodice(pc.value, remoti.elenco.value, t('computer.unnamed')) : t('computer.unnamed')))

async function ricontrolla(): Promise<void> {
    if (!remoti || !pc.value) return
    controllo.value = true
    try {
        stato.value = await remoti.controlla(pcId.value)
    } finally {
        controllo.value = false
    }
}

/** Tavola 3: la lista del Codice, già filtrata su questo PC. */
function apriNelCodice(): void {
    void router.push({ name: 'harness', query: { dove: pcId.value } })
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
    // D-MOCK-8: il nome si prende PRIMA, perché dopo «Dimentica» il PC non è più nell'elenco
    const name = nomeECodice({ pcId: pcId.value, nome: pc.value?.nome ?? null }, t('computer.unnamed'))
    try {
        const { avvisato } = await remoti.dimentica(pcId.value)
        // Il PC spento non ha saputo niente (contratto §12): le chiavi sul telefono sono comunque cancellate, la persona lo sa.
        if (!avvisato) {
            talosNotify({ key: `computer:forget:${pcId.value}`, channel: 'jobs', weight: 'notable', title: tTesto('computer.forgetOffline', { name }), at: Date.now() })
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
        <!-- tavola 2: sotto il nome lo stato, non una riga di spiegazione -->
        <TalosMobilePageHeader :title="pc ? nome : t('computer.title')" />

        <p v-if="!remoti" role="status" class="mt-[var(--talos-space-section)] text-sm text-[var(--talos-muted)]">{{ t('computer.onlyInApp') }}</p>
        <p v-else-if="caricato && !pc" role="status" class="mt-[var(--talos-space-section)] text-sm text-[var(--talos-muted)]">{{ t('computer.notFound') }}</p>

        <template v-else-if="pc">
            <!-- tavola 2: lo stato a prima vista, sotto il nome, e il pulsante verso le sessioni -->
            <p data-testid="talos-computer-status" role="status" class="mt-[var(--talos-space-inline)] flex items-center gap-2 text-sm text-[var(--talos-text)]">
                <span v-if="controllo" data-testid="talos-computer-checking" class="text-[var(--talos-muted)]">{{ t('computer.checking') }}</span>
                <template v-else-if="stato?.inLinea">
                    <span class="size-2 rounded-full bg-[var(--talos-success)]" aria-hidden="true" />{{ t('computer.online') }}
                </template>
                <template v-else>{{ t('computer.offline') }}</template>
            </p>
            <Button
                type="button"
                variant="outline"
                data-testid="talos-computer-open-codice"
                class="talos-pressable mt-[var(--talos-space-section)] min-h-touch w-full"
                @click="apriNelCodice()"
            >
                {{ t('computer.openInCodice') }}
            </Button>

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

            <section class="mt-[calc(var(--talos-space-section)*1.5)]" aria-labelledby="talos-computer-notifications-title">
                <h2 id="talos-computer-notifications-title" class="text-sm font-semibold text-[var(--talos-text)]">{{ t('computer.notificationsTitle') }}</h2>
                <!-- R-M5a: l'interruttore delle notifiche di questo computer, con «Prova la notifica» -->
                <TalosComputerNotifiche
                    :pc-id="pcId"
                    class="mt-[var(--talos-space-inline)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] px-[var(--talos-space-card)] py-[var(--talos-space-inline)]"
                />
            </section>

            <section class="mt-[calc(var(--talos-space-section)*1.5)]" aria-labelledby="talos-computer-connection-title">
                <h2 id="talos-computer-connection-title" class="text-sm font-semibold text-[var(--talos-text)]">{{ t('computer.connection') }}</h2>
                <dl class="mt-[var(--talos-space-inline)] flex flex-col divide-y divide-[var(--talos-border)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] px-[var(--talos-space-card)]">
                    <div v-if="percorso" class="flex min-h-touch items-center justify-between gap-[var(--talos-space-control)] py-3" data-testid="talos-computer-path">
                        <dt class="text-sm text-[var(--talos-muted)]">{{ t('computer.path') }}</dt>
                        <dd class="text-sm tabular-nums text-[var(--talos-text)]">{{ percorso }}</dd>
                    </div>
                    <div class="flex min-h-touch items-center justify-between gap-[var(--talos-space-control)] py-3" data-testid="talos-computer-since">
                        <dt class="text-sm text-[var(--talos-muted)]">{{ t('computer.since') }}</dt>
                        <!-- solo la data: l'etichetta della riga dice già «Collegato» (dal Pad, 20/10/2026) -->
                        <dd class="text-sm tabular-nums text-[var(--talos-text)]">{{ quando(pc.accoppiatoAlle) }}</dd>
                    </div>
                    <!-- tavola 2: lo stesso codice che il PC mostra in Dispositivi collegati (Desktop (3), 24/10) -->
                    <div class="flex min-h-touch items-center justify-between gap-[var(--talos-space-control)] py-3" data-testid="talos-computer-code-short">
                        <dt class="text-sm text-[var(--talos-muted)]">{{ t('computer.pcCode') }}</dt>
                        <dd class="font-mono text-sm text-[var(--talos-text)]">{{ codiceBreve(pc.pcId) }}</dd>
                    </div>
                </dl>
            </section>

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
