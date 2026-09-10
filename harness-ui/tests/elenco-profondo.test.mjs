import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  costruisciElencoProfondo,
  testoElenco,
  confrontaPercorsi,
  CARTELLE_ESCLUSE_PREDEFINITE,
  ESTENSIONI_ESCLUSE_PREDEFINITE,
  TETTO_FILE_PREDEFINITO,
  ElencoProfondoError,
} from '../src/elenco-profondo.mjs';

/*
 * P-13 — le prove del costruttore dell'elenco profondo.
 *
 * ⛔ Quasi tutte girano su un filesystem FINTO iniettato, e non è una scorciatoia: due dei casi
 * che contano — un anello simbolico e una cartella illeggibile — su Windows non si costruiscono
 * (un link a cartella vuole privilegi che questa macchina non dà a chi lancia i test, e i
 * permessi NTFS non si tolgono con un `chmod`). Con un disco vero quelle due prove sarebbero
 * saltate in silenzio, cioè non esisterebbero. L'ultima prova, invece, gira sul disco VERO col
 * `fs` di serie: senza, tutto quello che si dimostra è che il finto è coerente con se stesso.
 */

const RADICE = '/finto';

/** Costruisce un `fs` finto da un albero letterale: stringa = file, oggetto = cartella,
 *  `{__link: 'percorso/relativo'}` = collegamento, `{__errore: 'EACCES'}` = cartella illeggibile. */
function creaFsFinto(albero, radice = RADICE) {
  const normalizza = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  const rad = normalizza(radice);

  const relativoDi = (p) => {
    const n = normalizza(p);
    if (n === rad) return '';
    if (n.startsWith(`${rad}/`)) return n.slice(rad.length + 1);
    return null;
  };

  function trova(relativo) {
    let nodo = albero;
    let reale = '';
    if (relativo === '') return { nodo, reale };
    for (const segmento of relativo.split('/')) {
      if (!nodo || typeof nodo !== 'object' || nodo.__errore) return null;
      nodo = nodo[segmento];
      reale = reale ? `${reale}/${segmento}` : segmento;
      if (nodo && typeof nodo === 'object' && nodo.__link !== undefined) {
        const destinazione = trova(nodo.__link);
        if (!destinazione) return null;
        nodo = destinazione.nodo;
        reale = destinazione.reale;
      }
    }
    return nodo === undefined ? null : { nodo, reale };
  }

  const tipoDi = (valore) => {
    if (typeof valore === 'string') return 'file';
    if (valore && typeof valore === 'object' && valore.__link !== undefined) return 'link';
    if (valore && typeof valore === 'object') return 'cartella';
    return 'ignoto';
  };

  const voceDi = (nome, valore) => {
    const tipo = tipoDi(valore);
    return {
      name: nome,
      isFile: () => tipo === 'file',
      isDirectory: () => tipo === 'cartella',
      isSymbolicLink: () => tipo === 'link',
    };
  };

  return {
    async readdir(percorso) {
      const relativo = relativoDi(percorso);
      if (relativo === null) throw Object.assign(new Error('fuori dalla radice'), { code: 'ENOENT' });
      const trovato = trova(relativo);
      if (!trovato || typeof trovato.nodo !== 'object') throw Object.assign(new Error('non è una cartella'), { code: 'ENOTDIR' });
      if (trovato.nodo.__errore) throw Object.assign(new Error('permesso negato'), { code: trovato.nodo.__errore });
      return Object.entries(trovato.nodo)
        .filter(([nome]) => !nome.startsWith('__'))
        .map(([nome, valore]) => voceDi(nome, valore));
    },
    async realpath(percorso) {
      const relativo = relativoDi(percorso);
      if (relativo === null) throw Object.assign(new Error('fuori dalla radice'), { code: 'ENOENT' });
      const trovato = trova(relativo);
      if (!trovato) throw Object.assign(new Error('non esiste'), { code: 'ENOENT' });
      return trovato.reale === '' ? rad : `${rad}/${trovato.reale}`;
    },
    async stat(percorso) {
      const relativo = relativoDi(percorso);
      if (relativo === null) throw Object.assign(new Error('fuori dalla radice'), { code: 'ENOENT' });
      const trovato = trova(relativo);
      if (!trovato) throw Object.assign(new Error('non esiste'), { code: 'ENOENT' });
      const cartella = typeof trovato.nodo === 'object';
      return { isDirectory: () => cartella, isFile: () => !cartella };
    },
  };
}

