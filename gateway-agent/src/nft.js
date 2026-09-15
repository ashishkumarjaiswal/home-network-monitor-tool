import { run, runOk } from "./exec.js";

const TABLE = "monitor_tool";

export async function ensureNft(hotspotIf) {
  const listed = await run("nft", ["list", "table", "inet", TABLE]);
  if (!listed.ok) {
    await runOk("nft", ["add", "table", "inet", TABLE]);
  }

  await ensureChain("forward", [
    "type",
    "filter",
    "hook",
    "forward",
    "priority",
    "0",
    ";",
    "policy",
    "accept",
    ";",
  ]);

  await ensureSet("paused", ["type", "ipv4_addr", ";"]);
  await ensureSet("metered_up", ["type", "ipv4_addr", ";", "flags", "dynamic", ";", "counter", ";"]);
  await ensureSet("metered_down", [
    "type",
    "ipv4_addr",
    ";",
    "flags",
    "dynamic",
    ";",
    "counter",
    ";",
  ]);

  const rules = await run("nft", ["-a", "list", "chain", "inet", TABLE, "forward"]);
  const text = `${rules.stdout}\n${rules.stderr}`;

  if (!text.includes('comment "monitor-pause-src"')) {
    await runOk("nft", [
      "add",
      "rule",
      "inet",
      TABLE,
      "forward",
      "ip",
      "saddr",
      "@paused",
      "drop",
      "comment",
      "monitor-pause-src",
    ]);
  }
  if (!text.includes('comment "monitor-pause-dst"')) {
    await runOk("nft", [
      "add",
      "rule",
      "inet",
      TABLE,
      "forward",
      "ip",
      "daddr",
      "@paused",
      "drop",
      "comment",
      "monitor-pause-dst",
    ]);
  }
  if (!text.includes('comment "monitor-meter-up"')) {
    await runOk("nft", [
      "add",
      "rule",
      "inet",
      TABLE,
      "forward",
      "iifname",
      hotspotIf,
      "update",
      "@metered_up",
      "{",
      "ip",
      "saddr",
      "}",
      "comment",
      "monitor-meter-up",
    ]);
  }
  if (!text.includes('comment "monitor-meter-down"')) {
    await runOk("nft", [
      "add",
      "rule",
      "inet",
      TABLE,
      "forward",
      "oifname",
      hotspotIf,
      "update",
      "@metered_down",
      "{",
      "ip",
      "daddr",
      "}",
      "comment",
      "monitor-meter-down",
    ]);
  }
}

async function ensureChain(name, bodyTokens) {
  const exists = await run("nft", ["list", "chain", "inet", TABLE, name]);
  if (exists.ok) return;
  await runOk("nft", ["add", "chain", "inet", TABLE, name, "{", ...bodyTokens, "}"]);
}

async function ensureSet(name, bodyTokens) {
  const exists = await run("nft", ["list", "set", "inet", TABLE, name]);
  if (exists.ok) return;
  await runOk("nft", ["add", "set", "inet", TABLE, name, "{", ...bodyTokens, "}"]);
}

export async function setPaused(ip, paused) {
  if (paused) {
    const r = await run("nft", ["add", "element", "inet", TABLE, "paused", "{", ip, "}"]);
    if (!r.ok && !/exists|File exists/i.test(r.stderr)) {
      throw new Error(r.stderr || "failed to pause");
    }
  } else {
    await run("nft", ["delete", "element", "inet", TABLE, "paused", "{", ip, "}"]);
  }
}

export async function listPaused() {
  const out = await run("nft", ["-j", "list", "set", "inet", TABLE, "paused"]);
  if (!out.ok) return [];
  try {
    const json = JSON.parse(out.stdout);
    return parseSetElements(json);
  } catch {
    return [];
  }
}

export async function getMeterStats() {
  const [up, down] = await Promise.all([
    run("nft", ["-j", "list", "set", "inet", TABLE, "metered_up"]),
    run("nft", ["-j", "list", "set", "inet", TABLE, "metered_down"]),
  ]);

  const upMap = up.ok ? parseSetCounters(JSON.parse(up.stdout)) : new Map();
  const downMap = down.ok ? parseSetCounters(JSON.parse(down.stdout)) : new Map();

  const ips = new Set([...upMap.keys(), ...downMap.keys()]);
  const stats = [];
  for (const ip of ips) {
    stats.push({
      ip,
      bytesUp: upMap.get(ip)?.bytes ?? 0,
      bytesDown: downMap.get(ip)?.bytes ?? 0,
      packetsUp: upMap.get(ip)?.packets ?? 0,
      packetsDown: downMap.get(ip)?.packets ?? 0,
    });
  }
  return stats;
}

function parseSetElements(json) {
  const ips = [];
  for (const entry of json.nftables ?? []) {
    const el = entry.element ?? entry.set?.elem;
    if (!el) continue;
  }
  // nft -j structure: nftables[].set.elem as array of objects or values
  for (const entry of json.nftables ?? []) {
    if (!entry.set?.elem) continue;
    for (const item of entry.set.elem) {
      if (typeof item === "string") ips.push(item);
      else if (item?.val) ips.push(String(item.val));
      else if (item?.elem?.val) ips.push(String(item.elem.val));
      else if (item?.["elem"] && typeof item.elem === "string") ips.push(item.elem);
    }
  }
  return ips;
}

function parseSetCounters(json) {
  const map = new Map();
  for (const entry of json.nftables ?? []) {
    const elems = entry.set?.elem;
    if (!Array.isArray(elems)) continue;
    for (const item of elems) {
      // shapes vary by nft version
      let ip = null;
      let bytes = 0;
      let packets = 0;

      if (typeof item === "string") {
        ip = item;
      } else if (item?.elem) {
        ip = typeof item.elem === "string" ? item.elem : item.elem?.val ?? item.elem?.["*"] ?? null;
        const c = item.counter ?? item.elem?.counter;
        bytes = Number(c?.bytes ?? 0);
        packets = Number(c?.packets ?? 0);
      } else if (item?.val != null) {
        ip = String(item.val);
        bytes = Number(item.counter?.bytes ?? 0);
        packets = Number(item.counter?.packets ?? 0);
      }

      if (ip) map.set(ip, { bytes, packets });
    }
  }
  return map;
}
