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
import { dirname, join } from 'node:path';
import { scriviAtomico } from './research-store.mjs';
import { separaFonteModello } from './model-destination.mjs';
import { FONTE_LOCALE_OSPITE } from './accesso-locale-ospite.mjs';
import { formaDiModelloRiconosciuta } from './kernel/catena-del-riassunto.mjs';
import { controllaFinestraScritta, idSenzaOpenRouter, FINESTRA_SCRITTA_MINIMA, FINESTRA_SCRITTA_MASSIMA } from './finestra-di-ripiego.mjs';

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
/*
 * 11/11/2026 (owner 13:50, v1465, punto 5, «Sì, come Hermes»): la MEMORIA DEI MODELLI scritta dalla persona, `{ <id del modello>: token }`.
 *   Quando la finestra di un modello non si legge TALOS usa una misura prudente (`finestra-di-ripiego.mjs`); qui la persona scrive quella
 *   giusta, e vince su rotta, catalogo e ripiego. Una modifica porta solo i modelli che cambiano (`null` ne toglie uno), gli altri restano.
 *   L'id si salva senza `openrouter:` (lo stesso modello del selettore). Tetto di voci: nessuno ne scrive centinaia, e il file resta piccolo.
 * Giro dopo i revisori (punto 1, MEDIO 1 di A): le memorie stanno nel LORO file, `finestre-dei-modelli.json` accanto a questo. Nel file
 *   delle impostazioni una chiave in più faceva buttare il file intero alla versione di PRIMA (`valida` di `bb7d53e6a` rifiuta ogni chiave
 *   che non conosce): tornando indietro la persona perdeva il motore e il modello del riassunto. E una sola voce storta, scritta a mano,
 *   faceva lo stesso anche qui: ora si scarta SOLO quella voce, con un avviso, come la R8 fa per gli id del riassunto.
 *   I modelli dei motori locali (`local:`, `locale-ospite:`) hanno la finestra VERA del loro motore (`server.mjs`, `finestraDelMotoreLocale`):
 *   una memoria scritta per loro non la userebbe nessuno, e si rifiuta dicendolo.
 */
export const SCHEMA_FINESTRE_DEI_MODELLI = 'talos.model-windows.v1';
export const NOME_FILE_FINESTRE_DEI_MODELLI = 'finestre-dei-modelli.json';
const DEL_MOTORE_LOCALE = /^(?:local|locale-ospite):/iu;
export const CHIAVE_FINESTRE_DEI_MODELLI = 'finestreDeiModelli';
const VOCI_MASSIME_FINESTRE = 200;
const DI_SERIE = Object.freeze({ motore: 'engine', modelloDelRiassunto: null, riservaDelRiassunto: null, finestreDeiModelli: Object.freeze({}) });
const CHIAVI = new Set(['motore', ...SCELTE_DEL_RIASSUNTO, CHIAVE_FINESTRE_DEI_MODELLI]);

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
/** Una voce della memoria dei modelli: `{ ok:true, id, valore }` (l'id senza `openrouter:`) o `{ ok:false, motivo, limiti }`. */
function controllaVoceFinestra(id, token) {
  if (typeof id !== 'string' || id.length > MASSIMO_ID_MODELLO || !formaDiModelloRiconosciuta(id) || /\s/u.test(id.trim())) return { ok: false, motivo: `"${String(id).slice(0, 80)}" is not a model id (provider:model or author/model).` };
  if (DEL_MOTORE_LOCALE.test(id.trim())) return { ok: false, motivo: `"${id.trim().slice(0, 80)}" is a local model: TALOS uses the memory its engine opens with, never a written one.` };
  const controllo = controllaFinestraScritta(token);
  if (!controllo.ok) return { ok: false, motivo: controllo.motivo, limiti: true };
  return { ok: true, id: idSenzaOpenRouter(id.trim()), valore: controllo.valore };
}
const AVVISI = Symbol('avvisi');
/**
 * La memoria dei modelli in una SCRITTURA: un oggetto `{ id: token | null }`, tutto o niente. Due id dello stesso modello
 * (`openrouter:a/b` e `a/b`) non si scartano in silenzio: vince l'ultimo e lo si dice (`avvisi`, nella risposta).
 */