test('ELENCO-POTATURA-01: le cartelle generate non compaiono, e chi è stato saltato si conta', async () => {
  const fs = creaFsFinto({
    'package.json': 'x',
    src: { 'app.mjs': 'x' },
    node_modules: { pacchetto: { 'indice.js': 'x', altro: { 'ancora.js': 'x' } } },
    '.git': { objects: { 'ab12': 'x' } },
    dist: { 'bundle.js': 'x' },
  });

  const esito = await costruisciElencoProfondo({ radice: RADICE, fs });

  assert.deepEqual(esito.percorsi, ['package.json', 'src/app.mjs']);
  assert.equal(esito.cartelleSaltate, 3); // node_modules, .git, dist
  assert.equal(esito.dettaglio.perNome, 3);
  assert.equal(esito.troncato, false);
  // AL CONTRARIO: chiedendo una potatura vuota, quelle stesse cartelle si vedono tutte
  const senzaPotatura = await costruisciElencoProfondo({ radice: RADICE, fs, escludiCartelle: [] });
  assert.equal(senzaPotatura.cartelleSaltate, 0);
  assert.ok(senzaPotatura.percorsi.includes('node_modules/pacchetto/indice.js'));
  assert.ok(senzaPotatura.percorsi.includes('.git/objects/ab12'));
  // e la lista di serie è quella che il repo già usava altrove, non una inventata qui
  assert.ok(CARTELLE_ESCLUSE_PREDEFINITE.includes('node_modules'));
  assert.ok(CARTELLE_ESCLUSE_PREDEFINITE.includes('__pycache__'));
});

test('ELENCO-PROFONDITA-02: a profondità 8 il file a sei livelli c\'è, a profondità 2 no', async () => {
  const fs = creaFsFinto({
    'radice.md': 'x',
    a: { 'x.txt': 'x', b: { c: { d: { e: { 'f.txt': 'x' } } } } },
  });

  const profondo = await costruisciElencoProfondo({ radice: RADICE, fs, profonditaMax: 8 });
  assert.ok(profondo.percorsi.includes('a/b/c/d/e/f.txt'), 'il file a sei livelli deve esserci');
  assert.equal(profondo.dettaglio.perProfondita, 0);

  // Questa è la vista di OGGI, quella che non vede nessuno dei 106 percorsi del corpus
  const corto = await costruisciElencoProfondo({ radice: RADICE, fs, profonditaMax: 2 });
  assert.deepEqual(corto.percorsi, ['radice.md', 'a/x.txt']);
  assert.equal(corto.percorsi.includes('a/b/c/d/e/f.txt'), false);
  assert.equal(corto.dettaglio.perProfondita, 1); // `a/b` non si è aperta
  // ⛔ e la differenza fra le due viste è esattamente il file che il modello non poteva vedere
  assert.equal(profondo.percorsi.length - corto.percorsi.length, 1);
});

test('ELENCO-TETTO-03: il tetto morde, e il testo lo DICE in testa e in coda', async () => {
  const dieci = {};
  for (let i = 1; i <= 10; i += 1) dieci[`file${String(i).padStart(2, '0')}.txt`] = 'x';
  const fs = creaFsFinto(dieci);

  const esito = await costruisciElencoProfondo({ radice: RADICE, fs, tettoFile: 3 });
  assert.equal(esito.percorsi.length, 3);
  assert.deepEqual(esito.percorsi, ['file01.txt', 'file02.txt', 'file03.txt']);
  assert.equal(esito.troncato, true);

  const testo = testoElenco(esito.percorsi, { ...esito, radice: '/casa/progetto-mio' });
  assert.match(testo, /ELENCO INCOMPLETO/);
  assert.match(testo, /elenco INCOMPLETO/); // anche in coda: dopo mille righe la prima è lontana
  assert.equal(testo.split('INCOMPLETO').length - 1, 2);
  assert.match(testo, /non vuol dire che non esista/);

  // AL CONTRARIO: se il tetto non morde, nessun avviso — un allarme che c'è sempre non è un allarme
  const intero = await costruisciElencoProfondo({ radice: RADICE, fs, tettoFile: 100 });
  assert.equal(intero.troncato, false);
  assert.equal(intero.percorsi.length, 10);
  assert.equal(/INCOMPLETO/.test(testoElenco(intero.percorsi, { ...intero, radice: RADICE })), false);
});

