<script setup lang="ts">
/**
 * Harness UI (24/8) — the list, native Vue. 28/8: real sessions, not the
 * static five-row demo array anymore (owner: "la lista sessioni nella
 * sidebar di sinistra ancora è mockup e bisogna attaccarla alle sessioni
 * reali" — the very next step the demo array's own comment had flagged as
 * open). Local-first: `codiceSessions.ts` reads/writes the on-device
 * repository directly, nothing here reaches a network or a PC — see
 * [[mobile-app-local-first-requirement]].
 *
 * `embedded` (24/8, sidebar refactor): owner, after watching the real Claude
 * app — one physical sidebar slot, contextual content, not two panels side
 * by side. TalosTabletSidebar.vue mounts THIS component here, in place of
 * ChatsScreen, when the active station is Harness — same idiom ChatsScreen
 * already uses for its own `embedded` prop (no TalosMobileScreen chrome:
 * that shell's own H1/opaque background are right for a routed station, and
 * wrong for a panel that already lives inside the rail's translucent header).
 *
 * 28/8, second increment — [[harness-lista-sessioni-layout-libreria]]: the
 * row now mirrors the Library's own grammar (`TalosMobileLibraryFileRow.vue`
 * — icon badge, title, meta line, actions slot), not a bespoke button row.
 * `TalosMobileLibraryFileRow` itself is NOT reused directly — its `file`
 * prop is typed to `TalosLocalVaultFile` and renders a vault-file glyph, a
 * different shape than a session — so this mirrors the LAYOUT (the memory
 * note's own instruction: "sostituire con lo stesso SCHEMA riga", not "lo
 * stesso componente"), not the component. Still fixed to LIST (no grid
 * toggle — Library has one, Harness deliberately doesn't).
 *
 * Rename/delete also added this pass (`codiceSessions.ts`, `TalosRowActions`
 * — the same visible per-row menu Chat/Library use, not swipe-only:
 * researched 28/8, current accessibility guidance wants a visible button
 * alternative for any gesture-based action). "Stati e notifiche per
 * sessione" from the SAME memory note was not here — it needed a live
 * status signal no backend provided yet
 * ([[stessa-ui-mobile-desktop-backend-diverso]]).
 *
 * ⭐⭐⭐ 2/9, piano §16.1 — CHIUSO IN PARTE: owner, dopo aver visto la
 * lista sessioni di Claude Code stesso ("gli spinner che mostrano il
 * caricamento l'esito l'ultimo messaggio"). Il segnale ORA esiste — non
 * inventato: `session-registry.mjs`, `elenca()`, già la fonte di questa
 * stessa lista lato server, riusa `messaggiFinali` (la conversazione
 * strutturata già fidata da resume()/compatta()) invece di uno stato
 * nuovo. Best-effort per costruzione (`fetchTalosHarnessSessionsStatus`):
 * il server on-device è spento finché nessuna sessione specifica lo
 * stagia — chi guarda solo questa lista lo trova magari spento, e la riga
 * resta quella di sempre, mai un errore mostrato per questo.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { Check, CircleAlert, CircleX, Clock, Loader2, MessageSquarePlus, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileNewChatFab from '@/components/shell/TalosMobileNewChatFab.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import { deleteCodiceSession, listCodiceSessions, renameCodiceSession } from '@/lib/harness/codiceSessions'
import { fetchTalosHarnessSessionsStatus, type TalosHarnessSessionStatus } from '@/lib/harness/harnessUiSessionStatus'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import { avvisaSePonteStaccato } from '@/lib/harness/avvisoPonteCodice'
import { talosCodiceInCasa, talosR4Disponibile, talosR4Pronto } from '@/lib/harness/terminalePonte'
import { ROTTA_RIPIEGO_R4 } from '@/lib/harness/r4/sceltaCodiceR4'
import { eliminaSessioneR4, fraseRifiutoSessioneR4, leggiSessioniR4, rinominaSessioneR4 } from '@/lib/harness/r4/elencoSessioniR4'
import { annunciaCambioSessioneR4, talosCambiSessioniR4 } from '@/lib/harness/r4/avvisiSessioniR4'
import { talosClienteR4 } from '@/lib/harness/r4/clienteR4'
import { talosHarnessUiAvailable } from '@/services/harnessUi'
import { useTalosMobileToasts } from '@/stores/toasts'
import { talosChatDateBuckets } from '@/lib/chat/chatDateBuckets'
import { chatRowBucketTitle, chatRowWhenInBucket } from '@/lib/chat/chatRowTime'
import { talosRelativeTime } from '@/lib/relativeTime'

const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const router = useRouter()
const route = useRoute()
const { t, tTesto, locale } = useTalosI18n()
const toasts = useTalosMobileToasts()

/** Una riga dell'elenco: una sessione del Codice classico o una di r4 (`elencoSessioniR4.ts`), la pagina usa solo questi tre campi. */
type TalosRigaElenco = Pick<TalosLocalChatSession, 'id' | 'title' | 'updated_at'>

