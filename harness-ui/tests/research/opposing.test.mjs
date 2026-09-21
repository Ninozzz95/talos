/*
 * Traduzione fedele di AVM/mobile/tests/unit/research/researchOpposing.test.ts
 * (vitest → node:test). Tutti e diciassette i casi, stesse asserzioni; i
 * `describe` di vitest diventano `test(..., async (t) => t.test(...))` così i
 * gruppi restano leggibili nel resoconto.
 *
 * ⛔⛔ CONTESA-02 — cercare chi dice il CONTRARIO.
 *
 * Sul Pad, 2026-08-20: il rapporto su GGUF scriveva in chiaro «le fonti… non
 * specificano però formalmente un maintainer unico» — una divergenza — e la
 * barra sopra diceva **7 su 7 sostenute · 0 contese**. La regola della contesa
 * esisteva coi suoi test e **non la chiamava nessuno**: il disaccordo poteva
 * stare nella prosa e mai nei dati.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  talosResearchOpposingCandidate,
  talosResearchOpposingPrompt,
  talosResearchParseOpposingVerdict,
} from '../../src/research/opposing.mjs';

/**
 * @param {Partial<import('../../src/research/collector.mjs').TalosResearchSource>} over
 * @returns {import('../../src/research/collector.mjs').TalosResearchSource}
 */
function fonte(over) {
  return {
    url: 'https://a.example',
    title: 'A',
    publishedAt: null,
    text: '',
    obtained: 'page',
    ...over,
  };
}

test('trovare la frase che parla della stessa cosa', async (t) => {
  const FONTI = [
    fonte({ url: 'https://uno.example', title: 'Uno', text: 'GGUF was developed by Georgi Gerganov and the llama.cpp community.' }),
    fonte({
      url: 'https://due.example',
      title: 'Due',
      text: 'Le ricette di cucina siciliana sono antiche. The specification does not name a single maintainer for the GGUF format. Altro testo qui.',
    }),
  ];

  await t.test('prende la frase con più parole in comune, da un\'ALTRA fonte', () => {
    const trovata = talosResearchOpposingCandidate(
      'GGUF has a single formally declared maintainer.', 0, FONTI);

    assert.equal(trovata?.sourceIndex, 1);
    assert.equal(trovata?.url, 'https://due.example');
    assert.equal(trovata?.passage, 'The specification does not name a single maintainer for the GGUF format.');
  });

  await t.test('e lo span punta davvero a quelle parole nel testo della fonte', () => {
    const trovata = talosResearchOpposingCandidate(
      'GGUF has a single formally declared maintainer.', 0, FONTI);
    const testo = FONTI[1].text;
    assert.equal(testo.slice(trovata.span.from, trovata.span.to), trovata.passage);
  });

  await t.test('⛔ e AL CONTRARIO: la fonte GIÀ CITATA è esclusa', () => {
    // Riproporre al giudice la pagina che ha appena letto significherebbe
    // farsi contraddire da chi ha appena detto di sì, e chiamare «contesa»
    // un disaccordo con sé stesso.
    const trovata = talosResearchOpposingCandidate(
      'The specification does not name a single maintainer.', 1, FONTI);
    assert.notEqual(trovata?.sourceIndex, 1);
  });

  await t.test('⛔ e una frase che non c\'entra NON viene proposta', () => {
    // Chiedere al giudice di confrontare l'affermazione con un paragrafo
    // fuori tema produce un «no» che sembra una verifica e non lo è — e
    // costa comunque una chiamata.
    const soloRicette = [FONTI[0], fonte({ url: 'https://tre.example', text: 'Le ricette di cucina siciliana sono antiche e buone.' })];
    assert.equal(talosResearchOpposingCandidate('GGUF has a single formally declared maintainer.', 0, soloRicette), null);
  });

  await t.test('⛔ e con UNA fonte sola non c\'è nessun altro che possa contraddire', () => {
    assert.equal(talosResearchOpposingCandidate('qualsiasi affermazione lunga abbastanza', 0, [FONTI[0]]), null);
    assert.equal(talosResearchOpposingCandidate('qualsiasi affermazione lunga abbastanza', 0, []), null);
  });

  await t.test('un muro di testo senza punti non diventa UNA frase lunga una pagina', () => {
    // Mandarla al giudice sarebbe mandargli la pagina intera, e la domanda
    // diventerebbe «questa fonte dice il contrario», che non è verificabile.
    const muro = fonte({ url: 'https://muro.example', text: ('maintainer single specification format ').repeat(80) });
    const trovata = talosResearchOpposingCandidate('single maintainer specification format', 9, [muro]);
    assert.notEqual(trovata, null);
    assert.ok(trovata.passage.length <= 400);
  });

  await t.test('un\'affermazione fatta di parole cortissime non fa scegliere a caso', () => {
    assert.equal(talosResearchOpposingCandidate('a b c di e', 9, FONTI), null);
  });
});

