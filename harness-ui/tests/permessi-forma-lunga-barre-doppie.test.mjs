/*
 * Giro di cura unico della riparazione dei permessi (12/11/2026; revisore A, A1; giudice 20:24: «A1 si cura in questo giro») — LA
 * FORMA LUNGA DI UN PERCORSO CON LE BARRE RADDOPPIATE.
 * `\\?\C:\\Users\\<utente>\\.ssh\\id_ed25519` è lo stesso file di `C:\Users\<utente>\.ssh\id_ed25519` (Windows unisce le barre che
 * seguono le prime due), ma per il controllo dei nomi era un indirizzo web: `C:\\` riscritto `C://` contiene `://`, e la cura delle
 * barre doppie (`C://x` → `C:/x`) guardava solo un percorso che comincia con la lettera del disco. Così la chiave SSH finta usciva
 * dall'attrezzo dei file SENZA carta in Scrive nel progetto e in Su richiesta (giro vero del revisore A); la forma lunga semplice
 * (`\\?\C:\Users\…`) chiedeva. C'era sulla base: le barre doppie si leggono dalla 0.1.14.
 * Solo `path-policy.mjs` e il nucleo (niente cancellazioni critiche): questo file si porta così com'è sulla CLI.
 *  - LUNGA-1: chiave SSH e `.env` del progetto nella forma lunga con le barre doppie: dal cancello, la stessa carta della forma lunga
 *    semplice, a ogni livello.
 *  - LUNGA-2: giro vero dell'attrezzo dei file fuori dall'Accesso pieno: la chiave finta non esce.
 *  - LUNGA-3: AL CONTRARIO, un file qualunque scritto così: la carta in più VOLUTA in «Scrive nel progetto» (mai quella del segreto).
 *  - LUNGA-5: le altre forme dello spazio dei nomi (`\??\`, `\\.\`, GLOBALROOT, UNC della macchina), dall'attrezzo e dalla shell.
 * ⛔ Storia: il giro unico (12/11 21:14) aveva fermato la cura perché cambiava un esito onesto (LUNGA-3) e A1 era andato nei limiti.
 *    Owner 12/11 22:27 «Sì, rimettila»: la cura torna (giro piccolo A1, `conLaHomeEspansa`: le barre doppie si uniscono dietro ogni
 *    prefisso dello spazio dei nomi), LUNGA-1 e LUNGA-2 non sono più `todo`, e la carta in più su un file normale scritto così in
 *    «Scrive nel progetto» è VOLUTA (LUNGA-3 la fissa). LUNGA-4 resta: ciò che chiedeva prima chiede ancora.
 * Fonte (letta il 12/11/2026): learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats, «Canonicalize separators»: «a series
 * of slashes that follow the first two slashes are collapsed into a single slash»; «Skip normalization»: i percorsi `\\?\` non si
 * normalizzano, ma Node (`path.resolve`, `fs`) li apre lo stesso.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { talosLavora, verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { comandoNominaUnaBloccata, motivoDaChiedere } from '../src/path-policy.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const WINDOWS = process.platform === 'win32';
const SALTA = !WINDOWS;
const SEGNO = 'CHIAVE-FINTA-DELLA-FORMA-LUNGA';
const BS = String.fromCharCode(92);
const LIVELLI = ['accesso-pieno', 'scrittura-progetto', 'su-richiesta'];

const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-forma-lunga-')));
const f = { casa: join(radice, 'casa'), progetto: join(radice, 'lavori', 'progetto') };
mkdirSync(join(f.casa, '.ssh'), { recursive: true });
mkdirSync(join(f.progetto, 'src'), { recursive: true });
writeFileSync(join(f.casa, '.ssh', 'id_ed25519'), `${SEGNO} ssh\n`);
writeFileSync(join(f.progetto, '.env'), `TOKEN=${SEGNO}\n`);
writeFileSync(join(f.progetto, 'nota.txt'), 'una nota qualunque\n');
writeFileSync(join(f.progetto, 'src', 'app.js'), 'export const app = 1;\n');
mkdirSync(join(f.casa, 'bloccata'), { recursive: true });
writeFileSync(join(f.casa, 'bloccata', 'diario.txt'), 'un diario finto\n');
const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
process.env.USERPROFILE = f.casa; process.env.HOME = f.casa;
test.after(async () => {
  if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
  if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  await rimuoviCartellaDiProvaAttesa(radice);
});

const doppie = (p) => p.replaceAll(BS, BS + BS);
const lungaDoppia = (p) => `${BS}${BS}?${BS}${p.slice(0, 2)}${doppie(p.slice(2))}`; // \\?\C:\\T\\…
const lungaPunto = (p) => `${BS}${BS}.${BS}${p.slice(0, 2)}${doppie(p.slice(2))}`; // \\.\C:\\T\\…
const lunga = (p) => `${BS}${BS}?${BS}${p}`; // \\?\C:\T\…
const chiave = join(f.casa, '.ssh', 'id_ed25519');
const env = join(f.progetto, '.env');
const nota = join(f.progetto, 'nota.txt');
const app = join(f.progetto, 'src', 'app.js');

const carte = async (azione, livelloAccesso, extra = {}) => {
  const chieste = [];
  const esito = await verificaPermessoScrittura({ toolCallId: 'k', ...azione }, { livelloAccesso, cartella: f.progetto, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; }, ...extra });
  return { chieste, esito };
};
async function giro(livelloAccesso, chiamata, extra = {}) {
  const chieste = [];
  const risposte = [{ role: 'assistant', content: null, tool_calls: [{ id: 'k0', type: 'function', function: { name: chiamata.nome, arguments: JSON.stringify(chiamata.argomenti) } }] },
    { role: 'assistant', content: 'fatto', tool_calls: [] }];
  let indice = 0;
  const messaggi = [];
  const fetchDiRete = async (_url, init) => {
    try { messaggi.push(JSON.parse(init?.body ?? '{}').messages ?? []); } catch { /* niente */ }
    const scelta = risposte[Math.min(indice++, risposte.length - 1)];
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
  };
  await talosLavora({
    cartella: f.progetto, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', fetchDiRete, livelloAccesso, consensiSessione: {},
    chiediApprovazioneFn: async (a) => { chieste.push(a); return false; },
    ambienteComandiFn: async () => ({ dove: 'windows', revisione: 0 }),
    ...extra,
  });
  const esito = String((messaggi.at(-1) ?? []).filter((m) => m.role === 'tool').at(-1)?.content ?? '');
  return { chieste, esito };
}

