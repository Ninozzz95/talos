import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { API_SCHEMA, createHttpApp } from '../src/http-app.mjs';
// ⭐⭐⭐ 04/9 — W0-08: SOLO per il test "la rotta HTTP provata davvero" più
// sotto — un registro VERO (non il fake di questo file), per provare che
// `POST /api/v1/sessions` non allarga il workspace passando dal livello
// HTTP vero fino a `avvia()` vero, non solo dalla funzione isolata (già
// provata in session-registry.test.mjs).
import { createSessionRegistry } from '../src/session-registry.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';

// ⛔ Un sessionRegistry FINTO, scritto qui apposta: session-registry.mjs ha
// già i suoi 10 test (buffer, iscrizione tardiva, stop). Questo file prova
// SOLO il livello HTTP — status code, buste, framing SSE — con un doppio
// minimo che il test stesso controlla riga per riga.
function registroFinto() {
  const sessioni = new Map();
  let contatore = 0;
  return {
    ultimeOpzioniAvvio: null,
    avvia(taskId, opzioni = {}) {
      this.ultimeOpzioniAvvio = opzioni;
      if (taskId === 'task-vietato') return { erroreAvvio: 'non ammesso', code: 'TASK_NOT_ALLOWED' };
      if (taskId === 'task-senza-chiave') return { erroreAvvio: 'chiave assente', code: 'CONFIG_INVALID' };
      contatore += 1;
      const sessionId = `sess-${contatore}`;
      sessioni.set(sessionId, { eventi: [], ascoltatori: new Set(), taskId, avviataAlle: '2026-08-24T18:00:00.000Z', conclusa: false });
      return { sessionId };
    },
    forka(idOrigine) {
      const voce = sessioni.get(idOrigine);
      if (!voce) return { erroreAvvio: 'Sessione origine non trovata', code: 'NOT_FOUND' };
      if (!voce.conclusa) return { erroreAvvio: 'La sessione origine è ancora in corso', code: 'SESSION_NOT_READY' };
      contatore += 1;
      const sessionId = `sess-${contatore}`;
      sessioni.set(sessionId, { eventi: [], ascoltatori: new Set(), taskId: voce.taskId, avviataAlle: '2026-08-24T18:05:00.000Z', conclusa: false, forkDa: idOrigine });
      return { sessionId };
    },
    ultimoResume: null,
    resume(sessionId, nuovoMessaggioUtente = null) {
      this.ultimoResume = { sessionId, nuovoMessaggioUtente };
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (!voce.conclusa) return { erroreAvvio: 'La sessione è ancora in corso', code: 'SESSION_NOT_READY' };
      voce.conclusa = false;
      return { sessionId };
    },
    ultimeImpostazioniSessione: null,
    async aggiornaImpostazioni(sessionId, patch) {
      this.ultimeImpostazioniSessione = { sessionId, patch };
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      Object.assign(voce, patch);
      return { ok: true };
    },
    rinomina(sessionId, nome) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const pulito = typeof nome === 'string' ? nome.trim() : '';
      if (pulito.length === 0 || pulito.length > 80) return { erroreAvvio: 'Nome non valido', code: 'QUERY_INVALID' };
      voce.nome = pulito;
      return { ok: true };
    },
    async compatta(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (!voce.conclusa) return { erroreAvvio: 'La sessione è ancora in corso', code: 'SESSION_NOT_READY' };
      voce.compattata = true; // solo per il test: prova che la rotta ha davvero raggiunto il registro
      return { ok: true, compattato: true };
    },
    async albero(sessionId, percorso = '') {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (percorso.includes('..')) return { erroreAvvio: 'Percorso non valido', code: 'QUERY_INVALID' };
      return { ok: true, voci: [{ nome: `${percorso || 'radice'}-finto.txt`, cartella: false }] };
    },
    async anteprimaAlbero(projectId, percorso = '') {
      if (projectId !== 'p1') return { erroreAvvio: 'Progetto non trovato', code: 'NOT_FOUND' };
      if (percorso.includes('..')) return { erroreAvvio: 'Percorso non valido', code: 'QUERY_INVALID' };
      return { ok: true, voci: [{ nome: `${percorso || 'radice'}-preview.txt`, cartella: false }] };
    },
    elenca() {
      return [...sessioni.entries()]
        .map(([sessionId, voce]) => ({ sessionId, taskId: voce.taskId, nome: voce.nome ?? null, avviataAlle: voce.avviataAlle, conclusa: voce.conclusa, forkDa: voce.forkDa ?? null }))
        .sort((a, b) => b.avviataAlle.localeCompare(a.avviataAlle));
    },
    esporta(id) {
      const voce = sessioni.get(id);
      if (!voce) return null;
      return { schema: 'talos.harness-ui.session-export.v1', sessionId: id, taskId: voce.taskId, nome: voce.nome ?? null, avviataAlle: voce.avviataAlle, conclusa: voce.conclusa, forkDa: voce.forkDa ?? null, eventi: voce.eventi };
    },
    esiste(id) { return sessioni.has(id); },
    iscriviti(id, callback) {
      const voce = sessioni.get(id);
      if (!voce) return () => {};
      for (const evento of voce.eventi) callback(evento);
      voce.ascoltatori.add(callback);
      return () => voce.ascoltatori.delete(callback);
    },
    ultimaFermata: null,
    ferma(id, opzioni = {}) { this.ultimaFermata = { sessionId: id, opzioni }; return sessioni.has(id); },
    ultimoReindirizzamento: null,
    ultimoRedirectId: null,
    reindirizza(sessionId, testo, opzioni = {}) {
      this.ultimoReindirizzamento = { sessionId, testo };
      this.ultimoRedirectId = opzioni.redirectId ?? null;
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (voce.conclusa) return { erroreAvvio: 'La sessione non è in corso', code: 'SESSION_NOT_READY' };
      return { ok: true, redirectId: 'redirect-finto' };
    },
    // Solo per il test: mette un evento nel buffer e lo spinge ai vivi.
    _emetti(id, evento) {
      const voce = sessioni.get(id);
      voce.eventi.push(evento);
      if (evento.type === 'RunFinished' || evento.type === 'RunError') voce.conclusa = true;
      for (const callback of voce.ascoltatori) callback(evento);
    },
    /*
     * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI: aggiunta minima al fake, stesso
     * stile di `avvia` sopra — cattura le opzioni ricevute per provare
     * che la rotta HTTP le inoltra fedelmente, senza far girare
     * nessuna sessione vera.
     */
    ultimeOpzioniAvvioLibero: null,
    avviaLibero(opzioni = {}) {
      this.ultimeOpzioniAvvioLibero = opzioni;
      if (opzioni.cartellaLibera && opzioni.permessi !== 'Full access') {
        return { erroreAvvio: 'cartellaLibera richiede il permesso "Full access"', code: 'QUERY_INVALID' };
      }
      contatore += 1;
      const sessionId = `sess-${contatore}`;
      sessioni.set(sessionId, { eventi: [], ascoltatori: new Set(), taskId: `libero:${opzioni.cartellaId ?? 'full-access'}`, avviataAlle: '2026-08-24T18:00:00.000Z', conclusa: false });
      return { sessionId };
    },
    ultimaRispostaApprovazione: null,
    rispondiApprovazione(sessionId, requestId, approvato) {
      this.ultimaRispostaApprovazione = { sessionId, requestId, approvato };
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (requestId !== 'richiesta-vera') return { erroreAvvio: 'Nessuna approvazione in attesa con questo id', code: 'QUERY_INVALID' };
      return { ok: true };
    },
    /*
     * ⭐⭐⭐ 28/8 — FASE A (hook): stesso stile di rispondiApprovazione sopra
     * — cattura la chiamata per provare che la rotta HTTP raggiunge
     * davvero il registro, senza fingere una vera hooks.json.
     */
    async elencaHooks(sessionId) {
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (sessionId === 'sess-hooks-rotti') return { ok: true, hooks: null, errore: '.harness-ui-hooks.json non è un JSON valido' };
      return { ok: true, hooks: [{ id: 'audit', eventi: ['pre_tool_call'], fidato: false }], errore: null };
    },
    /*
     * ⭐⭐⭐ FASE C (28/8) — sub-agenti: stesso stile di elencaHooks sopra
     * — cattura la chiamata per provare che la rotta HTTP raggiunge
     * davvero il registro, senza fingere una vera delega.
     */
    elencaFigli(sessionId) {
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      return { ok: true, figli: [{ sessionId: 'figlio-finto', task: 'un compito delegato', conclusa: true, esitoDelega: 'concluso', avviataAlle: '2026-08-28T10:00:00.000Z' }] };
    },
    ultimaFiduciaHook: null,
    async fidaHook(sessionId, hookId) {
      this.ultimaFiduciaHook = { sessionId, hookId };
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (hookId === 'hook-inesistente') return { erroreAvvio: `Hook "${hookId}" non trovato in .harness-ui-hooks.json`, code: 'NOT_FOUND' };
      if (hookId === 'hook-file-rotto') return { erroreAvvio: '.harness-ui-hooks.json non è un JSON valido', code: 'HOOK_INVALID' };
      return { ok: true };
    },
    /*
     * ⭐⭐⭐ 29/8 — FASE E: stesso stile esatto di elencaHooks/fidaHook
     * appena sopra — cattura la chiamata per provare che la rotta HTTP
     * raggiunge davvero il registro, senza fingere una vera
     * .harness-ui-mcp.json.
     */
    async elencaServerMcp(sessionId) {
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (sessionId === 'sess-mcp-rotti') return { ok: true, server: null, errore: '.harness-ui-mcp.json non è un JSON valido' };
      return { ok: true, server: [{ id: 'filesystem', comando: 'npx', argomenti: [], allowlist: ['read_file'], fidato: false }], errore: null };
    },
    /*
     * ⭐⭐⭐ 29/8 — FASE F: stesso stile esatto di elencaServerMcp appena
     * sopra — cattura la chiamata per provare che la rotta HTTP
     * raggiunge davvero il registro, senza fingere una vera
     * .harness-ui-skills/.
     */
    async elencaSkill(sessionId) {
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (sessionId === 'sess-skills-rotte') return { ok: true, skills: null, errore: '.harness-ui-skills/rotta/SKILL.md non è valido' };
      return { ok: true, skills: [{ id: 'code-review', name: 'code-review', description: 'Revisione in due assi.' }], errore: null };
    },
    /*
     * ⭐⭐⭐ 29/8 — FASE N: stesso stile esatto di elencaSkill appena
     * sopra — cattura la chiamata per provare che la rotta HTTP
     * raggiunge davvero il registro, senza fingere una vera
     * .harness-ui-library/.
     */
    async elencaLibreria(sessionId) {
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (sessionId === 'sess-libreria-rotta') return { ok: true, voci: null, errore: '.harness-ui-library/rotta/meta.json non è un JSON valido' };
      return { ok: true, voci: [{ id: 'lib-1', nome: 'report.md', fileType: 'document', origine: 'uploaded', aggiornatoIl: '2026-08-29T10:00:00.000Z' }], errore: null };
    },
    /*
     * ⭐⭐⭐ FASE N, quarto sistema (30/8): stesso stile esatto di
     * elencaLibreria appena sopra — cattura la chiamata per provare
     * che la rotta HTTP raggiunge davvero il registro, senza fingere
     * una vera .notes-store/.
     */
    async elencaNote(sessionId) {
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (sessionId === 'sess-note-rotte') return { ok: true, note: null, errore: '.notes-store/rotta.json non è un JSON valido' };
      return { ok: true, note: [{ id: 'nota-1', titolo: 'Codice cancello', contenuto: '4471', aggiornataAlle: '2026-08-30T10:00:00.000Z' }], errore: null };
    },
    /*
     * ⭐⭐⭐ FASE N, quinto sistema (30/8): stesso stile esatto di
     * elencaNote appena sopra.
     */
    async elencaAttivita(sessionId) {
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (sessionId === 'sess-tasks-rotti') return { ok: true, attivita: null, errore: '.tasks-store/rotta.json non è un JSON valido' };
      return { ok: true, attivita: [{ id: 'task-1', titolo: 'Chiama idraulico', descrizione: null, priorita: 'high', stato: 'todo', aggiornataAlle: '2026-08-30T10:00:00.000Z' }], errore: null };
    },
    /*
     * ⭐⭐⭐ FASE N, sesto sistema (30/8): stesso stile esatto di
     * elencaAttivita appena sopra.
     */
    async elencaMemorie(sessionId) {
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (sessionId === 'sess-memoria-rotta') return { ok: true, memorie: null, errore: '.memory-store/rotta.json non è un JSON valido' };
      return { ok: true, memorie: [{ id: 'mem-1', titolo: 'Preferenze risposta', contenuto: 'Risposte brevi', genere: 'preference', aggiornataAlle: '2026-08-30T10:00:00.000Z' }], errore: null };
    },
    /*
     * ⭐⭐⭐ FASE N, ottavo sistema (30/8): stesso stile esatto di
     * elencaMemorie appena sopra — a differenza di quella (GLOBALE),
     * questa è PER-PROGETTO come Libreria, ma il fake resta identico
     * (la differenza vive in session-registry.mjs, non in questa rotta).
     */
    async elencaRicerche(sessionId) {
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (sessionId === 'sess-ricerca-rotta') return { ok: true, ricerche: null, errore: '.harness-ui-research/rotta.json non è un JSON valido' };
      return { ok: true, ricerche: [{ id: 'sess-ricerca-1', titolo: 'Il caching di OpenRouter', stato: 'done', avviataAlle: '2026-08-30T10:00:00.000Z' }], errore: null };
    },
    /*
     * ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8): stesso stile esatto di
     * elencaRicerche appena sopra.
     */
    async elencaToolForgiati(sessionId) {
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (sessionId === 'sess-forge-rotta') return { ok: true, strumenti: null, errore: '.tool-forge-store/rotta.json non è un JSON valido' };
      return { ok: true, strumenti: [{ id: 'log-water-intake', titolo: 'Log water intake', descrizione: 'x', capacita: ['notes.create'], rischio: 'R2', abilitato: false, installatoAlle: '2026-08-30T10:00:00.000Z' }], errore: null };
    },
    ultimaAbilitaForge: null,
    async abilitaToolForgiato(sessionId, id, abilitato) {
      this.ultimaAbilitaForge = { sessionId, id, abilitato };
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (id === 'tool-inesistente') return { erroreAvvio: `Tool forgiato "${id}" non trovato in .tool-forge-store/`, code: 'NOT_FOUND' };
      return { ok: true };
    },
    ultimaFiduciaServerMcp: null,
    async fidaServerMcp(sessionId, serverId) {
      this.ultimaFiduciaServerMcp = { sessionId, serverId };
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (serverId === 'server-inesistente') return { erroreAvvio: `Server MCP "${serverId}" non trovato in .harness-ui-mcp.json`, code: 'NOT_FOUND' };
      if (serverId === 'server-file-rotto') return { erroreAvvio: '.harness-ui-mcp.json non è un JSON valido', code: 'MCP_INVALID' };
      return { ok: true };
    },
    /*
     * ⭐⭐⭐ 29/8 — FASE G: stesso stile esatto di elencaServerMcp/fidaServerMcp
     * appena sopra — cattura la chiamata per provare che la rotta HTTP
     * raggiunge davvero il registro, senza fingere una vera .harness-ui-plugins/.
     */
    async elencaPlugin(sessionId) {
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (sessionId === 'sess-plugin-rotti') return { ok: true, plugin: null, errore: '.harness-ui-plugins/esempio/plugin.json non è un JSON valido' };
      return { ok: true, plugin: [{ id: 'esempio', nome: 'esempio', descrizione: 'un plugin di prova', hooks: [], tools: [{ nome: 'conta_righe', descrizione: 'conta', parametri: {}, comando: 'echo 3' }], fidato: false, avvisi: [] }], errore: null };
    },
    ultimaFiduciaPlugin: null,
    async fidaPlugin(sessionId, pluginId) {
      this.ultimaFiduciaPlugin = { sessionId, pluginId };
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (pluginId === 'plugin-inesistente') return { erroreAvvio: `Plugin "${pluginId}" non trovato in .harness-ui-plugins/`, code: 'NOT_FOUND' };
      if (pluginId === 'plugin-file-rotto') return { erroreAvvio: '.harness-ui-plugins/esempio/plugin.json non è un JSON valido', code: 'PLUGIN_INVALID' };
      return { ok: true };
    },
    /*
     * ⭐⭐⭐ FASE D (28/8) — coda messaggi: stesso stile di
     * rispondiApprovazione/fidaHook sopra — cattura la chiamata per
     * provare che la rotta HTTP raggiunge davvero il registro.
     * `voce.conclusa` è lo stato VERO (impostato da _emetti su
     * RunFinished/RunError, come resume()/forka() sopra) — non un ID
     * sentinella inventato.
     */
    ultimoAccodaMessaggio: null,
    codaFinta: new Map(), // sessionId -> array di messaggi, solo per il test
    accodaMessaggio(sessionId, testo) {
      this.ultimoAccodaMessaggio = { sessionId, testo };
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (voce.conclusa) return { erroreAvvio: 'La sessione è già conclusa: usa resume(), non la coda', code: 'SESSION_NOT_READY' };
      const coda = this.codaFinta.get(sessionId) ?? [];
      coda.push(testo);
      this.codaFinta.set(sessionId, coda);
      return { ok: true, posizione: coda.length };
    },
    ultimaSvuotaCoda: null,
    svuotaCoda(sessionId) {
      this.ultimaSvuotaCoda = sessionId;
      if (!sessioni.has(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const coda = this.codaFinta.get(sessionId) ?? [];
      const rimosso = coda.length > 0;
      if (rimosso) coda.pop();
      return { ok: true, rimosso };
    },
  };
}

async function listen(t, { sessionRegistry = registroFinto(), listaTaskDisponibili, impostaIntervalloFn, cancellaIntervalloFn } = {}) {
  const app = createHttpApp({
    staticHandler: async () => null,
    sessionRegistry,
    listaTaskDisponibili: listaTaskDisponibili ?? (() => [{ id: 'sconto-a-scaglioni', progetto: 'listino', difficolta: 1, consegnaCorta: 'x' }]),
    ...(impostaIntervalloFn ? { impostaIntervalloFn } : {}),
    ...(cancellaIntervalloFn ? { cancellaIntervalloFn } : {}),
  });
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, sessionRegistry };
}

