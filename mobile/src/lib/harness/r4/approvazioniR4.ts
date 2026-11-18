/**
 * ⛔ K3-AP1 (ledger `LEDGER-K3-APPROVAZIONI-2026-10-16.md`; owner 16/10 «Carta nella conversazione»): la carta con cui r4 chiede un
 * permesso, come la fa il desktop @ `701c6c0d2` (invariata da `2161afb32`). Trascrizione riga per riga di `legacy/app.js`:
 *   · `descriviAzioneApprovazione` (:15019) → `perche`; `codiceAzioneApprovazione` (:15073) → `codice`;
 *   · `motivoRichiestaApprovazione` (:15117) → `motivo`: PRIMA le frasi vere del kernel (contenuto sospetto, segreto, root WSL, fuori
 *     dal progetto, rete, trifecta), poi coordinazione e ripetizione, poi la politica della sessione (cancello per attrezzo, «Chiede
 *     prima», o il kernel);
 *   · il badge e i rami dei pulsanti di `appendApprovalCard` (:15366): il terzo pulsante è «Per questa sessione» (attrezzo),
 *     «Consenti questo percorso…» davanti a un segreto (`ambito: percorso`), «Consenti in questa cartella…» fuori dal progetto
 *     verificato (`ambito: cartella`); si toglie dove sarebbe una promessa falsa (sospetto, rete, segreto non consentibile,
 *     `sempreNonBasta`); la rete «per la sessione» e la root WSL cambiano il sì;
 *   · l'esito di `segnaEsitoApprovazione` (`components/conversazione.js:1084`).
 * Le parole sono del desktop (dizionari JSON nel chunk del Codice); le frasi del kernel con chiave passano da `testoDelCampoR4`.
 */
import app from './testi/app-approvazione-r4.json'
import appCarte from './testi/app-carte-r4.json'
import chatApprovazione from './testi/chat-approvazione-r4.json'
import chatPermessi from './testi/chat-permessi-r4.json'
import kernel from './testi/kernel-approvazione-r4.json'
import { testoDelCampoR4, testoDelServerR4 } from './testiServerR4'
import { nomeDiRipiegoAttrezzoR4, nomeUmanoAttrezzoR4 } from './agentiR4'
import type { AzioneApprovazioneR4, EsitoApprovazioneR4 } from './approvazioneChiave'

type Tabella = { it: Record<string, string>; en: Record<string, string> }
/* Telefono 0.1.49: `app-carte-r4.json` porta solo le parole nuove delle carte del nucleo di oggi (P018), dopo quelle di sempre */
const AREE: Record<string, Tabella[]> = { app: [app, appCarte], chat: [chatApprovazione, chatPermessi], kernel: [kernel] }

/*
 * ⛔ Telefono 0.1.49 (decisione dell'owner 18/11/2026, il nucleo di oggi; P018 del PC, `legacy/app.js:234`, `:18188-18190`, `:18285-18290`,
 * `:18346-18350`, `:18650-18655`, `:18710`, `:18771`, `:18812`): lo strumento di un connettore, di un plugin o di Tool Forge passa ora dal
 * cancello dei permessi, e la carta dice CHI e QUALE strumento (il nome leggibile, mai `mcp__github__create_issue`) e CHE COSA manda la
 * chiamata (gli argomenti che il nucleo ha già oscurato e tagliato, `argomentiPerLaCarta`), come Codex («Allow the {server} MCP server to
 * run tool …», `codex-rs/core/src/mcp_tool_call.rs:2087`). Il telefono non disegna «Per questo strumento»: niente terzo pulsante, come
 * Hermes nasconde il «sempre» che il server non onora (`apps/desktop/src/components/assistant-ui/tool/approval.tsx:279-283`).
 */
const TIPI_STRUMENTO_DI_FUORI: ReadonlySet<string> = new Set(['mcp_tool', 'plugin_tool', 'forge_tool'])
const PERCHE_DI_FUORI: Readonly<Record<string, string>> = Object.freeze({
    mcp_tool: 'app.approval.wantsUseConnectorTool', plugin_tool: 'app.approval.wantsUsePluginTool', forge_tool: 'app.approval.wantsUseForgeTool',
})

