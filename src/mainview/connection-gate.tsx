import { useEffect, useState, useSyncExternalStore } from "react";
import App from "./App";
import { BackendConnectionForm } from "./backend-settings";
import { getConnection, subscribeConnection } from "./rpc";
import { MachineSelector } from "./machine-selector";

export function ConnectionGate() {
  const connection = useSyncExternalStore(subscribeConnection, getConnection);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!connection.error) return;
    setNotice(connection.error);
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [connection.error]);
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {notice && (
        <div
          role="alert"
          className="fixed right-4 top-4 z-50 rounded-md border border-destructive bg-background px-4 py-3 text-sm text-destructive shadow-lg"
        >
          {notice}
        </div>
      )}
      <div className="min-w-0 flex-1">
        {connection.status === "connected" ? (
          <App key={connection.generation} />
        ) : (
          <main className="relative flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
            <div className="absolute right-2 top-1.5">
              <MachineSelector />
            </div>
            <div className="w-full max-w-sm space-y-6">
              <div className="space-y-2">
                <h1 className="text-xl font-semibold tracking-tight">Connect to a terminal</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Enter the backend address and PIN from the machine you want to control.
                </p>
              </div>
              <BackendConnectionForm
                initialUrl={
                  connection.url === location.origin
                    ? `${connection.url}${location.hash}`
                    : connection.url
                }
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Keep the host app running with sharing enabled. Use the complete public link for
                internet access.
              </p>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
