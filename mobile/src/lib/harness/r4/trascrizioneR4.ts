/**
 * ⛔ K3-C Esporta e Condividi (ledger `LEDGER-K3-ESPORTA-CONDIVIDI-2026-10-17.md`; owner 17/10 «Markdown + JSON, come il desktop»).
 *
 * `costruisciTrascrizioneMarkdown` del desktop r4 @ 2161afb32 (`legacy/app.js:17596`), portata 1:1 e provata sul golden calcolato
 * dal suo codice vero (`trascrizione-golden-701c6c0d2.json`). Nata dalla richiesta dell'owner del 28/8: «esportare interamente la
 * conversazione con errori e output tecnici». Le sue regole, dal desktop:
 *   · l'esito di ogni attrezzo è intero, mai troncato (la UI tronca a 4000: questo file esiste per i casi in cui il taglio
 *     nasconderebbe l'errore vero);
 *   · un evento non riconosciuto finisce comunque come JSON grezzo: mai un evento scartato in silenzio;
 *   · A11 (08/10): l'ordine è quello in cui le cose COMPAIONO, non quello in cui finiscono. Un testo o un ragionamento prendono il
 *     loro posto al primo carattere visibile, un attrezzo al suo avvio; un blocco mai chiuso resta fuori.
 *
 * Si carica a richiesta (solo quando si esporta o si condivide): i suoi testi non entrano nel pacchetto d'avvio.
 */
import trascrizione from './testi/app-trascrizione-r4.json'
import { testoDelCampoR4 } from './testiServerR4'
import { nomeDiRipiegoAttrezzoR4, nomeUmanoAttrezzoR4 } from './agentiR4'
import { descriviAzioneApprovazioneR4 } from './approvazioniR4'

const it = trascrizione.it as Record<string, string>
const en = trascrizione.en as Record<string, string>
const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)

/** `t` del desktop sulle chiavi `app.transcript.*` e `app.sessions.*`: la voce della lingua, altrimenti quella inglese; `interpola`. */
export function testoTrascrizioneR4(chiave: string, lingua: string, valori?: Record<string, unknown>): string {
    const corta = chiave.replace(/^app\./u, '')
    const frase = (italiano(lingua) ? it[corta] : undefined) ?? en[corta] ?? chiave
    if (!valori) return frase
    return frase.replace(/\{([a-zA-Z0-9_]+)\}/gu, (tutto, nome: string) => (nome in valori ? String(valori[nome]) : tutto))
}

type Evento = Record<string, any>
type Riga = string | { postoTrascrizione: string; contenuto: string[] | null }

