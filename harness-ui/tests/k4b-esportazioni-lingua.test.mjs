/*
 * ⛔⛔ K4b (07/10/2026) — LE ESPORTAZIONI DELLA RICERCA NELLA LINGUA DELL'INTERFACCIA.
 *   Decisione dell'owner, 07/10/2026 sera. Prima (04/10) i file uscivano in solo inglese e il PDF era mezzo italiano e
 *   mezzo inglese. Qui: ogni formato con le parole di TALOS si costruisce in `it` e in `en` dalla STESSA ricerca, e
 *   (1) le parole sono quelle della lingua chiesta, (2) le parole dell'altra lingua NON ci sono, (3) il contenuto (prosa
 *   del modello, passaggi, url) resta identico, (4) senza lingua tutto resta com'era (inglese, il `md` com'è salvato).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosResearchParseReport, talosResearchReportDocument, talosResearchSupportLabel } from '../src/research/report.mjs';
import { talosResearchPdfSpec } from '../src/research/pdf.mjs';
import { costruisciEsportazione } from '../src/research/esportazioni.mjs';
import { indirizzoEsportazione } from '../frontend/src/components/ricerca-dettaglio.js';

const DOMANDA = 'Come stanno evolvendo gli harness agentici desktop';
const INGRESSO = {
  question: DOMANDA,
  summary: 'Convergono su permessi per attrezzo e memoria persistente.',
  judge: 'giudice-di-prova',
  claims: [
    { claim: { text: 'Prima affermazione.', sourceIndex: 1, quote: 'q1' }, passage: 'passaggio uno', checks: { claimSupported: 'yes', supportReason: 'regge' } },
    { claim: { text: 'Seconda affermazione.', sourceIndex: 2, quote: 'q2' }, passage: 'passaggio due', checks: { claimSupported: 'no', supportReason: 'non regge' } },
  ],
  sources: [
    { url: 'https://uno.invalid/a', title: 'Fonte uno', publishedAt: '2026-03-04', obtained: 'page' },
    { url: 'https://due.invalid/b', title: 'Fonte due', publishedAt: null, obtained: 'snippet' },
  ],
};
const SALVATO = talosResearchReportDocument(INGRESSO);
const RECORD = talosResearchParseReport(SALVATO);

function ricerca() {
  return {
    id: 'r1', domanda: DOMANDA, stato: 'conclusa', modello: 'zai:glm-5.3-flash', conclusaAlle: '2026-10-07T18:00:00.000Z',
    contenutoRapporto: SALVATO,
    bilancio: { totali: 2, sostenute: 1, inParte: 0, nonSostenute: 1, contese: 0, nonVerificate: 0 },
    affermazioni: RECORD.claims.map((c, i) => ({
      numero: i + 1, testo: c.text, fonte: c.sourceIndex, passaggio: c.passage,
      verdetto: c.checks.claimSupported, verdettoUmano: talosResearchSupportLabel(c.checks), motivoVerdetto: c.checks.supportReason,
    })),
  };
}
const testo = async (formato, lingua) => new TextDecoder().decode((await costruisciEsportazione({ ricerca: ricerca(), formato, ...(lingua ? { lingua } : {}) })).bytes);

test('K4B-EXP-01 — html: lingua del documento, titoli, verdetti e bilancio nella lingua chiesta; il contenuto non cambia', async () => {
  const it = await testo('html', 'it');
  const en = await testo('html', 'en');
  assert.match(it, /<html lang="it">/u);
  assert.match(en, /<html lang="en">/u);
  for (const [doc, sì, no] of [[it, ['<h2>Le affermazioni</h2>', 'Esito: sostenuta dalla fonte', 'NON sostenuta dalla fonte', 'Fonti (2)', 'pagina letta', 'Stato:'], ['Claims</h2>', 'Outcome:', 'Sources (2)']],
    [en, ['<h2>Claims</h2>', 'Outcome: supported by source', 'NOT supported by source', 'Sources (2)', 'full page read', 'Status:'], ['Le affermazioni', 'Esito:', 'Fonti (2)']]]) {
    for (const s of sì) assert.ok(doc.includes(s), `manca «${s}»`);
    for (const s of no) assert.ok(!doc.includes(s), `c'è ancora «${s}» dell'altra lingua`);
    for (const contenuto of ['passaggio uno', 'https://due.invalid/b', 'Prima affermazione.']) assert.ok(doc.includes(contenuto));
  }
});

test('K4B-EXP-02 — md con record: con la lingua si riscrive dal record (stesso recinto), senza lingua esce com\'è salvato', async () => {
  const it = await testo('md', 'it');
  assert.match(it, /## Le affermazioni/u);
  assert.match(it, /Esito: sostenuta dalla fonte — regge/u);
  assert.doesNotMatch(it, /## Claims/u);
  assert.deepEqual(talosResearchParseReport(it), RECORD, 'il recinto (ciò che rende il file ri-verificabile) è lo stesso');
  assert.equal(await testo('md'), SALVATO, 'senza lingua: byte per byte il rapporto salvato');
  assert.equal(await testo('md', 'en'), SALVATO, 'in inglese la riscrittura coincide col salvato (stesso scrittore)');
});

test('K4B-EXP-03 — fonti (md): intestazioni e righe nella lingua chiesta', async () => {
  const it = await testo('fonti', 'it');
  for (const s of ['# Fonti — ', '2 fonti, 2 affermazioni.', '- Indirizzo: ', '- Data dichiarata: 2026-03-04', '- Data dichiarata: non dichiarata', 'Passaggi citati:']) assert.ok(it.includes(s), `manca «${s}»`);
  const en = await testo('fonti', 'en');
  for (const s of ['# Sources — ', '2 sources, 2 claims.', '- URL: ', '- Declared date: not declared', 'Cited passages:']) assert.ok(en.includes(s), `manca «${s}»`);
});

test('K4B-EXP-04 — pdf: i tre toni nella lingua chiesta, senza parole dell\'altra lingua', () => {
  const parole = (spec) => JSON.stringify(spec);
  const it = parole([talosResearchPdfSpec(RECORD, 'report', { lingua: 'it' }), talosResearchPdfSpec(RECORD, 'brief', { lingua: 'it' }), talosResearchPdfSpec(RECORD, 'dossier', { lingua: 'it' })]);
  const en = parole([talosResearchPdfSpec(RECORD, 'report', { lingua: 'en' }), talosResearchPdfSpec(RECORD, 'brief', { lingua: 'en' }), talosResearchPdfSpec(RECORD, 'dossier', { lingua: 'en' })]);
  for (const s of ['In breve', 'Le affermazioni, una per una', 'Le fonti', 'Quello che regge', 'Quello che NON regge', 'Affermazioni e prove', 'Sostenute', 'TALOS · ricerca approfondita']) assert.ok(it.includes(s), `manca «${s}»`);
  for (const s of ['In brief', 'Claims, one by one', 'What holds', 'What does NOT hold', 'Claims and evidence', 'Supported', 'TALOS · deep research']) assert.ok(en.includes(s), `manca «${s}»`);
  for (const s of ['What does NOT hold', 'Claims and evidence', 'TALOS · deep research']) assert.ok(!it.includes(s), `c'è «${s}» nel pdf italiano`);
  for (const s of ['In breve', 'Le fonti', 'Quello che regge']) assert.ok(!en.includes(s), `c'è «${s}» nel pdf inglese`);
});

test('K4B-EXP-05 — pdf dalla porta: la lingua arriva fino allo spec che va al generatore', async () => {
  let spec = null;
  await costruisciEsportazione({ ricerca: ricerca(), formato: 'pdf', lingua: 'it' }, { generaDocumentoFn: async (d) => { spec = d.report; return { bytes: new Uint8Array([1]) }; } });
  assert.match(JSON.stringify(spec), /Le affermazioni, una per una/u);
});

test('K4B-EXP-06 — al contrario: una lingua sconosciuta è rifiutata (RESEARCH_INVALID), mai un ripiego muto', async () => {
  await assert.rejects(() => costruisciEsportazione({ ricerca: ricerca(), formato: 'html', lingua: 'fr' }), (e) => e.code === 'RESEARCH_INVALID');
});

test('K4B-EXP-07 — il frontend manda la lingua: it resta it, ogni altra (pseudo compresa) vale en', () => {
  assert.match(indirizzoEsportazione('s', 'r', 'html', null, 'it'), /[?&]lingua=it(?:&|$)/u);
  assert.match(indirizzoEsportazione('s', 'r', 'html', null, 'en'), /[?&]lingua=en(?:&|$)/u);
  assert.match(indirizzoEsportazione('s', 'r', 'pdf', 'brief', 'xx-pseudo'), /tono=brief.*lingua=en|lingua=en.*tono=brief/u);
});
