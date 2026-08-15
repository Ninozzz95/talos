<script setup lang="ts">
import {
    talosChiediRuoloAssistente,
    talosLeggiRuoloAssistente,
    talosNominaAssistenteColPonte,
    type TalosStatoRuoloAssistente,
} from '@/lib/device/ruoloAssistente'
import {
    talosAccendiLaParola,
    talosLeggiLaParola,
    talosSpegniLaParola,
    type TalosStatoParola,
} from '@/lib/device/parola'
import {
    talosLeggiScorciatoie,
    talosPannelloDeiModiAperto,
    talosPreset,
    type TalosStatoScorciatoie,
} from '@/lib/device/scorciatoie'
import TalosConsensoAutonomia from '@/components/talos/permissions/TalosConsensoAutonomia.vue'
import { useSettingsStore } from '@/stores/settings'
import { TALOS_TOOL_ACTIONS } from '@/lib/tools/permissionTypes'

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
    TALOS_TENTATIVI_DOPO_CADUTA,
    TALOS_TENTATIVI_DOPO_SCOSSA,
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
/**
 * ⭐⭐ IL RUOLO DI ASSISTENTE — la scheda che mancava.
 *
 * Owner 2026-08-11, provando la barra: «la funzione assistenza è collegata
 * all'app?». Non lo era: si metteva solo dalle Impostazioni di sistema, e l'app
 * non sapeva nemmeno di averlo.
 *
 * ⛔ E si azzera a ogni reinstallazione dell'APK (misurato): senza questa
 * scheda la barra smetteva di aprirsi e sembrava un difetto nostro.
 */
const ruolo = ref<TalosStatoRuoloAssistente>({ held: false, canRequest: false })

/**
 * ⭐⭐⭐ COME SI CHIAMA TALOS — lo stato vero delle tre scorciatoie.
 *
 * ⛔ Non è un'impostazione nostra e non si salva: le due chiavi le scrive il
 * sistema quando la persona sceglie, e le può cambiare senza passare da qui.
 * Si rileggono a ogni ritorno in primo piano, come i permessi.
 */
const scorciatoie = ref<TalosStatoScorciatoie>({
    volume: false,
    bottone: false,
    servizio: '',
    chiavi: {},
})

/** I tre preset, calcolati dai fatti: il ruolo più ciò che dice il sistema. */
const preset = computed(() => talosPreset(ruolo.value.held, scorciatoie.value))

async function leggiScorciatoie(): Promise<void> {
    scorciatoie.value = await talosLeggiScorciatoie()
}

/**
 * ⛔ Apre la schermata di SISTEMA e basta: l'ultimo tocco lo dà la persona.
 *
 * Nessuna app può assegnarsi il tasto di accensione né mettersi da sola nella
 * scorciatoia di accessibilità — e se anche potessimo, non lo faremmo: mettere
 * TALOS su un tasto senza chiedere è esattamente ciò che rende un assistente
 * qualcosa da cui difendersi.
 */
async function apriPreset(schermata: string): Promise<void> {
    const { TalosDeviceBridge } = await import('@/lib/device/devicePlugin')
    await TalosDeviceBridge.openSettingsScreen({ action: schermata, forThisApp: false })
        .catch(() => undefined)
}