const sessions = ref<TalosRigaElenco[]>([])
const loading = ref(true)
/**
 * ⛔ Owner 18/10 «non riesco andare alla lista delle sessioni … esattamente come sulla chat Legacy» (ledger
 * `LEDGER-ELENCO-SESSIONI-R4-2026-10-18.md`): con r4 nell'APK questa pagina elenca le sessioni di r4 e le apre su `/codice-r4/:id`.
 * Prima (K4-E, 17/10) rimandava subito a r4, che un elenco suo non ce l'ha: dal Codice non si tornava più all'elenco.
 */
const suR4 = ref(false)
/** REV-ELENCO-05: l'elenco che non si legge ha il suo avviso, che sparisce alla prima lettura riuscita (gli errori delle azioni no). */
const erroreElenco = ref<string | null>(null)
/**
 * REV-ELENCO-03: la lettura di r4 può durare fino a ~20 s (r4 che si accende, `leggiSessioniR4`); una lettura partita prima che
 * finisce dopo una più nuova rimetteva l'elenco vecchio. Vale solo l'ultima partita.
 */
let ultimaLettura = 0
/** ⭐⭐⭐ 2/9 — piano §16.1: per sessionId, quando il server on-device risponde. Assente = "non lo so ancora, o il server è spento" — mai un valore inventato. */
const serverStatus = ref<Map<string, TalosHarnessSessionStatus>>(new Map())

/**
 * Vero se l'elenco viene da r4: l'APK lo porta, non si è sul ripiego, e r4 si accende (`talosR4Pronto`, idempotente). Se non si
 * accende, la pagina torna al Codice classico dicendolo, come fa la sessione su r4 (`CodiceR4Screen.vue`).
 */
async function sorgenteR4(): Promise<boolean> {
    if (route.query?.ripiego === '1' || !(await talosR4Disponibile())) return false
    if (await talosR4Pronto()) return true
    // REV-ELENCO-04: lo dice la pagina, una volta; la colonna del tablet (`embedded`) monta insieme a lei e non ripete né sposta
    if (route.name === 'harness' && !props.embedded) {
        toasts.push({ message: t('harness.r4Fallback'), durationMs: 6000 })
        void router.replace(ROTTA_RIPIEGO_R4)
    }
    return false
}

async function refresh(): Promise<void> {
    const questa = ++ultimaLettura
    loading.value = true
    try {
        const r4 = await sorgenteR4()
        if (questa !== ultimaLettura) return
        suR4.value = r4
        if (r4) {
            const righe = await leggiSessioniR4(talosClienteR4())
            if (questa !== ultimaLettura) return
            sessions.value = righe
            serverStatus.value = new Map(righe.map((riga) => [riga.id, riga.stato]))
            erroreElenco.value = null
            return
        }
        const vecchie = await listCodiceSessions()
        if (questa !== ultimaLettura) return
        sessions.value = vecchie
    } catch (error) {
        if (!suR4.value) throw error
        if (questa === ultimaLettura) erroreElenco.value = tTesto('harness.r4ListFailed', { detail: dettaglioErrore(error) })
        return
    } finally {
        if (questa === ultimaLettura) loading.value = false
    }
    // Non bloccante apposta: la lista nativa è già a schermo, questo arriva
    // quando/se il server on-device risponde (best-effort, vedi
    // harnessUiSessionStatus.ts). Il modulo non lancia mai per costruzione —
    // il `catch` qui è una seconda barriera, non la prima: uno schermo non
    // deve mai dipendere da una promessa interna per restare in piedi.
    void fetchTalosHarnessSessionsStatus()
        .then((mappa) => { serverStatus.value = mappa })
        .catch(() => {})
}