function validaFinestre(valore) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) throw errore(`${CHIAVE_FINESTRE_DEI_MODELLI} is an object: { "<model id>": tokens or null }.`);
  const voci = Object.entries(valore);
  if (voci.length > VOCI_MASSIME_FINESTRE) throw errore(`${CHIAVE_FINESTRE_DEI_MODELLI} holds at most ${VOCI_MASSIME_FINESTRE} models.`);
  const finestre = {}; const scritteCome = {}; const avvisi = [];
  for (const [id, token] of voci) {
    const voce = controllaVoceFinestra(id, token);
    if (!voce.ok) throw Object.assign(errore(voce.motivo), voce.limiti ? { params: { minimum: FINESTRA_SCRITTA_MINIMA, maximum: FINESTRA_SCRITTA_MASSIMA } } : {});
    if (Object.hasOwn(finestre, voce.id)) {
      avvisi.push(`"${scritteCome[voce.id]}" and "${id}" are the same model (${voce.id}): the last one wins, ${voce.valore === null ? 'automatic' : `${voce.valore.toLocaleString('en-US')} tokens`}.`);
    }
    finestre[voce.id] = voce.valore; scritteCome[voce.id] = id;
  }
  return Object.defineProperty(finestre, AVVISI, { value: avvisi, enumerable: false });
}
function valida(valore, fonteOspite = false) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) throw errore('Context settings must be an object.');
  const chiavi = Object.keys(valore).filter((k) => k !== 'schema');
  if (!chiavi.length || chiavi.some((k) => !CHIAVI.has(k))) throw errore('Context settings accept only the engine, the two summary choices and the memory of the models.');
  if (Object.hasOwn(valore, 'motore') && !MOTORI_CONTESTO.includes(valore.motore)) throw errore('The context engine is "engine" or "legacy".');
  for (const k of SCELTE_DEL_RIASSUNTO) if (Object.hasOwn(valore, k) && !idModello(k, valore[k], fonteOspite)) throw errore(`${k} is a model id (provider:model or author/model, up to ${MASSIMO_ID_MODELLO} characters) or null.`);
  return Object.fromEntries(chiavi.map((k) => [k, k === CHIAVE_FINESTRE_DEI_MODELLI ? validaFinestre(valore[k]) : typeof valore[k] === 'string' ? valore[k].trim() : valore[k]]));
}
/* Le memorie si UNISCONO a quelle salvate (una modifica porta solo i modelli che cambiano); un `null` toglie quel modello */
const unisciFinestre = (prima, modifica) => Object.fromEntries(Object.entries({ ...(prima ?? {}), ...(modifica ?? {}) }).filter(([, token]) => token !== null));
const completa = (parziale) => ({ ...DI_SERIE, ...parziale, finestreDeiModelli: unisciFinestre({}, parziale?.finestreDeiModelli) });
/* Fuori (risposta della rotta e file sul disco) la memoria dei modelli c'è SOLO quando la persona ne ha scritta una: chi non la usa vede
   le tre scelte di prima, byte per byte (il contratto di `GET /api/v1/context-settings` e il file non cambiano per nessun altro). */
