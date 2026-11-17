/*
 * «CATALOGO PUBBLICO DEI MODELLI» ACCESO O SPENTO (0.2.2, brief dell'agente «rete spegnibile», giudice v1313). Perché: i termini di SignPath
 * (signpath.org/terms) vogliono, per ogni invio di dati che parte senza una richiesta della persona, un'informativa all'installazione e
 * un'opzione per spegnerlo. Il censimento della rete (09/11/2026) ne ha trovati due; questo è il primo: `GET https://openrouter.ai/api/v1/models`
 * (`model-catalog.mjs`), che partiva all'apertura della finestra senza chiavi e senza scelte, e non si spegneva in nessun modo.
 *
 * Tre modi per spegnerlo, una regola sola (`consentito`):
 *   · l'impostazione (Impostazioni → Sicurezza e privacy, e l'attrezzo `app_settings` del modello dietro la carta, voce `models.publicCatalog`);
 *   · la variabile d'ambiente `TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off` (letta in `config.mjs`): vale come l'impostazione spenta e la tiene
 *     spenta (la riga lo dice, l'interruttore non si accende); come i requisiti dell'amministratore di Codex, che vincono sul config
 *     (`codex-rs/app-server-protocol/src/protocol/v2/config.rs:457`, `check_for_update_on_startup`), e la policy di Chrome che vince su
 *     `initial_preferences` (support.google.com/chrome/a/answer/187948, letto il 09/11/2026);
 *   · la scelta fatta all'installazione (`desktop/preferenze-iniziali.mjs` scrive questo stesso file, una volta sola).
 * Spento DALLA PERSONA vuol dire: nessuna richiesta a openrouter.ai FINCHÉ lei non sceglie un modello di OpenRouter o non gli dà una
 * chiave. Allora la richiesta è al servizio di una sua scelta, come la chat che andrà comunque a openrouter.ai. Spegnerlo di nuovo dalle
 * Impostazioni dimentica la scelta (si torna a zero richieste finché non si sceglie ancora).
 * ⛔ Spento DALLA VARIABILE vuol dire ZERO richieste sempre, anche con la chiave e un modello scelto (revisore unico 11/11/2026, R1;
 *   giudice v1550, strada A): la scelta del modello si ricorda, e torna a valere solo quando la variabile se ne va.
 * Spento, il selettore resta in piedi con ciò che ha: la copia già letta, se c'è, o il catalogo incorporato (`catalogoDiRiservaPer`).
 *
 * ⛔ IL VALORE DI SERIE L'HA DECISO L'OWNER (09/11/2026, 23:41, tramite il giudice): SPENTO finché la persona non sceglie OpenRouter o
 *   non gli dà una chiave. Sta in UN posto, `CATALOGO_PUBBLICO_DI_SERIE`, e la prova CP-07 lo inchioda.
 * Come Hermes, che salta il controllo passivo quando il config lo spegne e lascia quello chiesto dalla persona
 * (`hermes_cli/source_check.py:537`, `if passive and (config.get("updates") or {}).get("check") is False`), e come la forma dei magazzini
 * sorelle (`impostazioni-chat.mjs`, `computer-use/impostazione.mjs`): `consentito()` è sincrono, letto a ogni richiesta del catalogo.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { scriviAtomico } from './research-store.mjs';
import { separaFonteModello } from './model-destination.mjs';

export const SCHEMA_CATALOGO_PUBBLICO = 'talos.public-model-catalog-settings.v1';
export const FILE_CATALOGO_PUBBLICO = '.catalogo-pubblico.json';
export const VARIABILE_CATALOGO_PUBBLICO = 'TALOS_HARNESS_UI_CATALOGO_PUBBLICO';
/** ⛔ Il valore di serie, in un posto solo: SPENTO (owner, 09/11/2026 23:41). Una persona nuova, senza file o con un file illeggibile,
 *  non manda niente a openrouter.ai finché non sceglie un modello di OpenRouter o non gli dà una chiave. Inchiodato da CP-07. */
export const CATALOGO_PUBBLICO_DI_SERIE = false;

const errore = (messaggio, code = 'QUERY_INVALID') => Object.assign(new Error(messaggio), { code });

/** Il file salvato: `{ schema, acceso?, openrouterScelto? }`. Un campo che non c'è vuol dire «la persona non ha scelto». */
function validaFile(valore) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore)) throw errore('Public catalog settings must be an object.');
  const chiavi = Object.keys(valore).filter((k) => k !== 'schema');
  if (chiavi.some((k) => k !== 'acceso' && k !== 'openrouterScelto')) throw errore('Public catalog settings have unknown fields.');
  if (Object.hasOwn(valore, 'acceso') && typeof valore.acceso !== 'boolean') throw errore('The public model list is true or false.');
  if (Object.hasOwn(valore, 'openrouterScelto') && typeof valore.openrouterScelto !== 'boolean') throw errore('The OpenRouter choice is true or false.');
  return { ...(Object.hasOwn(valore, 'acceso') ? { acceso: valore.acceso } : {}), ...(valore.openrouterScelto === true ? { openrouterScelto: true } : {}) };
}

