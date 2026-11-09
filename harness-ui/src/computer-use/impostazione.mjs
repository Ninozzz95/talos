/*
 * «USO DEL COMPUTER» ACCESO O SPENTO, dalle Impostazioni e dal modello, senza riavviare. Viene dal giro 2 delle cure del 06/11/2026 (revisione
 * avversaria di sicurezza, difetto 5); qui con la decisione 310 dell'owner (06/11/2026): «computer use nel rilascio come "Anteprima" spento di
 * serie (acceso solo a mano) finché non sono chiusi i 2 critici e i 13 alti».
 *
 * Due porte, come «Blocchi vivi nelle risposte» (`impostazioni-chat.mjs`, da cui viene la forma del magazzino):
 * - la riga in Impostazioni → Strumenti, con l'etichetta «Anteprima» (`GET/POST /api/v1/computer-use/settings`,
 *   `frontend/src/components/computer-use-impostazione.js`);
 * - l'attrezzo `app_settings` del modello, voce `tools.computerUse` (gruppo «sicurezza»: la carta c'è SEMPRE, anche in Accesso pieno, quindi il
 *   modello non può accenderlo da solo).
 * Il valore di serie è SPENTO (`diSerie` assente = false): una persona nuova, o senza il file, o con un file illeggibile, ha il computer use
 * spento. Solo una scelta salvata col vero `true` lo accende. `acceso()` è sincrono: il registro delle sessioni lo rilegge a OGNI giro e
 * l'ospite a OGNI chiamata (`interruttore.mjs`), quindi accendere e spegnere valgono senza riavviare; un compito già partito finisce col suo
 * freno e il suo «Ferma». Come Hermes, che decide il computer use dalla configurazione letta a ogni avvio dell'attrezzo
 * (`plugins/computer_use/__init__.py:90-95`) e accende o spegne i gruppi di attrezzi da un menu (`hermes_cli/tools_config.py:434-454`).
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { scriviAtomico } from '../research-store.mjs';

export const SCHEMA_IMPOSTAZIONE_COMPUTER_USE = 'talos.computer-use-settings.v1';

const errore = (messaggio) => Object.assign(new Error(messaggio), { code: 'QUERY_INVALID' });

function valida(valore) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) throw errore('Computer use settings must be an object.');
  const chiavi = Object.keys(valore).filter((k) => k !== 'schema');
  if (chiavi.length !== 1 || chiavi[0] !== 'acceso' || typeof valore.acceso !== 'boolean') throw errore('Computer use is true or false.');
  return { acceso: valore.acceso };
}

/** @param {{ file: string, diSerie?: boolean, avvisa?: (m: string) => void }} o */
export function creaImpostazioneComputerUse({ file, diSerie = false, avvisa = (m) => console.warn(m) } = {}) {
  if (typeof file !== 'string' || !file) throw errore('The computer use settings file is required.');
  const DI_SERIE = Object.freeze({ acceso: diSerie === true });
  let corrente = null;
  /* un file illeggibile non decide per la persona: vale il valore di serie del PC, e lo si dice */
  const daTesto = (testo) => {
    try { return valida(JSON.parse(testo)); } catch (e) {
      avvisa(`[computer-use-settings] ${file} is unreadable (${e?.code ?? e?.message ?? e}): the PC default holds until it is saved again`);
      return { ...DI_SERIE };
    }
  };
  const nonLetto = (e) => { if (e?.code !== 'ENOENT') avvisa(`[computer-use-settings] ${file} cannot be read (${e?.code}): the PC default holds`); return null; };
  const caricaSincrono = () => {
    if (corrente) return corrente;
    let testo = null;
    try { testo = readFileSync(file, 'utf8'); } catch (e) { testo = nonLetto(e); }
    corrente = testo === null ? { ...DI_SERIE } : daTesto(testo);
    return corrente;
  };
  let fila = Promise.resolve();
  return Object.freeze({
    /** Sincrono, a ogni chiamata dell'attrezzo: solo il vero `true` accende. */
    acceso: () => caricaSincrono().acceso === true,
    async leggi() {
      if (corrente) return { ...corrente };
      let testo = null;
      try { testo = await readFile(file, 'utf8'); } catch (e) { testo = nonLetto(e); }
      corrente ??= testo === null ? { ...DI_SERIE } : daTesto(testo);
      return { ...corrente };
    },
    scrivi(valore) {
      let nuovo;
      try { nuovo = valida(valore); } catch (e) { return Promise.reject(e); }
      const turno = fila.then(async () => {
        await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_IMPOSTAZIONE_COMPUTER_USE, ...nuovo }, null, 2)}\n`);
        corrente = nuovo;
        return { ...nuovo };
      });
      fila = turno.catch(() => {});
      return turno;
    },
  });
}
