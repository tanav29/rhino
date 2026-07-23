import { startTransition, useCallback, useEffect, useState } from "react";
import { SessionTabs, type SessionTab } from "./session-tabs";
import { DebugToolbar } from "./debug-toolbar";
import { closeSessionSocket } from "./session-sockets";
import { SessionView } from "./session-view";

let counter = 0;
function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function nextSession(): SessionTab {
  counter += 1;
  return { id: uuid(), title: `Terminal ${counter}` };
}

const STORAGE_KEY = "term.sessions";
const DEFAULT_SHELL_STORAGE_KEY = "term.default-shell";

function loadSessions(): SessionTab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore corrupt storage
  }
  return [nextSession()];
}

function saveSessions(sessions: SessionTab[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // ignore quota errors
  }
}

function loadDefaultShell(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(DEFAULT_SHELL_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveDefaultShell(shell: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEFAULT_SHELL_STORAGE_KEY, shell);
  } catch {
    // ignore quota errors
  }
}

export default function App() {
  const [debugEnabled] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("debug"),
  );

  // Keep the first render identical on the server and client. localStorage is
  // restored in an effect below so it cannot change the hydration markup.
  const [sessions, setSessions] = useState<SessionTab[]>([]);
  const [activeId, setActiveId] = useState("");
  const [defaultShell, setDefaultShell] = useState<string | undefined>();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loaded = loadSessions();
    const initial = loaded.length > 0 ? loaded : [nextSession()];
    // Persist the hydrated snapshot immediately. This makes the initial
    // session durable even before the state-dependent save effect runs.
    saveSessions(initial);
    startTransition(() => {
      setSessions(initial);
      setActiveId(initial[0].id);
      setDefaultShell(loadDefaultShell());
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated) saveSessions(sessions);
  }, [hydrated, sessions]);

  const activeSession = sessions.find((s) => s.id === activeId);
  useEffect(() => {
    if (hydrated && activeSession) {
      document.title = activeSession.title;
    }
  }, [hydrated, activeSession]);

  const addSession = useCallback((shell?: string) => {
    const selectedShell = shell ?? defaultShell;
    if (shell) {
      setDefaultShell(shell);
      saveDefaultShell(shell);
    }
    const session = { ...nextSession(), shell: selectedShell };
    setSessions((prev) => [...prev, session]);
    setActiveId(session.id);
  }, [defaultShell]);

  const updateTitle = useCallback((id: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title } : s)),
    );
  }, []);

  const closeSession = useCallback((id: string) => {
    closeSessionSocket(id);
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        const session = nextSession();
        setActiveId(session.id);
        return [session];
      }
      setActiveId((current) =>
        current === id ? next[next.length - 1].id : current,
      );
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        addSession();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addSession]);

  return (
    <div className="flex h-screen overflow-hidden">
      <SessionTabs
        sessions={sessions}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={closeSession}
        onNew={addSession}
      />
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="absolute inset-0 scrollbar-none"
            style={{
              visibility: session.id === activeId ? "visible" : "hidden",
              pointerEvents: session.id === activeId ? "auto" : "none",
            }}>
            <SessionView session={session} onTitle={updateTitle} />
          </div>
        ))}
      </div>
      {debugEnabled && <DebugToolbar />}
    </div>
  );
}
