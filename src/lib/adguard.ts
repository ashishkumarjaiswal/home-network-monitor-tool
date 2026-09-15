export type AdGuardQuery = {
  domain: string;
  client: string;
  blocked: boolean;
  reason: string | null;
  queriedAt: Date;
};

type AdGuardQueryLogItem = {
  question?: { name?: string };
  client?: string;
  reason?: string;
  status?: string;
  time?: string;
};

function basicAuthHeader(user: string, pass: string) {
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

export async function fetchAdGuardQueryLog(limit = 100): Promise<AdGuardQuery[]> {
  const base = process.env.ADGUARD_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("ADGUARD_URL is not set");
  }

  const user = process.env.ADGUARD_USER ?? "";
  const pass = process.env.ADGUARD_PASSWORD ?? "";

  const url = `${base}/control/querylog?limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      Authorization: basicAuthHeader(user, pass),
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AdGuard querylog failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { data?: AdGuardQueryLogItem[] };
  const rows = data.data ?? [];

  return rows.map((row) => {
    const reason = row.reason ?? row.status ?? null;
    const blocked =
      Boolean(reason) &&
      /filtered|blocked|parental|safebrowsing|safe_search/i.test(String(reason));

    return {
      domain: row.question?.name?.replace(/\.$/, "") ?? "unknown",
      client: row.client ?? "unknown",
      blocked,
      reason,
      queriedAt: row.time ? new Date(row.time) : new Date(),
    };
  });
}

export async function checkAdGuardHealth(): Promise<{ ok: boolean; detail: string }> {
  const base = process.env.ADGUARD_URL?.replace(/\/$/, "");
  if (!base) {
    return { ok: false, detail: "ADGUARD_URL missing" };
  }

  try {
    const user = process.env.ADGUARD_USER ?? "";
    const pass = process.env.ADGUARD_PASSWORD ?? "";
    const res = await fetch(`${base}/control/status`, {
      headers: { Authorization: basicAuthHeader(user, pass) },
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status}` };
    }
    return { ok: true, detail: "reachable" };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "unreachable",
    };
  }
}
