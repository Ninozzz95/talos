export const selectRuntimePhase = (state) => state.runtime.phase;

function memoizeInputs(ownerSelectors, inputSelectors, project) {
  const cacheRoot = new WeakMap();
  return (state) => {
    const owners = ownerSelectors.map((selector) => selector(state));
    if (owners.some((owner) => owner === null || (typeof owner !== 'object' && typeof owner !== 'function'))) {
      throw new TypeError('memoized selector owners must be objects');
    }
    const inputs = inputSelectors.map((selector) => selector(state));
    let cache = cacheRoot;
    for (const owner of owners.slice(0, -1)) {
      let next = cache.get(owner);
      if (!next) {
        next = new WeakMap();
        cache.set(owner, next);
      }
      cache = next;
    }
    const leafOwner = owners.at(-1);
    const previous = cache.get(leafOwner);
    if (previous && inputs.length === previous.inputs.length && inputs.every((value, index) => Object.is(value, previous.inputs[index]))) {
      return previous.value;
    }
    const value = Object.freeze(project(...inputs));
    cache.set(leafOwner, { inputs, value });
    return value;
  };
}

export const selectSessionHeader = memoizeInputs([
  (state) => state.sessions,
], [
  (state) => state.sessions.activeId,
  (state) => state.sessions.items.find((session) => session.id === state.sessions.activeId),
  (state) => state.sessions.status,
], (activeId, active, status) => ({
    id: activeId,
    title: active?.title || active?.name || null,
    status: active?.status || status,
  }));

export const selectConversation = (state) => state.conversation;

export const selectDock = memoizeInputs([
  (state) => state.layout,
], [
  (state) => state.layout.activeDockTab,
  (state) => state.layout.context,
  (state) => state.layout.contextWidth,
], (tab, context, width) => ({ tab, context, width }));

/*
 * La sidebar: le sessioni, quella aperta e il luogo corrente. Memoizzato come
 * gli altri, cosi' un giro che tocca solo la conversazione non ridisegna la
 * cronologia — con 69 sessioni sarebbe lavoro sprecato a ogni token.
 */
export const selectSidebar = memoizeInputs([
  (state) => state.sessions,
  (state) => state.layout,
], [
  (state) => state.sessions.items,
  (state) => state.sessions.activeId,
  (state) => state.layout.route,
], (items, activeId, route) => ({ items, activeId, route }));

export const selectApprovalCount = (state) => Object.keys(state.approvals.pending).length;

export const selectReviewSummary = memoizeInputs([
  (state) => state.review,
], [
  (state) => state.review.order.length,
  (state) => state.review.activePath,
  (state) => state.review.risks.length,
], (changedFiles, activePath, risks) => ({ changedFiles, activePath, risks }));

export const selectTerminalStatus = memoizeInputs([
  (state) => state.terminal,
], [
  (state) => state.terminal.status,
  (state) => state.terminal.processCount,
  (state) => state.terminal.activeId,
], (status, processCount, activeId) => ({ status, processCount, activeId }));

export const selectStatusBar = memoizeInputs([
  (state) => state.runtime,
  (state) => state.execution,
  (state) => state.notifications,
], [
  (state) => state.runtime.phase,
  (state) => state.runtime.connection,
  (state) => state.execution.status,
  (state) => state.notifications.announcement,
], (phase, connection, execution, announcement) => ({ phase, connection, execution, announcement }));
