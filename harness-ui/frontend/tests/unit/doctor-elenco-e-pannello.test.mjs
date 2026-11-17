/*
 * 023 passo 2 (owner 10/11/2026 21:47, registro 436): il Doctor a «Elenco e pannello», una sola voce «Modelli e accessi» al posto di
 * «Chiave API» + «Fornitori e portachiavi», lo stato VERO di ogni fornitore (chiave e accesso col piano sono due fonti distinte).
 * B3/E1: l'accesso col piano si prova con stato FINTO; campo assente = «non misurato», mai «collegato».
 * B2: «Cosa puoi fare» non è mai solo «Ricontrolla»: un'azione vera, oppure la frase «Da qui non si può fare niente».
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { controlliDoctor, contaGravitaDoctor, verdettoDoctor, vociMenuDoctor, testoDaCopiareDoctor, domandaDoctor, TIPI_AZIONE_DOCTOR, vociDelDoctor, ricontrollaSoloQuesta, esportazioneDoctor } from '../../src/components/doctor.js';
import { impostaLingua } from '../../src/components/lingua.js';

const base = { chiaveApi: false, shell: 'desktop', git: true, naviga: true };
const riga = (id, label, extra = {}) => ({ id, label, requiresKey: true, keyConfigured: false, origineChiave: null, execution: 'collegato', ...extra });
/* La forma che manda `providerStore.listPublic()` (`src/provider-credential-store.mjs:802-847`): il piano ChatGPT NON è fra le righe. */
const fornitori = (...sopra) => ({ storeAvailable: true, items: [
  riga('openai', 'OpenAI'), riga('openrouter', 'OpenRouter'), riga('anthropic', 'Anthropic'),
  riga('ollama', 'Ollama Local', { requiresKey: false, execution: 'runtime locale' }),
  { id: 'esterno', label: 'Agente esterno', requiresKey: false, keyConfigured: false, origineChiave: null, execution: 'da configurare' },
].map((p) => ({ ...p, ...(sopra.find((s) => s.id === p.id) || {}) })) });
const piano = (collegato, pianoAbilitato, extra = {}) => ({ accessoPiano: { chatgpt: { collegato, pianoAbilitato, ...extra } } });
const voce = (c, id) => c.find((v) => v.id === id);
const fornitore = (c, id) => voce(c, 'fornitori').fornitori.find((f) => f.id === id);

test.beforeEach(() => impostaLingua('it'));

test('DOCTOR-023-01 — una sola voce «Modelli e accessi»: «Chiave API» non è più una carta a parte, e niente si perde', () => {
  const c = controlliDoctor({ ...base, providers: fornitori() });
  assert.equal(voce(c, 'chiave'), undefined, 'la carta «Chiave API» è fusa nella voce dei fornitori');
  assert.equal(voce(c, 'fornitori').titolo, 'Modelli e accessi');
  assert.equal(voce(c, 'fornitori').fornitori.length, 5, 'ogni fornitore della risposta ha la sua riga');
  assert.match(voce(c, 'fornitori').dettaglio.join(' '), /Portachiavi del sistema disponibile/u, 'lo stato del portachiavi resta');
  assert.deepEqual(c.map((v) => v.id).sort(), ['browser', 'cartelle', 'catalogo', 'fornitori', 'git', 'labs', 'ricerca', 'runtime', 'sessioni', 'shell']);
  impostaLingua('en');
  assert.equal(voce(controlliDoctor({ ...base, providers: fornitori() }), 'fornitori').titolo, 'Models and access');
});

test('DOCTOR-023-02 — piano ChatGPT (stato FINTO) collegato e senza chiavi: OpenAI è pronto, e la voce è verde', () => {
  const c = controlliDoctor({ ...base, providers: fornitori(), ...piano(true, true) });
  const openai = fornitore(c, 'openai');
  assert.equal(openai.stato, 'Piano ChatGPT collegato');
  assert.equal(openai.pronto, true);
  assert.equal(openai.gravita, 'success');
  assert.match(openai.sotto, /la chiave API non serve/u);
  assert.equal(voce(c, 'fornitori').gravita, 'success');
  assert.equal(voce(c, 'fornitori').riga, '1 fornitore pronto: OpenAI (piano ChatGPT collegato).');
  assert.equal(voce(c, 'fornitori').azioni[0].testo, 'Apri Provider');
});

