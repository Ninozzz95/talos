import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nomeModello, oraCompatta, statoSessione, nomeLeggibileSessione } from '../../src/components/session-item.js';
import { SPAZI_DI_LAVORO, STRUMENTI } from '../../src/components/nav-item.js';
import { fornitoreDelModello, nomeDaPercorso, testiPiede } from '../../src/components/workspace-footer.js';

test('WorkspaceFooter: cartella, tema e fornitore dai dati del monolite — e niente inventato', () => {
  assert.equal(nomeDaPercorso('C:\\Users\\esempio\\Desktop\\projects\\AVM\\'), 'AVM');
  assert.equal(nomeDaPercorso('/home/nino/talos'), 'talos');
  assert.equal(nomeDaPercorso(null), null);
  assert.equal(nomeDaPercorso('C:\\'), 'C:\\'); // la radice del disco non ha un nome: si mostra com'è
  assert.equal(nomeDaPercorso('/'), '/');
  assert.equal(fornitoreDelModello('local:qwen3-8b'), 'locale');
  assert.equal(fornitoreDelModello('google/gemini-3.7-flash'), 'google');
  assert.equal(fornitoreDelModello('claude-opus-5'), null);
  assert.deepEqual(testiPiede({ cartella: null, tema: 'calm', modello: 'local:x' }), { titolo: 'Workspace locale', sotto: 'Tema Calm · locale' });
  assert.deepEqual(testiPiede({ cartella: 'D:\\lavoro\\talos', tema: 'forge', modello: 'claude-opus-5' }), { titolo: 'talos', sotto: 'Tema Forge' });
  assert.equal(testiPiede({ cartella: null, nomeAnteprima: 'nuovo-progetto', tema: 'ignoto' }).titolo, 'nuovo-progetto');
  /*
   * ⛔ 10/09 — trovato guardando una foto: col tema **Violet** a schermo il piede diceva «Tema Calm».
   *   La mappa ne conosceva quattro su quattordici e il ripiego trasformava i mancanti in una bugia.
   *   Qui si prova ogni preset che le impostazioni offrono: se ne nasce un quindicesimo e nessuno
   *   aggiunge il nome, questo test lo dice invece di lasciarlo diventare «Calm».
   */
  for (const [id, atteso] of [['aurora', 'Aurora'], ['glacier', 'Glacier'], ['ember', 'Ember'], ['atlas', 'Atlas'], ['noir', 'Noir'], ['signal', 'Signal'], ['violet', 'Violet'], ['claudius', 'Claudius'], ['basicus', 'Basicus'], ['telemetry', 'Telemetry'], ['paper', 'Paper'], ['terminal', 'Terminal']]) {
    assert.equal(testiPiede({ cartella: null, tema: id }).sotto, `Tema ${atteso}`, `⛔ il tema ${id} si presentava con un altro nome`);
  }
  /* ⛔ AL CONTRARIO: un id che non esiste davvero non deve far sparire il piede — lì il ripiego serve. */
  assert.equal(testiPiede({ cartella: null, tema: 'inventato' }).sotto, 'Tema Calm');
});

/*
 * ⭐⭐⭐ BC-61 (17/09/2026) — IL PIEDE SCRIVEVA L'ID GREZZO DEL FORNITORE.
 *
 * Misurato: con `z-ai/glm-5.3-flash` in sessione il piede diceva «Tema Calm · z-ai». Non è «il
 * prefisso al posto del modello» (il sottotitolo è «Tema <preset> · <chi serve il modello>» per
 * scelta, 05/09): è un ID TECNICO a schermo, e la regola dell'owner del 04/09 dice che i nomi
 * tecnici non si mostrano mai, con la mappa id → nome umano in UN POSTO SOLO.
 *
 * ⛔ Il test passa TUTTI i fornitori del registro del frontend, non tre scelti a mano: se domani
 *   ne nasce uno e nessuno gli dà un nome, questa riga lo dice invece di lasciar comparire il suo
 *   id in fondo alla barra laterale.
 * ⛔ E si confronta la stringa INTERA, non «non contiene l'id»: `esterno` è un pezzo di «Agente
 *   esterno», quindi un `includes` negato passerebbe per costruzione proprio sul caso peggiore.
 */
