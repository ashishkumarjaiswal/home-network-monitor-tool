import { NextResponse } from "next/server";
import { syncAdGuardQueries } from "@/lib/sync-adguard";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: number };
    const result = await syncAdGuardQueries(body.limit ?? 100);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "AdGuard sync failed",
        hint: "Set ADGUARD_URL, ADGUARD_USER, ADGUARD_PASSWORD. From Mac, use http://192.168.31.7:4001",
      },
      { status: 500 },
    );
  }
}
