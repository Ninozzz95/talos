# P1 Library device-export research

Date: 2026-07-28

## Problem named from current code and owner evidence

TALOS currently has two different meanings of "save":

- uploaded and generated files are persisted in the encrypted, app-private
  Library;
- `openTalosVaultFileExternally()` writes a temporary cache copy and invokes
  Android's share/open chooser.

Neither path creates a durable, user-visible copy in phone storage. The owner
requires every available file to be exportable from both the global Library
and `Media in this chat`, manually and by asking the chat in natural language.
The private Library must remain the source of truth; a shared copy is an
explicit export, not a silent relocation or a claim that cache is storage.

Current local constraints:

- Android min SDK 26, target/compile SDK 36;
- Capacitor core/Android `8.4.2`;
- `@capacitor/filesystem@8.1.2`;
- `@capawesome/capacitor-file-picker@8.0.3`;
- each accepted Vault file is bounded to 10 MB;
- raw bytes are already available through the encrypted Vault preview boundary;
- tool `write` actions already pass through a fail-closed consent and audit
  boundary.

## Current standards and maintained upstreams

Accessed 2026-07-28:

1. [Android Developers: Access documents and other files from shared storage](https://developer.android.com/training/data-storage/shared/documents-files)
   documents the Storage Access Framework. `ACTION_CREATE_DOCUMENT` is the
   platform "Save as" contract: the user chooses a provider and exact location,
   no broad storage permission is required, the file remains after app
   uninstall, MIME type and suggested name are supplied by the app, and name
   collisions are handled by the system without overwriting.
2. [Android Developers: Overview of shared storage](https://developer.android.com/training/data-storage/shared)
   distinguishes user-visible media (`MediaStore`) from documents and other
   files (Storage Access Framework), and says shared data should remain
   accessible to other apps and after uninstall. Page last updated 2026-03-05.
3. [Android Developers: Access media files from shared storage](https://developer.android.com/training/data-storage/shared/media)
   recommends `MediaStore` for app-created image/video/audio collections and
   the Storage Access Framework for general-purpose documents/downloads. Page
   last updated 2026-07-14.
4. [Capacitor Filesystem API](https://capacitorjs.com/docs/apis/filesystem)
   documents that `Directory.ExternalStorage` is unavailable on Android 11+
   and `Directory.Documents` can access only app-created entries there on
   Android 11+. The installed pin is `8.1.2`.
5. [Capawesome File Picker API](https://capawesome.io/docs/plugins/file-picker/)
   exposes `pickDirectory()` and `copyFile()` but no create-document/save-file
   operation. The installed `8.0.3` Android implementation invokes
   `ACTION_OPEN_DOCUMENT_TREE`; it does not expose `ACTION_CREATE_DOCUMENT`.
6. [Android `Intent.ACTION_CREATE_DOCUMENT` reference](https://developer.android.com/reference/android/content/Intent#ACTION_CREATE_DOCUMENT)
   defines the returned `content://` document URI and requires
   `CATEGORY_OPENABLE`, allowing the result to be opened through
   `ContentResolver`.

## Competitor evidence

Accessed 2026-07-28 from first-party documentation:

1. [OpenAI: File storage and Library in ChatGPT](https://help.openai.com/en/articles/20001052-library-for-chatgpt)
   says uploaded and created files are automatically retained in one Library,
   searchable by origin/type, and one or multiple selected files can be
   downloaded. The article was updated on 2026-07-28.
2. [Claude: What are artifacts and how do I use them?](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
   documents a dedicated artifact surface with versioning, copy, code view,
   and per-artifact file download.
3. [Google: Generate and edit images with Gemini Apps](https://support.google.com/gemini/answer/14286560)
   documents full-size image download and export to Docs; on Android, the
   documented mobile gesture is long-press followed by Save or Share.
4. [Google: Download your Gemini Apps data](https://support.google.com/gemini/answer/16920332)
   documents Takeout for bulk account/activity export, including chats,
   generated media, and uploads. It is an archive workflow, not an immediate
   per-file device save.

These documents establish mature patterns, not a claim about undocumented
competitor behavior.

## Upstream decision

**Adapt the Android platform contract behind an AVM-owned Capacitor adapter.**

Use `ACTION_CREATE_DOCUMENT` directly in a small native plugin registered by
the existing `MainActivity`. Stage decrypted bytes only in a uniquely named
file under the app's private `cache/talos-export` directory, pass only that
trusted `file://` URI to the plugin, copy it to the user-selected
`content://` URI off the main thread, require the native byte count to equal
the expected count, and remove the cache file in a JavaScript `finally`.

The adapter is pinned to the current Android/Capacitor stack above. No new
package is needed.

Rejected:

- `Directory.ExternalStorage`: unavailable on supported Android 11+ devices.
- A fixed `Directory.Documents` write: it does not implement a user-selected
  cross-provider Save-As contract and carries legacy permission differences.
- `ACTION_OPEN_DOCUMENT_TREE` plus a fabricated child URI: the installed picker
  selects a tree but provides no supported create-child boundary.
- The share sheet as "save": it offers recipients/openers and cannot prove a
  durable copy was created.
- Base64 bytes passed directly to a new native method: the Filesystem bridge
  already owns cache writes, while a narrow URI-copy plugin is easier to audit
  and cannot accept arbitrary payload semantics.
- Broad storage or all-files permissions: unnecessary and contrary to scoped
  storage/user-control guidance.
- Automatic export after every Library save: it would open a system picker
  without an explicit user request and conflate private retention with a public
  copy.

## Competitor-informed TALOS one-up

Adopt ChatGPT's unified Library discoverability and explicit download action,
Claude's export beside the artifact, and Gemini's direct media save affordance.
TALOS can improve on the documented combination by making one byte-preserving
export contract available:

- beside every file in both Library surfaces and their viewers;
- through a natural-language `library_export` tool;
- with the same exact bytes and filename in both paths;
- with existing local `write` consent plus the Android destination picker;
- without broad storage permission or cloud dependency;
- with cancellation, ambiguity, missing bytes, and copy mismatch reported as
  non-success;
- with tool audit evidence that records file id/name and verified byte count,
  never the decrypted body or destination URI.

This "one-up" is an engineering inference from the documented flows above:
the cited competitor pages document UI downloads or account archives, while
TALOS will expose the same verified local operation through both UI and
policy-gated natural language.