test('GET /api/v1/tasks torna l\'elenco leggero, avvolto nella busta standard', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/tasks`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.meta.schema, API_SCHEMA);
  assert.deepEqual(corpo.data.items, [{ id: 'sconto-a-scaglioni', progetto: 'listino', difficolta: 1, consegnaCorta: 'x' }]);
});

test('GET /api/v1/tasks mantiene una risposta onesta quando il catalogo non è disponibile', async (t) => {
  const { base } = await listen(t, { listaTaskDisponibili: () => [] });
  const risposta = await fetch(`${base}/api/v1/tasks`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.deepEqual(corpo.data.items, []);
});

test('⭐ GET /api/v1/sessions torna un elenco vuoto senza sessioni, e un riepilogo per ognuna dopo', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  assert.deepEqual((await (await fetch(`${base}/api/v1/sessions`)).json()).data.items, []);

  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const corpo = await (await fetch(`${base}/api/v1/sessions`)).json();
  assert.equal(corpo.data.items.length, 1);
  assert.equal(corpo.data.items[0].sessionId, sessionId);
  assert.ok(!('eventi' in corpo.data.items[0]), 'la lista è leggera, mai gli eventi interi di ogni sessione');
});

test('GET /api/v1/sessions resta un elenco leggibile (vuoto) anche senza sessionRegistry configurato', async (t) => {
  const { base } = await listen(t, { sessionRegistry: null });
  const risposta = await fetch(`${base}/api/v1/sessions`);
  assert.equal(risposta.status, 200);
  assert.deepEqual((await risposta.json()).data.items, []);
});

test('POST /api/v1/sessions con un taskId valido torna 200 e un sessionId', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni' }),
  });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(typeof corpo.data.sessionId, 'string');
  assert.ok(corpo.data.sessionId.length > 0);
});

test('⛔ POST /api/v1/sessions rifiuta un corpo che non è ESATTAMENTE {taskId} o {taskId, client}', async (t) => {
  const { base } = await listen(t);
  const corpiCattivi = [
    {}, // manca taskId
    { taskId: 123 }, // tipo sbagliato
    { taskId: '' }, // vuoto
    { taskId: 'x', modello: 'qualcosa' }, // ⛔ mai modello dal client
    { taskId: 'x', chiave: 'segreta' }, // ⛔ mai la chiave dal client
    // ⛔ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — 'client'
    // è un'allowlist di due soli valori, non una stringa libera.
    { taskId: 'x', client: 'bogus' },
    { taskId: 'x', client: 123 },
    { taskId: 'x', client: '' },
  ];
  for (const corpo of corpiCattivi) {
    const risposta = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    assert.equal(risposta.status, 400, JSON.stringify(corpo));
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  }
});

/**
 * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 (§3.2 del
 * prompt) — `client:'mobile'` è l'unico valore che cambia qualcosa: il
 * server lo traduce in `{mobile:true}` verso `sessionRegistry.avvia()`.
 *
 * ⛔ Riconciliazione Fase 1 (branch merge, 27/8): `avvia()` accetta un
 * oggetto opzioni (`modelloScelto`/`reasoningScelto`/`mobile`/
 * `permessiScelto`/`permessiPerAttrezzoScelto`, quest'ultimo FASE B 28/8)
 * — `requireTaskIdBody` li passa SEMPRE tutti, `null` quando assenti dal
 * corpo. L'asserzione verifica l'oggetto INTERO, non solo `mobile`, per
 * restare vera contro la firma reale invece di una vecchia più stretta.
 */
test('POST /api/v1/sessions con client:\'mobile\' passa {mobile:true} a sessionRegistry.avvia', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', client: 'mobile' }),
  });
  assert.equal(risposta.status, 200);
  assert.deepEqual(sessionRegistry.ultimeOpzioniAvvio, { modelloScelto: null, modelloPlannerScelto: null, reasoningScelto: null, mobile: true, permessiScelto: null, permessiPerAttrezzoScelto: null });
});

test('⛔ AL CONTRARIO: client:\'desktop\' ESPLICITO e client ASSENTE producono entrambi {mobile:false} — nessuna differenza di comportamento', async (t) => {
  const { base, sessionRegistry } = await listen(t);

  await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', client: 'desktop' }),
  });
  assert.deepEqual(sessionRegistry.ultimeOpzioniAvvio, { modelloScelto: null, modelloPlannerScelto: null, reasoningScelto: null, mobile: false, permessiScelto: null, permessiPerAttrezzoScelto: null });

  await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni' }),
  });
  assert.deepEqual(sessionRegistry.ultimeOpzioniAvvio, { modelloScelto: null, modelloPlannerScelto: null, reasoningScelto: null, mobile: false, permessiScelto: null, permessiPerAttrezzoScelto: null });
});

/*
 * ⭐⭐⭐ 29/8 — FASE K, R2 planner costoso + editor economico. Stesso
 * stile esatto del test client:'mobile' sopra.
 */
test('⭐⭐⭐ POST /api/v1/sessions con modelloPlanner lo passa a sessionRegistry.avvia, invariato', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', modello: 'qwen/qwen3.8-flash', modelloPlanner: 'z-ai/glm-5.3-flash' }),
  });
  assert.equal(risposta.status, 200);
  assert.equal(sessionRegistry.ultimeOpzioniAvvio.modelloPlannerScelto, 'z-ai/glm-5.3-flash');
});

test('⛔⛔ AL CONTRARIO — POST /api/v1/sessions con modelloPlanner malformato (niente "vendor/nome"): 400 QUERY_INVALID, avvia MAI chiamato', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', modelloPlanner: 'senza-slash' }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  assert.equal(sessionRegistry.ultimeOpzioniAvvio, null, 'avvia non deve mai essere chiamato su un corpo rifiutato');
});

/*
 * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI, sui DUE endpoint di avvio. Ricerca
 * (REGOLA ZERO, e HERMES AGENT è il primo competitor — vedi memoria
 * [[harness-da-battere-uno-a-uno]]): Codex CLI separa sandbox_mode/
 * approval_policy in due assi, la sicurezza 2026 boccia le denylist —
 * qui si prova che la FORMA del corpo (non solo la logica interna,
 * già provata in session-registry.test.mjs) applica davvero quelle
 * scelte al confine HTTP, dove un client diretto (non il frontend)
 * potrebbe provare ad aggirarle.
 */
test('⭐⭐⭐ POST /api/v1/sessions con permessi:"Read only" lo inoltra a sessionRegistry.avvia come permessiScelto', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', permessi: 'Read only' }),
  });
  assert.equal(risposta.status, 200);
  assert.equal(sessionRegistry.ultimeOpzioniAvvio.permessiScelto, 'Read only');
});

test('⛔⛔ POST /api/v1/sessions con un permessi INVENTATO: QUERY_INVALID, mai una sessione avviata con un valore a caso', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', permessi: 'Super Admin' }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  assert.equal(sessionRegistry.ultimeOpzioniAvvio, null, 'mai raggiunto il registro con un permesso non valido');
});

/*
 * ⭐⭐⭐ 04/9 — W0-08: la rotta VERA, non il fake — `POST /api/v1/sessions`
 * con `{taskId, permessi:'Full access'}` non deve produrre un workspace
 * diverso dalla cartella del task, da QUALUNQUE client HTTP diretto
 * (nessun frontend nel mezzo). Un `sessionRegistry` reale (stesso
 * pattern iniettabile di session-registry.test.mjs: `avviaSessioneFn`
 * cattura `input.cartella` invece di far girare un agente vero) wired
 * dentro lo stesso `createHttpApp`/`listen()` di questo file — la
 * differenza rispetto a tutti gli altri test qui sopra è SOLO questa
 * iniezione, la richiesta HTTP è identica.
 */
test('⭐⭐⭐ W0-08 — POST /api/v1/sessions con permessi:"Full access" su un task del catalogo NON allarga il workspace alla radice del disco (registro VERO, non il fake)', async (t) => {
  const catturati = [];
  const avviaSessioneFn = async (input) => {
    catturati.push(input.cartella);
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1' });
    return { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } };
  };
  const preparaEsecuzioneFn = (taskId) => {
    if (taskId !== 'sconto-a-scaglioni') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
    return { cartella: 'C:\\corpus\\sconto-a-scaglioni-9f2', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
  };
  const sessionRegistryVero = createSessionRegistry({
    avviaSessioneFn, preparaEsecuzioneFn, guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k',
  });
  const { base } = await listen(t, { sessionRegistry: sessionRegistryVero });

  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', permessi: 'Full access' }),
  });

  assert.equal(risposta.status, 200);
  assert.equal((await risposta.json()).ok, true);
  assert.equal(catturati.length, 1, 'la sessione deve essere partita davvero, attraverso la rotta HTTP');
  assert.equal(catturati[0], 'C:\\corpus\\sconto-a-scaglioni-9f2', 'RIPRODOTTO E CORRETTO (W0-08): "Full access" da un client HTTP diretto non deve allargare un task del catalogo alla radice del disco (C:\\)');
});

test('⭐⭐⭐ POST /api/v1/sessions/custom con cartellaLibera+permessi:"Full access" arriva davvero al registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/custom`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartellaLibera: 'C:/qualunque/percorso', consegna: 'fai qualcosa', permessi: 'Full access' }),
  });
  assert.equal(risposta.status, 200);
  assert.equal(sessionRegistry.ultimeOpzioniAvvioLibero.cartellaLibera, 'C:/qualunque/percorso');
  assert.equal(sessionRegistry.ultimeOpzioniAvvioLibero.permessi, 'Full access');
  assert.equal(sessionRegistry.ultimeOpzioniAvvioLibero.cartellaId, undefined);
});

