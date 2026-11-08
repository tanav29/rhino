import { useSyncExternalStore } from "react";
import App from "./App";
import { BackendConnectionForm } from "./backend-settings";
import { getConnection, subscribeConnection } from "./rpc";

export function ConnectionGate() {
  const connection = useSyncExternalStore(subscribeConnection, getConnection);
  if (connection.status === "connected") return <App key={connection.generation} />;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Connect to a terminal</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Enter the backend address and PIN from the machine you want to control.
          </p>
        </div>
        <BackendConnectionForm />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Keep the host app running with network sharing enabled. The PIN grants full terminal
          access; use a trusted network.
        </p>
      </div>
    </main>
  );
}
