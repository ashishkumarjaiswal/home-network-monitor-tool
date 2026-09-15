import { prisma } from "@/lib/prisma";
import { fetchAdGuardQueryLog } from "@/lib/adguard";

export async function syncAdGuardQueries(limit = 100) {
  const queries = await fetchAdGuardQueryLog(limit);
  let inserted = 0;

  for (const q of queries) {
    const device = await prisma.device.findFirst({
      where: {
        OR: [{ ipAddress: q.client }, { name: q.client }],
      },
    });

    const existing = await prisma.dnsEvent.findFirst({
      where: {
        domain: q.domain,
        clientIp: q.client,
        queriedAt: q.queriedAt,
      },
    });

    if (existing) continue;

    await prisma.dnsEvent.create({
      data: {
        deviceId: device?.id,
        clientIp: q.client,
        domain: q.domain,
        blocked: q.blocked,
        reason: q.reason,
        queriedAt: q.queriedAt,
      },
    });
    inserted += 1;
  }

  return { fetched: queries.length, inserted };
}
