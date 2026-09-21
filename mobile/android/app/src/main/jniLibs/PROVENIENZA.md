# Provenienza dei binari del ponte ADB

> ⛔⛔ **QUESTI 56 FILE NON LI ABBIAMO SCRITTI NOI.** Stanno dentro un APK
> firmato da Antonino Rizzo, e uno di essi esegue comandi di shell sul
> telefono. La firma dice «questo è mio» — e copre anche loro.
>
> ⇒ **È un debito dichiarato, non una scelta definitiva.** La sostituzione
> con una nostra build da AOSP è il compito **#47**, ed è dovuta **prima di
> qualunque rilascio pubblico**.

## Perché esistono

Da Android 11 il Debug wireless si accoppia con **SPAKE2 + mTLS**. Nessuna
libreria Kotlin lo implementa: `dadb` sa parlare con un demone già
autorizzato, ma **non sa accoppiarsi**. L'unico che sa farlo è `adb` stesso,
e su Android l'unica cartella da cui si può eseguire un programma è quella
delle librerie native — da qui i nomi `lib*.so` per file che librerie non sono.

## ⛔ Il conto vero, misurato e non stimato

`adb` dichiara **sette** librerie non di sistema. Ma quelle librerie hanno le
proprie: `libprotobuf` da sola ne tira dentro **diciassette di Abseil**.
Scoprirle una alla volta lanciando il programma costava un giro di build a
testa; la chiusura transitiva è stata calcolata leggendo le `DT_NEEDED` di
ogni ELF (`scratchpad/chiusura.py`).

> **56 file, 10.942.208 byte (10.4 MB), da 8 pacchetti Termux.**

Pacchetti: `abseil-cpp`, `android-tools`, `brotli`, `libc++`, `liblz4`, `libprotobuf`, `zlib`, `zstd`.

## Cosa spediamo, e con quale impronta

Origine: **Termux**, deposito `termux-main`, architettura `aarch64`. Ogni
pacchetto è stato scaricato e la sua impronta **confrontata con quella
pubblicata nell'indice** prima di estrarne alcunché.

`mobile/tests/unit/device/provenienzaDelPonte.test.ts` **ricalcola l'SHA-256
di ogni file spedito** e lo confronta con questa tabella: sostituire un
binario senza dichiararlo qui fa **fallire i test**. È voluto — la provenienza
non deve poter scadere in silenzio.

