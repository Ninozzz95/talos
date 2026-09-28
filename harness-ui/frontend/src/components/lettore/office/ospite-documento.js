/**
 * F5 File reader (26/09/2026) — il bundle della PAGINA OSPITE per Word (`/lettore-ospite-documento.js`, script classico
 * caricato dalla cornice col suo nonce): mette a disposizione della pagina ospite la resa del documento.
 */
import { resaDocumento } from './documento.js';

globalThis.TalosResaOspite = Object.freeze({ ...(globalThis.TalosResaOspite ?? {}), documento: resaDocumento });
