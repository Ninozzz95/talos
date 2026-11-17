// Il lanciatore dei comandi su Windows dalla corsa fissata (decisione 374 R1, owner 1037; forma del giudice v1629 §10.3), come il
// binding iroh: riferimento, tre controlli, niente copiato se uno manca; in più lo stato «non fissato» prima della prima corsa.
// `gh` è finto: le prove non toccano la rete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { CARTELLA_LANCIATORE, comandiGh, FILE_RIFERIMENTO, leggiRiferimento, preparaLanciatore, problemaDelLanciatore } from '../scripts/scarica-lanciatore.mjs';
import * as S from '../scripts/scarica-lanciatore.mjs';
import { NOME_LANCIATORE, SOGLIA_AVVIO_MS, trovaLanciatore } from '../src/kernel/lanciatore-windows.mjs';

const sha = dati => createHash('sha256').update(dati).digest('hex');
const BYTE = Buffer.from('lanciatore finto per le prove');

function banco(t, { byte = BYTE, rif: altro = {} } = {}) {
  const dir = cartellaDiProva('talos-lanciatore-prova-');
  t.after(() => rimuoviCartellaDiProva(dir));
  const cartella = join(dir, 'lanciatore-bin');
  const rif = { repository: 'Ninozzz95/talos', workflow: '.github/workflows/lanciatore.yml', runId: 41000000001,
    artefatto: 'talos-lanciatore-win32-x64', file: 'talos-lanciatore.exe', sha256: sha(byte), byte: byte.length,
    commitSorgente: 'a4989d4c4a4989d4c4a4989d4c4a4989d4c4a498', ramoSorgente: 'refs/heads/main', scade: '2999-01-01', ...altro };
  const riferimento = join(dir, 'lanciatore-binding.json');
  writeFileSync(riferimento, JSON.stringify(rif));
  return { dir, cartella, rif, riferimento };
}

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

