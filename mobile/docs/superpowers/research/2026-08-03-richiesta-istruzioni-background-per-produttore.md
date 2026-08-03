# Richiesta di ricerca — i passi «non farmi uccidere» per produttore

**Data:** 2026-08-03
**Perché:** la fase 1 è chiusa, ma `talosBackgroundExtraSteps()` copre **solo
ColorOS**. Il budget di ricerca web era esaurito (200/200) e una lista inventata
manderebbe l'utente a cercare voci che sul suo telefono non esistono — il modo
più veloce per fargli credere di aver sbagliato lui.
**Chi la usa:** `src/lib/permissions/permissionRows.ts`.

---

## 0. Il problema in una riga

L'esenzione dal risparmio energetico è standard Android e si ottiene con un
intent. **Su molte interfacce non basta**: restano voci del produttore — avvio
automatico, «ottimizzazioni» proprietarie, blocco nei recenti — che stanno in
menu **senza intent pubblico**. Senza quelle, il sistema ricongela l'app.

Misurato su ColorOS: il foreground service `dataSync` è dichiarato e attivo e
**non basta**; una Deep Research muore 3 volte su 3.

---

## 1. Che cosa serve, esattamente

Per **ogni produttore**, una lista **ordinata** di passi, dove ogni passo è una
frase sola che nomina il percorso **con le parole che la persona vede sullo
schermo**, in **italiano e in inglese**.

Formato di consegna (è già la forma che il codice vuole):

```
oneplus | oppo | realme   → ColorOS
  1. Impostazioni → App → Avvio automatico: attivalo per TALOS.
  2. Impostazioni → Batteria → Ottimizzazione batteria → ⋮ → Avanzate:
     disattiva «Ottimizzazione profonda» e «Ottimizzazione standby».
  3. Nei recenti, tieni premuta la scheda di TALOS e tocca il lucchetto.
```

**Da coprire, in ordine di diffusione:**

| `Build.MANUFACTURER` | Interfaccia | Stato |
|---|---|---|
| `oneplus`, `oppo`, `realme` | ColorOS / OxygenOS | ✅ fatto |
| `xiaomi`, `redmi`, `poco` | MIUI / HyperOS | ❌ **il peggiore, prioritario** |
| `samsung` | One UI | ❌ |
| `huawei`, `honor` | EMUI / MagicOS | ❌ |
| `vivo`, `iqoo` | Funtouch / OriginOS | ❌ |
| `motorola`, `nothing`, `asus`, `sony` | quasi-stock | ❌ (forse nulla da dire) |

---

## 2. Le tre domande a cui la ricerca deve rispondere

### a) I passi, con le parole vere

Fonte canonica: **dontkillmyapp.com**, una pagina per produttore. Da incrociare
con la documentazione ufficiale del produttore dove esiste.

**Vincolo:** i nomi dei menu vanno presi dall'interfaccia **localizzata**, non
tradotti da noi. Un percorso tradotto a orecchio è un percorso che la persona
non trova.

### b) `Build.MANUFACTURER` basta a distinguerli?

Sospetto concreto: **POCO e Redmi riportano `Xiaomi`**, e i percorsi MIUI
cambiano fra versioni (MIUI 13 / 14 / HyperOS hanno menu diversi). Se è così,
servono anche:

- la versione della ROM — `ro.miui.ui.version.name`, `ro.build.version.emui`,
  `ro.vivo.os.version` e simili;
- oppure passi scritti in modo da valere su più versioni.

**Questa è la domanda che può cambiare la firma della funzione**, quindi va
risposta prima di scrivere le liste.

### c) Esiste un intent pubblico per qualcuna di quelle voci?

Quasi certamente no, e la risposta attesa è «no». Ma se per qualche produttore
esistesse un'azione documentata e stabile, quel produttore avrebbe un pulsante
invece di tre righe di istruzioni.

**Se la risposta è no, resta la regola già presa:** niente componenti OEM
cablati. Cambiano fra versioni, e un collegamento che atterra sulla schermata
sbagliata — o che lancia un'eccezione — è peggio di una frase che dice dove
andare.

---

## 3. Come si verifica

In ordine di forza:

1. **Su un dispositivo di quella marca**, seguendo i passi alla lettera.
2. Documentazione ufficiale del produttore.
3. dontkillmyapp + una seconda fonte concordante.

Quello che **non** conta come verifica: un post di forum solo, o una risposta di
un modello. Se un produttore resta senza fonte, **si lascia vuoto**: la funzione
già restituisce una lista vuota e la pagina semplicemente non mostra la sezione.

---

## 4. Il fatto già trovato che vale per tutti

Dalla documentazione OnePlus: **«OnePlus randomly reverts Battery Optimization
settings, requiring users to periodically re-verify»**.

Per questo TALOS rilegge lo stato a ogni ritorno in primo piano invece di
ricordarlo. Se la stessa cosa vale per altri produttori, va annotato: potrebbe
giustificare un avviso quando l'esenzione **sparisce** dopo essere stata
concessa — cioè un one-up rispetto a chiunque chieda una volta sola
all'installazione.

---

## 5. Dove finisce il risultato

1. `talosBackgroundExtraSteps()` in `src/lib/permissions/permissionRows.ts` —
   restituisce **chiavi i18n**, mai frasi (difetto già commesso e corretto: le
   frasi scritte nel modulo comparivano in inglese dentro l'app in italiano).
2. Le frasi in `privacyPermissions.makerSteps.*` di `it.ts` e `en.ts`.
3. Un test per produttore in `tests/unit/settings/permissionRows.test.ts`.
