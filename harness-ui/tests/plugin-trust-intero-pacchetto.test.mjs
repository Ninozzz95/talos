/**
 * ⛔⛔⛔ CLI-REQ-02 (17/09/2026) — LA FIDUCIA DI UN PLUGIN COPRE TUTTO IL PACCHETTO.
 *
 * Fino a oggi `caricaPlugin` calcolava `hash` sul solo TESTO di `plugin.json`, e
 * `verificaTrustPlugin` confrontava quello. Il manifesto però non fa niente: quello che gira è il
 * comando che il manifesto NOMINA, e quel file non entrava nell'impronta. ⇒ Un plugin approvato
 * una volta continuava a girare dopo che il suo codice era stato sostituito: un `git pull`, un
 * cambio di ramo, il commit di un altro. Misurato dalla corsia della CLI il 17/09/2026 eseguendo
 * il codice: dopo lo scambio di `run.js` l'hash ricalcolato era IDENTICO e il cancello diceva sì.
 *
 * ⛔ Queste prove girano su cartelle temporanee VERE, non su finte: il difetto vive nel
 * filesystem (ordine delle voci, collegamenti, tetto) e una finta non l'avrebbe mai mostrato.
 * La pulizia passa da `rimuoviCartellaDiProva` (cancello BC-09), mai da un `rmSync` nudo.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import {
  caricaPlugin,
  fidaPlugin,
  idPluginValido,
  MAX_BYTE_FILE_PLUGIN,
  MAX_BYTE_PACCHETTO_PLUGIN,
  MAX_FILE_PACCHETTO_PLUGIN,
  PluginRegistryError,
  SCHEMA_TRUST_PLUGIN,
  statoTrustPlugin,
  verificaTrustPlugin,
} from '../src/plugin-registry.mjs';
import { preparaToolPluginPerSessione } from '../src/plugin-session.mjs';
import { parseProcessCommand } from '../src/process-policy.mjs';

const MANIFESTO = {
  nome: 'demo',
  descrizione: 'Un plugin che esegue un file del proprio pacchetto.',
  hooks: [{ id: 'audit', eventi: ['pre_tool_call'], comando: 'node .harness-ui-plugins/demo/audit.js' }],
  tools: [{ nome: 'saluta', descrizione: 'Dice ciao', comando: 'node .harness-ui-plugins/demo/run.js' }],
};

/** Un workspace vero con un pacchetto `demo` fatto di manifesto + due file di codice. */
function workspaceConPacchetto({ payload = 'payload v1, il codice che l\'owner ha approvato' } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-plugin-pacchetto-'));
  const pacchetto = join(cartella, '.harness-ui-plugins', 'demo');
  mkdirSync(pacchetto, { recursive: true });
  writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify(MANIFESTO), 'utf8');
  writeFileSync(join(pacchetto, 'run.js'), `console.log(${JSON.stringify(payload)});\n`, 'utf8');
  writeFileSync(join(pacchetto, 'audit.js'), 'console.log("{}");\n', 'utf8');
  /*
   * ⛔ Un file che il manifesto NON nomina. Serve per provare che l'impronta copre tutto il
   * pacchetto e non solo ciò che si esegue — e va tenuto distinto da `run.js`/`audit.js`, perché
   * dal secondo giro cancellare un file NOMINATO dal manifesto è un'altra cosa: il plugin
   * diventa un guasto dichiarato, non un plugin con la fiducia scaduta.
   */
  writeFileSync(join(pacchetto, 'dati.txt'), 'non lo esegue nessuno\n', 'utf8');
  /* ⛔ Un file in una SOTTOCARTELLA: serve alla grammatica del quarto giro (`node sub/dentro.js`). */
  mkdirSync(join(pacchetto, 'sub'), { recursive: true });
  writeFileSync(join(pacchetto, 'sub', 'dentro.js'), 'console.log("dentro");\n', 'utf8');
  return { cartella, pacchetto };
}

async function hashDi(cartella) {
  const { plugin } = await caricaPlugin({ cartella });
  return plugin.find((p) => p.id === 'demo').hash;
}

/** Approva il pacchetto com'è ADESSO, e torna la cartella di fiducia. */
async function approvaAdesso(cartella) {
  const cartellaTrust = mkdtempSync(join(tmpdir(), 'talos-plugin-trust-'));
  await fidaPlugin({ cartellaTrust, pluginId: 'demo', hash: await hashDi(cartella) });
  return cartellaTrust;
}

/** `true` se il pacchetto com'è adesso risulta ancora fidato con quella cartella di fiducia. */
async function ancoraFidato(cartella, cartellaTrust) {
  return verificaTrustPlugin({ cartellaTrust, pluginId: 'demo', hash: await hashDi(cartella) });
}

test('⛔⛔⛔ CLI-REQ-02 — riscrivere UN BYTE di run.js dopo l\'approvazione toglie la fiducia, e il cancello non offre più niente', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  const cartellaTrust = await approvaAdesso(cartella);
  try {
    // Al contrario prima: finché non cambia niente, il plugin è fidato e OFFRE.
    assert.equal(await ancoraFidato(cartella, cartellaTrust), true, 'senza modifiche deve restare fidato');
    const prima = await preparaToolPluginPerSessione({ cartella, cartellaTrust });
    assert.equal(prima.toolPlugin.length, 1);
    assert.equal(prima.hookPlugin.length, 1);

    // Lo scambio: il manifesto non si tocca, cambia solo il codice che il manifesto esegue.
    writeFileSync(join(pacchetto, 'run.js'), 'console.log("payload v2, scambiato dopo la fiducia, mai approvato");\n', 'utf8');

    assert.equal(await ancoraFidato(cartella, cartellaTrust), false, 'il codice è cambiato: la fiducia non vale più');
    const dopo = await preparaToolPluginPerSessione({ cartella, cartellaTrust });
    assert.equal(dopo.toolPlugin.length, 0, 'zero tool offerti');
    assert.equal(dopo.hookPlugin.length, 0, 'zero hook armati');
  } finally {
    rimuoviCartellaDiProva(cartella);
    rimuoviCartellaDiProva(cartellaTrust);
  }
});

