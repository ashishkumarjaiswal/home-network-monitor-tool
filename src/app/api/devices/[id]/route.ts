import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyClientPolicy } from "@/lib/gateway-agent";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      macAddress?: string | null;
      ipAddress?: string | null;
      downloadLimitKbps?: number | null;
      uploadLimitKbps?: number | null;
      monthlyCapGb?: number | null;
      monthlyCapMb?: number | null;
      paused?: boolean;
      notes?: string | null;
      applyToAgent?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.macAddress !== undefined) data.macAddress = body.macAddress || null;
    if (body.ipAddress !== undefined) data.ipAddress = body.ipAddress || null;
    if (body.downloadLimitKbps !== undefined) {
      data.downloadLimitKbps = body.downloadLimitKbps;
    }
    if (body.uploadLimitKbps !== undefined) data.uploadLimitKbps = body.uploadLimitKbps;
    if (body.paused !== undefined) data.paused = body.paused;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.monthlyCapMb !== undefined) {
      data.monthlyCapBytes =
        body.monthlyCapMb == null
          ? null
          : BigInt(Math.round(body.monthlyCapMb * 1024 * 1024));
    } else if (body.monthlyCapGb !== undefined) {
      data.monthlyCapBytes =
        body.monthlyCapGb == null
          ? null
          : BigInt(Math.round(body.monthlyCapGb * 1024 * 1024 * 1024));
    }

    const device = await prisma.device.update({
      where: { id },
      data,
    });

    let agent: unknown = null;
    const shouldApply =
      body.applyToAgent !== false &&
      Boolean(device.ipAddress) &&
      (body.paused !== undefined ||
        body.downloadLimitKbps !== undefined ||
        body.uploadLimitKbps !== undefined);

    if (shouldApply && device.ipAddress) {
      if (!/^10\.42\.0\.([1-9]|[1-9]\d|1\d{2}|2[0-4]\d|25[0-4])$/.test(device.ipAddress)) {
        return NextResponse.json(
          {
            device: {
              ...device,
              monthlyCapBytes: device.monthlyCapBytes?.toString() ?? null,
            },
            agentError: `IP ${device.ipAddress} is not a hotspot client. Use 10.42.0.x from DHCP (AdGuard may show 10.0.5.1 because of Docker — that will not work).`,
          },
          { status: 422 },
        );
      }
      try {
        agent = await applyClientPolicy(device.ipAddress, {
          paused: device.paused,
          downloadKbps: device.downloadLimitKbps,
          uploadKbps: device.uploadLimitKbps,
          clearLimits:
            device.downloadLimitKbps == null && device.uploadLimitKbps == null,
        });
      } catch (error) {
        return NextResponse.json(
          {
            device: {
              ...device,
              monthlyCapBytes: device.monthlyCapBytes?.toString() ?? null,
            },
            agentError:
              error instanceof Error ? error.message : "gateway-agent apply failed",
          },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      device: {
        ...device,
        monthlyCapBytes: device.monthlyCapBytes?.toString() ?? null,
      },
      agent,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update device" },
      { status: 500 },
    );
  }
}