function statoServer(session: TalosRigaElenco): TalosHarnessSessionStatus | undefined {
    return serverStatus.value.get(session.id)
}

/**
 * ⭐⭐⭐ 2/9 — un badge alla volta, mai due segnali insieme. Owner:
 * "esattamente come fa desktop... metti anche lo stato" — stesso
 * ORDINE di precedenza di `statoSessione()` (harness-ui/public/app.js,
 * lato desktop, stesso giorno): attesa d'approvazione vince su "in
 * corso" (un turno può essere tecnicamente ancora aperto ma fermo ad
 * aspettare una persona — sono due fatti diversi), "in corso" vince su
 * "interrotta" (una sessione che sta ripartendo non è più interrotta),
 * "interrotta" vince su "errore" (un crash è un tipo di interruzione,
 * non il contrario). `successo`/`ignoto` restano `idle`: la riga dice
 * quello che ha sempre detto (l'ora relativa) — su una lista stretta
 * quanto quella mobile, un'etichetta "Conclusa" ripetuta su ogni riga
 * normale sarebbe rumore, non informazione (adattamento dichiarato,
 * non un buco: il DATO sotto è lo stesso di desktop, cambia solo cosa
 * si sceglie di mostrare quando non c'è niente di eccezionale da dire).
 */
interface TalosHarnessRowBadge { kind: 'running' | 'interrupted' | 'waiting-approval' | 'error' | 'idle', label: string }

function statusBadge(session: TalosRigaElenco, bucket: string): TalosHarnessRowBadge {
    const stato = statoServer(session)
    // ELENCO-R4-PAG-06 (Pad, 18/10): con r4 l'attesa è di qualunque tipo (approvazione, domanda, piano) e una sessione interrotta da
    // un riavvio resta non conclusa: ordine e parola del desktop (`statoSessione()`, harness-ui `app.js`: attesa, interrotta, in corso)
    if (stato?.inAttesaApprovazione) return { kind: 'waiting-approval', label: t(suR4.value ? 'harness.statusWaitingForYou' : 'harness.statusWaitingApproval') }
    if (suR4.value && stato?.interrotta) return { kind: 'interrupted', label: t('harness.statusInterrupted') }
    if (stato && !stato.conclusa) return { kind: 'running', label: t('harness.statusRunning') }
    if (stato?.interrotta) return { kind: 'interrupted', label: t('harness.statusInterrupted') }
    if (stato?.ultimoEsito === 'errore') return { kind: 'error', label: t('harness.statusError') }
    return { kind: 'idle', label: quandoInFascia(bucket, session.updated_at) }
}

onMounted(refresh)
/*
 * ⭐ 12/9 — l'avviso del collegamento vale per la SEZIONE, non per la singola
 * sessione: chi apre la lista è già dentro Codice. Lo stesso latch che vive nel
 * modulo impedisce il doppione quando, sul tablet, questa lista incorporata e la
 * schermata instradata montano nello stesso istante.
 */
onMounted(async () => {
    // K4-E: con r4 l'avviso del collegamento del Codice classico non serve (r4 vive nell'app)
    if (route.query?.ripiego !== '1' && await talosR4Disponibile()) return
    void avvisaSePonteStaccato({ router, toasts, t, sezioneDisponibile: talosHarnessUiAvailable(), codiceInCasa: talosCodiceInCasa })
})
/**
 * The list stays mounted across `harness` ↔ `harness-session/:id` on the
 * tablet rail (TalosTabletSidebar.vue never unmounts it, same panel slot) —
 * `onMounted` alone would miss a session created from the composer and
 * never see it until an unrelated remount.
 *
 * ⛔ FOUND LIVE ON DEVICE, not by reading the code: watching only
 * `route.name` missed the exact moment that matters most — the draft
 * ('new') → real id transition never changes the NAME (`harness-session`
 * the whole time), only the `:id` param, so the freshly-created session
 * silently never appeared in the tablet's own sidebar until an unrelated
 * navigation. Re-fetching on every `harness`/`harness-session` visit
 * covers the list route (unchanged), the draft→real transition (the fix),
 * and switching between two existing sessions (already correct, now also
 * cheap and harmless to repeat).
 */
watch(() => [route.name, route.params.id], () => {
    // 18/10: anche `codice-r4` (sul tablet l'elenco resta montato accanto alla sessione r4: la bozza che diventa sessione vera)
    if (route.name === 'harness' || route.name === 'harness-session' || route.name === 'codice-r4') void refresh()
})

