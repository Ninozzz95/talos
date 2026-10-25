# Provenienza di `arm64-v8a/libiroh_ffi.so` (controllo remoto)

Il trasporto del controllo remoto telefono ↔ PC: iroh (n0), attraverso il suo FFI ufficiale. Contratto firmato dalle tre
sessioni (`CONTRATTO-FILO-CONTROLLO-REMOTO-2026-10-17.md` §97: «nell'app, iroh-ffi compilato col NDK»); ledger
`.claude/ragionamento/LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`.

## Perché la compiliamo noi

L'AAR pubblicato `computer.iroh:iroh-android:1.1.0` blocca **rustls 0.23.42**, colpito da **RUSTSEC-2026-0285** (CVSS 5,3; corretto
in 0.23.45). Lo stesso sorgente, col solo lock aggiornato, dà una libreria con rustls 0.23.46. Le classi Kotlin (uniffi) restano
quelle del JAR ufficiale `computer.iroh:iroh:1.1.0`: l'interfaccia è identica, cambia solo la dipendenza TLS dentro la `.so`.

## Ricetta (20/10/2026)

- Sorgente: `github.com/n0-computer/iroh-ffi`, tag `v1.1.0` (`5e45109`), clone in `TALOS-RICERCHE/prove/remoto-android-2026-10-17/iroh-ffi`.
- Unica modifica: `cargo update -p rustls` ⇒ rustls 0.23.42 → **0.23.46**, rustls-webpki 0.103.13 → 0.103.16 (il lock originale è
  salvato accanto come `Cargo.lock.v110-originale`).
- Strumenti: Rust (toolchain del lock, compatibile 1.91), NDK 29.0.14206865, linker `aarch64-linux-android26-clang`
  (`minSdk 26`), `cargo build --release --lib --target aarch64-linux-android` (2 min 59 s).
- Spogliata con `llvm-strip --strip-unneeded` dell'NDK.

## Verifiche

| File | Byte | SHA-256 |
|---|---|---|
| `arm64-v8a/libiroh_ffi.so` | 13912784 | `13c53c7deb72b132944521078352ee8e1bdd08d776cbc4281c76cfc0084785dc` |

- Prima della spogliatura: SHA-256 `f5372a72459964b5994e86edef97961191099eee3d5c922eb4bbaf5db85a0de1`.
- `llvm-readelf -l`: tre segmenti LOAD allineati a **0x4000** (pagine da 16 KB, requisito di Google Play).
- `llvm-readelf -d`: dipende solo da `libdl.so`, `libm.so`, `libc.so`.
- Nella libreria compare `rustls-0.23.46` e nessun'altra versione di rustls.

## Licenze

iroh e iroh-ffi: MIT OR Apache-2.0 (n0, Inc.). rustls: Apache-2.0 OR ISC OR MIT. JNA (5.15.0, dal pom di iroh): LGPL-2.1-or-later
OR Apache-2.0, scelta Apache-2.0 (owner 20/10/2026), usata come libreria non modificata. Nelle Note legali: iroh in
`src/lib/legal/nativeComponents.ts`; JNA e le classi Kotlin di iroh nell'elenco di AboutLibraries (`licenzeScelte.ts` per JNA).

## Inizializzazione Android (24/10/2026)

**La `.so` è INVARIATA**: stesso file, stesso SHA-256 `13c53c7deb72b132944521078352ee8e1bdd08d776cbc4281c76cfc0084785dc`, misurato
prima e dopo questa modifica. Cambia solo chi la chiama.

- **Il sintomo** (dal vivo, Pad e PJZ110): a ogni canale remoto `libiroh_ffi.so` stampava
  `panicked at …ndk-context-0.1.1/src/lib.rs:72:30: android context was not initialized`, e ogni tanto un collegamento aspettava il
  tetto di ~30 s.
- **Il perché**: iroh-ffi v1.1.0 (`src/android_init.rs`) vuole il `JavaVM` e il contesto dell'applicazione in `ndk_context` prima di
  qualunque `Endpoint` (il risolutore DNS legge `LinkProperties.getDnsServers()` via JNI). La nostra `.so` esporta già
  `Java_computer_iroh_IrohAndroid_installAndroidContext` (`llvm-nm -D`: `0000000000740cb4 T`), ma la classe Kotlin che la chiama
  sta solo nell'AAR `iroh-android`, che non usiamo (vedi sopra); il JAR `computer.iroh:iroh:1.1.0` non ce l'ha (controllato: 404
  voci, nessuna `IrohAndroid`). Quindi nessuno la chiamava mai.
- **La cura**:
  - `android/app/src/main/java/computer/iroh/IrohAndroid.kt`: copiata **invariata** da `kotlin/android/src/main/kotlin/computer/iroh/IrohAndroid.kt`
    del tag `v1.1.0` (`5e45109`), con in testa provenienza e licenza (MIT OR Apache-2.0, © 2025 N0, INC.). Pacchetto e nome non si
    toccano: sono il nome del simbolo JNI.
  - `ai.talos.remoto.TalosRemotoContestoIroh.prepara(context)`: passa il contesto dell'**applicazione** (mai l'Activity: iroh ne
    tiene un riferimento globale per tutta la vita del processo); ogni errore (`UnsatisfiedLinkError`,
    `ExceptionInInitializerError`) diventa un `Log.w` e il remoto va avanti come prima. Chiamata da `TalosRemotoPlugin.load()` (app
    aperta) e da `TalosSvegliaLavoro.esegui` prima di `apriVerso` (app uccisa: lì non c'è il plugin). Il lato nativo è idempotente.
  - `proguard-rules.pro`: `-keep class computer.iroh.IrohAndroid { native <methods>; }`, accanto a `computer.iroh.**`.
  - Note legali: la voce «iroh (iroh-ffi)» di `src/lib/legal/nativeComponents.ts` copre anche questo file (stesso progetto, licenza,
    fonte).
- **Prove**: `android/app/src/test/java/ai/talos/remoto/TalosRemotoContestoIrohTest.kt` (IRA-01…06). L'effetto sui ~30 s si misura
  sul dispositivo.
