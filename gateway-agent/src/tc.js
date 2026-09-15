import { run, runOk } from "./exec.js";

/** Map last octet → HTB class minor id (10..264) */
export function classIdForIp(ip) {
  const parts = ip.split(".").map(Number);
  const last = parts[3];
  if (!Number.isFinite(last) || last < 1 || last > 254) {
    throw new Error(`Invalid client IP for shaping: ${ip}`);
  }
  return 10 + last;
}

export async function ensureRootQdisc(iface) {
  const show = await run("tc", ["qdisc", "show", "dev", iface]);
  if (show.stdout.includes("htb 1:")) return;

  await run("tc", ["qdisc", "del", "dev", iface, "root"]);
  await runOk("tc", [
    "qdisc",
    "add",
    "dev",
    iface,
    "root",
    "handle",
    "1:",
    "htb",
    "default",
    "999",
  ]);
  await runOk("tc", [
    "class",
    "add",
    "dev",
    iface,
    "parent",
    "1:",
    "classid",
    "1:1",
    "htb",
    "rate",
    "1000mbit",
    "ceil",
    "1000mbit",
  ]);
  await runOk("tc", [
    "class",
    "add",
    "dev",
    iface,
    "parent",
    "1:1",
    "classid",
    "1:999",
    "htb",
    "rate",
    "1000mbit",
    "ceil",
    "1000mbit",
  ]);
}

async function upsertClass(iface, classMinor, rateKbit) {
  const classid = `1:${classMinor}`;
  const rate = `${Math.max(8, rateKbit)}kbit`;
  const replace = await run("tc", [
    "class",
    "replace",
    "dev",
    iface,
    "parent",
    "1:1",
    "classid",
    classid,
    "htb",
    "rate",
    rate,
    "ceil",
    rate,
  ]);
  if (!replace.ok) {
    await runOk("tc", [
      "class",
      "add",
      "dev",
      iface,
      "parent",
      "1:1",
      "classid",
      classid,
      "htb",
      "rate",
      rate,
      "ceil",
      rate,
    ]);
  }
}

async function clearFiltersForClass(iface, classMinor) {
  const show = await run("tc", ["filter", "show", "dev", iface, "parent", "1:"]);
  const lines = show.stdout.split("\n");
  // Best-effort: delete all u32 filters then re-add active ones via setLimit
  // Prefer deleting by prefer matching flowid
  const flowid = `1:${classMinor}`;
  if (show.stdout.includes(flowid)) {
    await run("tc", ["filter", "del", "dev", iface, "parent", "1:", "protocol", "ip", "prio", "1"]);
  }
}

/**
 * Download shaping: packets leaving hotspot iface toward client (dst IP).
 * Upload shaping: packets leaving WAN iface from client (src IP).
 */
export async function setLimits(opts) {
  const { hotspotIf, wanIf, ip, downloadKbps, uploadKbps } = opts;
  await ensureRootQdisc(hotspotIf);
  await ensureRootQdisc(wanIf);

  const minor = classIdForIp(ip);

  if (downloadKbps == null || downloadKbps <= 0) {
    await run("tc", ["class", "del", "dev", hotspotIf, "classid", `1:${minor}`]);
  } else {
    await upsertClass(hotspotIf, minor, downloadKbps);
    await run("tc", [
      "filter",
      "replace",
      "dev",
      hotspotIf,
      "protocol",
      "ip",
      "parent",
      "1:",
      "prio",
      "1",
      "u32",
      "match",
      "ip",
      "dst",
      ip,
      "flowid",
      `1:${minor}`,
    ]);
  }

  if (uploadKbps == null || uploadKbps <= 0) {
    await run("tc", ["class", "del", "dev", wanIf, "classid", `1:${minor}`]);
  } else {
    await upsertClass(wanIf, minor, uploadKbps);
    await run("tc", [
      "filter",
      "replace",
      "dev",
      wanIf,
      "protocol",
      "ip",
      "parent",
      "1:",
      "prio",
      "1",
      "u32",
      "match",
      "ip",
      "src",
      ip,
      "flowid",
      `1:${minor}`,
    ]);
  }
}

export async function clearLimits(opts) {
  const { hotspotIf, wanIf, ip } = opts;
  const minor = classIdForIp(ip);
  await run("tc", ["filter", "del", "dev", hotspotIf, "parent", "1:", "protocol", "ip", "prio", "1"]);
  await run("tc", ["filter", "del", "dev", wanIf, "parent", "1:", "protocol", "ip", "prio", "1"]);
  await run("tc", ["class", "del", "dev", hotspotIf, "classid", `1:${minor}`]);
  await run("tc", ["class", "del", "dev", wanIf, "classid", `1:${minor}`]);
}
