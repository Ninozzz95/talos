import test from 'node:test';
import assert from 'node:assert/strict';
import { dettaglioUtile, statoGiri, etichettaPermesso, etichettaPermessoConEccezioni, tonoPermesso, nomeModelloUmano, fondoInVista, testoVelocitaLocale,
  riassuntoSenzaChiedere, chipDelPermesso, GRUPPI_SENZA_CHIEDERE, LIVELLO_DELLA_POLITICA, attrezzoPassaSenzaChiedere, registraModelliLocali } from '../../src/components/chat-foot.js';
import { ATTREZZI_CON_PERMESSO_PER_ATTREZZO } from '../../../src/config.mjs';
import { LIVELLI_DI_ACCESSO, livelloConcedeDaSolo } from '../../../src/permessi-catena.mjs';
import { verificaPermessoScrittura } from '../../../src/kernel/talosHarness.mjs';
import { mkdtempSync } from 'node:fs';
import { rimuoviCartellaDiProva } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 06/09 — B12 (il contatore dei giri) e B11 (la pillola del permesso dice il vero, eccezioni comprese).

test('PIEDE-GIRI: il contatore tace sotto metà del tetto, poi è quieto, poi si accende', () => {
  assert.equal(statoGiri(9, 24), null); // 37%: un numero che non chiede niente a nessuno
  assert.equal(statoGiri(12, 24), 'quieto'); // esattamente il 50%
  assert.equal(statoGiri(19, 24), 'quieto'); // 79%
  assert.equal(statoGiri(20, 24), 'vicino'); // 83%: il tetto è vicino
  assert.equal(statoGiri(24, 24), 'vicino');
  // AL CONTRARIO: senza numero non si mostra niente; senza tetto dichiarato non c'è percentuale
  assert.equal(statoGiri(null, 24), null);
  assert.equal(statoGiri('molti', 24), null);
  assert.equal(statoGiri(0, null), null);
  assert.equal(statoGiri(3, null), 'quieto');
  assert.equal(statoGiri(3, 0), 'quieto');
});

test('PIEDE-PERMESSO: nome umano, mai il nome tecnico (H22)', () => {
  assert.equal(etichettaPermesso('Full access'), 'Accesso pieno');
  assert.equal(etichettaPermesso('On request'), 'Chiede prima');
  assert.equal(etichettaPermesso(''), 'Permesso non scelto');
  assert.equal(etichettaPermesso(undefined), 'Permesso non scelto');
  assert.equal(tonoPermesso('Full access'), 'danger');
  assert.equal(tonoPermesso('Workspace write'), 'warning');
  assert.equal(tonoPermesso('Read only'), null);
});

test('PIEDE-ECCEZIONI: la pillola dichiara i cancelli per attrezzo, che il permesso non promette', () => {
  // il caso misurato: «Accesso pieno» scelto, e due attrezzi su «chiedi» ereditati dal server
  assert.equal(etichettaPermessoConEccezioni('Full access', { scrivi: 'chiedi', shell: 'chiedi' }), 'Accesso pieno · 2 eccezioni');
  assert.equal(etichettaPermessoConEccezioni('Full access', { scrivi: 'nega' }), 'Accesso pieno · 1 eccezione');
  // AL CONTRARIO: senza eccezioni la pillola resta quella di sempre, e un valore vuoto non conta
  assert.equal(etichettaPermessoConEccezioni('Full access', {}), 'Accesso pieno');
  assert.equal(etichettaPermessoConEccezioni('Full access', null), 'Accesso pieno');
  assert.equal(etichettaPermessoConEccezioni('Full access', { scrivi: '', shell: null }), 'Accesso pieno');
  // C2b: Coordinazione sta nella stessa mappa ma non è un'eccezione «per attrezzo» (nel velo ha la sua sezione)
  assert.equal(etichettaPermessoConEccezioni('Workspace write', { delega_sottotask: 'sempre' }), 'Scrive nel progetto');
  assert.equal(etichettaPermessoConEccezioni('Workspace write', { delega_sottotask: 'sempre', shell: 'chiedi' }), 'Scrive nel progetto · 1 eccezione');
});

