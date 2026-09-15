import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentYearMonth } from "@/lib/format";

export async function GET() {
  try {
    const yearMonth = currentYearMonth();
    const devices = await prisma.device.findMany({
      orderBy: { name: "asc" },
      include: {
        usageMonths: {
          where: { yearMonth },
          take: 1,
        },
      },
    });

    return NextResponse.json({
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
        error: error instanceof Error ? error.message : "Failed to load devices",
        hint: "Is DATABASE_URL reachable? Run prisma db push on Ubuntu/Coolify Postgres.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      macAddress?: string | null;
      ipAddress?: string | null;
      downloadLimitKbps?: number | null;
      uploadLimitKbps?: number | null;
      monthlyCapGb?: number | null;
      notes?: string | null;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const monthlyCapBytes =
      body.monthlyCapGb != null
        ? BigInt(Math.round(body.monthlyCapGb * 1024 * 1024 * 1024))
        : null;

    const device = await prisma.device.create({
      data: {
        name: body.name.trim(),
        macAddress: body.macAddress || null,
        ipAddress: body.ipAddress || null,
        downloadLimitKbps: body.downloadLimitKbps ?? null,
        uploadLimitKbps: body.uploadLimitKbps ?? null,
        monthlyCapBytes,
        notes: body.notes || null,
      },
    });

    return NextResponse.json({
      device: {
        ...device,
        monthlyCapBytes: device.monthlyCapBytes?.toString() ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create device" },
      { status: 500 },
    );
  }
}
