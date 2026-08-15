// ============================================================
// Pursuit storage: a pursuit is one company actively going after
// one opportunity — its submission plan lives here as a task list
// with phases and due dates. Owns its own tables (CREATE IF NOT
// EXISTS) on top of the shared radar.db, mirroring monitor/db.ts.
// ============================================================

import { getDb } from "../db";
import type { CompanyProfile, RankedMatch } from "../types";

export type PursuitStatus = "active" | "submitted" | "won" | "lost" | "abandoned";

export interface PursuitTask {
  id: number;
  pursuitId: number;
  phase: string;
  title: string;
  detail: string;
  dueDate: string | null; // ISO yyyy-mm-dd
  kind: string; // registration | eligibility | writing | budget | evidence | review | submission | admin
  done: boolean;
  assist: string | null; // generated "help me do this" guidance
  sort: number;
}

export interface PursuitRecord {
  id: number;
  opportunityId: string;
  profile: CompanyProfile;
  match: RankedMatch | null;
  planSummary: string | null;
  status: PursuitStatus;
  createdAt: string;
  updatedAt: string;
}

let ready = false;
function db() {
  const d = getDb();
  if (!ready) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS pursuits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opportunity_id TEXT NOT NULL UNIQUE,
        profile TEXT NOT NULL,             -- CompanyProfile JSON at creation
        match_json TEXT,                   -- RankedMatch JSON if pursued from a report
        plan_summary TEXT,                 -- one-paragraph strategy from the plan build
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS pursuit_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pursuit_id INTEGER NOT NULL REFERENCES pursuits(id),
        phase TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        due_date TEXT,
        kind TEXT NOT NULL DEFAULT 'admin',
        done INTEGER NOT NULL DEFAULT 0,
        assist TEXT,
        sort INTEGER NOT NULL DEFAULT 0
      );
    `);
    ready = true;
  }
  return d;
}

function rowToPursuit(r: Record<string, unknown>): PursuitRecord {
  return {
    id: r.id as number,
    opportunityId: r.opportunity_id as string,
    profile: JSON.parse(r.profile as string) as CompanyProfile,
    match: r.match_json ? (JSON.parse(r.match_json as string) as RankedMatch) : null,
    planSummary: (r.plan_summary as string) ?? null,
    status: r.status as PursuitStatus,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToTask(r: Record<string, unknown>): PursuitTask {
  return {
    id: r.id as number,
    pursuitId: r.pursuit_id as number,
    phase: r.phase as string,
    title: r.title as string,
    detail: r.detail as string,
    dueDate: (r.due_date as string) ?? null,
    kind: r.kind as string,
    done: !!(r.done as number),
    assist: (r.assist as string) ?? null,
    sort: r.sort as number,
  };
}

export interface NewTask {
  phase: string;
  title: string;
  detail: string;
  dueDate: string | null;
  kind: string;
}

export function createPursuit(
  opportunityId: string,
  profile: CompanyProfile,
  match: RankedMatch | null,
  planSummary: string | null,
  tasks: NewTask[],
): PursuitRecord {
  const d = db();
  const insert = d.prepare(
    `INSERT INTO pursuits (opportunity_id, profile, match_json, plan_summary)
     VALUES (?, ?, ?, ?)`,
  );
  const insertTask = d.prepare(
    `INSERT INTO pursuit_tasks (pursuit_id, phase, title, detail, due_date, kind, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const run = d.transaction(() => {
    const { lastInsertRowid } = insert.run(
      opportunityId,
      JSON.stringify(profile),
      match ? JSON.stringify(match) : null,
      planSummary,
    );
    tasks.forEach((t, i) =>
      insertTask.run(lastInsertRowid, t.phase, t.title, t.detail, t.dueDate, t.kind, i),
    );
    return lastInsertRowid as number;
  });
  return getPursuit(run())!;
}

export function getPursuit(id: number): PursuitRecord | null {
  const r = db().prepare(`SELECT * FROM pursuits WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return r ? rowToPursuit(r) : null;
}

export function getPursuitByOpportunity(opportunityId: string): PursuitRecord | null {
  const r = db()
    .prepare(`SELECT * FROM pursuits WHERE opportunity_id = ?`)
    .get(opportunityId) as Record<string, unknown> | undefined;
  return r ? rowToPursuit(r) : null;
}

export function listPursuits(): PursuitRecord[] {
  return (db().prepare(`SELECT * FROM pursuits ORDER BY created_at DESC`).all() as Record<
    string,
    unknown
  >[]).map(rowToPursuit);
}

export function listTasks(pursuitId: number): PursuitTask[] {
  return (db()
    .prepare(`SELECT * FROM pursuit_tasks WHERE pursuit_id = ? ORDER BY sort`)
    .all(pursuitId) as Record<string, unknown>[]).map(rowToTask);
}

export function setTaskDone(pursuitId: number, taskId: number, done: boolean): void {
  db()
    .prepare(`UPDATE pursuit_tasks SET done = ? WHERE id = ? AND pursuit_id = ?`)
    .run(done ? 1 : 0, taskId, pursuitId);
  touch(pursuitId);
}

export function setTaskAssist(pursuitId: number, taskId: number, assist: string): void {
  db()
    .prepare(`UPDATE pursuit_tasks SET assist = ? WHERE id = ? AND pursuit_id = ?`)
    .run(assist, taskId, pursuitId);
}

export function getTask(pursuitId: number, taskId: number): PursuitTask | null {
  const r = db()
    .prepare(`SELECT * FROM pursuit_tasks WHERE id = ? AND pursuit_id = ?`)
    .get(taskId, pursuitId) as Record<string, unknown> | undefined;
  return r ? rowToTask(r) : null;
}

export function setPursuitStatus(id: number, status: PursuitStatus): void {
  db().prepare(`UPDATE pursuits SET status = ? WHERE id = ?`).run(status, id);
  touch(id);
}

function touch(id: number): void {
  db().prepare(`UPDATE pursuits SET updated_at = datetime('now') WHERE id = ?`).run(id);
}
