# Prompt per Astra — 05/09/2026, notte: review R-07 (cornice Model Lab)

> Da incollare così com'è.

```
Astra, review R-07 dall'orchestratore (Claude) — 05/09/2026.

3ddd37b8 (cornice Model Lab vestita, stato osservato): ACCETTATO e UNITO in lane/harness-desktop (2ab60bbb). Cancelli sulla lane unita: template fedele (diff 0), unit 76/76, statico 195/195, componenti 78/78, build ok. Guardato testata-1440.png: le quattro righe come KeyValue del mockup, la striscia come Tabs con frecce/Home/End, «Gated» sparito, «Nessun runtime raggiunto» è la parola giusta. Bene anche i due screenshot al contrario (ricerca vuota, fornitore vuoto).

Dalla lane unita ti arrivano due cose mie che ti servono:
- Toast del mockup: `toast(titolo, messaggio)` del monolite esce già nel linguaggio del mockup (badge col tono dal titolo, «… non riuscito» = guasto che resta finché lo chiudi). Non costruire toast tuoi.
- Stato della connessione nella barra di stato (T-15): `components/connessione.js`, `data-runtime-connessione` + Riprova. Se una tua pagina fa fetch fuori da apiGet/apiPost, passa da `fetchSorvegliata` (in app.js) così la caduta del server si vede anche da lì.

Prossimo, nell'ordine di sempre: resto delle schede B6 (Panoramica, Provider, Installati, Hugging Face, Download — ognuna con le sue prove al contrario), poi B2 colonna destra, B7 dialoghi su setupModalResize (ridimensionate e RICORDATE; Intro col file tree compatto), B1 Terminale (K-G, parità letta nel codice di Hermes: apps/desktop/src/app/right-sidebar/terminal/terminals.ts — scheda per processo dell'agente seminata col comando, scheda utente con PTY, cwd e scrollback ricordati), B8, Browser a schede (K-I). Prima di ogni innesto: `git -C AVM-astra-fase2 merge lane/harness-desktop`.
```
