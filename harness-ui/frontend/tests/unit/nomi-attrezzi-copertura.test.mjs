import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/*
 * ⛔ 12/09 — il giro vero L8 ha mostrato «research_deposit…» a schermo: un attrezzo NUOVO del
 * kernel senza nome umano viola la regola dell'owner del 04/09 («niente nomi tecnici nella UI»).
 * Qui si legge la lista degli attrezzi dichiarati dal kernel (i `name: '…'` dello schema) e si
 * pretende che ognuno abbia un nome umano in `nomi-attrezzi.js`: un attrezzo nuovo senza nome fa
 * rosso questo test, non lo schermo dell'owner. Verso contrario: un nome inventato non è nella mappa.
 *
 * ⛔⛔⛔ 17/09, BC-59 — QUESTA GUARDIA ESISTEVA E NON HA MORSO. Il 17/09 nella riga attività della
 *   chat è comparso `file_edit`: il kernel lo dichiara dal 16/09 (`talosHarness.mjs:2768`) e la
 *   mappa dei nomi non lo aveva. Il test c'era, era verde, e guardava dall'altra parte — la sua
 *   lista era filtrata a mano su sette prefissi (`research|notes|tasks|memory|library|document|
 *   generate|tool`), cioè sulle FAMIGLIE che esistevano il 12/09. `file_edit` non ne ha nessuno.
 *   ⇒ È «una misura ristretta non vede ciò che non ti aspetti», per la seconda volta: un filtro
 *   scritto sui casi noti non può trovare il caso nuovo, che è l'unico che serve trovare.
 *   ⛔ Il filtro sparisce. Si guardano TUTTI i nomi dichiarati dal kernel, senza eccezioni, e non
 *   solo il nome: anche la DESCRIZIONE nostra, perché la scheda dell'attrezzo la mostra.
 *
 * ⛔ Il kernel si PARSA, non si importa: `talosHarness.mjs` è il modulo dell'agente e importarlo
 *   da una prova unitaria vorrebbe dire eseguirne il livello di modulo (lezione del 04/09: un
 *   import faceva partire una pipeline a pagamento). Il prezzo del parsing è che un errore si
 *   presenta come «zero attrezzi trovati» — e «zero» è il numero più pericoloso di tutti: per
 *   questo il primo test qui sotto è un conteggio minimo e la presenza di due nomi noti.
 */
const qui = path.dirname(fileURLToPath(import.meta.url));
const leggi = (rel) => readFileSync(path.join(qui, rel), 'latin1');
const kernel = leggi('../../../src/kernel/talosHarness.mjs');
const config = leggi('../../../src/config.mjs');
const nomiAttrezzi = readFileSync(path.join(qui, '../../src/components/nomi-attrezzi.js'), 'utf8');
const conversazione = readFileSync(path.join(qui, '../../src/components/conversazione.js'), 'utf8');
const app = readFileSync(path.join(qui, '../../src/legacy/app.js'), 'utf8');
const permessi = readFileSync(path.join(qui, '../../src/components/permessi.js'), 'utf8');

/** Gli attrezzi dichiarati dal kernel: i `name: '…'` dei due elenchi di schemi (base ed estesi). */
const dichiarati = [...new Set([...kernel.matchAll(/^\s{4,12}name: '([a-z_]+)',\s*$/gm)].map((m) => m[1]))];

/** Il blocco di una mappa, per non confondere due tabelle dello stesso file. */
function blocco(sorgente, nome) {
  const inizio = sorgente.indexOf(nome);
  assert.notEqual(inizio, -1, `blocco «${nome}» non trovato: il parsing è rotto, non la mappa`);
  const fine = sorgente.indexOf('\n});', inizio);
  assert.notEqual(fine, -1, `fine del blocco «${nome}» non trovata`);
  return sorgente.slice(inizio, fine);
}
// ⛔ niente `\s`: una barra rovescia che attraversa bash o un heredoc non sopravvive (lezione già pagata il 02/09)
const haChiave = (testo, nome) => new RegExp('(^|[ \\t,{])' + nome + ":[ \\t]*'", 'm').test(testo);

const NOMI = blocco(nomiAttrezzi, 'NOMI_UMANI_ATTREZZI = Object.freeze({');
const DESCRIZIONI = blocco(nomiAttrezzi, 'DESCRIZIONI_ATTREZZI = Object.freeze({');

test('NOMI-ATTREZZI · il kernel dichiara i suoi attrezzi e sono molti più di zero', () => {
  /* ⛔ «Zero» qui vorrebbe dire «la regex non ha trovato niente», non «il kernel non ha attrezzi»:
     si conferma AL CONTRARIO, cercando due nomi che DEVONO esserci. */
  assert.ok(dichiarati.length >= 40, `trovati ${dichiarati.length}: ${dichiarati.join(', ')}`);
  assert.ok(dichiarati.includes('shell'), 'il parsing del kernel non vede nemmeno `shell`');
  assert.ok(dichiarati.includes('file_edit'), 'il parsing del kernel non vede `file_edit` (schema del 16/09)');
});

