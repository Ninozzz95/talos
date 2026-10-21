#!/usr/bin/env node
/*
 * 18/10/2026 — il controllo del Cargo.lock con cui la nostra CI compila il binding iroh (`.github/workflows/iroh-binding.yml`).
 * Fallisce se una dipendenza di sicurezza è sotto la versione corretta:
 *   · rustls ≥ 0.23.45 — RUSTSEC-2026-0285 (rustsec.org, emessa il 14/09/2026, letta il 17/10: «TLS 1.3 handshake messages
 *     incorrectly accepted across encryption level boundaries», corretta in >= 0.23.45);
 *   · iroh e iroh-relay ≥ 1.0.2 — «properly handle invalid messages» nel relay (note di release di iroh 1.0.2, 06/07/2026).
 * Un pacchetto che compare in più versioni deve averle TUTTE sopra il minimo.
 * Uso: node controlla-lock.mjs <Cargo.lock>
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MINIMI = Object.freeze({ rustls: '0.23.45', iroh: '1.0.2', 'iroh-relay': '1.0.2' });

const numeri = (v) => String(v).split('-')[0].split('.').map((n) => Number.parseInt(n, 10));
export function almeno(versione, minimo) {
  const a = numeri(versione); const b = numeri(minimo);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0; const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

/** Le versioni di ogni pacchetto del lock: nome → [versioni]. */
export function versioniDelLock(testo) {
  const mappa = new Map();
  for (const blocco of String(testo).split(/\r?\n\[\[package\]\]\r?\n/).slice(1)) {
    const nome = /^name = "([^"]+)"/m.exec(blocco)?.[1];
    const versione = /^version = "([^"]+)"/m.exec(blocco)?.[1];
    if (!nome || !versione) continue;
    if (!mappa.has(nome)) mappa.set(nome, []);
    mappa.get(nome).push(versione);
  }
  return mappa;
}

/** I problemi trovati (vuoto = va bene). Un pacchetto richiesto e ASSENTE è un problema: vuol dire lock sbagliato. */
export function problemiDelLock(testo) {
  const v = versioniDelLock(testo);
  const problemi = [];
  for (const [nome, minimo] of Object.entries(MINIMI)) {
    const trovate = v.get(nome);
    if (!trovate?.length) { problemi.push(`${nome}: not in the lock`); continue; }
    for (const x of trovate) if (!almeno(x, minimo)) problemi.push(`${nome} ${x} < ${minimo}`);
  }
  return problemi;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node controlla-lock.mjs <Cargo.lock>'); process.exit(2); }
  const problemi = problemiDelLock(readFileSync(file, 'utf8'));
  const v = versioniDelLock(readFileSync(file, 'utf8'));
  for (const nome of Object.keys(MINIMI)) console.log(`${nome} ${(v.get(nome) ?? ['—']).join(', ')}`);
  if (problemi.length) { console.error(`Cargo.lock refused:\n  ${problemi.join('\n  ')}`); process.exit(1); }
  console.log('Cargo.lock ok');
}