test('PIEDE-MODELLO: un identificatore locale diventa un nome, non una targa (H22)', () => {
  // il caso che l'owner ha visto a schermo, su due righe
  assert.equal(
    nomeModelloUmano('local:bartowski-nvidia_Nemotron-Cascade-2-30B-A3B-GGUF-931b595fc71b-nvidia-Nemotron-Cascade-2-30B-A3B-Q4-0-gguf'),
    'nvidia Nemotron Cascade 2 · 30B (3B attivi) · Q4_0',
  );
  // MoE con quantizzazione a super-blocchi: i parametri attivi si dicono, non si nascondono
  assert.equal(nomeModelloUmano('local:unsloth-Qwen3.5-35B-A3B-GGUF-abc123-Qwen3.5-35B-A3B-Q4_K_M-gguf'), 'Qwen3.5 · 35B (3B attivi) · Q4_K_M');
  // AL CONTRARIO: un modello di rete resta com'era, senza inventare pezzi
  assert.equal(nomeModelloUmano('z-ai/glm-5.3-flash'), 'glm-5.3-flash');
  assert.equal(nomeModelloUmano('claude-opus-5'), 'claude-opus-5');
  // e ciò che non si sa leggere non si butta: si mostra quel che c'è
  assert.equal(nomeModelloUmano('local:strano'), 'strano');
  assert.equal(nomeModelloUmano(''), '');
  assert.equal(nomeModelloUmano(null), '');
});

test('PIEDE-FONDO: «sono in fondo» guarda la fine del CONTENUTO, non del contenitore', () => {
  // il caso misurato: contenitore 684, contenuto + 342 di coda vuota, e la persona sta guardando la fine
  assert.equal(fondoInVista({ scrollHeight: 2000, scrollTop: 974, clientHeight: 684, coda: 342 }), true);
  // e appena sale davvero, la striscia deve tornare
  assert.equal(fondoInVista({ scrollHeight: 2000, scrollTop: 500, clientHeight: 684, coda: 342 }), false);
  /*
   * ⛔ Il caso MISURATO il 06/9 durante un giro vero: salito di 320 px con coda 314. Con la vecchia
   * tolleranza di 24 questo diceva «sono in fondo» mentre l'ultimo messaggio era già fuori schermo,
   * e la striscia del ragionamento restava muta proprio quando serviva.
   */
  assert.equal(fondoInVista({ scrollHeight: 1731, scrollTop: 413, clientHeight: 998, coda: 314 }), false, 'salito di 320 con coda 314: NON sono in fondo');
  /*
   * ⛔ owner 06/9: in una chat appena iniziata la striscia non deve comparire finché non c'è
   *    davvero uno scroll. Niente da scorrere = in fondo, senza far dipendere la risposta dalla
   *    coda: qui la coda è ENORME apposta, e non deve cambiare l'esito.
   */
  assert.equal(fondoInVista({ scrollHeight: 400, scrollTop: 0, clientHeight: 560, coda: 999 }), true, 'chat nuova: niente da scorrere');
  assert.equal(fondoInVista({ scrollHeight: 560, scrollTop: 0, clientHeight: 560, coda: 0 }), true, 'esattamente pieno: niente scroll');
  // AL CONTRARIO — appena c'è un pelo da scorrere oltre la coda, la risposta torna a dipendere dal conto
  assert.equal(fondoInVista({ scrollHeight: 900, scrollTop: 0, clientHeight: 560, coda: 100 }), false, 'si puo scorrere e sono in cima: non sono in fondo');
  // AL CONTRARIO — davvero in fondo, con solo il rumore sub-pixel di mezzo: resta «in fondo»
  assert.equal(fondoInVista({ scrollHeight: 1731, scrollTop: 733, clientHeight: 998, coda: 314 }), true, 'distanza 0: in fondo');
  assert.equal(fondoInVista({ scrollHeight: 1731, scrollTop: 730, clientHeight: 998, coda: 314 }), true, 'distanza 3: rumore sub-pixel, ancora in fondo');
  // senza spazio in coda vale il conto di sempre
  assert.equal(fondoInVista({ scrollHeight: 1000, scrollTop: 980, clientHeight: 20, coda: 0 }), true);
  assert.equal(fondoInVista({ scrollHeight: 1000, scrollTop: 100, clientHeight: 20, coda: 0 }), false);
  // AL CONTRARIO: senza numeri non si finge di sapere — si assume «in fondo», che tace invece di gridare
  assert.equal(fondoInVista({}), true);
  assert.equal(fondoInVista({ scrollHeight: NaN }), true);
});

