# Gateway agent — privileged host service

Runs on the Ubuntu laptop (not in Coolify). Applies per-client:

- **pause** (nftables drop)
- **download/upload kbps** (`tc` HTB)
- **byte counters** (nftables dynamic sets)

## Install on Ubuntu

```bash
cd /path/to/home-network-monitor-tool/gateway-agent
sudo bash install.sh
```

Copy the printed `AGENT_TOKEN` into the Next.js `.env`:

```env
GATEWAY_AGENT_URL=http://<ubuntu-lan-ip>:4010
GATEWAY_AGENT_TOKEN=...
```

Confirm interfaces:

```bash
ip -br a
# HOTSPOT_IF = AP Wi‑Fi iface (example: wlp0s20f3)
# WAN_IF = ethernet uplink (example: enp2s0)
```

Edit `/opt/monitor-gateway-agent/.env` if names differ, then:

```bash
sudo systemctl restart monitor-gateway-agent
```

## API

All routes except `/health` require `Authorization: Bearer <AGENT_TOKEN>`.

| Method | Path | Body / query |
|--------|------|----------------|
| GET | `/health` | — |
| GET | `/clients` | DHCP + neighbor discovery |
| GET | `/stats` | optional `?ip=10.42.0.12` |
| PUT | `/clients/:ip` | `{ "paused": true, "downloadKbps": 2000, "uploadKbps": 1000 }` |
| DELETE | `/clients/:ip` | clear pause + limits |

Example:

```bash
TOKEN=...
curl -s http://127.0.0.1:4010/health
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4010/clients
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4010/stats
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"paused":false,"downloadKbps":1500,"uploadKbps":800}' \
  http://127.0.0.1:4010/clients/10.42.0.12
```

## Notes

- Client IPs must be in `10.42.0.0/24` (NetworkManager shared hotspot default).
- Counters reset if the nft table is flushed; monthly totals are stored in Postgres by the Next.js app/worker.
- Hotspot must be up for forward/meter rules to see traffic.
