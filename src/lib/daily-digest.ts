import { prisma } from "@/lib/prisma";
import { createDailyDigest } from "@/lib/omniroute";
import { sendTelegramMessage, telegramConfigured } from "@/lib/telegram";
import { currentYearMonth, formatBytes } from "@/lib/format";

function startOfLocalDay(date = new Date(), timeZone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function localHour(date = new Date(), timeZone = "Asia/Kolkata") {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(date),
  );
}

async function deviceFacts(deviceId: string, ip: string | null, since: Date) {
  const yearMonth = currentYearMonth();
  const [usage, events] = await Promise.all([
    prisma.usageMonth.findUnique({
      where: { deviceId_yearMonth: { deviceId, yearMonth } },
    }),
    prisma.dnsEvent.findMany({
      where: {
        queriedAt: { gte: since },
        OR: [{ deviceId }, ...(ip ? [{ clientIp: ip }] : [])],
      },
      orderBy: { queriedAt: "desc" },
      take: 60,
      select: { domain: true, blocked: true },
    }),
  ]);

  const blocked = events.filter((e) => e.blocked).length;
  const top = new Map<string, number>();
  for (const e of events) {
    top.set(e.domain, (top.get(e.domain) ?? 0) + 1);
  }
  const topDomains = [...top.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, n]) => `${domain}(${n})`)
    .join(", ");

  return {
    bytesIn: usage?.bytesIn ?? BigInt(0),
    bytesOut: usage?.bytesOut ?? BigInt(0),
    dnsCount: events.length,
    blocked,
    topDomains: topDomains || "none",
  };
}

/**
 * Build a short OmniRoute summary per device and optionally send via Telegram.
 */
export async function runDailyDeviceDigest(opts?: {
  force?: boolean;
  sendTelegram?: boolean;
}) {
  const timeZone = process.env.DIGEST_TZ ?? "Asia/Kolkata";
  const digestHour = Number(process.env.DIGEST_HOUR ?? 21); // 9pm IST default
  const period = startOfLocalDay(new Date(), timeZone);
  const force = Boolean(opts?.force);
  const sendTg = opts?.sendTelegram !== false;

  if (!force) {
    const hour = localHour(new Date(), timeZone);
    if (hour !== digestHour) {
      return { skipped: true as const, reason: `waiting for hour ${digestHour} ${timeZone}` };
    }
    const existing = await prisma.aiDigest.findFirst({ where: { period } });
    if (existing) {
      return { skipped: true as const, reason: `already sent for ${period}` };
    }
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const devices = await prisma.device.findMany({
    orderBy: { name: "asc" },
  });

  if (devices.length === 0) {
    const summary = `KidsNet daily (${period}): no devices registered yet.`;
    await prisma.aiDigest.create({ data: { period, summary } });
    if (sendTg && telegramConfigured()) await sendTelegramMessage(summary);
    return { skipped: false as const, period, summary, devices: 0 };
  }

  const sections: string[] = [];
  for (const device of devices) {
    const facts = await deviceFacts(device.id, device.ipAddress, since);
    const cap =
      device.monthlyCapBytes != null
        ? formatBytes(device.monthlyCapBytes)
        : "none";
    const used = formatBytes(facts.bytesIn + facts.bytesOut);
    const overCap =
      device.monthlyCapBytes != null &&
      facts.bytesIn + facts.bytesOut >= device.monthlyCapBytes;

    const prompt = [
      `Device: ${device.name} (${device.ipAddress ?? "no-ip"})`,
      `Paused: ${device.paused}`,
      `Monthly usage so far: ${used} (cap ${cap}${overCap ? ", OVER CAP" : ""})`,
      `Last 24h DNS samples: ${facts.dnsCount} (${facts.blocked} blocked)`,
      `Top domains: ${facts.topDomains}`,
      "Output exactly two bullet lines (• …) for Telegram. Nothing else.",
    ].join("\n");

    let aiLines: string;
    try {
      aiLines = await createDailyDigest(prompt);
    } catch (error) {
      aiLines = `• Usage ${used} · DNS ${facts.dnsCount}/${facts.blocked} blocked · ${
        error instanceof Error ? error.message.slice(0, 80) : "AI unavailable"
      }`;
    }

    sections.push(
      [
        `📱 ${device.name}`,
        `IP ${device.ipAddress ?? "—"} · ${device.paused ? "PAUSED" : "active"}${overCap ? " · OVER CAP" : ""}`,
        `Data ${formatBytes(facts.bytesIn)}↓ / ${formatBytes(facts.bytesOut)}↑ · cap ${cap}`,
        aiLines,
      ].join("\n"),
    );
  }

  const summary = [`📡 KidsNet daily — ${period}`, "", ...sections].join("\n\n");

  await prisma.aiDigest.create({ data: { period, summary } });

  if (sendTg && telegramConfigured()) {
    await sendTelegramMessage(summary);
  }

  return {
    skipped: false as const,
    period,
    summary,
    devices: devices.length,
    telegram: sendTg && telegramConfigured(),
  };
}
