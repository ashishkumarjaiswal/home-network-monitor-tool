import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchHotspotClients } from "@/lib/gateway-agent";
import { currentYearMonth } from "@/lib/format";

function displayName(hostname: string | null, ip: string) {
  if (hostname?.trim()) return hostname.trim().replace(/_/g, " ");
  return `Device ${ip}`;
}

/**
 * Discover hotspot DHCP/neigh clients from gateway-agent and upsert Device rows.
 */
export async function POST() {
  try {
    const { clients, hotspotIf } = await fetchHotspotClients();
    let created = 0;
    let updated = 0;
    const yearMonth = currentYearMonth();

    for (const client of clients) {
      const mac = client.macAddress?.toLowerCase() || null;
      const existing = mac
        ? await prisma.device.findFirst({
            where: {
              OR: [{ macAddress: mac }, { ipAddress: client.ip }],
            },
          })
        : await prisma.device.findFirst({ where: { ipAddress: client.ip } });

      if (existing) {
        await prisma.device.update({
          where: { id: existing.id },
          data: {
            ipAddress: client.ip,
            macAddress: mac ?? existing.macAddress,
            // Keep custom names; only fill if still a generic Device * name
            ...(existing.name.startsWith("Device ") && client.hostname
              ? { name: displayName(client.hostname, client.ip) }
              : {}),
          },
        });
        updated += 1;
      } else {
        await prisma.device.create({
          data: {
            name: displayName(client.hostname, client.ip),
            ipAddress: client.ip,
            macAddress: mac,
          },
        });
        created += 1;
      }
    }

    const devices = await prisma.device.findMany({
      orderBy: { name: "asc" },
      include: {
        usageMonths: { where: { yearMonth }, take: 1 },
      },
    });

    return NextResponse.json({
      ok: true,
      hotspotIf,
      discovered: clients.length,
      created,
      updated,
      clients,
      devices: devices.map((d) => ({
        ...d,
        monthlyCapBytes: d.monthlyCapBytes?.toString() ?? null,
        usageMonths: d.usageMonths.map((u) => ({
          ...u,
          bytesIn: u.bytesIn.toString(),
          bytesOut: u.bytesOut.toString(),
        })),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "hotspot sync failed",
        hint: "Is gateway-agent running? Redeploy agent with /clients support.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const data = await fetchHotspotClients();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "hotspot list failed",
      },
      { status: 500 },
    );
  }
}
