# «hey TALOS» iper preciso — a voce bassa e in ogni lingua

> Ricerca chiesta dall'owner il 2026-08-15: «come rendere infinitamente più
> precisa la rilevazione di hey TALOS in tutte le lingue e in modo che anche con
> un **volume della voce basso**, senza alzare la voce, possa essere iper
> preciso, perché adesso **risponde 2 volte su 10**».

## ⛔ Il numero che cambia il quadro

**2 su 10 = recall reale ~20%.** Il laboratorio ne prometteva 74,8% alla soglia
0,89 e 88,2% a 0,50. ⇒ Fra il set di validazione e la stanza dell'owner si perde
la maggior parte del segnale, e la ricerca dice dove.

## Le quattro cause, in ordine di peso

### 1. ⛔⛔ Il modello non ha MAI sentito una voce bassa

`AugmentationConfig` di `livekit-wakeword` espone **solo**:

```python
clip_duration, batch_size, rounds, background_paths, rir_paths
```

Nessun parametro di **guadagno o volume**. Le clip positive vengono sporcate con
rumore di fondo e riverbero, ma **mai attenuate**: il modello vede solo voce a
volume pieno.

⇒ E i campioni entrano nel mel come **int16 non normalizzati** (documentato in
`PROVENIENZA-PAROLA.md`, ed è giusto: quel modello è stato addestrato così).
Quindi **il volume conta davvero**: una frase detta piano produce uno spettro
più debole di qualunque cosa il classificatore abbia visto.

⇒ È la spiegazione più diretta del «senza alzare la voce non risponde».

### 2. La soglia 0,89 è più alta del necessario

> «openWakeWord models were trained to work well with a **default threshold of
> 0.5**… users are encouraged to determine the best threshold for their
> environment and use-case through testing. For certain deployments, using a
> **lower** threshold in practice may result in **significantly better
> performance**.»

⇒ 0,89 era la soglia «zero falsi positivi» del laboratorio. In stanza costa il
grosso del recall.

### 3. Il VAD permette di abbassare la soglia SENZA pagare in falsi positivi

openWakeWord include un **VAD di Silero** (`vad_threshold`): una attivazione
conta solo se, nello stesso istante, il VAD dice che c'è **voce umana**.

⇒ È la leva che rompe il compromesso: soglia bassa (recall alto) **e** pochi
falsi, perché il rumore che alzerebbe il punteggio non è voce.

### 4. Il guadagno in ingresso (AGC) rende il rilevamento indipendente dal volume

> «Preprocessing includes **gain control**, noise suppression and beamforming…
> gain control helps **normalize audio levels to ensure consistent detection
> regardless of input volume**. This is particularly important for quiet voice.»

⛔ Ma va fatto **con testa**: normalizzare sempre amplifica anche il silenzio, e
un silenzio amplificato produce falsi positivi. Il guadagno si applica solo
quando c'è abbastanza energia, con un tetto.

## Il piano, in ordine di costo

| # | mossa | costo | effetto atteso |
| --- | --- | --- | --- |
| 1 | **Abbassare la soglia** a 0,5 e misurare su 10 tentativi | una riga | recall da ~20% verso 88% |
| 2 | **Guadagno adattivo** prima del mel, con tetto e soglia d'energia | poche righe native | indipendenza dal volume |
| 3 | **VAD** in AND con la parola | integrazione Silero | tiene giù i falsi con la soglia bassa |
| 4 | **Riaddestrare con clip attenuate** (−6, −12, −18 dB) | una notte | il modello impara la voce bassa |

⛔ Il 4 richiede di pre-processare le clip **fuori** dalla libreria, che non
espone il volume fra le augmentation.

## ⛔ E la misura che deve giudicare tutto

Non il set di validazione: **dieci tentativi veri, con la voce dell'owner, a
volume normale e a voce bassa, in italiano e in inglese**, più il verso
contrario (TV accesa, «allora», silenzio). Il numero da battere e' quello che ha
dato lui: **2 su 10**.

## Fonti

- <https://github.com/dscripka/openWakeWord>
- <https://picovoice.ai/blog/complete-guide-to-wake-word/>
- <https://arxiv.org/pdf/2101.12732>
- <https://www.futurebeeai.com/knowledge-hub/wake-word-vs-voice-activity-detection>
