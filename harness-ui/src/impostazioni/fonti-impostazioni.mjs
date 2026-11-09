/*
 * ⭐ Fase 8 «Impostazioni dalla chat» — LE FONTI: chi legge e scrive ogni impostazione del catalogo. Il catalogo «chiama le rotte, non
 *   le duplica» (forma §3.2): ogni fonte qui avvolge lo STESSO magazzino che la sua rotta usa già (stesse convalide, stesse code di
 *   scrittura), così una voce cambiata dal modello e una cambiata dalla persona passano dalla stessa porta.
 *
 * Contratto di una fonte: `leggi(contesto) → oggetto coi campi` e `scrivi(patchInterna, contesto)`; `contesto` = `{ sessionId, origine }`.
 *   Un rifiuto è un errore con `code` e un messaggio in inglese per il modello.
 */
import { modelloRichiestaValido, reasoningRichiestaValido } from '../config.mjs';
import { VALORI_INTERNI } from './servizio-impostazioni.mjs';

const rifiuto = (code, messaggio) => Object.assign(new Error(messaggio), { code });
/** Un rifiuto del registro (`{ erroreAvvio, code }`) diventa un errore con codice. */
const dalRegistro = (esito) => {
  if (esito && typeof esito === 'object' && 'erroreAvvio' in esito) throw rifiuto(esito.code ?? 'SETTING_REFUSED', String(esito.erroreAvvio ?? 'the conversation refused the change'));
  return esito;
};

/**
 * La conversazione: le impostazioni della sessione (`aggiornaImpostazioni`, con l'origine nel suo evento `talos.impostazioni-sessione`)
 * e le due scelte sui comandi. `registroFn` è pigro: il registro nasce dopo il servizio delle impostazioni.
 */
