import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  eliminaFile,
  leggiContenutoFile,
  rinominaFile,
  rivelaInEsploraFile,
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