/** `fraseDelloStrumentoDiFuori` del PC (`legacy/app.js:18285`): la frase del nucleo coi nomi resi leggibili. */
function fraseDelloStrumentoDiFuori(a: Record<string, unknown>, lingua: string): string {
    const p = a.fraseParams && typeof a.fraseParams === 'object' ? a.fraseParams as Record<string, unknown> : {}
    const leggibili = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, ['attrezzo', 'server', 'plugin'].includes(k) && typeof v === 'string' ? nomeDiRipiegoAttrezzoR4(v) || v : v]))
    return testoDelServerR4(typeof a.fraseChiave === 'string' ? a.fraseChiave : null, leggibili, typeof a.frase === 'string' ? a.frase : '', lingua).trim()
}

/** Il bersaglio della carta di uno strumento di fuori (`legacy/app.js:18650-18652`): «create issue (github)», «check (lint)», «daily note». */
function bersaglioDiFuori(a: Record<string, unknown>): string {
    const attrezzo = typeof a.attrezzo === 'string' ? a.attrezzo : ''
    if (a.tipo === 'mcp_tool') return nomeDiRipiegoAttrezzoR4(a.nome)
    if (a.tipo === 'plugin_tool' && attrezzo) return `${nomeDiRipiegoAttrezzoR4(attrezzo)}${typeof a.plugin === 'string' && a.plugin ? ` (${nomeDiRipiegoAttrezzoR4(a.plugin)})` : ''}`
    if (a.tipo === 'forge_tool' && attrezzo) return nomeDiRipiegoAttrezzoR4(attrezzo)
    return ''
}
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const propria = (t: Record<string, string>, k: string) => (Object.hasOwn(t, k) ? t[k] : undefined)

function voce(chiave: string, lingua: string): string | undefined {
    const punto = chiave.indexOf('.')
    const tabelle = AREE[chiave.slice(0, punto)]
    const nome = chiave.slice(punto + 1)
    if (!tabelle) return undefined
    for (const t of tabelle) {
        const v = propria(italiano(lingua) ? t.it : t.en, nome) ?? propria(t.en, nome)
        if (v !== undefined) return v
    }
    return undefined
}
const esiste = (chiave: string) => voce(chiave, 'en') !== undefined

/** `t()` del desktop sulle parole della carta: la lingua, poi l'inglese; i `{segnaposto}` noti si sostituiscono. */
export function testoApprovazioneR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const frase = voce(chiave, lingua) ?? chiave
    if (!valori) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, k: string) => (k in valori ? String(valori[k]) : tutto))
}
const tn = (uno: string, molti: string, n: number, lingua: string, valori: Record<string, unknown> = {}) =>
    testoApprovazioneR4(new Intl.PluralRules(italiano(lingua) ? 'it' : 'en').select(n) === 'one' ? uno : molti, lingua, { n, ...valori })
const elenco = (voci: string[], lingua: string) => {
    try { return new Intl.ListFormat(italiano(lingua) ? 'it' : 'en', { style: 'long', type: 'conjunction' }).format(voci) } catch { return voci.join(', ') }
}

/** `CHIAVE_COORDINAZIONE` e `TETTO_AVVII_DA_SOLO` del desktop (`components/coordinazione.js:10-13`). */
const CHIAVE_COORDINAZIONE = 'delega_sottotask'
const TETTO_AVVII_DA_SOLO = 20

/** `etichettaPermesso` (`chat-foot.js:48`): il nome umano della politica. */
const CHIAVI_PERMESSO: Record<string, string> = {
    'Read only': 'chat.foot.permission.readOnly',
    'Workspace write': 'chat.foot.permission.workspaceWrite',
    'On request': 'chat.foot.permission.onRequest',
    'Full access': 'chat.foot.permission.fullAccess',
    Research: 'chat.foot.permission.research',
}
export function etichettaPermessoR4(permesso: unknown, lingua: string): string {
    if (typeof permesso === 'string' && Object.hasOwn(CHIAVI_PERMESSO, permesso)) return testoApprovazioneR4(CHIAVI_PERMESSO[permesso], lingua)
    return typeof permesso === 'string' && permesso.trim() ? permesso : testoApprovazioneR4('chat.foot.permission.notSelected', lingua)
}

