/*
 * FE-040, casi difficili del bozzetto 4 («La finestra», «Prova un caso»): l'avviso sotto il modello nella finestra Nuova sessione. Ogni avviso nasce da un
 * dato letto; un dato non letto non diventa mai un'accusa. Tabella del Desktop del 31/10: «si fanno quelli con un dato vero».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avvisoDelModello, fonteDelValore, disegnaAvvisoModello, usaModelloPrimaDiPartire } from '../../src/components/avviso-modello.js';
import { statoAvvioSessione } from '../../src/components/avvio-sessione.js';

const ORA = Date.UTC(2026, 10, 3, 12, 0, 0);
const CATALOGO = { modelli: [{ id: 'z-ai/glm-5.3-flash', supportedParameters: ['tools'], catalogo: { fonte: 'openrouter' } }] };
const base = (x) => avvisoDelModello({ adesso: ORA, formattaByte: (b) => `${b / 1e9} GB`, formattaOra: () => '14:30', ...x });

test('AM-01 la fonte si legge dal prefisso, come sul server; ciò che non si conosce resta «altro»', () => {
  assert.deepEqual(fonteDelValore('z-ai/glm-5.3-flash'), { tipo: 'openrouter', id: 'openrouter' });
  assert.deepEqual(fonteDelValore('meta/llama-5:free'), { tipo: 'openrouter', id: 'openrouter' });
  assert.deepEqual(fonteDelValore('zai:glm-5.3-flash'), { tipo: 'diretto', id: 'zai' });
  assert.deepEqual(fonteDelValore('local:qwen-9b'), { tipo: 'local', id: 'qwen-9b' });
  assert.deepEqual(fonteDelValore('locale-ospite:gemma'), { tipo: 'altro', id: 'locale-ospite' });
  assert.deepEqual(fonteDelValore('claude-code:sonnet'), { tipo: 'altro', id: 'claude-code' });
  assert.equal(fonteDelValore(''), null);
});

test('AM-02 chiave mancante: grave, blocca, porta a collegarla', () => {
  const a = base({ valore: 'zai:glm-5.3-flash', nome: 'GLM 5.3 Flash', fornitori: [{ id: 'zai', keyConfigured: false }] });
  assert.equal(a.chiave, 'chiave');
  assert.equal(a.titolo, 'Manca la chiave di Z.AI.');
  assert.equal(a.grave, true);
  assert.equal(a.blocca, true);
  assert.equal(a.fornitore, 'zai');
  assert.deepEqual(a.azioni, ['collega', 'altro']);
});

test('AM-03 la chiave non si accusa senza un dato: elenco non letto, fornitore assente, chiave presente, fornitore senza chiave', () => {
  assert.equal(base({ valore: 'zai:glm', nome: 'x', fornitori: null }), null);
  assert.equal(base({ valore: 'zai:glm', nome: 'x', fornitori: [{ id: 'openai', keyConfigured: false }] }), null);
  assert.equal(base({ valore: 'zai:glm', nome: 'x', fornitori: [{ id: 'zai', keyConfigured: true }] }), null);
  assert.equal(base({ valore: 'lmstudio:x', nome: 'x', fornitori: [{ id: 'lmstudio', keyConfigured: false }] }), null);
});

test('AM-04 accesso a ChatGPT: dice il vero anche per chi è uscito apposta', () => {
  const a = base({ valore: 'chatgpt:gpt-6', nome: 'GPT 6', pianoChatgpt: { collegato: false } });
  assert.equal(a.chiave, 'accesso');
  assert.match(a.titolo, /ChatGPT è scaduto o è stato chiuso/u);
  assert.equal(a.blocca, true);
  assert.deepEqual(a.azioni, ['accedi', 'altro']);
  assert.equal(base({ valore: 'chatgpt:gpt-6', nome: 'GPT 6', pianoChatgpt: null }), null, 'stato non letto: si tace');
  assert.equal(base({ valore: 'chatgpt:gpt-6', nome: 'GPT 6', pianoChatgpt: { collegato: true } }), null);
});

test('AM-05 modello sparito: solo da un catalogo vero e letto', () => {
  const a = base({ valore: 'z-ai/glm-4.9', nome: 'GLM 4.9', catalogoOpenrouter: CATALOGO });
  assert.equal(a.chiave, 'tolto');
  assert.equal(a.titolo, '«GLM 4.9» non esiste più.');
  assert.equal(a.blocca, true);
  assert.deepEqual(a.azioni, ['altro']);
  assert.equal(base({ valore: 'z-ai/glm-5.3-flash', nome: 'x', catalogoOpenrouter: CATALOGO }), null);
  assert.equal(base({ valore: 'z-ai/glm-4.9', nome: 'x', catalogoOpenrouter: null }), null, 'non letto');
  assert.equal(base({ valore: 'z-ai/glm-4.9', nome: 'x', catalogoOpenrouter: { modelli: [] } }), null, 'vuoto non è un verdetto');
  const riserva = { modelli: [{ id: 'z-ai/x', catalogo: { fonte: 'riserva' } }] };
  assert.equal(base({ valore: 'z-ai/glm-4.9', nome: 'x', catalogoOpenrouter: riserva }), null, 'la lista di riserva è corta: non prova niente');
});

test('AM-06 sparito fra i diretti e fra i locali', () => {
  const d = { zai: [{ id: 'zai:glm-5', catalogo: { fonte: 'models.dev' } }] };
  assert.equal(base({ valore: 'zai:glm-4', nome: 'x', cataloghiDiretti: d }).chiave, 'tolto');
  assert.equal(base({ valore: 'zai:glm-5', nome: 'x', cataloghiDiretti: d }), null);
  assert.equal(base({ valore: 'zai:glm-4', nome: 'x', cataloghiDiretti: { zai: null } }), null, 'catalogo non letto');
  assert.equal(base({ valore: 'local:qwen', nome: 'x', locali: [{ id: 'gemma' }] }).chiave, 'tolto');
  assert.equal(base({ valore: 'local:qwen', nome: 'x', locali: [] }).chiave, 'tolto', 'letto, zero modelli: è un fatto');
  assert.equal(base({ valore: 'local:qwen', nome: 'x', locali: null }), null, 'non letto');
  assert.equal(base({ valore: 'local:qwen', nome: 'x', locali: [{ id: 'qwen' }] }), null);
  assert.equal(base({ valore: 'claude-code:sonnet', nome: 'x', catalogoOpenrouter: CATALOGO }), null, 'una fonte che non conosciamo non si accusa');
});

test('AM-07 memoria: i numeri veri, grave ma non blocca', () => {
  const fit = { state: 'blocked', memory: { requiredBytes: 9e9, availableBytes: 6e9 } };
  const a = base({ valore: 'local:qwen', nome: 'Qwen 9B', locali: [{ id: 'qwen' }], fit });
  assert.equal(a.chiave, 'memoria');
  assert.equal(a.titolo, 'Memoria insufficiente per Qwen 9B: servono 9 GB, ne hai 6 GB liberi.');
  assert.equal(a.grave, true);
  assert.equal(a.blocca, false);
  assert.equal(base({ valore: 'local:qwen', nome: 'x', locali: [{ id: 'qwen' }], fit: { state: 'compatible', memory: fit.memory } }), null);
  assert.equal(base({ valore: 'local:qwen', nome: 'x', locali: [{ id: 'qwen' }], fit: { state: 'blocked', memory: { requiredBytes: 1, availableBytes: 9 } } }), null, 'bloccato per il disco, non per la memoria');
  assert.equal(base({ valore: 'local:qwen', nome: 'x', locali: [{ id: 'qwen' }], fit: { state: 'blocked' } }), null, 'senza numeri non si dice');
});

test('AM-08 limite del piano: con ora di riapertura e solo se è ancora futura', () => {
  const limiti = { scattato: 'primary', primario: { tornaAlle: ORA + 3600e3 }, secondario: null };
  const a = base({ valore: 'chatgpt:gpt-6', nome: 'x', pianoChatgpt: { collegato: true, limiti } });
  assert.equal(a.chiave, 'limite');
  assert.equal(a.titolo, 'ChatGPT ha raggiunto il limite.');
  assert.match(a.sotto, /TALOS non passa da solo a un altro fornitore/u);
  assert.match(a.sotto, /14:30/u);
  assert.equal(a.blocca, false);
  assert.deepEqual(a.azioni, ['altro']);
  assert.equal(base({ valore: 'chatgpt:gpt-6', nome: 'x', pianoChatgpt: { collegato: true, limiti: { ...limiti, scattato: null } } }), null);
  assert.equal(base({ valore: 'chatgpt:gpt-6', nome: 'x', pianoChatgpt: { collegato: true, limiti: { ...limiti, primario: { tornaAlle: ORA - 1 } } } }), null, 'la fotografia è vecchia');
  assert.equal(base({ valore: 'chatgpt:gpt-6', nome: 'x', pianoChatgpt: { collegato: true, limiti: { ...limiti, primario: null } } }), null, 'senza ora non si sa se vale ancora');
});

test('AM-09 non in linea: vale per i modelli in rete, non per quelli di questo PC', () => {
  const a = base({ valore: 'z-ai/x', nome: 'x', online: false });
  assert.equal(a.chiave, 'offline');
  assert.match(a.titolo, /^Non in linea: funzionano solo i modelli di questo PC/u);
  assert.equal(a.blocca, false);
  assert.equal(base({ valore: 'local:qwen', nome: 'x', online: false }), null);
  assert.equal(base({ valore: 'z-ai/x', nome: 'x', online: true }), null);
});

test('AM-10 catalogo salvato: si dice, e una copia vecchia non dichiara sparito nessuno', () => {
  const salvato = { modelli: CATALOGO.modelli, daCache: true, fallbackRete: true };
  const a = base({ valore: 'z-ai/glm-4.9', nome: 'x', catalogoOpenrouter: salvato });
  assert.equal(a.chiave, 'catalogo');
  assert.match(a.titolo, /uso quello salvato/u);
  assert.equal(a.blocca, false);
  assert.equal(base({ valore: 'z-ai/x', nome: 'x', catalogoOpenrouter: { modelli: CATALOGO.modelli, daCache: true } }).chiave, 'tolto', 'cache normale: il catalogo è vero');
  assert.equal(base({ valore: 'local:q', nome: 'x', locali: [{ id: 'q' }], catalogoOpenrouter: salvato }), null, 'un locale non dipende dal catalogo');
});

test('AM-11 senza strumenti: solo se il catalogo lo dichiara', () => {
  const m = (x) => ({ modelli: [{ id: 'a/b', catalogo: { fonte: 'openrouter' }, ...x }] });
  const a = base({ valore: 'a/b', nome: 'x', catalogoOpenrouter: m({ supportedParameters: ['temperature'] }) });
  assert.equal(a.chiave, 'strumenti');
  assert.match(a.titolo, /non usa gli strumenti/u);
  assert.equal(a.blocca, false);
  assert.equal(base({ valore: 'a/b', nome: 'x', catalogoOpenrouter: m({ supportedParameters: null }) }), null);
  assert.equal(base({ valore: 'a/b', nome: 'x', catalogoOpenrouter: m({ supportedParameters: ['tools'] }) }), null);
  assert.equal(base({ valore: 'a/b', nome: 'x', catalogoOpenrouter: m({ supportedParameters: [], capacita: { toolCall: true } }) }), null);
  assert.equal(base({ valore: 'zai:b', nome: 'x', cataloghiDiretti: { zai: [{ id: 'zai:b', capacita: { toolCall: false } }] } }).chiave, 'strumenti');
});

test('AM-12 un avviso alla volta: prima ciò che blocca', () => {
  const tutto = { nome: 'x', online: false, fornitori: [{ id: 'openrouter', keyConfigured: false }], catalogoOpenrouter: CATALOGO };
  assert.equal(base({ ...tutto, valore: 'z-ai/glm-4.9' }).chiave, 'chiave');
  assert.equal(base({ ...tutto, valore: 'z-ai/glm-4.9', fornitori: null }).chiave, 'tolto');
  assert.equal(base({ valore: 'chatgpt:g', nome: 'x', online: false, pianoChatgpt: { collegato: false } }).chiave, 'accesso');
});

test('AM-13 il cancello: un avviso che blocca non fa partire, il pulsante resta vivo e porta al modello', () => {
  const blocca = { chiave: 'chiave', blocca: true, titolo: 'Manca la chiave di Z.AI.' };
  const s = statoAvvioSessione({ cartella: { path: 'C:/p/AVM', projectId: '0' }, permesso: 'Workspace write', avvisoModello: blocca });
  assert.equal(s.situazione, 'modello');
  assert.equal(s.puoAvviare, false);
  assert.equal(s.disabilitato, false);
  assert.equal(s.etichetta, 'Scegli un modello');
  assert.equal(s.motivo, 'Manca la chiave di Z.AI.');
  assert.equal(s.rimedioSu, 'modello');
});

test('AM-14 il cancello: la cartella viene prima, la lettura in volo prima ancora, un avviso che non blocca non ferma', () => {
  const blocca = { blocca: true, titolo: 'x' };
  assert.equal(statoAvvioSessione({ cartella: null, permesso: 'Read only', avvisoModello: blocca }).situazione, 'senza-cartella');
  assert.equal(statoAvvioSessione({ cartella: { path: 'C:/p' }, occupato: true, avvisoModello: blocca }).situazione, 'occupato');
  const s = statoAvvioSessione({ cartella: { path: 'C:/p', projectId: '0' }, permesso: 'Read only', avvisoModello: { blocca: false, titolo: 'x' } });
  assert.equal(s.situazione, 'pronto');
  assert.equal(s.puoAvviare, true);
});

test('AM-20 prima volta: niente modello e niente collegato, si dice e si porta a collegare; con qualcosa di vero si tace', () => {
  const fornitori = [{ id: 'openrouter', keyConfigured: false }, { id: 'lmstudio', keyConfigured: false }];
  const a = base({ valore: '', nome: '', fornitori, locali: [] });
  assert.equal(a.chiave, 'nessuno');
  assert.match(a.titolo, /Nessun fornitore collegato/u);
  assert.equal(a.blocca, true);
  assert.equal(a.grave, false);
  assert.deepEqual(a.azioni, ['collega', 'altro']);
  assert.equal(base({ valore: '', nome: '', fornitori: null, locali: [] }), null, 'fornitori non letti');
  assert.equal(base({ valore: '', nome: '', fornitori, locali: null }), null, 'locali non letti');
  assert.equal(base({ valore: '', nome: '', fornitori: [], locali: [] }), null, 'elenco vuoto: non è un verdetto');
  assert.equal(base({ valore: '', nome: '', fornitori, locali: [{ id: 'q' }] }), null);
  assert.equal(base({ valore: '', nome: '', fornitori: [{ id: 'zai', keyConfigured: true }], locali: [] }), null);
  assert.equal(base({ valore: '', nome: '', fornitori, locali: [], pianoChatgpt: { collegato: true } }), null);
});

/* DOM minimo: il disegno vero si guarda nelle prove nel browser */
function finto() {
  const nodo = (nome) => ({
    nome, figli: [], attr: {}, dataset: {}, className: '', textContent: '', hidden: false, ascolti: {},
    append(...x) { this.figli.push(...x); }, replaceChildren(...x) { this.figli = x; },
    setAttribute(k, v) { this.attr[k] = v; }, addEventListener(k, f) { this.ascolti[k] = f; },
  });
  return { createElement: nodo, ownerDocument: null, nodo };
}
const testi = (n) => [n.textContent, ...n.figli.flatMap(testi)].filter(Boolean);
const bottoni = (n) => [...(n.nome === 'button' ? [n] : []), ...n.figli.flatMap(bottoni)];

