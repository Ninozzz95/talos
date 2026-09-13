import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REGOLE, FORME_IMPOSSIBILI, AVVISI_NOTI, TOLLERANZE,
  statiBugiardi, verificaRegola, coppieDi,
  statoLetto, stessoPercorso, campiDiversi, tipoAvviso,
} from '../../scripts/cancello/stati-bugiardi.mjs';

/*
 * Classe 3 del cancello unico. Ogni prova ha due metà: il difetto VERO del 06/09 che deve essere
 * trovato, e il caso sano che NON deve essere accusato — i falsi positivi sono il modo in cui un
 * cancello muore, perché un rapporto che grida al lupo non viene più letto.
 */

/** Uno schermo e dei dati che si dicono la stessa cosa, così ogni prova rompe una cosa sola. */
function scenaSana() {
  return {
    datiApi: {
      sessioni: [
        { sessionId: 'A', conclusa: false, interrotta: true, ultimoEsito: null },
        { sessionId: 'B', conclusa: true, interrotta: false, ultimoEsito: 'successo' },
        { sessionId: 'C', conclusa: false, interrotta: false, ultimoEsito: null },
        { sessionId: 'D', conclusa: false, interrotta: false, inAttesaApprovazione: true },
        { sessionId: 'E', conclusa: true, interrotta: false, ultimoEsito: null },
      ],
      sessioneAperta: 'C',
      barra: { giri: 7, token: 16811, contesto: 42, costo: 0.0014 },
      cartella: {
        percorso: 'C:\\Users\\esempio\\Desktop\\projects\\AVM-harness-desktop',
        ritratto: { leggibile: true, radice: true, oltreIlTetto: false, tetto: 20000 },
      },
      luoghi: { note: { esiste: true, quanti: 3 } },
    },
    schermo: {
      sessioni: [
        { sessionId: 'A', etichetta: 'interrotta · glm-4.6', classiPallino: ['talos-dot', 'talos-dot--sm'] },
        { sessionId: 'B', etichetta: 'conclusa · glm-4.6', classiPallino: ['talos-dot', 'talos-dot--success'] },
        { sessionId: 'C', etichetta: 'in corso · glm-4.6', classiPallino: ['talos-dot', 'talos-dot--live'] },
        { sessionId: 'D', etichetta: 'aspetta te · glm-4.6', classiPallino: ['talos-dot', 'talos-dot--warning'] },
        { sessionId: 'E', etichetta: 'conclusa · esito non registrato · glm-4.6', classiPallino: ['talos-dot'] },
      ],
      barra: { sessionId: 'C', giri: 7, token: 16811, contesto: 42, costo: 0.0014 },
      cartella: {
        percorsoDescritto: 'C:\\Users\\esempio\\Desktop\\projects\\AVM-harness-desktop',
        avviso: 'Questa è una cartella radice: l’agente vedrebbe tutto quello che c’è sotto.',
      },
      contatori: [{ nome: 'Note', luogo: 'note', quanti: 3 }],
    },
  };
}

const idBugie = (r) => r.bugie.map((b) => b.regola);

// ─── La forma di una regola: è un DATO, e chi ne aggiunge una non tocca il motore ────────────────

test('FORMA: ogni regola ha i campi dichiarati, un perché VERO e nessuna eccezione muta', () => {
  const ambiti = new Set(['sessione', 'cartella', 'barra', 'contatore']);
  const visti = new Set();
  for (const r of REGOLE) {
    assert.ok(!visti.has(r.id), `id duplicato: ${r.id}`);
    visti.add(r.id);
    assert.ok(ambiti.has(r.ambito), `${r.id}: ambito sconosciuto «${r.ambito}»`);
    assert.ok(['alta', 'media', 'bassa'].includes(r.gravita), `${r.id}: gravità sconosciuta`);
    assert.equal(typeof r.quando, 'function', `${r.id}: manca la precondizione`);
    assert.equal(typeof r.allora, 'function', `${r.id}: manca l’invariante`);
    assert.equal(typeof r.racconto, 'function', `${r.id}: manca il racconto per il rapporto`);
    // il perché è il difetto vero da cui nasce: una riga generica non aiuta chi legge il rapporto
    assert.ok(r.perche.length > 60, `${r.id}: il perché è troppo corto per dire da dove viene`);
    for (const e of r.eccezioni ?? []) {
      assert.equal(typeof e.quando, 'function', `${r.id}: eccezione senza condizione`);
      assert.ok(String(e.perche ?? '').length > 40, `${r.id}: eccezione MUTA — ogni eccezione dice perché`);
    }
  }
  assert.ok(REGOLE.some((r) => (r.eccezioni ?? []).length > 0), 'almeno una regola deve provare la forma delle eccezioni');
});

