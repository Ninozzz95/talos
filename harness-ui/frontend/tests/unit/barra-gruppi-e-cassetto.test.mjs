import { VIEW_BY_DESTINATION } from '../../src/domain/navigation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * I CANCELLI DEI LOTTI A e D (11/09/2026) — la barra a due gruppi, il cassetto sotto gli 860 px e
 * il menu della riga di sessione.
 *
 * ⛔ Perché cancelli STATICI e non solo foto: tre di queste invarianti non si vedono in nessuna
 *   immagine e si rompono in silenzio.
 *     · il bottone del cassetto NON deve avere `aria-controls`: la «regia del mockup» tratta ogni
 *       `[aria-expanded][aria-controls]` come un disclosure e metterebbe `hidden` sulla barra —
 *       cioè il bottone aprirebbe il cassetto e nasconderebbe la barra nello stesso clic;
 *     · `montaGruppiBarra()` deve essere chiamata DOPO quella regia, o la memoria dei gruppi salva
 *       sempre l'opposto di quello che si vede (due ascoltatori delegati sullo stesso nodo si
 *       chiamano nell'ordine di registrazione, DOM Standard);
 *     · l'ascoltatore di Esc del menu deve stare in fase di CATTURA, o Esc chiude il menu E apre il
 *       velo «fermo il giro» — trovato sul banco, non ipotizzato.
 * ⛔ Ogni prova ha la sua metà AL CONTRARIO: un cancello che non ha mai respinto niente non è un
 *   cancello (regola 5-bis).
 */
const TEMPLATE = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

/** Le testate di gruppo della barra, con l'id che dicono di controllare. */
export function testateDiGruppo(html) {
  const fuori = [];
  const re = /<button[^>]*class="td-nav-head"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attributi = m[0];
    fuori.push({
      id: /\bid="([^"]*)"/.exec(attributi)?.[1] || null,
      gruppo: /data-gruppo="([^"]*)"/.exec(attributi)?.[1] || null,
      espanso: /aria-expanded="([^"]*)"/.exec(attributi)?.[1] || null,
      controlla: /aria-controls="([^"]*)"/.exec(attributi)?.[1] || null,
    });
  }
  return fuori;
}

/** Le testate che puntano a un id che nel documento non esiste. */
export function testateSenzaBersaglio(html) {
  return testateDiGruppo(html).filter((t) => !t.controlla || !new RegExp(`id="${t.controlla}"`).test(html));
}

test('A — le due testate di gruppo esistono, sono disclosure, e il loro bersaglio c\'è', () => {
  const testate = testateDiGruppo(TEMPLATE);
  assert.equal(testate.length, 2, 'i gruppi della barra sono due: «Spazi di lavoro» e «Strumenti»');
  assert.deepEqual(testate.map((t) => t.gruppo), ['lavoro', 'strumenti']);
  for (const t of testate) {
    assert.ok(t.id, 'ogni testata ha un id: è il grilletto che il codice ritrova');
    assert.ok(t.espanso === 'true' || t.espanso === 'false', `${t.gruppo}: aria-expanded dichiarato`);
    assert.ok(t.controlla, `${t.gruppo}: aria-controls dichiarato`);
  }
  assert.deepEqual(testateSenzaBersaglio(TEMPLATE), [], 'nessuna testata punta a un id che non esiste');
  /* Il default del mockup: «Spazi di lavoro» aperto, «Strumenti» chiuso. Non è un vezzo — con tutti
     e due aperti le 13 voci schiacciano l'elenco delle sessioni (misurato: 545 px su ~790). */
  assert.equal(testate[0].espanso, 'true');
  assert.equal(testate[1].espanso, 'false');
  assert.match(TEMPLATE, /id="gruppoStrumenti" hidden/u, 'chiuso vuol dire anche `hidden`, o il gruppo si vede lo stesso');
});

test('A, al contrario: una testata che punta a un id inesistente viene TROVATA', () => {
  const rotto = '<button class="td-nav-head" id="x" data-gruppo="lavoro" aria-expanded="true" aria-controls="nonEsiste"></button><div id="altro"></div>';
  assert.equal(testateSenzaBersaglio(rotto).length, 1);
  /* e una sana non viene accusata */
  const sano = '<button class="td-nav-head" id="x" data-gruppo="lavoro" aria-expanded="true" aria-controls="ok"></button><div id="ok"></div>';
  assert.deepEqual(testateSenzaBersaglio(sano), []);
});

/** Il blocco `<div class="td-sidebar-nav">…</div>` del template. */
export function bloccoNavigazione(html) {
  const inizio = html.indexOf('<div class="td-sidebar-nav"');
  if (inizio < 0) return '';
  const fine = html.indexOf('\n    </div>', inizio);
  return html.slice(inizio, fine < 0 ? html.length : fine);
}

/** I conteggi SCRITTI A MANO dentro un blocco: badge con un numero già dentro. */
export function conteggiScrittiAMano(html) {
  return [...html.matchAll(/<span class="talos-nav-item__count"[^>]*>\s*(\d+)\s*</gi)].map((m) => m[1]);
}

