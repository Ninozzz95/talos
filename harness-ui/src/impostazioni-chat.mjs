/*
 * Decisione 140 dell'owner (04/11/2026) — «BLOCCHI VIVI NELLE RISPOSTE» / «Live blocks in replies», accesa di serie.
 *
 * Con la preferenza accesa una conversazione NUOVA del PC riceve il catalogo dei blocchi (tabelle, grafici, scelte, moduli) nel primo
 * messaggio di sistema; spenta, le conversazioni nuove nascono senza. Quelle già nate tengono il prefisso con cui sono nate: il
 * registro legge questa preferenza UNA volta alla nascita (condizione di Performance) e la timbra (`session-registry.mjs`,
 * `blocchiViviPerNuoveFn`), come Hermes tiene il prompt di sistema in cache sulla sessione (`agent/chat_completion_helpers.py:1744-1759`)
 * e Codex tiene le funzioni «session-static» (`core/src/session/mod.rs:2405-2409`).
 * ⛔ Sta sul SERVER come «Dove girano i comandi» (`impostazioni-comandi.mjs`) e il motore del contesto: una conversazione nasce anche
 *   dal telefono, e il registro la legge in modo sincrono. Un archivio a sé (non un campo di `impostazioni-contesto.mjs`): la forma di
 *   quell'archivio è un contratto col telefono e con le prove, e questa preferenza non ha niente a che fare col contesto.
 * Due porte: la riga in Impostazioni → Chat (`GET/POST /api/v1/chat-settings`) e l'attrezzo `app_settings` del modello (voce
 *   `chat.liveBlocks`, dietro la carta); dal telefono la stessa voce con `app-settings.apply`.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { scriviAtomico } from './research-store.mjs';

export const SCHEMA_IMPOSTAZIONI_CHAT = 'talos.chat-settings.v1';
const DI_SERIE = Object.freeze({ blocchiVivi: true });

const errore = (messaggio) => Object.assign(new Error(messaggio), { code: 'CHAT_SETTINGS_INVALID' });

function valida(valore) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) throw errore('Chat settings must be an object.');
  const chiavi = Object.keys(valore).filter((k) => k !== 'schema');
  if (chiavi.length !== 1 || chiavi[0] !== 'blocchiVivi' || typeof valore.blocchiVivi !== 'boolean') {
    throw errore('Live blocks in replies is true or false.');
  }
  return { blocchiVivi: valore.blocchiVivi };
}

export function createImpostazioniChat({ file, avvisa = (m) => console.warn(m) } = {}) {
  if (typeof file !== 'string' || !file) throw errore('The chat settings file is required.');
  let corrente = null;
  /* Un file illeggibile non decide per la persona: vale il di serie (acceso), e lo si dice. */
  const daTesto = (testo) => {
    try { return valida(JSON.parse(testo)); } catch (e) {
      avvisa(`[chat-settings] ${file} is unreadable (${e?.code ?? e?.message ?? e}): live blocks stay on until it is saved again`);
      return { ...DI_SERIE };
    }
  };
  const carica = (testo) => (testo === null ? { ...DI_SERIE } : daTesto(testo));
  const nonLetto = (e) => { if (e?.code !== 'ENOENT') avvisa(`[chat-settings] ${file} cannot be read (${e?.code}): live blocks stay on`); return null; };
  /* La nascita di una conversazione è SINCRONA nel registro: la prima lettura è sincrona, poi vale la copia in memoria. */
  const caricaSincrono = () => {
    if (corrente) return corrente;
    let testo = null;
    try { testo = readFileSync(file, 'utf8'); } catch (e) { testo = nonLetto(e); }
    corrente = carica(testo);
    return corrente;
  };
  /* Chi scrive sta in fila (come `impostazioni-contesto.mjs`, R7): due salvataggi in corsa finiscono nell'ordine in cui sono arrivati. */
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
      try { nuovo = valida(valore); } catch (e) { return Promise.reject(e); }
      const turno = fila.then(async () => {
        await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_IMPOSTAZIONI_CHAT, ...nuovo }, null, 2)}\n`);
        corrente = nuovo;
        return { ...nuovo };
      });
      fila = turno.catch(() => {});
      return turno;
    },
    blocchiViviPerUnaConversazioneNuova: () => caricaSincrono().blocchiVivi,
  });
}
