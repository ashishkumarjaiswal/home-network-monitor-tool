import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

    const events = await prisma.dnsEvent.findMany({
      orderBy: { queriedAt: "desc" },
      take: limit,
      include: { device: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load DNS events" },
      { status: 500 },
    );
  }
}
