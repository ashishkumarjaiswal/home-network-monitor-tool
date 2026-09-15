import { readFile } from "node:fs/promises";
import { run } from "./exec.js";

/**
 * NetworkManager dnsmasq lease line:
 *   <expiry> <mac> <ip> <hostname> <client-id>
 */
function parseLeaseLine(line) {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const [expiry, mac, ip, hostname] = parts;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return null;
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac)) return null;
  const name =
    hostname && hostname !== "*" && hostname !== "none" ? hostname : null;
  return {
    ip,
    macAddress: mac.toLowerCase(),
    hostname: name,
    expiresAt: Number(expiry) ? new Date(Number(expiry) * 1000).toISOString() : null,
    source: "dhcp",
  };
}

async function readLeaseFile(path) {
  try {
    const text = await readFile(path, "utf8");
    return text
      .split("\n")
      .map(parseLeaseLine)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function readNeigh(hotspotIf) {
  const result = await run("ip", ["-4", "neigh", "show", "dev", hotspotIf]);
  if (!result.ok) return [];
  const clients = [];
  for (const line of result.stdout.split("\n")) {
    // 10.42.0.67 lladdr 26:b5:db:74:94:df REACHABLE
    const m = line.match(
      /^(\d+\.\d+\.\d+\.\d+)\s+lladdr\s+(([0-9a-f]{2}:){5}[0-9a-f]{2})\s+(\S+)/i,
    );
    if (!m) continue;
    clients.push({
      ip: m[1],
      macAddress: m[2].toLowerCase(),
      hostname: null,
      expiresAt: null,
      reachable: !/FAILED|INCOMPLETE/i.test(m[4]),
      state: m[4],
      source: "neigh",
    });
  }
  return clients;
}

export async function listHotspotClients(hotspotIf) {
  const leasePath =
    process.env.DHCP_LEASES_FILE ??
    `/var/lib/NetworkManager/dnsmasq-${hotspotIf}.leases`;

  const [leases, neigh] = await Promise.all([
    readLeaseFile(leasePath),
    readNeigh(hotspotIf),
  ]);

  /** @type {Map<string, object>} */
  const byIp = new Map();

  for (const row of leases) {
    byIp.set(row.ip, {
      ...row,
      reachable: false,
      state: "lease",
    });
  }

  for (const row of neigh) {
    const existing = byIp.get(row.ip);
    if (existing) {
      byIp.set(row.ip, {
        ...existing,
        macAddress: row.macAddress || existing.macAddress,
        reachable: row.reachable,
        state: row.state,
      });
    } else {
      byIp.set(row.ip, row);
    }
  }

  return [...byIp.values()].sort((a, b) => {
    if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
    return a.ip.localeCompare(b.ip, undefined, { numeric: true });
  });
}
