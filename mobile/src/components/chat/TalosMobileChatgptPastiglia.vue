<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ExternalLink } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { talosChatgpt } from '@/services/chatgptAccesso'
import { type TalosChatgptRiassunto, talosConsumiChatgpt } from '@/services/chatgptConsumi'
import { openTalosLinkOnce } from '@/services/inAppBrowserService'

/**
 * N15 — la pastiglia «ChatGPT plan» nel compositore e il pannello che apre, come nel mockup approvato dall'owner
 * (`mobile/mockup/n15`, scene `compositore` e `pannello`). Compare solo quando il modello scelto è del piano: dice CHI paga
 * questo giro. Owner 12/10: «la pill nel composer leggermente meno alta» ⇒ il disegno è un distintivo da 28 px, l'area da
 * toccare resta 44 px, data dal pulsante attorno.
 *
 * ⛔ I numeri sono quelli contati da TALOS su questo telefono (`chatgptConsumi`), e il pannello lo dice: OpenAI non pubblica i
 * limiti del piano, quindi niente barre, niente percentuali, niente «ti resta». I numeri veri stanno in «Gestisci l'utilizzo».
 *
 * Servizio e conto arrivano come proprietà solo per le prove.
 */
type Stato = { email: string | null, consumi: string }
const props = withDefaults(defineProps<{
    servizio?: { stato(): Promise<Stato> }
    consumi?: { riassunto(): TalosChatgptRiassunto }
    apri?: (indirizzo: string) => Promise<unknown>
}>(), { servizio: undefined, consumi: undefined, apri: undefined })
const { t, locale } = useTalosI18n()

const aperto = ref(false)
const stato = ref<Stato | null>(null)
const conto = ref<TalosChatgptRiassunto | null>(null)
const pulsante = ref<HTMLButtonElement | null>(null)
const pannello = ref<HTMLElement | null>(null)
/** Dove sta il pannello: sopra la pastiglia, allineato a sinistra come lei, mai fuori dallo schermo. */
const posto = ref({ left: '16px', bottom: '96px', maxHeight: '70vh' })

const numeri = computed(() => new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }))
function riga(finestra: { richieste: number, token: number } | undefined): string {
    const f = finestra ?? { richieste: 0, token: 0 }
    return t(f.richieste === 1 ? 'chatgptPlan.usageOne' : 'chatgptPlan.usageMany', { requests: f.richieste, tokens: numeri.value.format(f.token) })
}

function fuori(evento: Event): void {
    const dove = evento.target as Node | null
    if (dove && (pannello.value?.contains(dove) || pulsante.value?.contains(dove))) return
    chiudi()
}
function tasto(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') chiudi()
}
function chiudi(): void {
    if (!aperto.value) return
    aperto.value = false
    document.removeEventListener('pointerdown', fuori, true)
    document.removeEventListener('keydown', tasto)
}
async function apriPannello(): Promise<void> {
    conto.value = (props.consumi ?? talosConsumiChatgpt()).riassunto()
    const dove = pulsante.value?.getBoundingClientRect()
    // Sopra l'INTERO compositore, come nel mockup: sul Pad (13/10/2026), ancorato alla sola pastiglia, copriva il campo di scrittura.
    const sopra = (pulsante.value?.closest('.talos-calm-composer') ?? pulsante.value)?.getBoundingClientRect()
    if (dove && sopra) {
        posto.value = {
            left: `${Math.max(16, Math.min(dove.left, window.innerWidth - 16 - 352))}px`,
            bottom: `${Math.max(16, window.innerHeight - sopra.top + 8)}px`,
            // con la tastiera aperta lo spazio sopra il compositore è poco: il pannello scorre, non esce dallo schermo
            maxHeight: `${Math.max(160, sopra.top - 24)}px`,
        }
    }
    aperto.value = true
    document.addEventListener('pointerdown', fuori, true)
    document.addEventListener('keydown', tasto)
    // ⛔ N15-PAST-04 (Pad, 13/10/2026): il pannello NON prende il fuoco. Toglierlo al campo di scrittura fa tornare compatto il
    // compositore, che smonta la riga degli attrezzi con dentro questa pastiglia: il pannello spariva in 60 ms.
    try { stato.value = await (props.servizio ?? talosChatgpt()).stato() } catch { stato.value = null }
}
function alterna(): void {
    if (aperto.value) chiudi()
    else void apriPannello()
}
function gestisci(): void {
    const indirizzo = stato.value?.consumi
    if (!indirizzo) return
    void (props.apri ?? ((u: string) => openTalosLinkOnce(u, 'system_browser')))(indirizzo)
}
onBeforeUnmount(chiudi)
</script>

