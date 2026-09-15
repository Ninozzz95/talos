export function createHostBridge({ windowObj = globalThis.window } = {}) {
  const invoke = (name, value) => {
    const callback = windowObj?.[name];
    if (typeof callback !== 'function') return false;
    callback(value);
    return true;
  };
  return Object.freeze({
    root: () => windowObj?.__talosHarnessRoot || null,
    changeView: (view) => invoke('__talosHarnessHostViewChange', view),
    changePermission: (permission) => invoke('__talosHarnessHostPermissionChange', permission),
    back: () => {
      const callback = windowObj?.__talosHarnessHostBack;
      if (typeof callback !== 'function') return false;
      callback();
      return true;
    },
  });
}
