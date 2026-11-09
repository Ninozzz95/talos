/*
 * FE-040, il cielo beta (owner 31/10/2026: «cielo disponibile come "beta" fino a quando non la perfezioniamo»): dalle sessioni vere alla mappa. Niente
 * tela qui, così si prova senza browser. Consegna: `in-corso/CONSEGNA-NUOVA-SESSIONE-2026-10-31.md`.
 * Stella = progetto, pianeta = sessione, lune = sotto-agenti, anelli = compattazioni, cometa = automazione in arrivo, cintura = sessioni vecchie.
 * ⛔ Regola «niente funzioni finte»: un pezzo senza dato non si disegna. Solo questo PC: niente galassie di altri PC.
 * ⛔ Le posizioni dipendono dall'ordine di nascita dei progetti: una sessione nuova non sposta le stelle che ci sono già.
 */
import { statoBoard } from './board.js';
import { nomeModello } from './session-item.js';
import { usageDellaSessione, giriDellaSessione } from './consumo-sessione.js';

/** Quanti pianeti restano in orbita: i più recenti e quelli vivi. Il resto va nella cintura, e si apre dalla Bacheca. */
export const PIANETI_PER_STELLA = 6;
const GIORNO = 86_400_000;
const COME_IN_CIELO = { vivo: 'corso', agenti: 'corso', attesa: 'aspetta', pendente: 'aspetta', errore: 'riprendere', fermata: 'riprendere', interrotto: 'riprendere', 'in-pausa': 'riprendere', successo: 'fine', ignoto: 'fine' };

export const statoInCielo = (sessione) => COME_IN_CIELO[statoBoard(sessione).chiave] ?? 'riprendere';

const nomeDaPercorso = (p) => String(p).split(/[\\/]/u).filter(Boolean).pop() ?? String(p);
/**
 * La stella: il progetto, poi la cartella. `cartella` dell'elenco è `{ cartellaId, nome }`, senza percorso; il percorso, quando si sa, viene da
 * `cartelle` (per sessione, le stesse della Bacheca). Senza niente, `null` = «Chat libere».
 */
export const stellaDi = (s, cartelle = {}) => s.progetto || s.cartella?.nome || (cartelle[s.sessionId] ? nomeDaPercorso(cartelle[s.sessionId]) : null);

function pianeta(sessione, adesso, finestraDi) {
  const nata = Date.parse(sessione.avviataAlle);
  const usage = usageDellaSessione(sessione);
  const finestra = finestraDi?.(sessione.modello) ?? null;
  const ctx = finestra > 0 && Number.isFinite(usage?.prompt_tokens) ? Math.min(100, Math.round((usage.prompt_tokens / finestra) * 100)) : 12;
  return {
    id: sessione.sessionId, t: sessione.nome || sessione.taskId || '', st: statoInCielo(sessione), eta: Number.isFinite(nata) ? Math.max(0, (adesso - nata) / GIORNO) : 0,
    nata: Number.isFinite(nata) ? nata : 0, giri: giriDellaSessione(sessione).giri ?? 0, ctx, ri: Number.isSafeInteger(sessione.compattazioni) ? sessione.compattazioni : 0,
    mod: nomeModello(sessione.modello) || '', ag: [], sessione,
    token: Number.isFinite(usage?.prompt_tokens) && Number.isFinite(usage?.completion_tokens) ? usage.prompt_tokens + usage.completion_tokens : null,
    iniziato: Number.isFinite(Date.parse(sessione.inizioGiroAlle)) ? Date.parse(sessione.inizioGiroAlle) : null,
  };
}

/**
 * @param {{ sessioni: object[], automazioni?: object[], adesso?: number, finestraDi?: (modello: string) => (number|null), cartelle?: Record<string, string|null> }} o
 * @returns {{ stelle: object[], comete: object[], conti: { corso: number, aspetta: number, riprendere: number } }}
 */
