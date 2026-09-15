// Fixture esplicita nella forma GET /sessions/:id/tools; nessun catalogo owner dichiarato.
export const ATTREZZI = [
  {
    "nome": "shell",
    "descrizione": "Esegue un comando nella cartella della sessione e restituisce uscita e codice di uscita.",
    "categoria": "base",
    "permessoConfigurabile": true,
    "permesso": "chiedi",
    "dipendenza": null,
    "tokenSchemaStimati": 412
  },
  {
    "nome": "cerca",
    "descrizione": "Cerca testo nei file della cartella.",
    "categoria": "base",
    "permessoConfigurabile": false,
    "permesso": null,
    "dipendenza": null,
    "tokenSchemaStimati": 198
  },
  {
    "nome": "leggi",
    "descrizione": "Legge il contenuto di un file.",
    "categoria": "base",
    "permessoConfigurabile": false,
    "permesso": null,
    "dipendenza": null,
    "tokenSchemaStimati": 156
  },
  {
    "nome": "scrivi",
    "descrizione": "Crea o modifica un file nella cartella della sessione.",
    "categoria": "base",
    "permessoConfigurabile": true,
    "permesso": null,
    "dipendenza": null,
    "tokenSchemaStimati": 203
  },
  {
    "nome": "web_search",
    "descrizione": "Cerca informazioni sul web attraverso la fonte configurata.",
    "categoria": "esteso",
    "permessoConfigurabile": false,
    "permesso": null,
    "dipendenza": {
      "stato": "non_configurata",
      "dettaglio": "Fonte di ricerca non configurata"
    },
    "tokenSchemaStimati": 287
  },
  {
    "nome": "document_create",
    "descrizione": "Crea un documento scaricabile con il contenuto richiesto.",
    "categoria": "esteso",
    "permessoConfigurabile": true,
    "permesso": "nega",
    "dipendenza": null,
    "tokenSchemaStimati": 345
  }
];
