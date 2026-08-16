<script setup lang="ts">
/**
 * ⭐⭐⭐ LA SCHEDA DI UN'AZIONE — decisione dell'owner del 2026-08-13.
 *
 * > «Scheda sempre. L'app si apre SOLO quando non c'è altro modo.»
 *
 * ## La misura che l'ha decisa
 *
 * Nove righe contro Gemini sul Pad. A «accendi la torcia» loro rispondono
 * «Torcia accesa» **e lasciano l'interruttore acceso dentro la chat**: per
 * spegnerla si tocca lì. Noi dicevamo «fatto» e chiudevamo il discorso.
 *
 * ⇒ *Noi consegnavamo un ESITO, loro consegnano uno STATO con cui si può ancora
 * interagire.* Questa è la differenza, ed è tutta qui dentro.
 *
 * ## ⛔ Cosa NON fa, e perché conta
 *
 * Non disegna colori suoi. Ogni valore viene dal motore dei temi — i ruoli
 * shadcn e i token `--talos-*` che `applyDesignTokens.ts` scrive a runtime —
 * perché i temi sono **quattordici** e alla prossima palette una scheda con
 * l'ambra scritta a mano sarebbe l'unica cosa fuori posto.
 *
 * ## ⛔ La riga tecnica non la vede chi non l'ha chiesta
 *
 * `dumpsys`, i millisecondi, i nomi dei comandi: sono la nostra prova, non la
 * lingua di chi usa il telefono. Compaiono solo con `debug_diagnostics` acceso
 * — la stessa preferenza che la schermata Doctor commuta già.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTalosI18n } from '@/i18n'
import { TALOS_TOOL_LABEL_KEYS } from '@/lib/tools/toolLabels'
import { TALOS_METADATA_SCHEDE, type TalosScheda } from '@/lib/tools/tracciaAzione'

/**
 * ⛔ La scheda arriva GREZZA dai metadati, e la validazione sta qui.
 *
 * Il chiamante è nel grafo d'avvio, questo componente no: mettere il controllo
 * là costava byte a chi apre l'app senza aver mai visto una scheda. E il posto
 * giusto per validare è comunque chi disegna — se la forma non regge, non si
 * disegna niente invece di rompere la chat.
 */
function eUnaScheda(valore: unknown): valore is TalosScheda {
    if (typeof valore !== 'object' || valore === null) return false
    const r = valore as Record<string, unknown>
    if (r.tipo === 'agenda') {
        // ⛔ Una scheda agenda VUOTA non si disegna: «non hai niente» è una
        // frase, non un riquadro con dentro il nulla.
        return Array.isArray(r.voci) && r.voci.length > 0
            && r.voci.every((v) => typeof (v as Record<string, unknown>)?.titolo === 'string'
                && typeof (v as Record<string, unknown>)?.quando === 'string')
    }
    // ⛔ Una sveglia senza ORA non si disegna: è proprio il dato per cui la
    // scheda esiste, e un riquadro vuoto direbbe «guarda» senza niente da
    // guardare.
    if (r.tipo === 'sveglia') return typeof r.quando === 'string' && r.quando !== ''
    /*
     * ⛔ Un elenco di app VUOTO non si disegna, ed è più di un dettaglio grafico:
     * questa scheda esiste perché il modello, avendo l'elenco vero in mano, ne
     * ha inventato uno suo. Un riquadro che chiede «quale app?» senza app
     * sotto è la stessa domanda senza la risposta che la giustifica.
     *
     * ⛔ E `pacchetto` è OBBLIGATORIO per ogni voce: è ciò che il tocco
     * consegna al telefono. Una voce col solo nome sarebbe un pulsante che non
     * può fare niente.
     */
    if (r.tipo === 'quale-app') {
        return typeof r.capacita === 'string' && r.capacita !== ''
            && typeof r.valori === 'object' && r.valori !== null
            && Array.isArray(r.app) && r.app.length > 0
            && r.app.every((a) => typeof (a as Record<string, unknown>)?.nome === 'string'
                && typeof (a as Record<string, unknown>)?.pacchetto === 'string'
                && (a as Record<string, unknown>).pacchetto !== '')
    }
    /**
     * ⛔ Il titolo è OBBLIGATORIO: una scheda «creato» senza il nome della cosa
     * direbbe soltanto «è successo qualcosa», che è meno della frase accanto.
     * Il `dove` invece è facoltativo, e quando manca la scheda mostra e basta —
     * meglio niente pulsante che un pulsante che non porta da nessuna parte.
     */
    if (r.tipo === 'creato') {
        return typeof r.titolo === 'string' && r.titolo !== ''
            && typeof r.genere === 'string' && r.genere !== ''
    }

    return r.tipo === 'interruttore'
        && typeof r.tool === 'string' && r.tool !== ''
        && typeof r.acceso === 'boolean'
}

