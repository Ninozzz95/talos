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

To build **with an accelerator** — research only, and never the shipped build:

```bash
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest     -PtalosResearchBackend=opencl -PtalosOpenclRoot=<dir with include/CL and lib/libOpenCL.so>
```

⛔ **A bare `assembleDebug` overwrites the same `app-debug.apk`.** A run labelled
OpenCL can therefore execute on a build that has no OpenCL in it, and the
failure looks like a wrong device name rather than a wrong APK. When a target
"does not exist", rebuild before doubting the name.

⛔ The OpenCL headers and ICD are **not in the NDK** (`sysroot/usr/include/CL`
does not exist), and the vendor `libOpenCL.so` is deliberately excluded from the
package: this Android lists it among the vendor public libraries, so the app
loads the system one, whose dependencies resolve where they live. A copy shipped
inside the app shadows it and fails to open — silently.

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

# ⛔⛔ Comparing two backends with the golden suite? Then you MUST pass
# talosGpuLayers. It defaults to 0, because the suite began as the CPU floor —
# so naming a GPU target without it declares the target and computes on the CPU.
# Measured on 2026-08-20: a whole Flash Attention equivalence result was built on
# exactly that mistake. A declared target that is not used is worse than a
# missing one, because the file records it and the row reads like proof.
node scripts/research/run-device-tests.mjs ai.talos.TalosSemanticGoldenDeviceTest     --fresh talosBackend=OpenCL talosDevice=GPUOpenCL talosGpuLayers=-1 talosFlashAttn=off

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
| `talosBackend` | `none` | registry to offload to, e.g. `OpenCL`. `none` is the CPU floor |
| `talosDevice` | — | exact device name inside that registry, e.g. `GPUOpenCL` |
| `talosGpuLayers` | `-1` | layers to move (−1 = all). Forced to 0 on the CPU floor |
| `talosMicroBatch` | 0 (=256) | physical batch. ⛔ **This is the Stop knob**: the worst case to stop is one microbatch |
| `talosFlashAttn` | `default` | `off` / `auto` / `on`. ⛔ `default` is not off — llama.cpp's default is `AUTO` |
| `talosPrefillTargets` | derived | prefill lengths to measure, e.g. `8192` or `512,2048`. ⛔ **Not cosmetic**: derived targets run in order, so PP8192 arrives with the phone already throttling and its number mixes length with heat |
| `talosSustainedMinutes` | 10 | length of the G5 sustained run |
| `talosSustainedTokens` | 128 | tokens generated per G5 cycle |

⛔ **Every one of these is written into each row** of `runs.jsonl` and
`golden.jsonl`, and echoed by the runner before it starts. That is not
decoration: a run labelled `OpenCL` once turned out to be a build without
OpenCL in it, and a campaign measured at one microbatch was indistinguishable
from another until the value was recovered from the CMake cache.

### The two runs that are not in the default sweep

```bash
# G5 — ten minutes of sustained load. ⛔ It heats someone's phone: ask for it by name.
node scripts/research/run-device-tests.mjs \
    'ai.talos.TalosLocalBaselineDeviceTest#c0TenutaNelTempo' \
    --fresh talosBackend=OpenCL talosDevice=GPUOpenCL talosSustainedMinutes=10

# PP8192 — needs a wider context, because the prudent ceiling is half of it. ⛔ And
# ALONE, or the number describes the heat as much as the length.
node scripts/research/run-device-tests.mjs \
    'ai.talos.TalosLocalBaselineDeviceTest#c0PrefillEDecodifica' \
    --fresh talosBackend=OpenCL talosDevice=GPUOpenCL talosContext=16384 talosPrefillTargets=8192
```

## 4. Read

```bash
node scripts/research/analyze-local-backend-matrix.mjs
node scripts/research/analyze-local-backend-matrix.mjs --json
node scripts/research/analyze-local-backend-matrix.mjs runs.jsonl --zone zones.txt
```

⛔ **`--zone` exists because the two thermal signals the app can read are both
useless during a long run.** Measured over ten minutes: decode oscillated
between 19.3 and 13.6 tok/s while `thermal` said "moderate" from second 46
onwards and battery temperature never left 33.6 C. The SoC zones, at the same
moment, read 88 C. sysfs is denied to an application by SELinux, so sample it
from the host alongside the run:

```bash
while true; do
  echo "$(date +%s) $(adb shell 'cat /sys/class/thermal/thermal_zone*/temp | sort -n | tail -1')"
  sleep 5
done >> zones.txt
```

Samples further than thirty seconds from a run are refused rather than attached
to it.

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

- **Vulkan** — it builds and registers and offloads all 29 layers, and then
  **crashes at the first compute graph**, twice out of twice, inside the Adreno
  driver's own `vkGetDeviceFaultInfoEXT`. A crash is FAILED, not a poor
  measurement: there are no Vulkan numbers. ⛔ The one variable never tried is
  `n_batch`, the *logical* batch, fixed at 512 in production code.
- **Anything but this one device.** Every conclusion about Flash Attention and
  the microbatch was measured on an Adreno 830 with one driver. Upstream lists
  "flash attention does not always improve performance" among the OpenCL known
  issues and "improve flash attention" among its TODOs — which is precisely why
  the knob exists and why the answer is re-measured elsewhere, not inherited.
- **The UI streaming path** — the golden suite measures the parser, not the
  screen. On a partial reply in the Llama dialect the parser returns the raw
  JSON as content: **whether that reaches the screen has not been verified.**
