/*
 * ⛔⛔⛔ LINK-SEGRETO (08/10/2026, sonda sul candidato 2098989ff prima della beta 0.1.24) — un COLLEGAMENTO dal nome innocuo
 * verso un segreto. Una giunzione `progetto/dati` → `<fuori>/.aws`: `leggi dati/credentials` NON chiedeva (il nome non dice
 * niente), mentre `leggi .aws/credentials` chiede. Le giunzioni su Windows non vogliono privilegi: è il caso realizzabile da
 * chiunque, e dentro un progetto clonato arriva già fatto (i link simbolici di un repository).
 * Owner: «la risposta è sempre quella di Hermes, Claude, Codex». Hermes classifica il percorso RISOLTO
 * (`agent/file_safety.py:391`, `Path(path).expanduser().resolve()`, clone 65ad529); Claude Code ha curato lo stesso aggiramento
 * delle regole di lettura come vulnerabilità (CVE-2025-59829, CVE-2026-25724, 2.1.7). ⛔ E da Hermes il vincolo: un percorso
 * UNC o del namespace NT NON si risolve mai (`file_safety.py:384-388`: la sola risoluzione fa partire l'autenticazione SMB).
 * La ricerca NON attraversa la giunzione (misurato: rg e la via JS), quindi la cura sta solo in `leggi`/`elenca`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { motivoDaChiedere } from '../src/path-policy.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const suWindows = process.platform === 'win32';

function banco(t) {
  const base = mkdtempSync(join(tmpdir(), 'talos-link-segreto-'));
  const radice = join(base, 'progetto');
  const fuori = join(base, 'casa', '.aws');
  const normale = join(base, 'altro');
  mkdirSync(radice, { recursive: true });
  mkdirSync(fuori, { recursive: true });
  mkdirSync(normale, { recursive: true });
  writeFileSync(join(fuori, 'credentials'), 'aws_secret_access_key=CANARINO\n');
  writeFileSync(join(normale, 'note.txt'), 'niente\n');
  writeFileSync(join(radice, 'leggimi.txt'), 'niente\n');
  writeFileSync(join(radice, '.env'), 'API_KEY=x\n');
  const giunzioni = [];
  if (suWindows) {
    symlinkSync(fuori, join(radice, 'dati'), 'junction'); giunzioni.push(join(radice, 'dati'));
    symlinkSync(normale, join(radice, 'appunti'), 'junction'); giunzioni.push(join(radice, 'appunti'));
  }
  /* ⛔ le giunzioni si staccano PRIMA di cancellare l'albero (lezione robocopy del 17/09): rmdir toglie il collegamento, non il bersaglio */
  t.after(() => { for (const g of giunzioni) rmdirSync(g); rimuoviCartellaDiProva(base); });
  return { base, radice, fuori };
}

test('LS-01: leggi attraverso una giunzione verso .aws chiede, e la frase nomina il bersaglio vero', { skip: !suWindows && 'giunzioni solo su Windows' }, (t) => {
  const { radice } = banco(t);
  for (const accessoPieno of [false, true]) {
    const m = motivoDaChiedere({ tipo: 'leggi', percorso: 'dati/credentials', cartella: radice, accessoPieno });
    assert.equal(m?.classe, 'segreto', `accessoPieno=${accessoPieno}: il collegamento non aggira la domanda`);
    assert.match(m.percorso, /^dati\/credentials → .*[\\/]\.aws[\\/]credentials$/u, 'la persona vede il nome usato E il file vero');
    assert.match(m.frase, /\.aws/u);
  }
});

test('LS-02: elenca la giunzione stessa (una cartella segreta sotto un altro nome) chiede', { skip: !suWindows && 'giunzioni solo su Windows' }, (t) => {
  const { radice } = banco(t);
  assert.equal(motivoDaChiedere({ tipo: 'elenca', percorso: 'dati', cartella: radice })?.classe, 'segreto');
  assert.equal(motivoDaChiedere({ tipo: 'elenca', percorso: './dati/', cartella: radice })?.classe, 'segreto');
});

test('LS-03 AL CONTRARIO: una giunzione verso una cartella qualunque e un file normale non chiedono', { skip: !suWindows && 'giunzioni solo su Windows' }, (t) => {
  const { radice } = banco(t);
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: 'appunti/note.txt', cartella: radice }), null);
  assert.equal(motivoDaChiedere({ tipo: 'elenca', percorso: 'appunti', cartella: radice }), null);
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: 'leggimi.txt', cartella: radice }), null);
});

test('LS-04: un collegamento simbolico verso una chiave privata (realpath iniettato) chiede', (t) => {
  const { radice } = banco(t);
  writeFileSync(join(radice, 'config.txt'), 'finto\n');
  const bersaglio = join(radice, '..', 'casa', '.ssh', 'id_ed25519');
  /* un collegamento simbolico FINTO (crearne uno vero vuole privilegi su Windows): lstat dice «collegamento», readlink dà il bersaglio */
  const fsSync = {
    lstatSync: (p) => (p.toLowerCase().endsWith('config.txt') ? { isSymbolicLink: () => true } : { isSymbolicLink: () => false }),
    readlinkSync: () => bersaglio,
  };
  const m = motivoDaChiedere({ tipo: 'leggi', percorso: 'config.txt', cartella: radice, fsSync });
  assert.equal(m?.classe, 'segreto');
  assert.match(m.percorso, /id_ed25519$/u);
});

