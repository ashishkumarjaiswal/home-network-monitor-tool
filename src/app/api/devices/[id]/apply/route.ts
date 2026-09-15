import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyClientPolicy } from "@/lib/gateway-agent";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const device = await prisma.device.findUnique({ where: { id } });
    if (!device) {
      return NextResponse.json({ error: "device not found" }, { status: 404 });
    }
    if (!device.ipAddress) {
      return NextResponse.json(
        { error: "device has no ipAddress — set hotspot IP first" },
        { status: 400 },
      );
    }

    const result = await applyClientPolicy(device.ipAddress, {
      paused: device.paused,
      downloadKbps: device.downloadLimitKbps,
      uploadKbps: device.uploadLimitKbps,
      clearLimits:
        device.downloadLimitKbps == null && device.uploadLimitKbps == null,
    });

    return NextResponse.json({ ok: true, agent: result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "apply failed",
        hint: "Is gateway-agent running on Ubuntu? GATEWAY_AGENT_URL / TOKEN set?",
      },
      { status: 500 },
    );
  }
}
