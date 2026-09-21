/*
 * Traduzione fedele di AVM/mobile/tests/unit/research/researchVerification.test.ts.
 * Stessi casi, stesse asserzioni, stesse fixture scomode di proposito.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  talosResearchJudgeOrder,
  talosResearchJudgePrompt,
  talosResearchLocate,
  talosResearchParseVerdict,
  talosResearchPickJudge,
  talosResearchVerify,
  talosResearchVerifiedStanding,
} from '../../src/research/verification.mjs';

/** @type {import('../../src/research/collector.mjs').TalosResearchSource} */
const PAGE = {
  url: 'https://rainews.it/x',
  title: 'Il resoconto',
  publishedAt: '2026-07-26',
  // Scomodo di proposito: spazi doppi e virgolette curve PRIMA del passaggio,
  // così un offset calcolato sulla stringa normalizzata cadrebbe nel posto
  // sbagliato.
  text: 'Cronaca  della  gara. Il direttore ha detto “niente penalità”.  '
    + 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026 davanti a Verstappen.',
  obtained: 'page',
};

/** @type {import('../../src/research/collector.mjs').TalosResearchSource} */
const SNIPPET = {
  url: 'https://oasport.it/y',
  title: 'Ordine d’arrivo',
  publishedAt: null,
  text: 'Antonelli è arrivato terzo.',
  obtained: 'snippet',
};

/** @type {import('../../src/research/verification.mjs').TalosResearchJudgeIdentity} */
const AUTHOR = { id: 'deepseek:deepseek-chat', provider: 'deepseek', model: 'deepseek-chat' };
/** @type {import('../../src/research/verification.mjs').TalosResearchJudgeIdentity} */
const LOCAL = { id: 'local:qwen3-3b', provider: 'local', model: 'qwen3-3b' };

/**
 * @param {Partial<import('../../src/research/synthesis.mjs').TalosResearchClaim>} [over]
 * @returns {import('../../src/research/synthesis.mjs').TalosResearchClaim}
 */
function claim(over = {}) {
  return {
    text: 'Norris ha vinto il Gran Premio d’Ungheria 2026.',
    sourceIndex: 1,
    quote: 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026',
    quotePresent: 'yes',
    ...over,
  };
}