test('LS-05: un percorso UNC o del namespace NT non si risolve mai (Hermes: la risoluzione stessa è la fuga NTLM)', (t) => {
  const { radice } = banco(t);
  const chiamate = [];
  const fsSync = { lstatSync: (p) => { chiamate.push(p); return { isSymbolicLink: () => false }; }, readlinkSync: (p) => { chiamate.push(p); return p; } };
  for (const p of ['\\\\host\\share\\note.txt', '//host/share/note.txt', '\\\\?\\UNC\\host\\share\\x', '\\\\.\\GLOBALROOT\\x', '\\??\\UNC\\host\\x']) {
    motivoDaChiedere({ tipo: 'leggi', percorso: p, cartella: radice, fsSync, accessoPieno: true });
  }
  assert.deepEqual(chiamate, [], 'nessuna risoluzione di un percorso di rete o di dispositivo');
});

/* Il fornitore finto: una chiamata d'attrezzo per giro, poi «fatto» (stesso banco di bug17-full-access-shell-senza-carte). */
function fornitore(chiamate) {
  let n = 0;
  return async () => {
    const c = chiamate[n]; n += 1;
    const message = c
      ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] }
      : { role: 'assistant', content: 'fatto' };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
}

test('LS-08: DA CAPO A FONDO nel kernel — `leggi` attraverso la giunzione porta la carta; detto no, il segreto non arriva al modello', { skip: !suWindows && 'giunzioni solo su Windows' }, async (t) => {
  const { radice } = banco(t);
  for (const livelloAccesso of [undefined, 'accesso-pieno']) {
    const chieste = [], esiti = [];
    await talosLavora({
      cartella: radice, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 4, livelloAccesso,
      fetchDiRete: fornitore([['leggi', { percorso: 'dati/credentials' }], ['leggi', { percorso: 'appunti/note.txt' }]]),
      onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(togliConfiniDati(String(e.content))); },
      chiediApprovazioneFn: async (a) => { chieste.push(a); return false; },
    });
    assert.equal(chieste.length, 1, `livello ${livelloAccesso ?? 'progetto'}: una carta sola, per il file dietro la giunzione`);
    assert.match(JSON.stringify(chieste[0]), /\.aws/u, 'la carta nomina il file vero');
    assert.equal(esiti.some((x) => x.includes('CANARINO')), false, 'detto no, il contenuto non arriva al modello');
    assert.equal(esiti.some((x) => x.includes('niente')), true, 'AL CONTRARIO: il file normale dietro l altra giunzione si legge senza carta');
  }
});

test('LS-07 AL CONTRARIO: un progetto che VIVE sotto una cartella della classe, senza collegamenti, non fa chiedere ogni lettura', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'talos-link-segreto-'));
  t.after(() => rimuoviCartellaDiProva(base));
  const radice = join(base, 'keyrings', 'progetto');
  mkdirSync(radice, { recursive: true });
  writeFileSync(join(radice, 'leggimi.txt'), 'niente\n');
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: 'leggimi.txt', cartella: radice }), null, 'nessun collegamento: decide il caso lessicale');
});

/* Review del bugfixer (08/10): «stesso file, stessa risposta, qualunque percorso abbia aperto il progetto». */
test('LS-09: un progetto aperto da una giunzione risponde come dal suo percorso vero; i collegamenti DENTRO chiedono ancora', { skip: !suWindows && 'giunzioni solo su Windows' }, (t) => {
  const base = mkdtempSync(join(tmpdir(), 'talos-link-segreto-'));
  const vero = join(base, 'keyrings', 'progetto');
  const fuori = join(base, 'casa', '.aws');
  mkdirSync(join(vero, '.aws'), { recursive: true });
  mkdirSync(fuori, { recursive: true });
  writeFileSync(join(vero, 'leggimi.txt'), 'niente\n');
  writeFileSync(join(vero, '.aws', 'credentials'), 'interno\n');
  writeFileSync(join(fuori, 'credentials'), 'esterno\n');
  const lavoro = join(base, 'lavoro');
  const giunzioni = [[vero, lavoro], [fuori, join(vero, 'dati')], [join(vero, '.aws'), join(vero, 'conf')]];
  for (const [bersaglio, nome] of giunzioni) symlinkSync(bersaglio, nome, 'junction');
  t.after(() => { for (const [, nome] of giunzioni.reverse()) rmdirSync(nome); rimuoviCartellaDiProva(base); });
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: 'leggimi.txt', cartella: lavoro }), null, 'come aperto dal percorso vero (LS-07)');
  assert.equal(motivoDaChiedere({ tipo: 'elenca', percorso: '.', cartella: lavoro }), null);
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: 'dati/credentials', cartella: lavoro })?.classe, 'segreto', 'un collegamento che ESCE verso .aws chiede');
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: 'conf/credentials', cartella: lavoro })?.classe, 'segreto', 'uno che resta dentro, verso il .aws del progetto, chiede');
});

test('LS-10: un file che NON esiste ancora sotto la giunzione verso .aws chiede lo stesso (il cammino si ferma, il resto resta a parole)', { skip: !suWindows && 'giunzioni solo su Windows' }, (t) => {
  const { radice } = banco(t);
  const m = motivoDaChiedere({ tipo: 'leggi', percorso: 'dati/manca.txt', cartella: radice });
  assert.equal(m?.classe, 'segreto');
  assert.match(m.percorso, /[\\/]\.aws[\\/]manca\.txt$/u);
});

test('LS-06: il caso lessicale resta com era (.env chiede col suo nome, senza freccia) e un file mancante non lancia', (t) => {
  const { radice } = banco(t);
  assert.deepEqual(motivoDaChiedere({ tipo: 'leggi', percorso: '.env', cartella: radice })?.percorso, '.env');
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: 'non/esiste.txt', cartella: radice }), null);
  const lancia = () => { throw new Error('disco rotto'); };
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: 'leggimi.txt', cartella: radice, fsSync: { lstatSync: lancia, readlinkSync: lancia } }), null, 'un innesco non lancia');
});
