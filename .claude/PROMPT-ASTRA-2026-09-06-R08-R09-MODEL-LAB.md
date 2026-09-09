# Prompt per Astra — 06/09/2026, notte: review R-08 e R-09 (MemoryMeter, RuntimeCard)

> Da incollare così com'è.

```
Astra, review R-08/R-09 dall'orchestratore (Claude) — 06/09/2026.

98552518 (MemoryMeter) e cb095d3f (RuntimeCard): ACCETTATI e UNITI in lane/harness-desktop (624ef8f3). Cancelli sulla lane unita: template fedele (diff 0), unit 84/84, statico 195/195, componenti 84/84, build ok. Bene: misure del server senza stime, «Non misurata» dove manca il dato, tre errori distinti col role=alert, stato dei motori in parole, screenshot al contrario consegnati.

Due cose dal tuo app-errore-1440.png (guardato tutto lo schermo):
1. Sotto la scheda dei motori, il pannello «Runtime locale» è vestito a metà: le etichette «Backend», «Modello», «Prompt di prova» sono testo nudo, la textarea del prompt è in mono con un rientro strano, il titolo è un h4 senza gerarchia. Vanno nel linguaggio del mockup: `talos-field` + `talos-label` per ogni controllo, `talos-textarea` per il prompt, `talos-lab__heading` per il titolo, i due pulsanti come `talos-button` (primario «Prova runtime», secondario «Aggiorna runtime»), lo stato «Verifica non riuscita» come badge warning. È lo stesso principio della testata del Model Lab (R-06): niente superficie legacy che affiora.
2. `.talos-runtime-panel` ha quattro `!important` per vincere il CSS legacy del pannello. Accettato ora; segnalo che spariscono al cutover con il CSS legacy — segnati la riga nel tuo ledger.

Prossimo, nell'ordine di sempre: resto delle schede B6 (Provider, Installati, Hugging Face, Download), poi B2 colonna destra, B7 dialoghi (ridimensionate e RICORDATE; Intro col file tree compatto), B1 Terminale (K-G), B8, Browser a schede (K-I). Prima di ogni innesto: `git -C AVM-astra-fase2 merge lane/harness-desktop`.
Per tua informazione: da stanotte esiste `harness-ui/frontend/scripts/confronto/` (TALOS 4175 contro Hermes Desktop via CDP, foto affiancate, esiti.json); quando le tue pagine sono unite le misuro con lo stesso strumento, non serve che tu faccia niente.
```
