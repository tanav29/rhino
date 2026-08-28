import { create } from "zustand";
import { rpc } from "./rpc";
import type { SessionTab } from "./session-tabs";

export interface Project {
  id: string;
  name: string;
  path: string;
  sessions: SessionTab[];
}

export interface Pane {
  id: string;
  sessionId: string;
  direction?: "row" | "column";
}

type Panel = "files" | "git" | null;

export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 24;
export const FONT_SIZE_DEFAULT = 13;
export const LINE_HEIGHT_MIN = 1.0;
export const LINE_HEIGHT_MAX = 2.0;
export const LINE_HEIGHT_DEFAULT = 1.38;

const clampFontSize = (value: number) =>
  Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value)));
const clampLineHeight = (value: number) =>
  Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, Math.round(value * 100) / 100));

let counter = 0;
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const newSession = (cwd?: string, shell?: string): SessionTab => ({
  id: uuid(),
  title: `Terminal ${++counter}`,
  cwd,
  shell,
});
const newProject = (): Project => ({
  id: uuid(),
  name: "Workspace",
  path: ".",
  sessions: [newSession()],
});

interface WorkspaceState {
  projects: Project[];
  activeProjectId: string;
  activeSessionId: string;
  panes: Pane[];
  panel: Panel;
  hydrated: boolean;
  defaultShell?: string;
  termFontSize: number;
  termLineHeight: number;
  termCursorBlink: boolean;
  newOpen: boolean;
  settingsOpen: boolean;
  shells: { name: string; value: string }[];
  lastSessionByProject: Record<string, string>;
  setProjects: (projects: Project[]) => void;
  setActiveProjectId: (id: string) => void;
  setActiveSessionId: (id: string) => void;
  setPanes: (panes: Pane[] | ((prev: Pane[]) => Pane[])) => void;
  setPanel: (panel: Panel) => void;
  setHydrated: (hydrated: boolean) => void;
  setDefaultShell: (shell?: string) => void;
  setTermFontSize: (size: number) => void;
  setTermLineHeight: (lineHeight: number) => void;
  setTermCursorBlink: (blink: boolean) => void;
  setNewOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setShells: (shells: { name: string; value: string }[]) => void;
  hydrate: (snapshot: unknown) => void;
  addSession: (shell?: string, cwd?: string) => void;
  selectSession: (id: string) => void;
  updateTitle: (id: string, title: string) => void;
  closeSession: (id: string) => void;
  selectProject: (id: string) => void;
  removeProject: (id: string) => void;
  createProject: (shell: string | undefined, cwd: string) => void;
  split: (direction: "row" | "column") => void;
  addProject: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  projects: [],
  activeProjectId: "",
  activeSessionId: "",
  panes: [],
  panel: null,
  hydrated: false,
  defaultShell: undefined,
  termFontSize: FONT_SIZE_DEFAULT,
  termLineHeight: LINE_HEIGHT_DEFAULT,
  termCursorBlink: true,
  newOpen: false,
  settingsOpen: false,
  shells: [],
  lastSessionByProject: {},

