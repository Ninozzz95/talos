import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  copiaFile,
  creaFileWorkspace,
  creaVoceWorkspace,
  eliminaFile,
  leggiContenutoFile,
  apriFileConProgrammaPredefinito,
  leggiFilePerScarico,
  nomiPerContentDisposition,
  nomeSicuroPerIntestazione,
  rinominaFile,
  rivelaInEsploraFile,
  spostaFile,
  WorkspaceFileError,
} from '../src/workspace-files.mjs';

// ⭐ Stesso principio di workspace-tree.test.mjs: una cartella VERA su
// disco, nessun mock del filesystem per le operazioni base.
function sessioneVera() {
  const radice = mkdtempSync(join(tmpdir(), 'talos-files-'));
  writeFileSync(join(radice, 'a.txt'), 'contenuto di a');
  mkdirSync(join(radice, 'sub'));
  writeFileSync(join(radice, 'sub', 'b.txt'), 'contenuto di b');
  return radice;
}

test('⭐ leggiContenutoFile: il contenuto VERO di un file reale', async () => {
  const radice = sessioneVera();
  try {
    const { contenuto, dimensione } = await leggiContenutoFile({ cartella: radice, percorso: 'a.txt' });
    assert.equal(contenuto, 'contenuto di a');
    assert.equal(dimensione, 'contenuto di a'.length);
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐ leggiContenutoFile: un file dentro una sottocartella', async () => {
  const radice = sessioneVera();
  try {
    const { contenuto } = await leggiContenutoFile({ cartella: radice, percorso: 'sub/b.txt' });
    assert.equal(contenuto, 'contenuto di b');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔ leggiContenutoFile: ".." che risale fuori dalla radice, mai il contenuto del genitore', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      leggiContenutoFile({ cartella: radice, percorso: '../etc-passwd-immaginario' }),
      (e) => { assert.ok(e instanceof WorkspaceFileError); return true; },
    );
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔ leggiContenutoFile: una CARTELLA non è un file — errore dichiarato, non un contenuto a caso', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(leggiContenutoFile({ cartella: radice, percorso: 'sub' }), /Non è un file/);
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔ leggiContenutoFile: file oltre il tetto — FILE_TOO_LARGE dichiarato, mai troncato in silenzio', async () => {
  const radice = sessioneVera();
  try {
    writeFileSync(join(radice, 'grosso.bin'), Buffer.alloc(600 * 1024, 'x'));
    await assert.rejects(
      leggiContenutoFile({ cartella: radice, percorso: 'grosso.bin' }),
      (e) => { assert.equal(e.code, 'FILE_TOO_LARGE'); return true; },
    );
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ rinominaFile: sposta DAVVERO il file sul disco, nella STESSA cartella', async () => {
  const radice = sessioneVera();
  try {
    const { nuovoPercorso } = await rinominaFile({ cartella: radice, percorso: 'a.txt', nuovoNome: 'rinominato.txt' });
    assert.equal(nuovoPercorso, 'rinominato.txt');
    assert.equal(existsSync(join(radice, 'a.txt')), false, 'il vecchio nome non esiste più');
    assert.equal(existsSync(join(radice, 'rinominato.txt')), true, 'il nuovo nome esiste davvero sul disco');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔ rinominaFile: un nuovoNome con "/" è un percorso travestito — respinto PRIMA di toccare il disco', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      rinominaFile({ cartella: radice, percorso: 'a.txt', nuovoNome: '../fuori.txt' }),
      (e) => { assert.ok(e instanceof WorkspaceFileError); return true; },
    );
    assert.equal(existsSync(join(radice, 'a.txt')), true, 'il file originale non si è mosso');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔ rinominaFile: AL CONTRARIO, non sovrascrive MAI un file già esistente', async () => {
  const radice = sessioneVera();
  try {
    writeFileSync(join(radice, 'gia-qui.txt'), 'non toccarmi');
    await assert.rejects(
      rinominaFile({ cartella: radice, percorso: 'a.txt', nuovoNome: 'gia-qui.txt' }),
      (e) => { assert.equal(e.code, 'FILE_EXISTS'); return true; },
    );
    assert.equal(readFileSync(join(radice, 'gia-qui.txt'), 'utf8'), 'non toccarmi');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ eliminaFile: cancella DAVVERO un file dal disco', async () => {
  const radice = sessioneVera();
  try {
    await eliminaFile({ cartella: radice, percorso: 'a.txt' });
    assert.equal(existsSync(join(radice, 'a.txt')), false);
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐ eliminaFile: cancella una CARTELLA intera, ricorsivamente', async () => {
  const radice = sessioneVera();
  try {
    await eliminaFile({ cartella: radice, percorso: 'sub' });
    assert.equal(existsSync(join(radice, 'sub')), false);
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ eliminaFile: la RADICE della sessione stessa non si può eliminare da qui', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      eliminaFile({ cartella: radice, percorso: '.' }),
      (e) => { assert.ok(e instanceof WorkspaceFileError); return true; },
    );
    assert.equal(existsSync(radice), true, 'la cartella della sessione esiste ancora');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔ eliminaFile: un percorso che non esiste è FILE_NOT_FOUND, non un successo silenzioso', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      eliminaFile({ cartella: radice, percorso: 'mai-esistito.txt' }),
      (e) => { assert.equal(e.code, 'FILE_NOT_FOUND'); return true; },
    );
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ rivelaInEsploraFile: UN solo argomento argv "/select,<percorso>", niente shell', async () => {
  const radice = sessioneVera();
  try {
    let visto = null;
    await rivelaInEsploraFile({ cartella: radice, percorso: 'a.txt' }, {
      platform: 'win32',
      execFileFn: (comando, argomenti, cb) => { visto = { comando, argomenti }; cb(null); },
    });
    assert.equal(visto.comando, 'explorer.exe');
    assert.equal(visto.argomenti.length, 1, 'un solo argomento, non due — niente spazio dopo la virgola');
    assert.match(visto.argomenti[0], /^\/select,/);
    assert.ok(visto.argomenti[0].endsWith('a.txt'));
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔ rivelaInEsploraFile: un codice di uscita diverso da zero NON è un fallimento — comportamento noto di explorer.exe', async () => {
  const radice = sessioneVera();
  try {
    const risultato = await rivelaInEsploraFile({ cartella: radice, percorso: 'a.txt' }, {
      platform: 'win32',
      execFileFn: (comando, argomenti, cb) => { const e = new Error('exit 1'); e.code = 1; cb(e); },
    });
    assert.deepEqual(risultato, { rivelato: true });
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔ rivelaInEsploraFile: ENOENT (explorer.exe non trovato) è un fallimento VERO', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      rivelaInEsploraFile({ cartella: radice, percorso: 'a.txt' }, {
        platform: 'win32',
        execFileFn: (comando, argomenti, cb) => { const e = new Error('not found'); e.code = 'ENOENT'; cb(e); },
      }),
    );
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔ rivelaInEsploraFile: AL CONTRARIO, fuori da Windows è dichiarato PLATFORM_UNSUPPORTED, mai simulato', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      rivelaInEsploraFile({ cartella: radice, percorso: 'a.txt' }, { platform: 'linux', execFileFn: () => { throw new Error('non deve essere chiamato'); } }),
      (e) => { assert.equal(e.code, 'PLATFORM_UNSUPPORTED'); return true; },
    );
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ creaFileWorkspace: byte VERI, rileggibili dal disco, alla radice del workspace', async () => {
  const radice = sessioneVera();
  try {
    const bytes = new TextEncoder().encode('contenuto binario di prova');
    const { percorso } = await creaFileWorkspace({ cartella: radice, nome: 'nuovo.txt', bytes });
    assert.equal(percorso, 'nuovo.txt');
    assert.equal(readFileSync(join(radice, 'nuovo.txt'), 'utf8'), 'contenuto binario di prova');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔ creaFileWorkspace: un nome che esiste già viene RIFIUTATO, mai sovrascritto in silenzio', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      creaFileWorkspace({ cartella: radice, nome: 'a.txt', bytes: new Uint8Array([1, 2, 3]) }),
      (e) => { assert.ok(e instanceof WorkspaceFileError); assert.equal(e.code, 'FILE_EXISTS'); return true; },
    );
    // ⭐ AL CONTRARIO: il file originale non è stato toccato dal tentativo.
    assert.equal(readFileSync(join(radice, 'a.txt'), 'utf8'), 'contenuto di a');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ creaFileWorkspace: un nome con traversal (".." o "/") viene RIFIUTATO, mai scritto fuori dalla radice', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      creaFileWorkspace({ cartella: radice, nome: '../fuori.txt', bytes: new Uint8Array([1]) }),
      (e) => e instanceof WorkspaceFileError,
    );
    await assert.rejects(
      creaFileWorkspace({ cartella: radice, nome: 'sub/dentro.txt', bytes: new Uint8Array([1]) }),
      (e) => e instanceof WorkspaceFileError,
    );
    assert.ok(!existsSync(join(radice, '..', 'fuori.txt')));
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

// ⭐⭐⭐ 28/8 — owner: "nella lista files devo poter draggare i file... non
// esiste il comando copia... e comandi crud in generale". Drag&drop
// (spostaFile), "Copia" (copiaFile), "Nuovo file"/"Nuova cartella"
// (creaVoceWorkspace) — stesso schema di sicurezza sopra, stessa cartella
// vera su disco, nessun mock del filesystem.

test('⭐⭐⭐ spostaFile: sposta DAVVERO un file dentro una sottocartella', async () => {
  const radice = sessioneVera();
  try {
    const { nuovoPercorso } = await spostaFile({ cartella: radice, percorso: 'a.txt', cartellaDestinazione: 'sub' });
    assert.equal(nuovoPercorso, 'sub/a.txt');
    assert.equal(existsSync(join(radice, 'a.txt')), false, 'non è più alla radice');
    assert.equal(existsSync(join(radice, 'sub', 'a.txt')), true, 'è davvero dentro sub');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐ spostaFile: cartellaDestinazione vuota sposta ALLA RADICE', async () => {
  const radice = sessioneVera();
  try {
    const { nuovoPercorso } = await spostaFile({ cartella: radice, percorso: 'sub/b.txt', cartellaDestinazione: '' });
    assert.equal(nuovoPercorso, 'b.txt');
    assert.equal(existsSync(join(radice, 'b.txt')), true);
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ spostaFile: AL CONTRARIO, una cartella non può essere spostata dentro se stessa', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      spostaFile({ cartella: radice, percorso: 'sub', cartellaDestinazione: 'sub' }),
      (e) => { assert.ok(e instanceof WorkspaceFileError); return true; },
    );
    assert.equal(existsSync(join(radice, 'sub', 'b.txt')), true, 'sub non si è mosso');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ spostaFile: AL CONTRARIO, una cartella non può essere spostata dentro un suo discendente', async () => {
  const radice = sessioneVera();
  try {
    mkdirSync(join(radice, 'sub', 'nipote'));
    await assert.rejects(
      spostaFile({ cartella: radice, percorso: 'sub', cartellaDestinazione: 'sub/nipote' }),
      (e) => { assert.ok(e instanceof WorkspaceFileError); return true; },
    );
    assert.equal(existsSync(join(radice, 'sub', 'nipote')), true, 'nipote esiste ancora al suo posto, sub non si è mosso dentro se stessa');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔ spostaFile: AL CONTRARIO, non sovrascrive MAI un nome già occupato nella destinazione', async () => {
  const radice = sessioneVera();
  try {
    writeFileSync(join(radice, 'sub', 'a.txt'), 'già qui in sub, non toccarmi');
    await assert.rejects(
      spostaFile({ cartella: radice, percorso: 'a.txt', cartellaDestinazione: 'sub' }),
      (e) => { assert.equal(e.code, 'FILE_EXISTS'); return true; },
    );
    assert.equal(readFileSync(join(radice, 'sub', 'a.txt'), 'utf8'), 'già qui in sub, non toccarmi');
    assert.equal(existsSync(join(radice, 'a.txt')), true, 'il file originale non si è mosso');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔ spostaFile: una destinazione che non esiste è FILE_NOT_FOUND', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      spostaFile({ cartella: radice, percorso: 'a.txt', cartellaDestinazione: 'mai-esistita' }),
      (e) => { assert.equal(e.code, 'FILE_NOT_FOUND'); return true; },
    );
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔ spostaFile: AL CONTRARIO, la destinazione dev\'essere una cartella, non un file', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      spostaFile({ cartella: radice, percorso: 'sub/b.txt', cartellaDestinazione: 'a.txt' }),
      (e) => { assert.ok(e instanceof WorkspaceFileError); return true; },
    );
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ copiaFile: duplica DAVVERO un file, "nome (copia).ext"', async () => {
  const radice = sessioneVera();
  try {
    const { nuovoPercorso } = await copiaFile({ cartella: radice, percorso: 'a.txt' });
    assert.equal(nuovoPercorso, 'a (copia).txt');
    assert.equal(readFileSync(join(radice, 'a (copia).txt'), 'utf8'), 'contenuto di a');
    assert.equal(existsSync(join(radice, 'a.txt')), true, 'l\'originale resta al suo posto');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ copiaFile: una CARTELLA si copia ricorsivamente, col suo contenuto', async () => {
  const radice = sessioneVera();
  try {
    const { nuovoPercorso } = await copiaFile({ cartella: radice, percorso: 'sub' });
    assert.equal(nuovoPercorso, 'sub (copia)');
    assert.equal(readFileSync(join(radice, 'sub (copia)', 'b.txt'), 'utf8'), 'contenuto di b');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐ copiaFile: una seconda copia diventa "(copia 2)", non sovrascrive la prima', async () => {
  const radice = sessioneVera();
  try {
    await copiaFile({ cartella: radice, percorso: 'a.txt' });
    const { nuovoPercorso } = await copiaFile({ cartella: radice, percorso: 'a.txt' });
    assert.equal(nuovoPercorso, 'a (copia 2).txt');
    assert.equal(existsSync(join(radice, 'a (copia).txt')), true, 'la prima copia esiste ancora');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔ copiaFile: AL CONTRARIO, un file che INIZIA con un punto non perde il nome ("dotfile")', async () => {
  const radice = sessioneVera();
  try {
    writeFileSync(join(radice, '.gitignore'), 'node_modules/');
    const { nuovoPercorso } = await copiaFile({ cartella: radice, percorso: '.gitignore' });
    assert.equal(nuovoPercorso, '.gitignore (copia)');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔ copiaFile: un percorso che non esiste è FILE_NOT_FOUND', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      copiaFile({ cartella: radice, percorso: 'mai-esistito.txt' }),
      (e) => { assert.equal(e.code, 'FILE_NOT_FOUND'); return true; },
    );
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ creaVoceWorkspace: un file nuovo, vuoto, VERO sul disco, in una sottocartella', async () => {
  const radice = sessioneVera();
  try {
    const { percorso } = await creaVoceWorkspace({ cartella: radice, percorsoBase: 'sub', nome: 'nuovo.txt', tipo: 'file' });
    assert.equal(percorso, 'sub/nuovo.txt');
    assert.equal(readFileSync(join(radice, 'sub', 'nuovo.txt'), 'utf8'), '');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ creaVoceWorkspace: una cartella nuova, VERA sul disco, alla radice (percorsoBase vuoto)', async () => {
  const radice = sessioneVera();
  try {
    const { percorso } = await creaVoceWorkspace({ cartella: radice, percorsoBase: '', nome: 'nuova-cartella', tipo: 'cartella' });
    assert.equal(percorso, 'nuova-cartella');
    const { statSync } = await import('node:fs');
    assert.ok(statSync(join(radice, 'nuova-cartella')).isDirectory());
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔ creaVoceWorkspace: AL CONTRARIO, non sovrascrive MAI un nome già occupato', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      creaVoceWorkspace({ cartella: radice, percorsoBase: '', nome: 'a.txt', tipo: 'file' }),
      (e) => { assert.equal(e.code, 'FILE_EXISTS'); return true; },
    );
    assert.equal(readFileSync(join(radice, 'a.txt'), 'utf8'), 'contenuto di a', 'il file originale non è stato toccato');
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ creaVoceWorkspace: AL CONTRARIO, un nome con traversal viene RIFIUTATO', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      creaVoceWorkspace({ cartella: radice, percorsoBase: '', nome: '../fuori.txt', tipo: 'file' }),
      (e) => e instanceof WorkspaceFileError,
    );
    assert.ok(!existsSync(join(radice, '..', 'fuori.txt')));
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔ creaVoceWorkspace: un percorsoBase che non esiste è FILE_NOT_FOUND', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      creaVoceWorkspace({ cartella: radice, percorsoBase: 'mai-esistita', nome: 'x.txt', tipo: 'file' }),
      (e) => { assert.equal(e.code, 'FILE_NOT_FOUND'); return true; },
    );
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔⛔ creaVoceWorkspace: AL CONTRARIO, un percorsoBase che è un FILE (non una cartella) viene rifiutato', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      creaVoceWorkspace({ cartella: radice, percorsoBase: 'a.txt', nome: 'x.txt', tipo: 'file' }),
      (e) => e instanceof WorkspaceFileError,
    );
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

test('⛔ creaVoceWorkspace: un tipo diverso da "file"/"cartella" è rifiutato', async () => {
  const radice = sessioneVera();
  try {
    await assert.rejects(
      creaVoceWorkspace({ cartella: radice, percorsoBase: '', nome: 'x.txt', tipo: 'qualcosa-daltro' }),
      (e) => e instanceof WorkspaceFileError,
    );
  } finally {
    rmSync(radice, { recursive: true, force: true });
  }
});

/*
 * ⛔⛔ PO-05, owner: «ogni file generato deve avere un collegamento diretto per scaricarlo con un
 * clic; nome, formato, dimensione e disponibilità REALI», e «verificare i BYTES scaricati».
 * Il difetto che queste prove chiudono è preciso: `leggiContenutoFile` legge in utf8, e un `.docx`
 * è uno zip — misurato il 10/09/2026, un docx vero generato da TALOS pesa 7.714 byte e comincia con
 * la firma `50 4b 03 04`; passandolo da utf8 ogni byte non valido diventa U+FFFD e non torna indietro.
 */
test('PO-05: i byte di un binario arrivano IDENTICI, e utf8 li avrebbe distrutti', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-scarico-'));
  try {
    // gli stessi primi byte di un OOXML vero (PK\x03\x04), pi\u00f9 byte che non sono UTF-8 valido
    const originale = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x08, 0xff, 0xfe, 0x80, 0x81]);
    writeFileSync(join(cartella, 'prova.docx'), originale);

    const scaricato = await leggiFilePerScarico({ cartella, percorso: 'prova.docx' });
    assert.deepEqual([...scaricato.bytes], [...originale], 'byte per byte, senza una sola sostituzione');
    assert.equal(scaricato.dimensione, originale.length);
    assert.equal(scaricato.nome, 'prova.docx');

    // \u26d4 AL CONTRARIO: la via testuale sugli stessi byte NON li restituisce
    const testuale = await leggiContenutoFile({ cartella, percorso: 'prova.docx' });
    const riconvertito = Buffer.from(testuale.contenuto, 'utf8');
    assert.notDeepEqual([...riconvertito], [...originale],
      'se questa passasse, `leggiFilePerScarico` non servirebbe: \u00e8 la prova che il difetto era reale');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('PO-05: un file fuori dalla cartella della sessione non si scarica', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-scarico-'));
  const fuori = mkdtempSync(join(tmpdir(), 'talos-fuori-'));
  try {
    writeFileSync(join(fuori, 'segreto.txt'), 'roba di un altro');
    for (const percorso of ['../' + join(fuori, 'segreto.txt'), '..', '../..', 'sotto/../../fuori.txt']) {
      await assert.rejects(
        () => leggiFilePerScarico({ cartella, percorso }),
        (e) => e instanceof WorkspaceFileError,
        `\u26d4 «${percorso}» \u00e8 uscito dalla cartella della sessione`,
      );
    }
    // e una cartella non \u00e8 un file
    mkdirSync(join(cartella, 'sottocartella'));
    await assert.rejects(() => leggiFilePerScarico({ cartella, percorso: 'sottocartella' }), (e) => e instanceof WorkspaceFileError);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
    rmSync(fuori, { recursive: true, force: true });
  }
});

/*
 * ⛔ Il nome finisce in un'intestazione HTTP. RFC 6266 (letto 10/09/2026): `filename*` estende
 * `filename` oltre l'ASCII e, quando ci sono entrambi, è `filename*` a vincere ⇒ si mandano tutti e
 * due. E un a-capo dentro un'intestazione non è un nome brutto: è un'intestazione spezzata.
 */
test('PO-05: il nome per Content-Disposition \u2014 ripiego ASCII, versione UTF-8, e niente intestazioni spezzate', () => {
  const conAccenti = nomiPerContentDisposition('Relazione citt\u00e0 perch\u00e9.docx');
  assert.equal(conAccenti.ascii, 'Relazione citt_ perch_.docx', 'il ripiego resta ASCII puro');
  assert.equal(conAccenti.utf8, encodeURIComponent('Relazione citt\u00e0 perch\u00e9.docx'));
  assert.doesNotMatch(conAccenti.ascii, /["\\]/, 'virgolette e barra rovescia romperebbero il parametro quotato');

  for (const cattivo of ['a\nX-Iniettato: si', 'b\rSet-Cookie: x=1', 'c\u0000d']) {
    const nome = nomeSicuroPerIntestazione(cattivo);
    assert.doesNotMatch(nome, /[\r\n\u0000]/, `\u26d4 «${JSON.stringify(cattivo)}» poteva spezzare l\u2019intestazione`);
  }
  assert.equal(nomeSicuroPerIntestazione('   '), 'file', 'un nome vuoto non produce un\u2019intestazione senza nome');
  assert.equal(nomiPerContentDisposition('\u4e2d\u6587.pdf').ascii, '__.pdf', 'un nome tutto non-ASCII ha comunque un ripiego valido');
});

/*
 * ⛔⛔⛔ 10/09/2026 — LE AZIONI WINDOWS NON HANNO MAI FUNZIONATO CON LA POLITICA VERA, e i test
 * erano verdi. Il wrapper interno dichiara `(comando, argomenti, opzioni, callback)`, ma il codice lo
 * chiamava con TRE argomenti: il richiamo finiva nel posto delle opzioni, `callback` restava
 * `undefined`, e la promessa non si risolveva MAI.
 * Misurato premendo il bottone sul 4174: la rotta non rispondeva entro 15 secondi (`curl`: «0 bytes
 * received»); fuori dal server la funzione restava appesa oltre 8 secondi. Dopo la cura: 131 ms
 * («mostra nella cartella») e 242 ms («apri»).
 * ⛔ Perché nessun test lo vedeva: iniettavano un finto a TRE parametri `(comando, argomenti, cb)`,
 * cioè con la forma sbagliata. Un finto che non imita il vero misura il finto. Queste prove chiamano
 * con QUATTRO argomenti, come fa la politica vera.
 */
test('⛔ AZIONI WINDOWS: il richiamo arriva anche quando il finto ha la firma VERA a quattro argomenti', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-win-'));
  try {
    writeFileSync(join(cartella, 'documento.docx'), 'x');
    for (const [nome, fn, atteso] of [
      ['rivela', rivelaInEsploraFile, { rivelato: true }],
      ['apri', apriFileConProgrammaPredefinito, { aperto: true }],
    ]) {
      let visto = null;
      const esito = await Promise.race([
        fn({ cartella, percorso: 'documento.docx' }, {
          platform: 'win32',
          // ⛔ QUATTRO parametri: è la forma che usa `EXPLORER_PROCESS_POLICY.execFile`
          execFileFn: (comando, argomenti, opzioni, callback) => { visto = { comando, argomenti, opzioni }; callback(null); },
        }),
        new Promise((r) => setTimeout(() => r('APPESA'), 3000)),
      ]);
      assert.deepEqual(esito, atteso, `⛔ ${nome} non ha risolto: era il difetto del 10/09`);
      assert.equal(visto.comando, 'explorer.exe');
      assert.equal(typeof visto.opzioni, 'object', '⛔ se qui arriva una FUNZIONE, il richiamo è finito nel posto sbagliato');
    }
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AZIONI WINDOWS: chi inietta un finto a TRE argomenti continua a funzionare', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-win-'));
  try {
    writeFileSync(join(cartella, 'documento.docx'), 'x');
    const esito = await Promise.race([
      rivelaInEsploraFile({ cartella, percorso: 'documento.docx' }, {
        platform: 'win32',
        execFileFn: (comando, argomenti, cb) => cb(null),
      }),
      new Promise((r) => setTimeout(() => r('APPESA'), 3000)),
    ]);
    assert.deepEqual(esito, { rivelato: true }, 'la forma vecchia resta valida: le prove già scritte non diventano rosse');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ APRI, AL CONTRARIO: una cartella non si apre col programma, e fuori da Windows si dichiara', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-win-'));
  try {
    mkdirSync(join(cartella, 'sotto'));
    await assert.rejects(
      () => apriFileConProgrammaPredefinito({ cartella, percorso: 'sotto' }, { platform: 'win32', execFileFn: (a, b, c, cb) => cb(null) }),
      (e) => e instanceof WorkspaceFileError && /Mostra nella cartella/.test(e.message),
      'una cartella si RIVELA, non si apre col programma: due azioni diverse',
    );
    writeFileSync(join(cartella, 'x.txt'), 'y');
    await assert.rejects(
      () => apriFileConProgrammaPredefinito({ cartella, percorso: 'x.txt' }, { platform: 'linux' }),
      (e) => e.code === 'PLATFORM_UNSUPPORTED',
      'fuori da Windows non finge: lo dichiara',
    );
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});
