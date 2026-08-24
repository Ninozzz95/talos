# BRIEF alla sessione principale — 0.1.18 (voce personale), stato al 2026-08-22 sera

> Una pagina. Il dettaglio con tutte le misure sta in
> [`.claude/RITORNO-0.1.18.md`](RITORNO-0.1.18.md) (§16 per questo turno);
> questo serve a decidere, non a rileggere.

---

## In una riga

Ramo **`lane/voce-personale`**, **930 commit** avanti a `main`, albero
pulito, **nessun push** (si chiede sempre, non fatto). Un crash reale
riprodotto e chiuso con causa vera, due difetti trovati ispezionando sul
dispositivo (non nel mockup, non richiesti) e chiusi nello stesso turno.

---

## Cosa è chiuso, e con quale prova

| area | esito | prova |
|---|---|---|
| Fase 1-3 (runtime, streaming, arruolamento backend) | ✅ chiuse (turni precedenti) | §1-13 del ritorno |
| Fase 4 (UI wizard su mockup approvato) | ✅ chiusa, **verificata sul Pad passo passo** | screenshot per schermo, §16 |
| Fase 5 (installazione durevole del modello) | ✅ chiusa | download reale riuscito sul Pad, §15.6 |
| **Crash OOM in codifica** | ✅ **chiuso, causa vera trovata** | log diagnostico, encode→salva→CRUD su device |
| **Ripresa cifrata per frase dopo un crash** | ✅ verificata **due volte** su device | force-stop simulato + crash reale |
| Waveform reale (check + wizard) | ✅ | 46 campioni DOM correlati ad audio reale |
| "Select an option" col selettore voce | ✅ trovato e chiuso | `PVOICE-SELECT-01`, verificato con voci reali |
| Dialog wizard intrappolato su tablet | ✅ trovato e chiuso | rect CDP prima/dopo, portrait+landscape |
| Footer avanti/indietro pinnato | ✅ | verificabile solo dopo il fix sopra |

⇒ Tutto ciò che l'owner aveva chiesto in questo giro (prova sul Pad,
screenshot, waveform reale, ripresa, footer, build non-dev) è fatto. I due
difetti UI **non erano richiesti**: sono emersi ispezionando lo schermo
reale durante la verifica del footer, e sono stati chiusi nello stesso
turno per la regola di casa (un difetto trovato dentro una fase non
aspetta un turno successivo).

---

## I tre fatti che contano di più

**1. Il crash non era "poca memoria": era un costo quadratico non
limitato.** `codecEncodeSession.run()` cresce in RSS per tutta la sua
durata (non un picco), coerente con l'auto-attenzione quadratica di un
codec transformer. Concatenare 12 frasi (20-40+ s) sfondava il limite;
disattivare l'arena ONNX (primo tentativo) **abbassava** il picco (5,8 GB
→ 3,5 GB RSS) ma non bastava — riprodotto una seconda volta con la stessa
classificazione `lowmemorykiller`. La cura vera: solo le 4 frasi del
livello "normale" per il riferimento (dentro i 3-10s che MOSS-TTS
raccomanda ufficialmente), più un tetto duro di 12s indipendente. Misurato
sul terzo rebuild: `run()` completa in 5,4s, zero crash.

**2. Un difetto CSS silenzioso che solo il tablet reale mostrava.** Il
dialog del wizard usava `fixed inset-0` per coprire tutto lo schermo — e
lo fa, **tranne quando testato sul vero layout a due pannelli del
tablet** (mai su un `wm size` forzato a misura telefono, che è quello che
ogni sessione precedente aveva usato). Un antenato animato del pannello
impostazioni ha sempre una `transform` risolta, anche a riposo, e questo
intrappola ogni discendente `fixed`. Sarebbe rimasto invisibile finché
qualcuno non avesse aperto il wizard su un tablet vero senza forzare la
risoluzione — esattamente ciò che è successo verificando il footer.

**3. La ripresa cifrata funziona, misurata due volte, non una.** Owner
aveva chiesto esplicitamente che un crash non facesse perdere le frasi già
accettate. Verificato con un force-stop simulato E — per puro caso, mentre
si indagava il crash del punto 1 — con un crash reale: in entrambi i casi
il rilancio salta alla frase giusta, zero re-registrazioni.

---

## Cosa aspetta una decisione

1. **Code review del ramo, poi il push.** Non fatto da questa sessione, come sempre.
2. ⛔ **Le 6 sessioni ONNX si aprono anche solo per codificare.** ~7,5s
   sprecati ogni volta che il percorso serve solo `codecEncodeSession`
   (una delle sei). Non toccato: è un'ottimizzazione, non un difetto —
   nessun crash, nessuna scadenza dichiarata dall'owner su questo.
3. **Rilievo 1** (censimento tool/ricerca web per modello, §14.5) — il più
   grande dei sei rilievi del 22/8, non ancora iniziato, probabile blocco
   a sé.
4. Il test JVM con server HTTP locale per `resolveOn()` (§15.6) — la
   prova che c'è oggi è solo quella reale contro `huggingface.co`.

---

## Le trappole di questo dominio, per chi riprende

1. **`fixed inset-0` non basta da solo dentro pannelli animati.** Ogni
   nuovo dialog a schermo intero montato sotto `TalosMobileSettingsCenter`
   (o qualunque pannello con `.talos-motion-tab-panel`) va verificato **sul
   tablet reale, senza `wm size` forzato** — un telefono o un tablet
   ridimensionato a misura telefono non mostra il difetto.
2. **Un `VueWrapper`/riferimento a componente catturato prima di una
   mutazione reattiva diventa stantio con lo stub `teleport: true`.**
   Interrogare il DOM fresco a ogni controllo, mai riusare una variabile
   catturata a inizio test — vale per ogni test futuro su un componente
   teleportato.
3. **Un fix di memoria "che abbassa il picco" non è un fix.** Verificarlo
   riproducendo di nuovo con lo stesso scenario, non fidarsi che un numero
   più basso significhi sicuro — qui ha richiesto una seconda
   riproduzione reale per scoprire che non bastava.

---

## Dove stanno le cose

```
lane/voce-personale                      930 commit avanti a main, nessun push
.claude/RITORNO-0.1.18.md                il dettaglio, §16 per questo turno
```

**Sul Pad** (`2ea6573c`, `ai.talos` — non `.dev`): app installata da zero
con l'ultimo APK (`9876d2a2`), motore voce installato, un profilo di prova
creato/rinominato/eliminato durante la verifica CRUD. Nessun profilo voce
resta attivo a fine turno (eliminato durante la prova).