test('FORMA: una regola NUOVA si aggiunge come dato — il motore non la conosce e la applica lo stesso', () => {
  // Questa è la prova che le regole non sono sepolte nel codice: la regola qui sotto non esiste in
  // REGOLE, e `verificaRegola` la esegue esattamente come le sue sorelle.
  const inventata = {
    id: 'X99-NOME-VUOTO',
    gravita: 'bassa',
    ambito: 'sessione',
    perche: 'inventata dentro la prova per dimostrare che il motore non ha bisogno di conoscere una regola per applicarla',
    quando: (d) => typeof d?.nome === 'string',
    allora: (d, v) => d.nome === v.titolo,
    racconto: (d, v) => `${d.nome} contro ${v.titolo}`,
  };
  assert.equal(verificaRegola(inventata, { nome: 'x' }, { titolo: 'y' }).esito, 'violata');
  assert.equal(verificaRegola(inventata, { nome: 'x' }, { titolo: 'x' }).esito, 'rispettata');
  assert.equal(verificaRegola(inventata, {}, { titolo: 'x' }).esito, 'non-applicabile');
});

test('FORMA: senza `quando` o `allora` il motore si ferma invece di far finta di giudicare', () => {
  assert.throws(() => verificaRegola(null, {}, {}), TypeError);
  assert.throws(() => verificaRegola({ id: 'x', quando: () => true }, {}, {}), TypeError);
});

// ─── I difetti veri del 06/09 ───────────────────────────────────────────────────────────────────

test('S01/S02: la sessione interrotta che diceva «in corso» col pallino vivo — e il caso sano tace', () => {
  const { datiApi, schermo } = scenaSana();
  // il difetto vero: quattro sessioni morte da due ore dicevano «in corso»
  schermo.sessioni[0] = { sessionId: 'A', etichetta: 'in corso · glm-4.6', classiPallino: ['talos-dot', 'talos-dot--live'] };
  const trovato = idBugie(statiBugiardi(datiApi, schermo));
  assert.ok(trovato.includes('S01-INTERROTTA-MAI-IN-CORSO'));
  assert.ok(trovato.includes('S02-INTERROTTA-MAI-PALLINO-VIVO'));
  // AL CONTRARIO: la scena sana non produce nemmeno una riga
  const sana = scenaSana();
  const rapporto = statiBugiardi(sana.datiApi, sana.schermo);
  assert.deepEqual(rapporto.bugie, []);
  assert.deepEqual(rapporto.rotte, []);
  // ⛔ e il verde vale qualcosa solo perché NESSUNA regola è muta: la scena sana esercita davvero
  //    tutte e tredici le precondizioni, invece di passare perché nessuna ha guardato niente.
  assert.deepEqual(rapporto.mute, [], 'una regola muta qui vorrebbe dire che questa prova non la copre');
});

test('S02: le parole si correggono prima del pallino — il solo colore vivo basta ad accusare', () => {
  const { datiApi, schermo } = scenaSana();
  schermo.sessioni[0].classiPallino = ['talos-dot', 'talos-dot--live'];
  const trovato = idBugie(statiBugiardi(datiApi, schermo));
  assert.deepEqual(trovato, ['S02-INTERROTTA-MAI-PALLINO-VIVO'], 'il testo era giusto: si accusa solo il pallino');
});

test('S03/S04: una sessione conclusa non può dire «in corso» né tenere il pallino vivo', () => {
  const { datiApi, schermo } = scenaSana();
  schermo.sessioni[1] = { sessionId: 'B', etichetta: 'in corso · glm-4.6', classiPallino: ['talos-dot', 'talos-dot--live'] };
  const trovato = idBugie(statiBugiardi(datiApi, schermo));
  assert.ok(trovato.includes('S03-CONCLUSA-MAI-IN-CORSO'));
  assert.ok(trovato.includes('S04-CONCLUSA-MAI-PALLINO-VIVO'));
});

test('S05 — IL VERSO CONTRARIO: una sessione VIVA dichiarata morta è una bugia uguale e opposta', () => {
  const { datiApi, schermo } = scenaSana();
  // la cura sbrigativa di S01-S04 è spegnere tutto: senza S05 questo passerebbe verde
  schermo.sessioni[2].etichetta = 'interrotta · glm-4.6';
  const trovato = idBugie(statiBugiardi(datiApi, schermo));
  assert.deepEqual(trovato, ['S05-VIVA-MAI-DICHIARATA-MORTA']);
});

