"use client";

import { useCallback, useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";

type Device = {
  id: string;
  name: string;
  macAddress: string | null;
  ipAddress: string | null;
  downloadLimitKbps: number | null;
  uploadLimitKbps: number | null;
  monthlyCapBytes: string | null;
  paused: boolean;
  usageMonths: Array<{ bytesIn: string; bytesOut: string }>;
};

type HotspotClient = {
  ip: string;
  macAddress: string | null;
  hostname: string | null;
  reachable: boolean;
  state: string;
  paused: boolean;
};

function formatBytes(raw: string | null | undefined) {
  const value = Number(raw ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function HotspotDevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [hotspotClients, setHotspotClients] = useState<HotspotClient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    const hotspotRes = await fetch("/api/sync/hotspot", { method: "POST" });
    const hotspotJson = await hotspotRes.json();

    if (!hotspotRes.ok) {
      setError(hotspotJson.error ?? "Failed to discover hotspot devices");
      const devicesRes = await fetch("/api/devices");
      const devicesJson = await devicesRes.json();
      setDevices(devicesJson.devices ?? []);
      setHotspotClients([]);
      return;
    }

    setDevices(hotspotJson.devices ?? []);
    setHotspotClients(hotspotJson.clients ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function scanHotspot() {
    setBusy(true);
    setError(null);
    try {
      await refresh();
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

  async function togglePause(device: Device) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/devices/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !device.paused, applyToAgent: true }),
      });
      const json = await res.json();
      if (!res.ok || json.agentError) {
        setError(json.agentError ?? json.error ?? "Pause apply failed");
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function applyDeviceLimits(
    device: Device,
    opts: {
      downloadKBps: string;
      uploadKBps: string;
      monthlyCapMb: string;
    },
  ) {
    setBusy(true);
    setError(null);
    try {
      const downloadKBps = opts.downloadKBps.trim() === "" ? null : Number(opts.downloadKBps);
      const uploadKBps = opts.uploadKBps.trim() === "" ? null : Number(opts.uploadKBps);
      const monthlyCapMb =
        opts.monthlyCapMb.trim() === "" ? null : Number(opts.monthlyCapMb);

      if (downloadKBps != null && (!Number.isFinite(downloadKBps) || downloadKBps < 0)) {
        throw new Error("Download speed must be a number (KB/s)");
      }
      if (uploadKBps != null && (!Number.isFinite(uploadKBps) || uploadKBps < 0)) {
        throw new Error("Upload speed must be a number (KB/s)");
      }
      if (monthlyCapMb != null && (!Number.isFinite(monthlyCapMb) || monthlyCapMb < 0)) {
        throw new Error("Monthly limit must be a number (MB)");
      }

      const downloadLimitKbps =
        downloadKBps == null || downloadKBps === 0 ? null : Math.round(downloadKBps * 8);
      const uploadLimitKbps =
        uploadKBps == null || uploadKBps === 0 ? null : Math.round(uploadKBps * 8);

      const res = await fetch(`/api/devices/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downloadLimitKbps,
          uploadLimitKbps,
          monthlyCapMb,
          applyToAgent: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.agentError) {
        setError(json.agentError ?? json.error ?? "Apply limits failed");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply limits failed");
    } finally {
      setBusy(false);
    }
  }

  async function clearSpeed(device: Device) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/devices/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          downloadLimitKbps: null,
          uploadLimitKbps: null,
          applyToAgent: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.agentError) {
        setError(json.agentError ?? json.error ?? "Clear speed failed");
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const onlineCount = hotspotClients.filter((c) => c.reachable).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-5 border-b border-[var(--line)] pb-8">
        <AppNav />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
              Family gateway
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl leading-none tracking-tight text-[var(--ink)]">
              Hotspot devices
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[var(--muted)]">
              Auto-discovered from Ubuntu DHCP leases. Pause, speed-limit, and set monthly
              caps here.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => void scanHotspot()} disabled={busy} variant="primary">
              Scan hotspot
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

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Connect a phone to KidsNet, then scan if it doesn’t appear yet.
        </p>
        <span className="shrink-0 rounded-full bg-[var(--panel)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
          {onlineCount} online · {devices.length} known
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-[0_1px_0_rgba(28,42,42,0.04)]">
        {devices.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="font-medium text-[var(--ink)]">No hotspot clients found</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Connect a phone to KidsNet, then click Scan hotspot.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {devices.map((device) => {
              const live = hotspotClients.find(
                (c) =>
                  c.ip === device.ipAddress ||
                  (device.macAddress &&
                    c.macAddress === device.macAddress.toLowerCase()),
              );
              return (
                <DeviceRow
                  key={device.id}
                  device={device}
                  online={live?.reachable ?? false}
                  busy={busy}
                  onTogglePause={() => void togglePause(device)}
                  onApplyLimits={(opts) => void applyDeviceLimits(device, opts)}
                  onClearSpeed={() => void clearSpeed(device)}
                />
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function DeviceRow({
  device,
  online,
  busy,
  onTogglePause,
  onApplyLimits,
  onClearSpeed,
}: {
  device: Device;
  online: boolean;
  busy: boolean;
  onTogglePause: () => void;
  onApplyLimits: (opts: {
    downloadKBps: string;
    uploadKBps: string;
    monthlyCapMb: string;
  }) => void;
  onClearSpeed: () => void;
}) {
  const usage = device.usageMonths[0];
  const used = Number(usage?.bytesIn ?? 0) + Number(usage?.bytesOut ?? 0);
  const cap = device.monthlyCapBytes != null ? Number(device.monthlyCapBytes) : null;
  const overCap = cap != null && cap > 0 && used >= cap;

  const initialDown =
    device.downloadLimitKbps != null
      ? String(Math.round(device.downloadLimitKbps / 8))
      : "";
  const initialUp =
    device.uploadLimitKbps != null
      ? String(Math.round(device.uploadLimitKbps / 8))
      : "";
  const initialCap =
    device.monthlyCapBytes != null
      ? String(Math.round(Number(device.monthlyCapBytes) / (1024 * 1024)))
      : "";

  const [downloadKBps, setDownloadKBps] = useState(initialDown);
  const [uploadKBps, setUploadKBps] = useState(initialUp);
  const [monthlyCapMb, setMonthlyCapMb] = useState(initialCap);

  useEffect(() => {
    setDownloadKBps(initialDown);
    setUploadKBps(initialUp);
    setMonthlyCapMb(initialCap);
  }, [device.id, initialDown, initialUp, initialCap]);

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-[var(--ink)]">{device.name}</p>
            {device.paused ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                paused
              </span>
            ) : null}
            <span
              className={
                online
                  ? "rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800"
                  : "rounded bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]"
              }
            >
              {online ? "online" : "offline"}
            </span>
            {overCap ? (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                over cap
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
            {device.ipAddress ?? "no IP"}
            {device.macAddress ? ` · ${device.macAddress}` : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Used this month: {formatBytes(String(used))}
            {device.monthlyCapBytes ? ` / ${formatBytes(device.monthlyCapBytes)}` : ""}
            {overCap ? " — auto-cut active on next sync" : ""}
          </p>
        </div>
        <ChipButton
          disabled={busy}
          onClick={onTogglePause}
          tone={device.paused ? "accent" : "default"}
        >
          {device.paused ? "Unpause" : "Pause net"}
        </ChipButton>
      </div>

      <div className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--background)] p-3 sm:grid-cols-3">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
            Download speed (KB/s)
          </span>
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder="e.g. 250"
            value={downloadKBps}
            onChange={(e) => setDownloadKBps(e.target.value)}
            className="h-10 w-full min-w-0 rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
            Upload speed (KB/s)
          </span>
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder="e.g. 125"
            value={uploadKBps}
            onChange={(e) => setUploadKBps(e.target.value)}
            className="h-10 w-full min-w-0 rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
            Monthly data limit (MB)
          </span>
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder="e.g. 2048"
            value={monthlyCapMb}
            onChange={(e) => setMonthlyCapMb(e.target.value)}
            className="h-10 w-full min-w-0 rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onApplyLimits({ downloadKBps, uploadKBps, monthlyCapMb })}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Apply limits
        </button>
        <ChipButton disabled={busy} onClick={onClearSpeed}>
          Clear speed
        </ChipButton>
      </div>
      <p className="text-[11px] text-[var(--muted)]">
        Speed unit is <strong>KB/s</strong> (kilobytes per second). Leave blank for
        unlimited. Monthly limit is in <strong>MB</strong> (megabytes).
      </p>
    </li>
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

function ChipButton({
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "accent";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        tone === "accent"
          ? "rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          : "rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--panel)] disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}