<template>
    <button
        ref="pulsante" type="button" data-testid="talos-chatgpt-pill"
        :aria-label="t('chatgptPlan.pill')" aria-haspopup="dialog" :aria-expanded="aperto"
        class="talos-pressable flex min-h-touch min-w-touch shrink-0 items-center justify-center"
        @pointerdown.prevent @click="alterna"
    >
        <span data-testid="talos-chatgpt-pill-badge" class="flex h-6 items-center gap-1 rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 text-2xs text-[var(--talos-text)] sm:h-7 sm:gap-1.5 sm:px-2.5 sm:text-xs">
            <span class="size-2 rounded-full bg-[var(--talos-success)]" aria-hidden="true" />
            <!-- ⛔ N15-PAST-05 (owner 18/10, foto dal telefono): sotto i 640 px la scritta intera mandava a capo la freccia di
                 espansione del compositore. Lì dice «Piano», accanto al modello col logo ChatGPT; il nome intero resta nell'aria-label. -->
            <span data-testid="talos-chatgpt-pill-short" class="sm:hidden" aria-hidden="true">{{ t('chatgptPlan.pillShort') }}</span>
            <span data-testid="talos-chatgpt-pill-full" class="hidden sm:inline" aria-hidden="true">{{ t('chatgptPlan.pill') }}</span>
        </span>
    </button>
    <Teleport to="body">
        <div
            v-if="aperto" ref="pannello" data-testid="talos-chatgpt-usage-panel" role="dialog"
            :aria-label="t('chatgptPlan.panelTitle')" :style="posto"
            class="fixed z-[var(--talos-z-app-overlay)] w-[min(22rem,calc(100vw-2rem))] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-window-bg)] p-[var(--talos-space-card)] text-[var(--talos-text)] shadow-lg overflow-y-auto"
            @pointerdown.prevent
        >
            <p class="font-semibold">{{ t('chatgptPlan.panelTitle') }}</p>
            <p v-if="stato?.email" class="break-all text-sm text-[var(--talos-muted)]">{{ stato.email }}</p>
            <dl class="mt-3 divide-y divide-[var(--talos-border)] text-sm">
                <div class="flex justify-between gap-3 py-2">
                    <dt class="text-[var(--talos-muted)]">{{ t('chatgptPlan.last5h') }}</dt>
                    <dd data-testid="talos-chatgpt-usage-5h" class="text-right font-semibold tabular-nums">{{ riga(conto?.ore5) }}</dd>
                </div>
                <div class="flex justify-between gap-3 py-2">
                    <dt class="text-[var(--talos-muted)]">{{ t('chatgptPlan.last7d') }}</dt>
                    <dd data-testid="talos-chatgpt-usage-7d" class="text-right font-semibold tabular-nums">{{ riga(conto?.giorni7) }}</dd>
                </div>
            </dl>
            <p data-testid="talos-chatgpt-usage-note" class="mt-2 text-xs text-[var(--talos-muted)]">{{ t('chatgptPlan.panelNote') }}</p>
            <button
                type="button" data-testid="talos-chatgpt-usage-manage"
                class="talos-pressable mt-1 inline-flex min-h-touch items-center gap-1.5 text-sm text-[var(--talos-accent)] underline underline-offset-2"
                @click="gestisci"
            >{{ t('chatgptPlan.manageUsage') }} <ExternalLink class="size-3.5" aria-hidden="true" /></button>
        </div>
    </Teleport>
</template>
