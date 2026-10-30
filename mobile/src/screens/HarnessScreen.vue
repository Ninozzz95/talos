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
 *
 * Mockup remoto approvato dall'owner il 23/10, tavola 3: le sessioni dei PC collegati stanno qui, insieme a quelle del dispositivo,
 * col filtro «Dove» (Tutte · Qui · un PC; dal Computer si arriva con `?dove=<pcId>`). Il filtro compare solo con un PC collegato;
 * sul telefono è un pulsante che apre la scelta, dove c'è posto le voci stanno in fila (`@container`). In «Tutte» ogni sessione del
 * PC porta il suo nome (come t3code, `ArchivedThreadsScreen.tsx:167-178`). Un PC che non risponde lo si dice, come Claude Code
 * («sessions on other machines may be missing»). Le righe del PC rinominano ed eliminano come le mie, sul ponte (revisione del
 * blocco 3, owner 24/10/2026 «Sì, uguali alle locali»); il consenso della cartella lo decide il PC.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { AlertTriangle, Check, ChevronDown, CircleDashed, Clock, Laptop, Loader2, MessageSquarePlus, RefreshCw, RotateCcw, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosMobileElencoTesta from '@/components/talos/ui/TalosMobileElencoTesta.vue'
import TalosMobileStationOptionsSheet, { type TalosStationOptionGroup } from '@/components/talos/ui/TalosMobileStationOptionsSheet.vue'
import { useTalosTabletLayout } from '@/composables/useTalosTabletLayout'
import { CHIAVI_SCHEDE, SCHEDE_CODICE, contaSchede, filtraSessioni, statoDellaSessione, vociDove, type SchedaCodice } from '@/lib/harness/elencoSessioniCodice'
import { statoConAgentiR4, testoFermaTuttoR4 } from '@/lib/harness/r4/fermaTuttoR4'
import { aperturaCodiceTablet, riapriCodiceTablet } from '@/lib/tabletLayout'
import TalosAttesaCarta from '@/components/chat/TalosAttesaCarta.vue'
import TalosRigaInCorso from '@/components/chat/TalosRigaInCorso.vue'
import { useTalosSogliaSecondi } from '@/composables/useTalosSogliaSecondi'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import TalosThemedFilter, { type TalosFilterOption } from '@/components/talos/ui/TalosThemedFilter.vue'
import TalosNuovaSessioneSulPc from '@/components/remoto/TalosNuovaSessioneSulPc.vue'
import { useComputerRemoti } from '@/lib/remoto/computerRemoti'
import { MOTIVO_TROPPE_RICHIESTE, consensoRichiesto, fraseDelConsenso } from '@/lib/remoto/consensoDelPc'
import { fraseErroreRemoto } from '@/lib/remoto/frasiRemoto'
import { leggiRicordo, nomeConCodice, nomeECodice } from '@/lib/remoto/ricordiDelPc'
import { doveDelCodice } from '@/lib/remoto/doveDelCodice'
import { deleteCodiceSession, listCodiceSessions, renameCodiceSession } from '@/lib/harness/codiceSessions'
import { fetchTalosHarnessSessionsStatus, type TalosHarnessSessionStatus } from '@/lib/harness/harnessUiSessionStatus'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import { avvisaSePonteStaccato } from '@/lib/harness/avvisoPonteCodice'
import { talosCodiceInCasa, talosR4Disponibile, talosR4Pronto } from '@/lib/harness/terminalePonte'
import { ROTTA_RIPIEGO_R4 } from '@/lib/harness/r4/sceltaCodiceR4'
import { RifiutoSessioneR4, eliminaSessioneR4, fraseRifiutoSessioneR4, leggiSessioniR4, rinominaSessioneR4, type TalosRigaSessioneR4 } from '@/lib/harness/r4/elencoSessioniR4'
import { annunciaCambioSessioneR4, talosCambiSessioniR4 } from '@/lib/harness/r4/avvisiSessioniR4'
import { talosClienteR4 } from '@/lib/harness/r4/clienteR4'
import { talosHarnessUiAvailable } from '@/services/harnessUi'
import { useTalosMobileToasts } from '@/stores/toasts'
import { talosChatDateBuckets } from '@/lib/chat/chatDateBuckets'
import { chatRowBucketTitle, chatRowWhenInBucket } from '@/lib/chat/chatRowTime'
import { talosRelativeTime } from '@/lib/relativeTime'
import { oraSulDispositivo, scartoDelPc } from '@/lib/remoto/scartoOrologioPc'

const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

const router = useRouter()
const route = useRoute()
const { t, tTesto, locale } = useTalosI18n()
const toasts = useTalosMobileToasts()

/**
 * Una riga dell'elenco: una sessione del Codice classico o una di r4 (`elencoSessioniR4.ts`). Tavola 3: una sessione di un PC porta
 * anche il suo `pcId`, il suo stato (letto sul ponte, non dal server del dispositivo) e il nome della cartella.
 */
type TalosRigaElenco = Pick<TalosLocalChatSession, 'id' | 'title' | 'updated_at'> & {
    pcId?: string
    statoPc?: TalosHarnessSessionStatus
    progetto?: string
    /** «Ferma tutto», «Elenco» (owner 29/10 sera): gli agenti vivi sotto una sessione di r4 (`elencoSessioniR4.ts`), assente a zero. */
    agentiAlLavoro?: number
}

const sessions = ref<TalosRigaElenco[]>([])
const loading = ref(true)
/**
 * E1 (owner 29/10 notte, un segno d'attesa per schermo sul tablet): la colonna mette la sua riga piccola solo quando a destra c'è già
 * qualcosa (una sessione aperta). Sulla rotta dell'elenco aspetta la pagina intera, e il segno è la sua carta, uno solo.
 */
const rigaDellaColonna = computed(() => props.embedded && route.name !== 'harness')
/** La colonna del tablet mentre legge: i secondi dopo 2 s, come la carta (owner 29/10 notte) */
const sogliaColonna = useTalosSogliaSecondi({ attivo: () => loading.value && rigaDellaColonna.value })
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
    return session.pcId ? session.statoPc : serverStatus.value.get(session.id)
}