  setProjects: (projects) => set({ projects }),
  setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  setPanes: (panes) =>
    set((s) => ({
      panes: typeof panes === "function" ? (panes as (prev: Pane[]) => Pane[])(s.panes) : panes,
    })),
  setPanel: (panel) => set({ panel }),
  setHydrated: (hydrated) => set({ hydrated }),
  setDefaultShell: (defaultShell) => set({ defaultShell }),
  setTermFontSize: (termFontSize) => set({ termFontSize: clampFontSize(termFontSize) }),
  setTermLineHeight: (termLineHeight) => set({ termLineHeight: clampLineHeight(termLineHeight) }),
  setTermCursorBlink: (termCursorBlink) => set({ termCursorBlink }),
  setNewOpen: (newOpen) => set({ newOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setShells: (shells) => set({ shells }),

  hydrate: (snapshot) => {
    const snap = snapshot as {
      projects?: unknown;
      activeProjectId?: unknown;
      activeSessionId?: unknown;
      panes?: unknown;
      defaultShell?: unknown;
      termFontSize?: unknown;
      termLineHeight?: unknown;
      termCursorBlink?: unknown;
    } | null;
    const valid =
      snap?.projects &&
      Array.isArray(snap.projects) &&
      (snap.projects as unknown[]).every((p) => {
        const project = p as Project;
        return Boolean(project?.id && Array.isArray(project.sessions));
      });
    const loaded = valid ? (snap!.projects as Project[]) : [newProject()];
    const snapshotProjectId =
      typeof snap?.activeProjectId === "string" ? snap.activeProjectId : undefined;
    const projectId =
      snapshotProjectId && loaded.some((p) => p.id === snapshotProjectId)
        ? snapshotProjectId
        : loaded[0].id;
    const selectedProject = loaded.find((p) => p.id === projectId) ?? loaded[0];
    const snapshotSessionId =
      typeof snap?.activeSessionId === "string" ? snap.activeSessionId : undefined;
    const sessionId = selectedProject.sessions.some((s) => s.id === snapshotSessionId)
      ? snapshotSessionId!
      : selectedProject.sessions[0].id;
    const panes =
      Array.isArray(snap?.panes) && (snap.panes as Pane[]).length
        ? (snap.panes as Pane[])
        : [{ id: uuid(), sessionId }];
    const rawSize = snap?.termFontSize;
    const parsedSize = typeof rawSize === "number" ? clampFontSize(rawSize) : FONT_SIZE_DEFAULT;
    const rawLineHeight = snap?.termLineHeight;
    const parsedLineHeight =
      typeof rawLineHeight === "number" ? clampLineHeight(rawLineHeight) : LINE_HEIGHT_DEFAULT;
    set({
      projects: loaded,
      activeProjectId: projectId,
      activeSessionId: sessionId,
      panes,
      defaultShell: typeof snap?.defaultShell === "string" ? snap.defaultShell : undefined,
      termFontSize: parsedSize,
      termLineHeight: parsedLineHeight,
      termCursorBlink: typeof snap?.termCursorBlink === "boolean" ? snap.termCursorBlink : true,
      hydrated: true,
    });
  },

  addSession: (shell, cwd) => {
    const { projects, activeProjectId, defaultShell } = get();
    const project = projects.find((p) => p.id === activeProjectId);
    if (!project) return;
    const session = newSession(cwd || project.path, shell ?? defaultShell);
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === project.id ? { ...p, sessions: [...p.sessions, session] } : p,
      ),
      activeSessionId: session.id,
      panes: s.panes.length
        ? s.panes.map((pane, index) => (index === 0 ? { ...pane, sessionId: session.id } : pane))
        : s.panes,
      defaultShell: shell ? shell : s.defaultShell,
    }));
  },

  selectSession: (id) =>
    set((s) => ({
      activeSessionId: id,
      lastSessionByProject: { ...s.lastSessionByProject, [s.activeProjectId]: id },
      panes: s.panes.map((pane, index) => (index === 0 ? { ...pane, sessionId: id } : pane)),
    })),

  updateTitle: (id, title) =>
    set((s) => ({
      projects: s.projects.map((p) => ({
        ...p,
        sessions: p.sessions.map((sess) => (sess.id === id ? { ...sess, title } : sess)),
      })),
    })),

  closeSession: (id) => {
    const { projects, activeProjectId } = get();
    const project = projects.find((p) => p.id === activeProjectId);
    const sessions = project?.sessions ?? [];
    if (sessions.length <= 1) return;
    rpc.send.killSession({ sessionId: id });
    const next = sessions.find((s) => s.id !== id);
    set((s) => {
      const filteredProjects = s.projects.map((p) =>
        p.id === s.activeProjectId
          ? { ...p, sessions: p.sessions.filter((sess) => sess.id !== id) }
          : p,
      );
      const remainingPanes = s.panes.filter((pane) => pane.sessionId !== id);
      const nextPanes = remainingPanes.length
        ? remainingPanes
        : next
          ? [{ id: uuid(), sessionId: next.id }]
          : [];
      const shouldSwitch = s.activeSessionId === id && next;
      return {
        projects: filteredProjects,
        panes: nextPanes,
        ...(shouldSwitch
          ? {
              activeSessionId: next!.id,
              lastSessionByProject: { ...s.lastSessionByProject, [s.activeProjectId]: next!.id },
              panes: nextPanes.map((pane, index) =>
                index === 0 ? { ...pane, sessionId: next!.id } : pane,
              ),
            }
          : {}),
      };
    });
    // handle pane mapping for switched session - already done above, but ensure panes reflect next if needed
    // if activeSessionId === id, the set above already switched
  },

  selectProject: (id) =>
    set((s) => {
      const next = s.projects.find((p) => p.id === id);
      if (!next) return {};
      const sessionId = next.sessions.some((sess) => sess.id === s.lastSessionByProject[id])
        ? s.lastSessionByProject[id]
        : next.sessions[0].id;
      return {
        activeProjectId: id,
        activeSessionId: sessionId,
        panes: [{ id: uuid(), sessionId }],
        lastSessionByProject: { ...s.lastSessionByProject, [s.activeProjectId]: s.activeSessionId },
      };
    }),

  removeProject: (id) => {
    const { projects, activeProjectId } = get();
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    const count = target.sessions.length;
    if (
      !window.confirm(
        `Delete workspace "${target.name}"? This closes ${count} terminal${count === 1 ? "" : "s"}.`,
      )
    )
      return;
    target.sessions.forEach((sess) => rpc.send.killSession({ sessionId: sess.id }));
    const remaining = projects.filter((p) => p.id !== id);
    const fallback = remaining.length ? remaining : [newProject()];
    const isActive = activeProjectId === id;
    set({
      projects: fallback,
      ...(isActive
        ? {
            activeProjectId: fallback[0].id,
            activeSessionId: fallback[0].sessions[0].id,
            panes: [{ id: uuid(), sessionId: fallback[0].sessions[0].id }],
          }
        : {}),
    });
  },

  createProject: (shell, cwd) => {
    if (!cwd) return;
    const { projects } = get();
    const session = newSession(cwd, shell);
    const p: Project = {
      id: uuid(),
      name: cwd.split(/[\\/]/).filter(Boolean).pop() || `Project ${projects.length + 1}`,
      path: cwd,
      sessions: [session],
    };
    set((s) => ({
      projects: [...s.projects, p],
      activeProjectId: p.id,
      activeSessionId: p.sessions[0].id,
      panes: [{ id: uuid(), sessionId: p.sessions[0].id }],
    }));
  },

  split: (direction) => {
    const { projects, activeProjectId, activeSessionId } = get();
    const project = projects.find((p) => p.id === activeProjectId);
    const activeSession = project?.sessions.find((s) => s.id === activeSessionId);
    if (!project || !activeSession) return;
    const session = newSession(activeSession.cwd || project.path, activeSession.shell);
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === project.id ? { ...p, sessions: [...p.sessions, session] } : p,
      ),
      activeSessionId: session.id,
      panes: [
        ...s.panes.map((pane, index) => (index === 0 ? { ...pane, direction } : pane)),
        { id: uuid(), sessionId: session.id, direction },
      ],
    }));
  },

  addProject: () => set({ newOpen: true }),
}));

export const selectProject = (state: WorkspaceState) =>
  state.projects.find((p) => p.id === state.activeProjectId);
export const selectSessions = (state: WorkspaceState) =>
  state.projects.find((p) => p.id === state.activeProjectId)?.sessions ?? [];
export const selectActiveSession = (state: WorkspaceState) =>
  selectSessions(state).find((s) => s.id === state.activeSessionId);