/** Un id di modello che va a OpenRouter: nessun prefisso di fonte conosciuta e la forma `autore/modello`. */
export function eModelloDiOpenRouter(id) {
  if (typeof id !== 'string' || id.trim() === '') return false;
  try {
    const { fonte, modelloRemoto } = separaFonteModello(id.trim());
    return fonte === 'openrouter' && /^[^/\s]+\/[^/\s]/u.test(modelloRemoto);
  } catch { return false; }
}

/**
 * @param {{ file: string, spentoDallAmbiente?: boolean, diSerie?: boolean, avvisa?: (m: string) => void }} o
 */
export function creaImpostazioneCatalogoPubblico({ file, spentoDallAmbiente = false, diSerie = CATALOGO_PUBBLICO_DI_SERIE, avvisa = (m) => console.warn(m) } = {}) {
  if (typeof file !== 'string' || !file) throw errore('The public catalog settings file is required.');
  const bloccato = spentoDallAmbiente === true;
  let salvato = null; // { acceso?, openrouterScelto? }
  const daTesto = (testo) => {
    try { return validaFile(JSON.parse(testo)); } catch (e) {
      avvisa(`[public-catalog] ${file} is unreadable (${e?.code ?? e?.message ?? e}): the default holds until it is saved again`);
      return {};
    }
  };
  const nonLetto = (e) => { if (e?.code !== 'ENOENT') avvisa(`[public-catalog] ${file} cannot be read (${e?.code}): the default holds`); return null; };
  const caricaSincrono = () => {
    if (salvato) return salvato;
    let testo = null;
    try { testo = readFileSync(file, 'utf8'); } catch (e) { testo = nonLetto(e); }
    salvato = testo === null ? {} : daTesto(testo);
    return salvato;
  };
  /* quello che la riga mostra: con la variabile spenta è spento, qualunque cosa ci sia nel file */
  const accesoAdesso = (s) => (bloccato ? false : (typeof s.acceso === 'boolean' ? s.acceso : diSerie === true));
  let fila = Promise.resolve();
  const accoda = (calcola) => {
    const turno = fila.then(async () => {
      const nuovo = calcola(caricaSincrono());
      if (!nuovo) return;
      await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_CATALOGO_PUBBLICO, ...nuovo }, null, 2)}\n`);
      salvato = nuovo;
    });
    fila = turno.catch(() => {});
    return turno;
  };

  return Object.freeze({
    /**
     * Sincrono, a OGNI richiesta del catalogo: si può chiedere a openrouter.ai adesso?
     * ⛔ Prima la variabile dell'amministratore: spenta vuol dire MAI, nemmeno con la chiave o un modello di OpenRouter scelto. Come
     *   `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, che vince anche su una sessione con le credenziali (claude-code CHANGELOG.md:1548).
     * Poi la persona: la sua chiave o un modello di OpenRouter scelto da lei aprono la lettura anche col suo interruttore spento (lo dicono
     * la riga e PRIVACY.md); altrimenti decide l'impostazione salvata o il valore di serie.
     */
    consentito({ chiaveOpenRouter = false } = {}) {
      if (bloccato) return false;
      if (chiaveOpenRouter === true) return true;
      const s = caricaSincrono();
      if (s.openrouterScelto === true) return true;
      return accesoAdesso(s);
    },
    async leggi() {
      if (!salvato) {
        let testo = null;
        try { testo = await readFile(file, 'utf8'); } catch (e) { testo = nonLetto(e); }
        salvato ??= testo === null ? {} : daTesto(testo);
      }
      return { acceso: accesoAdesso(salvato), spentoDallAmbiente: bloccato };
    },
    /** La scelta della persona (riga delle Impostazioni o carta di `app_settings`). Spegnere dimentica anche la scelta di OpenRouter. */
    async scrivi(valore) {
      if (!valore || typeof valore !== 'object' || Array.isArray(valore) || Object.keys(valore).some((k) => k !== 'acceso') || typeof valore.acceso !== 'boolean') {
        throw errore('The public model list is true or false.');
      }
      if (bloccato && valore.acceso) {
        throw errore('The public model list is turned off for this computer by its system settings; it cannot be turned on here.', 'PUBLIC_CATALOG_LOCKED');
      }
      await accoda(() => ({ acceso: valore.acceso }));
      return { acceso: accesoAdesso(salvato), spentoDallAmbiente: bloccato };
    },
    /** La persona ha scelto un modello di OpenRouter: da qui la lista si può leggere (in memoria subito, sul disco in fila). */
    segnaSceltaDelModello(id) {
      if (!eModelloDiOpenRouter(id)) return false;
      const s = caricaSincrono();
      if (s.openrouterScelto === true) return false;
      salvato = { ...s, openrouterScelto: true };
      /* in fila si riparte da ciò che c'è ALLORA: una scelta della riga arrivata prima non si perde */
      accoda((attuale) => ({ ...attuale, openrouterScelto: true })).catch((e) => avvisa(`[public-catalog] the OpenRouter choice was not saved (${e?.code ?? e?.message ?? e})`));
      return true;
    },
  });
}
