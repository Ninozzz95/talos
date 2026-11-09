/*
 * Il registro delle notifiche del PC — contratto «notifiche» (31/10/2026, bozza 2, OK di CLI, Performance e Mobile;
 * `handoff-talos-2026-09-27/in-corso/CONTRATTO-NOTIFICHE-2026-10-31.md`).
 *
 * Una voce comune per il PC, il telefono e (alla sua fase) la CLI; il «visto» sta QUI, nel server, e vale ovunque.
 * - `id` DALLA FONTE (`<fonte>:<oggetto>:<chiave dell'evento>`): la stessa voce rivista è la stessa voce, anche dopo un riavvio.
 * - `seq` cresce nel registro e AVANZA anche a ogni cambio di stato di una voce: è il cursore di chi legge (`dopo`). Un cursore
 *   per istante non reggeva (una voce arriva con un'ora già passata, i cambi delle voci vecchie non si vedevano).
 * - Tetto: 500 voci / 30 giorni, ma una voce che ASPETTA la persona e non è risolta non si butta mai.
 * - Il testo di `dato` è oscurato (`oscuraFormeDiSegreto`) e pulito da chi scrive nel registro (il nativo Android non può farlo):
 *   ≤ 240 caratteri, tagliato sulla parola. Il Markdown (tabelle e codice saltati) lo pulisce `pulisciTesto`, iniettato da chi
 *   crea il registro (`markdown-it` 14.3.0, import pigro: mai all'avvio del server — condizione di Performance).
 * - «Da fare» = le voci che aspettano la persona e non sono risolte (bozzetto A approvato dall'owner il 30/10: «Il numero conta solo
 *   Da fare»): `approvazione` e `domanda`.
 * ⛔ `fatto`, `cosa.tipo` e `porta.tipo` sono ESTENDIBILI: un valore sconosciuto si conserva così com'è, mai un errore.
 *
 * Persistenza: un file a righe (una riga = la voce intera dopo un cambio), riletto all'avvio tenendo l'ultima riga per id. Le scritture
 * passano da una coda sola (mai due appendFile intrecciati: la persistenza del 04/09 si era corrotta così); quando il file supera il
 * doppio del tetto si riscrive intero su un temporaneo e si rinomina.
 */
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { oscuraFormeDiSegreto } from './forme-di-segreto.mjs';

export const TETTO_VOCI = 500;
export const TETTO_GIORNI = 30;
export const LIMITE_ELENCO = 100;
export const LUNGHEZZA_DATO = 240;
export const FATTI_CHE_ASPETTANO = Object.freeze(new Set(['approvazione', 'domanda']));

const GIORNO_MS = 24 * 60 * 60 * 1000;

/* bozza 3, revisione 1 (Mobile): `richiesta: { sessionId, requestId }` per `approvazione` e `domanda`. L'id della voce è un'etichetta e
   non si apre a pezzi (`ID_SESSIONE` ammette «:»); chi deve rispondere o riconciliare legge questo campo. */
const richiestaDi = (entrata) => {
  const r = entrata?.richiesta;
  return (entrata?.fatto === 'approvazione' || entrata?.fatto === 'domanda') && r && typeof r.sessionId === 'string' && r.sessionId
    && typeof r.requestId === 'string' && r.requestId ? { richiesta: { sessionId: r.sessionId, requestId: r.requestId } } : {};
};
const stringa = (v) => (typeof v === 'string' ? v : '');

/*
 * Fase 8, cura 3 (forma `FORMA-FASE-8-TRE-CURE-2026-11-01.md` §3, decisione D6 dell'owner): il fatto `impostazioni` — un cambio fatto dal
 *   modello con `app_settings` — porta i suoi dati con una forma CHIUSA, ricopiata campo per campo: la ricevuta (per l'Annulla), al più 10
 *   cambi `{ chiave, prima, dopo }` con valori semplici e brevi (il catalogo non ha segreti: CAT-02), e chi ha confermato. Solo su questo
 *   fatto; un altro fatto non lo porta mai. Non aspetta nessuno (`FATTI_CHE_ASPETTANO`): fuori da «Da fare» e dal numero della campanella.
 */