const comeTitolo = (testo: string, lingua: string) => (testo ? testo.charAt(0).toLocaleUpperCase(italiano(lingua) ? 'it-IT' : 'en-US') + testo.slice(1) : testo)
const nomeAttrezzo = (id: unknown, lingua: string) => nomeUmanoAttrezzoR4(id, lingua) || nomeDiRipiegoAttrezzoR4(id)

/** `luogoInParole`, `motiviInParole` e `domandaContenutoSospetto` (`components/contenuto-sospetto.js`). */
function luogoInParole(luogo: unknown, lingua: string): string {
    const l = (luogo ?? {}) as Record<string, unknown>
    const tipo = typeof l.tipo === 'string' ? l.tipo : 'altro'
    const nome = typeof l.nome === 'string' && l.nome.trim() ? l.nome.trim() : null
    if (tipo === 'file') return nome ? testoApprovazioneR4('kernel.luogo.file', lingua, { nome }) : testoApprovazioneR4('kernel.luogo.unFile', lingua)
    if (tipo === 'strumento') return nome ? testoApprovazioneR4('kernel.luogo.strumento', lingua, { nome }) : testoApprovazioneR4('kernel.luogo.unoStrumento', lingua)
    return esiste(`kernel.luogo.${tipo}`) ? testoApprovazioneR4(`kernel.luogo.${tipo}`, lingua) : testoApprovazioneR4('kernel.luogo.altro', lingua)
}
function motiviInParole(motivi: unknown, lingua: string): string {
    const parole = [...new Set((Array.isArray(motivi) ? motivi : [])
        .map((m) => (esiste(`kernel.motivo.${m}`) ? testoApprovazioneR4(`kernel.motivo.${m}`, lingua) : testoApprovazioneR4('kernel.motivo.sconosciuto', lingua))))]
    return elenco(parole, lingua)
}
function domandaContenutoSospetto(c: unknown, lingua: string): string {
    if (!c) return ''
    const o = c as Record<string, unknown>
    return testoApprovazioneR4('kernel.contenutoSospetto.domanda', lingua, { luogo: luogoInParole(o.luogo, lingua), motivi: motiviInParole(o.motivi, lingua) })
}

export interface PoliticaSessioneR4 {
    permessi: string | null
    perAttrezzo: Record<string, string>
}

export type SceltaApprovazioneR4 = 'nega' | 'unaVolta' | 'sessione' | 'cartella' | 'percorso'

export interface CartaApprovazioneR4 {
    badge: string
    bersaglio: string
    perche: string
    codice: string
    motivo: string
    nota: string
    unaVolta: string
    terzo: { etichetta: string; scelta: 'sessione' | 'cartella' | 'percorso' } | null
    negaEtichetta: string
}

const stringa = (v: unknown) => (typeof v === 'string' ? v : '')
const CONTROLLO_FIGLIE: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
    stop_child: ['app.approval.wantsStopAgent', 'app.approval.wantsStopAllAgents'],
    pause_child: ['app.approval.wantsPauseAgent', 'app.approval.wantsPauseAllAgents'],
    resume_child: ['app.approval.wantsResumeAgent', 'app.approval.wantsResumeAllAgents'],
})

function perche(a: Record<string, unknown>, lingua: string): string {
    const tr = (k: string, v?: Record<string, unknown>) => testoApprovazioneR4(k, lingua, v)
    if (a.tipo === 'scrivi' && a.fileDiControllo) return tr('app.approval.wantsWriteControlFile')
    if (a.tipo === 'scrivi') return tr('app.approval.wantsWriteFile')
    if (a.tipo === 'file_edit') return tr('app.approval.wantsEditFile')
    if (a.tipo === 'leggi') return tr('app.approval.wantsReadFile')
    if (a.tipo === 'elenca') return tr('app.approval.wantsListFolder')
    if (a.tipo === 'shell') return tr('app.approval.wantsRunCommand')
    if (a.tipo === 'document_create') return tr('app.approval.wantsCreateDocument', { formato: stringa(a.formato) || '?' })
    if (a.tipo === 'prova') return tr('app.approval.wantsRunTests')
    if (a.tipo === 'research_start') return a.question ? tr('app.approval.wantsDeepResearchOf', { domanda: a.question }) : tr('app.approval.wantsDeepResearch')
    if (a.tipo === CHIAVE_COORDINAZIONE) {
        return typeof a.cartella === 'string' && a.cartella.trim() ? tr('app.approval.wantsStartAgentIn', { cartella: a.cartella }) : tr('app.approval.wantsStartAgent')
    }
    // pin r4 4cee78f33 (owner 29/10 «Ferma tutto», `CONTROLLO_FIGLIE` di legacy/app.js): un agente, o tutti con `childId: "all"`
    if (typeof a.tipo === 'string' && Object.hasOwn(CONTROLLO_FIGLIE, a.tipo)) return tr(CONTROLLO_FIGLIE[a.tipo][a.childId === 'all' ? 1 : 0])
    if (a.tipo === 'giri-in-tondo') {
        return tn('app.approval.wantsGoOnRepeatingOne', 'app.approval.wantsGoOnRepeatingMany', Number(a.volte) || 5, lingua, { strumento: nomeAttrezzo(stringa(a.strumento), lingua) })
    }
    if (typeof a.tipo === 'string' && Object.hasOwn(PERCHE_DI_FUORI, a.tipo)) return tr(PERCHE_DI_FUORI[a.tipo])
    return tr('app.approval.wantsChangeSomething')
}

