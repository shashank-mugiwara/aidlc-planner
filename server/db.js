import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const GROUPS = ["business", "product", "project", "engineering"];
export const TYPES = ["BRD", "PRD", "PLANNING", "DESIGN", "STORIES"];
export const defaultStages = [
  {
    key: "brd",
    label: "Business requirements",
    type: "BRD",
    owner: "product",
    approver: "business",
    minLevel: 2,
    approvals: 1,
    next: "prd",
  },
  {
    key: "prd",
    label: "Product requirements",
    type: "PRD",
    owner: "product",
    approver: "product",
    minLevel: 2,
    approvals: 1,
    next: "planning",
  },
  {
    key: "planning",
    label: "Pre-planning",
    type: "PLANNING",
    owner: "project",
    approver: "project",
    minLevel: 2,
    approvals: 1,
    next: "design",
  },
  {
    key: "design",
    label: "Solution design",
    type: "DESIGN",
    owner: "engineering",
    approver: "engineering",
    minLevel: 2,
    approvals: 1,
    next: "stories",
  },
  {
    key: "stories",
    label: "Jira stories",
    type: "STORIES",
    owner: "engineering",
    approver: "project",
    minLevel: 2,
    approvals: 1,
    next: null,
  },
];
export const templates = {
  BRD: "# Business Requirements Document\n\n## Business problem\n\n## Goals and success measures\n\n## Stakeholders\n\n## Scope and exclusions\n\n## Business rules\n\n## Risks and open questions\n",
  PRD: "# Product Requirements Document\n\n## Problem and users\n\n## Goals and success measures\n\n## User journeys\n\n## Functional requirements\n\n## Non-functional requirements\n\n## Dependencies\n\n## Acceptance criteria\n",
  PLANNING:
    "# Pre-planning Brief\n\n## Engineering managers and team leads\n\n## Agenda\n\n## Capacity and dependencies\n\n## Decisions and next steps\n",
  DESIGN:
    "# Solution Design Document\n\n## Context\n\n## Architecture\n\n## Data model\n\n## API and integrations\n\n## Security and operations\n\n## Alternatives\n\n## Risks and test strategy\n",
  STORIES:
    "# Jira-ready Stories\n\n## Epic\n\n## Story 1\n\n### As a / I want / So that\n\n### Acceptance criteria\n\n### Dependencies\n",
};

export function validateStages(stages) {
  if (!Array.isArray(stages) || stages.length < 2 || stages.length > 20)
    throw new Error("Workflow needs 2–20 stages");
  const keys = new Set();
  for (const s of stages) {
    if (!/^[a-z][a-z0-9_-]{1,39}$/.test(s.key || "") || keys.has(s.key))
      throw new Error("Stage keys must be unique and use lowercase letters");
    keys.add(s.key);
    if (
      !s.label?.trim() ||
      s.label.length > 80 ||
      !TYPES.includes(s.type) ||
      !GROUPS.includes(s.owner) ||
      !GROUPS.includes(s.approver)
    )
      throw new Error(`Invalid stage ${s.key}`);
    if (
      ![1, 2, 3].includes(Number(s.minLevel)) ||
      !Number.isInteger(Number(s.approvals)) ||
      s.approvals < 1 ||
      s.approvals > 10
    )
      throw new Error(`Invalid approval rules for ${s.key}`);
  }
  for (const s of stages)
    if (s.next && !keys.has(s.next))
      throw new Error(`Unknown next stage ${s.next}`);
  const incoming = new Map(stages.map((s) => [s.key, 0]));
  for (const s of stages)
    if (s.next) incoming.set(s.next, incoming.get(s.next) + 1);
  const roots = [...incoming].filter(([, n]) => n === 0).map(([k]) => k);
  if (roots.length !== 1)
    throw new Error("Workflow must have one starting stage");
  const seen = new Set();
  let at = roots[0];
  while (at) {
    if (seen.has(at)) throw new Error("Workflow contains a cycle");
    seen.add(at);
    at = stages.find((s) => s.key === at).next;
  }
  if (seen.size !== stages.length)
    throw new Error("Every stage must be reachable");
  return roots[0];
}
export function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(":");
  return crypto.timingSafeEqual(
    crypto.scryptSync(password, salt, 64),
    Buffer.from(hex, "hex"),
  );
}

