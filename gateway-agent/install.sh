#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="${INSTALL_DIR:-/opt/monitor-gateway-agent}"
SERVICE_NAME="monitor-gateway-agent"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

if ! command -v node >/dev/null; then
  echo "Node.js is required. Install Node 20+ then re-run."
  exit 1
fi

if ! command -v nft >/dev/null || ! command -v tc >/dev/null; then
  apt-get update
  apt-get install -y nftables iproute2
fi

if ! command -v rsync >/dev/null; then
  apt-get update
  apt-get install -y rsync
fi

mkdir -p "$INSTALL_DIR"
rsync -a \
  --exclude node_modules \
  --exclude .env \
  "$ROOT/" "$INSTALL_DIR/"

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  TOKEN="$(openssl rand -hex 24)"
  cat >"$INSTALL_DIR/.env" <<EOF
AGENT_HOST=0.0.0.0
AGENT_PORT=4010
AGENT_TOKEN=$TOKEN
HOTSPOT_IF=wlp0s20f3
WAN_IF=enp2s0
EOF
  echo "Wrote $INSTALL_DIR/.env"
  echo "AGENT_TOKEN=$TOKEN"
else
  echo "Keeping existing $INSTALL_DIR/.env"
  # shellcheck disable=SC1091
  set -a
  source "$INSTALL_DIR/.env"
  set +a
  echo "AGENT_TOKEN=${AGENT_TOKEN:-}"
fi

NODE_BIN="$(command -v node)"

cat >"/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Monitor gateway agent (tc/nft hotspot controls)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$NODE_BIN $INSTALL_DIR/src/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
sleep 1
systemctl --no-pager --full status "$SERVICE_NAME" || true

echo
echo "Health check:"
curl -s "http://127.0.0.1:4010/health" || true
echo
echo
echo "Add to Next.js .env:"
echo "GATEWAY_AGENT_URL=http://192.168.31.7:4010"
echo "GATEWAY_AGENT_TOKEN=<token printed above>"
