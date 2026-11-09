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

export function BackendConnectionForm({
  initialUrl,
  onConnected,
}: {
  initialUrl?: string;
  onConnected?: () => void;
}) {
  const connection = useSyncExternalStore(subscribeConnection, getConnection);
  const [url, setUrl] = useState(initialUrl ?? connection.url);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        setBusy(true);
        void connectRemoteBackend(url, pin, name)
          .then(() => onConnected?.())
          .catch((cause) => setError(cause instanceof Error ? cause.message : "Connection failed"))
          .finally(() => setBusy(false));
        setPin("");
      }}
      className="space-y-3"
    >
      <label className="block text-xs font-medium">
        Share link or backend URL
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-machine.trycloudflare.com#token=…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          className={inputClass}
        />
      </label>
      <label className="block text-xs font-medium">
        Machine name <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="e.g. Work laptop"
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

export function BackendSettings({ shareOnly = false }: { shareOnly?: boolean }) {
  const connection = useSyncExternalStore(subscribeConnection, getConnection);
  const [backend, setBackend] = useState<BackendStatus | null>(null);
  const [port, setPort] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let disposed = false;
    let initialized = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () =>
      void desktopRpc?.request
        .getBackendStatus({})
        .then((status) => {
          if (disposed) return;
          setBackend(status);
          setPort((value) => value || String(status.port));
          if (!initialized) {
            setShared(status.shared);
            initialized = true;
          }
        })
        .catch((cause) => {
          if (!disposed) setError(String(cause));
        })
        .finally(() => {
          if (!disposed) timer = setTimeout(refresh, 1500);
        });
    refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
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

  async function shareInternet(enabled: boolean) {
    if (!desktopRpc) return;
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      setBackend(await desktopRpc.request.setInternetSharing({ enabled }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update internet sharing");
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
            Share a public link so someone can open your terminals in Rhino from anywhere.
          </p>
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium">Internet sharing</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || !backend}
                onClick={() =>
                  void shareInternet(
                    !["starting", "running"].includes(backend?.internet.state ?? ""),
                  )
                }
              >
                {backend?.internet.state === "starting"
                  ? "Cancel"
                  : backend?.internet.state === "running"
                    ? "Stop sharing"
                    : "Create public link"}
              </Button>
            </div>
            {backend?.internet.state === "starting" && (
              <p role="status" className="text-xs text-muted-foreground">
                Connecting to Cloudflare…
              </p>
            )}
            {backend?.internet.url && (
              <>
                <code className="block select-text break-all rounded bg-background p-2 text-xs">
                  {backend.internet.url}
                </code>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    void desktopRpc?.request
                      .copyBackendShareLink({})
                      .then(() => setCopied(true))
                      .catch(() => setError("Unable to copy. Select and copy the link above."));
                  }}
                >
                  {copied ? "Copied" : "Copy share link"}
                </Button>
              </>
            )}
            {backend?.internet.error && (
              <p role="alert" className="text-xs text-destructive">
                {backend.internet.error}
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Share the complete link and PIN below with people you trust. They grant full terminal
              access. Keep Rhino running. Stopping sharing disconnects guests; the next link will be
              different. A new link may take a moment to become reachable.
            </p>
          </div>
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
                Enter the link and PIN in Rhino’s machine menu on the right, or open the link in a
                browser. A new PIN disconnects all guests and stops internet sharing. Sharing is off
                when Rhino starts.
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
      {!shareOnly && (
        <section aria-labelledby="remote-backend-heading" className="space-y-3">
          <h2 id="remote-backend-heading" className="text-sm font-medium">
            Control another machine
          </h2>
          <p className="break-all text-xs leading-relaxed text-muted-foreground">
            {connection.url ? `Connected to ${connection.url}` : "Currently using this machine."}
          </p>
          <BackendConnectionForm />
        </section>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Cloudflare links use HTTPS. Use LAN addresses on trusted networks only. PINs and access
        tokens are never saved on this device. cloudflared must be installed to create public links.
      </p>
    </div>
  );
}
