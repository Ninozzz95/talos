/*
 * Owner 27/10/2026 («Di serie nelle Impostazioni + per conversazione») — DOVE GIRANO I COMANDI DELLE CONVERSAZIONI NUOVE.
 *
 * La scelta per conversazione c'è dal 10/09 (D-10F, il foglio dei permessi, `session-registry.mjs::doveGiranoIComandi`). Qui sta
 * la scelta DI SERIE: con che valore nasce una conversazione nuova. `null` = «Automatico», il comportamento di sempre: chi non
 * decide non cambia niente.
 * Ricerca 27/10/2026: Hermes tiene il backend del terminale in una configurazione unica (`hermes_cli/config_defaults.py:297-298`,
 *   `terminal.backend`); VS Code e Cursor hanno un profilo di terminale predefinito (`terminal.integrated.defaultProfile.windows`) e
 *   la scelta per singolo terminale dal menu «+». Il one-up: la scelta di serie E quella della conversazione, e il server come
 *   unica autorità.
 * ⛔ Sta sul SERVER come «Motore del contesto» (`impostazioni-contesto.mjs`), non nelle preferenze del browser: una conversazione
 *   nasce anche dal telefono o senza interfaccia (le automazioni) e deve seguire la stessa scelta. Si legge alla NASCITA e si
 *   timbra sulla conversazione: cambiarla non sposta le conversazioni già nate. Le figlie e i rami ereditano dal padre.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { scriviAtomico } from './research-store.mjs';

export const SCHEMA_IMPOSTAZIONI_COMANDI = 'talos.command-settings.v1';
export const DOVE_DI_SERIE_VALIDI = Object.freeze([null, 'windows', 'wsl2']);
const DI_SERIE = Object.freeze({ doveDiSerie: null });

const errore = (messaggio) => Object.assign(new Error(messaggio), { code: 'COMMAND_SETTINGS_INVALID' });

function valida(valore) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) throw errore('Command settings must be an object.');
  const chiavi = Object.keys(valore).filter((k) => k !== 'schema');
  if (chiavi.length !== 1 || chiavi[0] !== 'doveDiSerie' || !DOVE_DI_SERIE_VALIDI.includes(valore.doveDiSerie)) {
    throw errore('Where commands run by default is null (automatic), "windows" or "wsl2".');
  }
  return { doveDiSerie: valore.doveDiSerie };
}

export function createImpostazioniComandi({ file, avvisa = (m) => console.warn(m) } = {}) {
  if (typeof file !== 'string' || !file) throw errore('The command settings file is required.');
  let corrente = null;
  const daTesto = (testo) => {
    try { return valida(JSON.parse(testo)); } catch (e) {
      avvisa(`[command-settings] ${file} is unreadable (${e?.code ?? e?.message ?? e}): automatic applies until it is saved again`);
      return { ...DI_SERIE };
    }
  };
  const leggiTesto = (leggi) => {
    try { return leggi(); } catch (e) {
      if (e?.code !== 'ENOENT') avvisa(`[command-settings] ${file} cannot be read (${e?.code}): automatic applies`);
      return null;
    }
  };
  /* Una conversazione nuova nasce in modo SINCRONO nel registro: la prima lettura è sincrona, le scritture aggiornano la copia. */
  const caricaSincrono = () => {
    if (corrente) return corrente;
    const testo = leggiTesto(() => readFileSync(file, 'utf8'));
    corrente = testo === null ? { ...DI_SERIE } : daTesto(testo);
    return corrente;
  };
  return Object.freeze({
    async leggi() {
      if (corrente) return { ...corrente };
      let testo = null;
      try { testo = await readFile(file, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') avvisa(`[command-settings] ${file} cannot be read (${e?.code}): automatic applies`); }
      corrente = testo === null ? { ...DI_SERIE } : daTesto(testo);
      return { ...corrente };
    },
    async scrivi(valore) {
      const nuovo = valida(valore);
      await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_IMPOSTAZIONI_COMANDI, ...nuovo }, null, 2)}\n`);
      corrente = nuovo;
      return { ...nuovo };
    },
    dovePerUnaConversazioneNuova: () => caricaSincrono().doveDiSerie,
  });
}
