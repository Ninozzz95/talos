/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M3 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`): lo stato della sezione «Computer»
 * (owner 20/10/2026: il nome del mockup v5). I computer ricordati (dal nativo, senza chiavi), l'accoppiamento a fasi per la schermata,
 * il controllo «in linea» col percorso, «Dimentica». Il plugin si inietta: le prove non hanno un telefono.
 */
import { ref, type Ref } from 'vue'
import { avviaAccoppiamento, type AccoppiamentoRiuscito, type ComputerDelQr, type PluginRemoto } from './accoppiamentoRemoto'
import { creaClienteRemoto } from './clienteRemoto'
import { trasportoNativo } from './trasportoNativo'
import { pluginRemoto } from './pluginRemoto'
import { apriPonteRemoto, collegaConRitentativo } from './sessioneRemota'
import { eliminaSessioneR4, leggiSessioniR4, rinominaSessioneR4, type TalosRigaSessioneR4 } from '@/lib/harness/r4/elencoSessioniR4'
import { idValidoDelPc } from './ponteRemotoR4'
import { attendiConsenso, chiediConsenso, type AttesaConsenso, type EsitoConsenso } from './consensoDelPc'
import { requestTalosNotifications } from '@/services/devicePermissions'
import { conteggiDelleSessioni, dimenticaRicordo, ricordaEffimero, ricordaProgramma, ricordaSessioni, ricordaVisto, type ConteggiSessioni } from './ricordiDelPc'

export interface ComputerRicordato {
    pcId: string
    nome: string | null
    /** L'indirizzo del relay, senza gettone. */
    relay: string | null
    accoppiatoAlle: number
}

/**
 * ⛔ D-0147-NAV-1 (Pad, 27/10/2026): `JSObject.put(chiave, null)` di Android TOGLIE la chiave (`TalosRemotoPlugin.kt` `elenco`), quindi
 * un PC accoppiato col QR senza `relay=` arrivava senza `relay` — undefined, non null — e chi lo leggeva come testo si rompeva. Al
 * confine col nativo ogni voce prende la forma del tipo: `nome` e `relay` sono testo o null.
 */
function computerDalNativo(v: ComputerRicordato): ComputerRicordato {
    const testo = (x: unknown): string | null => (typeof x === 'string' ? x : null)
    return { ...v, nome: testo(v.nome), relay: testo(v.relay) }
}

/**
 * Una cartella che il PC apre al dispositivo (`projects.list`): l'id da mandare a `session.start`, il nome da mostrare.
 * ⛔ D-MOCK-12 (dal vivo, 24/10/2026): una forma sola per i due PC.
 *   · Un PC r5-12 (contratto R5.12, parte 1, punto 1) manda `{ cartellaId, nome, dettaglio?, usataAlle, consentita }`: le recenti
 *     del PC, `consentita` per QUESTO dispositivo, `dettaglio` (la cartella madre) solo quando due righe hanno lo stesso nome.
 *   · Un PC più vecchio (R-M4, r4 `custom-task.mjs:84`) manda `{ id, nome }` della sua allowlist, che vale come consentita (il contratto
 *     conta l'allowlist esplicita fra le consentite): `dettaglio` e `usataAlle` null.
 */
export interface CartellaDelPc {
    id: string
    nome: string
    /** La cartella madre, solo per distinguere due righe con lo stesso nome; mai un percorso intero. */
    dettaglio: string | null
    /** ISO, l'ultima volta che il PC ci ha lavorato. */
    usataAlle: string | null
    /** Falsa: la prima sessione lì chiede il permesso al PC («Conferma sul computer»). */
    consentita: boolean
    /**
     * Cartelle bloccate (owner 27/10/2026, contratto del Desktop rev.1): tolta a questo dispositivo ma ancora raggiungibile da un'altra
     * consentita (una sottocartella, o una junction verso la stessa cartella). Il divieto vince: mai consentita, non si sceglie, si sblocca dal PC.
     */
    bloccata: boolean
}

const testoOppureNull = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null)
/** Una riga di `projects.list` nella forma unica, o null se l'id non segue la regola del PC o manca il nome. */
function cartellaDaRiga(v: Record<string, unknown> | null | undefined): CartellaDelPc | null {
    if (!v || typeof v.nome !== 'string' || v.nome.trim() === '') return null
    if ('cartellaId' in v) {
        if (!idValidoDelPc(v.cartellaId)) return null
        const bloccata = v.bloccata === true
        return {
            id: v.cartellaId, nome: v.nome, dettaglio: testoOppureNull(v.dettaglio), usataAlle: testoOppureNull(v.usataAlle),
            consentita: !bloccata && v.consentita === true, bloccata,
        }
    }
    if (!idValidoDelPc(v.id)) return null
    return { id: v.id, nome: v.nome, dettaglio: null, usataAlle: null, consentita: true, bloccata: false }
}

/** R-M5a: l'iscrizione Web Push che il distributore ha dato per un PC (RFC 8291: p256dh e auth in base64url). */
export interface IscrizioneSveglia { endpoint: string, keys: { p256dh: string, auth: string } }

/**
 * R-M5a: le notifiche da un PC. `disponibili: false` = senza Google Play services (la connessione nostra arriva con R-M5b).
 * Revisione R-M5a: `daMandare` = il PC non ha ancora l'iscrizione (la manda il lavoro nativo appena risponde); `vapid: false` = il PC
 * non ha dato la chiave all'accoppiamento; `consentite: false` = Android non lascia mostrare notifiche a TALOS.
 */
export interface StatoNotifiche {
    accese: boolean
    disponibili: boolean
    errore: string | null
    daMandare: boolean
    vapid: boolean
    consentite: boolean
}

/** R-M5a: l'esito di «Prova la notifica» (r4 `sveglia.mjs` `svegliaOra`), o `non-raggiunto` se il PC non risponde. */
export type EsitoProva =
    | { esito: 'inviata' | 'senza-iscrizione' | 'dimenticata' | 'fallita' }
    | { esito: 'troppo-presto', attendiMs?: number }
    | { esito: 'non-raggiunto', code: string }

const ESITI_DEL_PC = new Set(['inviata', 'senza-iscrizione', 'dimenticata', 'fallita', 'troppo-presto'])

export interface PluginComputer extends PluginRemoto {
    elenco(): Promise<{ computer: ComputerRicordato[] }>
    dimentica(o: { pcId: string }): Promise<{ dimenticato: boolean }>
    percorso(o: { canale: string }): Promise<{ tipo: string | null, rttMs: number | null }>
    nomeDelTelefono(): Promise<{ nome: string }>
    /** Lo scanner di Google (Play services): niente permesso della fotocamera. Rifiuta `CANCELLED` se la persona lo chiude. */
    scansiona(): Promise<{ testo: string }>
    /** R-M5a, la sveglia (`TalosRemotoPlugin.kt`): lo stato senza endpoint né chiavi. */
    svegliaStato(o: { pcId: string }): Promise<{
        accesa: boolean, iscrizione: boolean, daMandare: boolean, errore: string | null, google: boolean, vapid: boolean, consentite: boolean
    }>
    /** Registra col distributore incorporato e la VAPID del PC; rifiuta `WAKE_UNAVAILABLE` o `WAKE_REGISTRATION_FAILED`. */
    svegliaAttiva(o: { pcId: string }): Promise<{ iscrizione: IscrizioneSveglia }>
    svegliaMandata(o: { pcId: string, endpoint: string }): Promise<void>
    svegliaDisattiva(o: { pcId: string }): Promise<void>
    /** La prossima sveglia di questo PC è la prova: la notifica dice «funzionano», senza collegarsi. `annulla`: la prova non è partita. */
    svegliaProva(o: { pcId: string, annulla?: boolean }): Promise<void>
    /** L'iscrizione «da mandare» parte adesso (`forza`: il PC ha detto di non averla). */
    svegliaRimanda(o: { pcId: string, forza?: boolean }): Promise<void>
    /** D-RM5-3: la carta di quella sessione è vista nell'app ⇒ la sua notifica si toglie dalla tendina. */
    svegliaVista?(o: { pcId: string, sessionId: string, carte?: string[] }): Promise<void>
    /** D-RM5-3: rilegge cosa aspetta sul PC e toglie le notifiche risolte altrove (il lavoro della sveglia, subito). */
    svegliaRiallinea?(o: { pcId: string }): Promise<void>
    /** Decisione owner 21/10/2026: col PIN di TALOS acceso le notifiche dal computer sono generiche. */
    svegliaRiservata?(o: { attiva: boolean }): Promise<void>
}

export type FaseAccoppiamento =
    | { tipo: 'inattivo' }
    | { tipo: 'collego' }
    | { tipo: 'conferma', codice: string, pc: ComputerDelQr }
    | { tipo: 'fatto', pc: AccoppiamentoRiuscito }
    | { tipo: 'errore', code: string }

export type StatoDelComputer =
    | { inLinea: true, percorso: string | null, rttMs: number | null }
    | { inLinea: false, code: string }

/** Quanto si aspetta il pong prima di dire «non in linea»: la schermata non resta mai a «controllo…». */
export const ATTESA_CONTROLLO_MS = 10_000

const codiceDi = (e: unknown) => (typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'CONNECT_FAILED')

export function creaComputerRemoti(plugin: PluginComputer, {
    ora = () => Date.now(),
    permessoNotifiche = () => requestTalosNotifications(),
}: { ora?: () => number, permessoNotifiche?: () => Promise<string> } = {}) {
    const elenco: Ref<ComputerRicordato[]> = ref([])
    const fase: Ref<FaseAccoppiamento> = ref({ tipo: 'inattivo' })
    let corrente: { annulla(): Promise<void> } | null = null

    async function aggiorna(): Promise<void> {
        elenco.value = (await plugin.elenco()).computer.map(computerDalNativo)
    }

    async function accoppia(testoQr: string): Promise<void> {
        fase.value = { tipo: 'collego' }
        const nome = await plugin.nomeDelTelefono().then((r) => r.nome || null, () => null)
        const giro = avviaAccoppiamento(plugin, testoQr, {
            nome,
            ora,
            onCodice: ({ codice, pc }) => { fase.value = { tipo: 'conferma', codice, pc } },
        })
        corrente = giro
        try {
            const pc = await giro.esito
            // fetta C, Desktop (3) 24/10: il programma (desktop o CLI) lo ricorda il dispositivo, il nativo non lo salva
            ricordaProgramma(pc.pcId, pc.programma)
            // owner 24/10 «Sì, adesso»: un PC col portachiavi di prova (desktop f1199ace0) si segna «di prova»
            ricordaEffimero(pc.pcId, pc.effimero)
            fase.value = { tipo: 'fatto', pc }
            await aggiorna().catch(() => undefined)
        } catch (e) {
            const code = codiceDi(e)
            fase.value = code === 'CANCELLED' ? { tipo: 'inattivo' } : { tipo: 'errore', code }
        } finally {
            if (corrente === giro) corrente = null
        }
    }

    /** «Collega un computer»: lo scanner, poi l'accoppiamento. Chiudere lo scanner non è un errore. */
    async function collegaUnComputer(): Promise<void> {
        let testo: string
        try {
            testo = (await plugin.scansiona()).testo
        } catch (e) {
            const code = codiceDi(e)
            fase.value = code === 'CANCELLED' ? { tipo: 'inattivo' } : { tipo: 'errore', code: code === 'CONNECT_FAILED' ? 'SCANNER_UNAVAILABLE' : code }
            return
        }
        await accoppia(testo)
    }

    async function annulla(): Promise<void> {
        if (corrente) await corrente.annulla()
        else fase.value = { tipo: 'inattivo' }
    }

    /**
     * Un giro sul canale di lavoro: collega (`collegaConRitentativo`, RCM-08), crea il cliente, fa `lavoro` entro `ATTESA_CONTROLLO_MS`, chiude SEMPRE il canale.
     */
    async function conIlPc<T>(pcId: string, lavoro: (cliente: ReturnType<typeof creaClienteRemoto>, canale: string) => Promise<T>): Promise<T> {
        let canale: string | null = null
        try {
            canale = (await collegaConRitentativo(plugin, pcId)).canale
            const trasporto = await trasportoNativo(plugin, canale)
            let tetto: ReturnType<typeof setTimeout> | undefined
            const scaduto = new Promise<never>((_, rifiuta) => {
                tetto = setTimeout(() => rifiuta(Object.assign(new Error('DISCONNECTED'), { code: 'DISCONNECTED' })), ATTESA_CONTROLLO_MS)
            })
            try {
                return await Promise.race([lavoro(creaClienteRemoto(trasporto, { ora }), canale), scaduto])
            } finally {
                clearTimeout(tetto)
                await trasporto.smonta()
            }
        } finally {
            if (canale) await plugin.chiudi({ canale }).catch(() => undefined)
        }
    }

    /** Collega, un ping, il percorso, chiude: lo stato vero di adesso, mai un'eccezione verso la schermata. */
    async function controlla(pcId: string): Promise<StatoDelComputer> {
        try {
            return await conIlPc(pcId, async (cliente, canale) => {
                await cliente.ping()
                const p = await plugin.percorso({ canale })
                // revisione R-M5a (1): il PC risponde ⇒ un'iscrizione rimasta da mandare parte adesso
                void plugin.svegliaRimanda?.({ pcId }).catch(() => undefined)
                ricordaVisto(pcId, ora())
                return { inLinea: true as const, percorso: p.tipo, rttMs: p.rttMs }
            })
        } catch (e) {
            return { inLinea: false, code: codiceDi(e) }
        }
    }

    /**
     * R-M4: le sessioni del PC, lette sul ponte remoto con lo stesso lettore dell'elenco del Codice (`leggiSessioniR4`, un tentativo:
     * il «non ancora in ascolto» è del r4 locale). Il canale si chiude sempre; un guasto torna col codice, mai un'eccezione.
     */
    /**
     * ⛔ D-MOCK-2 (dal Pad, vc175, 24/10/2026): il collegamento nativo verso un PC spento resta aperto fino a 2 × 30 s, oltre il tetto
     * delle schermate; ogni lettura nuova ne apriva un altro e quello verso il PC acceso finiva in coda («non risponde» anche lui).
     * Una lettura per PC alla volta: chi la chiede mentre è in volo riceve la stessa.
     */
    const inVolo = new Map<string, Promise<{ ok: true, righe: TalosRigaSessioneR4[] } | { ok: false, code: string }>>()
    function sessioni(pcId: string): Promise<{ ok: true, righe: TalosRigaSessioneR4[] } | { ok: false, code: string }> {
        const giaInVolo = inVolo.get(pcId)
        if (giaInVolo) return giaInVolo
        const lettura = leggiSessioniDelPc(pcId).finally(() => { inVolo.delete(pcId) })
        inVolo.set(pcId, lettura)
        return lettura
    }

    async function leggiSessioniDelPc(pcId: string): Promise<{ ok: true, righe: TalosRigaSessioneR4[] } | { ok: false, code: string }> {
        let aperto: Awaited<ReturnType<typeof apriPonteRemoto>> | null = null
        try {
            aperto = await apriPonteRemoto(plugin, pcId)
            const righe = await leggiSessioniR4(aperto.ponte, { tentativi: 1 })
            // mockup remoto, tavola 1: gli ultimi numeri restano sul dispositivo, con l'ora della lettura
            ricordaSessioni(pcId, conteggiDelleSessioni(righe), ora())
            return { ok: true, righe }
        } catch (e) {
            return { ok: false, code: codiceDi(e) }
        } finally {
            await aperto?.chiudi()
        }
    }

    /**
     * Revisione del blocco 3 (S3), owner 24/10/2026 «Sì, uguali alle locali»: rinomina ed elimina una sessione del PC dalla lista del
     * Codice, sul ponte come il Codice del PC (`session.rename`, `session.delete`). Il consenso della cartella lo decide il PC: un suo
     * rifiuto (`CONSENT_REQUIRED`, `WORKFLOW_RUN_NOT_FINISHED`…) risale col suo codice, la lista lo dice.
     */
    async function conIlPonte(pcId: string, fai: (ponte: Awaited<ReturnType<typeof apriPonteRemoto>>['ponte']) => Promise<void>): Promise<void> {
        const aperto = await apriPonteRemoto(plugin, pcId)
        try {
            await fai(aperto.ponte)
        } finally {
            await aperto.chiudi()
        }
    }
    const rinominaSessione = (pcId: string, sessionId: string, nome: string) => conIlPonte(pcId, (ponte) => rinominaSessioneR4(ponte, sessionId, nome))
    const eliminaSessione = (pcId: string, sessionId: string) => conIlPonte(pcId, (ponte) => eliminaSessioneR4(ponte, sessionId))

    /**
     * ⛔ D-MOCK-11 (contratto R5.12, parte 1, punto 3): «Chiedi al PC» dopo un `CONSENT_REQUIRED` su una riga del PC (Rinomina,
     * Elimina). La richiesta, poi l'attesa della persona davanti al PC (`consensoDelPc.ts`); `inAttesa` fa vedere «Conferma sul
     * computer». Il canale si chiude sempre; un rifiuto della richiesta (`FOLDER_NOT_LISTED`, `RATE_LIMITED`) torna col codice.
     */
    async function chiediConsensoAlPc(pcId: string, cartellaId: string, { inAttesa, fermato }: {
        inAttesa?: (attesa: AttesaConsenso) => void, fermato?: () => boolean,
    } = {}): Promise<EsitoConsenso | { esito: 'errore', code: string }> {
        let aperto: Awaited<ReturnType<typeof apriPonteRemoto>> | null = null
        try {
            aperto = await apriPonteRemoto(plugin, pcId)
            const attesa = await chiediConsenso(aperto.ponte, cartellaId, { ora })
            inAttesa?.(attesa)
            return await attendiConsenso(aperto.ponte, attesa, { ora, fermato })
        } catch (e) {
            return { esito: 'errore', code: codiceDi(e) }
        } finally {
            await aperto?.chiudi()
        }
    }

    /**
     * R-M4 Q2 (owner 20/10/2026 «fra le cartelle ammesse»): le cartelle che il PC apre al telefono (`projects.list`, r4
     * `custom-task.mjs:84`: solo id e nome, mai il percorso). Una voce con un id fuori dalla regola del PC o senza nome non passa.
     */
    /**
     * Mockup remoto, tavole 1 e 3: il riquadro di un PC e le sue righe nella lista del Codice. Un elenco letto = in linea, coi numeri; ogni guasto = non in linea col suo codice.
     * Un tetto solo (`ATTESA_CONTROLLO_MS`, come in `ComputerItemScreen.vue`): un PC che non risponde non lascia il riquadro a «Controllo…».
     */
    async function riepilogo(pcId: string): Promise<
        { inLinea: true, conteggi: ConteggiSessioni, righe: TalosRigaSessioneR4[] } | { inLinea: false, code: string }
    > {
        let tetto: ReturnType<typeof setTimeout> | undefined
        const esito = await Promise.race([
            sessioni(pcId),
            new Promise<{ ok: false, code: string }>((fatto) => { tetto = setTimeout(() => fatto({ ok: false, code: 'TIMEOUT' }), ATTESA_CONTROLLO_MS) }),
        ])
        clearTimeout(tetto)
        return esito.ok ? { inLinea: true, conteggi: conteggiDelleSessioni(esito.righe), righe: esito.righe } : { inLinea: false, code: esito.code }
    }

    async function cartelle(pcId: string): Promise<{ ok: true, cartelle: CartellaDelPc[] } | { ok: false, code: string }> {
        let aperto: Awaited<ReturnType<typeof apriPonteRemoto>> | null = null
        try {
            aperto = await apriPonteRemoto(plugin, pcId)
            const r = await aperto.ponte.richiesta({ metodo: 'GET', percorso: '/api/v1/projects' })
            const busta = JSON.parse(r.corpo) as { ok?: boolean, data?: { items?: unknown }, error?: { code?: unknown } }
            if (!busta.ok) return { ok: false, code: typeof busta.error?.code === 'string' ? busta.error.code : 'BAD_MESSAGE' }
            const voci = Array.isArray(busta.data?.items) ? busta.data.items as Array<Record<string, unknown>> : []
            return { ok: true, cartelle: voci.map(cartellaDaRiga).filter((c): c is CartellaDelPc => c !== null) }
        } catch (e) {
            return { ok: false, code: codiceDi(e) }
        } finally {
            await aperto?.chiudi()
        }
    }

    /**
     * «Dimentica questo computer» (mockup v5, contratto §12): prima il PC, se risponde (`pc.forget` ⇒ «revocato dal telefono»),
     * poi le chiavi sul telefono, in ogni caso. `avvisato: false` = il PC non lo sa: la schermata dice di revocarlo anche da lì.
     */
    async function dimentica(pcId: string): Promise<{ avvisato: boolean }> {
        // ⛔ D-RM4-10 (dal Pad, 21/10/2026): a PC spento l'avviso aspettava i due collegamenti del nativo (2 × 30 s): un minuto con la
        // conferma ferma. Si aspetta al più `ATTESA_CONTROLLO_MS`; poi le chiavi si cancellano e la schermata dice di revocarlo dal PC.
        // Il tentativo rimasto in volo, se il PC risponde dopo, porta comunque `pc.forget` e chiude il suo canale (`conIlPc`).
        let tetto: ReturnType<typeof setTimeout> | undefined
        const avvisato = await Promise.race([
            conIlPc(pcId, (cliente) => cliente.richiesta('pc.forget', {})).then(() => true, () => false),
            new Promise<boolean>((ok) => { tetto = setTimeout(() => ok(false), ATTESA_CONTROLLO_MS) }),
        ])
        clearTimeout(tetto)
        await plugin.dimentica({ pcId })
        dimenticaRicordo(pcId)
        await aggiorna()
        return { avvisato }
    }

    /**
     * Fetta C, D-REM-2 (Desktop (3) 24/10, risposta 2): una voce vecchia che non risponde più si dimentica SOLO sul dispositivo. Bussare
     * col `pc.forget` costerebbe 10 s a voce, e se quell'identità è ancora viva il PC elenca solo un dispositivo spento, innocuo.
     */
    async function dimenticaSoloQui(pcId: string): Promise<void> {
        await plugin.dimentica({ pcId })
        dimenticaRicordo(pcId)
    }

    /** R-M5a: lo stato delle notifiche di un PC, mai un'eccezione verso la schermata. */
    async function notifiche(pcId: string): Promise<StatoNotifiche> {
        try {
            const s = await plugin.svegliaStato({ pcId })
            return {
                accese: s.accesa && s.iscrizione, disponibili: s.google, errore: s.errore ?? null,
                daMandare: s.accesa && s.daMandare === true, vapid: s.vapid !== false, consentite: s.consentite !== false,
            }
        } catch {
            // revisione R-M5a (20): un guasto del plugin non è «mancano i servizi Google»: interruttore spento, si può riprovare
            return { accese: false, disponibili: true, errore: 'STATE_UNAVAILABLE', daMandare: false, vapid: true, consentite: true }
        }
    }

    /**
     * R-M5a, owner R-M5 Q3: accende le notifiche di un PC. Il permesso di Android, la registrazione nativa (VAPID del PC), poi
     * l'iscrizione al PC (`device.wake`). A PC spento la sveglia resta accesa e l'iscrizione «da mandare»: la manda il lavoro nativo
     * (`TalosSvegliaLavoro`, 30 s dopo). `alPc: false` lo dice alla schermata.
     */
    async function attivaNotifiche(pcId: string): Promise<{ ok: true, alPc: boolean } | { ok: false, code: string }> {
        if (await permessoNotifiche().catch(() => 'denied') !== 'granted') return { ok: false, code: 'NOTIFICATIONS_DENIED' }
        let iscrizione: IscrizioneSveglia
        try {
            iscrizione = (await plugin.svegliaAttiva({ pcId })).iscrizione
        } catch (e) {
            return { ok: false, code: codiceDi(e) === 'CONNECT_FAILED' ? 'WAKE_REGISTRATION_FAILED' : codiceDi(e) }
        }
        const alPc = await conIlPc(pcId, (cliente) => cliente.richiesta('device.wake', { sveglia: iscrizione }))
            .then((r) => (r as { sveglia?: unknown } | null)?.sveglia === true, () => false)
        if (alPc) await plugin.svegliaMandata({ pcId, endpoint: iscrizione.endpoint }).catch(() => undefined)
        return { ok: true, alPc }
    }

    /** «Prova la notifica» (`device.wake.test`): il telefono sa PRIMA che la prossima sveglia è la prova. */
    async function provaNotifica(pcId: string): Promise<EsitoProva> {
        try {
            await plugin.svegliaProva({ pcId })
            const r = await conIlPc(pcId, (cliente) => cliente.richiesta('device.wake.test', {})) as { esito?: unknown, attendiMs?: unknown } | null
            const esito = typeof r?.esito === 'string' && ESITI_DEL_PC.has(r.esito) ? r.esito : 'fallita'
            await dopoLaProva(pcId, esito)
            if (esito === 'troppo-presto') return Number.isFinite(r?.attendiMs) ? { esito, attendiMs: r!.attendiMs as number } : { esito }
            return { esito } as EsitoProva
        } catch (e) {
            await dopoLaProva(pcId, 'non-raggiunto')
            return { esito: 'non-raggiunto', code: codiceDi(e) }
        }
    }

    /**
     * Revisione R-M5a (2, 10): una prova non partita toglie il suo segno (una sveglia vera resta vera); `senza-iscrizione` ⇒
     * l'iscrizione si rimanda; `dimenticata` ⇒ il PC l'ha buttata perché Google la rifiuta: la sveglia del telefono si spegne, e lo
     * stato vero diventa «spente».
     */
    async function dopoLaProva(pcId: string, esito: string): Promise<void> {
        if (esito !== 'inviata') await plugin.svegliaProva({ pcId, annulla: true }).catch(() => undefined)
        if (esito === 'senza-iscrizione') await plugin.svegliaRimanda({ pcId, forza: true }).catch(() => undefined)
        if (esito === 'dimenticata') await plugin.svegliaDisattiva({ pcId }).catch(() => undefined)
    }

    /** Spegne le notifiche: il PC dimentica l'iscrizione (`device.wake null`) se risponde, il telefono la toglie comunque. */
    async function disattivaNotifiche(pcId: string): Promise<{ avvisato: boolean }> {
        let tetto: ReturnType<typeof setTimeout> | undefined
        const avvisato = await Promise.race([
            conIlPc(pcId, (cliente) => cliente.richiesta('device.wake', { sveglia: null })).then(() => true, () => false),
            new Promise<boolean>((ok) => { tetto = setTimeout(() => ok(false), ATTESA_CONTROLLO_MS) }),
        ])
        clearTimeout(tetto)
        await plugin.svegliaDisattiva({ pcId })
        return { avvisato }
    }

    /** Dopo «Fatto» o «Chiudi»: la schermata torna all'elenco. */
    function riposa(): void {
        if (!corrente) fase.value = { tipo: 'inattivo' }
    }

    return {
        elenco, fase, aggiorna, accoppia, collegaUnComputer, annulla, riposa, controlla, sessioni, riepilogo, cartelle, dimentica, dimenticaSoloQui, rinominaSessione, eliminaSessione,
        chiediConsensoAlPc,
        notifiche, attivaNotifiche, provaNotifica, disattivaNotifiche,
    }
}

export type ComputerRemoti = ReturnType<typeof creaComputerRemoti>
let condivisi: ComputerRemoti | null | undefined

/** Lo stato della sezione, uno solo per l'app (elenco e dettaglio lo condividono); `null` fuori dall'app Android. */
export function useComputerRemoti(): ComputerRemoti | null {
    if (condivisi !== undefined) return condivisi
    const plugin = pluginRemoto()
    condivisi = plugin ? creaComputerRemoti(plugin) : null
    return condivisi
}