test('PIEDE-VELOCITA: la barra dice i token al secondo solo col modello locale, altrimenti tace', () => {
  // owner 06/9: col locale la velocità è l'unica cosa che cambia da giro a giro — lì paghi in tempo
  assert.equal(testoVelocitaLocale('local:unsloth-gpt-oss-20b-GGUF', '42 token/s'), '42 token/s');
  // con un modello di rete la scritta sparisce del tutto: il tema lo vedi, non serve dirlo
  assert.equal(testoVelocitaLocale('z-ai/glm-5.3-flash', '42 token/s'), '');
  assert.equal(testoVelocitaLocale('claude-opus-5', '99 token/s'), '');
  // AL CONTRARIO: locale ma senza il numero (giro appena partito, runtime che non lo dichiara) → niente, mai uno zero
  assert.equal(testoVelocitaLocale('local:qualcosa', ''), '');
  assert.equal(testoVelocitaLocale('local:qualcosa', null), '');
  assert.equal(testoVelocitaLocale('', '42 token/s'), '');
  assert.equal(testoVelocitaLocale(null, null), '');
});

test('⛔ la striscia non dice due volte la stessa cosa', () => {
  // Il caso visto a schermo: il dettaglio era il nome, troncato.
  assert.equal(dettaglioUtile('Legge la parte finale di config.mjs…', 'Legge la parte finale di co…'), '');
  assert.equal(dettaglioUtile('Esegue un comando', 'Esegue un comando'), '');
  // AL CONTRARIO — un dettaglio che aggiunge davvero resta
  assert.equal(dettaglioUtile('Esegue un comando', 'npm run build'), 'npm run build');
  assert.equal(dettaglioUtile('Legge un file', 'config.mjs · 420 righe'), 'config.mjs · 420 righe');
  // niente dettaglio, niente da dire
  assert.equal(dettaglioUtile('Qualcosa', ''), '');
  assert.equal(dettaglioUtile('', 'solo il dettaglio'), 'solo il dettaglio');
});

/* ═══ C1 (owner 10/10/2026, «Elenco corto, come Cline»): il chip dice cosa passa senza chiedere ═══ */

test('CHIP-PERMESSI-01: «Scrive nel progetto» — file, comandi e documenti passano; il suggerimento dice la politica e cosa chiede sempre', () => {
  const r = riassuntoSenzaChiedere('Workspace write', {});
  assert.equal(r.testo, 'Senza chiedere: file, comandi, documenti');
  assert.equal(r.suggerimento, 'Permesso: Scrive nel progetto\nChiede sempre: scritture fuori dal progetto, file con segreti, azioni dopo un contenuto sospetto\nCambia il permesso');
  // C2b: la Coordinazione sta nella stessa mappa ma non è uno dei sei attrezzi
  assert.equal(riassuntoSenzaChiedere('Workspace write', { delega_sottotask: 'chiedi' }).testo, 'Senza chiedere: file, comandi, documenti');
});

test('CHIP-PERMESSI-02: «Accesso pieno» dice «tutto» solo se passa davvero tutto; un «chiedi» lo riporta all elenco', () => {
  assert.equal(riassuntoSenzaChiedere('Full access', {}).testo, 'Senza chiedere: tutto');
  assert.match(riassuntoSenzaChiedere('Full access', {}).suggerimento, /Chiede sempre: file con segreti, azioni dopo un contenuto sospetto/u);
  assert.doesNotMatch(riassuntoSenzaChiedere('Full access', {}).suggerimento, /fuori dal progetto/u, 'fuori dal progetto chiede solo «Scrive nel progetto»');
  // un comando su due chiede ancora: «comandi» si nomina (qualcosa passa), ma «tutto» sarebbe falso
  // review Y2 (owner 10/10): un gruppo a metà si scrive col nome della parte
  assert.equal(riassuntoSenzaChiedere('Full access', { shell: 'chiedi' }).testo, 'Senza chiedere: file, comandi (solo test), documenti');
  assert.equal(riassuntoSenzaChiedere('Full access', { shell: 'chiedi', prova: 'chiedi' }).testo, 'Senza chiedere: file, documenti');
});

