import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { openDb, passwordHash } from "../server/db.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aidlc-perf-"));
const db = openDb(dir);
try {
  const user = db
    .prepare("INSERT INTO users(email,name,password_hash) VALUES(?,?,?)")
    .run(
      "perf@example.test",
      "Perf",
      passwordHash("test-password-123"),
    ).lastInsertRowid;
  const workflow = db
    .prepare("SELECT id,stages_json FROM workflows ORDER BY id DESC LIMIT 1")
    .get();
  const insertProject = db.prepare(
    "INSERT INTO projects(name,description,workflow_id,current_stage,created_by) VALUES(?,?,?,?,?)",
  );
  const insertActivity = db.prepare(
    "INSERT INTO activities(project_id,actor_id,action,detail) VALUES(?,?,?,?)",
  );
  const insertProjectWorkflow = db.prepare(
    "INSERT INTO project_workflows(project_id,revision,stages_json,created_by) VALUES(?,1,?,?)",
  );
  const pinWorkflow = db.prepare(
    "UPDATE projects SET project_workflow_id=? WHERE id=?",
  );
  const insertAttachment = db.prepare(
    "INSERT INTO attachments(project_id,owner_id,filename,stored_name,mime,bytes,scope) VALUES(?,?,?,?,?,?,?)",
  );
  db.transaction(() => {
    for (let i = 0; i < 1200; i++) {
      const id = insertProject.run(
        `Project ${i}`,
        "Performance fixture",
        workflow.id,
        "brd",
        user,
      ).lastInsertRowid;
      const ownWorkflow = insertProjectWorkflow.run(
        id,
        workflow.stages_json,
        user,
      ).lastInsertRowid;
      pinWorkflow.run(ownWorkflow, id);
      for (let j = 0; j < 10; j++)
        insertActivity.run(id, user, "artifact.edited", `version ${j}`);
      for (let j = 0; j < 3; j++)
        insertAttachment.run(
          id,
          user,
          `note-${j}.txt`,
          `${id}-${j}.txt`,
          "text/plain",
          120,
          "project",
        );
    }
  })();
  const probes = [
    {
      name: "project list",
      sql: "SELECT p.*,pw.revision FROM projects p JOIN project_workflows pw ON pw.id=p.project_workflow_id ORDER BY p.updated_at DESC,p.id DESC LIMIT 50",
      args: [],
    },
    {
      name: "project activity",
      sql: "SELECT * FROM activities WHERE project_id=? ORDER BY id DESC LIMIT 100",
      args: [600],
    },
    {
      name: "stage dashboard",
      sql: "SELECT * FROM projects WHERE current_stage=? ORDER BY updated_at DESC LIMIT 50",
      args: ["brd"],
    },
    {
      name: "project workflow",
      sql: "SELECT * FROM project_workflows WHERE project_id=? ORDER BY revision DESC LIMIT 1",
      args: [600],
    },
    {
      name: "project file library",
      sql: "SELECT a.id,a.filename FROM attachments a JOIN users u ON u.id=a.owner_id WHERE a.project_id=? AND (a.scope!='chat' OR a.chat_message_id IS NOT NULL OR a.owner_id=?) ORDER BY a.id DESC",
      args: [600, user],
    },
  ];
  let failed = false;
  for (const p of probes) {
    const plan = db
      .prepare("EXPLAIN QUERY PLAN " + p.sql)
      .all(...p.args)
      .map((row) => row.detail)
      .join(" | ");
    if (
      /SCAN (activities|projects|project_workflows|attachments)(?! USING INDEX)/.test(
        plan,
      )
    ) {
      console.error(`${p.name}: full table scan: ${plan}`);
      failed = true;
    }
    const statement = db.prepare(p.sql);
    const durations = [];
    for (let i = 0; i < 200; i++) {
      const start = performance.now();
      statement.all(...p.args);
      durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)];
    console.log(`${p.name}: p95 ${p95.toFixed(2)} ms; ${plan}`);
    if (p95 > 100) failed = true;
  }
  if (failed) process.exitCode = 1;
} finally {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
