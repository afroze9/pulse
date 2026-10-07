const storageKey = 'pulse.timeline-hierarchy';

export function createTimelineHierarchy({ storage } = {}) {
  const views = new Map();
  try {
    const saved = JSON.parse(storage?.getItem(storageKey) || 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const [view, groups] of Object.entries(saved)) {
        if (groups && typeof groups === 'object' && !Array.isArray(groups)) {
          views.set(view, new Map(Object.entries(groups).filter(([, expanded]) => typeof expanded === 'boolean')));
        }
      }
    }
  } catch { /* Row preferences must not prevent a workspace from opening. */ }

  return {
    remember(view, groups) {
      const state = views.get(view) || new Map();
      let changed = false;
      for (const group of groups) {
        if (!group.nestedGroups?.length || typeof group.showNested !== 'boolean') continue;
        const id = String(group.id);
        if (state.get(id) !== group.showNested) {
          state.set(id, group.showNested);
          changed = true;
        }
      }
      if (!changed) return;
      views.set(view, state);
      try {
        storage?.setItem(storageKey, JSON.stringify(Object.fromEntries([...views].map(([name, rows]) => [name, Object.fromEntries(rows)]))));
      } catch { /* In-memory state still survives screen switches without storage. */ }
    },
    apply(view, groups, forceExpanded) {
      const state = views.get(view);
      const restored = groups.map(group => ({
        ...group,
        visible: group.visible !== false,
        ...(group.nestedGroups ? {
          nestedGroups: [...group.nestedGroups],
          showNested: forceExpanded ?? state?.get(String(group.id)) ?? group.showNested ?? true
        } : {})
      }));
      const byId = new Map(restored.map(group => [String(group.id), group]));
      const hidden = new Set();
      function hideDescendants(group) {
        for (const id of group.nestedGroups || []) {
          const child = byId.get(String(id));
          if (!child || hidden.has(String(id))) continue;
          hidden.add(String(id));
          child.visible = false;
          hideDescendants(child);
        }
      }
      for (const group of restored) if (group.showNested === false) hideDescendants(group);
      return restored;
    }
  };
}

let storage;
try { storage = globalThis.localStorage; } catch { /* Restricted browser storage. */ }
export const timelineHierarchy = createTimelineHierarchy({ storage });