test('la domanda al giudice', async (t) => {
  await t.test('chiede di CONTRADDIRE, e dice che tacere non è contraddire', () => {
    const prompt = talosResearchOpposingPrompt('afferma X', 'passaggio Y');
    assert.ok(prompt.includes('CONTRADDICE'));
    // ⛔ Senza questa riga un passaggio che semplicemente non parla
    //   dell'affermazione verrebbe letto come una smentita, e le contese
    //   comparirebbero ovunque.
    assert.ok(prompt.includes('non parla'));
    assert.ok(prompt.includes('afferma X'));
    assert.ok(prompt.includes('passaggio Y'));
  });

  await t.test('⛔ e nemmeno qui c\'è un menu con le barre da ricopiare', () => {
    assert.ok(!talosResearchOpposingPrompt('x', 'y').includes('SI | NO'));
    assert.ok(talosResearchOpposingPrompt('x', 'y').includes('Esempio di risposta:'));
  });

  await t.test('non è la domanda del primo giro', () => {
    assert.ok(!talosResearchOpposingPrompt('x', 'y').includes('sostiene l’affermazione?'));
  });
});

test('leggere la risposta', async (t) => {
  await t.test('riconosce il sì', () => {
    assert.equal(talosResearchParseOpposingVerdict('SI — dice esattamente il contrario'), true);
    assert.equal(talosResearchParseOpposingVerdict('sì, lo nega'), true);
    assert.equal(talosResearchParseOpposingVerdict('  Yes - it contradicts  '), true);
  });

  await t.test('⛔ e AL CONTRARIO: nel dubbio è NO', () => {
    // Una contesa inventata è peggio di una contesa non trovata: toglie
    // forza a quelle vere.
    assert.equal(talosResearchParseOpposingVerdict('NO — non ne parla'), false);
    assert.equal(talosResearchParseOpposingVerdict(''), false);
    assert.equal(talosResearchParseOpposingVerdict('non saprei'), false);
    assert.equal(talosResearchParseOpposingVerdict('{"verdict": true}'), false);
  });

  await t.test('⛔ e un «no» dentro il MOTIVO non ribalta un sì, né viceversa', () => {
    assert.equal(talosResearchParseOpposingVerdict('SI — la fonte dice che non esiste un mantenitore'), true);
    assert.equal(talosResearchParseOpposingVerdict('NO — non c’è dubbio, si tratta del contrario'), false);
  });
});

/*
 * ⛔⛔ ECO-01 — due siti che ricopiano la stessa frase non si contraddicono.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20, prima contesa vera trovata dal giudice:
 * «Dice di sì» e «Dice di no» portavano il testo IDENTICO, parola per parola,
 * da due siti diversi. Il giudice aveva risposto «sì, contraddice» a una frase
 * uguale a quella che aveva appena approvato — perché nessuno gliel'aveva
 * risparmiata.
 */
