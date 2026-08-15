# La navigazione dinamica universale — piano di implementazione

> Owner 2026-08-15: «dobbiamo rendere più robusta possibile la navigazione con
> TALOS. Per esempio, se io voglio chiedere a TALOS mentre sono su WhatsApp di
> **cliccare sul primo contatto**, oppure di fare cose in maniera dinamica, per
> esempio **cliccare sul pulsante sticker, inviare uno sticker**. Lui deve fare
> in maniera dinamica e automatica **per ogni applicazione**… ingegnerizzando
> un'infrastruttura altamente tecnica».

---

## 0. Che cosa abbiamo già, misurato nel codice

| pezzo | cosa fa oggi |
| --- | --- |
| `TalosOcchio.guarda()` | elenco **piatto** di elementi: `indice, tipo, etichetta, attivo` |
| `TalosOcchio.esegui()` | **tre** azioni: `tocca`, `scrivi`, `scorri` |
| `TalosSchermoPlugin.premiPulsante()` | il caso speciale dell'invio, con verifica |
| `TalosObiettivoFinito` | dice se un'azione è **riuscita** — tre prove indipendenti |
| `pilotaDelloSchermo.ts` + `corsaDelloSchermo.ts` | il ciclo guarda → decidi → agisci |

⇒ La macchina c'è. Quello che manca è **quanto vede** e **quanto sa fare**.

---

## 1. Che cosa dice lo stato dell'arte — e dove si ferma

Ricerca del 2026-08-15 su GUI-Owl / Mobile-Agent-v3 (arXiv 2508.15144),
AndroidWorld, MobiBench, AndroidControl-Curated.

### ⭐ Il risultato che conta più di tutti

> *«Headline scores climb fastest when better **grounding** methods (Set-of-Mark,
> ScreenAI, UI-Net) ship rather than when language models get better.»*

⇒ **Il grounding conta più del modello.** È la stessa tesi dell'owner sugli
harness, confermata da chi misura i benchmark: si guadagna più migliorando *come
l'agente vede lo schermo* che cambiando il cervello.

### Quello che fanno, e noi no

1. **Bounding box per ogni elemento.** AndroidWorld dà all'agente *screenshot +
   accessibility tree a ogni passo*; noi diamo solo l'albero, senza coordinate.
2. **Vocabolario di dieci azioni** (GUI-Owl, Tabella 9):
   `key, click, long_press, swipe, type, answer, system_button, open, wait,
   terminate`. Noi ne abbiamo **tre**.
3. **Descrizioni funzionali** generate da un MLLM sugli elementi.

### ⛔ E dove lo stato dell'arte SI FERMA — la nostra occasione

Interrogato esplicitamente sui due casi che l'owner ha nominato, il paper di
GUI-Owl risponde:

> *«The document does not address ordinal references ("first contact") or
> icon-button grounding strategies.»*

⇒ **«Il primo contatto» e «il pulsante sticker» sono problemi aperti.** Non è
una lacuna nostra da colmare: è terreno dove si può arrivare primi.

---

## 2. Il piano, in tre livelli

### Livello 1 — VEDERE MEGLIO (grounding)

`Elemento` passa da 4 campi a una descrizione ricca. Ogni campo qui ha una
ragione d'uso, non è completismo:

| campo | a cosa serve |
| --- | --- |
| `riquadro` (l→t→r→b) | posizione e dimensione: «in alto a destra», «il più grande» |
| `identificativo` (`resource-id`) | ⭐ **la miniera**: `emoji_picker_btn`, `send`, `sticker` |
| `classe` | `RecyclerView` = lista, `EditText` = campo, `ImageButton` = icona |
| `descrizione` (`contentDescription`) | ciò che l'app dichiara per i non vedenti |
| `posizioneNelGenitore` | ⭐ **risolve gli ordinali**: figlio 0 = «il primo» |
| `dentroUnaLista` | dice se «primo/ultimo» ha senso in quel punto |
| `scorribile`, `modificabile`, `selezionato` | le affordance vere, non dedotte |

⛔ **Il costo va misurato**: più campi = più token per passo, e il ciclo
dell'agente ne fa molti. Si misura il peso PRIMA di consegnare, come per gli
schemi dei tool (`pesoDegliSchemi.test.ts`).

### Livello 2 — FARE DI PIÙ (vocabolario)

Da tre azioni a nove, allineate a GUI-Owl ma con i nomi della casa:

```
tocca          ACTION_CLICK                      (c'è)
premiALungo    ACTION_LONG_CLICK                 ← per i menu contestuali
scrivi         ACTION_SET_TEXT                   (c'è)
scorri         ACTION_SCROLL_FORWARD/BACKWARD    (c'è, solo avanti)
trascina       gesto, per i cursori e il riordino
tastoDiSistema GLOBAL_ACTION_BACK/HOME/RECENTS   ← già possibile, mai esposto
apri           lancio diretto di un'app
aspetta        per le schermate che caricano
smetti         la resa esplicita, invece di girare a vuoto
```

⛔ `smetti` non è burocrazia: un agente che non può dichiarare di essere bloccato
continua a provare, ed è come nascono i venti passi che l'owner ha già visto.

### Livello 3 — CAPIRE MEGLIO (la parte che lo stato dell'arte non ha)

**a) Gli ordinali — «il primo contatto»**

