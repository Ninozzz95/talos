/*
 * L3-9 — l'EFFETTO di `kernel-di-serie-desktop.mjs`: lo importa SOLO `server.mjs`, e per secondo (dopo la difesa della ricerca dei
 * programmi), così l'ambiente è già a posto quando `config.mjs`, `runtime-owner-adapter.mjs` e `agent-service.mjs` vengono valutati.
 * `applicato` dice a chi stampa la riga `[kernel]` che il valore viene dal valore di serie e non da chi ha avviato il server.
 */
import { applicaKernelDiSerieDesktop } from './kernel-di-serie-desktop.mjs';

export const KERNEL_DI_SERIE_DESKTOP = Object.freeze(applicaKernelDiSerieDesktop());
