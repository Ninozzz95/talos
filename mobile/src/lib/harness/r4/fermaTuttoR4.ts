/**
 * «Ferma tutto» — lo Stop con i sotto-agenti al lavoro (owner 29/10/2026 sera; contratto `CONTRATTO-FERMA-TUTTE-2026-10-29.md` §3 e §5).
 * PEZZO VERO del mockup `mobile/mockup/ferma-tutto/`: dopo il sì dell'owner va, senza cambiare, in `src/lib/harness/r4/fermaTuttoR4.ts`
 * (vedi `SCHEDA-DI-CONSEGNA.md`). Solo regole, niente Vue: le prove stanno in `fermaTutto.test.ts`.
 *
 *  · Chi conta: «vivo» = ogni sessione raggiungibile dalla chat lungo `padreId` (TUTTO il sottoalbero, anche le nipoti), non conclusa e
 *    non interrotta (`conclusa === false && !interrotta`), COMPRESE quelle che aspettano un permesso o una risposta; una delega in pausa è
 *    conclusa e non conta (contratto §5; Desktop 29/10 sera: «altrimenti "Ferma tutto (2)"
 *    ne ferma 3»). Sorgenti: `GET /api/v1/sessions/:id/children` riletto per i padri annidati, l'elenco `GET /api/v1/sessions` e gli
 *    eventi dal vivo degli agenti (`pannelloR4.ts:268` `agentiInDiretta`). ⛔ Il numero della scheda Agenti (`contaAgentiAttiviR4`) è
 *    un'altra cosa (solo «in corso») e resta com'è: decisione a parte.
 *  · Quale Stop: chat al lavoro → come oggi, o il foglio con le due scelte se ci sono agenti vivi; chat FERMA con agenti vivi → lo Stop
 *    resta (niente «Invia» al suo posto) e ferma gli agenti e basta, senza foglio (owner 29/10 sera, «Stop anche a chat ferma»).
 *    Fuori da r4 (il Codice di oggi su `/harness`) niente cambia; il Codice r4 col modello del telefono è r4 (Desktop 29/10, G5).
 *  · La preferenza `stopConSottoAgenti` ('chiedi' | 'tutte' | 'solo-chat', di serie 'chiedi'), per dispositivo.
 *  · La riga della chat dall'evento durevole `talos.figlie-fermate { quante, ids, da }` (contratto §1 e §5).
 *  · L'elenco del Codice: una sessione finita con agenti vivi sotto sta «in corso» e la riga lo dice («N agenti al lavoro»).
 * ⛔ Le parole sono quelle approvate dall'owner per il PC (Desktop, 29/10; quelle della chat ferma e dell'elenco col mockup del PC approvato
 *    la sera del 29/10): la parità le vuole identiche.
 */

export type PreferenzaStopR4 = 'chiedi' | 'tutte' | 'solo-chat'
export type SceltaStopR4 = 'tutte' | 'solo-chat'
export type ChiFermaR4 = 'persona' | 'modello' | 'sistema'

export const PREFERENZE_STOP_R4: readonly PreferenzaStopR4[] = Object.freeze(['chiedi', 'tutte', 'solo-chat'])
export const PREFERENZA_STOP_DI_SERIE_R4: PreferenzaStopR4 = 'chiedi'

/** Una preferenza letta dal disco: ciò che non è una delle tre vale «chiedi» (una preferenza rotta non deve fermare nessuno da sola). */
export function leggiPreferenzaStopR4(valore: unknown): PreferenzaStopR4 {
    return PREFERENZE_STOP_R4.includes(valore as PreferenzaStopR4) ? valore as PreferenzaStopR4 : PREFERENZA_STOP_DI_SERIE_R4
}

/** Una voce dell'elenco delle sessioni o dei figli di r4 (solo i campi che servono qui). */
export interface SessioneDellAlberoR4 {
    sessionId?: unknown; padreId?: unknown; conclusa?: unknown; interrotta?: unknown; motivoChiusura?: unknown; esitoDelega?: unknown
}

/**
 * Vivo = `conclusa === false` e non `interrotta` (contratto §5, Desktop 29/10 sera). Chi aspetta un permesso o una risposta non è concluso:
 * conta. Una delega IN PAUSA chiude il suo giro e r4 la segna `conclusa: true`: non è viva, non conta e `fermaTutto` non la ferma.
 * «conclusa» assente non è un agente vivo: un dato che manca non diventa un numero.
 */
export function agenteVivoR4(s: SessioneDellAlberoR4): boolean {
    return s.conclusa === false && s.interrotta !== true
}