/** ⛔ Le forme si distinguono qui, così il template resta leggibile. */
type SchedaAgenda = Extract<TalosScheda, { tipo: 'agenda' }>
type SchedaInterruttore = Extract<TalosScheda, { tipo: 'interruttore' }>
type SchedaSveglia = Extract<TalosScheda, { tipo: 'sveglia' }>
type SchedaQualeApp = Extract<TalosScheda, { tipo: 'quale-app' }>
const eAgenda = (s: TalosScheda): s is SchedaAgenda => s.tipo === 'agenda'
const eInterruttore = (s: TalosScheda): s is SchedaInterruttore => s.tipo === 'interruttore'
const eSveglia = (s: TalosScheda): s is SchedaSveglia => s.tipo === 'sveglia'
const eQualeApp = (s: TalosScheda): s is SchedaQualeApp => s.tipo === 'quale-app'
type SchedaCreato = Extract<TalosScheda, { tipo: 'creato' }>
const eCreato = (s: TalosScheda): s is SchedaCreato => s.tipo === 'creato'

/**
 * ⛔ La rotta arriva dall'attrezzo che ha creato la cosa, e resta INTERNA: si
 * accetta solo un percorso che comincia per «/». Una scheda è dato che passa
 * dal modello, e un `dove` fatto arrivare come `https://…` o `javascript:`
 * sarebbe una porta aperta da un testo generato.
 */
const rotta = useRouter()
function apri(dove: string): void {
    if (!dove.startsWith('/') || dove.startsWith('//')) return
    void rotta.push(dove)
}

const props = defineProps<{
    /**
     * ⛔ I metadati INTERI, non una scheda sola: leggere, validare e ciclare
     * costava al grafo d'avvio quando stava nella lista dei messaggi. Qui è
     * tutto dentro un componente pigro, e al chiamante resta un elemento.
     */
    metadata?: Readonly<Record<string, unknown>> | null
    /** Vero solo se la persona ha acceso la diagnostica nelle impostazioni. */
    diagnostica?: boolean
    /** Il dettaglio tecnico della prova, mostrato solo con la diagnostica. */
    dettaglio?: string | null
}>()

const { t } = useTalosI18n()

/**
 * ⭐⭐ I DUE PONTI STANNO QUI, e non nelle schermate che montano la scheda.
 *
 * ⛔ Prima erano due `prop`, e le due schermate che le passavano — la lista dei
 * messaggi e la barra — vivono **nel grafo d'avvio**: quel codice lo pagava
 * ogni persona che apre l'app, anche senza aver mai visto una scheda. Questo
 * componente è pigro: qui costa zero.
 *
 * ⛔ E non è solo un risparmio: la stessa funzione stava scritta in **due**
 * schermate, cioè due posti che un giorno divergono. Il tocco è il consenso —
 * la regola sta in `schedaComandi`, una volta sola, e chi disegna la chiama.
 */
async function commutaComando(tool: string, acceso: boolean): Promise<boolean> {
    const { talosCommutaDaScheda } = await import('@/lib/tools/schedaComandi')
    return talosCommutaDaScheda(tool, acceso)
}

async function apriConApp(
    capacita: string,
    valori: Readonly<Record<string, string>>,
    pacchetto: string,
): Promise<boolean> {
    const { talosApriDaScheda } = await import('@/lib/tools/schedaComandi')
    return talosApriDaScheda(capacita, valori, pacchetto)
}

/**
 * ⛔ Il nome INTERNO non si mostra mai: `device_torch` non dice niente a
 * nessuno. Si passa dal catalogo delle etichette, lo stesso che usa la riga
 * dell'attività — è la regola già in vigore nella lista dei messaggi.
 */
function etichettaDi(tool: string): string {
    const chiave = TALOS_TOOL_LABEL_KEYS[tool]
    return chiave ? t(chiave) : tool
}

