/*
 * 01/11/2026 — «Tieni sveglio il PC»: la scelta della persona, sul SERVER come «Dove girano i comandi» (`impostazioni-comandi.mjs`), perché
 * la applica il server (`pc-sveglio.mjs`) e il guscio obbedisce. Forma `FORMA-PC-SVEGLIO-E-SCHEDA-LENTA-2026-11-01.md`, OK del Desktop;
 * frasi e posto del Frontend. Tre modi come Hermes desktop (`power-save.ts:62-71`); di serie «mentre lavora».
 * Un file illeggibile vale il modo di serie e lo dice nel registro; la prima lettura è sincrona (la usa il giro dei 15 s).
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { scriviAtomico } from './research-store.mjs';
import { MODI, MODO_DI_SERIE } from './pc-sveglio.mjs';

export const SCHEMA_IMPOSTAZIONI_PC_SVEGLIO = 'talos.keep-awake-settings.v1';
const errore = (messaggio) => Object.assign(new Error(messaggio), { code: 'KEEP_AWAKE_SETTINGS_INVALID' });

export function validaModoPcSveglio(valore) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) throw errore('Keep-awake settings must be an object.');
  const chiavi = Object.keys(valore).filter((k) => k !== 'schema');
  if (chiavi.length !== 1 || chiavi[0] !== 'modo' || !MODI.includes(valore.modo)) throw errore(`The keep-awake mode is one of ${MODI.join(', ')}.`);
  return { modo: valore.modo };
}

export function createImpostazioniPcSveglio({ file, avvisa = (m) => console.warn(m) } = {}) {
  if (typeof file !== 'string' || !file) throw errore('The keep-awake settings file is required.');
  let corrente = null;
  const daTesto = (testo) => {
    try { return validaModoPcSveglio(JSON.parse(testo)); } catch (e) {
      avvisa(`[keep-awake] ${file} is unreadable (${e?.code ?? e?.message ?? e}): the default applies until it is saved again`);
      return { modo: MODO_DI_SERIE };
    }
  };
  const caricaSincrono = () => {
    if (corrente) return corrente;
    let testo = null;
    try { testo = readFileSync(file, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') avvisa(`[keep-awake] ${file} cannot be read (${e?.code}): the default applies`); }
    corrente = testo === null ? { modo: MODO_DI_SERIE } : daTesto(testo);
    return corrente;
  };
  return Object.freeze({
    async leggi() {
      if (corrente) return { ...corrente };
      let testo = null;
      try { testo = await readFile(file, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') avvisa(`[keep-awake] ${file} cannot be read (${e?.code}): the default applies`); }
      corrente = testo === null ? { modo: MODO_DI_SERIE } : daTesto(testo);
      return { ...corrente };
    },
    async scrivi(valore) {
      const nuovo = validaModoPcSveglio(valore);
      await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_IMPOSTAZIONI_PC_SVEGLIO, ...nuovo }, null, 2)}\n`);
      corrente = nuovo;
      return { ...nuovo };
    },
    modoAdesso: () => caricaSincrono().modo,
  });
}