const relativeTimeLabels = computed(() => ({
    justNow: t('chat.justNow'),
    minutesAgo: (count: number) => t('chat.minutesAgo', { count }),
    hoursAgo: (count: number) => t('chat.hoursAgo', { count }),
    daysAgo: (count: number) => t('chat.daysAgo', { count }),
}))
function updatedAt(value: string): string {
    return talosRelativeTime(value, new Date(), relativeTimeLabels.value)
}
function quandoInFascia(bucket: string, iso: string): string {
    return chatRowWhenInBucket(bucket, iso, locale.value, updatedAt)
}
function titoloFascia(gruppo: { bucket: string, monthKey: string | null }): string {
    return chatRowBucketTitle(gruppo, locale.value, (bucket) => t(`harness.groups.${bucket}`))
}

const fasce = computed(() => talosChatDateBuckets(sessions.value, (session) => session.updated_at, new Date()))

function openSession(session: TalosRigaElenco): void {
    if (suR4.value) {
        void router.push({ name: 'codice-r4', params: { id: session.id } })
        return
    }
    void router.push({ name: 'harness-session', params: { id: session.id } })
}

function newSession(): void {
    // Draft state, no row created yet — HarnessSessionScreen.vue creates the
    // real session lazily, on the FIRST message actually sent. Pressing
    // "New" and typing straight into a blank Codice page both end up on
    // this exact same path (owner, 28/8: sending directly must work too,
    // not only the button). r4 does the same: `/codice-r4` without an id is the draft.
    if (suR4.value) {
        void router.push({ name: 'codice-r4' })
        return
    }
    void router.push({ name: 'harness-session', params: { id: 'new' } })
}

function isCurrentSession(session: TalosRigaElenco): boolean {
    if (suR4.value) return route.name === 'codice-r4' && String(route.params.id ?? '') === session.id
    return route.name === 'harness-session' && String(route.params.id ?? '') === session.id
}

// F4-#22 (same discipline ChatsScreen.vue already applies): a session
// action must never fail silently — the real error stays visible until the
// owner closes the dialog it happened in.
const actionError = ref<string | null>(null)
const actionBusy = ref(false)
function actionErrorText(error: unknown): string {
    return error instanceof Error && error.message ? error.message : String(error)
}
/**
 * REV-ELENCO-01/02: il perché di un rifiuto di r4 nella lingua dell'app (la busta porta un `message` generico come «Invalid query»:
 * conta il motivo, `fraseRifiutoSessioneR4`), e r4 che non risponde a parole, non col codice del client nativo.
 */
function dettaglioErrore(error: unknown): string {
    const frase = fraseRifiutoSessioneR4(error, locale.value)
    if (frase) return frase
    if (error instanceof Error && error.message === 'TALOS_R4_IRRAGGIUNGIBILE') return t('harness.r4Unreachable')
    return actionErrorText(error)
}
/** REV-ELENCO-07: l'ultimo annuncio fatto da questa pagina, che si è già riletta da sé. */
let mioAnnuncio = -1
function annuncia(cambio: { id: string; nome?: string; eliminata?: boolean }): void {
    annunciaCambioSessioneR4(cambio)
    mioAnnuncio = talosCambiSessioniR4.value.n
}
watch(() => talosCambiSessioniR4.value.n, (n) => {
    if (n !== mioAnnuncio && suR4.value) void refresh()
})

/**
 * REV-ELENCO-10 (review avversariale v0.1.42): una riga «In corso» (un'automazione, un giro lasciato a metà) restava ferma finché non
 * si cambiava pagina. Come il battito del desktop per le figlie (`legacy/app.js:11666`, 5 s): l'elenco si rilegge ogni 5 s solo
 * finché una riga lavora o aspetta qualcuno, e mai con l'app in sottofondo.
 */
const qualcunaLavora = computed(() => suR4.value && [...serverStatus.value.values()]
    .some((stato) => stato.inAttesaApprovazione || (!stato.conclusa && !stato.interrotta)))
let battito: ReturnType<typeof setInterval> | null = null
onMounted(() => {
    battito = setInterval(() => {
        if (qualcunaLavora.value && document.visibilityState === 'visible') void refresh()
    }, 5000)
})
onBeforeUnmount(() => {
    if (battito !== null) clearInterval(battito)
})