/**
 * ⛔ Lo stato VIVO, non quello scritto nel messaggio.
 *
 * La regola ricavata dal confronto: *una scheda che porta uno stato deve
 * cambiare quando lo stato cambia*. È il difetto misurato di Gemini — annullata
 * la sveglia, la sua scheda continuava a mostrare «Sveglia 07:30» sotto la
 * frase «è stata cancellata».
 */
const schede = computed<TalosScheda[]>(() => {
    const righe = props.metadata?.[TALOS_METADATA_SCHEDE]
    return Array.isArray(righe) ? righe.filter(eUnaScheda) : []
})

/**
 * ⛔ Lo stato VIVO di ogni levetta, per tool.
 *
 * La regola ricavata dal confronto: *una scheda che porta uno stato deve
 * cambiare quando lo stato cambia*. È il difetto misurato di Gemini — annullata
 * la sveglia, la sua scheda continuava a mostrare «Sveglia 07:30» sotto la
 * frase «è stata cancellata».
 */
const vivo = ref<Record<string, boolean>>({})
const inCorso = ref<Record<string, boolean>>({})
const statoDi = (s: SchedaInterruttore): boolean => vivo.value[s.tool] ?? s.acceso
watch(schede, (nuove) => {
    for (const s of nuove) if (eInterruttore(s)) delete vivo.value[s.tool]
    void nuove
}, { deep: true })

/**
 * ⛔ Ottimista, ma **reversibile**: la levetta si sposta subito perché il tocco
 * deve sembrare istantaneo, e torna indietro se il ponte dice di no. Una
 * levetta che resta spostata mentre la torcia è ancora accesa sarebbe la stessa
 * bugia del segno «Fatto» su una cosa non fatta.
 */
async function tocca(s: SchedaInterruttore): Promise<void> {
    if (inCorso.value[s.tool]) return
    const prima = statoDi(s)
    const dopo = !prima
    vivo.value = { ...vivo.value, [s.tool]: dopo }
    inCorso.value = { ...inCorso.value, [s.tool]: true }
    try {
        const fatto = await commutaComando(s.tool, dopo)
        if (fatto !== true) vivo.value = { ...vivo.value, [s.tool]: prima }
    } catch {
        vivo.value = { ...vivo.value, [s.tool]: prima }
    } finally {
        inCorso.value = { ...inCorso.value, [s.tool]: false }
    }
}

/**
 * ⭐⭐⭐ LE ICONE VERE DELLE APP — owner 2026-08-14: «icone pulite e coerenti
 * nelle schede per ogni app prevista».
 *
 * ## ⛔ Chieste al telefono, e solo al momento di disegnarle
 *
 * Vengono da `getApplicationIcon`: sono quelle che la persona vede sul suo
 * launcher. Un'icona disegnata da noi sarebbe una riga predeterminata col
 * vestito grafico — invecchia al primo restyling e per l'app installata domani
 * non esiste.
 *
 * E non stanno nei metadati del messaggio: diciassette app a ~6 kB l'una sono
 * cento kilobyte salvati per sempre nel database e ricopiati in ogni backup,
 * per un dato che il telefono ha già. La scheda porta il **pacchetto** — che è
 * il fatto — e l'icona si chiede qui.
 *
 * ## ⛔ Fallisce in SILENZIO, e deve
 *
 * Sul web il ponte non c'è; un'app disinstallata fra l'elenco e il disegno non
 * risponde. In tutti e due i casi resta il posto vuoto con la stessa cornice, e
 * la riga si tocca lo stesso: l'icona è un aiuto a riconoscere, non il dato.
 */
const icone = ref<Record<string, string>>({})

watch(schede, async (nuove) => {
    const pacchetti = nuove
        .filter(eQualeApp)
        .flatMap((s) => s.app.map((a) => a.pacchetto))
        .filter((p) => !(p in icone.value))
    if (pacchetti.length === 0) return
    try {
        const { TalosDeviceBridge } = await import('@/lib/device/devicePlugin')
        const risposta = await TalosDeviceBridge.iconeApp({ pacchetti })
        icone.value = { ...icone.value, ...risposta.icone }
    } catch {
        // Nessun telefono, o nessuna icona: la cornice resta vuota.
    }
}, { immediate: true })