test('AM-15 il disegno: niente avviso, niente riquadro', () => {
  const d = finto(); const c = d.nodo('div'); c.ownerDocument = d;
  disegnaAvvisoModello(c, { titolo: 'x', azioni: [] }, {});
  assert.equal(c.hidden, false);
  disegnaAvvisoModello(c, null, {});
  assert.equal(c.hidden, true);
  assert.equal(c.figli.length, 0);
});

test('AM-16 il disegno: il grave è pericolo, si annuncia, ogni azione chiama la sua porta', () => {
  const d = finto(); const c = d.nodo('div'); c.ownerDocument = d;
  const chiamate = [];
  disegnaAvvisoModello(c, { grave: true, titolo: 'Manca la chiave di Z.AI.', sotto: 'Il modello non è raggiungibile.', azioni: ['collega', 'altro'], fornitore: 'zai' }, {
    alCollega: (f) => chiamate.push(`collega:${f}`), alAccedi: () => chiamate.push('accedi'), alCambia: () => chiamate.push('altro'),
  });
  assert.match(c.className, /talos-callout--pericolo/u);
  assert.equal(c.attr.role, 'alert');
  assert.deepEqual(testi(c).slice(0, 2), ['Manca la chiave di Z.AI.', 'Il modello non è raggiungibile.']);
  const [uno, due] = bottoni(c);
  assert.equal(uno.textContent, 'Collega la chiave');
  assert.equal(uno.attr.type ?? uno.type, 'button', 'dentro un form: mai un submit per caso');
  uno.ascolti.click(); due.ascolti.click();
  assert.deepEqual(chiamate, ['collega:zai', 'altro']);
});