test('⛔⛔⛔ AL CONTRARIO — POST /api/v1/sessions/custom con cartellaLibera ma SENZA "Full access": il registro rifiuta, non l\'HTTP — verificato che raggiunga comunque il cancello vero', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/custom`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartellaLibera: 'C:/qualunque/percorso', consegna: 'fai qualcosa', permessi: 'Workspace write' }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  assert.ok(sessionRegistry.ultimeOpzioniAvvioLibero, 'la richiesta HA raggiunto avviaLibero (la FORMA del corpo era valida) — è il registro a dire no, stesso cancello di session-registry.test.mjs');
});

test('⛔⛔ AL CONTRARIO — POST /api/v1/sessions/custom con SIA cartellaId CHE cartellaLibera: 400 PRIMA di raggiungere il registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/custom`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartellaId: '0', cartellaLibera: 'C:/altro', consegna: 'fai qualcosa' }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  assert.equal(sessionRegistry.ultimeOpzioniAvvioLibero, null, 'la FORMA del corpo è già invalida: il registro non deve nemmeno essere chiamato');
});

test('⛔ AL CONTRARIO — POST /api/v1/sessions/custom senza NÉ cartellaId NÉ cartellaLibera: 400, non una sessione fantasma', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/custom`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consegna: 'fai qualcosa' }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
});

/*
 * ⭐⭐⭐ FASE B (28/8) — permesso PER-ATTREZZO, sui DUE endpoint di avvio.
 * Stesso principio della pillola permessi appena sopra: si prova che la
 * FORMA del corpo applica davvero il cancello al confine HTTP.
 */
test('⭐⭐⭐ POST /api/v1/sessions con permessiPerAttrezzo valido lo inoltra a sessionRegistry.avvia', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', permessiPerAttrezzo: { shell: 'chiedi' } }),
  });
  assert.equal(risposta.status, 200);
  assert.deepEqual(sessionRegistry.ultimeOpzioniAvvio.permessiPerAttrezzoScelto, { shell: 'chiedi' });
});

test('⛔⛔ POST /api/v1/sessions con permessiPerAttrezzo su un nome attrezzo INVENTATO: QUERY_INVALID, mai raggiunge il registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', permessiPerAttrezzo: { strumento_inventato: 'nega' } }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  assert.equal(sessionRegistry.ultimeOpzioniAvvio, null, 'mai raggiunto il registro con una chiave attrezzo inventata');
});

test('⛔⛔ AL CONTRARIO — POST /api/v1/sessions con permessiPerAttrezzo su un attrezzo REALE ma fuori dal gate (leggi): QUERY_INVALID comunque', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', permessiPerAttrezzo: { leggi: 'nega' } }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  assert.equal(sessionRegistry.ultimeOpzioniAvvio, null, 'leggi non passa mai dal gate: un override lì sarebbe ignorato in silenzio, stesso rifiuto di un nome inventato');
});

test('⛔ AL CONTRARIO — POST /api/v1/sessions con un valore non fra sempre/chiedi/nega: QUERY_INVALID', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', permessiPerAttrezzo: { scrivi: 'boh' } }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  assert.equal(sessionRegistry.ultimeOpzioniAvvio, null);
});

test('⭐⭐⭐ POST /api/v1/sessions/custom con permessiPerAttrezzo valido arriva davvero al registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/custom`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cartellaLibera: 'C:/qualunque/percorso', consegna: 'fai qualcosa', permessi: 'Full access',
      permessiPerAttrezzo: { document_create: 'sempre' },
    }),
  });
  assert.equal(risposta.status, 200);
  assert.deepEqual(sessionRegistry.ultimeOpzioniAvvioLibero.permessiPerAttrezzo, { document_create: 'sempre' });
});

