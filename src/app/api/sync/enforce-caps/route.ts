import { NextResponse } from "next/server";
import { enforceMonthlyCaps } from "@/lib/enforce-caps";

/** Run cap enforcement without waiting for a full usage sync. */
export async function POST() {
  try {
    const enforcement = await enforceMonthlyCaps();
    return NextResponse.json({ ok: true, enforcement });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "enforce failed",
      },
      { status: 500 },
    );
  }
}