| nel nostro APK | pacchetto | byte | SHA-256 del file spedito |
|---|---|---|---|
| `libprotobuf.so` | libprotobuf 2:35.1 | 2.934.280 | `ba1d77cbb059e7534901902faf3854eac36ef5a02b1e5c9bbf6c2caf81fb5598` |
| `libadb.so` | android-tools 36.0.1+really35.0.2 | 2.864.304 | `28c4569e95d5c0f69a64e004ae0e684d64551bf1f86236cf2ffd5235f6eeca16` |
| `libc++_shared.so` | libc++ 29 | 1.374.336 | `e09c2f45cf4cf8ae574f94b6c2650d99ead0d332d5396f6613f062a2d2d73540` |
| `libzstd.so` | zstd 1.5.7-1 | 820.840 | `1677d5e828c1839f111f0261697c08f99a5e4e80434659ab88e5ff859a1374f7` |
| `libbrotlienc.so` | brotli 1.2.0 | 684.864 | `3deebae40d5f1be508d3efbf0980d029264c87fb80f32f6798ed79d530e68969` |
| `liblz4.so` | liblz4 1.10.0-1 | 155.952 | `5a64bf6ff51c260ef5e705206f54ed60c69fac57c440c277221efad179bad176` |
| `libabsl_strings.so` | abseil-cpp 20260526.0 | 154.248 | `b3d82d6a9de70aac9619abed1c2736f99e1de50c22d7aca27ee8caeca475a9f1` |
| `libabsl_time_zone.so` | abseil-cpp 20260526.0 | 139.704 | `374c856b95251ab73623b84a536454cfb71f20770efcc08fbbf14d81e94468ec` |
| `libbrotlicommon.so` | brotli 1.2.0 | 133.120 | `4004b3cfde0710493cd03ce3766bf8fd425a818f5caec50f5fa02ba0e49daff0` |
| `libabsl_str_format_internal.so` | abseil-cpp 20260526.0 | 132.112 | `750f77d2cb3c48db43efeb1062064c106a78870e67085619f062ea240d048473` |
| `libabsl_cord.so` | abseil-cpp 20260526.0 | 111.472 | `6920ad357fb7fe903a6beff7acbb865cedd8f1e4f2f8d6153173fcdd934fa313` |
| `libabsl_time.so` | abseil-cpp 20260526.0 | 93.296 | `f4c4060fb1ab6d8f1ecd05b6232b6c755e0a262655624750caf08b73ca4d026d` |
| `libabsl_synchronization.so` | abseil-cpp 20260526.0 | 85.352 | `f53e409fb6012e60e13f3ee490bfb9105736759fcd890c826bd5f28890cfde4d` |
| `libabsl_cord_internal.so` | abseil-cpp 20260526.0 | 82.232 | `64a52ef6025e3bec1abed0872fafb6468662830e673badfcbd38a027b8037632` |
| `libabsl_log_internal_message.so` | abseil-cpp 20260526.0 | 79.288 | `4cccba6c1a8524f541ab6e578900e358d3f389c0f9f67436247fc34e3be4a140` |
| `libz.so` | zlib 1.3.2 | 72.880 | `c47748ed4b6ca6a2ecd664bab04795f3493956ab1f5cddc4ba0efa737ef3b711` |
| `libabsl_status.so` | abseil-cpp 20260526.0 | 70.640 | `53974dd059e36576d0d1f05637e6122aab2f111d30b86d41d761ce75afef8c8e` |
| `libabsl_log_internal_check_op.so` | abseil-cpp 20260526.0 | 53.440 | `6035a9955a0e1b11441e5746627f9cbb514460d3497da0b00abed736e8ca249c` |
| `libabsl_crc_cord_state.so` | abseil-cpp 20260526.0 | 46.672 | `e0ddf3b197ec1e1091f41faec6155ba227324331ab27f284afe8c301ed64f530` |
| `libabsl_malloc_internal.so` | abseil-cpp 20260526.0 | 45.904 | `b41e81aa541ac01d90a2957ce7f94f428da42c489f6530d9d59b19fb3d94fdea` |
| `libbrotlidec.so` | brotli 1.2.0 | 45.272 | `273f871d28d7e640eb5ee7453529b3eb609fb62601db8f2b4e08513b4701d986` |
| `libabsl_log_internal_log_sink_set.so` | abseil-cpp 20260526.0 | 44.864 | `c35844ee01b97750900be3f919ce05bc7cb3fd36597efb380afce9c6ece8b573` |
| `libabsl_int128.so` | abseil-cpp 20260526.0 | 44.784 | `e54fdc249556a0d7e8c548eeabf5a589e7e1e0a371b9ec3cf66ca96413c65f91` |
| `libabsl_cordz_info.so` | abseil-cpp 20260526.0 | 43.400 | `2303f5c46035a791b621a1938892d0f9fe69a7c2ca17c7f7fd6a4bbd6a9a6ea9` |
| `libabsl_base.so` | abseil-cpp 20260526.0 | 43.392 | `1533237b5434c2d2e0ba5aafca27da85ba3a807bafbc8d1532c48837f1055032` |
| `libabsl_hashtablez_sampler.so` | abseil-cpp 20260526.0 | 43.368 | `629acd752c50c0f0fbdb529e60450943375c2eb1e267ceba33124630779fb37f` |
| `libabsl_statusor.so` | abseil-cpp 20260526.0 | 43.096 | `930e2a0c1952c6fe75ffe611110cc4ce1dc187bffb58ab1f88022f55129035e5` |
| `libabsl_throw_delegate.so` | abseil-cpp 20260526.0 | 41.856 | `040254f4dcc5e052ee5b7d90aa3c3ed8f43593971c6e8627fafafbdfad937ef0` |
| `libabsl_crc_internal.so` | abseil-cpp 20260526.0 | 41.752 | `b57cf2421c6342feeb4db84a9da340ef8540ebba240eb52ae6f0b8015b62d952` |
| `libabsl_log_globals.so` | abseil-cpp 20260526.0 | 41.552 | `9abb91a9665dc13f60c9558d717c92037ec47560bbdf596cd3c0ac67b75b55c1` |
| `libabsl_crc32c.so` | abseil-cpp 20260526.0 | 39.896 | `14907dd4e3cb0f329d94f38a12c6af1461d4c4ea6b19169645ae5a5f38f8a453` |
| `libabsl_cordz_handle.so` | abseil-cpp 20260526.0 | 38.136 | `45b061a133f6b873f288d429b8a1cd1959fbdd17f0d42ca4903e074b9c152f8c` |
| `libabsl_strings_internal.so` | abseil-cpp 20260526.0 | 37.936 | `8bb39582427a4016c1e95ae7f3d1cf9d4c801480603e0b224ff7e8eeb2b08d3b` |
| `libabsl_raw_logging_internal.so` | abseil-cpp 20260526.0 | 36.056 | `7ef46ceecc9bb660adb440eaaa616167a87a20302a86eaa9dc425d7d1822402e` |
| `libabsl_strerror.so` | abseil-cpp 20260526.0 | 34.552 | `6f409882dc0d25cea14a5cd4da9e8bcf98d72eb4019a82616613d50af7dabe74` |
| `libabsl_spinlock_wait.so` | abseil-cpp 20260526.0 | 33.992 | `239c14a713f80ed88507c41d9387279e78e91f92adad55e7d83dee00fdda5b07` |
| `libabsl_raw_hash_set.so` | abseil-cpp 20260526.0 | 28.064 | `c183a7232398b62095d4067f2c763698bea2e47baf278f0e80db4696cc85da3c` |
| `libabsl_kernel_timeout_internal.so` | abseil-cpp 20260526.0 | 9.256 | `ae074bc46135b536bfd5ae3ba7f92758b27550136945453b6b4c26eed66cfcde` |
| `libabsl_log_internal_format.so` | abseil-cpp 20260526.0 | 9.072 | `96cc2ec9e899609b3f5504453d3d9a5a2495135b49e29962a9de5dca4fc5d764` |
| `libutf8_validity.so` | libprotobuf 2:35.1 | 8.960 | `a59af43166fbe4315a98c9285bced389f5f8e532789bf8189d705cb3abe23781` |
| `libabsl_log_internal_globals.so` | abseil-cpp 20260526.0 | 8.576 | `3f43780d8dca38e3641264ac71ef7e50f835ee88f80326fc893ca2508ed17ff7` |
| `libabsl_log_internal_proto.so` | abseil-cpp 20260526.0 | 7.280 | `d1853296ee60fc86eed50984d492566d4fe6bc74a5ca174db3f25bee96591993` |
| `libabsl_exponential_biased.so` | abseil-cpp 20260526.0 | 7.096 | `a59ad67925f97b7302bb8d2f109398d892d15a789026c6df1ad67e2d15417691` |
| `libabsl_log_internal_structured_proto.so` | abseil-cpp 20260526.0 | 7.088 | `c4b0b9ad099e687b8fe05b482dea1092d8e5a2e9e89b211bb3b924d6c09b2df8` |
| `libabsl_examine_stack.so` | abseil-cpp 20260526.0 | 6.960 | `2e8ccb1fbd0cb1223f7d0e6e1346388d41694409dd8f4ddd82bad6de4d654df1` |
| `libabsl_log_internal_conditions.so` | abseil-cpp 20260526.0 | 6.928 | `61e51c28ef69613b591b6bcc1c9b3721a603954091c8a844daa9c71f1228f576` |
| `libabsl_stacktrace.so` | abseil-cpp 20260526.0 | 6.672 | `8aafe70df524107270a831ac9ac7761e931e78bde13630b1cd644ffde685b6a4` |
| `libabsl_city.so` | abseil-cpp 20260526.0 | 6.384 | `ff5fddf70ed4f61d1065c6f91dd57ca48e0d90087f27999bb199aabbe2e72315` |
| `libabsl_hash.so` | abseil-cpp 20260526.0 | 6.360 | `d5cf743a613274cfde26e5a5e4341afafc1cf2a4fe5e61067af87fb1d7894b05` |
| `libabsl_die_if_null.so` | abseil-cpp 20260526.0 | 6.008 | `4ed79f619433af26b3bd73f95ad2dd41559d0ac40bfd5170a0fe3b97e716b4e5` |
| `libabsl_cordz_functions.so` | abseil-cpp 20260526.0 | 5.872 | `ec21d2aad7c36f4f688cac3ad82fc5708483c8410986140bbc536120e0440186` |
| `libabsl_symbolize.so` | abseil-cpp 20260526.0 | 4.896 | `5a1ec3099651c60b2988ebaa0d45f6fea203192542959a9d3296e4d41c3c8184` |
| `libabsl_log_sink.so` | abseil-cpp 20260526.0 | 4.888 | `f4c3674cfb0af6545cb9bd736637c3c42658017500629977a471af3bbcfd94cf` |
| `libabsl_leak_check.so` | abseil-cpp 20260526.0 | 4.712 | `ecf5e58d341c285bfaa42a5620600408ae1466d8a5fd0ed118aa3eec75c1bc6f` |
| `libabsl_tracing_internal.so` | abseil-cpp 20260526.0 | 4.168 | `1541ae2439f8f75d54b420197f502133a90ab4f64ee3727e0ce12b3b5f5e78c2` |
| `libabsl_log_internal_nullguard.so` | abseil-cpp 20260526.0 | 4.128 | `477b1ac1d4cfeac444a13fde2af87e6735d9b8ec5694b55c2eedc01d69cfac1f` |