/** `descriviAzioneApprovazione` del desktop (`legacy/app.js:15019`): cosa vuole fare il modello, detto per la carta e per la trascrizione. */
export function descriviAzioneApprovazioneR4(azione: unknown, lingua: string): string {
    return perche(azione && typeof azione === 'object' ? azione as Record<string, unknown> : {}, lingua)
}

function codice(a: Record<string, unknown>): string {
    if (a.tipo === 'shell' || a.tipo === 'prova') return stringa(a.comando)
    if (a.tipo === 'scrivi' || a.tipo === 'leggi') return stringa(a.percorso)
    if (a.tipo === 'naviga') return stringa(a.url)
    if (a.tipo === CHIAVE_COORDINAZIONE) return stringa(a.compito)
    // P018: che cosa manda la chiamata, già oscurato e tagliato dal nucleo (`legacy/app.js:18710-18716`, «Clients SHOULD show tool inputs»)
    if (typeof a.tipo === 'string' && TIPI_STRUMENTO_DI_FUORI.has(a.tipo) && a.argomenti && typeof a.argomenti === 'object'
        && Object.keys(a.argomenti).length > 0) return JSON.stringify(a.argomenti, null, 2)
    return ''
}

function motivo(a: Record<string, unknown>, politica: PoliticaSessioneR4, lingua: string, senzaPolitica = false): string {
    const tr = (k: string, v?: Record<string, unknown>) => testoApprovazioneR4(k, lingua, v)
    const regola = typeof a.tipo === 'string' ? politica.perAttrezzo?.[a.tipo] : null
    const nomePolitica = etichettaPermessoR4(politica.permessi, lingua)
    const frasiVere: string[] = []
    if (a.contenutoSospetto) frasiVere.push(domandaContenutoSospetto(a.contenutoSospetto, lingua))
    const fraseDiCampo = (o: unknown) => { const f = o ? testoDelCampoR4(o, 'frase', lingua) : null; return typeof f === 'string' && f.trim() ? f.trim() : null }
    // Telefono 0.1.49: anche la cancellazione critica (decisione 155 del PC, `legacy/app.js:18346`): che cosa cancella e perché chiede sempre
    for (const campo of ['segreto', 'wslRoot', 'fuoriDalProgetto', 'percorsoDiRete', 'cancellazioneCritica']) {
        const f = fraseDiCampo(a[campo])
        if (f) frasiVere.push(f)
    }
    // P018 (`legacy/app.js:18350`): chi e quale strumento; in «Solo lettura» la frase `…ReadOnly` dice perché chiede
    if (typeof a.tipo === 'string' && TIPI_STRUMENTO_DI_FUORI.has(a.tipo) && typeof a.fraseChiave === 'string') {
        const f = fraseDelloStrumentoDiFuori(a, lingua)
        if (f) frasiVere.push(f)
    }
    const trifecta = typeof a.trifecta === 'string' ? a.trifecta.trim() : (a.trifecta === true ? tr('app.approval.trifecta') : '')
    if (trifecta) frasiVere.push(trifecta)
    if (frasiVere.length) return frasiVere.join(' ')
    if (a.tipo === CHIAVE_COORDINAZIONE) {
        const coordinazione = a.coordinazione as Record<string, unknown> | undefined
        return coordinazione?.motivo === 'tetto'
            ? tn('app.approval.whyCoordinationCapOne', 'app.approval.whyCoordinationCapMany', TETTO_AVVII_DA_SOLO, lingua)
            : tr('app.approval.whyCoordinationOff')
    }
    if (a.tipo === 'giri-in-tondo') return tr('app.approval.whyRepeating')
    if (senzaPolitica) return '' // K3-AP3 (`:15161`): la carta di una figlia senza la politica che ha deciso dice solo le frasi del kernel
    if (regola === 'chiedi') return tr('app.approval.whyToolGate', { attrezzo: comeTitolo(nomeAttrezzo(a.tipo, lingua), lingua), politica: nomePolitica })
    if (politica.permessi === 'On request') return tr('app.approval.whyOnRequest', { politica: nomePolitica })
    return tr('app.approval.whyKernel', { politica: nomePolitica })
}