export function costruisciCielo({ sessioni, automazioni = [], adesso = Date.now(), finestraDi = null, cartelle = {} }) {
  const elenco = Array.isArray(sessioni) ? sessioni : [];
  const pianeti = new Map();
  for (const s of elenco) if (!s.padreId) pianeti.set(s.sessionId, pianeta(s, adesso, finestraDi));
  /* lune: i sotto-agenti, attaccati alla sessione radice anche se la delega è annidata */
  const perId = new Map(elenco.map((s) => [s.sessionId, s]));
  for (const s of elenco) {
    if (!s.padreId) continue;
    let radice = s;
    for (let i = 0; radice?.padreId && i < 64; i += 1) radice = perId.get(radice.padreId);
    const padre = radice && pianeti.get(radice.sessionId);
    if (padre) padre.ag.push({ n: s.taskDelega || s.nome || '', st: statoInCielo(s) === 'corso' ? 'corso' : 'fine', id: s.sessionId });
  }
  const gruppi = new Map();
  for (const p of pianeti.values()) {
    const chiave = stellaDi(p.sessione, cartelle);
    if (!gruppi.has(chiave)) gruppi.set(chiave, []);
    gruppi.get(chiave).push(p);
  }
  const ordinati = [...gruppi.entries()].map(([nome, lista]) => ({ nome, lista, nata: Math.min(...lista.map((p) => p.nata)) })).sort((a, b) => a.nata - b.nata || String(a.nome).localeCompare(String(b.nome)));
  const stelle = ordinati.map(({ nome, lista }, i) => {
    const pesoVivo = (p) => (p.st === 'fine' ? 0 : 1);
    const tutti = [...lista].sort((a, b) => pesoVivo(b) - pesoVivo(a) || b.nata - a.nata);
    const raggio = i === 0 ? 0 : 250 * Math.sqrt(i);
    const angolo = i * 2.399963;
    return {
      n: nome, libere: nome === null, p: tutti.map((l) => cartelle[l.id]).find(Boolean) ?? null, x: 1000 + Math.cos(angolo) * raggio, y: 700 + Math.sin(angolo) * raggio * 0.72,
      m: Math.min(26, 9 + Math.log2(1 + tutti.length) * 3), giorni: Math.min(...tutti.map((p) => p.eta)),
      s: tutti.slice(0, PIANETI_PER_STELLA), vecchie: Math.max(0, tutti.length - PIANETI_PER_STELLA), tutte: tutti,
    };
  });
  const comete = (Array.isArray(automazioni) ? automazioni : []).filter((a) => a?.attiva !== false && Number.isFinite(Date.parse(a?.prossimaEsecuzione)) && Date.parse(a.prossimaEsecuzione) > adesso).slice(0, 8)
    .map((a, i) => ({ n: a.nome || a.titolo || '', verso: stelle.length ? i % stelle.length : -1, ms: Date.parse(a.prossimaEsecuzione) - adesso, a0: i * 1.7 - 0.9, d: 420 + (i % 3) * 60 }));
  const contaSt = (st) => stelle.reduce((n, s) => n + s.tutte.filter((p) => p.st === st).length, 0);
  return { stelle, comete: comete.filter((c) => c.verso >= 0), conti: { corso: contaSt('corso'), aspetta: contaSt('aspetta'), riprendere: contaSt('riprendere') } };
}

/** Guarda indietro: solo le sessioni esistenti allora, non il loro stato di allora. */
export const esistevaAllora = (pianeta, giorni) => pianeta.eta >= giorni;

/** Il campo di ricerca: progetti e sessioni, parte del nome, senza maiuscole. */
export function cercaNelCielo(stelle, testo) {
  const q = String(testo ?? '').trim().toLowerCase();
  if (!q) return [];
  const trovati = [];
  stelle.forEach((s, i) => {
    if (String(s.n ?? '').toLowerCase().includes(q)) trovati.push({ tipo: 'stella', i, stella: s });
    for (const p of s.tutte) if (p.t.toLowerCase().includes(q)) trovati.push({ tipo: 'pianeta', i, stella: s, pianeta: p });
  });
  return trovati.slice(0, 30);
}
