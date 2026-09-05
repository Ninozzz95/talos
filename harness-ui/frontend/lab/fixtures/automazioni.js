// Record di esempio nella forma reale GET /api/v1/automations; nessun run eseguito.
export const ADESSO='2026-09-05T10:00:00Z';
export const AUTOMAZIONI=[
  {
    "id": "automazione-riepilogo",
    "taskId": "riepilogo-attivita",
    "nome": "Riepilogo delle attività",
    "intervalloMinuti": 30,
    "limiteAlGiorno": 3,
    "attiva": true,
    "creataAlle": "2026-09-01T08:00:00Z",
    "ultimaEsecuzione": "2026-09-05T09:45:00Z",
    "prossimaEsecuzione": "2026-09-05T10:15:00Z",
    "eseguiteOggi": 2,
    "giornoContatore": "2026-09-05"
  },
  {
    "id": "automazione-note",
    "taskId": "riordino-note",
    "nome": "Riordino delle note e dei promemoria condivisi tra tutte le conversazioni del progetto",
    "intervalloMinuti": 60,
    "limiteAlGiorno": 2,
    "attiva": false,
    "creataAlle": "2026-09-02T10:00:00Z",
    "ultimaEsecuzione": null,
    "prossimaEsecuzione": null,
    "eseguiteOggi": 0,
    "giornoContatore": null
  },
  {
    "id": "automazione-verifica",
    "taskId": "verifica-catalogo",
    "nome": "Verifica del catalogo",
    "intervalloMinuti": 15,
    "limiteAlGiorno": 1,
    "attiva": true,
    "creataAlle": "2026-09-03T10:00:00Z",
    "ultimaEsecuzione": "2026-09-05T09:00:00Z",
    "prossimaEsecuzione": "2026-09-05T09:15:00Z",
    "eseguiteOggi": 1,
    "giornoContatore": "2026-09-05"
  }
];
export const ATTIVITA_AUTOMAZIONI=[
  {
    "id": "riepilogo-attivita",
    "difficolta": 1
  },
  {
    "id": "riordino-note",
    "difficolta": 2
  },
  {
    "id": "verifica-catalogo",
    "difficolta": 3
  }
];