test('CHIP-PERMESSI-03: «Chiede prima» chiede tutto; un «Per questa sessione» (un sempre) entra da solo', () => {
  assert.equal(riassuntoSenzaChiedere('On request', {}).testo, 'Chiede tutto');
  assert.equal(riassuntoSenzaChiedere('On request', { shell: 'sempre' }).testo, 'Senza chiedere: comandi (tranne i test)');
  assert.doesNotMatch(riassuntoSenzaChiedere('On request', {}).suggerimento, /Chiede sempre/u, 'chiede già tutto: niente riga in più');
});

test('CHIP-PERMESSI-04: «Solo lettura» resta il suo nome; un sempre passa anche lì (il suo ramo nel cancello viene prima)', () => {
  assert.equal(riassuntoSenzaChiedere('Read only', {}).testo, 'Solo lettura');
  assert.equal(riassuntoSenzaChiedere('Read only', { scrivi: 'sempre' }).testo, 'Senza chiedere: file (solo scrittura)');
  assert.equal(riassuntoSenzaChiedere('Research', {}).testo, 'Solo ricerca');
  // un valore sconosciuto non inventa niente
  assert.equal(riassuntoSenzaChiedere(undefined, {}).testo, 'Permesso non scelto');
});

test('CHIP-PERMESSI-05: un gruppo spento («nega» su tutti i suoi attrezzi) lo dice il suggerimento, e il chip non lo nomina', () => {
  const r = riassuntoSenzaChiedere('Workspace write', { shell: 'nega', prova: 'nega' });
  assert.equal(r.testo, 'Senza chiedere: file, documenti');
  assert.match(r.suggerimento, /Spenti: comandi/u);
  assert.deepEqual(r.spenti, ['commands']);
});

test('CHIP-PERMESSI-06 (contro il server): i gruppi sono ESATTAMENTE gli attrezzi con un permesso proprio, e i livelli concedono come il cancello', () => {
  const nostri = GRUPPI_SENZA_CHIEDERE.flatMap((g) => g.attrezzi);
  assert.deepEqual([...nostri].sort(), [...ATTREZZI_CON_PERMESSO_PER_ATTREZZO].sort(), 'un attrezzo nuovo col suo permesso deve entrare in un gruppo');
  for (const livello of LIVELLI_DI_ACCESSO) {
    for (const attrezzo of nostri) {
      assert.equal(attrezzoPassaSenzaChiedere(livello, undefined, attrezzo), livelloConcedeDaSolo(livello, attrezzo), `${livello} · ${attrezzo}`);
    }
  }
  assert.equal(attrezzoPassaSenzaChiedere('livello-inventato', undefined, 'scrivi'), false, 'un livello senza riga non concede niente');
  for (const livello of Object.values(LIVELLO_DELLA_POLITICA)) assert.ok(LIVELLI_DI_ACCESSO.includes(livello), livello);
});

