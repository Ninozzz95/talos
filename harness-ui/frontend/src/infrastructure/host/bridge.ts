/** K02: resolves the injected host at use time, preserving late embedded mounting. */
export interface HarnessWindow extends Window {
  __talosHarnessRoot?: Document | ShadowRoot;
  __talosHarnessHost?: HTMLElement;
  __talosHarnessApiBase?: string;
  __talosHarnessHostViewChange?: (view: string) => void;
  __talosHarnessHostPermissionChange?: (permission: string) => void;
  __talosHarnessHostBack?: () => void;
}
export function createHostBridge(windowObj: HarnessWindow) {
  return Object.freeze({
    root: () => windowObj.__talosHarnessRoot || windowObj.document,
    host: () => windowObj.__talosHarnessHost || windowObj.document.documentElement,
    baseUrl: () => windowObj.__talosHarnessApiBase || '',
    embedded: () => (windowObj.__talosHarnessHost || windowObj.document.documentElement).classList.contains('talos-embedded'),
    apiUrl: (pathname: string) => `${windowObj.__talosHarnessApiBase || ''}${pathname}`,
    changeView(view: string) { windowObj.__talosHarnessHostViewChange?.(view); },
    changePermission(permission: string) { windowObj.__talosHarnessHostPermissionChange?.(permission); },
    back() { windowObj.__talosHarnessHostBack?.(); },
  });
}
