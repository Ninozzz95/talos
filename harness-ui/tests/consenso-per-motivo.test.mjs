/*
 * ⛔ Decisione 107 dell'owner (03/11/2026 sera, «Un sì per ogni motivo») e reperto S3 di Performance
 *   (`REVISIONE-GUARDIA-BLOCCO-DOPO-2026-11-04.md`). Fonti: `FONTI-GUARDIA-CONSENSO-PER-MOTIVO-2026-11-04.md`.
 *
 * 1. Il sì «per la sessione» vale per il percorso E per il motivo della carta, come Hermes (`tools/approval.py:263-266`, sessione +
 *    schema). Fino a 1f5c8695a la carta dei biglietti veri e quella «troppo complesso» salvavano la stessa chiave (`biglietto-talos`):
 *    un sì dato a un comando illeggibile lasciava passare i biglietti veri per il resto della sessione.
 *    - La chiave si compone nel SERVER, dalla domanda in attesa: il client manda solo `{ ambito: 'percorso' }` (condizione del Mobile).
 *    - Una chiave vecchia, senza motivo, non vale per niente: poteva venire da un sì dato a un tetto (critica di Performance).
 * 2. Oltre il tetto dei salti fra i collegamenti il cammino non sa dove si arriva: si chiede («troppo complesso»), invece di tacere.
 *    Windows segue le giunzioni fino a 63 salti.
 *
 * Casa finta per tutto il file, cartelle di prova create e tolte qui; le giunzioni si staccano una per una prima di togliere la cartella.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { chiaveDelConsensoDi, credenzialeDellaCasaLetta, motivoDaChiedere } from '../src/path-policy.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-consenso-motivo-')));
const casa = join(radice, 'casa');
const progetto = join(radice, 'progetto');
mkdirSync(join(casa, '.ssh'), { recursive: true });
mkdirSync(progetto, { recursive: true });
writeFileSync(join(casa, '.ssh', 'note'), 'FINTA\n');
writeFileSync(join(progetto, '.env'), 'X=1\n');
const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
process.env.USERPROFILE = casa;
process.env.HOME = casa;
assert.equal(homedir(), casa, 'premessa: la casa è quella finta');

const giunzioni = [];
test.after(async () => {
  for (const g of giunzioni.reverse()) { try { rmdirSync(g); } catch { /* già staccata */ } }
  for (const [k, v] of Object.entries(prima)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await rimuoviCartellaDiProvaAttesa(radice);
});

const BIGLIETTI = 'node harness-ui/scripts/biglietto-talos.mjs --apri';
const BIGLIETTI_2 = 'cat ~/.talos-biglietti/4174.chiave';
const COMPLESSO = 'bash -c '.repeat(20) + 'ls';
const COMPLESSO_2 = 'echo ' + '$('.repeat(6) + 'ls' + ')'.repeat(6);