test('LUNGA-1 — chiave SSH e `.env` nella forma lunga con le barre doppie: la stessa carta della forma lunga semplice, a ogni livello', { skip: SALTA }, async () => {
  for (const p of [chiave, env]) {
    assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: lungaDoppia(p), cartella: f.progetto, home: f.casa })?.classe, 'segreto', `il nome: ${lungaDoppia(p)}`);
    assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: lungaPunto(p), cartella: f.progetto, home: f.casa })?.classe, 'segreto', `il nome: ${lungaPunto(p)}`);
    for (const livello of LIVELLI) {
      const semplice = await carte({ tipo: 'leggi', percorso: lunga(p) }, livello);
      const doppia = await carte({ tipo: 'leggi', percorso: lungaDoppia(p) }, livello);
      assert.equal(doppia.chieste.length, semplice.chieste.length, `${livello}: ${lungaDoppia(p)}`);
      assert.equal(doppia.esito.consentito, semplice.esito.consentito, `${livello}: ${lungaDoppia(p)}`);
    }
    for (const livello of ['scrittura-progetto', 'su-richiesta']) {
      const { chieste, esito } = await carte({ tipo: 'leggi', percorso: lungaDoppia(p) }, livello);
      assert.equal(chieste.length, 1, `una carta in ${livello}: ${lungaDoppia(p)}`);
      assert.equal(esito.consentito, false);
    }
  }
});