function sessionActions(): TalosRowAction[] {
    return [
        { id: 'rename', label: t('common.rename'), testId: 'talos-harness-action-rename' },
        { id: 'delete', label: t('common.delete'), danger: true, testId: 'talos-harness-action-delete' },
    ]
}

function act(session: TalosRigaElenco, action: string): void {
    if (action === 'rename') void openRename(session)
    else openDelete(session)
}

const renameTarget = ref<TalosRigaElenco | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

async function openRename(session: TalosRigaElenco): Promise<void> {
    actionError.value = null
    renameTarget.value = session
    renameValue.value = session.title
    await nextTick()
    renameInput.value?.select()
}

async function submitRename(): Promise<void> {
    const target = renameTarget.value
    const title = renameValue.value.trim()
    if (!target || !title || actionBusy.value) return
    actionBusy.value = true
    try {
        if (suR4.value) {
            await rinominaSessioneR4(talosClienteR4(), target.id, title)
            annuncia({ id: target.id, nome: title })
        } else await renameCodiceSession(target.id, title)
        renameTarget.value = null
        actionError.value = null
        await refresh()
    } catch (error) {
        actionError.value = tTesto('harness.renameFailed', { detail: dettaglioErrore(error) })
    } finally {
        actionBusy.value = false
    }
}

const deleteTarget = ref<TalosRigaElenco | null>(null)

function openDelete(session: TalosRigaElenco): void {
    actionError.value = null
    deleteTarget.value = session
}

async function confirmDelete(): Promise<void> {
    const target = deleteTarget.value
    if (!target || actionBusy.value) return
    actionBusy.value = true
    try {
        if (suR4.value) {
            await eliminaSessioneR4(talosClienteR4(), target.id)
            annuncia({ id: target.id, eliminata: true })
        } else await deleteCodiceSession(target.id)
        deleteTarget.value = null
        actionError.value = null
        await refresh()
    } catch (error) {
        actionError.value = tTesto('harness.deleteFailed', { detail: dettaglioErrore(error) })
    } finally {
        actionBusy.value = false
    }
}
</script>