test('DOCTOR-023-03 — campo del piano ASSENTE: «non misurato», mai «collegato», e mai un guasto inventato', () => {
  const c = controlliDoctor({ ...base, providers: fornitori() });
  const v = voce(c, 'fornitori');
  assert.doesNotMatch(JSON.stringify(v), /collegato/iu, 'oggi 25 righe su 28 dicono «chiave assente · collegato»: quella parola non deve più uscire');
  assert.match(fornitore(c, 'openai').sotto, /non misurato/u);
  assert.equal(fornitore(c, 'openai').pronto, false);
  assert.equal(v.gravita, 'warning', 'senza la misura del piano non si può dire «TALOS non può rispondere»');
  assert.match(v.riga, /non (è )?misurato/u);
  assert.notEqual(verdettoDoctor(c).titolo, 'TALOS non può ancora rispondere');
  /* 023 cura 1 (owner 11/11/2026 07:50, punto 8): via il verdetto in più «Controlla l’accesso ai modelli». Il bozzetto ha i suoi
     titoli (`bozzetto.html:666`) e l'avviso dei modelli conta come ogni altro avviso: la frase sotto il titolo dice che il piano non
     è misurato. */
  assert.equal(verdettoDoctor(c).titolo, 'Puoi lavorare. 1 cosa da rivedere');
  assert.equal(verdettoDoctor(c).frase, v.riga);
  assert.equal(verdettoDoctor(c).gravita, 'warning');
  assert.match(v.limite, /Non misura i motori locali/u, 'chi usa solo un motore locale deve leggere che questo controllo non lo vede');
  impostaLingua('en');
  assert.equal(verdettoDoctor(controlliDoctor({ ...base, providers: fornitori() })).titolo, 'You can work. 1 thing to review');
  for (const lingua of ['it', 'en']) {
    impostaLingua(lingua);
    for (const dati of [{ ...base }, { ...base, providers: fornitori() }, { ...base, providers: fornitori(), ...piano(false, false) }, { ...base, providers: fornitori(), ...piano(true, true) }]) {
      assert.doesNotMatch(verdettoDoctor(controlliDoctor(dati)).titolo, /Controlla l’accesso ai modelli|Check the access to the models/u, lingua);
    }
  }
});

test('DOCTOR-023-04 — piano misurato e NON collegato, zero chiavi: guasto, e l’azione porta a collegare un fornitore', () => {
  const c = controlliDoctor({ ...base, providers: fornitori(), ...piano(false, false) });
  const v = voce(c, 'fornitori');
  assert.equal(v.gravita, 'danger');
  /* 023 cura 1 (owner 11/11/2026 07:50, punto 9): la frase approvata. Un motore locale già avviato risponde anche senza chiavi né piano,
     e questo controllo non lo misura: «TALOS non può rispondere» sarebbe falso per chi lo usa. */
  assert.equal(v.riga, 'Nessun fornitore pronto. Se usi un motore locale già avviato, TALOS può rispondere con quello: questo controllo non lo misura.');
  assert.equal(verdettoDoctor(c).frase, v.riga, 'la frase sta anche sotto il verdetto');
  assert.doesNotMatch(v.limite, /motori locali/u, 'la riga lo dice già: il limite non lo ripete');
  assert.equal(fornitore(c, 'openai').stato, 'Nessun accesso');
  assert.equal(fornitore(c, 'openai').sotto, 'Né piano ChatGPT né chiave API.');
  assert.deepEqual(v.azioni.map((a) => [a.testo, a.tipo, a.dove]), [['Collega un fornitore', 'apri', 'provider']]);
  const ver = verdettoDoctor(c);
  assert.equal(ver.titolo, 'TALOS non può ancora rispondere');
  assert.equal(ver.gravita, 'danger');
  assert.equal(ver.azione.testo, 'Collega un fornitore');
  impostaLingua('en');
  assert.equal(voce(controlliDoctor({ ...base, providers: fornitori(), ...piano(false, false) }), 'fornitori').riga, 'No provider is ready. If you use a local engine that is already running, TALOS can answer through it: this check does not measure it.');
});

test('DOCTOR-023-05 — «collegato» solo con collegato === true, «pronto» solo con pianoAbilitato === true', () => {
  const senzaPermesso = controlliDoctor({ ...base, providers: fornitori(), ...piano(true, false) });
  assert.equal(fornitore(senzaPermesso, 'openai').stato, 'Piano ChatGPT da ricollegare');
  assert.equal(fornitore(senzaPermesso, 'openai').pronto, false);
  assert.equal(fornitore(senzaPermesso, 'openai').gravita, 'warning');
  /* un avviso dice il suo motivo anche quando altri fornitori sono pronti: la riga di OpenAI sta sotto «Tutti», nascosta da «Pronti» */
  const conAltriPronti = controlliDoctor({ ...base, providers: fornitori({ id: 'openrouter', keyConfigured: true, origineChiave: 'custodia' }), ...piano(true, false) });
  const v = voce(conAltriPronti, 'fornitori');
  assert.equal(v.gravita, 'warning');
  assert.equal(v.riga, '1 fornitore pronto: OpenRouter (chiave salvata). Da rivedere: OpenAI.');
  assert.ok(v.dettaglio.includes('OpenAI: Piano ChatGPT da ricollegare. L’accesso c’è ma non permette di usare i modelli. Rientra da Laboratorio modelli › Provider.'), JSON.stringify(v.dettaglio));
  assert.doesNotMatch(voce(controlliDoctor({ ...base, providers: fornitori({ id: 'openrouter', keyConfigured: true }), ...piano(true, true) }), 'fornitori').riga, /Da rivedere/u, 'senza avvisi la riga non cambia');
  impostaLingua('en');
  assert.match(voce(controlliDoctor({ ...base, providers: fornitori({ id: 'openrouter', keyConfigured: true }), ...piano(true, false) }), 'fornitori').riga, / To review: OpenAI\.$/u);
  impostaLingua('it');
  for (const finto of [piano('true', 'true'), piano(1, 1), { accessoPiano: { chatgpt: null } }, { accessoPiano: 'collegato' }, { accessoPiano: { chatgpt: { pianoAbilitato: true } } }]) {
    const c = controlliDoctor({ ...base, providers: fornitori(), ...finto });
    assert.equal(fornitore(c, 'openai').pronto, false, JSON.stringify(finto));
    assert.doesNotMatch(JSON.stringify(voce(c, 'fornitori')), /collegato/iu, JSON.stringify(finto));
    assert.match(fornitore(c, 'openai').sotto, /non misurato/u, JSON.stringify(finto));
  }
});