test('⛔⛔⛔ CLI-REQ-02 — AGGIUNGERE un file al pacchetto dopo l\'approvazione toglie la fiducia', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  const cartellaTrust = await approvaAdesso(cartella);
  try {
    writeFileSync(join(pacchetto, 'aggiunto.js'), 'console.log("mai approvato");\n', 'utf8');
    assert.equal(await ancoraFidato(cartella, cartellaTrust), false);
  } finally {
    rimuoviCartellaDiProva(cartella);
    rimuoviCartellaDiProva(cartellaTrust);
  }
});

test('⛔⛔⛔ CLI-REQ-02 — CANCELLARE un file che non è il manifesto toglie la fiducia', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  const cartellaTrust = await approvaAdesso(cartella);
  try {
    rmSync(join(pacchetto, 'dati.txt')); // un singolo file, non una cartella: fuori dal cancello BC-09
    assert.equal(await ancoraFidato(cartella, cartellaTrust), false);
  } finally {
    rimuoviCartellaDiProva(cartella);
    rimuoviCartellaDiProva(cartellaTrust);
  }
});

test('⛔⛔ A1 — cancellare un file che il manifesto NOMINA è un guasto dichiarato, non una sparizione', async () => {
  /*
   * ⛔ Distinzione nata scrivendo la prova sopra: dal secondo giro il comando deve puntare a un
   * file che l'impronta copre davvero. Se quel file sparisce, il plugin non può essere offerto —
   * e la differenza fra «non lo vedo più» e «non lo vedo più PERCHÉ» è tutto ciò che la persona
   * ha per capire cosa è successo.
   */
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    rmSync(join(pacchetto, 'run.js'));
    const { plugin, falliti } = await caricaPlugin({ cartella });
    assert.deepEqual(plugin, []);
    assert.equal(falliti[0].codice, 'PLUGIN_COMANDO_FUORI_DAL_PACCHETTO');
    assert.ok(falliti[0].frase.length > 0);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ CLI-REQ-02 — un file in una SOTTOCARTELLA del pacchetto conta quanto uno in cima', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  const profonda = join(pacchetto, 'lib', 'interno');
  mkdirSync(profonda, { recursive: true });
  writeFileSync(join(profonda, 'aiuto.js'), 'module.exports = 1;\n', 'utf8');
  const cartellaTrust = await approvaAdesso(cartella);
  try {
    writeFileSync(join(profonda, 'aiuto.js'), 'module.exports = 2;\n', 'utf8');
    assert.equal(await ancoraFidato(cartella, cartellaTrust), false);
  } finally {
    rimuoviCartellaDiProva(cartella);
    rimuoviCartellaDiProva(cartellaTrust);
  }
});

test('⭐ CLI-REQ-02 resta verde — un carattere nel manifesto invalida la fiducia come prima', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  const cartellaTrust = await approvaAdesso(cartella);
  try {
    writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({ ...MANIFESTO, descrizione: 'Un plugin che esegue un file del proprio pacchetto..' }), 'utf8');
    assert.equal(await ancoraFidato(cartella, cartellaTrust), false);
  } finally {
    rimuoviCartellaDiProva(cartella);
    rimuoviCartellaDiProva(cartellaTrust);
  }
});