/**
 * ⭐⭐⭐ IL TOCCO SU UN'APP — e l'esito detto, riuscito o no.
 *
 * ⛔ Non è ottimista come la levetta, e la differenza è voluta: una levetta
 * torna indietro senza che sia successo niente, mentre qui l'effetto è **un'app
 * che si apre davanti agli occhi**. Scrivere «Aperta» prima di saperlo sarebbe
 * il segno «Fatto» su una cosa non fatta — e la persona lo vedrebbe smentito
 * dallo schermo che resta fermo.
 *
 * ⛔ E si dice anche quando NON si apre. Il telefono aveva risposto che quell'app
 * sa fare questa cosa (`queryIntentActivities`), poi l'app ha rifiutato:
 * tacere lascerebbe la persona a toccare due volte lo stesso nome.
 */
const esitoApp = ref<Record<string, 'apre' | 'aperta' | 'rifiutata'>>({})
const chiaveApp = (s: SchedaQualeApp, pacchetto: string): string => `${s.capacita}:${pacchetto}`
const esitoDi = (s: SchedaQualeApp, pacchetto: string): 'apre' | 'aperta' | 'rifiutata' | undefined =>
    esitoApp.value[chiaveApp(s, pacchetto)]

function parolaEsito(s: SchedaQualeApp, pacchetto: string): string {
    const esito = esitoDi(s, pacchetto)
    if (esito === 'aperta') return t('chat.cardAppOpened')
    if (esito === 'rifiutata') return t('chat.cardAppRefused')
    return ''
}

async function scegli(s: SchedaQualeApp, pacchetto: string): Promise<void> {
    const chiave = chiaveApp(s, pacchetto)
    if (esitoApp.value[chiave] === 'apre') return
    esitoApp.value = { ...esitoApp.value, [chiave]: 'apre' }
    try {
        const fatto = await apriConApp(s.capacita, s.valori, pacchetto)
        esitoApp.value = { ...esitoApp.value, [chiave]: fatto === true ? 'aperta' : 'rifiutata' }
    } catch {
        esitoApp.value = { ...esitoApp.value, [chiave]: 'rifiutata' }
    }
}

/**
 * ⛔ Lo stato è detto anche a PAROLE, non solo dal colore della levetta.
 *
 * È il pavimento di accessibilità che le linee guida 2026 sulle chat mettono
 * per primo: il colore non può essere l'unico segno. Qui lo stato si legge in
 * tre modi — la levetta, questa parola, e la striscia di prova.
 */
const parolaStato = (acceso: boolean): string => (acceso
    ? t('chat.cardSwitchOn')
    : t('chat.cardSwitchOff'))
</script>

