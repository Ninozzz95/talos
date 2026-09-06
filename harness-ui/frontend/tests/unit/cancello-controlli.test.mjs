import test from 'node:test';
import assert from 'node:assert/strict';
import {
  controlliMorti, esaminaInventario, haGestore, corrispondeSemplice,
  valoreRiconosciuto, comportamentoNativo, eUnControllo, tipiAscoltatori, MOTIVI,
} from '../../scripts/cancello/controlli-morti.mjs';

/*
 * Cancello classe 2. Ogni prova ha la sua metà AL CONTRARIO: un cancello che trova il difetto ma
 * accusa anche chi è sano muore alla seconda lettura del rapporto, e la app resta senza guardia.
 * Il caso vero da cui nasce tutto è la voce «Note» del 06/9: ascoltatore delegato presente,
 * `VISTA_PER_VAIA` senza la chiave, clic finito nella chat.
 */

/** La radice della app, con la delega dei clic appesa sopra — come `ROOT().addEventListener`. */
const RADICE = { tag: 'div', selettore: '#root', attributi: { id: 'root' }, ascoltatori: [{ tipo: 'click' }] };

/** Le deleghe vere di `app.js`, nell'ordine in cui il gestore le controlla. */
const DELEGHE = [
  {
    nome: 'viste (VISTA_PER_VAIA)', su: '#root', evento: 'click', attributo: 'data-vaia',
    valoriRiconosciuti: ['chat', 'terminale', 'review', 'impostazioni'],
    // la mappa sta DENTRO la condizione (`if (v && MAPPA[v])`): un valore ignoto non ferma il gestore
    interrompeAncheSeIgnoto: false, esaustiva: true,
  },
  {
    nome: 'apri velo', su: '#root', evento: 'click', attributo: 'data-apre-velo',
    valoriRiconosciuti: ['veloIntro', 'veloNuovaSessione'],
    // `if (apre) { …; return; }`: risponde alla sola presenza dell'attributo e consuma il clic
    interrompeAncheSeIgnoto: true, esaustiva: true,
  },
  {
    nome: 'disclosure', su: '#root', evento: 'click',
    attributiRichiesti: ['aria-expanded', 'aria-controls'], esaustiva: true,
  },
];

const voce = (extra) => ({ tag: 'button', attributi: {}, ascoltatori: [], antenati: [RADICE], ...extra });

test('CUORE: ascoltatore presente ma valore sconosciuto ⇒ MORTO (il caso «Note»)', () => {
  const note = voce({ selettore: '#navNote', testo: 'Note', attributi: { 'data-vaia': 'note' } });
  const esito = haGestore(note, { deleghe: DELEGHE });
  assert.equal(esito.vivo, false);
  assert.equal(esito.motivo, MOTIVI.VALORE_NON_RICONOSCIUTO);
  assert.match(esito.perche, /non è fra i valori/);

  // AL CONTRARIO: stessa forma, stessa delega, valore che la mappa conosce ⇒ vivo, e non si accusa
  const chat = voce({ selettore: '#navChat', testo: 'Chat', attributi: { 'data-vaia': 'chat' } });
  const buono = haGestore(chat, { deleghe: DELEGHE });
  assert.equal(buono.vivo, true);
  assert.equal(buono.via, 'delegato');
  assert.deepEqual(controlliMorti([chat], { deleghe: DELEGHE }), []);
});

test('DELEGA: il valore si legge dalla mappa passata da fuori, e «*» vale qualunque valore non vuoto', () => {
  assert.equal(valoreRiconosciuto({ valoriRiconosciuti: ['a', 'b'] }, 'b'), true);
  assert.equal(valoreRiconosciuto({ valoriRiconosciuti: ['a', 'b'] }, 'c'), false);
  // una mappa (oggetto) si legge per chiavi: è la forma vera di VISTA_PER_VAIA
  assert.equal(valoreRiconosciuto({ valoriRiconosciuti: { chat: 'chat', note: 'note' } }, 'note'), true);
  assert.equal(valoreRiconosciuto({ valoriRiconosciuti: '*' }, 'qualunque'), true);
  // AL CONTRARIO: «*» non assolve un attributo vuoto — `data-vaia=""` non porta da nessuna parte
  assert.equal(valoreRiconosciuto({ valoriRiconosciuti: '*' }, ''), false);
});

