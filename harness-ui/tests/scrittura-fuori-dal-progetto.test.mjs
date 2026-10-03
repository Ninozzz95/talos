import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as kernel from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { talosLavora, posizioneNelProgetto, verificaPermessoScrittura } = kernel;

/*
 * ⛔⛔ F4-03 (zip v4 dell'audit, owner 01/10/2026 sera) — «Scrive nel progetto» promette «Scrive solo dentro la cartella della
 *   sessione» (`frontend/src/components/politiche.js`), e il kernel lasciava scrivere OVUNQUE: il registro traduceva la politica
 *   in `livelloAccesso` assente, cioè `via: 'nessun-vincolo'`. Riprodotto prima della cura (scratchpad `riproduci-f4-03*.mjs`):
 *   percorso assoluto, `../` e un collegamento dentro il progetto scrivevano fuori; il collegamento passava anche `scrittura-area`.
 * Decisioni dell'owner: fuori ⇒ ti chiede (come Claude Code `acceptEdits` e Codex `workspace-write`); TEMP conta come fuori;
 *   «Scrittura: Sempre» non scavalca il confine; il consenso «per questa cartella» vale fino a fine sessione, sottocartelle
 *   comprese; letture invariate. Il livello del kernel è NUOVO (`'scrittura-progetto'`): `undefined` resta quello del banco.
 */

function cartelle(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-fuori-'));
  const progetto = join(radice, 'progetto'); mkdirSync(progetto);
  const fuori = join(radice, 'fuori'); mkdirSync(fuori);
  const collegamenti = [];
  const collega = (bersaglio, nome) => { const p = join(progetto, nome); symlinkSync(bersaglio, p, 'junction'); collegamenti.push(p); return p; };
  // I collegamenti si staccano PRIMA di cancellare: una rimozione ricorsiva non deve mai attraversarli.
  t.after(() => { for (const p of collegamenti) { try { unlinkSync(p); } catch { /* già via */ } } return rimuoviCartellaDiProva(radice); });
  return { radice, progetto, fuori, collega };
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } });

