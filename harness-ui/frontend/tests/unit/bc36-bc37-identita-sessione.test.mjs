import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { identitaSessione, nomeLeggibileSessione } from '../../src/components/session-item.js';

/*
 * ⛔⛔⛔ BC-36 e BC-37 (12/09/2026) — DUE DIFETTI, UNA CAUSA SOLA: aprire una sessione col solo id
 * non portava con sé né il suo NOME né il suo PERMESSO, e nessuno andava a chiederli.
 *
 * MISURATO SUL BANCO prima della cura (server mio sulla 4196, copia dello store, mai la 4174):
 *   · BC-36 — sessione `dbf70964` (`permessi: "Full access"` nell'intestazione e in
 *     `RunStarted.contesto`): la testata del turno diceva «Compito libero · harness-ui · Accesso
 *     pieno», il chip del composer «Scrive nel progetto». Due permessi, uno schermo.
 *   · BC-37 — la STESSA sessione, due aperture: «Rispondi solo: uno.» con l'elenco già in memoria,
 *     «Sessione senza nome» con l'elenco ancora per strada — e **anche 6 secondi dopo** era ancora
 *     «Sessione senza nome»: il ripiego non si correggeva mai.
 *
 * Qui si prova la parte ESTRAIBILE — la precedenza dichiarata — nei due versi, più i due cancelli
 * statici sul filo che la usa in `passaASessione` (un `||` rimesso lì domani rimette il difetto e
 * non renderebbe rosso nient'altro).
 */

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

test('BC-37/1 — un nome scelto dall\'owner vince su tutto, e lo DICHIARA', () => {
  const esito = identitaSessione({
    nome: 'Il nome che l\'owner ha scritto',
    impostazioni: { nome: 'un altro', taskDelega: 'un terzo' },
    dallElenco: { nome: 'un quarto' },
    taskId: 'libero:full-access',
  });
  assert.equal(esito.nome, 'Il nome che l\'owner ha scritto');
  assert.equal(esito.fonte, 'esplicito');
});

test('BC-37/2 — senza nome esplicito vince quello SALVATO, e l\'elenco vale quanto la riga passata', () => {
  const dallaRiga = identitaSessione({ impostazioni: { nome: 'Rispondi solo: uno.' }, taskId: 'libero:full-access' });
  assert.deepEqual([dallaRiga.nome, dallaRiga.fonte], ['Rispondi solo: uno.', 'nome-salvato']);
  const dallElenco = identitaSessione({ dallElenco: { nome: 'Rispondi solo: uno.' }, taskId: 'libero:full-access' });
  assert.deepEqual([dallElenco.nome, dallElenco.fonte], ['Rispondi solo: uno.', 'nome-salvato'],
    'è ESATTAMENTE il caso di BC-37: la riga non c\'è, ma l\'elenco in memoria sa come si chiama');
});

test('BC-37/3 — il nome salvato batte il compito della delega: stesso ordine della riga nella barra', () => {
  const esito = identitaSessione({ dallElenco: { nome: 'Ricerca sul deploy', taskDelega: 'Assembla il file HTML' }, taskId: 'delega:e02f5d85' });
  assert.equal(esito.nome, 'Ricerca sul deploy');
  assert.equal(esito.fonte, 'nome-salvato');
});

test('BC-37/4 — una figlia senza nome si chiama col suo COMPITO, mai «Sotto-agente» e mai un id', () => {
  const esito = identitaSessione({ dallElenco: { nome: null, taskDelega: 'Assembla e valida un file HTML' }, taskId: 'delega:e02f5d85-b610-4e3b' });
  assert.equal(esito.nome, 'Assembla e valida un file HTML');
  assert.equal(esito.fonte, 'compito-delega');
});

test('BC-37/5 — quando nessuno sa niente la fonte è «ripiego»: è la dichiarazione che va CHIESTO', () => {
  const conTask = identitaSessione({ taskId: 'libero:full-access' });
  assert.equal(conTask.nome, 'Compito libero · cartella scelta a mano');
  assert.equal(conTask.fonte, 'ripiego', 'senza questa parola nessuno andrebbe a chiedere il nome vero al server');
  const senzaNiente = identitaSessione({});
  assert.equal(senzaNiente.nome, 'Sessione senza nome');
  assert.equal(senzaNiente.fonte, 'ripiego');
  assert.equal(senzaNiente.nome, nomeLeggibileSessione(null), 'il ripiego resta quello di sempre: nessun nome nuovo inventato qui');
});

