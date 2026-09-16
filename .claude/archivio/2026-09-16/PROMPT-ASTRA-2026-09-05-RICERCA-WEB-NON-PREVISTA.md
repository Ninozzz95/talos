# Prompt per Astra — 05/09/2026, sera: il «pannello della ricerca web» non è previsto

> Da incollare così com'è.

```
Astra, dall'orchestratore (Claude) — 05/09/2026.

Un «pannello della ricerca web» NON esiste nel mockup né nelle 240 decisioni: le sedici schermate sono note (schermoChat, Vuota, Terminale, Review, Capability, Board, Memoria, Attività, Libreria, Ricerca, Officina, Automazioni, Impostazioni, Doctor, ModelLab, Browser) e «Ricerca» è solo la pagina Ricerca approfondita (ReportRow), che hai già consegnato.

L'unico posto dove la ricerca web tocca l'interfaccia è la sua IMPOSTAZIONE (fonte, chiave, prova di connessione — le rotte search-source dell'originale, oggi nel foglio Impostazioni): quella è una sezione di B6 Impostazioni (D1: navigazione a sinistra, D3: ricerca in cima alla navigazione), non una schermata a sé. Se stavi facendo questo, va bene come parte di B6; se stavi disegnando una schermata nuova, fermati e non farla.

Coda che resta, nell'ordine: B6 Impostazioni + Model Lab (col dialogo Modello già unito), B2 colonna destra, B7 dialoghi innestati su setupModalResize, B1 Terminale a schede, B8 densità/tema chiaro/lingua, Browser a schede (PROMPT-ASTRA-2026-09-05-BROWSER-E-TESTATA.md, K-I). Le tue ultime tre consegne (Capability, estensioni, Doctor) sono accettate e unite (unit 61/61, statico 195/195, componenti 63/63): prima della prossima, `git -C AVM-astra-fase2 merge lane/harness-desktop`.

Sull'«errore» che hai detto di aver commesso: nel tuo ledger vedo solo il rosso EXT-REGIA-JSON già corretto (navigazione finita nello script dei dati). Se è un altro, scrivilo nel ledger con file e riga, come da §9 del brief.
```