test('ELENCO-CACHE-04: due giri di fila danno la stessa identica stringa, anche se il disco cambia ordine', async () => {
  /*
   * ⛔ La prova più importante di tutte. La cache del prefisso si aggancia solo se i byte sono
   * identici: un solo carattere diverso e si paga sei volte tanto. `readdir` non promette
   * nessun ordine (su ext4 è l'ordine di hash del nome), quindi qui il disco lo cambia apposta
   * fra il primo e il secondo giro — e l'uscita deve restare la stessa, byte per byte.
   */
  const albero = {
    'zeta.md': 'x', 'alfa.md': 'x',
    src: { 'uno.mjs': 'x', 'due.mjs': 'x', dentro: { 'tre.mjs': 'x' } },
    tests: { 'prova.mjs': 'x' },
  };
  const base = creaFsFinto(albero);
  const alRovescio = { ...base, readdir: async (p, o) => (await base.readdir(p, o)).reverse() };

  const primo = await costruisciElencoProfondo({ radice: RADICE, fs: base });
  const secondo = await costruisciElencoProfondo({ radice: RADICE, fs: base });
  const terzo = await costruisciElencoProfondo({ radice: RADICE, fs: alRovescio });

  const testo = (e) => testoElenco(e.percorsi, { ...e, radice: RADICE });
  assert.equal(testo(primo), testo(secondo), 'due giri identici devono dare la stessa stringa');
  assert.equal(testo(primo), testo(terzo), 'un disco che elenca al contrario non deve cambiare una virgola');
  assert.deepEqual(primo.percorsi, [
    'alfa.md', 'zeta.md', 'src/due.mjs', 'src/uno.mjs', 'src/dentro/tre.mjs', 'tests/prova.mjs',
  ]);

  // ⛔ e il determinismo deve reggere anche quando il tetto taglia: altrimenti il troncamento
  // terrebbe file diversi a ogni giro, e la cache si azzererebbe proprio dove serve di più
  const tagliato = await costruisciElencoProfondo({ radice: RADICE, fs: base, tettoFile: 3 });
  const tagliatoAlRovescio = await costruisciElencoProfondo({ radice: RADICE, fs: alRovescio, tettoFile: 3 });
  assert.deepEqual(tagliato.percorsi, tagliatoAlRovescio.percorsi);
  // camminata in ampiezza: ciò che sopravvive al taglio è la roba vicina alla radice
  assert.deepEqual(tagliato.percorsi, ['alfa.md', 'zeta.md', 'src/due.mjs']);

  // e l'ordine non passa mai da `localeCompare`, che dipende dai dati ICU compilati in Node
  assert.equal(confrontaPercorsi('src/a.mjs', 'src/dentro/b.mjs'), -1);
  assert.equal(confrontaPercorsi('a/b.txt', 'a/b.txt'), 0);
});

test('ELENCO-ANELLO-05: un collegamento che punta al genitore non fa girare in tondo', async () => {
  const fs = creaFsFinto({
    'a.txt': 'x',
    sotto: { 'b.txt': 'x', su: { __link: '' } }, // `su` punta alla radice
  });

  const esito = await costruisciElencoProfondo({ radice: RADICE, fs });
  assert.deepEqual(esito.percorsi, ['a.txt', 'sotto/b.txt']);
  assert.equal(esito.dettaglio.perCiclo, 1);
  assert.equal(esito.troncato, false);

  /*
   * ⛔ AL CONTRARIO, ed è il caso che ha bocciato la prima versione: un collegamento a una
   * cartella NUOVA non è un anello. Con la guardia sbagliata (un insieme globale di «già
   * viste») vinceva il nome incontrato per primo in ordine alfabetico e `vera/dentro.txt` —
   * un percorso che sul disco funziona — spariva. Entrambe le strade devono comparire.
   */
  const conLinkVero = creaFsFinto({
    'a.txt': 'x',
    vera: { 'dentro.txt': 'x' },
    scorciatoia: { __link: 'vera' },
  });
  const seguito = await costruisciElencoProfondo({ radice: RADICE, fs: conLinkVero });
  assert.deepEqual(seguito.percorsi, ['a.txt', 'scorciatoia/dentro.txt', 'vera/dentro.txt']);
  assert.equal(seguito.dettaglio.perCiclo, 0);

  // e un anello fra due cartelle che si puntano a vicenda finisce lo stesso
  const dueCheSiPuntano = creaFsFinto({
    uno: { 'u.txt': 'x', versoDue: { __link: 'due' } },
    due: { 'd.txt': 'x', versoUno: { __link: 'uno' } },
  });
  const finito = await costruisciElencoProfondo({ radice: RADICE, fs: dueCheSiPuntano, profonditaMax: 8 });
  assert.ok(finito.percorsi.includes('uno/u.txt'));
  assert.ok(finito.percorsi.includes('due/d.txt'));
  assert.ok(finito.dettaglio.perCiclo > 0, 'l\'anello deve essere riconosciuto, non solo sopravvissuto');
  assert.ok(finito.percorsi.length < 40, 'e non deve esplodere in percorsi che girano su se stessi');
});

