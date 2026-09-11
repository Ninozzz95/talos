import assert from 'node:assert/strict';
import test from 'node:test';

import {
  contestoDelProgetto,
  segnalaFileCambiati,
  dimenticaTuttiGliElenchi,
  VALIDITA_MS,
} from '../src/contesto-del-progetto.mjs';

/*
 * ⛔⛔ P-13 — il contesto stabile del progetto.
 *
 * La prova che conta di più qui non è «costruisce un elenco»: è che **due giri di fila ricevono la
 * STESSA identica stringa**. La cache dei fornitori funziona per prefisso esatto — un elenco che
 * cambia fra un giro e l'altro non costa un sesto: costa pieno, ogni volta. Misurato il 22/08: tre
 * chiamate sullo stesso prefisso da 16.811 token, la terza ne legge 16.768 dalla cache e costa 5,9
 * volte meno.
 */

/** Un albero finto: percorso → contenuto (le cartelle sono `null`). */
function fsFinto(albero) {
  const dirs = new Map();
  for (const percorso of Object.keys(albero)) {
    const pezzi = percorso.split('/');
    for (let i = 0; i < pezzi.length; i += 1) {
      const genitore = pezzi.slice(0, i).join('/') || '.';
      const nome = pezzi[i];
      const eDir = i < pezzi.length - 1;
      if (!dirs.has(genitore)) dirs.set(genitore, []);
      if (!dirs.get(genitore).some((v) => v.name === nome)) {
        dirs.get(genitore).push({ name: nome, isDirectory: () => eDir, isFile: () => !eDir, isSymbolicLink: () => false });
      }
    }
  }
  const normalizza = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '') || '.';
  /* ⛔ La forma è `{readdir, realpath, stat}` piatta — non `fs.promises`. L'ho verificata nel
     modulo (`elenco-profondo.mjs:207`) dopo che due prove sono cadute: un finto che non imita il
     vero misura il finto, ed è la terza volta oggi che questa lezione si presenta. */
  return {
    async readdir(dove) {
      const chiave = normalizza(dove) === 'radice' ? '.' : normalizza(dove).replace(/^radice\//, '');
      const voci = dirs.get(chiave === '' ? '.' : chiave);
      if (!voci) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return voci;
    },
    async stat() { return { isDirectory: () => false, isFile: () => true, size: 10 }; },
    async realpath(p) { return p; },
  };
}

const ALBERO = {
  'src/uno.mjs': '',
  'src/dentro/due.mjs': '',
  'tests/tre.test.mjs': '',
};

test.beforeEach(() => { dimenticaTuttiGliElenchi(); });

test('P-13: senza cartella non si inventa niente', async () => {
  assert.equal(await contestoDelProgetto({}), null);
  assert.equal(await contestoDelProgetto({ cartella: '' }), null);
  assert.equal(await contestoDelProgetto({ cartella: '   ' }), null);
});

/*
 * ⛔ LA PROVA CHE GIUSTIFICA TUTTO IL MODULO. Se questa cade, l'elenco costa sei volte tanto e
 * nessun test se ne accorge: il conto lo vedrebbe solo l'owner, sulla fattura.
 */
test('P-13: due giri di fila ricevono la STESSA stringa, e il secondo è riusato', async () => {
  const deps = { fs: fsFinto(ALBERO) };
  const primo = await contestoDelProgetto({ cartella: 'radice', deps });
  const secondo = await contestoDelProgetto({ cartella: 'radice', deps });
  assert.ok(primo, 'il primo giro deve produrre un contesto');
  assert.equal(primo.riusato, false);
  assert.equal(secondo.riusato, true, '⛔ se questo è false, la cache del fornitore non prende mai');
  assert.equal(secondo.testo, primo.testo, '⛔ un solo carattere di differenza azzera il riuso del prefisso');
});

test('P-13: quando i file cambiano davvero, l’elenco si rifà', async () => {
  const deps = { fs: fsFinto(ALBERO) };
  await contestoDelProgetto({ cartella: 'radice', deps });
  assert.equal(segnalaFileCambiati('radice'), true, 'la cartella era in memoria');
  const dopo = await contestoDelProgetto({ cartella: 'radice', deps });
  assert.equal(dopo.riusato, false, 'dopo un cambiamento vero si ricostruisce');
});

test('P-13, AL CONTRARIO: segnalare una cartella mai vista non rompe niente', async () => {
  assert.equal(segnalaFileCambiati('mai-vista'), false);
  assert.equal(segnalaFileCambiati(null), false);
  assert.equal(segnalaFileCambiati(42), false);
});

