function platformModifier(platform) {
  return String(platform || '').toLowerCase().startsWith('mac') ? 'Meta' : 'Control';
}

export function normalizeShortcut(shortcut, platform = 'windows') {
  return String(shortcut || '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part === 'Mod' ? platformModifier(platform) : (part.length === 1 ? part.toUpperCase() : part))
    .join('+');
}

function eventShortcut(event) {
  const parts = [];
  if (event.ctrlKey) parts.push('Control');
  if (event.metaKey) parts.push('Meta');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  const key = event.key?.length === 1 ? event.key.toUpperCase() : event.key;
  if (key && !['Control', 'Meta', 'Alt', 'Shift'].includes(key)) parts.push(key);
  return parts.join('+');
}

function isTextField(target) {
  const tag = target?.tagName?.toUpperCase();
  return target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function createShortcutManager({ target, platform = 'windows' }) {
  if (!target || typeof target.addEventListener !== 'function') throw new TypeError('target shortcut non valido');
  const records = [];
  const listener = (event) => {
    const normalized = eventShortcut(event);
    const matching = records.filter((record) => record.shortcut === normalized && (!record.when || record.when(event))).sort((a, b) => b.priority - a.priority);
    const record = matching[0];
    if (!record) return;
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    if (isTextField(event.target) && !modified) return;
    event.preventDefault();
    record.handler(event);
  };
  target.addEventListener('keydown', listener);
  let destroyed = false;
  return Object.freeze({
    register(shortcut, handler, { priority = 0, when } = {}) {
      if (destroyed) throw new Error('shortcut manager distrutto');
      if (typeof handler !== 'function') throw new TypeError('handler shortcut obbligatorio');
      const record = { shortcut: normalizeShortcut(shortcut, platform), handler, priority, when };
      records.push(record);
      return () => {
        const index = records.indexOf(record);
        if (index < 0) return false;
        records.splice(index, 1);
        return true;
      };
    },
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      records.length = 0;
      target.removeEventListener('keydown', listener);
      return true;
    },
  });
}