/*
 * ⭐⭐⭐ 28/8 — POST .../approve, il lato HTTP del permesso "On request".
 */
test('⭐⭐⭐ POST /api/v1/sessions/:id/approve con {requestId, approvato} raggiunge sessionRegistry.rispondiApprovazione', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/approve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'richiesta-vera', approvato: true }),
  });
  assert.equal(risposta.status, 200);
  assert.deepEqual(sessionRegistry.ultimaRispostaApprovazione, { sessionId, requestId: 'richiesta-vera', approvato: true });
});

test('⛔⛔ AL CONTRARIO — POST .../approve con un requestId sbagliato: QUERY_INVALID, mai un {ok:true} bugiardo', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/approve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'un-id-vecchio', approvato: true }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
});

test('⛔ AL CONTRARIO — POST .../approve su una sessione inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/mai-esistita/approve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: 'x', approvato: false }),
  });
  assert.equal(risposta.status, 404);
});

test('⛔⛔ AL CONTRARIO — POST .../approve con un corpo malformato (approvato non booleano, o requestId mancante): 400 QUERY_INVALID', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  for (const corpo of [{ requestId: 'x', approvato: 'sì' }, { approvato: true }, { requestId: 'x' }, {}]) {
    const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/approve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    assert.equal(risposta.status, 400, JSON.stringify(corpo));
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID', JSON.stringify(corpo));
  }
});

/*
 * ⭐⭐⭐ 28/8 — POST .../hooks/:hookId/trust, FASE A (hook). L'UNICA
 * strada che rende un hook eseguibile — vedi il commento in
 * http-app.mjs sopra questa rotta per il perché (fail-closed, stesso
 * principio di Codex CLI).
 */
test('⭐⭐⭐ POST /api/v1/sessions/:id/hooks/:hookId/trust raggiunge sessionRegistry.fidaHook con id decodificati', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/hooks/${encodeURIComponent('audit hook')}/trust`, {
    method: 'POST',
  });
  assert.equal(risposta.status, 200);
  assert.deepEqual(sessionRegistry.ultimaFiduciaHook, { sessionId, hookId: 'audit hook' });
});

test('⛔ AL CONTRARIO — .../trust su una sessione inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/mai-esistita/hooks/audit/trust`, { method: 'POST' });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});

test('⛔⛔ AL CONTRARIO — .../trust su un hookId che non esiste in hooks.json: 404 NOT_FOUND, mai un {ok:true} bugiardo', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/hooks/hook-inesistente/trust`, { method: 'POST' });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});

test('⛔⛔⛔ AL CONTRARIO — .../trust con hooks.json malformato: 422 HOOK_INVALID, mai fidato per errore', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/hooks/hook-file-rotto/trust`, { method: 'POST' });
  assert.equal(risposta.status, 422);
  assert.equal((await risposta.json()).error.code, 'HOOK_INVALID');
});

test('⛔ AL CONTRARIO — GET .../trust (metodo sbagliato) non raggiunge mai fidaHook', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/hooks/audit/trust`, { method: 'GET' });
  assert.notEqual(risposta.status, 200);
  assert.equal(sessionRegistry.ultimaFiduciaHook, null);
});

/*
 * ⭐⭐⭐ 29/8 — POST .../mcp/:serverId/trust, FASE E. Stesso ruolo esatto
 * della rotta hooks/trust appena sopra, per i server MCP.
 */
test('⭐⭐⭐ POST /api/v1/sessions/:id/mcp/:serverId/trust raggiunge sessionRegistry.fidaServerMcp con id decodificati', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/mcp/${encodeURIComponent('filesystem server')}/trust`, {
    method: 'POST',
  });
  assert.equal(risposta.status, 200);
  assert.deepEqual(sessionRegistry.ultimaFiduciaServerMcp, { sessionId, serverId: 'filesystem server' });
});

test('⛔ AL CONTRARIO — .../mcp/.../trust su una sessione inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/mai-esistita/mcp/filesystem/trust`, { method: 'POST' });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});

test('⛔⛔ AL CONTRARIO — .../mcp/.../trust su un serverId che non esiste in .harness-ui-mcp.json: 404 NOT_FOUND, mai un {ok:true} bugiardo', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/mcp/server-inesistente/trust`, { method: 'POST' });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});

test('⛔⛔⛔ AL CONTRARIO — .../mcp/.../trust con .harness-ui-mcp.json malformato: 422 MCP_INVALID, mai fidato per errore', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/mcp/server-file-rotto/trust`, { method: 'POST' });
  assert.equal(risposta.status, 422);
  assert.equal((await risposta.json()).error.code, 'MCP_INVALID');
});

test('⛔ AL CONTRARIO — GET .../mcp/.../trust (metodo sbagliato) non raggiunge mai fidaServerMcp', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/mcp/filesystem/trust`, { method: 'GET' });
  assert.notEqual(risposta.status, 200);
  assert.equal(sessionRegistry.ultimaFiduciaServerMcp, null);
});

/*
 * ⭐⭐⭐ 29/8 — POST .../plugins/:pluginId/trust, FASE G. Stesso ruolo
 * esatto della rotta mcp/trust appena sopra, per i plugin.
 */
test('⭐⭐⭐ POST /api/v1/sessions/:id/plugins/:pluginId/trust raggiunge sessionRegistry.fidaPlugin con id decodificati', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/plugins/${encodeURIComponent('esempio plugin')}/trust`, {
    method: 'POST',
  });
  assert.equal(risposta.status, 200);
  assert.deepEqual(sessionRegistry.ultimaFiduciaPlugin, { sessionId, pluginId: 'esempio plugin' });
});

test('⛔ AL CONTRARIO — .../plugins/.../trust su una sessione inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/mai-esistita/plugins/esempio/trust`, { method: 'POST' });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});

test('⛔⛔ AL CONTRARIO — .../plugins/.../trust su un pluginId che non esiste in .harness-ui-plugins/: 404 NOT_FOUND, mai un {ok:true} bugiardo', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/plugins/plugin-inesistente/trust`, { method: 'POST' });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});

test('⛔⛔⛔ AL CONTRARIO — .../plugins/.../trust con plugin.json malformato: 422 PLUGIN_INVALID, mai fidato per errore', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/plugins/plugin-file-rotto/trust`, { method: 'POST' });
  assert.equal(risposta.status, 422);
  assert.equal((await risposta.json()).error.code, 'PLUGIN_INVALID');
});

test('⛔ AL CONTRARIO — GET .../plugins/.../trust (metodo sbagliato) non raggiunge mai fidaPlugin', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/plugins/esempio/trust`, { method: 'GET' });
  assert.notEqual(risposta.status, 200);
  assert.equal(sessionRegistry.ultimaFiduciaPlugin, null);
});

/*
 * ⭐⭐⭐ FASE D (28/8) — POST .../queue e .../queue/annulla, coda messaggi.
 * ⛔ Il ledger (LEDGER-FASE-D-CODA.md) prevedeva un DELETE HTTP per
 * "annulla" — corretto nell'implementazione (vedi il commento in
 * http-app.mjs sopra queueMatch): nessun'altra rotta di questo file usa
 * mai il verbo DELETE, incluso eliminare un file (POST .../tree/delete).
 */
test('⭐⭐⭐ POST /api/v1/sessions/:id/queue con {messaggio} raggiunge sessionRegistry.accodaMessaggio', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaggio: 'e adesso aggiungi anche i test' }),
  });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.deepEqual(corpo.data, { ok: true, posizione: 1 });
  assert.deepEqual(sessionRegistry.ultimoAccodaMessaggio, { sessionId, testo: 'e adesso aggiungi anche i test' });
});

test('⛔ AL CONTRARIO — POST .../queue su una sessione inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/mai-esistita/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaggio: 'ciao' }),
  });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});

test('⛔⛔ AL CONTRARIO — POST .../queue su una sessione GIÀ CONCLUSA: 409 SESSION_NOT_READY, mai un {ok:true} bugiardo', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1' });
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaggio: 'ciao' }),
  });
  assert.equal(risposta.status, 409);
  assert.equal((await risposta.json()).error.code, 'SESSION_NOT_READY');
});

test('⛔⛔ AL CONTRARIO — POST .../queue con un corpo malformato (messaggio mancante, vuoto, o un campo in più): 400 QUERY_INVALID', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const corpiCattivi = [{}, { messaggio: '' }, { messaggio: '   ' }, { messaggio: 123 }, { messaggio: 'x', extra: 1 }];
  for (const corpo of corpiCattivi) {
    const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/queue`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    assert.equal(risposta.status, 400, JSON.stringify(corpo));
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID', JSON.stringify(corpo));
  }
});

test('⭐⭐⭐ POST /api/v1/sessions/:id/queue/annulla raggiunge sessionRegistry.svuotaCoda', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  await fetch(`${base}/api/v1/sessions/${sessionId}/queue`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messaggio: 'ciao' }),
  });
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/queue/annulla`, { method: 'POST' });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.deepEqual(corpo.data, { ok: true, rimosso: true });
  assert.equal(sessionRegistry.ultimaSvuotaCoda, sessionId);
});

test('⛔ AL CONTRARIO — POST .../queue/annulla su una sessione inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/mai-esistita/queue/annulla`, { method: 'POST' });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});

test('⛔ AL CONTRARIO — POST .../queue/annulla su una coda già vuota: 200 {rimosso:false}, mai un errore', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/queue/annulla`, { method: 'POST' });
  assert.equal(risposta.status, 200);
  assert.deepEqual((await risposta.json()).data, { ok: true, rimosso: false });
});

test('⛔ AL CONTRARIO — GET .../queue (metodo sbagliato) non raggiunge mai accodaMessaggio', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/queue`, { method: 'GET' });
  assert.notEqual(risposta.status, 200);
  assert.equal(sessionRegistry.ultimoAccodaMessaggio, null);
});

test('HTTP-REDIRECT-11 — POST /api/v1/sessions/:id/redirect inoltra il testo al registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/redirect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaggio: 'usa invece il parser tipizzato' }),
  });
  assert.equal(risposta.status, 200);
  assert.deepEqual((await risposta.json()).data, { ok: true, redirectId: 'redirect-finto' });
  assert.deepEqual(sessionRegistry.ultimoReindirizzamento, { sessionId, testo: 'usa invece il parser tipizzato' });
});