test('ELENCO-ILLEGGIBILE-06: una cartella che non si lascia leggere si salta con onestà', async () => {
  const fs = creaFsFinto({
    'a.txt': 'x',
    aperta: { 'b.txt': 'x' },
    chiusa: { __errore: 'EACCES' },
  });

  const esito = await costruisciElencoProfondo({ radice: RADICE, fs });
  assert.deepEqual(esito.percorsi, ['a.txt', 'aperta/b.txt']);
  assert.equal(esito.dettaglio.illeggibili, 1);
  assert.equal(esito.cartelleSaltate, 1); // dichiarata, non taciuta

  // AL CONTRARIO: se la radice stessa è illeggibile non si crolla, si torna a mani vuote e lo si dice
  const radiceChiusa = creaFsFinto({ __errore: 'EACCES' });
  const vuoto = await costruisciElencoProfondo({ radice: RADICE, fs: radiceChiusa });
  assert.deepEqual(vuoto.percorsi, []);
  assert.equal(vuoto.dettaglio.illeggibili, 1);
  assert.match(testoElenco(vuoto.percorsi, { ...vuoto, radice: RADICE }), /Nessun file/);
});

test('ELENCO-ESTENSIONI-07: fuori i binari, ma un\'estensione mai vista resta dentro', async () => {
  const fs = creaFsFinto({
    'logo.png': 'x', 'consegna.zip': 'x', 'modello.gguf': 'x', '.DS_Store': 'x',
    'nota.md': 'x', 'icona.svg': 'x', 'Makefile': 'x', '.gitignore': 'x', 'strano.zig': 'x',
  });

  const esito = await costruisciElencoProfondo({ radice: RADICE, fs });
  assert.deepEqual(esito.percorsi, ['.gitignore', 'Makefile', 'icona.svg', 'nota.md', 'strano.zig']);
  assert.equal(esito.fileEsclusi, 4); // logo.png, consegna.zip, modello.gguf, .DS_Store
  assert.equal(esito.dettaglio.perEstensione, 4);
  /*
   * ⛔ Il punto della decisione (2): `.zig` non è in nessuna lista, e proprio per questo DEVE
   * comparire. Con una allowlist sparirebbe, e il modello concluderebbe che non esiste — che è
   * la bugia che questo modulo esiste per non dire. `Makefile` e `.gitignore` non hanno
   * estensione affatto e restano.
   */
  assert.ok(esito.percorsi.includes('strano.zig'));
  assert.ok(esito.percorsi.includes('Makefile'));
  assert.ok(esito.percorsi.includes('.gitignore'));
  assert.ok(esito.percorsi.includes('icona.svg'), 'svg è testo, e dice com\'è fatta la UI');
  assert.equal(esito.percorsi.includes('modello.gguf'), false);
  assert.ok(ESTENSIONI_ESCLUSE_PREDEFINITE.includes('.gguf'));

  // AL CONTRARIO: con la denylist svuotata compaiono tutti, compreso il peso da gigabyte
  const tutto = await costruisciElencoProfondo({ radice: RADICE, fs, escludiEstensioni: [] });
  assert.equal(tutto.fileEsclusi, 1); // resta fuori solo `.DS_Store`, che non l'ha scritto nessuno
  assert.ok(tutto.percorsi.includes('modello.gguf'));
});

