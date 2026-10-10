import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/*
 * R4 — SEGMENTO COMPATTO, FASE 2 (24/09/2026): le prove UNITARIE della tassonomia e del riassunto.
 *
 * Scritte ROSSE prima della cura (metodo del brief): il 24/09 il prodotto contava un `elenca` come
 * «ricerca completata» (D1), una `file_edit` come «altra azione» (D2) e non diceva quale specie era
 * fallita (D3) — `src/legacy/app.js:11493` (`cerca || elenca → 'cercato'`), `:11505` (`return 'altro'`),
 * `:11353` (il ciclo non conosce i falliti per specie). La tassonomia vive in UN posto solo
 * (`components/nomi-attrezzi.js`, regola dell'owner del 04/09) e il riassunto in `attivita-segmento.js`.
 *
 * Ogni prova dice cosa la farebbe diventare rossa; le decisioni dell'owner (D1…D14, 23-24/09/2026) sono
 * citate accanto a ciò che provano.
 */
import {
  SPECIE_ATTREZZI, ORDINE_SPECIE, specieAttrezzo, fraseSpecie, verboAttrezzo, iconaSpecie,
} from '../../src/components/nomi-attrezzi.js';
import {
  bersaglioAttrezzo, titoloRagionamento, fraseAdesso, riassuntoVoci, creaRegolaAdesso, testoDelSegmento,
  PERMANENZA_MINIMA_AZIONE_MS, PAUSA_PROSSIMO_PASSO_MS, SOGLIA_FILTRI, TETTO_BERSAGLI_PX, LARGHEZZA_MINIMA_BERSAGLI_PX,
} from '../../src/components/attivita-segmento.js';

const qui = path.dirname(fileURLToPath(import.meta.url));
const attrezzo = (nome, argomenti, stato = 'riuscito', extra = {}) => ({ tipo: 'tool', nome, argomenti, stato, specie: specieAttrezzo(nome, extra.operazione), esito: extra.esito ?? '', diff: extra.diff ?? null, ...extra });
const ragionamento = (testo, durataMs = null, stato = 'concluso') => ({ tipo: 'reasoning', testo, durataMs, stato });

test('ATTIVITA-D1-01 — un elenco NON è una ricerca, una modifica NON è «altra azione», niente «completate»', () => {
  assert.equal(specieAttrezzo('elenca'), 'elenco');
  assert.equal(specieAttrezzo('cerca'), 'ricerca');
  assert.equal(specieAttrezzo('file_edit'), 'modifica');
  assert.equal(specieAttrezzo('scrivi', 'add'), 'creazione');
  assert.equal(specieAttrezzo('scrivi', 'replace'), 'modifica');
  assert.equal(specieAttrezzo('scrivi'), 'scrittura');
  assert.equal(specieAttrezzo('prova'), 'test');
  assert.equal(fraseSpecie('elenco', 1), '1 cartella elencata');
  assert.equal(fraseSpecie('elenco', 2), '2 cartelle elencate');
  assert.equal(fraseSpecie('ricerca', 1), '1 ricerca');
  assert.equal(fraseSpecie('modifica', 1), '1 file modificato');
  for (const specie of ORDINE_SPECIE) {
    for (const n of [1, 3]) {
      for (const forma of [{}, { breve: true }, { fallito: true }]) {
        const frase = fraseSpecie(specie, n, forma);
        assert.doesNotMatch(frase, /completat|altr[ae] azion|…$/, `${specie} ${n} ${JSON.stringify(forma)}: «${frase}»`);
        assert.match(frase, new RegExp(`^${n} `), `il numero apre la frase: «${frase}»`);
      }
    }
  }
  /* Un attrezzo senza parole nostre si chiama col suo nome umano, mai «altra azione» (D1). */
  assert.equal(specieAttrezzo('memory_write'), 'altro:memory_write');
  assert.equal(fraseSpecie('altro:memory_write', 1), 'scrittura in memoria');
  assert.equal(fraseSpecie('altro:memory_write', 2), 'scrittura in memoria ×2');
  assert.equal(fraseSpecie('altro:mcp__github__create_issue', 1), 'create issue (github)');
});

