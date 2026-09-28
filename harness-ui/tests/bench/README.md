# `tests/bench/` — banchi di misura, non test

I file qui dentro **non entrano in `node --test`**: si lanciano a mano, producono numeri e li scrivono in JSON.
Un banco non ha un verde o un rosso; ha una **baseline** che una cura successiva deve battere, con lo stesso comando.

Regole di casa (24/09/2026):
- TEMP privata (`TEMP=… TMP=…`) e **lucchetto RAM** se sulla macchina girano altri agenti (una corsa pesante alla volta).
- Zero residui: ogni banco cancella ciò che genera, anche se fallisce.
- Ogni numero nel rapporto porta il comando che l'ha prodotto; **tre giri, mediana**.

## `sessione-lunga-journal.mjs` — il banco dei 1.000 turni (F2, J4; F2-bis, il secondo formato)

Genera un journal di sessione **sintetico** in uno dei due formati e misura, in un processo figlio fresco per ogni
giro: byte del file, ms di generazione, ms del **replay a stream** (`leggiRegistroAStream` + un consumatore che
tiene solo l'ultimo checkpoint e i delta dopo), messaggi ricostruiti e coerenza dei `da`, ms di `leggiRegistro`
(l'array intero — saltata sopra `--tetto-array-mb`, default 600, e lo dice), picco di RSS per fase.

- `--formato oggi` — eventi AG-UI del giro + `messaggi-finali` + `tempi-giro` + `checkpoint-ripresa`: la storia
  intera riscritta due volte a turno, ~11 KB in più a turno. **Quadratico**: ha un tetto in byte (`--tetto-mb`,
  default 2048) e quando lo tocca dice a quale turno si è fermato invece di fingere.
- `--formato delta` (default) — eventi + `messaggi-delta { versioneGiro, da, messaggi }` coi soli messaggi nuovi +
  `tempi-giro`, e un `checkpoint { versioneGiro, storia, recordCompattazione }` ogni `--checkpoint-ogni` giri
  (default 20; 0 = mai) o, con `--regola-dimensione 1` (default), quando i byte dei delta dal checkpoint superano
  la taglia del checkpoint. ⛔ La politica vera la decide il registro (corsia B): qui è un parametro.

```
cd harness-ui
TEMP=<privata> TMP=<privata> node tests/bench/sessione-lunga-journal.mjs --formato delta --turni 100,300,1000 --giri 3 --out <file.json>
TEMP=<privata> TMP=<privata> node tests/bench/sessione-lunga-journal.mjs --formato oggi  --turni 100,300,1000 --giri 3 --out <file.json>
```

La baseline del formato di oggi (24/09/2026) e i muri trovati (stringa V8 a ~512 MiB, `readFile` > 2 GiB) stanno
nel rapporto della corsia F2-STORE; le misure del secondo formato e del replay a stream nel rapporto F2-bis/A.