test('DELEGA NON MONTATA: l’antenato c’è ma non ascolta ⇒ morto, e il motivo lo dice', () => {
  const radiceSpenta = { ...RADICE, ascoltatori: [] };
  const b = voce({ selettore: '#navChat', attributi: { 'data-vaia': 'chat' }, antenati: [radiceSpenta] });
  const esito = haGestore(b, { deleghe: DELEGHE });
  assert.equal(esito.vivo, false);
  assert.equal(esito.motivo, MOTIVI.DELEGA_NON_MONTATA);

  // AL CONTRARIO: la stessa radice che ascolta un evento DIVERSO da quello della delega resta morta,
  // mentre con `click` torna viva — la prova che si guarda il tipo, non la presenza di una lista
  const radiceAltroEvento = { ...RADICE, ascoltatori: [{ tipo: 'keydown' }] };
  assert.equal(haGestore({ ...b, antenati: [radiceAltroEvento] }, { deleghe: DELEGHE }).motivo, MOTIVI.DELEGA_NON_MONTATA);
  assert.equal(haGestore(b, { deleghe: DELEGHE }).motivo, MOTIVI.DELEGA_NON_MONTATA);
  assert.equal(haGestore({ ...b, antenati: [RADICE] }, { deleghe: DELEGHE }).vivo, true);
});

test('CATENA: un ascoltatore proprio basta, ovunque sia il resto', () => {
  const b = voce({ selettore: '#invia', ascoltatori: [{ tipo: 'click', scriptId: '7' }] });
  assert.equal(haGestore(b, { deleghe: [] }).via, 'proprio');
  // AL CONTRARIO: un ascoltatore che non attiva niente (solo `mouseover`) non salva nessuno
  const solaEntrata = voce({ selettore: '#solaEntrata', ascoltatori: [{ tipo: 'mouseover' }], antenati: [] });
  assert.equal(haGestore(solaEntrata, { deleghe: [] }).motivo, MOTIVI.NESSUN_ASCOLTATORE);
});

test('ORDINE DELLE REGOLE: chi consuma il clic uccide, chi lascia proseguire no', () => {
  // `data-apre-velo` ignoto E `data-vaia` buono: la regola dei veli viene DOPO nell'elenco, quindi
  // la vista lo serve prima ⇒ vivo
  const salvato = voce({ selettore: '#doppio', attributi: { 'data-vaia': 'chat', 'data-apre-velo': 'veloInesistente' } });
  assert.equal(haGestore(salvato, { deleghe: DELEGHE }).vivo, true);

  // AL CONTRARIO: invertito l'ordine, il velo ignoto arriva per primo, esce dal gestore e la vista
  // non viene mai controllata ⇒ morto, esattamente come nella app vera
  const invertite = [DELEGHE[1], DELEGHE[0], DELEGHE[2]];
  const esito = haGestore(salvato, { deleghe: invertite });
  assert.equal(esito.vivo, false);
  assert.equal(esito.motivo, MOTIVI.VALORE_NON_RICONOSCIUTO);
  assert.equal(esito.attributo, 'data-apre-velo');
});

test('DISCLOSURE: una delega senza attributo discriminante si aggancia agli attributi richiesti', () => {
  const apri = voce({ selettore: '#apriGruppo', attributi: { 'aria-expanded': 'false', 'aria-controls': 'gruppo1' } });
  assert.equal(haGestore(apri, { deleghe: DELEGHE }).vivo, true);
  // AL CONTRARIO: manca `aria-controls`, la delega non lo guarda, e nessun'altra lo serve ⇒ morto
  const monco = voce({ selettore: '#apriMonco', attributi: { 'aria-expanded': 'false' } });
  assert.equal(haGestore(monco, { deleghe: DELEGHE }).motivo, MOTIVI.NESSUN_ASCOLTATORE);
});