test('HTTP-STOP-BEFORE-REDIRECT-20 — stop e redirect inoltrano lo stesso id di correlazione', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const redirectId = '2b6d64d0-05c4-4ab2-9d78-51aaabf54522';
  const stop = await fetch(`${base}/api/v1/sessions/${sessionId}/stop`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirectId }),
  });
  const redirect = await fetch(`${base}/api/v1/sessions/${sessionId}/redirect`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messaggio: 'non applicare più', redirectId }),
  });

  assert.equal(stop.status, 200);
  assert.equal(redirect.status, 200);
  assert.deepEqual(sessionRegistry.ultimaFermata, { sessionId, opzioni: { redirectId } });
  assert.equal(sessionRegistry.ultimoRedirectId, redirectId);
});

test('HTTP-REDIRECT-11 contrario — redirect rifiuta corpo malformato, sessione conclusa e id assente', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  for (const body of [{}, { messaggio: '' }, { messaggio: 'ok', extra: true }, { messaggio: 'ok', redirectId: 'non-uuid' }]) {
    const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/redirect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(risposta.status, 400);
  }
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1' });
  const conclusa = await fetch(`${base}/api/v1/sessions/${sessionId}/redirect`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messaggio: 'x' }),
  });
  assert.equal(conclusa.status, 409);
  const assente = await fetch(`${base}/api/v1/sessions/assente/redirect`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messaggio: 'x' }),
  });
  assert.equal(assente.status, 404);
});

test('⛔ POST /api/v1/sessions su un task fuori allowlist: 404 TASK_NOT_ALLOWED, mai una sessione', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'task-vietato' }),
  });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'TASK_NOT_ALLOWED');
});

test('⛔ POST /api/v1/sessions senza chiave configurata: CONFIG_INVALID, non un crash generico', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId: 'task-senza-chiave' }),
  });
  assert.equal((await risposta.json()).error.code, 'CONFIG_INVALID');
});

test('⭐⭐⭐ POST /api/v1/sessions/{id}/rename persiste il nome — elenca() e export lo mostrano dopo', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/rename`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Il mio nome' }),
  });
  assert.equal(risposta.status, 200);

  const elenco = await (await fetch(`${base}/api/v1/sessions`)).json();
  assert.equal(elenco.data.items[0].nome, 'Il mio nome');
  const esportato = await (await fetch(`${base}/api/v1/sessions/${sessionId}/export`)).json();
  assert.equal(esportato.data.nome, 'Il mio nome');
});

test('⛔ POST /api/v1/sessions/{id}/rename rifiuta un corpo che non è ESATTAMENTE {nome}', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  for (const corpo of [{}, { nome: 42 }, { nome: 'x', extra: 1 }, { taskId: 'x' }]) {
    const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/rename`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    assert.equal(risposta.status, 400, JSON.stringify(corpo));
  }
});

test('⛔ POST /api/v1/sessions/{id}/rename con un nome vuoto: QUERY_INVALID, mai salvato', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/rename`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: '   ' }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
});

test('⛔ POST /api/v1/sessions/{id}/rename su un id inesistente: 404', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/rename`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'x' }),
  });
  assert.equal(risposta.status, 404);
});

test('POST /api/v1/sessions/{id}/stop su una sessione vera torna 200, su un id inventato torna 404', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');

  const fermata = await fetch(`${base}/api/v1/sessions/${sessionId}/stop`, { method: 'POST' });
  assert.equal(fermata.status, 200);
  assert.deepEqual((await fermata.json()).data, { stopped: true });

  const inventata = await fetch(`${base}/api/v1/sessions/non-esiste/stop`, { method: 'POST' });
  assert.equal(inventata.status, 404);
});

test('⭐⭐⭐ POST /api/v1/sessions/{id}/fork su una sessione conclusa: 200 e un nuovo sessionId, con forkDa tracciato', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId: idOrigine } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(idOrigine, { type: 'RunFinished', threadId: 't1', runId: 'r1' });

  const risposta = await fetch(`${base}/api/v1/sessions/${idOrigine}/fork`, { method: 'POST' });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.notEqual(corpo.data.sessionId, idOrigine);

  const esportato = await (await fetch(`${base}/api/v1/sessions/${corpo.data.sessionId}/export`)).json();
  assert.equal(esportato.data.forkDa, idOrigine);
});

test('⛔ POST /api/v1/sessions/{id}/fork su una sessione ANCORA IN CORSO: 409 SESSION_NOT_READY', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId: idOrigine } = sessionRegistry.avvia('sconto-a-scaglioni'); // mai concluso in questo test

  const risposta = await fetch(`${base}/api/v1/sessions/${idOrigine}/fork`, { method: 'POST' });
  assert.equal(risposta.status, 409);
  assert.equal((await risposta.json()).error.code, 'SESSION_NOT_READY');
});

test('⛔ POST /api/v1/sessions/{id}/fork su un id origine inesistente: 404', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/fork`, { method: 'POST' });
  assert.equal(risposta.status, 404);
});

test('SESSION-RECOVERY-HTTP-06 — POST resume su una sessione conclusa torna 200 e lo stesso sessionId', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1' });

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/resume`, { method: 'POST' });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.data.sessionId, sessionId, 'resume torna LO STESSO id, mai uno nuovo');
});

test('SESSION-RECOVERY-INTERRUPTED-HTTP-08 — il nuovo messaggio raggiunge il recupero della stessa sessione', async (t) => {
  const sessionRegistry = registroFinto();
  const sessionId = 'b9d67958-93fb-4f44-b06a-12e584b5c513';
  sessionRegistry.resume = function resumeInterrotta(idRicevuto, nuovoMessaggioUtente) {
    this.ultimoResume = { sessionId: idRicevuto, nuovoMessaggioUtente };
    return { sessionId: idRicevuto };
  };
  const { base } = await listen(t, { sessionRegistry });

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/resume`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messaggio: 'continua senza perdere la cronologia' }),
  });

  assert.equal(risposta.status, 200);
  assert.equal((await risposta.json()).data.sessionId, sessionId);
  assert.deepEqual(sessionRegistry.ultimoResume, {
    sessionId,
    nuovoMessaggioUtente: 'continua senza perdere la cronologia',
  });
});

test('SESSION-RECOVERY-HTTP-BODY-16 — resume accetta solo body vuoto o esattamente {messaggio:stringaNonVuota}', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1' });
  const nonValidi = [
    null,
    [],
    'continua',
    42,
    true,
    { messaggio: 123 },
    { messaggio: '' },
    { messaggio: 'continua', extra: true },
    { extra: true },
  ];

  for (const body of nonValidi) {
    const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/resume`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(risposta.status, 400);
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  }
});

test('SESSION-RECOVERY-STORE-HTTP-20 — un checkpoint non salvabile resta un errore pubblico e ritentabile', async (t) => {
  const sessionRegistry = registroFinto();
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1' });
  sessionRegistry.resume = () => ({
    erroreAvvio: 'Non è stato possibile salvare il nuovo messaggio',
    code: 'SESSION_STORE_WRITE_FAILED',
  });
  const { base } = await listen(t, { sessionRegistry });

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/resume`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messaggio: 'continua' }),
  });

  assert.equal(risposta.status, 503);
  assert.equal((await risposta.json()).error.code, 'SESSION_STORE_WRITE_FAILED');
});

test('SESSION-RECOVERY-LIVE-INVERSE-07 — POST resume su una sessione ancora in corso resta 409 SESSION_NOT_READY', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni'); // mai concluso in questo test

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/resume`, { method: 'POST' });
  assert.equal(risposta.status, 409);
  assert.equal((await risposta.json()).error.code, 'SESSION_NOT_READY');
});

test('⛔ POST /api/v1/sessions/{id}/resume su un id inesistente: 404', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/resume`, { method: 'POST' });
  assert.equal(risposta.status, 404);
});

test('SESSION-SETTINGS-HTTP-01 — aggiorna modello, reasoning e permessi della sessione con envelope v1', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const creata = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: 'sconto-a-scaglioni' }),
  });
  const sessionId = (await creata.json()).data.sessionId;
  const patch = {
    modello: 'google/gemini-3.7-flash',
    reasoning: { effort: 'high' },
    permessi: 'Read only',
    permessiPerAttrezzo: { scrivi: 'nega', shell: 'chiedi' },
  };
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/settings`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
  });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.meta.schema, API_SCHEMA);
  assert.deepEqual(sessionRegistry.ultimeImpostazioniSessione, { sessionId, patch });
});

test('SESSION-SETTINGS-HTTP-01 contrari — body vuoto, chiavi o valori non validi falliscono chiusi', async (t) => {
  const { base } = await listen(t);
  const creata = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: 'sconto-a-scaglioni' }),
  });
  const sessionId = (await creata.json()).data.sessionId;
  const nonValidi = [
    {},
    { sconosciuta: true },
    { modello: 'non-un-modello' },
    { reasoning: { effort: 'ultra' } },
    { permessi: 'Scrivi ovunque' },
    { permessiPerAttrezzo: {} },
    { permessiPerAttrezzo: { leggi: 'sempre' } },
  ];
  for (const body of nonValidi) {
    const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/settings`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(risposta.status, 400, `deve rifiutare ${JSON.stringify(body)}`);
  }
  const assente = await fetch(`${base}/api/v1/sessions/sessione-assente/settings`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ permessi: 'Read only' }),
  });
  assert.equal(assente.status, 404);
});

test('⭐ POST /api/v1/sessions/{id}/compact su una sessione conclusa: 200 e {compattato:true}', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1' });

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/compact`, { method: 'POST' });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.deepEqual(corpo.data, { compattato: true });
});

test('⛔ POST /api/v1/sessions/{id}/compact su una sessione ANCORA IN CORSO: 409 SESSION_NOT_READY', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni'); // mai concluso in questo test

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/compact`, { method: 'POST' });
  assert.equal(risposta.status, 409);
  assert.equal((await risposta.json()).error.code, 'SESSION_NOT_READY');
});

test('⛔ POST /api/v1/sessions/{id}/compact su un id inesistente: 404', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/compact`, { method: 'POST' });
  assert.equal(risposta.status, 404);
});

test('⛔ le rotte nuove restano un\'eccezione NOMINATA: /api/v1/health con POST resta 405, non 404', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/health`, { method: 'POST' });
  assert.equal(risposta.status, 405);
  assert.equal(risposta.headers.get('allow'), 'GET, HEAD');
});

test('GET /api/v1/sessions/{id}/events su un id inesistente torna 404 JSON, non uno stream aperto', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/events`);
  assert.equal(risposta.status, 404);
  assert.equal(risposta.headers.get('content-type'), 'application/json; charset=utf-8');
});