test('⭐ CLI-REQ-02 resta verde — due pacchetti IDENTICI in cartelle diverse hanno lo stesso hash (plugin-registry.test.mjs:75-89)', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-plugin-gemelli-'));
  try {
    for (const id of ['uno', 'due']) {
      const dove = join(cartella, '.harness-ui-plugins', id);
      mkdirSync(join(dove, 'lib'), { recursive: true });
      writeFileSync(join(dove, 'plugin.json'), JSON.stringify({ nome: 'gemello', descrizione: 'identico' }), 'utf8');
      writeFileSync(join(dove, 'run.js'), 'console.log(1);\n', 'utf8');
      writeFileSync(join(dove, 'lib', 'a.js'), 'module.exports = 1;\n', 'utf8');
    }
    const { plugin } = await caricaPlugin({ cartella });
    assert.equal(plugin.length, 2);
    assert.equal(plugin[0].hash, plugin[1].hash, 'il percorso è RELATIVO alla radice del pacchetto');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

/*
 * ⛔⛔⛔ Le giunzioni di Windows. MISURATO su questa macchina (Windows 11, Node v24.18.0,
 * 17/09/2026, sonda nello scratchpad di sessione): un collegamento creato con
 * `symlink(bersaglio, percorso, 'junction')` viene visto da `readdir(withFileTypes)` come
 * `isSymbolicLink() === true` e `isDirectory() === false`; un symlink VERO ('dir' o 'file')
 * fallisce con EPERM senza la modalità sviluppatore o i privilegi di amministratore.
 * ⇒ La giunzione è la forma che un utente qualunque riesce a creare su Windows, ed è quella che
 * questa prova usa. Se nemmeno la giunzione si crea, la prova si SALTA con il motivo dichiarato,
 * mai un verde silenzioso.
 */
test('⛔⛔⛔ CLI-REQ-02 — una GIUNZIONE dentro il pacchetto è RIFIUTATA per nome, e il cancello degrada a «nessun plugin»', async (t) => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  const fuori = mkdtempSync(join(tmpdir(), 'talos-plugin-fuori-'));
  const cartellaTrust = await approvaAdesso(cartella);
  try {
    writeFileSync(join(fuori, 'segreto.js'), 'console.log("fuori dal pacchetto");\n', 'utf8');
    try {
      symlinkSync(fuori, join(pacchetto, 'scorciatoia'), 'junction');
    } catch (errore) {
      t.skip(`giunzione non creabile su questa macchina (${errore.code}): la prova vuole un collegamento vero, non una finta`);
      return;
    }
    /*
     * ⛔ SECONDO GIRO (A3): il guasto NON è più un rifiuto dell'intero caricamento — è un guasto
     * di QUESTO pacchetto, con la sua frase. Prima `caricaPlugin` lanciava e spegneva ogni
     * plugin del workspace, anche quelli sani, senza dirlo a nessuno.
     */
    const { plugin, falliti } = await caricaPlugin({ cartella });
    assert.deepEqual(plugin, [], 'il pacchetto con la giunzione non si offre');
    assert.equal(falliti.length, 1);
    assert.equal(falliti[0].pluginId, 'demo');
    assert.equal(falliti[0].codice, 'PLUGIN_PACKAGE_SYMLINK_UNSUPPORTED');
    assert.match(falliti[0].frase, /collegamento/i);

    // Il cancello non esplode: degrada a «nessun plugin», che è il suo comportamento di sempre.
    const esito = await preparaToolPluginPerSessione({ cartella, cartellaTrust });
    assert.deepEqual(esito.toolPlugin, []);
    assert.deepEqual(esito.hookPlugin, []);
  } finally {
    rimuoviCartellaDiProva(cartella);
    rimuoviCartellaDiProva(fuori);
    rimuoviCartellaDiProva(cartellaTrust);
  }
});

test('⛔⛔⛔ CLI-REQ-02 — oltre il tetto di file il pacchetto è RIFIUTATO per nome, mai un hash parziale', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    for (let i = 0; i < 5; i += 1) writeFileSync(join(pacchetto, `extra-${i}.js`), `// ${i}\n`, 'utf8');
    const oltre = await caricaPlugin({ cartella }, { maxFilePacchetto: 3 });
    assert.deepEqual(oltre.plugin, [], 'mai un hash parziale');
    assert.equal(oltre.falliti[0].codice, 'PLUGIN_PACKAGE_TOO_LARGE');
    assert.ok(oltre.falliti[0].frase.length > 0);
    // AL CONTRARIO: sotto il tetto lo stesso pacchetto si carica senza storie.
    const { plugin, falliti } = await caricaPlugin({ cartella }, { maxFilePacchetto: 100 });
    assert.equal(plugin.length, 1);
    assert.equal(plugin[0].hash.length, 64);
    assert.deepEqual(falliti, []);
    assert.equal(MAX_FILE_PACCHETTO_PLUGIN, 10_000, 'il tetto vero è quello della corsia della CLI');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

/*
 * ⛔⛔⛔ CLI-REQ-02 — LE TRE FORME DEL «NO», che senza il marcatore erano indistinguibili.
 *
 * Il costo accettato dall'owner è che ogni plugin già approvato va riapprovato. Senza `schema`,
 * quella riapprovazione arriverebbe alla persona con lo stesso aspetto di una manomissione: il
 * risultato giusto (un costo nostro, dichiarato) e quello sbagliato (qualcuno ti ha cambiato il
 * codice sotto) coinciderebbero a schermo. ⇒ Tre stati con tre frasi, e nessun nome tecnico
 * dentro la frase.
 */
test('⛔⛔⛔ CLI-REQ-02 — un archivio scritto con la REGOLA PRECEDENTE si distingue da un contenuto cambiato', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  const cartellaTrust = mkdtempSync(join(tmpdir(), 'talos-plugin-trust-'));
  try {
    const hash = await hashDi(cartella);

    // 1 · mai approvato: nessun archivio.
    const mai = await statoTrustPlugin({ cartellaTrust, pluginId: 'demo', hash });
    assert.deepEqual(mai, { fidato: false, motivo: 'mai-approvato', frase: null });

    // 2 · la forma che scriveva `fidaPlugin` PRIMA di oggi: hash, data, nessuno `schema`.
    writeFileSync(join(cartellaTrust, 'demo.json'), JSON.stringify({ hash, fidatoIl: new Date().toISOString() }), 'utf8');
    const vecchio = await statoTrustPlugin({ cartellaTrust, pluginId: 'demo', hash });
    assert.equal(vecchio.fidato, false, 'la regola precedente non autorizza: fallisce CHIUSO');
    assert.equal(vecchio.motivo, 'regola-precedente');
    assert.match(vecchio.frase, /approvalo di nuovo/i);
    assert.doesNotMatch(vecchio.frase, /hash|schema|sha256|plugin\.json/i, 'niente nomi tecnici nella frase');

    // 3 · approvato con la regola di oggi, poi il codice cambia.
    await fidaPlugin({ cartellaTrust, pluginId: 'demo', hash });
    assert.equal((await statoTrustPlugin({ cartellaTrust, pluginId: 'demo', hash })).motivo, 'fidato');
    writeFileSync(join(pacchetto, 'run.js'), 'console.log("v2");\n', 'utf8');
    const cambiato = await statoTrustPlugin({ cartellaTrust, pluginId: 'demo', hash: await hashDi(cartella) });
    assert.equal(cambiato.fidato, false);
    assert.equal(cambiato.motivo, 'contenuto-cambiato');
    assert.equal(cambiato.frase, 'Il contenuto di questo plugin è cambiato da quando l\'hai approvato.');
    assert.notEqual(cambiato.frase, vecchio.frase, 'le due frasi devono essere DIVERSE, è tutto il punto');
  } finally {
    rimuoviCartellaDiProva(cartella);
    rimuoviCartellaDiProva(cartellaTrust);
  }
});

test('⛔⛔ CLI-REQ-02 — fidaPlugin scrive lo schema, e verificaTrustPlugin resta un BOOLEANO', async () => {
  const cartellaTrust = mkdtempSync(join(tmpdir(), 'talos-plugin-trust-'));
  try {
    await fidaPlugin({ cartellaTrust, pluginId: 'demo', hash: 'a'.repeat(64) });
    const scritto = JSON.parse(readFileSync(join(cartellaTrust, 'demo.json'), 'utf8'));
    assert.equal(scritto.schema, SCHEMA_TRUST_PLUGIN);
    assert.equal(scritto.hash, 'a'.repeat(64));
    /*
     * ⛔ Il tipo conta: `plugin-session.mjs:135` e `session-registry.mjs:4965` scrivono
     * `if (!fidato)`. Se questa tornasse un oggetto, ogni plugin risulterebbe fidato — un
     * oggetto è sempre vero — e il cancello sarebbe spento senza che niente diventasse rosso.
     */
    const esito = await verificaTrustPlugin({ cartellaTrust, pluginId: 'demo', hash: 'a'.repeat(64) });
    assert.equal(typeof esito, 'boolean');
    assert.equal(esito, true);
    assert.equal(await verificaTrustPlugin({ cartellaTrust, pluginId: 'demo', hash: 'b'.repeat(64) }), false);
  } finally {
    rimuoviCartellaDiProva(cartellaTrust);
  }
});

test('⛔ CLI-REQ-02 AL CONTRARIO — un archivio di fiducia illeggibile non autorizza e non accusa nessuno', async () => {
  const cartellaTrust = mkdtempSync(join(tmpdir(), 'talos-plugin-trust-'));
  try {
    writeFileSync(join(cartellaTrust, 'demo.json'), '{ non e json', 'utf8');
    const stato = await statoTrustPlugin({ cartellaTrust, pluginId: 'demo', hash: 'a'.repeat(64) });
    assert.deepEqual(stato, { fidato: false, motivo: 'mai-approvato', frase: null });
  } finally {
    rimuoviCartellaDiProva(cartellaTrust);
  }
});

/*
 * ⛔⛔⛔ SECONDO GIRO (17/09/2026) — LE CINQUE BOCCIATURE DEL REVISORE.
 *
 * L'impronta sull'intero pacchetto era giusta e INSUFFICIENTE. Il revisore ha misurato, sul
 * codice curato, che il file che il plugin ESEGUE può stare fuori dal pacchetto e quindi fuori
 * dall'impronta; che la fiducia si verificava solo all'avvio della sessione; che un pacchetto
 * guasto spegneva TUTTI i plugin in silenzio; e che non c'era nessun tetto di BYTE.
 */

const MANIFESTO_FUORI = {
  nome: 'demo',
  descrizione: 'Un plugin che esegue un file FUORI dal proprio pacchetto.',
  hooks: [{ id: 'audit', eventi: ['pre_tool_call'], comando: 'node strumenti/audit.js' }],
  tools: [{ nome: 'saluta', descrizione: 'Dice ciao', comando: 'node strumenti/aiuto.js' }],
};

/** Un workspace col pacchetto `demo` e uno script FUORI dal pacchetto, nominato dal manifesto. */
function workspaceConScriptFuori() {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-plugin-fuori-'));
  const pacchetto = join(cartella, '.harness-ui-plugins', 'demo');
  mkdirSync(pacchetto, { recursive: true });
  writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify(MANIFESTO_FUORI), 'utf8');
  const strumenti = join(cartella, 'strumenti');
  mkdirSync(strumenti, { recursive: true });
  writeFileSync(join(strumenti, 'aiuto.js'), 'console.log("aiuto-BUONO");\n', 'utf8');
  writeFileSync(join(strumenti, 'audit.js'), 'console.log("{}");\n', 'utf8');
  return { cartella, pacchetto, strumenti };
}