test('A — nessun conteggio d\'esempio nella barra nuova: il badge lo scrive il dato vero', () => {
  const blocco = bloccoNavigazione(TEMPLATE);
  assert.ok(blocco.length > 0, 'il blocco `.td-sidebar-nav` esiste nel template');
  assert.deepEqual(conteggiScrittiAMano(blocco), [], 'i numeri del mockup (43 · 69 · 18 · 7 · 4…) non entrano nel prodotto');
  const voci = [...blocco.matchAll(/data-vaia="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(voci, ['home', 'chat', 'note', 'attivita', 'libreria', 'memoria', 'ricerca', 'progetti', 'board', 'modelli', 'capability', 'officina', 'automazioni', 'doctor']);
});

test('A, al contrario: un badge con un numero scritto dentro viene TROVATO', () => {
  assert.deepEqual(conteggiScrittiAMano('<span class="talos-nav-item__count">43</span>'), ['43']);
  assert.deepEqual(conteggiScrittiAMano('<span class="talos-nav-item__count"></span>'), []);
});

test('A — ogni voce della barra ha una porta: la mappa delle viste', () => {
  const blocco = bloccoNavigazione(TEMPLATE);
  const voci = [...blocco.matchAll(/data-vaia="([^"]+)"/g)].map((m) => m[1]);
  assert.match(APP, /const VISTA_PER_VAIA = VIEW_BY_DESTINATION;/, 'la regia consuma il registro condiviso');
  const conosciute = new Set(Object.keys(VIEW_BY_DESTINATION));
  /*
   * ⛔⛔ 18/09/2026 — QUESTA PROVA HA PERSO LA SUA ECCEZIONE, E NON SI È ALLENTATA.
   * Prima diceva: «ogni voce ha una porta — o la mappa, o l'eccezione dichiarata», e pretendeva la
   * riga che dirottava «Modelli» dentro Impostazioni → sezione modelli, perché `#schermoModelLab`
   * esisteva ma non stava in nessuna mappa. Quella riga è uscita: la schermata ha la **sua** voce
   * nella mappa (`models: 'schermoModelLab'` in `domain/navigation.ts`, e `modelli: 'models'` per la
   * barra), quindi l'eccezione non serve più.
   * ⇒ Il verso che conta adesso è **il contrario**: che il dirottamento NON torni, perché una voce
   *   che finge di aprire una schermata e ne apre un'altra è di nuovo una porta finta.
   */
  assert.ok(conosciute.has('modelli'), '«Modelli» deve avere la sua voce nella mappa delle viste');
  assert.doesNotMatch(APP, /dataset\.vaia === 'modelli'[\s\S]{0,120}setSettingsSection\('models'\)/u,
    'il dirottamento di «Modelli» dentro Impostazioni non deve tornare: la schermata ha la sua rotta');
  const senzaPorta = voci.filter((v) => !conosciute.has(v));
  assert.deepEqual(senzaPorta, [], 'una voce che non naviga da nessuna parte è una porta finta');
});

test('A — il bottone del cassetto NON ha aria-controls, o la regia nasconderebbe la barra che apre', () => {
  const bottone = /<button[^>]*id="apriCassettoBarra"[^>]*>/.exec(TEMPLATE)?.[0];
  assert.ok(bottone, 'il bottone del cassetto esiste nel template');
  assert.match(bottone, /class="td-floating-menu"/u);
  assert.match(bottone, /aria-expanded="false"/u, 'lo stato aperto/chiuso si dichiara');
  assert.doesNotMatch(bottone, /aria-controls=/u, '⛔ con aria-controls la regia del mockup metterebbe `hidden` sulla barra nello stesso clic');
  assert.match(bottone, /aria-label="[^"]+"/u, 'un bottone di sola icona ha un nome');
});

test('A — `montaGruppiBarra()` è chiamata DOPO la regia dei disclosure', () => {
  const regia = APP.indexOf("disclosure.setAttribute('aria-expanded'");
  const montaggio = APP.indexOf('montaGruppiBarra();');
  assert.ok(regia > 0 && montaggio > 0, 'entrambe le ancore esistono ancora');
  assert.ok(montaggio > regia, '⛔ registrata prima, la memoria dei gruppi salverebbe sempre l\'opposto di ciò che si vede');
});

test('D — l\'Esc del menu è in fase di CATTURA, e si stacca con lo stesso flag', () => {
  assert.match(APP, /document\.addEventListener\('keydown', onKeydown, true\)/u, 'in cattura: la catena di Esc della app è registrata prima e in bolla arriverebbe per prima');
  assert.match(APP, /document\.removeEventListener\('keydown', onKeydown, true\)/u, 'un listener in cattura si stacca solo con lo stesso `true`');
  assert.match(APP, /event\.stopPropagation\(\);\s*chiudiMenu\(\{ restituisciFuoco: true \}\)/u, 'Esc chiude SOLO il menu');
});

test('D — la barra della selezione non affianca più di due comandi', () => {
  const barra = /<div class="talos-sidebar__selezione"[\s\S]*?<\/div>/.exec(TEMPLATE)?.[0] || '';
  assert.ok(barra.length > 0);
  const bottoni = [...barra.matchAll(/<button[^>]*id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(bottoni, ['sessionSelectionSelectAll', 'sessionSelectionMore'], 'estendere la selezione + un menu overflow: le azioni vere stanno dentro il menu');
  assert.doesNotMatch(barra, /Nessuna selezionata/u, 'il conteggio nasce vuoto (owner 07/9)');
  assert.match(barra, /id="sessionSelectionCount"[^>]*role="status"/u, 'quante ne hai scelte si annuncia');
});

test('D — il menu della sessione offre solo azioni con una rotta vera, e nessun «archivia» finto', () => {
  const menu = /const voci = \[([\s\S]*?)\];\s*return apriMenuAzioni/.exec(APP)?.[1] || '';
  assert.ok(menu.length > 0, 'il menu della sessione esiste');
  for (const atteso of ['Apri', 'Rinomina', 'Duplica come ramo', 'Esporta la trascrizione', 'Copia identificativo', 'Elimina']) {
    assert.ok(menu.includes(`'${atteso}'`), `manca la voce «${atteso}»`);
  }
  assert.ok(!/etichetta: 'Archivia'/.test(menu), '⛔ il server non ha una rotta per archiviare: una voce che non fa niente è una bugia');
});
