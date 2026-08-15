// ============================================================
// Monitoring storage: saved company profiles, the watcher's
// seen-set, and generated notifications. Owns its own tables
// (CREATE IF NOT EXISTS) on top of the shared radar.db.
// ============================================================

import { getDb } from "../db";
import type { CompanyProfile, FitTier, FutureFit } from "../types";

export interface CompanyRecord {
  id: number;
  name: string;
  email: string | null;
  profile: CompanyProfile;
  monitoring: boolean;
  /** Saved "not yet" matches — the watcher checks for grow-into transitions. */
  futureFits: FutureFit[];
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecord {
  id: number;
  companyId: number;
  companyName: string;
  opportunityId: string;
  score: number;
  tier: FitTier;
  whyFit: string;
  emailSubject: string | null;
  emailBody: string | null;
  emailedAt: string | null;
  createdAt: string;
}

let ready = false;
function db() {
  const d = getDb();
  if (!ready) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        profile TEXT NOT NULL,           -- CompanyProfile JSON
        monitoring INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      -- Opportunities the watcher has already considered (per-system, not per-company).
      CREATE TABLE IF NOT EXISTS watch_seen (
        opportunity_id TEXT PRIMARY KEY,
        first_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id),
        opportunity_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        tier TEXT NOT NULL,
        why_fit TEXT NOT NULL,
        email_subject TEXT,
        email_body TEXT,
        emailed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(company_id, opportunity_id)
      );
    `);
    // Additive migration: future-fit snapshot ("not yet" matches) per company.
    try {
      d.exec("ALTER TABLE companies ADD COLUMN future_fits TEXT");
    } catch {
      // column already exists
    }
    ready = true;
  }
  return d;
}

// ---------- companies ----------

export function saveCompany(
  name: string,
  email: string | null,
  profile: CompanyProfile,
  monitoring = true,
  futureFits?: FutureFit[] | null,
): CompanyRecord {
  // undefined = caller has no snapshot -> keep whatever is stored.
  const ff = futureFits === undefined ? undefined : JSON.stringify(futureFits ?? []);
  const existing = db()
    .prepare("SELECT id FROM companies WHERE name = ?")
    .get(name) as { id: number } | undefined;
  if (existing) {
    db()
      .prepare(
        "UPDATE companies SET email = COALESCE(?, email), profile = ?, monitoring = ?, future_fits = COALESCE(?, future_fits), updated_at = datetime('now') WHERE id = ?",
      )
      .run(email, JSON.stringify(profile), monitoring ? 1 : 0, ff ?? null, existing.id);
    return getCompany(existing.id)!;
  }
  const r = db()
    .prepare(
      "INSERT INTO companies (name, email, profile, monitoring, future_fits) VALUES (?, ?, ?, ?, ?)",
    )
    .run(name, email, JSON.stringify(profile), monitoring ? 1 : 0, ff ?? null);
  return getCompany(Number(r.lastInsertRowid))!;
}

export function getCompany(id: number): CompanyRecord | null {
  const r = db().prepare("SELECT * FROM companies WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return r ? rowToCompany(r) : null;
}

export function listCompanies(monitoringOnly = false): CompanyRecord[] {
  const rows = db()
    .prepare(`SELECT * FROM companies ${monitoringOnly ? "WHERE monitoring = 1" : ""} ORDER BY id`)
    .all() as Record<string, unknown>[];
  return rows.map(rowToCompany);
}

function rowToCompany(r: Record<string, unknown>): CompanyRecord {
  let futureFits: FutureFit[] = [];
  try {
    futureFits = r.future_fits ? (JSON.parse(r.future_fits as string) as FutureFit[]) : [];
  } catch {
    // malformed snapshot — treat as none
  }
  return {
    id: r.id as number,
    name: r.name as string,
    email: (r.email as string) ?? null,
    profile: JSON.parse(r.profile as string) as CompanyProfile,
    monitoring: r.monitoring === 1,
    futureFits,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ---------- watcher seen-set ----------

/** Ids present in `opportunities` but never seen by the watcher. */
export function unseenOpportunityIds(): string[] {
  return (
    db()
      .prepare(
        "SELECT o.id FROM opportunities o LEFT JOIN watch_seen w ON w.opportunity_id = o.id WHERE w.opportunity_id IS NULL",
      )
      .all() as { id: string }[]
  ).map((r) => r.id);
}

export function markSeen(ids: string[]): void {
  const stmt = db().prepare("INSERT OR IGNORE INTO watch_seen (opportunity_id) VALUES (?)");
  const tx = db().transaction((batch: string[]) => {
    for (const id of batch) stmt.run(id);
  });
  tx(ids);
}

export function seenCount(): number {
  return (db().prepare("SELECT COUNT(*) n FROM watch_seen").get() as { n: number }).n;
}

// ---------- notifications ----------

export function recordNotification(n: {
  companyId: number;
  opportunityId: string;
  score: number;
  tier: FitTier;
  whyFit: string;
  emailSubject: string | null;
  emailBody: string | null;
  emailedAt: string | null;
}): boolean {
  const r = db()
    .prepare(
      `INSERT OR IGNORE INTO notifications
       (company_id, opportunity_id, score, tier, why_fit, email_subject, email_body, emailed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      n.companyId,
      n.opportunityId,
      n.score,
      n.tier,
      n.whyFit,
      n.emailSubject,
      n.emailBody,
      n.emailedAt,
    );
  return r.changes > 0;
}

export function listNotifications(companyId?: number, limit = 50): NotificationRecord[] {
  const rows = db()
    .prepare(
      `SELECT n.*, c.name AS company_name FROM notifications n
       JOIN companies c ON c.id = n.company_id
       ${companyId ? "WHERE n.company_id = @cid" : ""}
       ORDER BY n.id DESC LIMIT @lim`,
    )
    .all({ cid: companyId, lim: limit } as Record<string, unknown>) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    companyId: r.company_id as number,
    companyName: r.company_name as string,
    opportunityId: r.opportunity_id as string,
    score: r.score as number,
    tier: r.tier as FitTier,
    whyFit: r.why_fit as string,
    emailSubject: (r.email_subject as string) ?? null,
    emailBody: (r.email_body as string) ?? null,
    emailedAt: (r.emailed_at as string) ?? null,
    createdAt: r.created_at as string,
  }));
}