test('ATTIVITA-D1-02 — la tabella delle specie è completa e ogni icona esiste nello sprite', () => {
  const sprite = readFileSync(path.join(qui, '..', '..', 'index.template.html'), 'utf8');
  assert.ok(ORDINE_SPECIE.length >= 10, `specie dichiarate: ${ORDINE_SPECIE.length}`);
  for (const [specie, s] of Object.entries(SPECIE_ATTREZZI)) {
    for (const campo of ['uno', 'molti', 'fallitoUno', 'fallitoMolti', 'filtro', 'icona']) assert.ok(s[campo], `${specie}.${campo}`);
    assert.ok(sprite.includes(`id="${s.icona}"`), `icona ${s.icona} di ${specie} nello sprite`);
    assert.equal(iconaSpecie(specie), s.icona);
  }
  assert.equal(iconaSpecie('altro:qualunque'), 'i-bolt');
  assert.deepEqual(verboAttrezzo('leggi'), ['Letto', 'Legge']);
  assert.deepEqual(verboAttrezzo('elenca'), ['Elencato', 'Elenca']);
  assert.equal(verboAttrezzo('memory_write')[0], 'scrittura in memoria');
});

test('ATTIVITA-D1-03 — il riassunto: parti intere e brevi, ragionamenti in coda con la somma SOLO se tutte le durate sono note', () => {
  const voci = [
    ragionamento('**Cerco dove nasce la categoria**\n\nPrima…', 4_000),
    attrezzo('cerca', { testo: 'categoriaAttrezzoPerBatch' }),
    attrezzo('leggi', { percorso: 'harness-ui/frontend/src/legacy/app.js' }),
    attrezzo('elenca', { percorso: 'harness-ui/frontend/tests/unit' }),
    ragionamento('«elenca» e «cerca»…', 7_000),
    attrezzo('file_edit', { percorso: 'harness-ui/frontend/src/legacy/app.js' }, 'riuscito', { diff: { piu: 2, meno: 1 } }),
    attrezzo('shell', { comando: 'node --test x', descrizione: 'Esegue i test del riassunto' }, 'riuscito', { esito: 'exit 0\nok' }),
    ragionamento('I test passano.', 2_000),
    attrezzo('leggi', { percorso: 'harness-ui/frontend/src/components/nomi-attrezzi.js' }),
  ];
  const r = riassuntoVoci(voci);
  assert.deepEqual(r.parti, ['2 file letti', '1 ricerca', '1 cartella elencata', '1 file modificato', '1 comando', '3 ragionamenti (13 s)']);
  assert.deepEqual(r.partiBrevi, ['2 letti', '1 ricerca', '1 elenco', '1 modifica', '1 comando', '3 ragionamenti']);
  assert.deepEqual(r.diff, { piu: 2, meno: 1 });
  assert.equal(r.nFalliti, 0);
  assert.deepEqual(r.erroriParti, []);
  assert.deepEqual(r.bersagli, ['«categoriaAttrezzoPerBatch»', 'app.js', 'unit/', 'Esegue i test del riassunto', 'nomi-attrezzi.js']);
  assert.equal(r.inCorso, null);
  /* Una durata ignota toglie la parentesi a TUTTI: una somma parziale sarebbe un numero falso. */
  const senza = riassuntoVoci([ragionamento('a', 4_000), ragionamento('b', null)]);
  assert.deepEqual(senza.parti, ['2 ragionamenti']);
  /* Nessuna parte finisce con «…»: la forma breve esiste apposta (D1). */
  for (const p of [...r.parti, ...r.partiBrevi]) assert.doesNotMatch(p, /…$/);
});

/*
 * Owner 10/10/2026 («· 2 in corso»): quattro comandi, due IN PARALLELO, uno finito e uno sfondato. La carta diceva «2 comandi» e
 * il secondo in corso spariva (nota di «talos desktop»). I conteggi restano dei finiti; i vivi si contano a parte, tutti.
 */
test('ATTIVITA-PARALLELO-01 — two commands running at once: the finished are counted, and «2 in corso» says the running ones, the narrated one included', () => {
  const shell = (comando, stato) => attrezzo('shell', { comando }, stato);
  const quattro = riassuntoVoci([shell('npm run dev', 'riuscito'), shell('npm test', 'riuscito'), shell('npm run lint', 'in-corso'), shell('npm run build', 'in-corso')]);
  assert.deepEqual(quattro.parti, ['2 comandi', '2 in corso']);
  assert.deepEqual(quattro.partiBrevi, ['2 comandi', '2 in corso']);
  assert.equal(quattro.inCorso.argomenti.comando, 'npm run build', 'the narrated one is still the last running');
  /* AL CONTRARIO: uno solo in corso lo racconta già la frase viva — la riga resta quella di prima */
  const uno = riassuntoVoci([shell('npm test', 'riuscito'), shell('npm run build', 'in-corso')]);
  assert.deepEqual(uno.parti, ['1 comando']);
  /* la frase viva racconta un ragionamento: l'attrezzo in corso non lo dice nessuno, quindi si conta */
  const sotto = riassuntoVoci([shell('npm run build', 'in-corso'), ragionamento('**Aspetto il build**', null, 'in-corso')]);
  assert.deepEqual(sotto.parti, ['1 in corso']);
  /* nessun attrezzo in corso: niente parte nuova, anche con un ragionamento vivo */
  assert.deepEqual(riassuntoVoci([shell('npm test', 'riuscito'), ragionamento('…', null, 'in-corso')]).parti, ['1 comando']);
});