for (const nome of dichiarati) {
  test(`NOMI-ATTREZZI · «${nome}» ha un nome umano`, () => {
    assert.ok(haChiave(NOMI, nome), `manca ${nome} in NOMI_UMANI_ATTREZZI (nomi-attrezzi.js)`);
  });
  test(`NOMI-ATTREZZI · «${nome}» ha una descrizione nostra`, () => {
    assert.ok(haChiave(DESCRIZIONI, nome), `manca ${nome} in DESCRIZIONI_ATTREZZI (nomi-attrezzi.js)`);
  });
}

test('NOMI-ATTREZZI · verso contrario: un attrezzo inventato non ha né nome né descrizione', () => {
  assert.equal(haChiave(NOMI, 'attrezzo_inventato'), false);
  assert.equal(haChiave(DESCRIZIONI, 'attrezzo_inventato'), false);
});

test('NOMI-ATTREZZI · verso contrario: la mappa NON è più duplicata dentro legacy/app.js', () => {
  /* ⛔ La copia del 12/09 è quella che ha lasciato passare `file_edit`: era ferma a quel giorno.
     Se qualcuno ne riscrive una, questa riga diventa rossa prima che lo faccia lo schermo. */
  assert.equal(/const UMANI = \{/u.test(app), false, 'in legacy/app.js è ricomparsa una copia della mappa dei nomi');
  assert.match(app, /nomeUmanoAttrezzoCondiviso/u, 'legacy/app.js deve leggere la mappa condivisa');
});

/* ─────────────────────────────────── BC-59 · il cancello per attrezzo, e i due elenchi a mano ─── */

/**
 * Gli attrezzi che il SERVER dichiara configurabili uno per uno (`config.mjs`). È la sola fonte:
 * la UI ne aveva una copia scritta a mano, ed è già stata trovata corta due volte — il 04/09
 * (`generate_image`, O-01) e il 17/09 (`file_edit`, BC-59). Un elenco che si controlla a occhio
 * si scopre incompleto quando qualcuno prova a chiudere un cancello che non c'è.
 */
const colCancelloServer = (() => {
  const m = config.match(/ATTREZZI_CON_PERMESSO_PER_ATTREZZO = new Set\(\[([^\]]*)\]\)/u);
  assert.ok(m, 'ATTREZZI_CON_PERMESSO_PER_ATTREZZO non trovato in src/config.mjs');
  return [...m[1].matchAll(/'([a-z_]+)'/gu)].map((x) => x[1]);
})();
const colCancelloUi = (() => {
  const b = app.slice(app.indexOf('const ATTREZZI_COL_CANCELLO = Object.freeze(['));
  return [...b.slice(0, b.indexOf('\n  ]);')).matchAll(/^\s*\['([a-z_]+)',/gmu)].map((x) => x[1]);
})();

test('BC-59 · il foglio Permessi elenca ESATTAMENTE gli attrezzi col cancello dichiarati dal server', () => {
  assert.ok(colCancelloServer.length >= 6, `attrezzi col cancello dal server: ${colCancelloServer.join(', ')}`);
  assert.deepEqual([...colCancelloUi].sort(), [...colCancelloServer].sort(),
    `la lista della UI e quella del server non coincidono — server: ${colCancelloServer.join(', ')} · UI: ${colCancelloUi.join(', ')}`);
});

test('BC-59 · «file_edit» ha nome, descrizione, icona propria nelle DUE mappe e la sua riga nei permessi', () => {
  assert.ok(haChiave(NOMI, 'file_edit'), 'nome umano');
  assert.ok(haChiave(DESCRIZIONI, 'file_edit'), 'descrizione nostra');
  /* ⛔ L'icona è richiesta per QUESTO attrezzo e non per tutti: 28 dei 45 usano di proposito il
     ripiego di categoria (O-01, «mai un'icona sbagliata»). Chi CAMBIA I FILE non può essere
     indistinguibile da un attrezzo qualunque: è il gesto che l'owner deve riconoscere a colpo
     d'occhio nella riga attività. */
  assert.ok(haChiave(blocco(conversazione, 'ICONA_ATTREZZO = Object.freeze({'), 'file_edit'), 'icona nella riga attività (conversazione.js)');
  assert.ok(/file_edit: 'i-/u.test(app.slice(app.indexOf('const ICONA_ATTREZZO = {'))), 'icona nell’elenco attrezzi (legacy/app.js)');
  assert.ok(colCancelloUi.includes('file_edit'), 'riga nel foglio Permessi');
  assert.ok(haChiave(blocco(permessi, 'SCRIVONO_LO_STESSO = Object.freeze({'), 'file_edit'),
    'porta laterale: chi chiude «scrivi» deve sapere che questo scrive lo stesso');
});

test('BC-59 · la riga attività dice il percorso, e il nome tecnico non compare più nel ripiego', () => {
  assert.match(app, /case 'file_edit': return a\.percorso \? `Modifica di \$\{a\.percorso\}…`/u);
  assert.match(app, /case 'file_edit': return a\.percorso \? `Modificato \$\{a\.percorso\}`/u);
  /* ⛔ AL CONTRARIO: il ripiego di un attrezzo sconosciuto non deve più essere il suo id. */
  assert.equal(/String\(nome \?\? ''\)/u.test(app.slice(app.indexOf('function nomeUmanoAttrezzo(nome) {'), app.indexOf('function chiaveStabile'))), false);
});