test('ELENCO-FILTRO-08: il filtro iniettato pota un sottoalbero intero senza camminarlo', async () => {
  const fs = creaFsFinto({
    'visibile.txt': 'x',
    'chiave.txt': 'x',
    segreti: { 'uno.txt': 'x', dentro: { 'due.txt': 'x' } },
  });

  const visti = [];
  const esito = await costruisciElencoProfondo({
    radice: RADICE,
    fs,
    filtro: (percorso, info) => { visti.push([percorso, info?.cartella]); return percorso !== 'segreti' && percorso !== 'chiave.txt'; },
  });

  assert.deepEqual(esito.percorsi, ['visibile.txt']);
  assert.equal(esito.dettaglio.perFiltro, 1);
  assert.equal(esito.dettaglio.fileFiltrati, 1);
  // la cartella negata non si è aperta: il filtro non ha mai visto ciò che c'era dentro
  assert.equal(visti.some(([p]) => p.startsWith('segreti/')), false);
  // e il filtro sa distinguere una cartella da un file, senza che un filtro a un argomento si rompa
  assert.deepEqual(visti.find(([p]) => p === 'segreti'), ['segreti', true]);
  assert.deepEqual(visti.find(([p]) => p === 'chiave.txt'), ['chiave.txt', false]);
  const aUnArgomento = await costruisciElencoProfondo({ radice: RADICE, fs, filtro: (p) => p !== 'segreti' });
  assert.deepEqual(aUnArgomento.percorsi, ['chiave.txt', 'visibile.txt']);

  // AL CONTRARIO: senza filtro c'è tutto, e un filtro che non è una funzione si rifiuta subito
  const senza = await costruisciElencoProfondo({ radice: RADICE, fs });
  assert.deepEqual(senza.percorsi, ['chiave.txt', 'visibile.txt', 'segreti/uno.txt', 'segreti/dentro/due.txt']);
  await assert.rejects(() => costruisciElencoProfondo({ radice: RADICE, fs, filtro: 'no' }), ElencoProfondoError);
  await assert.rejects(() => costruisciElencoProfondo({ radice: '', fs }), ElencoProfondoError);
});

test('ELENCO-TESTO-09: l\'intestazione dice il nome della cartella, mai il percorso della persona', async () => {
  const testo = testoElenco(['src/a.mjs', 'src/b.mjs'], {
    radice: 'C:\\Users\\Antonino\\Desktop\\projects\\AVM-harness-desktop\\harness-ui',
    troncato: false,
    fileEsclusi: 12,
  });
  assert.match(testo, /«harness-ui»/);
  assert.equal(testo.includes('Antonino'), false, 'un percorso assoluto porta il nome della persona dentro il prompt');
  assert.equal(testo.includes('C:\\'), false);
  assert.match(testo, /12 file non compaiono/);
  assert.match(testo, /^File di «harness-ui» — 2 percorsi/m);

  // senza file esclusi non si nomina nessuna esclusione; con l'elenco vuoto si dice il vero
  assert.equal(/non compaiono/.test(testoElenco(['a.txt'], { radice: '/casa/x' })), false);
  assert.match(testoElenco([], { radice: '/casa/progetto' }), /Nessun file da mostrare per «progetto»/);
  assert.match(testoElenco([], { radice: '' }), /la cartella di lavoro/);
  // e nessun nome tecnico a schermo
  assert.equal(/readdir|fs\.|node_modules/.test(testo), false);
});

test('ELENCO-DISCO-VERO-10: col filesystem di serie funziona, e i separatori sono `/` anche su Windows', async () => {
  const base = await mkdtemp(join(tmpdir(), 'talos-elenco-'));
  try {
    await writeFile(join(base, 'radice.md'), 'x');
    await writeFile(join(base, 'logo.png'), 'x');
    await mkdir(join(base, 'src', 'dentro'), { recursive: true });
    await writeFile(join(base, 'src', 'app.mjs'), 'x');
    await writeFile(join(base, 'src', 'dentro', 'profondo.mjs'), 'x');
    await mkdir(join(base, 'node_modules', 'pacchetto'), { recursive: true });
    await writeFile(join(base, 'node_modules', 'pacchetto', 'indice.js'), 'x');

    const esito = await costruisciElencoProfondo({ radice: base });
    assert.deepEqual(esito.percorsi, ['radice.md', 'src/app.mjs', 'src/dentro/profondo.mjs']);
    assert.equal(esito.percorsi.some((p) => p.includes('\\')), false, 'mai un separatore di Windows dentro il prompt');
    assert.equal(esito.fileEsclusi, 1);
    assert.equal(esito.dettaglio.perNome, 1);
    assert.equal(esito.troncato, false);
    assert.equal(TETTO_FILE_PREDEFINITO, 1500);

    // due giri sul disco vero: stessa stringa, byte per byte
    const ancora = await costruisciElencoProfondo({ radice: base });
    assert.equal(testoElenco(esito.percorsi, { ...esito, radice: base }), testoElenco(ancora.percorsi, { ...ancora, radice: base }));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
