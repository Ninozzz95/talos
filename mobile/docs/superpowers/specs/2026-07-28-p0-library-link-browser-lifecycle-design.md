# P0 Library link browser lifecycle design

Date: 2026-07-28  
Subsystem: TALOS mobile browser adapter + Library/source navigation

## Required behavior

- Only canonical, credential-free HTTP(S) URLs cross the browser boundary.
- A Library row or original-source button requests `system_browser`.
- A chat citation may retain the existing isolated presentation.
- A successful one-shot launch remains open under browser/user ownership.
- A failed launch returns `false`, reports no secret-bearing native error and
  releases listeners.
- A long-lived browser service (ChatScreen Browse) still closes an active
  browser when its normal `dispose()` is called.

## Adapter change

Extend `TalosInAppBrowserService.dispose` with an optional fail-closed lifecycle
option:

```ts
dispose(options?: { closeActive?: boolean }): Promise<void>
```

Default `closeActive` is `true`, preserving every existing caller. The
one-shot helper passes `false` only after a successful launch, removing native
listeners and local references without invoking `plugin.close()`. Failure
continues through ordinary closing disposal.

No native dependency, route, URL schema, UI hierarchy or persistence changes.

## Proof and rollback

- Unit test drives the actual one-shot helper through the mocked official
  module and proves launch once, close never, listeners removed.
- Existing native-service tests prove explicit disposal still closes and
  unsafe URLs never load the plugin.
- ContextScreen unit test proves Library passes `system_browser` and reports a
  refused open.
- Browser E2E can prove web fallback navigation; physical Custom Tab/cookies
  remain in the final owner checklist.
- Rollback is the service/test diff; no migration exists.