/* ── Tavola 3: le sessioni dei PC e il filtro «Dove» ─────────────────────────────────────────────────────────────────────── */
const remoti = useComputerRemoti()
const pcs = computed(() => remoti?.elenco.value ?? [])
const filtroVisibile = computed(() => pcs.value.length > 0)
type LetturaDelPc = { righe: TalosRigaSessioneR4[] } | { assente: true }
const sessioniPc = ref<Record<string, LetturaDelPc>>({})
let ultimaLetturaPc = 0

/** Ogni PC col suo canale e il suo tetto (`riepilogo`, `computerRemoti.ts`): uno spento non ferma gli altri né la lista. */
async function leggiPc(): Promise<void> {
    if (!remoti) return
    const questa = ++ultimaLetturaPc
    await remoti.aggiorna().catch(() => undefined)
    await Promise.all(pcs.value.map(async (pc) => {
        const r = await remoti.riepilogo(pc.pcId)
        if (questa !== ultimaLetturaPc) return
        sessioniPc.value = { ...sessioniPc.value, [pc.pcId]: r.inLinea ? { righe: r.righe } : { assente: true } }
    }))
}

/**
 * Il battito (sotto): solo l'elenco delle sessioni dei PC che hanno una riga al lavoro o in attesa — niente elenco dei PC, niente
 * cartelle (Desktop 27/10: la lettura più leggera). Un PC che in questa lettura non risponde tiene le righe che aveva. Il tetto di
 * `riepilogo` può superare il battito: un PC la cui lettura è ancora in volo si salta, così un PC lento non accumula chiamate.
 */
const pcInLettura = new Set<string>()
async function rileggiPcAlLavoro(pcIds: readonly string[]): Promise<void> {
    if (!remoti) return
    const questa = ultimaLetturaPc
    await Promise.all(pcIds.filter((pcId) => !pcInLettura.has(pcId)).map(async (pcId) => {
        pcInLettura.add(pcId)
        try {
            const r = await remoti.riepilogo(pcId)
            if (questa !== ultimaLetturaPc || !r.inLinea) return
            sessioniPc.value = { ...sessioniPc.value, [pcId]: { righe: r.righe } }
        } finally {
            pcInLettura.delete(pcId)
        }
    }))
}

/**
 * La scelta vale subito ed è una sola per l'app (`doveDelCodice.ts`, D-MOCK-1): una rotta che porta `?dove=` la imposta, una rotta
 * senza non la cancella. Un PC dimenticato torna a «Tutte».
 */
watch(() => route.query?.dove, (v) => { if (typeof v === 'string' && v) doveDelCodice.value = v }, { immediate: true })
const dove = computed(() => {
    const v = String(doveDelCodice.value ?? '')
    if (v === 'qui') return 'qui'
    return pcs.value.some((pc) => pc.pcId === v) ? v : 'tutte'
})
const sceltaAperta = ref(false)
function scegliDove(valore: string): void {
    doveDelCodice.value = valore
    // nella colonna del tablet la rotta è quella della sessione aperta accanto: lì la scelta resta della colonna
    if (!props.embedded && route.name === 'harness') void router.replace({ name: 'harness', query: valore === 'tutte' ? {} : { dove: valore } })
}
// owner 24/10/2026 «Sì, adesso»: un PC col portachiavi di prova (desktop f1199ace0) si legge «di prova» anche qui
const diProva = computed(() => new Set(pcs.value.filter((pc) => leggiRicordo(pc.pcId).effimero).map((pc) => pc.pcId)))
/** D-MOCK-9: il nome del PC col codice breve quando serve, senza «di prova» (per il pulsante e il dialogo della sessione nuova). */
const nomeSenzaProva = (pcId: string) => {
    const pc = pcs.value.find((c) => c.pcId === pcId)
    return pc ? nomeConCodice(pc, pcs.value, t('computer.unnamed')) : t('computer.unnamed')
}
const nomeDelPc = (pcId: string) => {
    const nome = nomeSenzaProva(pcId)
    return diProva.value.has(pcId) ? `${nome} · ${t('computer.testEntry')}` : nome
}
const opzioniDove = computed<TalosFilterOption[]>(() => [
    { value: 'tutte', label: t('harness.where.all'), testId: 'talos-codice-dove-tutte' },
    { value: 'qui', label: t('harness.where.here'), testId: 'talos-codice-dove-qui' },
    ...pcs.value.map((pc) => ({ value: pc.pcId, label: nomeDelPc(pc.pcId), testId: `talos-codice-dove-pc-${pc.pcId}` })),
])
const etichettaDove = computed(() => opzioniDove.value.find((o) => o.value === dove.value)?.label ?? t('harness.where.all'))

const righeDeiPc = computed<TalosRigaElenco[]>(() => pcs.value.flatMap((pc) => {
    const lettura = sessioniPc.value[pc.pcId]
    if (!lettura || !('righe' in lettura)) return []
    return lettura.righe.map((r) => ({
        // D-MOCK-5 (dal Pad, vc176): senza nome la riga era la sola data; il vecchio dettaglio del computer diceva «Sessione senza titolo»
        id: r.id, title: r.title || t('computer.untitledSession'), updated_at: r.updated_at, pcId: pc.pcId, statoPc: r.stato, ...(r.progetto ? { progetto: r.progetto } : {}),
        ...(r.agentiAlLavoro ? { agentiAlLavoro: r.agentiAlLavoro } : {}),
    }))
}))
/** Tutte le righe che «Dove» può mostrare: le mie e, con un PC collegato, le sue, dalla più recente. */
const righeTutte = computed<TalosRigaElenco[]>(() => (filtroVisibile.value
    ? [...sessions.value, ...righeDeiPc.value].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    : sessions.value))

/*
 * ⛔ UI-111 «Liste coerenti» (mockup v2.1 approvato dall'owner il 29/10 sera; ledger `LEDGER-LISTE-COERENTI-MOBILE-2026-10-29.md`,
 * voce 5): la pagina nella grammatica delle Chat. Schede = gli stati veri (`elencoSessioniCodice.ts`, con la precedenza di
 * `statusBadge()` qui sotto), ricerca su titolo e cartella, «Dove» e «Ordina» nel foglio «Opzioni». Nella colonna del tablet la testa
 * non c'è: scheda e ricerca restano quelle di partenza e l'elenco è quello di prima.
 */