/** Un giro vero del kernel con un modello finto che chiede `chiamate` e poi chiude. */
async function giro(progetto, chiamate, opzioni = {}) {
  let richiesta = 0;
  const domande = [];
  const { risposta, ...resto } = opzioni;
  const risultato = await talosLavora({
    cartella: progetto, task: { consegna: 'Scrivi i file di prova.' }, modello: 'test', chiave: 'test',
    fetchDiRete: async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({
      choices: [{ message: richiesta++ === 0 ? { role: 'assistant', content: null, tool_calls: chiamate } : { role: 'assistant', content: 'Fatto.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }) }),
    ...(risposta === undefined ? {} : { chiediApprovazioneFn: async (azione) => { domande.push(azione); return typeof risposta === 'function' ? risposta(azione) : risposta; } }),
    ...resto,
  });
  const esito = (id) => risultato.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '';
  return { esito, domande };
}

test('FUORI-01: con «Scrive nel progetto» una scrittura fuori (assoluta o con ../) CHIEDE; dentro scrive da sola', async (t) => {
  const { radice, progetto } = cartelle(t);
  const assoluto = join(radice, 'assoluto.txt');
  const { esito, domande } = await giro(progetto, [
    chiama('dentro', 'scrivi', { percorso: 'dentro.txt', contenuto: 'qui' }),
    chiama('a', 'scrivi', { percorso: assoluto, contenuto: 'fuori' }),
    chiama('r', 'scrivi', { percorso: '../relativo.txt', contenuto: 'fuori' }),
  ], { livelloAccesso: 'scrittura-progetto', risposta: false });
  assert.equal(readFileSync(join(progetto, 'dentro.txt'), 'utf8'), 'qui', 'dentro il progetto non si chiede niente');
  assert.equal(domande.length, 2, 'una domanda per ciascuna scrittura fuori, nessuna per quella dentro');
  for (const d of domande) {
    assert.equal(d.tipo, 'scrivi');
    assert.ok(d.fuoriDalProgetto, 'la domanda porta il fatto: è fuori dal progetto');
    assert.match(d.fuoriDalProgetto.frase, /fuori dalla cartella della sessione/);
    assert.equal(typeof d.fuoriDalProgetto.chiave, 'string');
  }
  assert.equal(existsSync(assoluto), false);
  assert.equal(existsSync(join(radice, 'relativo.txt')), false);
  assert.match(esito('a'), /^REFUSED\./);
  assert.match(esito('r'), /^REFUSED\./);
});

test('FUORI-02: col sì della persona la scrittura fuori parte; senza nessuno a cui chiedere è rifiutata e lo dice', async (t) => {
  const { radice, progetto } = cartelle(t);
  const conSi = join(radice, 'con-si.txt');
  const { esito } = await giro(progetto, [chiama('a', 'scrivi', { percorso: conSi, contenuto: 'approvato' })], { livelloAccesso: 'scrittura-progetto', risposta: true });
  assert.equal(readFileSync(conSi, 'utf8'), 'approvato');
  assert.doesNotMatch(esito('a'), /REFUSED/);
  const senza = join(radice, 'senza-canale.txt');
  const r = await giro(progetto, [chiama('b', 'scrivi', { percorso: senza, contenuto: 'x' })], { livelloAccesso: 'scrittura-progetto' });
  assert.equal(existsSync(senza), false);
  assert.match(r.esito('b'), /REFUSED\..*outside the session folder.*no active approval channel/s);
});

test('FUORI-03: un collegamento DENTRO il progetto che porta FUORI conta come fuori — per scrivi e file_edit, e anche in scrittura-area', async (t) => {
  const { progetto, fuori, collega } = cartelle(t);
  writeFileSync(join(fuori, 'esistente.txt'), 'uno due tre\n');
  collega(fuori, 'link');
  const chiamate = [
    chiama('s', 'scrivi', { percorso: 'link/nuovo.txt', contenuto: 'attraverso il collegamento' }),
    chiama('e', 'file_edit', { percorso: 'link/esistente.txt', old_string: 'due', new_string: 'DUE' }),
  ];
  const { domande } = await giro(progetto, chiamate, { livelloAccesso: 'scrittura-progetto', risposta: false });
  assert.deepEqual(domande.map((d) => d.tipo), ['scrivi', 'file_edit']);
  assert.ok(domande.every((d) => d.fuoriDalProgetto));
  assert.equal(existsSync(join(fuori, 'nuovo.txt')), false);
  assert.equal(readFileSync(join(fuori, 'esistente.txt'), 'utf8'), 'uno due tre\n');
  const area = await giro(progetto, chiamate, { livelloAccesso: 'scrittura-area' });
  assert.match(area.esito('s'), /REFUSED/);
  assert.match(area.esito('e'), /REFUSED/);
  assert.equal(existsSync(join(fuori, 'nuovo.txt')), false, 'scrittura-area: il collegamento non apre più un varco');
  assert.equal(readFileSync(join(fuori, 'esistente.txt'), 'utf8'), 'uno due tre\n');
});

test('FUORI-04: «Scrittura: Sempre» non scavalca il confine (fuori chiede lo stesso); «nega» vince per primo', async (t) => {
  const { radice, progetto } = cartelle(t);
  const fuoriFile = join(radice, 'sempre.txt');
  const { domande, esito } = await giro(progetto, [
    chiama('d', 'scrivi', { percorso: 'ok.txt', contenuto: 'dentro' }),
    chiama('f', 'scrivi', { percorso: fuoriFile, contenuto: 'fuori' }),
  ], { livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { scrivi: 'sempre' }, risposta: false });
  assert.equal(readFileSync(join(progetto, 'ok.txt'), 'utf8'), 'dentro');
  assert.equal(domande.length, 1);
  assert.ok(domande[0].fuoriDalProgetto);
  assert.match(esito('f'), /REFUSED/);
  const negato = await giro(progetto, [chiama('n', 'scrivi', { percorso: fuoriFile, contenuto: 'x' })], { livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { scrivi: 'nega' }, risposta: true });
  assert.equal(negato.domande.length, 0, 'nega non chiede');
  assert.match(negato.esito('n'), /REFUSED.*deny/s);
});

test('FUORI-05: il consenso «per questa cartella» vale fino a fine sessione, sottocartelle comprese; altrove fuori chiede di nuovo', async (t) => {
  const { radice, progetto, fuori } = cartelle(t);
  const altrove = join(radice, 'altrove'); mkdirSync(altrove);
  const consensiSessione = {};
  const prima = await giro(progetto, [chiama('a', 'scrivi', { percorso: join(fuori, 'a.txt'), contenuto: '1' })], { livelloAccesso: 'scrittura-progetto', consensiSessione, risposta: true });
  assert.equal(prima.domande.length, 1);
  // Ciò che il registro fa quando la persona preme «Consenti in questa cartella per la sessione».
  (consensiSessione.cartelleFuori ??= []).push(prima.domande[0].fuoriDalProgetto.chiave);
  mkdirSync(join(fuori, 'sotto'));
  const dopo = await giro(progetto, [
    chiama('b', 'scrivi', { percorso: join(fuori, 'b.txt'), contenuto: '2' }),
    chiama('c', 'scrivi', { percorso: join(fuori, 'sotto', 'c.txt'), contenuto: '3' }),
    chiama('n', 'scrivi', { percorso: join(fuori, 'nuova', 'd.txt'), contenuto: '4' }),
    chiama('x', 'scrivi', { percorso: join(altrove, 'x.txt'), contenuto: '5' }),
  ], { livelloAccesso: 'scrittura-progetto', consensiSessione, risposta: false });
  assert.equal(readFileSync(join(fuori, 'b.txt'), 'utf8'), '2');
  assert.equal(readFileSync(join(fuori, 'sotto', 'c.txt'), 'utf8'), '3', 'sottocartella esistente');
  assert.equal(readFileSync(join(fuori, 'nuova', 'd.txt'), 'utf8'), '4', 'sottocartella creata dalla scrittura');
  assert.equal(dopo.domande.length, 1, 'solo la cartella mai consentita chiede');
  assert.equal(existsSync(join(altrove, 'x.txt')), false);
  // Il nome che COMINCIA come la cartella consentita non è la cartella consentita.
  const sorella = `${fuori}-sorella`; mkdirSync(sorella);
  const r = await giro(progetto, [chiama('s', 'scrivi', { percorso: join(sorella, 's.txt'), contenuto: '6' })], { livelloAccesso: 'scrittura-progetto', consensiSessione, risposta: false });
  assert.equal(r.domande.length, 1);
  // Una cartella consentita quando ancora non esisteva, poi scritta con altre maiuscole: col confronto esatto si chiede di nuovo.
  if (process.platform === 'win32') {
    const consensi = { cartelleFuori: [`locale|${join(realpathSync.native(fuori), 'Futura')}`] };
    const m = await giro(progetto, [chiama('f', 'scrivi', { percorso: join(fuori, 'FUTURA', 'f.txt'), contenuto: '7' })], { livelloAccesso: 'scrittura-progetto', consensiSessione: consensi, risposta: false });
    // Owner 01/10/2026 «Confronto esatto» (rilievo 2 di Codex): una cartella non ancora nata scritta con altre maiuscole CHIEDE.
    assert.equal(m.domande.length, 1, 'maiuscole diverse su una cartella che non esiste: si chiede, non si indovina');
  }
});

test('FUORI-06: TEMP conta come fuori; un collegamento pendente che porta fuori non passa per «dentro»', async (t) => {
  const { radice, progetto, collega } = cartelle(t);
  const nelTemp = join(tmpdir(), `talos-fuori-temp-${process.pid}-${Date.now()}.txt`);
  t.after(() => { try { unlinkSync(nelTemp); } catch { /* non scritto */ } });
  const pendente = join(radice, 'non-ancora');
  collega(pendente, 'pendente'); // bersaglio che non esiste ancora
  const { domande } = await giro(progetto, [
    chiama('t', 'scrivi', { percorso: nelTemp, contenuto: 'temp' }),
    chiama('p', 'scrivi', { percorso: 'pendente/x.txt', contenuto: 'p' }),
  ], { livelloAccesso: 'scrittura-progetto', risposta: false });
  assert.deepEqual(domande.map((d) => Boolean(d.fuoriDalProgetto)), [true, true]);
  // Il collegamento pendente si SEGUE: la cartella da consentire è quella dove il file nascerebbe davvero, non «non verificato».
  assert.equal(domande[1].fuoriDalProgetto.verificato, true);
  assert.equal(domande[1].fuoriDalProgetto.cartella.toLowerCase(), join(realpathSync.native(radice), 'non-ancora').toLowerCase());
  assert.equal(existsSync(nelTemp), false);
  assert.equal(existsSync(join(pendente, 'x.txt')), false);
});

test('FUORI-07: AL CONTRARIO — senza livello (TALOS-BANCO, CLI, mobile) il comportamento è quello di prima, bit per bit', async (t) => {
  const { radice, progetto } = cartelle(t);
  const fuoriFile = join(radice, 'banco.txt');
  const { domande } = await giro(progetto, [chiama('a', 'scrivi', { percorso: fuoriFile, contenuto: 'banco' })], { risposta: false });
  assert.equal(domande.length, 0);
  assert.equal(readFileSync(fuoriFile, 'utf8'), 'banco');
});

test('FUORI-08: posizioneNelProgetto misura il percorso vero — dentro, fuori, ../, collegamento, maiuscole di Windows', async (t) => {
  const { radice, progetto, fuori, collega } = cartelle(t);
  collega(fuori, 'link');
  const p = (x) => posizioneNelProgetto(progetto, x);
  assert.equal((await p('a/b/c.txt')).dentro, true);
  assert.equal((await p(join(progetto, 'x.txt'))).dentro, true);
  assert.equal((await p('../x.txt')).dentro, false);
  assert.equal((await p('sub/../../x.txt')).dentro, false);
  const viaLink = await p('link/x.txt');
  assert.equal(viaLink.dentro, false);
  assert.equal(viaLink.verificato, true);
  assert.equal(viaLink.cartella.toLowerCase(), realpathSync.native(fuori).toLowerCase(), 'la cartella da consentire è quella VERA');
  assert.equal((await p(join(radice, 'progetto-sorella', 'x.txt'))).dentro, false, 'un prefisso di nome non è una cartella');
  if (process.platform === 'win32') assert.equal((await p(join(progetto, 'x.txt').toUpperCase())).dentro, true, 'Windows non distingue le maiuscole');
  // La cartella della sessione che non esiste più (cancellata a sessione aperta): niente realpath che uniformi le maiuscole.
  if (process.platform === 'win32') assert.equal((await posizioneNelProgetto(join(radice, 'mancante').toUpperCase(), 'a.txt')).dentro, true, 'cartella mancante, maiuscole diverse');
});

test('FUORI-09: un consenso della casa Linux non vale per la stessa cartella vista da Windows (e viceversa)', async (t) => {
  const { progetto, fuori } = cartelle(t);
  const consensiSessione = { cartelleFuori: [`linux:Ubuntu|${realpathSync.native(fuori)}`] };
  const { domande } = await giro(progetto, [chiama('a', 'scrivi', { percorso: join(fuori, 'a.txt'), contenuto: '1' })], { livelloAccesso: 'scrittura-progetto', consensiSessione, risposta: false });
  assert.equal(domande.length, 1, 'stesso percorso, casa diversa: chiede');
  assert.equal(existsSync(join(fuori, 'a.txt')), false);
});

test('FUORI-10: un percorso che non si riesce a verificare CHIEDE, senza cartella da consentire — anche se la misura lancia', async (t) => {
  const { progetto } = cartelle(t);
  for (const posizioneFn of [async () => ({ dentro: true, verificato: false }), async () => { throw new Error('servente giù'); }]) {
    const domande = [];
    const esito = await verificaPermessoScrittura({ tipo: 'scrivi', percorso: 'link/a.txt' }, {
      livelloAccesso: 'scrittura-progetto', cartella: progetto, posizioneFn,
      chiediApprovazioneFn: async (azione) => { domande.push(azione); return false; },
    });
    assert.equal(esito.consentito, false);
    assert.equal(esito.via, 'fuori-dal-progetto');
    assert.equal(domande.length, 1);
    assert.equal(domande[0].fuoriDalProgetto.verificato, false);
    assert.equal(domande[0].fuoriDalProgetto.chiave, undefined, 'niente da consentire per la sessione');
    assert.match(domande[0].fuoriDalProgetto.frase, /Non è stato possibile verificare/);
  }
});

/* Revisione Codex 01/10/2026, rilievo 3 (verificato): nella casa Linux il consenso usa i percorsi di Linux, con «/», mentre il
   confronto usava il separatore di Windows — «Consenti in questa cartella» non copriva neppure un altro file della stessa. */
test('FUORI-11: un consenso della casa Linux copre la sua cartella e le sottocartelle, coi percorsi di Linux; un nome che comincia uguale no', async () => {
  const chiedi = async (vero, cartella) => {
    const domande = [];
    const esito = await verificaPermessoScrittura({ tipo: 'scrivi', percorso: vero }, {
      livelloAccesso: 'scrittura-progetto', cartella: 'C:\\progetto',
      posizioneFn: async () => ({ dentro: false, verificato: true, vero, cartella, spazio: 'linux:Ubuntu' }),
      consensiSessione: { cartelleFuori: ['linux:Ubuntu|/tmp/approvata'] },
      chiediApprovazioneFn: async (a) => { domande.push(a); return false; },
    });
    return { esito, domande };
  };
  for (const [vero, cartella] of [['/tmp/approvata/b.txt', '/tmp/approvata'], ['/tmp/approvata/sotto/c.txt', '/tmp/approvata/sotto']]) {
    const { esito, domande } = await chiedi(vero, cartella);
    assert.equal(esito.consentito, true, vero);
    assert.equal(domande.length, 0, vero);
  }
  const { domande } = await chiedi('/tmp/approvata-no/x.txt', '/tmp/approvata-no');
  assert.equal(domande.length, 1, 'un prefisso di nome non è la cartella consentita');
});

/* Revisione Codex, rilievo 2 (owner 01/10/2026: «Confronto esatto»): in una cartella NTFS che distingue maiuscole e minuscole
   «Work» e «work» sono due cartelle. Dopo il percorso vero si confronta lettera per lettera; su un disco normale il realpath
   riporta una cartella ESISTENTE alla sua forma vera, quindi il prezzo è al più una domanda in più su una cartella non ancora nata. */
test('FUORI-12: confronto esatto — due cartelle non ancora nate con maiuscole diverse sono diverse; una esistente scritta in un altra forma resta dentro; un consenso su «Work» non copre «work»', async (t) => {
  const { radice, progetto } = cartelle(t);
  const mancante = join(radice, 'manca');
  assert.equal((await posizioneNelProgetto(join(mancante, 'Work'), join(mancante, 'work', 'x.txt'))).dentro, false);
  assert.equal((await posizioneNelProgetto(join(mancante, 'Work'), join(mancante, 'Work', 'x.txt'))).dentro, true);
  if (process.platform === 'win32') assert.equal((await posizioneNelProgetto(progetto, join(progetto, 'x.txt').toUpperCase())).dentro, true, 'cartella esistente, altra forma: il realpath la riconosce');
  const domande = [];
  await verificaPermessoScrittura({ tipo: 'scrivi', percorso: 'C:\\p\\work\\x.txt' }, {
    livelloAccesso: 'scrittura-progetto', cartella: 'C:\\progetto',
    posizioneFn: async () => ({ dentro: false, verificato: true, vero: 'C:\\p\\work\\x.txt', cartella: 'C:\\p\\work', spazio: 'locale' }),
    consensiSessione: { cartelleFuori: ['locale|C:\\p\\Work'] },
    chiediApprovazioneFn: async (a) => { domande.push(a); return false; },
  });
  assert.equal(domande.length, 1);
});

/* Revisione Codex, rilievo 1 (owner 01/10/2026: «Seconda misura prima di scrivere»): un collegamento sostituito da un altro
   processo fra la misura e la scrittura. Qui lo sostituisce la barriera `primaDiMutazioneFn`, che gira proprio in mezzo. */
test('FUORI-13: un collegamento cambiato fra la misura e la scrittura — dentro diventato fuori, o fuori approvato diventato un altro fuori — non si scrive, e la ricevuta dice failed', async (t) => {
  const { radice, progetto, fuori } = cartelle(t);
  const dentro = join(progetto, 'sotto'); mkdirSync(dentro);
  const altro = join(radice, 'altro'); mkdirSync(altro);
  const link = join(progetto, 'link');
  const punta = (bersaglio) => { try { unlinkSync(link); } catch { /* non c era */ } symlinkSync(bersaglio, link, 'junction'); };
  t.after(() => { try { unlinkSync(link); } catch { /* già via */ } });
  for (const [nome, prima, dopo, risposta] of [['dentro → fuori', dentro, fuori, false], ['fuori approvato → altro fuori', fuori, altro, true]]) {
    punta(prima);
    const ricevute = [];
    const { esito, domande } = await giro(progetto, [
      chiama('s', 'scrivi', { percorso: 'link/s.txt', contenuto: 'scrivi' }),
      chiama('e', 'file_edit', { percorso: 'link/e.txt', old_string: 'uno', new_string: 'due' }),
    ], {
      livelloAccesso: 'scrittura-progetto', risposta,
      primaDiMutazioneFn: async () => { punta(dopo); },
      onGiro: (e) => { if (e.tipo === 'ricevuta') { ricevute.push(e.ricevuta.status); punta(prima); } }, // ogni chiamata riparte dal collegamento di prima
      // il file da modificare esiste dove punta il collegamento PRIMA (e dopo: la modifica deve essere rifiutata per il percorso)
      ...(writeFileSync(join(prima, 'e.txt'), 'uno\n'), writeFileSync(join(dopo, 'e.txt'), 'uno\n'), {}),
    });
    assert.equal(existsSync(join(dopo, 's.txt')), false, `${nome}: niente scritto nel posto nuovo`);
    assert.equal(existsSync(join(prima, 's.txt')), false, `${nome}: né in quello vecchio`);
    assert.equal(readFileSync(join(dopo, 'e.txt'), 'utf8'), 'uno\n', `${nome}: file_edit non tocca il posto nuovo`);
    assert.match(esito('s'), /now leads somewhere else than when it was checked/, nome);
    assert.match(esito('e'), /now leads somewhere else than when it was checked/, nome);
    assert.deepEqual(ricevute, ['failed', 'failed'], nome);
    if (risposta) assert.equal(domande.length, 2, 'il fuori approvato era stato chiesto');
    punta(prima);
  }
});
