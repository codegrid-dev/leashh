import { NextResponse } from "next/server";
import { db, must } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two jobs.
//
// It answers "is the database actually up", which nothing could before. The
// pause in October looked to the client like a disabled form, because every
// route reported the outage as a missing record.
//
// It is also what the daily cron hits. A Supabase project on the free plan
// pauses itself after a week with no activity, and one request a day is
// enough to keep it awake.
export async function GET() {
  const started = Date.now();
  try {
    // cheap, and it touches a real table so it counts as activity
    const services = await must(
      db().from("services").select("key", { count: "exact", head: true }),
      "check the database"
    );
    return NextResponse.json(
      { ok: true, database: "up", ms: Date.now() - started },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e) {
    console.error("[health] database unreachable:", e?.cause?.message || e?.message);
    return NextResponse.json(
      { ok: false, database: "unreachable", ms: Date.now() - started },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
