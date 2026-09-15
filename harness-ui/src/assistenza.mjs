import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CARTELLA_ASSISTENZA_PREDEFINITA = fileURLToPath(new URL('../../docs/assistenza/', import.meta.url));
export const MAX_DOMANDA_ASSISTENZA = 500;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_RISPOSTA = 1200;
const CACHE = new Map();
const PAROLE_VUOTE = new Set([
  'che', 'chi', 'cosa', 'come', 'con', 'cui', 'dal', 'del', 'della', 'delle', 'degli', 'dei',
  'dove', 'fare', 'faccio', 'fanno', 'gli', 'nel', 'nella', 'nelle', 'per', 'puo', 'puoi', 'sono',
  'sul', 'sulla', 'tra', 'una', 'uno', 'questa', 'questo', 'funziona',
]);

export function normalizzaDomandaAssistenza(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('it')
    .replace(/[^a-z0-9]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

function ancora(titolo) {
  return normalizzaDomandaAssistenza(titolo).replace(/\s+/gu, '-');
}

function testoLeggibile(markdown) {
  return String(markdown ?? '')
    .replace(/```[\s\S]*?```/gu, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/^>\s?/gmu, '')
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gmu, '')
    .replace(/^[-*+]\s+/gmu, '• ')
    .replace(/^\d+\.\s+/gmu, '')
    .replace(/[*_`#]/gu, '')
    .replace(/\|/gu, ' ')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function estrattoRilevante(testo, parole, massimo) {
  const passaggi = String(testo).split(/\n{2,}|(?=\n• )/gu).map((passaggio) => passaggio.trim()).filter(Boolean);
  const ordinati = passaggi.map((passaggio, indice) => {
    const normalizzato = normalizzaDomandaAssistenza(passaggio);
    const trovate = parole.filter((parola) => normalizzato.includes(parola)).length;
    return { passaggio, indice, punteggio: (trovate * 10) + (trovate > 0 && passaggio.startsWith('• ') ? 20 : 0) };
  }).filter(({ punteggio }) => punteggio > 0)
    .sort((a, b) => b.punteggio - a.punteggio || a.indice - b.indice);
  const scelti = [];
  let usati = 0;
  for (const candidato of ordinati) {
    const costo = candidato.passaggio.length + (scelti.length ? 2 : 0);
    if (costo > massimo - usati) continue;
    scelti.push(candidato.passaggio);
    usati += costo;
    if (scelti.length === 4) break;
  }
  if (scelti.length) return scelti.join('\n\n');
  return String(testo).slice(0, massimo).trim();
}

function sezioniDi(nomeFile, markdown) {
  const righe = String(markdown).split(/\r?\n/u);
  const titolo = righe.find((riga) => /^#\s+/u.test(riga))?.replace(/^#\s+/u, '').trim() || nomeFile.replace(/\.md$/iu, '');
  const sezioni = [];
  let nome = titolo;
  let corpo = [];
  const salva = () => {
    const testo = testoLeggibile(corpo.join('\n'));
    if (testo) sezioni.push({ titolo, sezione: nome, testo, nomeFile });
  };
  for (const riga of righe) {
    const match = /^##\s+(.+)$/u.exec(riga);
    if (match) { salva(); nome = match[1].trim(); corpo = []; }
    else if (!/^#\s+/u.test(riga)) corpo.push(riga);
  }
  salva();
  return sezioni;
}

export async function indicizzaAssistenza({ cartella = CARTELLA_ASSISTENZA_PREDEFINITA } = {}) {
  const chiave = String(cartella);
  if (!CACHE.has(chiave)) {
    CACHE.set(chiave, (async () => {
      const nomi = (await readdir(cartella))
        .filter((nome) => nome.toLowerCase().endsWith('.md') && nome.toLowerCase() !== 'readme.md')
        .sort();
      const sezioni = [];
      for (const nome of nomi) {
        const percorso = join(cartella, nome);
        if ((await stat(percorso)).size > MAX_FILE_BYTES) continue;
        sezioni.push(...sezioniDi(nome, await readFile(percorso, 'utf8')));
      }
      return sezioni;
    })());
  }
  return CACHE.get(chiave);
}

export async function cercaAssistenza({ domanda, cartella = CARTELLA_ASSISTENZA_PREDEFINITA } = {}) {
  const normalizzata = normalizzaDomandaAssistenza(domanda);
  const parole = [...new Set(normalizzata.split(' ').filter((parola) => parola.length >= 3 && !PAROLE_VUOTE.has(parola)))];
  if (!normalizzata || normalizzata.length > MAX_DOMANDA_ASSISTENZA || parole.length === 0) return { risposta: 'non lo so', fonti: [] };
  const candidati = (await indicizzaAssistenza({ cartella })).map((voce) => {
    const titolo = normalizzaDomandaAssistenza(voce.titolo);
    const sezione = normalizzaDomandaAssistenza(voce.sezione);
    const testo = normalizzaDomandaAssistenza(voce.testo);
    const trovate = parole.filter((parola) => titolo.includes(parola) || sezione.includes(parola) || testo.includes(parola));
    const punteggio = (testo.includes(normalizzata) || sezione.includes(normalizzata) ? 8 : 0)
      + trovate.reduce((somma, parola) => somma + (sezione.includes(parola) ? 5 : titolo.includes(parola) ? 3 : 1), 0);
    return { ...voce, trovate: trovate.length, punteggio };
  }).filter((voce) => voce.punteggio >= 4 && voce.trovate >= Math.ceil(parole.length / 2))
    .sort((a, b) => b.punteggio - a.punteggio || a.nomeFile.localeCompare(b.nomeFile, 'it'));
  const migliore = candidati[0];
  if (!migliore) return { risposta: 'non lo so', fonti: [] };
  const intestazione = `${migliore.titolo} — ${migliore.sezione}`;
  const corpo = estrattoRilevante(migliore.testo, parole, MAX_RISPOSTA - intestazione.length - 2);
  const risposta = `${intestazione}\n\n${corpo}`.slice(0, MAX_RISPOSTA).trim();
  return {
    risposta,
    fonti: [{ titolo: migliore.titolo, sezione: migliore.sezione, percorso: `docs/assistenza/${migliore.nomeFile}#${ancora(migliore.sezione)}` }],
  };
}