/** `costruisciTrascrizioneMarkdown`, riga per riga come il desktop. */
export function trascrizioneMarkdownR4(esportato: Record<string, any>, lingua: string): string {
    const tr = (chiave: string, valori?: Record<string, unknown>) => testoTrascrizioneR4(chiave, lingua, valori)
    const testoDelCampo = (oggetto: unknown, campo: string) => testoDelCampoR4(oggetto, campo, lingua)
    const nomeUmanoAttrezzo = (nome: unknown) => nomeUmanoAttrezzoR4(nome, lingua) || nomeDiRipiegoAttrezzoR4(nome)
    const righe: Riga[] = []
    const testoBuffer = new Map<unknown, string>()
    const ragionamentoBuffer = new Map<unknown, string>()
    const toolBuffer = new Map<unknown, { nome: unknown; argomenti: string }>()
    const posti = new Map<string, { postoTrascrizione: string; contenuto: string[] | null }>()
    const prendiPosto = (chiave: string) => {
        if (posti.has(chiave)) return
        const segnaposto = { postoTrascrizione: chiave, contenuto: null as string[] | null }
        posti.set(chiave, segnaposto)
        righe.push(segnaposto)
    }
    const riempiPosto = (chiave: string, contenuto: string[]) => {
        const segnaposto = posti.get(chiave)
        if (!segnaposto) { righe.push(...contenuto); return }
        segnaposto.contenuto = contenuto
        posti.delete(chiave)
    }

    const recinto = (testo: unknown) => {
        const piuLunga = (String(testo).match(/`{3,}/g) || []).reduce((max, m) => Math.max(max, m.length), 3)
        return '`'.repeat(piuLunga + 1)
    }
    const blocco = (testo: unknown, linguaggio = '') => { const f = recinto(testo); return `${f}${linguaggio}\n${testo}\n${f}` }
    const descriviTask = (input: Evento | undefined) => {
        if (!input) return tr('app.transcript.noDetail')
        if (input.comandoDiretto) return tr('app.transcript.directCommand', { comando: input.comandoDiretto })
        if (input.consegna) return `${input.seguito ? '**Follow-up:** ' : ''}${input.consegna}`
        return blocco(JSON.stringify(input, null, 2), 'json')
    }

    righe.push(tr('app.transcript.heading'), '')
    righe.push(tr('app.transcript.session', { nome: esportato.nome || esportato.taskId || esportato.sessionId }))
    righe.push(`- **Id:** \`${esportato.sessionId}\``)
    righe.push(tr('app.transcript.model', { modello: esportato.modello || '(default)' }))
    righe.push(tr('app.transcript.started', { quando: esportato.avviataAlle || '?' }))
    righe.push(tr('app.transcript.finished', { esito: esportato.conclusa ? tr('app.transcript.yes') : tr('app.transcript.no') }))
    if (esportato.forkDa) righe.push(tr('app.transcript.forkFrom', { id: esportato.forkDa }))
    righe.push(tr('app.transcript.totalEvents', { n: Array.isArray(esportato.eventi) ? esportato.eventi.length : 0 }), '')

    if (!Array.isArray(esportato.eventi) || esportato.eventi.length === 0) {
        righe.push(tr('app.transcript.noEvents'))
        return righe.join('\n')
    }

    let numeroGiro = 0
    for (const evento of esportato.eventi as Evento[]) {
        switch (evento.type) {
            case 'RunStarted': {
                numeroGiro += 1
                righe.push(tr('app.transcript.turn', { n: numeroGiro }), '')
                if (evento.contesto?.modello) righe.push(tr('app.transcript.turnModel', { modello: evento.contesto.modello }))
                if (evento.contesto?.reasoning?.effort) righe.push(tr('app.transcript.reasoningEffort', { effort: evento.contesto.reasoning.effort }))
                if (evento.contesto?.permessi) righe.push(tr('app.transcript.turnPermissions', { permessi: evento.contesto.permessi }))
                righe.push('', descriviTask(evento.input), '')
                break
            }
            case 'TextMessageStart':
            case 'ReasoningMessageStart': {
                break
            }
            case 'TextMessageContent': {
                testoBuffer.set(evento.messageId, (testoBuffer.get(evento.messageId) || '') + String(testoDelCampo(evento, 'delta')))
                if (testoBuffer.get(evento.messageId)!.trim() !== '') prendiPosto(`testo:${evento.messageId}`)
                break
            }
            case 'TextMessageEnd': {
                const testo = testoBuffer.get(evento.messageId)
                if (testo !== undefined && testo.trim() !== '') riempiPosto(`testo:${evento.messageId}`, [tr('app.transcript.assistant'), '', testo, ''])
                testoBuffer.delete(evento.messageId)
                break
            }
            case 'ReasoningMessageContent': {
                ragionamentoBuffer.set(evento.messageId, (ragionamentoBuffer.get(evento.messageId) || '') + evento.delta)
                if (ragionamentoBuffer.get(evento.messageId)!.trim() !== '') prendiPosto(`pensiero:${evento.messageId}`)
                break
            }
            case 'ReasoningMessageEnd': {
                const pensiero = ragionamentoBuffer.get(evento.messageId)
                if (pensiero !== undefined && pensiero.trim() !== '') {
                    riempiPosto(`pensiero:${evento.messageId}`, [`<details><summary>${tr('app.transcript.reasoningSummary')}</summary>`, '', pensiero, '', '</details>', ''])
                }
                ragionamentoBuffer.delete(evento.messageId)
                break
            }
            case 'ToolCallStart': {
                toolBuffer.set(evento.toolCallId, { nome: evento.toolCallName, argomenti: '' })
                prendiPosto(`tool:${evento.toolCallId}`)
                break
            }
            case 'ToolCallArgs': {
                const info = toolBuffer.get(evento.toolCallId)
                if (info) info.argomenti += evento.delta
                break
            }
            case 'ToolCallResult': {
                const info = toolBuffer.get(evento.toolCallId) || { nome: tr('app.transcript.unknown'), argomenti: '' }
                let argFormattati = info.argomenti
                try { argFormattati = JSON.stringify(JSON.parse(info.argomenti), null, 2) } catch { /* args non-JSON o incompleti: mostrati grezzi, mai persi */ }
                riempiPosto(`tool:${evento.toolCallId}`, [
                    `**🔧 ${nomeUmanoAttrezzo(info.nome)}** · \`${info.nome}\``, '', tr('app.transcript.arguments'), blocco(argFormattati || tr('app.transcript.none'), 'json'), '',
                    tr('app.transcript.outcomeFull'), blocco(String(evento.content ?? '')), '',
                ])
                toolBuffer.delete(evento.toolCallId)
                break
            }
            case 'StateDelta': {
                const operazione = evento.delta?.[0]
                if (operazione?.path === '/usage') {
                    righe.push(tr('app.transcript.usageUpdated', { valore: blocco(JSON.stringify(operazione.value), 'json') }), '')
                } else if (operazione?.path?.startsWith('/file/')) {
                    const percorso = operazione.path.replace(/^\/file\//, '')
                    righe.push(tr(operazione.op === 'add' ? 'app.transcript.fileCreated' : 'app.transcript.fileModified', { percorso }), '')
                } else {
                    righe.push(`_StateDelta:_ ${blocco(JSON.stringify(evento.delta), 'json')}`, '')
                }
                break
            }
            case 'ArtifactCreated': {
                righe.push(tr('app.transcript.artifactCreated', { titolo: evento.titolo || tr('app.transcript.untitled'), id: evento.id }), '')
                break
            }
            case 'WorkspaceChanged': {
                const elenco = Array.isArray(evento.percorsi) ? evento.percorsi.join(', ') : tr('app.transcript.pathsUnspecified')
                righe.push(tr('app.transcript.workspaceChanged', { elenco }), '')
                break
            }
            case 'QueuedMessageDelivered': {
                righe.push(tr('app.transcript.queuedFollowUp'), '', evento.testo ?? '', '')
                break
            }
            case 'ApprovalRequested': {
                righe.push(tr('app.transcript.approvalRequested', { azione: descriviAzioneApprovazioneR4(evento.azione, lingua) }), '')
                break
            }
            case 'ApprovalResolved': {
                righe.push(tr('app.transcript.approvalResolved', {
                    esito: evento.approvato ? tr('app.transcript.granted') : tr('app.transcript.denied'),
                    cartella: evento.ambito === 'cartella' ? tr('app.transcript.inThisFolder') : '',
                    automatica: evento.motivo === 'nessuna-interfaccia' ? tr('app.transcript.nobodyCouldAnswer') : '',
                }), '')
                break
            }
            case 'RunFinished': {
                righe.push(tr('app.transcript.turnDone'), '')
                break
            }
            case 'RunError': {
                righe.push(tr('app.transcript.error', { codice: evento.code ? ` [${evento.code}]` : '', messaggio: testoDelCampo(evento, 'message') }), '')
                break
            }
            /* Decisione 14 del desktop (08/10): il fornitore a valle è un FATTO del turno; gli altri CUSTOM nel `default`. */
            case 'CUSTOM': {
                if (evento.name === 'talos.fornitore-a-valle' && typeof evento.value?.fornitore === 'string' && evento.value.fornitore.trim()) {
                    righe.push(tr('app.transcript.servedVia', { fornitore: evento.value.fornitore.trim() }), '')
                    break
                }
                righe.push(tr('app.transcript.unknownEvent', { tipo: evento.type }), blocco(JSON.stringify(evento), 'json'), '')
                break
            }
            default: {
                // mai un evento silenziosamente scartato
                righe.push(tr('app.transcript.unknownEvent', { tipo: evento.type }), blocco(JSON.stringify(evento), 'json'), '')
            }
        }
    }
    return righe.flatMap((riga) => (riga && typeof riga === 'object' && 'postoTrascrizione' in riga ? (riga.contenuto ?? []) : [riga as string])).join('\n')
}

export type FormatoEsportazioneR4 = 'markdown' | 'json'
export interface ArtefattoEsportazioneR4 { reportType: string; content: string; contentType: string; extension: string; fileName: string }

/**
 * `esportaTrascrizioneSessione` del desktop (`legacy/app.js:8567`): la trascrizione Markdown o il JSON grezzo di `/export` (byte per
 * byte, `stringify(…, null, 2)`), col nome del file del desktop. Un testo vuoto è un errore, mai un successo (`exportEmpty`).
 */
export function artefattoEsportazioneR4(esportato: Record<string, any>, formato: FormatoEsportazioneR4, lingua: string): ArtefattoEsportazioneR4 {
    const markdown = formato === 'markdown'
    const content = markdown ? trascrizioneMarkdownR4(esportato, lingua) : JSON.stringify(esportato, null, 2)
    if (!content || !content.trim()) throw new Error(testoTrascrizioneR4('app.sessions.exportEmpty', lingua))
    const extension = markdown ? 'md' : 'json'
    return {
        reportType: typeof esportato.schema === 'string' ? esportato.schema : 'talos.harness-ui.session-export.v1',
        content,
        contentType: markdown ? 'text/markdown' : 'application/json',
        extension,
        fileName: testoTrascrizioneR4('app.sessions.exportFileName', lingua, { id: esportato.sessionId, ext: extension }),
    }
}