/**
 * ⭐⭐⭐ UNA CATEGORIA SOLA: «Come lo chiami».
 *
 * Owner 2026-08-14, guardando la prima versione: «devono essere raggruppati in
 * una unica categoria ed in modo coerente anche le altre, così non mi sembra
 * molto bello lato UI».
 *
 * Aveva ragione, ed è un difetto di sostanza prima che di grafica. Prima c'erano
 * **quattro riquadri** per una domanda sola — il ruolo, i preset (dentro un
 * riquadro, altri riquadri), la voce, il pallino — con tre misure di titolo
 * diverse. La persona che si chiede «come apro TALOS?» doveva leggere quattro
 * schede per scoprire che parlano tutte della stessa cosa.
 *
 * ⇒ Una categoria, righe uguali, una grammatica: **titolo, stato a destra, una
 * riga di spiegazione, e il comando solo se c'è qualcosa da fare**. È la stessa
 * forma del pannello degli strumenti, che in questa app è già la voce con cui le
 * schermate parlano.
 *
 * ⛔ E le due righe che dipendono dal ruolo NON ripetono il pulsante del ruolo:
 * il comando sta una volta sola, sulla riga che lo governa. Tre pulsanti
 * identici in colonna sono rumore, e insegnano a non leggerli.
 */
interface TalosRigaChiamata {
    readonly id: string
    readonly testid: string
    /** `pronto` accende la riga; gli altri sono cose da fare, e lo dicono. */
    readonly pronto: boolean
    readonly stato: string
    readonly titolo: string
    readonly corpo: string
    readonly comando?: {
        readonly testid: string
        readonly etichetta: string
        readonly forte: boolean
        readonly spento: boolean
        readonly fai: () => void
    }
}

/**
 * ⛔ Il pannello dei modi di chiamare TALOS: chiuso, ma non muto.
 *
 * Owner 2026-08-15: «stanno diventando tante, voglio che li metti dentro un
 * collapse». `null` vuol dire «non l'ha ancora toccato», e finché è così decide
 * la situazione: chiuso se almeno un modo funziona, **aperto** se non ne
 * funziona nessuno — perché lì il chiuso nasconderebbe un guasto invece di un
 * dettaglio. Appena la persona tocca, la sua scelta vince.
 */
const chiamateToccato = ref<boolean | null>(null)
const chiamateAperte = computed({
    get: () => talosPannelloDeiModiAperto(
        chiamateToccato.value,
        chiamate.value.some((r) => r.pronto),
    ),
    set: (v: boolean) => { chiamateToccato.value = v },
})

/** Quante ne funzionano, da chiuso: l'unica cosa per cui il pannello esiste. */
const sommarioChiamate = computed(() => t('privilege.presetSummary', {
    ready: chiamate.value.filter((r) => r.pronto).length,
    total: chiamate.value.length,
}))

const chiamate = computed<readonly TalosRigaChiamata[]>(() => {
    const righe: TalosRigaChiamata[] = []
    /*
     * ⛔ IL RUOLO STA PER PRIMO, e non è impaginazione: due delle righe sotto
     * dipendono da lui, e leggerle prima di sapere che manca il ruolo vuol dire
     * leggerle due volte.
     */
    righe.push({
        id: 'assistente',
        testid: 'talos-ruolo-assistente',
        pronto: ruolo.value.held,
        stato: ruolo.value.held ? t('privilege.presetState.pronto') : t('privilege.presetState.da-mettere'),
        titolo: t('privilege.assistantTitle'),
        corpo: ruolo.value.held ? t('privilege.assistantHeld') : t('privilege.assistantBody'),
        comando: ruolo.value.held
            ? undefined
            : {
                testid: 'talos-ruolo-chiedi',
                etichetta: faseRuolo.value === 'chiedo'
                    ? t('privilege.assistantAsking')
                    : faseRuolo.value === 'ponte'
                        ? t('privilege.assistantBridging')
                        : t('privilege.assistantAsk'),
                forte: true,
                spento: faseRuolo.value === 'chiedo' || faseRuolo.value === 'ponte',
                fai: () => { void attivaAssistente() },
            },
    })
    for (const voce of preset.value) {
        righe.push({
            id: voce.id,
            testid: `talos-preset-${voce.id}`,
            pronto: voce.stato === 'pronto',
            stato: t(`privilege.presetState.${voce.stato}`),
            titolo: t(`privilege.preset.${voce.id}.title`),
            corpo: t(`privilege.preset.${voce.id}.body`),
            /*
             * ⛔ Solo la scorciatoia porta un comando suo. Le due che dipendono
             * dal ruolo non lo ripetono: il loro comando è la prima riga.
             */
            comando: voce.stato === 'da-mettere'
                ? {
                    testid: `talos-preset-vai-${voce.id}`,
                    etichetta: t('privilege.presetGoShortcut'),
                    forte: false,
                    spento: false,
                    fai: () => { void apriPreset(voce.schermata) },
                }
                : undefined,
        })
    }
    if (parola.value.available) {
        righe.push({
            id: 'parola',
            testid: 'talos-parola',
            pronto: parola.value.on,
            stato: parola.value.on ? t('privilege.presetState.pronto') : t('privilege.presetState.da-mettere'),
            titolo: t('privilege.wakeTitle'),
            corpo: parola.value.on ? t('privilege.wakeOn') : t('privilege.wakeBody'),
            comando: {
                testid: 'talos-parola-interruttore',
                etichetta: parola.value.on ? t('privilege.wakeOff') : t('privilege.wakeAsk'),
                /*
                 * ⛔ Il pulsante PIENO è uno solo in tutta la categoria, ed è
                 * quello del ruolo: è l'unico passo che sblocca altre righe.
                 * Voce e pallino sono interruttori — dare a tre righe lo stesso
                 * peso vuol dire non dirne nessuna.
                 */
                forte: false,
                spento: false,
                fai: () => { void alternaLaParola() },
            },
        })
    }
    return righe
})

