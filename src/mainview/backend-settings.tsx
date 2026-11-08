import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { BackendStatus } from "../shared/rpc-schema";
import {
  connectRemoteBackend,
  desktopRpc,
  getConnection,
  subscribeConnection,
  switchToLocalBackend,
} from "./rpc";

const inputClass =
  "mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-ring disabled:opacity-50";

export function BackendConnectionForm() {
  const connection = useSyncExternalStore(subscribeConnection, getConnection);
  const [url, setUrl] = useState(connection.url);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const busy = connection.status === "connecting";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        void connectRemoteBackend(url, pin).catch((cause) =>
          setError(cause instanceof Error ? cause.message : "Connection failed"),
        );
        setPin("");
      }}
      className="space-y-3"
    >
      <label className="block text-xs font-medium">
        Backend URL
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://192.168.1.10:43188"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          className={inputClass}
        />
      </label>
      <label className="block text-xs font-medium">
        Six-digit PIN
        <input
          type="password"
          required
          inputMode="numeric"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          autoComplete="off"
          disabled={busy}
          className={`${inputClass} font-mono tracking-[0.25em]`}
        />
      </label>
      {(error || connection.error) && (
        <p role="alert" className="text-xs text-destructive">
          {error || connection.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={busy}>
          {busy ? "Connecting…" : "Connect"}
        </Button>
        {desktopRpc && (connection.url || connection.status !== "connected") && (
          <Button type="button" variant="outline" onClick={switchToLocalBackend}>
            Use this machine
          </Button>
        )}
      </div>
    </form>
  );
}

export function BackendSettings() {
  const connection = useSyncExternalStore(subscribeConnection, getConnection);
  const [backend, setBackend] = useState<BackendStatus | null>(null);
  const [port, setPort] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  useEffect(() => {
    let disposed = false;
    void desktopRpc?.request
      .getBackendStatus({})
      .then((status) => {
        if (disposed) return;
        setBackend(status);
        setPort(String(status.port));
        setShared(status.shared);
      })
      .catch((cause) => {
        if (!disposed) setError(String(cause));
      });
    return () => {
      disposed = true;
    };
  }, []);

  async function configure(regeneratePin = false) {
    if (!desktopRpc) return;
    setBusy(true);
    setError("");
    try {
      const status = await desktopRpc.request.configureBackend({
        port: Number(port),
        shared,
        regeneratePin,
      });
      setBackend(status);
      if (regeneratePin) setShowPin(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update backend");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-5 border-t border-border pt-5">
      {desktopRpc && (
        <section aria-labelledby="share-backend-heading" className="space-y-3">
          <h2 id="share-backend-heading" className="text-sm font-medium">
            Share this machine
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Allow another device on your network to use this machine’s terminal.
          </p>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
              disabled={busy || !backend}
              className="accent-ring"
            />
            Enable network sharing
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void configure();
            }}
            className="flex items-end gap-2"
          >
            <label className="min-w-0 flex-1 text-xs font-medium">
              Port
              <input
                type="number"
                min={1}
                max={65535}
                required
                value={port}
                onChange={(e) => setPort(e.target.value)}
                disabled={busy || !backend}
                className={inputClass}
              />
            </label>
            <Button type="submit" variant="outline" disabled={busy || !backend} className="mb-0.5">
              {busy ? "Applying…" : "Apply"}
            </Button>
          </form>
          {backend && (
            <>
              <p role="status" className="text-xs text-muted-foreground">
                {backend.running
                  ? backend.shared
                    ? "Listening on your network"
                    : "Listening on this machine only"
                  : "Backend is stopped"}
              </p>
              {backend.urls.map((url) => (
                <code
                  key={url}
                  className="block select-text break-all rounded-md bg-background px-2.5 py-2 text-xs"
                >
                  {url}
                </code>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium">PIN</span>
                <output
                  aria-label="Connection PIN"
                  className="select-text font-mono text-base tracking-[0.2em]"
                >
                  {showPin ? backend.pin : "••••••"}
                </output>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowPin(!showPin)}
                >
                  {showPin ? "Hide" : "Show"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={busy}
                  onClick={() => void configure(true)}
                >
                  New PIN
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Open the address on another device and enter this PIN. A new PIN disconnects all
                remote clients. Sharing is off each time the app starts.
              </p>
            </>
          )}
          {(error || backend?.error) && (
            <p role="alert" className="text-xs text-destructive">
              {error || backend?.error}
            </p>
          )}
        </section>
      )}
      <section aria-labelledby="remote-backend-heading" className="space-y-3">
        <h2 id="remote-backend-heading" className="text-sm font-medium">
          Control another machine
        </h2>
        <p className="break-all text-xs leading-relaxed text-muted-foreground">
          {connection.url ? `Connected to ${connection.url}` : "Currently using this machine."}
        </p>
        <BackendConnectionForm />
      </section>
      <p className="text-xs leading-relaxed text-muted-foreground">
        The PIN grants full terminal access. Use a trusted network; HTTP connections are not
        encrypted. The PIN is never saved on this device.
      </p>
    </div>
  );
}