<template>
    <div
        v-for="(s, i) in schede"
        :key="`${s.tipo}-${i}`"
        class="talos-scheda mt-2 overflow-hidden border border-border bg-card text-card-foreground"
        data-testid="talos-scheda-azione"
    >
        <div class="talos-scheda-corpo">
            <!--
                ⭐⭐⭐ L'AGENDA — misurata contro Gemini il 2026-08-14: alla
                stessa domanda lui risponde col testo E due schede, noi solo
                testo. Una riga per impegno, l'ora davanti perché è la cosa che
                si cerca per prima guardando un'agenda.
            -->
            <template v-if="eAgenda(s)">
                <div
                    v-for="voce in s.voci"
                    :key="`${voce.quando}-${voce.titolo}`"
                    class="talos-voce flex items-baseline border border-border bg-muted"
                >
                    <span class="talos-ora flex-none tabular-nums">{{ voce.quando }}</span>
                    <span class="flex-1">
                        {{ voce.titolo }}
                        <span
                            v-if="voce.luogo || voce.calendario"
                            class="mt-px block text-xs text-muted-foreground"
                        >{{ [voce.luogo, voce.calendario].filter(Boolean).join(' · ') }}</span>
                    </span>
                </div>
            </template>

            <!--
                ⭐⭐ LA SVEGLIA: l'ORA grande, perché è il dato che sbaglia.

                Lo stesso giorno in cui è nata questa scheda, «metti in agenda
                domani» è finito due giorni più in là e nessuno se n'è accorto
                finché non ho interrogato il provider. Un'ora scritta grande si
                controlla in un colpo d'occhio; una sveglia alle 7 invece che
                alle 19 costa una giornata.

                ⛔ Nessun comando: su questa ColorOS `ACTION_DISMISS_ALARM` non
                cancella niente — misurato per orario, per «la prossima» e per
                «tutte». Una levetta che non spegne è la bugia del «Fatto» con
                un dito sopra. Quando la ROM lascerà spegnere, il comando viene
                qui.
            -->
            <div
                v-if="eSveglia(s)"
                class="talos-controllo flex items-baseline border border-border bg-muted"
                data-testid="talos-scheda-sveglia"
            >
                <span class="talos-sveglia-ora flex-none tabular-nums">{{ s.quando }}</span>
                <span class="talos-nome flex-1">
                    <!--
                        ⛔ Dal CATALOGO, non da una chiave scritta a mano.
                        Misurato sul Pad il 2026-08-14: avevo scritto
                        `t('tools.labels.device_alarm')`, quella chiave non
                        esiste, e sullo schermo compariva la stringa grezza
                        `tools.labels.device_alarm` accanto all'ora. È
                        letteralmente la regola «i nomi interni non si mostrano
                        mai», rotta dal file che la cita.
                    -->
                    {{ etichettaDi('device_alarm') }}
                    <span
                        v-if="s.etichetta"
                        class="mt-px block text-xs text-muted-foreground"
                    >{{ s.etichetta }}</span>
                </span>
            </div>

            <!--
                ⭐⭐⭐ QUALCOSA CHE ORA ESISTE — sette capacità che non lasciavano
                traccia: note, attività, documenti, immagini, ricerche, memorie,
                file esportati.

                ⛔ È la famiglia dell'evento in agenda: «una nota creata ha la
                stessa faccia di una nota detta e mai creata». E come l'evento
                non si vede — a differenza della torcia, non c'è niente nel
                mondo che ti dica se è successo.

                ⛔ Il `<button>` c'è SOLO col `dove`: un comando che non porta
                da nessuna parte è peggio di nessun comando, ed è la stessa
                regola per cui la sveglia tace sull'annulla che la ROM non le
                lascia fare.

                ⛔ Colori: nessuno scritto qui. `border-border`, `bg-muted`,
                `text-muted-foreground` vengono dal theme engine, come tutte le
                altre schede — cambiare tema le cambia tutte insieme.
            -->
            <component
                :is="eCreato(s) && s.dove ? 'button' : 'div'"
                v-if="eCreato(s)"
                :type="s.dove ? 'button' : undefined"
                class="talos-controllo flex w-full items-center gap-2 border border-border bg-muted text-left"
                :class="s.dove ? 'talos-pressable' : ''"
                data-testid="talos-scheda-creato"
                @click="s.dove ? apri(s.dove) : undefined"
            >
                <span class="talos-nome min-w-0 flex-1">
                    <span class="block truncate">{{ s.titolo }}</span>
                    <span class="mt-px block text-xs text-muted-foreground">
                        {{ s.genere }}<template v-if="s.dettaglio"> · {{ s.dettaglio }}</template>
                    </span>
                </span>
                <span v-if="s.dove" class="talos-freccia flex-none" aria-hidden="true">›</span>
            </component>

            <!--
                ⭐⭐⭐ QUALE APP — l'elenco vero, TOCCABILE.

                MISURATO sul Pad il 2026-08-13: col medesimo elenco in mano, il
                modello ha risposto «WhatsApp, Telegram, Signal, Messenger,
                ChatGPT» — tre non installate e una inventata. Qui l'elenco va
                dal telefono allo schermo senza passare dalle parole, e le voci
                si toccano: chi legge non deve ridire un nome che TALOS ha già.

                ⛔ Un `<button>` per riga, non un `<div>` con `@click`: si
                raggiunge col TAB, si preme con INVIO, e un lettore di schermo
                lo annuncia come comando. Il chevron è l'unico segno che
                distingue queste righe da quelle dell'agenda, che si leggono e
                basta.
            -->
            <template v-if="eQualeApp(s)">
                <p class="talos-domanda">{{ t('chat.cardWhichApp') }}</p>
                <button
                    v-for="a in s.app"
                    :key="a.pacchetto"
                    type="button"
                    class="talos-app flex w-full items-center border border-border bg-muted text-left"
                    :aria-busy="esitoDi(s, a.pacchetto) === 'apre'"
                    :disabled="esitoDi(s, a.pacchetto) === 'apre'"
                    data-testid="talos-scheda-app"
                    @click="scegli(s, a.pacchetto)"
                >
                    <!--
                        ⭐ L'ICONA VERA dell'app, dentro una cornice UGUALE per
                        tutte: le icone di Android arrivano di forme diverse —
                        quadrate, tonde, con e senza margine — e in colonna la
                        differenza si vede subito. La cornice le rende coerenti
                        senza deformarle (`object-fit: contain`).

                        ⛔ `aria-hidden`: il nome è già scritto accanto, e un
                        lettore di schermo che dicesse due volte «WhatsApp»
                        allungherebbe l'elenco senza aggiungere niente. E la
                        cornice resta anche senza icona, se no le righe
                        ballerebbero a seconda di cosa è arrivato.
                    -->
                    <span class="talos-icona" aria-hidden="true">
                        <img v-if="icone[a.pacchetto]" :src="icone[a.pacchetto]" alt="">
                    </span>
                    <span class="talos-nome flex-1">
                        {{ a.nome }}
                        <!--
                            ⛔ La riga dell'esito c'è SEMPRE, anche vuota: una
                            zona `aria-live` creata nel momento in cui cambia
                            non viene annunciata: il lettore di schermo deve
                            averla già osservata. Vuota non occupa spazio.
                        -->
                        <span
                            class="talos-esito block text-xs text-muted-foreground"
                            aria-live="polite"
                        >{{ parolaEsito(s, a.pacchetto) }}</span>
                    </span>
                    <span class="talos-freccia" aria-hidden="true">›</span>
                </button>
            </template>

            <div v-if="eInterruttore(s)" class="talos-controllo flex items-center border border-border bg-muted">
                <span class="talos-nome flex-1">
                    {{ etichettaDi(s.tool) }}
                    <span class="mt-px block text-xs text-muted-foreground">{{ parolaStato(statoDi(s)) }}</span>
                </span>
                <!--
                    ⛔ `role="switch"` con `aria-checked`, non una casella: chi
                    usa un lettore di schermo deve sentire «attivato», non
                    «pulsante». E il fuoco si vede, perché una scheda si
                    attraversa anche da tastiera.
                -->
                <button
                    type="button"
                    role="switch"
                    class="talos-levetta"
                    :aria-checked="statoDi(s)"
                    :aria-busy="inCorso[s.tool] === true"
                    :aria-label="`${etichettaDi(s.tool)}: ${parolaStato(statoDi(s))}`"
                    data-testid="talos-scheda-levetta"
                    @click="tocca(s)"
                />
            </div>

            <!--
                ⛔ `flex-wrap`: col tetto a 24rem la riga diagnostica non ci sta
                più accanto alla prova, e `whitespace-nowrap` la faceva uscire
                dalla scheda. Va a capo invece di traboccare.
            -->
            <!--
                ⛔ `data-acceso` vale solo per l'interruttore: è ciò che rende
                grigia la striscia quando la cosa è spenta. Per l'agenda non c'è
                niente di «spento» — è stata LETTA, e la prova resta verde.
            -->
            <!--
                ⛔⛔⛔ «VERIFICATO SUL TELEFONO» SOLO SE È VERO.

                Questa striscia si disegnava su OGNI scheda, senza condizioni.
                MISURATO sul Pad il 2026-08-14, appena nata la scheda della
                sveglia: sotto «07:30» compariva «✓ Verificato sul telefono» —
                e la sveglia **non si può rileggere**. L'API di Android non lo
                permette a un'app qualunque: l'orologio la possiede, e noi
                sappiamo solo di aver consegnato una richiesta.

                ⇒ Un segno di verifica su una cosa non verificata è la stessa
                bugia del «Fatto» su una cosa non fatta, con una spunta sopra —
                ed è peggio, perché una spunta invita a non controllare.

                La torcia si rilegge (`dumpsys media.camera`), l'agenda si
                rilegge (il provider): quelle due la meritano. La sveglia no, e
                tace invece di mentire.
            -->
            <p
                v-if="!eSveglia(s)"
                class="talos-prova mt-2 flex flex-wrap items-baseline border"
                :data-acceso="eInterruttore(s) ? statoDi(s) : true"
            >
                <span class="talos-segno" aria-hidden="true">✓</span>
                <span>{{ t('chat.cardProofRead') }}</span>
                <!--
                    ⛔ Solo con la diagnostica: `dumpsys torch on` è la nostra
                    prova, non la lingua della persona.
                -->
                <span
                    v-if="diagnostica && dettaglio"
                    class="talos-dettaglio ml-auto text-muted-foreground"
                    data-testid="talos-scheda-dettaglio"
                >{{ dettaglio }}</span>
            </p>
        </div>
    </div>