export function creaFonteSessione(registroFn) {
  const registro = () => {
    const r = typeof registroFn === 'function' ? registroFn() : null;
    if (!r || typeof r.impostazioniCorrenti !== 'function') throw rifiuto('SETTINGS_UNAVAILABLE', 'conversation settings are not available on this server.');
    return r;
  };
  const istantanea = (sessionId) => {
    const s = typeof sessionId === 'string' ? registro().impostazioniCorrenti(sessionId) : null;
    if (!s) throw rifiuto('SESSION_NOT_FOUND', 'this conversation is not available.');
    return s;
  };
  return Object.freeze({
    async leggi({ sessionId } = {}) {
      const s = istantanea(sessionId);
      return {
        modello: s.modello ?? null, modelloPlanner: s.modelloPlanner ?? null, sforzo: s.reasoning?.effort ?? null, fasciaVeloce: s.fasciaVeloce === true,
        permessi: s.permessi ?? 'Workspace write', coordinazione: s.permessiPerAttrezzo?.delega_sottotask === 'sempre',
        dove: s.doveGiranoIComandi ?? null, comandiNellaConversazione: s.comandiNellaConversazione === true,
        /* REV8-03 (revisione della fase 8): il valore INTERNO dietro una voce pubblica che lo perde (Coordinazione: `false` è sia
           «chiedi» sia «nega»). Il servizio lo tiene nella ricevuta e l'Annulla lo rimette (`scrivi`, `interni`). */
        [VALORI_INTERNI]: { coordinazione: s.permessiPerAttrezzo?.delega_sottotask ?? null },
      };
    },
    /* cura 2 (01/11 sera): chi ha confermato va nell'evento della sessione accanto all'origine (solo se il servizio lo passa) */
    async scrivi(patch, { sessionId, origine = null, confermatoDa, interni = null } = {}) {
      const r = registro();
      const chi = confermatoDa === undefined ? { origine } : { origine, confermatoDa };
      const s = istantanea(sessionId);
      const p = {};
      if (Object.hasOwn(patch, 'modello')) {
        if (!modelloRichiestaValido(patch.modello)) throw rifiuto('MODEL_ID_INVALID', `"${patch.modello}" is not a model id TALOS can use (like z-ai/glm-5.3-flash).`);
        p.modello = patch.modello;
      }
      if (Object.hasOwn(patch, 'modelloPlanner')) {
        if (patch.modelloPlanner !== null && !modelloRichiestaValido(patch.modelloPlanner)) throw rifiuto('MODEL_ID_INVALID', `"${patch.modelloPlanner}" is not a model id TALOS can use.`);
        p.modelloPlanner = patch.modelloPlanner;
      }
      if (Object.hasOwn(patch, 'sforzo')) {
        /* REV8-03: «default» toglie solo lo sforzo; gli altri campi di `reasoning` (oggi `summary`) restano */
        const { effort: _effort, ...resto } = s.reasoning && typeof s.reasoning === 'object' ? s.reasoning : {};
        const reasoning = patch.sforzo === null ? (Object.keys(resto).length ? resto : null) : { ...resto, effort: patch.sforzo };
        if (!reasoningRichiestaValido(reasoning)) throw rifiuto('REASONING_INVALID', 'that reasoning effort is not allowed.');
        p.reasoning = reasoning;
      }
      if (Object.hasOwn(patch, 'fasciaVeloce')) p.fasciaVeloce = patch.fasciaVeloce === true;
      if (Object.hasOwn(patch, 'permessi')) p.permessi = patch.permessi;
      /* C2b: Coordinazione = la scelta per `delega_sottotask` (`coordinazione.mjs`): accesa «sempre», spenta «chiedi» (la carta d'avvio) */
      /* REV8-03: l'Annulla porta il valore interno di prima; vale solo se è coerente col valore pubblico (spenta = «chiedi» o «nega»),
         così un Annulla non allarga mai un permesso. Un set del modello (senza `interni`) resta com'era: spenta = «chiedi». */
      if (Object.hasOwn(patch, 'coordinazione')) {
        const prima = interni?.coordinazione;
        const spenta = prima === 'nega' || prima === 'chiedi' ? prima : 'chiedi';
        p.unisciPermessiPerAttrezzo = { delega_sottotask: patch.coordinazione === true ? 'sempre' : spenta };
      }
      if (Object.keys(p).length) dalRegistro(await r.aggiornaImpostazioni(sessionId, p, chi));
      if (Object.hasOwn(patch, 'dove')) dalRegistro(await r.doveGiranoIComandi(sessionId, patch.dove, chi));
      if (Object.hasOwn(patch, 'comandiNellaConversazione')) dalRegistro(await r.comandiNellaConversazione(sessionId, patch.comandiNellaConversazione === true, chi));
    },
    /* cura 5 (owner 01/11 sera): l'avviso di un cambio fatto senza carta con una ragione sospetta, nell'evento della conversazione */
    async avvisa(sessionId, { origine = null, confermatoDa = null, avvisi = [], ricevuta = null, frase = null } = {}) {
      const r = registro();
      if (!sessionId || typeof r?.avvisaImpostazioni !== 'function') return;
      dalRegistro(await r.avvisaImpostazioni(sessionId, { origine, confermatoDa, avvisi, ricevuta, frase }));
    },
  });
}

/** La fiducia della cartella di questa conversazione: `{ fidata: true | false | null }`. */
export function creaFonteFiducia(fiduciaCartelle, registroFn) {
  const cartellaDi = (sessionId) => {
    const r = typeof registroFn === 'function' ? registroFn() : null;
    if (!r || typeof r.cartellaPerLaFiducia !== 'function') throw rifiuto('SETTINGS_UNAVAILABLE', 'folder trust is not available on this server.');
    const esito = typeof sessionId === 'string' ? r.cartellaPerLaFiducia({ sessionId }) : null;
    if (!esito?.ok) throw rifiuto(esito?.code ?? 'SESSION_NOT_FOUND', 'this conversation is not available.');
    return { r, cartella: esito.cartella };
  };
  return Object.freeze({
    async leggi({ sessionId } = {}) { return { fidata: fiduciaCartelle.stato(cartellaDi(sessionId).cartella) }; },
    async scrivi(patch, { sessionId } = {}) {
      if (!Object.hasOwn(patch, 'fidata')) return;
      if (![true, false, null].includes(patch.fidata)) throw rifiuto('QUERY_INVALID', 'folder trust is trusted or notTrusted.');
      const { r, cartella } = cartellaDi(sessionId);
      await fiduciaCartelle.imposta(cartella, patch.fidata);
      r.riapplicaFiducia?.();
    },
  });
}

