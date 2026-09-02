import assert from 'node:assert/strict';
import test from 'node:test';

import { createOverlayManager } from '../../src/ui/overlay-manager.js';

function node() {
  const attributes = new Map();
  return {
    nodeType: 1,
    children: [],
    dataset: {},
    inert: false,
    textContent: '',
    append(...children) { this.children.push(...children); },
    hasAttribute(name) { return attributes.has(name); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    },
  };
}

function fixture() {
  const listeners = new Map();
  const document = {
    activeElement: null,
    createElement() { return node(); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const root = node();
  root.ownerDocument = document;
  root.append = (...children) => {
    for (const child of children) child.parent = root;
    root.children.push(...children);
  };
  return { document, root };
}

test('PHASE2-OVERLAY-STACK-14 a non-top overlay cannot close or move focus outside the active modal', () => {
  const { root } = fixture();
  const focus = [];
  const focusManager = {
    focusInitial(element) { focus.push(`initial:${element.id}`); },
    restore(element) { focus.push(`restore:${element.id}`); },
    trap() {},
  };
  const manager = createOverlayManager({ root, focusManager });
  const outside = { id: 'outside' };
  const insideParent = { id: 'inside-parent' };
  const parent = node();
  parent.id = 'parent';
  const child = node();
  child.id = 'child';
  const parentHandle = manager.open({ element: parent, invoker: outside });
  const childHandle = manager.open({ element: child, invoker: insideParent });

  assert.equal(parentHandle.close('stale-parent'), false);
  assert.equal(manager.size, 2);
  assert.deepEqual(focus, ['initial:parent', 'initial:child']);

  assert.equal(childHandle.close('child-complete'), true);
  assert.equal(parentHandle.close('parent-complete'), true);
  assert.equal(manager.size, 0);
  assert.deepEqual(focus, ['initial:parent', 'initial:child', 'restore:inside-parent', 'restore:outside']);
  manager.destroy();
});

test('PHASE2-OVERLAY-DESTROY-15 destroy is final and open cannot resurrect an unmanaged overlay', () => {
  const { root } = fixture();
  const manager = createOverlayManager({
    root,
    focusManager: { focusInitial() {}, restore() {}, trap() {} },
  });
  const overlay = node();
  overlay.id = 'only';
  manager.open({ element: overlay, invoker: { id: 'outside' } });
  assert.equal(manager.destroy(), true);
  assert.equal(manager.destroy(), false);
  assert.equal(root.children.length, 0);
  assert.throws(() => manager.open({ element: node() }), /distrutto/);
});

test('PHASE2-OVERLAY-DESTROY-15 destroy closes every layer before reporting callback failures', () => {
  const { root } = fixture();
  const closed = [];
  const manager = createOverlayManager({
    root,
    focusManager: { focusInitial() {}, restore() {}, trap() {} },
  });
  manager.open({ element: node(), invoker: { id: 'one' }, onClose: () => closed.push('one') });
  manager.open({
    element: node(),
    invoker: { id: 'two' },
    onClose: () => { closed.push('two'); throw new Error('close failure'); },
  });
  assert.throws(() => manager.destroy(), AggregateError);
  assert.deepEqual(closed, ['two', 'one']);
  assert.equal(root.children.length, 0);
  assert.equal(manager.destroy(), false);
});