test('BC-61 — il piede non scrive MAI l\'id del fornitore: ogni voce del registro ha il suo nome umano', async () => {
  const { PROVIDER_DIRETTI } = await import('../../src/components/fonti-modelli.js');
  assert.ok(PROVIDER_DIRETTI.length >= 20, `il registro dei fornitori si è svuotato: ${PROVIDER_DIRETTI.length} voci`);
  for (const fornitore of PROVIDER_DIRETTI) {
    const sotto = testiPiede({ cartella: null, tema: 'calm', modello: `${fornitore.id}/un-modello` }).sotto;
    assert.equal(sotto, `Tema Calm · ${fornitore.etichetta}`, `⛔ il fornitore ${fornitore.id} arriva a schermo senza nome umano`);
  }
});

test('BC-61, secondo giro — i tre fornitori FUORI dall\'elenco dei diretti hanno un nome, e la cassa non conta', () => {
  /*
   * ⛔ Misurato dal revisore: `openrouter`, `ollama` e `local` non stanno in `PROVIDER_DIRETTI`
   *   (è l'elenco dei fornitori DIRETTI e loro non lo sono), quindi il piede restava MUTO proprio
   *   per quelli che la app elenca per primi. Il buco era invisibile perché «niente» è anche la
   *   risposta giusta per un fornitore ignoto: le due si distinguono solo nominandoli.
   */
  assert.equal(testiPiede({ cartella: null, tema: 'calm', modello: 'openrouter/qualcosa' }).sotto, 'Tema Calm · OpenRouter');
  assert.equal(testiPiede({ cartella: null, tema: 'calm', modello: 'ollama/llama3' }).sotto, 'Tema Calm · Ollama');
  assert.equal(testiPiede({ cartella: null, tema: 'calm', modello: 'local:qwen3-8b' }).sotto, 'Tema Calm · locale', 'la parola del 05/09 non cambia: non è un fornitore, è «gira qui»');
  /* ⛔ D14 — la cassa: un id in maiuscolo è lo STESSO fornitore, non uno sconosciuto. */
  assert.equal(testiPiede({ cartella: null, tema: 'calm', modello: 'Z-AI/glm-5.3-flash' }).sotto, 'Tema Calm · Z.AI');
  assert.equal(testiPiede({ cartella: null, tema: 'calm', modello: 'OpenAI/gpt-5' }).sotto, 'Tema Calm · OpenAI');
});

test('BC-61 — i prefissi del catalogo (z-ai, x-ai, google, moonshotai, mistralai) arrivano al nome umano', () => {
  /*
   * Gli id del catalogo OpenRouter si scrivono in un altro modo dagli id delle API dirette: è la
   * stessa azienda con due grafie, e il ponte NON inventa nomi — porta a una voce che il registro
   * già ha. Il caso che ha fatto nascere BC-61 è il primo della lista.
   */
  for (const [prefisso, atteso] of [['z-ai', 'Z.AI'], ['x-ai', 'xAI'], ['google', 'Gemini'], ['moonshotai', 'Kimi'], ['mistralai', 'Mistral']]) {
    assert.equal(testiPiede({ cartella: null, tema: 'calm', modello: `${prefisso}/un-modello` }).sotto, `Tema Calm · ${atteso}`, `⛔ ${prefisso} non arriva a un nome umano`);
  }
  /* Il modello LOCALE non ha un fornitore: la parola resta quella, ed è vera. */
  assert.equal(testiPiede({ cartella: null, tema: 'calm', modello: 'local:qwen3-8b' }).sotto, 'Tema Calm · locale');
  /*
   * ⛔ AL CONTRARIO, e qui la scelta è deliberata: di un prefisso che NESSUNO sa nominare non si
   *   scrive l'id — si tace la seconda metà. Inventare un nome sarebbe una bugia; stampare l'id è
   *   il difetto che stiamo togliendo. Un buco visibile è l'unica terza via onesta.
   */
  assert.equal(testiPiede({ cartella: null, tema: 'calm', modello: 'fornitore-mai-visto/modello' }).sotto, 'Tema Calm');
});

/*
 * Le funzioni PURE dei componenti della sidebar (Fase 2, S-01 e S-02). Il
 * markup lo prova il cancello dei componenti contro il mockup; qui si provano
 * le derivazioni, anche al VERSO CONTRARIO (regola 5-bis).
 */

