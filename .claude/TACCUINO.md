# Taccuino — i fatti MISURATI, che non vanno ri-dedotti

> Non è un diario. Solo ciò che è costato una misura vera e che un riassunto
> non ricostruisce. Una riga per fatto, col numero dentro.

## 2026-08-08 — motore locale
- GBNF per 46 tool = **55.871 byte**; il parser rifiuta con *«number of rules
  that are going to be repeated multiplied by the new repetition exceeds sane
  defaults»*. Causa: `maxLength` dei nostri `z.string().max(N)`.
- `stderr` su Android **non va da nessuna parte**: llama.cpp ci scrive le
  diagnosi. Senza la pipe verso logcat non si vede niente.
- ⛔ REGRESSIONE APERTA: con la grammatica applicata il tool **non parte più**, e
  il modello risponde «Fatto, torcia spenta» lo stesso. Nessuna scheda di
  consenso, nessun evento in `dumpsys media.camera`. Grammatica **pigra, 1 solo
  innesco** — è la prima cosa da guardare.
- Prefisso congelato: **9.282 token riusati su 9.498**, 216 nuovi per messaggio.
  ⇒ accorciare il prompt di sistema NON è la leva.
- Generazione ~4 tok/s, **5-14% della banda del chip**: la leva è lì.

## 2026-08-08 — telefono e permessi
- Il Pad **non ha il motore della vibrazione**: `no-vibrator` è un esito vero.
- La torcia si verifica con `dumpsys media.camera | grep "torch for camera"`:
  elenca ogni **cambio di stato** con ora e PID. Chiamare «accendi» su una
  torcia già accesa NON lascia traccia.
- Lo sfondo si verifica con `dumpsys wallpaper | grep "id:"` (37 → 38).
- `KEEP_SCREEN_ON` si verifica in `dumpsys window` sulla finestra di TALOS.
- Le chiavi dei provider stanno in `WSSecureStorageSharedPreferences.xml`,
  **non** in `CapacitorStorage.xml`.
- Libreria: **4 righe, 3 file su disco** — `button_a.png` non ha il file.

## 2026-08-08 — il telecomando
- `adb shell input text` si rompe sugli **apostrofi** («no closing quote»).
- Una chiave lunga non entra in un colpo: pezzi da ~18 caratteri con pausa.
- Il tocco parte prima che lo scorrimento si fermi: `find` → **pausa** → `tap`.
- Il chip del modello nel compositore compare **col fuoco sul campo**: è lo
  stato compatto voluto dall'owner, non un difetto.
