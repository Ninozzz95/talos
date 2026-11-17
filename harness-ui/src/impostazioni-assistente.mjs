/*
 * L'Assistente (decisione 1645 punto 2, giudice v1564, 11/11/2026): CON CHE MODELLO PENSA. Di serie quello della chat (`null`), sulla sua
 *   cache; cambiabile con qualunque altro, anche locale, dal pannello («Modello della chat ▾») o da Impostazioni → Memoria e contesto. Un altro
 *   modello riceve un riassunto compatto più gli strumenti (scelta F, `chat-a-lato`/`kernel/assistente-lato.mjs`).
 * ⛔ Un archivio a sé, come `impostazioni-chat.mjs`: la forma di `impostazioni-contesto.mjs` è un contratto col telefono e con le prove, e
 *   un campo in più lì cambiava quindici prove condivise. Sta sul SERVER: il registro lo legge in modo sincrono a ogni domanda.
 * La forma dell'id è quella del giro (`formaDiModelloRiconosciuta`), come il modello dei riassunti.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { scriviAtomico } from './research-store.mjs';
import { formaDiModelloRiconosciuta } from './kernel/catena-del-riassunto.mjs';

export const SCHEMA_IMPOSTAZIONI_ASSISTENTE = 'talos.assistant-settings.v1';
const DI_SERIE = Object.freeze({ modello: null });
const MASSIMO_ID_MODELLO = 256;

const errore = (messaggio) => Object.assign(new Error(messaggio), { code: 'ASSISTANT_SETTINGS_INVALID' });

/** Un campo solo: `modello`, `null` (quello della chat) o un id che un giro sa usare. */
export function validaImpostazioniAssistente(valore) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) throw errore('Assistant settings must be an object.');
  const chiavi = Object.keys(valore).filter((k) => k !== 'schema');
  const m = valore.modello;
  if (chiavi.length !== 1 || chiavi[0] !== 'modello'
    || !(m === null || (typeof m === 'string' && m.trim() && m.length <= MASSIMO_ID_MODELLO && formaDiModelloRiconosciuta(m.trim())))) {
    throw errore('The Assistant model is null (the chat model) or a model id (provider:model or author/model).');
  }
  return { modello: typeof m === 'string' ? m.trim() : null };
}

export function createImpostazioniAssistente({ file, avvisa = (m) => console.warn(m) } = {}) {
  if (typeof file !== 'string' || !file) throw errore('The assistant settings file is required.');
  let corrente = null;
  const daTesto = (testo) => {
    try { return validaImpostazioniAssistente(JSON.parse(testo)); } catch (e) {
      avvisa(`[assistant-settings] ${file} is unreadable (${e?.code ?? e?.message ?? e}): the chat model applies until it is saved again`);
      return { ...DI_SERIE };
    }
  };
  const carica = (testo) => (testo === null ? { ...DI_SERIE } : daTesto(testo));
  const nonLetto = (e) => { if (e?.code !== 'ENOENT') avvisa(`[assistant-settings] ${file} cannot be read (${e?.code}): the chat model applies`); return null; };
  const caricaSincrono = () => {
    if (corrente) return corrente;
    let testo = null;
    try { testo = readFileSync(file, 'utf8'); } catch (e) { testo = nonLetto(e); }
    corrente = carica(testo);
    return corrente;
  };
  let fila = Promise.resolve();
  return Object.freeze({
    async leggi() {
      if (corrente) return { ...corrente };
      let testo = null;
      try { testo = await readFile(file, 'utf8'); } catch (e) { testo = nonLetto(e); }
      corrente ??= carica(testo);
      return { ...corrente };
    },
    scrivi(valore) {
      let nuovo;
      try { nuovo = validaImpostazioniAssistente(valore); } catch (e) { return Promise.reject(e); }
      const turno = fila.then(async () => {
        await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_IMPOSTAZIONI_ASSISTENTE, ...nuovo }, null, 2)}\n`);
        corrente = nuovo;
        return { ...nuovo };
      });
      fila = turno.catch(() => {});
      return turno;
    },
    /** Per una domanda, in modo sincrono: `null` = il modello della chat. */
    modelloPerUnaDomanda: () => caricaSincrono().modello,
  });
}
