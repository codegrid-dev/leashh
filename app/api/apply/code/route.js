import { NextResponse } from "next/server";
import { db, must } from "@/app/lib/db";
import { withDb } from "@/app/lib/route";
import { sendIsOverLimit } from "@/app/lib/guard";
import { sendAlreadyApplied } from "@/app/lib/mail";
import { issueCode } from "@/app/lib/issueCode";

export const runtime = "nodejs";

// "send a new code". Rate limited, and it invalidates whatever was live.
async function handler(request) {
  const { applicantId } = await request.json().catch(() => ({}));
  if (!applicantId) return NextResponse.json({ error: "Missing application" }, { status: 400 });

  const a = await must(db()
    .from("applicants")
    .select("id, email, first_name, status, reference")
    .eq("id", applicantId)
    .maybeSingle(), "load the application");
  if (!a) return NextResponse.json({ error: "Missing application" }, { status: 404 });
  // Same reasoning as start: identical response, explanation by email.
  if (a.status === "consented") {
    try {
      await sendAlreadyApplied({ to: a.email, firstName: a.first_name, reference: a.reference });
    } catch (e) {
      console.error("[code] already-applied notice failed", e?.message);
    }
    return NextResponse.json({ ok: true });
  }

  if (await sendIsOverLimit(applicantId)) {
    return NextResponse.json({ error: "Too many codes requested. Try again later." }, { status: 429 });
  }

  await issueCode(a.id, a.email, a.first_name);
  return NextResponse.json({ ok: true });
}

export const POST = withDb(handler);
