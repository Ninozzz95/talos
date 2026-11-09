/*
 * 01/11/2026 — «Memoria delle conversazioni», il collegamento al motore (forma `FORMA-FOTO-E-RIORDINO-2026-11-01.md`, punti 3, 4 e 5).
 * A fine giro, a riposo, la scheda della conversazione si salva su disco (`POST /slots/0?action=save`); quando la persona torna su quella
 * conversazione la si rimette prima di mandare il messaggio (`action=restore`), solo sulla stessa identità (`archivio-foto.mjs`).
 *
 * Fatto come Jan (`tauri-plugin-llamacpp/src/engine/slots.rs`, letto il 01/11):
 *  - il nome del file è un'impronta esadecimale di modello e conversazione (`state_key`, :220-226): llama.cpp accetta solo nomi semplici;
 *  - chi sta sulla scheda (`SlotOccupancy`, :443-473): il secondo giro della STESSA conversazione non rimette niente, perché la scheda viva
 *    è più nuova del disco (rimetterla perderebbe l'ultimo giro); un processo nuovo ha la scheda vuota;
 *  - un file senza identità o con un'identità diversa si butta, mai «quasi uguale» (:305-326); un file che manca è un caso normale (Mobile 4);
 *  - con il tetto a 0 si smette di scrivere e si libera il disco già occupato (:261-277, :698-713).
 * In più (Performance, note 1 e 3): il salvataggio e la rimessa passano in fila (un messaggio che arriva durante un salvataggio aspetta che
 * finisca, e si misura); nessuna riscrittura se la conversazione non è cresciuta; niente sotto i 20 GB liberi; scrittura su un nome
 * temporaneo e poi rinomina, così uno spegnimento a metà lascia al più un file temporaneo, che all'avvio si butta.
 */
import { createHash } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { creaArchivioFoto, DISCO_MINIMO, MINIMO_TOKEN, stessaIdentita } from './archivio-foto.mjs';
import { scriviAtomico } from './research-store.mjs';

export const SCHEMA_INDICE_FOTO = 'talos.engine-snapshots.v1';
const FILE_INDICE = 'indice.json';
const FILE_PROPRIETARIO = 'proprietario.json';
/** a process that answers signal 0 is alive (EPERM: alive, not ours to signal) */
function processoVivo(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; } }
const TEMPORANEO = /^t[0-9a-f]{32}\.bin$/u;
const DEFINITIVO = /^[0-9a-f]{32}\.bin$/u;

/** The file stem for one (model, conversation) pair: hex, so llama.cpp's filename check accepts it (Jan `state_key`). */
export function nomeDellaFoto(modello, sessione) {
  return createHash('sha256').update(String(modello)).update('\0').update(String(sessione)).digest('hex').slice(0, 32);
}

/**
 * @param {object} o
 * @param {string} o.cartella  the same folder llama-server got as `--slot-save-path`
 * @param {{ stato(): { state, fotoAttive, processo, modelId }, slot(azione: 'save'|'restore', filename: string): Promise<object> }} o.motore
 * @param {(modelId: string) => Promise<object|null>|object|null} o.identita  `identitaFoto(...)` of the open model, null = unknown (no snapshot)
 * @param {() => number} o.tettoConversazioni  bytes, 0 = off («Memoria delle conversazioni»)
 * @param {() => number} o.discoLibero  bytes free on the disk of `cartella`
 */
