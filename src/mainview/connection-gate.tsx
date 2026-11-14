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
    <div className="flex h-dvh overflow-hidden bg-background">
      {notice && (
        <div
          role="alert"
          className="fixed right-2 top-2 z-50 max-w-[calc(100%-1rem)] rounded-sm border border-destructive bg-popover px-3 py-2 text-xs text-destructive"
        >
          {notice}
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {connection.status === "connected" ? (
          <App key={connection.generation} />
        ) : (
          <main className="relative flex min-h-dvh items-center justify-center bg-background px-6 py-12 text-foreground">
            <div className="absolute right-2 top-1.5">
              <MachineSelector />
            </div>
            <div className="w-full max-w-md rounded-3xl border border-border/60 bg-popover p-7 shadow-2xl shadow-black/10 sm:p-9 [&_input]:h-[42px] [&_button[type=submit]]:h-10 [&_button[type=submit]]:w-full">
              <div className="mb-8 flex items-center gap-3 text-sm font-semibold">
                <img src={logo} alt="" width={32} height={32} className="size-8 rounded-md" />
                <span>Rhino</span>
              </div>
              <div className="mb-7 space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">Connect to a terminal</h1>
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
              <p className="mt-7 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
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