const MASSIMO_CAMBI_NOTIFICA = 10;
const valoreSemplice = (v) => (typeof v === 'string' ? tagliaSullaParola(v, 200) : typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) ? v : null);
function confermaDellaNotifica(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.tipo === 'finestra-pc') return { tipo: 'finestra-pc' };
  if (c.tipo === 'dispositivo') return { tipo: 'dispositivo', dispositivoId: typeof c.dispositivoId === 'string' && c.dispositivoId ? c.dispositivoId.slice(0, 200) : null };
  if (c.tipo === 'nessuno') return { tipo: 'nessuno', motivo: c.motivo === 'accesso-pieno' ? 'accesso-pieno' : null };
  return null;
}
const impostazioniDi = (entrata) => {
  if (entrata?.fatto !== 'impostazioni' || !entrata.impostazioni || typeof entrata.impostazioni !== 'object') return {};
  const i = entrata.impostazioni;
  const cambi = (Array.isArray(i.cambi) ? i.cambi : []).slice(0, MASSIMO_CAMBI_NOTIFICA)
    .filter((c) => c && typeof c.chiave === 'string' && c.chiave)
    .map((c) => ({ chiave: c.chiave.slice(0, 80), prima: valoreSemplice(c.prima), dopo: valoreSemplice(c.dopo) }));
  /* giro 2, voce 2 (02/11/2026): un cambio della persona dal dispositivo porta la sua origine; solo questa forma, mai altre */
  const origine = i.origine?.tipo === 'dispositivo'
    ? { origine: { tipo: 'dispositivo', dispositivoId: typeof i.origine.dispositivoId === 'string' && i.origine.dispositivoId ? i.origine.dispositivoId.slice(0, 200) : null } } : {};
  return { impostazioni: { ricevuta: typeof i.ricevuta === 'string' ? i.ricevuta.slice(0, 64) : null, cambi, confermatoDa: confermaDellaNotifica(i.confermatoDa), ...origine } };
};

/** ≤ `n` caratteri, tagliato sull'ultima parola intera (mai a metà parola), con «…» se tagliato. */
export function tagliaSullaParola(testo, n = LUNGHEZZA_DATO) {
  const pulito = stringa(testo).replace(/\s+/gu, ' ').trim();
  if (pulito.length <= n) return pulito;
  const dentro = pulito.slice(0, n - 1);
  const spazio = dentro.lastIndexOf(' ');
  return `${(spazio > n * 0.5 ? dentro.slice(0, spazio) : dentro).trimEnd()}…`;
}

/**
 * @param {{ file:string, adesso?:()=>number, pulisciTesto?:(testo:string)=>Promise<string>|string, tettoVoci?:number, tettoGiorni?:number }} p
 */
