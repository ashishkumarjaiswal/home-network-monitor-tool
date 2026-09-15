import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAgentStats } from "@/lib/gateway-agent";
import { currentYearMonth } from "@/lib/format";
import { enforceMonthlyCaps } from "@/lib/enforce-caps";

/**
 * Pull nft byte counters from gateway-agent into UsageMonth, then auto-pause
 * any device over its monthly MB cap.
 */
export async function POST() {
  try {
    const { stats } = await fetchAgentStats();
    const yearMonth = currentYearMonth();
    let updated = 0;

    for (const row of stats) {
      const device = await prisma.device.findFirst({
        where: { ipAddress: row.ip },
      });
      if (!device) continue;

      await prisma.usageMonth.upsert({
        where: {
          deviceId_yearMonth: { deviceId: device.id, yearMonth },
        },
        create: {
          deviceId: device.id,
          yearMonth,
          bytesIn: BigInt(row.bytesDown),
          bytesOut: BigInt(row.bytesUp),
        },
        update: {
          bytesIn: BigInt(row.bytesDown),
          bytesOut: BigInt(row.bytesUp),
        },
      });
      updated += 1;
    }

    const enforcement = await enforceMonthlyCaps();

    return NextResponse.json({
      ok: true,
      updated,
      seen: stats.length,
      enforcement,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "usage sync failed",
      },
      { status: 500 },
    );
  }
}