test('DOCTOR-023-06 — dal campo del piano passano due booleani: email, scadenza e token non arrivano mai alla pagina', () => {
  const c = controlliDoctor({ ...base, providers: fornitori(), ...piano(true, true, { email: 'persona@esempio.test', scadeAlle: '2026-12-01T10:00:00Z', refreshToken: 'rt-finto-123' }) });
  const tutto = JSON.stringify(c) + c.map(testoDaCopiareDoctor).join('\n');
  assert.doesNotMatch(tutto, /persona@esempio\.test|2026-12-01|rt-finto-123/u);
});

test('DOCTOR-023-07 — chiave salvata: si dice da dove viene, e che non è stata provata', () => {
  const c = controlliDoctor({ ...base, chiaveApi: true, providers: fornitori({ id: 'openrouter', keyConfigured: true, origineChiave: 'custodia' }, { id: 'anthropic', keyConfigured: true, origineChiave: 'ambiente' }), ...piano(false, false) });
  assert.equal(fornitore(c, 'openrouter').stato, 'Chiave salvata');
  assert.match(fornitore(c, 'openrouter').sotto, /portachiavi del sistema.*Non ancora provata/u);
  assert.match(fornitore(c, 'anthropic').sotto, /ambiente del sistema, non dal portachiavi/u);
  assert.equal(voce(c, 'fornitori').riga, '2 fornitori pronti: OpenRouter (chiave salvata), Anthropic (chiave salvata).');
  assert.equal(voce(c, 'fornitori').gravita, 'success');
  assert.match(voce(c, 'fornitori').limite, /non che una chiamata al modello riesca/u);
  assert.equal(fornitore(c, 'ollama').pronto, false, 'il Doctor non misura se il runtime locale è avviato: non lo dà per pronto');
  assert.equal(fornitore(c, 'esterno').stato, 'Da configurare');
});

test('DOCTOR-023-08 — portachiavi non disponibile: resta un avviso anche con un fornitore pronto', () => {
  const c = controlliDoctor({ ...base, providers: { ...fornitori(), storeAvailable: false }, ...piano(true, true) });
  assert.equal(voce(c, 'fornitori').gravita, 'warning');
  assert.match(voce(c, 'fornitori').dettaglio.join(' '), /non disponibile: le chiavi non si possono salvare/u);
});

const SCENE = {
  vuota: { ...base },
  niente: { ...base, providers: fornitori(), ...piano(false, false) },
  piano: { ...base, providers: fornitori(), ...piano(true, true) },
  tuttoRotto: { chiaveApi: false, shell: 'none', git: false, naviga: false, providers: fornitori(), ownerRuntime: { configurato: true, pronto: false }, catalogoTask: { disponibile: false },
    cartelleProgetto: { disponibili: false, conteggio: 0 }, ricercaWeb: { fonte: 'tavily', pronta: false }, labs: { accesi: [] },
    sessioniPersistenza: { corrotte: ['a'], scartate: [{ sessionId: 'a', motivo: 'corrotta' }], ultimaLettura: { ripristinate: 13, totali: 14 } } },
};

test('DOCTOR-023-09 (B2) — «Cosa puoi fare»: mai solo «Ricontrolla», al massimo due azioni, e per avvisi e guasti un’azione vera o la frase', () => {
  for (const [nome, dati] of Object.entries(SCENE)) for (const lingua of ['it', 'en']) {
    impostaLingua(lingua);
    for (const v of controlliDoctor(dati)) {
      const dove = `${nome}/${lingua}/${v.id}`;
      assert.ok(v.azioni.length <= 2, dove);
      for (const a of v.azioni) {
        assert.ok(TIPI_AZIONE_DOCTOR.includes(a.tipo), `${dove}: tipo ${a.tipo}`);
        assert.notEqual(a.tipo, 'ricontrolla', `${dove}: «Ricontrolla» sta nel menu «⋯», non fra le cose che puoi fare`);
        assert.ok(a.testo && !/^varie\./u.test(a.testo), `${dove}: testo dell’azione`);
      }
      if (v.gravita === 'warning' || v.gravita === 'danger') {
        assert.ok(v.azioni.length > 0 || v.nienteDaFare, `${dove}: né un’azione vera né la frase`);
        if (!v.azioni.length) assert.match(v.nienteDaFare, lingua === 'it' ? /^Da qui non si può fare niente/u : /^There is nothing you can do from here/u, dove);
      } else assert.equal(v.nienteDaFare || '', '', `${dove}: la frase solo dove c’è qualcosa da rivedere`);
      assert.ok(v.riga && v.righe.includes(v.riga), `${dove}: la riga breve sta anche in «righe» (la legge il riassunto)`);
      assert.doesNotMatch(JSON.stringify(v), /varie\.doctor\./u, `${dove}: una chiave del dizionario è arrivata a schermo`);
    }
  }
});