export function creaRegistroNotifiche({ file, adesso = () => Date.now(), pulisciTesto = async (t) => t, tettoVoci = TETTO_VOCI, tettoGiorni = TETTO_GIORNI } = {}) {
  if (typeof file !== 'string' || !file) throw new TypeError('creaRegistroNotifiche: serve il file del registro');
  const voci = new Map(); // id → voce
  let ultimoSeq = 0;
  let seqTagliato = 0; // il `seq` più alto uscito per il tetto: un cursore sotto di lui ha perso qualcosa ⇒ `ripartito`
  let righeSulDisco = 0;
  let coda = Promise.resolve();
  let caricato = null;
  const ascoltatori = new Set(); // l'avviso `talos.notifica` sul flusso globale della finestra (contratto, «Rotte e cursore»)

  const accoda = (lavoro) => { coda = coda.then(lavoro, lavoro); return coda; };
  const aspetta = (v) => FATTI_CHE_ASPETTANO.has(v.fatto) && !v.stato.risolto;

  async function carica() {
    if (caricato) return caricato;
    caricato = (async () => {
      let testo = '';
      try { testo = await readFile(file, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') throw e; }
      for (const riga of testo.split('\n')) {
        if (!riga.trim()) continue;
        let v; try { v = JSON.parse(riga); } catch { continue; } // una riga spezzata (scrittura interrotta) non ferma il registro
        if (!v || typeof v.id !== 'string' || !Number.isSafeInteger(v.seq)) continue;
        voci.set(v.id, v); ultimoSeq = Math.max(ultimoSeq, v.seq); righeSulDisco += 1;
      }
      pota();
    })();
    return caricato;
  }

  /** Tetto: le più vecchie oltre 500 o oltre 30 giorni escono, ma mai una che aspetta la persona e non è risolta. */
  function pota() {
    const limite = adesso() - tettoGiorni * GIORNO_MS;
    const togli = (v) => { voci.delete(v.id); seqTagliato = Math.max(seqTagliato, v.seq); };
    for (const v of [...voci.values()]) if (!aspetta(v) && Date.parse(v.istante) < limite) togli(v);
    const eliminabili = [...voci.values()].filter((v) => !aspetta(v)).sort((a, b) => a.seq - b.seq);
    let troppe = voci.size - tettoVoci;
    for (const v of eliminabili) { if (troppe <= 0) break; togli(v); troppe -= 1; }
  }

  async function scriviSulDisco(v) {
    await mkdir(dirname(file), { recursive: true });
    if (righeSulDisco + 1 > tettoVoci * 2) {
      pota();
      const tutte = [...voci.values()].sort((a, b) => a.seq - b.seq);
      const temporaneo = `${file}.${process.pid}.tmp`;
      await writeFile(temporaneo, tutte.map((x) => JSON.stringify(x)).join('\n') + (tutte.length ? '\n' : ''), 'utf8');
      await rename(temporaneo, file);
      righeSulDisco = tutte.length;
      return;
    }
    await appendFile(file, `${JSON.stringify(v)}\n`, 'utf8');
    righeSulDisco += 1;
  }

  /** Dopo che la voce è sul disco (mai prima: chi riceve l'avviso e rilegge deve trovarla), a chi ascolta. Un ascoltatore rotto non ferma
      il registro né gli altri. */
  async function persisti(v) {
    await scriviSulDisco(v);
    const avviso = { voce: v, ultimoSeq, totaleDaFare: [...voci.values()].filter(aspetta).length };
    for (const fn of ascoltatori) { try { fn(avviso); } catch { /* un ascoltatore rotto non ferma il registro */ } }
  }

  async function pulisciDato(dato) {
    if (!dato || typeof dato !== 'object') return null;
    const genere = stringa(dato.genere) || 'testo';
    const grezzo = stringa(dato.valore);
    const senzaSegreti = oscuraFormeDiSegreto(genere === 'testo' ? await pulisciTesto(grezzo) : grezzo);
    return { genere, valore: tagliaSullaParola(senzaSegreti) };
  }

  /** Cambia lo stato di una voce già scritta: `seq` avanza solo se qualcosa cambia davvero. */
  function cambiaStato(v, stato) {
    const nuovo = { visto: stato.visto ?? v.stato.visto, risolto: stato.risolto ?? v.stato.risolto };
    if (nuovo.visto === v.stato.visto && nuovo.risolto === v.stato.risolto) return null;
    const dopo = { ...v, seq: ++ultimoSeq, stato: nuovo };
    voci.set(v.id, dopo);
    return dopo;
  }

  return {
    carica,

    /**
     * Scrive una voce dagli eventi del server. Una voce con lo stesso `id` NON è una voce nuova: si aggiorna (e `seq` avanza) solo se
     * cambia qualcosa, così la stessa carta rigiocata non ne crea una seconda.
     */
    scrivi(entrata) {
      return accoda(async () => {
        await carica();
        if (typeof entrata?.id !== 'string' || !entrata.id || typeof entrata.fatto !== 'string' || !entrata.fatto) throw new TypeError('notifica: servono id e fatto');
        const prima = voci.get(entrata.id);
        const base = {
          id: entrata.id,
          fatto: entrata.fatto,
          azione: typeof entrata.azione === 'string' ? entrata.azione : null,
          cosa: { tipo: stringa(entrata.cosa?.tipo), id: stringa(entrata.cosa?.id), nome: tagliaSullaParola(entrata.cosa?.nome, 120) },
          dato: await pulisciDato(entrata.dato),
          porta: entrata.porta && typeof entrata.porta === 'object' ? { tipo: stringa(entrata.porta.tipo), id: stringa(entrata.porta.id), ...(Number.isSafeInteger(entrata.porta.giro) ? { giro: entrata.porta.giro } : {}) } : null,
          istante: typeof entrata.istante === 'string' && !Number.isNaN(Date.parse(entrata.istante)) ? entrata.istante : new Date(adesso()).toISOString(),
          ...richiestaDi(entrata),
          ...(entrata.fatto === 'approvazione' && entrata.approvabileFuori === true ? { approvabileFuori: true } : {}),
          ...impostazioniDi(entrata), // fase 8, cura 3
        };
        if (prima) {
          const { seq: _s, stato: _st, ...resto } = prima;
          if (JSON.stringify(resto) === JSON.stringify(base)) return prima; // rigiocata: niente di nuovo
          const v = { ...base, seq: ++ultimoSeq, stato: prima.stato };
          voci.set(v.id, v); await persisti(v); return v;
        }
        /* bozza 3: `azione-persona` nasce vista e risolta (l'ha fatto la persona). Solo il `true` vale alla nascita: chi non lo dice ha
           la voce nuova di sempre, da vedere e da fare. */
        const v = { ...base, seq: ++ultimoSeq, stato: { visto: entrata.stato?.visto === true, risolto: entrata.stato?.risolto === true } };
        voci.set(v.id, v); pota(); await persisti(v); return v;
      });
    },

    /** La voce con questo id com'è ADESSO, dopo le scritture già in coda (null se non c'è): lo scrittore di `azione-persona` guarda se
        la carta era diventata una voce, e ne riusa il `dato` già pulito. */
    voce(id) {
      return accoda(async () => { await carica(); return voci.get(id) ?? null; });
    },

    /** Le voci con `seq` > `dopo`, al più 100 (le più vecchie per prime); `ripartito` se il cursore è uscito dal tetto. */
    async elenco({ dopo = 0, limite = LIMITE_ELENCO } = {}) {
      await carica();
      const tutte = [...voci.values()].sort((a, b) => a.seq - b.seq);
      /* ripartito solo se il cursore sta sotto una voce davvero TAGLIATA dal tetto: i `seq` che mancano perché una voce è avanzata a
         un cambio di stato non sono persi (la voce c'è, col `seq` nuovo) */
      const ripartito = Number.isSafeInteger(dopo) && dopo > 0 && dopo < seqTagliato;
      const da = ripartito ? 0 : (Number.isSafeInteger(dopo) && dopo > 0 ? dopo : 0);
      const dopoIlCursore = tutte.filter((v) => v.seq > da);
      const n = Math.max(1, Math.min(LIMITE_ELENCO, Number.isSafeInteger(limite) ? limite : LIMITE_ELENCO));
      return {
        voci: dopoIlCursore.slice(0, n),
        altre: dopoIlCursore.length > n,
        ultimoSeq,
        totaleDaFare: tutte.filter(aspetta).length,
        ...(ripartito ? { ripartito: true } : {}),
      };
    },

    /** Segna viste le voci indicate. */
    segnaViste(ids) {
      return accoda(async () => {
        await carica();
        const cambiate = [];
        for (const id of Array.isArray(ids) ? ids : []) {
          const v = voci.get(id); if (!v) continue;
          const dopo = cambiaStato(v, { visto: true }); if (dopo) { cambiate.push(dopo); await persisti(dopo); }
        }
        return cambiate;
      });
    },

    /** Segna viste tutte le voci con `seq` ≤ `finoA`: MAI «tutto» senza confine — ciò che arriva mentre lo tocchi resta da vedere. */
    segnaVisteFinoA(finoA) {
      return accoda(async () => {
        await carica();
        if (!Number.isSafeInteger(finoA) || finoA < 0) throw new TypeError('seen-all: serve finoA');
        const cambiate = [];
        for (const v of [...voci.values()].sort((a, b) => a.seq - b.seq)) {
          if (v.seq > finoA) continue;
          const dopo = cambiaStato(v, { visto: true }); if (dopo) { cambiate.push(dopo); await persisti(dopo); }
        }
        return cambiate;
      });
    },

    /** Risolve le voci per cui `quale(voce)` è vero (la carta non esiste più, la sessione è stata eliminata, la domanda ha risposta). */
    risolvi(quale) {
      return accoda(async () => {
        await carica();
        const cambiate = [];
        for (const v of [...voci.values()]) {
          if (v.stato.risolto || !quale(v)) continue;
          const dopo = cambiaStato(v, { risolto: true }); if (dopo) { cambiate.push(dopo); await persisti(dopo); }
        }
        return cambiate;
      });
    },

    /** Ogni voce nuova o cambiata, dopo il disco: `{ voce, ultimoSeq, totaleDaFare }`. Torna la funzione che smette di ascoltare. */
    ascolta(fn) {
      if (typeof fn !== 'function') return () => {};
      ascoltatori.add(fn);
      return () => { ascoltatori.delete(fn); };
    },

    /** La foto per chi apre il flusso: l'ultimo `seq` e quante cose aspettano la persona. */
    async riassunto() { await carica(); return { ultimoSeq, totaleDaFare: [...voci.values()].filter(aspetta).length }; },

    /** L'ultimo `seq` del registro (il confine che il client passa a `seen-all`). */
    async ultimoSeq() { await carica(); return ultimoSeq; },

    /** Le scritture in coda sono finite (per le prove e per lo spegnimento). */
    attendi() { return coda; },
  };
}