const BADGE: Record<string, string> = {
    scrivi: 'app.approval.badgeWrite', file_edit: 'app.approval.badgeEdit', leggi: 'app.approval.badgeRead', elenca: 'app.approval.badgeOpenFolder',
    shell: 'app.approval.badgeRun', prova: 'app.approval.badgeRun', research_start: 'app.approval.badgeSearch',
    [CHIAVE_COORDINAZIONE]: 'app.approval.badgeStartAgent', 'giri-in-tondo': 'app.approval.badgeRepeating',
    mcp_tool: 'app.approval.badgeConnector', plugin_tool: 'app.approval.badgePlugin', forge_tool: 'app.approval.badgeForge',
}

/** La carta di `ApprovalRequested.azione` con la politica della sessione che chiede. Un'azione storta è la carta generica. */
export function cartaApprovazioneR4(azione: unknown, politica: PoliticaSessioneR4, lingua: string, { senzaPolitica = false }: { senzaPolitica?: boolean } = {}): CartaApprovazioneR4 {
    const a: AzioneApprovazioneR4 = azione && typeof azione === 'object' && !Array.isArray(azione) ? azione as AzioneApprovazioneR4 : {}
    const tr = (k: string) => testoApprovazioneR4(k, lingua)
    const bersaglio = stringa(a.percorso) || stringa(a.comando) || stringa(a.question) || stringa(a.title)
        || (a.tipo === CHIAVE_COORDINAZIONE ? stringa(a.modello) : '') || bersaglioDiFuori(a) || ''
    let unaVolta = tr('chat.approval.allowOnce')
    let terzo: CartaApprovazioneR4['terzo'] = { etichetta: tr('chat.approval.forThisSession'), scelta: 'sessione' }
    let nota = tr('app.approval.appliesOnce')
    const segreto = a.segreto as Record<string, unknown> | undefined
    const davantiAUnSegreto = Boolean(segreto)
    const critica = Boolean(a.cancellazioneCritica)
    const percorsoConsentibile = davantiAUnSegreto && !a.contenutoSospetto && !a.percorsoDiRete && !a.wslRoot && !a.fuoriDalProgetto && !critica
        && typeof segreto?.percorso === 'string' && segreto.percorso !== ''
    if (percorsoConsentibile) {
        terzo = { etichetta: tr('app.approval.allowSecretSession'), scelta: 'percorso' }
        nota = tr('app.approval.appliesSession')
    } else if (davantiAUnSegreto) terzo = null
    if (a.contenutoSospetto) terzo = null
    if (a.percorsoDiRete) terzo = null
    // Decisione 155 del PC (`legacy/app.js:18771-18774`): una cancellazione critica si chiede ogni volta, il sì vale una volta sola
    if (critica) terzo = null
    // P018: il telefono non disegna «Per questo strumento» (`legacy/app.js:18812-18819`): restano «una volta» e «No»
    if (typeof a.tipo === 'string' && TIPI_STRUMENTO_DI_FUORI.has(a.tipo)) terzo = null
    if ((a.percorsoDiRete as Record<string, unknown> | undefined)?.ambito === 'sessione' && !critica) {
        unaVolta = tr('app.approval.allowSession')
        nota = tr('app.approval.appliesSession')
    }
    if (a.wslRoot && !davantiAUnSegreto && !critica) {
        unaVolta = tr('app.approval.allowSession')
        terzo = null
        nota = tr('app.approval.appliesSession')
    }
    const fuori = a.fuoriDalProgetto as Record<string, unknown> | undefined
    const cartellaConsentibile = Boolean(fuori?.verificato === true && fuori.chiave)
    if (fuori && !davantiAUnSegreto && !a.wslRoot) {
        terzo = cartellaConsentibile && terzo ? { etichetta: tr('app.approval.allowFolderSession'), scelta: 'cartella' } : null
    }
    if (a.sempreNonBasta && !percorsoConsentibile && !cartellaConsentibile) terzo = null
    return {
        badge: tr(typeof a.tipo === 'string' && Object.hasOwn(BADGE, a.tipo) ? BADGE[a.tipo] : 'app.approval.badgePermission'),
        bersaglio, perche: perche(a, lingua), codice: codice(a), motivo: motivo(a, politica, lingua, senzaPolitica), nota, unaVolta, terzo,
        negaEtichetta: tr('chat.approval.deny'),
    }
}