test('⛔⛔⛔ A1 — un manifesto che NOMINA un file fuori dal pacchetto è RIFIUTATO al caricamento, con una frase umana', async () => {
  const { cartella } = workspaceConScriptFuori();
  try {
    /*
     * ⛔ Il difetto, misurato dal revisore sul codice del primo giro: l'impronta copriva il
     * pacchetto, ma `plugin-session.mjs:89` esegue con il WORKSPACE come cartella di lavoro,
     * quindi `node strumenti/aiuto.js` gira un file che nell'impronta non c'è. Scambiandolo, la
     * fiducia restava valida e il payload nuovo girava.
     */
    const { plugin, falliti } = await caricaPlugin({ cartella });
    assert.deepEqual(plugin.map((p) => p.id), [], 'un pacchetto che esce da sé non si offre');
    assert.equal(falliti.length, 1, 'e non sparisce in silenzio: compare fra i falliti');
    assert.equal(falliti[0].pluginId, 'demo');
    assert.equal(falliti[0].codice, 'PLUGIN_COMANDO_FUORI_DAL_PACCHETTO');
    assert.match(falliti[0].frase, /fuori dalla sua cartella/i);
    assert.doesNotMatch(falliti[0].frase, /sha256|hash|PLUGIN_[A-Z_]+/, 'niente nomi tecnici nella frase');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ A1 — lo script del pacchetto si risolve contro il PACCHETTO, non contro il workspace', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    const { plugin } = await caricaPlugin({ cartella });
    const demo = plugin.find((p) => p.id === 'demo');
    /*
     * ⛔ La forma dichiarata nel manifesto resta leggibile, ma il comando che si esegue nomina il
     * file con un percorso ASSOLUTO dentro il pacchetto: così la cartella di lavoro (il workspace,
     * che serve agli attrezzi) non decide più QUALE file gira.
     */
    assert.match(demo.tools[0].comando, /^node /);
    const percorso = demo.tools[0].comando.slice('node '.length).replace(/^"|"$/g, '');
    assert.equal(resolve(percorso), resolve(join(pacchetto, 'run.js')));
    assert.ok(!percorso.includes('\\'), 'mai backslash nel comando riscritto: `parseProcessCommand` li tratta come escape');

    // E la forma abbreviata `run.js`, relativa al pacchetto, funziona come quella lunga.
    writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
      ...MANIFESTO, tools: [{ nome: 'saluta', descrizione: 'Dice ciao', comando: 'node run.js' }], hooks: [],
    }), 'utf8');
    const corta = (await caricaPlugin({ cartella })).plugin.find((p) => p.id === 'demo');
    assert.equal(resolve(corta.tools[0].comando.slice('node '.length).replace(/^"|"$/g, '')), resolve(join(pacchetto, 'run.js')));
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ A1 — un `..` che esce dal pacchetto è rifiutato anche se il file esiste', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    writeFileSync(join(cartella, 'fuori.js'), 'console.log("fuori");\n', 'utf8');
    writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
      ...MANIFESTO, hooks: [], tools: [{ nome: 'saluta', descrizione: 'd', comando: 'node ../../fuori.js' }],
    }), 'utf8');
    const { plugin, falliti } = await caricaPlugin({ cartella });
    assert.deepEqual(plugin, []);
    assert.equal(falliti[0].codice, 'PLUGIN_COMANDO_FUORI_DAL_PACCHETTO');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ A3 — un pacchetto GUASTO non spegne gli altri: gli altri restano, e il guasto si vede', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-plugin-misto-'));
  const fuori = mkdtempSync(join(tmpdir(), 'talos-plugin-bersaglio-'));
  try {
    // Un pacchetto SANO.
    const sano = join(cartella, '.harness-ui-plugins', 'sano');
    mkdirSync(sano, { recursive: true });
    writeFileSync(join(sano, 'plugin.json'), JSON.stringify({ nome: 'sano', descrizione: 'va bene', tools: [{ nome: 't', descrizione: 'd', comando: 'node run.js' }] }), 'utf8');
    writeFileSync(join(sano, 'run.js'), 'console.log(1);\n', 'utf8');
    // E uno GUASTO: una giunzione dentro il pacchetto.
    const guasto = join(cartella, '.harness-ui-plugins', 'demo');
    mkdirSync(guasto, { recursive: true });
    writeFileSync(join(guasto, 'plugin.json'), JSON.stringify({ nome: 'demo', descrizione: 'guasto' }), 'utf8');
    try {
      symlinkSync(fuori, join(guasto, 'scorciatoia'), 'junction');
    } catch (errore) {
      return; // senza giunzione questa prova non ha oggetto: vale quella dedicata, che si salta da sola
    }

    const { plugin, falliti } = await caricaPlugin({ cartella });
    assert.deepEqual(plugin.map((p) => p.id), ['sano'], 'il pacchetto sano continua a essere offerto');
    assert.equal(falliti.length, 1);
    assert.equal(falliti[0].pluginId, 'demo');
    assert.equal(falliti[0].codice, 'PLUGIN_PACKAGE_SYMLINK_UNSUPPORTED');
    assert.ok(falliti[0].frase.length > 0, 'un guasto ha sempre una frase da mostrare');
  } finally {
    rimuoviCartellaDiProva(cartella);
    rimuoviCartellaDiProva(fuori);
  }
});

