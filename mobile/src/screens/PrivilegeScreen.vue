<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useTalosI18n } from '@/i18n'
import { Check, ChevronRight, RefreshCw, Smartphone } from '@lucide/vue'
import {
    openTalosAppSettings,
    readTalosDeviceState,
    requestTalosNotifications,
} from '@/services/devicePermissions'
import type { TalosShizukuSnapshot } from '@/lib/privilege/shizukuGuidance'
import {
    talosCodiceValido,
    talosPonteGuida,
    talosPonteMotivo,
    talosPonteRiaggancioAutomatico,
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
/**
 * Se il tentativo automatico è già stato speso per la caduta in corso.
 *
 * ⛔ Si RIARMA quando il ponte torna su, non quando la pagina si rimonta: una
 * pagina riaperta dieci volte non ha diritto a dieci `adb connect`, ma una
 * caduta nuova sì. Vedi `talosPonteRiaggancioAutomatico`.
 */
const riaggancioSpeso = ref(false)

const ponte = computed(() => talosPonteGuida({
    packaged: pontePresente.value,
    connected: ponteCollegato.value,
    reconnectFailed: ricollegamentoFallito.value,
}))

const codiceValido = computed(() => talosCodiceValido(codice.value))

/**
 * Lo stato VERO del ponte, chiesto al ponte. Nessuna deduzione.
 *
 * ⛔⛔ E il RIARMO del tentativo automatico sta QUI, sull'osservazione, non
 * sull'esito che `bridgeConnect` promette.
 *
 * MISURATO sul Pad il 2026-08-09, ed è un difetto trovato solo perché la prova
 * si fa nei due versi. Prima versione: il riaggancio riusciva e basta. Il
 * diritto al tentativo però si riarmava soltanto quando una LETTURA vedeva il
 * ponte su — e la lettura dopo un riaggancio riuscito arriva **sei secondi**
 * dopo, perché la sentinella passa subito al ritmo lento. Staccato il ponte
 * dentro quella finestra: TALOS non ci riprovava **mai più**.
 *
 * ⇒ Su una rete che balla — Wi-Fi che va e viene, Debug wireless che si
 * riaccende — quello non è un caso di laboratorio: è il caso normale.
 *
 * E il riarmo NON può stare sull'`ok` del tentativo: un `ok` che non regge
 * farebbe ritentare ogni due secondi per sempre. Si riarma su ciò che si vede.
 */
async function osservaPonte(): Promise<void> {
    try {
        const stato = await plugin().bridgeStatus()
        pontePresente.value = stato.packaged === true
        ponteCollegato.value = stato.connected === true
    } catch {
        // Build web: il ponte non esiste, e la sezione lo dice invece di fingere.
        pontePresente.value = false
        ponteCollegato.value = false
    }
    if (ponteCollegato.value) {
        riaggancioSpeso.value = false
        // Un fallimento di prima non deve tenere in vista il campo del codice a
        // ponte collegato: lo stato vivo batte la memoria.
        ricollegamentoFallito.value = false
    }
}

async function leggiPonte(): Promise<void> {
    await osservaPonte()
    /*
     * ⭐ IL RIAGGANCIO DA SOLO — la frase a schermo diventa vera.
     *
     * La pagina prometteva «TALOS si ricollega da solo»; MISURATO il
     * 2026-08-09, non lo faceva: undici letture in ventitré secondi e nessun
     * tentativo. Il perché di ogni condizione sta su
     * `talosPonteRiaggancioAutomatico`.
     */
    const passo = talosPonteRiaggancioAutomatico({
        packaged: pontePresente.value,
        connected: ponteCollegato.value,
        giaTentato: riaggancioSpeso.value,
        inCorso: ponteInCorso.value,
    })
    riaggancioSpeso.value = passo.speso
    if (passo.tenta) {
        await ricollega()
        // ⛔ Il tentativo non dichiara vittoria da solo: si RIGUARDA. È questa
        // riga che riarma il diritto per la caduta successiva.
        await osservaPonte()
    }
    // ⛔ La sentinella si riarma DA QUI e non dalla montata: al `mounted` questi
    // due valori sono ancora `false` perché la lettura è asincrona, e una
    // sentinella decisa lì non partirebbe mai. Qui invece lo stato è quello
    // vero, appena letto.
    sorveglia()
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

const identita = computed(() => {
    const uid = snapshot.value?.uid ?? -1
    if (uid === 0) return t('privilege.identityRoot')
    if (uid === 2000) return t('privilege.identityShell')
    return t('privilege.identityUnknown')
})

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
            // ⛔ Le parole degli ALTRI DUE momenti si consegnano adesso, tutte
            // insieme. «Sto lavorando» e «non è andata» nascono su un thread di
            // sfondo, quando questa pagina non è più a schermo e il JavaScript
            // non è più nel giro: chiederle allora vorrebbe dire scriverle in
            // Kotlin, cioè in una lingua sola.
            working: t('ponte.floatWorking'),
            failed: t('ponte.floatFailed'),
            ready: t('ponte.floatReady'),
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
        addListener?: (evento: string, cb: (dati: { connected?: boolean, reason?: string }) => void) => void
    }
    p.addListener?.('talosPonteChanged', (dati) => {
        ponteCollegato.value = dati.connected === true
        /*
         * ⛔ Anche il NO arriva qui, e va detto. Prima si trattava solo il sì:
         * un accoppiamento fallito lasciava la pagina esattamente com'era, e
         * chi rientrava da Impostazioni trovava «accoppia» senza sapere se
         * aveva sbagliato il codice o se non era partito niente.
         */
        ponteMotivo.value = dati.connected === true
            ? null
            : talosPonteMotivo(dati.reason ?? undefined)
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
    if (document.visibilityState !== 'visible') { smettiDiSorvegliare(); return }
    // ⛔ Si rilegge ANCHE la fotografia, non solo il ponte: al rientro può essere
    // cambiata l'identità o il permesso, e una pagina che ne aggiorna metà
    // racconta uno stato che non è mai esistito.
    void rileggi()
    void leggiPonte()
}

/* ------------------------------------------------------------------------ *
 * IL RICONTROLLO AUTOMATICO
 * ------------------------------------------------------------------------ */

let sentinella: ReturnType<typeof setTimeout> | null = null

/**
 * ⭐ Guarda da sé, invece di aspettare che qualcuno prema «aggiorna».
 *
 * Owner 2026-08-09: «deve ricontrollare automaticamente, ed essere super
 * veloce». Adesso si può: il controllo costa **115 ms** misurati sul Pad
 * (`bridgeStatus` × 3: 124, 114, 110 ms) — prima ne costava fino a dieci
 * secondi, perché stava in coda dietro al ponte sul thread condiviso.
 *
 * ## ⛔ ANCHE quando è collegato — e questa riga è costata una prova
 *
 * La prima versione girava **solo** se il ponte era impacchettato e **non**
 * collegato: guardavo la transizione «spento → acceso» e davo per scontato che
 * a collegamento fatto non ci fosse più niente da vedere.
 *
 * MISURATO sul Pad il 2026-08-09: spento il Debug wireless con il ponte
 * collegato e la pagina aperta, dopo cinque secondi diceva ancora «TALOS è
 * collegato al tuo telefono». L'ha scoperto solo perché ho toccato
 * «Ricontrolla».
 *
 * ⇒ La transizione che una persona incontra davvero è **l'altra**: il ponte che
 * cade sotto i piedi — al riavvio, quando il Debug wireless si spegne, quando
 * cambia rete. Sorvegliare solo l'arrivo e non la caduta vuol dire raccontare
 * una capacità che non c'è più, che è il difetto del compito #33.
 *
 * ## I due ritmi, e perché sono due
 *
 * Il controllo costa **115 ms** misurati (`bridgeStatus` × 3: 124, 114, 110).
 *
 * - **non collegato → 2 s** (6% del tempo): la persona sta facendo qualcosa
 *   adesso e aspetta di vedere l'esito, quindi la freschezza vale il costo;
 * - **collegato → 6 s** (2%): la caduta è rara e non urgente — nessuno la sta
 *   provocando apposta — e pagare il ritmo veloce per sorvegliare una cosa
 *   stabile sarebbe spendere batteria per un evento che non arriva.
 *
 * E si ferma sempre quando la pagina non è a schermo: un controllo che nessuno
 * guarda è batteria spesa per niente.
 */
function sorveglia(): void {
    smettiDiSorvegliare()
    if (document.visibilityState !== 'visible') return
    if (!pontePresente.value) return
    /*
     * ⛔ Un colpo solo che si riarma, non un `setInterval`.
     *
     * `leggiPonte()` richiama `sorveglia()` quando ha finito: con un intervallo
     * fisso il prossimo colpo partirebbe a orologio anche se il precedente non
     * è ancora tornato, e su una rete lenta si accavallerebbero due `adb
     * devices`. Così invece i due secondi contano dalla FINE del controllo
     * precedente, e non ce n'è mai più di uno in volo.
     */
    sentinella = setTimeout(() => { void leggiPonte() }, ponteCollegato.value ? 6_000 : 2_000)
}

function smettiDiSorvegliare(): void {
    if (sentinella === null) return
    clearTimeout(sentinella)
    sentinella = null
}

onUnmounted(() => {
    document.removeEventListener('visibilitychange', quandoTorna)
    // ⛔ Senza questa riga la sentinella sopravvive alla pagina: un intervallo
    // che interroga un ponte per una schermata che non esiste più.
    smettiDiSorvegliare()
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
            ⛔⛔ QUI C'ERA IL PASSO DI SHIZUKU — tolto il 2026-08-09.

            Era un riquadro che diceva «installa Shizuku», «avvialo»,
            «autorizzaci». Con Shizuku fuori dal progetto quel riquadro
            mostrerebbe per sempre il primo gradino di una scala che non porta
            piu' da nessuna parte: un'istruzione da seguire che non serve a
            niente e' peggio di nessuna istruzione, perche' chi la segue si
            convince che il problema sia suo.

            Il ponte, che era la seconda strada, adesso e' l'unica ed e' qui
            sotto: sei cifre lette sul proprio schermo, una volta.
        -->

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
