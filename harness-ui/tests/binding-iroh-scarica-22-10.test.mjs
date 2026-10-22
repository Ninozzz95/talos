// Il binding iroh dalla corsa fissata (owner 22/10/2026, «nel repo solo l'impronta»): riferimento, tre controlli, e niente
// copiato se uno manca. `gh` è finto: le prove non toccano la rete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { FILE_BINDING } from '../src/remoto/binding.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { avvisoDiScadenza, comandiGh, FILE_RIFERIMENTO, giorniAllaScadenza, leggiRiferimento, preparaBindingIroh, problemaDelBinding } from '../scripts/scarica-binding-iroh.mjs';

const sha = dati => createHash('sha256').update(dati).digest('hex');
const BYTE = Buffer.from('binding finto per le prove');

function banco(t, { byte = BYTE } = {}) {
  /* classe A di BC-09: dentro ci sono solo file scritti e chiusi */
  const dir = cartellaDiProva('talos-iroh-prova-');
  t.after(() => rimuoviCartellaDiProva(dir));
  const cartella = join(dir, 'iroh');
  mkdirSync(cartella);
  const rif = { repository: 'Ninozzz95/talos', workflow: '.github/workflows/iroh-binding.yml', runId: 39686248443,
    artefatto: 'iroh-win32-x64-msvc', file: 'iroh.win32-x64-msvc.node', sha256: sha(byte),
    commitSorgente: '2ea6f9fecbb061210a953d3909095af85668411d', ramoSorgente: 'refs/heads/main', scade: '2999-01-01' };
  const riferimento = join(dir, 'iroh-binding.json');
  writeFileSync(riferimento, JSON.stringify(rif));
  return { dir, cartella, rif, riferimento };
}

/** Un `gh` finto che registra le chiamate; `scarica` scrive nella cartella di destinazione ciò che gli si dà. */
function ghFinto({ file = BYTE, impronta, rif, attestazione = true }) {
  const chiamate = [];
  const gh = args => {
    chiamate.push(args);
    if (args[0] === 'run') {
      const dest = args[args.indexOf('-D') + 1];
      writeFileSync(join(dest, rif.file), file);
      writeFileSync(join(dest, `${rif.file}.sha256`), `${impronta ?? sha(file)} *${rif.file}\n`);
    }
    if (args[0] === 'attestation' && !attestazione) throw new Error('gh attestation verify non riuscito (1)');
  };
  return { gh, chiamate };
}

