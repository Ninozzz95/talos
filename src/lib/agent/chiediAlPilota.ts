import { talosIstruzioneDelPilota } from '@/lib/agent/passoDelloSchermo'
import type { ChatCompletion, ChatTurn } from '@/stores/chat'

/**
 * ⭐ La domanda secca al modello, un passo alla volta.
 *
 * ## ⛔ Perché NON passa dal ciclo agentico della chat
 *
 * La strada comoda sarebbe offrire due tool — «guarda» e «tocca» — e lasciare
 * che a pilotare sia il ciclo della chat. Costa poco da scrivere e MOLTO da
 * usare: ogni passo si porta dietro l'intera conversazione, il prompt di
 * sistema e il catalogo dei tool. Qui il passo è una conversazione **di due
 * righe**, buttata via ogni volta.
 *
 * MISURATO (2026-08-10, pagina di risultati Google, 56 elementi): l'osservazione
 * compatta costa **458 token** contro i 3.767 del formato a dodici campi di
 * M3A. Attaccarci sopra la cronologia di una chat vera vanificherebbe il taglio.
 *
 * ## ⛔ E la storia è CORTA di proposito
 *
 * `talosRigaDiStoria` tiene ogni passo sotto le cinquanta parole. Un pilota che
 * si porta dietro venti schermate intere non ricorda meglio: ricorda **più
 * lentamente**, e paga il prefill a ogni passo.
 */
export function creaChiediDelPilota(input: {
    obiettivo: string
    completa: ChatCompletion
}): (passo: { osservazione: string, storia: readonly string[] }) => Promise<string> {
    return async (passo) => {
        const turni: ChatTurn[] = [
            {
                role: 'user',
                content: talosIstruzioneDelPilota({
                    obiettivo: input.obiettivo,
                    storia: passo.storia,
                }) + `\n\n${passo.osservazione}`,
            },
        ]
        /*
         * ⛔ Senza tool e senza flusso.
         *
         * Senza tool perché il pilota ha già il suo vocabolario chiuso (otto
         * azioni) e offrirgliene altri quaranta è insegnargli a uscire dal
         * seminato mentre tiene in mano lo schermo di qualcuno. Senza flusso
         * perché di questa risposta non si mostra niente mentre arriva: si usa
         * quando è intera, e una riga di JSON a metà non si può leggere.
         */
        const esito = await input.completa(turni)
        return esito.text
    }
}
