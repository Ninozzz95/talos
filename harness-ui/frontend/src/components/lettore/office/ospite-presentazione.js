/**
 * F5 File reader (26/09/2026) — il bundle della PAGINA OSPITE per PowerPoint (`/lettore-ospite-presentazione.js`, script
 * classico caricato dalla cornice col suo nonce): mette a disposizione della pagina ospite la resa delle slide.
 */
import { resaPresentazione } from './presentazione.js';

globalThis.TalosResaOspite = Object.freeze({ ...(globalThis.TalosResaOspite ?? {}), presentazione: resaPresentazione });
