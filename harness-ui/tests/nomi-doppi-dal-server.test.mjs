/*
 * 16/10/2026, owner («-2 anche dal server», #45) — due sessioni nate dallo stesso compito (API, deleghe, CLI) avevano lo STESSO nome:
 *   il «-N» lo dava solo l'interfaccia alla rinomina (`nomeUnicoSessione`, app.js). Ora il registro dà lo stesso numero alla nascita,
 *   con la stessa regola (solo contro le sessioni VIVE, numero dentro il tetto) e lo scrive come una rinomina, così regge al riavvio.
 * Solo src/: gira anche nel ramo della CLI. Ogni controllo anche AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createSessionRegistry as createSessionRegistryReale, nomeCortoDaConsegna, nomeDiNascita } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { contaGrafemi, nomeConSuffisso, TITOLO_MASSIMO } from '../src/titolo-breve.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const createSessionRegistry = (opzioni) => createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', ...opzioni });
const libero = (consegna) => () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'libero:prova', consegna, consegnaCorta: consegna } });
/** Una sessione che resta viva finché la prova non la conclude. */
function avviatore() {
  const vive = new Map();
  const avviaSessioneFn = async (input) => {
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' });
    return new Promise((risolvi) => { vive.set(input, () => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); risolvi({ ok: true }); }); });
  };
  return { avviaSessioneFn, concludiTutte: () => { for (const fine of vive.values()) fine(); vive.clear(); } };
}
const nomeDi = (registro, sessionId) => registro.elenca().find((s) => s.sessionId === sessionId || s.id === sessionId)?.nome;

test('NOMI-DOPPI-01 — la seconda e la terza sessione viva nate dallo stesso compito si chiamano «-2» e «-3»', async (t) => {
  const a = avviatore();
  t.after(a.concludiTutte);
  const registro = createSessionRegistry({ avviaSessioneFn: a.avviaSessioneFn, preparaEsecuzioneFn: libero('Prova del bugfixer sui permessi') });
  const nomi = [registro.avvia('libero:prova'), registro.avvia('libero:prova'), registro.avvia('libero:prova')].map((s) => nomeDi(registro, s.sessionId));
  assert.deepEqual(nomi, ['Prova del bugfixer sui permessi', 'Prova del bugfixer sui permessi-2', 'Prova del bugfixer sui permessi-3']);
});

test('NOMI-DOPPI-02 — owner 16/10 sera: conta ogni sessione in ELENCO — una ferma tiene il suo nome, una eliminata lo libera; AL CONTRARIO un task del catalogo resta senza nome', async (t) => {
  const a = avviatore();
  t.after(a.concludiTutte);
  const registro = createSessionRegistry({ avviaSessioneFn: a.avviaSessioneFn, preparaEsecuzioneFn: libero('Riordina i test') });
  const prima = registro.avvia('libero:prova');
  a.concludiTutte();
  await new Promise((r) => { setTimeout(r, 30); });
  const seconda = registro.avvia('libero:prova');
  assert.equal(nomeDi(registro, seconda.sessionId), 'Riordina i test-2', 'la prima è ferma ma è ancora in elenco');
  a.concludiTutte();
  await new Promise((r) => { setTimeout(r, 30); });
  assert.deepEqual(await registro.elimina(prima.sessionId), { ok: true });
  const terza = registro.avvia('libero:prova');
  assert.equal(nomeDi(registro, terza.sessionId), 'Riordina i test', 'eliminata la prima, il suo nome è di nuovo libero');
  const catalogo = createSessionRegistry({ avviaSessioneFn: a.avviaSessioneFn, preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }) });
  catalogo.avvia('task-vero');
  assert.equal(nomeDi(catalogo, catalogo.avvia('task-vero').sessionId) ?? null, null);
});