</template>

<style scoped>
/*
 * ⛔ NESSUN VALORE SCRITTO A MANO. Tutto viene dal motore dei temi: i ruoli
 * shadcn per i colori, i token `--talos-*` per raggi, spazi e bersagli del
 * tocco. Cambiando tema cambiano anche gli spigoli e la densità — Forge è
 * squadrato e compatto, Calm è morbido.
 */
/*
 * ⛔⛔ IL COMANDO NON SI STIRA — e il tetto è MISURATO, non scelto.
 *
 * Visto sul Pad in orizzontale: la levetta finiva a **1.108 px dal suo nome**.
 * L'occhio non li collega più e il pollice deve attraversare lo schermo.
 *
 * ## Da dove viene il 24rem
 *
 * Non è un numero gradevole: è la riga di comando **come sta su un telefono**,
 * letta con `uiautomator` sul Pad a 1080×2400 / 420 dpi — la fumetto andava da
 * x=42 a x=1039, cioè **997 px fisici = 380 px CSS ≈ 24rem**, con 609 px fra il
 * nome e la levetta. È la geometria su cui l'occhio e il pollice sono tarati.
 *
 * ⇒ *La scheda non diventa mai più larga di quanto sarebbe su un telefono.*
 *
 * ⛔ Il primo tentativo metteva il tetto sulla sola RIGA di controllo, a 34rem.
 * Sbagliato due volte, e il dispositivo lo ha mostrato: 34rem è il **42% più
 * larga** di una riga da telefono (restavano 1.108 px di vuoto fra nome e
 * levetta), e il tetto sulla riga dentro una scheda larga 1.720 px lasciava una
 * fascia morta alla sua destra. Il tetto va sulla SCHEDA, e la riga la riempie.
 */
