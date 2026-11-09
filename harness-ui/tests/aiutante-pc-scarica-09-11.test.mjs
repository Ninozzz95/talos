// L'aiutante del PC precostruito dalla release interna (owner 09/11/2026, strada A): riferimento senza impronte, sha256 controllato
// contro IMPRONTA_AIUTANTE_PC PRIMA di qualunque copia, e niente lasciato se non torna. `gh` è finto: le prove non toccano la rete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IMPRONTA_AIUTANTE_PC } from '../src/computer-use/aiutante-mcp.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import {
  ambienteDiGh, comandoGh, FILE_IMPRONTE_SORGENTE, FILE_RIFERIMENTO, improntaDegliAvvisi, leggiRiferimento, preparaAiutantePc,
  problemaDelFile, righeAmbiente, tagAtteso,
} from '../scripts/scarica-aiutante-pc.mjs';

const sha = (dati) => createHash('sha256').update(dati).digest('hex');
const EXE = Buffer.from('MZ aiutante del PC finto per le prove');
const AVVISI = Buffer.from('# avvisi delle crate, finti\n');

function banco(t, { exe = EXE } = {}) {
  /* classe A di BC-09: dentro ci sono solo file scritti e chiusi */
  const dir = cartellaDiProva('talos-aiutante-pc-prova-');
  t.after(() => rimuoviCartellaDiProva(dir));
  const cartella = join(dir, 'aiutante-pc');
  const impronta = sha(exe);
  const rif = { repository: 'Ninozzz95/talos', tag: tagAtteso(impronta), asset: 'cua-driver.exe', avvisi: 'THIRD_PARTY_NOTICES.md', byte: exe.length };
  const riferimento = join(dir, 'aiutante-pc.json');
  writeFileSync(riferimento, JSON.stringify(rif));
  const impronte = join(dir, 'IMPRONTE.sha256');
  writeFileSync(impronte, `# sha256  blob  percorso\n${'a'.repeat(64)}  ${'b'.repeat(40)}  LICENSE.md\n${sha(AVVISI)}  ${'c'.repeat(40)}  rust/THIRD_PARTY_NOTICES.md\n`);
  let n = 0;
  const temporanee = [];
  const temporanea = () => { const p = join(dir, `tmp-${n++}`); mkdirSync(p); temporanee.push(p); return p; };
  return { dir, cartella, rif, riferimento, impronte, impronta, temporanea, temporanee };
}

/** Un `gh` finto che registra le chiamate e scrive in `-D` gli asset che gli si danno (null = asset che la release non ha). */
function ghFinto({ exe = EXE, avvisi = AVVISI, rif, fallisce = null }) {
  const chiamate = [];
  const gh = (args) => {
    chiamate.push(args);
    if (fallisce) throw new Error(fallisce);
    const dest = args[args.indexOf('-D') + 1];
    if (exe !== null) writeFileSync(join(dest, rif.asset), exe);
    if (avvisi !== null) writeFileSync(join(dest, rif.avvisi), avvisi);
  };
  return { gh, chiamate };
}

const prepara = (b, gh, impronta = b.impronta) => preparaAiutantePc({ cartella: b.cartella, riferimento: b.riferimento, impronte: b.impronte, impronta, gh, temporanea: b.temporanea });

test('AIUTANTE-RIF-01 — il riferimento nel repo è valido, il tag viene dall\'impronta del codice e nel json non c\'è nessuna impronta', () => {
  const testo = readFileSync(FILE_RIFERIMENTO, 'utf8');
  const rif = leggiRiferimento(testo);
  assert.equal(rif.repository, 'Ninozzz95/talos');
  assert.equal(rif.tag, `aiutante-pc-${IMPRONTA_AIUTANTE_PC.slice(0, 16)}`);
  assert.equal(rif.asset, 'cua-driver.exe');
  assert.doesNotMatch(testo, /[0-9a-f]{64}/iu, 'una sola fonte dell\'impronta: IMPRONTA_AIUTANTE_PC');
  /* gli avvisi: la riga di IMPRONTE.sha256 del sorgente di cua, che l'export pubblico porta */
  assert.match(improntaDegliAvvisi(readFileSync(FILE_IMPRONTE_SORGENTE, 'utf8')), /^[0-9a-f]{64}$/u);
});