async function leggiRuolo(): Promise<void> {
    ruolo.value = await talosLeggiRuoloAssistente()
    /*
     * ⛔ Il ruolo che ARRIVA cancella il ricordo del tentativo fallito.
     *
     * Misurato sul Pad l'11 agosto: dopo un tentativo andato a vuoto la fase
     * restava `niente` per sempre. Bastava mettere il ruolo dalle Impostazioni e
     * ritoglierlo, e la scheda tornava a mostrare «vai a farlo a mano» — un
     * consiglio su un tentativo che nel frattempo era stato superato.
     */
    if (ruolo.value.held) faseRuolo.value = 'fermo'
}

/**
 * ⭐⭐ UN PULSANTE SOLO, e la scheda si aggiorna DA SOLA.
 *
 * Owner 2026-08-11: «la UI deve essere super reattiva: quando imposto TALOS come
 * assistente deve aggiornarsi da sola, l'utente deve toccare solo un pulsante».
 *
 * Prima erano DUE tocchi e nessun aggiornamento: si premeva «Rendi TALOS
 * l'assistente», non succedeva niente (su ColorOS la finestra si chiude da
 * sola), e solo allora compariva un secondo pulsante per il ponte. E se il ruolo
 * lo mettevi dalle Impostazioni di sistema, tornando nell'app la scheda diceva
 * ancora di no.
 *
 * ## Come funziona adesso, in un tocco
 *
 * 1. si apre la finestra di SISTEMA — è la strada onesta: chiede, e decidi tu;
 * 2. si aspetta che la finestra si RICHIUDA, e il sistema dice com'è andata;
 * 3. se il ruolo c'è, finito;
 * 4. ⛔ se NON c'è **perché la finestra non è nemmeno comparsa**, si passa al
 *    ponte da soli, senza chiedere un secondo tocco.
 *
 * ⛔⛔ E il passo 4 NON scatta su un «no» della persona. Prima era un timer da
 * 2,5 s a decidere, e non sapeva distinguere «la ROM non ha mostrato niente» da
 * «ho letto e ho detto di no»: scaduto il tempo, il ponte si prendeva il ruolo
 * lo stesso. Un rifiuto è una decisione, e si rispetta.
 *
 * ⛔ E il RITORNO IN PRIMO PIANO rilegge sempre, non solo dentro questa
 * sequenza: così anche chi lo imposta a mano dalle Impostazioni trova la scheda
 * già verde quando rientra. È l'unica cosa che rende una schermata «viva»
 * invece che una fotografia scattata all'apertura.
 */
