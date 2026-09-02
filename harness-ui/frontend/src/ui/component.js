export function defineComponent(name, mount) {
  if (typeof name !== 'string' || !name) throw new TypeError('nome componente obbligatorio');
  if (typeof mount !== 'function') throw new TypeError(`${name}.mount mancante`);
  return function createComponent(context = {}) {
    const mounted = mount(context);
    if (!mounted?.element || mounted.element.nodeType !== 1) throw new TypeError(`${name} deve restituire un elemento radice`);
    for (const method of ['update', 'destroy']) {
      if (typeof mounted[method] !== 'function') throw new TypeError(`${name}.${method} mancante`);
    }
    let destroyed = false;
    const component = {
      element: mounted.element,
      update(nextProps) {
        if (!destroyed) mounted.update(nextProps);
      },
      destroy() {
        if (destroyed) return false;
        destroyed = true;
        mounted.destroy();
        return true;
      },
    };
    if (typeof mounted.focus === 'function') {
      component.focus = (options) => { if (!destroyed) mounted.focus(options); };
    }
    return Object.freeze(component);
  };
}