test('NOMI-DOPPI-05 — owner 16/10 sera: una DELEGA nasce col nome corto del suo compito (lo stesso testo di `taskDelega`); AL CONTRARIO una sessione senza madre e senza compito libero resta senza nome', () => {
  assert.equal(nomeDiNascita('delega:p1', { consegnaCorta: 'Riassumi a.txt' }, 'p1'), 'Riassumi a.txt');
  assert.equal(nomeDiNascita('delega:p1', { consegnaCorta: `Analizza ${'tutti i moduli del server '.repeat(6)}` }, 'p1'), nomeCortoDaConsegna(`Analizza ${'tutti i moduli del server '.repeat(6)}`));
  assert.equal(nomeDiNascita('libero:x', { consegnaCorta: 'Una chat' }, null), 'Una chat', 'il compito libero come prima');
  assert.equal(nomeDiNascita('task-vero', { consegna: 'c' }, null), null);
  assert.equal(nomeDiNascita('delega:p1', { consegnaCorta: '   ' }, 'p1'), null, 'un compito vuoto non inventa un nome');
  // NOMI2-REV-02: un ruolo interno con una madre (il confutatore del /goal) non è una delega e nasce senza nome
  assert.equal(nomeDiNascita('confutatore:p1', { consegna: 'x', consegnaCorta: 'Goal refuter' }, 'p1'), null);
});

test('NOMI-DOPPI-06 — owner 16/10 sera: il giro di un\'automazione si numera con la stessa regola (escludendo se stesso)', () => {
  const sorgente = readFileSync(new URL('../src/session-registry.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /const nomeDelGiro = nomeUnicoInElenco\(titoloBreve\(titoloCorto\), sessionId\);/u);
  assert.match(sorgente, /nome: nomeUnicoInElenco\(nomeDiNascita\(taskId, task, padreId\), null, padreId\),/u, 'e alla nascita passa dalla stessa regola, fra sorelle per una delega');
});

test('NOMI-DOPPI-03 — un nome lungo: il numero sta dentro il tetto e prima dei puntini, come nel client', async (t) => {
  const a = avviatore();
  t.after(a.concludiTutte);
  const lungo = `Analizza ${'tutti i moduli del server '.repeat(6)}e scrivi un rapporto`;
  const registro = createSessionRegistry({ avviaSessioneFn: a.avviaSessioneFn, preparaEsecuzioneFn: libero(lungo) });
  registro.avvia('libero:prova');
  const nome = nomeDi(registro, registro.avvia('libero:prova').sessionId);
  assert.ok(nome.endsWith('-2…'), nome);
  assert.ok(contaGrafemi(nome) <= TITOLO_MASSIMO, `${contaGrafemi(nome)} grafemi`);
  assert.equal(nome, nomeConSuffisso(lungo, '-2'));
});

test('NOMI-DOPPI-04 — il numero regge al riavvio: si scrive come una rinomina; AL CONTRARIO il nome senza numero non si scrive', async (t) => {
  const cartellaStore = cartellaDiProva('talos-nomi-doppi-');
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const a = avviatore();
  const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: a.avviaSessioneFn, preparaEsecuzioneFn: libero('Controlla la coda') });
  const prima = registro.avvia('libero:prova');
  const seconda = registro.avvia('libero:prova');
  assert.equal(nomeDi(registro, seconda.sessionId), 'Controlla la coda-2');
  a.concludiTutte();
  await attendiScritture({ cartellaStore });
  await registro.chiudi({ attesaMassimaMs: 1_000 });
  const righe = (id) => readFileSync(join(cartellaStore, `${id}.jsonl`), 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r));
  assert.deepEqual(righe(seconda.sessionId).filter((r) => r.tipo === 'nome-sessione').map((r) => r.nome), ['Controlla la coda-2']);
  assert.deepEqual(righe(prima.sessionId).filter((r) => r.tipo === 'nome-sessione'), [], 'un nome derivato non si scrive');
  const dopo = createSessionRegistry({ cartellaStore, avviaSessioneFn: async () => ({ ok: true }) });
  await dopo.ripristina({ soloSessioni: [prima.sessionId, seconda.sessionId] });
  assert.equal(nomeDi(dopo, seconda.sessionId), 'Controlla la coda-2');
  assert.equal(nomeDi(dopo, prima.sessionId), 'Controlla la coda');
  await dopo.chiudi({ attesaMassimaMs: 1_000 });
});

test('NOME-CORTO-INVISIBILI — una prima riga fatta solo di invisibili a larghezza zero non diventa il nome (revisione 16/10)', () => {
  assert.equal(nomeCortoDaConsegna('\u200B\nControlla i test'), 'Controlla i test');
  assert.equal(nomeCortoDaConsegna('\u2060 \uFEFF\n\nLeggi il registro'), 'Leggi il registro');
  assert.equal(nomeCortoDaConsegna('\u200B'), null, 'solo invisibili: nessun nome');
  assert.equal(nomeCortoDaConsegna('\u200Bciao'), '\u200Bciao', 'AL CONTRARIO: con un segno visibile la riga resta');
});