const { isTablet } = useTalosTabletLayout()
const scheda = ref<string>('tutte')
const testo = ref('')
/** «Ordina» come la Board del PC: l'elenco arriva dal più recente; «Meno recenti» lo rovescia, fasce comprese. */
const ordine = ref<'recenti' | 'vecchie'>('recenti')
const opzioniAperte = ref(false)
// «Ferma tutto», «Elenco» (owner 29/10 sera): una sessione r4 «conclusa» con agenti vivi sotto sta «In corso» (`statoConAgentiR4`)
const agentiDi = (r: TalosRigaElenco) => (suR4.value || r.pcId ? r.agentiAlLavoro ?? 0 : 0)
const statoDi = (r: TalosRigaElenco) => statoConAgentiR4(statoDellaSessione(statoServer(r), suR4.value || Boolean(r.pcId)), agentiDi(r))
// owner 29/10 notte: i numeri seguono «Dove», non la ricerca (come le Chat)
const contiSchede = computed(() => contaSchede(righeTutte.value, { dove: dove.value }, statoDi))
const schede = computed(() => SCHEDE_CODICE.map((s) => ({ id: s, label: t(CHIAVI_SCHEDE[s]), count: contiSchede.value[s] })))
const righeMostrate = computed<TalosRigaElenco[]>(() => filtraSessioni(
    righeTutte.value,
    { scheda: scheda.value as SchedaCodice, testo: testo.value, dove: dove.value },
    statoDi,
))
/** «Dove» è acceso solo se il foglio lo mostra (con un PC collegato): un filtro che non si vede non si può spegnere. */
const doveAcceso = computed(() => filtroVisibile.value && dove.value !== 'tutte')
const opzioniAccese = computed(() => (doveAcceso.value ? 1 : 0) + (ordine.value === 'recenti' ? 0 : 1))
/** Una scheda, una ricerca o «Dove» che nascondono qualcosa: l'assenza che ne viene ha la sua frase (come le Chat). */
const filtrando = computed(() => scheda.value !== 'tutte' || testo.value.trim() !== '' || doveAcceso.value)
const opzioniOrdine = computed(() => [
    { value: 'recenti', label: t('harness.sort.recent') },
    { value: 'vecchie', label: t('harness.sort.oldest') },
])
/** Il gruppo «Dove» del foglio: ogni PC collegato, anche senza sessioni o che non risponde, col numero delle sue righe. */
const gruppiFoglio = computed<TalosStationOptionGroup[]>(() => {
    if (!filtroVisibile.value) return []
    const conti = new Map(vociDove(righeTutte.value, nomeDelPc, { tutte: '', qui: '' }).map((v) => [v.value, v.count]))
    return [{
        id: 'dove',
        label: t('harness.where.group'),
        value: dove.value,
        options: opzioniDove.value.map((o) => ({ value: o.value, label: o.label ?? o.value, count: conti.get(o.value) ?? 0 })),
    }]
})
function impostaGruppo(id: string, valore: string): void {
    if (id !== 'dove') return
    scegliDove(valore)
    // come nel mockup: cambiando posto si riparte da «Tutte»
    scheda.value = 'tutte'
}
const conteggio = computed(() => `${righeMostrate.value.length} ${t('computer.sessionsCount', { count: righeMostrate.value.length })}`)

/**
 * ⛔ E3 — LISTA-DOPPIA-01 (Desktop 29/10 notte, revisione F1): sul tablet la rotta nuda `harness` apre l'ultima sessione (`App.vue`),
 * in modo asincrono, e l'elenco sta già nella colonna. Qui, a tutta pagina, l'elenco non si disegna MAI: apertura in corso → solo la
 * carta; finita senza sessioni → la frase dell'elenco vuoto; rifiutata → «Codice non si è aperto» con «Riprova»; finita con delle
 * sessioni e senza rimando → vuoto, con le sole righe d'avviso. Il segno è sincrono (`aperturaCodiceTablet`, `tabletLayout.ts`).
 */
const paginaSulTablet = computed(() => !props.embedded && isTablet.value && route.name === 'harness')
const aperturaInCorso = computed(() => paginaSulTablet.value && aperturaCodiceTablet.value === 'in-corso')
const aperturaFallita = computed(() => paginaSulTablet.value && aperturaCodiceTablet.value === 'fallita')

/** La pagina sta nel foglio della stazione come le Chat; la colonna del tablet resta nel guscio di sempre (`TalosMobileScreen`). */
const cornice = computed(() => (props.embedded
    ? { title: t('navigation.harness'), embedded: true }
    : { 'aria-label': t('navigation.harness'), class: 'relative flex min-h-full flex-col bg-[var(--talos-background)] text-[var(--talos-text)]' }))
/** I PC che non hanno risposto, fra quelli che il filtro mostra. */
const pcAssenti = computed(() => pcs.value.filter((pc) => 'assente' in (sessioniPc.value[pc.pcId] ?? {})
    && (dove.value === 'tutte' || dove.value === pc.pcId)))

const nuovaSulPc = ref(false)
const etichettaNuova = computed(() => (dove.value !== 'tutte' && dove.value !== 'qui'
    ? tTesto('harness.newSessionOn', { name: nomeSenzaProva(dove.value) })
    : t('harness.newSession')))
/** UI-111: il nome del «+» per chi ascolta; filtrati su un PC dice quale (il «+» quadrato del telefono non ha testo) */
const etichettaNuovaAria = computed(() => (dove.value !== 'tutte' && dove.value !== 'qui' ? etichettaNuova.value : t('harness.newSessionAria')))
const progettoRecenteDelPc = computed(() => righeDeiPc.value.find((r) => r.pcId === dove.value)?.progetto ?? null)

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
    // tavola 3: una sessione del PC è una sessione di r4, con le regole di r4
    const r4 = suR4.value || Boolean(session.pcId)
    // ELENCO-R4-PAG-06 (Pad, 18/10): con r4 l'attesa è di qualunque tipo (approvazione, domanda, piano) e una sessione interrotta da
    // un riavvio resta non conclusa: ordine e parola del desktop (`statoSessione()`, harness-ui `app.js`: attesa, interrotta, in corso)
    if (stato?.inAttesaApprovazione) return { kind: 'waiting-approval', label: t(r4 ? 'harness.statusWaitingForYou' : 'harness.statusWaitingApproval') }
    if (r4 && stato?.interrotta) return { kind: 'interrupted', label: t('harness.statusInterrupted') }
    if (stato && !stato.conclusa) return { kind: 'running', label: t('harness.statusRunning') }
    if (stato?.interrotta) return { kind: 'interrupted', label: t('harness.statusInterrupted') }
    if (stato?.ultimoEsito === 'errore') return { kind: 'error', label: t('harness.statusError') }
    // «Ferma tutto», «Elenco» (owner 29/10 sera): finita, ma sotto lavorano degli agenti — «N agenti al lavoro» col segno di chi lavora
    // (sul telefono il `Loader2` della riga, poi la cartella); finiti tutti torna l'ora. Gli stati sopra dicono di più e restano.
    const agenti = agentiDi(session)
    if (r4 && agenti > 0) return { kind: 'running', label: testoFermaTuttoR4('elenco.agenti', locale.value, agenti) }
    // ⛔ D-0145-6(b): l'ora di una sessione del PC sull'orologio del dispositivo, come dentro la conversazione
    return { kind: 'idle', label: quandoInFascia(bucket, oraSulDispositivo(session.updated_at, scartoDelPc(session.pcId))) }
}

