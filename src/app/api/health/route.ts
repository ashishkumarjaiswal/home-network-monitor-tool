import { NextResponse } from "next/server";
import { checkAdGuardHealth } from "@/lib/adguard";
import { checkGatewayAgent } from "@/lib/gateway-agent";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [adguard, gatewayAgent] = await Promise.all([
    checkAdGuardHealth(),
    checkGatewayAgent(),
  ]);

  let database: { ok: boolean; detail: string } = { ok: false, detail: "not checked" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { ok: true, detail: "connected" };
  } catch (error) {
    database = {
      ok: false,
      detail: error instanceof Error ? error.message : "unreachable",
    };
  }

  return NextResponse.json({
    app: "monitor-tool",
    time: new Date().toISOString(),
    database,
    adguard,
    gatewayAgent,
    omnirouteConfigured: Boolean(process.env.OMNIROUTE_API_KEY),
  });
}