test('S06: l’attesa di approvazione si dice — e l’eccezione dichiarata non accusa il processo morto', () => {
  const { datiApi, schermo } = scenaSana();
  schermo.sessioni[3].etichetta = 'in corso · glm-4.6';
  assert.ok(idBugie(statiBugiardi(datiApi, schermo)).includes('S06-ATTESA-SI-DICE'));
  // AL CONTRARIO: se il processo è morto non c’è più nessuna approvazione da dare, e «interrotta» è
  // la verità — l’eccezione deve scagionare, non l’occhio di chi legge il rapporto
  const regola = REGOLE.find((r) => r.id === 'S06-ATTESA-SI-DICE');
  const esito = verificaRegola(regola, { inAttesaApprovazione: true, interrotta: true }, { etichetta: 'interrotta' });
  assert.equal(esito.esito, 'esclusa');
  assert.match(esito.perche, /nessuna approvazione/);
});

test('S07: il ritratto sotto «Cartella scelta» descriveva un’altra cartella', () => {
  const { datiApi, schermo } = scenaSana();
  schermo.cartella.percorsoDescritto = 'C:\\';
  assert.ok(idBugie(statiBugiardi(datiApi, schermo)).includes('S07-RITRATTO-DELLA-CARTELLA-SCELTA'));
  // AL CONTRARIO: la stessa cartella scritta con l’altra barra, in minuscolo e con la barra finale
  // NON è un’altra cartella — accusarla riempirebbe il rapporto di rumore
  const sana = scenaSana();
  sana.schermo.cartella.percorsoDescritto = 'c:/users/esempio/desktop/projects/AVM-harness-desktop/';
  assert.deepEqual(statiBugiardi(sana.datiApi, sana.schermo).bugie, []);
});

test('S07: due percorsi ignoti non sono «lo stesso posto»', () => {
  assert.equal(stessoPercorso('', ''), false, 'vuoto contro vuoto è «non lo so», non un’uguaglianza');
  assert.equal(stessoPercorso(null, 'C:\\x'), false);
  assert.equal(stessoPercorso('C:\\x\\', 'C:/X'), true);
});

test('S08: l’avviso vuole il suo fatto, e un avviso NUOVO non fa diventare rosso il cancello', () => {
  const { datiApi, schermo } = scenaSana();
  datiApi.cartella.ritratto.radice = false; // il progetto non è una radice, e l’avviso lo dice lo stesso
  assert.ok(idBugie(statiBugiardi(datiApi, schermo)).includes('S08-AVVISO-VUOLE-IL-SUO-FATTO'));
  // AL CONTRARIO: un avviso che AVVISI_NOTI ancora non conosce viene dichiarato fuori giudizio, con
  // il suo perché — non accusato. Chi ne aggiunge uno aggiunge la sua riga.
  const regola = REGOLE.find((r) => r.id === 'S08-AVVISO-VUOLE-IL-SUO-FATTO');
  const esito = verificaRegola(regola,
    { ritratto: { leggibile: true, radice: false } },
    { avviso: 'Questa cartella è su un disco di rete: ogni giro sarà più lento.' });
  assert.equal(esito.esito, 'esclusa');
  assert.equal(tipoAvviso('Questa cartella è su un disco di rete'), null);
  assert.equal(tipoAvviso('più di 20.000 file')?.id, 'oltre-il-tetto');
  assert.ok(AVVISI_NOTI.length >= 2);
});

test('S08: un ritratto illeggibile non descrive niente, quindi non c’è contraddizione da trovare', () => {
  const { datiApi, schermo } = scenaSana();
  datiApi.cartella.ritratto = { leggibile: false };
  const rapporto = statiBugiardi(datiApi, schermo);
  assert.deepEqual(idBugie(rapporto).filter((id) => id.startsWith('S08')), []);
  // ⛔ e la regola risulta MUTA: non ha guardato niente, e il rapporto lo dice invece di rassicurare
  assert.ok(rapporto.mute.includes('S08-AVVISO-VUOLE-IL-SUO-FATTO'));
});

test('S09/S10: i numeri della barra appartengono alla sessione aperta, e sono i suoi', () => {
  const { datiApi, schermo } = scenaSana();
  schermo.barra.sessionId = 'B'; // la barra racconta ancora la sessione di prima
  assert.ok(idBugie(statiBugiardi(datiApi, schermo)).includes('S09-BARRA-DELLA-SESSIONE-APERTA'));

  const b = scenaSana();
  b.schermo.barra.giri = 6; // un evento perso: la barra è rimasta indietro di un giro
  const bugia = statiBugiardi(b.datiApi, b.schermo).bugie.find((x) => x.regola === 'S10-NUMERI-DELLA-BARRA-SONO-QUELLI-VERI');
  assert.ok(bugia, 'un giro di differenza non è arrotondamento');
  assert.match(bugia.cosa, /giri: il dato dice 7, lo schermo 6/);
});

