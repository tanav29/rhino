import { createApiHandlers } from "./api";
import { attachSession, listAgents } from "./sessions";
import { loadWorkspace, saveWorkspace } from "./workspace-store";
import type { WorkspaceSnapshot } from "../shared/rpc-schema";

export function createBackendHandlers() {
  return {
    ...createApiHandlers(),
    attachSession,
    listAgents,
    loadWorkspace,
    saveWorkspace: ({ workspace }: { workspace: WorkspaceSnapshot }) => {
      saveWorkspace(workspace);
      return null;
    },
  };
}
