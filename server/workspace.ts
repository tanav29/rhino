export interface WorkspaceState {
  projects: unknown[];
  activeProjectId: string;
  activeSessionId: string;
  panes: unknown[];
  defaultShell?: string;
}

let workspace: WorkspaceState | null = null;

export function getWorkspace() {
  return workspace;
}

export function setWorkspace(next: WorkspaceState) {
  workspace = next;
  return workspace;
}