### E l'impronta del pacchetto da cui viene

Serve a chiunque per rifare la verifica da zero, senza fidarsi di noi.

| pacchetto | .deb | SHA-256 del .deb |
|---|---|---|
| libprotobuf | [libprotobuf_2:35.1_aarch64.deb](https://packages.termux.dev/apt/termux-main/pool/main/libp/libprotobuf/libprotobuf_2:35.1_aarch64.deb) | `a1ba7c7f0e5903a2134662653d3e7b9ffceaa78bdd00e07ac985e2d313ebc738` |
| android-tools | [android-tools_36.0.1+really35.0.2_aarch64.deb](https://packages.termux.dev/apt/termux-main/pool/main/a/android-tools/android-tools_36.0.1+really35.0.2_aarch64.deb) | `82e48bf8038250fb0997b1f2cf5f780730104f2544a5532298c453d94cfe1537` |
| libc++ | [libc++_29_aarch64.deb](https://packages.termux.dev/apt/termux-main/pool/main/libc/libc++/libc++_29_aarch64.deb) | `bb9f12113c137aa0e8513bb51cc49fe77a5ce3ca39ab9e92c57d228ecdf00222` |
| zstd | [zstd_1.5.7-1_aarch64.deb](https://packages.termux.dev/apt/termux-main/pool/main/z/zstd/zstd_1.5.7-1_aarch64.deb) | `e1b4a5113648da8de189620ba1fce74c48b2d0833d9043391b9a1c91fb606fd3` |
| brotli | [brotli_1.2.0_aarch64.deb](https://packages.termux.dev/apt/termux-main/pool/main/b/brotli/brotli_1.2.0_aarch64.deb) | `db1502601d40fb44e6085ad8bfd9311a8b472e98db831ceec9d404c5708bb52c` |
| liblz4 | [liblz4_1.10.0-1_aarch64.deb](https://packages.termux.dev/apt/termux-main/pool/main/libl/liblz4/liblz4_1.10.0-1_aarch64.deb) | `09b9449418d5c2dc4f5c1c140ba8138d56be3e9ae5fd3be3318825ec9f8a0499` |
| abseil-cpp | [abseil-cpp_20260526.0_aarch64.deb](https://packages.termux.dev/apt/termux-main/pool/main/a/abseil-cpp/abseil-cpp_20260526.0_aarch64.deb) | `e489fac652cddc39d9436141e627285f1034a545a06fbb19c420514a419ad877` |
| zlib | [zlib_1.3.2_aarch64.deb](https://packages.termux.dev/apt/termux-main/pool/main/z/zlib/zlib_1.3.2_aarch64.deb) | `75e7d0af17fcc3b40004309fdc00a1ddb9ae08346dce5e269902c34ac3966ac9` |

## ⛔ I tre nomi cambiati, e perché

Android estrae da un APK solo i file di `lib/<abi>/` che si chiamano
`lib*.so`. Tre non lo erano:

| nome vero | spedito come |
|---|---|
| `adb` | `libadb.so` |
| `libz.so.1` | `libz.so` |
| `libzstd.so.1` | `libzstd.so` |

Rinominarli basta per il confezionamento ma non per il caricamento: dentro
`adb` sta scritto che cerca proprio `libz.so.1`. ⇒ A runtime creiamo dei
**collegamenti** col nome vero (`TalosPonteAdb.collegamenti`).

⭐ È la ragione per cui **non tocchiamo un byte dei binari**: le impronte qui
sopra restano identiche a quelle di Termux, e chiunque può verificarlo. Un
collegamento costa meno di una promessa persa.