/**
 * Le fonti del server del PC, dai magazzini che `server.mjs` crea già (gli stessi passati a `createHttpApp`). Una fonte assente (un
 * magazzino che quell'ospite non ha) non c'è: le sue voci non si offrono.
 */
export function creaFontiDelServer({ impostazioniContesto = null, impostazioniComandi = null, finestraPienaFn = null, preferenzeWslStore = null,
  searchSourceStore = null, registroFn = null, impostazioniChat = null, fiduciaCartelle = null, impostazioneComputerUse = null } = {}) {
  const fonti = {};
  if (impostazioniContesto) {
    fonti.contesto = {
      leggi: async () => { const s = await impostazioniContesto.leggi(); return { motore: s.motore, modelloDelRiassunto: s.modelloDelRiassunto ?? null, riservaDelRiassunto: s.riservaDelRiassunto ?? null }; },
      scrivi: async (patch) => {
        try { await impostazioniContesto.scrivi(patch); }
        catch (e) { throw rifiuto(e?.code ?? 'SETTING_REFUSED', e?.message ?? 'the context settings were not saved.'); }
      },
    };
  }
  if (impostazioniComandi) {
    fonti.comandi = { leggi: () => impostazioniComandi.leggi(), scrivi: (patch) => impostazioniComandi.scrivi(patch) };
  }
  /* decisione 140: «Blocchi vivi nelle risposte» (`impostazioni-chat.mjs`), voce `chat.liveBlocks` */
  if (impostazioniChat) {
    fonti.chat = { leggi: () => impostazioniChat.leggi(), scrivi: (patch) => impostazioniChat.scrivi(patch) };
  }
  /* decisione 310 (06/11/2026): «Uso del computer (Anteprima)», spento di serie (`computer-use/impostazione.mjs`), voce `tools.computerUse` */
  if (impostazioneComputerUse) {
    fonti.computerUse = { leggi: () => impostazioneComputerUse.leggi(), scrivi: (patch) => impostazioneComputerUse.scrivi(patch) };
  }
  if (typeof finestraPienaFn === 'function') {
    fonti.finestraLocale = {
      leggi: async () => ({ scelta: await finestraPienaFn().scelta() }),
      scrivi: async ({ scelta }) => { await finestraPienaFn().salvaScelta(scelta); },
    };
  }
  if (preferenzeWslStore) {
    fonti.wsl = { leggi: async () => preferenzeWslStore.leggi(), scrivi: async (patch) => { preferenzeWslStore.imposta(patch); } };
  }
  if (searchSourceStore) {
    fonti.ricerca = {
      leggi: async () => ({ source: searchSourceStore.fonte() }),
      /* S7 (forma §2.1): solo fra le fonti GIÀ pronte. Chiave e indirizzo li mette la persona: una fonte senza si rifiuta, mai salvata a metà */
      scrivi: async ({ source }) => {
        if (source !== 'off') {
          const pubblico = searchSourceStore.listPublic();
          const d = (pubblico.fonti ?? []).find((f) => f.id === source);
          if (!d) throw rifiuto('SEARCH_SOURCE_INVALID', `unknown web search source ${source}.`);
          if (d.needsKey && !d.keyConfigured) throw rifiuto('SEARCH_KEY_REQUIRED', `${source} needs its key, which only the person can add in Settings.`);
          if (d.needsEndpoint && !(pubblico.source === source && pubblico.endpoint)) throw rifiuto('SEARCH_ENDPOINT_REQUIRED', `${source} needs its address, which only the person can set in Settings.`);
        }
        searchSourceStore.setSource({ source });
      },
    };
  }
  if (typeof registroFn === 'function') fonti.sessione = creaFonteSessione(registroFn);
  /* Decisioni 173, 189 e 196 (forma permessi 2 §5): `conversation.folderTrust`, la stessa porta della rotta `/api/v1/folder-trust`:
     la cartella della conversazione (`cartellaPerLaFiducia`), l'archivio della fiducia, poi `riapplicaFiducia` alle conversazioni vive. */
  if (fiduciaCartelle && typeof registroFn === 'function') fonti.fiducia = creaFonteFiducia(fiduciaCartelle, registroFn);
  return fonti;
}