test('AM-17 il disegno: ciò che non è grave resta un avviso e si legge senza interrompere', () => {
  const d = finto(); const c = d.nodo('div'); c.ownerDocument = d;
  disegnaAvvisoModello(c, { grave: false, titolo: 'x', azioni: [] }, {});
  assert.doesNotMatch(c.className, /pericolo/u);
  assert.equal(c.attr.role, 'status');
});

test('AM-18 il rimedio: se il selettore ha un valore si usa quello, altrimenti il modello della chat', () => {
  assert.equal(usaModelloPrimaDiPartire('a/b', 'c/d'), 'a/b');
  assert.equal(usaModelloPrimaDiPartire('', 'c/d'), 'c/d');
  assert.equal(usaModelloPrimaDiPartire('', null), '');
});

test('AM-19 la finestra è cablata: legge i dati, passa l\'avviso al cancello, il rimedio apre il selettore, Accesso pieno rosso nel riepilogo', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /statoAvvioSessione\(\{ cartella: local\.selected, permesso: local\.permission, occupato: local\.busy, avvisoModello: local\.avvisoModello \}\)/u);
  assert.match(app, /local\.rimedioSu === 'modello'/u);
  assert.match(app, /'\/api\/v1\/auth\/chatgpt\/stato'[^\n]*\n[^\n]*\/api\/v1\/models|leggiDatiAvvisoModello/u);
  assert.match(app, /navigator\.onLine/u);
  assert.match(app, /toggleAttribute\('data-accesso-pieno'/u);
  assert.match(app, /addEventListener\('offline', aggiornaAvvisoModello/u);
  const css = readFileSync(new URL('../../src/styles/foglio-monolite.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-accesso-pieno\]\s*\{[^}]*var\(--danger\)/u);
});