/*
 * ⛔⛔⛔ 28/8 — RISCRITTO: prima chiudeva DA SOLO su RunFinished (il titolo
 * originale del test lo diceva). Trovato dal vivo, non da un test (vedi
 * workspace-watcher.mjs), che questo chiudeva la porta a WorkspaceChanged
 * — un evento che può arrivare BEN DOPO che un run è concluso (un file
 * cambiato fuori dall'app mentre l'owner guarda ancora quella sessione).
 * Lo stream ora resta aperto finché il CLIENT non lo chiude — questo test
 * legge i tre eventi attesi da un reader esplicito e poi cancella LUI la
 * lettura, invece di aspettare una chiusura che non arriva più da sola.
 */
test('⭐⭐ GET /api/v1/sessions/{id}/events replica la storia in frame SSE, e NON chiude da solo dopo RunFinished', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(sessionId, { type: 'RunStarted', threadId: 't1', runId: 'r1' });
  sessionRegistry._emetti(sessionId, { type: 'TextMessageContent', messageId: 'm1', delta: 'ciao' });
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' } });

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/events`);
  assert.equal(risposta.status, 200);
  assert.equal(risposta.headers.get('content-type'), 'text/event-stream; charset=utf-8');

  const reader = risposta.body.getReader();
  const decoder = new TextDecoder();
  let accumulato = '';
  let eventi = [];
  // ⭐ legge finché non ha visto i tre eventi attesi — mai finché lo stream chiude da solo, perché ora non lo fa più.
  while (eventi.length < 3) {
    const { value, done } = await reader.read();
    if (done) throw new Error('lo stream si è chiuso da solo prima dei tre eventi attesi — regressione');
    accumulato += decoder.decode(value, { stream: true });
    const frame = accumulato.split('\n\n').map((f) => f.trim()).filter(Boolean).filter((f) => !f.startsWith(':'));
    eventi = frame.map((f) => JSON.parse(f.replace(/^data: /, '')));
  }
  assert.deepEqual(eventi.map((e) => e.type), ['RunStarted', 'TextMessageContent', 'RunFinished']);
  await reader.cancel(); // il test chiude, non lo stream da solo — coerente con la cura
});

test('⛔ AL CONTRARIO — GET /api/v1/sessions/{id}/events resta aperto dopo RunFinished: un WorkspaceChanged successivo arriva sullo STESSO stream', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(sessionId, { type: 'RunStarted', threadId: 't1', runId: 'r1' });
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' } });

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/events`);
  const reader = risposta.body.getReader();
  const decoder = new TextDecoder();
  let accumulato = '';
  let eventi = [];

  // il replay (RunStarted+RunFinished) arriva subito — poi un evento "dal vivo" DOPO, sullo stesso stream mai chiuso.
  while (eventi.length < 2) {
    const { value, done } = await reader.read();
    if (done) throw new Error('lo stream si è chiuso prima del replay atteso');
    accumulato += decoder.decode(value, { stream: true });
    eventi = accumulato.split('\n\n').map((f) => f.trim()).filter(Boolean).filter((f) => !f.startsWith(':'))
      .map((f) => JSON.parse(f.replace(/^data: /, '')));
  }

  sessionRegistry._emetti(sessionId, { type: 'WorkspaceChanged', percorsi: ['esterno.txt'] });
  while (eventi.length < 3) {
    const { value, done } = await reader.read();
    if (done) throw new Error('lo stream si è chiuso invece di consegnare il terzo evento — la regressione che questo test previene');
    accumulato += decoder.decode(value, { stream: true });
    eventi = accumulato.split('\n\n').map((f) => f.trim()).filter(Boolean).filter((f) => !f.startsWith(':'))
      .map((f) => JSON.parse(f.replace(/^data: /, '')));
  }
  assert.equal(eventi[2].type, 'WorkspaceChanged');
  assert.deepEqual(eventi[2].percorsi, ['esterno.txt']);
  await reader.cancel();
});

/*
 * ⛔⛔⛔ 28/8 — la SECONDA metà della cura (setNoDelay è la prima, non
 * osservabile da un test HTTP in-process: agisce sul socket TCP, che
 * qui è loopback e non passa mai per Nagle in un modo che un test
 * possa misurare). Il battito invece SI osserva: un intervallo finto
 * scatta subito (nessuna vera attesa di 15s in un test), e la sua
 * cancellazione alla chiusura del client si prova per assenza di
 * scritture DOPO che il reader ha cancellato.
 */
test('⭐⭐⭐ GET /api/v1/sessions/{id}/events scrive un battito periodico (":battito"), e lo cancella quando il client chiude', async (t) => {
  const timer = { id: null, fn: null, cancellato: false };
  const impostaIntervalloFn = (fn, ms) => { timer.fn = fn; timer.ms = ms; timer.id = 'finto-1'; return timer.id; };
  const cancellaIntervalloFn = (id) => { assert.equal(id, timer.id); timer.cancellato = true; };
  const { base, sessionRegistry } = await listen(t, { impostaIntervalloFn, cancellaIntervalloFn });
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/events`);
  const reader = risposta.body.getReader();
  const decoder = new TextDecoder();

  assert.equal(typeof timer.fn, 'function', 'la rotta deve installare il battito, non lasciarlo implicito');
  assert.equal(timer.ms, 15_000);

  /*
   * ⭐ Il PRIMO chunk che arriva è quasi sempre il ":ok\n\n" scritto
   * all'apertura della connessione (già in transito prima che `fetch()`
   * torni) — non il battito. Si accumula finché non si vede DAVVERO
   * ":battito", non si assume che sia il primo read.
   */
  timer.fn(); // simula lo scatto del timer — nessuna attesa reale
  let accumulato = '';
  while (!accumulato.includes(':battito')) {
    const { value, done } = await reader.read();
    if (done) throw new Error('lo stream si è chiuso prima del battito atteso');
    accumulato += decoder.decode(value, { stream: true });
  }
  assert.match(accumulato, /:battito\n\n/, 'un commento SSE valido — inizia con ":" — mai un evento "reale" spacciato per battito');

  await reader.cancel();
  await new Promise((r) => setTimeout(r, 20)); // l'evento 'close' di res è asincrono
  assert.equal(timer.cancellato, true, 'chiudere il client deve fermare il timer — mai un intervallo lasciato a girare su una risposta morta');
});

test('⭐ GET /api/v1/sessions/{id}/export torna la storia intera, avvolta nella busta standard', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  sessionRegistry._emetti(sessionId, { type: 'RunStarted', threadId: 't1', runId: 'r1' });
  sessionRegistry._emetti(sessionId, { type: 'RunFinished', threadId: 't1', runId: 'r1' });

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/export`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.data.sessionId, sessionId);
  assert.equal(corpo.data.taskId, 'sconto-a-scaglioni');
  assert.deepEqual(corpo.data.eventi.map((e) => e.type), ['RunStarted', 'RunFinished']);
});

test('⛔ GET /api/v1/sessions/{id}/export su un id inesistente torna 404, non un export vuoto', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/export`);
  assert.equal(risposta.status, 404);
});

/*
 * ⭐⭐⭐ 28/8 — GET .../hooks, FASE A (hook): il pannello Control-plane
 * chiama questa rotta per mostrare gli hook dichiarati e il loro stato
 * di fiducia vero.
 */
test('⭐ GET /api/v1/sessions/{id}/hooks torna gli hook con lo stato di fiducia dal registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/hooks`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.deepEqual(corpo.data.hooks, [{ id: 'audit', eventi: ['pre_tool_call'], fidato: false }]);
  assert.equal(corpo.data.errore, null);
});

test('⛔ AL CONTRARIO — GET .../hooks su un id inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/hooks`);
  assert.equal(risposta.status, 404);
});

/*
 * ⭐⭐⭐ 29/8 — GET .../mcp, FASE E: il Capability hub chiama questa
 * rotta per mostrare i server MCP dichiarati e il loro stato di
 * fiducia vero — stesso principio esatto di GET .../hooks sopra.
 */
test('⭐ GET /api/v1/sessions/{id}/mcp torna i server MCP con lo stato di fiducia dal registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/mcp`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.deepEqual(corpo.data.server, [{ id: 'filesystem', comando: 'npx', argomenti: [], allowlist: ['read_file'], fidato: false }]);
  assert.equal(corpo.data.errore, null);
});

test('⛔ AL CONTRARIO — GET .../mcp su un id inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/mcp`);
  assert.equal(risposta.status, 404);
});

/*
 * ⭐⭐⭐ 29/8 — GET .../skills, FASE F: il Capability hub chiama questa
 * rotta per mostrare le skill dichiarate — stesso principio esatto di
 * GET .../mcp sopra, senza il concetto di fiducia.
 */
test('⭐ GET /api/v1/sessions/{id}/skills torna le skill dal registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/skills`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.deepEqual(corpo.data.skills, [{ id: 'code-review', name: 'code-review', description: 'Revisione in due assi.' }]);
  assert.equal(corpo.data.errore, null);
});

test('⛔ AL CONTRARIO — GET .../skills su un id inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/skills`);
  assert.equal(risposta.status, 404);
});

/*
 * ⭐⭐⭐ 29/8 — GET .../library, FASE N: il Capability hub chiama questa
 * rotta per mostrare le voci di Libreria del progetto — stesso
 * principio esatto di GET .../skills sopra, senza il concetto di
 * fiducia.
 */
test('⭐ GET /api/v1/sessions/{id}/library torna le voci dal registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/library`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.deepEqual(corpo.data.voci, [{ id: 'lib-1', nome: 'report.md', fileType: 'document', origine: 'uploaded', aggiornatoIl: '2026-08-29T10:00:00.000Z' }]);
  assert.equal(corpo.data.errore, null);
});

test('⛔ AL CONTRARIO — GET .../library su un id inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/library`);
  assert.equal(risposta.status, 404);
});

/*
 * ⭐⭐⭐ FASE N, quarto sistema (30/8) — GET .../notes: il Capability
 * hub chiama questa rotta per mostrare le note dell'owner (GLOBALI,
 * non del progetto di questa sessione) — stesso principio esatto di
 * GET .../library sopra.
 */
test('⭐ GET /api/v1/sessions/{id}/notes torna le note dal registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/notes`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.deepEqual(corpo.data.note, [{ id: 'nota-1', titolo: 'Codice cancello', contenuto: '4471', aggiornataAlle: '2026-08-30T10:00:00.000Z' }]);
  assert.equal(corpo.data.errore, null);
});