test('NIENTE FALSI POSITIVI: i comportamenti nativi non sono controlli morti', () => {
  assert.equal(comportamentoNativo({ tag: 'a', attributi: { href: '/impostazioni' } }), 'link con una destinazione vera');
  assert.equal(comportamentoNativo({ tag: 'button', attributi: {}, antenati: [{ tag: 'form', attributi: {} }] }), 'invia o azzera il suo modulo');
  assert.equal(comportamentoNativo({ tag: 'input', attributi: { type: 'search' } }), 'campo che tiene un valore letto da qualcun altro');
  assert.equal(comportamentoNativo({ tag: 'summary', attributi: {}, antenati: [{ tag: 'details', attributi: {} }] }), 'apre il suo <details>');
  assert.equal(comportamentoNativo({ tag: 'label', attributi: { for: 'campoNome' } }), 'etichetta legata a un campo');
  assert.equal(comportamentoNativo({ tag: 'button', attributi: { onclick: 'apri()' } }), 'gestore scritto nell’attributo (on…)');
  assert.equal(comportamentoNativo({ tag: 'button', attributi: { popovertarget: 'menuFile' } }), 'apre un popover nativo');

  // AL CONTRARIO — i travestimenti: un `href="#"`, un `javascript:` e un submit senza modulo NON
  // sono comportamenti nativi, e devono restare accusabili
  assert.equal(comportamentoNativo({ tag: 'a', attributi: { href: '#' } }), null);
  assert.equal(comportamentoNativo({ tag: 'a', attributi: { href: 'javascript:void(0)' } }), null);
  assert.equal(comportamentoNativo({ tag: 'button', attributi: { type: 'submit' }, antenati: [] }), null);
  assert.equal(comportamentoNativo({ tag: 'label', attributi: {} }), null);
  const finto = voce({ selettore: 'a.finto', tag: 'a', attributi: { href: '#' }, antenati: [] });
  assert.equal(haGestore(finto, { deleghe: [] }).motivo, MOTIVI.NESSUN_ASCOLTATORE);
});

test('DUBBIO: quello che non si sa non diventa un’accusa', () => {
  // ascoltatori non raccolti ⇒ ignoto, mai morto
  const nonRaccolto = { selettore: '#boh', tag: 'button', attributi: {}, antenati: [] };
  assert.equal(haGestore(nonRaccolto, { deleghe: [] }).vivo, null);
  assert.equal(haGestore(nonRaccolto, { deleghe: [] }).motivo, 'ascoltatori-non-raccolti');

  // un antenato che ascolta e che nessuna delega dichiarata descrive ⇒ ignoto
  const genitoreMisterioso = { tag: 'div', selettore: '.scheda', attributi: { class: 'scheda' }, ascoltatori: [{ tipo: 'click' }] };
  const dentro = voce({ selettore: '.scheda button', antenati: [genitoreMisterioso] });
  assert.equal(haGestore(dentro, { deleghe: DELEGHE }).motivo, 'ascoltatore-antenato-non-dichiarato');

  // AL CONTRARIO: se quell'ascoltatore è dichiarato ESAUSTIVO, il dubbio non c'è più ⇒ morto
  const dichiarata = [{ nome: 'scheda', su: '.scheda', evento: 'click', attributo: 'data-azione', valoriRiconosciuti: ['apri'], esaustiva: true }];
  assert.equal(haGestore(dentro, { deleghe: dichiarata }).motivo, MOTIVI.NESSUN_ASCOLTATORE);

  // un controllo spento di proposito non è morto: è la app che dice «non ora»
  assert.equal(haGestore(voce({ attributi: { disabled: '' }, antenati: [] }), { deleghe: [] }).motivo, 'disabilitato');
  assert.equal(haGestore(voce({ attributi: { 'aria-disabled': 'true' }, antenati: [] }), { deleghe: [] }).motivo, 'disabilitato');
  // AL CONTRARIO: `aria-disabled="false"` è acceso, e va giudicato
  assert.equal(haGestore(voce({ attributi: { 'aria-disabled': 'false' }, antenati: [] }), { deleghe: [] }).vivo, false);
});

test('CHI È UN CONTROLLO: il ruolo e il tabindex contano quanto il tag', () => {
  assert.equal(eUnControllo({ tag: 'div', attributi: { role: 'button' } }), true);
  assert.equal(eUnControllo({ tag: 'span', attributi: { tabindex: '0' } }), true);
  assert.equal(eUnControllo({ tag: 'button', attributi: {} }), true);
  // AL CONTRARIO: un contenitore qualunque non promette niente, e non finisce nel rapporto
  assert.equal(eUnControllo({ tag: 'div', attributi: { class: 'talos-card' } }), false);
  assert.equal(eUnControllo({ tag: 'span', attributi: { tabindex: '-1' } }), false, 'tabindex -1 è fuori dal giro del TAB');
  const contenitore = { selettore: '.talos-card', tag: 'div', attributi: {}, ascoltatori: [], antenati: [] };
  assert.deepEqual(esaminaInventario([contenitore], { deleghe: [] }), { morti: [], ignoti: [], vivi: 0, esaminati: 0 });
});

