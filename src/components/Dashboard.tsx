"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";

type DnsEvent = {
  id: string;
  domain: string;
  clientIp: string | null;
  blocked: boolean;
  reason: string | null;
  queriedAt: string;
  device: { id: string; name: string } | null;
};

type Health = {
  database: { ok: boolean; detail: string };
  adguard: { ok: boolean; detail: string };
  gatewayAgent?: { ok: boolean; detail: string };
  omnirouteConfigured: boolean;
};

function shortenDomain(domain: string) {
  if (domain.length <= 42) return domain;
  return `${domain.slice(0, 20)}…${domain.slice(-18)}`;
}

export function Dashboard() {
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [events, setEvents] = useState<DnsEvent[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    const [healthRes, devicesRes, eventsRes] = await Promise.all([
      fetch("/api/health"),
      fetch("/api/devices"),
      fetch("/api/dns-events?limit=40"),
    ]);

    const healthJson = await healthRes.json();
    setHealth(healthJson);

    const devicesJson = await devicesRes.json();
    if (devicesRes.ok) {
      setDeviceCount((devicesJson.devices ?? []).length);
    }

    // Lightweight online hint (does not upsert) — ignore failures on overview
    try {
      const liveRes = await fetch("/api/sync/hotspot");
      if (liveRes.ok) {
        const live = await liveRes.json();
        const clients = (live.clients ?? []) as Array<{ reachable?: boolean }>;
        setOnlineCount(clients.filter((c) => c.reachable).length);
      }
    } catch {
      setOnlineCount(null);
    }

    const eventsJson = await eventsRes.json();
    if (eventsRes.ok) {
      setEvents(eventsJson.events ?? []);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function syncAdGuard() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/adguard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 100 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function syncUsage() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/usage", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Usage sync failed");
      const paused = json.enforcement?.paused as string[] | undefined;
      if (paused?.length) {
        setError(`Monthly cap reached — paused: ${paused.join(", ")}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Usage sync failed");
    } finally {
      setBusy(false);
    }
  }

  const blockedCount = events.filter((e) => e.blocked).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-5 border-b border-[var(--line)] pb-8">
        <AppNav />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
              Family gateway
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-none tracking-tight text-[var(--ink)] sm:text-5xl">
              Monitor
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
              Health, AdGuard DNS, and usage sync. Manage pause and speed limits on the
              Hotspot devices page.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => void refresh()} disabled={busy} variant="ghost">
              Refresh
            </ActionButton>
            <ActionButton onClick={() => void syncAdGuard()} disabled={busy} variant="primary">
              Sync AdGuard
            </ActionButton>
            <ActionButton onClick={() => void syncUsage()} disabled={busy} variant="ghost">
              Sync usage
            </ActionButton>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatusCard label="Database" ok={health?.database.ok} detail={health?.database.detail ?? "…"} />
        <StatusCard label="AdGuard" ok={health?.adguard.ok} detail={health?.adguard.detail ?? "…"} />
        <StatusCard
          label="Gateway agent"
          ok={health?.gatewayAgent?.ok}
          detail={health?.gatewayAgent?.detail ?? "…"}
        />
        <StatusCard
          label="OmniRoute"
          ok={health?.omnirouteConfigured}
          detail={health?.omnirouteConfigured ? "API key set" : "key missing"}
        />
      </section>

      <Link
        href="/devices"
        className="flex items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-white px-5 py-4 shadow-[0_1px_0_rgba(28,42,42,0.04)] transition hover:border-[var(--accent)]"
      >
        <div>
          <p className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            Hotspot devices
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Pause, speed limits, and monthly caps
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-[var(--accent)]">
          {onlineCount != null && deviceCount != null
            ? `${onlineCount} online · ${deviceCount} known →`
            : deviceCount != null
              ? `${deviceCount} known →`
              : "Open →"}
        </span>
      </Link>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            Recent DNS
          </h2>
          <span className="rounded-full bg-[var(--panel)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
            {events.length} events
            {blockedCount ? ` · ${blockedCount} blocked` : ""}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_1px_0_rgba(28,42,42,0.04)]">
          {events.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-medium text-[var(--ink)]">No DNS events yet</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Click Sync AdGuard after devices browse on the hotspot.
              </p>
            </div>
          ) : (
            <ul className="max-h-[36rem] divide-y divide-[var(--line)] overflow-auto">
              {events.map((event) => (
                <li key={event.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p
                      className="truncate font-mono text-[13px] text-[var(--ink)]"
                      title={event.domain}
                    >
                      {shortenDomain(event.domain)}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {event.device?.name ?? event.clientIp ?? "unknown"} ·{" "}
                      {new Date(event.queriedAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={
                      event.blocked
                        ? "mt-0.5 shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700"
                        : "mt-0.5 shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800"
                    }
                  >
                    {event.blocked ? "blocked" : "ok"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant: "primary" | "ghost";
}) {
  const base =
    "rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-[var(--accent)] text-white hover:opacity-90"
      : "border border-[var(--line)] bg-white text-[var(--ink)] hover:bg-[var(--panel)]";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

function StatusCard({
  label,
  ok,
  detail,
}: {
  label: string;
  ok?: boolean;
  detail: string;
}) {
  const ready = ok === true;
  const bad = ok === false;
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3.5 shadow-[0_1px_0_rgba(28,42,42,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          {label}
        </p>
        <span
          className={
            ready
              ? "h-2 w-2 rounded-full bg-emerald-500"
              : bad
                ? "h-2 w-2 rounded-full bg-red-500"
                : "h-2 w-2 rounded-full bg-[var(--line)]"
          }
          aria-hidden
        />
      </div>
      <p className="mt-2 text-sm font-semibold text-[var(--ink)]">
        {ok == null ? "Checking…" : ok ? "OK" : "Issue"}
      </p>
      <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--muted)]" title={detail}>
        {detail}
      </p>
    </div>
  );
}
