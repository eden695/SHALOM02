import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';

export interface RouteEntry {
  kind: 'route';
  navId: string;
  key: string;
  tab: string;
  subView?: string;
  seq: number;
  hasBrowserHistory: boolean;
}

export interface OverlayEntry {
  kind: 'overlay';
  navId: string;
  overlayId: string;
  label?: string;
  close: () => void;
  seq: number;
  hasBrowserHistory: boolean;
}

export type NavStackItem = RouteEntry | OverlayEntry;

export const DEFAULT_SUB_VIEWS: Record<string, string | undefined> = {
  altar: 'weekly',
  prayers: 'requests',
  journey: 'weekly',
  studios: 'design',
  vault: 'vault',
  settings: 'general',
};

const NAV_STORAGE_KEY = 'shalom_nav_stack_v1';

interface PersistedRoute {
  tab: string;
  subView?: string;
}

interface HistoryStateShape {
  shalomManaged?: boolean;
  shalomSentinel?: boolean;
  shalomSeq?: number;
  key?: string;
}

function buildRouteKey(tab: string, subView?: string): string {
  return subView ? `${tab}:${subView}` : tab;
}

function resolveSubView(tab: string, subView?: string): string | undefined {
  return subView ?? DEFAULT_SUB_VIEWS[tab];
}

let navUidCounter = 0;
function nextNavId(prefix: string): string {
  navUidCounter += 1;
  return `${prefix}_${Date.now()}_${navUidCounter}`;
}

function createRouteEntry(
  tab: string,
  subView: string | undefined,
  seq: number,
  hasBrowserHistory: boolean
): RouteEntry {
  const effectiveSubView = resolveSubView(tab, subView);
  return {
    kind: 'route',
    navId: nextNavId('route'),
    key: buildRouteKey(tab, effectiveSubView),
    tab,
    subView: effectiveSubView,
    seq,
    hasBrowserHistory,
  };
}

function loadInitialRoutes(): PersistedRoute[] {
  try {
    const raw = sessionStorage.getItem(NAV_STORAGE_KEY);
    if (!raw) return [{ tab: 'dashboard' }];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [{ tab: 'dashboard' }];

    const cleaned: PersistedRoute[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as PersistedRoute).tab === 'string' &&
        (item as PersistedRoute).tab.trim().length > 0
      ) {
        const tab = (item as PersistedRoute).tab;
        const subView = resolveSubView(tab, (item as PersistedRoute).subView);
        const key = buildRouteKey(tab, subView);
        if (tab === 'dashboard') {
          cleaned.length = 0;
          cleaned.push({ tab: 'dashboard' });
          continue;
        }
        const prev = cleaned[cleaned.length - 1];
        if (!prev || buildRouteKey(prev.tab, prev.subView) !== key) {
          cleaned.push({ tab, subView });
        }
      }
    }

    if (cleaned.length === 0) return [{ tab: 'dashboard' }];
    if (cleaned[0].tab !== 'dashboard') {
      cleaned.unshift({ tab: 'dashboard' });
    }
    return cleaned;
  } catch {
    return [{ tab: 'dashboard' }];
  }
}

function persistRoutes(stack: NavStackItem[]) {
  try {
    const routes: PersistedRoute[] = stack
      .filter((item): item is RouteEntry => item.kind === 'route')
      .map((r) => ({ tab: r.tab, subView: r.subView }));
    sessionStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(routes));
  } catch {
    // ignore storage errors
  }
}

