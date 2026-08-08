<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useTalosI18n } from '@/i18n'
import { Check, ChevronRight, RefreshCw, ShieldAlert, Smartphone, X } from '@lucide/vue'
import {
    talosShizukuGuidance,
    talosShizukuReach,
    type TalosShizukuSnapshot,
} from '@/lib/privilege/shizukuGuidance'
import {
    talosCodiceValido,
    talosPonteGuida,
    talosPonteMotivo,
} from '@/lib/privilege/pontePasso'

/**
 * La pagina che dice se TALOS può toccare il telefono, e che cosa fare adesso.
 *
 * ## Perché non è una schermata di impostazioni
 *
 * Perché non c'è niente da impostare: c'è una catena di quattro porte che si
 * chiudono per conto loro — Shizuku installato, avviato, che ci autorizza, e il
 * sistema che lascia fare — e l'unica cosa utile è **quale è chiusa adesso**.
 *
 * Un elenco con quattro spunte sembra informativo ed è il modo più rapido di
 * paralizzare: chi legge non sa da dove cominciare. Quindi qui compare **un
 * passo**, grande, con il suo pulsante.
 *
 * ## ⛔ Lo stato che le guide di Shizuku non hanno
 *
 * MISURATO sul Pad dell'owner il 2026-08-08, e detto da Shizuku stesso: su
 * ColorOS il produttore limita i permessi di adb, e l'autorizzazione **non
 * arriva mai**. Senza dirlo qui, la persona ripremerebbe all'infinito un
 * pulsante che non può funzionare, dando la colpa a noi.
 *
 * La distinzione la fa `hasAsked`: lo stesso stato — «da autorizzare» —
 * significa «premi» prima di aver chiesto e «il tuo produttore lo impedisce»
 * dopo. Su un sistema che non interferisce, chiedere porta a «pronto» o a
 * «negato», mai indietro a se stesso.
 */
const { t } = useTalosI18n()

const snapshot = ref<TalosShizukuSnapshot | null>(null)
const caricando = ref(true)
/** Se in QUESTA sessione abbiamo già chiesto. È un fatto sulla sessione. */
const haChiesto = ref(false)

interface RispostaPonte { ok: boolean, reason?: string, address?: string, tried?: number }

function plugin() {
    return Capacitor.registerPlugin<{
        snapshot(): Promise<TalosShizukuSnapshot>
        request(): Promise<{ outcome: string }>
        open(options: { target: string }): Promise<{ opened: boolean }>
        bridgeStatus(): Promise<{ packaged: boolean, connected: boolean }>
        bridgePair(options: { code: string, address?: string }): Promise<RispostaPonte>
        bridgeConnect(options: { address?: string }): Promise<RispostaPonte>
    }>('TalosPrivilege')
}

/* ------------------------------------------------------------------------ *
 * IL PONTE IN CASA
 * ------------------------------------------------------------------------ */

const pontePresente = ref(false)
const ponteCollegato = ref(false)
/** Se un tentativo silenzioso di ricollegarsi è già stato fatto e fallito. */
const ricollegamentoFallito = ref(false)
const ponteInCorso = ref(false)
const codice = ref('')
const ponteMotivo = ref<string | null>(null)

const ponte = computed(() => talosPonteGuida({
    packaged: pontePresente.value,
    connected: ponteCollegato.value,
    reconnectFailed: ricollegamentoFallito.value,
}))

const codiceValido = computed(() => talosCodiceValido(codice.value))

async function leggiPonte(): Promise<void> {
    try {
        const stato = await plugin().bridgeStatus()
        pontePresente.value = stato.packaged === true
        ponteCollegato.value = stato.connected === true
    } catch {
        // Build web: il ponte non esiste, e la sezione lo dice invece di fingere.
        pontePresente.value = false
        ponteCollegato.value = false
    }
}

