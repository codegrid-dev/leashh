# Leashh

The Leashh website and Pet Nanny application form, at [leashh.com](https://leashh.com).

Next.js 15 (App Router, JavaScript), deployed on Vercel, with a Supabase Postgres database
in the London region. There is no CSS framework; the stylesheets are plain CSS taken from
the original design files.

---

## Running it locally

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build. **Use this, not `next build`** — the project builds with Turbopack, and the two compilers do not accept identical input |
| `npm start` | Serves a build locally |
| `npm run lint` | ESLint |
| `npm run check:declarations` | Verifies the declaration wording shown in the form matches the wording stored in the database, word for word |

Copy `.env.example` to `.env.local` and fill it in before the first run. Nothing works without it.

---

## Environment variables

All eight are required, in local development and in Vercel alike.

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key. **Server-side only.** It bypasses every database restriction, so it must never be exposed to the browser or given a `NEXT_PUBLIC_` name |
| `RESEND_API_KEY` | Resend API key, for the verification emails |
| `MAIL_FROM` | The From address on those emails. The domain must be verified in Resend |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key. Public by design |
| `TURNSTILE_SECRET_KEY` | Turnstile secret key. Server-side only |
| `ADMIN_EXPORT_PASSWORD` | The password for the applications export page |
| `NEXT_PUBLIC_SITE_URL` | The public origin, e.g. `https://leashh.com`. Used to build links inside emails, so a wrong value sends applicants to the wrong place |

---

## The site

| Path | What it is |
| --- | --- |
| `/` | Homepage |
| `/apply` | The four-step Pet Nanny application |
| `/terms`, `/privacy` | Terms and privacy notice |
| `/admin/export` | Password-protected CSV export of completed applications |
| `/api/health` | Health check. Returns the database state |

### The application form

Four steps: contact details, services and experience, profile, then declarations and consent.

An applicant moves through three states, and the form will not let them skip one:

```
pending_verification  →  verified  →  consented
    email entered        code entered     declarations signed
```

Only `consented` records appear in the export. A part-finished application is held but never
treated as an applicant.

Each step posts to its own route under `app/api/apply/`. The email verification code is six
digits, stored only as a scrypt hash with its own salt, so the code itself cannot be read back
out of the database.

### The export

`/admin/export` asks for `ADMIN_EXPORT_PASSWORD` and returns a CSV of every consented
application.

It reads from the `applicant_export` view rather than the tables, and that view is itself gated
on `consented`, so an unconsented record cannot reach the file even if the route changes.

The file is written as RFC 4180 with a UTF-8 byte order mark. The mark matters: without it Excel
reads the file as the local codepage and turns every `£` in the rates, and every accented name,
into mojibake. Multi-value fields such as services are semicolon-delimited, which is the
separator Salesforce uses for a multi-select picklist.

---

## The database

The schema is `supabase/schema.sql`, and it is the single source of truth. It runs top to bottom
on an empty Postgres 16 database and is safe to re-read when you want to know what a column means
— every table carries comments.

Seven tables. `applicants` holds the application; `applicant_services` and
`applicant_declarations` hold its multi-value answers; `verification_codes` holds code hashes;
`services`, `chip_options` and `declaration_texts` hold the wording shown in the form. One view,
`applicant_export`, flattens all of that into the one row per applicant that the CSV exports.

Those last three are the reason the form is editable without a deployment. **Changing the options
an applicant can choose from, or the declaration wording, is a database edit, not a code change.**

Row level security is enabled on all seven tables with no policies defined, which means the
anonymous and authenticated roles can read and write nothing at all. Every query goes through a
server route holding the service role key. The public form never holds database credentials.

### A job that needs scheduling

`purge_unconsented(interval)` deletes applications abandoned before consent, cascading to their
child rows. The privacy notice commits to this, so it is a job somebody has to run rather than a
policy statement. **It is not yet scheduled.** Set it up with `pg_cron` to run daily:

```sql
select cron.schedule('purge-unconsented', '0 3 * * *', $$select purge_unconsented()$$);
```

---

## Things worth knowing before you change something

**Supabase pauses a free project after a week of no traffic**, and when it does, the database
hostname stops resolving altogether. That happened once in production. The daily cron in
`vercel.json` hits `/api/health` at 06:00 to keep the project awake; if you move off the free
tier you can drop it.

**Database failures are reported as failures.** `app/lib/db.js` exports `must()`, which turns
both a thrown error and a PostgREST `{ error }` response into a `DbUnavailable`, and
`app/lib/route.js` wraps a route so that becomes a 503 saying the database is unreachable. Before
this existed, an outage reached the applicant as "Missing application", which sent them looking
for a mistake they had not made. If you add a route, wrap it the same way.

**`app/globals.css` and `app/apply/wizard.css` came from the original design files**, and the
homepage has been pixel-compared against the prototype. Every selector in `wizard.css` is scoped
under `.ui` so the two sheets cannot reach into each other. Keep that scoping; removing it breaks
the homepage in ways that are not visible on the page you are editing.

**The declaration wording is checked, not trusted.** What the form shows and what the database
records must be identical, because the stored text is what the applicant is held to have agreed
to. `npm run check:declarations` proves it. Run it after editing either side.