interface NavigationContextValue {
  activeTab: string;
  activeSubView?: string;
  canGoBack: boolean;
  hasActiveOverlay: boolean;
  historyDepth: number;
  navigateTo: (tab: string, subView?: string) => void;
  navigateSubView: (tab: string, subView: string) => void;
  goBack: () => void;
  goHome: () => void;
  registerOverlay: (overlayId: string, close: () => void, label?: string) => void;
  unregisterOverlay: (overlayId: string) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

interface NavigationProviderProps {
  isLaunchLocked?: boolean;
  children: React.ReactNode;
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({
  isLaunchLocked = false,
  children,
}) => {
  const seqRef = useRef<number>(1);
  const expectedSeqRef = useRef<number>(1);
  const isLaunchLockedRef = useRef<boolean>(isLaunchLocked);
  isLaunchLockedRef.current = isLaunchLocked;

  const [stack, setStack] = useState<NavStackItem[]>(() => {
    const initialRoutes = loadInitialRoutes();
    const curState = (window.history.state || null) as HistoryStateShape | null;
    const isExistingManagedSession = Boolean(curState?.shalomManaged && !curState.shalomSentinel);

    const baseSeq =
      isExistingManagedSession && typeof curState?.shalomSeq === 'number' && curState.shalomSeq > 0
        ? curState.shalomSeq
        : 1;

    seqRef.current = baseSeq;
    expectedSeqRef.current = baseSeq;

    return initialRoutes.map((r, index) => {
      const isLast = index === initialRoutes.length - 1;
      return createRouteEntry(r.tab, r.subView, isLast ? baseSeq : 0, isLast);
    });
  });

  const stackRef = useRef<NavStackItem[]>(stack);

  const updateStack = useCallback((next: NavStackItem[]) => {
    const normalized =
      next.length > 0 ? next : [createRouteEntry('dashboard', undefined, seqRef.current, true)];
    stackRef.current = normalized;
    setStack(normalized);
    persistRoutes(normalized);
  }, []);

  // Initialize browser history sentinel + active entry once on initial mount
  useEffect(() => {
    const curState = (window.history.state || null) as HistoryStateShape | null;
    const topRoute = [...stackRef.current]
      .reverse()
      .find((x): x is RouteEntry => x.kind === 'route');
    const topKey = topRoute?.key || 'dashboard';

    if (!curState?.shalomManaged) {
      try {
        window.history.replaceState(
          { shalomManaged: true, shalomSentinel: true, shalomSeq: 0 } satisfies HistoryStateShape,
          ''
        );
        window.history.pushState(
          {
            shalomManaged: true,
            shalomSentinel: false,
            shalomSeq: 1,
            key: topKey,
          } satisfies HistoryStateShape,
          ''
        );
        seqRef.current = 1;
        expectedSeqRef.current = 1;
      } catch {
        // ignore restricted history API errors
      }
    } else if (curState.shalomSentinel) {
      const nextSeq = Math.max(1, seqRef.current + 1);
      seqRef.current = nextSeq;
      expectedSeqRef.current = nextSeq;
      const updated = stackRef.current.map((item, idx) =>
        idx === stackRef.current.length - 1
          ? { ...item, seq: nextSeq, hasBrowserHistory: true }
          : item
      );
      updateStack(updated);
      try {
        window.history.pushState(
          {
            shalomManaged: true,
            shalomSentinel: false,
            shalomSeq: nextSeq,
            key: topKey,
          } satisfies HistoryStateShape,
          ''
        );
      } catch {
        // ignore
      }
    } else {
      const restoredSeq =
        typeof curState.shalomSeq === 'number' && curState.shalomSeq > 0
          ? curState.shalomSeq
          : 1;
      seqRef.current = Math.max(seqRef.current, restoredSeq);
      expectedSeqRef.current = restoredSeq;
    }
  }, [updateStack]);

  const goHome = useCallback(() => {
    const current = stackRef.current;
    const isAlreadyCleanHome =
      current.length === 1 &&
      current[0].kind === 'route' &&
      current[0].tab === 'dashboard';

    if (isAlreadyCleanHome) return;

    const overlaysToClose = current.filter((item): item is OverlayEntry => item.kind === 'overlay');
    const nextSeq = ++seqRef.current;
    expectedSeqRef.current = nextSeq;
    const rootEntry = createRouteEntry('dashboard', undefined, nextSeq, true);

    updateStack([rootEntry]);
    overlaysToClose.forEach((ov) => ov.close());

    try {
      window.history.replaceState(
        {
          shalomManaged: true,
          shalomSentinel: false,
          shalomSeq: nextSeq,
          key: rootEntry.key,
        } satisfies HistoryStateShape,
        ''
      );
    } catch {
      // ignore
    }
  }, [updateStack]);

  const navigateTo = useCallback(
    (tab: string, subView?: string) => {
      // Returning to Accueil clears prior history so Back on Accueil never jumps back to a previous page
      if (tab === 'dashboard') {
        goHome();
        return;
      }

      const effectiveSubView = resolveSubView(tab, subView);
      const nextKey = buildRouteKey(tab, effectiveSubView);

      const current = stackRef.current;

      // Strip any trailing overlays
      let firstOverlayIdx = current.length;
      while (firstOverlayIdx > 0 && current[firstOverlayIdx - 1].kind === 'overlay') {
        firstOverlayIdx -= 1;
      }
      const hasTrailingOverlays = firstOverlayIdx < current.length;
      const topOverlayWithHistory = hasTrailingOverlays
        ? [...current.slice(firstOverlayIdx)].reverse().find((o) => o.hasBrowserHistory)
        : undefined;

      const baseRoutes = current.slice(0, firstOverlayIdx);
      const currentTopRoute = [...baseRoutes]
        .reverse()
        .find((item): item is RouteEntry => item.kind === 'route');

      if (currentTopRoute && currentTopRoute.key === nextKey) {
        if (hasTrailingOverlays) {
          const overlays = current.slice(firstOverlayIdx);
          updateStack(baseRoutes);
          overlays.forEach((ov) => {
            if (ov.kind === 'overlay') ov.close();
          });
          if (topOverlayWithHistory && currentTopRoute.hasBrowserHistory && currentTopRoute.seq > 0) {
            expectedSeqRef.current = currentTopRoute.seq;
            try {
              window.history.back();
            } catch {
              // ignore
            }
          }
        }
        return;
      }

      const nextSeq = ++seqRef.current;
      expectedSeqRef.current = nextSeq;
      const nextEntry = createRouteEntry(tab, effectiveSubView, nextSeq, true);
      const nextStack = [...baseRoutes, nextEntry];

      updateStack(nextStack);

      if (hasTrailingOverlays) {
        const overlays = current.slice(firstOverlayIdx);
        overlays.forEach((ov) => {
          if (ov.kind === 'overlay') ov.close();
        });
      }

      try {
        if (topOverlayWithHistory) {
          window.history.replaceState(
            {
              shalomManaged: true,
              shalomSentinel: false,
              shalomSeq: nextSeq,
              key: nextKey,
            } satisfies HistoryStateShape,
            ''
          );
        } else {
          window.history.pushState(
            {
              shalomManaged: true,
              shalomSentinel: false,
              shalomSeq: nextSeq,
              key: nextKey,
            } satisfies HistoryStateShape,
            ''
          );
        }
      } catch {
        // ignore
      }
    },
    [goHome, updateStack]
  );

  const navigateSubView = useCallback(
    (tab: string, subView: string) => {
      navigateTo(tab, subView);
    },
    [navigateTo]
  );

  const registerOverlay = useCallback(
    (overlayId: string, close: () => void, label?: string) => {
      const current = stackRef.current;
      const existingIdx = current.findIndex(
        (item) => item.kind === 'overlay' && item.overlayId === overlayId
      );
      if (existingIdx !== -1) {
        const updated = current.map((item, idx) =>
          idx === existingIdx && item.kind === 'overlay' ? { ...item, close, label } : item
        );
        stackRef.current = updated;
        setStack(updated);
        return;
      }

      const nextSeq = ++seqRef.current;
      expectedSeqRef.current = nextSeq;
      const entry: OverlayEntry = {
        kind: 'overlay',
        navId: nextNavId('overlay'),
        overlayId,
        label,
        close,
        seq: nextSeq,
        hasBrowserHistory: true,
      };
      updateStack([...current, entry]);

      try {
        window.history.pushState(
          {
            shalomManaged: true,
            shalomSentinel: false,
            shalomSeq: nextSeq,
            key: `overlay:${overlayId}`,
          } satisfies HistoryStateShape,
          ''
        );
      } catch {
        // ignore
      }
    },
    [updateStack]
  );

  const unregisterOverlay = useCallback(
    (overlayId: string) => {
      const current = stackRef.current;
      const idx = current.findIndex(
        (item) => item.kind === 'overlay' && item.overlayId === overlayId
      );
      if (idx === -1) return;

      const target = current[idx];
      const isTop = idx === current.length - 1;
      const nextStack = [...current.slice(0, idx), ...current.slice(idx + 1)];
      updateStack(nextStack);

      if (isTop && target.hasBrowserHistory) {
        const prev = nextStack[nextStack.length - 1];
        if (prev && prev.hasBrowserHistory && prev.seq > 0) {
          expectedSeqRef.current = prev.seq;
          try {
            window.history.back();
          } catch {
            // ignore
          }
        } else {
          const nextSeq = ++seqRef.current;
          expectedSeqRef.current = nextSeq;
          if (prev) {
            const patched = nextStack.map((item, i) =>
              i === nextStack.length - 1
                ? { ...item, seq: nextSeq, hasBrowserHistory: true }
                : item
            );
            updateStack(patched);
          }
          try {
            window.history.replaceState(
              {
                shalomManaged: true,
                shalomSentinel: false,
                shalomSeq: nextSeq,
                key: prev?.kind === 'route' ? prev.key : '',
              } satisfies HistoryStateShape,
              ''
            );
          } catch {
            // ignore
          }
        }
      }
    },
    [updateStack]
  );

  const goBack = useCallback(() => {
    if (isLaunchLockedRef.current) return;

    const current = stackRef.current;
    // When on Accueil with no open overlay, Back button performs NO action
    if (current.length <= 1) {
      const only = current[0];
      if (only && only.kind === 'route' && only.tab !== 'dashboard') {
        goHome();
      }
      return;
    }

    const top = current[current.length - 1];
    const nextStack = current.slice(0, -1);
    const prev = nextStack[nextStack.length - 1];

    if (top.kind === 'overlay') {
      updateStack(nextStack);
      if (top.hasBrowserHistory) {
        if (prev && prev.hasBrowserHistory && prev.seq > 0) {
          expectedSeqRef.current = prev.seq;
          try {
            window.history.back();
          } catch {
            // ignore
          }
        } else {
          const nextSeq = ++seqRef.current;
          expectedSeqRef.current = nextSeq;
          if (prev) {
            updateStack(
              nextStack.map((item, i) =>
                i === nextStack.length - 1
                  ? { ...item, seq: nextSeq, hasBrowserHistory: true }
                  : item
              )
            );
          }
          try {
            window.history.replaceState(
              {
                shalomManaged: true,
                shalomSentinel: false,
                shalomSeq: nextSeq,
                key: prev?.kind === 'route' ? prev.key : '',
              } satisfies HistoryStateShape,
              ''
            );
          } catch {
            // ignore
          }
        }
      }
      top.close();
      return;
    }

    // Popping a route entry
    if (top.hasBrowserHistory && prev && prev.hasBrowserHistory && prev.seq > 0) {
      updateStack(nextStack);
      expectedSeqRef.current = prev.seq;
      try {
        window.history.back();
      } catch {
        // ignore
      }
    } else {
      const nextSeq = ++seqRef.current;
      expectedSeqRef.current = nextSeq;
      const syncedPrevStack = nextStack.map((item, i) =>
        i === nextStack.length - 1
          ? { ...item, seq: nextSeq, hasBrowserHistory: true }
          : item
      );
      updateStack(syncedPrevStack);
      try {
        window.history.replaceState(
          {
            shalomManaged: true,
            shalomSentinel: false,
            shalomSeq: nextSeq,
            key: prev?.kind === 'route' ? prev.key : 'dashboard',
          } satisfies HistoryStateShape,
          ''
        );
      } catch {
        // ignore
      }
    }
  }, [goHome, updateStack]);

  // Synchronize Android hardware / browser Back button (`popstate`) with centralized stack
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const state = (e.state || null) as HistoryStateShape | null;

      if (
        state?.shalomManaged &&
        typeof state.shalomSeq === 'number' &&
        state.shalomSeq === expectedSeqRef.current
      ) {
        return;
      }

      if (isLaunchLockedRef.current) {
        const nextSeq = ++seqRef.current;
        expectedSeqRef.current = nextSeq;
        try {
          window.history.pushState(
            { shalomManaged: true, shalomSentinel: false, shalomSeq: nextSeq } satisfies HistoryStateShape,
            ''
          );
        } catch {
          // ignore
        }
        return;
      }

      const current = stackRef.current;
      if (current.length > 1) {
        const top = current[current.length - 1];
        const nextStack = current.slice(0, -1);
        const prev = nextStack[nextStack.length - 1];

        updateStack(nextStack);

        if (top.kind === 'overlay') {
          top.close();
        }

        if (state?.shalomSentinel || !prev?.hasBrowserHistory || prev.seq <= 0) {
          const nextSeq = ++seqRef.current;
          expectedSeqRef.current = nextSeq;
          const synced = nextStack.map((item, idx) =>
            idx === nextStack.length - 1
              ? { ...item, seq: nextSeq, hasBrowserHistory: true }
              : item
          );
          updateStack(synced);
          try {
            window.history.pushState(
              {
                shalomManaged: true,
                shalomSentinel: false,
                shalomSeq: nextSeq,
                key: prev?.kind === 'route' ? prev.key : 'dashboard',
              } satisfies HistoryStateShape,
              ''
            );
          } catch {
            // ignore
          }
        } else {
          expectedSeqRef.current =
            typeof state?.shalomSeq === 'number' ? state.shalomSeq : prev.seq;
        }
        return;
      }

      // On Accueil (root stack): Back button performs NO action — silently keep active dashboard entry above sentinel
      const only = current[0];
      const nextSeq = ++seqRef.current;
      expectedSeqRef.current = nextSeq;
      if (only && only.kind === 'route' && only.tab !== 'dashboard') {
        const rootEntry = createRouteEntry('dashboard', undefined, nextSeq, true);
        updateStack([rootEntry]);
      } else if (only) {
        updateStack([{ ...only, seq: nextSeq, hasBrowserHistory: true }]);
      }
      try {
        window.history.pushState(
          {
            shalomManaged: true,
            shalomSentinel: false,
            shalomSeq: nextSeq,
            key: 'dashboard',
          } satisfies HistoryStateShape,
          ''
        );
      } catch {
        // ignore
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [updateStack]);

  const currentRoute =
    [...stack].reverse().find((item): item is RouteEntry => item.kind === 'route') ||
    createRouteEntry('dashboard', undefined, 1, true);

  const hasActiveOverlay = stack.some((item) => item.kind === 'overlay');
  const canGoBack = currentRoute.tab !== 'dashboard' || hasActiveOverlay;

  return (
    <NavigationContext.Provider
      value={{
        activeTab: currentRoute.tab,
        activeSubView: currentRoute.subView,
        canGoBack,
        hasActiveOverlay,
        historyDepth: stack.length,
        navigateTo,
        navigateSubView,
        goBack,
        goHome,
        registerOverlay,
        unregisterOverlay,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return ctx;
}

export function useNavigationOptional(): NavigationContextValue | null {
  return useContext(NavigationContext);
}

export function useModuleSubView<T extends string>(
  tabId: string,
  defaultView: T
): [T, (nextView: T) => void] {
  const { activeTab, activeSubView, navigateSubView } = useNavigation();
  const current =
    activeTab === tabId && activeSubView ? (activeSubView as T) : defaultView;

  const setSubView = useCallback(
    (nextView: T) => {
      navigateSubView(tabId, nextView);
    },
    [navigateSubView, tabId]
  );

  return [current, setSubView];
}
