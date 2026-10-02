/**
 * ⭐⭐⭐ IL KERNEL, ESPOSTO AL BANCO — e perché è un bundle e non una copia.
 *
 * Il banco gira in Node, l'app in una WebView. Per misurare TALOS contro i
 * cinque concorrenti servono gli stessi pezzi che l'app usa davvero.
 *
 * ⛔ La strada sbagliata, e va nominata perché è quella comoda: **ricopiare**
 * il kernel nel banco in `.mjs`. Due copie divergono — sempre, e in silenzio —
 * e il giorno che divergono il banco misura un TALOS che non esiste. Sarebbe
 * la stessa famiglia del finto che replicava la regola a mano e certificava
 * come «scelta della persona» un potere mai mostrato.
 *
 * ⇒ Si compila il codice **vero**, con l'alias `@/` risolto da Vite, e il banco
 * importa il risultato. Se il kernel dell'app cambia, il bundle cambia; se non
 * si ricompila, si misura una versione vecchia — e per questo il generatore
 * stampa la data e il conto dei byte, che è l'unica sveglia disponibile.
 */
export { discoNode } from './discoNode'
export type { TalosDiscoNodeOpzioni } from './discoNode'

export { fontiDaDisco } from '@/lib/kernel/fontiDisco'
export type { TalosDisco, TalosVoceDisco } from '@/lib/kernel/fontiDisco'

export { costruisciCatalogo, risolviSimbolo } from '@/lib/kernel/catalogo'
export type { TalosSorgente } from '@/lib/kernel/catalogo'

export { cancelloSemantico } from '@/lib/kernel/semantica'
export type { TalosLibreriaStandard } from '@/lib/kernel/semantica'

/*
 * ⛔⛔⛔ La libreria standard, e senza di lei il cancello ACCUSA CODICE SANO.
 * Il kernel lo dichiara con la misura: sostituire una funzione con
 * `righe.length` veniva rifiutato per "Property 'length' does not exist",
 * perche' nessuno aveva dato `lib.d.ts` al compilatore. ⇒ Un cancello che
 * accusa codice sano viene spento al terzo falso allarme, e con lui se ne va
 * la garanzia vera. Costa 25 KB compressi.
 */
export { libreriaStandard } from '@/lib/kernel/libreriaStandard'
export { dichiaratiIn, ESTENSIONI_SORGENTE } from '@/lib/kernel/simboli'

/*
 * ⭐⭐⭐ P4-ter (02/10/2026, owner «Nucleo unico»): la compattazione del contesto è UNA, in `src/lib/kernel/compattazione.ts`;
 * la chat la importa dall'app, il Codice da qui. Stessa ragione del resto del file: due copie divergono in silenzio.
 */
export * as compattazione from '@/lib/kernel/compattazione'