test('⛔⛔ A3 — un pacchetto oltre il tetto dei file è un guasto SUO, non di tutti', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-plugin-grosso-'));
  try {
    const sano = join(cartella, '.harness-ui-plugins', 'sano');
    mkdirSync(sano, { recursive: true });
    writeFileSync(join(sano, 'plugin.json'), JSON.stringify({ nome: 'sano', descrizione: 'va bene' }), 'utf8');
    const grosso = join(cartella, '.harness-ui-plugins', 'grosso');
    mkdirSync(grosso, { recursive: true });
    writeFileSync(join(grosso, 'plugin.json'), JSON.stringify({ nome: 'grosso', descrizione: 'troppi file' }), 'utf8');
    for (let i = 0; i < 6; i += 1) writeFileSync(join(grosso, `f-${i}.js`), `// ${i}\n`, 'utf8');

    const { plugin, falliti } = await caricaPlugin({ cartella }, { maxFilePacchetto: 3 });
    assert.deepEqual(plugin.map((p) => p.id), ['sano']);
    assert.equal(falliti.length, 1);
    assert.equal(falliti[0].pluginId, 'grosso');
    assert.equal(falliti[0].codice, 'PLUGIN_PACKAGE_TOO_LARGE');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ A4 — c\'è un tetto di BYTE, per file e per pacchetto, e fallisce CHIUSO', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    writeFileSync(join(pacchetto, 'grosso.bin'), Buffer.alloc(4096, 7));
    // Per FILE.
    const perFile = await caricaPlugin({ cartella }, { maxBytePerFile: 1024 });
    assert.deepEqual(perFile.plugin, []);
    assert.equal(perFile.falliti[0].codice, 'PLUGIN_PACKAGE_FILE_TOO_LARGE');
    // Per PACCHETTO.
    const perPacchetto = await caricaPlugin({ cartella }, { maxBytePacchetto: 2048 });
    assert.deepEqual(perPacchetto.plugin, []);
    assert.equal(perPacchetto.falliti[0].codice, 'PLUGIN_PACKAGE_BYTES_TOO_LARGE');
    // AL CONTRARIO: con i tetti veri lo stesso pacchetto si carica.
    const normale = await caricaPlugin({ cartella });
    assert.equal(normale.plugin.length, 1);
    assert.equal(normale.falliti.length, 0);
    assert.ok(MAX_BYTE_FILE_PLUGIN > 0 && MAX_BYTE_PACCHETTO_PLUGIN > MAX_BYTE_FILE_PLUGIN);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ A5 — il NOME del file entra nell\'impronta: rinominare un file la cambia', async () => {
  /*
   * ⛔ Il revisore ha misurato che togliendo `voce.relativo` dall'impronta 372 prove su 372
   * restavano verdi: il nome non era coperto da NESSUNA prova. Senza il nome, scambiare due file
   * fra loro — o rinominare quello che il manifesto esegue — non cambierebbe niente.
   */
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    const prima = (await caricaPlugin({ cartella })).plugin[0].hash;
    // ⛔ Si rinomina un file che il manifesto NON nomina: qui si misura il nome, non il comando.
    const contenuto = readFileSync(join(pacchetto, 'dati.txt'));
    rmSync(join(pacchetto, 'dati.txt'));
    writeFileSync(join(pacchetto, 'dati2.txt'), contenuto);
    const dopo = (await caricaPlugin({ cartella })).plugin[0].hash;
    assert.notEqual(prima, dopo, 'stessi byte, nome diverso ⇒ impronta diversa');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐ A5 — i due casi NON sfruttabili, misurati e dichiarati: cartella vuota e flusso alternativo NTFS', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    const prima = await hashDi(cartella);
    /*
     * ⛔ Una cartella VUOTA non cambia l'impronta: la camminata imprime i FILE. Non è sfruttabile
     * — una cartella vuota non contiene codice da eseguire — ed è scritto invece che scoperto.
     */
    mkdirSync(join(pacchetto, 'vuota'), { recursive: true });
    assert.equal(await hashDi(cartella), prima, 'una cartella vuota non è codice');

    /*
     * ⛔ Un FLUSSO ALTERNATIVO NTFS (`file:flusso`) non entra nell'impronta: `readdir` non lo
     * enumera. Non è sfruttabile da qui — l'unico eseguibile consentito è `node`, e `node` non
     * carica un flusso alternativo come modulo — ma il limite si dichiara invece di ignorarlo.
     */
    if (process.platform === 'win32') {
      try {
        writeFileSync(`${join(pacchetto, 'run.js')}:nascosto`, 'console.log("nascosto");\n', 'utf8');
        assert.equal(await hashDi(cartella), prima, 'misurato: un flusso alternativo NON cambia l\'impronta');
      } catch {
        // Il filesystem non è NTFS o vieta i flussi: niente da misurare, niente da dichiarare.
      }
    }
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

/*
 * ⛔⛔⛔ TERZO GIRO (17/09/2026) — LE SEI BOCCIATURE DEL SECONDO REVISORE.
 *
 * Il contenimento dei percorsi era giusto e SINTATTICO: guardava com'è scritto l'argomento, non
 * cosa il comando fa. Bastava non scrivere nessun percorso.
 */
test('⛔⛔⛔ A-1 — un comando che VALUTA codice inline è rifiutato al caricamento, con una frase', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    /*
     * ⛔ Il caso del revisore, riprodotto da me prima di curare: il percorso si costruisce a
     *   RUNTIME (`String.fromCharCode`), quindi nessun pezzo del comando somiglia a un percorso,
     *   `evil.js` del workspace viene caricato ed eseguito, e dopo lo scambio l'impronta è
     *   invariata e il plugin resta fidato. Misurato: «evil-v1 APPROVATO» → «evil-v2 MAI APPROVATO».
     */
    const inline = 'require( process.cwd() + String.fromCharCode(47,101,118,105,108,46,106,115) )';
    writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
      ...MANIFESTO, hooks: [], tools: [{ nome: 'saluta', descrizione: 'd', comando: `node -e "${inline}"` }],
    }), 'utf8');
    const { plugin, falliti } = await caricaPlugin({ cartella });
    assert.deepEqual(plugin, []);
    assert.equal(falliti[0].codice, 'PLUGIN_COMANDO_ESEGUE_CODICE');
    assert.match(falliti[0].frase, /istruzioni scritte dentro la sua scheda/i);
    assert.doesNotMatch(falliti[0].frase, /PLUGIN_[A-Z_]+|--eval|-e\b/, 'niente nomi tecnici nella frase');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ A-1 — tutte le opzioni che eseguono o precaricano, nelle DUE forme `--x v` e `--x=v`', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    /*
     * ⛔ Elenco dalla documentazione di Node letta il 17/09/2026 (nodejs.org/api/cli.html):
     *   `-e/--eval`, `-p/--print` valutano; `-r/--require`, `--import`, `--experimental-loader`
     *   (e `--loader`) precaricano. Più `-c`/`-m` degli altri interpreti e `-Command`/`/k`.
     */
    const opzioni = [
      'node -e "1"', 'node --eval "1"', 'node --eval=1', 'node -p "1"', 'node --print=1',
      'node -r ./run.js run.js', 'node --require=./run.js run.js', 'node --import=./run.js run.js',
      'node --loader=./run.js run.js', 'node --experimental-loader ./run.js run.js',
      'python -c "1"', 'python -m modulo', 'bash -c "ls"', 'powershell -Command "ls"',
      'powershell -EncodedCommand AAA', 'cmd /k dir',
    ];
    for (const comando of opzioni) {
      writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
        ...MANIFESTO, hooks: [], tools: [{ nome: 't', descrizione: 'd', comando }],
      }), 'utf8');
      const { plugin, falliti } = await caricaPlugin({ cartella });
      assert.deepEqual(plugin, [], `doveva essere rifiutato: ${comando}`);
      assert.equal(falliti[0]?.codice, 'PLUGIN_COMANDO_ESEGUE_CODICE', comando);
    }

    /*
     * ⛔ AL CONTRARIO — il verso in cui NON deve mordere: gli argomenti DELLO SCRIPT passano.
     * ⛔⛔ CAMBIATO nel QUARTO giro, e va detto invece che aggiustato di nascosto: qui c'era anche
     *   `node --no-warnings run.js`, cioè un'opzione dell'INTERPRETE «innocua», e passava. Con la
     *   grammatica ammessa non passa più — per scelta: ammettere le innocue vuol dire tornare a
     *   decidere quali lo sono, che è la denylist da cui si è scappati. Se un giorno ne servisse
     *   una, si aggiunge PER NOME con la sua prova.
     */
    for (const comando of ['node run.js --verbose', 'node run.js --out=x']) {
      writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
        ...MANIFESTO, hooks: [], tools: [{ nome: 't', descrizione: 'd', comando }],
      }), 'utf8');
      const { plugin, falliti } = await caricaPlugin({ cartella });
      assert.equal(plugin.length, 1, `NON doveva essere rifiutato: ${comando} (${falliti[0]?.codice})`);
    }
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ A-2 — anche il PROGRAMMA passa dal cancello, se è scritto come percorso', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    /*
     * ⛔ Prima il primo pezzo era esente per costruzione, e a fermarlo restava solo
     *   `allowedExecutables` di `process-policy` — un PARAMETRO iniettabile, cioè una difesa che
     *   un incorporamento può allargare senza sapere di aver riaperto questa.
     */
    writeFileSync(join(cartella, 'fuori.js'), 'console.log("fuori");\n', 'utf8');
    for (const comando of ['../../fuori.js', './strumenti/x.js', 'C:/Windows/System32/cmd.exe']) {
      writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
        ...MANIFESTO, hooks: [], tools: [{ nome: 't', descrizione: 'd', comando }],
      }), 'utf8');
      const { plugin, falliti } = await caricaPlugin({ cartella });
      assert.deepEqual(plugin, [], `un programma-percorso fuori dal pacchetto deve essere rifiutato: ${comando}`);
      assert.equal(falliti[0]?.codice, 'PLUGIN_COMANDO_FUORI_DAL_PACCHETTO', comando);
    }

    // AL CONTRARIO: un nome NUDO resta all'allowlist, e un programma DENTRO il pacchetto passa.
    for (const comando of ['node run.js', 'echo ciao', './run.js']) {
      writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
        ...MANIFESTO, hooks: [], tools: [{ nome: 't', descrizione: 'd', comando }],
      }), 'utf8');
      const { plugin, falliti } = await caricaPlugin({ cartella });
      assert.equal(plugin.length, 1, `NON doveva essere rifiutato: ${comando} (${falliti[0]?.codice})`);
    }
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ A-3 — un id di plugin che contiene «__» è rifiutato con una frase, mai zitto', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-a3-'));
  try {
    /*
     * ⛔ Il nome esposto è `plugin__<id>__<tool>`, e chi risale all'id taglia su `__`. Con un id
     *   che lo contiene, il revisore ha misurato che un plugin `a__b` accanto a un gemello `a`
     *   già fidato faceva controllare `a` ed ESEGUIRE `a__b` scambiato.
     */
    for (const id of ['a__b', '__x', 'y__']) {
      const dove = join(cartella, '.harness-ui-plugins', id);
      mkdirSync(dove, { recursive: true });
      writeFileSync(join(dove, 'plugin.json'), JSON.stringify({ nome: id, descrizione: 'd' }), 'utf8');
    }
    const sano = join(cartella, '.harness-ui-plugins', 'a');
    mkdirSync(sano, { recursive: true });
    writeFileSync(join(sano, 'plugin.json'), JSON.stringify({ nome: 'a', descrizione: 'd' }), 'utf8');

    const { plugin, falliti } = await caricaPlugin({ cartella });
    assert.deepEqual(plugin.map((p) => p.id), ['a'], 'il gemello sano resta, gli ambigui no');
    assert.deepEqual(falliti.map((f) => f.codice).sort(), ['PLUGIN_ID_AMBIGUO', 'PLUGIN_ID_AMBIGUO', 'PLUGIN_ID_AMBIGUO']);
    assert.match(falliti[0].frase, /Rinominala e riprova/);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ A-5 — un pezzo citato SENZA spazi ma con metacaratteri resta citato dopo la riscrittura', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    /*
     * ⛔ Prima la riscrittura toglieva le virgolette a un pezzo senza spazi, e poi
     *   `parseProcessCommand` lo rifiutava all'ESECUZIONE: il plugin si caricava e moriva dopo.
     *   Un guasto che arriva al momento peggiore, cioè quando la persona lo usa.
     */
    writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
      ...MANIFESTO, hooks: [], tools: [{ nome: 't', descrizione: 'd', comando: 'node run.js "a&b" "c|d" "e;f"' }],
    }), 'utf8');
    const { plugin, falliti } = await caricaPlugin({ cartella });
    assert.equal(plugin.length, 1, `doveva caricarsi (${falliti[0]?.codice})`);
    const comando = plugin[0].tools[0].comando;
    assert.match(comando, /"a&b"/, 'i metacaratteri restano citati');
    assert.match(comando, /"c\|d"/);
    assert.match(comando, /"e;f"/);
    // ⛔ La prova che conta: il comando riscritto è ancora ESEGUIBILE, cioè `parseProcessCommand`
    //   lo rilegge senza rifiutarlo. Senza questa riga si proverebbe solo la forma della stringa.
    assert.deepEqual(parseProcessCommand(comando).slice(2), ['a&b', 'c|d', 'e;f']);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ A-6(a) — la riscrittura vale per gli HOOK quanto per i tool', async () => {
  /*
   * ⛔ Il revisore ha misurato che togliendo la riscrittura agli hook (`hooksContenuti = hooks`)
   *   NESSUNA prova diventava rossa: gli hook erano curati e scoperti. Un hook esegue esattamente
   *   come un tool, dallo stesso `cwd`.
   */
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    const { plugin } = await caricaPlugin({ cartella });
    const hook = plugin[0].hooks[0];
    assert.match(hook.comando, /^node /);
    const percorso = hook.comando.slice('node '.length).replace(/^"|"$/g, '');
    assert.equal(resolve(percorso), resolve(join(pacchetto, 'audit.js')), 'l\'hook punta al file del PACCHETTO, assoluto');
    assert.ok(!percorso.includes('\\'), 'mai backslash nel comando riscritto');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ A-6(a) — e un HOOK che esce dal pacchetto o esegue codice è rifiutato come un tool', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    for (const [comando, codice] of [
      ['node ../../fuori.js', 'PLUGIN_COMANDO_FUORI_DAL_PACCHETTO'],
      ['node -e "1"', 'PLUGIN_COMANDO_ESEGUE_CODICE'],
    ]) {
      writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
        ...MANIFESTO, tools: [], hooks: [{ id: 'audit', eventi: ['pre_tool_call'], comando }],
      }), 'utf8');
      const { plugin, falliti } = await caricaPlugin({ cartella });
      assert.deepEqual(plugin, [], comando);
      assert.equal(falliti[0]?.codice, codice, comando);
    }
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ A-4 — `falliti` esce dal cancello di sessione, non muore al confine', async () => {
  /*
   * ⛔ `preparaToolPluginPerSessione` DICHIARAVA `falliti` e tornava sempre `[]`, perché scartava
   *   quello che `caricaPlugin` le dava. Un pacchetto guasto spariva dalla sessione senza che
   *   niente dicesse perché — cioè il difetto che `falliti` esiste per chiudere.
   */
  const { cartella, pacchetto } = workspaceConPacchetto();
  const cartellaTrust = mkdtempSync(join(tmpdir(), 'talos-a4-trust-'));
  try {
    writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
      ...MANIFESTO, hooks: [], tools: [{ nome: 't', descrizione: 'd', comando: 'node -e "1"' }],
    }), 'utf8');
    const esito = await preparaToolPluginPerSessione({ cartella, cartellaTrust });
    assert.deepEqual(esito.toolPlugin, []);
    assert.equal(esito.falliti.length, 1, 'il guasto arriva a chi apre la sessione');
    assert.equal(esito.falliti[0].codice, 'PLUGIN_COMANDO_ESEGUE_CODICE');
    assert.ok(esito.falliti[0].frase.length > 0);
  } finally {
    rimuoviCartellaDiProva(cartella);
    rimuoviCartellaDiProva(cartellaTrust);
  }
});