/**
 * Gli agenti VIVI sotto `radice` (vedi `agenteVivoR4`): tutto il sottoalbero lungo `padreId`.
 * Le voci con lo stesso id si fondono (l'ultima vince: gli eventi dal vivo arrivano dopo l'elenco); un ciclo nei padri non fa girare.
 * Restituisce gli id, nell'ordine dell'elenco: il numero è `.length`.
 */
export function figlieAlLavoroR4(voci: readonly unknown[], radice: string | null | undefined): string[] {
    if (typeof radice !== 'string' || !radice) return []
    const perId = new Map<string, SessioneDellAlberoR4>()
    for (const v of Array.isArray(voci) ? voci : []) {
        const s = v as SessioneDellAlberoR4
        if (s && typeof s === 'object' && typeof s.sessionId === 'string' && s.sessionId) perId.set(s.sessionId, { ...perId.get(s.sessionId), ...s })
    }
    const figliDi = new Map<string, string[]>()
    for (const [id, s] of perId) {
        if (typeof s.padreId !== 'string' || !s.padreId || s.padreId === id) continue
        if (!figliDi.has(s.padreId)) figliDi.set(s.padreId, [])
        figliDi.get(s.padreId)!.push(id)
    }
    const visti = new Set<string>([radice])
    const coda = [radice]
    const alLavoro: string[] = []
    for (let i = 0; i < coda.length; i += 1) {
        for (const id of figliDi.get(coda[i]) ?? []) {
            if (visti.has(id)) continue
            visti.add(id)
            coda.push(id)
            const s = perId.get(id)!
            if (agenteVivoR4(s)) alLavoro.push(id)
        }
    }
    return alLavoro
}

const numeroVivi = (n: number) => (Number.isSafeInteger(n) && n > 0 ? n : 0)

/**
 * Quale pulsante sta a destra nel compositore a campo vuoto (owner 29/10 sera, «Stop anche a chat ferma»):
 *  · `giro`   = lo Stop di oggi (la chat sta lavorando);
 *  · `agenti` = la chat è ferma ma sotto lavorano N agenti: lo Stop resta, col nome «Ferma i N agenti»;
 *  · `null`   = niente Stop: l'Invio, come oggi.
 * Con del testo nel campo la chat ferma torna all'Invio (si può sempre scrivere; vedi G7 nella scheda).
 */
export type PulsanteStopR4 = { tipo: 'giro' } | { tipo: 'agenti'; quante: number } | null
export function pulsanteStopR4(p: { suR4: boolean; chatAlLavoro: boolean; alLavoro: number; conTesto?: boolean }): PulsanteStopR4 {
    if (p.chatAlLavoro) return { tipo: 'giro' }
    const quante = numeroVivi(p.alLavoro)
    if (!p.suR4 || quante === 0 || p.conTesto) return null
    return { tipo: 'agenti', quante }
}

/** Che cosa fa lo Stop toccato adesso. `immediato` = come oggi, senza `figlie` nel corpo; `agenti` = la chat è ferma: `figlie: 'tutte'`. */
export type DecisioneStopR4 =
    | { tipo: 'immediato' }
    | { tipo: 'chiedi'; quante: number }
    | { tipo: 'invia'; scelta: SceltaStopR4; quante: number }
    | { tipo: 'agenti'; quante: number }
    | { tipo: 'niente' }

export function decidiStopR4(p: { suR4: boolean; alLavoro: number; preferenza: PreferenzaStopR4; chatAlLavoro?: boolean }): DecisioneStopR4 {
    const quante = numeroVivi(p.alLavoro)
    if (p.chatAlLavoro === false) {
        // a chat ferma non c'è un giro da fermare: niente foglio, niente preferenza; lo stesso POST …/stop con `figlie: 'tutte'`
        return p.suR4 && quante > 0 ? { tipo: 'agenti', quante } : { tipo: 'niente' }
    }
    if (!p.suR4 || quante === 0) return { tipo: 'immediato' }
    if (p.preferenza === 'tutte' || p.preferenza === 'solo-chat') return { tipo: 'invia', scelta: p.preferenza, quante }
    return { tipo: 'chiedi', quante }
}

/**
 * L'elenco del Codice: una sessione che l'elenco direbbe «conclusa» ma con agenti vivi sotto sta «in corso» (scheda e riga). Gli stati
 * che chiedono qualcosa alla persona (aspettano te, interrotte, da riprendere) restano quelli: dicono di più.
 * Gli stati sono quelli di `src/lib/harness/elencoSessioniCodice.ts:15` (`StatoDellaSessione`).
 */
