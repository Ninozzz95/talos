# Provenienza di Node e delle sue librerie (`arm64-v8a/libtalos*.so`)

Node 24.18.0 e le sue nove librerie vengono dai pacchetti **Termux** (`aarch64`). Fino al 14/10/2026 stavano in
`assets/talos-node-lib/` coi nomi originali, ed erano copiati in `files/talos-node-staging` e trovati con `LD_LIBRARY_PATH`.

## Che cosa è cambiato il 14/10/2026 (K2-A)

Ledger: `.claude/ragionamento/LEDGER-K2A-NODE-AUTOSUFFICIENTE-2026-10-14.md`. Decisioni dell'owner: «Ritocco al build» e
«Una copia sola».

Ogni file è stato ritoccato **solo nella sezione dinamica**; il codice non cambia:
- `DT_RUNPATH` da `/data/data/com.termux/files/usr/lib` a `$ORIGIN`. Il linker di Android cerca lì dall'API 24, nella cartella
  del file stesso. `DT_RPATH` invece lo ignora.
- I `DT_NEEDED` e il `DT_SONAME` rinominati in `libtalos*.so`. L'APK estrae solo i file `lib*.so`, e il prefisso evita lo
  scontro con le altre librerie native (adb ha un suo `libz.so`).

Perché: il server r4 filtra l'ambiente dei processi figli, e il `node` figlio perdeva `LD_LIBRARY_PATH` («CANNOT LINK
EXECUTABLE … libz.so.1»). Ora Node trova le sue librerie da sé, ovunque lo si lanci: in casa, dal ponte, come figlio.

## Strumento e riproducibilità

- **patchelf 0.18.0**, rilascio ufficiale NixOS `patchelf-0.18.0-x86_64.tar.gz`, sha256
  `ce84f2447fb7a8679e58bc54a20dc2b01b37b5802e12c57eece772a6f14bf3f0` (GitHub non pubblica un'impronta per quel rilascio).
  Si usa solo per costruire; non viaggia nell'APK.
- Script: `scripts/node-nativo/ritocca-node.sh`, da lanciare in Linux/WSL. Prima controlla gli sha256 degli originali, poi
  quelli del risultato, contro `scripts/node-nativo/node-nativo.json`: un byte diverso ferma tutto.
- Verifica in CI: `scripts/node-nativo/node-nativo.test.mjs` (dentro `npm run test:scripts`). Rilegge gli sha, il `DT_RUNPATH`,
  l'assenza di `DT_RPATH` e le dipendenze ammesse.
- AGP non li «strippa» (`keepDebugSymbols` in `build.gradle`): escono byte per byte come nel manifesto.

## File, nome di prima e impronte

| Nuovo | Di prima | sha256 di prima | sha256 di ora |
|---|---|---|---|
| `libtalosnode.so` | `talos-node-bin` | `1ee21eebda8ba05919050fe0d2b84b773a5cb2d2d1a42a27bddfb5eaa1ee182e` | `cd51bbdf827f69c5570fef2d46eebeaf6a997dd914235dbe3c73338bef2d1de9` |
| `libtalosz.so` | `libz.so.1` | `c47748ed4b6ca6a2ecd664bab04795f3493956ab1f5cddc4ba0efa737ef3b711` | `583a0ab3b4295bef60e4f0f7731b836e57563cc69df0f5eea4191a8dec679942` |
| `libtaloscares.so` | `libcares.so` | `68733ce8d4bb1bdc87d8ec550c58c70f3dcdb0f8c48d86b83235f536cb736e83` | `139cd12d528fdef1f49325b94c06d947f1b56ae62fa7e10b57afae2377273c0a` |
| `libtalossqlite3.so` | `libsqlite3.so` | `2305d0c8f90757fef4be25314f69a7ad412a970a1ca4fba7ba85bbbf4a37708a` | `85f663902e871fe3268e6424249bc94ce965d6fed222049978dbd8f4bfd5dc9e` |
| `libtaloscrypto.so` | `libcrypto.so.3` | `4122f5c95088f11a43c14e49e257cc1ce700960e855840cf9b9f39a8acbcd7e8` | `7bb614ae945b7b8eaab0289afb67072386f3b633e0cf0488e58808917f5a84b2` |
| `libtalosssl.so` | `libssl.so.3` | `9bf626fadf689237cf641bf1108057f0cc87c587c17fbdeaa16bd4a12807d7ce` | `5d664455684db142334dc47ed7e7449b6984c4f9c1cabbb445f2a557bcd7f5a9` |
| `libtalosicudata.so` | `libicudata.so.78` | `71a7479056941b610589f82698cdfb220c169dce9bc7c78ef6a6e74d07b1e8fd` | `3115212df01bebe0295a6013e89e191c2033ccfa2f7e7a606a684eba843653ee` |
| `libtalosicui18n.so` | `libicui18n.so.78` | `3140b2b28d16a6486a65663f1c47a94a4bb0d9def51612f8e941414bd50c7a0e` | `d8b4e98133d4dbb5996f05c1066870c0c65f57f24724b482e0504a4435cbce0e` |
| `libtalosicuuc.so` | `libicuuc.so.78` | `91bcef1faba58b755d4870aaea95814d1753961fd72365c4701cfd4461e3584c` | `0cabcbc68b8514750b50e0d88cf7ad63310b0c1b0c3dc25a319a7f0f30053f3e` |
| `libtaloscxx.so` | `libc++_shared.so` | `e09c2f45cf4cf8ae574f94b6c2650d99ead0d332d5396f6613f062a2d2d73540` | `f0dbcb5c2ebeed8b8beb5da3dad6fd32c134ad35d798b2e24dc0368e91020750` |

Le licenze dei componenti sono quelle di `src/lib/legal/nativeComponents.ts` (Node MIT, OpenSSL Apache-2.0, ICU Unicode-3.0,
SQLite pubblico dominio, c-ares MIT, zlib Zlib, LLVM libc++ Apache-2.0 WITH LLVM-exception). Il ritocco è una modifica e lo
dichiariamo qui.

## Prova sul telefono

Il 14/10/2026, sul Pad (Android, arm64), in `/data/local/tmp/k2node` con `env -i PATH=/system/bin`, quindi senza
`LD_LIBRARY_PATH`, rispondono tutti: Node 24.18.0, OpenSSL 3.6.3, zlib, ICU (`it-IT` → «gennaio»), SQLite 3.53.4 e c-ares
1.34.8.
