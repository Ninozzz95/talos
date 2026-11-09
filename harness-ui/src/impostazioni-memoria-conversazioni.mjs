/*
 * 01/11/2026 — «Memoria delle conversazioni» (owner: «8 GB come Jan, cambiabile», 0 la spegne). Sul SERVER, come «Tieni sveglio il PC»
 * (`impostazioni-pc-sveglio.mjs`): la usa l'archivio delle foto del motore (`archivio-foto.mjs`). Forma `FORMA-FOTO-E-RIORDINO-2026-11-01.md`.
 * Il massimo lo dà il server, mai l'interfaccia (Frontend): il disco libero meno la soglia dei 20 GB (Performance), al più 64 GB.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { scriviAtomico } from './research-store.mjs';

export const SCHEMA_MEMORIA_CONVERSAZIONI = 'talos.conversation-memory-settings.v1';
export const GB_DI_SERIE = 8;
export const GB_MASSIMI = 64;
const GB = 1024 ** 3;
const errore = (messaggio) => Object.assign(new Error(messaggio), { code: 'CONVERSATION_MEMORY_SETTINGS_INVALID' });

export function massimoGb(discoLibero, soglia = 20 * GB) {
  if (!Number.isFinite(discoLibero)) return GB_MASSIMI;
  return Math.max(0, Math.min(GB_MASSIMI, Math.floor((discoLibero - soglia) / GB)));
}

export function validaMemoria(valore, massimo = GB_MASSIMI) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) throw errore('Conversation memory settings must be an object.');
  const chiavi = Object.keys(valore).filter((k) => k !== 'schema');
  if (chiavi.length !== 1 || chiavi[0] !== 'gb' || !Number.isSafeInteger(valore.gb) || valore.gb < 0 || valore.gb > massimo) throw errore(`Conversation memory is a whole number of GB from 0 to ${massimo}.`);
  return { gb: valore.gb };
}

export function createImpostazioniMemoriaConversazioni({ file, discoLibero = () => Infinity, avvisa = (m) => console.warn(m) } = {}) {
  if (typeof file !== 'string' || !file) throw errore('The conversation memory settings file is required.');
  let corrente = null;
  const daTesto = (testo) => {
    try { return validaMemoria(JSON.parse(testo)); } catch (e) {
      avvisa(`[conversation-memory] ${file} is unreadable (${e?.code ?? e?.message ?? e}): the default applies until it is saved again`);
      return { gb: GB_DI_SERIE };
    }
  };
  const massimo = () => { let d = Infinity; try { d = discoLibero(); } catch { d = Infinity; } return massimoGb(d); };
  return Object.freeze({
    async leggi() {
      if (!corrente) {
        let testo = null;
        try { testo = await readFile(file, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') avvisa(`[conversation-memory] ${file} cannot be read (${e?.code}): the default applies`); }
        corrente = testo === null ? { gb: GB_DI_SERIE } : daTesto(testo);
      }
      return { ...corrente, massimo: massimo() };
    },
    async scrivi(valore) {
      const nuovo = validaMemoria(valore, Math.max(massimo(), corrente?.gb ?? 0));
      await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_MEMORIA_CONVERSAZIONI, ...nuovo }, null, 2)}\n`);
      corrente = nuovo;
      return { ...nuovo, massimo: massimo() };
    },
    /** for the snapshot archive: bytes of the conversations cap now */
    tettoAdesso() {
      if (!corrente) { try { corrente = daTesto(readFileSync(file, 'utf8')); } catch { corrente = { gb: GB_DI_SERIE }; } }
      return corrente.gb * GB;
    },
  });
}