Si risolvono con `posizioneNelGenitore` + `dentroUnaLista`. Quando la persona
dice «il primo X», l'agente cerca il contenitore scorribile e prende il figlio
con posizione minima **fra quelli visibili**.

⛔ «Il primo» significa «il primo che VEDO», non «il primo del dataset»: una
lista scorrevole ha elementi fuori schermo, e prenderli sarebbe sbagliato in un
modo che nessuno nota finché non apre la chat sbagliata.

**b) Le icone senza testo — «il pulsante sticker»**

### ⭐⭐⭐ MISURATO sul Pad, 5 app, 115 pulsanti — ed è il numero che decide

La prima misura ha detto **4%**, e concludeva che questa strada non esisteva.
Era una risposta alla domanda sbagliata. Guardando l'XML grezzo:

```xml
<node clickable="true"  resource-id=""            class="LinearLayout" text="">
  <node clickable="false" resource-id="…:id/title" text="Wi-Fi">
```

⇒ **In Android il nodo cliccabile è quasi sempre un contenitore nudo**, e il
nome sta nei FIGLI. Chiedere l'id al contenitore è come chiedere il titolo alla
copertina invece che al frontespizio.

Rifatta la misura sul **sottoalbero**:

| app | cliccabili | muti | nome nel sottoalbero | ancora muti |
| --- | --- | --- | --- | --- |
| Impostazioni | 18 | 10 | **10** | 0 |
| WhatsApp | 26 | 6 | **6** | 0 |
| Spotify | 26 | 6 | **6** | 0 |
| Maps | 19 | 6 | **5** | 1 |
| Files | 26 | 10 | **9** | 1 |
| **totale** | **115** | 38 | **36 → 95%** | **2** |

⇒ **Il 95% dei pulsanti muti ha il nome a un passo di distanza.** Due su 115
restano ciechi. E vale su cinque app diverse, quindi non è un caso WhatsApp.

### Le tre strade, nell'ordine che la misura ha stabilito

1. **Il sottoalbero** — testo, `contentDescription` o `resource-id` semantico di
   un discendente. Copre il 95%, costa zero giri in più, e non ha nulla di
   scritto a mano.
2. `contentDescription` **del nodo stesso** — quando c'è, è la più affidabile;
   ma sui pulsanti-icona spesso non c'è, ed è proprio il caso difficile.
3. **Lo screenshot ritagliato sul riquadro** — l'ultima strada, per i 2 casi su
   115. Costa un giro col modello visivo, e si paga solo quando serve davvero.

⛔ La prima misura sbagliata è stata tenuta qui invece che cancellata: è la
stessa forma di errore della scala dell'audio dello stesso giorno — un numero
plausibile, ottenuto interrogando il posto sbagliato, che avrebbe fatto
progettare la cosa costosa (lo screenshot) al posto di quella gratis.

⛔ Nessuna delle tre è un elenco scritto a mano per WhatsApp. È la regola
[[nothing-hardcoded-must-adapt]]: si chiede al telefono.

**c) La corrispondenza fra la parola e l'elemento**

«sticker» deve trovare `sticker_btn`, `stickerPicker`, «Adesivi», «Sticker».
Serve una corrispondenza tollerante: minuscole, senza accenti, sottostringa,
e la sinonimia italiano↔inglese per le parole d'interfaccia più comuni.

⛔ E quando due elementi combaciano allo stesso modo, **non si sceglie**: si
chiede alla persona quale. Un agente che indovina fra due pulsanti è un agente
che un giorno preme quello sbagliato.

---

## 3. Come si prova che funziona

⛔ Non «su WhatsApp funziona». Il vincolo dell'owner è **per ogni applicazione**,
quindi la prova è a matrice:

| app | prova |
| --- | --- |
| WhatsApp | il primo contatto, il pulsante sticker, l'invio |
| Telegram | le stesse tre, per provare che non abbiamo scritto WhatsApp |
| Impostazioni | una lista lunga, per gli ordinali e lo scorrimento |
| Spotify | icone senza testo, per la strada del `resource-id` |
| Maps | una schermata quasi tutta grafica, per la strada dello screenshot |

E il **verso contrario**, sempre: chiedere una cosa che a schermo non c'è, e
pretendere che TALOS lo dica invece di premere qualcosa di simile.

---

## 4. ✅ La misura che doveva decidere il piano — FATTA

Era: «se il `resource-id` non è semantico, lo screenshot ritagliato diventa la
prima strada invece dell'ultima». Misurata sul Pad su 5 app e 115 pulsanti
cliccabili (§3b):

⇒ **95% dei pulsanti muti ha il nome nel sottoalbero.** Lo screenshot resta
l'ultima strada, per 2 casi su 115. Il Livello 3b è deciso, e costa zero giri in
più nel caso normale.

⛔ Resta da misurare, quando si implementa: **il peso in token** dell'elemento
arricchito. Il ciclo dell'agente fa molti passi, e ogni campo si paga a ognuno.

---

## 5. L'ordine di lavoro

1. ~~La misura del §4~~ — **fatta**: 95%, il sottoalbero è la strada.
2. **Livello 1** (vedere meglio) — è il moltiplicatore, lo dice la ricerca.
3. **Livello 2** (vocabolario) — meccanico, e sblocca i menu contestuali.
4. **Livello 3** (ordinali e icone) — dove si arriva primi.
5. La matrice di prova del §3, su cinque app, nei due versi.
