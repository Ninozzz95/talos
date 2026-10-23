<script setup lang="ts">
/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M3 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`): la sezione «Computer» — owner
 * 20/10/2026, nome e testi del mockup v5 approvato il 17/10 (`MOCKUP-ACCOPPIAMENTO-TELEFONO-2026-10-17.html`).
 *
 * I computer collegati a questo telefono e il collegamento di uno nuovo in tre gesti: «Collega un computer» apre lo scanner di Google
 * (niente permesso della fotocamera) · il telefono mostra il numero che deve comparire anche sul PC · la conferma si dà SUL PC, il
 * telefono può solo annullare. Il numero lo calcola il telefono (`accoppiamentoRemoto.ts`): se quello del PC è diverso, annulla da sé.
 * Fuori dall'app Android non c'è il plugin, e la sezione lo dice invece di offrire tasti che non farebbero niente.
 */
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, Laptop } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobilePageHeader from '@/components/talos/ui/TalosMobilePageHeader.vue'
import TalosComputerNotifiche from '@/components/remoto/TalosComputerNotifiche.vue'
import { useComputerRemoti, type ComputerRicordato } from '@/lib/remoto/computerRemoti'
import { fraseErroreRemoto } from '@/lib/remoto/frasiRemoto'
import { prendiQrInAttesa, qrRemotoInAttesa } from '@/lib/remoto/linkRemoto'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'

// `tTesto` per i testi con date e nomi messi con `{{ }}`: senza, la «/» di una data diventava «&#x2F;» (dal Pad, 20/10/2026).
const { t, tTesto, locale } = useTalosI18n()
const router = useRouter()
const remoti = useComputerRemoti()
const onda = useTalosTouchWave()

const fase = computed(() => remoti?.fase.value ?? { tipo: 'inattivo' as const })
const elenco = computed(() => remoti?.elenco.value ?? [])
const occupato = computed(() => fase.value.tipo !== 'inattivo')

onMounted(() => { void remoti?.aggiorna().catch(() => undefined) })

/*
 * ⛔ D-RM4-2 (20/10/2026): un accoppiamento IN CORSO è solo `collego` o `conferma` — quello non si interrompe. Prima la guardia era
 * `occupato` (tutto ciò che non è `inattivo`): sull'errore e sul «Collegato» di prima un collegamento appena aperto veniva ignorato
 * in silenzio. `occupato` resta per la schermata (tasto e stato vuoto nascosti), non decide più chi può partire.
 */
const accoppiamentoInCorso = computed(() => fase.value.tipo === 'collego' || fase.value.tipo === 'conferma')

/**
 * Un collegamento `talos-remote:` aperto sul telefono (`linkRemoto.ts`): vale come il QR, senza scanner. Anche a sezione aperta.
 * ⛔ D-RM4-2: si guarda ANCHE la fine del giro in corso. Arrivato durante `collego`/`conferma`, il collegamento resta in attesa
 * (`qrRemotoInAttesa` non si svuota) e parte appena il giro finisce, invece di restare in memoria fino alla prossima apertura della
 * sezione — e partire allora, a sorpresa, magari scaduto. Lo stesso collegamento due volte non arriva qui (`ultimo` in `linkRemoto.ts`).
 */
watch([qrRemotoInAttesa, accoppiamentoInCorso], ([qr, inCorso]) => {
    if (!qr || !remoti || inCorso) return
    void remoti.accoppia(prendiQrInAttesa()!)
}, { immediate: true })

/** «627 584»: due gruppi da tre, come lo mostra il PC; chi ascolta lo schermo sente le cifre una per una. */
const codiceInGruppi = computed(() => (fase.value.tipo === 'conferma' ? `${fase.value.codice.slice(0, 3)} ${fase.value.codice.slice(3)}` : ''))
const codiceLetto = computed(() => (fase.value.tipo === 'conferma' ? fase.value.codice.split('').join(' ') : ''))

const nomeDelPc = (nome: string | null | undefined) => nome || t('computer.unnamed')

function quando(ms: number): string {
    return new Intl.DateTimeFormat(String(locale.value ?? 'it'), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(ms)
}

const erroreFrase = computed(() => {
    if (fase.value.tipo !== 'errore') return null
    const chiave = fraseErroreRemoto(fase.value.code)
    return chiave ? t(chiave) : null
})

function apri(pc: ComputerRicordato): void {
    void router.push({ name: 'computer-item', params: { pcId: pc.pcId } })
}
</script>

<template>
    <div
        class="flex min-h-full flex-col px-[var(--talos-space-page)] pb-[max(var(--talos-space-page),env(safe-area-inset-bottom))] pt-[var(--talos-space-section)]"
        data-testid="talos-computer-screen"
    >
        <TalosMobilePageHeader :title="t('computer.title')" :subtitle="t('computer.subtitle')">
            <template #action>
                <Button
                    v-if="remoti && elenco.length && !occupato"
                    type="button"
                    data-testid="talos-computer-connect"
                    class="talos-pressable talos-wave-host min-h-touch shrink-0 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-4 text-xs text-[var(--talos-accent-text)] hover:bg-[var(--talos-accent-hover)]"
                    @click="remoti.collegaUnComputer()"
                    @pointerdown="onda.onPointerDown"
                >
                    {{ t('computer.connect') }}
                </Button>
            </template>
        </TalosMobilePageHeader>

        <p v-if="!remoti" role="status" class="mt-[var(--talos-space-section)] max-w-[52ch] text-sm leading-[1.7] text-[var(--talos-muted)]">
            {{ t('computer.onlyInApp') }}
        </p>

        <template v-else>
            <!-- Il collegamento in corso: un pannello solo, che cambia con la fase. Stato annunciato, mai fuoco rubato. -->
            <section
                v-if="fase.tipo === 'collego'"
                role="status"
                data-testid="talos-computer-connecting"
                class="mt-[var(--talos-space-section)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]"
            >
                <p class="text-sm text-[var(--talos-text)]">{{ t('computer.connecting') }}</p>
                <Button type="button" variant="outline" class="talos-pressable mt-[var(--talos-space-section)] min-h-touch" @click="remoti.annulla()">
                    {{ t('common.cancel') }}
                </Button>
            </section>

            <section
                v-else-if="fase.tipo === 'conferma'"
                role="status"
                data-testid="talos-computer-confirm"
                class="mt-[var(--talos-space-section)] rounded-[var(--talos-radius-card)] border border-[var(--talos-accent-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]"
            >
                <h2 class="text-base font-semibold text-[var(--talos-text)]">{{ t('computer.confirmTitle') }}</h2>
                <p class="mt-1 text-xs text-[var(--talos-muted)]">{{ nomeDelPc(fase.pc.nome) }}</p>
                <p
                    data-testid="talos-computer-code"
                    class="my-[var(--talos-space-section)] font-semibold tabular-nums tracking-[0.08em] text-[var(--talos-text)] text-4xl leading-none"
                    :aria-label="codiceLetto"
                >{{ codiceInGruppi }}</p>
                <p class="max-w-[46ch] text-sm leading-[1.7] text-[var(--talos-muted)]">{{ t('computer.confirmHint') }}</p>
                <p class="mt-[var(--talos-space-inline)] text-xs text-[var(--talos-muted)]">{{ t('computer.waiting') }}</p>
                <Button
                    type="button"
                    variant="outline"
                    data-testid="talos-computer-code-different"
                    class="talos-pressable mt-[var(--talos-space-section)] min-h-touch"
                    @click="remoti.annulla()"
                >
                    {{ t('computer.codeDifferent') }}
                </Button>
            </section>

            <section
                v-else-if="fase.tipo === 'fatto'"
                role="status"
                data-testid="talos-computer-paired"
                class="mt-[var(--talos-space-section)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]"
            >
                <h2 class="text-base font-semibold text-[var(--talos-text)]">{{ tTesto('computer.pairedTitle', { name: nomeDelPc(fase.pc.nome) }) }}</h2>
                <p class="mt-1 max-w-[46ch] text-sm leading-[1.7] text-[var(--talos-muted)]">{{ t('computer.pairedHint') }}</p>
                <!-- R-M5a, owner R-M5 Q3: le notifiche si propongono qui, subito dopo l'accoppiamento, con «Prova la notifica» -->
                <TalosComputerNotifiche :pc-id="fase.pc.pcId" class="mt-[var(--talos-space-section)] border-t border-[var(--talos-border)] pt-[var(--talos-space-inline)]" />
                <Button
                    type="button"
                    data-testid="talos-computer-paired-done"
                    class="talos-pressable mt-[var(--talos-space-section)] min-h-touch bg-[var(--talos-accent)] px-5 text-[var(--talos-accent-text)]"
                    @click="remoti.riposa()"
                >
                    {{ t('computer.done') }}
                </Button>
            </section>

            <section
                v-else-if="fase.tipo === 'errore'"
                role="alert"
                data-testid="talos-computer-error"
                class="mt-[var(--talos-space-section)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]"
            >
                <p class="max-w-[46ch] text-sm leading-[1.7] text-[var(--talos-text)]">{{ erroreFrase }}</p>
                <div class="mt-[var(--talos-space-section)] flex flex-col gap-[var(--talos-space-inline)] sm:flex-row">
                    <Button
                        type="button"
                        data-testid="talos-computer-retry"
                        class="talos-pressable min-h-touch bg-[var(--talos-accent)] px-5 text-[var(--talos-accent-text)]"
                        @click="remoti.collegaUnComputer()"
                    >
                        {{ t('computer.retry') }}
                    </Button>
                    <Button type="button" variant="outline" class="talos-pressable min-h-touch" @click="remoti.riposa()">
                        {{ t('common.close') }}
                    </Button>
                </div>
            </section>

            <!-- Nessun computer: un invito ad agire, con il gesto da fare sul PC. -->
            <div
                v-if="!elenco.length && !occupato"
                data-testid="talos-computer-empty"
                role="status"
                class="flex flex-1 flex-col items-center justify-center gap-[var(--talos-space-inline)] py-[calc(var(--talos-space-page)*2)] text-center"
            >
                <svg class="talos-calm-line-art mb-[var(--talos-space-section)] h-[120px] w-[150px] text-[var(--talos-border-strong)]" viewBox="0 0 150 120" aria-hidden="true">
                    <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                        <path data-talos-draw d="M30 22h90v58H30Z" />
                        <path data-talos-draw d="M16 92h118l-8 8H24Z" />
                        <path data-talos-draw class="stroke-[var(--talos-accent-border)]" d="M62 51l9 8 17-17" />
                    </g>
                </svg>
                <h2 class="max-w-[27ch] text-xl font-medium leading-[1.5] tracking-[-0.02em] text-[var(--talos-text)]">{{ t('computer.emptyTitle') }}</h2>
                <p class="max-w-[40ch] text-sm leading-[1.7] text-[var(--talos-muted)]">{{ t('computer.emptyHint') }}</p>
                <Button
                    type="button"
                    data-testid="talos-computer-connect"
                    class="talos-pressable mt-[var(--talos-space-section)] min-h-touch rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-5 text-xs text-[var(--talos-accent-text)]"
                    @click="remoti.collegaUnComputer()"
                >
                    {{ t('computer.connect') }}
                </Button>
            </div>

            <ul v-if="elenco.length" class="mt-[var(--talos-space-section)] flex flex-col divide-y divide-[var(--talos-border)]" :aria-label="t('computer.listLabel')">
                <li v-for="pc in elenco" :key="pc.pcId">
                    <button
                        type="button"
                        data-testid="talos-computer-row"
                        class="talos-pressable talos-pressable-row talos-wave-host flex min-h-touch w-full items-center gap-[var(--talos-space-control)] py-3 text-left"
                        @click="apri(pc)"
                        @pointerdown="onda.onPointerDown"
                    >
                        <Laptop class="size-5 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm text-[var(--talos-text)]">{{ nomeDelPc(pc.nome) }}</span>
                            <span class="block text-xs text-[var(--talos-muted)]">{{ tTesto('computer.pairedOn', { when: quando(pc.accoppiatoAlle) }) }}</span>
                        </span>
                        <ChevronRight class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                    </button>
                </li>
            </ul>
        </template>
    </div>
</template>
