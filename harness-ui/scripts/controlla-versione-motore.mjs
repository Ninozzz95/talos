#!/usr/bin/env node
/*
 * Is there a newer stable llama.cpp than the one TALOS pins? (owner 01/11/2026, «Ultima stabile da almeno 7 giorni», with an automatic check
 * that warns; a new version enters only if the engine bench loses nothing.)
 *
 * Since 15/10/2026 llama.cpp publishes stable releases `vX.Y.Z` and marks the daily builds `bNNNNN` as pre-releases (comment in
 * `desktop/scripts/prepara-pacchetto.mjs:18-22`). A stable one becomes a candidate only after 7 days, so a release fixed in a hurry
 * (a `vX.Y.1` in the first days) is seen first. The check only says; it never changes the pin.
 *
 * Use: node scripts/controlla-versione-motore.mjs [--json]     exit 0 = nothing to do · 3 = a candidate is there · 2 = could not read
 */
import { pathToFileURL } from 'node:url';
import { MOTORE_FISSATO } from '../src/motore-fissato.mjs';

export const GIORNI_DI_ATTESA = 7;
const GIORNO_MS = 86_400_000;

/* `v0.10.2` → [0, 10, 2]; anything else is not a stable release */
export function numeriDi(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/u.exec(String(tag ?? ''));
  return m ? m.slice(1).map(Number) : null;
}
const confronta = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * @param {Array<{tag_name:string, prerelease:boolean, draft:boolean, published_at:string}>} rilasci as GitHub gives them
 * @param {{versione:string}} fissata the pin
 * @param {number} ora ms
 */
export function verdettoVersione(rilasci, fissata, ora) {
  const nostra = numeriDi(`v${fissata?.versione}`);
  if (!nostra) return { esito: 'illeggibile', motivo: `versione fissata non leggibile: ${fissata?.versione}` };
  const stabili = (Array.isArray(rilasci) ? rilasci : [])
    .filter((r) => r && r.prerelease === false && r.draft === false && numeriDi(r.tag_name) && Number.isFinite(Date.parse(r.published_at)))
    .map((r) => ({ tag: r.tag_name, numeri: numeriDi(r.tag_name), uscita: Date.parse(r.published_at) }))
    .filter((r) => confronta(r.numeri, nostra) > 0)
    .sort((a, b) => confronta(b.numeri, a.numeri));
  const mature = stabili.filter((r) => ora - r.uscita >= GIORNI_DI_ATTESA * GIORNO_MS);
  const giovani = stabili.filter((r) => ora - r.uscita < GIORNI_DI_ATTESA * GIORNO_MS);
  const giorni = (r) => Math.floor((ora - r.uscita) / GIORNO_MS);
  const candidata = mature[0] ? { tag: mature[0].tag, giorni: giorni(mature[0]) } : null;
  const inAttesa = giovani.map((r) => ({ tag: r.tag, giorni: giorni(r), maturaIl: new Date(r.uscita + GIORNI_DI_ATTESA * GIORNO_MS).toISOString() }));
  return { esito: candidata ? 'candidata' : 'aggiornata', fissata: `v${fissata.versione}`, candidata, inAttesa };
}

export function frase(v) {
  if (v.esito === 'illeggibile') return `Controllo del motore non riuscito: ${v.motivo}.`;
  const attesa = v.inAttesa.length ? ` Uscite da meno di ${GIORNI_DI_ATTESA} giorni, si aspetta: ${v.inAttesa.map((r) => `${r.tag} (matura il ${r.maturaIl.slice(0, 10)})`).join(', ')}.` : '';
  if (v.candidata) return `C'è una versione stabile più nuova di quella fissata (${v.fissata}): ${v.candidata.tag}, uscita da ${v.candidata.giorni} giorni. Entra solo se il banco del motore non perde nulla.${attesa}`;
  return `Il motore fissato (${v.fissata}) è l'ultima stabile matura.${attesa}`;
}

/*
 * Sixth review, B1: one page of 100 releases covered 6.7 days (≈15 nightly builds a day, measured on GitHub): a stable 7 days old was
 * never seen. Pages are read until one holds a stable release not newer than the pin (everything after it is older), at most `massimo`.
 */
export async function leggiRilasci({ fetchFn = fetch, fissata = MOTORE_FISSATO, massimo = 15 } = {}) {
  const nostra = numeriDi(`v${fissata.versione}`);
  const tutti = [];
  for (let pagina = 1; pagina <= massimo; pagina += 1) {
    const r = await fetchFn(`https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=100&page=${pagina}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'talos-engine-check' }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const lotto = await r.json();
    if (!Array.isArray(lotto) || !lotto.length) break;
    tutti.push(...lotto);
    if (nostra && lotto.some((x) => x?.prerelease === false && numeriDi(x.tag_name) && confronta(numeriDi(x.tag_name), nostra) <= 0)) break;
  }
  return tutti;
}

async function principale() {
  let rilasci;
  try {
    rilasci = await leggiRilasci();
  } catch (e) {
    console.log(`Controllo del motore non riuscito: GitHub non risponde (${e.message}).`);
    process.exit(2);
  }
  const v = verdettoVersione(rilasci, MOTORE_FISSATO, Date.now());
  console.log(process.argv.includes('--json') ? JSON.stringify(v) : frase(v));
  process.exit(v.esito === 'candidata' ? 3 : v.esito === 'illeggibile' ? 2 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await principale();
