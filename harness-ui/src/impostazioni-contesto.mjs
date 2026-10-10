/*
 * C1 (owner 09/10/2026 sera) — L'INTERRUTTORE DEL MOTORE DEL CONTESTO, lato server.
 *
 * Il Context Engine col metodo approvato (livello 1 a regole, livello 2 solo se serve, recupero) è il motore DI SERIE delle
 * conversazioni NUOVE; quelle esistenti restano col legacy. «Motore del contesto» in Impostazioni → Contesto lo spegne: da
 * spento le conversazioni nuove nascono col legacy (come l'auto-compattazione di Claude Code in `/config`).
 * ⛔ Sta sul SERVER, non nelle preferenze del browser: una conversazione nasce anche senza interfaccia (le figlie, i passi dei
 *   Workflow, le automazioni) e deve seguire la stessa scelta. La scelta si legge alla NASCITA e si timbra sulla
 *   conversazione (`session-registry.mjs`, `motoreContesto`): cambiarla non sposta le conversazioni già nate.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { scriviAtomico } from './research-store.mjs';

export const SCHEMA_IMPOSTAZIONI_CONTESTO = 'talos.context-settings.v1';
export const MOTORI_CONTESTO = Object.freeze(['engine', 'legacy']);
const DI_SERIE = Object.freeze({ motore: 'engine' });

const errore = (messaggio) => Object.assign(new Error(messaggio), { code: 'CTX_SETTINGS_INVALID' });

function valida(valore) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) throw errore('Context settings must be an object.');
  const chiavi = Object.keys(valore).filter((k) => k !== 'schema');
  if (chiavi.length !== 1 || chiavi[0] !== 'motore' || !MOTORI_CONTESTO.includes(valore.motore)) throw errore('The context engine is "engine" or "legacy".');
  return { motore: valore.motore };
}

/**
 * C1, review Y1 (bugfixer, 10/10/2026): QUALI giri passano dai ganci del motore, deciso in modo SINCRONO.
 * Di serie il motore vale per le conversazioni NATE col timbro «engine»; con `TALOS_CONTEXT_TRIAL` solo per quelle della lista.
 * ⛔ Il registro lo chiede PRIMA di andare in asincrono: una conversazione legacy deve partire esattamente come prima di C1,
 *   con `RunStarted` nel buffer al ritorno di `avviaESegui` (`session-registry.mjs`, il contratto delle righe 2385/2527/5976/6114:
 *   «un tick = 148 test, un await = 213»). Lo stesso criterio di `politicaAbilitazione`/`enabledSessionIds` del runtime.
 */
export function giroUsaIlMotore({ trialSessionIds = null } = {}) {
  const lista = Array.isArray(trialSessionIds) ? new Set(trialSessionIds) : null;
  return (sessionId, voce) => (lista ? lista.has(sessionId) : voce?.motoreContesto === 'engine');
}

export function createImpostazioniContesto({ file, avvisa = (m) => console.warn(m) } = {}) {
  if (typeof file !== 'string' || !file) throw errore('The context settings file is required.');
  let corrente = null;
  const daTesto = (testo) => {
    try { return valida(JSON.parse(testo)); } catch (e) {
      avvisa(`[context-settings] ${file} is unreadable (${e?.code ?? e?.message ?? e}): the default applies until it is saved again`);
      return { ...DI_SERIE };
    }
  };
  /* Una conversazione nuova nasce in modo SINCRONO nel registro: la prima lettura è sincrona, le scritture aggiornano la copia. */
  const caricaSincrono = () => {
    if (corrente) return corrente;
    let testo = null;
    try { testo = readFileSync(file, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') avvisa(`[context-settings] ${file} cannot be read (${e?.code}): the default applies`); }
    corrente = testo === null ? { ...DI_SERIE } : daTesto(testo);
    return corrente;
  };
  return Object.freeze({
    async leggi() {
      if (corrente) return { ...corrente };
      let testo = null;
      try { testo = await readFile(file, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') avvisa(`[context-settings] ${file} cannot be read (${e?.code}): the default applies`); }
      corrente = testo === null ? { ...DI_SERIE } : daTesto(testo);
      return { ...corrente };
    },
    async scrivi(valore) {
      const nuovo = valida(valore);
      await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_IMPOSTAZIONI_CONTESTO, ...nuovo }, null, 2)}\n`);
      corrente = nuovo;
      return { ...nuovo };
    },
    motorePerUnaConversazioneNuova: () => caricaSincrono().motore,
  });
}
