# Local inference backend research — how to reproduce it

> ⛔ **Research only.** Nothing here changes what the app does for a person.
> `nativeOpen` remains the production path and passes empty requests; the code
> in this folder is not reachable from the UI.

The brief's Definition of Done asks for one thing, and it is strict: that a
third party can take the repository SHA, the engine SHA, the build command, the
model identity, the device and driver identity, and **reproduce the conclusion
without trusting a summary**. This page is that path.

---

## ⛔⛔ The rule that comes before all the others

**Do not use `./gradlew connectedAndroidTest`.**

Measured on 2026-08-20: that task installs the app and test APKs, runs, and then
**uninstalls both**. The app's private directory goes with it — data, keys, and
every GGUF stored inside — and so does the artifact the test just wrote. The
task stays **green**: "Finished 2 tests", and nothing is left on the phone.

⇒ Use `run-device-tests.mjs`, which does the two steps Gradle hides and not the
third: install in place (`adb install -r`), run with `am instrument`, pull the
artifacts, and **never uninstall**.

---

## 1. Build

Building installs nothing:

```bash
cd mobile
npm run build && npx cap copy android      # ⛔ without `cap copy` the APK carries the PREVIOUS web build
cd android
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
```

## 2. Put a model on the phone

⛔ **Order matters here, and it is not symmetric.** A directory created by adb
belongs to `shell` with mode 0770; the app is a different uid and **cannot
traverse it**. A GGUF pushed there is on disk, with the right hash, and
invisible to whatever has to open it.

⇒ The directory is created by **the app**, and only then pushed into:

```bash
cd mobile
node scripts/research/run-device-tests.mjs \
    'ai.talos.TalosResearchFixtureDeviceTest#preparaLaCartellaDeiModelli' \
    talosFixtureDir=local/RepoName

adb push model.gguf \
    /storage/emulated/0/Android/data/ai.talos/files/models/local/RepoName/model.gguf
```

Then verify **through the app's own eyes**, never with `adb shell ls` — those
two questions have already given two different answers:

```bash
node scripts/research/run-device-tests.mjs \
    'ai.talos.TalosResearchFixtureDeviceTest#elencaCioCheLAppVede'
adb logcat -d -s TalosResearchFixture
```

## 3. Measure

```bash
cd mobile

# the backends and the devices each one exposes
node scripts/research/run-device-tests.mjs ai.talos.TalosBackendQualificationDeviceTest

# explicit targeting, in both directions
node scripts/research/run-device-tests.mjs ai.talos.TalosBackendTargetingDeviceTest

# the grammar of the protocol — ⛔ BEFORE the benchmarks, not after
node scripts/research/run-device-tests.mjs ai.talos.TalosSemanticGoldenDeviceTest

# the C0 floor: load, PP/TG/TTFT, Stop in both phases
node scripts/research/run-device-tests.mjs ai.talos.TalosLocalBaselineDeviceTest \
    --fresh talosRuns=9 talosStopRuns=9
```

⛔ `--fresh` clears the artifacts **on the phone** before starting. It is not
the default: deleting measurements is destructive, and a run that discards them
unasked is worse than an untidy file — untidiness is visible, lost measurements
are not. Without it, two campaigns land in the same set and the resulting spread
describes neither of them.

### The knobs

| argument | default | what it changes |
|---|---:|---|
| `talosRuns` | 5 | measured runs per configuration (⛔ the brief asks for 9 when spread exceeds 10%) |
| `talosStopRuns` | 5 | runs for the Stop measurements |
| `talosThreads` | 4 | generation and prefill threads |
| `talosContext` | 8192 | requested context |
| `talosStopAfterMs` | 1500 | how long to wait before Stop during prefill |
| `talosStopAfterTokens` | 16 | how many tokens before Stop during decode |
| `talosModelPath` | — | the exact GGUF, instead of the first one found |

## 4. Read

```bash
node scripts/research/analyze-local-backend-matrix.mjs
node scripts/research/analyze-local-backend-matrix.mjs --json
```

Median and MAD rather than mean and standard deviation: on a phone the noise is
rare and large — another app, the thermal governor, a core migration — which is
exactly what moves a mean and leaves a median still.

⛔ The analyser **reports, it does not decide**. It flags and leaves the call to
whoever is measuring:

- spread over 10% → the brief asks for nine runs;
- `reusedTokens` above zero → the prefix helped, and the comparison is false in
  a way that only looks like better numbers;
- thermal state changing inside a set → two different phones;
- mixed engine builds in one set, and the time span of the runs.

## 5. Where the evidence lands

On the phone, under the app's private directory:

```
/storage/emulated/0/Android/data/ai.talos/files/research/local-backend/
    backend-inventory.json   the inventory, as the engine sees it
    manifest.json            engineBuild, driver, Android build, model
    runs.jsonl               one line per run — ⛔ never medians alone
    golden.jsonl             the semantic suite's lines
```

The runner pulls them to `mobile/.tmp-research/local-backend/`, which is
deliberately **outside git's index**: they describe the owner's device, and that
rule is not worked around.

---

## What is NOT covered today

Stated rather than implied:

- **PP8192** — with a 8192-token context the prudent ceiling is half of it. A
  run with a wider context is needed.
- **OpenCL and Vulkan** — no build enables them yet. That needs
  `GGML_OPENCL=ON` / `GGML_VULKAN=ON` and their toolchains, one backend at a
  time.
- **The UI streaming path** — the golden suite measures the parser, not the
  screen. On a partial reply in the Llama dialect the parser returns the raw
  JSON as content: **whether that reaches the screen has not been verified.**