.talos-scheda {
    max-inline-size: 24rem;
    border-radius: var(--talos-radius-card);
}
.talos-scheda-corpo { padding: var(--talos-space-card); }
.talos-nome { font-size: calc(0.95rem * var(--talos-ui-scale, 1)); }
/*
 * ⭐ L'ora della sveglia è GRANDE: è l'unica cosa che questa scheda esiste per
 * far vedere, e un'ora sbagliata deve saltare all'occhio senza doverla cercare.
 * `tabular-nums` perché le cifre stiano in colonna fra una sveglia e l'altra.
 */
.talos-sveglia-ora {
    font-size: calc(1.35rem * var(--talos-ui-scale, 1));
    font-weight: 600;
    min-inline-size: 5ch;
    line-height: 1.2;
}
.talos-controllo {
    gap: var(--talos-space-control);
    padding: var(--talos-space-control);
    border-radius: var(--talos-radius-control);
}
/*
 * ⭐ La riga di un impegno. Stessa scatola del comando — stesso raggio, stesso
 * respiro — perché a schermo sono due forme della stessa scheda.
 */
.talos-voce {
    gap: var(--talos-space-control);
    padding: var(--talos-space-control);
    border-radius: var(--talos-radius-control);
    font-size: calc(0.95rem * var(--talos-ui-scale, 1));
}
.talos-voce + .talos-voce { margin-block-start: 0.35rem; }
/*
 * ⛔ L'ora davanti e a cifre di larghezza fissa: incolonnata si legge di
 * traverso, che è come si guarda un'agenda — prima QUANDO, poi cosa.
 */
/*
 * ⛔ Una LARGHEZZA MINIMA, non una colonna che si stira — visto sul Pad: senza,
 * l'ora prendeva metà scheda e il titolo finiva schiacciato a destra. `ch` è la
 * misura giusta perché il contenuto è di cifre: undici caratteri stanno sia a
 * «17:00–18:00» sia a una data intera.
 */
.talos-ora {
    color: var(--muted-foreground);
    font-size: calc(0.82rem * var(--talos-ui-scale, 1));
    min-inline-size: 11ch;
}
/*
 * ⭐ La domanda che apre l'elenco: piccola e in tono spento. La cosa da guardare
 * sono i NOMI sotto — l'etichetta dice solo che c'è una scelta da fare.
 */
.talos-domanda {
    color: var(--muted-foreground);
    font-size: calc(0.78rem * var(--talos-ui-scale, 1));
    margin-block-end: 0.35rem;
}
/*
 * ⭐ La riga di un'app: stessa scatola del comando e dell'impegno, perché a
 * schermo sono tre forme della stessa scheda. Cambia una cosa sola — questa si
 * PREME, e il bersaglio del tocco viene dal tema.
 *
 * ⛔ `min-block-size` dal token e non un numero: i temi compatti stringono gli
 * spazi, e una riga da premere col pollice non deve poter scendere sotto il
 * bersaglio minimo insieme a loro.
 */