test('L2 — dove sta esattamente il passaggio nel testo che abbiamo tenuto', async (t) => {
  await t.test('dà offset nel testo ORIGINALE, non in una copia ripulita', () => {
    const span = talosResearchLocate(PAGE.text, 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026');

    // L'esito che conta: tagliare il testo tenuto a quegli offset restituisce
    // il passaggio. È quello che il rapporto evidenzia quando il lettore tocca
    // una citazione, quindi un offset solo «vicino» gli mostra una frase che
    // non è quella citata.
    assert.notEqual(span, null);
    assert.equal(PAGE.text.slice(span.from, span.to), 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026');
  });

  await t.test('trova lo stesso un passaggio ribattuto con spazi e virgolette diverse', () => {
    const span = talosResearchLocate(PAGE.text, 'il direttore   ha detto "niente penalità"');

    assert.notEqual(span, null);
    assert.equal(PAGE.text.slice(span.from, span.to), 'Il direttore ha detto “niente penalità”');
  });

  await t.test('rifiuta quello che non c\'è invece di trovare la cosa più vicina', () => {
    assert.equal(talosResearchLocate(PAGE.text, 'Verstappen ha vinto'), null);
  });
});

test('chi ha il permesso di giudicare', async (t) => {
  /*
   * IL rifiuto, e quello con un numero dietro: un modello che giudica la propria
   * uscita ha fino al 50% di probabilità in più di marcare come soddisfatto un
   * criterio che in realtà ha fallito (arXiv 2604.06996). Quindi non è una
   * preferenza per la varietà — un'affermazione auto-giudicata vale meno di una
   * non giudicata, perché porta un timbro che non si è guadagnata.
   */
  await t.test('non lascia MAI che l\'autore giudichi sé stesso, nemmeno quando è l\'unico', () => {
    assert.equal(talosResearchPickJudge(AUTHOR, [AUTHOR]), null);
  });

  await t.test('prende il primo candidato che non sia l\'autore', () => {
    assert.equal(talosResearchPickJudge(AUTHOR, [AUTHOR, LOCAL])?.id, LOCAL.id);
  });

  await t.test('riconosce l\'autore dal modello, non dall\'etichetta che si porta dietro', () => {
    /** @type {import('../../src/research/verification.mjs').TalosResearchJudgeIdentity} */
    const renamed = { id: 'altro-nome', provider: 'deepseek', model: 'deepseek-chat' };

    assert.equal(talosResearchPickJudge(AUTHOR, [renamed]), null);
  });
});

test('L3 — il passaggio sostiene davvero l\'affermazione', async (t) => {
  await t.test('giudica sul testo della pagina, non su quello che il modello ha battuto', async () => {
    /** @type {{claim:string, quote:string}[]} */
    const seen = [];
    const verified = await talosResearchVerify({
      judge: LOCAL,
      at: () => '2026-08-02T10:00:00.000Z',
      ask: async (text, quote) => {
        seen.push({ claim: text, quote });
        return 'SI — il passaggio lo dice apertamente.';
      },
      // Il modello ha ribattuto il passaggio con virgolette dritte e spazi laschi.
    }, [claim({ quote: 'Lando  Norris ha vinto il Gran Premio d\'Ungheria 2026' })], [PAGE]);

    // Quello che va al giudice è il pezzo ritagliato dalla fonte, quindi un
    // modello non può far passare una citazione ritoccata davanti all'unico
    // controllo che la legge.
    assert.equal(seen[0].quote, 'Lando Norris ha vinto il Gran Premio d’Ungheria 2026');
    assert.equal(verified[0].checks.claimSupported, 'yes');
    assert.equal(verified[0].checks.judge, 'local:qwen3-3b');
  });

  await t.test('non paga un modello per giudicare un passaggio che non è nella fonte', async () => {
    const verified = await talosResearchVerify({
      judge: LOCAL,
      at: () => '2026-08-02T10:00:00.000Z',
      // Si comporta come farebbe quello vero se fosse raggiunto per sbaglio:
      // costa qualcosa. Qui quel costo è un test rosso.
      ask: async () => { throw new Error('il giudice non doveva essere chiamato'); },
    }, [claim({ quote: 'una frase mai apparsa su quella pagina' })], [PAGE]);

    assert.equal(verified[0].checks.quotePresent, false);
    assert.equal(verified[0].checks.claimSupported, 'unchecked');
    assert.equal(verified[0].checks.judge, null);
    // Il motivo è ciò che prova che il giudice non è mai stato raggiunto. Senza
    // questa riga il test passa in entrambi i casi: un giudice chiamato che
    // lancia finisce anch'esso `unchecked` senza giudice registrato, quindi le
    // tre asserzioni sopra non distinguono «saltato» da «provato e fallito».
    assert.equal(verified[0].checks.supportReason, 'il passaggio non è nel testo della fonte');
  });

  await t.test('marca unchecked, col motivo, quando non esiste un giudice indipendente', async () => {
    const verified = await talosResearchVerify({
      judge: null,
      at: () => '2026-08-02T10:00:00.000Z',
      ask: async () => { throw new Error('non c’è nessun giudice da chiamare'); },
    }, [claim()], [PAGE]);

    assert.equal(verified[0].checks.claimSupported, 'unchecked');
    assert.match(verified[0].checks.supportReason, /giudice/i);
  });

  await t.test('impedisce a un giudice che cade di portarsi giù il resto del rapporto', async () => {
    const verified = await talosResearchVerify({
      judge: LOCAL,
      at: () => '2026-08-02T10:00:00.000Z',
      ask: async (text) => {
        if (text.startsWith('Norris')) throw new Error('rete caduta');
        return 'NO — il passaggio parla d’altro.';
      },
    }, [claim(), claim({ text: 'Antonelli è arrivato terzo.', sourceIndex: 2, quote: 'Antonelli è arrivato terzo' })], [PAGE, SNIPPET]);

    assert.equal(verified[0].checks.claimSupported, 'unchecked');
    assert.equal(verified[1].checks.claimSupported, 'no');
  });
});

test('L1 — come la fonte è stata ottenuta', async (t) => {
  await t.test('separa una pagina letta da un estratto che non lo è mai stato', async () => {
    const verified = await talosResearchVerify({
      judge: LOCAL,
      at: () => '2026-08-02T10:00:00.000Z',
      ask: async () => 'PARZIALE — dice il fatto ma non la data.',
    }, [claim(), claim({ text: 'Antonelli terzo.', sourceIndex: 2, quote: 'Antonelli è arrivato terzo' })], [PAGE, SNIPPET]);

    assert.equal(verified[0].checks.resolved, 'page');
    // Mai aperta: la prova è quello che il motore di ricerca ha scelto di
    // mostrare, che è più debole, e dirlo è tutto il punto.
    assert.equal(verified[1].checks.resolved, 'snippet');
    assert.equal(verified[1].checks.claimSupported, 'partial');
  });

  await t.test('chiama col suo nome una citazione a una fonte che nessuno ha consegnato', async () => {
    const verified = await talosResearchVerify({
      judge: LOCAL,
      at: () => '2026-08-02T10:00:00.000Z',
      ask: async () => 'SI',
    }, [claim({ sourceIndex: 9 })], [PAGE]);

    assert.equal(verified[0].checks.resolved, 'missing');
    assert.equal(verified[0].checks.claimSupported, 'unchecked');
  });
});

test('leggere la risposta del giudice', async (t) => {
  await t.test('capisce i tre verdetti e tiene il motivo', () => {
    assert.deepEqual(talosResearchParseVerdict('SI — lo dice testualmente.'), {
      support: 'yes',
      reason: 'lo dice testualmente.',
    });
    assert.equal(talosResearchParseVerdict('PARZIALE: dice il fatto, non la portata.').support, 'partial');
    assert.equal(talosResearchParseVerdict('NO, il passaggio riguarda un’altra gara.').support, 'no');
    assert.equal(talosResearchParseVerdict('Sì').support, 'yes');
  });

  await t.test('non legge un verdetto in una risposta che non ne ha', () => {
    // Una risposta illeggibile non è una promozione. L'affermazione
    // semplicemente non è stata giudicata.
    assert.equal(talosResearchParseVerdict('Non posso rispondere a questa domanda.').support, 'unchecked');
    assert.equal(talosResearchParseVerdict('').support, 'unchecked');
  });

  await t.test('non si fa ingannare da una parola di verdetto sepolta in una frase', () => {
    assert.equal(talosResearchParseVerdict('Nonostante tutto il passaggio regge').support, 'unchecked');
  });
});

test('la domanda che il giudice vede', async (t) => {
  await t.test('porta l\'affermazione e il passaggio, e gli chiede di non guardare altrove', () => {
    const prompt = talosResearchJudgePrompt('Norris ha vinto.', 'Lando Norris ha vinto');

    assert.ok(prompt.includes('Norris ha vinto.'));
    assert.ok(prompt.includes('Lando Norris ha vinto'));
    // Senza questa il modello risponde da quello che già sa, e una frase vera
    // si prende una promozione da un passaggio che non l'ha mai detta.
    assert.ok(prompt.toLowerCase().includes('solo'));
  });
});

test('quello che al lettore si dice in cima', async (t) => {
  await t.test('conta le non verificate e le parziali a parte dalle sostenute', async () => {
    const verified = await talosResearchVerify({
      judge: LOCAL,
      at: () => '2026-08-02T10:00:00.000Z',
      ask: async (text) => (text.startsWith('Norris') ? 'SI' : 'PARZIALE — solo in parte.'),
    }, [
      claim(),
      claim({ text: 'Antonelli terzo.', sourceIndex: 2, quote: 'Antonelli è arrivato terzo' }),
      claim({ text: 'Inventata.', quote: 'mai scritto da nessuna parte' }),
    ], [PAGE, SNIPPET]);

    assert.deepEqual(talosResearchVerifiedStanding(verified), {
      total: 3,
      supported: 1,
      partial: 1,
      unsupported: 0,
      unchecked: 1,
      // ⛔ CONTESA-01, aggiunto il 2026-08-20: qui è zero perché nessuna
      // fonte contraria è stata raccolta in questa verifica. Il campo sta
      // nel conto anche quando è zero — un esito che compare solo quando
      // succede si legge come un errore la prima volta che appare.
      contested: 0,
    });
  });
});

/*
 * ⛔⛔ CONTESA-02 — il disaccordo entra nei DATI, non solo nella prosa.
 *
 * MISURATO sul Pad il 2026-08-20: il rapporto su GGUF scriveva «le fonti… non
 * specificano però formalmente un maintainer unico» e la barra sopra diceva
 * 7 su 7 sostenute, 0 contese. `talosResearchContestedVerdict` esisteva coi
 * suoi test, e non lo chiamava nessuno.
 */
test('la contesa, dal giudice fino al verdetto', async (t) => {
  /** @type {import('../../src/research/collector.mjs').TalosResearchSource} */
  const SMENTITA = {
    url: 'https://smentita.example/x',
    title: 'La rettifica',
    publishedAt: null,
    text: 'La giuria non ha mai assegnato il Gran Premio a Norris: la vittoria è stata di Verstappen.',
    obtained: 'page',
  };

  await t.test('una sostenuta che qualcun altro nega diventa CONTESA, col passaggio', async () => {
    /** @type {string[]} */
    const chieste = [];
    const verified = await talosResearchVerify({
      judge: LOCAL,
      at: () => '2026-08-02T10:00:00.000Z',
      ask: async () => 'SI — il passaggio lo dice apertamente.',
      askOpposing: async (_claim, passage) => {
        chieste.push(passage);
        return 'SI — la fonte dice esattamente il contrario.';
      },
    }, [claim()], [PAGE, SMENTITA]);

    assert.equal(verified[0].checks.claimSupported, 'contested');
    assert.equal(verified[0].checks.opposing.length, 1);
    assert.equal(verified[0].checks.opposing[0].url, 'https://smentita.example/x');
    // ⛔ Il passaggio mandato al giudice viene dalla fonte, non dal modello.
    assert.ok(SMENTITA.text.includes(chieste[0]));
  });

  await t.test('⛔ e AL CONTRARIO: se il giudice dice NO, il verdetto resta quello di prima', async () => {
    const verified = await talosResearchVerify({
      judge: LOCAL,
      at: () => '2026-08-02T10:00:00.000Z',
      ask: async () => 'SI — il passaggio lo dice apertamente.',
      askOpposing: async () => 'NO — parla di un altro anno.',
    }, [claim()], [PAGE, SMENTITA]);

    assert.equal(verified[0].checks.claimSupported, 'yes');
    // ⛔ E `opposing` non c'è: «guardato e niente» non deve scriversi come
    //   un elenco vuoto, che si legge uguale a «guardato».
    assert.equal(verified[0].checks.opposing, undefined);
  });

  await t.test('⛔ e senza la seconda domanda NIENTE cambia: la porta chiusa non altera i dati', async () => {
    const verified = await talosResearchVerify({
      judge: LOCAL,
      at: () => '2026-08-02T10:00:00.000Z',
      ask: async () => 'SI — il passaggio lo dice apertamente.',
    }, [claim()], [PAGE, SMENTITA]);

    assert.equal(verified[0].checks.claimSupported, 'yes');
    assert.equal(verified[0].checks.opposing, undefined);
  });

  await t.test('⛔ e una SMENTITA non si contesta: sarebbe la stessa cosa detta due volte', async () => {
    let chiesto = false;
    const verified = await talosResearchVerify({
      judge: LOCAL,
      at: () => '2026-08-02T10:00:00.000Z',
      ask: async () => 'NO — il passaggio non lo sostiene.',
      askOpposing: async () => { chiesto = true; return 'SI'; },
    }, [claim()], [PAGE, SMENTITA]);

    assert.equal(verified[0].checks.claimSupported, 'no');
    // E non si paga per chiederlo: su un «no» la contesa non esiste.
    assert.equal(chiesto, false);
  });

  await t.test('⛔ e un giudice che cade sulla seconda domanda non porta via il rapporto', async () => {
    const verified = await talosResearchVerify({
      judge: LOCAL,
      at: () => '2026-08-02T10:00:00.000Z',
      ask: async () => 'SI — il passaggio lo dice apertamente.',
      askOpposing: async () => { throw new Error('il giudice non ha risposto'); },
    }, [claim()], [PAGE, SMENTITA]);

    assert.equal(verified[0].checks.claimSupported, 'yes');
    assert.equal(verified[0].checks.judge, 'local:qwen3-3b');
  });
});

/*
 * ⛔⛔ MENU-RICOPIATO-01 — «Sì | PARZIALE | motivo» non è una scelta.
 *
 * MISURATO sul Pad il 2026-08-20. A schermo si leggeva «contesa» sopra e
 * «| PARZIALE |» sotto: due parole diverse per lo stesso stato, il formato
 * grezzo del protocollo dato in pasto a una persona, e il verdetto era il più
 * generoso dei due che il modello aveva scritto.
 */
test('quando il giudice ricopia il menu invece di scegliere', async (t) => {
  await t.test('⛔ due voci del formato in una riga = nessun verdetto', () => {
    const letto = talosResearchParseVerdict('Sì | PARZIALE | Il passaggio indica che è il creatore.');
    assert.equal(letto.support, 'unchecked');
    // ⛔ E nessun motivo: un motivo salvato da una riga illeggibile
    //   sarebbe la metà comprensibile di una risposta che non lo era.
    assert.equal(letto.reason, '');
  });

  await t.test('e il menu intero ricopiato nemmeno', () => {
    assert.equal(talosResearchParseVerdict('SI | PARZIALE | NO — motivo, massimo quindici parole').support, 'unchecked');
  });

  await t.test('⛔ e AL CONTRARIO: una barra sola è punteggiatura, non un secondo verdetto', () => {
    const letto = talosResearchParseVerdict('SI | il passaggio lo dice apertamente');
    assert.equal(letto.support, 'yes');
    // La barra non entra nel motivo: è un separatore, come il trattino.
    assert.equal(letto.reason, 'il passaggio lo dice apertamente');
  });

  await t.test('e un verdetto con le barre davanti resta leggibile', () => {
    const letto = talosResearchParseVerdict('| PARZIALE | riguarda l’argomento ma non la misura');
    assert.equal(letto.support, 'partial');
    assert.equal(letto.reason, 'riguarda l’argomento ma non la misura');
  });

  await t.test('la riga normale non cambia di una virgola', () => {
    const letto = talosResearchParseVerdict('NO — la fonte non ne parla');
    assert.equal(letto.support, 'no');
    assert.equal(letto.reason, 'la fonte non ne parla');
  });
});

/*
 * ⛔⛔ MENU-NEL-PROMPT-01 — il formato con le barre lo faceva RICOPIARE.
 *
 * MISURATO sul Pad il 2026-08-20 con gemma-3-4b come giudice: le risposte
 * arrivavano come «Sì | PARZIALE | Il passaggio indica che…». Il parser
 * prendeva la prima parola, e quei rapporti uscivano al 100%: erano verdetti
 * che il giudice non aveva mai dato. La cura sta a monte — nella domanda.
 */
test('la domanda al giudice non contiene un menu da ricopiare', async (t) => {
  await t.test('⛔ le tre parole NON sono su una riga separate da barre', () => {
    const prompt = talosResearchJudgePrompt('afferma X', 'passaggio Y');
    assert.ok(!prompt.includes('SI | PARZIALE | NO'));
  });

  await t.test('le tre restano offerte, una per riga, con un esempio', () => {
    const prompt = talosResearchJudgePrompt('afferma X', 'passaggio Y');
    for (const parola of ['SI', 'PARZIALE', 'NO']) {
      assert.ok(prompt.split(String.fromCharCode(10)).includes(parola));
    }
    // ⛔ L'esempio è la parte che sostituisce il menu: senza, «comincia con
    //   una di queste tre parole» resta un'istruzione senza forma.
    assert.ok(prompt.includes('Esempio di risposta:'));
  });
});

/*
 * ⭐ MIO — `talosResearchJudgeOrder` è esportata e il mobile non la provava con
 * nessun test. La regola che porta è la stessa che rende credibile il rapporto:
 * il dispositivo per primo (gratis, di nessuna famiglia), la casa dell'autore
 * per ULTIMA. Un porto che invertisse l'ordine passerebbe ogni altro test qui
 * dentro, e il giudice più compiacente verrebbe interpellato per primo.
 */
test('⭐ MIO — l\'ordine delle case: il dispositivo primo, la casa dell\'autore ultima', () => {
  const ordine = talosResearchJudgeOrder('deepseek', ['deepseek', 'openai', 'local', 'google'], 'local');

  assert.equal(ordine[0], 'local');
  assert.equal(ordine[ordine.length - 1], 'deepseek');
  // Nessuno sparisce e nessuno si duplica: è un riordino, non un filtro.
  assert.deepEqual([...ordine].sort(), ['deepseek', 'google', 'local', 'openai']);
});

test('⭐ MIO — senza il motore sul dispositivo l\'autore resta comunque per ultimo', () => {
  const ordine = talosResearchJudgeOrder('deepseek', ['deepseek', 'openai'], 'local');

  assert.deepEqual(ordine, ['openai', 'deepseek']);
  // E se c'è solo l'autore, l'ordine non lo nasconde: chi sceglie è
  // `talosResearchPickJudge`, che qui tornerebbe null.
  assert.deepEqual(talosResearchJudgeOrder('deepseek', ['deepseek'], 'local'), ['deepseek']);
});
