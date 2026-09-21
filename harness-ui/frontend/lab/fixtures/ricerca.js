// Fixture sintetiche nei quattro campi reali del GET /research; nessun rapporto eseguito.
export const ADESSO=Date.parse("2026-09-05T10:00:00Z");
export const RICERCHE=[
  {
    "id": "research-permessi",
    "titolo": "Confronto dei permessi per gli strumenti del progetto",
    "stato": "running",
    "avviataAlle": "2026-09-04T17:00:00Z"
  },
  {
    "id": "research-recupero",
    "titolo": "Confronto dettagliato delle autorizzazioni e del recupero dopo una ricerca interrotta per indisponibilità del servizio",
    "stato": "paused",
    "avviataAlle": "2026-09-04T16:42:00Z"
  },
  {
    "id": "research-documenti",
    "titolo": "Formati dei documenti e conservazione delle fonti",
    "stato": "done",
    "avviataAlle": "2026-09-04T16:00:00Z"
  },
  {
    "id": "research-archivio",
    "titolo": "Organizzazione dei rapporti nel progetto",
    "stato": "cancelled",
    "avviataAlle": "2026-09-03T15:00:00Z"
  },
  {
    "id": "research-errore",
    "titolo": "Verifica della disponibilità dei servizi di ricerca",
    "stato": "failed",
    "avviataAlle": "2026-09-02T14:00:00Z"
  }
];