test('⛔ AL CONTRARIO — GET .../notes su un id inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/notes`);
  assert.equal(risposta.status, 404);
});

/*
 * ⭐⭐⭐ FASE N, quinto sistema (30/8) — GET .../tasks: il Capability
 * hub chiama questa rotta per mostrare le attività dell'owner
 * (GLOBALI, come le note) — stesso principio esatto di GET .../notes
 * sopra.
 */
test('⭐ GET /api/v1/sessions/{id}/tasks torna le attività dal registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/tasks`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.deepEqual(corpo.data.attivita, [{ id: 'task-1', titolo: 'Chiama idraulico', descrizione: null, priorita: 'high', stato: 'todo', aggiornataAlle: '2026-08-30T10:00:00.000Z' }]);
  assert.equal(corpo.data.errore, null);
});

test('⛔ AL CONTRARIO — GET .../tasks su un id inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/tasks`);
  assert.equal(risposta.status, 404);
});

/*
 * ⭐⭐⭐ FASE N, sesto sistema (30/8) — GET .../memory: il Capability
 * hub chiama questa rotta per mostrare le memorie dell'owner (GLOBALI,
 * come note/attività) — stesso principio esatto di GET .../tasks sopra.
 */
test('⭐ GET /api/v1/sessions/{id}/memory torna le memorie dal registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/memory`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.deepEqual(corpo.data.memorie, [{ id: 'mem-1', titolo: 'Preferenze risposta', contenuto: 'Risposte brevi', genere: 'preference', aggiornataAlle: '2026-08-30T10:00:00.000Z' }]);
  assert.equal(corpo.data.errore, null);
});

test('⛔ AL CONTRARIO — GET .../memory su un id inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/memory`);
  assert.equal(risposta.status, 404);
});

/*
 * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — GET .../research: il Capability
 * hub chiama questa rotta per mostrare le ricerche approfondite DEL
 * PROGETTO di questa sessione (PER-PROGETTO, come Libreria — mai
 * globale come .../memory sopra) — stesso principio esatto della rotta.
 */
test('⭐ GET /api/v1/sessions/{id}/research torna le ricerche dal registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/research`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.deepEqual(corpo.data.ricerche, [{ id: 'sess-ricerca-1', titolo: 'Il caching di OpenRouter', stato: 'done', avviataAlle: '2026-08-30T10:00:00.000Z' }]);
  assert.equal(corpo.data.errore, null);
});

test('⛔ AL CONTRARIO — GET .../research su un id inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/research`);
  assert.equal(risposta.status, 404);
});

/*
 * ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — GET .../tool-forge: il
 * Capability hub chiama questa rotta per mostrare i tool forgiati
 * installati (GLOBALI) — stesso principio esatto della rotta research.
 */
test('⭐ GET /api/v1/sessions/{id}/tool-forge torna i tool forgiati dal registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/tool-forge`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.deepEqual(corpo.data.strumenti, [{ id: 'log-water-intake', titolo: 'Log water intake', descrizione: 'x', capacita: ['notes.create'], rischio: 'R2', abilitato: false, installatoAlle: '2026-08-30T10:00:00.000Z' }]);
  assert.equal(corpo.data.errore, null);
});

test('⛔ AL CONTRARIO — GET .../tool-forge su un id inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/tool-forge`);
  assert.equal(risposta.status, 404);
});

/*
 * ⭐⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — POST .../tool-forge/:id/enable,
 * l'UNICA mutazione owner-facing di tutta FASE N (vedi la doc in
 * tool-forge-store.mjs sul perché). Stesso stile di POST .../approve.
 */
test('⭐⭐⭐⭐⭐ POST /api/v1/sessions/:id/tool-forge/:toolId/enable con {abilitato} raggiunge sessionRegistry.abilitaToolForgiato', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/tool-forge/${encodeURIComponent('log-water-intake')}/enable`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ abilitato: true }),
  });
  assert.equal(risposta.status, 200);
  assert.deepEqual(sessionRegistry.ultimaAbilitaForge, { sessionId, id: 'log-water-intake', abilitato: true });
});

test('⛔⛔ AL CONTRARIO — POST .../tool-forge/:id/enable con un corpo malformato (abilitato non booleano, o assente): 400 QUERY_INVALID', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  for (const corpo of [{ abilitato: 'sì' }, {}, { abilitato: true, extra: 1 }]) {
    const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/tool-forge/log-water-intake/enable`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    assert.equal(risposta.status, 400, JSON.stringify(corpo));
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID', JSON.stringify(corpo));
  }
});

test('⛔ AL CONTRARIO — POST .../tool-forge/:id/enable su una sessione inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/mai-esistita/tool-forge/x/enable`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ abilitato: true }),
  });
  assert.equal(risposta.status, 404);
});

test('⛔⛔ AL CONTRARIO — POST .../tool-forge/:id/enable su un toolId che non esiste in .tool-forge-store/: 404 NOT_FOUND, mai un {ok:true} bugiardo', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/tool-forge/tool-inesistente/enable`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ abilitato: true }),
  });
  assert.equal(risposta.status, 404);
});

/*
 * ⭐⭐⭐ 29/8 — GET .../plugins, FASE G: il Capability hub chiama questa
 * rotta per mostrare i plugin dichiarati e il loro stato di fiducia
 * vero — stesso principio esatto di GET .../mcp sopra (un plugin
 * ESEGUE, a differenza delle skill).
 */
test('⭐ GET /api/v1/sessions/{id}/plugins torna i plugin con lo stato di fiducia dal registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/plugins`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.deepEqual(corpo.data.plugin, [{ id: 'esempio', nome: 'esempio', descrizione: 'un plugin di prova', hooks: [], tools: [{ nome: 'conta_righe', descrizione: 'conta', parametri: {}, comando: 'echo 3' }], fidato: false, avvisi: [] }]);
  assert.equal(corpo.data.errore, null);
});

test('⛔ AL CONTRARIO — GET .../plugins su un id inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/plugins`);
  assert.equal(risposta.status, 404);
});

/*
 * ⭐⭐⭐ FASE C (28/8) — sub-agenti: stesso principio delle rotte /hooks
 * appena sopra — la FORMA della rotta HTTP, non la logica di delega
 * (già provata in subagent-orchestrator.test.mjs/session-registry.test.mjs).
 */
test('⭐ GET /api/v1/sessions/{id}/children torna i figli veri dal registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/children`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.data.figli.length, 1);
  assert.equal(corpo.data.figli[0].sessionId, 'figlio-finto');
  assert.equal(corpo.data.figli[0].esitoDelega, 'concluso');
});

test('⛔ AL CONTRARIO — GET .../children su un id inesistente: 404 NOT_FOUND', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/children`);
  assert.equal(risposta.status, 404);
});

test('⭐ GET /api/v1/sessions/{id}/tree torna le voci alla radice, e passa "percorso" al registro', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');

  const allaRadice = await (await fetch(`${base}/api/v1/sessions/${sessionId}/tree`)).json();
  assert.deepEqual(allaRadice.data.voci, [{ nome: 'radice-finto.txt', cartella: false }]);

  const sottocartella = await (await fetch(`${base}/api/v1/sessions/${sessionId}/tree?percorso=src`)).json();
  assert.deepEqual(sottocartella.data.voci, [{ nome: 'src-finto.txt', cartella: false }]);
});

test('FILE-TREE-PREVIEW-03 — GET /api/v1/projects/{id}/tree legge root e sottocartella prima della sessione', async (t) => {
  const { base } = await listen(t);

  const root = await (await fetch(`${base}/api/v1/projects/p1/tree`)).json();
  assert.deepEqual(root.data.voci, [{ nome: 'radice-preview.txt', cartella: false }]);

  const docs = await (await fetch(`${base}/api/v1/projects/p1/tree?percorso=docs`)).json();
  assert.deepEqual(docs.data.voci, [{ nome: 'docs-preview.txt', cartella: false }]);
});

test('FILE-TREE-PREVIEW-04 — project id sconosciuto, traversal e query extra falliscono chiusi', async (t) => {
  const { base } = await listen(t);

  assert.equal((await fetch(`${base}/api/v1/projects/sconosciuto/tree`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/projects/p1/tree?percorso=..%2Fetc`)).status, 400);
  assert.equal((await fetch(`${base}/api/v1/projects/p1/tree?altro=x`)).status, 400);
});

test('⛔ GET /api/v1/sessions/{id}/tree con un percorso che risale (".."): 400 QUERY_INVALID', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/tree?percorso=..%2Fetc`);
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
});

test('⛔ GET /api/v1/sessions/{id}/tree con una query fuori allowlist: 400 QUERY_INVALID', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const { sessionId } = sessionRegistry.avvia('sconto-a-scaglioni');

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/tree?altro=x`);
  assert.equal(risposta.status, 400);
});

test('⛔ GET /api/v1/sessions/{id}/tree su un id inesistente: 404', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/non-esiste/tree`);
  assert.equal(risposta.status, 404);
});

test('quando sessionRegistry non è configurato, le rotte nuove tornano 404/405 e Harness UI resta leggibile', async (t) => {
  const { base } = await listen(t, { sessionRegistry: null });
  assert.equal((await fetch(`${base}/api/v1/sessions/x/events`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/sessions/x/export`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/sessions/x/tree`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/sessions/x/fork`, { method: 'POST' })).status, 405,
    'senza registro, /fork non è una rotta POST nota: torna al blanket-405');
  assert.equal((await fetch(`${base}/api/v1/sessions/x/resume`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/api/v1/sessions/x/compact`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/api/v1/sessions/x/rename`, { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await fetch(`${base}/api/v1/sessions`, { method: 'POST', body: '{}' })).status, 405,
    'senza registro, /api/v1/sessions non è una rotta POST nota: torna al blanket-405');
  assert.equal((await fetch(`${base}/api/v1/tasks`)).status, 200, 'i task restano un elenco leggibile a sé stante');
});

/* =====================================================================
 * ⭐⭐⭐ W1-02 (04/9) — GET /api/v1/sessions/:id/processes.
 *
 * ⛔ Provata con un registro VERO, non col fake di questo file: il valore
 * della rotta è che il ledger arrivi ricostruito dagli eventi VERI passando
 * per `elencaProcessi()` vero — un fake che restituisce un oggetto già
 * pronto proverebbe solo che l'involucro JSON funziona.
 * ===================================================================== */