type TalosFaseRuolo = 'fermo' | 'chiedo' | 'ponte' | 'niente'
const faseRuolo = ref<TalosFaseRuolo>('fermo')

/** Chi torna in primo piano fa da sveglia: si rilegge, sempre. */
let smettiDiAscoltare: (() => void) | null = null

/**
 * ⭐⭐ «HEY TALOS» — sta QUI, e non fra le impostazioni della voce.
 *
 * Owner 2026-08-11: «collega le impostazioni di hey TALOS al controllo
 * telefono». Ed è il posto giusto: questa pagina raccoglie le cose che TALOS
 * può fare **sul dispositivo** quando non lo stai guardando — il ruolo di
 * assistente, la parola, il ponte. Una parola che apre l'assistente da sola
 * appartiene a quella famiglia, non ai cursori di velocità e tono.
 */
const parola = ref<TalosStatoParola>({ available: false, on: false, permesso: 'prompt' })

async function leggiLaParola(): Promise<void> {
    parola.value = await talosLeggiLaParola()
}

/**
 * ⛔ Spegnere non chiede niente, accendere sì.
 *
 * È l'unica funzione di TALOS che tiene il microfono sempre aperto: il permesso
 * lo chiede il ponte, perché una scheda di sistema la può mostrare solo chi ha
 * una finestra — e un servizio non ce l'ha.
 */
const impostazioni = useSettingsStore()

/**
 * ⛔⛔ IL CONSENSO SI CHIEDE UNA VOLTA, E SOLO SE NON E' GIA' STATO DATO.
 *
 * `talosEffectiveToolPermissions` riporta al default di oggi qualunque valore
 * che nessuno abbia SCELTO. Quindi «e' gia' stato dato» non si legge guardando
 * i tre valori — un `allow` ereditato non e' un consenso — ma guardando se le
 * tre azioni compaiono fra le scelte. E' la stessa distinzione che quel file
 * difende da settimane: un default e' un'ipotesi fatta al posto della persona,
 * una scelta e' un'opinione.
 */
const consensoAperto = ref(false)

const autonomiaGiaConcessa = computed(() => TALOS_TOOL_ACTIONS.every(
    (azione) => impostazioni.state.tools_chosen.includes(azione)
        && impostazioni.state.tools[azione] === 'allow',
))

async function alternaLaParola(): Promise<void> {
    if (parola.value.on) {
        // ⛔ Spegnere non chiede niente: togliere una capacita' non ha bisogno
        // di un permesso, e chiedere conferma per smettere e' un attrito messo
        // esattamente dove non serve.
        parola.value = await talosSpegniLaParola()
        return
    }
    if (!autonomiaGiaConcessa.value) {
        consensoAperto.value = true
        return
    }
    parola.value = await talosAccendiLaParola()
}

/**
 * ⭐⭐ IL SI': tre `allow`, registrati come SCELTA.
 *
 * ⛔ La registrazione (`tools_chosen`) e' meta' della cura, non un dettaglio:
 * senza, il primo avvio successivo riporterebbe i tre valori al default —
 * `ask` — e il consenso appena dato sparirebbe senza che nessuno lo tocchi. Un
 * si' che evapora e' peggio di un si' mai chiesto, perche' la persona crede di
 * averlo dato. `setToolPermissions` registra la scelta da solo, ed e' scritto
 * nel suo commento: «toccare un permesso e' sceglierlo».
 */
async function concediAutonomia(): Promise<void> {
    consensoAperto.value = false
    await impostazioni.setToolPermissions({ read: 'allow', write: 'allow', outbound: 'allow' })
    parola.value = await talosAccendiLaParola()
}