export async function creaFotoConversazioni({ cartella, motore, identita, tettoConversazioni = () => 8 * 1024 ** 3, discoLibero = () => Infinity,
  adesso = () => Date.now(), avvisa = (m) => console.warn(m), tettoAttesaMs = 1_000, pid = process.pid, vivo = processoVivo } = {}) {
  if (typeof cartella !== 'string' || !cartella) throw new TypeError('creaFotoConversazioni: cartella is required');
  const percorso = (file) => join(cartella, file);
  /*
   * Revisione avversaria del 1/11, nota 4: l'app installata e il server di prova possono condividere la cartella dei dati (`server.mjs`,
   * «one file per server process»). Due proprietari si cancellerebbero a vicenda le foto (l'indice dell'uno non conosce i file dell'altro).
   * ⇒ UN proprietario alla volta (`proprietario.json`, scritto in esclusiva): l'altro processo lavora senza foto e non tocca niente. Un
   * proprietario morto si sostituisce.
   */
  try { await mkdir(cartella, { recursive: true }); } catch { /* the writes below say it */ }
  const fileProprietario = percorso(FILE_PROPRIETARIO);
  const prendi = async () => { await writeFile(fileProprietario, JSON.stringify({ pid }), { flag: 'wx' }); return true; };
  let proprietario = false;
  try { proprietario = await prendi(); } catch (e) {
    if (e?.code === 'EEXIST') {
      let altro = null;
      try { altro = JSON.parse(await readFile(fileProprietario, 'utf8'))?.pid ?? null; } catch { altro = null; }
      if (altro === pid || !Number.isSafeInteger(altro) || !vivo(altro)) {
        try { await writeFile(fileProprietario, JSON.stringify({ pid })); proprietario = true; } catch { proprietario = false; }
      }
    }
  }
  if (!proprietario) {
    avvisa(`[snapshots] ${cartella} belongs to another TALOS process: this one runs without conversation memory`);
    const altro = { esito: 'altro-processo' };
    return Object.freeze({ primaDelGiro: async () => altro, dopoIlGiro: async () => altro, dimentica: async () => 0, occupato: () => ({ conversazioni: 0, totale: 0 }), proprietario: false });
  }
  process.once('exit', () => { try { if (JSON.parse(readFileSync(fileProprietario, 'utf8'))?.pid === pid) unlinkSync(fileProprietario); } catch { /* gone */ } });
  const via = async (file) => { try { await unlink(percorso(file)); } catch (e) { if (e?.code !== 'ENOENT') avvisa(`[snapshots] ${file} cannot be deleted (${e?.code})`); } };

  /* l'indice, riconciliato col disco: un file temporaneo o un file senza voce è un avanzo; una voce senza file si dimentica */
  let voci = {};
  try {
    const letto = JSON.parse(await readFile(percorso(FILE_INDICE), 'utf8'));
    if (letto?.schema === SCHEMA_INDICE_FOTO && letto.voci && typeof letto.voci === 'object') voci = letto.voci;
  } catch (e) { if (e?.code !== 'ENOENT') avvisa(`[snapshots] the index is unreadable (${e?.code ?? e?.message}): the snapshots on disk are dropped`); }
  let nomi = [];
  try { nomi = await readdir(cartella); } catch { nomi = []; }
  for (const file of nomi) {
    if (TEMPORANEO.test(file) || (DEFINITIVO.test(file) && !voci[file.slice(0, 32)])) await via(file);
  }
  for (const nome of Object.keys(voci)) if (!nomi.includes(`${nome}.bin`)) delete voci[nome];

  const archivio = (tetto) => creaArchivioFoto({ voci, tettoConversazioni: tetto, adesso });
  const salvaIndice = () => scriviAtomico(percorso(FILE_INDICE), `${JSON.stringify({ schema: SCHEMA_INDICE_FOTO, voci })}\n`);
  const togli = async (nome) => { delete voci[nome]; await via(`${nome}.bin`); };

  let coda = Promise.resolve();
  const inFila = (lavoro) => { const p = coda.then(lavoro, lavoro); coda = p.catch(() => {}); return p; };
  let residente = null; // la conversazione che sta sulla scheda adesso
  let processoNoto = null;
  /* Revisione avversaria del 1/11: l'ORDINE in cui le richieste arrivano al motore, che le esegue una alla volta nell'ordine d'arrivo
     (llama.cpp `server-queue.cpp:41`, `:148`). `residenteOrdine` = l'ordine della richiesta che ha messo `residente` sulla scheda;
     `ultimaScaduta` = l'ordine dell'ultima richiesta passata oltre il tetto, cioè arrivata al motore SENZA passare dalla fila. */
  let ordine = 0;
  let residenteOrdine = 0;
  const dimenticate = new Set(); // conversazioni cancellate: mai più una foto loro
  let ultimaScaduta = 0;

  /** the engine as it is now, or why there is nothing to do */
  const motoreAdesso = () => {
    let s = null;
    try { s = motore.stato(); } catch { s = null; }
    if (!s || s.state !== 'ready' || !s.fotoAttive || !s.modelId) return null;
    if (s.processo !== processoNoto) { processoNoto = s.processo; residente = null; } // un processo nuovo ha la scheda vuota
    return s;
  };
  /* revisione 1/11, nota 5: fra la lettura dello stato e la richiesta il motore può essere stato riaperto (un altro modello con la stessa
     disposizione della cache non se ne accorgerebbe: `llama-kv-cache.cpp:2543-2665`): si rilegge prima di toccare la scheda */
  const fermo = (s) => ({ processo: s.processo, modelId: s.modelId }); // i valori di ADESSO, non l'oggetto (che può cambiare sotto)
  const motoreCambiato = (prima) => { let n = null; try { n = motore.stato(); } catch { n = null; } return !n || n.state !== 'ready' || n.processo !== prima.processo || n.modelId !== prima.modelId; };
  const tetto = () => { let t = 0; try { t = Number(tettoConversazioni()); } catch { t = 0; } return Number.isFinite(t) && t > 0 ? t : 0; };

  /** with the cap at 0 the conversations already on disk go too (Jan: the off switch reclaims) */
  async function liberaSeSpenta() {
    if (tetto() > 0) return false;
    const conversazioni = Object.entries(voci).filter(([, v]) => v.tipo === 'conversazione').map(([n]) => n);
    if (!conversazioni.length) return true;
    for (const n of conversazioni) await togli(n);
    await salvaIndice();
    return true;
  }

  return Object.freeze({
    proprietario: true,
    /**
     * Before the message goes to the engine. `{ esito, ms? }`: 'rimessa' (restore_ms of the engine, and how long the wait for a save in
     * progress took), 'gia-sulla-scheda', 'assente', 'identita-diversa', 'spenta', 'motore-senza-foto', 'non-riuscita'.
     */
    primaDelGiro(sessione, { modello = null } = {}) {
      const chiesta = adesso();
      /* Mobile 1/11: un messaggio arrivato durante un salvataggio aspetta al più `tettoAttesaMs`. Oltre, va senza rimettere niente: il
         motore lo esegue comunque dopo il salvataggio (un lavoro alla volta), e dopo quel giro la scheda è di questa conversazione. */
      let scaduta = false;
      let mioOrdine = 0;
      let timer = null;
      const lavoro = inFila(async () => {
        clearTimeout(timer);
        if (scaduta) {
          /* revisione 1/11: la scheda è sua solo se nessuna richiesta è arrivata al motore DOPO di lei (una rimessa ancora in fila davanti) */
          const s = motoreAdesso();
          if (s && (!modello || modello === s.modelId) && mioOrdine > residenteOrdine) { residente = sessione || null; residenteOrdine = mioOrdine; }
          return { esito: 'attesa-scaduta' };
        }
        const e = await corpo();
        /* la richiesta di questa conversazione parte adesso, al ritorno: è lei l'ultima arrivata al motore */
        if (!['altro-motore', 'motore-senza-foto'].includes(e.esito)) residenteOrdine = ++ordine;
        return e;
      });
      async function corpo() {
        const attesaMs = adesso() - chiesta;
        const s = motoreAdesso();
        if (!s) return { esito: 'motore-senza-foto', attesaMs };
        if (modello && modello !== s.modelId) return { esito: 'altro-motore', attesaMs }; // Ollama o un altro modello: non è questa scheda
        /* una richiesta che non è di una conversazione (un riassunto di fondo, un passo senza sessione) occupa la scheda lo stesso */
        if (!sessione) { residente = null; return { esito: 'senza-conversazione', attesaMs }; }
        if (residente === sessione) return { esito: 'gia-sulla-scheda', attesaMs };
        residente = sessione; // dopo questo giro la scheda è sua, rimessa o no
        if (await liberaSeSpenta()) return { esito: 'spenta', attesaMs };
        const nome = nomeDellaFoto(s.modelId, sessione);
        if (!voci[nome]) return { esito: 'assente', attesaMs };
        let id = null;
        const prima = fermo(s);
        try { id = await identita(s.modelId); } catch { id = null; }
        if (motoreCambiato(prima)) { residente = null; return { esito: 'motore-cambiato', attesaMs }; } // revisione 1/11, nota 5
        const d = archivio(tetto()).daRimettere(nome, id);
        if (!d.rimetti) {
          if (d.cancella?.length) { for (const n of d.cancella) await togli(n); await salvaIndice(); }
          return { esito: d.motivo === 'assente' ? 'assente' : 'identita-diversa', attesaMs };
        }
        try {
          const r = await motore.slot('restore', `${nome}.bin`);
          await salvaIndice(); // `usata` è cambiata: la meno usata va via per prima
          return { esito: 'rimessa', ms: Number(r?.timings?.restore_ms) || null, token: Number(r?.n_restored) || null, attesaMs };
        } catch (e) {
          /* Mobile 4: un file che manca o che il motore rifiuta non è un errore del giro; si butta e la conversazione si rilegge */
          avvisa(`[snapshots] restore failed (${e?.code ?? e?.message}): the conversation is read again from the start`);
          await togli(nome);
          await salvaIndice();
          return { esito: 'non-riuscita', attesaMs };
        }
      }
      const scadenza = new Promise((ok) => {
        timer = setTimeout(() => { scaduta = true; mioOrdine = ++ordine; ultimaScaduta = mioOrdine; ok({ esito: 'attesa-scaduta', attesaMs: tettoAttesaMs }); }, tettoAttesaMs);
        timer.unref?.();
      });
      return Promise.race([lavoro, scadenza]);
    },

    /**
     * At the end of a turn, at rest: the slot of this conversation goes to disk. `token` = the tokens in the slot now (the prompt plus the
     * answer). `{ esito, ms?, bytes? }`: 'salvata', 'spenta', 'troppo-corta', 'disco-pieno', 'uguale', 'non-entra', 'non-sulla-scheda',
     * 'motore-senza-foto', 'non-riuscita'.
     */
    dopoIlGiro(sessione, { token = null, modello = null } = {}) {
      /* `token` noti (il conto del giro) decidono PRIMA di scrivere; senza, decide `n_saved` della risposta del motore, DOPO (file temporaneo buttato) */
      const noti = token !== null && Number.isFinite(Number(token));
      const nato = ordine; // le richieste arrivate al motore fino a quando il salvataggio è stato chiesto
      return inFila(async () => {
        const s = motoreAdesso();
        if (!s) return { esito: 'motore-senza-foto' };
        if (modello && modello !== s.modelId) return { esito: 'altro-motore' };
        if (dimenticate.has(sessione)) return { esito: 'dimenticata' };
        if (!sessione || residente !== sessione) return { esito: 'non-sulla-scheda' };
        if (await liberaSeSpenta()) return { esito: 'spenta' };
        if (noti && !(Number(token) >= MINIMO_TOKEN)) return { esito: 'troppo-corta' };
        let libero = Infinity;
        try { libero = Number(discoLibero()); } catch { libero = Infinity; }
        if (Number.isFinite(libero) && libero < DISCO_MINIMO) return { esito: 'disco-pieno' };
        let id = null;
        const prima = fermo(s);
        try { id = await identita(s.modelId); } catch { id = null; }
        if (!id) return { esito: 'motore-senza-foto' };
        const nome = nomeDellaFoto(s.modelId, sessione);
        const gia = voci[nome];
        const uguale = (chiave) => Boolean(gia && gia.chiave === chiave && stessaIdentita(gia.identita, id)); // Performance 3: niente riscrittura
        if (noti && uguale(String(Math.trunc(Number(token))))) return { esito: 'uguale' };
        if (motoreCambiato(prima)) { residente = null; return { esito: 'motore-cambiato' }; }
        /* revisione 1/11: una richiesta passata oltre il tetto DOPO che questo salvataggio era stato chiesto (un riassunto, un altro messaggio)
           è arrivata al motore prima di lui: sulla scheda adesso c'è lei, non questa conversazione. Si butta, mai un nome sbagliato. */
        if (ultimaScaduta > nato) return { esito: 'superata' };
        const temporaneo = `t${nome}.bin`;
        let r = null;
        let bytes = 0;
        try {
          r = await motore.slot('save', temporaneo);
          bytes = (await stat(percorso(temporaneo))).size;
        } catch (e) {
          avvisa(`[snapshots] save failed (${e?.code ?? e?.message})`);
          await via(temporaneo);
          return { esito: 'non-riuscita' };
        }
        /* senza i token noti decide `n_saved`: troppo corta e «uguale» le dice l'archivio, e il temporaneo si butta qui sotto */
        const quanti = noti ? Math.trunc(Number(token)) : Math.trunc(Number(r?.n_saved));
        const chiave = String(quanti);
        const a = archivio(tetto()).ammetti({ nome, tipo: 'conversazione', bytes, identita: id, chiave, discoLibero: libero, token: quanti });
        if (!a.scrivi) { await via(temporaneo); return { esito: a.motivo }; }
        for (const n of a.cancella) await togli(n);
        try { await rename(percorso(temporaneo), percorso(`${nome}.bin`)); } catch (e) {
          avvisa(`[snapshots] the snapshot cannot be put in place (${e?.code})`);
          await via(temporaneo);
          await salvaIndice();
          return { esito: 'non-riuscita' };
        }
        const dopo = archivio(tetto());
        dopo.registra({ nome, tipo: 'conversazione', bytes, identita: id, chiave, sessione });
        voci = dopo.voci(); // `registra` scrive nel suo indice, non nell'oggetto da cui è nato
        await salvaIndice();
        return { esito: 'salvata', ms: Number(r?.timings?.save_ms) || null, bytes };
      });
    },

    /** A deleted conversation: its snapshots go, whichever model made them (Jan `forget_thread`). */
    dimentica(sessione) {
      /* Performance 1/11: in FILA, quindi dopo un salvataggio di questa conversazione in corso o in attesa; e da qui nessun salvataggio la
         riscrive più (il testo non torna sul disco dopo l'eliminazione) */
      if (sessione) dimenticate.add(sessione);
      return inFila(async () => {
        const sue = Object.entries(voci).filter(([, v]) => v.sessione === sessione).map(([n]) => n);
        for (const n of sue) await togli(n);
        if (residente === sessione) residente = null;
        if (sue.length) await salvaIndice();
        return sue.length;
      });
    },

    /** For the settings card and the bench: bytes on disk by kind. */
    occupato() {
      const somma = (tipo) => Object.values(voci).filter((v) => !tipo || v.tipo === tipo).reduce((s, v) => s + (Number(v.bytes) || 0), 0);
      return { conversazioni: somma('conversazione'), totale: somma(null) };
    },
  });
}
