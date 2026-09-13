// BC-48 A · lettore di sezioni Markdown e selezione deterministica, senza chiamate al modello.
// Riferimenti: CommonMark 0.31.2; node:path del runtime verificato v24.18.0.
import { posix, win32 } from 'node:path';

export const SOGLIA_RIGHE_INDICE = 60;
const byte = testo => Buffer.byteLength(testo, 'utf8');
const slash = testo => String(testo).replace(/\\/g, '/');

/** Conserva righe e terminatori originali: le coordinate appartengono al disco. */
function scandisci(contenuto) {
  const righe = String(contenuto).match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const commenti = [];
  let recinto = null;
  let commento = null;
  const lette = righe.map((originale, indice) => {
    const riga = originale.replace(/\r?\n$/, '');
    const citazione = riga.match(/^(?: {0,3}>[ \t]?)+/)?.[0] ?? '';
    const interna = riga.slice(citazione.length);
    if (recinto?.citato && !citazione) recinto = null;
    if (!commento && recinto) {
      const chiusura = interna.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (chiusura && chiusura[1][0] === recinto.delimitatore[0] && chiusura[1].length >= recinto.delimitatore.length) recinto = null;
      return { originale, pulita: originale, codice: true };
    }
    if (!commento) {
      const apertura = interna.replace(/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/, '').match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (apertura && !(apertura[1][0] === '`' && apertura[2].includes('`'))) {
        recinto = { delimitatore: apertura[1], citato: Boolean(citazione) };
        return { originale, pulita: originale, codice: true };
      }
      if (/^( {4}|\t)/.test(interna)) return { originale, pulita: originale, codice: true };
    }
    let pulita = '';
    for (let i = 0; i < originale.length;) {
      if (commento) {
        if (originale.startsWith('-->', i)) {
          commenti.push(commento); commento = null; i += 3;
        } else {
          commento.testo += originale[i];
          if (originale[i] === '\n' || originale[i] === '\r') pulita += originale[i];
          i++;
        }
      } else if (originale.startsWith('<!--', i)) {
        commento = { da: indice + 1, testo: '' }; i += 4;
      } else if (originale[i] === '`') {
        const delimitatore = originale.slice(i).match(/^`+/)[0];
        const fine = originale.indexOf(delimitatore, i + delimitatore.length);
        const dopo = fine < 0 ? i + delimitatore.length : fine + delimitatore.length;
        pulita += originale.slice(i, dopo); i = dopo;
      } else { pulita += originale[i]; i++; }
    }
    return { originale, pulita, codice: false };
  });
  return { righe: lette, commenti };
}

export function rimuoviCommentiHtml(contenuto) {
  return scandisci(contenuto).righe.map(r => r.pulita).join('');
}

function primaFrase(testo) {
  const righe = testo.split(/\r?\n/).slice(1);
  const paragrafo = [];
  for (const riga of righe) {
    if (!riga.trim()) { if (paragrafo.length) break; else continue; }
    if (paragrafo.length && /^\s*(?:[-*+] |\d+[.)] |#|```|~~~)/.test(riga)) break;
    paragrafo.push(riga.trim().replace(/^(?:[-*+] |\d+[.)] )/, ''));
  }
  const frase = paragrafo.join(' ').replace(/\s+/g, ' ').trim();
  return frase.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? frase;
}

export function analizzaSezioniIstruzioni(contenuto) {
  const { righe, commenti } = scandisci(contenuto);
  const inizi = righe.flatMap((r, i) => {
    const titolo = !r.codice && r.pulita.match(/^ {0,3}##[ \t]+(.+?)[ \t]*(?:\r?\n)?$/);
    return titolo ? [{ titolo: titolo[1].replace(/[ \t]+#+[ \t]*$/, '').trim(), da: i + 1 }] : [];
  });
  const sezioni = inizi.map((inizio, i) => {
    const a = (inizi[i + 1]?.da ?? righe.length + 1) - 1;
    const parte = righe.slice(inizio.da - 1, a);
    const testo = parte.map(r => r.pulita).join('');
    const metadati = commenti.filter(c => c.da > inizio.da && c.da <= a);
    // Una lista separata da virgole; i gruppi {a,b} non vengono divisi.
    const paths = metadati.flatMap(c => {
      const m = c.testo.trim().match(/^talos:\s*paths:\s*([^\r\n]+)$/);
      if (!m) return [];
      return m[1].split(/,(?![^{}]*\})/).map(p => p.trim()).filter(Boolean);
    });
    return { ...inizio, a, byte: byte(parte.map(r => r.originale).join('')), testo, primaFrase: primaFrase(testo), paths,
      sempre: (i === 0 && /^Non-Negotiable(?:\s|$)/i.test(inizio.titolo)) || metadati.some(c => /^talos:\s*sempre$/.test(c.testo.trim())) };
  });
  return { righe: righe.length, testo: righe.map(r => r.pulita).join(''),
    premessa: righe.slice(0, (inizi[0]?.da ?? righe.length + 1) - 1).map(r => r.pulita).join(''), sezioni };
}

export function rendiFileIstruzioni(file, { sogliaRighe = SOGLIA_RIGHE_INDICE } = {}) {
  const analisi = analizzaSezioniIstruzioni(file.contenuto);
  const indicizzato = analisi.sezioni.length > 0 && (!slash(file.etichetta).includes('/') || analisi.righe > sogliaRighe);
  if (!indicizzato) return { ...analisi, indicizzato, sezioniSempre: [], testo: analisi.testo };
  const sempre = analisi.sezioni.filter(s => s.sempre);
  const indice = analisi.sezioni.filter(s => !s.sempre).map(s => `## ${s.titolo} · righe ${s.da}-${s.a} · ${s.byte} byte · ${s.primaFrase}`).join('\n');
  const lettura = file.lettura ?? file.etichetta;
  const guida = `Prima di lavorare su un'area, leggi la sua sezione con \`leggi\` su \`${lettura}\` alle righe indicate (righe del file su disco). Le sezioni con un percorso si aprono da sole quando tocchi quei file, se la gestione del contesto è attiva.\n`;
  return { ...analisi, indicizzato, sezioniSempre: sempre.map(({ titolo, da, a, byte }) => ({ etichetta: file.etichetta, titolo, da, a, byte })),
    testo: analisi.premessa + sempre.map(s => s.testo).join('') + guida + indice + (indice ? '\n' : '') };
}

function percorsoNelProgetto(percorso, cartella, radice) {
  if (typeof percorso !== 'string' || !percorso.trim() || /[\r\n\0]/.test(percorso)) return null;
  const api = /^[A-Za-z]:\/|^\/{2}/.test(slash(radice)) ? win32 : posix;
  const pieno = api.resolve(cartella, slash(percorso));
  const rel = slash(api.relative(radice, pieno));
  if (rel === '..' || rel.startsWith('../') || api.isAbsolute(rel)) return null;
  return rel || '.';
}

function percorsiToccati(messages, cartella, radice) {
  const chiamate = new Map();
  const pendenti = new Set();
  const percorsi = new Set();
  for (const messaggio of messages) {
    if (messaggio?.role === 'assistant') for (const c of messaggio.tool_calls ?? []) {
      if (typeof c?.id !== 'string') continue;
      chiamate.set(c.id, c); pendenti.add(c.id);
    }
    if (messaggio?.role !== 'tool' || !pendenti.has(messaggio.tool_call_id)) continue;
    pendenti.delete(messaggio.tool_call_id);
    const chiamata = chiamate.get(messaggio.tool_call_id);
    const nome = chiamata?.function?.name;
    if (!['leggi', 'scrivi', 'cerca', 'elenca'].includes(nome)) continue;
    let argomenti;
    try { argomenti = JSON.parse(chiamata.function.arguments); } catch { continue; }
    if (!argomenti || typeof argomenti !== 'object' || Array.isArray(argomenti)) continue;
    const candidati = [];
    if (nome !== 'cerca') {
      const percorso = ['percorso', 'path', 'file_path', 'filePath', 'file', 'filename'].map(k => argomenti[k]).find(v => typeof v === 'string' && v.trim());
      if (percorso) candidati.push(percorso);
      else if (nome === 'elenca') candidati.push('.');
    }
    // Questi due attrezzi restituiscono percorsi, uno per riga. Le code sono avvisi,
    // non risultati: non leggere mai percorsi dal contenuto di leggi o di una shell.
    if (['cerca', 'elenca'].includes(nome) && typeof messaggio.content === 'string') {
      for (const riga of messaggio.content.split(/\r?\n/)) {
        if (/^(?:⚠|…|no file matches\.|give at least|".*not a readable folder)/.test(riga)) break;
        if (riga.trim()) candidati.push(riga);
      }
    }
    for (const candidato of candidati) {
      const percorso = percorsoNelProgetto(candidato, cartella, radice);
      if (percorso !== null) percorsi.add(percorso);
    }
  }
  return { percorsi: [...percorsi], pendenti: pendenti.size };
}

function combacia(percorso, glob) {
  const modello = slash(glob).replace(/^\.\//, '');
  // Pattern confinati, espansione limitata: non permettere esplosioni di brace.
  if (modello.length > 1024 || modello.startsWith('/') || /(^|\/)\.\.(\/|$)|^[A-Za-z]:/.test(modello) || (modello.match(/\{/g)?.length ?? 0) > 1) return false;
  try { return posix.matchesGlob(percorso, modello); } catch { return false; }
}

/** Accoda agli originali. Stato locale più marcatori nello storico: nessun registro globale. */
export function creaIniettoreSezioni({ file = [], cartella, radice, tetto = 24_000 } = {}) {
  const catalogo = file.flatMap(f => {
    const resa = rendiFileIstruzioni(f);
    const occorrenze = new Map();
    return resa.indicizzato ? resa.sezioni.map(s => {
      const occorrenza = (occorrenze.get(s.titolo) ?? 0) + 1;
      occorrenze.set(s.titolo, occorrenza);
      return { ...s, occorrenza, etichetta: f.etichetta, lettura: f.lettura ?? f.etichetta };
    }).filter(s => !s.sempre && s.paths.length) : [];
  });
  const viste = new Set();
  return messages => {
    if (!Array.isArray(messages) || !catalogo.length) return;
    const { percorsi, pendenti } = percorsiToccati(messages, cartella, radice);
    if (pendenti) return; // Preserva l'abbinamento anche nei batch di tool.
    const aggiunte = [];
    for (const sezione of catalogo) {
      const marca = `Sezione di \`${sezione.etichetta}\` che vale per questa cartella: ${sezione.titolo} (${sezione.occorrenza}).\n`;
      if (viste.has(marca)) continue;
      if (messages.some(m => m?.role === 'user' && typeof m.content === 'string' && m.content.startsWith(marca))) { viste.add(marca); continue; }
      if (!sezione.paths.some(glob => percorsi.some(p => combacia(p, glob)))) continue;
      const intera = marca + `Righe ${sezione.da}-${sezione.a} del file su disco.\n` + sezione.testo;
      const avviso = marca + `⚠ Tetto delle istruzioni (${tetto} byte): sezione omessa intera. Leggila con \`leggi\` su \`${sezione.lettura}\`, righe ${sezione.da}-${sezione.a}.`;
      aggiunte.push({ marca, content: intera, avviso });
    }
    let totale = aggiunte.reduce((n, a) => n + byte(a.content), 0);
    for (let i = aggiunte.length - 1; totale > tetto && i >= 0; i--) {
      const a = aggiunte[i];
      if (byte(a.avviso) >= byte(a.content)) continue;
      totale += byte(a.avviso) - byte(a.content);
      a.content = a.avviso;
    }
    if (totale > tetto) throw new RangeError('Il tetto delle istruzioni è insufficiente anche per gli avvisi delle sezioni.');
    for (const { marca, content } of aggiunte) {
      messages.push({ role: 'user', content });
      viste.add(marca);
    }
  };
}