test('LUNGA-2 — giro vero: l\'attrezzo dei file non fa uscire la chiave finta scritta nella forma lunga con le barre doppie', { skip: SALTA }, async () => {
  for (const [livello, extra] of [['scrittura-progetto', {}], ['scrittura-progetto', { permessiPerAttrezzo: { shell: 'sempre' } }], ['su-richiesta', {}]]) {
    for (const p of [chiave, env]) {
      const { chieste, esito } = await giro(livello, { nome: 'leggi', argomenti: { percorso: lungaDoppia(p) } }, extra);
      assert.equal(chieste.length, 1, `${livello}: una carta per ${lungaDoppia(p)}`);
      assert.ok(!esito.includes(SEGNO), `${livello}: il segno non esce (${esito.slice(0, 80)})`);
    }
  }
});

/*
 * LUNGA-3 riscritta (giro piccolo A1, owner 12/11 22:27 «Sì, rimettila… si accetta una carta in più quando si legge un file normale scritto
 * in quella forma»). Misurato prima della cura (`giro-a1-lavoro/forme-testa.log`) e dopo (`forme-cura.log`): un file del progetto scritto
 * nella forma lunga con le barre doppie in «Scrive nel progetto» passa da 0 a 1 carta, quella «fuori dalla cartella di lavoro» (mai la
 * carta del segreto), uguale a ciò che la forma lunga SEMPLICE fa già oggi; Accesso pieno resta 0, Su richiesta resta 1, la shell resta
 * com'era, e lo stesso file scritto in modo normale non cambia.
 */
test('LUNGA-3 — la carta in più VOLUTA: un file normale del progetto scritto nella forma lunga con le barre doppie chiede in «Scrive nel progetto» con la carta «fuori dalla cartella», mai con quella del segreto, come la forma lunga semplice', { skip: SALTA }, async () => {
  const CARTE = { 'accesso-pieno': 0, 'scrittura-progetto': 1, 'su-richiesta': 1 };
  for (const file of [nota, app]) {
    for (const scritta of [lungaDoppia(file), lungaPunto(file)]) {
      assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: scritta, cartella: f.progetto, home: f.casa })?.classe, 'fuori-workspace', `il motivo per ${scritta}`);
    }
    for (const livello of LIVELLI) {
      const doppia = await carte({ tipo: 'leggi', percorso: lungaDoppia(file) }, livello);
      const semplice = await carte({ tipo: 'leggi', percorso: lunga(file) }, livello);
      assert.equal(doppia.chieste.length, CARTE[livello], `${livello}: le carte per ${lungaDoppia(file)}`);
      assert.equal(doppia.chieste.length, semplice.chieste.length, `${livello}: come la forma lunga semplice`);
      assert.ok(doppia.chieste.every((c) => c.segreto?.classe !== 'segreto'), `${livello}: mai la carta del segreto`);
      if (livello === 'scrittura-progetto') assert.equal(doppia.chieste[0]?.segreto?.classe, 'fuori-workspace', 'Scrive nel progetto: è la carta «fuori dalla cartella»');
      const normale = await carte({ tipo: 'leggi', percorso: file }, livello);
      assert.equal(normale.chieste.length, livello === 'su-richiesta' ? 1 : 0, `${livello}: lo stesso file scritto in modo normale non cambia`);
    }
    const shell = await carte({ tipo: 'shell', comando: `Get-Content '${lungaDoppia(file)}'` }, 'scrittura-progetto');
    assert.equal(shell.chieste.length, 0, 'la shell non prende carte in più');
  }
  const pieno = await giro('accesso-pieno', { nome: 'leggi', argomenti: { percorso: lungaDoppia(nota) } });
  assert.equal(pieno.chieste.length, 0, 'Accesso pieno: nessuna carta');
  assert.ok(pieno.esito.includes('una nota qualunque'), `Accesso pieno: il file si apre (${pieno.esito.slice(0, 80)})`);
  for (const extra of [{}, { permessiPerAttrezzo: { shell: 'sempre' } }]) {
    const { chieste, esito } = await giro('scrittura-progetto', { nome: 'leggi', argomenti: { percorso: lungaDoppia(nota) } }, extra);
    assert.equal(chieste.length, 1, 'Scrive nel progetto, giro vero: una carta');
    assert.ok(!esito.includes('una nota qualunque'), `col no la nota non si apre (${esito.slice(0, 80)})`);
  }
  const { chieste, esito } = await giro('scrittura-progetto', { nome: 'leggi', argomenti: { percorso: nota } });
  assert.equal(chieste.length, 0, 'Scrive nel progetto, giro vero, percorso normale: nessuna carta');
  assert.ok(esito.includes('una nota qualunque'), `il percorso normale si apre come prima (${esito.slice(0, 80)})`);
});

