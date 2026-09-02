const PROPERTY_KEYS = new Set(['value', 'checked', 'disabled', 'hidden', 'textContent', 'tabIndex', 'selected']);

export function text(value, documentObj = globalThis.document) {
  if (!documentObj || typeof documentObj.createTextNode !== 'function') throw new TypeError('Documento non disponibile');
  return documentObj.createTextNode(String(value ?? ''));
}

export function setAttributes(node, attributes = {}) {
  if (!node || typeof node.setAttribute !== 'function') throw new TypeError('Elemento DOM non valido');
  for (const [name, value] of Object.entries(attributes || {})) {
    if (/^on/iu.test(name)) throw new TypeError(`Handler inline vietato: ${name}`);
    if (name === 'className') {
      node.className = value == null ? '' : String(value);
      continue;
    }
    if (name === 'style' && value && typeof value === 'object') {
      Object.assign(node.style, value);
      continue;
    }
    if (PROPERTY_KEYS.has(name)) {
      node[name] = value === null || value === undefined ? (typeof node[name] === 'boolean' ? false : '') : value;
      continue;
    }
    if (value === false || value === null || value === undefined) {
      node.removeAttribute(name);
      continue;
    }
    node.setAttribute(name, value === true ? '' : String(value));
  }
  return node;
}

function appendChild(node, child, documentObj) {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    child.forEach((nested) => appendChild(node, nested, documentObj));
    return;
  }
  if (typeof child === 'string' || typeof child === 'number' || typeof child === 'bigint') {
    node.append(text(child, documentObj));
    return;
  }
  node.append(child);
}

export function element(tagName, attributes = {}, ...children) {
  const documentObj = globalThis.document;
  if (!documentObj || typeof documentObj.createElement !== 'function') throw new TypeError('Documento non disponibile');
  const node = setAttributes(documentObj.createElement(tagName), attributes);
  children.forEach((child) => appendChild(node, child, documentObj));
  return node;
}

export function replaceChildren(node, ...children) {
  if (!node || typeof node.replaceChildren !== 'function') throw new TypeError('Contenitore DOM non valido');
  const documentObj = node.ownerDocument || globalThis.document;
  const normalized = [];
  const collect = (child) => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) return child.forEach(collect);
    normalized.push(typeof child === 'string' || typeof child === 'number' ? text(child, documentObj) : child);
  };
  children.forEach(collect);
  node.replaceChildren(...normalized);
  return node;
}

export function delegate(root, type, selector, handler, options) {
  if (!root || typeof root.addEventListener !== 'function') throw new TypeError('Radice delegata non valida');
  const listener = (event) => {
    const match = event.target?.closest?.(selector);
    if (!match || (typeof root.contains === 'function' && !root.contains(match))) return;
    handler(event, match);
  };
  root.addEventListener(type, listener, options);
  let active = true;
  return () => {
    if (!active) return false;
    active = false;
    root.removeEventListener(type, listener, options);
    return true;
  };
}

