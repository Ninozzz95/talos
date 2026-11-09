/*
 * Computer use — i luoghi di «Consenti sempre» (owner 03/11/2026, decisione 75; forma `Downloads/TALOS/computer-use/handoff/
 * FORMA-CONSENTI-SEMPRE-2026-11-03.md`, schermata del Frontend `frontend/in-corso/FORMA-LUOGHI-RICORDATI-2026-11-03.md`).
 *
 * Un file JSON nella cartella dei dati del PC, una voce `{ tipo: 'dominio' | 'app', nome, quando }` per luogo. Lo legge e lo scrive solo
 * il server: il ciclo riceve i luoghi in ingresso (`perIlCiclo`) e chiede di salvarne con la porta `ricordaLuoghi`.
 * - Si AGGIUNGE solo da una carta del compito («Consenti sempre»): nessuna rotta aggiunge. Un luogo scritto a mano salterebbe la carta
 *   senza che nessuno abbia visto il compito.
 * - Si TOGLIE da Impostazioni, uno o tutti: togliere vale subito, anche nel compito in corso (`perIlCiclo` riletto a ogni luogo).
 * - Un file illeggibile o storto vale come elenco VUOTO: nel dubbio TALOS chiede la carta, mai il contrario. Al primo salvataggio si
 *   riscrive pulito (temporaneo e rinomina, una coda sola: mai due scritture intrecciate).
 * - Domini in minuscolo e senza spazi; programmi col nome esatto. Al più 500 voci: oltre, si tengono le più recenti.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { dominioValido } from './protezioni.mjs';

export const TETTO_LUOGHI = 500;
const LUNGHEZZA_NOME = 253; // il nome di dominio più lungo che il DNS ammette
const TIPI = new Set(['dominio', 'app']);

const nomeDi = (tipo, nome) => {
  if (typeof nome !== 'string') return null;
  const n = tipo === 'dominio' ? nome.trim().toLowerCase() : nome.trim();
  if (!n || n.length > LUNGHEZZA_NOME || /[\u0000-\u001f\u007f]/u.test(n)) return null;
  if (tipo === 'dominio' && !/^[\p{L}\p{N}][\p{L}\p{N}.-]*$/u.test(n)) return null;
  if (tipo === 'dominio' && dominioValido(n) === null) return null; // C10 (revisione PR19): «com», «co.uk», «github.io» non sono un sito
  return n;
};
const vocePulita = (v) => {
  if (!v || typeof v !== 'object' || !TIPI.has(v.tipo)) return null;
  const nome = nomeDi(v.tipo, v.nome);
  if (!nome) return null;
  const quando = typeof v.quando === 'string' && Number.isFinite(Date.parse(v.quando)) ? v.quando : null;
  return { tipo: v.tipo, nome, quando };
};
const chiave = (v) => `${v.tipo}\u0000${v.nome}`;

/** @param {{ file: string, adesso?: () => number }} p */
export function creaRegistroLuoghi({ file, adesso = Date.now }) {
  let coda = Promise.resolve();
  const inCoda = (fn) => { const p = coda.then(fn, fn); coda = p.catch(() => {}); return p; };

  const leggi = async () => {
    let grezzo;
    try { grezzo = JSON.parse(await readFile(file, 'utf8')); } catch { return []; }
    const voci = Array.isArray(grezzo?.voci) ? grezzo.voci : [];
    const viste = new Map();
    for (const v of voci) { const p = vocePulita(v); if (p) viste.set(chiave(p), p); }
    return [...viste.values()];
  };
  const scrivi = async (voci) => {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify({ versione: 1, voci }, null, 1)}\n`, 'utf8');
    await rename(tmp, file);
  };

  return {
    /** L'elenco per la schermata, il più recente in cima; le voci senza data in fondo. */
    async elenco() {
      const voci = await leggi();
      return { voci: voci.sort((a, b) => (b.quando ?? '').localeCompare(a.quando ?? '')) };
    },
    /** Per il ciclo: `{ domini, app }`. Un registro che non si legge dà un elenco vuoto, quindi la carta. */
    async perIlCiclo() {
      const voci = await leggi();
      return { domini: voci.filter((v) => v.tipo === 'dominio').map((v) => v.nome), app: voci.filter((v) => v.tipo === 'app').map((v) => v.nome) };
    },
    /** Dalla porta `ricordaLuoghi` del ciclo, dopo un «Consenti sempre». Nomi storti scartati; un luogo già ricordato prende la data nuova. */
    ricorda({ domini = [], app = [] } = {}) {
      return inCoda(async () => {
        const nuove = [...(Array.isArray(domini) ? domini : []).map((nome) => ({ tipo: 'dominio', nome })), ...(Array.isArray(app) ? app : []).map((nome) => ({ tipo: 'app', nome }))]
          .map((v) => vocePulita({ ...v, quando: new Date(adesso()).toISOString() })).filter(Boolean);
        if (!nuove.length) return { aggiunti: 0 };
        const voci = new Map((await leggi()).map((v) => [chiave(v), v]));
        for (const v of nuove) { voci.delete(chiave(v)); voci.set(chiave(v), v); }
        const tutte = [...voci.values()].sort((a, b) => (a.quando ?? '').localeCompare(b.quando ?? ''));
        await scrivi(tutte.slice(-TETTO_LUOGHI));
        return { aggiunti: nuove.length };
      });
    },
    togli({ tipo, nome } = {}) {
      return inCoda(async () => {
        const n = TIPI.has(tipo) ? nomeDi(tipo, nome) : null;
        if (!n) return { tolti: 0 };
        const voci = await leggi();
        const resto = voci.filter((v) => !(v.tipo === tipo && v.nome === n));
        if (resto.length !== voci.length) await scrivi(resto);
        return { tolti: voci.length - resto.length };
      });
    },
    svuota() {
      return inCoda(async () => {
        const voci = await leggi();
        await scrivi([]);
        return { tolti: voci.length };
      });
    },
  };
}