test('ASCOLTATORI: «non raccolti» e «nessuno» sono due cose diverse', () => {
  assert.equal(tipiAscoltatori(undefined), null);
  assert.equal(tipiAscoltatori(null), null);
  assert.deepEqual([...tipiAscoltatori([])], []);
  // il protocollo scrive `type`, noi scriviamo `tipo`, e una lista di stringhe deve bastare
  assert.deepEqual([...tipiAscoltatori([{ type: 'CLICK' }])], ['click']);
  assert.deepEqual([...tipiAscoltatori(['keydown'])], ['keydown']);
});

test('SELETTORE MINIMO: id, classe e attributo — e un combinatore GRIDA invece di dire no', () => {
  const nodo = { tag: 'div', attributi: { id: 'root', class: 'talos-app scuro', 'data-zona': 'principale' } };
  assert.equal(corrispondeSemplice(nodo, '#root'), true);
  assert.equal(corrispondeSemplice(nodo, 'div#root.talos-app'), true);
  assert.equal(corrispondeSemplice(nodo, '[data-zona="principale"]'), true);
  assert.equal(corrispondeSemplice(nodo, '[data-zona]'), true);
  // AL CONTRARIO: quello che non corrisponde deve dire no, senza inventare
  assert.equal(corrispondeSemplice(nodo, '#altro'), false);
  assert.equal(corrispondeSemplice(nodo, '.chiaro'), false);
  assert.equal(corrispondeSemplice(nodo, '[data-zona="secondaria"]'), false);
  assert.equal(corrispondeSemplice(nodo, 'span#root'), false);
  // ⛔ un selettore che non sappiamo leggere non può rispondere «no»: assolverebbe un morto
  assert.throws(() => corrispondeSemplice(nodo, '#root .voce'), /troppo complesso/);
  assert.throws(() => corrispondeSemplice(nodo, '#root > button'), /troppo complesso/);
});

test('RAPPORTO: i morti in ordine di insidia, i vivi contati, gli ignoti dichiarati', () => {
  const inventario = [
    voce({ selettore: '#navNote', testo: 'Note', attributi: { 'data-vaia': 'note' } }),
    voce({ selettore: '#navChat', testo: 'Chat', attributi: { 'data-vaia': 'chat' } }),
    voce({ selettore: '#orfano', testo: 'Esporta', antenati: [] }),
    voce({ selettore: '#nonSo', testo: 'Boh', ascoltatori: undefined, antenati: [] }),
    { selettore: 'div.riga', tag: 'div', attributi: {}, ascoltatori: [], antenati: [] },
  ];
  const quadro = esaminaInventario(inventario, { deleghe: DELEGHE });
  assert.equal(quadro.vivi, 1);
  assert.equal(quadro.morti.length, 2);
  assert.equal(quadro.ignoti.length, 1);
  assert.equal(quadro.esaminati, 4, 'il contenitore non è un controllo e non entra nel conto');

  const morti = controlliMorti(inventario, { deleghe: DELEGHE });
  assert.equal(morti[0].selettore, '#navNote', 'per primo il morto che sembra sano');
  assert.equal(morti[0].gravita, 'alta');
  assert.equal(morti[0].delega, 'viste (VISTA_PER_VAIA)');
  assert.equal(morti[0].valore, 'note');
  assert.equal(morti[1].motivo, MOTIVI.NESSUN_ASCOLTATORE);
  assert.equal(morti[1].testo, 'Esporta', 'il testo serve a chi legge il rapporto per trovarlo a schermo');

  // AL CONTRARIO: un inventario tutto sano non produce nemmeno una riga, e un inventario vuoto neppure
  assert.deepEqual(controlliMorti([inventario[1]], { deleghe: DELEGHE }), []);
  assert.deepEqual(controlliMorti([], { deleghe: DELEGHE }), []);
  assert.deepEqual(controlliMorti(null, { deleghe: DELEGHE }), []);
});