test('DOCTOR-023-10 — un’azione «vai» punta a un controllo che esiste; il menu «⋯» ha le tre voci del bozzetto', () => {
  const c = controlliDoctor(SCENE.tuttoRotto);
  const vai = voce(c, 'catalogo').azioni.find((a) => a.tipo === 'vai');
  assert.equal(vai.id, 'runtime');
  assert.match(vai.testo, /Servizio agente/u);
  assert.deepEqual(voce(c, 'shell').azioni.map((a) => [a.tipo, a.dove]), [['apri', 'doveGirano']]);
  assert.deepEqual(voce(c, 'ricerca').azioni.map((a) => [a.tipo, a.dove]), [['apri', 'fonteRicerca']]);
  assert.deepEqual(voce(c, 'cartelle').azioni.map((a) => [a.tipo, a.dove]), [['apri', 'spazio']]);
  assert.deepEqual(voce(c, 'sessioni').azioni.map((a) => a.tipo), ['copia']);
  assert.deepEqual(vociMenuDoctor(voce(c, 'git')).map((a) => [a.tipo, a.testo]), [['ricontrolla', 'Ricontrolla solo questo'], ['copia', 'Copia i dettagli'], ['chiedi', 'Chiedi a TALOS di spiegarlo']]);
});

test('DOCTOR-023-11 — il verdetto: una frase sola che dice se puoi lavorare', () => {
  assert.equal(verdettoDoctor(controlliDoctor(SCENE.piano)).gravita, 'success');
  const pulito = controlliDoctor({ ...SCENE.piano, shell: 'wsl2', ownerRuntime: { configurato: true, pronto: true }, catalogoTask: { disponibile: true }, cartelleProgetto: { disponibili: true, conteggio: 1 }, ricercaWeb: { fonte: 'duckduckgo', pronta: true }, labs: { accesi: [] }, sessioniPersistenza: { corrotte: [], ultimaLettura: { ripristinate: 14, totali: 14 } } });
  assert.equal(verdettoDoctor(pulito).titolo, 'Tutto a posto');
  assert.equal(verdettoDoctor(pulito).azione, null);
  const unAvviso = controlliDoctor({ ...SCENE.piano, git: false });
  assert.equal(verdettoDoctor(unAvviso).titolo, 'Puoi lavorare. 1 cosa da rivedere');
  assert.equal(verdettoDoctor(unAvviso).gravita, 'warning');
  assert.deepEqual([verdettoDoctor(unAvviso).azione.tipo, verdettoDoctor(unAvviso).azione.id], ['vai', 'git']);
  assert.match(verdettoDoctor(unAvviso).azione.testo, /^Guarda «Git»$/u);
  const dueAvvisi = controlliDoctor({ ...SCENE.piano, git: false, naviga: false });
  assert.equal(verdettoDoctor(dueAvvisi).titolo, 'Puoi lavorare. 2 cose da rivedere');
  const guastoAltrove = controlliDoctor({ ...SCENE.piano, shell: 'none' });
  assert.equal(verdettoDoctor(guastoAltrove).titolo, 'Puoi lavorare, ma c’è un guasto da guardare');
  assert.equal(verdettoDoctor(guastoAltrove).gravita, 'danger');
  assert.equal(verdettoDoctor(guastoAltrove).frase, voce(guastoAltrove, 'fornitori').riga);
  impostaLingua('en');
  assert.equal(verdettoDoctor(controlliDoctor(SCENE.niente)).titolo, 'TALOS cannot answer yet');
});

test('DOCTOR-023-12 — «Copia i dettagli»: titolo, esito, righe e fornitori; i conteggi contano le voci nuove', () => {
  const c = controlliDoctor({ ...SCENE.piano, git: false });
  const copia = testoDaCopiareDoctor(voce(c, 'fornitori'));
  assert.match(copia, /^Modelli e accessi — OK/u);
  assert.match(copia, /OpenAI: Piano ChatGPT collegato/u);
  assert.match(copia, /Anthropic: Nessun accesso/u);
  assert.deepEqual(contaGravitaDoctor(c), { success: 1, info: 8, warning: 1, danger: 0 });
});

test('DOCTOR-023-13 — tre casi di confine: chiave OpenRouter dell’ambiente, chiave con piano da ricollegare, piano collegato senza la riga di OpenAI', () => {
  /* `chiaveApi` è la chiave OpenRouter che il server legge dall'ambiente: vale per OpenRouter, anche se il portachiavi non ne ha */
  const ambiente = controlliDoctor({ ...base, chiaveApi: true, providers: fornitori(), ...piano(false, false) });
  assert.equal(fornitore(ambiente, 'openrouter').stato, 'Chiave salvata');
  assert.equal(fornitore(ambiente, 'openrouter').pronto, true);
  assert.match(fornitore(ambiente, 'openrouter').sotto, /ambiente del sistema, non dal portachiavi/u);
  assert.equal(fornitore(ambiente, 'anthropic').pronto, false, 'la chiave dell’ambiente è di OpenRouter, non di tutti');
  assert.equal(voce(ambiente, 'fornitori').riga, '1 fornitore pronto: OpenRouter (chiave salvata).');
  assert.equal(voce(ambiente, 'fornitori').gravita, 'success');
  /* la chiave c'è, quindi OpenAI risponde; ma l'accesso col piano va rifatto, e resta un avviso */
  const tutteEDue = controlliDoctor({ ...base, providers: fornitori({ id: 'openai', keyConfigured: true, origineChiave: 'custodia' }), ...piano(true, false) });
  assert.equal(fornitore(tutteEDue, 'openai').stato, 'Chiave salvata');
  assert.equal(fornitore(tutteEDue, 'openai').pronto, true);
  assert.equal(fornitore(tutteEDue, 'openai').gravita, 'warning');
  assert.match(fornitore(tutteEDue, 'openai').sotto, /non permette di usare i modelli/u);
  assert.equal(voce(tutteEDue, 'fornitori').gravita, 'warning');
  /* la risposta non ha la riga di OpenAI ma il piano è collegato: l'accesso c'è e si dice, in testa */
  const senzaRiga = { storeAvailable: true, items: [riga('anthropic', 'Anthropic')] };
  const aggiunta = controlliDoctor({ ...base, providers: senzaRiga, ...piano(true, true) });
  assert.deepEqual(voce(aggiunta, 'fornitori').fornitori.map((f) => [f.id, f.pronto]), [['openai', true], ['anthropic', false]]);
  assert.equal(voce(aggiunta, 'fornitori').riga, '1 fornitore pronto: OpenAI (piano ChatGPT collegato).');
  assert.deepEqual(voce(controlliDoctor({ ...base, providers: senzaRiga, ...piano(false, false) }), 'fornitori').fornitori.map((f) => f.id), ['anthropic'], 'senza piano collegato non si inventa una riga');
});