test('LUNGA-4 — ciò che chiedeva già prima della cura A1: la forma lunga semplice e quella con le barre doppie DRITTE chiedono a ogni livello; in Accesso pieno chiede anche quella con le doppie', { skip: SALTA }, async () => {
  const dritteDoppie = (p) => `${p.slice(0, 2)}${p.slice(2).replaceAll(BS, '//')}`; // C://T//…
  for (const livello of LIVELLI) {
    for (const scritta of [lunga(chiave), dritteDoppie(chiave)]) {
      const { chieste, esito } = await carte({ tipo: 'leggi', percorso: scritta }, livello);
      assert.equal(chieste.length, 1, `${livello}: una carta per ${scritta}`);
      assert.equal(esito.consentito, false);
    }
  }
  const { chieste } = await carte({ tipo: 'leggi', percorso: lungaDoppia(chiave) }, 'accesso-pieno');
  assert.equal(chieste.length, 1, 'Accesso pieno: la forma lunga con le doppie chiede (la lettura della casa in Accesso pieno)');
});

/*
 * LUNGA-5 (giro piccolo A1, giudice v1723 correzione 2: «attacco in più»): le altre porte dello spazio dei nomi NT, scritte semplici e
 * con le barre doppie, su chiave SSH e `.env`, ai tre livelli (SP, SP+ con la shell su «sempre», Su richiesta). Misurato sulla testa
 * 171003781 (`giro-a1-lavoro/forme-testa.log`, `apre-dalla-shell.log`): dal cancello `\\.\C:\\…`, `\??\C:\\…` e
 * `\\?\GLOBALROOT\??\C:\\…` passavano senza carta, e nella shell anche `\\?\C:\\…`; `Get-Content '\\?\C:\\…'` e
 * `Get-Content '\\.\C:\\…'` aprono davvero il file. L'attrezzo dei file rifiuta già ogni forma che non sia `\\?\C:\` (niente letto, nessuna
 * carta): qui lo si fissa, come guardia. Hermes rifiuta queste forme sulla stringa grezza (`agent/file_safety.py:387-394`).
 */
const nt = (p) => `${BS}??${BS}${p}`; // \??\C:\T\…
const ntDoppia = (p) => `${BS}??${BS}${p.slice(0, 2)}${doppie(p.slice(2))}`; // \??\C:\\T\\…
const punto = (p) => `${BS}${BS}.${BS}${p}`; // \\.\C:\T\…
const globalroot = (p) => `${BS}${BS}?${BS}GLOBALROOT${BS}??${BS}${p}`; // \\?\GLOBALROOT\??\C:\T\…
const globalrootDoppia = (p) => `${BS}${BS}?${BS}GLOBALROOT${BS}??${BS}${p.slice(0, 2)}${doppie(p.slice(2))}`;
const uncLocale = (p) => `${BS}${BS}?${BS}UNC${BS}localhost${BS}${p[0]}$${BS}${p.slice(3)}`; // \\?\UNC\localhost\C$\T\…
const uncLocaleDoppia = (p) => `${BS}${BS}?${BS}UNC${BS}localhost${BS}${p[0]}$${BS}${BS}${doppie(p.slice(3))}`;
const FORME_NT = { nt, ntDoppia, punto, puntoDoppia: lungaPunto, globalroot, globalrootDoppia, uncLocale, uncLocaleDoppia };
const TRE_LIVELLI = [['SP', 'scrittura-progetto', { permessiPerAttrezzo: {} }], ['SP+', 'scrittura-progetto', { permessiPerAttrezzo: { shell: 'sempre' } }], ['Su richiesta', 'su-richiesta', { permessiPerAttrezzo: {} }]];