async function ascoltaIlRitorno(): Promise<void> {
    try {
        const { App } = await import('@capacitor/app')
        const iscrizione = await App.addListener('appStateChange', ({ isActive }) => {
            if (!isActive) return
            void leggiRuolo()
            /*
             * ⛔ E le scorciatoie: la persona ci mette TALOS in una schermata
             * di sistema che non torna nessun esito, quindi il solo momento in
             * cui possiamo saperlo è il rientro.
             */
            void leggiScorciatoie()
            // ⛔ Anche «hey TALOS»: il permesso del microfono si concede in
            // una pagina di sistema che non torna nessun esito, quindi l'unico
            // momento in cui possiamo sapere com'è andata è il rientro.
            void leggiLaParola()
        })
        smettiDiAscoltare = () => { void iscrizione.remove() }
    } catch {
        // Sul web non si torna da nessuna parte: la lettura all'apertura basta.
    }
}

async function attivaAssistente(): Promise<void> {
    if (faseRuolo.value !== 'fermo') return
    faseRuolo.value = 'chiedo'
    // La promessa si chiude quando si chiude la FINESTRA: è il sistema a dire
    // com'è andata, non un cronometro nostro.
    const esito = await talosChiediRuoloAssistente()
    await leggiRuolo()
    if (ruolo.value.held) { faseRuolo.value = 'fermo'; return }

    /*
     * ⛔ Se la finestra è stata VISTA e il ruolo non c'è, la persona ha detto di
     * no. Si ferma qui: prendersi col ponte ciò che è appena stato rifiutato
     * sarebbe la cosa peggiore che questa schermata possa fare.
     */
    if (esito.shown) { faseRuolo.value = 'fermo'; return }

    /*
     * ⛔ Qui NON si chiede un secondo tocco. La persona ne ha già dato uno e ha
     * detto cosa vuole; che la sua ROM non abbia mostrato la finestra è un
     * fatto nostro da risolvere, non una domanda da rigirarle.
     */
    faseRuolo.value = 'ponte'
    const { App } = await import('@capacitor/app')
    // ⛔ Il pacchetto si CHIEDE: `ai.talos` e `ai.talos.dev` sono due
    // installazioni diverse, e scriverlo a mano ne romperebbe una.
    const info = await App.getInfo()
    await talosNominaAssistenteColPonte(info.id)
    // Si RILEGGE dal sistema, non si crede all'esito dei comandi.
    await leggiRuolo()
    faseRuolo.value = ruolo.value.held ? 'fermo' : 'niente'
}

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
 * Quanti tentativi automatici restano per l'occasione in corso.
 *
 * ⛔ Si RICARICA quando il ponte torna su, non quando la pagina si rimonta: una
 * pagina riaperta dieci volte non ha diritto a dieci `adb connect`, ma una
 * caduta nuova sì. E una SCOSSA dall'esterno lo ricarica di più, perché è un
 * mondo cambiato e non la stessa caduta. Vedi `talosPonteRiaggancioAutomatico`.
 */
