<script setup lang="ts">
/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M3 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`): la sezione «Computer» — owner
 * 20/10/2026, nome e testi del mockup v5 approvato il 17/10 (`MOCKUP-ACCOPPIAMENTO-TELEFONO-2026-10-17.html`).
 *
 * I computer collegati a questo telefono e il collegamento di uno nuovo in tre gesti: «Collega un computer» apre lo scanner di Google
 * (niente permesso della fotocamera) · il telefono mostra il numero che deve comparire anche sul PC · la conferma si dà SUL PC, il
 * telefono può solo annullare. Il numero lo calcola il telefono (`accoppiamentoRemoto.ts`): se quello del PC è diverso, annulla da sé.
 * Fuori dall'app Android non c'è il plugin, e la sezione lo dice invece di offrire tasti che non farebbero niente.
 *
 * Mockup remoto approvato dall'owner il 23/10 (tavola 1, `MOCKUP-COMPUTER-E-SESSIONI-REMOTE-2026-10-23-v2.html`): un riquadro per
 * PC, il più recente in alto. A prima vista solo «In linea» o «Non in linea · visto …»; percorso e millisecondi stanno nelle
 * Impostazioni. I numeri delle sessioni arrivano appena letti; di un PC spento restano gli ultimi, in grigio, con l'ora della lettura
 * (`ricordiDelPc.ts`). Le sessioni non stanno qui: «Apri le sessioni nel Codice» apre la lista del Codice già filtrata su quel PC.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Laptop } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import TalosMobilePageHeader from '@/components/talos/ui/TalosMobilePageHeader.vue'
import TalosComputerNotifiche from '@/components/remoto/TalosComputerNotifiche.vue'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import { useComputerRemoti, type ComputerRicordato } from '@/lib/remoto/computerRemoti'
import {
    codiceBreve, domandaDoppiGiaFatta, leggiRicordo, nomeConCodice, nomeECodice, segnaDomandaDoppi, vociVecchieDi, type ConteggiSessioni, type RicordoDelPc,
} from '@/lib/remoto/ricordiDelPc'
import { talosNotify } from '@/stores/notificationCentre'
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

/** Tavola 3: la lista del Codice, già filtrata su questo PC. */
function apriNelCodice(pc: ComputerRicordato): void {
    void router.push({ name: 'harness', query: { dove: pc.pcId } })
}

type StatoRiquadro = { tipo: 'leggo' } | { tipo: 'inLinea', conteggi: ConteggiSessioni } | { tipo: 'nonInLinea' }
const riquadri = ref<Record<string, StatoRiquadro>>({})
const ricordi = ref<Record<string, RicordoDelPc>>({})
/** L'ordine si decide all'inizio della lettura: i riquadri non saltano di posto mentre arrivano le risposte. */
const vistiPrima = ref<Record<string, number>>({})
let giro = 0

async function leggiRiquadri(): Promise<void> {
    if (!remoti) return
    const questo = ++giro
    const pcs = elenco.value
    ricordi.value = Object.fromEntries(pcs.map((pc) => [pc.pcId, leggiRicordo(pc.pcId)]))
    vistiPrima.value = Object.fromEntries(pcs.map((pc) => [pc.pcId, ricordi.value[pc.pcId]?.vistoAlle ?? 0]))
    riquadri.value = Object.fromEntries(pcs.map((pc) => [pc.pcId, { tipo: 'leggo' }]))
    // un PC alla volta sarebbe un minuto per sette PC spenti: ognuno ha il suo canale e il suo tetto (`riepilogo`)
    await Promise.all(pcs.map(async (pc) => {
        const r = await remoti.riepilogo(pc.pcId)
        if (questo !== giro) return
        riquadri.value = { ...riquadri.value, [pc.pcId]: r.inLinea ? { tipo: 'inLinea', conteggi: r.conteggi } : { tipo: 'nonInLinea' } }
        ricordi.value = { ...ricordi.value, [pc.pcId]: leggiRicordo(pc.pcId) }
    }))
}

// un PC collegato o dimenticato cambia l'elenco: i riquadri si rileggono; lo stesso elenco di prima non apre altri canali
watch(() => elenco.value.map((pc) => pc.pcId).join('\n'), () => { void leggiRiquadri() }, { immediate: true })

const ordinati = computed(() => [...elenco.value].sort((a, b) =>
    (vistiPrima.value[b.pcId] ?? 0) - (vistiPrima.value[a.pcId] ?? 0) || b.accoppiatoAlle - a.accoppiatoAlle))

const statoDi = (pc: ComputerRicordato): StatoRiquadro => riquadri.value[pc.pcId] ?? { tipo: 'leggo' }

/** I numeri da mostrare: quelli appena letti, o gli ultimi ricordati (in grigio, con l'ora). Mai numeri inventati. */
function numeriDi(pc: ComputerRicordato): { conteggi: ConteggiSessioni, letteAlle: number | null } | null {
    const stato = statoDi(pc)
    if (stato.tipo === 'inLinea') return { conteggi: stato.conteggi, letteAlle: null }
    const ricordati = ricordi.value[pc.pcId]?.sessioni
    return ricordati ? { conteggi: ricordati, letteAlle: ricordati.letteAlle } : null
}

function ora(ms: number): string {
    return new Intl.DateTimeFormat(String(locale.value ?? 'it'), { hour: '2-digit', minute: '2-digit' }).format(ms)
}
/** «oggi alle 18:40», «ieri alle 18:40», «il 21/10 alle 18:40». */
function quandoVisto(ms: number): string {
    const giorno = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const giorni = Math.round((giorno(new Date()) - giorno(new Date(ms))) / 86_400_000)
    if (giorni === 0) return tTesto('computer.seenToday', { time: ora(ms) })
    if (giorni === 1) return tTesto('computer.seenYesterday', { time: ora(ms) })
    const data = new Intl.DateTimeFormat(String(locale.value ?? 'it'), { day: '2-digit', month: '2-digit' }).format(ms)
    return tTesto('computer.seenOn', { date: data, time: ora(ms) })
}

/**
 * Fetta C, D-REM-2 (owner via Desktop (3), 24/10/2026: «Proponi di dimenticare»). Le voci vecchie di un PC vivo — quello appena
 * accoppiato, o uno in linea qui — si propongono UNA volta: stesso nome, stesso ponte, spente. Si aspetta che ogni candidata sia stata
 * letta: una voce che risponde è un altro PC col nome uguale (il desktop e la CLI sullo stesso PC) e non si propone mai.
 */
const risposteDoppi = ref(0)
const propostaDoppi = computed(() => {
    void risposteDoppi.value
    const vivi = fase.value.tipo === 'fatto' ? [fase.value.pc.pcId]
        : elenco.value.filter((pc) => statoDi(pc).tipo === 'inLinea').map((pc) => pc.pcId)
    for (const pcId of vivi) {
        const vivo = elenco.value.find((pc) => pc.pcId === pcId)
        if (!vivo || domandaDoppiGiaFatta(pcId)) continue
        const stessi = vociVecchieDi(vivo, elenco.value, () => false)
        if (!stessi.length || stessi.some((v) => statoDi(v).tipo === 'leggo')) continue
        const vecchie = vociVecchieDi(vivo, elenco.value, (id) => riquadri.value[id]?.tipo !== 'nonInLinea')
        if (vecchie.length) return { vivo, vecchie }
    }
    return null
})
const dimenticandoDoppi = ref(false)
/** Revisione del blocco 4, M-1: le voci che hanno risposto al «Sì» («Studio · 31ab»), dette dopo che la proposta si è chiusa. */
const rispostiAlSi = ref<string[]>([])
/** Revisione del blocco 4, S4: le voci che il dispositivo non è riuscito a dimenticare, dette invece di tacerle. */
const nonDimenticate = ref<string[]>([])
async function rispondiDoppi(si: boolean): Promise<void> {
    const proposta = propostaDoppi.value
    if (!remoti || !proposta || dimenticandoDoppi.value) return
    dimenticandoDoppi.value = true
    rispostiAlSi.value = []
    nonDimenticate.value = []
    let tutteFallite = false
    try {
        if (si) {
            // ⛔ revisione del blocco 4, M-1 (S3): la proposta legge chi è in linea UNA volta, e fra la proposta e il sì una voce può
            // tornare a rispondere (il ledger: b851 «tornato in linea alle 13:38»). Al «Sì» ogni candidata si rilegge, tutte insieme e
            // col tetto di `riepilogo`: chi risponde è un PC vivo, non si dimentica e la schermata lo dice. Le altre come prima.
            const letture = await Promise.all(proposta.vecchie.map(async (v) => ({ v, r: await remoti.riepilogo(v.pcId) })))
            const spente: typeof proposta.vecchie = []
            const rispondono: string[] = []
            for (const { v, r } of letture) {
                if (!r.inLinea) {
                    spente.push(v)
                    continue
                }
                riquadri.value = { ...riquadri.value, [v.pcId]: { tipo: 'inLinea', conteggi: r.conteggi } }
                ricordi.value = { ...ricordi.value, [v.pcId]: leggiRicordo(v.pcId) }
                rispondono.push(`${nomeDelPc(v.nome)} · ${codiceBreve(v.pcId)}`)
            }
            // revisione del blocco 4, S4: una voce che non si dimentica lo dice; se non se n'è dimenticata NESSUNA la domanda resta
            const esiti = await Promise.allSettled(spente.map((v) => remoti.dimenticaSoloQui(v.pcId)))
            const fallite = spente.filter((_, i) => esiti[i]!.status === 'rejected')
            nonDimenticate.value = fallite.map((v) => nomeECodice(v, t('computer.unnamed')))
            tutteFallite = spente.length > 0 && fallite.length === spente.length
            rispostiAlSi.value = rispondono
        }
        if (!tutteFallite) segnaDomandaDoppi(proposta.vivo.pcId)
        risposteDoppi.value++
        if (si) await remoti.aggiorna().catch(() => undefined)
    } finally {
        dimenticandoDoppi.value = false
    }
}

const azioni = computed<TalosRowAction[]>(() => [
    { id: 'settings', label: t('computer.settings'), testId: 'talos-computer-action-settings' },
    { id: 'forget', label: t('computer.forgetConfirm'), danger: true, testId: 'talos-computer-action-forget' },
])
const daDimenticare = ref<ComputerRicordato | null>(null)
const dimenticando = ref(false)
function agisci(pc: ComputerRicordato, azione: string): void {
    if (azione === 'settings') apri(pc)
    else daDimenticare.value = pc
}
/** Come «Dimentica questo computer» nelle Impostazioni (`ComputerItemScreen.vue`): a PC spento le chiavi si cancellano lo stesso. */
async function dimentica(): Promise<void> {
    const pc = daDimenticare.value
    if (!remoti || !pc || dimenticando.value) return
    dimenticando.value = true
    try {
        const { avvisato } = await remoti.dimentica(pc.pcId)
        if (!avvisato) {
            // D-MOCK-8: QUALE PC, col codice breve sempre: due voci dallo stesso nome davano due notifiche identiche
            const name = nomeECodice(pc, t('computer.unnamed'))
            talosNotify({ key: `computer:forget:${pc.pcId}`, channel: 'jobs', weight: 'notable', title: tTesto('computer.forgetOffline', { name }), at: Date.now() })
        }
        daDimenticare.value = null
    } finally {
        dimenticando.value = false
    }
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
                    {{ t('computer.connectShort') }}
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

            <!-- Fetta C, D-REM-2: le voci vecchie di un PC vivo, proposte UNA volta. Niente sparisce senza il sì. -->
            <section
                v-if="propostaDoppi"
                data-testid="talos-computer-old-entries"
                aria-labelledby="talos-computer-old-entries-title"
                class="mt-[var(--talos-space-section)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]"
            >
                <h2 id="talos-computer-old-entries-title" class="text-sm font-semibold text-[var(--talos-text)]">
                    {{ tTesto('computer.oldEntriesTitle', { count: propostaDoppi.vecchie.length, name: propostaDoppi.vivo.nome || t('computer.unnamed') }) }}
                </h2>
                <p class="mt-1 max-w-[52ch] text-sm leading-[1.7] text-[var(--talos-muted)]">{{ t('computer.oldEntriesHint') }}</p>
                <!-- D-MOCK-6: ogni voce col suo codice breve, così il sì si dà vedendo QUALI; le «di prova» per prime e segnate -->
                <ul class="mt-[var(--talos-space-inline)] flex flex-col gap-1" :aria-label="t('computer.oldEntriesList')">
                    <li
                        v-for="vecchia in propostaDoppi.vecchie"
                        :key="vecchia.pcId"
                        data-testid="talos-computer-old-entry"
                        :data-pc-id="vecchia.pcId"
                        class="flex min-w-0 items-center gap-2 text-sm text-[var(--talos-text)]"
                    >
                        <Laptop class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                        <span class="min-w-0 truncate">{{ vecchia.nome || t('computer.unnamed') }} · {{ codiceBreve(vecchia.pcId) }}</span>
                        <span
                            v-if="ricordi[vecchia.pcId]?.effimero"
                            data-testid="talos-computer-test-tag"
                            class="shrink-0 rounded-full border border-[var(--talos-border)] px-2 text-xs leading-5 text-[var(--talos-muted)]"
                        >{{ t('computer.testEntry') }}</span>
                    </li>
                </ul>
                <div class="mt-[var(--talos-space-section)] flex flex-col gap-[var(--talos-space-inline)] sm:flex-row">
                    <Button
                        type="button"
                        data-testid="talos-computer-old-entries-yes"
                        :disabled="dimenticandoDoppi"
                        class="talos-pressable min-h-touch bg-[var(--talos-accent)] px-5 text-[var(--talos-accent-text)]"
                        @click="rispondiDoppi(true)"
                    >
                        {{ t('computer.oldEntriesYes') }}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        data-testid="talos-computer-old-entries-no"
                        :disabled="dimenticandoDoppi"
                        class="talos-pressable min-h-touch"
                        @click="rispondiDoppi(false)"
                    >
                        {{ t('computer.oldEntriesNo') }}
                    </Button>
                </div>
            </section>
            <!-- revisione del blocco 4, M-1: chi ha risposto al «Sì» resta nell'elenco, e si dice; la proposta intanto si è chiusa -->
            <p
                v-if="rispostiAlSi.length"
                role="status"
                data-testid="talos-computer-old-entries-answered"
                class="mt-[var(--talos-space-section)] max-w-[52ch] text-sm leading-[1.7] text-[var(--talos-muted)]"
            >{{ tTesto('computer.oldEntriesAnswered', { count: rispostiAlSi.length, names: rispostiAlSi.join(', ') }) }}</p>
            <!-- revisione del blocco 4, S4: una voce che non si è dimenticata non si tace -->
            <p
                v-if="nonDimenticate.length"
                role="alert"
                data-testid="talos-computer-old-entries-failed"
                class="mt-[var(--talos-space-section)] max-w-[52ch] text-sm leading-[1.7] text-[var(--talos-text)]"
            >{{ tTesto('computer.oldEntriesForgetFailed', { count: nonDimenticate.length, names: nonDimenticate.join(', ') }) }}</p>

            <ul v-if="elenco.length" class="mt-[var(--talos-space-section)] flex flex-col gap-[var(--talos-space-inline)]" :aria-label="t('computer.listLabel')">
                <li
                    v-for="pc in ordinati"
                    :key="pc.pcId"
                    data-testid="talos-computer-card"
                    :data-pc-id="pc.pcId"
                    :data-computer-stato="statoDi(pc).tipo"
                    class="rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]"
                >
                    <div class="flex items-center gap-[var(--talos-space-control)]">
                        <Laptop class="size-5 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                        <!-- il nome apre le Impostazioni del PC, come «Impostazioni» nel ⋯ (tavola 2) -->
                        <button
                            type="button"
                            data-testid="talos-computer-card-name"
                            class="talos-pressable min-h-touch min-w-0 flex-1 truncate text-left text-base font-semibold text-[var(--talos-text)]"
                            @click="apri(pc)"
                        >{{ nomeConCodice(pc, elenco, t('computer.unnamed')) }}</button>
                        <TalosRowActions
                            :test-id="`talos-computer-actions-${pc.pcId}`"
                            :label="tTesto('computer.actionsFor', { name: nomeConCodice(pc, elenco, t('computer.unnamed')) })"
                            :items="azioni"
                            @select="(azione) => agisci(pc, azione)"
                        />
                    </div>
                    <!-- fetta C, Desktop (3) 24/10: desktop o CLI sullo stesso PC (`pc.programma`), se il dispositivo lo sa -->
                    <p v-if="ricordi[pc.pcId]?.programma || ricordi[pc.pcId]?.effimero" class="-mt-1 flex min-w-0 items-center gap-2 text-xs text-[var(--talos-muted)]">
                        <span v-if="ricordi[pc.pcId]?.programma" data-testid="talos-computer-card-program" class="min-w-0 truncate">{{ ricordi[pc.pcId]!.programma }}</span>
                        <!-- owner 24/10 «Sì, adesso»: PC col portachiavi di prova (desktop f1199ace0), la sua identità non dura -->
                        <span
                            v-if="ricordi[pc.pcId]?.effimero"
                            data-testid="talos-computer-test-tag"
                            class="shrink-0 rounded-full border border-[var(--talos-border)] px-2 leading-5"
                        >{{ t('computer.testEntry') }}</span>
                    </p>
                    <p data-testid="talos-computer-card-status" class="flex items-center gap-2 text-sm text-[var(--talos-muted)]">
                        <template v-if="statoDi(pc).tipo === 'leggo'">{{ t('computer.checking') }}</template>
                        <template v-else-if="statoDi(pc).tipo === 'inLinea'">
                            <span class="size-2 rounded-full bg-[var(--talos-success)]" aria-hidden="true" /><span class="text-[var(--talos-text)]">{{ t('computer.online') }}</span>
                        </template>
                        <template v-else-if="ricordi[pc.pcId]?.vistoAlle">{{ tTesto('computer.offlineSeen', { when: quandoVisto(ricordi[pc.pcId]!.vistoAlle!) }) }}</template>
                        <template v-else>{{ t('computer.offline') }}</template>
                    </p>
                    <p
                        v-if="numeriDi(pc)"
                        data-testid="talos-computer-card-counts"
                        :data-vecchi="numeriDi(pc)!.letteAlle !== null ? 'true' : undefined"
                        class="mt-[var(--talos-space-inline)] flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
                        :class="numeriDi(pc)!.letteAlle !== null ? 'text-[var(--talos-muted)]' : 'text-[var(--talos-text)]'"
                    >
                        <span class="flex items-baseline gap-1.5">
                            <span class="text-2xl font-semibold leading-none tabular-nums">{{ numeriDi(pc)!.conteggi.totale }}</span>
                            <span>{{ t('computer.sessionsCount', { count: numeriDi(pc)!.conteggi.totale }) }}</span>
                        </span>
                        <span v-if="numeriDi(pc)!.conteggi.inCorso">{{ t('computer.runningCount', { count: numeriDi(pc)!.conteggi.inCorso }) }}</span>
                        <span
                            v-if="numeriDi(pc)!.conteggi.aspettaTe"
                            :class="numeriDi(pc)!.letteAlle === null ? 'font-semibold text-[var(--talos-accent)]' : undefined"
                        >{{ t('computer.waitingCount', { count: numeriDi(pc)!.conteggi.aspettaTe }) }}</span>
                        <span v-if="numeriDi(pc)!.letteAlle !== null">{{ tTesto('computer.countsAt', { when: quando(numeriDi(pc)!.letteAlle!) }) }}</span>
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        data-testid="talos-computer-open-codice"
                        class="talos-pressable mt-[var(--talos-space-section)] min-h-touch w-full"
                        @click="apriNelCodice(pc)"
                    >
                        {{ t('computer.openInCodice') }}
                    </Button>
                </li>
            </ul>
        </template>

        <TalosMobileConfirmDialog
            v-if="daDimenticare"
            :title="tTesto('computer.forgetTitle', { name: nomeConCodice(daDimenticare, elenco, t('computer.unnamed')) })"
            :description="t('computer.forgetBody')"
            @close="dimenticando ? undefined : daDimenticare = null"
        >
            <template #footer>
                <Button type="button" variant="outline" :disabled="dimenticando" class="min-h-12" @click="daDimenticare = null">
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

