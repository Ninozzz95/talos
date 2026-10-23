/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO — l'accoppiamento dal telefono (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, fette R-M2/R-M3),
 * sopra il plugin nativo `TalosRemoto` (`android/…/remoto/TalosRemotoPlugin.kt`), che fa solo il trasporto.
 *
 * Il PC (`servizio.mjs` `accoppia` @ aeab15222): telefono → `pair.hello {gettone, nome, piattaforma}`; PC → `pair.code {codice, pc}`;
 * il telefono può solo annullare (`pair.cancel`); PC → `pair.ok {dispositivo, pc:{nome, programma, vapid}}` o `error {code}`.
 * Il codice di 6 cifre si CALCOLA qui (`codiceDiAccoppiamento`) e si confronta con quello del PC: un QR fotografato e usato da un
 * altro telefono dà un codice diverso (cambia l'EndpointId di chi chiama), e allora si annulla senza chiedere niente alla persona.
 */
import { codiceDiAccoppiamento, leggiQrRemoto, messaggioRemotoValido } from './filoRemoto'
import type { ErroreRemoto } from './clienteRemoto'

type Ascolto = { remove(): Promise<void> }

export interface PluginRemoto {
    accoppia(o: { pcId: string, relay: string | null }): Promise<{ canale: string, telefonoId: string }>
    /** R-M5: `vapid` = la VAPID pubblica del PC (`pair.ok`), che il nativo ricorda col PC per la sveglia (se ha la forma giusta). */
    concludiAccoppiamento(o: { canale: string, nome: string | null, vapid?: string | null }): Promise<void>
    collega(o: { pcId: string }): Promise<{ canale: string }>
    invia(o: { canale: string, json: string }): Promise<void>
    chiudi(o: { canale: string }): Promise<void>
    addListener(evento: 'remoto-messaggio', cb: (e: { canale: string, json: string }) => void): Promise<Ascolto>
    addListener(evento: 'remoto-chiuso', cb: (e: { canale: string, motivo: string }) => void): Promise<Ascolto>
}

export interface ComputerDelQr { id: string, nome?: string | null, programma?: string | null }

export interface AccoppiamentoRiuscito {
    pcId: string
    nome: string | null
    programma: string | null
    /** La chiave pubblica VAPID del PC, per la sveglia (R-M5). */
    vapid: string | null
}

function errore(code: string): ErroreRemoto {
    return Object.assign(new Error(code), { code }) as ErroreRemoto
}

/**
 * Avvia l'accoppiamento dal testo del QR. `onCodice` arriva quando il codice del PC è quello giusto: la schermata mostra il numero
 * e «Conferma sul computer». `annulla()` è il tasto «Annulla» del telefono.
 */
export function avviaAccoppiamento(
    plugin: PluginRemoto,
    testoQr: string,
    { nome, ora = () => Date.now(), onCodice }: {
        nome: string | null
        ora?: () => number
        onCodice?: (c: { codice: string, pc: ComputerDelQr }) => void
    },
): { esito: Promise<AccoppiamentoRiuscito>, annulla(): Promise<void> } {
    // «Annulla» premuto mentre ci si collega ancora: si ricorda, e la connessione appena aperta si chiude subito
    let annullatoPrima = false
    let annulla: () => Promise<void> = async () => { annullatoPrima = true }
    let fine: ((e: ErroreRemoto | null, r?: AccoppiamentoRiuscito) => void) | null = null

    const esito = (async () => {
        const qr = leggiQrRemoto(testoQr)
        if (!qr) throw errore('BAD_MESSAGE')
        if (qr.scadeAlle <= ora()) throw errore('PAIR_EXPIRED')
        const { canale, telefonoId } = await plugin.accoppia({ pcId: qr.pcId, relay: qr.relay })
        if (annullatoPrima) {
            await plugin.chiudi({ canale }).catch(() => undefined)
            throw errore('CANCELLED')
        }
        const atteso = await codiceDiAccoppiamento(qr.pcId, telefonoId, qr.gettone)
        const ascolti: Ascolto[] = []
        const invia = (m: Record<string, unknown>) => plugin.invia({ canale, json: JSON.stringify({ v: 1, ...m }) })
        let chiuso = false
        const smonta = async () => { for (const a of ascolti.splice(0)) await a.remove().catch(() => undefined) }
        const lascia = async (conCancel: boolean) => {
            if (chiuso) return
            chiuso = true
            if (conCancel) await invia({ t: 'pair.cancel' }).catch(() => undefined)
            await plugin.chiudi({ canale }).catch(() => undefined)
        }

        return await new Promise<AccoppiamentoRiuscito>((risolvi, rifiuta) => {
            fine = (e, r) => {
                fine = null
                void smonta()
                if (e) rifiuta(e)
                else risolvi(r!)
            }
            annulla = async () => { await lascia(true); fine?.(errore('CANCELLED')) }
            void (async () => {
                ascolti.push(await plugin.addListener('remoto-chiuso', (e) => {
                    if (e.canale !== canale || chiuso) return
                    chiuso = true
                    // il nativo tiene la chiave nuova in attesa dopo la fine (TRAS-05): senza pair.ok si butta subito
                    void plugin.chiudi({ canale }).catch(() => undefined)
                    fine?.(errore(e.motivo === 'ENDED' ? 'DISCONNECTED' : e.motivo || 'DISCONNECTED'))
                }))
                ascolti.push(await plugin.addListener('remoto-messaggio', (e) => {
                    if (e.canale !== canale) return
                    let m: unknown
                    try { m = JSON.parse(e.json) } catch { return }
                    if (!messaggioRemotoValido(m)) return
                    if (m.t === 'pair.code') {
                        if (m.codice !== atteso) { void lascia(true).then(() => fine?.(errore('CODE_MISMATCH'))); return }
                        onCodice?.({ codice: atteso, pc: (m.pc ?? { id: qr.pcId }) as ComputerDelQr })
                    } else if (m.t === 'pair.ok') {
                        const pc = (m.pc ?? {}) as { nome?: unknown, programma?: unknown, vapid?: unknown }
                        const testo = (v: unknown) => (typeof v === 'string' && v ? v : null)
                        const riuscito = { pcId: qr.pcId, nome: testo(pc.nome), programma: testo(pc.programma), vapid: testo(pc.vapid) }
                        chiuso = true
                        plugin.concludiAccoppiamento({ canale, nome: riuscito.nome, vapid: riuscito.vapid })
                            .then(() => fine?.(null, riuscito), () => fine?.(errore('OPERATION_FAILED')))
                    } else if (m.t === 'error') {
                        chiuso = true
                        void plugin.chiudi({ canale }).catch(() => undefined)
                        fine?.(errore(typeof m.code === 'string' ? m.code : 'BAD_MESSAGE'))
                    }
                }))
                await invia({ t: 'pair.hello', gettone: qr.gettone, ...(nome ? { nome } : {}), piattaforma: 'android' })
            })().catch(() => { void lascia(false); fine?.(errore('DISCONNECTED')) })
        })
    })()
    return { esito, annulla: () => annulla() }
}