test('DOCTOR-023-14 — «Chiedi a TALOS di spiegarlo»: la domanda porta titolo, esito e riga breve del controllo, niente altro', () => {
  const c = controlliDoctor({ ...SCENE.piano, shell: 'none', ...piano(true, true, { email: 'persona@esempio.test' }) });
  assert.equal(domandaDoctor(voce(c, 'shell')), 'Spiegami questo controllo del Doctor e cosa devo fare: «Ambiente dei comandi» (Guasto). ' + voce(c, 'shell').riga);
  assert.ok(voce(c, 'shell').riga.length > 0);
  assert.doesNotMatch(domandaDoctor(voce(c, 'fornitori')), /persona@esempio\.test/u);
  impostaLingua('en');
  assert.match(domandaDoctor(voce(controlliDoctor({ ...SCENE.piano, shell: 'none' }), 'shell')), /^Explain this Doctor check and what I should do: “.+” \(.+\)\. .+/u);
});

test('DOCTOR-023-15 — «Ricontrolla solo questo» (bozzetto :660): dal controllo rifatto si prende SOLO quella voce, le altre restano', () => {
  const prima = vociDelDoctor({ ...SCENE.piano, git: false, naviga: false });
  assert.equal(voce(prima, 'git').gravita, 'warning');
  // il server rifà tutto (non ha un controllo per voce): qui git torna a posto e anche il browser, ma si è chiesto solo git
  const dopo = { ...SCENE.piano, git: true, naviga: true };
  const esito = ricontrollaSoloQuesta(prima, dopo, 'git');
  assert.equal(esito.stessoEsito, false);
  assert.equal(voce(esito.voci, 'git').gravita, 'success', 'la voce chiesta prende il nuovo esito');
  assert.equal(voce(esito.voci, 'browser').gravita, 'warning', 'le altre restano come erano: si è ricontrollata solo una riga');
  assert.equal(esito.voci.length, prima.length);
  assert.deepEqual(esito.voci.map((v) => v.gravita), [...esito.voci].sort((a, b) => ['danger', 'warning', 'info', 'success'].indexOf(a.gravita) - ['danger', 'warning', 'info', 'success'].indexOf(b.gravita)).map((v) => v.gravita), 'l’elenco resta in ordine di gravità');
  assert.equal(esito.messaggio, 'Controllo rifatto: ora OK.');
  // stesso esito: il bozzetto lo dice così
  const uguale = ricontrollaSoloQuesta(prima, { ...SCENE.piano, git: false, naviga: true }, 'git');
  assert.equal(uguale.stessoEsito, true);
  assert.equal(uguale.messaggio, 'Controllo rifatto: stesso esito.');
  assert.equal(voce(uguale.voci, 'browser').gravita, 'warning', 'anche qui il browser non si tocca');
  // le voci rifatte valgono finché non si rifà tutto: `vociDelDoctor` le rilegge dal LORO risultato, sopra quello intero
  const sopra = vociDelDoctor({ ...SCENE.piano, git: false, naviga: false }, { git: dopo });
  assert.equal(voce(sopra, 'git').gravita, 'success');
  assert.equal(voce(sopra, 'browser').gravita, 'warning');
  impostaLingua('en');
  // cambiando lingua la riga rifatta si riscrive come le altre (si tiene il risultato, non la frase già scritta in italiano)
  assert.equal(voce(vociDelDoctor({ ...SCENE.piano, git: false, naviga: false }, { git: dopo }), 'git').riga, voce(controlliDoctor(dopo), 'git').riga);
  assert.doesNotMatch(voce(vociDelDoctor({ ...SCENE.piano, git: false, naviga: false }, { git: dopo }), 'git').riga, /[àèìòù]|Git è|disponibile/u);
  const primaEn = vociDelDoctor({ ...SCENE.piano, git: false, naviga: false });
  assert.equal(ricontrollaSoloQuesta(primaEn, { ...SCENE.piano, git: false }, 'git').messaggio, 'Check run again: same result.');
  assert.equal(ricontrollaSoloQuesta(primaEn, { ...SCENE.piano, git: true }, 'git').messaggio, 'Check run again: now OK.');
});