test('l\'eco non è una contesa', async (t) => {
  const FRASE = 'GGUF was developed by ggerganov who is also the developer of llama.cpp framework.';

  await t.test('⛔ la stessa frase su un altro sito NON viene proposta come contraria', () => {
    const fonti = [
      fonte({ url: 'https://uno.example', text: FRASE }),
      fonte({ url: 'https://eco.example', text: FRASE }),
    ];
    // Senza il passaggio approvato la candidata c'è: è il difetto di prima.
    assert.notEqual(talosResearchOpposingCandidate('GGUF was developed by ggerganov', 0, fonti), null);
    // Con il passaggio approvato, sparisce — e non si paga il giudice.
    assert.equal(talosResearchOpposingCandidate('GGUF was developed by ggerganov', 0, fonti, FRASE), null);
  });

  await t.test('e una frase che ricopia E AGGIUNGE resta un\'eco', () => {
    const fonti = [
      fonte({ url: 'https://uno.example', text: FRASE }),
      fonte({ url: 'https://eco.example', text: FRASE }),
    ];
    const piuLungo = FRASE + ' Il formato nasce nel 2023 dentro il progetto.';
    assert.equal(talosResearchOpposingCandidate('GGUF was developed by ggerganov', 0, fonti, piuLungo), null);
  });

  await t.test('⛔ e AL CONTRARIO: una frase che dice il contrario passa lo stesso', () => {
    // Se il filtro dell'eco togliesse anche i contrari veri, la contesa
    // tornerebbe a non poter esistere — che è il difetto da cui si parte.
    const fonti = [
      fonte({ url: 'https://uno.example', text: FRASE }),
      fonte({
        url: 'https://contro.example',
        text: 'The GGUF specification does not name ggerganov nor anyone else as maintainer.',
      }),
    ];
    const trovata = talosResearchOpposingCandidate('GGUF was developed by ggerganov maintainer', 0, fonti, FRASE);
    assert.equal(trovata?.url, 'https://contro.example');
  });
});

/*
 * ⛔⛔ ECO-02 — l'eco nel VERSO OPPOSTO, quello che il primo filtro lasciava
 * passare.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20, seconda contesa vera: «Dice di sì» e
 * «Dice di no» affiancati, e il secondo CONTENEVA il primo più un paragrafo di
 * contorno. Il filtro guardava quanta parte della frase contraria fosse nel
 * passaggio a favore: il contorno abbassava il rapporto e l'eco entrava.
 *
 * ⛔ Il test di prima provava solo il verso comodo — passaggio approvato
 * lungo, frase corta — e per questo dava conforto senza mordere.
 */
test('l\'eco quando è la CONTRARIA a essere più lunga', async (t) => {
  const CORTA = 'Sviluppato da Georgi Gerganov e dal team del progetto llama.cpp come evoluzione del precedente GGML.';
  const LUNGA = 'Sviluppato da Georgi Gerganov e dal team del progetto llama.cpp come evoluzione del precedente GGML, il GGUF racchiude in un unico file tutto il necessario per far funzionare un modello: pesi, metadati, dettagli di quantizzazione e tokenizer.';

  await t.test('⛔ una frase che CONTIENE il passaggio approvato è un\'eco, non un contrario', () => {
    const fonti = [
      fonte({ url: 'https://uno.example', text: CORTA }),
      fonte({ url: 'https://lunga.example', text: LUNGA }),
    ];
    assert.equal(talosResearchOpposingCandidate('formato sviluppato Gerganov progetto llama', 0, fonti, CORTA), null);
  });

  await t.test('e nell\'altro verso pure: il contorno può stare da una parte o dall\'altra', () => {
    const fonti = [
      fonte({ url: 'https://uno.example', text: LUNGA }),
      fonte({ url: 'https://corta.example', text: CORTA }),
    ];
    assert.equal(talosResearchOpposingCandidate('formato sviluppato Gerganov progetto llama', 0, fonti, LUNGA), null);
  });

  await t.test('⛔ e AL CONTRARIO: due frasi CORTE con due parole in comune non sono la stessa', () => {
    // Senza il pavimento, 2 su 2 farebbe 100% e scarterebbe un contrario
    // legittimo solo perché è breve.
    const fonti = [
      fonte({ url: 'https://uno.example', text: 'Il formato GGUF esiste.' }),
      fonte({ url: 'https://due.example', text: 'Nessun mantenitore formale del formato GGUF risulta dichiarato oggi.' }),
    ];
    const trovata = talosResearchOpposingCandidate('formato GGUF mantenitore dichiarato', 0, fonti, 'Il formato GGUF esiste.');
    assert.equal(trovata?.url, 'https://due.example');
  });
});

