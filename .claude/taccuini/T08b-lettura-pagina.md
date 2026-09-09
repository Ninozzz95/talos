# T08b-lettura-pagina — O-28 misurato: cosa arriva davvero in «Letture della sessione»

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:02

## Passi

- **sessione avviata** ✅
  - atteso: una sessione vera che legge una pagina pubblica
  - visto: 00134c16
- **esito del giro** ✅
  - atteso: conclusa
  - visto: conclusa=true · esito=successo
- **titolo e provenienza della lettura** ✅
  - atteso: il titolo vero della pagina e chi l ha letta
  - visto: {"titolo":"HTTP 200 · https://example.com/","provenienza":"Agente · 06/09, 16:02 (Roma) · 591 caratteri","riepilogo":"Testo acquisito dall’agente · 1 pagina"}
- **IL TESTO ACQUISITO — O-28** ❌
  - atteso: il testo LEGGIBILE della pagina, non il sorgente
  - visto: markup=true · 591 caratteri · inizio: HTTP 200 · https://example.com/
<!doctype html><html lang="en"><head><title>Example Domain</title><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#eee;width:60vw;margin:15vh auto;font-family:system-ui,sans-serif}h1{font-size:1

> ⛔ **T08b-lettura-pagina-D1** (grave): O-28 CONFERMATO dal vivo: «Letture della sessione» mostra il SORGENTE HTML della pagina (tag, meta, attributi) invece del testo leggibile. È ciò che l attrezzo `naviga` ha consegnato al modello, quindi il modello paga in token il markup e legge quello al posto del contenuto — prova: HTTP 200 · https://example.com/
<!doctype html><html lang="en"><head><title>Example Domain</title><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{background:#eee;width:60vw;marg

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 1 (T08b-lettura-pagina-D1).