test('DOCTOR-023-16 — «stesso esito» solo se esito E testo della riga sono uguali (K9); una riga rifatta che peggiora sale in testa e il verdetto la nomina (K10)', () => {
  const conRicerca = { ...SCENE.piano, ricercaWeb: { fonte: 'tavily', pronta: true } };
  const prima = vociDelDoctor(conRicerca);
  const esito = ricontrollaSoloQuesta(prima, { ...conRicerca, ricercaWeb: { fonte: 'brave', pronta: true } }, 'ricerca');
  assert.equal(voce(esito.voci, 'ricerca').gravita, voce(prima, 'ricerca').gravita, 'la prova misura: stessa gravità');
  assert.notEqual(voce(esito.voci, 'ricerca').riga, voce(prima, 'ricerca').riga, 'la prova misura: la riga dice un’altra cosa');
  assert.equal(esito.stessoEsito, false, 'stessa gravità ma testo diverso non è «stesso esito»');
  assert.match(esito.messaggio, /^Controllo rifatto: ora /u);
  // K10: la riga rifatta che diventa un guasto sale al primo posto, sopra le righe intere, e il verdetto porta proprio lì
  const peggio = vociDelDoctor(SCENE.piano, { shell: { ...SCENE.piano, shell: 'none' } });
  assert.equal(peggio[0].id, 'shell');
  assert.equal(verdettoDoctor(peggio).gravita, 'danger');
  assert.equal(verdettoDoctor(peggio).azione?.id, 'shell');
});

test('DOCTOR-023-17 — «Esporta» dopo una riga rifatta: il controllo intero resta, la riga rifatta c’è col risultato nuovo, e le righe sono quelle della pagina', () => {
  const intero = { ...SCENE.piano, git: true }, nuovo = { ...SCENE.piano, git: false };
  const file = esportazioneDoctor({ ricevutoAlle: '2026-11-11T09:00:00.000Z', risultato: intero, vociRifatte: { git: nuovo }, rifatteAlle: { git: '2026-11-11T09:05:00.000Z' } });
  assert.equal(file.risultato.git, true, 'il controllo intero resta com’era');
  assert.deepEqual(file.righeRifatte, { git: { ricevutoAlle: '2026-11-11T09:05:00.000Z', risultato: { git: false } } }, '023 cura piccola: solo i dati della sua riga');
  assert.equal(file.voci.find((v) => v.id === 'git').esito, 'warning', 'la riga dice ciò che dice la pagina');
  assert.deepEqual(file.voci.map((v) => v.id), vociDelDoctor(intero, { git: nuovo }).map((v) => v.id), 'nell’ordine della pagina');
  // senza righe rifatte il file è il controllo intero e le sue righe
  const solo = esportazioneDoctor({ ricevutoAlle: 'x', risultato: intero });
  assert.deepEqual(solo.righeRifatte, {});
  assert.equal(solo.voci.find((v) => v.id === 'git').esito, 'success');
});

/* ⛔ 023 cura piccola (giudice v1477, correzione 1; reperto 6 del controllore): dentro la frase la parola dell'esito è minuscola, come nei
   filtri («1 guasto»); una sigla («OK») resta com'è. */
test('DOCTOR-023-18 — «Controllo rifatto: ora guasto.» col minuscolo, in italiano e in inglese; «OK» resta OK', () => {
  const prima = vociDelDoctor(SCENE.piano);
  assert.equal(ricontrollaSoloQuesta(prima, { ...SCENE.piano, shell: 'none' }, 'shell').messaggio, 'Controllo rifatto: ora guasto.');
  assert.equal(ricontrollaSoloQuesta(prima, { ...SCENE.piano, git: false }, 'git').messaggio, 'Controllo rifatto: ora avviso.');
  assert.equal(ricontrollaSoloQuesta(vociDelDoctor({ ...SCENE.piano, git: false }), { ...SCENE.piano, git: true }, 'git').messaggio, 'Controllo rifatto: ora OK.');
  impostaLingua('en');
  const primaEn = vociDelDoctor(SCENE.piano);
  assert.equal(ricontrollaSoloQuesta(primaEn, { ...SCENE.piano, shell: 'none' }, 'shell').messaggio, 'Check run again: now failure.');
  assert.equal(ricontrollaSoloQuesta(primaEn, { ...SCENE.piano, git: false }, 'git').messaggio, 'Check run again: now warning.');
});

