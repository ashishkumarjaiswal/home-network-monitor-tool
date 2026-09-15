/**
 * Background worker — run on Coolify as a second process later:
 *   npx tsx scripts/worker.ts
 */
import "dotenv/config";
import { syncAdGuardQueries } from "../src/lib/sync-adguard";
import { prisma } from "../src/lib/prisma";
import { fetchAgentStats } from "../src/lib/gateway-agent";
import { currentYearMonth } from "../src/lib/format";
import { enforceMonthlyCaps } from "../src/lib/enforce-caps";
import { runDailyDeviceDigest } from "../src/lib/daily-digest";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);

async function syncUsage() {
  const { stats } = await fetchAgentStats();
  const yearMonth = currentYearMonth();
  let updated = 0;
  for (const row of stats) {
    const device = await prisma.device.findFirst({ where: { ipAddress: row.ip } });
    if (!device) continue;
    await prisma.usageMonth.upsert({
      where: { deviceId_yearMonth: { deviceId: device.id, yearMonth } },
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
  return { updated, seen: stats.length, enforcement };
}

async function tick() {
  try {
    const result = await syncAdGuardQueries(100);
    console.log(`[worker] adguard sync fetched=${result.fetched} inserted=${result.inserted}`);
  } catch (error) {
    console.error("[worker] adguard sync failed", error);
  }

  try {
    const usage = await syncUsage();
    console.log(
      `[worker] usage sync updated=${usage.updated} seen=${usage.seen} paused=${usage.enforcement.paused.join(",") || "none"}`,
    );
  } catch (error) {
    console.error("[worker] usage sync failed", error);
  }

  try {
    const digest = await runDailyDeviceDigest();
    if (digest.skipped) {
      // quiet — expected most of the day
    } else {
      console.log(
        `[worker] digest period=${digest.period} devices=${digest.devices} telegram=${digest.telegram}`,
      );
    }
  } catch (error) {
    console.error("[worker] digest failed", error);
  }
}

console.log(`[worker] starting interval=${INTERVAL_MS}ms`);
void tick();
setInterval(() => void tick(), INTERVAL_MS);