test('BC-37, AL CONTRARIO — stringhe vuote e spazi NON sono un nome, o il ripiego non scatterebbe mai', () => {
  const esito = identitaSessione({ nome: '   ', impostazioni: { nome: '' }, dallElenco: { nome: null, taskDelega: '  ' }, taskId: 'libero:full-access' });
  assert.equal(esito.fonte, 'ripiego', 'una stringa vuota che passa per «nome» è il modo di avere una testata vuota e non accorgersene');
  assert.equal(esito.nome, 'Compito libero · cartella scelta a mano');
});

test('BC-36/1 — il CONTRATTO torna la riga vera quando c\'è, e `null` quando nessuno la conosce', () => {
  const riga = { permessi: 'Full access', modello: 'z-ai/glm-5.3-flash' };
  assert.equal(identitaSessione({ impostazioni: riga }).contratto, riga, 'la riga passata dal chiamante');
  assert.equal(identitaSessione({ dallElenco: riga }).contratto, riga, 'oppure quella che l\'elenco ha già in memoria: è la cura di BC-36');
  assert.equal(identitaSessione({ taskId: 'libero:full-access' }).contratto, null,
    '`null` non è «Workspace write»: è «non lo so», e chi chiama deve andarlo a chiedere invece di mostrare un default');
});

test('BC-36/2 — CANCELLO: `passaASessione` legge l\'elenco PRIMA di cadere sul default', () => {
  const inizio = APP.indexOf('function passaASessione(');
  assert.ok(inizio > 0, 'passaASessione deve esistere');
  const corpo = APP.slice(inizio, inizio + 6000);
  assert.ok(/const dallElencoSubito = state\.sessionSelection\.available\?\.get\?\.\(sessionId\) \?\? null;/.test(corpo),
    'la riga dell\'elenco si legge PRIMA del contratto, o il ramo «riclic sulla sessione già aperta» resta col default');
  assert.ok(/const contrattoSessione = impostazioniSessione \|\| dallElencoSubito \|\| \{ modello \};/.test(corpo),
    'ERA `impostazioniSessione || { modello }`: quel `{ modello }` è il difetto BC-36 per intero');
  assert.equal(/const contrattoSessione = impostazioniSessione \|\| \{ modello \};/.test(corpo), false,
    'la forma vecchia non deve tornare: è quella che mostrava «Scrive nel progetto» su una sessione ad accesso pieno');
});

test('BC-37/6 — CANCELLO: quando la fonte è «ripiego» si CHIEDE, con le due guardie', () => {
  const inizio = APP.indexOf('function passaASessione(');
  const corpo = APP.slice(inizio, inizio + 14000);
  assert.ok(/const identita = identitaSessione\(\{ nome, impostazioni: impostazioniSessione, dallElenco, taskId \}\);/.test(corpo),
    'il nome esce da UNA funzione sola, non da un `||` riscritto qui');
  assert.ok(/identita\.fonte === 'ripiego' \|\| identita\.contratto === null/.test(corpo),
    'si riconcilia quando il nome è un ripiego O quando il permesso non si conosce');
  assert.ok(/generation !== state\.realSession\.generation \|\| sessionId !== state\.realSession\.id/.test(corpo),
    'due guardie: mai scrivere il nome di una sessione che non è più quella a schermo');
  assert.ok(/if \(!riga\) return;/.test(corpo), 'se il server non la conosce si resta al ripiego: non si inventa');
  assert.ok(/if \(identita\.contratto === null\) applicaImpostazioniSessione\(riga\);/.test(corpo),
    'e il permesso vero si applica solo se prima non lo sapevamo — non si sovrascrive una scelta già nota');
});

test('BC-36/37, AL CONTRARIO — i cancelli RESPINGONO il sorgente com\'era prima della cura', () => {
  const guasto = `
    function passaASessione(sessionId, taskId, nome, modello, impostazioniSessione = null) {
      const contrattoSessione = impostazioniSessione || { modello };
      const dallElenco = state.sessionSelection.available?.get?.(sessionId) ?? null;
      state.session = nome || impostazioniSessione?.taskDelega || dallElenco?.nome || dallElenco?.taskDelega
        || nomeLeggibileSessione(taskId || dallElenco?.taskId);
      aggiornaElencoSessioniReali();
    }
  `;
  assert.equal(/const contrattoSessione = impostazioniSessione \|\| dallElencoSubito \|\| \{ modello \};/.test(guasto), false);
  assert.equal(/identitaSessione\(\{ nome, impostazioni: impostazioniSessione, dallElenco, taskId \}\)/.test(guasto), false);
  assert.equal(/identita\.fonte === 'ripiego'/.test(guasto), false, 'il sorgente vecchio non chiede niente a nessuno: va respinto');
});