export function statoConAgentiR4<S extends string>(stato: S, alLavoro: number): S | 'in-corso' {
    return stato === 'concluse' && numeroVivi(alLavoro) > 0 ? 'in-corso' : stato
}

/** Il corpo di `POST /api/v1/sessions/:id/stop` (contratto §1). Senza scelta: `{}` come oggi; chiavi in più il server le rifiuta (400). */
export function corpoStopR4(scelta: SceltaStopR4 | null, redirectId?: string): { redirectId?: string; figlie?: 'tutte' | 'nessuna' } {
    const corpo: { redirectId?: string; figlie?: 'tutte' | 'nessuna' } = {}
    if (typeof redirectId === 'string' && redirectId) corpo.redirectId = redirectId
    if (scelta) corpo.figlie = scelta === 'tutte' ? 'tutte' : 'nessuna'
    return corpo
}

/** «Ricorda la scelta»: la preferenza dopo un tocco nel foglio. Senza la casella resta quella di prima («chiedi»). */
export function preferenzaDopoLaSceltaR4(attuale: PreferenzaStopR4, scelta: SceltaStopR4, ricorda: boolean): PreferenzaStopR4 {
    return ricorda ? scelta : attuale
}

/** La risposta della rotta: `figlieFermate` c'è solo con `'tutte'`; un numero storto vale «non lo so» (null), mai un numero finto. */
export function figlieFermateDallaRispostaR4(corpo: unknown): number | null {
    const dati = (corpo && typeof corpo === 'object' && 'data' in corpo ? (corpo as { data: unknown }).data : corpo) as Record<string, unknown> | null
    const n = dati && typeof dati === 'object' ? dati.figlieFermate : undefined
    return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null
}

/** La riga della chat, dall'evento durevole (anche alla rigiocata): `null` se l'evento non è il nostro o è storto, o se non ha fermato nessuno. */
/**
 * `chatFerma` (Desktop 29/10 sera, G8): `true` nel valore dell'evento quando al momento dello Stop la chat NON aveva un giro in corso
 * («Fermati N agenti»); ASSENTE quando lavorava anche la chat («Fermati anche N agenti»). Si legge anche alla rigiocata: l'evento è
 * durevole. Quando li ferma il modello la riga non dice «anche» (il giro del modello non si ferma): regola del Mobile, da confermare.
 */
export interface VoceFiglieFermateR4 { quante: number; ids: string[]; da: ChiFermaR4; chatFerma: boolean }
export const TALOS_EVENTO_FIGLIE_FERMATE = 'talos.figlie-fermate'
export const TALOS_METADATA_FIGLIE_FERMATE = 'figlieFermateR4'

export function voceFiglieFermateR4(evento: unknown): VoceFiglieFermateR4 | null {
    const e = evento as { type?: unknown; name?: unknown; value?: unknown } | null
    if (!e || typeof e !== 'object' || e.type !== 'CUSTOM' || e.name !== TALOS_EVENTO_FIGLIE_FERMATE) return null
    const v = e.value as { quante?: unknown; ids?: unknown; da?: unknown; chatFerma?: unknown } | null
    if (!v || typeof v !== 'object') return null
    const quante = v.quante
    if (typeof quante !== 'number' || !Number.isSafeInteger(quante) || quante <= 0) return null
    const ids = Array.isArray(v.ids) ? v.ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256) : []
    const da: ChiFermaR4 = v.da === 'modello' || v.da === 'sistema' ? v.da : 'persona'
    const chatFerma = v.chatFerma === true
    return { quante, ids, da, chatFerma }
}

// ---- le parole (owner 29/10, approvate per il PC; il Desktop le ha passate al Mobile) ----
type Chiave =
    | 'foglio.titolo' | 'foglio.tutto' | 'foglio.tuttoAiuto' | 'foglio.soloChat' | 'foglio.soloChatAiuto' | 'foglio.ricorda'
    | 'riga.fermate' | 'riga.inCoda' | 'riga.dalModello' | 'riga.continuano'
    | 'impostazioni.titolo' | 'impostazioni.aiuto' | 'impostazioni.chiedi' | 'impostazioni.tutte' | 'impostazioni.soloChat'
    | 'stop.agenti' | 'elenco.agenti' | 'riga.fermateSenzaGiro'

