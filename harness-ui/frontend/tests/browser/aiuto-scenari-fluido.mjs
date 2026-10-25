/*
 * ⭐ 22/10/2026 — LE SCENE DEL BANCO DELLO STREAMING FLUIDO, deterministiche (un generatore con seme: la stessa scena a ogni
 *   giro, quindi un A/B confronta il codice e non il caso).
 *
 * ⛔ Le due scene sono quelle dell'owner, dette con le sue parole: «quando chiedo al modello un output di testo lungo oppure dopo
 *   una conversazione lunga». Quindi:
 *   (a) UN TESTO LUNGO (oltre 30.000 caratteri) con tutto ciò che il renderer incrementale paga di più — titoli, paragrafi,
 *       elenchi stretti (nessuna riga vuota fra le voci), una tabella grande, un recinto di codice lungo;
 *   (b) UNA CONVERSAZIONE LUNGA (300 turni conclusi, con codice e tabelle) e poi una risposta normale.
 * ⛔ La CADENZA è a scatti come quella di un fornitore vero: pezzi irregolari (da un carattere a un pacchetto di centinaia), buchi
 *   brevi e frequenti, e ogni tanto un buco da 100-800 ms. Le costanti di serie vengono dal giro vero sulla 4176 del 22/10/2026
 *   (`z-ai/glm-5.3-flash`, sforzo massimo): vedi il rapporto `RAPPORTO-STREAMING-FLUIDO-2026-10-22.md`.
 */

/** Generatore pseudo-casuale con seme (mulberry32): stessa sequenza a ogni giro. */
export function casuale(seme = 22102026) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FRASI = [
  'Il modulo legge la configurazione una volta sola e la passa a chi la usa, così nessuno la rilegge dal disco.',
  'Ogni richiesta porta con sé un identificativo, e i log lo riportano su ogni riga per ricostruire il percorso.',
  'Quando la coda supera la soglia, il servizio rallenta i produttori invece di perdere i messaggi in silenzio.',
  'La prova misura il tempo fra l’arrivo del primo byte e il primo carattere a schermo, non il tempo totale.',
  'Un errore che non si sa gestire si rilancia con il suo contesto: inghiottirlo nasconde il guasto vero.',
  'Le dipendenze si fissano a una versione esatta, e l’aggiornamento passa da una prova sul ramo dedicato.',
];

function paragrafo(r, parole = 5) {
  const pezzi = [];
  for (let i = 0; i < parole; i += 1) pezzi.push(FRASI[Math.floor(r() * FRASI.length)]);
  const testo = pezzi.join(' ');
  /* un po' di markup in linea: grassetto, codice, un collegamento — i casi che lampeggiano a metà */
  return testo.replace('configurazione', '**configurazione**').replace('identificativo', '`identificativo`')
    .replace('prova', '[prova](https://example.com/prova)');
}

/** (a) il testo lungo: oltre 30.000 caratteri. */
export function testoLungo(seme = 1) {
  const r = casuale(seme);
  const parti = ['# Guida completa al progetto\n', paragrafo(r, 6), ''];
  for (let s = 1; s <= 9; s += 1) {
    parti.push(`## ${s}. Sezione numero ${s}`, '', paragrafo(r, 6), '', paragrafo(r, 5), '');
    if (s === 2) {
      /* elenco stretto: nessuna riga vuota fra le voci, con qualche sottovoce */
      for (let v = 1; v <= 30; v += 1) {
        parti.push(`- Voce ${v}: ${FRASI[v % FRASI.length]}`);
        if (v % 7 === 0) parti.push(`  - dettaglio ${v}.1 con \`codice\` e **forza**`, `  - dettaglio ${v}.2`);
      }
      parti.push('');
    }
    if (s === 4) {
      /* tabella grande */
      parti.push('| Strumento | Tipo | Velocità | Note |', '|---|:---:|---:|---|');
      for (let riga = 1; riga <= 48; riga += 1) parti.push(`| strumento-${riga} | ${riga % 3 ? 'unità' : 'integrazione'} | ${(riga * 37) % 900} ms | ${FRASI[riga % FRASI.length].slice(0, 60)} |`);
      parti.push('');
    }
    if (s === 6) {
      /* recinto di codice lungo */
      parti.push('```js');
      for (let l = 1; l <= 150; l += 1) parti.push(`  const valore${l} = calcola(${l}, opzioni.limite ?? ${l * 3}); // passo ${l}`);
      parti.push('```', '');
    }
    if (s === 8) {
      for (let v = 1; v <= 15; v += 1) parti.push(`${v}. Passo ${v}: ${FRASI[(v + 2) % FRASI.length]}`);
      parti.push('', '> Una citazione che chiude la sezione, con **enfasi** dentro.', '');
    }
    parti.push(paragrafo(r, 7), '');
  }
  return parti.join('\n');
}

/** (b) una risposta normale (~5.000 caratteri) dopo la conversazione lunga. */
export function testoNormale(seme = 2) {
  const r = casuale(seme);
  const parti = ['Ecco il riepilogo.', '', paragrafo(r, 5), '', '## Cosa cambia', ''];
  for (let v = 1; v <= 8; v += 1) parti.push(`- ${FRASI[v % FRASI.length]}`);
  parti.push('', paragrafo(r, 6), '', '```js', ...Array.from({ length: 30 }, (_, l) => `const passo${l} = ${l};`), '```', '', paragrafo(r, 5), '');
  return parti.join('\n');
}

/** Il testo di un turno CONCLUSO della cronologia: markdown con codice e tabella (~900 caratteri). */
export function testoTurno(t) {
  return `Turno ${t}: il risultato, spiegato.\n\n${FRASI[t % FRASI.length]} ${FRASI[(t + 1) % FRASI.length]}\n\n| a | b |\n|---|---|\n| ${t} | ${t * 2} |\n| x | y |\n\n\`\`\`js\nconst x${t} = ${t};\nconsole.log(x${t});\n\`\`\`\n\nChiusura del turno ${t}, con **grassetto** e \`codice\`.\n`;
}