test('S10 — AL CONTRARIO: l’arrotondamento del costo non è una bugia, e «non contato» non è «zero»', () => {
  const { datiApi, schermo } = scenaSana();
  schermo.barra.costo = 0.00140004; // lo schermo mostra $0,0014: mezza cifra dell’ultimo decimale
  assert.deepEqual(statiBugiardi(datiApi, schermo).bugie, []);
  assert.ok(TOLLERANZE.costo > 0 && TOLLERANZE.giri === undefined, 'i conteggi interi non hanno tolleranza');
  // un numero che il server non ha contato non entra nel confronto: accusare uno zero mancante è il
  // falso positivo più comune su questi campi
  assert.deepEqual(campiDiversi({ giri: 7, costo: null }, { giri: 7, costo: 0 }), []);
  assert.deepEqual(campiDiversi({ giri: 7 }, { giri: 7, costo: 0.9 }), []);
  assert.deepEqual(campiDiversi({ giri: 7, costo: 0.9 }, { giri: 7, costo: 0.1 }), ['costo']);
});

test('S11/S12: un contatore porta a un luogo, e quel luogo ha proprio quegli elementi', () => {
  const { datiApi, schermo } = scenaSana();
  schermo.contatori = [{ nome: 'Note', luogo: 'note', quanti: 1 }];
  assert.ok(idBugie(statiBugiardi(datiApi, schermo)).includes('S11-CONTATORE-PORTA-A-N'));

  // il difetto T14: «Note 1» col contatore vivo e NESSUNA pagina dietro
  const senzaLuogo = scenaSana();
  senzaLuogo.datiApi.luoghi = {};
  const rapporto = statiBugiardi(senzaLuogo.datiApi, senzaLuogo.schermo);
  assert.deepEqual(idBugie(rapporto), ['S12-CONTATORE-PORTA-A-UN-LUOGO']);
  // ⛔ e S11 qui non ha guardato niente: senza S12 il difetto peggiore passerebbe per costruzione
  assert.ok(rapporto.mute.includes('S11-CONTATORE-PORTA-A-N'));

  // AL CONTRARIO: un contatore a zero non promette nessun luogo, e non si accusa
  const zero = scenaSana();
  zero.datiApi.luoghi = {};
  zero.schermo.contatori = [{ nome: 'Note', luogo: 'note', quanti: 0 }];
  assert.deepEqual(statiBugiardi(zero.datiApi, zero.schermo).bugie, []);
});

test('S13: nessun esito registrato non è un successo — il pallino verde inventerebbe un fatto', () => {
  const { datiApi, schermo } = scenaSana();
  schermo.sessioni[4].classiPallino = ['talos-dot', 'talos-dot--success'];
  assert.deepEqual(idBugie(statiBugiardi(datiApi, schermo)), ['S13-ESITO-NON-REGISTRATO-NON-E-SUCCESSO']);
});

// ─── Il motore: i modi in cui un cancello finge di aver guardato ─────────────────────────────────

test('MOTORE: «non applicabile» non è «rispettata» — è il conto delle coppie esaminate a dirlo', () => {
  const regola = REGOLE.find((r) => r.id === 'S01-INTERROTTA-MAI-IN-CORSO');
  const esito = verificaRegola(regola, { conclusa: false, interrotta: false }, { etichetta: 'in corso' }, 'A');
  assert.equal(esito.esito, 'non-applicabile');
  assert.notEqual(esito.esito, 'rispettata');
  // su una scena senza nessuna sessione, TUTTE le regole di sessione sono mute: un rapporto vuoto
  // qui non è una buona notizia, è un cancello che non ha guardato niente
  const rapporto = statiBugiardi({ sessioni: [] }, { sessioni: [] });
  assert.deepEqual(rapporto.bugie, []);
  assert.ok(rapporto.mute.includes('S01-INTERROTTA-MAI-IN-CORSO'));
  assert.equal(rapporto.mute.length, REGOLE.length, 'senza dati nessuna regola ha guardato niente');
});

