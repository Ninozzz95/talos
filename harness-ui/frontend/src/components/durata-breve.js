/**
 * Le durate brevi delle righe vive («12s», «3m 12s») e la stima che resta («~40 s»). Owner 29/10/2026 (via Mobile): «12s · 1m 4s»
 * uguale su telefono e PC e in tutte le lingue — prima l'italiano diceva «3 min 12 s».
 *
 * ⛔ 28/10/2026 sera: stavano in `context-progress.js`, e l'elenco delle sessioni (`session-item.js`) le importava da lì: per formattare
 *   dei secondi la barra laterale si tirava dietro il compattatore del contesto e, a catena, conversazione, ispettore e grafo. Il
 *   Laboratorio dei modelli, che carica i moduli dalla sorgente, non riusciva più a montarli (21 prove rosse sulla candidata 17:
 *   `Failed to fetch dynamically imported module`). Qui dipendono solo dalla lingua; `context-progress.js` le riesporta.
 */
import { t } from './lingua.js';

const MINUTO_S = 60;
const ORA_S = 3600;

/** I secondi rimasti in breve, come il mockup («~1 min», «~40 s»): passi di 5 s, mai «~0 s» e mai «~60 s». */
export function stimaBreveRigaViva(secondi) {
  if (!Number.isSafeInteger(secondi) || secondi < 1) return '';
  const arrotondati = Math.max(5, Math.round(secondi / 5) * 5);
  if (arrotondati < MINUTO_S) return t('chat.context.live.etaSeconds', { n: arrotondati });
  return t('chat.context.live.etaMinutes', { n: Math.max(1, Math.round(secondi / MINUTO_S)) });
}

/** Il tempo trascorso in breve («3m 12s», in italiano «3 min 12 s»). */
export function durataBreveRigaViva(ms) {
  if (!Number.isSafeInteger(ms) || ms < 0) return '';
  const tutti = Math.floor(ms / 1000);
  if (tutti < MINUTO_S) return t('chat.context.live.durationSeconds', { s: tutti });
  /* revisione del blocco 12 (RV-REV-04): dall'ora in su le ore, come Codex `fmt_elapsed_compact` — un giro di due ore non si legge «120m» */
  if (tutti < ORA_S) return t('chat.context.live.durationMinutes', { m: Math.floor(tutti / MINUTO_S), s: tutti % MINUTO_S });
  return t('chat.context.live.durationHours', { h: Math.floor(tutti / ORA_S), m: Math.floor((tutti % ORA_S) / MINUTO_S), s: tutti % MINUTO_S });
}
