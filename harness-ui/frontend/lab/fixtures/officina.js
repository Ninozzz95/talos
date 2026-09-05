// Fixture nei sette campi del GET /tool-forge; non generate da un modello reale.
export const ADESSO=Date.parse("2026-09-05T10:00:00Z");
export const STRUMENTI_FORGIATI=[
  {
    "id": "riepilogo-attivita",
    "titolo": "Riepilogo delle attività",
    "descrizione": "Legge le attività salvate e restituisce quelle ancora da completare.",
    "capacita": [
      "tasks.list"
    ],
    "rischio": "R1",
    "abilitato": true,
    "installatoAlle": "2026-09-04T16:00:00Z"
  },
  {
    "id": "annota-promemoria",
    "titolo": "Annota un promemoria",
    "descrizione": "Crea una nota con il testo richiesto e la rende disponibile nelle altre conversazioni.",
    "capacita": [
      "notes.create"
    ],
    "rischio": "R2",
    "abilitato": false,
    "installatoAlle": "2026-09-03T15:00:00Z"
  },
  {
    "id": "memorizza-preferenze",
    "titolo": "Memorizza le preferenze condivise tra le conversazioni e i progetti",
    "descrizione": "Salva una preferenza esplicita nella memoria globale. Le conversazioni successive potranno leggerla.",
    "capacita": [
      "memory.create"
    ],
    "rischio": "R3",
    "abilitato": false,
    "installatoAlle": "2026-09-02T14:00:00Z"
  }
];