test('CHIP-PERMESSI-07 (contro il CANCELLO VERO, review Y1/Y2): modalità × politica × eccezioni — il chip nomina esattamente ciò che passa senza chiedere', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-chip-'));
  t.after(() => rimuoviCartellaDiProva(cartella)); // BC09 classe A: il cancello si interroga e basta, nessun file resta aperto
  // le stesse azioni della prova del server (`c2a` C2A-CONCEDE-ONESTA)
  const azioni = {
    scrivi: { tipo: 'scrivi', percorso: join(cartella, 'a.txt') }, file_edit: { tipo: 'file_edit', percorso: join(cartella, 'a.txt') },
    prova: { tipo: 'prova', comando: 'npm test' }, shell: { tipo: 'shell', comando: 'echo ok' },
    document_create: { tipo: 'document_create', percorso: join(cartella, 'doc.md') }, generate_image: { tipo: 'generate_image', percorso: join(cartella, 'img.png') },
  };
  const varianti = [{}, { shell: 'chiedi' }, { prova: 'sempre' }, { scrivi: 'sempre' }, { shell: 'nega', prova: 'nega' }, { document_create: 'chiedi', file_edit: 'chiedi' }];
  let casi = 0;
  for (const modalitaOperativa of ['normale', 'piano']) {
    for (const [politica, livello] of Object.entries(LIVELLO_DELLA_POLITICA)) {
      for (const scelte of varianti) {
        const passaNelCancello = {};
        for (const [attrezzo, azione] of Object.entries(azioni)) {
          let chiesto = false;
          const esito = await verificaPermessoScrittura(azione, { livelloAccesso: livello, modalitaOperativa, permessiPerAttrezzo: scelte, cartella,
            chiediApprovazioneFn: async () => { chiesto = true; return false; } });
          passaNelCancello[attrezzo] = esito?.consentito === true && !chiesto;
        }
        const attesi = GRUPPI_SENZA_CHIEDERE.filter((g) => g.attrezzi.some((a) => passaNelCancello[a])).map((g) => g.chiave);
        const parziali = GRUPPI_SENZA_CHIEDERE.filter((g) => g.attrezzi.some((a) => passaNelCancello[a]) && !g.attrezzi.every((a) => passaNelCancello[a])).map((g) => g.chiave);
        const r = riassuntoSenzaChiedere(politica, scelte, { modalitaOperativa });
        const etichetta = `${modalitaOperativa} · ${politica} · ${JSON.stringify(scelte)} · cancello ${JSON.stringify(passaNelCancello)}`;
        assert.deepEqual(r.gruppi, attesi, etichetta);
        assert.deepEqual(r.parziali, parziali, etichetta);
        if (modalitaOperativa === 'piano') assert.equal(r.testo, 'Piano: solo lettura', etichetta);
        casi += 1;
      }
    }
  }
  assert.equal(casi, 2 * Object.keys(LIVELLO_DELLA_POLITICA).length * varianti.length);
});

test('CHIP-PERMESSI-08 (review Y1): in Piano il chip lo dice, e il suggerimento nomina il permesso che torna', () => {
  const r = riassuntoSenzaChiedere('Full access', {}, { modalitaOperativa: 'piano' });
  assert.equal(r.testo, 'Piano: solo lettura');
  assert.equal(r.suggerimento, 'Permesso: Accesso pieno\nTorna attivo quando esci dal Piano\nCambia il permesso');
  // al contrario: fuori dal Piano torna a dire cosa passa
  assert.equal(riassuntoSenzaChiedere('Full access', {}, { modalitaOperativa: 'normale' }).testo, 'Senza chiedere: tutto');
});

test('CHIP-PERMESSI-09 (review N1): con un «sempre» e un livello che non è Accesso pieno, il suggerimento dice anche la trifecta', () => {
  assert.match(riassuntoSenzaChiedere('On request', { shell: 'sempre' }).suggerimento, /invii di dati dopo letture private e contenuti esterni/u);
  assert.doesNotMatch(riassuntoSenzaChiedere('Full access', { shell: 'sempre' }).suggerimento, /invii di dati/u, 'con Accesso pieno la trifecta non chiede');
  assert.doesNotMatch(riassuntoSenzaChiedere('Workspace write', {}).suggerimento, /invii di dati/u, 'senza un sempre non scatta');
});

test('CHIP-PERMESSI-10 (review delta Y): a turned-off group is named plainly in «Spenti», never with an empty part', () => {
  const comandi = riassuntoSenzaChiedere('Workspace write', { shell: 'nega', prova: 'nega' }).suggerimento;
  assert.match(comandi, /Spenti: comandi(\n|$)/u);
  assert.doesNotMatch(comandi, /\(\)/u, 'no empty brackets anywhere in the tooltip');
  const documenti = riassuntoSenzaChiedere('Full access', { document_create: 'nega', generate_image: 'nega' }).suggerimento;
  assert.match(documenti, /Spenti: documenti(\n|$)/u);
  assert.doesNotMatch(documenti, /\(\)/u);
});