test('statoSessione: l\'ordine degli stati — attesa prima di vivo, interrotta prima di conclusa', () => {
  assert.equal(statoSessione({ inAttesaApprovazione: true, conclusa: false }).classe, 'attesa');
  assert.equal(statoSessione({ conclusa: false }).classe, 'vivo');
  assert.equal(statoSessione({ conclusa: true, interrotta: true, ultimoEsito: 'successo' }).classe, 'interrotto');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'errore' }).testo, 'errore');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'giri-finiti' }).testo, 'giri finiti');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo' }).tono, 'success');
});

test('⛔ T05-D3: una sessione uccisa dal riavvio del server NON è «in corso» — è interrotta', () => {
  /*
   * Il caso VERO che il server manda (session-registry, ripristino: `interrotta: !conclusa`):
   * `conclusa:false` E `interrotta:true`. Il test che c'era provava `{conclusa:true, interrotta:true}`,
   * una combinazione che il server non produce MAI — per questo passava con l'ordine sbagliato,
   * mentre a schermo quattro sessioni morte da due ore dicevano ancora «in corso» col pallino vivo.
   */
  const morta = statoSessione({ conclusa: false, interrotta: true });
  assert.equal(morta.classe, 'interrotto');
  assert.equal(morta.tono, null, 'niente pallino vivo su una sessione che nessuno sta eseguendo');
  assert.equal(morta.testo, 'interrotta', 'corta come le sorelle: in 180 px una frase lunga tronca e mangia il modello');
  assert.match(morta.aiuto, /Scrivi un messaggio per riprenderla/u, 'dire che è ferma non basta: il come-si-riparte vive nel titolo della riga');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo' }).aiuto, null, 'nessun titolo dove non serve');
});

test('⛔ AL CONTRARIO — una sessione DAVVERO viva resta «in corso», e chi aspetta te vince su tutto', () => {
  // `interrotta` si azzera quando un giro riparte: metterla per prima non può spegnere una sessione viva.
  assert.equal(statoSessione({ conclusa: false, interrotta: false }).classe, 'vivo');
  assert.equal(statoSessione({ conclusa: false, interrotta: false }).tono, 'live');
  // e una sessione interrotta che però aspetta una risposta chiede ancora qualcosa alla persona
  assert.equal(statoSessione({ conclusa: false, interrotta: true, inAttesaApprovazione: true }).classe, 'attesa');
});

test('statoSessione: nessun esito registrato NON è un successo (niente pallino colorato)', () => {
  const s = statoSessione({ conclusa: true });
  assert.equal(s.classe, 'ignoto');
  assert.equal(s.tono, null);
  assert.match(s.testo, /esito non registrato/u);
});

test('oraCompatta: oggi l\'ora, ieri «ieri», poi i giorni, poi la data', () => {
  const adesso = new Date('2026-09-04T18:30:00');
  assert.equal(oraCompatta('2026-09-04T18:09:00', adesso), '18:09');
  assert.equal(oraCompatta('2026-09-03T23:59:00', adesso), 'ieri');
  assert.equal(oraCompatta('2026-09-02T08:00:00', adesso), '2 g');
  assert.equal(oraCompatta('2026-08-20T08:00:00', adesso), '20/08');
  assert.equal(oraCompatta('non-una-data', adesso), '');
});

test('nomeModello: via il fornitore, mai una stringa vuota', () => {
  assert.equal(nomeModello('google/gemini-3.7-flash'), 'gemini-3.7-flash');
  assert.equal(nomeModello('claude-opus-5'), 'claude-opus-5');
  assert.equal(nomeModello(''), null);
  assert.equal(nomeModello(undefined), null);
});

/*
 * 11/09, lotto A — i «Luoghi» del mockup di Fase 2 sono diventati i DUE gruppi del mockup
 * interattivo dell'owner. La prova cambia con loro: se le liste del componente e le voci del
 * template divergono, il laboratorio disegna una barra che nel prodotto non esiste — ed è il modo
 * in cui una vetrina smette di dire il vero senza che nessuno se ne accorga.
 */