test('LUNGA-5 — le altre forme dello spazio dei nomi (\\??\\, \\\\.\\, GLOBALROOT, UNC della macchina), semplici e con le barre doppie: chiave SSH e `.env` chiedono ai tre livelli, dall\'attrezzo dei file e dalla shell', { skip: SALTA }, async () => {
  for (const p of [chiave, env]) {
    for (const [nome, forma] of Object.entries({ ...FORME_NT, lungaDoppia })) {
      const x = forma(p);
      if (nome !== 'lungaDoppia') assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: x, cartella: f.progetto, home: f.casa })?.classe, 'segreto', `il nome (${nome}): ${x}`);
      assert.equal(motivoDaChiedere({ tipo: 'shell', comando: `Get-Content '${x}'`, cartella: f.progetto, home: f.casa })?.classe, 'segreto', `il nome nella shell (${nome}): ${x}`);
      for (const [livello, livelloAccesso, extra] of TRE_LIVELLI) {
        if (nome !== 'lungaDoppia') {
          const letta = await carte({ tipo: 'leggi', percorso: x }, livelloAccesso, extra);
          assert.equal(letta.chieste.length, 1, `${livello}, attrezzo dei file (${nome}): una carta per ${x}`);
          assert.equal(letta.chieste[0]?.segreto?.classe, 'segreto', `${livello} (${nome}): è la carta del segreto`);
          assert.equal(letta.esito.consentito, false);
        }
        const shell = await carte({ tipo: 'shell', comando: `Get-Content '${x}'` }, livelloAccesso, extra);
        assert.equal(shell.chieste.length, 1, `${livello}, shell (${nome}): una carta per Get-Content '${x}'`);
        assert.equal(shell.chieste[0]?.segreto?.classe, 'segreto', `${livello}, shell (${nome}): è la carta del segreto`);
        assert.equal(shell.esito.consentito, false);
      }
    }
  }
});

test('LUNGA-5b — guardia, giro vero: l\'attrezzo dei file non fa uscire la chiave finta da nessuna delle forme dello spazio dei nomi, ai tre livelli', { skip: SALTA }, async () => {
  for (const [livello, livelloAccesso, extra] of TRE_LIVELLI) {
    for (const p of [chiave, env]) {
      for (const [nome, forma] of Object.entries(FORME_NT)) {
        const { esito } = await giro(livelloAccesso, { nome: 'leggi', argomenti: { percorso: forma(p) } }, extra);
        assert.ok(!esito.includes(SEGNO), `${livello} (${nome}): il segno non esce (${esito.slice(0, 80)})`);
      }
    }
  }
});

/*
 * LUNGA-6 (giro piccolo A1, trovato con l'attacco in più): in Accesso pieno la credenziale della casa si riconosce riportando le grafie
 * dello stesso disco a `C:\…` (`comeDiscoLocale`), che conosceva `\\?\C:\` e `\\.\C:\` ma non `\??\C:\` né `\\?\GLOBALROOT\??\C:\`.
 * Misurato sulla cura A1 (`giro-a1-lavoro/shell-ap-cura.log`): `type \??\C:\…\.ssh\id_ed25519` e `Get-Content` con le due forme, semplici
 * o con le barre doppie, passavano senza carta in Accesso pieno; `type \??\C:\…` lo apre davvero (cmd), la forma GLOBALROOT la apre Node.
 */
