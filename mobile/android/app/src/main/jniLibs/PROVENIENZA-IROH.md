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