/** Un registro vero con una sessione aperta: il sì «per la sessione» passa da `rispondiApprovazione`, come dal PC e dal telefono. */
async function banco(t, opzioni = {}) {
  const cartellaStore = mkdtempSync(join(radice, 'store-'));
  const giri = [];
  const registro = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'lavora' } }),
    avviaSessioneFn(input) {
      let fine;
      const promessa = new Promise((r) => { fine = r; });
      giri.push({ input, fine });
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${giri.length}` });
      return promessa;
    },
    ...opzioni,
  });
  const chiudiGiro = async (g) => {
    if (g.chiuso) return;
    g.chiuso = true;
    g.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'fine' });
    g.fine({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } });
  };
  t.after(async () => {
    for (const g of giri) { try { await chiudiGiro(g); } catch { /* già chiuso */ } }
    await registro.chiudi?.({ attesaMassimaMs: 2_000 }).catch(() => {});
  });
  const { sessionId } = registro.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const { input } = giri[0];
  /**
   * Il kernel vero davanti all'azione. `risposta`: 'sessione' = la persona sceglie «Consenti per la sessione» (il client manda SOLO
   * `{ ambito: 'percorso' }`, nessun motivo), 'volta' = un sì semplice. Torna le carte mostrate.
   */
  /* 155 (owner 04/11/2026): in Accesso pieno la guardia dei biglietti non chiede più. Queste prove sono sulla chiave del consenso (S2,
     decisione 107), che vale dove la guardia chiede ancora: «Scrive nel progetto» con «shell: sempre», così chiede solo la guardia. */
  const davanti = async (azione, { livelloAccesso = 'scrittura-progetto', permessiPerAttrezzo = { shell: 'sempre' }, risposta = 'volta', cartella = progetto } = {}) => {
    const carte = [];
    const esito = await verificaPermessoScrittura(azione, {
      livelloAccesso, permessiPerAttrezzo, cartella, consensiSessione: input.consensiSessione,
      chiediApprovazioneFn: async (a) => {
        carte.push(a);
        if (risposta !== 'sessione') return true;
        const domanda = input.chiediApprovazioneFn(a);
        await new Promise((r) => setTimeout(r, 10));
        const requestId = registro.domandaInAttesa(sessionId)?.requestId;
        assert.ok(requestId, 'premessa: una domanda aperta');
        assert.deepEqual(registro.rispondiApprovazione(sessionId, requestId, true, { ambito: 'percorso' }), { ok: true });
        return domanda;
      },
    });
    return { esito, carte };
  };
  const consensi = () => [...(input.consensiSessione.segretiConsentiti ?? [])];
  const azzera = () => { if (input.consensiSessione.segretiConsentiti) input.consensiSessione.segretiConsentiti.length = 0; };
  return { registro, sessionId, input, giri, davanti, consensi, azzera, chiudiGiro };
}

test('CPM-01 un sì per la sessione su «troppo complesso» non apre i biglietti veri; lo stesso motivo resta aperto', async (t) => {
  const b = await banco(t);
  const primo = await b.davanti({ tipo: 'shell', comando: COMPLESSO }, { risposta: 'sessione' });
  assert.equal(primo.carte.length, 1, 'premessa: il comando troppo complesso chiede');
  assert.equal(primo.carte[0].segreto?.perche, 'troppo-complesso', 'premessa: la carta è quella «troppo complesso»');
  assert.equal(b.consensi().length, 1, 'il sì è salvato');
  assert.equal((await b.davanti({ tipo: 'shell', comando: BIGLIETTI })).carte.length, 1, 'i biglietti veri chiedono ancora');
  assert.equal((await b.davanti({ tipo: 'shell', comando: BIGLIETTI_2 })).carte.length, 1, 'anche la chiave dei biglietti');
  assert.match(b.consensi()[0], /troppo-complesso/u, 'la chiave porta il motivo, anche se il client non l\'ha mandato');
  /* AL CONTRARIO: lo stesso comando non chiede una seconda volta; un ALTRO comando troppo complesso sì (S2 di Performance: un comando
     che non si legge può nascondere qualunque cosa, quindi il sì vale per quel comando intero, non per il motivo) */
  assert.equal((await b.davanti({ tipo: 'shell', comando: COMPLESSO })).carte.length, 0, 'lo stesso comando non richiede');
  assert.equal((await b.davanti({ tipo: 'shell', comando: COMPLESSO_2 })).carte.length, 1, 'un altro comando troppo complesso chiede');
});

/* S2 (revisione di Performance su 5922c71d1): oltre un tetto il percorso della carta è sempre lo stesso (`biglietto-talos`, o il comando
   tagliato a 120 caratteri), quindi il sì «per la sessione» dato a un comando illeggibile innocuo apriva i biglietti veri nascosti dietro lo
   stesso tetto. Le coppie sono quelle che Performance ha misurato. */
const INNOCUO_ANNIDATO = 'bash -c "'.repeat(6) + 'echo ciao' + '"'.repeat(6);
const NASCOSTO_ANNIDATO = 'bash -c "'.repeat(6) + 'node scripts/biglietto-talos.mjs --apri' + '"'.repeat(6);
const INNOCUO_IN_FILA = Array.from({ length: 17 }, () => 'bash -c "echo"').join(' && ');
const NASCOSTO_IN_FILA = `${INNOCUO_IN_FILA} && node scripts/biglietto-talos.mjs --apri`;

test('CPM-06 S2: un sì per la sessione su un comando troppo complesso innocuo non apre i biglietti veri nascosti dietro lo stesso tetto', async (t) => {
  for (const [innocuo, nascosto, come] of [[INNOCUO_ANNIDATO, NASCOSTO_ANNIDATO, 'annidati'], [INNOCUO_IN_FILA, NASCOSTO_IN_FILA, 'in fila']]) {
    const b = await banco(t);
    const primo = await b.davanti({ tipo: 'shell', comando: innocuo }, { risposta: 'sessione' });
    assert.equal(primo.carte.length, 1, `premessa (${come}): il comando innocuo chiede`);
    assert.equal(primo.carte[0].segreto?.perche, 'troppo-complesso', `premessa (${come}): è la carta «troppo complesso»`);
    const dietro = await b.davanti({ tipo: 'shell', comando: nascosto });
    assert.equal(dietro.carte.length, 1, `${come}: i biglietti veri nascosti dietro il tetto chiedono ancora`);
    assert.equal((await b.davanti({ tipo: 'shell', comando: innocuo })).carte.length, 0, `${come}: lo stesso comando non richiede`);
  }
});

test('CPM-07 S2: la chiave di un tetto porta l\'impronta del comando intero; senza il comando non c\'è chiave (si chiede sempre)', () => {
  const segnalazione = { classe: 'segreto', percorso: 'biglietto-talos', perche: 'troppo-complesso' };
  const a = chiaveDelConsensoDi(segnalazione, 'shell', INNOCUO_ANNIDATO);
  const z = chiaveDelConsensoDi(segnalazione, 'shell', NASCOSTO_ANNIDATO);
  assert.match(String(a), /^lettura:troppo-complesso:sha256:[0-9a-f]{64}$/u);
  assert.notEqual(a, z, 'due comandi diversi, due chiavi');
  assert.equal(chiaveDelConsensoDi(segnalazione, 'shell', INNOCUO_ANNIDATO), a, 'lo stesso comando, la stessa chiave');
  assert.equal(chiaveDelConsensoDi(segnalazione, 'shell'), null, 'senza il comando nessuna chiave');
  assert.equal(chiaveDelConsensoDi(segnalazione, 'shell', ''), null, 'col comando vuoto nessuna chiave');
  /* S2 della revisione cloud della PR 20 (04/11): anche i biglietti hanno un percorso fisso, e la chiave porta l'impronta del comando */
  const b1 = chiaveDelConsensoDi({ classe: 'segreto', percorso: 'biglietto-talos', perche: 'biglietti' }, 'shell', BIGLIETTI);
  assert.match(String(b1), /^lettura:biglietti:sha256:[0-9a-f]{64}$/u);
  assert.notEqual(b1, chiaveDelConsensoDi({ classe: 'segreto', percorso: 'biglietto-talos', perche: 'biglietti' }, 'shell', BIGLIETTI_2), 'due comandi dei biglietti, due chiavi');
  assert.equal(chiaveDelConsensoDi({ classe: 'segreto', percorso: 'biglietto-talos', perche: 'biglietti' }, 'shell'), null, 'biglietti senza il comando: nessuna chiave');
  /* AL CONTRARIO: i motivi che si leggono restano sul percorso, così i sì già provati non cambiano */
  assert.equal(chiaveDelConsensoDi({ classe: 'segreto', percorso: '.env' }, 'scrivi', '.env'), 'scrittura:segreto:.env');
});

test('CPM-02 un sì per la sessione sui biglietti veri non apre un comando troppo complesso; i biglietti restano aperti', async (t) => {
  const b = await banco(t);
  const primo = await b.davanti({ tipo: 'shell', comando: BIGLIETTI }, { risposta: 'sessione' });
  assert.equal(primo.carte.length, 1, 'premessa: i biglietti chiedono');
  assert.equal(primo.carte[0].segreto?.perche, 'biglietti');
  assert.equal((await b.davanti({ tipo: 'shell', comando: COMPLESSO })).carte.length, 1, 'il comando troppo complesso chiede ancora');
  assert.match(b.consensi()[0], /biglietti/u, 'la chiave porta il motivo');
  assert.equal((await b.davanti({ tipo: 'shell', comando: BIGLIETTI })).carte.length, 0, 'lo stesso comando non richiede');
  /* S2 della revisione cloud della PR 20 (04/11): il sì vale per il motivo E per quel comando; un altro comando dei biglietti chiede di nuovo */
  assert.equal((await b.davanti({ tipo: 'shell', comando: BIGLIETTI_2 })).carte.length, 1, 'un altro comando dei biglietti chiede ancora');
});

test('CPM-03 una chiave vecchia senza motivo non apre niente: biglietti, troppo complesso, .env in lettura e in scrittura', async (t) => {
  const b = await banco(t);
  for (const [vecchia, azione, livelloAccesso] of [
    ['biglietto-talos', { tipo: 'shell', comando: BIGLIETTI }, 'scrittura-progetto'],
    ['biglietto-talos', { tipo: 'shell', comando: COMPLESSO }, 'scrittura-progetto'],
    ['.env', { tipo: 'leggi', percorso: '.env' }, 'scrittura-progetto'],
    ['scrittura:.env', { tipo: 'scrivi', percorso: '.env' }, 'scrittura-progetto'],
  ]) {
    b.azzera();
    (b.input.consensiSessione.segretiConsentiti ??= []).push(vecchia);
    assert.equal((await b.davanti(azione, { livelloAccesso })).carte.length, 1, `la chiave vecchia «${vecchia}» non apre ${JSON.stringify(azione)}`);
  }
});

test('CPM-04 lettura e scrittura restano separate col motivo; un sì nuovo vale per la stessa azione', async (t) => {
  const b = await banco(t);
  const opzioni = { livelloAccesso: 'scrittura-progetto' };
  assert.equal((await b.davanti({ tipo: 'leggi', percorso: '.env' }, { ...opzioni, risposta: 'sessione' })).carte.length, 1);
  assert.equal((await b.davanti({ tipo: 'leggi', percorso: '.env' }, opzioni)).carte.length, 0, 'la lettura non richiede');
  assert.equal((await b.davanti({ tipo: 'scrivi', percorso: '.env' }, { ...opzioni, risposta: 'sessione' })).carte.length, 1, 'il sì della lettura non apre la scrittura');
  assert.equal((await b.davanti({ tipo: 'scrivi', percorso: '.env' }, opzioni)).carte.length, 0, 'la scrittura non richiede');
  assert.equal(b.consensi().length, 2, 'due chiavi, una per azione');
  assert.notEqual(b.consensi()[0], b.consensi()[1]);
});

test('CPM-05 la prova di un obiettivo legge .env solo col sì nuovo della sessione, mai con la chiave vecchia', async (t) => {
  const b = await banco(t, { obiettiviNellaChat: true });
  const verifica = async () => {
    const criteri = [{ testo: '.env contiene X', verifica: { tipo: 'file', percorso: '.env', fatto: 'contiene', testo: 'X=1' } }];
    const posto = await b.registro.impostaObiettivo(b.sessionId, 'controlla', { criteri });
    assert.equal(posto?.erroreAvvio, undefined, JSON.stringify(posto));
    const v = await b.registro.verificaObiettivo(b.sessionId);
    assert.equal(v?.erroreAvvio, undefined, JSON.stringify(v));
    return (v.verifica?.verdetti ?? []).map((c) => ({ esito: c.esito, motivo: c.motivo?.tipo ?? null }))[0];
  };
  /* la chiave vecchia, nuda */
  (b.input.consensiSessione.segretiConsentiti ??= []).push('.env');
  await b.chiudiGiro(b.giri[0]);
  await b.registro.attendiAssestamento?.(b.sessionId);
  assert.equal((await verifica()).esito, 'non-verificabile', 'la chiave vecchia non apre la lettura della prova');
  /* via l'obiettivo prima del giro: altrimenti la fine del giro fa partire le sue prove (`cicloObiettivo`) e la verifica qui sotto
     trova «goal-check-running» sotto carico */
  await b.registro.togliObiettivo(b.sessionId);
  /* il sì nuovo, dato dentro un giro come lo dà la persona */
  b.azzera();
  b.registro.resume(b.sessionId, 'leggi .env', []);
  const giro = b.giri.at(-1);
  const carte = [];
  await verificaPermessoScrittura({ tipo: 'leggi', percorso: '.env' }, {
    livelloAccesso: 'scrittura-progetto', cartella: progetto, consensiSessione: giro.input.consensiSessione,
    chiediApprovazioneFn: async (a) => {
      carte.push(a);
      const domanda = giro.input.chiediApprovazioneFn(a);
      await new Promise((r) => setTimeout(r, 10));
      const requestId = b.registro.domandaInAttesa(b.sessionId)?.requestId;
      assert.deepEqual(b.registro.rispondiApprovazione(b.sessionId, requestId, true, { ambito: 'percorso' }), { ok: true });
      return domanda;
    },
  });
  assert.equal(carte.length, 1, 'premessa: la lettura ha chiesto');
  await b.chiudiGiro(giro);
  await b.registro.attendiAssestamento?.(b.sessionId);
  assert.equal((await verifica()).esito, 'verde', 'col sì nuovo la prova legge .env');
});

/* ---------- S3: oltre il tetto dei salti si chiede ---------- */

const catene = join(radice, 'catene');
const normale = join(radice, 'normale');
mkdirSync(catene, { recursive: true });
mkdirSync(normale, { recursive: true });
writeFileSync(join(normale, 'x.txt'), 'x');
/** cN → c(N-1) → … → c1 → bersaglio: `nN/cN` porta al bersaglio in N salti. */
function catena(nome, n, bersaglio) {
  const cartella = join(catene, nome);
  mkdirSync(cartella, { recursive: true });
  let prima = bersaglio;
  for (let i = 1; i <= n; i += 1) {
    const g = join(cartella, `c${i}`);
    symlinkSync(prima, g, 'junction');
    giunzioni.push(g);
    prima = g;
  }
  return `${nome}/c${n}`;
}
const SALTI = [10, 39, 41, 45, 80];
const versoLaSsh = process.platform === 'win32' ? Object.fromEntries(SALTI.map((n) => [n, catena(`ssh${n}`, n, join(casa, '.ssh'))])) : {};
const versoNormale = process.platform === 'win32' ? Object.fromEntries([10, 39].map((n) => [n, catena(`normale${n}`, n, normale)])) : {};

test('CPM-S3-01 catene vere di giunzioni verso la .ssh finta: chiedono a 10, 39, 41, 45 e 80 salti, nei due modi', { skip: process.platform !== 'win32' }, async (t) => {
  try { t.diagnostic(`Windows legge a 45 salti: ${readFileSync(join(catene, versoLaSsh[45], 'note'), 'utf8').trim() === 'FINTA'}`); } catch (e) { t.diagnostic(`Windows a 45 salti: ${e.code}`); }
  const b = await banco(t);
  for (const n of SALTI) {
    const via = versoLaSsh[n];
    await t.test(`${n} salti`, async () => {
      const argomenti = { cartella: catene, home: casa };
      assert.equal(credenzialeDellaCasaLetta({ ...argomenti, tipo: 'shell', comando: `cat ${via}/note` })?.credenzialeDellaCasa, true, `Accesso pieno, shell, ${n}`);
      assert.equal(credenzialeDellaCasaLetta({ ...argomenti, tipo: 'leggi', percorso: `${via}/note` })?.credenzialeDellaCasa, true, `Accesso pieno, leggi, ${n}`);
      assert.equal(credenzialeDellaCasaLetta({ ...argomenti, tipo: 'shell', comando: `ls ${via}` })?.credenzialeDellaCasa, true, `Accesso pieno, la foglia, ${n}`);
      assert.ok(motivoDaChiedere({ ...argomenti, tipo: 'leggi', percorso: `${via}/note` }), `modo ristretto, leggi, ${n}`);
      for (const azione of [{ tipo: 'shell', comando: `cat ${via}/note` }, { tipo: 'leggi', percorso: `${via}/note` }]) {
        const carte = [];
        await verificaPermessoScrittura(azione, { livelloAccesso: 'accesso-pieno', cartella: catene, chiediApprovazioneFn: async (a) => { carte.push(a); return true; } });
        assert.equal(carte.length, 1, `kernel, Accesso pieno, ${n}: ${JSON.stringify(azione)}`);
      }
    });
  }
  /* oltre il tetto la carta dice «troppo complesso», e un sì per la sessione vale per quel comando, non per la .ssh scritta per nome */
  const suCatene = { cartella: catene, livelloAccesso: 'accesso-pieno' }; // la 161 in Accesso pieno: il cammino oltre il tetto
  const oltre = await b.davanti({ tipo: 'shell', comando: `cat ${versoLaSsh[45]}/note` }, { ...suCatene, risposta: 'sessione' });
  assert.equal(oltre.carte.length, 1);
  assert.equal(oltre.carte[0].segreto?.perche, 'troppo-complesso');
  assert.equal(oltre.carte[0].segreto.fraseChiave, 'server.approval.command.tooComplex');
  assert.equal((await b.davanti({ tipo: 'shell', comando: `cat ${versoLaSsh[45]}/note` }, suCatene)).carte.length, 0, 'lo stesso comando non richiede');
  assert.equal((await b.davanti({ tipo: 'shell', comando: 'cat ~/.ssh/note' }, suCatene)).carte.length, 1, 'la .ssh scritta per nome chiede ancora');
});

/* un salto solo verso la cartella normale, per la prova della cartella della sessione oltre il tetto */
const unSalto = process.platform === 'win32' ? catena('uno', 1, normale) : null;

test('CPM-S3-03 ogni lettore del cammino chiede oltre il tetto: elenca, la cartella e la foglia di un comando, la cartella della sessione', { skip: process.platform !== 'win32' }, () => {
  const argomenti = { cartella: catene, home: casa };
  const via = versoLaSsh[45];
  /* `elenca` non passa dal controllo degli hard link: lo prende solo il bersaglio del collegamento */
  assert.equal(motivoDaChiedere({ ...argomenti, tipo: 'elenca', percorso: via })?.perche, 'troppo-complesso', 'elenca, 45 salti');
  /* il modo ristretto, shell: la cartella del pezzo oltre il tetto, poi la foglia che è essa stessa l inizio della catena */
  assert.equal(motivoDaChiedere({ ...argomenti, tipo: 'shell', comando: `cat ${via}/note` })?.perche, 'troppo-complesso', 'shell, la cartella del pezzo');
  assert.equal(motivoDaChiedere({ ...argomenti, tipo: 'shell', comando: `ls ${via}` })?.perche, 'troppo-complesso', 'shell, la foglia');
  /* la cartella della sessione è lei oltre il tetto: il percorso, che passa da un salto solo, non si può dire dentro o fuori */
  const sessione = { cartella: join(catene, via), home: casa, accessoPieno: true };
  assert.equal(motivoDaChiedere({ ...sessione, tipo: 'elenca', percorso: join(catene, unSalto) })?.perche, 'troppo-complesso', 'la cartella della sessione');
  /* AL CONTRARIO: sotto il tetto le stesse forme non chiedono */
  const corta = versoNormale[39];
  assert.equal(motivoDaChiedere({ ...argomenti, tipo: 'elenca', percorso: corta }), null, 'elenca, 39 salti');
  assert.equal(motivoDaChiedere({ ...argomenti, tipo: 'shell', comando: `cat ${corta}/x.txt` }), null, 'shell, 39 salti');
  assert.equal(motivoDaChiedere({ ...argomenti, tipo: 'shell', comando: `ls ${corta}` }), null, 'shell, la foglia, 39 salti');
  assert.equal(motivoDaChiedere({ cartella: join(catene, corta), home: casa, accessoPieno: true, tipo: 'elenca', percorso: join(catene, unSalto) }), null, 'la cartella della sessione a 39 salti');
});

test('CPM-S3-02 AL CONTRARIO: catene che non toccano niente di protetto non chiedono', { skip: process.platform !== 'win32' }, async () => {
  for (const n of [10, 39]) {
    const via = versoNormale[n];
    const argomenti = { cartella: catene, home: casa };
    assert.equal(credenzialeDellaCasaLetta({ ...argomenti, tipo: 'shell', comando: `cat ${via}/x.txt` }), null, `shell, ${n}`);
    assert.equal(credenzialeDellaCasaLetta({ ...argomenti, tipo: 'leggi', percorso: `${via}/x.txt` }), null, `leggi, ${n}`);
    assert.equal(motivoDaChiedere({ ...argomenti, tipo: 'leggi', percorso: `${via}/x.txt` }), null, `modo ristretto, ${n}`);
    for (const azione of [{ tipo: 'shell', comando: `cat ${via}/x.txt` }, { tipo: 'leggi', percorso: `${via}/x.txt` }]) {
      const carte = [];
      await verificaPermessoScrittura(azione, { livelloAccesso: 'accesso-pieno', cartella: catene, chiediApprovazioneFn: async (a) => { carte.push(a); return true; } });
      assert.equal(carte.length, 0, `kernel, Accesso pieno, ${n}: ${JSON.stringify(azione)}`);
    }
  }
});