test('ATTIVITA-D3-01 — un fallimento si conta rosso e PER SPECIE, e non finisce fra i riusciti', () => {
  const r = riassuntoVoci([
    attrezzo('cerca', { testo: 'formattaConteggioAttivita' }),
    attrezzo('shell', { comando: 'npm run test:unit', descrizione: 'Esegue i test unitari del frontend' }, 'fallito', { esito: 'exit 1\n✖ …' }),
    ragionamento('**Il test fallisce come previsto**', 3_000),
    attrezzo('leggi', { percorso: 'tests/unit/ragionamento.test.mjs' }),
  ]);
  assert.deepEqual(r.parti, ['1 file letto', '1 ricerca', '1 ragionamento (3 s)']);
  assert.deepEqual(r.erroriParti, ['1 comando non riuscito']);
  assert.equal(r.nFalliti, 1);
  const due = riassuntoVoci([attrezzo('leggi', { percorso: 'a' }, 'fallito'), attrezzo('leggi', { percorso: 'b' }, 'fallito'), attrezzo('cerca', { testo: 'q' }, 'fallito')]);
  assert.deepEqual(due.erroriParti, ['2 letture non riuscite', '1 ricerca non riuscita']);
});

test('ATTIVITA-D11-01 — la frase viva ha il verbo al presente in testa, il bersaglio corto, e mai un nome tecnico', () => {
  assert.equal(fraseAdesso(attrezzo('cerca', { testo: 'R4-CHAT-ACTIVITY-ERROR' }, 'in-corso')), 'Cerca «R4-CHAT-ACTIVITY-ERROR»…');
  assert.equal(fraseAdesso(attrezzo('leggi', { percorso: 'harness-ui/frontend/src/legacy/app.js' }, 'in-corso')), 'Legge app.js…');
  assert.equal(fraseAdesso(attrezzo('elenca', { percorso: 'harness-ui/frontend/tests/browser' }, 'in-corso')), 'Elenca browser/…');
  /* La descrizione del modello è già una frase al presente: non si mette «Esegue» davanti a «Esegue i test». */
  assert.equal(fraseAdesso(attrezzo('shell', { comando: 'npm test', descrizione: 'Esegue i test' }, 'in-corso')), 'Esegue i test…');
  assert.equal(fraseAdesso(attrezzo('shell', { comando: 'npm test' }, 'in-corso')), 'Esegue npm test…');
  assert.equal(fraseAdesso(attrezzo('leggi', {}, 'in-corso')), 'Legge…');
  assert.equal(fraseAdesso(attrezzo('memory_write', { title: 'x' }, 'in-corso')), 'scrittura in memoria…');
  assert.equal(fraseAdesso(ragionamento('**Cerco le prove sugli errori**\n\nIl file…', null, 'in-corso')), 'Sta ragionando: Cerco le prove sugli errori');
  assert.equal(fraseAdesso(ragionamento('', null, 'in-corso')), 'Sta ragionando…');
  assert.equal(fraseAdesso(null), '');
});

test('ATTIVITA-D12-01 — anti-lampeggio: un\'azione nuova aspetta 700 ms, la stessa che si precisa cambia subito, dopo 2 s di pausa «Prepara il passo successivo…»', () => {
  assert.equal(PERMANENZA_MINIMA_AZIONE_MS, 700);
  assert.equal(PAUSA_PROSSIMO_PASSO_MS, 2000);
  let ora = 10_000;
  const regola = creaRegolaAdesso({ orologio: () => ora });
  const t1 = attrezzo('leggi', {}, 'in-corso'); t1.id = 't1';
  assert.equal(regola.prossimo({ vivo: true, inCorso: t1 }), 'Legge…');
  t1.argomenti = { percorso: 'src/app.js' };
  ora += 100;
  assert.equal(regola.prossimo({ vivo: true, inCorso: t1 }), 'Legge app.js…', 'la stessa voce che si precisa si aggiorna subito');
  const t2 = attrezzo('cerca', { testo: 'q' }, 'in-corso'); t2.id = 't2';
  ora += 200;
  assert.equal(regola.prossimo({ vivo: true, inCorso: t2 }), 'Legge app.js…', 'una voce nuova non scalza la vecchia prima di 700 ms');
  ora += 700;
  assert.equal(regola.prossimo({ vivo: true, inCorso: t2 }), 'Cerca «q»…');
  /* Fra due passi: la riga non dice mai «concluso»; dopo 2 s dice cosa sta facendo il modello. */
  ora += 300;
  assert.equal(regola.prossimo({ vivo: true, inCorso: null }), 'Cerca «q»…', 'nella pausa resta l\'ultima azione');
  ora += 2_000;
  assert.equal(regola.prossimo({ vivo: true, inCorso: null }), 'Prepara il passo successivo…');
  const t3 = attrezzo('leggi', { percorso: 'b.js' }, 'in-corso'); t3.id = 't3';
  ora += 10;
  assert.equal(regola.prossimo({ vivo: true, inCorso: t3 }), 'Legge b.js…', 'un riempitivo non trattiene mai un\'azione vera');
  assert.equal(regola.prossimo({ vivo: false, inCorso: null }), '', 'concluso: nessuna frase viva');
});

