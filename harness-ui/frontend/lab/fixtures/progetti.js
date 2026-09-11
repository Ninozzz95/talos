/*
 * Fixture nella forma che `progettiConSessioni()` PRODUCE (progetti.js): `{id, nome, sessioni,
 * quante, ultimaAlle, giri, token}`. Si parte da lì e non dalle due rotte grezze
 * (`/api/v1/projects` + `/api/v1/sessions`) perché il laboratorio prova la SEZIONE, non
 * l’aggregazione — quella ha già i suoi test in `tests/unit/progetti.test.mjs`.
 *
 * `ultimaAlle` è un numero di millisecondi, come lo scrive `quandoUltima()`: zero vuol dire
 * «nessuna sessione», e la sezione lo deve mostrare come tale invece di inventare una data.
 */
const ORA = Date.parse('2026-09-11T18:30:00Z');

export const PROGETTI = [
  {
    id: 'avm-harness-desktop',
    nome: 'AVM-harness-desktop',
    quante: 3,
    ultimaAlle: ORA - 42 * 60 * 1000,
    giri: 214,
    token: 1_284_000,
    sessioni: [
      { sessionId: 'fx-td-porting', nome: 'Porting del mockup — sezioni', avviataAlle: '2026-09-11T17:48:00.000Z' },
      { sessionId: 'fx-td-temi', nome: 'Temi desktop allineati al mobile', avviataAlle: '2026-09-11T09:05:00.000Z' },
      { sessionId: 'fx-td-delega', nome: 'Due figlie sullo stesso file', avviataAlle: '2026-09-10T21:10:00.000Z' },
    ],
  },
  {
    id: 'talos-banco',
    nome: 'TALOS-BANCO',
    quante: 1,
    ultimaAlle: ORA - 3 * 24 * 60 * 60 * 1000,
    giri: 105,
    token: 512_300,
    sessioni: [
      { sessionId: 'fx-banco-35', nome: 'Campagna storia — 35 righe', avviataAlle: '2026-09-08T11:00:00.000Z' },
    ],
  },
  {
    id: 'progetto-vuoto',
    nome: 'Cartella senza sessioni',
    quante: 0,
    ultimaAlle: 0,
    giri: 0,
    token: 0,
    sessioni: [],
  },
];