/* ⛔ 023 cura piccola, punto 4 (giudice 14:33): una riga rifatta porta nel file SOLO i dati che fanno la sua riga, una volta. */
test('DOCTOR-023-19 — «Esporta»: la riga rifatta porta solo i suoi dati, e il file non cresce di un controllo intero per riga', () => {
  const intero = { ...SCENE.tuttoRotto, git: true, naviga: true }, nuovo = { ...SCENE.tuttoRotto, git: false, naviga: false, shell: 'wsl2' };
  const vuoto = JSON.stringify(esportazioneDoctor({ ricevutoAlle: 'a', risultato: intero }), null, 2).length;
  const file = esportazioneDoctor({ ricevutoAlle: 'a', risultato: intero, vociRifatte: { git: nuovo, shell: nuovo, fornitori: nuovo }, rifatteAlle: { git: 'b', shell: 'c', fornitori: 'd' } });
  assert.deepEqual(file.righeRifatte.git, { ricevutoAlle: 'b', risultato: { git: false } });
  assert.deepEqual(file.righeRifatte.shell, { ricevutoAlle: 'c', risultato: { shell: 'wsl2' } });
  assert.deepEqual(Object.keys(file.righeRifatte.fornitori.risultato).sort(), ['chiaveApi', 'providers'], 'i fornitori: chiave, elenco e (se c’è) il piano');
  assert.equal(file.voci.find((v) => v.id === 'browser').esito, 'info', 'una riga non rifatta resta quella del controllo intero');
  const conTre = JSON.stringify(file, null, 2).length;
  assert.ok(conTre - vuoto < JSON.stringify(intero, null, 2).length, `tre righe rifatte (${conTre - vuoto} caratteri in più) pesano meno di UN controllo intero (${JSON.stringify(intero, null, 2).length})`);
  for (const id of ['fornitori', 'runtime', 'catalogo', 'shell', 'browser', 'ricerca', 'git', 'cartelle', 'sessioni', 'labs']) {
    const solo = esportazioneDoctor({ ricevutoAlle: 'a', risultato: intero, vociRifatte: { [id]: nuovo }, rifatteAlle: { [id]: 'b' } });
    const rifatta = controlliDoctor({ ...intero, ...solo.righeRifatte[id].risultato }).find((v) => v.id === id);
    assert.deepEqual([rifatta.gravita, rifatta.riga], [controlliDoctor(nuovo).find((v) => v.id === id).gravita, controlliDoctor(nuovo).find((v) => v.id === id).riga], `${id}: i dati tenuti bastano a rifare la riga`);
  }
});

test('DOCTOR-023-21 — «Esporta»: i fornitori rifatti col piano ChatGPT collegato portano anche il piano, e il file rifà la riga che la pagina mostra', () => {
  const intero = SCENE.tuttoRotto, nuovo = SCENE.piano;
  const file = esportazioneDoctor({ ricevutoAlle: 'a', risultato: intero, vociRifatte: { fornitori: nuovo }, rifatteAlle: { fornitori: 'b' } });
  assert.ok(file.righeRifatte.fornitori.risultato.accessoPiano, 'il piano è un dato della riga dei fornitori');
  const dalFile = voce(vociDelDoctor({ ...intero, ...file.righeRifatte.fornitori.risultato }), 'fornitori');
  assert.equal(JSON.stringify(dalFile), JSON.stringify(voce(vociDelDoctor(nuovo), 'fornitori')), 'dal file si rifà la stessa riga dei fornitori della pagina');
  assert.notEqual(JSON.stringify(voce(vociDelDoctor(intero), 'fornitori')), JSON.stringify(dalFile), 'la prova misura: il piano cambia la riga');
});

/* ⛔ 023 cura piccola, punto 5 (owner 11/11/2026 13:50, decisione 9; giudice v1477, correzione 3): la riga «Motore locale». */
test('DOCTOR-023-20 — «Motore locale»: non provato, risposta col tempo, nessun modello caricato (non ne carica uno), nessun modello, errore', () => {
  const r = SCENE.piano;
  assert.equal(voce(vociDelDoctor(r), 'motore'), undefined, 'senza la prova chi disegna da solo ha le righe di prima');
  const non = voce(vociDelDoctor(r, {}, { esito: 'nonProvato' }), 'motore');
  assert.deepEqual([non.titolo, non.gravita, non.azioni.map((a) => [a.tipo, a.testo])], ['Motore locale', 'info', [['prova', 'Prova il motore locale']]]);
  assert.match(non.riga, /^Non ancora provato/u);
  assert.match(non.limite, /non ne carica, non ne sveglia e non ne scarica uno/u);
  const ok = voce(vociDelDoctor(r, {}, { esito: 'risponde', modelId: 'q', nome: 'Qwen3 4B', ms: 812 }), 'motore');
  assert.deepEqual([ok.gravita, ok.riga], ['success', 'Il modello caricato ha risposto in 0,8 s.']);
  assert.ok(ok.dettaglio.some((d) => d.includes('Qwen3 4B')));
  const vuoto = voce(vociDelDoctor(r, {}, { esito: 'nessunCaricato' }), 'motore');
  assert.equal(vuoto.gravita, 'info');
  assert.match(vuoto.riga, /^Nessun modello caricato.*non ne carica uno/u);
  assert.deepEqual(vuoto.azioni.map((a) => a.tipo), ['prova', 'apri']);
  assert.match(voce(vociDelDoctor(r, {}, { esito: 'nessunModello' }), 'motore').riga, /^Nessun modello locale installato.*non ne scarica uno/u);
  const ko = voce(vociDelDoctor(r, {}, { esito: 'errore', nome: 'Qwen3 4B', ms: 30000, codice: 'TIMEOUT' }), 'motore');
  assert.deepEqual([ko.gravita, ko.riga], ['warning', 'Il modello caricato non ha risposto in 30 s.']);
  assert.ok(ko.azioni.length > 0 && ko.azioni.every((a) => TIPI_AZIONE_DOCTOR.includes(a.tipo)));
  assert.equal(voce(vociDelDoctor(r, {}, { esito: 'inCorso' }), 'motore').azioni.length, 0, 'mentre gira la prova non si riparte');
  assert.equal(verdettoDoctor(vociDelDoctor(r, {}, { esito: 'errore', ms: 3, codice: 'X' })).gravita, 'warning', 'un motore che non risponde è una cosa da rivedere');
  const file = esportazioneDoctor({ ricevutoAlle: 'a', risultato: r, motoreLocale: { esito: 'risponde', nome: 'Qwen3 4B', ms: 812, ricevutoAlle: 'b' } });
  assert.deepEqual(file.motoreLocale, { esito: 'risponde', nome: 'Qwen3 4B', ms: 812, ricevutoAlle: 'b' }, 'il file dice anche la prova del motore');
  assert.equal(file.voci.find((v) => v.id === 'motore').esito, 'success');
  impostaLingua('en');
  assert.equal(voce(vociDelDoctor(r, {}, { esito: 'risponde', nome: 'Qwen3 4B', ms: 812 }), 'motore').riga, 'The loaded model answered in 0.8 s.');
  assert.match(voce(vociDelDoctor(r, {}, { esito: 'nessunCaricato' }), 'motore').riga, /^No model loaded.*does not load one/u);
  assert.equal(voce(vociDelDoctor(r, {}, { esito: 'nonProvato' }), 'motore').azioni[0].testo, 'Test the local engine');
});