test('ATTIVITA-D2-01 — il bersaglio: nome corto per la riga, percorso accorciato nel mezzo per la voce, virgolette per le ricerche', () => {
  assert.equal(bersaglioAttrezzo('leggi', { percorso: 'harness-ui/frontend/src/legacy/app.js' }, { corto: true }), 'app.js');
  assert.equal(bersaglioAttrezzo('leggi', { percorso: 'harness-ui/frontend/src/legacy/app.js' }), 'harness-ui/frontend/src/legacy/app.js');
  const lungo = bersaglioAttrezzo('leggi', { percorso: `a/${'b'.repeat(40)}/${'c'.repeat(40)}/d.js` });
  assert.ok(lungo.length <= 64 && lungo.includes('…') && lungo.endsWith('d.js'), lungo);
  assert.equal(bersaglioAttrezzo('elenca', { percorso: 'tests/unit' }, { corto: true }), 'unit/');
  assert.equal(bersaglioAttrezzo('elenca', {}), 'la radice del progetto');
  assert.equal(bersaglioAttrezzo('cerca', { nome: '*.mjs', testo: 'x' }), '«*.mjs · x»');
  assert.equal(bersaglioAttrezzo('web_search', { query: 'talos' }), '«talos»');
  assert.equal(bersaglioAttrezzo('shell', { comando: 'ls', descrizione: 'Elenca' }, { corto: true }), 'Elenca');
  assert.equal(bersaglioAttrezzo('shell', { comando: 'ls', descrizione: 'Elenca' }), 'ls');
  assert.equal(bersaglioAttrezzo('time_now', {}), '');
  assert.equal(SOGLIA_FILTRI, 6);
  assert.equal(TETTO_BERSAGLI_PX, 520);
  assert.equal(LARGHEZZA_MINIMA_BERSAGLI_PX, 64);
});

test('ATTIVITA-D14-01 — il titolo di un ragionamento: il grassetto su riga intera, altrimenti la prima frase, mai a metà', () => {
  assert.equal(titoloRagionamento('**Cerco dove nasce la categoria**\n\nPrima di cambiare…'), 'Cerco dove nasce la categoria');
  assert.equal(titoloRagionamento('I test passano: la categoria nuova non cambia il conteggio. Altro.'), 'I test passano: la categoria nuova non cambia il conteggio.');
  assert.equal(titoloRagionamento('**153**: 1³ + 5³ = 153. Poi 407.'), '153: 1³ + 5³ = 153.');
  const lungo = titoloRagionamento(`${'parola '.repeat(40)}fine.`);
  assert.ok(lungo.length <= 110 && lungo.endsWith('…'), lungo);
  assert.equal(titoloRagionamento(''), '');
});

test('ATTIVITA-D6-01 — «Copia l\'attività come testo»: una riga per voce, il ragionamento citato, l\'esito detto', () => {
  const testo = testoDelSegmento([
    attrezzo('leggi', { percorso: 'src/a.js' }),
    ragionamento('**Titolo**\n\nCorpo.', 4_000),
    attrezzo('shell', { comando: 'npm test', descrizione: 'Esegue i test' }, 'fallito', { esito: 'exit 1' }),
    attrezzo('cerca', { testo: 'q' }, 'in-corso'),
  ]);
  assert.deepEqual(testo.split('\n'), [
    '- Letto src/a.js',
    '- Ha ragionato per 4 s: Titolo',
    '  > **Titolo**',
    '  > ',
    '  > Corpo.',
    '- Esegue i test npm test (non riuscito)',
    '- Cerca «q» (in corso)',
  ]);
});
