/*
 * PANNELLO v2 — la scheda AGENTI, il modello PURO (PROVE.md U-01…U-04, U-10, U-12), sui dati di prova del kit che hanno la forma vera
 * (`snapshotFiglio` + `richiesta`). Ogni prova dice cosa la fa diventare rossa. Il disegno (righe, conferma nella riga, «Rispondi»)
 * si prova nel browser: `tests/browser/pannello-agenti.spec.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { impostaLingua } from '../../src/components/lingua.js';
import { modelloAgenti, contoAgenti, PAGINA_AGENTI } from '../../src/components/pannello/agenti.js';
import { creaStato, aggiungiMolti } from '../fixtures/pannello-dati.mjs';

const ADESSO = Date.parse('2026-10-29T15:00:00Z');
const S = creaStato(ADESSO);

test('PANNELLO-U01 — «Richiede attenzione» = chi aspetta + chi non è riuscito; il conto in testa', () => {
  impostaLingua('it');
  const m = modelloAgenti({ agenti: S.agenti, domande: S.domande, adesso: ADESSO });
  assert.deepEqual(m.correnti.filter((v) => v.gruppo === 'attenzione').map((v) => v.id).sort(), ['s-a2', 's-a3']);
  assert.equal(m.per.get('s-a2').domanda.comando, 'npm test -- report', 'il perché della riga è la domanda vera della figlia (A-07)');
  assert.equal(m.per.get('s-a5').passo, 'cancelled', 'fermata dalla persona ≠ non riuscita');
  assert.equal(m.conto.totale, 7);
  assert.equal(m.conto.terminati, 4);
  assert.equal(contoAgenti({ agenti: S.agenti, domande: S.domande, adesso: ADESSO }).attenzione, 2);
});

test('PANNELLO-U02 — la pausa non è «aspetta te» (M-01): gruppo «In corso», nessun Rispondi', () => {
  const ag = S.agenti.map((a) => (a.sessionId === 's-a6' ? { ...a, conclusa: true, esitoDelega: 'in-pausa', motivoChiusura: 'in-pausa' } : a));
  const v = modelloAgenti({ agenti: ag, adesso: ADESSO }).per.get('s-a6');
  assert.equal(v.passo, 'paused');
  assert.equal(v.gruppo, 'lavoro');
  assert.equal(v.domanda, null);
});

test('PANNELLO-U03 — il figlio sta sotto il padre; un figlio che aspetta sale in attenzione UNA volta sola', () => {
  const m = modelloAgenti({ agenti: S.agenti, domande: S.domande, adesso: ADESSO });
  const padre = m.per.get('s-a1');
  assert.ok(padre.figli.some((f) => f.id === 's-a1-1'), 's-a1-1 è figlio di s-a1');
  const ag = S.agenti.map((a) => (a.sessionId === 's-a1-1' ? { ...a, conclusa: false, esitoDelega: null, approvalPendingCount: 1, inAttesaApprovazione: true } : a));
  const m2 = modelloAgenti({ agenti: ag, adesso: ADESSO });
  const att = m2.correnti.filter((v) => v.gruppo === 'attenzione').map((v) => v.id);
  assert.equal(att.filter((x) => x === 's-a1-1').length, m2.per.get('s-a1-1').gruppo === 'attenzione' ? 1 : 0, 'mai due volte');
});

test('PANNELLO-U04 — le richieste passate non entrano nel conto in testa e stanno in una piega, la più recente prima', () => {
  const m = modelloAgenti({ agenti: S.agenti, adesso: ADESSO });
  assert.equal(m.passate.length, 1);
  assert.ok(m.passate[0].agenti.every((v) => v.richiesta.corrente === false));
  assert.ok(!m.correnti.some((v) => v.richiesta?.corrente === false), 'il conto in testa conta solo la richiesta in corso');
});

test('PANNELLO-AGENTI-LIMITI — vuoto, una voce sola, tantissimi, nome lunghissimo e con caratteri strani, campi rotti', () => {
  assert.equal(modelloAgenti({}).correnti.length, 0, 'nessun agente');
  assert.deepEqual(contoAgenti({}), { numero: null, attenzione: 0 }, 'nessun numero inventato a zero (U-10)');
  const uno = modelloAgenti({ agenti: [S.agenti[0]], adesso: ADESSO });
  assert.equal(uno.correnti.length, 1, 'una voce sola');
  const molti = structuredClone(S);
  aggiungiMolti(molti, ADESSO);
  assert.ok(modelloAgenti({ agenti: molti.agenti, adesso: ADESSO }).correnti.length >= 25, 'tante deleghe');
  const strano = { ...S.agenti[0], sessionId: 'x', nome: `${'Riscrivi '.repeat(60)}<img src=x onerror=alert(1)> 📊 C:\\Program Files\\a b.txt` };
  const v = modelloAgenti({ agenti: [strano], adesso: ADESSO }).per.get('x');
  assert.ok(v.nome.length <= 81, 'il nome si accorcia (nomeDellAgente, 80) invece di allargare la colonna');
  const rotti = modelloAgenti({ agenti: [null, 7, { sessionId: 42 }, { sessionId: 'ok', avviataAlle: 'non-data' }], adesso: ADESSO });
  assert.equal(rotti.correnti.length, 1, 'le voci senza id si saltano, una data illeggibile non rompe');
  assert.equal(rotti.per.get('ok').durata, null, 'senza inizio nessuna durata inventata');
});

test('PANNELLO-U10 — il conto della scheda: a zero niente numero; il pallino solo con un motivo vero', () => {
  const finiti = S.agenti.filter((a) => a.conclusa && a.esitoDelega === 'riuscito');
  const c = contoAgenti({ agenti: finiti, adesso: ADESSO });
  assert.equal(c.numero, null);
  assert.equal(c.attenzione, 0);
});

test('PANNELLO-U12 — importare il pannello PRIMA di inspector.js non lascia tabelle indefinite al disegno (ciclo di import)', async () => {
  const fonti = await import('../../src/components/pannello/fonti.js');
  assert.equal(typeof fonti.statoDelPasso, 'function');
  assert.ok(fonti.STATI_PROCESSO && fonti.STATI_PROCESSO['in-corso'], 'STATI_PROCESSO definito al disegno');
  assert.equal(typeof fonti.raggruppaVoci, 'function');
  /* nessun modulo del pannello legge una tabella del ciclo AL CARICAMENTO (solo dentro le funzioni) */
  for (const f of ['agenti.js', 'processi.js', 'contesto.js', 'git.js', 'file.js']) {
    let src;
    try { src = readFileSync(new URL(`../../src/components/pannello/${f}`, import.meta.url), 'utf8'); } catch { continue; }
    assert.ok(!/^(?:const|let|var)\s+\w+\s*=\s*(?:STATI_PROCESSO|raggruppaVoci)\b/mu.test(src), `${f}: una tabella letta al caricamento`);
  }
});

test('PANNELLO-AGENTI — la misura di oggi resta scritta (25 per pagina)', () => assert.equal(PAGINA_AGENTI, 25));

test('PANNELLO-AGENTI-IGNOTO — niente perso: senza «conclusa» lo stato non si sa e si dice; non diventa un agente «in corso»', () => {
  const { conclusa, ...ignoto } = { ...S.agenti.find((a) => a.sessionId === 's-a6') };
  const v = modelloAgenti({ agenti: [ignoto], adesso: ADESSO }).per.get('s-a6');
  assert.equal(conclusa, false);
  assert.equal(v.passo, 'unknown');
  assert.notEqual(v.gruppo, 'lavoro', 'dati incompleti non sono un agente al lavoro (RIPRESA-AGENTI-STATO-IGNOTO)');
  assert.equal(contoAgenti({ agenti: [ignoto], adesso: ADESSO }).numero, null);
});