/*
 * ⛔⛔⛔⛔ QUARTO GIRO (17/09/2026) — LA DENYLIST È DIVENTATA UNA GRAMMATICA AMMESSA.
 *
 * Il terzo controllo ha bucato l'elenco delle opzioni vietate in sei modi, tutti misurati: la
 * forma UNITA `-pe`, `--run` (che esegue una riga di `package.json` che il cancello non legge),
 * `-` e `--input-type=module -` (stdin), `--inspect-brk`, e un SOTTOCOMANDO come `deno eval`, che
 * non comincia nemmeno per `-`. Più `node` da solo, che apre il REPL.
 * ⇒ Una denylist su un interprete è una gara persa in partenza: gli interpreti aggiungono modi di
 *   eseguire, noi no. Adesso passa SOLO ciò che è dichiarato ammesso.
 */
const COMANDI_DA_RIFIUTARE = [
  ['node -pe "require(process.cwd()+String.fromCharCode(47,101,118,105,108,46,106,115))"', 'la forma UNITA che il terzo controllo ha misurato passare'],
  ['node -p "1"', 'la forma separata'],
  ['node --run build', 'esegue una riga di package.json che il cancello non ha mai letto'],
  ['node -', 'lo script arriva da stdin'],
  ['node --input-type=module -', 'idem, come modulo'],
  ['node --eval=1', 'con l\'uguale'],
  ['node -r./run.js run.js', 'precarico attaccato al nome dell\'opzione'],
  ['node --inspect-brk run.js', 'un\'opzione «innocua»: non si ammette nemmeno quella'],
  ['deno eval "1"', 'un SOTTOCOMANDO non comincia per «-»'],
  ['node', 'da solo: il REPL'],
];