test('SPAZI DI LAVORO e STRUMENTI: le voci dei due gruppi, nell\'ordine del mockup', () => {
  assert.deepEqual(SPAZI_DI_LAVORO.map((l) => l.vaia), ['chat', 'note', 'attivita', 'libreria', 'memoria', 'ricerca', 'progetti', 'board']);
  assert.deepEqual(STRUMENTI.map((l) => l.vaia), ['modelli', 'capability', 'officina', 'automazioni', 'doctor']);
  /* «Note» conta la lista della sessione aperta (`/notes`), che ha una chiave sua: senza
     `conteggio`, il badge finirebbe sulla voce sbagliata o non arriverebbe affatto. */
  assert.deepEqual(SPAZI_DI_LAVORO.filter((l) => l.conteggio).map((l) => l.conteggio), ['note']);
  /* ⛔ Nessuna voce senza icona: nella barra compressa a icone resterebbe un vuoto premibile. */
  assert.deepEqual([...SPAZI_DI_LAVORO, ...STRUMENTI].filter((l) => !l.icona), []);
});

/*
 * ⛔ 07/9, misurato dal vivo: una sessione FERMATA dall'owner mostrava «errore» nella sidebar,
 * perché il giro si chiude con `RunError` di codice `fermato` e l'elenco conosceva solo l'esito.
 * Provato anche AL VERSO CONTRARIO: un errore vero deve continuare a dire «errore».
 */
test('una sessione fermata dall owner dice «fermata», non «errore»', () => {
  const fermata = statoSessione({ conclusa: true, interrotta: false, ultimoEsito: 'errore', motivoChiusura: 'fermata' });
  assert.equal(fermata.classe, 'fermata');
  assert.equal(fermata.testo, 'fermata');
  assert.match(fermata.aiuto, /fermata tu/);
});

test('un errore VERO resta «errore» — la cura non nasconde i guasti', () => {
  const guasto = statoSessione({ conclusa: true, interrotta: false, ultimoEsito: 'errore', motivoChiusura: 'errore' });
  assert.equal(guasto.classe, 'errore');
  assert.equal(guasto.testo, 'errore');
  assert.equal(guasto.tono, 'danger');
});

test('senza motivo di chiusura non si inventa niente: resta «errore»', () => {
  assert.equal(statoSessione({ conclusa: true, interrotta: false, ultimoEsito: 'errore' }).classe, 'errore');
});

/*
 * ⛔ 07/9 — «libero:full-access · fork» era un identificatore interno a schermo, in sidebar e
 * nell'albero. Provato anche al verso contrario: un nome scelto dall'owner vince sempre, e un
 * taskId di forma sconosciuta si mostra com'è invece di sparire in una parola generica.
 */
test('un taskId tecnico diventa un nome leggibile', () => {
  assert.equal(nomeLeggibileSessione('libero:progetto-3'), 'Compito libero · progetto-3');
  assert.equal(nomeLeggibileSessione('libero:full-access'), 'Compito libero · cartella scelta a mano');
  assert.equal(nomeLeggibileSessione('libero:default'), 'Compito libero');
  /*
   * ⛔ 08/09 — qui l'atteso era `Delega · analisi`, cioè «Delega · <id della madre>»: sullo schermo
   *   diventava `Delega · e02f5d85-b610-4e3b-…`, un identificatore grezzo (vietato) e identico per
   *   tutte le figlie della stessa madre — due righe indistinguibili. Il test lo confermava perché
   *   la fixture usava un id finto e leggibile («analisi»), che nella app non esiste.
   * ⇒ Il nome di una figlia è il suo COMPITO (`taskDelega`, dall'elenco); questo è solo il ripiego.
   */
  assert.equal(nomeLeggibileSessione('delega:e02f5d85-b610-4e3b-8a91-a7589e5863c6'), 'Sotto-agente');
  assert.equal(nomeLeggibileSessione('delega:'), 'Sotto-agente', 'nessun id a schermo, in nessun caso');
});

test('senza taskId non si inventa un nome, e una forma sconosciuta resta com è', () => {
  assert.equal(nomeLeggibileSessione(''), 'Sessione senza nome');
  assert.equal(nomeLeggibileSessione(null), 'Sessione senza nome');
  assert.equal(nomeLeggibileSessione('corpus/refactor-42'), 'corpus/refactor-42');
});