test('LANC-RIF-01 — il riferimento nel repo è valido, nomina l exe che il nucleo cerca, il workflow esiste e sta FUORI dalla crate', () => {
  const rif = leggiRiferimento(readFileSync(FILE_RIFERIMENTO, 'utf8'));
  assert.equal(rif.file, NOME_LANCIATORE);
  assert.ok(existsSync(new URL(`../../${rif.workflow}`, import.meta.url)), 'il workflow firmatario esiste');
  assert.doesNotMatch(FILE_RIFERIMENTO.replaceAll('\\', '/'), /\/native\/lanciatore\//, 'dentro la crate rilancerebbe la compilazione');
  const yml = readFileSync(new URL(`../../${rif.workflow}`, import.meta.url), 'utf8');
  assert.match(yml, /- 'harness-ui\/native\/lanciatore\/\*\*'/);
  assert.match(yml, new RegExp(`name: ${rif.artefatto}\\b`));
  assert.match(yml, /cargo build --locked --release/);
  assert.match(yml, /actions\/attest@[0-9a-f]{40}/);
  assert.match(yml, /node prova-fumo\.mjs/, 'la prova di fumo prima dell impronta');
  // il nucleo cerca l exe proprio dove lo script lo mette
  assert.equal(CARTELLA_LANCIATORE.replaceAll('\\', '/').replace(/^.*\/harness-ui\//u, ''), 'native/lanciatore-bin');
});

test('LANC-RIF-02 — prima della prima corsa il riferimento NON è fissato: lo script lo dice, non chiama gh, ed esce verde; il nucleo dice «non-fissato»', t => {
  const { cartella, riferimento, dir } = banco(t, { rif: { runId: null, sha256: null, byte: null, commitSorgente: null, scade: null } });
  const { gh, chiamate } = ghFinto({ rif: { file: 'talos-lanciatore.exe' } });
  const esito = preparaLanciatore({ cartella, riferimento, gh });
  assert.equal(esito.rif.fissato, false);
  assert.match(esito.avviso, /non è ancora fissato/);
  assert.deepEqual(chiamate, []);
  // un exe messo a mano accanto al pacchetto non vale senza un'impronta fissata (§10.4)
  mkdirSync(cartella, { recursive: true });
  writeFileSync(join(cartella, NOME_LANCIATORE), BYTE);
  assert.deepEqual(trovaLanciatore({ ambiente: {}, candidati: [join(cartella, NOME_LANCIATORE)], riferimenti: [riferimento] }), { percorso: null, motivo: 'non-fissato' });
  assert.ok(existsSync(dir));
});

test('LANC-RIF-03 — un riferimento storto si rifiuta prima di scaricare; mezzo fissato (runId senza sha256) è storto', () => {
  const buono = { repository: 'Ninozzz95/talos', workflow: '.github/workflows/lanciatore.yml', runId: 41000000001, artefatto: 'talos-lanciatore-win32-x64',
    file: 'talos-lanciatore.exe', sha256: 'a'.repeat(64), byte: 273408, commitSorgente: 'b'.repeat(40), ramoSorgente: 'refs/heads/main', scade: '2999-01-01' };
  assert.equal(leggiRiferimento(JSON.stringify(buono)).fissato, true);
  for (const [campo, valore] of [['runId', '41000000001'], ['runId', 0], ['runId', null], ['sha256', 'A'.repeat(64)], ['sha256', null],
    ['workflow', '.github/workflows/iroh-binding.yml'], ['repository', 'Ninozzz95/talos --flag'], ['file', 'talos-lanciatore.dll'],
    ['artefatto', 'a b'], ['commitSorgente', null], ['scade', '2027-13-45x']]) {
    assert.throws(() => leggiRiferimento(JSON.stringify({ ...buono, [campo]: valore })), new RegExp(campo), `${campo}=${valore}`);
  }
});

test('LANC-SCARICA-01 — assente: scarica DA QUELLA corsa, verifica la firma di lanciatore.yml con ramo e commit, poi copia', t => {
  const { cartella, rif, riferimento } = banco(t);
  const { gh, chiamate } = ghFinto({ rif });
  assert.equal(preparaLanciatore({ cartella, riferimento, gh }).scaricato, true);
  const attese = comandiGh(rif, chiamate[0][chiamate[0].indexOf('-D') + 1]);
  assert.deepEqual(chiamate, [attese.scarica, attese.attestazione]);
  assert.deepEqual(chiamate[0].slice(2, 7), ['41000000001', '-R', 'Ninozzz95/talos', '-n', 'talos-lanciatore-win32-x64']);
  const v = (o) => chiamate[1][chiamate[1].indexOf(o) + 1];
  assert.equal(v('--signer-workflow'), 'Ninozzz95/talos/.github/workflows/lanciatore.yml');
  assert.equal(v('--source-ref'), 'refs/heads/main');
  assert.equal(v('--source-digest'), rif.commitSorgente);
  assert.ok(chiamate[1].includes('--deny-self-hosted-runners'));
  assert.equal(problemaDelLanciatore(cartella, rif), null);
  assert.ok(!existsSync(chiamate[0][chiamate[0].indexOf('-D') + 1]), 'la cartella temporanea se ne va');
  // e il nucleo lo accetta: impronta uguale a quella del riferimento
  assert.deepEqual(trovaLanciatore({ ambiente: {}, candidati: [join(cartella, NOME_LANCIATORE)], riferimenti: [riferimento] }), { percorso: join(cartella, NOME_LANCIATORE), motivo: null });
});

test('LANC-SCARICA-02 — firma rifiutata, file diverso o .sha256 diverso: ci si ferma e in native/lanciatore-bin non arriva niente', t => {
  for (const [nome, opzioni, atteso] of [
    ['attestazione', { attestazione: false }, /attestation verify/],
    ['file', { file: Buffer.from('un altro exe') }, /impronta del file diversa/],
    ['impronta', { impronta: '1'.repeat(64) }, /\.sha256 diverso/],
  ]) {
    const { cartella, rif, riferimento } = banco(t);
    const { gh } = ghFinto({ rif, ...opzioni });
    assert.throws(() => preparaLanciatore({ cartella, riferimento, gh }), atteso, nome);
    assert.equal(problemaDelLanciatore(cartella, rif), 'assente', nome);
  }
});

test('LANC-SCARICA-03 — già presente e giusto: nessuna chiamata; un exe con l impronta sbagliata il nucleo NON lo usa (§10.4)', t => {
  const { cartella, rif, riferimento } = banco(t);
  mkdirSync(cartella, { recursive: true });
  writeFileSync(join(cartella, rif.file), BYTE);
  writeFileSync(join(cartella, `${rif.file}.sha256`), `${sha(BYTE)} *${rif.file}\n`);
  const { gh, chiamate } = ghFinto({ rif });
  assert.equal(preparaLanciatore({ cartella, riferimento, gh }).scaricato, false);
  assert.deepEqual(chiamate, []);
  const altro = join(cartella, 'altro', NOME_LANCIATORE);
  mkdirSync(join(cartella, 'altro'));
  writeFileSync(altro, Buffer.from('manomesso'));
  assert.deepEqual(trovaLanciatore({ ambiente: {}, candidati: [altro], riferimenti: [riferimento] }), { percorso: null, motivo: 'impronta' });
  assert.deepEqual(trovaLanciatore({ ambiente: {}, candidati: [join(cartella, 'manca.exe')], riferimenti: [riferimento] }), { percorso: null, motivo: 'assente' });
});

/*
 * ⛔ Giro di cura dopo il revisore B (12/11/2026). Rosse sulla testa `42f8a6edb`: LANC-RIF-04, LANC-RIGA-01, LANC-SCARICA-05,
 *   LANC-LICENZE-01, LANC-PUBBLICO-01. Le prove che mancavano contro le 11 di iroh (verdi prima e dopo): LANC-SCARICA-04,
 *   LANC-SCADENZA-01 e 02.
 */
test('LANC-RIF-04 — «non fissato» è solo TUTTO null: un riferimento svuotato a metà (runId e sha256 tolti, il resto lasciato) si rifiuta', () => {
  const nonFissato = { repository: 'Ninozzz95/talos', workflow: '.github/workflows/lanciatore.yml', runId: null, artefatto: 'talos-lanciatore-win32-x64',
    file: 'talos-lanciatore.exe', sha256: null, byte: null, commitSorgente: null, ramoSorgente: 'refs/heads/main', scade: null };
  assert.equal(leggiRiferimento(JSON.stringify(nonFissato)).fissato, false);
  for (const [campo, valore] of [['commitSorgente', 'b'.repeat(40)], ['scade', '2999-01-01'], ['byte', 273408]]) {
    assert.throws(() => leggiRiferimento(JSON.stringify({ ...nonFissato, [campo]: valore })), /runId, sha256/, `${campo} rimasto: era fissato, non lo è più`);
  }
  const fissato = { ...nonFissato, runId: 41000000001, sha256: 'a'.repeat(64), byte: 273408, commitSorgente: 'b'.repeat(40), scade: '2999-01-01' };
  assert.equal(leggiRiferimento(JSON.stringify(fissato)).fissato, true);
  for (const byte of [null, 0, '273408', 1.5]) assert.throws(() => leggiRiferimento(JSON.stringify({ ...fissato, byte })), /byte/, `byte=${byte}`);
});

test('LANC-RIGA-01 — dalla riga di comando: non fissato esce verde e lo dice; con `--fissato` (dopo la prima fissazione) è rosso; un guasto è rosso col motivo', () => {
  assert.equal(typeof S.daRigaDiComando, 'function', 'il blocco della riga di comando è una funzione che si prova');
  const corsa = (opzioni) => {
    const righe = { scrivi: [], avvisa: [], errore: [] };
    const codice = S.daRigaDiComando({ ambiente: {}, scrivi: (r) => righe.scrivi.push(r), avvisa: (r) => righe.avvisa.push(r), errore: (r) => righe.errore.push(r), ...opzioni });
    return { codice, ...righe };
  };
  const rifNo = { fissato: false, workflow: '.github/workflows/lanciatore.yml' };
  const nonFissato = () => ({ rif: rifNo, scaricato: false, avviso: 'il riferimento non è ancora fissato' });
  const a = corsa({ argomenti: [], prepara: nonFissato });
  assert.equal(a.codice, 0);
  assert.deepEqual(a.scrivi, []);
  assert.match(a.avvisa[0], /^Attenzione: il riferimento non è ancora fissato/);
  const ci = corsa({ argomenti: [], prepara: nonFissato, ambiente: { GITHUB_ACTIONS: 'true' } });
  assert.match(ci.avvisa[0], /^::warning title=Lanciatore::il riferimento non è ancora fissato/);
  const stretto = corsa({ argomenti: ['--fissato'], prepara: nonFissato });
  assert.equal(stretto.codice, 1, 'dopo la prima fissazione tornare a null non resta verde');
  assert.match(stretto.errore[0], /^Lanciatore non pronto: .*non è fissato/);
  const rifSi = { fissato: true, runId: 41000000001, sha256: 'a'.repeat(64) };
  const ok = corsa({ argomenti: ['--fissato'], prepara: () => ({ rif: rifSi, scaricato: true, avviso: null }) });
  assert.equal(ok.codice, 0);
  assert.equal(ok.scrivi[0], `Lanciatore scaricato e verificato: corsa 41000000001, sha256 ${'a'.repeat(64)}.`);
  assert.deepEqual(ok.avvisa, []);
  const presente = corsa({ argomenti: [], prepara: () => ({ rif: rifSi, scaricato: false, avviso: 'scade il 2999-01-01' }) });
  assert.match(presente.scrivi[0], /^Lanciatore già presente e verificato/);
  assert.match(presente.avvisa[0], /^Attenzione: scade il/);
  const guasto = corsa({ argomenti: [], prepara: () => { throw new Error('gh attestation verify non riuscito (1)'); } });
  assert.equal(guasto.codice, 1);
  assert.equal(guasto.errore[0], 'Lanciatore non pronto: gh attestation verify non riuscito (1)');
});

test('LANC-SCARICA-04 — un exe SBAGLIATO già sul disco non basta: si riscarica e si sostituisce', t => {
  const { cartella, rif, riferimento } = banco(t);
  mkdirSync(cartella, { recursive: true });
  writeFileSync(join(cartella, rif.file), Buffer.from('vecchio'));
  writeFileSync(join(cartella, `${rif.file}.sha256`), `${sha(Buffer.from('vecchio'))} *${rif.file}\n`);
  const { gh, chiamate } = ghFinto({ rif });
  assert.equal(preparaLanciatore({ cartella, riferimento, gh }).scaricato, true);
  assert.equal(chiamate.length, 2);
  assert.deepEqual(readFileSync(join(cartella, rif.file)), BYTE);
  assert.deepEqual(readdirSync(cartella).sort(), [rif.file, `${rif.file}.sha256`], 'nella cartella solo i due file, nessun temporaneo');
});

test('LANC-SCARICA-05 — la copia è tutta o niente: se si rompe a metà, i due file di prima restano com erano e non resta nessun temporaneo', t => {
  const { cartella, rif, riferimento } = banco(t);
  mkdirSync(cartella, { recursive: true });
  const vecchio = Buffer.from('vecchio');
  writeFileSync(join(cartella, rif.file), vecchio);
  writeFileSync(join(cartella, `${rif.file}.sha256`), `${sha(vecchio)} *${rif.file}\n`);
  const { gh } = ghFinto({ rif });
  let copie = 0;
  const copia = (da, a) => { copie += 1; if (copie === 2) throw Object.assign(new Error('disco pieno'), { code: 'ENOSPC' }); copyFileSync(da, a); };
  assert.throws(() => preparaLanciatore({ cartella, riferimento, gh, copia }), /disco pieno/);
  assert.deepEqual(readFileSync(join(cartella, rif.file)), vecchio, 'l exe di prima non è stato toccato');
  assert.equal(readFileSync(join(cartella, `${rif.file}.sha256`), 'utf8'), `${sha(vecchio)} *${rif.file}\n`);
  assert.deepEqual(readdirSync(cartella).sort(), [rif.file, `${rif.file}.sha256`], 'nessun temporaneo rimasto');
});

/* Cure dopo il ripasso (12/11/2026): il ricontrollo DOPO la copia non aveva una prova (mutante J14 del revisore B, vivo: tolta la riga
   «Lanciatore copiato ma non valido» passava tutto). Verde già sulla testa `626b648f2`; rossa col mutante. */
test('LANC-SCARICA-06 — dopo la copia si ricontrolla ciò che è arrivato sul disco: una copia che rovina l exe (o la sua impronta) non dà un lanciatore «pronto»', t => {
  for (const rovinato of ['talos-lanciatore.exe', 'talos-lanciatore.exe.sha256']) {
    const { cartella, rif, riferimento } = banco(t);
    const { gh } = ghFinto({ rif });
    // scaricato giusto e verificato; è la copia nella cartella finale a scrivere altro (disco che cede, un programma che si mette in mezzo)
    const copia = (da, a) => { if (a.includes(`${rovinato}.nuovo-`)) writeFileSync(a, 'rovinato nella copia'); else copyFileSync(da, a); };
    assert.throws(() => preparaLanciatore({ cartella, riferimento, gh, copia }), /Lanciatore copiato ma non valido: /, rovinato);
    assert.notEqual(problemaDelLanciatore(cartella, rif), null, 'e chi lo cerca dopo non lo trova buono');
  }
  // al contrario: la copia fedele dà «scaricato», senza eccezioni
  const { cartella, rif, riferimento } = banco(t);
  assert.equal(preparaLanciatore({ cartella, riferimento, gh: ghFinto({ rif }).gh, copia: copyFileSync }).scaricato, true);
  assert.equal(problemaDelLanciatore(cartella, rif), null);
});

test('LANC-SCADENZA-01 — un mese prima della scadenza lo si dice; scaduto e da scaricare ci si ferma col rimedio, senza chiamare gh', t => {
  const { cartella, rif, riferimento } = banco(t);
  const vicino = { ...rif, scade: '2027-01-19' };
  assert.equal(S.avvisoDiScadenza(vicino, new Date('2026-11-01T00:00:00Z')), null, 'lontana: nessun avviso');
  assert.match(S.avvisoDiScadenza(vicino, new Date('2026-12-25T00:00:00Z')), /scade il 2027-01-19 \(tra 25 giorni\): rilancia \.github\/workflows\/lanciatore\.yml e aggiorna runId, sha256, byte, commitSorgente e scade/u);
  assert.match(S.avvisoDiScadenza(vicino, new Date('2027-01-20T00:00:00Z')), /SCADUTO il 2027-01-19/u);
  writeFileSync(riferimento, JSON.stringify({ ...rif, scade: '2000-01-01' }));
  const chiamate = [];
  assert.throws(() => preparaLanciatore({ cartella, riferimento, gh: (a) => { chiamate.push(a); } }), /SCADUTO il 2000-01-01/u);
  assert.deepEqual(chiamate, [], 'nessun download destinato a fallire con un «not found»');
  // al contrario: scaduto ma già sul disco e giusto ⇒ non ci si ferma (le app installate non leggono la scadenza), lo si dice
  mkdirSync(cartella, { recursive: true });
  writeFileSync(join(cartella, rif.file), BYTE);
  writeFileSync(join(cartella, `${rif.file}.sha256`), `${sha(BYTE)} *${rif.file}\n`);
  const esito = preparaLanciatore({ cartella, riferimento, gh: (a) => { chiamate.push(a); } });
  assert.equal(esito.scaricato, false);
  assert.match(esito.avviso, /SCADUTO il 2000-01-01/u);
  assert.deepEqual(chiamate, []);
});

test('LANC-SCADENZA-02 — il giorno della scadenza un download fallito porta il rimedio; lontano dalla scadenza l errore di gh resta il suo', t => {
  const { cartella, rif, riferimento } = banco(t);
  const oggi = new Date().toISOString().slice(0, 10);
  writeFileSync(riferimento, JSON.stringify({ ...rif, scade: oggi }));
  assert.throws(() => preparaLanciatore({ cartella, riferimento, gh: (a) => { if (a[0] === 'run') throw new Error('gh run download non riuscito (1): no artifact found'); } }),
    (e) => /no artifact found/u.test(e.message) && /rilancia \.github\/workflows\/lanciatore\.yml/u.test(e.message));
  writeFileSync(riferimento, JSON.stringify({ ...rif, scade: '2999-01-01' }));
  assert.throws(() => preparaLanciatore({ cartella, riferimento, gh: (a) => { if (a[0] === 'run') throw new Error('gh run download non riuscito (1): rete'); } }),
    (e) => e.message === 'gh run download non riuscito (1): rete');
  // il preavviso esce dalla funzione anche quando si è appena scaricato
  writeFileSync(riferimento, JSON.stringify({ ...rif, scade: oggi }));
  const { gh } = ghFinto({ rif });
  assert.match(preparaLanciatore({ cartella, riferimento, gh }).avviso ?? '', /scade il/u);
});

test('LANC-LICENZE-01 — le licenze delle crate dentro l exe viaggiano con lui: l inventario nomina ogni crate del NOSTRO Cargo.lock e porta i due testi', () => {
  const lock = readFileSync(new URL('../native/lanciatore/Cargo.lock', import.meta.url));
  const file = new URL('../native/lanciatore-THIRD_PARTY_NOTICES.txt', import.meta.url);
  assert.ok(existsSync(file), 'native/lanciatore-THIRD_PARTY_NOTICES.txt');
  const avvisi = readFileSync(file, 'utf8');
  assert.equal(/^Cargo\.lock sha256: ([0-9a-f]{64})$/m.exec(avvisi)?.[1], sha(lock), 'cambiato il Cargo.lock, l inventario si aggiorna');
  const crate = [...lock.toString('utf8').matchAll(/\[\[package\]\]\r?\nname = "([^"]+)"\r?\nversion = "([^"]+)"/g)].map((m) => [m[1], m[2]]).filter(([nome]) => nome !== 'talos-lanciatore');
  assert.ok(crate.length >= 2, 'windows-sys e windows-link');
  for (const [nome, versione] of crate) assert.match(avvisi, new RegExp(`^  - ${nome} ${versione.replaceAll('.', '\\.')} \\(MIT OR Apache-2\\.0\\)`, 'm'), `${nome} ${versione}`);
  assert.match(avvisi, /Permission is hereby granted, free of charge/, 'il testo MIT');
  assert.match(avvisi, /Apache License\s+Version 2\.0, January 2004/, 'il testo Apache-2.0');
  assert.doesNotMatch(avvisi, /C:\\Users|Downloads/, 'nessun percorso di una macchina');
});

test('LANC-LIMITI-01 — i limiti noti dell aiutante stanno nel registro delle versioni del PC, in inglese POI in italiano', () => {
  const testo = readFileSync(new URL('../desktop/CHANGELOG.md', import.meta.url), 'utf8');
  const inglese = [
    'stays tied to it: Stop or closing the conversation also closes it',
    'A one-shot run (also from the terminal) does not exit until the programs its commands left running have',
    'Commands that run in Linux (WSL) do not go through the helper',
    'is checked against its fingerprint before every command',
    // cura dei gialli (13/11, strada Codex): in primo piano il comando si ferma con TALOS; restano solo i programmi di un comando finito
    'If you update TALOS while programs a finished command left running are still running, they keep running and are no longer followed',
    // 13/11 (giudice v1816): il rilascio costruisce l'aiutante dallo stesso commit; niente più riferimento da rinnovare a mano
    'The release builds the helper itself, from the same commit as the app',
    'carry no version number',
    'A helper that starts and then does not answer is closed after ten seconds',
    // giro g4: allo Stop non si avvia più nessun file (prima: «and again before it is used to stop one»)
    'Stop starts no file at all',
    'a program that can write in the TALOS folder can replace both',
    'measured on a file of 276,992 bytes',
    // giro piccolo dopo il controllore (12/11): la frase vera (prima diceva «does not run», falso se l'aiutante muore dopo la ripartenza
    // della shell), i tre limiti che mancavano e la finestra misurata dell'arresto forzato
    'If the helper stops right after announcing the command, TALOS does not start that command a second time: it may have run or not',
    'gets no such note',
    // giro g4: il gruppo non ha più un nome (prima: «has already taken the name TALOS gives to the group of a command»)
    'The group of a command has no name',
    // giro 3: una frase sola (prima era detta due volte di fila)
    'if Windows refuses that safety net, and then *Report a problem* says so',
    'A Stop given just before a command that ends at once has started does not prevent it',
  ];
  const italiano = [
    'resta legato a lui: Stop o la chiusura della conversazione chiudono anche',
    'Una corsa a colpo singolo (anche dal terminale) non esce finché i programmi lasciati accesi dai suoi comandi non sono',
    'I comandi che girano in Linux (WSL) non passano dall\'aiutante',
    'si controlla con la sua impronta prima di ogni comando',
    'Se aggiorni TALOS mentre programmi lasciati accesi da un comando finito sono ancora accesi, restano accesi e non sono più seguiti',
    'Il rilascio costruisce l\'aiutante da sé, dallo stesso commit dell\'app',
    'non portano un numero di versione',
    'Un aiutante che parte e poi non risponde viene chiuso dopo dieci secondi',
    'Stop non avvia nessun file',
    'un programma che può scrivere nella cartella di TALOS può sostituirli tutti e due',
    'misurato su un file di 276.992 byte',
    'Se l\'aiutante si ferma subito dopo aver annunciato il comando, TALOS non fa partire quel comando una seconda volta: può essere girato o no',
    'non riceve questa nota',
    'Il gruppo di un comando non ha un nome',
    'se Windows rifiuta quell\'appoggio, e allora *Segnala un problema* lo dice',
    'Uno Stop dato appena prima che parta un comando che finisce subito non lo ferma',
  ];
  const piatto = testo.replace(/\s+/g, ' ');
  const dove = (frase) => piatto.indexOf(frase);
  // cure dopo il ripasso (12/11): il limite «un aiutante appeso non viene riconosciuto» non è più vero, e non deve restare scritto
  for (const vecchia of ['neither answers nor exits is not noticed', 'non risponde né esce non viene riconosciuto', '273 KB']) assert.equal(dove(vecchia), -1, vecchia);
  // 13/11 (giudice v1816): il rilascio non scarica più l'aiutante da una corsa a parte, lo costruisce lui; quelle frasi non restano
  for (const vecchia of ['once the release downloads it', 'expires and its reference is renewed by hand', 'quando il rilascio lo scaricherà', 'scade e il suo riferimento si rinnova']) assert.equal(dove(vecchia), -1, vecchia);
  // e la frase che si contraddiceva («non gira» e «non può sapere se è girato» insieme) non resta
  for (const vecchia of ['that command does not run: TALOS does not start it a second time', 'quel comando non gira: TALOS non lo fa partire una seconda volta']) assert.equal(dove(vecchia), -1, vecchia);
  // e i dieci secondi scritti sono quelli del nucleo
  assert.equal(SOGLIA_AVVIO_MS, 10_000);
  for (const frase of [...inglese, ...italiano]) assert.ok(dove(frase) > 0, frase);
  const inItaliano = piatto.indexOf('### In italiano');
  const prossimaVersione = piatto.indexOf('## desktop-v0.2.1');
  for (const frase of inglese) assert.ok(dove(frase) < inItaliano, `in inglese, prima della parte italiana: ${frase}`);
  for (const frase of italiano) assert.ok(dove(frase) > inItaliano && dove(frase) < prossimaVersione, `in italiano, nella stessa versione: ${frase}`);
});

test('LANC-PUBBLICO-01 —ciò che esce sul repo pubblico: le tre righe di .gitignore-pubblico, nessun percorso personale o nome interno, CRT statico e costruzione riproducibile', () => {
  const leggi = (relativo) => readFileSync(new URL(`../../${relativo}`, import.meta.url), 'utf8');
  const ignora = leggi('.gitignore-pubblico').split(/\r?\n/);
  for (const riga of ['harness-ui/native/lanciatore-bin/', 'harness-ui/native/lanciatore/target/', 'harness-ui/native/lanciatore/uscita/']) assert.ok(ignora.includes(riga), `.gitignore-pubblico: ${riga}`);
  assert.doesNotMatch(leggi('harness-ui/native/lanciatore/Cargo.toml'), /Downloads|FORMA-/, 'Cargo.toml: nessun percorso personale');
  assert.doesNotMatch(leggi('harness-ui/src/kernel/lanciatore-windows.mjs'), /FORMA-LANCIATORE|Downloads/, 'il modulo del nucleo: nessun nome di documento interno');
  const cargo = leggi('harness-ui/native/lanciatore/.cargo/config.toml');
  // la sezione di un bersaglio, senza i commenti: una riga commentata non collega niente
  const sezione = (bersaglio) => (cargo.split(/^(?=\[target\.)/m).find((s) => s.startsWith(`[target.${bersaglio}]`)) ?? '')
    .split(/\r?\n/).filter((riga) => !riga.trim().startsWith('#')).join('\n');
  assert.match(sezione('x86_64-pc-windows-msvc'), /rustflags = \[[^\]]*"target-feature=\+crt-static"/, 'msvc: CRT statico (niente VCRUNTIME140.dll da trovare sul PC)');
  assert.match(sezione('x86_64-pc-windows-msvc'), /rustflags = \[[^\]]*"link-arg=\/Brepro"/, 'msvc: niente data nel PE');
  assert.match(sezione('x86_64-pc-windows-gnu'), /rustflags = \[[^\]]*--no-insert-timestamp/, 'gnu (costruzione locale): niente data nel PE');
});

// Giro 3 del lanciatore (13/11/2026): il colpo per maniglia cambia tre limiti scritti, e la frase doppia sull'appoggio se ne va
test('LANC-LIMITI-02 — giro 3: mai un colpo per numero (con le misure vere), Stop fuori dal gruppo, controllo che non torna allo Stop, programmi legati se Windows non li lascia andare; EN poi IT; la frase doppia e le frasi diventate false non restano', () => {
  const testo = readFileSync(new URL('../desktop/CHANGELOG.md', import.meta.url), 'utf8');
  const piatto = testo.replace(/\s+/g, ' ');
  const dove = (frase) => piatto.indexOf(frase);
  const inglese = [
    'TALOS never stops the helper by its number',
    'only through the link to it that TALOS has held since it started',
    'TALOS sees an exit 0.86 thousandths of a second after it happens in the middle, 3.39 at most',
    'A command that runs without the helper (see above) is still stopped by its number',
    // giro g4: senza Job il lanciatore chiude la shell dalla sua maniglia; allo Stop nessun file si avvia (le frasi di prima vanno sotto, fra le vecchie)
    // cura dei gialli (13/11): fuori dal gruppo Stop chiude anche i programmi avviati (elenco dei processi, controllo dell'ora di partenza)
    'Outside the group Stop closes the shell of the command and the programs it started',
    'it asks the helper that is already running, the only one that holds the group of the command',
    'If Windows refuses to let the programs go when the command ends or goes to the background, they stop when TALOS closes or is updated instead',
  ];
  const italiano = [
    'TALOS non ferma mai l\'aiutante per numero',
    'solo dal collegamento che TALOS tiene con lui da quando è partito',
    'TALOS vede un\'uscita 0,86 millesimi di secondo dopo che è successa il valore di mezzo, 3,39 al massimo',
    'Un comando che gira senza l\'aiutante (vedi sopra) si ferma ancora per numero',
    'Fuori dal gruppo Stop chiude la shell del comando e i programmi che ha avviato',
    'chiede all\'aiutante che sta già girando, il solo che tiene il gruppo del comando',
    'Se Windows rifiuta di lasciare andare i programmi quando il comando finisce o va in sottofondo, si fermano invece quando TALOS si chiude o si aggiorna',
  ];
  for (const frase of [...inglese, ...italiano]) assert.ok(dove(frase) > 0, frase);
  const inItaliano = piatto.indexOf('### In italiano');
  const prossimaVersione = piatto.indexOf('## desktop-v0.2.1');
  for (const frase of inglese) assert.ok(dove(frase) < inItaliano, `in inglese, prima della parte italiana: ${frase}`);
  for (const frase of italiano) assert.ok(dove(frase) > inItaliano && dove(frase) < prossimaVersione, `in italiano, nella stessa versione: ${frase}`);
  // le frasi diventate false col colpo per maniglia non restano
  for (const vecchia of [
    'TALOS never sends a forced stop to a helper it has already seen exit',
    'If that check fails at Stop, the command is stopped all the same',
    'TALOS non manda mai l\'arresto forzato a un aiutante che ha già visto uscire',
    'Se quel controllo non torna allo Stop, il comando si ferma lo stesso',
    // cura dei gialli (13/11): diventate false con la strada Codex e coi ripieghi nuovi
    'Outside the group Stop closes only the shell of the command', 'Fuori dal gruppo Stop chiude solo la shell del comando',
    'If you update TALOS while such programs are still running', 'Se aggiorni TALOS mentre questi programmi sono ancora accesi',
    'If Windows refuses to let them go when the command starts', 'Se Windows rifiuta di lasciarli andare quando il comando parte',
  ]) assert.equal(dove(vecchia), -1, vecchia);
  // la frase doppia («If Windows refuses that safety net» due volte di fila) se ne va: una volta per lingua
  assert.equal(piatto.split('if Windows refuses that safety net').length - 1 + piatto.split('If Windows refuses that safety net').length - 1, 1, 'EN: una volta');
  assert.equal(piatto.split('se Windows rifiuta quell\'appoggio').length - 1 + piatto.split('Se Windows rifiuta quell\'appoggio').length - 1, 1, 'IT: una volta');
});

// Giro piccolo g4 del lanciatore (13/11/2026): il gruppo non ha più un nome e Stop passa dal lanciatore; le misure vere, EN poi IT
test('LANC-LIMITI-03 — giro g4: il gruppo senza nome con le misure prima e dopo, Stop che non avvia file, Stop col rilascio rifiutato; EN poi IT; le frasi del nome e dello Stop per nome non restano', () => {
  const piatto = readFileSync(new URL('../desktop/CHANGELOG.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const dove = (frase) => piatto.indexOf(frase);
  const inglese = [
    'no other program can take it first or open it, and Stop reaches the command and every program it left running through the helper',
    'Stop reached it 0 times out of 5',
    'closed the group of the other program 5 times out of 5',
    'Stop reaches both 5 times out of 5 and the other program is never touched',
    'Stop still reaches them then: with that refusal forced on purpose, 5 times out of 5',
  ];
  const italiano = [
    'nessun altro programma può prenderlo prima o aprirlo, e Stop raggiunge il comando e ogni programma che ha lasciato acceso attraverso l\'aiutante',
    'Stop lo raggiungeva 0 volte su 5',
    'chiudeva il gruppo dell\'altro programma 5 volte su 5',
    'Stop li raggiunge tutti e due 5 volte su 5 e l\'altro programma non viene mai toccato',
    'Stop li raggiunge anche allora: con quel rifiuto forzato apposta, 5 volte su 5',
  ];
  for (const frase of [...inglese, ...italiano]) assert.ok(dove(frase) > 0, frase);
  const inItaliano = piatto.indexOf('### In italiano');
  const prossimaVersione = piatto.indexOf('## desktop-v0.2.1');
  for (const frase of inglese) assert.ok(dove(frase) < inItaliano, `in inglese, prima della parte italiana: ${frase}`);
  for (const frase of italiano) assert.ok(dove(frase) > inItaliano && dove(frase) < prossimaVersione, `in italiano, nella stessa versione: ${frase}`);
  for (const vecchia of [
    'and again before it is used to stop one', 'e di nuovo prima di usarlo per fermarne uno',
    'has already taken the name TALOS gives to the group of a command', 'ha già preso il nome che TALOS dà al gruppo di un comando',
    'Outside the group Stop does not reach the command', 'Fuori dal gruppo Stop non raggiunge il comando',
    'If that check fails at Stop, TALOS does not start that file', 'Se quel controllo non torna allo Stop, TALOS non avvia quel file',
  ]) assert.equal(dove(vecchia), -1, vecchia);
});

// Cura dei gialli del controllore (13/11/2026, strada Codex): il comando in primo piano si ferma con l'aiutante, le misure prima e dopo,
// il rischio dello `start`, il ritorno dopo un riavvio; EN poi IT
test('LANC-LIMITI-04 — strada Codex: in primo piano il comando si ferma con l aiutante (10 su 10 prima, 0 su 10 ora), il rischio dello start, sottofondo e comando finito restano, la ripresa dopo un riavvio misurata; EN poi IT', () => {
  const piatto = readFileSync(new URL('../desktop/CHANGELOG.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const dove = (frase) => piatto.indexOf(frase);
  const inglese = [
    'While a command runs in the foreground, the helper keeps its group tied to itself, as Codex does',
    'kept running 10 times out of 10, no longer followed; with this change 0 times out of 10',
    'a program started with `start` while the command still runs in the foreground stops too if the helper stops before the command ends',
    'Measured on 20 background commands with TALOS stopped at once and started again: 20 taken back, one stop each',
    'If Windows does not let the helper close the group, the helper ties the group to itself again and exits',
    'If TALOS can no longer write to the helper, it closes the helper',
  ];
  const italiano = [
    'Mentre un comando gira in primo piano, l\'aiutante tiene il suo gruppo legato a sé, come fa Codex',
    'restavano accesi 10 volte su 10, senza più essere seguiti; con questa modifica 0 volte su 10',
    'anche un programma partito con `start` mentre il comando gira ancora in primo piano si ferma se l\'aiutante si ferma prima che il comando finisca',
    'Misurato su 20 comandi in sottofondo con TALOS fermato di colpo e fatto ripartire: 20 ripresi, un arresto ciascuno',
    'Se Windows non lascia all\'aiutante chiudere il gruppo, l\'aiutante lo rilega a sé ed esce',
    'Se TALOS non può più scrivere all\'aiutante, lo chiude',
  ];
  for (const frase of [...inglese, ...italiano]) assert.ok(dove(frase) > 0, frase);
  const inItaliano = piatto.indexOf('### In italiano');
  const prossimaVersione = piatto.indexOf('## desktop-v0.2.1');
  for (const frase of inglese) assert.ok(dove(frase) < inItaliano, `in inglese, prima della parte italiana: ${frase}`);
  for (const frase of italiano) assert.ok(dove(frase) > inItaliano && dove(frase) < prossimaVersione, `in italiano, nella stessa versione: ${frase}`);
});

// Cura unica dei gialli dei revisori A, B e C (13/11/2026): ciò che il testo prometteva di più, i limiti nuovi e le due gare non
// provocate, l impronta non fissata, la CLI; EN poi IT. Nata ROSSA sulla testa `689e60b68`.
test('LANC-LIMITI-05 — revisori A, B e C: programma col padre già uscito, tutte le forme del primo piano, appoggio senza legame, sottofondo dopo l aiutante morto, entrata chiusa, terzo ripiego, numero ridato dopo lo Stop, le due gare, impronta non fissata, CLI; EN poi IT', () => {
  const piatto = readFileSync(new URL('../desktop/CHANGELOG.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const dove = (frase) => piatto.indexOf(frase);
  const inglese = [
    'A program whose parent has already exited is not found outside the group',
    '`start`, `start /b`, `cmd /c start`, PowerShell\'s `Start-Process` and a dev server such as `npm run dev`',
    'Then the tie of the foreground is missing too: a command in the foreground keeps running if the helper or TALOS stops, and the log says so',
    'It keeps running on its own, and the log says that TALOS no longer sees when it ends',
    'If TALOS can no longer write to the helper when the command is sent to the background, the command still stops if the helper or TALOS stops, and the log now says so',
    'If Windows refuses that too, the helper closes one by one the programs that Windows confirms are in the group, as Codex does',
    'If Windows gives the number of a program already stopped to another program while TALOS waits for it to exit',
    'Two rare races are not closed',
    'Codex orders the two with a lock',
    'to a program started after the shell, that program can be stopped',
    // 13/11 (giudice v1816): l'impronta la fissa il rilascio dallo stesso commit; senza, solo una build su un PC esce senza aiutante
    'the release stops if the fingerprint is missing or does not match: no release goes out without the helper',
    'A package built on a PC without a fixed fingerprint carries no helper and says so',
    'The terminal version of TALOS does not carry the helper in its package, so for whoever uses it nothing changes',
  ];
  const italiano = [
    'Fuori dal gruppo un programma il cui padre è già uscito non si trova',
    '`start`, `start /b`, `cmd /c start`, `Start-Process` di PowerShell e un server di sviluppo come `npm run dev`',
    'Allora manca anche il legame del primo piano: un comando in primo piano resta acceso se l\'aiutante o TALOS si fermano, e il log lo dice',
    'Continua da solo, e il log dice che TALOS non vede più quando finisce',
    'Se TALOS non può più scrivere all\'aiutante quando il comando va in sottofondo, il comando si ferma lo stesso se l\'aiutante o TALOS si fermano, e ora il log lo dice',
    'Se Windows rifiuta anche questo, l\'aiutante chiude uno per uno i programmi che Windows conferma nel gruppo, come fa Codex',
    'Se Windows dà il numero di un programma già fermato a un altro programma mentre TALOS aspetta che esca',
    'Due gare rare non sono chiuse',
    'Codex mette in fila le due cose con un lucchetto',
    'a un programma partito dopo la shell, quel programma può essere fermato',
    'il rilascio si ferma se l\'impronta manca o non torna: nessun rilascio esce senza l\'aiutante',
    'Un pacchetto costruito su un PC senza un\'impronta fissata non porta l\'aiutante e lo dice',
    'La versione di TALOS per il terminale non porta l\'aiutante nel suo pacchetto, quindi per chi la usa non cambia niente',
  ];
  for (const frase of [...inglese, ...italiano]) assert.ok(dove(frase) > 0, frase);
  const inItaliano = piatto.indexOf('### In italiano');
  const prossimaVersione = piatto.indexOf('## desktop-v0.2.1');
  for (const frase of inglese) assert.ok(dove(frase) < inItaliano, `in inglese, prima della parte italiana: ${frase}`);
  for (const frase of italiano) assert.ok(dove(frase) > inItaliano && dove(frase) < prossimaVersione, `in italiano, nella stessa versione: ${frase}`);
  // la frase della CLI dell autore (rapporto g5) era falsa per la CLI impacchettata: non entra
  for (const falsa of ['closing the CLI now stops it', 'chiudere la CLI ora lo ferma']) assert.equal(dove(falsa), -1, falsa);
  // 13/11 (giudice v1816): «nessuna app lo porta» e «si scrive a mano dopo la prima corsa pubblica» non sono più vere
  for (const falsa of ['The helper is not yet active in any app', 'today no app carries it', 'written by hand in that reference',
    'L\'aiutante non è ancora attivo in nessuna app', 'oggi nessuna app lo porta', 'si scrivono a mano in quel riferimento']) assert.equal(dove(falsa), -1, falsa);
});

// Quinto giro (13/11/2026, revisore dopo la cura unica): tre frasi false o contraddittorie, riscritte come è OGGI su questo ramo, che
// non impacchetta l aiutante; la lente CLI (la CLI porta il modulo senza l exe); il limite del costo della sorveglianza coi numeri; il
// secondo Stop durante il controllo. EN poi IT. Nata ROSSA, prima del CHANGELOG del quinto giro.
// Unione (revisore lanc9, 14/11/2026): con il pacchetto (cura/lanciatore-nel-pacchetto) le tre frasi «impronta vuota», «il rilascio non
// chiama lo script» e «nessun pacchetto porta l'aiutante» diventano false e non si chiedono più; resta vero «i due viaggiano nello stesso pacchetto».
test('LANC-LIMITI-06 — quinto giro: l impronta che nessuno scrive da solo, lo script di scarico che il rilascio non chiama, i messaggi senza versione e la CLI, il costo del controllo dopo lo Stop; EN poi IT', () => {
  const piatto = readFileSync(new URL('../desktop/CHANGELOG.md', import.meta.url), 'utf8').replace(/\s+/g, ' ')
  const dove = (frase) => piatto.indexOf(frase)
  const inglese = [
    'carries the part of TALOS that talks to the helper but not the helper, so there the helper is never started',
    // unione (14/11/2026): rimisurato, 15 letture in 3 corse col processore al 23-37%; il numero ridato visto a 73 s sotto carico (revisore)
    'Each check reads the start times of the programs and takes 1.7 to 2.1 seconds (15 checks measured on our PC with the processor 23 to 37% busy)',
    '11 checks in 50 seconds, 22.8 seconds spent checking',
    '13 checks in the first ten minutes instead of 120',
    'a number given to another program is seen about a minute late (60 seconds, 3 times out of 3 with the processor 23 to 37% busy), and later when the PC is busy (73 seconds, once, with the processor 56% busy)',
    'before, it was ignored 6 times out of 6 while TALOS answered that it had stopped it',
  ]
  const italiano = [
    'porta la parte di TALOS che parla con l\'aiutante ma non l\'aiutante, quindi lì l\'aiutante non parte mai',
    'controllo legge l\'ora in cui sono partiti i programmi e dura da 1,7 a 2,1 secondi (15 controlli misurati sul nostro PC col processore occupato dal 23 al 37%)',
    '11 controlli in 50 secondi, 22,8 secondi passati a controllare',
    '13 controlli nei primi dieci minuti invece di 120',
    'un numero dato a un altro programma si vede circa un minuto più tardi (60 secondi, 3 volte su 3 col processore occupato dal 23 al 37%), e più tardi ancora se il PC è carico (73 secondi, una volta, col processore occupato al 56%)',
    'prima veniva ignorato 6 volte su 6 mentre TALOS rispondeva di averlo fermato',
  ]
  for (const frase of [...inglese, ...italiano]) assert.ok(dove(frase) > 0, frase)
  const inItaliano = piatto.indexOf('### In italiano')
  const prossimaVersione = piatto.indexOf('## desktop-v0.2.1')
  for (const frase of inglese) assert.ok(dove(frase) < inItaliano, `in inglese, prima della parte italiana: ${frase}`)
  for (const frase of italiano) assert.ok(dove(frase) > inItaliano && dove(frase) < prossimaVersione, `in italiano, nella stessa versione: ${frase}`)
  for (const falsa of [
    'and the release build fixes it', 'e la fissa la build di rilascio',
    'the release says so a month before, and stops when it has expired', 'il rilascio lo dice un mese prima, e si ferma quando è scaduto',
    // unione (14/11/2026): «fino a un minuto» è vero solo a riposo, «1,7-3,2 s» non è la misura
    'takes 1.7 to 3.2 seconds', 'dura da 1,7 a 3,2 secondi', 'is seen up to a minute late', 'si vede fino a un minuto più tardi',
  ]) assert.equal(dove(falsa), -1, falsa)
})

/*
 * Unione vera (agente d unione, 14/11/2026, revisore lanc9 punto 5): git non sceglie fra le due storie del CHANGELOG, e nessuna prova
 *   vietava di rimettere quella del quinto giro (mutante K5 VIVO: «no package carries the helper», «that fingerprint is empty»,
 *   «Nothing writes it on its own» tornavano senza un rosso). Ora la vecchia storia è vietata in tutto il file, EN e IT.
 */
const FRASI_VECCHIE_DEL_QUINTO_GIRO = [
  'no package carries the helper', 'that fingerprint is empty', 'writes it on its own', 'does not run that script yet',
  'nothing checks the helper when a release is made', 'once the release carries it',
  'nessun pacchetto porta l\'aiutante', 'quell\'impronta è vuota', 'Niente la scrive da solo', 'non fa ancora girare quello script',
  'niente controlla l\'aiutante quando si fa un rilascio', 'quando il rilascio lo porterà',
]
test('LANC-LIMITI-07 — dopo l unione la vecchia storia del quinto giro (nessun pacchetto porta l aiutante, impronta vuota, niente la scrive da solo) non torna nel CHANGELOG, EN e IT', () => {
  const piatto = readFileSync(new URL('../desktop/CHANGELOG.md', import.meta.url), 'utf8').replace(/\s+/g, ' ')
  for (const falsa of FRASI_VECCHIE_DEL_QUINTO_GIRO) assert.equal(piatto.indexOf(falsa), -1, `frase vecchia tornata: ${falsa}`)
})

/*
 * Unione vera (14/11/2026): il CHANGELOG dice ciò che il codice fa, ricavato dal codice e non ricopiato. Seconda prova per i mutanti
 *   del revisore con un solo uccisore: K4 («stops»→«warns», oggi solo LIMITI-05), K6 (IT 13→12 controlli, oggi solo LIMITI-06), K5
 *   (la vecchia storia, oggi solo LIMITI-07).
 *   (a) il numero dei controlli nei primi dieci minuti si conta rifacendo la sorveglianza di `session-registry.mjs` col suo tetto e
 *       col suo giro, e EN e IT devono dire quel numero;
 *   (b) il rilascio senza impronta si ferma DAVVERO (`copiaLanciatore` del pacchetto), e EN e IT dicono che si ferma;
 *   (c) il pacchetto copia DAVVERO l aiutante (`prepara-pacchetto.mjs` chiama `copiaLanciatore`), quindi «nessun pacchetto lo porta» è falso.
 */
test('LANC-LIMITI-08 — unione: i numeri e le promesse del CHANGELOG vengono dal codice (controlli nei primi dieci minuti, rilascio che si ferma senza impronta, pacchetto che porta l aiutante); EN e IT uguali', async () => {
  const piatto = readFileSync(new URL('../desktop/CHANGELOG.md', import.meta.url), 'utf8').replace(/\s+/g, ' ')
  const inItaliano = piatto.indexOf('### In italiano')
  const prossimaVersione = piatto.indexOf('## desktop-v0.2.1')
  const inglese = (frase) => { const i = piatto.indexOf(frase); return i > 0 && i < inItaliano }
  const italiano = (frase) => { const i = piatto.indexOf(frase); return i > inItaliano && i < prossimaVersione }
  // (a) la sorveglianza rifatta: passo che raddoppia da 1 giro fino al tetto, un giro ogni `ogniMs`
  const registro = readFileSync(new URL('../src/session-registry.mjs', import.meta.url), 'utf8')
  const tetto = Number(/const RILETTURA_TETTO_GIRI = (\d+);/u.exec(registro)?.[1])
  const ogniMs = Number(/ogniMs: processiOspite\?\.ogniMs \?\? (\d[\d_]*),/u.exec(registro)?.[1].replace(/_/gu, ''))
  assert.ok(tetto > 0 && ogniMs > 0, 'tetto e giro della sorveglianza non trovati in session-registry.mjs')
  const giriInDieciMinuti = Math.floor(600_000 / ogniMs)
  let passo = 0.5; let attesa = 0; let controlli = 0
  for (let giro = 1; giro <= giriInDieciMinuti; giro += 1) {
    if (attesa > 0) { attesa -= 1; continue }
    passo = Math.min(2 * passo, tetto); attesa = passo - 1; controlli += 1
  }
  assert.ok(inglese(`(${controlli} checks in the first ten minutes`), `EN: ${controlli} controlli rifatti dal codice`)
  assert.ok(italiano(`(${controlli} controlli nei primi dieci minuti`), `IT: ${controlli} controlli rifatti dal codice`)
  // (b) il rilascio senza impronta si ferma davvero, e il CHANGELOG lo dice così in EN e IT
  const { copiaLanciatore } = await import('../desktop/scripts/lanciatore-nel-pacchetto.mjs')
  const dir = cartellaDiProva('talos-lanciatore-unione-')
  try {
    await assert.rejects(copiaLanciatore({ ambiente: { TALOS_PACCHETTO_RILASCIO: '1' }, native: join(dir, 'native'), destinazione: join(dir, 'staging') }),
      /nel rilascio l'impronta manca/u)
    assert.equal(existsSync(join(dir, 'staging')), false, 'niente copiato')
  } finally { rimuoviCartellaDiProva(dir) }
  assert.ok(inglese('the release stops if the fingerprint is missing or does not match'), 'EN: il rilascio si ferma')
  assert.ok(italiano('il rilascio si ferma se l\'impronta manca o non torna'), 'IT: il rilascio si ferma')
  for (const molle of ['the release warns if', 'il rilascio avvisa se']) assert.equal(piatto.indexOf(molle), -1, molle)
  // (c) il pacchetto porta l aiutante: la storia «nessun pacchetto lo porta» non può stare
  const prepara = readFileSync(new URL('../desktop/scripts/prepara-pacchetto.mjs', import.meta.url), 'utf8')
  assert.match(prepara, /await copiaLanciatore\(/u, 'prepara-pacchetto copia il lanciatore')
  for (const falsa of ['no package carries the helper', 'nessun pacchetto porta l\'aiutante']) assert.equal(piatto.indexOf(falsa), -1, falsa)
})
