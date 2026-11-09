/*
 * «Continua adesso con…» (owner 27/10/2026 notte, «Sì, un clic per continuare»; bozzetto approvato il 28/10, scena «Limite del piano»).
 *
 * Quando il piano ChatGPT ha finito l'uso, il giro aspetta il reset (anche mezz'ora). La carta offre, in più, i modelli che la persona
 * ha GIÀ configurato: un clic e la conversazione continua adesso con quello. Nessun modello viene mai scelto al posto suo.
 *
 * ⭐ Dal codice di Codex (clone `TALOS-RICERCHE/concorrenti/codex-2026-10-16`, letto il 28/10/2026): sul limite d'uso cambia il modello
 *   del thread (`codex-rs/tui/src/app/backend_banner_fallback.rs:46-110`, `ThreadSettingsUpdateParams { model, … }`), rimanda il turno
 *   in sospeso (`chatwidget/backend_banners.rs:215-236`, il prompt torna in testa alla coda) e lo dice in chat («Automatically switched
 *   to … due to usage limits.»). Qui non è automatico (owner: «mai scelto al posto tuo») e i candidati sono più di uno.
 *
 * Questo modulo è puro: sceglie le proposte. Il cambio vero (impostazioni, Ferma, ripresa) lo fa `app.js`.
 */
import { nomeFornitore, PROVIDER_DIRETTI } from './fonti-modelli.js';
import { nomeModello } from './session-item.js';

const ID_DIRETTI = new Set(PROVIDER_DIRETTI.map((p) => p.id));

/**
 * Il fornitore che serve un modello, letto dal suo id: `local:…` gira su questo computer, `<fornitore>:…` è un fornitore diretto
 * (`zai:`, `chatgpt:`, …), `<autore>/<modello>` passa da OpenRouter. `null` se l'id non si sa leggere.
 */
export function fornitoreDelModello(id) {
  const s = typeof id === 'string' ? id.trim() : '';
  if (!s) return null;
  const due = /^([a-z0-9-]+):/iu.exec(s);
  if (due) {
    const prefisso = due[1].toLowerCase();
    if (prefisso === 'local') return 'local';
    return ID_DIRETTI.has(prefisso) ? prefisso : null;
  }
  return s.includes('/') ? 'openrouter' : null;
}

const istante = (riga) => {
  const v = Date.parse(riga?.ultimaRispostaAlle || riga?.avviataAlle || '');
  return Number.isFinite(v) ? v : 0;
};

/**
 * Le proposte per continuare: i modelli delle conversazioni più recenti, uno per modello, di un fornitore DIVERSO da quello bloccato
 * e configurato (una chiave collegata, o un modello di questo computer). Al massimo `massimo`.
 * @param {{ sessioni?: Array<object>, bloccato?: string|null, configurati?: Set<string>|null, massimo?: number }} opzioni
 * @returns {Array<{ valore: string, testo: string, fornitore: string|null }>}
 */
export function modelliPerContinuare({ sessioni = [], bloccato = null, configurati = null, massimo = 2 } = {}) {
  const fornitoreBloccato = fornitoreDelModello(bloccato);
  const visti = new Set();
  const fuori = [];
  const ordinate = (Array.isArray(sessioni) ? sessioni : []).filter((r) => r && typeof r === 'object').slice().sort((a, b) => istante(b) - istante(a));
  for (const riga of ordinate) {
    const id = typeof riga.modelId === 'string' && riga.modelId.trim() ? riga.modelId.trim() : typeof riga.modello === 'string' ? riga.modello.trim() : '';
    if (!id || visti.has(id)) continue;
    visti.add(id);
    const fornitore = fornitoreDelModello(id);
    if (!fornitore || fornitore === fornitoreBloccato) continue;
    if (fornitore !== 'local' && !(configurati instanceof Set && configurati.has(fornitore))) continue;
    const testo = nomeModello(id);
    if (!testo) continue;
    fuori.push({ valore: id, testo, fornitore: nomeFornitore(fornitore) });
    if (fuori.length >= massimo) break;
  }
  return fuori;
}