test('⛔⛔⛔⛔ G4-A1 — la GRAMMATICA AMMESSA rifiuta tutte e dieci le forme del terzo controllo', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    for (const [comando, perche] of COMANDI_DA_RIFIUTARE) {
      writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
        ...MANIFESTO, hooks: [], tools: [{ nome: 't', descrizione: 'd', comando }],
      }), 'utf8');
      const { plugin, falliti } = await caricaPlugin({ cartella });
      assert.deepEqual(plugin, [], `doveva essere rifiutato (${perche}): ${comando}`);
      assert.equal(falliti[0]?.codice, 'PLUGIN_COMANDO_ESEGUE_CODICE', comando);
      assert.ok(falliti[0].frase.length > 0, 'e con una frase da mostrare');
    }
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⭐⭐ G4-A1 — e ACCETTA le sole forme dichiarate, che restano quelle vere', async () => {
  /*
   * ⛔ Il verso in cui la grammatica NON deve mordere. Un cancello che rifiuta tutto è comodo e
   *   inutile: queste quattro sono i comandi che i plugin scrivono davvero.
   */
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    for (const comando of ['node run.js', 'node run.js --flag valore', 'node sub/dentro.js arg', 'echo ciao', './run.js']) {
      writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
        ...MANIFESTO, hooks: [], tools: [{ nome: 't', descrizione: 'd', comando }],
      }), 'utf8');
      const { plugin, falliti } = await caricaPlugin({ cartella });
      assert.equal(plugin.length, 1, `NON doveva essere rifiutato: ${comando} (${falliti[0]?.codice} — ${falliti[0]?.messaggio})`);
    }
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ G4-A1 — gli argomenti DOPO il file sono dello SCRIPT: un trattino lì non è un\'opzione di Node', async () => {
  /*
   * ⛔ È il confine che rende la grammatica usabile: `node run.js --flag` è legittimo, perché
   *   `--flag` lo legge lo script, non l'interprete. Se si rifiutasse anche quello, il cancello
   *   sarebbe inutilizzabile e qualcuno lo allargherebbe dalla parte sbagliata.
   */
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
      ...MANIFESTO, hooks: [], tools: [{ nome: 't', descrizione: 'd', comando: 'node run.js -e --eval --run -' }],
    }), 'utf8');
    const { plugin, falliti } = await caricaPlugin({ cartella });
    assert.equal(plugin.length, 1, `gli argomenti dello script passano (${falliti[0]?.codice})`);
    assert.match(plugin[0].tools[0].comando, /run\.js -e --eval --run -$/);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔ G4-A1 — la grammatica vale per gli HOOK quanto per i tool', async () => {
  const { cartella, pacchetto } = workspaceConPacchetto();
  try {
    writeFileSync(join(pacchetto, 'plugin.json'), JSON.stringify({
      ...MANIFESTO, tools: [], hooks: [{ id: 'audit', eventi: ['pre_tool_call'], comando: 'node -pe "1"' }],
    }), 'utf8');
    const { plugin, falliti } = await caricaPlugin({ cartella });
    assert.deepEqual(plugin, []);
    assert.equal(falliti[0]?.codice, 'PLUGIN_COMANDO_ESEGUE_CODICE');
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ G4-A3 — UNA sola grammatica dell\'id, usata dal caricamento e da chi lo rilegge', async () => {
  /*
   * ⛔ La prima cura rifiutava solo `__`, ma il lettore pretendeva di più: un id `_sano` si
   *   caricava, veniva offerto come `plugin___sano__ping`, e ogni chiamata rispondeva «non
   *   riconosco a quale plugin appartiene». Caricato e inutilizzabile, per sempre, in silenzio.
   *   MISURATO dal terzo controllo.
   */
  assert.equal(idPluginValido('a_b'), true, 'un solo trattino basso va benissimo');
  assert.equal(idPluginValido('a-b'), true);
  assert.equal(idPluginValido('demo'), true);
  assert.equal(idPluginValido('_sano'), false, '⛔ il caso che si caricava e non funzionava mai');
  assert.equal(idPluginValido('a__b'), false);
  assert.equal(idPluginValido(''), false);
  assert.equal(idPluginValido('a/b'), false);
  assert.equal(idPluginValido('..'), false);

  const cartella = mkdtempSync(join(tmpdir(), 'talos-g4-id-'));
  try {
    for (const id of ['_sano', 'a__b', 'a_b', 'a-b']) {
      const dove = join(cartella, '.harness-ui-plugins', id);
      mkdirSync(dove, { recursive: true });
      writeFileSync(join(dove, 'plugin.json'), JSON.stringify({ nome: id, descrizione: 'd' }), 'utf8');
    }
    const { plugin, falliti } = await caricaPlugin({ cartella });
    assert.deepEqual(plugin.map((p) => p.id).sort(), ['a-b', 'a_b'], 'passano solo quelli che il lettore sa rileggere');
    assert.deepEqual(falliti.map((f) => f.codice), ['PLUGIN_ID_AMBIGUO', 'PLUGIN_ID_AMBIGUO']);
  } finally {
    rimuoviCartellaDiProva(cartella);
  }
});

test('⛔⛔⛔ G4-A3 — l\'id viaggia nella MAPPA, non si ricava dal nome esposto', async () => {
  /*
   * ⛔ La cura definitiva: `preparaToolPluginPerSessione` porta `pluginIdDiTool`, che legge l'id
   *   VERO dall'instradamento. Un attrezzo che non è in quella mappa non è di questa sessione.
   */
  const { cartella } = workspaceConPacchetto();
  const cartellaTrust = mkdtempSync(join(tmpdir(), 'talos-g4-trust-'));
  try {
    const { plugin } = await caricaPlugin({ cartella });
    await fidaPlugin({ cartellaTrust, pluginId: 'demo', hash: plugin[0].hash });
    const preparato = await preparaToolPluginPerSessione({ cartella, cartellaTrust });
    assert.equal(typeof preparato.pluginIdDiTool, 'function');
    assert.equal(preparato.pluginIdDiTool(preparato.toolPlugin[0].nome), 'demo');
    assert.equal(preparato.pluginIdDiTool('plugin__inventato__x'), null, 'ciò che non è in mappa non ha id');
  } finally {
    rimuoviCartellaDiProva(cartella);
    rimuoviCartellaDiProva(cartellaTrust);
  }
});