test('IROH-RIF-01 — il riferimento nel repo è valido, nomina il file che il caricatore cerca, e sta FUORI da native/iroh/', () => {
  const rif = leggiRiferimento(readFileSync(FILE_RIFERIMENTO, 'utf8'));
  assert.equal(rif.file, basename(FILE_BINDING));
  assert.equal(rif.workflow, '.github/workflows/iroh-binding.yml');
  assert.ok(existsSync(new URL(`../../${rif.workflow}`, import.meta.url)), 'il workflow firmatario esiste');
  // iroh-binding.yml si rilancia a ogni modifica in harness-ui/native/iroh/**: un riferimento lì dentro ricompilerebbe il binding.
  assert.doesNotMatch(FILE_RIFERIMENTO.replaceAll('\\', '/'), /\/native\/iroh\//);
  const yml = readFileSync(new URL(`../../${rif.workflow}`, import.meta.url), 'utf8');
  assert.match(yml, /- 'harness-ui\/native\/iroh\/\*\*'/);
  assert.match(yml, new RegExp(`name: ${rif.artefatto}\\b`));
});

test('IROH-RIF-02 — un riferimento storto si rifiuta prima di scaricare qualunque cosa', () => {
  const buono = JSON.parse(readFileSync(FILE_RIFERIMENTO, 'utf8'));
  for (const [campo, valore] of [['runId', '39686248443'], ['runId', 0], ['sha256', buono.sha256.toUpperCase()], ['sha256', 'abc'],
    ['workflow', '../iroh-binding.yml'], ['repository', 'Ninozzz95/talos --flag'], ['file', 'iroh.dll'], ['artefatto', 'a b']]) {
    assert.throws(() => leggiRiferimento(JSON.stringify({ ...buono, [campo]: valore })), new RegExp(campo), `${campo}=${valore}`);
  }
});

test('IROH-RIF-03 — i tre stati del binding sul disco: assente, file diverso, impronta diversa', t => {
  const { cartella, rif } = banco(t);
  assert.equal(problemaDelBinding(cartella, rif), 'assente');
  writeFileSync(join(cartella, rif.file), BYTE);
  assert.equal(problemaDelBinding(cartella, rif), 'assente', 'senza .sha256 non vale');
  writeFileSync(join(cartella, `${rif.file}.sha256`), `${sha(BYTE)}  ${rif.file}\n`);
  assert.equal(problemaDelBinding(cartella, rif), null);
  writeFileSync(join(cartella, `${rif.file}.sha256`), `${'0'.repeat(64)}  ${rif.file}\n`);
  assert.match(problemaDelBinding(cartella, rif), /\.sha256 diverso/);
  writeFileSync(join(cartella, rif.file), Buffer.from('altro'));
  assert.match(problemaDelBinding(cartella, rif), /impronta del file diversa/);
});

test('IROH-SCARICA-01 — assente: scarica DA QUELLA corsa, verifica la firma di iroh-binding.yml, poi copia', t => {
  const { cartella, rif, riferimento } = banco(t);
  const { gh, chiamate } = ghFinto({ rif });
  const esito = preparaBindingIroh({ cartella, riferimento, gh });
  assert.equal(esito.scaricato, true);
  assert.deepEqual(chiamate.map(c => c.slice(0, 2)), [['run', 'download'], ['attestation', 'verify']]);
  const attese = comandiGh(rif, chiamate[0][chiamate[0].indexOf('-D') + 1]);
  assert.deepEqual(chiamate, [attese.scarica, attese.attestazione]);
  assert.deepEqual(chiamate[0].slice(2, 7), ['39686248443', '-R', 'Ninozzz95/talos', '-n', 'iroh-win32-x64-msvc']);
  assert.equal(chiamate[1][chiamate[1].indexOf('--signer-workflow') + 1], 'Ninozzz95/talos/.github/workflows/iroh-binding.yml');
  assert.equal(problemaDelBinding(cartella, rif), null);
  assert.ok(!existsSync(chiamate[0][chiamate[0].indexOf('-D') + 1]), 'la cartella temporanea se ne va');
});

test('IROH-SCARICA-02 — già presente e giusto: nessuna chiamata a gh', t => {
  const { cartella, rif, riferimento } = banco(t);
  writeFileSync(join(cartella, rif.file), BYTE);
  writeFileSync(join(cartella, `${rif.file}.sha256`), `${sha(BYTE)} *${rif.file}\n`);
  const { gh, chiamate } = ghFinto({ rif });
  assert.equal(preparaBindingIroh({ cartella, riferimento, gh }).scaricato, false);
  assert.deepEqual(chiamate, []);
});

test('IROH-SCARICA-03 — firma rifiutata, file diverso o .sha256 diverso: ci si ferma e in native/iroh non arriva niente', t => {
  for (const [nome, opzioni, atteso] of [
    ['attestazione', { attestazione: false }, /attestation verify/],
    ['file', { file: Buffer.from('un altro binding') }, /impronta del file diversa/],
    ['impronta', { impronta: '1'.repeat(64) }, /\.sha256 diverso/],
  ]) {
    const { cartella, rif, riferimento } = banco(t);
    const { gh } = ghFinto({ rif, ...opzioni });
    assert.throws(() => preparaBindingIroh({ cartella, riferimento, gh }), atteso, nome);
    assert.equal(problemaDelBinding(cartella, rif), 'assente', nome);
  }
});

test('IROH-SCARICA-04 — un binding SBAGLIATO già sul disco non basta: si riscarica e si sostituisce', t => {
  const { cartella, rif, riferimento } = banco(t);
  writeFileSync(join(cartella, rif.file), Buffer.from('vecchio'));
  writeFileSync(join(cartella, `${rif.file}.sha256`), `${sha(Buffer.from('vecchio'))} *${rif.file}\n`);
  const { gh, chiamate } = ghFinto({ rif });
  assert.equal(preparaBindingIroh({ cartella, riferimento, gh }).scaricato, true);
  assert.equal(chiamate.length, 2);
  assert.deepEqual(readFileSync(join(cartella, rif.file)), BYTE);
});

test('IROH-LICENZE-01 (owner 22/10/2026) — le licenze delle crate dentro il binding: generate dal NOSTRO Cargo.lock, e il pacchetto le porta accanto al binding', () => {
  const avvisi = readFileSync(new URL('../native/iroh-THIRD_PARTY_NOTICES.txt', import.meta.url), 'utf8');
  const lock = readFileSync(new URL('../native/iroh/Cargo.lock', import.meta.url));
  const dichiarata = /^Cargo\.lock sha256: ([0-9a-f]{64})$/m.exec(avvisi)?.[1];
  assert.equal(dichiarata, sha(lock), 'cambiato il Cargo.lock, l\'inventario si rigenera (native/iroh-licenze/about.toml e about.hbs, cargo-about 0.9.2)');
  for (const licenza of ['(Apache-2.0)', '(MIT)', '(ISC)', '(MPL-2.0)', '(CDLA-Permissive-2.0)']) assert.ok(avvisi.includes(licenza), licenza);
  assert.match(avvisi, /^ {2}- rustls 0\.23\.4[5-9]/m, 'il rustls curato (RUSTSEC-2026-0285) è quello elencato');
  assert.doesNotMatch(avvisi, /&quot;|&amp;|&lt;/, 'testo, non HTML');
  const prepara = readFileSync(new URL('../desktop/scripts/prepara-pacchetto.mjs', import.meta.url), 'utf8');
  assert.match(prepara, /native\/iroh-THIRD_PARTY_NOTICES\.txt'\), join\(backend, 'native\/iroh\/THIRD_PARTY_NOTICES\.txt'\)/);
  assert.match(prepara, /iroh-ffi 1\.1\.0 \(MIT o Apache-2\.0\)/, 'e una riga negli avvisi del pacchetto');
});

test('IROH-VINCOLI-01 (revisione 22/10) — l\'attestazione vincola anche ramo e commit sorgente, e niente runner ospitati in proprio', () => {
  const rif = leggiRiferimento(readFileSync(FILE_RIFERIMENTO, 'utf8'));
  const { attestazione } = comandiGh(rif, 'X');
  const valore = (opzione) => attestazione[attestazione.indexOf(opzione) + 1];
  assert.equal(valore('--signer-workflow'), 'Ninozzz95/talos/.github/workflows/iroh-binding.yml');
  assert.equal(valore('--source-ref'), 'refs/heads/main');
  assert.match(valore('--source-digest'), /^[0-9a-f]{40}$/u);
  assert.equal(valore('--source-digest'), rif.commitSorgente);
  assert.ok(attestazione.includes('--deny-self-hosted-runners'));
  /* AL CONTRARIO: un riferimento senza ramo o commit sorgente, o con una scadenza illeggibile, si rifiuta */
  for (const campo of ['commitSorgente', 'ramoSorgente', 'scade']) {
    const storto = { ...rif, [campo]: campo === 'scade' ? '19/01/2027' : 'main' };
    assert.throws(() => leggiRiferimento(JSON.stringify(storto)), new RegExp(campo, 'u'));
  }
});

test('IROH-SCADENZA-01 — un mese prima della scadenza lo si dice; scaduto e da scaricare ci si ferma col rimedio, senza chiamare gh', (t) => {
  const rif = { ...leggiRiferimento(readFileSync(FILE_RIFERIMENTO, 'utf8')), scade: '2027-01-19' };
  assert.equal(giorniAllaScadenza(rif, new Date('2027-01-18T23:00:00Z')), 1);
  assert.equal(avvisoDiScadenza(rif, new Date('2026-11-01T00:00:00Z')), null, 'lontana: nessun avviso');
  assert.match(avvisoDiScadenza(rif, new Date('2026-12-25T00:00:00Z')), /scade il 2027-01-19 \(tra 25 giorni\): rilancia \.github\/workflows\/iroh-binding\.yml/u);
  assert.match(avvisoDiScadenza(rif, new Date('2027-01-20T00:00:00Z')), /SCADUTO il 2027-01-19/u);
  const { cartella, rif: finto, riferimento } = banco(t);
  writeFileSync(riferimento, JSON.stringify({ ...finto, scade: '2000-01-01' }));
  const chiamate = [];
  assert.throws(() => preparaBindingIroh({ cartella, riferimento, gh: (a) => { chiamate.push(a); } }), /SCADUTO il 2000-01-01/u);
  assert.deepEqual(chiamate, [], 'nessun download destinato a fallire con un «not found»');
});

test('IROH-SCADENZA-02 (revisione 22/10) — il giorno della scadenza un download fallito porta il rimedio; il preavviso esce dalla funzione', (t) => {
  const { cartella, rif: finto, riferimento } = banco(t);
  const oggi = new Date().toISOString().slice(0, 10);
  writeFileSync(riferimento, JSON.stringify({ ...finto, scade: oggi }));
  assert.throws(() => preparaBindingIroh({ cartella, riferimento, gh: (a) => { if (a[0] === 'run') throw new Error('gh run download non riuscito (1): no artifact found'); } }),
    (e) => /no artifact found/u.test(e.message) && /rilancia \.github\/workflows\/iroh-binding\.yml/u.test(e.message));
  /* AL CONTRARIO: lontano dalla scadenza l'errore di gh resta quello di gh */
  writeFileSync(riferimento, JSON.stringify({ ...finto, scade: '2999-01-01' }));
  assert.throws(() => preparaBindingIroh({ cartella, riferimento, gh: (a) => { if (a[0] === 'run') throw new Error('gh run download non riuscito (1): rete'); } }),
    (e) => e.message === 'gh run download non riuscito (1): rete');
  /* il preavviso: presente vicino alla scadenza anche quando il binding c'è già */
  const { gh } = ghFinto({ rif: finto });
  writeFileSync(riferimento, JSON.stringify({ ...finto, scade: oggi }));
  const esito = preparaBindingIroh({ cartella, riferimento, gh });
  assert.match(esito.avviso ?? '', /scade il/u);
  assert.match(readFileSync(new URL('../desktop/scripts/prepara-pacchetto.mjs', import.meta.url), 'utf8'), /iroh\.avviso/u, 'prepara-pacchetto lo mostra');
});
