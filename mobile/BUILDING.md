# Building TALOS

Back to the [README](README.md).

## Requirements

JavaScript toolchain:

```text
Node >= 24.18.0 and < 25
npm  >= 11.16.0 and < 12
```

Android configuration:

```text
compileSdk 36
targetSdk 36
minSdk 26
arm64-v8a only
NDK 27.0.12077973
```

A compatible JDK and Android SDK/NDK toolchain are also required.

## Get the sources

Local inference uses llama.cpp as a git submodule:

```bash
git clone https://github.com/Ninozzz95/talos.git
cd talos
git submodule update --init --depth 1
```

> **Windows:** run `git config --global core.longpaths true` first. Some llama.cpp paths exceed the traditional 260-character limit and otherwise leave an incomplete checkout.

## Web / unit build

```bash
npm ci
npm run typecheck
npm run test:unit
npm run build
```

## Android

```bash
npx cap sync android
cd android
./gradlew assembleDebug -PtalosSideBySide
```

`-PtalosSideBySide` installs the development package beside an existing release instead of replacing its local data.

### Optional Git Bash launcher tests

```bash
cd tools/git-bash-launcher
npm ci
```

The launcher's `node-pty` dependency is intentionally isolated and should not be added to the main application dependency graph.

## Platform status

The Android build declares:

```text
minSdk 26
targetSdk 36
ABI arm64-v8a
```

TALOS is actively validated on modern Android hardware, including a OnePlus phone and tablet.

OEM variants differ in Accessibility, background execution, lock-screen behavior and battery management, so TALOS prefers runtime capability checks over hardcoded assumptions.

This is a young, actively used project and should still be treated as **experimental software**, not irreplaceable infrastructure.

## Verifying a release

Releases include a signed APK for **`arm64-v8a` on Android 8.0+**. Because TALOS is not distributed through the Play Store, Android will ask you to confirm installation from an unknown source.

Verify the downloaded file against the release hash:

```bash
sha256sum TALOS-<version>.apk
```

Then verify that it was built by this repository's workflow:

```bash
gh attestation verify TALOS-<version>.apk --repo Ninozzz95/talos
```

The provenance command is intentionally documented here and in each release so the attestation can actually be checked.