test('P-13: l’elenco scade da sé, se nessuno dice che i file sono cambiati', async () => {
  const deps = { fs: fsFinto(ALBERO), adesso: () => 1_000_000 };
  const primo = await contestoDelProgetto({ cartella: 'radice', deps });
  assert.equal(primo.riusato, false);

  const subito = await contestoDelProgetto({ cartella: 'radice', deps: { ...deps, adesso: () => 1_000_000 + VALIDITA_MS - 1 } });
  assert.equal(subito.riusato, true, 'un istante prima della scadenza vale ancora');

  const dopo = await contestoDelProgetto({ cartella: 'radice', deps: { ...deps, adesso: () => 1_000_000 + VALIDITA_MS + 1 } });
  assert.equal(dopo.riusato, false, '⛔ senza scadenza un segnale perso lascerebbe l’elenco falso per sempre');
});

/*
 * ⛔ Un file di regole illeggibile NON deve far sparire l'elenco: il modello vedrebbe zero file,
 * cioè esattamente il difetto che P-13 cura, causato dalla cura stessa.
 */
test('P-13, AL CONTRARIO: se il filtro esplode, l’elenco esce lo stesso', async () => {
  const deps = { fs: fsFinto(ALBERO) };
  const esito = await contestoDelProgetto({
    cartella: 'radice',
    creaFiltro: async () => { throw new Error('.gitignore illeggibile'); },
    deps,
  });
  assert.ok(esito, '⛔ nessun preambolo per colpa di un file di regole sarebbe la cura che rifà la malattia');
  /* ⛔ BC-07 (11/09): `percorsi` non esiste più — il preambolo non è un elenco di file, è la
     MAPPA DELLE CARTELLE. L'intento della prova è invariato: senza filtro si vede QUALCOSA IN PIÙ,
     mai niente. Qui si guarda la mappa, che è ciò che ha preso il posto dell'elenco. */
  assert.ok(esito.blocchi.mappa, 'senza filtro la mappa resta, con qualche cartella in piu');
  assert.ok(esito.blocchi.mappa.cartelle > 0);
});

test('P-13, AL CONTRARIO: una cartella che non si legge dà null, non un’eccezione', async () => {
  const esito = await contestoDelProgetto({ cartella: 'sparita', deps: { fs: fsFinto({}) } });
  assert.equal(esito, null, 'un elenco mancante non deve far cadere l’avvio di una sessione');
});

test('P-13: il costo viene dichiarato, col suo metodo', async () => {
  const deps = { fs: fsFinto(ALBERO) };
  const esito = await contestoDelProgetto({ cartella: 'radice', finestra: 200_000, deps });
  assert.ok(Number.isFinite(esito.costo.token), 'un costo senza numero non è un costo');
  assert.ok(['contato', 'stimato'].includes(esito.costo.metodo), `metodo inatteso: ${esito.costo.metodo}`);
  assert.ok(esito.costo.percentualeFinestra > 0, 'con una finestra nota si dice quanto pesa');
});

test('P-13, AL CONTRARIO: senza finestra non si inventa una percentuale', async () => {
  const deps = { fs: fsFinto(ALBERO) };
  const esito = await contestoDelProgetto({ cartella: 'radice', deps });
  assert.equal(esito.costo.percentualeFinestra, null, '⛔ «0%» o «100%» sarebbero due bugie diverse');
});

test('P-13: due cartelle diverse hanno due elenchi diversi, e non si scambiano', async () => {
  const deps = { fs: fsFinto(ALBERO) };
  const a = await contestoDelProgetto({ cartella: 'radice', deps });
  const b = await contestoDelProgetto({ cartella: 'radice/src', deps });
  assert.notEqual(a.testo, b.testo);
  const aDiNuovo = await contestoDelProgetto({ cartella: 'radice', deps });
  assert.equal(aDiNuovo.testo, a.testo, 'la seconda cartella non ha sporcato la prima');
  assert.equal(aDiNuovo.riusato, true);
});

/*
 * ⛔⛔ IL BUG CHE QUESTO CATCH HA GIÀ NASCOSTO UNA VOLTA (10/09).
 *
 * `agent-service.mjs` passava la cartella NUDA a `creaFiltroGitignore`, che vuole `{radice}`. Node
 * lanciava ERR_INVALID_ARG_TYPE, il catch qui sopra lo scambiava per un file di regole illeggibile,
 * e l'elenco usciva SENZA FILTRO: 1500 percorsi troncati e 25.163 token invece di 629 e 6.518 —
 * quattro volte il costo, con dentro i file di log, e nessun errore da nessuna parte.
 * ⇒ Un `.gitignore` illeggibile si degrada in silenzio; un errore di CONTRATTO deve farsi sentire.
 */
test('P-13, AL CONTRARIO: un errore di CONTRATTO non si degrada in silenzio', async () => {
  const deps = { fs: fsFinto(ALBERO) };
  await assert.rejects(
    () => contestoDelProgetto({
      cartella: 'radice',
      creaFiltro: async () => { const e = new TypeError('radice non è una stringa'); e.code = 'ERR_INVALID_ARG_TYPE'; throw e; },
      deps,
    }),
    /radice/,
    '⛔ inghiottire questo errore è come è nato il difetto da 25.163 token',
  );
});