test('LUNGA-6 — Accesso pieno: la chiave SSH della casa scritta con `\\??\\C:\\` o `\\\\?\\GLOBALROOT\\??\\C:\\` (semplici o con le barre doppie) chiede, dalla shell e dall\'attrezzo dei file', { skip: SALTA }, async () => {
  const puntoGlobalroot = (p) => `${BS}${BS}.${BS}GLOBALROOT${BS}??${BS}${p}`;
  for (const [nome, forma] of Object.entries({ nt, ntDoppia, globalroot, globalrootDoppia, puntoGlobalroot })) {
    const x = forma(chiave);
    for (const comando of [`type ${x}`, `Get-Content '${x}'`]) {
      const { chieste, esito } = await carte({ tipo: 'shell', comando }, 'accesso-pieno');
      assert.equal(chieste.length, 1, `Accesso pieno (${nome}): una carta per ${comando}`);
      assert.equal(esito.consentito, false);
    }
    const letta = await carte({ tipo: 'leggi', percorso: x }, 'accesso-pieno');
    assert.equal(letta.chieste.length, 1, `Accesso pieno, attrezzo dei file (${nome}): una carta per ${x}`);
  }
  /* le barre raddoppiate anche dopo il prefisso e dopo GLOBALROOT, e GLOBALROOT minuscolo: Node li apre tutti (misurato, `minuscole.mjs`) */
  const varianti = {
    doppiaDopoIlPrefisso: (p) => `${BS}${BS}?${BS}${BS}${p.slice(0, 2)}${doppie(p.slice(2))}`, // \\?\\C:\\T\\…
    globalrootTutteDoppie: (p) => `${BS}${BS}?${BS}GLOBALROOT${BS}${BS}??${BS}${BS}${p.slice(0, 2)}${doppie(p.slice(2))}`,
    globalrootMinuscolo: (p) => `${BS}${BS}?${BS}globalroot${BS}??${BS}${p}`,
  };
  for (const [nome, forma] of Object.entries(varianti)) {
    const x = forma(chiave);
    const { chieste } = await carte({ tipo: 'shell', comando: `Get-Content '${x}'` }, 'accesso-pieno');
    assert.equal(chieste.length, 1, `Accesso pieno (${nome}): una carta per Get-Content '${x}'`);
  }
  /* `\??\\C:\…` (la barra doppia subito dopo il prefisso NT): cmd lo apre (misurato, `giro-a1-lavoro/apre-m17.log`) */
  const ntDopoIlPrefisso = `${BS}??${BS}${BS}${chiave}`;
  assert.equal((await carte({ tipo: 'shell', comando: `type ${ntDopoIlPrefisso}` }, 'accesso-pieno')).chieste.length, 1, `Accesso pieno: una carta per type ${ntDopoIlPrefisso}`);
  /* al contrario: un file qualunque del progetto scritto così, in Accesso pieno, dalla shell non chiede */
  for (const forma of [nt, globalroot]) {
    const { chieste } = await carte({ tipo: 'shell', comando: `type ${forma(nota)}` }, 'accesso-pieno');
    assert.equal(chieste.length, 0, `Accesso pieno: nessuna carta per type ${forma(nota)}`);
  }
});

/*
 * Seconde prove del giro piccolo A1 (la regola del giro: ogni riga nuova uccisa da UNA prova sola ne ha una seconda). Mutanti in copia
 * (`giro-a1-lavoro/mutanti-a1.log`): «senza `\??\`» e «solo la prima doppia» nell'unione delle barre, «perde il prefisso», e nella
 * riconoscenza dello stesso disco «senza `\??\`», «senza GLOBALROOT», «senza il flag i», «una barra sola dopo il prefisso» cadevano su una
 * prova sola. Qui un'altra strada per ognuno: `elenca` e `.env` dall'attrezzo dei file, `type` nella shell, le cartelle bloccate.
 */
