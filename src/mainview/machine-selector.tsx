import { useState, useSyncExternalStore } from "react";
import { Check, Globe, Monitor, Plus, Server, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BackendConnectionForm, BackendSettings } from "./backend-settings";
import {
  backendConnections,
  desktopRpc,
  getConnection,
  subscribeConnection,
  switchToLocalBackend,
} from "./rpc";

export function MachineSelector() {
  const connection = useSyncExternalStore(subscribeConnection, getConnection);
  const [dialog, setDialog] = useState<"connect" | "share" | "manage" | null>(null);
  const [url, setUrl] = useState("");
  const selected = connection.machines.find((machine) => machine.url === connection.url);
  const label = selected?.name ?? (desktopRpc ? "This machine" : "Choose a machine");

  function connect(value = "") {
    setUrl(value);
    setDialog("connect");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Switch machine: ${label}`}
              title={`Switch machine: ${label}`}
              className="ui-icon-button relative"
            />
          }
        >
          {connection.url ? <Globe size={14} /> : <Monitor size={14} />}
          <span
            className={`absolute bottom-1 right-1 size-1.5 rounded-full ${connection.status === "connected" ? "bg-success" : "bg-destructive"}`}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Machines</div>
          {desktopRpc && (
            <DropdownMenuItem onClick={switchToLocalBackend}>
              <Monitor />
              <span className="flex-1">This machine</span>
              {!connection.url && <Check aria-label="Selected" />}
            </DropdownMenuItem>
          )}
          {connection.machines.map((machine) => (
            <DropdownMenuItem
              key={machine.url}
              onClick={() => {
                if (!backendConnections.switchToRemote(machine.url)) connect(machine.url);
              }}
            >
              <Server
                className={
                  machine.status === "disconnected"
                    ? "text-destructive"
                    : machine.status === "connected"
                      ? "text-success"
                      : "text-muted-foreground"
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{machine.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {machine.status === "connected"
                    ? "Connected"
                    : machine.status === "connecting"
                      ? "Connecting…"
                      : "Reconnect"}{" "}
                  · {new URL(machine.url).host}
                </span>
              </span>
              {connection.url === machine.url && <Check aria-label="Selected" />}
            </DropdownMenuItem>
          ))}
          <div role="separator" className="my-1 border-t border-border" />
          <DropdownMenuItem onClick={() => connect()}>
            <Plus />
            Add a machine
          </DropdownMenuItem>
          {desktopRpc && (
            <DropdownMenuItem onClick={() => setDialog("share")}>
              <Share2 />
              Share this machine
            </DropdownMenuItem>
          )}
          {connection.machines.length > 0 && (
            <DropdownMenuItem onClick={() => setDialog("manage")}>
              <Server />
              Manage machines
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog === "share"
                ? "Share this machine"
                : dialog === "manage"
                  ? "Manage machines"
                  : "Add a machine"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "share"
                ? "Let someone you trust access this machine’s terminals."
                : dialog === "manage"
                  ? "Removing a machine disconnects this app. Its terminals keep running."
                  : "Paste a Rhino share link or backend address and enter the host’s PIN."}
            </DialogDescription>
          </DialogHeader>
          <div className="p-3">
            {dialog === "connect" && (
              <BackendConnectionForm
                key={url}
                initialUrl={url}
                onConnected={() => setDialog(null)}
              />
            )}
            {dialog === "share" && <BackendSettings shareOnly />}
            {dialog === "manage" && (
              <div className="space-y-2">
                {connection.machines.map((machine) => (
                  <div key={machine.url} className="flex items-center gap-3 py-2">
                    <Server size={16} className="shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="truncate font-medium">{machine.name}</p>
                      <p className="truncate text-muted-foreground">{machine.url}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${machine.name}`}
                      onClick={() => backendConnections.forget(machine.url)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                {!connection.machines.length && (
                  <p className="text-xs text-muted-foreground">No saved machines.</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
