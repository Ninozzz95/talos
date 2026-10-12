/*
 * 11/10/2026 — I LINK NELLE RISPOSTE DELLA CHAT (owner, dal vivo: «i link non vengono evidenziati automaticamente per andarci con
 * click»; decisione: «Clic + conferma del sito»). Fino a oggi erano spenti di proposito (18/09). Ora `[testo](url)` e gli indirizzi
 * scritti nudi sono link; al clic si chiede conferma mostrando il SITO, con «fidati di questo sito».
 * Stato dell'arte letto nel codice: Hermes `apps/desktop/electron/external-open.ts` (una porta sola, solo schemi web); VS Code chiede
 * conferma per ogni sito non fidato. CommonMark 0.31.2 §6.3 (link in linea) e GFM §6.9 (autolink estesi: la punteggiatura in coda
 * non fa parte dell'indirizzo).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderizzaMarkdown } from '../../src/components/markdown.js';
import { leggiLinkEsterno, creaSitiFidati } from '../../src/components/link-esterni.js';

function documentoFinto() {
  const nodo = (tag) => {
    const n = { tag, figli: [], testoProprio: null, attributi: new Map(),
      get textContent() { return n.testoProprio !== null ? n.testoProprio : n.figli.map((f) => f.textContent).join(''); },
      set textContent(v) { n.testoProprio = String(v); n.figli = []; },
      set innerHTML(_v) {}, get innerHTML() { return ''; },
      appendChild: (f) => { n.figli.push(f); return f; }, append: (...f) => n.figli.push(...f),
      setAttribute: (k, v) => n.attributi.set(k, String(v)), getAttribute: (k) => n.attributi.get(k) ?? null,
      className: '', style: {} };
    return n;
  };
  return { createElement: nodo, createDocumentFragment: () => nodo('#fragment'),
    createTextNode: (t) => ({ tag: '#text', figli: [], testo: String(t), get textContent() { return this.testo; } }) };
}
const rendi = (testo, opzioni = { linkWeb: true }) => renderizzaMarkdown(testo, { document: documentoFinto(), ...opzioni });
const link = (albero) => { const fuori = []; const giro = (n) => (n.figli || []).forEach((f) => { if (f.tag === 'a') fuori.push({ testo: f.textContent, href: f.getAttribute('href'), classe: f.className, esterno: f.getAttribute('data-link-esterno') }); giro(f); }); giro(albero); return fuori; };

test('LINK-CHAT-01: il caso della foto — `[Leggi la ricetta](https://…).` diventa un link, e il punto resta fuori', () => {
  const f = rendi('da servire con pita. [Leggi la ricetta](https://www.olivemagazine.com/recipes/collection/best-ever-pork-recipes/).');
  assert.deepEqual(link(f), [{ testo: 'Leggi la ricetta', href: 'https://www.olivemagazine.com/recipes/collection/best-ever-pork-recipes/', classe: 'talos-link-esterno',
    esterno: 'https://www.olivemagazine.com/recipes/collection/best-ever-pork-recipes/' }]);
  assert.equal(f.textContent, 'da servire con pita. Leggi la ricetta.');
});

test('LINK-CHAT-02: un indirizzo scritto nudo è un link; la punteggiatura in coda e la parentesi che lo chiude restano testo', () => {
  assert.deepEqual(link(rendi('Vedi https://example.com/a/b?x=1#y, poi torna.')).map((l) => l.href), ['https://example.com/a/b?x=1#y']);
  assert.deepEqual(link(rendi('(fonte: https://example.com/pagina).')).map((l) => l.href), ['https://example.com/pagina']);
  assert.deepEqual(link(rendi('https://it.wikipedia.org/wiki/Gyros_(piatto) è la voce')).map((l) => l.href), ['https://it.wikipedia.org/wiki/Gyros_(piatto)'], 'una parentesi bilanciata fa parte dell’indirizzo');
  assert.equal(rendi('Vedi https://example.com/a, poi.').textContent, 'Vedi https://example.com/a, poi.', 'il testo a schermo non perde un carattere');
  assert.deepEqual(link(rendi('due: http://uno.test e https://due.test/x')).map((l) => l.href), ['http://uno.test/', 'https://due.test/x'], 'il link porta la forma che si aprirà davvero');
});

test('LINK-CHAT-03 AL CONTRARIO: niente link dentro il codice, per le immagini, per schemi che non sono web, e mai senza l’opzione', () => {
  assert.deepEqual(link(rendi('esegui `curl https://example.com/x` adesso')), []);
  assert.deepEqual(link(rendi('![licenza](https://example.invalid/licenza.png)')).map((l) => l.testo), ['https://example.invalid/licenza.png'], 'l’immagine resta testo; il suo indirizzo è un indirizzo nudo');
  const pericoloso = link(rendi('[clicca](javascript:alert(1)) e [file](file:///C:/Windows/win.ini)'));
  assert.deepEqual(pericoloso.map((l) => l.href), [null, null], 'schema non ammesso: resta il testo, senza indirizzo');
  assert.deepEqual(pericoloso.map((l) => l.esterno), [null, null]);
  assert.deepEqual(link(rendi('[sito](https://example.com) e https://example.com', {})), [], 'senza `linkWeb` la chat di prima non cambia');
  assert.deepEqual(link(rendi('ftp://example.com/file e mailto:a@b.it')), []);
});

test('LINK-CHAT-04: grassetto, conversazioni e link web convivono nella stessa riga', () => {
  const f = rendi('**Olive Magazine**: [ricetta](https://example.com/r) e [prima](talos://conversazione/abc-123).', { linkWeb: true, linkConversazione: true });
  assert.deepEqual(link(f).map((l) => l.href), ['https://example.com/r']);
  assert.equal(f.textContent, 'Olive Magazine: ricetta e prima.');
});

test('LINK-ESTERNO-01: leggere un indirizzo — il SITO che si mostra è quello vero, in ASCII; credenziali e schemi strani non si aprono', () => {
  assert.deepEqual(leggiLinkEsterno('https://www.olivemagazine.com/recipes/x?y=1'), { indirizzo: 'https://www.olivemagazine.com/recipes/x?y=1', sito: 'www.olivemagazine.com', sicuro: true });
  assert.equal(leggiLinkEsterno('http://example.com/a').sicuro, false, 'http si riconosce e si dice');
  assert.equal(leggiLinkEsterno('https://аpple.com/login').sito, 'xn--pple-43d.com', 'un nome con lettere di un altro alfabeto si mostra in ASCII (punycode): non può sembrare apple.com');
  assert.equal(leggiLinkEsterno('https://google.com@evil.test/x'), null, 'un indirizzo con credenziali inganna sul sito: non si apre');
  for (const no of ['javascript:alert(1)', 'file:///C:/x', 'talos://conversazione/a', 'data:text/html,x', '', null, 'non un indirizzo']) assert.equal(leggiLinkEsterno(no), null, String(no));
});

test('LINK-ESTERNO-02: i siti fidati — si aggiungono, si elencano in ordine, si tolgono; il nome esatto, mai un sottodominio di un altro', () => {
  const memoria = new Map();
  const deposito = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v) };
  const fidati = creaSitiFidati({ deposito });
  assert.deepEqual(fidati.elenco(), []);
  fidati.aggiungi('www.olivemagazine.com'); fidati.aggiungi('Example.COM'); fidati.aggiungi('example.com');
  assert.deepEqual(fidati.elenco(), ['example.com', 'www.olivemagazine.com']);
  assert.equal(fidati.fidato('example.com'), true);
  assert.equal(fidati.fidato('evil.example.com'), false, 'un sottodominio non eredita la fiducia');
  assert.equal(fidati.fidato('notexample.com'), false);
  assert.deepEqual(creaSitiFidati({ deposito }).elenco(), ['example.com', 'www.olivemagazine.com'], 'resta dopo un riavvio');
  fidati.togli('example.com');
  assert.deepEqual(creaSitiFidati({ deposito }).elenco(), ['www.olivemagazine.com']);
});

test('LINK-ESTERNO-03 AL CONTRARIO: un deposito rotto o assente non ferma niente — nessun sito fidato, e si chiede sempre', () => {
  const rotto = { getItem: () => { throw new Error('negato'); }, setItem: () => { throw new Error('negato'); } };
  const fidati = creaSitiFidati({ deposito: rotto });
  assert.deepEqual(fidati.elenco(), []);
  fidati.aggiungi('example.com');
  assert.equal(fidati.fidato('example.com'), true, 'vale per questa finestra, anche se non si è potuto salvare');
  const storto = { getItem: () => '{"non":"un elenco"}', setItem: () => {} };
  assert.deepEqual(creaSitiFidati({ deposito: storto }).elenco(), []);
  assert.deepEqual(creaSitiFidati({ deposito: { getItem: () => JSON.stringify(['ok.test', 5, 'con spazi .it', '']), setItem: () => {} } }).elenco(), ['ok.test']);
});

test('LINK-BOLLA-01: il messaggio della persona resta letterale; solo gli indirizzi web diventano link, e il testo non perde un carattere', async () => {
  const { pezziConIndirizzi } = await import('../../src/components/link-esterni.js');
  assert.deepEqual(pezziConIndirizzi('Cosa dice https://www.olivemagazine.com/recipes/x/? E **questo** [non](https://a.test) è markdown.'), [
    { testo: 'Cosa dice ' }, { indirizzo: 'https://www.olivemagazine.com/recipes/x/', testo: 'https://www.olivemagazine.com/recipes/x/' },
    { testo: '? E **questo** [non](' }, { indirizzo: 'https://a.test/', testo: 'https://a.test' }, { testo: ') è markdown.' },
  ]);
  const originale = 'vedi (https://example.com/a). poi http://b.test, fine';
  assert.equal(pezziConIndirizzi(originale).map((p) => p.testo).join(''), originale);
  assert.deepEqual(pezziConIndirizzi('niente link qui: ftp://x.test e javascript:alert(1)'), [{ testo: 'niente link qui: ftp://x.test e javascript:alert(1)' }]);
  assert.deepEqual(pezziConIndirizzi(''), []);
  assert.deepEqual(pezziConIndirizzi('https://google.com@evil.test/x resta testo'), [{ testo: 'https://google.com@evil.test/x resta testo' }], 'un indirizzo con credenziali non diventa link');
});
