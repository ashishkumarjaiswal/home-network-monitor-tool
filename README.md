# Home Network Monitor Tool

Open-source parental / family network monitor for a **laptop Wi‑Fi hotspot**.

Kids connect to your Ubuntu hotspot (not the home Wi‑Fi). Parents get a dashboard for:

- Auto-discovered hotspot devices
- Pause / speed limits / monthly data caps
- AdGuard Home DNS activity
- Daily short Telegram digests (via OmniRoute)

## Architecture

```text
Phones ──► Ubuntu Wi‑Fi hotspot (10.42.0.0/24)
              │
              ├─ DNS ──► AdGuard Home
              ├─ tc/nft ──► gateway-agent (host, port 4010)
              └─ uplink ──► home ethernet / internet

Parent Mac / Coolify
  └─ Next.js app + Postgres
       ├─ talks to AdGuard API
       ├─ talks to gateway-agent
       └─ optional worker → OmniRoute → Telegram
```

| Piece | Role |
|--------|------|
| **Next.js** | Parent UI + APIs |
| **Postgres** | Devices, usage, DNS events, digests |
| **AdGuard Home** | DNS + query log |
| **gateway-agent** | Privileged `nft` pause + `tc` speed + byte meters |
| **OmniRoute** | LLM proxy for short daily summaries |
| **Telegram bot** | Evening digests to your chat |

## Features

- Discover clients from NetworkManager DHCP leases + neighbor table (no manual IP entry)
- Pause internet per device
- Download / upload speed limits (KB/s in UI)
- Monthly data caps with auto-pause when over
- AdGuard query sync into the dashboard
- Daily Telegram update per device (configurable hour / timezone)

## Requirements

- Ubuntu (or similar) laptop that can run a NetworkManager Wi‑Fi hotspot
- Node.js 20+
- Postgres
- AdGuard Home reachable on the LAN
- Optional: OmniRoute + Telegram bot for digests

## Quick start (dashboard)

```bash
git clone git@github.com:ashishkumarjaiswal/home-network-monitor-tool.git
cd home-network-monitor-tool
cp .env.example .env
# fill DATABASE_URL, ADGUARD_*, GATEWAY_AGENT_*, optional OmniRoute/Telegram

npm install
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- Overview: health + recent DNS  
- `/devices`: hotspot devices, pause, speed, caps  

Background worker (AdGuard sync, usage, daily digest):

```bash
npm run worker
```

## Gateway agent (Ubuntu host)

Must run **on the hotspot machine** (needs root for `nft` / `tc`), not inside the Next.js container.

```bash
cd gateway-agent
sudo bash install.sh
```

Copy the printed `AGENT_TOKEN` into the app `.env`:

```env
GATEWAY_AGENT_URL=http://<ubuntu-lan-ip>:4010
GATEWAY_AGENT_TOKEN=<token>
```

Confirm interface names (`HOTSPOT_IF`, `WAN_IF`) in `/opt/monitor-gateway-agent/.env`, then:

```bash
sudo systemctl restart monitor-gateway-agent
```

See [`gateway-agent/README.md`](gateway-agent/README.md) for the HTTP API.

## Environment

Copy [`.env.example`](.env.example). Important variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection |
| `ADGUARD_URL` / `ADGUARD_USER` / `ADGUARD_PASSWORD` | AdGuard Home API |
| `GATEWAY_AGENT_URL` / `GATEWAY_AGENT_TOKEN` | Host agent |
| `OMNIROUTE_URL` / `OMNIROUTE_API_KEY` | LLM digests |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Daily messages |
| `DIGEST_TZ` / `DIGEST_HOUR` | Default `Asia/Kolkata` @ `21` |

Never commit a real `.env`.

## Deploy notes

- App + Postgres can run on Coolify / Docker (`Dockerfile` included).
- `gateway-agent` stays on the host with systemd.
- From outside Coolify, Postgres needs a reachable host/port or an SSH tunnel.
- After deploy: `npx prisma db push` (or migrate) once.

## Security

- Keep `GATEWAY_AGENT_TOKEN` and Telegram/AdGuard secrets private.
- Prefer binding agent access to your LAN / firewall (UFW).
- Hotspot clients are expected in `10.42.0.0/24` (NetworkManager shared default).

## Contributing

Issues and PRs are welcome. Please:

1. Don’t commit secrets or personal IPs in docs beyond examples.
2. Keep changes focused (UI, agent, or docs).
3. Describe how you tested (hotspot device + pause/speed preferred).

## License

MIT — see [LICENSE](LICENSE).