/** La cronologia: `turni` turni conclusi (domanda, risposta, fine), come la consegna il server. */
export function eventiCronologia(turni, sequenzaBase = 1) {
  const lista = [];
  let seq = sequenzaBase;
  for (let t = 0; t < turni; t += 1) {
    lista.push({ type: 'RunStarted', input: { consegna: `Domanda numero ${t}: spiegami il passo ${t}.`, seguito: t > 0 }, _sequenza: seq += 1 });
    lista.push({ type: 'TextMessageContent', messageId: `storia-${t}`, delta: testoTurno(t), _sequenza: seq += 1 });
    lista.push({ type: 'TextMessageEnd', messageId: `storia-${t}`, _sequenza: seq += 1 });
    lista.push({ type: 'RunFinished', outcome: { type: 'success' }, _sequenza: seq += 1 });
  }
  return { lista, ultimaSequenza: seq };
}

/*
 * La cadenza a scatti: una lista di `{ dopoMs, n }` (aspetta, poi consegna n caratteri). Tre regimi mescolati, come nei giri
 * veri: (1) pezzi piccoli e fitti (1-3 token), (2) pacchetti grossi (il fornitore o la rete che consegnano insieme ciò che
 * avevano accumulato), (3) buchi lunghi. `caratteriAlSecondo` è il ritmo medio del regime fitto.
 */
export function cadenzaAScatti(totale, { seme = 7, caratteriAlSecondo = 260, probPacchetto = 0.07, probBuco = 0.035 } = {}) {
  const r = casuale(seme);
  const passi = [];
  let dato = 0;
  while (dato < totale) {
    const x = r();
    let n;
    let dopoMs;
    if (x < probBuco) {
      n = 4 + Math.floor(r() * 30);
      dopoMs = 100 + r() * 700; // il buco: 100-800 ms
    } else if (x < probBuco + probPacchetto) {
      n = 60 + Math.floor(r() * 220); // il pacchetto: 60-280 caratteri in un colpo
      dopoMs = r() * 25;
    } else {
      n = 1 + Math.floor(r() * 14);
      dopoMs = (n / caratteriAlSecondo) * 1000 * (0.4 + r() * 1.2);
    }
    n = Math.min(n, totale - dato);
    passi.push({ dopoMs: Math.round(dopoMs * 10) / 10, n });
    dato += n;
  }
  return passi;
}

/*
 * La cadenza a PACCHETTI del giro vero del 22/10/2026 (4176, `z-ai/glm-5.3-flash` a sforzo massimo, 11.224 caratteri in 988 delta):
 * i delta arrivano raggruppati nello stesso read di rete — 620 intervalli su 987 sotto i 5 ms — e raggruppati sono 331 pacchetti
 * da ~35 caratteri (p90 56, massimo 76) ogni ~145 ms (p25 106, p90 289, p99 455, massimo 480). Qui la stessa forma, con un seme:
 * ogni pacchetto è 3-6 delta consegnati insieme (a 0-1 ms l'uno dall'altro), poi un buco.
 */
export function cadenzaAPacchetti(totale, { seme = 13 } = {}) {
  const r = casuale(seme);
  const passi = [];
  let dato = 0;
  while (dato < totale) {
    const x = r();
    /* il buco fra pacchetti: quasi sempre 90-200 ms, a volte 250-480 */
    const buco = x < 0.12 ? 250 + r() * 230 : x < 0.25 ? 20 + r() * 70 : 95 + r() * 110;
    const caratteri = Math.max(6, Math.round(14 + r() * 42));
    const delta = 3 + Math.floor(r() * 4);
    for (let d = 0; d < delta && dato < totale; d += 1) {
      const n = Math.min(totale - dato, Math.max(1, Math.round(caratteri / delta)));
      passi.push({ dopoMs: d === 0 ? Math.round(buco) : Math.round(r() * 10) / 10, n });
      dato += n;
    }
  }
  return passi;
}

/** Una cadenza REGOLARE e veloce (il fornitore più veloce del ritmo): `n` caratteri ogni `ogniMs`. */
export function cadenzaRegolare(totale, n = 11, ogniMs = 12) {
  const passi = [];
  for (let dato = 0; dato < totale; dato += n) passi.push({ dopoMs: ogniMs, n: Math.min(n, totale - dato) });
  return passi;
}

/** Una cadenza registrata (dal giro vero): gli arrivi `{t, n}` diventano passi `{dopoMs, n}`, ricampionati fino a `totale`. */
export function cadenzaDaTraccia(arrivi, totale, seme = 11) {
  const coppie = [];
  for (let i = 1; i < arrivi.length; i += 1) coppie.push({ dopoMs: Math.max(0, arrivi[i].t - arrivi[i - 1].t), n: arrivi[i].n });
  if (coppie.length === 0) return cadenzaAScatti(totale);
  const passi = [];
  let dato = 0;
  let i = 0;
  const r = casuale(seme);
  /* la traccia si ripete così com'è finché basta; oltre, si ricampiona a blocchi di 40 passi contigui (si conserva la forma dei
     pacchetti e dei buchi, non solo le loro frequenze) */
  while (dato < totale) {
    if (i >= coppie.length) i = Math.floor(r() * Math.max(1, coppie.length - 40));
    const { dopoMs, n } = coppie[i];
    const m = Math.min(n, totale - dato);
    if (m > 0) passi.push({ dopoMs, n: m });
    dato += m;
    i += 1;
  }
  return passi;
}