test('MOTORE: la forma che il server non produce non prova NIENTE (il difetto del 06/09)', () => {
  const regola = REGOLE.find((r) => r.id === 'S03-CONCLUSA-MAI-IN-CORSO');
  const esito = verificaRegola(regola, { conclusa: true, interrotta: true }, { etichetta: 'conclusa' }, 'Z');
  assert.equal(esito.esito, 'forma-impossibile', 'un verde su questa forma rassicurerebbe a vuoto');
  assert.equal(esito.forma, 'IMP-CONCLUSA-E-INTERROTTA');

  const rapporto = statiBugiardi(
    { sessioni: [{ sessionId: 'Z', conclusa: true, interrotta: true }] },
    { sessioni: [{ sessionId: 'Z', etichetta: 'in corso', classiPallino: ['talos-dot', 'talos-dot--live'] }] },
  );
  assert.deepEqual(rapporto.bugie, [], 'su una forma impossibile non si accusa nessuno');
  assert.equal(rapporto.esaminate['S03-CONCLUSA-MAI-IN-CORSO'], 0, 'e non la si conta come esaminata');
  assert.ok(rapporto.formeImpossibili.length > 0, 'la si dichiara, invece di ignorarla in silenzio');
  assert.ok(FORME_IMPOSSIBILI.every((f) => String(f.perche ?? '').length > 40));
});

test('MOTORE: una regola che lancia diventa RUMOROSA, mai un silenzioso «va bene»', () => {
  // ⛔ È il difetto del cancello semantico: una funzione lanciava sempre e un catch rispondeva
  //    «ignoto» senza bloccare. Qui l’errore ha un esito proprio ed è contato a parte.
  const rotta = {
    id: 'X98-ROTTA', gravita: 'alta', ambito: 'sessione',
    perche: 'regola scritta male apposta dentro la prova, per verificare che il motore non inghiotta l’errore',
    quando: () => { throw new Error('argomento obbligatorio mancante'); },
    allora: () => true,
    racconto: () => '',
  };
  const esito = verificaRegola(rotta, {}, {});
  assert.equal(esito.esito, 'regola-rotta');
  assert.equal(esito.dove, 'quando');
  assert.match(esito.perche, /argomento obbligatorio mancante/);
  assert.notEqual(esito.esito, 'rispettata');
});

test('MOTORE: le bugie escono in ordine di gravità, e ognuna porta il suo perché', () => {
  const { datiApi, schermo } = scenaSana();
  schermo.sessioni[2].etichetta = 'conclusa · glm-4.6';            // S05, media
  schermo.sessioni[0].classiPallino = ['talos-dot', 'talos-dot--live']; // S02, alta
  const bugie = statiBugiardi(datiApi, schermo).bugie;
  assert.deepEqual(bugie.map((b) => b.gravita), ['alta', 'media']);
  for (const b of bugie) {
    assert.ok(b.cosa.length > 0, `${b.regola}: il rapporto deve dire cosa contraddice cosa`);
    assert.ok(b.perche.length > 0, `${b.regola}: e da quale difetto vero nasce`);
    assert.ok(b.chiave.length > 0, `${b.regola}: e su quale oggetto`);
  }
});

test('MOTORE: le coppie si formano per identità, e chi manca da una parte non è una bugia', () => {
  const rapporto = statiBugiardi(
    { sessioni: [{ sessionId: 'A', conclusa: false, interrotta: true }, { sessionId: 'B', conclusa: true }] },
    { sessioni: [{ sessionId: 'A', etichetta: 'interrotta' }, { sessionId: 'Q', etichetta: 'in corso' }] },
  );
  // «Q» non ha un dato dietro e «B» non è a schermo: un elenco può filtrare legittimamente, quindi
  // sono contesto per leggere `mute`, non accuse.
  assert.deepEqual(rapporto.bugie, []);
  assert.deepEqual(rapporto.soloNeiDati, ['B']);
  assert.deepEqual(rapporto.soloSulloSchermo, ['Q']);
  assert.equal(coppieDi('sessione', { sessioni: [{ sessionId: 'A' }] }, { sessioni: [{ sessionId: 'A' }] }).length, 1);
});

test('VOCABOLARIO: lo stato è il PRIMO segmento, così un nome di modello non fa scattare nulla', () => {
  assert.equal(statoLetto('conclusa · esito non registrato · glm-4.6'), 'conclusa');
  assert.equal(statoLetto('in corso · qwen-in-corso-preview'), 'in corso');
  assert.equal(statoLetto(null), '');
  // AL CONTRARIO: un modello che si chiama come uno stato non deve accusare una sessione sana
  const rapporto = statiBugiardi(
    { sessioni: [{ sessionId: 'A', conclusa: true, ultimoEsito: 'successo' }] },
    { sessioni: [{ sessionId: 'A', etichetta: 'conclusa · modello-in-corso', classiPallino: ['talos-dot'] }] },
  );
  assert.deepEqual(rapporto.bugie, []);
});
