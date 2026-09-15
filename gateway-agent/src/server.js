import http from "node:http";
import { ensureNft, setPaused, listPaused, getMeterStats } from "./nft.js";
import { setLimits, clearLimits, ensureRootQdisc } from "./tc.js";
import { listHotspotClients } from "./clients.js";

const PORT = Number(process.env.AGENT_PORT ?? 4010);
const HOST = process.env.AGENT_HOST ?? "0.0.0.0";
const TOKEN = process.env.AGENT_TOKEN ?? "";
const HOTSPOT_IF = process.env.HOTSPOT_IF ?? "wlp0s20f3";
const WAN_IF = process.env.WAN_IF ?? "enp2s0";

function unauthorized(res) {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "unauthorized" }));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function checkAuth(req) {
  if (!TOKEN) return true;
  const header = req.headers.authorization ?? "";
  if (header === `Bearer ${TOKEN}`) return true;
  if (req.headers["x-agent-token"] === TOKEN) return true;
  return false;
}

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function boot() {
  if (!TOKEN) {
    console.warn("[gateway-agent] WARNING: AGENT_TOKEN is empty — anyone on the LAN can call the agent");
  }

  await ensureNft(HOTSPOT_IF);
  await ensureRootQdisc(HOTSPOT_IF);
  await ensureRootQdisc(WAN_IF);
  console.log(`[gateway-agent] nft+tc ready hotspot=${HOTSPOT_IF} wan=${WAN_IF}`);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (url.pathname === "/health" && req.method === "GET") {
        return send(res, 200, {
          ok: true,
          hotspotIf: HOTSPOT_IF,
          wanIf: WAN_IF,
          time: new Date().toISOString(),
        });
      }

      if (!checkAuth(req)) return unauthorized(res);

      if (url.pathname === "/clients" && req.method === "GET") {
        const clients = await listHotspotClients(HOTSPOT_IF);
        const paused = await listPaused();
        return send(res, 200, {
          hotspotIf: HOTSPOT_IF,
          clients: clients.map((c) => ({
            ...c,
            paused: paused.includes(c.ip),
          })),
        });
      }

      if (url.pathname === "/stats" && req.method === "GET") {
        const ip = url.searchParams.get("ip");
        const paused = await listPaused();
        const stats = await getMeterStats();
        const filtered = ip ? stats.filter((s) => s.ip === ip) : stats;
        return send(res, 200, {
          paused,
          stats: filtered.map((s) => ({
            ...s,
            paused: paused.includes(s.ip),
          })),
        });
      }

      const clientMatch = url.pathname.match(/^\/clients\/([^/]+)$/);
      if (clientMatch && req.method === "PUT") {
        const ip = decodeURIComponent(clientMatch[1]);
        if (!/^10\.42\.0\.\d{1,3}$/.test(ip)) {
          return send(res, 400, { error: "ip must be in hotspot subnet 10.42.0.0/24" });
        }
        const body = await readJson(req);
        const paused = Boolean(body.paused);
        await setPaused(ip, paused);

        const downloadKbps =
          body.downloadKbps == null ? null : Number(body.downloadKbps);
        const uploadKbps = body.uploadKbps == null ? null : Number(body.uploadKbps);

        if (
          (downloadKbps == null || downloadKbps <= 0) &&
          (uploadKbps == null || uploadKbps <= 0)
        ) {
          // leave existing classes; only clear if explicitly null and clearLimits flag
          if (body.clearLimits) {
            await clearLimits({ hotspotIf: HOTSPOT_IF, wanIf: WAN_IF, ip });
          }
        } else {
          await setLimits({
            hotspotIf: HOTSPOT_IF,
            wanIf: WAN_IF,
            ip,
            downloadKbps: downloadKbps && downloadKbps > 0 ? downloadKbps : null,
            uploadKbps: uploadKbps && uploadKbps > 0 ? uploadKbps : null,
          });
        }

        return send(res, 200, {
          ok: true,
          ip,
          paused,
          downloadKbps,
          uploadKbps,
        });
      }

      if (clientMatch && req.method === "DELETE") {
        const ip = decodeURIComponent(clientMatch[1]);
        await setPaused(ip, false);
        await clearLimits({ hotspotIf: HOTSPOT_IF, wanIf: WAN_IF, ip });
        return send(res, 200, { ok: true, ip, cleared: true });
      }

      send(res, 404, { error: "not found" });
    } catch (error) {
      console.error("[gateway-agent]", error);
      send(res, 500, {
        error: error instanceof Error ? error.message : "internal error",
      });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[gateway-agent] listening on http://${HOST}:${PORT}`);
  });
}

boot().catch((err) => {
  console.error("[gateway-agent] failed to start", err);
  process.exit(1);
});
