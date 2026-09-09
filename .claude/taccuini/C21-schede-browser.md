# C21-schede-browser — Schede come in un browser: nome vero, ✕ propria, «+», e una lista sola

> Prova d'uso sul 4174, guidata come farebbe una persona. 2026-09-07 17:54

## Passi

- **la striscia delle schede** ✅
  - atteso: ogni scheda col NOME vero, una ✕ sua, il «+» in coda, una sola attiva, zero cronologia vecchia
  - visto: {"schede":7,"nomi":["github.com/Ninozzz95/talos","api.github.com/repos/Ninozzz95/talos","raw.githubusercontent.com/Ninozzz95/talo","z.ai/blog/glm-5.3","GLM 5.3 Post-Training Explained: How Sca","www.baseten.co/blog/glm-53","GLM-5.3: Z.ai Tops the Open Coding Leade"],"conStato":["415"],"conX":7,"piu":true,"attive":1,"cronologiaVecchia":0,"strisciaScorre":"auto","altezza":36}
- **la ✕ della prima scheda** ✅
  - atteso: una scheda in meno, e sparisce proprio quella
  - visto: {"prima":7,"dopo":6,"sparita":"github.com/Ninozzz95/talos","restano":["api.github.com/repos/Ninozzz95/talos","raw.githubusercontent.com/Ninozzz95/talo","z.ai/blog/glm-5.3"]}

## Verdetto

**PASSA** — difetti trovati: 0.
