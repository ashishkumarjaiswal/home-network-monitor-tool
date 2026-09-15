import { prisma } from "@/lib/prisma";
import { applyClientPolicy } from "@/lib/gateway-agent";
import { currentYearMonth } from "@/lib/format";

export type CapEnforcementResult = {
  checked: number;
  paused: string[];
  errors: Array<{ deviceId: string; error: string }>;
};

/**
 * Pause any device whose current-month usage >= monthlyCapBytes.
 * Re-applies on each sync so manual unpause while over-cap gets cut again.
 */
export async function enforceMonthlyCaps(): Promise<CapEnforcementResult> {
  const yearMonth = currentYearMonth();
  const devices = await prisma.device.findMany({
    where: { monthlyCapBytes: { not: null } },
    include: {
      usageMonths: { where: { yearMonth }, take: 1 },
    },
  });

  const paused: string[] = [];
  const errors: CapEnforcementResult["errors"] = [];

  for (const device of devices) {
    const cap = device.monthlyCapBytes;
    if (cap == null || cap <= BigInt(0)) continue;

    const usage = device.usageMonths[0];
    const used = (usage?.bytesIn ?? BigInt(0)) + (usage?.bytesOut ?? BigInt(0));
    if (used < cap) continue;

    if (!device.ipAddress) {
      errors.push({
        deviceId: device.id,
        error: "over cap but no ipAddress — cannot pause on agent",
      });
      if (!device.paused) {
        await prisma.device.update({
          where: { id: device.id },
          data: { paused: true },
        });
      }
      continue;
    }

    if (!device.paused) {
      await prisma.device.update({
        where: { id: device.id },
        data: { paused: true },
      });
    }

    try {
      await applyClientPolicy(device.ipAddress, {
        paused: true,
        downloadKbps: device.downloadLimitKbps,
        uploadKbps: device.uploadLimitKbps,
      });
      paused.push(device.name);
    } catch (error) {
      errors.push({
        deviceId: device.id,
        error: error instanceof Error ? error.message : "agent pause failed",
      });
    }
  }

  return { checked: devices.length, paused, errors };
}