/* 11/10/2026 — visto in foto al primo giro vero col piano ChatGPT: «chatgpt:gpt-5.6-luna» in testata, nella pillola e nella riga
   della sessione. Il prefisso `fornitore:` è instradamento, non il nome del modello (regola: mai l'id grezzo a schermo). Valeva per
   OGNI fornitore diretto, non solo per il piano. */
test('NOME-MODELLO-PREFISSO: il prefisso di un fornitore diretto non arriva a schermo; un due punti che non è un fornitore resta', async () => {
  const { nomeModello } = await import('../../src/components/session-item.js');
  for (const leggi of [nomeModelloUmano, nomeModello]) {
    assert.equal(leggi('chatgpt:gpt-5.6-luna'), 'gpt-5.6-luna');
    assert.equal(leggi('deepseek:deepseek-chat'), 'deepseek-chat');
    assert.equal(leggi('openai:gpt-6-sol'), 'gpt-6-sol');
    assert.equal(leggi('z-ai/glm-5.3-flash'), 'glm-5.3-flash', 'OpenRouter come prima');
    assert.equal(leggi('meta-llama/llama-4-scout:free'), 'llama-4-scout:free', 'la variante di OpenRouter non è un fornitore');
    assert.equal(leggi('zai-anthropic:glm-5.3'), 'glm-5.3', 'anche un fornitore col trattino');
    assert.equal(leggi('qualcosa:'), 'qualcosa:', 'un prefisso senza niente dopo non si svuota');
  }
});

/*
 * 24/10/2026 (owner, consigliata): nel compositore il NOME BREVE del livello; cosa passa senza chiedere (C1) apre il suggerimento.
 * Le eccezioni per attrezzo restano a schermo; il Piano resta «Piano: solo lettura».
 */
test('CHIP-BREVE-01 nome breve del livello; la frase di C1 apre il suggerimento, seguita da quello di prima', () => {
  const c = chipDelPermesso('Workspace write', {});
  assert.equal(c.testo, 'Scrive nel progetto');
  assert.equal(c.suggerimento, `Senza chiedere: file, comandi, documenti\n${riassuntoSenzaChiedere('Workspace write', {}).suggerimento}`);
  assert.equal(chipDelPermesso('Full access', {}).testo, 'Accesso pieno');
  assert.equal(chipDelPermesso('On request', {}).testo, 'Chiede prima');
});
test('CHIP-BREVE-02 le eccezioni per attrezzo restano a schermo (un «sempre» su Solo lettura non si nasconde)', () => {
  const c = chipDelPermesso('Read only', { scrivi: 'sempre' });
  assert.equal(c.testo, 'Solo lettura · 1 eccezione');
  assert.ok(c.suggerimento.startsWith('Senza chiedere: file (solo scrittura)\n'), c.suggerimento);
  assert.equal(chipDelPermesso('Full access', { shell: 'chiedi', prova: 'chiedi' }).testo, 'Accesso pieno · 2 eccezioni');
  assert.equal(chipDelPermesso('Workspace write', { delega_sottotask: 'chiedi' }).testo, 'Scrive nel progetto', 'la Coordinazione non è un\'eccezione');
});
test('CHIP-BREVE-03 AL CONTRARIO: dove la frase di C1 è già il nome, il suggerimento non la ripete; il Piano resta com\'era', () => {
  const ro = chipDelPermesso('Read only', {});
  assert.equal(ro.testo, 'Solo lettura');
  assert.equal(ro.suggerimento, riassuntoSenzaChiedere('Read only', {}).suggerimento);
  const piano = chipDelPermesso('Full access', {}, { modalitaOperativa: 'piano' });
  assert.deepEqual(piano, { testo: 'Piano: solo lettura', suggerimento: riassuntoSenzaChiedere('Full access', {}, { modalitaOperativa: 'piano' }).suggerimento });
});

/* 27/10/2026 (owner, foto del 4174): «LFM2 5 · 24B». L'id del modello locale è la targa del repo con i punti diventati trattini, e da
   lì «2.5» non si ricostruisce (SmolLM2-1-7B è 1,7 B, Llama-3-8B è 8 B: nessuna regola sul testo distingue). Il nome vero è quello del
   FILE nel catalogo (`files[0].path`), e lì il punto c'è. */
