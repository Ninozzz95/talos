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