onMounted(refresh)
onMounted(() => { void leggiPc() })
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
    // tavola 3: tornando all'elenco si rileggono anche i PC (una sessione nuova aperta sul PC)
    // ⛔ D-0147-COD-1 (Pad, 27/10): e sulla sessione del PC, dove la bozza che diventa sessione vera cambia solo `:id`
    if (route.name === 'harness' || route.name === 'computer-codice') void leggiPc()
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

const fasce = computed(() => {
    const gruppi = talosChatDateBuckets(righeMostrate.value, (session) => session.updated_at, new Date())
    // UI-111, «Meno recenti»: le fasce e le righe dentro ciascuna, dalla più vecchia
    return ordine.value === 'vecchie' ? [...gruppi].reverse().map((g) => ({ ...g, items: [...g.items].reverse() })) : gruppi
})

function openSession(session: TalosRigaElenco): void {
    if (session.pcId) {
        void router.push({ name: 'computer-codice', params: { pcId: session.pcId, id: session.id } })
        return
    }
    if (suR4.value) {
        void router.push({ name: 'codice-r4', params: { id: session.id } })
        return
    }
    void router.push({ name: 'harness-session', params: { id: session.id } })
}

function newSession(): void {
    // tavola 3: filtrati su un PC, la sessione nuova nasce su quel PC, nella cartella scelta
    if (dove.value !== 'tutte' && dove.value !== 'qui') {
        nuovaSulPc.value = true
        return
    }
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
    if (session.pcId) return route.name === 'computer-codice' && String(route.params.pcId ?? '') === session.pcId && String(route.params.id ?? '') === session.id
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
    // il PC vuole il consenso per la cartella della sessione (R5.12); il suo `message` è inglese, la frase è dell'app
    if ((error as { code?: unknown } | null)?.code === 'CONSENT_REQUIRED') return t('harness.pcConsentRequired')
    const frase = fraseRifiutoSessioneR4(error, locale.value)
    if (frase) return frase
    if (error instanceof Error && error.message === 'TALOS_R4_IRRAGGIUNGIBILE') return t('harness.r4Unreachable')
    // ⛔ D-0145-2/3 (Pad 25/10): il 401 dell'r4 del dispositivo vuol dire che un'altra app TALOS (la copia affiancata) tiene la sua
    // porta; e un rifiuto con un codice senza frase non passa mai il suo inglese (la regola di D-F3-1)
    if (error instanceof RifiutoSessioneR4 && error.code === 'AUTH_REQUIRED') return t('harness.r4OtherCopy')
    if (error instanceof RifiutoSessioneR4 && error.code) return t('harness.r4Refused')
    return actionErrorText(error)
}
/**
 * ⛔ D-MOCK-11 (dal vivo, 24/10/2026; contratto R5.12, parte 1, punto 3): Rinomina ed Elimina su una riga del PC in una cartella che
 * il PC non ha ancora consentito a questo dispositivo. Mai solo l'errore: «Chiedi al PC» (`consent.request`), «Conferma sul
 * computer» durante l'attesa, e su «Consenti» l'azione si rifà da sé. `rifai`: la stessa azione, col nome già scritto.
 */
interface ConsensoDelPc {
    pcId: string
    cartellaId: string
    rifai: () => Promise<void>
    fallito: (error: unknown) => string
    fase: 'chiedi' | 'attesa' | 'negata' | 'scaduta' | 'errore'
    code?: string
    giro?: number
}
const consensoPc = ref<ConsensoDelPc | null>(null)
let giroDelConsenso = 0

/** Vero se il rifiuto è `CONSENT_REQUIRED` con la cartella da chiedere: il blocco del consenso prende il posto dell'errore. */
function serveIlConsenso(error: unknown, voce: Omit<ConsensoDelPc, 'cartellaId' | 'fase'>): boolean {
    const da = consensoRichiesto(error as { code?: unknown, params?: unknown } | null)
    if (!da) return false
    actionError.value = null
    consensoPc.value = { ...voce, cartellaId: da.cartellaId, fase: 'chiedi' }
    return true
}

async function chiediAlPc(): Promise<void> {
    const c = consensoPc.value
    if (!c || c.fase === 'attesa' || !remoti) return
    // il giro di questa richiesta: «Annulla» (o un'altra richiesta) lo cambia; il `ref` avvolge l'oggetto, quindi niente confronti d'identità
    const giro = ++giroDelConsenso
    consensoPc.value = { ...c, fase: 'attesa', code: undefined, giro }
    const ancoraMio = () => consensoPc.value?.giro === giro
    const esito = await remoti.chiediConsensoAlPc(c.pcId, c.cartellaId, { fermato: () => !ancoraMio() })
    if (!ancoraMio()) return // «Annulla» durante l'attesa
    if (esito.esito === 'annullata') { consensoPc.value = null; return }
    if (esito.esito !== 'consentita') {
        consensoPc.value = { ...c, fase: esito.esito, ...(esito.esito === 'errore' ? { code: esito.code } : {}) }
        return
    }
    consensoPc.value = null
    try {
        await c.rifai()
    } catch (error) {
        if (!serveIlConsenso(error, c)) actionError.value = c.fallito(error)
    }
}