async function ricollega(): Promise<void> {
    if (ponteInCorso.value) return
    ponteInCorso.value = true
    ponteMotivo.value = null
    try {
        const esito = await plugin().bridgeConnect({})
        ponteCollegato.value = esito.ok === true
        // ⛔ Il fallimento del ricollegamento NON è un errore da mostrare in
        // rosso: è la scoperta che non siamo ancora accoppiati, ed è il passo
        // successivo. Mostrarlo come guasto manderebbe a cercare una causa che
        // non c'è.
        if (!esito.ok) ricollegamentoFallito.value = true
    } catch {
        ricollegamentoFallito.value = true
    } finally {
        ponteInCorso.value = false
    }
}

async function accoppia(): Promise<void> {
    if (ponteInCorso.value || !codiceValido.value) return
    ponteInCorso.value = true
    ponteMotivo.value = null
    try {
        const paio = await plugin().bridgePair({ code: codice.value.trim() })
        if (!paio.ok) {
            ponteMotivo.value = talosPonteMotivo(paio.reason)
            return
        }
        // ⭐ Accoppiati: il collegamento è l'ALTRA porta, e la si cerca subito.
        // Chiedere alla persona di premere un secondo pulsante qui sarebbe farle
        // fare un passo che sappiamo già di dover fare.
        codice.value = ''
        const collegato = await plugin().bridgeConnect({})
        ponteCollegato.value = collegato.ok === true
        if (!collegato.ok) ponteMotivo.value = talosPonteMotivo(collegato.reason)
    } catch {
        ponteMotivo.value = talosPonteMotivo(undefined)
    } finally {
        ponteInCorso.value = false
    }
}

async function rileggi(): Promise<void> {
    caricando.value = true
    try {
        snapshot.value = await plugin().snapshot()
    } catch {
        // Il ponte nativo assente non e' un guasto da mostrare come errore: e'
        // la build web, dove questa pagina non ha semplicemente niente da dire.
        snapshot.value = null
    } finally {
        caricando.value = false
    }
}

const guida = computed(() => (snapshot.value
    ? talosShizukuGuidance(snapshot.value, haChiesto.value)
    : null))
const portata = computed(() => (snapshot.value ? talosShizukuReach(snapshot.value) : null))

const identita = computed(() => {
    const uid = snapshot.value?.uid ?? -1
    if (uid === 0) return t('privilege.identityRoot')
    if (uid === 2000) return t('privilege.identityShell')
    return t('privilege.identityUnknown')
})

async function agisci(): Promise<void> {
    const azione = guida.value?.action
    if (!azione || azione === 'none') return
    if (azione === 'request') {
        // ⛔ Si segna PRIMA di chiedere: se il produttore blocca, la richiesta
        // non torna mai con un esito, e senza questo la pagina resterebbe per
        // sempre a dire «premi il pulsante».
        haChiesto.value = true
        try { await plugin().request() } catch { /* la pagina lo mostra da se' */ }
        await rileggi()
        return
    }
    // ⛔ L'apertura la fa il lato NATIVO, non un launcher generico: se Shizuku
    // non è installato va aperta la sua pagina, non l'app che non c'è — e a
    // distinguere i due casi è il PackageManager, che sta di là.
    try {
        await plugin().open({ target: azione === 'openShizuku' ? 'shizuku' : 'developer' })
    } catch { /* la pagina dice già il percorso a parole */ }
}

onMounted(() => {
    void rileggi()
    void leggiPonte()
})
</script>