test('NOME-LOCALE-01 col catalogo letto, il nome viene dal file del modello: il punto della versione resta', () => {
  const lfm = 'local:LiquidAI-LFM2-5-24B-A2B-GGUF-0912d33141f7-LFM2-5-24B-A2B-Q4-K-M';
  const glm = 'local:unsloth-GLM-4-7-Flash-GGUF-0d32489ecb9d-GLM-4-7-Flash-Q4-K-M';
  const prima = nomeModelloUmano(lfm);
  assert.equal(registraModelliLocali([
    { id: lfm.slice(6), files: [{ path: 'LFM2.5-24B-A2B-Q4_K_M.gguf' }] },
    { id: glm.slice(6), files: [{ path: 'GLM-4.7-Flash-Q4_K_M.gguf' }] },
    { id: 'senza-file', files: [] },
  ]), true, 'il catalogo nuovo cambia qualcosa: chi chiama ridisegna');
  assert.equal(nomeModelloUmano(lfm), 'LFM2.5 · 24B (2B attivi) · Q4_K_M');
  assert.equal(nomeModelloUmano(glm), 'GLM 4.7 Flash · Q4_K_M', 'senza il prefisso di chi pubblica: il nome del file non ce l\'ha');
  assert.notEqual(prima, nomeModelloUmano(lfm));
  assert.equal(registraModelliLocali([{ id: lfm.slice(6), files: [{ path: 'LFM2.5-24B-A2B-Q4_K_M.gguf' }] }]), false, 'lo stesso catalogo non chiede di ridisegnare');
  /* AL CONTRARIO: un modello che il catalogo non conosce resta tradotto dall'id, come prima */
  assert.equal(nomeModelloUmano('local:unsloth-Qwen3.5-35B-A3B-GGUF-abc123-Qwen3.5-35B-A3B-Q4_K_M-gguf'), 'Qwen3.5 · 35B (3B attivi) · Q4_K_M');
});

test('NOME-LOCALE-02 un modello diviso in più file dice il nome del modello, non «00001 of»', () => {
  registraModelliLocali([{ id: 'x-Big-GGUF-1-Big', files: [{ path: 'Qwen3.5-122B-A10B-Q4_K_M-00001-of-00003.gguf' }] }]);
  assert.equal(nomeModelloUmano('local:x-Big-GGUF-1-Big'), 'Qwen3.5 · 122B (10B attivi) · Q4_K_M');
});

test('NOME-LOCALE-03 (revisione blocco 8, G-R1) un file dal nome generico non cancella il nome che l\'id sa dire', () => {
  registraModelliLocali([
    { id: 'TheBloke-Llama-2-7B-GGUF-abc-llama-2-7b-q4_0', files: [{ path: 'ggml-model-q4_0.gguf' }] },
    { id: 'microsoft-Phi-3-mini-gguf-def-phi3', files: [{ path: 'model.gguf' }] },
    { id: 'x-Qwen3-8B-GGUF-ghi-Qwen3-8B-Q4_K_M', files: [{ path: 'Scaricato (1).gguf' }] },
  ]);
  assert.match(nomeModelloUmano('local:TheBloke-Llama-2-7B-GGUF-abc-llama-2-7b-q4_0'), /^Llama 2/u);
  assert.match(nomeModelloUmano('local:microsoft-Phi-3-mini-gguf-def-phi3'), /^Phi 3 mini/u);
  assert.doesNotMatch(nomeModelloUmano('local:x-Qwen3-8B-GGUF-ghi-Qwen3-8B-Q4_K_M'), /Scaricato/u);
  /* AL CONTRARIO: un file con un nome vero vince ancora */
  registraModelliLocali([{ id: 'LiquidAI-LFM2-5-1B-GGUF-x-LFM2-5-1B-Q8-0', files: [{ path: 'LFM2.5-1B-Q8_0.gguf' }] }]);
  assert.match(nomeModelloUmano('local:LiquidAI-LFM2-5-1B-GGUF-x-LFM2-5-1B-Q8-0'), /^LFM2\.5/u);
});