const testoDelConsenso = computed(() => {
    const c = consensoPc.value
    if (!c) return ''
    if (c.fase === 'negata') return t('computer.consent.denied')
    if (c.fase === 'scaduta') return t('computer.consent.expired')
    if (c.fase === 'errore') {
        // un `RATE_LIMITED` qui viene dalla richiesta di consenso: al più 3 in attesa sul PC
        const code = c.code ?? 'OPERATION_FAILED'
        return t(fraseDelConsenso({ code, reason: MOTIVO_TROPPE_RICHIESTE }) ?? fraseErroreRemoto(code) ?? 'computer.errors.generic')
    }
    return t('computer.consent.required')
})

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
 * ⛔ 27/10/2026 (trovato cercando il «ancora al lavoro» dell'owner): anche le righe dei PC. Lette a giro vivo restavano «In corso»
 * finché non si cambiava pagina, anche dopo che il PC aveva chiuso il giro (sul tablet la colonna resta a schermo).
 */
const lavora = (stato: TalosHarnessSessionStatus) => stato.inAttesaApprovazione || (!stato.conclusa && !stato.interrotta)
// «Ferma tutto»: anche una sessione finita con agenti al lavoro si rilegge, così torna «Conclusa» quando finiscono
const qualcunaLavora = computed(() => suR4.value && ([...serverStatus.value.values()].some(lavora) || sessions.value.some((r) => (r.agentiAlLavoro ?? 0) > 0)))
const pcAlLavoro = computed(() => Object.entries(sessioniPc.value)
    .filter(([, lettura]) => 'righe' in lettura && lettura.righe.some((riga) => lavora(riga.stato) || (riga.agentiAlLavoro ?? 0) > 0))
    .map(([pcId]) => pcId))
let battito: ReturnType<typeof setInterval> | null = null
onMounted(() => {
    battito = setInterval(() => {
        if (document.visibilityState !== 'visible') return
        if (qualcunaLavora.value) void refresh()
        if (pcAlLavoro.value.length) void rileggiPcAlLavoro(pcAlLavoro.value)
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
/** ⛔ D-MOCK-10 (4177, 24/10/2026): l'errore di un dialogo sta DENTRO il dialogo; prima stava nella lista, dietro il velo sfocato. */
const renameError = ref<string | null>(null)
const deleteError = ref<string | null>(null)
/**
 * ⛔ D-MOCK-15: sul PC Rinomina/Elimina durano 20-30 s. Il dialogo resta aperto finché il PC risponde e «Annulla» resta acceso:
 * chiudere cambia il giro, e ciò che il PC risponde dopo non riapre niente (la lista si rilegge, così dice il vero).
 */
let giroAzione = 0
function chiudiRinomina(): void {
    giroAzione++
    actionBusy.value = false
    renameTarget.value = null
    renameError.value = null
}
function chiudiElimina(): void {
    giroAzione++
    actionBusy.value = false
    deleteTarget.value = null
    deleteError.value = null
}

async function openRename(session: TalosRigaElenco): Promise<void> {
    actionError.value = null
    renameError.value = null
    renameTarget.value = session
    renameValue.value = session.title
    await nextTick()
    renameInput.value?.select()
}

async function submitRename(): Promise<void> {
    const target = renameTarget.value
    const title = renameValue.value.trim()
    if (!target || !title || actionBusy.value) return
    const giro = ++giroAzione
    const mio = () => giro === giroAzione
    actionBusy.value = true
    renameError.value = null
    try {
        if (target.pcId && remoti) {
            await remoti.rinominaSessione(target.pcId, target.id, title)
            // dal Pad, prova della CLI (27/10/2026): come in locale, la testata della conversazione aperta prende il nome nuovo
            annuncia({ id: target.id, nome: title })
            if (mio()) renameTarget.value = null
            actionError.value = null
            await leggiPc()
            return
        }
        if (suR4.value) {
            await rinominaSessioneR4(talosClienteR4(), target.id, title)
            annuncia({ id: target.id, nome: title })
        } else await renameCodiceSession(target.id, title)
        if (mio()) renameTarget.value = null
        actionError.value = null
        await refresh()
    } catch (error) {
        // «Annulla» durante l'attesa: il dialogo non c'è più; la lista si rilegge e dice com'è andata
        if (!mio()) { void (target.pcId ? leggiPc() : refresh()); return }
        const pcId = target.pcId
        if (pcId && remoti && serveIlConsenso(error, {
            pcId,
            rifai: async () => { await remoti.rinominaSessione(pcId, target.id, title); annuncia({ id: target.id, nome: title }); await leggiPc() },
            fallito: (e) => tTesto('harness.renameFailed', { detail: dettaglioErrore(e) }),
        })) {
            renameTarget.value = null
            return
        }
        renameError.value = tTesto('harness.renameFailed', { detail: dettaglioErrore(error) })
    } finally {
        if (mio()) actionBusy.value = false
    }
}

const deleteTarget = ref<TalosRigaElenco | null>(null)
/** D-MOCK-14: una riga del PC si elimina SUL PC, e la conferma lo nomina col codice breve; una del dispositivo resta «dal dispositivo». */
const deleteDescription = computed(() => {
    const target = deleteTarget.value
    if (!target) return ''
    if (!target.pcId) return tTesto('harness.deleteDescription', { title: target.title })
    const pc = pcs.value.find((c) => c.pcId === target.pcId)
    const name = nomeECodice({ pcId: target.pcId, nome: pc?.nome ?? null }, t('computer.unnamed'))
    return tTesto('harness.deleteDescriptionPc', { title: target.title, name })
})

function openDelete(session: TalosRigaElenco): void {
    actionError.value = null
    deleteError.value = null
    deleteTarget.value = session
}

async function confirmDelete(): Promise<void> {
    const target = deleteTarget.value
    if (!target || actionBusy.value) return
    const giro = ++giroAzione
    const mio = () => giro === giroAzione
    actionBusy.value = true
    deleteError.value = null
    try {
        if (target.pcId && remoti) {
            await remoti.eliminaSessione(target.pcId, target.id)
            if (mio()) deleteTarget.value = null
            actionError.value = null
            await leggiPc()
            return
        }
        if (suR4.value) {
            await eliminaSessioneR4(talosClienteR4(), target.id)
            annuncia({ id: target.id, eliminata: true })
        } else await deleteCodiceSession(target.id)
        if (mio()) deleteTarget.value = null
        actionError.value = null
        await refresh()
    } catch (error) {
        if (!mio()) { void (target.pcId ? leggiPc() : refresh()); return }
        const pcId = target.pcId
        if (pcId && remoti && serveIlConsenso(error, {
            pcId,
            rifai: async () => { await remoti.eliminaSessione(pcId, target.id); await leggiPc() },
            fallito: (e) => tTesto('harness.deleteFailed', { detail: dettaglioErrore(e) }),
        })) {
            deleteTarget.value = null
            return
        }
        deleteError.value = tTesto('harness.deleteFailed', { detail: dettaglioErrore(error) })
    } finally {
        if (mio()) actionBusy.value = false
    }
}
</script>

<template>
    <component :is="embedded ? TalosMobileScreen : 'section'" v-bind="cornice" data-testid="talos-harness-screen">
        <!-- ⛔ E3 (LISTA-DOPPIA-01): sul tablet, mentre si apre l'ultima sessione, la pagina intera aspetta e ha un segno solo -->
        <TalosAttesaCarta v-if="aperturaInCorso" testid="talos-harness-loading" :testo="t('harness.loadingSessions')" />
        <template v-else>
        <!-- ⛔ UI-111: la testa delle sezioni a elenco, uguale alle Chat (`ChatsScreen.vue:794-946`). Nella colonna no: il pannello ha
             la sua intestazione, come le Chat (`ChatsScreen.vue:794`). E3 (F1): nemmeno a tutta pagina sulla rotta `harness` del tablet. -->
        <TalosMobileElencoTesta
            v-if="!embedded && !paginaSulTablet"
            v-model:testo="testo"
            v-model:scheda="scheda"
            test-id-prefix="talos-harness"
            :titolo="t('navigation.harness')"
            :frase="t('harness.subtitle')"
            :nuova-etichetta="etichettaNuovaAria"
            :nuova-breve="etichettaNuova"
            :cerca-etichetta="t('harness.search')"
            :opzioni-etichetta="opzioniAccese > 0 ? t('harness.optionsActive', { count: opzioniAccese }) : t('harness.options')"
            :opzioni-accese="opzioniAccese"
            :opzioni-aperte="opzioniAperte"
            :schede-etichetta="t('harness.filterLabel')"
            :schede="schede"
            :conteggio="conteggio"
            :tablet="isTablet"
            :nuova-con-nome="dove !== 'tutte' && dove !== 'qui'"
            @nuova="newSession"
            @opzioni="opzioniAperte = true"
        />
        <div class="flex flex-col gap-4" :class="{ 'px-[var(--talos-space-page)]': !embedded, 'pt-[var(--talos-space-section)]': paginaSulTablet }">
            <button
                v-if="embedded"
                type="button"
                data-testid="talos-harness-new"
                :aria-label="t('harness.newSessionAria')"
                class="talos-pressable flex min-h-touch shrink-0 items-center gap-2 rounded-xl bg-[var(--talos-accent,var(--primary))] px-3 text-sm text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                @click="newSession"
            >
                <MessageSquarePlus class="size-4 shrink-0" aria-hidden="true" />
                <!-- D-MOCK-9: col nome del PC il testo va al più su due righe -->
                <span data-testid="talos-harness-new-label" class="line-clamp-2 min-w-0 text-left">{{ etichettaNuova }}</span>
            </button>

            <!-- tavola 3: «Dove». Sul telefono un pulsante che apre la scelta; dove c'è posto, le voci in fila.
                 ⛔ UI-111: nella pagina «Dove» sta nel foglio «Opzioni»; nella colonna del tablet, che non ha la testa, resta qui:
                 senza, sul tablet non si sceglierebbe più il posto (domanda aperta all'owner nel ledger, «Niente perso»). -->
            <div v-if="filtroVisibile && embedded" class="@container/dove px-1">
                <div class="flex items-center justify-between gap-3">
                    <button
                        type="button"
                        data-testid="talos-codice-dove"
                        aria-controls="talos-codice-dove-scelta"
                        :aria-expanded="sceltaAperta ? 'true' : 'false'"
                        class="talos-pressable flex min-h-touch min-w-0 items-center gap-1.5 rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm @[34rem]/dove:hidden"
                        @click="sceltaAperta = !sceltaAperta"
                    >
                        <span class="text-[var(--talos-muted)]">{{ t('harness.where.label') }}</span>
                        <span class="truncate font-medium text-[var(--talos-text)]">{{ etichettaDove }}</span>
                        <ChevronDown class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                    </button>
                    <span data-testid="talos-codice-dove-count" class="shrink-0 text-xs text-[var(--talos-muted)] @[34rem]/dove:hidden">
                        {{ righeMostrate.length }} {{ t('computer.sessionsCount', { count: righeMostrate.length }) }}
                    </span>
                </div>
                <!-- un clic (o Invio) sceglie e chiude; le frecce scelgono e lasciano aperto (`TalosThemedFilter`) -->
                <TalosThemedFilter
                    id="talos-codice-dove-scelta"
                    :model-value="dove"
                    :options="opzioniDove"
                    :group-label="t('harness.where.group')"
                    :group-class="`${sceltaAperta ? 'flex' : 'hidden'} mt-1.5 flex-col gap-1 @[34rem]/dove:mt-0 @[34rem]/dove:flex @[34rem]/dove:flex-row @[34rem]/dove:flex-wrap`"
                    :option-class="(scelta) => `talos-pressable min-h-touch rounded-[var(--talos-radius-control)] border px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--talos-ring)] ${scelta ? 'border-[var(--talos-accent)] bg-[color-mix(in_srgb,var(--talos-accent)_14%,var(--talos-panel))] font-medium text-[var(--talos-text)]' : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)]'}`"
                    @update:model-value="scegliDove"
                    @click="sceltaAperta = false"
                />
                <!-- D-MOCK-3 (dal Pad, vc175): con più PC che non rispondono una riga sola, non una per PC -->
                <div v-if="pcAssenti.length" data-testid="talos-codice-dove-assenti" role="status" class="mt-1.5 text-xs leading-5 text-[var(--talos-muted)]">
                    <p v-if="pcAssenti.length === 1">
                        <span class="font-medium text-[var(--talos-text)]">{{ nomeDelPc(pcAssenti[0]!.pcId) }}</span> {{ t('harness.where.pcUnreachable') }}
                    </p>
                    <p v-else>{{ t('harness.where.pcsUnreachable', { count: pcAssenti.length }) }}</p>
                </div>
            </div>
            <!-- UI-111: nella pagina il PC che non risponde si dice al suo posto di prima, sotto la testa (D-MOCK-3: una riga sola) -->
            <div v-if="!embedded && pcAssenti.length" data-testid="talos-codice-dove-assenti" role="status" class="px-1 text-xs leading-5 text-[var(--talos-muted)]">
                <p v-if="pcAssenti.length === 1">
                    <span class="font-medium text-[var(--talos-text)]">{{ nomeDelPc(pcAssenti[0]!.pcId) }}</span> {{ t('harness.where.pcUnreachable') }}
                </p>
                <p v-else>{{ t('harness.where.pcsUnreachable', { count: pcAssenti.length }) }}</p>
            </div>

            <p v-if="actionError" role="alert" class="px-1 text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ actionError }}</p>
            <!-- D-MOCK-11: il permesso del PC per la cartella di una sua sessione, chiesto da qui (mai solo l'errore) -->
            <div
                v-if="consensoPc"
                data-testid="talos-harness-consenso"
                :data-fase="consensoPc.fase"
                :role="consensoPc.fase === 'attesa' ? 'status' : 'alert'"
                class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-surface-2)] p-3 text-sm text-[var(--talos-text)]"
            >
                <template v-if="consensoPc.fase === 'attesa'">
                    <p class="flex items-center gap-2 font-medium"><Loader2 class="size-4 animate-spin text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('computer.consent.waitingTitle') }}</p>
                    <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ t('computer.consent.waitingBody') }}</p>
                </template>
                <p v-else>{{ testoDelConsenso }}</p>
                <div class="mt-2 flex justify-end gap-2">
                    <Button type="button" variant="ghost" data-testid="talos-harness-consenso-annulla" class="min-h-touch" @click="consensoPc = null">{{ t('common.cancel') }}</Button>
                    <Button v-if="consensoPc.fase !== 'attesa'" type="button" data-testid="talos-harness-consenso-chiedi" class="min-h-touch" @click="chiediAlPc()">
                        {{ consensoPc.fase === 'scaduta' || consensoPc.fase === 'errore' ? t('computer.retry') : t('computer.consent.ask') }}
                    </Button>
                </div>
            </div>
            <p v-if="erroreElenco" role="alert" data-testid="talos-harness-list-error" class="px-1 text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ erroreElenco }}</p>

            <!-- ⛔ E3 (F1): l'apertura dell'ultima sessione è stata rifiutata. La riga d'errore della Libreria (`ContextScreen.vue:1354-1358`),
                 con «Riprova» che rifà la stessa apertura -->
            <div v-if="aperturaFallita" role="alert" data-testid="talos-harness-open-failed" class="mb-3 flex items-center gap-2 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
                <AlertTriangle class="size-4 shrink-0" aria-hidden="true" />
                <span class="min-w-0 flex-1">{{ t('harness.loadFailed') }}</span>
                <Button type="button" size="icon" variant="ghost" class="min-h-12 min-w-12" :aria-label="t('common.retry')" @click="riapriCodiceTablet()"><RefreshCw class="size-4" aria-hidden="true" /></Button>
            </div>
            <!-- ⛔ E3 (F1, owner 29/10 notte): finita con delle sessioni ma senza rimando, l'elenco sta nella colonna: una riga sola, al centro -->
            <p v-else-if="paginaSulTablet && !loading && righeMostrate.length" data-testid="talos-harness-pick-from-list" class="px-1 py-4 text-center text-sm text-[var(--talos-muted)]">
                {{ t('harness.pickFromList') }}
            </p>

            <!-- UI-111: due assenze, due frasi (come le Chat): l'elenco vuoto, e una scheda, una ricerca o «Dove» che non lasciano niente -->
            <p v-if="!loading && !righeMostrate.length && !erroreElenco && !aperturaFallita" data-testid="talos-harness-empty" class="px-1 text-sm text-[var(--talos-muted)]" :class="{ 'py-4': !embedded }">
                {{ filtrando ? t('harness.noMatches') : t('harness.emptyBody') }}
            </p>
            <!-- owner 29/10 sera (mockup «Caricamenti vivi» v6, D2/D3): l'elenco che si legge vuoto non resta muto, ha la carta della
                 Chat. ⛔ Nella colonna del tablet (`embedded`) il velo coprirebbe anche la sessione aperta accanto: lì la riga piccola in
                 cima, con la rotella arancione e i secondi (owner 29/10 notte, «Sì, la riga piccola in cima»; regola del 27/10) -->
            <TalosAttesaCarta
                v-else-if="loading && !righeMostrate.length && !erroreElenco && !embedded && !aperturaFallita"
                testid="talos-harness-loading"
                :testo="t('harness.loadingSessions')"
            />
            <!-- E1 (owner 29/10 notte): la riga della colonna solo se accanto c'è già una sessione; sulla rotta dell'elenco il segno è la
                 carta della pagina, uno per schermo -->
            <div v-else-if="loading && !righeMostrate.length && !erroreElenco && rigaDellaColonna" data-testid="talos-harness-loading-row" class="px-1">
                <TalosRigaInCorso :key="sogliaColonna.chiave.value" compatta segno="giro" :testo="t('harness.loadingSessions')" :inizio="sogliaColonna.inizio.value" />
            </div>

            <!-- ⛔ E3 (F1): a tutta pagina sulla rotta `harness` del tablet l'elenco non si disegna mai: sta nella colonna -->
            <div v-if="!paginaSulTablet">
            <div v-for="gruppo in fasce" :key="gruppo.monthKey ?? gruppo.bucket">
                <!-- UI-111: la fascia del giorno con la classe delle Chat (`ChatsScreen.vue:1070-1073`) -->
                <p data-testid="talos-harness-fascia" class="px-2 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)] landscape:pb-0.5 landscape:pt-1.5">
                    {{ titoloFascia(gruppo) }}
                </p>
                <div role="list" class="flex flex-col gap-0.5">
                    <div
                        v-for="session in gruppo.items"
                        :key="`${session.pcId ?? 'qui'}:${session.id}`"
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
                                    // 23/10 sera (Desktop): l'interrotta è quieta come in Chat e sul desktop, non un allarme rosso
                                    // owner 23/10 sera: «da riprendere» chiede qualcosa alla persona, non è un allarme (tono d'attenzione)
                                    'font-medium text-[var(--talos-warning)]': statusBadge(session, gruppo.bucket).kind === 'error',
                                    'font-semibold text-[var(--talos-accent)]': statusBadge(session, gruppo.bucket).kind === 'waiting-approval',
                                    'text-[var(--talos-muted)]': !['error', 'waiting-approval'].includes(statusBadge(session, gruppo.bucket).kind),
                                }"
                            >
                                <!-- tavola 3: in «Tutte» la sessione del PC porta il suo nome -->
                                <span
                                    v-if="session.pcId && dove === 'tutte'"
                                    data-testid="talos-harness-row-pc"
                                    class="flex min-w-0 max-w-[45%] items-center gap-1 font-normal text-[var(--talos-muted)]"
                                ><Laptop class="size-3 shrink-0" aria-hidden="true" /><span class="truncate">{{ nomeDelPc(session.pcId) }}</span> ·</span>
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
                                <CircleDashed
                                    v-else-if="statusBadge(session, gruppo.bucket).kind === 'interrupted'"
                                    class="size-3 shrink-0"
                                    aria-hidden="true"
                                />
                                <RotateCcw
                                    v-else-if="statusBadge(session, gruppo.bucket).kind === 'error'"
                                    class="size-3 shrink-0"
                                    aria-hidden="true"
                                />
                                <!-- Pad 24/10, foto 157: l'etichetta non si restringe e non va a capo; si tronca la cartella -->
                                <span data-testid="talos-harness-row-status-label" class="shrink-0 whitespace-nowrap">{{ statusBadge(session, gruppo.bucket).label }}</span>
                                <span v-if="session.progetto" data-testid="talos-harness-row-folder" class="min-w-0 truncate font-normal text-[var(--talos-muted)]">· {{ session.progetto }}</span>
                            </span>
                            <span
                                v-if="statoServer(session)?.ultimoMessaggio"
                                data-testid="talos-harness-row-preview"
                                class="mt-0.5 line-clamp-2 text-xs text-[var(--talos-muted)]"
                            >{{ statoServer(session)!.ultimoMessaggio }}</span>
                        </button>
                        <div class="flex shrink-0 items-center">
                            <TalosRowActions
                                :test-id="session.pcId ? `talos-harness-actions-${session.pcId}-${session.id}` : `talos-harness-actions-${session.id}`"
                                :label="tTesto('harness.actionsFor', { title: session.title })"
                                :items="sessionActions()"
                                @select="(action) => act(session, action)"
                            />
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
        </template>

        <!-- ⛔ UI-111: la pillola galleggiante «Nuova sessione» se n'è andata: sul telefono il «+» sta accanto al titolo, come nelle Chat
             (owner 25/09 per le chat; mockup v2.1 per il Codice). «Dove» e «Ordina» nel foglio «Opzioni» delle stazioni. -->
        <TalosMobileStationOptionsSheet
            v-if="opzioniAperte && !embedded"
            :title="t('harness.options')"
            test-id-prefix="talos-codice"
            :sort-label="t('harness.sortLabel')"
            :sort-options="opzioniOrdine"
            :sort="ordine"
            :groups="gruppiFoglio"
            @update:sort="(value: string) => ordine = value === 'vecchie' ? 'vecchie' : 'recenti'"
            @update:group="impostaGruppo"
            @close="opzioniAperte = false"
        />

        <TalosNuovaSessioneSulPc
            v-if="nuovaSulPc && dove !== 'tutte' && dove !== 'qui'"
            :pc-id="dove"
            :nome="nomeSenzaProva(dove)"
            :progetto-recente="progettoRecenteDelPc"
            @chiudi="nuovaSulPc = false"
        />

        <TalosMobileConfirmDialog
            v-if="renameTarget !== null"
            :title="t('harness.renameTitle')"
            :description="t('harness.renameDescription')"
            @close="chiudiRinomina()"
        >
            <input
                ref="renameInput"
                v-model="renameValue"
                :maxlength="suR4 ? 80 : undefined"
                :aria-label="t('harness.sessionName')"
                class="min-h-touch w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                @keydown.enter.prevent="submitRename"
            >
            <!-- D-MOCK-15: l'attesa del PC si dice; D-MOCK-10: l'errore sta qui, non dietro il velo -->
            <p v-if="actionBusy && renameTarget.pcId" role="status" data-testid="talos-harness-dialog-pc-working" class="flex items-center gap-2 text-xs text-[var(--talos-muted)]">
                <Loader2 class="size-4 animate-spin text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('harness.pcWorking') }}
            </p>
            <p v-if="renameError" role="alert" data-testid="talos-harness-dialog-error" class="text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ renameError }}</p>
            <template #footer>
                <Button type="button" variant="ghost" @click="chiudiRinomina()"><X class="size-4" aria-hidden="true" /> {{ t('common.cancel') }}</Button>
                <Button type="button" :disabled="!renameValue.trim() || actionBusy" @click="submitRename">
                    <Check class="size-4" aria-hidden="true" /> {{ t('common.save') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>

        <TalosMobileConfirmDialog
            v-if="deleteTarget !== null"
            :title="t('harness.deleteTitle')"
            :description="deleteDescription"
            @close="actionBusy && !deleteTarget.pcId ? undefined : chiudiElimina()"
        >
            <p v-if="actionBusy && deleteTarget.pcId" role="status" data-testid="talos-harness-dialog-pc-working" class="flex items-center gap-2 text-xs text-[var(--talos-muted)]">
                <Loader2 class="size-4 animate-spin text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('harness.pcWorking') }}
            </p>
            <p v-if="deleteError" role="alert" data-testid="talos-harness-dialog-error" class="text-xs leading-5 text-[var(--talos-danger,#dc5b5b)]">{{ deleteError }}</p>
            <template #footer>
                <!-- D-MOCK-15: sul PC «Annulla» resta acceso durante l'attesa; sul dispositivo l'azione è breve e si aspetta -->
                <Button type="button" variant="ghost" :disabled="actionBusy && !deleteTarget.pcId" @click="chiudiElimina()"><X class="size-4" aria-hidden="true" /> {{ t('common.cancel') }}</Button>
                <Button type="button" variant="destructive" data-testid="talos-harness-delete-confirm" :disabled="actionBusy" @click="confirmDelete">
                    {{ t('common.delete') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>
    </component>
</template>
