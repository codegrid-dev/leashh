import { createClient } from "@supabase/supabase-js";

// Server only. The service role key bypasses row level security, so this
// module must never be imported from a client component. Every table has RLS
// enabled with no policies, which means this is the only way in.
if (typeof window !== "undefined") {
  throw new Error("app/lib/db.js is server only");
}

// Created on first use, not at import time. Building the client at module
// scope makes the whole build fail when the environment is not configured,
// which is what happens on a fresh deploy before the variables are set. A
// missing variable should break the request that needs it, with a message
// that says so, not the build.
let client = null;

export function db() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

// Supabase returns errors in the result rather than throwing, so a destructured
// `{ data }` silently becomes null when the database is unreachable. Every
// route then read that null as "not found" and answered 404 "Missing
// application", blaming the applicant for our outage. That is how a three week
// pause looked like a disabled form instead of something obviously broken.
//
// must() makes a failure loud. Wrap the handler in withDb() to turn it into an
// honest 503.
export class DbUnavailable extends Error {
  constructor(what, cause) {
    super(`database unavailable while trying to ${what}`);
    this.name = "DbUnavailable";
    this.cause = cause;
  }
}

export async function must(query, what) {
  let result;
  try {
    result = await query;
  } catch (e) {
    throw new DbUnavailable(what, e);          // network level failure
  }
  if (result?.error) throw new DbUnavailable(what, result.error);
  return result?.data;
}