/*
 * ⛔⛔ TABELLA-SROTOLATA-01 — quello che arrivava al giudice non era una frase.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20, terza contesa: come passaggio contrario è
 * arrivato l'infobox di una pagina, estratto senza spazi fra le celle. Il
 * giudice ha risposto «sì, contraddice» a un blocco che in realtà CONFERMAVA la
 * data: gli era stata data spazzatura, e ha risposto lo stesso.
 *
 * E finiva a metà parola — «distributing quantized large lang» — perché il
 * taglio cadeva al carattere esatto.
 */
test('quello che si manda al giudice deve essere una frase', async (t) => {
  const INFOBOX = 'GGML and is typically produced by converting models developed with a different library. [4]GGUFFilename extension.ggufMagic number0x47 0x46Developed byGeorgi Gerganov and communityInitial releaseAugust 22, 2023 formatMachine-learning tensors.';

  await t.test('⛔ una tabella srotolata NON viene proposta come passaggio contrario', () => {
    const fonti = [
      fonte({ url: 'https://uno.example', text: 'GGUF ha sostituito GGML nel 2023.' }),
      fonte({ url: 'https://tabella.example', text: INFOBOX }),
    ];
    assert.equal(talosResearchOpposingCandidate('GGUF sostituito formato GGML agosto 2023', 0, fonti, 'GGUF ha sostituito GGML nel 2023.'), null);
  });

  await t.test('⛔ e AL CONTRARIO: una maiuscola dentro una parola non basta a scartare la prosa', () => {
    // Un nome proprio attaccato capita: «iPhone», «macOS». Tre volte in una
    // frase sola è una tabella, una volta è italiano.
    const fonti = [
      fonte({ url: 'https://uno.example', text: 'Il formato nasce nel 2023.' }),
      fonte({ url: 'https://prosa.example', text: 'Su iPhone il formato GGUF non è mai nato nel 2023 secondo questa fonte.' }),
    ];
    const trovata = talosResearchOpposingCandidate('formato GGUF nato 2023', 0, fonti, 'Il formato nasce nel 2023.');
    assert.equal(trovata?.url, 'https://prosa.example');
  });

  await t.test('⛔ e il taglio dei 400 caratteri cade su uno SPAZIO, non a metà parola', () => {
    const lungo = ('alfa beta gamma delta '.repeat(40)) + 'ultimissimaparolalunghissima';
    const fonti = [
      fonte({ url: 'https://uno.example', text: 'niente di simile qui' }),
      fonte({ url: 'https://lungo.example', text: lungo }),
    ];
    const trovata = talosResearchOpposingCandidate('alfa beta gamma', 0, fonti);
    assert.notEqual(trovata, null);
    // La fetta sta nel testo così com'è, e dopo di lei c'è uno spazio o la
    // fine: cioè il taglio è caduto FRA due parole, non dentro una.
    const dove = lungo.indexOf(trovata.passage);
    assert.ok(dove >= 0);
    const dopo = lungo[dove + trovata.passage.length];
    assert.equal(dopo === undefined || dopo === String.fromCharCode(32), true);
  });
});