test('SECONDA-A1-1 — attrezzo dei file in «Scrive nel progetto»: `elenca` di `.ssh` scritta `\\??\\C:\\\\…`, `elenca` di `src` nella forma lunga a barre doppie, `.env` dietro `GLOBALROOT` a barre tutte doppie', { skip: SALTA }, async () => {
  const sp = { permessiPerAttrezzo: {} };
  const ssh = await carte({ tipo: 'elenca', percorso: ntDoppia(join(f.casa, '.ssh')) }, 'scrittura-progetto', sp);
  assert.equal(ssh.chieste.length, 1, 'elenca .ssh: una carta');
  assert.equal(ssh.chieste[0]?.segreto?.classe, 'segreto', 'elenca .ssh: la carta del segreto');
  const src = await carte({ tipo: 'elenca', percorso: lungaDoppia(join(f.progetto, 'src')) }, 'scrittura-progetto', sp);
  assert.equal(src.chieste.length, 1, 'elenca src nella forma lunga: la carta in più');
  assert.equal(src.chieste[0]?.segreto?.classe, 'fuori-workspace', 'elenca src: la carta «fuori dalla cartella», non quella del segreto');
  const tutteDoppie = `${BS}${BS}?${BS}GLOBALROOT${BS}${BS}??${BS}${BS}${env.slice(0, 2)}${doppie(env.slice(2))}`;
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: tutteDoppie, cartella: f.progetto, home: f.casa })?.classe, 'segreto', `il nome: ${tutteDoppie}`);
  const letta = await carte({ tipo: 'leggi', percorso: tutteDoppie }, 'scrittura-progetto', sp);
  assert.equal(letta.chieste[0]?.segreto?.classe, 'segreto', `.env dietro GLOBALROOT a barre tutte doppie: la carta del segreto`);
});

test('SECONDA-A1-2 — la shell con la shell su «sempre»: `type` di `.env` scritto `\\??\\C:\\\\…` e `Get-Content` dietro `GLOBALROOT` a barre tutte doppie chiedono il segreto', { skip: SALTA }, async () => {
  const spPiu = { permessiPerAttrezzo: { shell: 'sempre' } };
  const tutteDoppie = `${BS}${BS}?${BS}GLOBALROOT${BS}${BS}??${BS}${BS}${env.slice(0, 2)}${doppie(env.slice(2))}`;
  for (const comando of [`type ${ntDoppia(env)}`, `Get-Content '${tutteDoppie}'`]) {
    const { chieste, esito } = await carte({ tipo: 'shell', comando }, 'scrittura-progetto', spPiu);
    assert.equal(chieste.length, 1, `una carta per ${comando}`);
    assert.equal(chieste[0]?.segreto?.classe, 'segreto', `la carta del segreto per ${comando}`);
    assert.equal(esito.consentito, false);
  }
});

test('SECONDA-A1-3 — lo stesso disco nelle altre strade: una cartella bloccata nominata da un comando con `\\??\\C:\\`, `GLOBALROOT` (anche minuscolo) e le barre doppie dopo il prefisso è riconosciuta; in Accesso pieno l\'attrezzo dei file chiede per la chiave della casa', { skip: SALTA }, async () => {
  const bloccata = join(f.casa, 'bloccata');
  const diario = join(bloccata, 'diario.txt');
  const forme = {
    nt, globalroot,
    globalrootMinuscolo: (p) => `${BS}${BS}?${BS}globalroot${BS}??${BS}${p}`,
    doppiaDopoIlPrefisso: (p) => `${BS}${BS}?${BS}${BS}${p.slice(0, 2)}${doppie(p.slice(2))}`,
    globalrootTutteDoppie: (p) => `${BS}${BS}?${BS}GLOBALROOT${BS}${BS}??${BS}${BS}${p.slice(0, 2)}${doppie(p.slice(2))}`,
    ntDopoIlPrefisso: (p) => `${BS}??${BS}${BS}${p}`,
  };
  for (const [nome, forma] of Object.entries(forme)) {
    assert.ok(comandoNominaUnaBloccata(`type ${forma(diario)}`, { cartella: f.progetto, bloccati: [bloccata] }), `cartella bloccata (${nome}): ${forma(diario)}`);
    const { chieste } = await carte({ tipo: 'leggi', percorso: forma(chiave) }, 'accesso-pieno');
    assert.equal(chieste.length, 1, `Accesso pieno, attrezzo dei file (${nome}): una carta`);
  }
  assert.equal(comandoNominaUnaBloccata(`type ${nt(nota)}`, { cartella: f.progetto, bloccati: [bloccata] }), null, 'al contrario: un file del progetto non è bloccato');
});
