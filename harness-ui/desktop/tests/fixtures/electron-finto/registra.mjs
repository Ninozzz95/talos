/* Da passare a `node --import`: registra l'aggancio prima che `main.mjs` chieda `electron` (vedi `aggancio.mjs`). */
import { register } from 'node:module';

register(new URL('./aggancio.mjs', import.meta.url));