export function openDb(dataDir = process.env.DATA_DIR || path.resolve("data")) {
  fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });
  const db = new Database(path.join(dataDir, "planner.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS memberships(user_id INTEGER NOT NULL REFERENCES users(id), group_key TEXT NOT NULL, level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 3), PRIMARY KEY(user_id,group_key));
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS workflows(id INTEGER PRIMARY KEY, revision INTEGER NOT NULL UNIQUE, stages_json TEXT NOT NULL, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', workflow_id INTEGER NOT NULL REFERENCES workflows(id), current_stage TEXT NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id), meeting_at TEXT, meeting_attendees TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS projects_stage_updated ON projects(current_stage,updated_at DESC);
    CREATE INDEX IF NOT EXISTS projects_updated ON projects(updated_at DESC,id DESC);
    CREATE TABLE IF NOT EXISTS project_workflows(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), revision INTEGER NOT NULL, stages_json TEXT NOT NULL, created_by INTEGER REFERENCES users(id), copied_from_project_id INTEGER REFERENCES projects(id), copied_from_revision INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(project_id,revision));
    CREATE INDEX IF NOT EXISTS project_workflows_project ON project_workflows(project_id,revision DESC);
    CREATE TABLE IF NOT EXISTS artifacts(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), stage_key TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, owner_group TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', version INTEGER NOT NULL DEFAULT 1, updated_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(project_id,stage_key));
    CREATE INDEX IF NOT EXISTS artifacts_project_updated ON artifacts(project_id,updated_at DESC);
    CREATE TABLE IF NOT EXISTS artifact_versions(id INTEGER PRIMARY KEY, artifact_id INTEGER NOT NULL REFERENCES artifacts(id), version INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, edited_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(artifact_id,version));
    CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, artifact_id INTEGER NOT NULL REFERENCES artifacts(id), author_id INTEGER NOT NULL REFERENCES users(id), line INTEGER NOT NULL, quote TEXT NOT NULL, body TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, edited_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS comments_artifact ON comments(artifact_id,created_at);
    CREATE TABLE IF NOT EXISTS comment_edits(id INTEGER PRIMARY KEY, comment_id INTEGER NOT NULL REFERENCES comments(id), body TEXT NOT NULL, changed_by INTEGER NOT NULL REFERENCES users(id), changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS comment_edits_comment ON comment_edits(comment_id,id DESC);
    CREATE TABLE IF NOT EXISTS review_requests(id INTEGER PRIMARY KEY, artifact_id INTEGER NOT NULL REFERENCES artifacts(id), stage_key TEXT NOT NULL, requested_by INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at TEXT);
    CREATE INDEX IF NOT EXISTS reviews_artifact_status ON review_requests(artifact_id,status);
    CREATE INDEX IF NOT EXISTS reviews_status ON review_requests(status,created_at DESC);
    CREATE TABLE IF NOT EXISTS review_decisions(id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES review_requests(id), reviewer_id INTEGER NOT NULL REFERENCES users(id), decision TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(request_id,reviewer_id));
    CREATE TABLE IF NOT EXISTS activities(id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES projects(id), artifact_id INTEGER REFERENCES artifacts(id), actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS activities_project_time ON activities(project_id,id DESC);
    CREATE TABLE IF NOT EXISTS skills(id INTEGER PRIMARY KEY, group_key TEXT NOT NULL, name TEXT NOT NULL, instructions TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, UNIQUE(group_key,name));
    CREATE TABLE IF NOT EXISTS attachments(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), artifact_id INTEGER REFERENCES artifacts(id), chat_message_id INTEGER, owner_id INTEGER NOT NULL REFERENCES users(id), filename TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, scope TEXT NOT NULL DEFAULT 'chat' CHECK(scope IN ('chat','project','artifact')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS attachments_artifact ON attachments(artifact_id);
    CREATE INDEX IF NOT EXISTS attachments_project ON attachments(project_id);
    CREATE INDEX IF NOT EXISTS attachments_pending ON attachments(project_id,owner_id) WHERE artifact_id IS NULL AND chat_message_id IS NULL;
    CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), user_id INTEGER REFERENCES users(id), role TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS chat_project_time ON chat_messages(project_id,id DESC);
  `);
  if (
    !db
      .pragma("table_info(chat_messages)")
      .some((c) => c.name === "context_json")
  ) {
    db.exec(
      "ALTER TABLE chat_messages ADD COLUMN context_json TEXT NOT NULL DEFAULT '{}'",
    );
  }
  const commentColumns = db
    .pragma("table_info(comments)")
    .map((column) => column.name);
  if (!commentColumns.includes("deleted"))
    db.exec(
      "ALTER TABLE comments ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0",
    );
  if (!commentColumns.includes("edited_at"))
    db.exec("ALTER TABLE comments ADD COLUMN edited_at TEXT");
  if (!db.pragma("table_info(attachments)").some((column) => column.name === "scope")) {
    db.exec("ALTER TABLE attachments ADD COLUMN scope TEXT NOT NULL DEFAULT 'chat'");
    db.exec("UPDATE attachments SET scope='artifact' WHERE artifact_id IS NOT NULL");
  }
  if (!db.pragma("table_info(projects)").some((column) => column.name === "project_workflow_id"))
    db.exec("ALTER TABLE projects ADD COLUMN project_workflow_id INTEGER REFERENCES project_workflows(id)");
  if (!db.pragma("table_info(project_workflows)").some((column) => column.name === "copied_from_revision"))
    db.exec("ALTER TABLE project_workflows ADD COLUMN copied_from_revision INTEGER");
  db.transaction(() => {
    const existing = db.prepare(
      "SELECT p.id,p.created_by,w.stages_json FROM projects p JOIN workflows w ON w.id=p.workflow_id WHERE p.project_workflow_id IS NULL",
    ).all();
    const insert = db.prepare(
      "INSERT INTO project_workflows(project_id,revision,stages_json,created_by) VALUES(?,1,?,?)",
    );
    const pin = db.prepare("UPDATE projects SET project_workflow_id=? WHERE id=?");
    for (const item of existing)
      pin.run(insert.run(item.id, item.stages_json, item.created_by).lastInsertRowid, item.id);
  })();
  db.exec("CREATE INDEX IF NOT EXISTS attachments_project_scope ON attachments(project_id,scope,id DESC)");
  if (!db.prepare("SELECT id FROM workflows LIMIT 1").get())
    db.prepare("INSERT INTO workflows(revision,stages_json) VALUES(1,?)").run(
      JSON.stringify(defaultStages),
    );
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (
    email &&
    process.env.ADMIN_PASSWORD &&
    !db.prepare("SELECT id FROM users WHERE is_admin=1 LIMIT 1").get()
  ) {
    if (process.env.ADMIN_PASSWORD.length < 12)
      throw new Error("ADMIN_PASSWORD must be at least 12 characters");
    db.prepare(
      "INSERT INTO users(email,name,password_hash,is_admin) VALUES(?,?,?,1)",
    ).run(email, "Administrator", passwordHash(process.env.ADMIN_PASSWORD));
  }
  return db;
}
