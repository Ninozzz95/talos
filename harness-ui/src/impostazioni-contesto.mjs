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
import { separaFonteModello } from './model-destination.mjs';
import { FONTE_LOCALE_OSPITE } from './accesso-locale-ospite.mjs';
import { formaDiModelloRiconosciuta } from './kernel/catena-del-riassunto.mjs';

export const SCHEMA_IMPOSTAZIONI_CONTESTO = 'talos.context-settings.v1';
export const MOTORI_CONTESTO = Object.freeze(['engine', 'legacy']);
/*
 * Contratto C6 «mai aspettare» (CLI e desktop, 27/10/2026) e bozzetto approvato dall'owner il 28/10 (card «Riassunto della conversazione»,
 *   le due scelte in «Avanzate»): il modello che scrive i riassunti e la riserva quando quello è bloccato o non risponde. Di serie NESSUNO:
 *   il modello della conversazione, nessuna riserva — mai indovinati (Hermes `agent/auxiliary_client.py:4627-4640`, contratto §C6).
 *   `null` vuol dire «di serie»; un id è quello del selettore dei modelli (`local:…`, `<fornitore>:…`, `<autore>/<modello>`).
 * R8, prima metà (revisione del Blocco 21, 01/11/2026): la stessa forma del giro (`formaDiModelloRiconosciuta`). Prima la rotta accettava ogni stringa: il giro la
 *   ignorava e la catena stampava «pronto». `conversazione` vale solo per la riserva (`riservaPerLaCatena`, qui sotto). `locale-ospite:` resta ammesso: lo usa il
 *   server del telefono con questo stesso codice, e rifiutarlo su un PC è una decisione da prendere col Mobile.
 */
export const SCELTE_DEL_RIASSUNTO = Object.freeze(['modelloDelRiassunto', 'riservaDelRiassunto']);
const MASSIMO_ID_MODELLO = 256;
const DI_SERIE = Object.freeze({ motore: 'engine', modelloDelRiassunto: null, riservaDelRiassunto: null });
const CHIAVI = new Set(['motore', ...SCELTE_DEL_RIASSUNTO]);

const errore = (messaggio) => Object.assign(new Error(messaggio), { code: 'CTX_SETTINGS_INVALID' });

/* R8, seconda metà (forma del Mobile, 01/11/2026): `locale-ospite:` è valido solo dove quella fonte esiste. Su un PC il giro cade con `LOCAL_RUNTIME_NOT_READY`, che non si
   ricorda, e la catena direbbe «pronto» per sempre. `ospitePronto` non serve: dice «nessun modello aperto adesso», e sul telefono una scelta a modello chiuso è valida. */
const dellaFonteOspite = (v) => v.trim().toLowerCase().startsWith(`${FONTE_LOCALE_OSPITE}:`);
const idModello = (k, v, fonteOspite = false) => v === null || (typeof v === 'string' && v.length <= MASSIMO_ID_MODELLO
  && (formaDiModelloRiconosciuta(v) || (k === 'riservaDelRiassunto' && v.trim() === 'conversazione'))
  && (fonteOspite || !dellaFonteOspite(v)));

/**
 * Una modifica: una o più delle tre scelte, nient'altro. Il file salvato si legge con la stessa regola (`completa`): un file di prima
 * di questa card, col solo motore, resta valido e prende le due scelte di serie.
 */
function valida(valore, fonteOspite = false) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) throw errore('Context settings must be an object.');
  const chiavi = Object.keys(valore).filter((k) => k !== 'schema');
  if (!chiavi.length || chiavi.some((k) => !CHIAVI.has(k))) throw errore('Context settings accept only the engine and the two summary choices.');
  if (Object.hasOwn(valore, 'motore') && !MOTORI_CONTESTO.includes(valore.motore)) throw errore('The context engine is "engine" or "legacy".');
  for (const k of SCELTE_DEL_RIASSUNTO) if (Object.hasOwn(valore, k) && !idModello(k, valore[k], fonteOspite)) throw errore(`${k} is a model id (provider:model or author/model, up to ${MASSIMO_ID_MODELLO} characters) or null.`);
  return Object.fromEntries(chiavi.map((k) => [k, typeof valore[k] === 'string' ? valore[k].trim() : valore[k]]));
}
const completa = (parziale) => ({ ...DI_SERIE, ...parziale });
/* Banco del 01/11/2026: qui si salva un id, e la catena, il registro e il motore leggono `{ provider, model }` o `'conversazione'`: una riserva
   salvata non la usava nessuno, e un oggetto non si può salvare. Si traduce qui, una volta, per tutte e tre le strade. */
const riservaPerLaCatena = (id) => {
  if (id === null || id === 'conversazione') return id;
  const { fonte, modelloRemoto } = separaFonteModello(id);
  return { provider: fonte, model: modelloRemoto };
};

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

export function createImpostazioniContesto({ file, avvisa = (m) => console.warn(m), fonteOspite = false } = {}) {
  if (typeof file !== 'string' || !file) throw errore('The context settings file is required.');
  let corrente = null;
  /* R7 (revisione del Blocco 21, 01/11/2026): chi legge e riscrive sta in fila. La rinomina atomica protegge il file, non l'aggiornamento: due scritture in corsa
     rispondevano 200 tutte e due e la seconda riportava indietro la scelta della prima. Una scrittura fallita non ferma quelle dopo. Come Hermes (`_CONFIG_LOCK` attorno a
     tutto `save_config`, `hermes_cli/config.py:2517`, clone del 24/09). Un processo solo: due server sullo stesso file non si vedono, come prima. */
  let fila = Promise.resolve();
  /* R8: un file salvato prima della forma. L'id che nessun giro può usare torna di serie e lo si dice, senza trascinare con sé la scelta del motore. */
  const senzaIdIllegibili = (letto) => {
    if (!letto || typeof letto !== 'object' || Array.isArray(letto)) return letto;
    const pulito = { ...letto };
    for (const k of SCELTE_DEL_RIASSUNTO) {
      if (typeof pulito[k] !== 'string' || idModello(k, pulito[k], fonteOspite)) continue;
      avvisa(`[context-settings] ${file}: ${k} is not a model id: the default applies until it is saved again`);
      pulito[k] = null;
    }
    return pulito;
  };
  const daTesto = (testo) => {
    try { return completa(valida(senzaIdIllegibili(JSON.parse(testo)), fonteOspite)); } catch (e) {
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
      /* ??= (R7): mentre il file si leggeva può essere finita una scrittura, e il testo in mano è quello di prima */
      corrente ??= testo === null ? { ...DI_SERIE } : daTesto(testo);
      return { ...corrente };
    },
    /** Una o più scelte alla volta: le altre restano com'erano (l'interruttore del motore non azzera il modello del riassunto). */
    async scrivi(valore) {
      const modifica = valida(valore, fonteOspite);
      const turno = fila.then(async () => {
        const nuovo = completa({ ...caricaSincrono(), ...modifica });
        await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_IMPOSTAZIONI_CONTESTO, ...nuovo }, null, 2)}\n`);
        corrente = nuovo;
        return { ...nuovo };
      });
      fila = turno.catch(() => {});
      return turno;
    },
    motorePerUnaConversazioneNuova: () => caricaSincrono().motore,
    /** Le due scelte del riassunto per un giro, lette in modo sincrono come il motore (il registro le chiede prima di andare in asincrono). */
    riassuntoPerUnGiro: () => { const c = caricaSincrono(); return { modelloDelRiassunto: c.modelloDelRiassunto, riservaDelRiassunto: riservaPerLaCatena(c.riservaDelRiassunto) }; },
  });
}
