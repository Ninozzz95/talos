/*
 * ⭐ Fase 8, §3.5 strada A (owner 01/11/2026, D2: «copia sul server, la finestra applica e risponde») — LA COPIA SUL SERVER delle
 *   preferenze della finestra.
 *
 * Fino a oggi tema, lingua, movimento e chat vivevano SOLO nel `localStorage` della finestra (`talos.harness.desktop.settings.v1`): il
 * server non li conosceva, e il modello non poteva né leggerli né cambiarli a finestra chiusa. Qui il server ne tiene una copia:
 *   · la finestra la manda quando la persona cambia qualcosa (`PUT /api/v1/app-settings/window`) e la rilegge all'avvio;
 *   · il modello la cambia (attraverso `app_settings`), e l'evento `talos.impostazioni-finestra` la porta alle finestre del PC, che
 *     applicano e rispondono con ciò che hanno applicato (Hermes `theme.apply`, `server-requests.ts:111-124, 724-731`).
 * `revisione` cresce a ogni cambio VERO (un invio uguale non la muove): è il cursore con cui la finestra sa se la copia è più nuova.
 * ⛔ Solo valori semplici (testo, numero, sì/no), al più 200 campi: è un documento di preferenze, non un archivio.
 */
import { readFile } from 'node:fs/promises';
import { scriviAtomico } from '../research-store.mjs';

export const SCHEMA_COPIA_FINESTRA = 'talos.window-preferences.v1';
export const CAMPI_MASSIMI_COPIA = 200;
const NOME_CAMPO = /^[A-Za-z][A-Za-z0-9]{0,63}$/u;

const errore = (messaggio) => Object.assign(new Error(messaggio), { code: 'WINDOW_PREFERENCES_INVALID' });

/** I soli campi validi: nome semplice, valore testo (≤ 200), numero finito o sì/no. Il resto si scarta, mai un errore muto a metà. */
export function valoriDellaCopia(grezzi) {
  if (!grezzi || typeof grezzi !== 'object' || Array.isArray(grezzi)) throw errore('Window preferences must be an object.');
  const voci = Object.entries(grezzi);
  if (voci.length > CAMPI_MASSIMI_COPIA) throw errore(`Window preferences hold at most ${CAMPI_MASSIMI_COPIA} fields.`);
  const puliti = {};
  for (const [campo, valore] of voci) {
    if (!NOME_CAMPO.test(campo)) continue;
    if (typeof valore === 'boolean' || (typeof valore === 'number' && Number.isFinite(valore)) || (typeof valore === 'string' && valore.length <= 200)) puliti[campo] = valore;
  }
  return puliti;
}

const uguali = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/**
 * @param {{ file?: string|null, adesso?: () => number }} p — senza file la copia vive in memoria (le prove, un ospite senza cartella).
 */
export function creaCopiaFinestra({ file = null, adesso = () => Date.now() } = {}) {
  let stato = null;
  let coda = Promise.resolve();
  const inFila = (lavoro) => { const prossimo = coda.then(lavoro, lavoro); coda = prossimo.catch(() => {}); return prossimo; };

  async function carica() {
    if (stato) return stato;
    let letto = null;
    if (file) {
      try { letto = JSON.parse(await readFile(file, 'utf8')); } catch { letto = null; }
    }
    stato = letto && letto.schema === SCHEMA_COPIA_FINESTRA && Number.isSafeInteger(letto.revisione)
      ? { revisione: letto.revisione, valori: (() => { try { return valoriDellaCopia(letto.valori); } catch { return {}; } })(), aggiornataIl: letto.aggiornataIl ?? null }
      : { revisione: 0, valori: {}, aggiornataIl: null };
    return stato;
  }
  async function salva(prossimo) {
    if (file) await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_COPIA_FINESTRA, ...prossimo }, null, 1)}\n`);
    stato = prossimo;
    return { revisione: prossimo.revisione, valori: { ...prossimo.valori } };
  }

  return Object.freeze({
    /** `{ revisione, valori }` com'è adesso. */
    async leggi() { const s = await carica(); return { revisione: s.revisione, valori: { ...s.valori } }; },
    /** Il modello cambia alcuni campi: la revisione avanza solo se cambia qualcosa. */
    scriviCampi(patch) {
      return inFila(async () => {
        const s = await carica();
        const valori = { ...s.valori, ...valoriDellaCopia(patch) };
        if (uguali(valori, s.valori)) return { revisione: s.revisione, valori: { ...s.valori } };
        return salva({ revisione: s.revisione + 1, valori, aggiornataIl: new Date(adesso()).toISOString() });
      });
    },
    /** La finestra manda il suo documento (la persona ha cambiato qualcosa): sostituisce i campi che porta, tiene gli altri. */
    dallaFinestra(valoriFinestra) {
      return inFila(async () => {
        const s = await carica();
        const valori = { ...s.valori, ...valoriDellaCopia(valoriFinestra) };
        if (uguali(valori, s.valori)) return { revisione: s.revisione, valori: { ...s.valori } };
        return salva({ revisione: s.revisione + 1, valori, aggiornataIl: new Date(adesso()).toISOString() });
      });
    },
  });
}
