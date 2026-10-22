import { NextResponse } from "next/server";
import { DbUnavailable } from "./db";

// Wraps a route handler so a database outage answers honestly instead of
// being mistaken for a missing record.
export function withDb(handler) {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (e) {
      if (e instanceof DbUnavailable) {
        console.error(`[db] ${e.message}`, e.cause?.message || e.cause);
        return NextResponse.json(
          { error: "We cannot reach our database right now. Please try again in a few minutes." },
          { status: 503 }
        );
      }
      console.error("[route] unhandled", e);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