<template>
    <div
        class="flex min-h-full flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
        data-testid="talos-privilege-screen"
    >
        <p class="flex items-start gap-2 text-xs leading-5 text-[var(--talos-muted)]">
            <Smartphone class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            {{ t('privilege.intro') }}
        </p>

        <p v-if="caricando" role="status" class="py-6 text-sm text-[var(--talos-muted)]">
            {{ t('privilege.refresh') }}…
        </p>

        <!--
            IL PASSO. Uno solo, grande. Il bordo cambia quando è un blocco del
            produttore invece di una cosa da fare: un passo si fa, un blocco si
            capisce, e chi non distingue i due riprova all'infinito.
        -->
        <section
            v-else-if="guida"
            data-testid="talos-privilege-step"
            class="flex flex-col gap-3 rounded-[var(--talos-radius-card)] border p-4"
            :class="guida.ready
                ? 'border-[var(--talos-accent)]/40 bg-[var(--talos-accent)]/5'
                : guida.manufacturerBlocked
                    ? 'border-[var(--talos-warning)]/50 bg-[var(--talos-warning)]/10'
                    : 'border-[var(--talos-border)]'"
        >
            <h2 class="flex items-start gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <ShieldAlert
                    v-if="guida.manufacturerBlocked"
                    class="mt-0.5 size-4 shrink-0 text-[var(--talos-warning)]"
                    aria-hidden="true"
                />
                <Check
                    v-else-if="guida.ready"
                    class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]"
                    aria-hidden="true"
                />
                <span data-testid="talos-privilege-title">{{ t(guida.titleKey) }}</span>
            </h2>

            <p class="text-xs leading-5 text-[var(--talos-muted)]" data-testid="talos-privilege-body">
                {{ t(guida.bodyKey) }}
            </p>

            <p v-if="snapshot?.outdated" class="text-xs leading-5 text-[var(--talos-warning)]">
                {{ t('privilege.outdated') }}
            </p>

            <button
                v-if="guida.actionKey"
                type="button"
                data-testid="talos-privilege-action"
                class="flex min-h-touch items-center justify-center gap-2 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-4 text-sm font-semibold text-[var(--talos-accent-contrast)]"
                @click="void agisci()"
            >
                {{ t(guida.actionKey) }}
                <ChevronRight class="size-4" aria-hidden="true" />
            </button>
        </section>

        <!--
            ⭐⭐ IL PONTE IN CASA — la seconda strada, e su questa ROM l'unica.

            Sta SOTTO il passo di Shizuku e non al posto suo: dove Shizuku
            funziona è più rapido e non chiede niente. Ma quando il produttore lo
            blocca — misurato su OxygenOS 16 — questa è la sola che resta, e una
            pagina che finisse lì direbbe «non si può» avendo in tasca il modo.
        -->
        <section
            v-if="pontePresente"
            data-testid="talos-ponte"
            :data-ponte-passo="ponte.passo"
            class="flex flex-col gap-3 rounded-[var(--talos-radius-card)] border p-4"
            :class="ponte.ready
                ? 'border-[var(--talos-accent)]/40 bg-[var(--talos-accent)]/5'
                : 'border-[var(--talos-border)]'"
        >
            <h2 class="flex items-start gap-2 text-sm font-semibold text-[var(--talos-text)]">
                <Check
                    v-if="ponte.ready"
                    class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]"
                    aria-hidden="true"
                />
                <Smartphone v-else class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                <span data-testid="talos-ponte-title">{{ t(ponte.titleKey) }}</span>
            </h2>

            <p class="text-xs leading-5 text-[var(--talos-muted)]" data-testid="talos-ponte-body">
                {{ t(ponte.bodyKey) }}
            </p>

            <!--
                ⭐ Il campo chiede SOLO il codice. Le due porte le trova TALOS
                con gli annunci di rete: è il pezzo che nelle app simili si
                scarica sull'utente, tre numeri copiati da due schermate mentre
                una finestrella scade.
            -->
            <template v-if="ponte.wantsCode">
                <button
                    type="button"
                    data-testid="talos-ponte-open"
                    class="flex min-h-touch items-center justify-center gap-2 rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-4 text-xs text-[var(--talos-text)]"
                    @click="void plugin().open({ target: 'developer' })"
                >
                    {{ t('ponte.openDeveloper') }}
                    <ChevronRight class="size-4" aria-hidden="true" />
                </button>
                <label class="flex flex-col gap-1">
                    <span class="font-mono text-2xs uppercase tracking-wider text-[var(--talos-muted)]">
                        {{ t('ponte.codeLabel') }}
                    </span>
                    <input
                        v-model="codice"
                        data-testid="talos-ponte-code"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        maxlength="6"
                        :aria-label="t('ponte.codeLabel')"
                        class="min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] bg-transparent px-3 font-mono text-lg tracking-[0.3em] text-[var(--talos-text)]"
                    >
                </label>
            </template>

            <button
                v-if="ponte.actionKey"
                type="button"
                data-testid="talos-ponte-action"
                :disabled="ponteInCorso || (ponte.wantsCode && !codiceValido)"
                class="flex min-h-touch items-center justify-center gap-2 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-4 text-sm font-semibold text-[var(--talos-accent-contrast)] disabled:opacity-40"
                @click="void (ponte.wantsCode ? accoppia() : ricollega())"
            >
                {{ ponteInCorso ? `${t('privilege.refresh')}…` : t(ponte.actionKey) }}
            </button>

            <p
                v-if="ponteMotivo"
                data-testid="talos-ponte-reason"
                class="text-xs leading-5 text-[var(--talos-warning)]"
            >
                {{ t(ponteMotivo) }}
            </p>
        </section>

        <!--
            ⛔ «Autorizzato» non vuol dire «tutto»: con l'identità della shell si
            FA, ma niente sopravvive al riavvio. Dirlo qui evita di promettere la
            seconda cosa avendo ottenuto la prima.
        -->
        <section v-if="portata" class="flex flex-col gap-2" data-testid="talos-privilege-reach">
            <h3 class="font-mono text-2xs uppercase tracking-wider text-[var(--talos-muted)]">
                {{ t('privilege.reachHeading') }}
            </h3>
            <p class="flex items-center gap-2 text-xs text-[var(--talos-text)]">
                <Check v-if="portata.canAct" class="size-3.5 text-[var(--talos-accent)]" aria-hidden="true" />
                <X v-else class="size-3.5 text-[var(--talos-muted)]" aria-hidden="true" />
                {{ portata.canAct ? t('privilege.reachAct') : t('privilege.reachActNo') }}
            </p>
            <p class="flex items-center gap-2 text-xs text-[var(--talos-text)]">
                <Check v-if="portata.survivesReboot" class="size-3.5 text-[var(--talos-accent)]" aria-hidden="true" />
                <X v-else class="size-3.5 text-[var(--talos-muted)]" aria-hidden="true" />
                {{ portata.survivesReboot ? t('privilege.reachReboot') : t('privilege.reachRebootNo') }}
            </p>
        </section>

        <section v-if="snapshot && snapshot.version >= 0" class="flex flex-col gap-2">
            <h3 class="font-mono text-2xs uppercase tracking-wider text-[var(--talos-muted)]">
                {{ t('privilege.detailsHeading') }}
            </h3>
            <p class="flex items-baseline justify-between gap-3 text-xs">
                <span class="text-[var(--talos-muted)]">{{ t('privilege.detailVersion') }}</span>
                <span class="font-mono text-[var(--talos-text)]">{{ snapshot.version }}</span>
            </p>
            <p class="flex items-baseline justify-between gap-3 text-xs">
                <span class="text-[var(--talos-muted)]">{{ t('privilege.detailIdentity') }}</span>
                <span class="font-mono text-[var(--talos-text)]">{{ identita }}</span>
            </p>
        </section>

        <button
            type="button"
            data-testid="talos-privilege-refresh"
            class="flex min-h-touch items-center justify-center gap-2 self-start rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-4 text-xs text-[var(--talos-text)]"
            @click="void rileggi()"
        >
            <RefreshCw class="size-3.5" aria-hidden="true" />
            {{ t('privilege.refresh') }}
        </button>
    </div>
</template>
