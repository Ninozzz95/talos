// Forma della risposta GET /api/v1/search-source; fixture senza credenziali.
export const FONTE_RICERCA = {
  "source": "duckduckgo",
  "endpoint": "",
  "readiness": "pronta",
  "fonti": [
    {
      "id": "duckduckgo",
      "label": "DuckDuckGo (senza chiave)",
      "needsKey": false,
      "needsEndpoint": false,
      "keyless": true,
      "nota": "Nessuna chiave e nessun account: TALOS legge la pagina dei risultati pubblica di DuckDuckGo. Non è un'API ufficiale: sotto uso intenso può rispondere con un blocco, e allora l'esito lo dice. Solo la query lascia questo computer.",
      "keyConfigured": false
    },
    {
      "id": "tavily",
      "label": "Tavily",
      "needsKey": true,
      "needsEndpoint": false,
      "keyless": false,
      "nota": "1.000 ricerche al mese senza costi e senza carta. È progettato per gli agenti, quindi restituisce risultati puliti.",
      "link": "https://app.tavily.com",
      "keyConfigured": false
    },
    {
      "id": "brave",
      "label": "Brave Search",
      "needsKey": true,
      "needsEndpoint": false,
      "keyless": false,
      "nota": "Un indice indipendente. È richiesta una carta di credito e Brave offre limiti di spesa. Brave non consente di conservare i risultati senza un accordo separato: TALOS apre le fonti con naviga prima di salvarle.",
      "link": "https://api-dashboard.search.brave.com",
      "keyConfigured": false
    },
    {
      "id": "searxng",
      "label": "SearXNG (istanza tua)",
      "needsKey": false,
      "needsEndpoint": true,
      "keyless": false,
      "nota": "La tua istanza SearXNG: nessuna terza parte vede la query. Basta un container Docker. L'output JSON è disattivato all'inizio: attivalo nelle impostazioni dell'istanza, o TALOS riceverà una pagina HTML.",
      "keyConfigured": false
    },
    {
      "id": "custom",
      "label": "Endpoint personalizzato",
      "needsKey": false,
      "needsEndpoint": true,
      "keyless": false,
      "nota": "Qualsiasi altra API di ricerca che restituisca un array «results» al primo livello (chiave opzionale, inviata come Bearer).",
      "keyConfigured": false
    }
  ]
};