test('AIUTANTE-RIF-02 — un riferimento storto si rifiuta prima di scaricare qualunque cosa', () => {
  const buono = JSON.parse(readFileSync(FILE_RIFERIMENTO, 'utf8'));
  for (const [campo, valore] of [['tag', 'aiutante-pc-0000000000000000'], ['tag', `aiutante-pc-${IMPRONTA_AIUTANTE_PC.slice(0, 12)}`], ['tag', 'latest'], ['repository', 'Ninozzz95/talos --flag'],
    ['asset', 'cua-driver.dll'], ['asset', '../x.exe'], ['avvisi', 'avvisi.txt'], ['byte', 0], ['byte', '54299071']]) {
    assert.throws(() => leggiRiferimento(JSON.stringify({ ...buono, [campo]: valore })), new RegExp(campo, 'u'), `${campo}=${valore}`);
  }
  /* AL CONTRARIO: un'impronta copiata nel json (che poi resterebbe indietro) si rifiuta anche se fosse giusta */
  assert.throws(() => leggiRiferimento(JSON.stringify({ ...buono, sha256: IMPRONTA_AIUTANTE_PC })), /nessuna impronta nel riferimento/u);
  /* il tag segue l'impronta: un'impronta nuova nel codice senza riferimento nuovo si ferma qui */
  assert.throws(() => leggiRiferimento(JSON.stringify(buono), 'f'.repeat(64)), /tag \(atteso aiutante-pc-ffffffffffffffff,/u);
});

test('AIUTANTE-SCARICA-01 — impronta giusta: scarica i due asset di QUELLA release, li verifica e li posa; la temporanea se ne va', (t) => {
  const b = banco(t);
  const { gh, chiamate } = ghFinto({ rif: b.rif });
  const esito = prepara(b, gh);
  assert.equal(esito.scaricato, true);
  assert.equal(chiamate.length, 1);
  assert.deepEqual(chiamate[0], comandoGh(b.rif, b.temporanee[0]));
  assert.deepEqual(chiamate[0].slice(0, 9), ['release', 'download', b.rif.tag, '-R', 'Ninozzz95/talos', '-p', 'cua-driver.exe', '-p', 'THIRD_PARTY_NOTICES.md']);
  assert.deepEqual(readFileSync(esito.exe), EXE);
  assert.deepEqual(readFileSync(esito.avvisi), AVVISI);
  assert.deepEqual(readdirSync(b.cartella).sort(), ['THIRD_PARTY_NOTICES.md', 'cua-driver.exe'], 'niente .parziale lasciato');
  assert.equal(existsSync(b.temporanee[0]), false, 'la cartella temporanea se ne va');
  /* già presenti e giusti: nessuna chiamata a gh */
  const secondo = ghFinto({ rif: b.rif });
  assert.equal(prepara(b, secondo.gh).scaricato, false);
  assert.deepEqual(secondo.chiamate, []);
});

test('AIUTANTE-SCARICA-02 — impronta sbagliata: rifiuto, e nella cartella finale non arriva niente (né resta nella temporanea)', (t) => {
  for (const [nome, opzioni, atteso] of [
    ['exe diverso, stessa dimensione', { exe: Buffer.from(EXE.toString().replace('finto', 'falso')) }, /cua-driver\.exe della release .*: impronta [0-9a-f]{64} invece di/u],
    ['exe di altra dimensione', { exe: Buffer.from('MZ corto') }, /cua-driver\.exe della release .*: dimensione 8 byte invece di/u],
    ['avvisi diversi', { avvisi: Buffer.from('altri avvisi\n') }, /THIRD_PARTY_NOTICES\.md della release .*: impronta/u],
  ]) {
    const b = banco(t);
    const { gh } = ghFinto({ rif: b.rif, ...opzioni });
    assert.throws(() => prepara(b, gh), atteso, nome);
    assert.equal(existsSync(join(b.cartella, 'cua-driver.exe')), false, `${nome}: nessun exe copiato`);
    assert.equal(existsSync(join(b.cartella, 'THIRD_PARTY_NOTICES.md')), false, `${nome}: nessun avviso copiato`);
    assert.equal(existsSync(b.temporanee[0]), false, `${nome}: la temporanea se ne va`);
  }
});

test('AIUTANTE-SCARICA-03 — l\'impronta che conta è quella del CODICE: un exe coerente col json ma non con IMPRONTA_AIUTANTE_PC si rifiuta', (t) => {
  const b = banco(t);
  const { gh } = ghFinto({ rif: b.rif });
  /* il tag del banco è quello di EXE: con un'impronta diversa nel codice ci si ferma al riferimento, prima di gh */
  assert.throws(() => prepara(b, gh, 'e'.repeat(64)), /tag \(atteso aiutante-pc-eeeeeeeeeeeeeeee,/u);
  writeFileSync(b.riferimento, JSON.stringify({ ...b.rif, tag: tagAtteso('e'.repeat(64)) }));
  assert.throws(() => prepara(b, gh, 'e'.repeat(64)), /cua-driver\.exe della release aiutante-pc-eeeeeeeeeeeeeeee: impronta/u);
  assert.equal(existsSync(join(b.cartella, 'cua-driver.exe')), false);
  assert.throws(() => prepara(b, gh, null), /impronta fissata nel codice/u);
});

test('AIUTANTE-SCARICA-04 — asset assente o release che non c\'è: messaggio che dice quale file e quale tag, niente copiato', (t) => {
  const b = banco(t);
  const senzaExe = ghFinto({ rif: b.rif, exe: null });
  assert.throws(() => prepara(b, senzaExe.gh), new RegExp(`la release ${b.rif.tag} di Ninozzz95/talos non ha l'asset cua-driver\\.exe`, 'u'));
  const senzaAvvisi = ghFinto({ rif: b.rif, avvisi: null });
  assert.throws(() => prepara(b, senzaAvvisi.gh), /non ha l'asset THIRD_PARTY_NOTICES\.md/u);
  const nessuna = ghFinto({ rif: b.rif, fallisce: 'gh release download non riuscito (1): release not found' });
  assert.throws(() => prepara(b, nessuna.gh), (e) => /release not found/u.test(e.message) && e.message.includes(`release ${b.rif.tag}`)
    && /cua-driver\.exe e THIRD_PARTY_NOTICES\.md/u.test(e.message) && /gh release upload/u.test(e.message));
  assert.equal(existsSync(join(b.cartella, 'cua-driver.exe')), false);
});

test('AIUTANTE-SCARICA-05 — un exe SBAGLIATO già sul disco non basta: si riscarica e si sostituisce; se il nuovo è sbagliato il vecchio se ne va', (t) => {
  const b = banco(t);
  mkdirSync(b.cartella, { recursive: true });
  writeFileSync(join(b.cartella, 'cua-driver.exe'), Buffer.from('vecchio'));
  writeFileSync(join(b.cartella, 'THIRD_PARTY_NOTICES.md'), AVVISI);
  const { gh, chiamate } = ghFinto({ rif: b.rif });
  assert.equal(prepara(b, gh).scaricato, true);
  assert.equal(chiamate.length, 1);
  assert.deepEqual(readFileSync(join(b.cartella, 'cua-driver.exe')), EXE);
  writeFileSync(join(b.cartella, 'cua-driver.exe'), Buffer.from('vecchio'));
  assert.throws(() => prepara(b, ghFinto({ rif: b.rif, exe: Buffer.from('altro') }).gh), /impronta|dimensione/u);
  assert.equal(existsSync(join(b.cartella, 'cua-driver.exe')), false, 'un exe sbagliato non resta a sembrare pronto');
  assert.deepEqual(readFileSync(join(b.cartella, 'THIRD_PARTY_NOTICES.md')), AVVISI, 'gli avvisi giusti restano');
});

test('AIUTANTE-SEGRETI-01 — a gh arriva solo il gettone del job: nessun\'altra variabile che sembri un segreto', () => {
  const amb = ambienteDiGh({ PATH: 'C:\\x', GH_TOKEN: 'g', GITHUB_TOKEN: 'h', GITHUB_ENV: 'C:\\e', OPENROUTER_API_KEY: 'k1', OPENAI_API_KEY: 'k2',
    ANTHROPIC_API_KEY: 'k3', NPM_TOKEN: 'n', GH_ENTERPRISE_TOKEN: 'e', AWS_SECRET_ACCESS_KEY: 's', SIGNING_PASSWORD: 'p', TALOS_KEY: 'q', APPDATA: 'C:\\a' });
  assert.deepEqual(Object.keys(amb).sort(), ['APPDATA', 'GH_TOKEN', 'GITHUB_ENV', 'GITHUB_TOKEN', 'PATH']);
  /* il sorgente non legge altri segreti: le sole variabili d'ambiente nominate sono GITHUB_ENV (dove scrivere) e l'ambiente per gh */
  const sorgente = readFileSync(new URL('../scripts/scarica-aiutante-pc.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...new Set([...sorgente.matchAll(/process\.env\.([A-Z_]+)/gu)].map((m) => m[1]))].sort(), ['GITHUB_ENV']);
  assert.doesNotMatch(sorgente, /secrets\./u);
});

test('AIUTANTE-AMBIENTE-01 — le righe per GITHUB_ENV nominano exe e avvisi verificati, e un a capo nel percorso si rifiuta', () => {
  assert.equal(righeAmbiente({ exe: 'D:\\a\\cua-driver.exe', avvisi: 'D:\\a\\THIRD_PARTY_NOTICES.md' }),
    'TALOS_AIUTANTE_PC_SORGENTE=D:\\a\\cua-driver.exe\nTALOS_AIUTANTE_PC_AVVISI=D:\\a\\THIRD_PARTY_NOTICES.md\n');
  assert.throws(() => righeAmbiente({ exe: 'D:\\a\nPATH=x', avvisi: 'y' }), /a capo/u);
  assert.equal(problemaDelFile('Z:\\non-esiste\\cua-driver.exe', 'a'.repeat(64)), 'assente');
});