function registroVeroConEventi(t, { emetti = null, clock = null } = {}) {
  let onEvento = null;
  const avviaSessioneFn = async (input) => {
    onEvento = input.onEvento;
    if (typeof emetti === 'function') emetti(onEvento);
    return new Promise(() => {}); // resta viva: nessun RunFinished
  };
  const preparaEsecuzioneFn = (taskId) => {
    if (taskId !== 'sconto-a-scaglioni') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
    return { cartella: 'C:\\corpus\\sconto-a-scaglioni-9f2', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
  };
  return createSessionRegistry({
    avviaSessioneFn, preparaEsecuzioneFn, guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k',
    ...(clock ? { clock } : {}),
  });
}

test('⭐⭐⭐ W1-02 — GET /api/v1/sessions/:id/processes torna il ledger dei processi VERI e la guardia di stallo (registro VERO)', async (t) => {
  let ora = 1_000;
  const registro = registroVeroConEventi(t, {
    clock: () => new Date(ora),
    emetti: (onEvento) => {
      onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1', input: { consegna: 'c' } });
      ora = 2_000;
      onEvento({ type: 'ToolCallStart', toolCallId: 'call_1', toolCallName: 'shell' });
      ora = 2_050;
      onEvento({ type: 'ToolCallArgs', toolCallId: 'call_1', delta: '{"comando":"npm ' });
      ora = 2_100;
      onEvento({ type: 'ToolCallArgs', toolCallId: 'call_1', delta: 'run build"}' });
    },
  });
  const { base } = await listen(t, { sessionRegistry: registro });
  const { sessionId } = registro.avvia('sconto-a-scaglioni');
  await Promise.resolve();

  ora = 200_000;
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/processes`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.meta.schema, API_SCHEMA);
  assert.equal(corpo.data.registrato, true);
  assert.equal(corpo.data.processi.length, 1);
  assert.equal(corpo.data.processi[0].attrezzo, 'shell');
  assert.equal(corpo.data.processi[0].origine, 'agente');
  assert.equal(corpo.data.processi[0].comando, 'npm run build', 'i frammenti degli argomenti arrivano RICOMPOSTI fino all\'HTTP');
  assert.equal(corpo.data.processi[0].esito, 'in-corso');
  assert.equal(corpo.data.processi[0].durataMs, null);
  assert.equal(typeof corpo.data.processi[0].motivoTempoAssente, 'string');
  assert.equal(corpo.data.guardia.interviene, false, '⛔ la rotta consegna una guardia OSSERVATIVA: nessuna azione, nessuna uccisione');
  const silenzi = corpo.data.guardia.segnalazioni.filter((s) => s.tipo === 'silenzio');
  assert.equal(silenzi.length, 1);
  assert.equal(silenzi[0].soggetto, 'processo');
  assert.equal(silenzi[0].toolCallId, 'call_1');
  assert.equal(silenzi[0].comando, 'npm run build');
  assert.equal(silenzi[0].fermoDaMs, 197_900);
  assert.equal(corpo.data.guardia.soglie.silenzioMs, 60_000);
});

test('⛔⛔ AL CONTRARIO — GET .../processes su una sessione VIVA ma senza un solo evento dice «non registrato», mai una lista vuota', async (t) => {
  const registro = registroVeroConEventi(t, { emetti: () => {} });
  const { base } = await listen(t, { sessionRegistry: registro });
  const { sessionId } = registro.avvia('sconto-a-scaglioni');
  await Promise.resolve();

  const corpo = await (await fetch(`${base}/api/v1/sessions/${sessionId}/processes`)).json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.data.registrato, false);
  assert.equal(corpo.data.processi, null);
  assert.equal(corpo.data.motivo, 'non-registrato');
  assert.equal(corpo.data.guardia.osservata, false);
  assert.equal(corpo.data.guardia.segnalazioni, null);
});

test('⛔ AL CONTRARIO — GET .../processes su una sessione inesistente: 404 NOT_FOUND', async (t) => {
  const registro = registroVeroConEventi(t);
  const { base } = await listen(t, { sessionRegistry: registro });
  const risposta = await fetch(`${base}/api/v1/sessions/mai-esistita/processes`);
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});

test('⛔ GET .../processes rifiuta una query string, come le rotte vicine (requireNoQuery)', async (t) => {
  const registro = registroVeroConEventi(t, { emetti: () => {} });
  const { base } = await listen(t, { sessionRegistry: registro });
  const { sessionId } = registro.avvia('sconto-a-scaglioni');
  await Promise.resolve();

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/processes?soglia=1`);
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
});

/* =====================================================================
 * ⭐⭐⭐ W1-03 (04/9) — GET /api/v1/sessions/:id/metrics.
 *
 * ⛔ Provata col registro VERO (`registroVeroConEventi` qui sopra), non col
 * fake di questo file: il valore della rotta è che le tre metriche arrivino
 * DERIVATE dagli eventi veri passando per `elencaMetriche()` vero — un fake
 * che restituisce un oggetto già pronto proverebbe solo che l'involucro
 * JSON funziona.
 *
 * ⭐ La ricerca del 04/09 sul cruscotto di DeepSeek Harness: là le stesse
 * tre colonne esistono solo montando SigNoz più un plugin OpenTelemetry di
 * terze parti, perché il loro nucleo non esporta niente. Qui la rotta è
 * dentro l'app e non scrive un byte in più sul disco.
 * ===================================================================== */

test('⭐⭐⭐ W1-03 — GET /api/v1/sessions/:id/metrics torna cache, tempo al primo token e motivo di chiusura VERI (registro VERO)', async (t) => {
  let ora = 1_000;
  const registro = registroVeroConEventi(t, {
    clock: () => new Date(ora),
    emetti: (onEvento) => {
      onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1', input: { consegna: 'c' } });
      ora = 1_450;
      onEvento({ type: 'ReasoningMessageStart', messageId: 'g1', role: 'reasoning' });
      ora = 1_500;
      onEvento({ type: 'ReasoningMessageContent', messageId: 'g1', delta: 'penso…' });
      ora = 6_000;
      onEvento({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
      ora = 6_100;
      onEvento({ type: 'StateDelta', delta: [{ op: 'replace', path: '/usage', value: { prompt_tokens: 40_000, completion_tokens: 500, cached_tokens: 30_000, giri: 5 } }] });
    },
  });
  const { base } = await listen(t, { sessionRegistry: registro });
  const { sessionId } = registro.avvia('sconto-a-scaglioni');
  await Promise.resolve();

  ora = 20_000;
  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/metrics`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.meta.schema, API_SCHEMA);
  assert.equal(corpo.data.registrato, true);
  assert.equal(corpo.data.giri, 1);

  assert.equal(corpo.data.cache.percentuale, 75);
  assert.equal(corpo.data.cache.frazione, 0.75);
  assert.equal(corpo.data.cache.denominatore, 'prompt_tokens', 'il denominatore arriva fino all\'HTTP: un tasso senza denominatore non è confrontabile con niente');
  assert.equal(corpo.data.cache.motivoAssente, null);

  assert.equal(corpo.data.primoToken.ms, 450, 'TTFT: il primo pezzo che arriva è il ragionamento');
  assert.equal(corpo.data.primoToken.tipo, 'ragionamento');
  assert.equal(corpo.data.primoToken.msPrimoVisibile, 5_000, 'TTFV: il testo visibile arriva molto dopo, e i due numeri restano SEPARATI');
  assert.equal(corpo.data.primoToken.inCorsoDaMs, 19_000);

  assert.equal(corpo.data.chiusura.motivo, null, 'il giro è ancora aperto: nessun motivo di chiusura inventato');
  assert.ok(corpo.data.chiusura.motivoAssente.includes('ancora in corso'));
});

test('⛔⛔ AL CONTRARIO — GET .../metrics su una sessione VIVA ma senza un solo evento dice «non registrato», mai uno 0% di cache', async (t) => {
  const registro = registroVeroConEventi(t, { emetti: () => {} });
  const { base } = await listen(t, { sessionRegistry: registro });
  const { sessionId } = registro.avvia('sconto-a-scaglioni');
  await Promise.resolve();

  const corpo = await (await fetch(`${base}/api/v1/sessions/${sessionId}/metrics`)).json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.data.registrato, false);
  assert.equal(corpo.data.motivo, 'non-registrato');
  assert.equal(corpo.data.cache, null, '⛔ «non registrato» e «cache a zero» sono due fatti diversi e non si dicono con la stessa parola');
  assert.equal(corpo.data.primoToken, null);
  assert.equal(corpo.data.chiusura, null);
  assert.equal(corpo.data.giri, null);
});

test('⛔⛔ AL CONTRARIO — GET .../metrics su un giro CONCLUSO male porta il motivo normalizzato E il codice grezzo', async (t) => {
  let ora = 1_000;
  const registro = registroVeroConEventi(t, {
    clock: () => new Date(ora),
    emetti: (onEvento) => {
      onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1', input: { consegna: 'c' } });
      ora = 2_000;
      onEvento({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
      ora = 3_000;
      onEvento({ type: 'RunError', message: 'giri finiti', code: 'giri-esauriti' });
    },
  });
  const { base } = await listen(t, { sessionRegistry: registro });
  const { sessionId } = registro.avvia('sconto-a-scaglioni');
  await Promise.resolve();

  const corpo = await (await fetch(`${base}/api/v1/sessions/${sessionId}/metrics`)).json();
  assert.equal(corpo.data.chiusura.motivo, 'giri-finiti');
  assert.equal(corpo.data.chiusura.codice, 'giri-esauriti', '⛔ il codice grezzo non si butta via: la mappatura fra vocabolari «cannot be defaulted»');
  assert.equal(corpo.data.primoToken.inCorsoDaMs, null, 'un giro chiuso non è «in corso da»');
  assert.equal(corpo.data.cache.frazione, null, 'questa sessione non ha mai riportato un consumo: null, mai 0%');
  assert.ok(corpo.data.cache.motivoAssente.includes('MISURATO'));
});

test('⛔ AL CONTRARIO — GET .../metrics su una sessione inesistente: 404 NOT_FOUND', async (t) => {
  const registro = registroVeroConEventi(t);
  const { base } = await listen(t, { sessionRegistry: registro });
  const risposta = await fetch(`${base}/api/v1/sessions/mai-esistita/metrics`);
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});

test('⛔ GET .../metrics rifiuta una query string, come le rotte vicine (requireNoQuery)', async (t) => {
  const registro = registroVeroConEventi(t, { emetti: () => {} });
  const { base } = await listen(t, { sessionRegistry: registro });
  const { sessionId } = registro.avvia('sconto-a-scaglioni');
  await Promise.resolve();

  const risposta = await fetch(`${base}/api/v1/sessions/${sessionId}/metrics?giro=1`);
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
});
