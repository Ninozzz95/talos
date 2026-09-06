# T01-nuova-sessione — La modale «Nuova sessione», campo per campo

> Prova d'uso sul 4174, guidata come farebbe una persona. 2026-09-06 11:50

## Passi

- **apro la modale** ✅
  - atteso: un foglio centrato e disegnato
  - visto: {"id":"sheetDialog","w":1240,"h":868,"centrata":true,"bg":"rgb(23, 24, 27)","raggio":"16px","passi":0}

> ⛔ **T01-nuova-sessione-D1** (grave): la modale è ancora a due colonne dense: la decisione F1-F2 vuole DUE PASSI («dove si lavora», poi «come si lavora») — prova: nessun elemento di passo nel foglio
- **le vie per la cartella** ✅
  - atteso: recenti · progetti · scelte rapide · albero
  - visto: ["AVM-harness-desktopProgetto","C:Usata di recente","DesktopUsata di recente","progetto-3Usata di recente","progetto-1Usata di recente","progetto-5Usata di recente","DownloadScelta rapida","DocumentiScelta rapida"]

> ⛔ **T01-nuova-sessione-D2** (minore): i progetti non dicono quante sessioni hanno (decisione F5)
- **cartella scelta e pulsante** ❌
  - atteso: la cartella scelta sta ACCANTO al pulsante che la usa (F8)
  - visto: {"sceltaY":588,"pulsanteY":830,"distanza":968,"testo":"Cartella sceltaC:\\Users\\Antonino\\AppData\\Local\\Temp\\claude\\C--Users-Antonino-Des"}

> ⛔ **T01-nuova-sessione-D3** (medio): la cartella scelta è lontana 968 px dal pulsante: la decisione F8 la vuole accanto
- **avviso sulla cartella** ❌
  - atteso: quanti file ha, e un avviso se è una radice (F9-F10)
  - visto: Full access consente di usare questa cartella esterna. La scelta sarà verificata di nuovo all’avvio. Esplora in sola lettura e consegna il p

> ⛔ **T01-nuova-sessione-D4** (grave): la modale non dice quanti file ha la cartella scelta (F10) né avvisa se è una radice (F9)
- **informazioni git** ❌
  - atteso: ramo corrente, modifiche non salvate, repo annidati (F19-F21)
  - visto: assenti

> ⛔ **T01-nuova-sessione-D5** (medio): la modale non mostra nessuna informazione git (F19-F21)
- **planner opzionale** ❌
  - atteso: NON deve stare qui: è un modello ausiliario nelle impostazioni (F14)
  - visto: ancora presente

> ⛔ **T01-nuova-sessione-D6** (medio): «Planner opzionale» è ancora nella modale: la decisione F14 lo sposta nelle impostazioni

> ⛔ **T01-nuova-sessione-D7** (minore): manca la riga col totale degli attrezzi e il costo per giro (F23)
- **il modello scelto è quello che parte** ✅
  - atteso: scelto z-ai/glm-5.3-flash → mandato e avviato lo stesso
  - visto: mandato z-ai/glm-5.3-flash · avviato z-ai/glm-5.3-flash

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 7 (T01-nuova-sessione-D1, T01-nuova-sessione-D2, T01-nuova-sessione-D3, T01-nuova-sessione-D4, T01-nuova-sessione-D5, T01-nuova-sessione-D6, T01-nuova-sessione-D7).
