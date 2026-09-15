type AgentClientState = {
  paused?: boolean;
  downloadKbps?: number | null;
  uploadKbps?: number | null;
  clearLimits?: boolean;
};

function agentBase() {
  return (process.env.GATEWAY_AGENT_URL ?? "").replace(/\/$/, "");
}

function agentHeaders(): HeadersInit {
  const token = process.env.GATEWAY_AGENT_TOKEN ?? "";
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function checkGatewayAgent(): Promise<{ ok: boolean; detail: string }> {
  const base = agentBase();
  if (!base) return { ok: false, detail: "GATEWAY_AGENT_URL missing" };
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store" });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const json = (await res.json()) as { ok?: boolean };
    return { ok: Boolean(json.ok), detail: "reachable" };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "unreachable",
    };
  }
}

export async function applyClientPolicy(ip: string, state: AgentClientState) {
  const base = agentBase();
  if (!base) throw new Error("GATEWAY_AGENT_URL is not set");

  const res = await fetch(`${base}/clients/${encodeURIComponent(ip)}`, {
    method: "PUT",
    headers: agentHeaders(),
    body: JSON.stringify(state),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error ?? `gateway-agent HTTP ${res.status}`,
    );
  }
  return json;
}

export async function fetchHotspotClients() {
  const base = agentBase();
  if (!base) throw new Error("GATEWAY_AGENT_URL is not set");

  const res = await fetch(`${base}/clients`, {
    headers: agentHeaders(),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error ?? `gateway-agent HTTP ${res.status}`,
    );
  }
  return json as {
    hotspotIf: string;
    clients: Array<{
      ip: string;
      macAddress: string | null;
      hostname: string | null;
      reachable: boolean;
      state: string;
      paused: boolean;
      source: string;
      expiresAt: string | null;
    }>;
  };
}

export async function fetchAgentStats(ip?: string) {
  const base = agentBase();
  if (!base) throw new Error("GATEWAY_AGENT_URL is not set");

  const url = new URL(`${base}/stats`);
  if (ip) url.searchParams.set("ip", ip);

  const res = await fetch(url, {
    headers: agentHeaders(),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error ?? `gateway-agent HTTP ${res.status}`,
    );
  }
  return json as {
    paused: string[];
    stats: Array<{
      ip: string;
      bytesUp: number;
      bytesDown: number;
      paused: boolean;
    }>;
  };
}
