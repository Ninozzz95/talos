import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtempSync } from 'node:fs';
import fsPromesse from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { classificaPercorsoDiRete, destinazioneDiRete } from '../src/kernel/file-namespace-contract.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⛔⛔ 01/10/2026 notte (owner: «Rifiuto prefissi NT + chiedo per \\server») — su Windows basta TOCCARE un percorso di rete
 *   perché il sistema avvii l'autenticazione SMB e mandi l'hash NTLM dell'utente al server: Hermes `agent/file_safety.py:108-176`;
 *   GHSA-v6wh-96g9-6wx3 (launch-editor, un UNC aperto da Node); Horizon3, «NTLM Credential Theft in Python Windows Applications».
 *   I nostri `leggi`/`scrivi`/`file_edit` lo toccavano PRIMA del permesso (istantanea di T25, lettura per la carta, `realpath`).
 *   ⇒ `\\??\`, `\\.\`, `\\?\UNC\`, `\\?\GLOBALROOT` rifiutati senza toccarli; `\\server\…` chiede PRIMA di toccarlo.
 *   `\\wsl.localhost\` e `\\wsl$\` sono la casa Linux locale (la vista Windows dei suoi percorsi): restano come prima.
 */

/* La spia di tutto il file: ogni funzione di `fs` e `fs/promises` che riceve un host `.invalid` viene registrata e BLOCCATA —
   così nessuna prova, nemmeno sotto mutazione, manda davvero qualcosa in rete. */
const toccati = [];
const ripristini = [];
/* 02/10/2026 (revisione Codex, rilievo 2): qui i collegamenti simbolici verso una condivisione non si possono creare senza
   privilegi (misurato: `symlink` EPERM, giunzione ENOENT). La spia li FINGE: per un percorso in questa mappa `lstat` risponde
   «collegamento» e `readlink` dà il bersaglio — le sole due chiamate che non aprono la destinazione. E registra ogni altra
   chiamata su quei percorsi (`osservati`): prima del sì ce ne devono essere zero. */
const collegamentiFinti = new Map();
const osservati = [];
const finto = (x) => (typeof x === 'string' || Buffer.isBuffer(x) || x instanceof URL) && collegamentiFinti.get(String(x).toLowerCase());
const statDiCollegamento = { isSymbolicLink: () => true, isDirectory: () => false, isFile: () => false };
before(() => {
  for (const modulo of [fs, fsPromesse]) {
    for (const [nome, valore] of Object.entries(modulo)) {
      if (typeof valore !== 'function' || /^[A-Z]/.test(nome)) continue;
      modulo[nome] = function (...args) {
        const bersaglio = finto(args[0]);
        if (bersaglio !== undefined && bersaglio !== false && (modulo === fsPromesse || nome.endsWith('Sync'))) {
          const sync = modulo === fs && nome.endsWith('Sync');
          if (nome === 'lstat' || nome === 'lstatSync') return sync ? statDiCollegamento : Promise.resolve(statDiCollegamento);
          if (nome === 'readlink' || nome === 'readlinkSync') return sync ? bersaglio : Promise.resolve(bersaglio);
          osservati.push(nome);
        }
        if (args.some((x) => typeof x === 'string' && [...collegamentiFinti.keys()].some((k) => x.toLowerCase().startsWith(`${k}\\`)))) osservati.push(nome);
        if (args.some((x) => (typeof x === 'string' || x instanceof URL || Buffer.isBuffer(x)) && String(x).toLowerCase().includes('.invalid'))) {
          toccati.push(nome);
          // un file «leggibile» finto (mai sulla rete): serve a far arrivare `file_edit` fino al cancello dopo il sì (RETE-07)
          if (nome === 'readFile' && modulo === fsPromesse && args.some((x) => String(x).toLowerCase().includes('leggibile.invalid'))) return Promise.resolve(Buffer.from('a\n'));
          const errore = Object.assign(new Error(`ENOENT: spia di rete (${nome})`), { code: 'ENOENT' });
          if (modulo === fsPromesse) return Promise.reject(errore);
          throw errore;
        }
        return valore.apply(this, args);
      };
      ripristini.push(() => { modulo[nome] = valore; });
    }
  }
  syncBuiltinESMExports();
});
after(() => { for (const r of ripristini) r(); syncBuiltinESMExports(); });

const B = '\\';
const unc = (...pezzi) => B + B + pezzi.join(B);

test('RETE-01: la classificazione guarda SOLO la stringa — prefissi NT, condivisioni di rete, casa Linux, percorsi locali', () => {
  for (const p of [`${B}??${B}C:${B}x`, `${B}??${B}UNC${B}srv${B}s`, `${B}${B}??${B}C:${B}x`, `${B}${B}.${B}pipe${B}x`, `${B}${B}?${B}UNC${B}srv${B}s${B}x`, `${B}${B}?${B}unc${B}srv${B}s`, `${B}${B}?${B}GLOBALROOT${B}Device${B}x`, '//?/UNC/srv/s/x']) {
    assert.equal(classificaPercorsoDiRete(p, { platform: 'win32' }), 'nt', p);
  }
  for (const p of [unc('server', 'condivisa', 'a.txt'), '//server/condivisa/a.txt', unc('10.0.0.5', 'x'), unc('localhost', 'c$', 'x')]) {
    assert.equal(classificaPercorsoDiRete(p, { platform: 'win32' }), 'rete', p);
  }
  for (const p of [unc('wsl.localhost', 'Ubuntu', 'tmp', 'x'), unc('WSL$', 'Ubuntu', 'x'), `${B}${B}?${B}C:${B}progetti${B}x`, 'C:\\progetti\\x', 'relativo\\x', '../x', '', null, 42]) {
    assert.equal(classificaPercorsoDiRete(p, { platform: 'win32' }), null, String(p));
  }
  assert.equal(classificaPercorsoDiRete('//server/x', { platform: 'linux' }), null, 'fuori da Windows due barre sono un percorso locale');
  assert.equal(classificaPercorsoDiRete(`${B}${B}??${B}x`, { platform: 'linux' }), 'nt', 'i prefissi NT non sono mai un input legittimo (come Hermes)');
});

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-rete-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } });
async function giro(progetto, chiamate, extra = {}) {
  let n = 0;
  const domande = [];
  const risultato = await talosLavora({
    cartella: progetto, task: { consegna: 'Prova.' }, modello: 'test', chiave: 'test',
    chiediApprovazioneFn: async (a) => { domande.push(a); return false; },
    fetchDiRete: async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({
      choices: [{ message: n++ === 0 ? { role: 'assistant', content: null, tool_calls: chiamate } : { role: 'assistant', content: 'Fatto.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }) }),
    ...extra,
  });
  return { esito: (id) => risultato.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '', domande };
}

test('RETE-02: un prefisso NT si rifiuta in leggi, scrivi e file_edit, senza nessuna domanda e a qualunque livello', { skip: process.platform !== 'win32' && 'solo Windows' }, async (t) => {
  const c = cartella(t);
  const nt = `${B}${B}?${B}UNC${B}nessuno.invalid${B}s${B}x.txt`;
  for (const livelloAccesso of ['accesso-pieno', 'scrittura-progetto']) {
    const { esito, domande } = await giro(c, [
      chiama('l', 'leggi', { percorso: nt }),
      chiama('s', 'scrivi', { percorso: nt, contenuto: 'x' }),
      chiama('e', 'file_edit', { percorso: nt, old_string: 'a', new_string: 'b' }),
    ], { livelloAccesso });
    for (const id of ['l', 's', 'e']) assert.match(esito(id), /^REFUSED\..*NT\/device namespace prefix/s, `${livelloAccesso} ${id}`);
    assert.equal(domande.length, 0);
  }
});

test('RETE-03: una condivisione di rete CHIEDE prima di essere toccata — anche con «Accesso pieno» e con «sempre»; senza un sì niente parte', { skip: process.platform !== 'win32' && 'solo Windows' }, async (t) => {
  const c = cartella(t);
  const rete = unc('nessuno.invalid', 'condivisa', 'a.txt');
  for (const extra of [{ livelloAccesso: 'accesso-pieno' }, { livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { scrivi: 'sempre', leggi: 'sempre', file_edit: 'sempre' } }]) {
    const { esito, domande } = await giro(c, [
      chiama('l', 'leggi', { percorso: rete }),
      chiama('s', 'scrivi', { percorso: rete, contenuto: 'x' }),
      chiama('e', 'file_edit', { percorso: rete, old_string: 'a', new_string: 'b' }),
    ], extra);
    assert.deepEqual(domande.map((d) => d.tipo), ['leggi', 'scrivi', 'file_edit']);
    for (const d of domande) {
      assert.ok(d.percorsoDiRete, 'la domanda dice che è un percorso di rete');
      assert.match(d.percorsoDiRete.frase, /nessuno\.invalid/);
      assert.match(d.percorsoDiRete.frase, /rete/);
    }
    for (const id of ['l', 's', 'e']) assert.match(esito(id), /^REFUSED\./, id);
  }
  const senza = await giro(c, [chiama('l', 'leggi', { percorso: rete })], { chiediApprovazioneFn: undefined, livelloAccesso: 'accesso-pieno' });
  assert.match(senza.esito('l'), /^REFUSED\..*network share.*no one to confirm/s, 'senza nessuno a cui chiedere: rifiuto, mai un contatto');
});

/* Il danno è il CONTATTO, non l'esito: si spia ogni funzione di `fs` e `fs/promises` (lettura partita in anticipo durante lo
   streaming, istantanea di T25, `realpath` del confine F4-03) e nessuna deve ricevere il percorso prima del sì. */
test('RETE-05: senza un sì nessuna funzione del file system riceve il percorso di rete — nemmeno la lettura partita in anticipo', { skip: process.platform !== 'win32' && 'solo Windows' }, async (t) => {
  const c = cartella(t);
  const ospite = 'nessuno-rete05.invalid';
  const rete = unc(ospite, 'condivisa', 'a.txt');
  toccati.length = 0;
  for (const extra of [{ livelloAccesso: 'accesso-pieno' }, { livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { scrivi: 'sempre', leggi: 'sempre', file_edit: 'sempre' } }]) {
    // due `leggi` in testa: è il prefisso di sole letture che parte in anticipo (`MAX_LETTURE_INSIEME`, P18)
    const { domande } = await giro(c, [
      chiama('l', 'leggi', { percorso: rete }),
      chiama('l2', 'leggi', { percorso: unc(ospite, 'condivisa', 'b.txt') }),
      chiama('s', 'scrivi', { percorso: rete, contenuto: 'x' }),
      chiama('e', 'file_edit', { percorso: rete, old_string: 'a', new_string: 'b' }),
    ], extra);
    assert.equal(domande.length, 4);
  }
  assert.deepEqual(toccati, [], 'nessun contatto col computer di rete senza il sì');
  // AL CONTRARIO: con il sì il kernel tocca il percorso, e la spia lo vede (se non lo vedesse, il verde sopra non direbbe niente).
  await giro(c, [chiama('l', 'leggi', { percorso: rete })], { livelloAccesso: 'accesso-pieno', chiediApprovazioneFn: async () => true });
  assert.ok(toccati.length > 0, 'con il sì la lettura passa dal file system spiato');
});

test('RETE-04: AL CONTRARIO — i percorsi della casa Linux (\\\\wsl.localhost) e quelli locali non chiedono niente in più', async (t) => {
  const c = cartella(t);
  const { domande } = await giro(c, [chiama('s', 'scrivi', { percorso: 'ok.txt', contenuto: 'x' }), chiama('l', 'leggi', { percorso: 'ok.txt' })], { livelloAccesso: 'accesso-pieno' });
  assert.equal(domande.length, 0);
});

/* Owner 02/10/2026, «Sì, stessa regola»: anche `elenca` apre la cartella (readdir) e quindi la condivisione. */
test('RETE-06: elenca — un prefisso NT si rifiuta, una condivisione chiede prima di aprirla, e nemmeno la partenza anticipata la tocca', { skip: process.platform !== 'win32' && 'solo Windows' }, async (t) => {
  const c = cartella(t);
  toccati.length = 0;
  const nt = `${B}${B}?${B}UNC${B}nessuno-rete06.invalid${B}s`;
  const rete = unc('nessuno-rete06.invalid', 'condivisa');
  const { esito, domande } = await giro(c, [
    chiama('n', 'elenca', { percorso: nt }),
    chiama('r', 'elenca', { percorso: rete }),
    chiama('r2', 'elenca', { percorso: unc('nessuno-rete06.invalid', 'altra') }),
  ], { livelloAccesso: 'accesso-pieno' });
  assert.match(esito('n'), /^REFUSED\..*NT\/device namespace prefix/s);
  assert.deepEqual(domande.map((d) => d.tipo), ['elenca', 'elenca']);
  assert.match(domande[0].percorsoDiRete.frase, /cartella su un computer di rete \(nessuno-rete06\.invalid\)/);
  assert.match(esito('r'), /^REFUSED\. Nothing was listed: the person did not allow/);
  assert.deepEqual(toccati, [], 'nessun contatto senza il sì');
});

/* Owner 02/10/2026, «Una sola carta»: con «Scrive nel progetto», il sì alla carta di rete vale anche come «fuori dal progetto». */
test('RETE-07: dopo il sì alla carta di rete non arriva una seconda carta «fuori dalla cartella della sessione» — una per file', { skip: process.platform !== 'win32' && 'solo Windows' }, async (t) => {
  const c = cartella(t);
  const domande = [];
  await giro(c, [
    chiama('s', 'scrivi', { percorso: unc('nessuno-rete07.invalid', 'condivisa', 'a.txt'), contenuto: 'x' }),
    chiama('e', 'file_edit', { percorso: unc('nessuno-rete07-leggibile.invalid', 'condivisa', 'b.txt'), old_string: 'a', new_string: 'b' }),
  ], { livelloAccesso: 'scrittura-progetto', chiediApprovazioneFn: async (a) => { domande.push(a); return true; } });
  assert.deepEqual(domande.map((d) => [d.tipo, Boolean(d.percorsoDiRete), Boolean(d.fuoriDalProgetto)]), [['scrivi', true, false], ['file_edit', true, false]]);
  // AL CONTRARIO: un percorso locale fuori dal progetto la carta «fuori» la riceve ancora
  const fuori = [];
  await giro(c, [chiama('s', 'scrivi', { percorso: join(c, '..', 'fuori-rete07.txt'), contenuto: 'x' })], { livelloAccesso: 'scrittura-progetto', chiediApprovazioneFn: async (a) => { fuori.push(a); return false; } });
  assert.equal(fuori.length, 1);
  assert.ok(fuori[0].fuoriDalProgetto, 'la carta «fuori» resta per i percorsi che non sono di rete');
});

/* ⛔⛔ 02/10/2026 — revisione Codex, rilievi critici 1 e 2 (owner: «Una domanda per sessione», «Li seguo senza aprirli»). */
test('RETE-08: destinazioneDiRete — cartella della sessione su una condivisione, collegamenti seguiti senza mai aprirli', async () => {
  const P = ['C:', 'p'].join(B);
  const Q = ['C:', 'q'].join(B);
  const mappa = new Map([
    [[P, 'link'].join(B), unc('srv', 'x')],
    [[P, 'lunga'].join(B), `${B}${B}?${B}UNC${B}srv2${B}y`],
    [[P, 'nt'].join(B), `${B}${B}?${B}GLOBALROOT${B}Device${B}x`],
    [[P, 'locale'].join(B), Q],
    [[Q, 'dentro'].join(B), unc('srv3', 'z')],
    [[P, 'giro'].join(B), [P, 'giro'].join(B)],
  ]);
  const aperti = [];
  const fsFinto = {
    lstat: async (x) => { if (x.startsWith(B + B)) throw new Error(`lstat su una condivisione: ${x}`); aperti.push(x); return { isSymbolicLink: () => mappa.has(x) }; },
    readlink: async (x) => { if (!mappa.has(x)) throw Object.assign(new Error('EINVAL'), { code: 'EINVAL' }); return mappa.get(x); },
  };
  const d = (percorso, radice = P) => destinazioneDiRete(percorso, { cartella: radice, platform: 'win32', fs: fsFinto });
  assert.deepEqual(await d(['link', 'a.txt'].join(B)), { genere: 'rete', ospite: 'srv', via: 'collegamento', collegamento: [P, 'link'].join(B) });
  assert.equal((await d(['lunga', 'b'].join(B))).ospite, 'srv2', 'la forma lunga (?\\UNC) è la stessa condivisione');
  assert.equal((await d('nt')).genere, 'nt');
  assert.deepEqual(await d(['locale', 'dentro', 'c.txt'].join(B)), { genere: 'rete', ospite: 'srv3', via: 'collegamento', collegamento: [Q, 'dentro'].join(B) }, 'una catena di collegamenti si segue a parole');
  assert.equal(await d(['locale', 'altro.txt'].join(B)), null, 'un collegamento locale che resta locale non è la rete');
  assert.equal(await d('normale.txt'), null);
  assert.equal(await d('giro'), null, 'un ciclo si ferma senza uscire dalla macchina');
  const NAS = unc('nas', 'progetto');
  assert.deepEqual(await d('a.txt', NAS), { genere: 'rete', ospite: 'nas', via: 'cartella' });
  assert.deepEqual(await d(unc('nas', 'progetto', 'sub', 'b.txt'), NAS), { genere: 'rete', ospite: 'nas', via: 'cartella' }, 'scritto per intero, dentro la cartella resta la cartella');
  assert.deepEqual(await d(unc('altro', 'x'), NAS), { genere: 'rete', ospite: 'altro', via: 'stringa' }, 'un altro computer non è la cartella della sessione');
  assert.ok(aperti.every((x) => !x.startsWith(B + B)), 'nessun lstat su un percorso di rete');
});

test('RETE-09: con la cartella della sessione su una condivisione si chiede UNA volta per sessione, prima di ogni contatto', { skip: process.platform !== 'win32' && 'solo Windows' }, async () => {
  toccati.length = 0;
  const NAS = unc('nessuno-rete09.invalid', 'progetto');
  const { esito, domande } = await giro(NAS, [
    chiama('l', 'leggi', { percorso: 'a.txt' }), chiama('e', 'elenca', { percorso: '' }),
    chiama('c', 'cerca', { testo: 'x' }), chiama('s', 'scrivi', { percorso: 'b.txt', contenuto: 'x' }),
  ], { livelloAccesso: 'accesso-pieno', consensiSessione: {} });
  assert.deepEqual(domande.map((d) => [d.tipo, d.percorsoDiRete?.via, d.percorsoDiRete?.ambito]),
    [['leggi', 'cartella', 'sessione'], ['elenca', 'cartella', 'sessione'], ['cerca', 'cartella', 'sessione'], ['scrivi', 'cartella', 'sessione']]);
  assert.match(domande[0].percorsoDiRete.frase, /cartella della sessione sta su un computer di rete \(nessuno-rete09\.invalid\).*tutta la sessione/s);
  for (const id of ['l', 'e', 'c', 's']) assert.match(esito(id), /^REFUSED\./, id);
  assert.deepEqual(toccati, [], 'nessun contatto prima del sì');
  const consensi = {};
  const domandeSi = [];
  const siSempre = async (a) => { domandeSi.push(a); return true; };
  await giro(NAS, [chiama('l', 'leggi', { percorso: 'a.txt' }), chiama('l2', 'leggi', { percorso: 'b.txt' })], { livelloAccesso: 'accesso-pieno', consensiSessione: consensi, chiediApprovazioneFn: siSempre });
  await giro(NAS, [chiama('e', 'elenca', { percorso: '' })], { livelloAccesso: 'accesso-pieno', consensiSessione: consensi, chiediApprovazioneFn: siSempre });
  assert.equal(domandeSi.length, 1, 'una domanda sola per tutta la sessione');
  assert.equal(consensi.reteCartella, true);
});

test('RETE-10: un collegamento locale verso una condivisione chiede PRIMA di essere attraversato — leggi, scrivi, file_edit, elenca, cerca', { skip: process.platform !== 'win32' && 'solo Windows' }, async (t) => {
  const c = cartella(t);
  const chiave = join(c, 'rete10-link').toLowerCase();
  collegamentiFinti.set(chiave, unc('nessuno-rete10.invalid', 'x'));
  t.after(() => collegamentiFinti.delete(chiave));
  osservati.length = 0;
  const { esito, domande } = await giro(c, [
    chiama('l', 'leggi', { percorso: 'rete10-link/a.txt' }), chiama('l2', 'leggi', { percorso: 'rete10-link/b.txt' }),
    chiama('s', 'scrivi', { percorso: 'rete10-link/c.txt', contenuto: 'x' }),
    chiama('e', 'file_edit', { percorso: 'rete10-link/d.txt', old_string: 'a', new_string: 'b' }),
    chiama('el', 'elenca', { percorso: 'rete10-link' }), chiama('ce', 'cerca', { testo: 'x', dentro: 'rete10-link' }),
  ], { livelloAccesso: 'accesso-pieno' });
  assert.deepEqual(domande.map((d) => [d.tipo, d.percorsoDiRete?.via]),
    [['leggi', 'collegamento'], ['leggi', 'collegamento'], ['scrivi', 'collegamento'], ['file_edit', 'collegamento'], ['elenca', 'collegamento'], ['cerca', 'collegamento']]);
  assert.match(domande[0].percorsoDiRete.frase, /attraverso un collegamento .*rete10-link.* computer di rete \(nessuno-rete10\.invalid\)/s);
  for (const id of ['l', 'l2', 's', 'e', 'el', 'ce']) assert.match(esito(id), /^REFUSED\./, id);
  assert.deepEqual(osservati, [], 'oltre a lstat e readlink, nessuno ha aperto il collegamento (nemmeno la lettura anticipata)');
});

test('RETE-11: elenca e la camminata dei file passano ACCANTO a un collegamento verso la rete senza aprirlo', { skip: process.platform !== 'win32' && 'solo Windows' }, async (t) => {
  const c = cartella(t);
  const fuori = cartella(t);
  fs.writeFileSync(join(fuori, 'dentro-rete11.txt'), 'parola-rete11');
  const link = join(c, 'rete11-link');
  try { fs.symlinkSync(fuori, link, 'junction'); } catch (e) { t.skip(`giunzione non creabile: ${e.code}`); return; }
  t.after(() => { try { fs.unlinkSync(link); } catch { /* già via */ } });
  fs.writeFileSync(join(c, 'locale.txt'), 'ciao');
  collegamentiFinti.set(link.toLowerCase(), unc('nessuno-rete11.invalid', 'x'));
  t.after(() => collegamentiFinti.delete(link.toLowerCase()));
  osservati.length = 0;
  const { esito, domande } = await giro(c, [chiama('el', 'elenca', { percorso: '' }), chiama('ce', 'cerca', { testo: 'parola-rete11' })], { livelloAccesso: 'accesso-pieno' });
  assert.equal(domande.length, 0);
  assert.match(esito('el'), /locale\.txt/);
  assert.doesNotMatch(esito('ce'), /dentro-rete11/, 'la ricerca non attraversa il collegamento');
  assert.deepEqual(osservati, [], 'nessuno stat né lettura sul collegamento: solo readdir del genitore e readlink');
  /* Le due camminate che leggono i FILE: quella di `cerca` senza ripgrep, e quella del cancello semantico su una scrittura di
     codice (legge i sorgenti del progetto). Un collegamento chiamato come un modulo non deve essere aperto da nessuna delle due. */
  const modulo = join(c, 'rete11-modulo.ts');
  fs.symlinkSync(fuori, modulo, 'junction');
  t.after(() => { try { fs.unlinkSync(modulo); } catch { /* già via */ } });
  collegamentiFinti.set(modulo.toLowerCase(), unc('nessuno-rete11.invalid', 'y'));
  t.after(() => collegamentiFinti.delete(modulo.toLowerCase()));
  const rgPrima = process.env.TALOS_RG_PATH;
  process.env.TALOS_RG_PATH = join(c, 'ripgrep-non-installato');
  t.after(() => { if (rgPrima === undefined) delete process.env.TALOS_RG_PATH; else process.env.TALOS_RG_PATH = rgPrima; });
  osservati.length = 0;
  const secondo = await giro(c, [
    chiama('ce2', 'cerca', { testo: 'parola-rete11' }),
    chiama('s', 'scrivi', { percorso: 'nuovo.ts', contenuto: 'export const uno = 1\n' }),
  ], { livelloAccesso: 'accesso-pieno' });
  assert.doesNotMatch(secondo.esito('ce2'), /dentro-rete11/);
  assert.match(secondo.esito('s'), /^written/);
  assert.deepEqual(osservati, [], 'la camminata JS di cerca e quella del cancello semantico non aprono i collegamenti verso la rete');
});
