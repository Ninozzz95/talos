/*
 * ⭐ 27/10/2026 (owner: «tutti gli avvisi e gli errori anche nel mobile») — LE VOCI DEI LETTERALI DEL SERVER.
 *   Il dizionario ha due fonti legittime: le tabelle del server (`MESSAGE_BY_CODE`, `MESSAGES`, `COPIA_CONTESTO`, il registro dei rifiuti),
 *   e i testi che arrivano alla persona COSÌ COME SONO SCRITTI nel sorgente — dal canale remoto (`remoto/servizio.mjs` manda `e.message`
 *   al dispositivo) o come `explanation` della busta. Per queste seconde la voce `errori.<CODICE>.<nome>` ha l'inglese identico al
 *   letterale, e `testoErroreServer` la sceglie per corrispondenza esatta.
 *   Le guardie dei residui (ERRORI-DIZ-02, RIFIUTI-REG-02) le riconoscono da qui: una voce è legittima se il suo inglese è un letterale
 *   del server su una riga che nomina il suo codice. Se il server smette di dirlo, la voce torna un residuo: la guardia resta tale.
 *   Un letterale in backtick si confronta dopo aver messo al posto di `${NOME}` il valore di una costante NUMERICA esportata dallo stesso
 *   file (`BYTE_MASSIMI = 1024 * 1024` → 1048576); ogni altra sostituzione lo rende non confrontabile.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = fileURLToPath(new URL('../../', import.meta.url));

function fileDelServer() {
  const fuori = [join(RADICE, 'server.mjs')];
  const visita = (cartella) => {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const percorso = join(cartella, voce.name);
      if (voce.isDirectory()) visita(percorso);
      else if (voce.name.endsWith('.mjs')) fuori.push(percorso);
    }
  };
  visita(join(RADICE, 'src'));
  return fuori;
}

function costantiNumeriche(testo) {
  const valori = new Map();
  for (const m of testo.matchAll(/export const ([A-Z_][A-Z0-9_]*) = ([\d\s*]+);/gu)) {
    const valore = m[2].split('*').reduce((a, b) => a * Number(b.trim()), 1);
    if (Number.isFinite(valore)) valori.set(m[1], String(valore));
  }
  return valori;
}

let cache = null;
/** `codice → Set di letterali` presenti su una riga del server che nomina quel codice (fra apici o come chiave). */
export function letteraliPerCodice() {
  if (cache) return cache;
  cache = new Map();
  for (const file of fileDelServer()) {
    const testo = readFileSync(file, 'utf8');
    const costanti = costantiNumeriche(testo);
    for (const riga of testo.split(/\r?\n/u)) {
      const codici = [...riga.matchAll(/'([A-Z][A-Z0-9_]{2,})'/gu)].map((m) => m[1]);
      if (!codici.length) continue;
      const letterali = [];
      for (const m of riga.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/gu)) {
        if (m[3] !== undefined) {
          let ok = true;
          const sostituito = m[3].replace(/\$\{([A-Z_][A-Z0-9_]*)\}/gu, (_, nome) => (costanti.has(nome) ? costanti.get(nome) : (ok = false, '')));
          if (ok && !/\$\{/u.test(sostituito)) letterali.push(sostituito);
        } else letterali.push(m[1] ?? m[2]);
      }
      for (const codice of codici) {
        if (!cache.has(codice)) cache.set(codice, new Set());
        for (const l of letterali) if (l !== codice) cache.get(codice).add(l);
      }
    }
  }
  return cache;
}

/** Le chiavi del dizionario (senza `errori.`) il cui inglese è un letterale del server sulla riga del suo codice. */
export function vociDeiLetteraliDelServer(dizionarioEn) {
  const perCodice = letteraliPerCodice();
  const voci = new Set();
  for (const [chiave, inglese] of Object.entries(dizionarioEn)) {
    const m = /^([A-Z][A-Z0-9_]*)\.([a-z][a-z0-9_]*)$/u.exec(chiave);
    if (!m || typeof inglese !== 'string') continue;
    if (perCodice.get(m[1])?.has(inglese)) voci.add(chiave);
  }
  return voci;
}