<template>
    <TalosMobileScreen :title="t('navigation.harness')" :embedded="embedded" data-testid="talos-harness-screen">
        <div class="flex flex-col gap-4">
            <button
                v-if="embedded"
                type="button"
                data-testid="talos-harness-new"
                :aria-label="t('harness.newSessionAria')"
                class="talos-pressable flex min-h-touch shrink-0 items-center gap-2 rounded-xl bg-[var(--talos-accent,var(--primary))] px-3 text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                @click="newSession"
            >
                <MessageSquarePlus class="size-4" aria-hidden="true" />
                {{ t('harness.newSession') }}
            </button>

            <p v-if="actionError" role="alert" class="px-1 text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ actionError }}</p>
            <p v-if="erroreElenco" role="alert" data-testid="talos-harness-list-error" class="px-1 text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ erroreElenco }}</p>

            <p v-if="!loading && !sessions.length && !erroreElenco" data-testid="talos-harness-empty" class="px-1 text-sm text-[var(--talos-muted)]">
                {{ t('harness.emptyBody') }}
            </p>

            <div v-for="gruppo in fasce" :key="gruppo.monthKey ?? gruppo.bucket">
                <p class="px-1 pb-1 text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                    {{ titoloFascia(gruppo) }}
                </p>
                <div role="list" class="flex flex-col gap-0.5">
                    <div
                        v-for="session in gruppo.items"
                        :key="session.id"
                        role="listitem"
                        class="flex min-w-0 items-center gap-3 rounded-xl px-1 py-1"
                        :class="{ 'bg-[var(--talos-active)]': isCurrentSession(session) }"
                    >
                        <!-- owner 16/10: niente casella con la provetta (uguale per tutte, non diceva niente): titolo e stato, come le chat -->
                        <button
                            type="button"
                            data-testid="talos-harness-row"
                            :data-harness-session-id="session.id"
                            :data-harness-active="isCurrentSession(session) ? 'true' : undefined"
                            :aria-current="isCurrentSession(session) ? 'page' : undefined"
                            class="talos-pressable block min-h-12 min-w-0 flex-1 text-left"
                            @click="openSession(session)"
                        >
                            <span class="line-clamp-2 text-sm font-medium text-[var(--talos-text)]">{{ session.title }}</span>
                            <span
                                data-testid="talos-harness-row-status"
                                :data-harness-status="statusBadge(session, gruppo.bucket).kind"
                                class="mt-0.5 flex items-center gap-1.5 text-xs"
                                :class="{
                                    'text-[var(--talos-danger,#dc5b5b)]': ['interrupted', 'error'].includes(statusBadge(session, gruppo.bucket).kind),
                                    'font-semibold text-[var(--talos-accent)]': statusBadge(session, gruppo.bucket).kind === 'waiting-approval',
                                    'text-[var(--talos-muted)]': !['interrupted', 'error', 'waiting-approval'].includes(statusBadge(session, gruppo.bucket).kind),
                                }"
                            >
                                <Loader2
                                    v-if="statusBadge(session, gruppo.bucket).kind === 'running'"
                                    class="size-3 shrink-0 animate-spin text-[var(--talos-accent)]"
                                    :aria-label="t('harness.statusRunningAria')"
                                />
                                <Clock
                                    v-else-if="statusBadge(session, gruppo.bucket).kind === 'waiting-approval'"
                                    class="size-3 shrink-0"
                                    aria-hidden="true"
                                />
                                <CircleAlert
                                    v-else-if="statusBadge(session, gruppo.bucket).kind === 'interrupted'"
                                    class="size-3 shrink-0"
                                    aria-hidden="true"
                                />
                                <CircleX
                                    v-else-if="statusBadge(session, gruppo.bucket).kind === 'error'"
                                    class="size-3 shrink-0"
                                    aria-hidden="true"
                                />
                                {{ statusBadge(session, gruppo.bucket).label }}
                            </span>
                            <span
                                v-if="statoServer(session)?.ultimoMessaggio"
                                data-testid="talos-harness-row-preview"
                                class="mt-0.5 line-clamp-2 text-xs text-[var(--talos-muted)]"
                            >{{ statoServer(session)!.ultimoMessaggio }}</span>
                        </button>
                        <div class="flex shrink-0 items-center">
                            <TalosRowActions
                                :test-id="`talos-harness-actions-${session.id}`"
                                :label="tTesto('harness.actionsFor', { title: session.title })"
                                :items="sessionActions()"
                                @select="(action) => act(session, action)"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Full-page (phone, routed): same floating pill Chat uses, own wording. -->
        <div
            v-if="!embedded"
            class="sticky bottom-0 z-20 mt-auto flex justify-end bg-gradient-to-t from-[var(--talos-background)] via-[var(--talos-background)]/85 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 landscape:pb-2 landscape:pt-3"
        >
            <TalosMobileNewChatFab
                :label="t('harness.newSession')"
                :aria-label="t('harness.newSessionAria')"
                @click="newSession"
            />
        </div>

        <TalosMobileConfirmDialog
            v-if="renameTarget !== null"
            :title="t('harness.renameTitle')"
            :description="t('harness.renameDescription')"
            @close="renameTarget = null"
        >
            <input
                ref="renameInput"
                v-model="renameValue"
                :maxlength="suR4 ? 80 : undefined"
                :aria-label="t('harness.sessionName')"
                class="min-h-touch w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                @keydown.enter.prevent="submitRename"
            >
            <template #footer>
                <Button type="button" variant="ghost" @click="renameTarget = null"><X class="size-4" aria-hidden="true" /> {{ t('common.cancel') }}</Button>
                <Button type="button" :disabled="!renameValue.trim() || actionBusy" @click="submitRename">
                    <Check class="size-4" aria-hidden="true" /> {{ t('common.save') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>

        <TalosMobileConfirmDialog
            v-if="deleteTarget !== null"
            :title="t('harness.deleteTitle')"
            :description="tTesto('harness.deleteDescription', { title: deleteTarget.title })"
            @close="actionBusy ? undefined : deleteTarget = null"
        >
            <template #footer>
                <Button type="button" variant="ghost" :disabled="actionBusy" @click="deleteTarget = null"><X class="size-4" aria-hidden="true" /> {{ t('common.cancel') }}</Button>
                <Button type="button" variant="destructive" data-testid="talos-harness-delete-confirm" :disabled="actionBusy" @click="confirmDelete">
                    {{ t('common.delete') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>
    </TalosMobileScreen>
</template>