const perFuori = (c) => {
  if (Object.keys(c.finestreDeiModelli ?? {}).length) return { ...c, finestreDeiModelli: { ...c.finestreDeiModelli } };
  const { finestreDeiModelli: _vuota, ...resto } = c;
  return resto;
};
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
  const fileFinestre = join(dirname(file), NOME_FILE_FINESTRE_DEI_MODELLI);
  /* Giro dopo i revisori (punto 1): una memoria scritta a mano fuori forma si scarta DA SOLA, con l'avviso; le altre restano */
  const finestreLeggibili = (grezze, da) => {
    if (grezze === undefined || grezze === null) return {};
    if (typeof grezze !== 'object' || Array.isArray(grezze)) { avvisa(`[context-settings] ${da}: ${CHIAVE_FINESTRE_DEI_MODELLI} is not an object: no written memory applies`); return {}; }
    const buone = {};
    for (const [id, token] of Object.entries(grezze).slice(0, VOCI_MASSIME_FINESTRE)) {
      const voce = token === null ? { ok: false, motivo: 'null is not a memory' } : controllaVoceFinestra(id, token);
      if (voce.ok) buone[voce.id] = voce.valore;
      else avvisa(`[context-settings] ${da}: the memory written for "${String(id).slice(0, 80)}" is ignored (${voce.motivo})`);
    }
    return buone;
  };
  const caricaFinestre = () => {
    let testo = null;
    try { testo = readFileSync(fileFinestre, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') avvisa(`[context-settings] ${fileFinestre} cannot be read (${e?.code}): no written memory applies`); }
    if (testo === null) return null;
    try { return finestreLeggibili(JSON.parse(testo)?.[CHIAVE_FINESTRE_DEI_MODELLI], fileFinestre); } catch (e) {
      avvisa(`[context-settings] ${fileFinestre} is unreadable (${e?.message ?? e}): no written memory applies until it is saved again`);
      return {};
    }
  };
  const daTesto = (testo) => {
    try {
      const letto = JSON.parse(testo);
      /* una memoria nel file delle impostazioni (forma provvisoria di questo ramo, mai rilasciata) non fa buttare il resto: si legge a parte */
      const oggetto = letto && typeof letto === 'object' && !Array.isArray(letto);
      const { [CHIAVE_FINESTRE_DEI_MODELLI]: nelFile = undefined, ...resto } = oggetto ? letto : {};
      const base = completa(valida(senzaIdIllegibili(oggetto ? resto : letto), fonteOspite));
      return { ...base, finestreDeiModelli: finestreLeggibili(nelFile, file) };
    } catch (e) {
      avvisa(`[context-settings] ${file} is unreadable (${e?.code ?? e?.message ?? e}): the default applies until it is saved again`);
      return { ...DI_SERIE };
    }
  };
  /* Una conversazione nuova nasce in modo SINCRONO nel registro: la prima lettura è sincrona, le scritture aggiornano la copia. */
  const conLeFinestre = (impostazioni) => { const dalFile = caricaFinestre(); return dalFile === null ? impostazioni : { ...impostazioni, finestreDeiModelli: dalFile }; };
  const caricaSincrono = () => {
    if (corrente) return corrente;
    let testo = null;
    try { testo = readFileSync(file, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') avvisa(`[context-settings] ${file} cannot be read (${e?.code}): the default applies`); }
    corrente = conLeFinestre(testo === null ? { ...DI_SERIE } : daTesto(testo));
    return corrente;
  };
  return Object.freeze({
    async leggi() {
      if (corrente) return perFuori(corrente);
      let testo = null;
      try { testo = await readFile(file, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') avvisa(`[context-settings] ${file} cannot be read (${e?.code}): the default applies`); }
      /* ??= (R7): mentre il file si leggeva può essere finita una scrittura, e il testo in mano è quello di prima */
      corrente ??= conLeFinestre(testo === null ? { ...DI_SERIE } : daTesto(testo));
      return perFuori(corrente);
    },
    /** Una o più scelte alla volta: le altre restano com'erano (l'interruttore del motore non azzera il modello del riassunto). */
    async scrivi(valore) {
      const modifica = valida(valore, fonteOspite);
      const turno = fila.then(async () => {
        const prima = caricaSincrono();
        const nuovo = completa({ ...prima, ...modifica, finestreDeiModelli: unisciFinestre(prima.finestreDeiModelli, modifica.finestreDeiModelli) });
        /* due file (punto 1): le memorie nel loro, e il file delle impostazioni con le sole chiavi che ogni versione sa leggere */
        if (Object.hasOwn(modifica, CHIAVE_FINESTRE_DEI_MODELLI)) {
          await scriviAtomico(fileFinestre, `${JSON.stringify({ schema: SCHEMA_FINESTRE_DEI_MODELLI, finestreDeiModelli: nuovo.finestreDeiModelli }, null, 2)}\n`);
        }
        const { finestreDeiModelli: _aParte, ...perIlFile } = nuovo;
        await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_IMPOSTAZIONI_CONTESTO, ...perIlFile }, null, 2)}\n`);
        corrente = nuovo;
        const avvisi = modifica.finestreDeiModelli?.[AVVISI] ?? [];
        return { ...perFuori(nuovo), ...(avvisi.length ? { avvisi: [...avvisi] } : {}) };
      });
      fila = turno.catch(() => {});
      return turno;
    },
    motorePerUnaConversazioneNuova: () => caricaSincrono().motore,
    /** Le due scelte del riassunto per un giro, lette in modo sincrono come il motore (il registro le chiede prima di andare in asincrono). */
    riassuntoPerUnGiro: () => { const c = caricaSincrono(); return { modelloDelRiassunto: c.modelloDelRiassunto, riservaDelRiassunto: riservaPerLaCatena(c.riservaDelRiassunto) }; },
    /** La memoria scritta dalla persona per questo modello, sincrona (la chiede la scelta della finestra a ogni giro); `null` = nessuna. */
    finestraScrittaPer: (modello) => {
      if (typeof modello !== 'string' || !modello) return null;
      const token = caricaSincrono().finestreDeiModelli?.[idSenzaOpenRouter(modello.trim())];
      return Number.isSafeInteger(token) ? token : null;
    },
  });
}