const tentativiRimasti = ref(TALOS_TENTATIVI_DOPO_CADUTA)

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
        tentativiRimasti.value = TALOS_TENTATIVI_DOPO_CADUTA
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
        tentativiRimasti: tentativiRimasti.value,
        inCorso: ponteInCorso.value,
    })
    tentativiRimasti.value = passo.rimasti
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
    void leggiRuolo()
    void leggiScorciatoie()
    void leggiLaParola()
    void ascoltaIlRitorno()
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
     * ⭐⭐ LA SCOSSA: è successo qualcosa che può aver fatto cadere il ponte.
     *
     * MISURATO sul Pad il 2026-08-09, in due viewport: guarire costava 128 ms,
     * ACCORGERSI 7,7-9,1 s. Tutto il tempo se ne andava nell'attesa del battito
     * lento — sei secondi per notare una caduta che si riparava in un decimo.
     *
     * ⛔ Il nativo NON dice se il ponte è su o giù: dice che il Debug wireless
     * è stato toccato, o che la rete è cambiata. La verità la sa solo
     * `adb devices`, quindi qui si RILEGGE davvero — e `leggiPonte` è la stessa
     * strada di sempre: osserva, decide, riaggancia, riosserva.
     *
     * ⇒ Un evento che portasse `connected` dentro di sé sarebbe il pannello che
     * mente del compito #33, con un travestimento nuovo.
     */
    p.addListener?.('talosPonteScosso', () => {
        /*
         * ⛔ MISURATO sul Pad il 2026-08-10: riacceso il Debug wireless, TALOS
         * NON tornava su in 40 secondi. `adbd` riparte su una **porta nuova**,
         * il primo tentativo la sbaglia, e col credito da un colpo solo quel
         * fallimento chiudeva la porta per sempre.
         *
         * ⇒ Una scossa è un'OCCASIONE NUOVA, non la stessa caduta: ricarica il
         * credito, e i tentativi si spendono al ritmo del battito mentre
         * `adbd` finisce di annunciarsi.
         */
        tentativiRimasti.value = TALOS_TENTATIVI_DOPO_SCOSSA
        ricollegamentoFallito.value = false
        void leggiPonte()
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
    // ⛔ L'ascolto muore con la schermata: un iscritto sopravvissuto
    // continuerebbe a rileggere per un componente che non c'è più.
    smettiDiAscoltare?.()
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
        <!-- ⛔ Il consenso all'autonomia: si chiede PRIMA, guardando lo schermo
             di proposito, perché durante l'assistente lo schermo non si tocca. -->
        <TalosConsensoAutonomia
            :aperta="consensoAperto"
            @consenti="concediAutonomia"
            @annulla="consensoAperto = false"
        />
        <p class="flex items-start gap-2 text-xs leading-5 text-[var(--talos-muted)]">
            <Smartphone class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            {{ t('privilege.intro') }}
        </p>

        <!--
            ⭐⭐⭐ COME LO CHIAMI — una categoria sola, righe uguali.

            Owner 2026-08-14: «devono essere raggruppati in una unica categoria
            ed in modo coerente anche le altre».

            La grammatica è quella del pannello degli strumenti, che in questa
            app è già la voce con cui le schermate parlano: un riquadro, un
            titolo, e righe separate da una riga sottile — titolo a sinistra,
            STATO a destra, una spiegazione sotto, e il comando solo dove c'è
            qualcosa da fare.

            ⛔ Niente riquadri dentro riquadri: la prima versione ne aveva tre
            annidati, ed è la cosa che rendeva la pagina un mucchio invece di un
            elenco.
        -->
        <section
            data-testid="talos-chiamate"
            class="flex flex-col rounded-[var(--talos-radius-card)] border border-[var(--talos-border)]"
        >
            <!--
                ⛔⛔ SI CHIUDE, ma NON diventa muta.

                Owner 2026-08-15: «stanno diventando tante, voglio che li metti
                dentro un collapse». Sono sei modi di chiamare TALOS, e sei
                paragrafi aperti sono un muro anche quando ognuno è breve.

                ⛔ Ma un pannello chiuso che dice solo «Come lo chiami» toglie
                l'unica informazione per cui esiste: QUANTI funzionano. Il
                sommario resta visibile da chiuso — è lo stesso motivo per cui
                lo stato di ogni riga è una parola e non un pallino.

                ⛔ E se non ne funziona NESSUNO si apre da solo: lì il chiuso
                nasconderebbe un guasto, non un dettaglio.
            -->
            <button
                type="button"
                data-testid="talos-chiamate-testa"
                :aria-expanded="chiamateAperte"
                aria-controls="talos-chiamate-corpo"
                class="flex w-full items-start gap-3 p-4 text-left"
                @click="chiamateAperte = !chiamateAperte"
            >
                <Smartphone class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                <span class="flex min-w-0 flex-1 flex-col gap-1">
                    <span class="text-sm font-semibold text-[var(--talos-text)]">
                        {{ t('privilege.presetTitle') }}
                    </span>
                    <span
                        class="text-xs leading-5 text-[var(--talos-muted)]"
                        data-testid="talos-chiamate-sommario"
                    >{{ chiamateAperte ? t('privilege.presetIntro') : sommarioChiamate }}</span>
                </span>
                <ChevronRight
                    class="mt-0.5 size-4 shrink-0 text-[var(--talos-muted)] transition-transform"
                    :class="chiamateAperte ? 'rotate-90' : ''"
                    aria-hidden="true"
                />
            </button>

            <div
                v-for="riga in (chiamateAperte ? chiamate : [])"
                id="talos-chiamate-corpo"
                :key="riga.id"
                :data-testid="riga.testid"
                :data-pronto="riga.pronto ? 'si' : 'no'"
                class="flex flex-col gap-2 border-t border-[var(--talos-border)] p-4"
            >
                <div class="flex items-start justify-between gap-3">
                    <h3 class="flex items-start gap-2 text-sm font-medium text-[var(--talos-text)]">
                        <!-- ⛔ La spunta compare SOLO dove è vero: è il segno che
                             fa scorrere l'occhio a ciò che manca. -->
                        <Check
                            v-if="riga.pronto"
                            class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]"
                            aria-hidden="true"
                        />
                        <span>{{ riga.titolo }}</span>
                    </h3>
                    <!--
                        ⛔ Lo stato è una PAROLA, non un pallino colorato: «da
                        mettere» e «manca il ruolo» portano a due mosse diverse,
                        e un colore solo le renderebbe la stessa cosa.
                    -->
                    <span
                        class="shrink-0 font-mono text-2xs uppercase tracking-wider"
                        :class="riga.pronto ? 'text-[var(--talos-accent)]' : 'text-[var(--talos-muted)]'"
                    >{{ riga.stato }}</span>
                </div>
                <p class="text-xs leading-5 text-[var(--talos-muted)]">
                    {{ riga.corpo }}
                </p>
                <button
                    v-if="riga.comando"
                    type="button"
                    :disabled="riga.comando.spento"
                    :data-testid="riga.comando.testid"
                    class="flex min-h-touch items-center justify-center gap-2 rounded-[var(--talos-radius-control)] px-4 text-xs font-semibold disabled:opacity-60"
                    :class="riga.comando.forte
                        ? 'bg-[var(--talos-accent)] text-[var(--talos-accent-contrast)]'
                        : 'border border-[var(--talos-border)] text-[var(--talos-foreground)]'"
                    @click="riga.comando.fai()"
                >
                    {{ riga.comando.etichetta }}
                    <ChevronRight v-if="!riga.comando.spento" class="size-4" aria-hidden="true" />
                </button>
            </div>

            <!--
                ⛔ Il viaggio a mano compare SOLO quando entrambe le strade del
                ruolo hanno fallito: un pulsante che non ha funzionato senza una
                via d'uscita è un vicolo cieco. E sta in fondo alla categoria,
                perché riguarda la prima riga ma si legge dopo averle provate.
            -->
            <p
                v-if="!ruolo.held && faseRuolo === 'niente'"
                class="border-t border-[var(--talos-border)] p-4 text-xs leading-5 text-[var(--talos-muted)]"
                data-testid="talos-ruolo-a-mano"
            >
                {{ t('privilege.assistantManual') }}
            </p>
        </section>

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
                class="flex min-h-touch items-center justify-center gap-2 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-4 text-xs font-semibold text-[var(--talos-accent-contrast)]"
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
                class="flex min-h-touch items-center justify-center gap-2 rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] px-4 text-xs font-semibold text-[var(--talos-accent-contrast)] disabled:opacity-40"
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
