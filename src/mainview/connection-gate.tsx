import { useEffect, useState, useSyncExternalStore } from "react";
import App from "./App";
import { BackendConnectionForm } from "./backend-settings";
import { getConnection, subscribeConnection } from "./rpc";
import { MachineSelector } from "./machine-selector";
import logo from "../../assets/logo.png";

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
          className="fixed right-2 top-2 z-50 max-w-[calc(100%-1rem)] rounded-sm border border-destructive bg-popover px-3 py-2 text-xs text-destructive"
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
            <div className="w-full max-w-sm space-y-4 rounded-sm border border-border bg-popover p-4">
              <div className="flex items-center gap-2 text-xs font-medium">
                <img src={logo} alt="" width={24} height={24} className="size-6" />
                Rhino
              </div>
              <div className="space-y-2">
                <h1 className="text-sm font-medium">Connect to a terminal</h1>
                <p className="text-xs leading-relaxed text-muted-foreground">
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
