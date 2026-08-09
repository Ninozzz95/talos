<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useTalosI18n } from '@/i18n'
import { Check, ChevronRight, RefreshCw, ShieldAlert, Smartphone, X } from '@lucide/vue'
import {
    openTalosAppSettings,
    readTalosDeviceState,
    requestTalosNotifications,
} from '@/services/devicePermissions'
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
        pairNotification(options: Record<string, string>): Promise<{ shown: boolean }>
        pairNotificationClose(): Promise<{ closed: boolean }>
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

/**
 * ⭐⭐ La strada che chiude davvero il giro: il campo GALLEGGIA sopra
 * Impostazioni.
 *
 * ⛔ Perché serve, misurato sul Pad il 2026-08-08 alle 22:24: la finestrella
 * «Accoppia con codice» muore quando esci da Impostazioni, e con lei il servizio
 * `_adb-tls-pairing._tcp`. Chi passa a TALOS per scrivere le sei cifre trova un
 * annuncio che non c'è più — e il campo qui nella pagina non può funzionare.
 *
 * ⇒ Si mostra PRIMA la finestra flottante e POI si aprono le impostazioni: se si
 * facesse il contrario, l'app andrebbe in secondo piano prima di aver disegnato
 * niente, e non ci sarebbe più nessuno a disegnarlo.
 */
async function apriFlottante(): Promise<void> {
    ponteMotivo.value = null
    /*
     * ⭐⭐ IL CODICE SI SCRIVE NELLA TENDINA. La finestra flottante non c'è più.
     *
     * Owner, 2026-08-09: «appena entro in dev settings la finestra flottante
     * viene coperta». Da Android 15 le opzioni sviluppatore dichiarano il
     * contenuto protetto dalla condivisione schermo, e su OxygenOS quella
     * protezione si porta via anche le finestre disegnate sopra.
     *
     * La tendina la disegna SystemUI e passa sopra qualunque schermata,
     * comprese quelle protette. PROVATO sul Pad con le opzioni sviluppatore in
     * primo piano: notifica viva, pulsante «Accoppia», campo di scrittura
     * aperto, tastiera su.
     *
     * ⛔ E se ne tiene UNA sola. Due strade per lo stesso passo vogliono dire
     * due modi di fallire, e quella coperta falliva **in silenzio**: la persona
     * restava dentro Impostazioni a cercare un campo che non c'era.
     */
    try {
        /*
         * ⛔ Il permesso si chiede PRIMA, non si scopre dopo.
         *
         * MISURATO sul Pad: `POST_NOTIFICATIONS granted=false`, la notifica non
         * si posava, e senza questo passo la persona sarebbe finita dentro
         * Impostazioni davanti al nulla. `pm grant` e `appops set` sono
         * bloccati da questa ROM: l'unica strada è il dialogo di sistema, cioè
         * che sia TALOS a chiederlo — com'è giusto.
         */
        const stato = await readTalosDeviceState()
        if (stato.notifications !== 'granted') {
            const dopo = await requestTalosNotifications()
            // Negato per sempre: il dialogo non ricomparirà, e l'unica cosa
            // utile è portarla dove l'interruttore c'è davvero.
            if (dopo === 'denied') {
                await openTalosAppSettings('notifications')
                return
            }
        }
    } catch { /* si prova lo stesso: `shown` dirà la verità */ }

    try {
        const notifica = await plugin().pairNotification({
            title: t('ponte.floatTitle'),
            instruction: t('ponte.floatInstruction'),
            action: t('ponte.pairAction'),
        })
        if (!notifica.shown) {
            ponteMotivo.value = talosPonteMotivo('notification-not-shown')
            return
        }
        await plugin().open({ target: 'developer' })
    } catch {
        ponteMotivo.value = talosPonteMotivo(undefined)
    }
}

onMounted(() => {
    void rileggi()
    void leggiPonte()

    /*
     * ⛔ La finestra flottante vive FUORI dalla pagina, e mentre lavora questa
     * schermata non è nemmeno a schermo: la persona è dentro Impostazioni.
     * Quindi l'esito non può tornare come valore di ritorno — torna come
     * evento. Senza questo ascolto, chi rientra in TALOS troverebbe ancora
     * «accoppia» dopo essersi accoppiato.
     */
    const p = plugin() as unknown as {
        addListener?: (evento: string, cb: (dati: { connected?: boolean }) => void) => void
    }
    p.addListener?.('talosPonteChanged', (dati) => {
        ponteCollegato.value = dati.connected === true
        if (dati.connected === true) ponteMotivo.value = null
    })

    /*
     * ⛔⛔ SI RILEGGE AL RIENTRO, e non è un dettaglio di comodità.
     *
     * Il permesso della finestra flottante si concede in una pagina di SISTEMA:
     * la persona esce da TALOS, tocca un interruttore, e torna. Senza questa
     * riga la schermata continuerebbe a offrire «Consenti la finestra
     * flottante» a chi l'ha appena consentita — che è esattamente il difetto
     * chiuso col compito #33, un pannello che racconta uno stato vecchio.
     *
     * `visibilitychange` e non un plugin: è la stessa cosa e non aggiunge una
     * dipendenza a una schermata che ne ha già abbastanza.
     */
    document.addEventListener('visibilitychange', quandoTorna)
})

function quandoTorna(): void {
    if (document.visibilityState === 'visible') void leggiPonte()
}

onUnmounted(() => {
    document.removeEventListener('visibilitychange', quandoTorna)
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
            <!--
                ⭐⭐ LA STRADA CHE CHIUDE IL GIRO, e sta per prima perché è
                l'unica che funziona: il campo galleggia sopra Impostazioni,
                così la finestrella col codice non muore mentre scrivi.
            -->
            <button
                v-if="ponte.floatKey"
                type="button"
                data-testid="talos-ponte-float"
                :data-needs-permission="ponte.floatNeedsPermission ? 'yes' : 'no'"
                class="flex min-h-touch items-center justify-center gap-2 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-4 text-sm font-semibold text-[var(--talos-accent-contrast)]"
                @click="void apriFlottante()"
            >
                {{ t(ponte.floatKey) }}
                <ChevronRight class="size-4" aria-hidden="true" />
            </button>

            <template v-if="ponte.wantsCode">
                <p class="text-2xs leading-4 text-[var(--talos-muted)]">
                    {{ t('ponte.fallbackNote') }}
                </p>
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
            @click="void rileggi(); void leggiPonte()"
        >
            <RefreshCw class="size-3.5" aria-hidden="true" />
            {{ t('privilege.refresh') }}
        </button>
    </div>
</template>
