/**
 * ⭐⭐⭐ LE FAVICON DELLE FONTI — prese dal server, una volta, e tenute su disco.
 *
 * Owner, 10/09: «i favicon dei siti delle fonti non ci sono (il mobile l'ha già fatto)».
 *
 * ## ⛔ Perché non si scaricano dal browser, ed è il mobile stesso a dirlo
 *
 * `mobile/src/composables/useTalosSourceCardIcons.ts`, letto oggi: «fetching a favicon at display
 * time is a request to every site every time the surface is opened» — ed è la ragione per cui là la
 * pillola mostrava solo le lettere finché non è esistito un archivio di card su disco. Aprire una
 * conversazione di mesi fa non deve bussare a ogni sito che quella conversazione ha citato.
 *
 * Sul desktop quell'archivio non c'è. Ma c'è una cosa che il telefono non ha: **un server nostro**.
 *
 * ⇒ Il browser chiede l'icona SOLO a noi (`/api/v1/favicon?dominio=…`); il server la prende una
 *   volta e la tiene su disco. Da quel momento nessuno esce più. È l'architettura di SearXNG,
 *   verificata prima di scriverla (ricerca 10/09/2026, docs.searxng.org «Favicons»): «To protect the
 *   privacy of users, favicons are provided via a proxy… A cache has been developed to massively
 *   reduce both incoming and outgoing requests.»
 *
 * ⛔ E ciò che il server NON fa, per scelta: non segue redirect fuori dal dominio chiesto, non
 *   accetta percorsi arbitrari (solo un dominio), non serve niente che non sia un'immagine piccola.
 *   Un proxy che scarica quello che gli dici è una porta aperta, non una comodità.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Un'icona è piccola per definizione: oltre questo non è un'icona, è qualcos'altro. */
export const MAX_BYTE_ICONA = 100 * 1024;

/** Quanto a lungo vale un'icona presa. Un mese: i siti cambiano logo di rado. */
export const VALIDITA_MS = 30 * 24 * 60 * 60 * 1000;

const TIMEOUT_MS = 6000;

/**
 * ⛔ Solo un dominio, e con una forma dichiarata: niente porte, niente percorsi, niente utente:password.
 *   Ciò che non combacia non viene «ripulito» — viene rifiutato. Una sanificazione permissiva è il
 *   modo classico di trasformare un proxy in una porta aperta.
 */
const DOMINIO_VALIDO = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function dominioAmmesso(raw) {
  const d = String(raw ?? '').trim().toLowerCase();
  if (!d || d.length > 253 || !DOMINIO_VALIDO.test(d)) return null;
  /* ⛔ Niente rete interna: un proxy che accetta «localhost» fa bussare il server a sé stesso. */
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(d) || d.endsWith('.local') || d.endsWith('.internal')) return null;
  return d;
}

const TIPI = new Map([
  ['image/png', '.png'], ['image/x-icon', '.ico'], ['image/vnd.microsoft.icon', '.ico'],
  ['image/svg+xml', '.svg'], ['image/jpeg', '.jpg'], ['image/webp', '.webp'], ['image/gif', '.gif'],
]);

const nomeDiCache = (dominio) => `${createHash('sha256').update(dominio).digest('hex').slice(0, 24)}.json`;

/**
 * Prende l'icona di un dominio: prima dalla cache su disco, poi dalla rete, una volta sola.
 *
 * @returns {Promise<{tipo: string, byte: Buffer, daCache: boolean}|null>} `null` se non c'è
 */
export async function iconaDelDominio(dominioGrezzo, { cartellaCache, fetchFn = globalThis.fetch, adesso = () => Date.now() } = {}) {
  const dominio = dominioAmmesso(dominioGrezzo);
  if (!dominio || !cartellaCache) return null;

  const file = join(cartellaCache, nomeDiCache(dominio));
  try {
    const salvato = JSON.parse(await readFile(file, 'utf8'));
    if (salvato && adesso() - salvato.quando < VALIDITA_MS) {
      /* ⛔ Anche un «non ce l'ha» si tiene: senza, ogni apertura riprova per ogni sito senza icona. */
      if (!salvato.base64) return null;
      return { tipo: salvato.tipo, byte: Buffer.from(salvato.base64, 'base64'), daCache: true };
    }
  } catch { /* niente in cache: si prende */ }

  let trovata = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const risposta = await fetchFn(`https://${dominio}/favicon.ico`, {
        signal: controller.signal,
        /* ⛔ `redirect: 'error'`: un redirect porterebbe altrove, e «altrove» è esattamente ciò che un
           proxy non deve seguire per conto di chi lo chiama. */
        redirect: 'error',
        headers: { accept: 'image/*' },
      });
      if (risposta.ok) {
        const tipo = String(risposta.headers?.get?.('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (TIPI.has(tipo)) {
          const byte = Buffer.from(await risposta.arrayBuffer());
          if (byte.length > 0 && byte.length <= MAX_BYTE_ICONA) trovata = { tipo, byte };
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch { /* il sito non risponde, non ha l'icona, o il redirect esce: nessuna icona, e si ricorda */ }

  try {
    await mkdir(cartellaCache, { recursive: true });
    await writeFile(file, JSON.stringify({
      quando: adesso(),
      tipo: trovata?.tipo ?? null,
      base64: trovata ? trovata.byte.toString('base64') : null,
    }), 'utf8');
  } catch { /* cache non scrivibile: si serve lo stesso, si riproverà */ }

  return trovata ? { ...trovata, daCache: false } : null;
}