/** [uno, molti]: `{n}` è il numero già scritto nella lingua. Una voce sola vale per tutti e due. */
const TESTI: Record<'it' | 'en', Record<Chiave, readonly [string, string?]>> = {
    it: {
        'foglio.titolo': ['1 agente sta ancora lavorando', '{n} agenti stanno ancora lavorando'],
        'foglio.tutto': ['Ferma tutto'],
        'foglio.tuttoAiuto': ['La chat e 1 agente', 'La chat e {n} agenti'],
        'foglio.soloChat': ['Ferma solo la chat'],
        'foglio.soloChatAiuto': ['Gli agenti continuano; li fermi dalla scheda Agenti'],
        'foglio.ricorda': ['Ricorda la scelta'],
        'riga.fermate': ['Fermato anche 1 agente', 'Fermati anche {n} agenti'],
        'riga.inCoda': ['I loro risultati restano in coda e partono col tuo prossimo messaggio'],
        'riga.dalModello': ['Fermati dal modello su richiesta'],
        'riga.continuano': ['1 agente continua a lavorare', '{n} agenti continuano a lavorare'],
        'impostazioni.titolo': ['Stop con agenti al lavoro'],
        'impostazioni.aiuto': ['Che cosa fa lo Stop con sotto-agenti al lavoro: chiedere, fermare tutto o solo la chat.'],
        'impostazioni.chiedi': ['Chiedi ogni volta'],
        'impostazioni.tutte': ['Ferma tutto'],
        'impostazioni.soloChat': ['Ferma solo la chat'],
        // owner 29/10 sera, «Stop anche a chat ferma» (mockup del PC approvato): a chat ferma, senza «anche»
        'stop.agenti': ["Ferma l'agente", 'Ferma i {n} agenti'],
        'riga.fermateSenzaGiro': ['Fermato 1 agente', 'Fermati {n} agenti'],
        'elenco.agenti': ['1 agente al lavoro', '{n} agenti al lavoro'],
    },
    en: {
        'foglio.titolo': ['1 agent is still working', '{n} agents are still working'],
        'foglio.tutto': ['Stop everything'],
        'foglio.tuttoAiuto': ['The chat and 1 agent', 'The chat and {n} agents'],
        'foglio.soloChat': ['Stop only the chat'],
        'foglio.soloChatAiuto': ['The agents keep working; stop them from the Agents tab'],
        'foglio.ricorda': ['Remember my choice'],
        'riga.fermate': ['Stopped 1 agent too', 'Stopped {n} agents too'],
        'riga.inCoda': ['Their results stay queued and go with your next message'],
        'riga.dalModello': ['Stopped by the model on request'],
        'riga.continuano': ['1 agent keeps working', '{n} agents keep working'],
        'impostazioni.titolo': ['Stop with agents working'],
        'impostazioni.aiuto': ['What Stop does while sub-agents are working: ask, stop everything, or stop only the chat.'],
        'impostazioni.chiedi': ['Ask every time'],
        'impostazioni.tutte': ['Stop everything'],
        'impostazioni.soloChat': ['Stop only the chat'],
        // owner 29/10 evening, «Stop even with the chat idle» (PC mockup approved): no «too» when the chat was idle
        'stop.agenti': ['Stop the agent', 'Stop the {n} agents'],
        'riga.fermateSenzaGiro': ['Stopped 1 agent', 'Stopped {n} agents'],
        'elenco.agenti': ['1 agent working', '{n} agents working'],
    },
}

export function linguaFermaTuttoR4(lingua: string): 'it' | 'en' {
    return /^it(?:-|$)/iu.test(lingua) ? 'it' : 'en'
}

export function testoFermaTuttoR4(chiave: Chiave, lingua: string, n = 1): string {
    const l = linguaFermaTuttoR4(lingua)
    const [uno, molti] = TESTI[l][chiave]
    const scelto = n === 1 || molti === undefined ? uno : molti
    return scelto.replace('{n}', new Intl.NumberFormat(l === 'it' ? 'it-IT' : 'en-US').format(n))
}

/** Le tre scelte delle Impostazioni, nell'ordine in cui si vedono. */
export function scelteImpostazioneStopR4(lingua: string): { valore: PreferenzaStopR4; etichetta: string }[] {
    return [
        { valore: 'chiedi', etichetta: testoFermaTuttoR4('impostazioni.chiedi', lingua) },
        { valore: 'tutte', etichetta: testoFermaTuttoR4('impostazioni.tutte', lingua) },
        { valore: 'solo-chat', etichetta: testoFermaTuttoR4('impostazioni.soloChat', lingua) },
    ]
}