.talos-app {
    gap: var(--talos-space-control);
    padding: var(--talos-space-control);
    border-radius: var(--talos-radius-control);
    min-block-size: var(--talos-touch-target);
    cursor: pointer;
    transition: background .18s ease;
}
.talos-app + .talos-app { margin-block-start: 0.35rem; }
/*
 * ⭐⭐ LA CORNICE DELL'ICONA — è questa a rendere l'elenco «pulito e coerente».
 *
 * Le icone di Android arrivano di forme diverse: quadrate, tonde, alcune col
 * margine dentro il file e altre a filo. In colonna la differenza si vede al
 * primo sguardo. La cornice dà a tutte lo stesso quadrato, lo stesso raggio e lo
 * stesso posto; `object-fit: contain` le adatta **senza deformarle**, che è la
 * differenza fra ordinato e schiacciato.
 *
 * ⛔ Resta anche VUOTA, e non è uno spreco: senza, una riga con l'icona e una
 * senza avrebbero il testo a due rientri diversi — e un elenco che balla è
 * esattamente ciò che l'owner ha chiesto di non avere.
 *
 * ⛔ Il lato viene dal token del bersaglio di tocco, non da un numero: nei temi
 * compatti tutto stringe, e un'icona che resta grande mentre la riga si accorcia
 * la fa sembrare incollata.
 */
.talos-icona {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: calc(var(--talos-touch-target) * 0.62);
    block-size: calc(var(--talos-touch-target) * 0.62);
    border-radius: calc(var(--talos-radius-control) * 0.8);
    overflow: hidden;
}
.talos-icona img {
    inline-size: 100%;
    block-size: 100%;
    object-fit: contain;
}
.talos-app:hover:not(:disabled) { background: var(--accent); }
.talos-app:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
.talos-app:disabled { cursor: progress; }
/* ⛔ Il chevron è l'unico segno che questa riga si preme: resta spento come
   l'ora dell'agenda, perché indica una direzione, non un'importanza. */
.talos-freccia {
    color: var(--muted-foreground);
    flex: none;
    font-size: calc(1.1rem * var(--talos-ui-scale, 1));
    line-height: 1;
}
/* ⛔ `.talos-levetta` è stata promossa a `src/style.css` il 2026-08-16, perché
   ora la disegnano anche le impostazioni: uno stile `scoped` non attraversa i
   componenti, e tenerne due copie significa che un giorno divergono. Qui non
   resta niente — la scheda continua a usarla, la prende da lì. */
.talos-levetta:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }

/*
 * ⭐ LA STRISCIA DI PROVA — la firma di TALOS.
 *
 * Gemini dice «lo sto inviando»; questa riga dice cosa è stato VISTO. Il verde
 * del tema compare solo qui: altrove smetterebbe di voler dire «verificato».
 */
.talos-prova {
    gap: var(--talos-space-inline);
    padding: 0.5rem 0.7rem;
    border-radius: var(--talos-radius-control);
    /*
     * ⛔ MAI una misura assoluta: `0.78rem` scavalcherebbe la preferenza di
     * dimensione del testo, e otto superfici ci erano già passate sotto.
     * La scala della persona moltiplica, sempre.
     */
    font-size: calc(0.78rem * var(--talos-ui-scale, 1));
    background: color-mix(in srgb, var(--talos-success) 12%, transparent);
    border-color: color-mix(in srgb, var(--talos-success) 34%, transparent);
}
.talos-prova[data-acceso="false"] {
    background: color-mix(in srgb, var(--muted-foreground) 12%, transparent);
    border-color: color-mix(in srgb, var(--muted-foreground) 30%, transparent);
}
.talos-segno { color: var(--talos-success); flex: none; line-height: 1.2; }
.talos-prova[data-acceso="false"] .talos-segno { color: var(--muted-foreground); }
.talos-dettaglio {
    font-family: var(--talos-font-mono, ui-monospace, monospace);
    font-size: calc(0.7rem * var(--talos-ui-scale, 1));
    /* ⛔ Un `dumpsys` senza spazi non spinge la scheda: si spezza dove capita. */
    overflow-wrap: anywhere;
}

@media (prefers-reduced-motion: reduce) {
    .talos-levetta { transition: none; }
    .talos-app { transition: none; }
}
</style>
