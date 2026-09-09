# Ledger Fase 2 — audit label Settings (nessuna modifica)

Data: 2026-08-30  
Perimetro: Harness UI desktop nel server locale `http://127.0.0.1:4174`.  
Ownership: desktop בלבד; mobile/Pad/TALOS-BANCO fuori perimetro.

## Decisione dell'audit

Il finding “label Settings stale” del piano iniziale non è riproducibile sul
commit corrente. Le label false di Control plane, Context Rail e card
Agentico sono già state corrette nella baseline precedente; non esiste una
ragione onesta per cambiare codice o inventare un capability registry nuovo.

La sola frase ancora negativa nella card Interazione è:

`Diff espansi di default e Tool activity compatta: non ancora implementati.`

La QA precedente la classificava come capacità genuinamente aperta, non come
label falsa. Questa fase la riconferma senza promuoverla a bug: finché quelle
preferenze non hanno un comportamento reale, il testo è corretto.

## Percorso e riproduzione

Scenario read-only eseguito:

```text
node harness-ui/scripts/qa-visual-pipeline.mjs qa-batchfix-d-e-label-badge --url=http://127.0.0.1:4174/ --porta=9567
```

Report: `harness-ui/.qa-runs/qa-batchfix-d-e-label-badge-2026-08-30T16-16-51-467Z/report.json`.

Risultati misurati dal browser:

- Control plane contiene ancora “Non ancora implementato”: **false**;
- card Memory mostra il vecchio testo: **false**;
- tab Agents mostra il vecchio testo: **false**;
- card Agentico Settings mostra il vecchio testo: **false**;
- badge demo Board con sessioni reali: **false**;
- 0 eccezioni JS, 0 errori console; solo il 404 preesistente di
  `/favicon.ico`.

Sono state ispezionate integralmente tutte le quattro immagini:

`harness-ui/.qa-runs/qa-batchfix-d-e-label-badge-2026-08-30T16-16-51-467Z/`

La gerarchia dei fogli è leggibile, i backdrop non coprono i contenuti e le
card Settings mantengono densità e token coerenti. La card Interazione mostra
esplicitamente una sola capability non implementata; non è stata alterata.

## Confronto competitivo

Hermes espone configurazione e stato solo quando la capability è realmente
disponibile; pi persiste gli eventi di compattazione ma non offre una prova
pubblica equivalente per le due preferenze visuali; Codex tratta come
regressione la perdita di uno stato dichiarato vicino all'azione. Decisione
TALOS: adottare la regola “testo = comportamento misurabile”, mantenere la
frase aperta e non sostituirla con un interruttore morto. Claude Code,
DeepSeek Harness, Gemini, ChatGPT, OpenClaw e runner locali: `N/A`, perché non
espongono un contratto desktop primario e riproducibile per queste due
preferenze.

## Ledger tecnico

File toccati: **nessuno**. Nessun RED/GREEN di prodotto richiesto; il test
read-only sopra è il gate di caratterizzazione. Rollback: nessuna azione.
La fase è chiusa come **audit/no-op**, non come implementazione delle
preferenze. Se l'owner vorrà davvero quelle preferenze, dovrà aprire una fase
dedicata con stato persistente, comportamento UI e test contrari.