/**
 * K3-AP3: la politica con cui spiegare la carta di una FIGLIA (`appendApprovalCard` con `figlia`, `legacy/app.js:15402-15403`): quella
 * che ha deciso, fotografata dal server nella richiesta (`pending.politica`). Senza permessi leggibili: solo le frasi del kernel.
 */
export function politicaDellaFigliaR4(politica: unknown): { politica: PoliticaSessioneR4; senzaPolitica: boolean } {
    const p = politica && typeof politica === 'object' && !Array.isArray(politica) ? politica as Record<string, unknown> : {}
    const permessi = typeof p.permessi === 'string' && p.permessi ? p.permessi : null
    const perAttrezzo = p.perAttrezzo && typeof p.perAttrezzo === 'object' && !Array.isArray(p.perAttrezzo) ? p.perAttrezzo as Record<string, string> : {}
    return { politica: { permessi, perAttrezzo }, senzaPolitica: !permessi }
}

/** K3-AP3: la riga «L'agente «…» chiede» (`creaChiChiede`, `legacy/app.js:15330`): la frase si spezza attorno al nome. */
export function chiChiedeR4(nome: string | null, lingua: string): { prima: string; nome: string | null; dopo: string } {
    const n = typeof nome === 'string' && nome.trim() ? nome : null
    if (!n) return { prima: testoApprovazioneR4('app.approval.childAskingUnnamed', lingua), nome: null, dopo: '' }
    const [prima, dopo = ''] = testoApprovazioneR4('app.approval.childAsking', lingua, { name: '\u0000' }).split('\u0000')
    return { prima, nome: n, dopo }
}

/** L'esito della carta (`segnaEsitoApprovazione`): «da un'altra finestra» solo se la risposta non è partita da qui. */
export function esitoApprovazioneR4(esito: EsitoApprovazioneR4, { altrove }: { altrove: boolean }, lingua: string): string {
    const tr = (k: string, v?: Record<string, unknown>) => testoApprovazioneR4(k, lingua, v)
    const modificata = !esito.approvato && esito.motivo === 'modificata-dalla-persona'
    const e = esito.approvato
        ? (esito.ambito === 'cartella' ? tr('chat.approval.allowedInFolder') : tr('chat.common.approved'))
        : modificata ? tr('chat.approval.editedByYou')
            : (esito.motivo === 'nessuna-interfaccia' ? tr('chat.approval.deniedNoOneCanAnswer') : tr('chat.approval.denied'))
    return tr('chat.approval.outcomeWithOrigin', { esito: e, altrove: altrove && esito.motivo !== 'nessuna-interfaccia' ? tr('chat.common.fromAnotherWindow') : '' })
}

/** Il corpo esatto di `POST /:id/approve` (`requireApprovaBody` di r4). «Per questa sessione» è un sì: il «sempre» va in settings. */
export function corpoApprovazioneR4(requestId: string, scelta: SceltaApprovazioneR4): Record<string, unknown> {
    if (scelta === 'nega') return { requestId, approvato: false }
    if (scelta === 'cartella' || scelta === 'percorso') return { requestId, approvato: true, ambito: scelta }
    return { requestId, approvato: true }
}