/* Giro dopo il revisore (giudice v1503, punti 1 e 3): il modello che dorme, lo stato che il motore non dice, l'errore immediato, l'errore del
   server nella lingua dell'interfaccia, e niente pulsanti che non portano a niente quando non c'è nessun modello. */
test('DOCTOR-023-22 — «Motore locale»: modello che dorme, stato ignoto, errore subito, errore del server, nessun modello con un passo vero', () => {
  impostaLingua('it');
  const r = SCENE.piano;
  const dorme = voce(vociDelDoctor(r, {}, { esito: 'dorme', modelId: 'q', nome: 'Qwen3 4B' }), 'motore');
  assert.equal(dorme.gravita, 'info');
  assert.equal(dorme.riga, 'Il modello caricato dorme dopo una pausa: la prova lo sveglierebbe, quindi il Doctor non manda niente.');
  assert.ok(dorme.dettaglio.some((d) => d.includes('Qwen3 4B')) && dorme.dettaglio.some((d) => /^Si sveglia col prossimo messaggio/u.test(d)));
  /* foto del giro: «Modello provato» quando niente è stato provato era falso */
  assert.equal(dorme.dettaglio[0], 'Modello caricato: Qwen3 4B.');
  assert.deepEqual(dorme.azioni.map((a) => a.tipo), ['prova']);
  const ignoto = voce(vociDelDoctor(r, {}, { esito: 'statoIgnoto', modelId: 'q', nome: 'Qwen3 4B' }), 'motore');
  assert.deepEqual([ignoto.gravita, ignoto.riga], ['warning', 'Il motore locale non ha detto se il modello è sveglio, quindi il Doctor non manda niente.']);
  assert.deepEqual(ignoto.dettaglio, ['Modello caricato: Qwen3 4B.']);
  assert.deepEqual(ignoto.azioni.map((a) => a.tipo), ['prova']);
  const subito = voce(vociDelDoctor(r, {}, { esito: 'errore', nome: 'Qwen3 4B', ms: 120, codice: 'RUNTIME_HTTP_ERROR' }), 'motore');
  assert.equal(subito.riga, 'Il modello caricato ha risposto con un errore dopo 0,1 s.', 'un errore subito non è «non ha risposto in 0,1 s»');
  const server = voce(vociDelDoctor(r, {}, { esito: 'nonRiuscita', motivo: 'Internal error' }), 'motore');
  assert.equal(server.riga, 'La prova non è partita per un errore dentro TALOS. Riprova.');
  assert.ok(!server.riga.includes('Internal error'), 'niente inglese del server nell’interfaccia italiana');
  const nessuno = voce(vociDelDoctor(r, {}, { esito: 'nessunModello' }), 'motore');
  assert.deepEqual(nessuno.azioni.map((a) => [a.tipo, a.dove, a.testo]), [['apri', 'scarica', 'Trova un modello da scaricare']], 'niente da riprovare né da aprire: un passo vero');
  impostaLingua('en');
  assert.equal(voce(vociDelDoctor(r, {}, { esito: 'dorme', nome: 'Qwen3 4B' }), 'motore').riga, 'The loaded model is asleep after a pause: a test would wake it up, so the Doctor sends nothing.');
  assert.equal(voce(vociDelDoctor(r, {}, { esito: 'errore', ms: 120, codice: 'RUNTIME_HTTP_ERROR' }), 'motore').riga, 'The loaded model answered with an error after 0.1 s.');
  assert.equal(voce(vociDelDoctor(r, {}, { esito: 'nonRiuscita', motivo: 'Internal error' }), 'motore').riga, 'The test did not start because of an error inside TALOS. Try again.');
  assert.equal(voce(vociDelDoctor(r, {}, { esito: 'nessunModello' }), 'motore').azioni[0].testo, 'Find a model to download');
  assert.match(voce(vociDelDoctor(r, {}, { esito: 'nonProvato' }), 'motore').limite, /never loads, wakes or downloads one/u);
  impostaLingua('it');
});
