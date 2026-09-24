import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileMentionIds } from "../shared/mentions.js";
import {
  GROUPS,
  TYPES,
  openDb,
  passwordHash,
  verifyPassword,
  validateStages,
  templates,
} from "./db.js";
import {
  askPi,
  listModels,
  providerStatus,
  setProviderKey,
  removeProviderKey,
} from "./pi.js";

const fail = (status, message) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const text = (v, max = 100000) =>
  typeof v === "string" && v.trim() && v.length <= max;
const cleanUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  isAdmin: !!u.is_admin,
  active: !!u.active,
});
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const MAX_PROJECT_FILES = 100;
const MAX_PROJECT_BYTES = 250 * 1024 * 1024;

export function createApp({
  db = openDb(),
  dataDir = process.env.DATA_DIR || path.resolve("data"),
  pi = askPi,
  models = listModels,
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'",
    );
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host)
          return res.status(403).json({ error: "Cross-origin request denied" });
      } catch {
        return res.status(403).json({ error: "Invalid origin" });
      }
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  const q = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const tx = (fn) => db.transaction(fn)();
  const audit = (user, projectId, artifactId, action, detail = "") =>
    run(
      "INSERT INTO activities(project_id,artifact_id,actor_id,action,detail) VALUES(?,?,?,?,?)",
      projectId,
      artifactId,
      user?.id || null,
      action,
      detail,
    );
  const membership = (user, group) =>
    user?.is_admin && !group
      ? 3
      : q(
          "SELECT level FROM memberships WHERE user_id=? AND group_key=?",
          user?.id || 0,
          group,
        )?.level || 0;
  const anyGroup = (user) =>
    user?.is_admin ||
    !!q("SELECT 1 FROM memberships WHERE user_id=? LIMIT 1", user?.id || 0);
  const requireGroup = (user, group, level = 1) => {
    if (membership(user, group) < level)
      fail(403, `${group} group level ${level} required`);
  };
  const project = (id) =>
    q("SELECT * FROM projects WHERE id=?", Number(id)) ||
    fail(404, "Project not found");
  const artifact = (id) =>
    q("SELECT * FROM artifacts WHERE id=?", Number(id)) ||
    fail(404, "Artifact not found");
  const projectWorkflow = (p) =>
    q(
      "SELECT * FROM project_workflows WHERE id=? AND project_id=?",
      p.project_workflow_id,
      p.id,
    ) || fail(500, "Project workflow is missing");
  const stages = (p) => JSON.parse(projectWorkflow(p).stages_json);
  const current = (p) =>
    p.current_stage === "complete"
      ? null
      : stages(p).find((s) => s.key === p.current_stage) ||
        fail(500, "Invalid project stage");
  const eligibleReviewers = (a, s, requesterId) =>
    q(
      "SELECT count(*) AS n FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.group_key=? AND m.level>=? AND u.active=1 AND u.id<>? AND NOT EXISTS (SELECT 1 FROM artifact_versions v WHERE v.artifact_id=? AND v.edited_by=u.id)",
      s.approver,
      s.minLevel,
      requesterId,
      a.id,
    )?.n || 0;
  const getWorkflow = () =>
    q("SELECT * FROM workflows ORDER BY revision DESC LIMIT 1");
  const loadUser = (req) => {
    const token = req.cookies?.session;
    if (!token) return null;
    return q(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
      sha(token),
      Date.now(),
    );
  };
  const auth = (req, _res, next) => {
    req.user = loadUser(req);
    if (!req.user)
      return next(
        Object.assign(new Error("Sign in required"), { status: 401 }),
      );
    next();
  };
  const admin = (req, _res, next) =>
    req.user.is_admin
      ? next()
      : next(Object.assign(new Error("Admin required"), { status: 403 }));
  const allowed = (req, _res, next) =>
    anyGroup(req.user)
      ? next()
      : next(
          Object.assign(
            new Error("Waiting for an administrator to assign your group"),
            { status: 403 },
          ),
        );
  const safe = (fn) => (req, res, next) =>
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  const login = (res, user) => {
    const token = crypto.randomBytes(32).toString("base64url");
    run(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
      sha(token),
      user.id,
      Date.now() + 7 * 86400000,
    );
    res.cookie("session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "1",
      maxAge: 7 * 86400000,
      path: "/",
    });
  };
  const publicUser = (u) => ({
    ...cleanUser(u),
    memberships: all(
      "SELECT group_key AS groupKey,level FROM memberships WHERE user_id=? ORDER BY group_key",
      u.id,
    ),
  });
  const loginAttempts = new Map();

  app.post(
    "/api/auth/signup",
    safe((req, res) => {
      const { name, password } = req.body;
      const email = String(req.body.email || "")
        .trim()
        .toLowerCase();
      if (
        !text(name, 80) ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        !text(password, 200) ||
        password.length < 12
      )
        fail(
          400,
          "Name, valid email, and a password of at least 12 characters are required",
        );
      if (q("SELECT id FROM users WHERE email=?", email))
        fail(409, "Email already registered");
      const isFirst = !q("SELECT id FROM users LIMIT 1");
      const id = run(
        "INSERT INTO users(email,name,password_hash,is_admin) VALUES(?,?,?,?)",
        email,
        name.trim(),
        passwordHash(password),
        isFirst ? 1 : 0,
      ).lastInsertRowid;
      const user = q("SELECT * FROM users WHERE id=?", id);
      login(res, user);
      res.status(201).json(publicUser(user));
    }),
  );
  app.post(
    "/api/auth/login",
    safe((req, res) => {
      const email = String(req.body.email || "")
        .trim()
        .toLowerCase();
      const state = loginAttempts.get(email) || { n: 0, until: 0 };
      if (state.until > Date.now())
        fail(429, "Too many attempts; try again later");
      const user = q("SELECT * FROM users WHERE email=? AND active=1", email);
      if (
        !user ||
        !verifyPassword(String(req.body.password || ""), user.password_hash)
      ) {
        state.n++;
        state.until = state.n >= 5 ? Date.now() + 15 * 60000 : 0;
        loginAttempts.set(email, state);
        fail(401, "Invalid email or password");
      }
      loginAttempts.delete(email);
      login(res, user);
      res.json(publicUser(user));
    }),
  );
  app.post(
    "/api/auth/logout",
    safe((req, res) => {
      if (req.cookies?.session)
        run(
          "DELETE FROM sessions WHERE token_hash=?",
          sha(req.cookies.session),
        );
      res.clearCookie("session", { path: "/" });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/me",
    auth,
    safe((req, res) => res.json(publicUser(req.user))),
  );
  app.use("/api", auth);

  app.get(
    "/api/admin/users",
    admin,
    safe((_req, res) =>
      res.json(
        all(
          "SELECT id,email,name,is_admin,active,created_at FROM users ORDER BY id",
        ).map(publicUser),
      ),
    ),
  );
  app.put(
    "/api/admin/users/:id",
    admin,
    safe((req, res) => {
      const target =
        q("SELECT * FROM users WHERE id=?", Number(req.params.id)) ||
        fail(404, "User not found");
      const { memberships, active, isAdmin } = req.body;
      if (
        !Array.isArray(memberships) ||
        memberships.some(
          (m) =>
            !GROUPS.includes(m.groupKey) ||
            ![1, 2, 3].includes(Number(m.level)),
        ) ||
        new Set(memberships.map((m) => m.groupKey)).size !== memberships.length
      )
        fail(400, "Invalid memberships");
      if (target.id === req.user.id && (!active || !isAdmin))
        fail(400, "You cannot remove your own admin access");
      tx(() => {
        run(
          "UPDATE users SET active=?,is_admin=? WHERE id=?",
          active ? 1 : 0,
          isAdmin ? 1 : 0,
          target.id,
        );
        run("DELETE FROM memberships WHERE user_id=?", target.id);
        for (const m of memberships)
          run(
            "INSERT INTO memberships(user_id,group_key,level) VALUES(?,?,?)",
            target.id,
            m.groupKey,
            Number(m.level),
          );
        if (!active) run("DELETE FROM sessions WHERE user_id=?", target.id);
        audit(
          req.user,
          null,
          null,
          "user.updated",
          `${target.email}: ${memberships.map((m) => `${m.groupKey}:${m.level}`).join(", ")}`,
        );
      });
      res.json(publicUser(q("SELECT * FROM users WHERE id=?", target.id)));
    }),
  );
  app.get(
    "/api/workflow",
    allowed,
    safe((_req, res) => {
      const w = getWorkflow();
      res.json({ revision: w.revision, stages: JSON.parse(w.stages_json) });
    }),
  );
  app.post(
    "/api/admin/workflow",
    admin,
    safe((req, res) => {
      let start;
      try {
        start = validateStages(req.body.stages);
      } catch (e) {
        fail(400, e.message);
      }
      const old = getWorkflow();
      const id = run(
        "INSERT INTO workflows(revision,stages_json,created_by) VALUES(?,?,?)",
        old.revision + 1,
        JSON.stringify(req.body.stages),
        req.user.id,
      ).lastInsertRowid;
      audit(
        req.user,
        null,
        null,
        "workflow.published",
        `revision ${old.revision + 1}; start ${start}`,
      );
      res
        .status(201)
        .json({ id, revision: old.revision + 1, stages: req.body.stages });
    }),
  );
  app.get(
    "/api/projects",
    allowed,
    safe((_req, res) =>
      res.json(
        all(
          "SELECT p.*,pw.revision AS workflow_revision FROM projects p JOIN project_workflows pw ON pw.id=p.project_workflow_id ORDER BY p.updated_at DESC,p.id DESC",
        ),
      ),
    ),
  );
  app.post(
    "/api/projects",
    allowed,
    safe((req, res) => {
      if (!req.user.is_admin) requireGroup(req.user, "product");
      if (
        !text(req.body.name, 120) ||
        (req.body.description && !text(req.body.description, 2000))
      )
        fail(400, "Project name required");
      const source = req.body.copyWorkflowFromProjectId
        ? project(req.body.copyWorkflowFromProjectId)
        : null;
      const w = source
        ? q("SELECT * FROM workflows WHERE id=?", source.workflow_id)
        : getWorkflow();
      const s = source ? stages(source) : JSON.parse(w.stages_json);
      const first = validateStages(s);
      const stage = s.find((x) => x.key === first);
      const id = tx(() => {
        const id = run(
          "INSERT INTO projects(name,description,workflow_id,current_stage,created_by) VALUES(?,?,?,?,?)",
          req.body.name.trim(),
          String(req.body.description || "").trim(),
          w.id,
          first,
          req.user.id,
        ).lastInsertRowid;
        const workflowId = run(
          "INSERT INTO project_workflows(project_id,revision,stages_json,created_by,copied_from_project_id,copied_from_revision) VALUES(?,1,?,?,?,?)",
          id,
          JSON.stringify(s),
          req.user.id,
          source?.id || null,
          source ? projectWorkflow(source).revision : null,
        ).lastInsertRowid;
        run(
          "UPDATE projects SET project_workflow_id=? WHERE id=?",
          workflowId,
          id,
        );
        const a = run(
          "INSERT INTO artifacts(project_id,stage_key,type,title,body,owner_group,updated_by) VALUES(?,?,?,?,?,?,?)",
          id,
          first,
          stage.type,
          stage.label,
          templates[stage.type],
          stage.owner,
          req.user.id,
        ).lastInsertRowid;
        run(
          "INSERT INTO artifact_versions(artifact_id,version,title,body,edited_by) VALUES(?,?,?,?,?)",
          a,
          1,
          stage.label,
          templates[stage.type],
          req.user.id,
        );
        audit(req.user, id, a, "project.created", req.body.name.trim());
        return id;
      });
      res.status(201).json({ id });
    }),
  );
  app.get(
    "/api/projects/:id",
    allowed,
    safe((req, res) => {
      const p = project(req.params.id);
      const ss = stages(p);
      res.json({
        ...p,
        workflow_revision: projectWorkflow(p).revision,
        stages: ss,
        stage: current(p),
        artifacts: all(
          "SELECT id,stage_key,type,title,status,version,owner_group,updated_at FROM artifacts WHERE project_id=? ORDER BY id",
          p.id,
        ),
        activities: all(
          "SELECT a.*,u.name AS actor FROM activities a LEFT JOIN users u ON u.id=a.actor_id WHERE a.project_id=? ORDER BY a.id DESC LIMIT 100",
          p.id,
        ),
      });
    }),
  );
  app.get(
    "/api/projects/:id/workflow",
    allowed,
    safe((req, res) => {
      const p = project(req.params.id);
      const workflow = projectWorkflow(p);
      res.json({
        revision: workflow.revision,
        stages: JSON.parse(workflow.stages_json),
        copiedFromProjectId: workflow.copied_from_project_id,
        copiedFromRevision: workflow.copied_from_revision,
      });
    }),
  );
  app.post(
    "/api/projects/:id/workflow",
    admin,
    safe((req, res) => {
      const p = project(req.params.id);
      const previous = projectWorkflow(p);
      if (Number(req.body.baseRevision) !== previous.revision)
        fail(409, "Project workflow changed; reload before publishing");
      let start;
      try {
        start = validateStages(req.body.stages);
      } catch (error) {
        fail(400, error.message);
      }
      const before = JSON.parse(previous.stages_json);
      if (start !== validateStages(before))
        fail(409, "The project's starting stage cannot change");
      const afterByKey = new Map(
        req.body.stages.map((stage) => [stage.key, stage]),
      );
      const existingArtifacts = all(
        "SELECT id,stage_key,status,owner_group FROM artifacts WHERE project_id=?",
        p.id,
      );
      for (const artifactRow of existingArtifacts) {
        const oldStage = before.find(
          (stage) => stage.key === artifactRow.stage_key,
        );
        const nextStage = afterByKey.get(artifactRow.stage_key);
        if (!oldStage || !nextStage)
          fail(409, "A stage with an artifact cannot be removed");
        const hasReview = Boolean(
          q(
            "SELECT 1 FROM review_requests WHERE artifact_id=? LIMIT 1",
            artifactRow.id,
          ),
        );
        const locked =
          artifactRow.status !== "draft" ||
          hasReview ||
          artifactRow.stage_key !== p.current_stage;
        const protectedFields = locked
          ? [
              "key",
              "label",
              "type",
              "owner",
              "approver",
              "minLevel",
              "approvals",
              "next",
            ]
          : ["key", "type"];
        if (
          protectedFields.some((field) => oldStage[field] !== nextStage[field])
        )
          fail(
            409,
            locked
              ? `Stage ${oldStage.label} has review history and cannot change`
              : `The current artifact's stage key and type cannot change`,
          );
      }
      const sourceId = req.body.copiedFromProjectId
        ? Number(req.body.copiedFromProjectId)
        : null;
      const sourceWorkflow = sourceId
        ? projectWorkflow(project(sourceId))
        : null;
      if (
        sourceWorkflow &&
        Number(req.body.copiedFromRevision) !== sourceWorkflow.revision
      )
        fail(409, "Source workflow changed; load its current revision again");
      const nextRevision = previous.revision + 1;
      const id = tx(() => {
        const id = run(
          "INSERT INTO project_workflows(project_id,revision,stages_json,created_by,copied_from_project_id,copied_from_revision) VALUES(?,?,?,?,?,?)",
          p.id,
          nextRevision,
          JSON.stringify(req.body.stages),
          req.user.id,
          sourceId,
          sourceWorkflow?.revision || null,
        ).lastInsertRowid;
        run(
          "UPDATE projects SET project_workflow_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          id,
          p.id,
        );
        const activeArtifact = existingArtifacts.find(
          (item) => item.stage_key === p.current_stage,
        );
        if (activeArtifact && activeArtifact.status === "draft") {
          const nextStage = afterByKey.get(activeArtifact.stage_key);
          if (nextStage.owner !== activeArtifact.owner_group)
            run(
              "UPDATE artifacts SET owner_group=? WHERE id=?",
              nextStage.owner,
              activeArtifact.id,
            );
        }
        audit(
          req.user,
          p.id,
          null,
          "project.workflow.published",
          `revision ${nextRevision}; start ${start}${sourceId ? `; derived from project ${sourceId} revision ${sourceWorkflow.revision}` : ""}`,
        );
        return id;
      });
      res.status(201).json({
        id,
        revision: nextRevision,
        stages: req.body.stages,
        copiedFromProjectId: sourceId,
        copiedFromRevision: sourceWorkflow?.revision || null,
      });
    }),
  );
  app.get(
    "/api/projects/:id/review-comments",
    allowed,
    safe((req, res) => {
      const p = project(req.params.id);
      res.json(
        all(
          "SELECT c.id,c.line,c.quote,c.body,c.resolved,a.id AS artifact_id,a.title,a.type FROM comments c JOIN artifacts a ON a.id=c.artifact_id WHERE a.project_id=? AND c.deleted=0 ORDER BY a.id,c.line,c.id",
          p.id,
        ),
      );
    }),
  );
  app.post(
    "/api/projects/:id/meeting",
    allowed,
    safe((req, res) => {
      const p = project(req.params.id);
      if (p.current_stage !== "planning")
        fail(409, "Project is not in pre-planning");
      requireGroup(req.user, current(p).owner);
      if (
        !text(req.body.at, 60) ||
        !Number.isFinite(Date.parse(req.body.at)) ||
        Date.parse(req.body.at) <= Date.now() ||
        !text(req.body.attendees, 1000)
      )
        fail(400, "Future time and attendees required");
      run(
        "UPDATE projects SET meeting_at=?,meeting_attendees=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        req.body.at,
        req.body.attendees.trim(),
        p.id,
      );
      audit(req.user, p.id, null, "planning.scheduled", req.body.at);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/artifacts/:id",
    allowed,
    safe((req, res) => {
      const a = artifact(req.params.id);
      const p = project(a.project_id);
      const s = p.current_stage === a.stage_key ? current(p) : null;
      res.json({
        ...a,
        reviewPolicy: s
          ? {
              group: s.approver,
              minLevel: s.minLevel,
              approvals: s.approvals,
              eligible: eligibleReviewers(a, s, req.user.id),
            }
          : null,
        comments: all(
          "SELECT c.*,u.name AS author FROM comments c JOIN users u ON u.id=c.author_id WHERE artifact_id=? AND c.deleted=0 ORDER BY c.id",
          a.id,
        ),
        versions: all(
          "SELECT v.id,v.version,v.title,v.created_at,u.name AS editor FROM artifact_versions v JOIN users u ON u.id=v.edited_by WHERE artifact_id=? ORDER BY version DESC",
          a.id,
        ),
        attachments: all(
          "SELECT id,filename,mime,bytes,created_at FROM attachments WHERE artifact_id=?",
          a.id,
        ),
        review:
          q(
            "SELECT * FROM review_requests WHERE artifact_id=? ORDER BY id DESC LIMIT 1",
            a.id,
          ) || null,
      });
    }),
  );
  app.get(
    "/api/artifacts/:id/versions/:version",
    allowed,
    safe((req, res) =>
      res.json(
        q(
          "SELECT * FROM artifact_versions WHERE artifact_id=? AND version=?",
          Number(req.params.id),
          Number(req.params.version),
        ) || fail(404, "Version not found"),
      ),
    ),
  );
  app.put(
    "/api/artifacts/:id",
    allowed,
    safe((req, res) => {
      const a = artifact(req.params.id),
        p = project(a.project_id);
      if (
        p.current_stage !== a.stage_key ||
        a.status === "in_review" ||
        a.status === "approved"
      )
        fail(409, "Artifact is locked");
      requireGroup(req.user, a.owner_group);
      if (
        !text(req.body.title, 160) ||
        !text(req.body.body, 200000) ||
        Number(req.body.version) !== a.version
      )
        fail(409, "Title, body, and current version required");
      tx(() => {
        run(
          "UPDATE artifacts SET title=?,body=?,version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP,status=? WHERE id=?",
          req.body.title.trim(),
          req.body.body,
          req.user.id,
          "draft",
          a.id,
        );
        run(
          "INSERT INTO artifact_versions(artifact_id,version,title,body,edited_by) VALUES(?,?,?,?,?)",
          a.id,
          a.version + 1,
          req.body.title.trim(),
          req.body.body,
          req.user.id,
        );
        run(
          "UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?",
          p.id,
        );
        audit(
          req.user,
          p.id,
          a.id,
          "artifact.edited",
          `version ${a.version + 1}`,
        );
      });
      res.json({ version: a.version + 1 });
    }),
  );
  app.post(
    "/api/artifacts/:id/comments",
    allowed,
    safe((req, res) => {
      const a = artifact(req.params.id);
      if (
        !Number.isInteger(req.body.line) ||
        req.body.line < 1 ||
        !text(req.body.quote, 500) ||
        !text(req.body.body, 4000)
      )
        fail(400, "Line, quote, and comment required");
      const sourceLine = a.body.split("\n")[req.body.line - 1];
      if (
        sourceLine !== req.body.quote.split("\n")[0] ||
        !a.body.includes(req.body.quote)
      )
        fail(
          409,
          "The quoted text changed. Refresh the artifact and comment again.",
        );
      const id = run(
        "INSERT INTO comments(artifact_id,author_id,line,quote,body) VALUES(?,?,?,?,?)",
        a.id,
        req.user.id,
        req.body.line,
        req.body.quote,
        req.body.body.trim(),
      ).lastInsertRowid;
      audit(
        req.user,
        a.project_id,
        a.id,
        "comment.added",
        `Line ${req.body.line}: ${req.body.body.trim()}`,
      );
      res.status(201).json({ id });
    }),
  );
  app.patch(
    "/api/comments/:id",
    allowed,
    safe((req, res) => {
      const c =
        q("SELECT * FROM comments WHERE id=?", Number(req.params.id)) ||
        fail(404, "Comment not found");
      const a = artifact(c.artifact_id);
      const payload = req.body || {};
      if (c.deleted) fail(409, "Comment has been removed");
      if (Object.hasOwn(payload, "body")) {
        if (Object.hasOwn(payload, "resolved") || !text(payload.body, 4000))
          fail(400, "Provide one valid comment edit");
        if (c.author_id !== req.user.id)
          fail(403, "Only the author can edit this comment");
        tx(() => {
          run(
            "INSERT INTO comment_edits(comment_id,body,changed_by) VALUES(?,?,?)",
            c.id,
            c.body,
            req.user.id,
          );
          run(
            "UPDATE comments SET body=?,edited_at=CURRENT_TIMESTAMP WHERE id=?",
            payload.body.trim(),
            c.id,
          );
          audit(
            req.user,
            a.project_id,
            a.id,
            "comment.edited",
            `Line ${c.line}: ${payload.body.trim()}`,
          );
        });
        return res.json({ ok: true });
      }
      if (typeof payload.resolved !== "boolean")
        fail(400, "Resolved status required");
      if (
        c.author_id !== req.user.id &&
        membership(req.user, a.owner_group) < 1
      )
        fail(403, "Only the author or owning group can resolve this comment");
      run(
        "UPDATE comments SET resolved=? WHERE id=?",
        payload.resolved ? 1 : 0,
        c.id,
      );
      audit(
        req.user,
        a.project_id,
        a.id,
        payload.resolved ? "comment.resolved" : "comment.reopened",
        `Line ${c.line}: ${c.body}`,
      );
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/comments/:id/history",
    allowed,
    safe((req, res) => {
      const c =
        q("SELECT * FROM comments WHERE id=?", Number(req.params.id)) ||
        fail(404, "Comment not found");
      res.json({
        current: { body: c.body, edited_at: c.edited_at },
        previous: all(
          "SELECT e.body,e.changed_at,u.name AS editor FROM comment_edits e JOIN users u ON u.id=e.changed_by WHERE e.comment_id=? ORDER BY e.id DESC",
          c.id,
        ),
      });
    }),
  );
  app.delete(
    "/api/comments/:id",
    allowed,
    safe((req, res) => {
      const c =
        q("SELECT * FROM comments WHERE id=?", Number(req.params.id)) ||
        fail(404, "Comment not found");
      if (c.deleted) fail(409, "Comment has already been removed");
      if (c.author_id !== req.user.id && !req.user.is_admin)
        fail(403, "Only the author or administrator can remove this comment");
      const a = artifact(c.artifact_id);
      tx(() => {
        run("UPDATE comments SET deleted=1 WHERE id=?", c.id);
        audit(
          req.user,
          a.project_id,
          a.id,
          "comment.removed",
          `Line ${c.line}: ${c.body}`,
        );
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/artifacts/:id/submit",
    allowed,
    safe((req, res) => {
      const a = artifact(req.params.id),
        p = project(a.project_id),
        s = current(p);
      if (
        !s ||
        s.key !== a.stage_key ||
        !["draft", "changes_requested"].includes(a.status)
      )
        fail(409, "Artifact is not ready for review");
      requireGroup(req.user, s.owner);
      if (s.key === "planning" && !p.meeting_at)
        fail(409, "Schedule the pre-planning call first");
      const eligible = eligibleReviewers(a, s, req.user.id);
      if (eligible < s.approvals)
        fail(
          409,
          `Review needs ${s.approvals} ${s.approver} approval(s) at level ${s.minLevel} or higher; ${eligible} eligible reviewer(s) are assigned. The requester and artifact editors cannot approve.`,
        );
      const id = tx(() => {
        run("UPDATE artifacts SET status=? WHERE id=?", "in_review", a.id);
        const id = run(
          "INSERT INTO review_requests(artifact_id,stage_key,requested_by) VALUES(?,?,?)",
          a.id,
          s.key,
          req.user.id,
        ).lastInsertRowid;
        audit(req.user, p.id, a.id, "review.requested", s.approver);
        return id;
      });
      res.status(201).json({ id });
    }),
  );
  app.post(
    "/api/artifacts/:id/withdraw-review",
    allowed,
    safe((req, res) => {
      const a = artifact(req.params.id);
      const p = project(a.project_id);
      if (p.current_stage !== a.stage_key || a.status !== "in_review")
        fail(409, "No active review to withdraw");
      requireGroup(req.user, a.owner_group);
      const review = q(
        "SELECT id FROM review_requests WHERE artifact_id=? AND status='pending' ORDER BY id DESC LIMIT 1",
        a.id,
      );
      if (!review) fail(409, "No active review to withdraw");
      tx(() => {
        run(
          "UPDATE review_requests SET status='withdrawn',closed_at=CURRENT_TIMESTAMP WHERE id=?",
          review.id,
        );
        run(
          "UPDATE artifacts SET status='draft',updated_at=CURRENT_TIMESTAMP WHERE id=?",
          a.id,
        );
        run(
          "UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?",
          p.id,
        );
        audit(
          req.user,
          p.id,
          a.id,
          "review.withdrawn",
          `Review #${review.id} withdrawn for editing`,
        );
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/inbox",
    allowed,
    safe((req, res) => {
      const rows = all(
        "SELECT r.*,a.title,a.type,a.project_id,p.name AS project_name FROM review_requests r JOIN artifacts a ON a.id=r.artifact_id JOIN projects p ON p.id=a.project_id WHERE r.status='pending' ORDER BY r.id DESC",
      );
      res.json(
        rows.filter((r) => {
          const p = project(r.project_id),
            s = stages(p).find((x) => x.key === r.stage_key);
          return (
            s &&
            membership(req.user, s.approver) >= s.minLevel &&
            r.requested_by !== req.user.id &&
            !q(
              "SELECT 1 FROM artifact_versions WHERE artifact_id=? AND edited_by=? LIMIT 1",
              r.artifact_id,
              req.user.id,
            ) &&
            !q(
              "SELECT 1 FROM review_decisions WHERE request_id=? AND reviewer_id=?",
              r.id,
              req.user.id,
            )
          );
        }),
      );
    }),
  );
  app.post(
    "/api/reviews/:id/decision",
    allowed,
    safe((req, res) => {
      const r =
        q("SELECT * FROM review_requests WHERE id=?", Number(req.params.id)) ||
        fail(404, "Review not found");
      if (r.status !== "pending") fail(409, "Review is closed");
      const a = artifact(r.artifact_id),
        p = project(a.project_id),
        s = current(p);
      if (!s || s.key !== r.stage_key) fail(409, "Review stage changed");
      requireGroup(req.user, s.approver, s.minLevel);
      if (
        r.requested_by === req.user.id ||
        q(
          "SELECT 1 FROM artifact_versions WHERE artifact_id=? AND edited_by=? LIMIT 1",
          a.id,
          req.user.id,
        )
      )
        fail(403, "Artifact author cannot approve their own work");
      if (
        !["approve", "changes_requested"].includes(req.body.decision) ||
        (req.body.note && !text(req.body.note, 4000)) ||
        (req.body.decision === "changes_requested" &&
          !text(req.body.note, 4000))
      )
        fail(400, "Invalid decision");
      if (
        q(
          "SELECT id FROM review_decisions WHERE request_id=? AND reviewer_id=?",
          r.id,
          req.user.id,
        )
      )
        fail(409, "You already reviewed this request");
      let advanced = false;
      tx(() => {
        run(
          "INSERT INTO review_decisions(request_id,reviewer_id,decision,note) VALUES(?,?,?,?)",
          r.id,
          req.user.id,
          req.body.decision,
          req.body.note || "",
        );
        audit(
          req.user,
          p.id,
          a.id,
          `review.${req.body.decision}`,
          req.body.note || "",
        );
        if (req.body.decision === "changes_requested") {
          run(
            "UPDATE review_requests SET status='changes_requested',closed_at=CURRENT_TIMESTAMP WHERE id=?",
            r.id,
          );
          run(
            "UPDATE artifacts SET status='changes_requested' WHERE id=?",
            a.id,
          );
        } else if (
          q(
            "SELECT count(*) AS n FROM review_decisions WHERE request_id=? AND decision='approve'",
            r.id,
          ).n >= s.approvals
        ) {
          run(
            "UPDATE review_requests SET status='approved',closed_at=CURRENT_TIMESTAMP WHERE id=?",
            r.id,
          );
          run("UPDATE artifacts SET status='approved' WHERE id=?", a.id);
          if (s.next) {
            const next = stages(p).find((x) => x.key === s.next);
            const nextId = run(
              "INSERT INTO artifacts(project_id,stage_key,type,title,body,owner_group,updated_by) VALUES(?,?,?,?,?,?,?)",
              p.id,
              next.key,
              next.type,
              next.label,
              templates[next.type],
              next.owner,
              req.user.id,
            ).lastInsertRowid;
            run(
              "INSERT INTO artifact_versions(artifact_id,version,title,body,edited_by) VALUES(?,?,?,?,?)",
              nextId,
              1,
              next.label,
              templates[next.type],
              req.user.id,
            );
            run(
              "UPDATE projects SET current_stage=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
              next.key,
              p.id,
            );
            audit(req.user, p.id, nextId, "stage.started", next.key);
          } else
            run(
              "UPDATE projects SET current_stage='complete',updated_at=CURRENT_TIMESTAMP WHERE id=?",
              p.id,
            );
          advanced = true;
        }
      });
      res.json({ advanced });
    }),
  );

  app.get(
    "/api/skills",
    allowed,
    safe((req, res) => {
      const rows = all(
        "SELECT id,group_key AS groupKey,name,instructions,enabled FROM skills ORDER BY group_key,name",
      );
      res.json(
        req.user.is_admin
          ? rows
          : rows.filter((s) => membership(req.user, s.groupKey) && s.enabled),
      );
    }),
  );
  app.get(
    "/api/models",
    allowed,
    safe(async (_req, res) => res.json(await models(dataDir))),
  );
  app.get(
    "/api/admin/providers",
    admin,
    safe((_req, res) => res.json(providerStatus(dataDir))),
  );
  app.put(
    "/api/admin/providers/:provider",
    admin,
    safe((req, res) => {
      if (!text(req.body.key, 4096)) fail(400, "API key required");
      setProviderKey(dataDir, req.params.provider, req.body.key);
      audit(req.user, null, null, "provider.configured", req.params.provider);
      res.json({ ok: true });
    }),
  );
  app.delete(
    "/api/admin/providers/:provider",
    admin,
    safe((req, res) => {
      removeProviderKey(dataDir, req.params.provider);
      audit(req.user, null, null, "provider.disconnected", req.params.provider);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/admin/skills",
    admin,
    safe((req, res) => {
      const { groupKey, name, instructions } = req.body;
      if (
        !GROUPS.includes(groupKey) ||
        !text(name, 80) ||
        !text(instructions, 16000)
      )
        fail(400, "Invalid skill");
      const id = run(
        "INSERT INTO skills(group_key,name,instructions) VALUES(?,?,?)",
        groupKey,
        name.trim(),
        instructions,
      ).lastInsertRowid;
      audit(req.user, null, null, "skill.created", name);
      res.status(201).json({ id });
    }),
  );
  app.put(
    "/api/admin/skills/:id",
    admin,
    safe((req, res) => {
      const s =
        q("SELECT * FROM skills WHERE id=?", Number(req.params.id)) ||
        fail(404, "Skill not found");
      const { name, instructions, enabled } = req.body;
      if (!text(name, 80) || !text(instructions, 16000))
        fail(400, "Invalid skill");
      run(
        "UPDATE skills SET name=?,instructions=?,enabled=? WHERE id=?",
        name.trim(),
        instructions,
        enabled ? 1 : 0,
        s.id,
      );
      audit(req.user, null, null, "skill.updated", name);
      res.json({ ok: true });
    }),
  );

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 3 },
    fileFilter: (_req, file, cb) => {
      const ok = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "text/plain",
        "text/markdown",
      ].includes(file.mimetype);
      cb(
        ok
          ? null
          : new Error(
              "Only PDF, PNG, JPEG, WebP, TXT, and MD files are allowed",
            ),
        ok,
      );
    },
  }).array("files", 5);
  const extensions = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "text/plain": ".txt",
    "text/markdown": ".md",
  };
  const validUpload = (file) =>
    file.mimetype === "application/pdf"
      ? file.buffer.subarray(0, 5).toString() === "%PDF-"
      : file.mimetype === "image/png"
        ? file.buffer
            .subarray(0, 8)
            .equals(Buffer.from("89504e470d0a1a0a", "hex"))
        : file.mimetype === "image/jpeg"
          ? file.buffer.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))
          : file.mimetype === "image/webp"
            ? file.buffer.subarray(0, 4).toString() === "RIFF" &&
              file.buffer.subarray(8, 12).toString() === "WEBP"
            : !file.buffer.includes(0);
  app.get(
    "/api/projects/:id/attachments",
    allowed,
    safe((req, res) => {
      const p = project(req.params.id);
      res.json(
        all(
          `SELECT a.id,a.project_id,a.artifact_id,a.chat_message_id,a.owner_id,
                  a.filename,a.mime,a.bytes,a.scope,a.created_at,
                  u.name AS uploaded_by, ar.title AS artifact_title
           FROM attachments a
           JOIN users u ON u.id=a.owner_id
           LEFT JOIN artifacts ar ON ar.id=a.artifact_id
           WHERE a.project_id=? AND
             (a.scope!='chat' OR a.chat_message_id IS NOT NULL OR a.owner_id=?)
           ORDER BY a.id DESC`,
          p.id,
          req.user.id,
        ),
      );
    }),
  );
  app.post(
    "/api/projects/:id/attachments",
    allowed,
    (req, res, next) =>
      upload(req, res, (err) =>
        err ? next(Object.assign(err, { status: 400 })) : next(),
      ),
    safe((req, res) => {
      const p = project(req.params.id);
      const artifactId = req.body.artifactId
        ? Number(req.body.artifactId)
        : null;
      if (req.body.artifactId && !Number.isSafeInteger(artifactId))
        fail(400, "Invalid artifact ID");
      const requestedScope = req.body.scope || "chat";
      if (!["chat", "project", "artifact"].includes(requestedScope))
        fail(400, "Invalid attachment scope");
      if (requestedScope === "artifact" && !artifactId)
        fail(400, "Choose an artifact for this upload");
      const scope = artifactId ? "artifact" : requestedScope;
      if (artifactId) {
        const a = artifact(artifactId);
        if (a.project_id !== p.id)
          fail(400, "Artifact belongs to another project");
        if (
          p.current_stage !== a.stage_key ||
          !["draft", "changes_requested"].includes(a.status)
        )
          fail(409, "Artifact is locked");
        requireGroup(req.user, a.owner_group);
        if (
          q("SELECT count(*) AS n FROM attachments WHERE artifact_id=?", a.id)
            .n +
            req.files.length >
          5
        )
          fail(400, "Maximum five attachments per artifact");
      } else if (
        scope === "chat" &&
        q(
          "SELECT count(*) AS n FROM attachments WHERE project_id=? AND owner_id=? AND scope='chat' AND chat_message_id IS NULL",
          p.id,
          req.user.id,
        ).n +
          req.files.length >
          5
      ) {
        fail(400, "Maximum five pending chat files per project");
      }
      if (!req.files?.length) fail(400, "Choose at least one file");
      const usage = q(
        "SELECT count(*) AS files,coalesce(sum(bytes),0) AS bytes FROM attachments WHERE project_id=?",
        p.id,
      );
      if (
        usage.files + req.files.length > MAX_PROJECT_FILES ||
        usage.bytes + req.files.reduce((sum, file) => sum + file.size, 0) >
          MAX_PROJECT_BYTES
      )
        fail(400, "Project file library limit is 100 files and 250 MB");
      for (const file of req.files)
        if (!validUpload(file))
          fail(400, `File content does not match ${file.mimetype}`);
      const written = [];
      let rows;
      try {
        rows = tx(() =>
          req.files.map((file) => {
            const stored = crypto.randomUUID() + extensions[file.mimetype];
            const target = path.join(dataDir, "uploads", stored);
            fs.writeFileSync(target, file.buffer, { flag: "wx" });
            written.push(target);
            const id = run(
              "INSERT INTO attachments(project_id,artifact_id,owner_id,filename,stored_name,mime,bytes,scope) VALUES(?,?,?,?,?,?,?,?)",
              p.id,
              artifactId,
              req.user.id,
              path.basename(file.originalname).slice(0, 200),
              stored,
              file.mimetype,
              file.size,
              scope,
            ).lastInsertRowid;
            audit(
              req.user,
              p.id,
              artifactId,
              "attachment.uploaded",
              `${path.basename(file.originalname).slice(0, 200)} (${scope} #${id})`,
            );
            return {
              id,
              filename: path.basename(file.originalname),
              bytes: file.size,
            };
          }),
        );
      } catch (error) {
        for (const target of written) fs.rmSync(target, { force: true });
        throw error;
      }
      res.status(201).json(rows);
    }),
  );
  app.get(
    "/api/attachments/:id",
    allowed,
    safe((req, res) => {
      const a =
        q("SELECT * FROM attachments WHERE id=?", Number(req.params.id)) ||
        fail(404, "Attachment not found");
      project(a.project_id);
      if (
        a.scope === "chat" &&
        !a.chat_message_id &&
        a.owner_id !== req.user.id
      )
        fail(403, "Attachment not available");
      res.setHeader("Content-Type", a.mime);
      res.setHeader(
        "Content-Disposition",
        `${a.mime.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      );
      res.sendFile(path.join(dataDir, "uploads", a.stored_name), {
        dotfiles: "allow",
      });
    }),
  );
  app.get(
    "/api/projects/:id/pending-attachments",
    allowed,
    safe((req, res) => {
      const p = project(req.params.id);
      res.json(
        all(
          "SELECT id,filename,bytes,mime FROM attachments WHERE project_id=? AND owner_id=? AND scope='chat' AND chat_message_id IS NULL ORDER BY id",
          p.id,
          req.user.id,
        ),
      );
    }),
  );
  app.delete(
    "/api/attachments/:id",
    allowed,
    safe((req, res) => {
      const a =
        q("SELECT * FROM attachments WHERE id=?", Number(req.params.id)) ||
        fail(404, "Attachment not found");
      const p = project(a.project_id);
      if (a.owner_id !== req.user.id && !req.user.is_admin)
        fail(403, "Only the uploader or an administrator can remove this file");
      if (a.scope === "chat" && a.chat_message_id)
        fail(403, "Sent chat files remain in project history");
      if (a.scope === "artifact") {
        const ar = artifact(a.artifact_id);
        if (p.current_stage !== ar.stage_key || ar.status !== "draft")
          fail(409, "Artifact file is locked by review history");
        const reference = new RegExp(`/api/attachments/${a.id}(?!\\d)`);
        if (
          [
            ar.body,
            ...all(
              "SELECT body FROM artifact_versions WHERE artifact_id=?",
              ar.id,
            ).map((v) => v.body),
          ].some((body) => reference.test(body))
        )
          fail(409, "Image is referenced by an artifact version");
      }
      if (
        q(
          `SELECT 1 FROM chat_messages c, json_each(c.context_json,'$.attachmentIds') j
         WHERE c.project_id=? AND CAST(j.value AS INTEGER)=? LIMIT 1`,
          p.id,
          a.id,
        )
      )
        fail(409, "File is referenced by agent chat history");
      tx(() => {
        run("DELETE FROM attachments WHERE id=?", a.id);
        audit(
          req.user,
          a.project_id,
          a.artifact_id,
          "attachment.removed",
          `${a.filename} (${a.scope} #${a.id})`,
        );
      });
      fs.rmSync(path.join(dataDir, "uploads", a.stored_name), { force: true });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/projects/:id/chat",
    allowed,
    safe((req, res) => {
      project(req.params.id);
      res.json(
        all(
          "SELECT c.*,u.name AS author FROM chat_messages c LEFT JOIN users u ON u.id=c.user_id WHERE project_id=? ORDER BY c.id DESC LIMIT 100",
          Number(req.params.id),
        ).reverse(),
      );
    }),
  );
  app.post(
    "/api/projects/:id/chat",
    allowed,
    safe(async (req, res) => {
      const p = project(req.params.id);
      const {
        message,
        provider,
        model,
        skillIds = [],
        artifactIds = [],
        attachmentIds: requestedAttachmentIds = [],
      } = req.body;
      const mentionedFileIds = fileMentionIds(message || "");
      const explicitFileIds = Array.isArray(requestedAttachmentIds)
        ? requestedAttachmentIds.map(Number)
        : [];
      const attachmentIds = [
        ...new Set([...explicitFileIds, ...mentionedFileIds]),
      ];
      if (
        !text(message, 12000) ||
        !["anthropic", "openai", "openai-codex"].includes(provider) ||
        !text(model, 120) ||
        !Array.isArray(skillIds) ||
        !Array.isArray(artifactIds) ||
        !Array.isArray(requestedAttachmentIds) ||
        attachmentIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
        skillIds.length > 10 ||
        artifactIds.length > 10 ||
        attachmentIds.length > 5 ||
        new Set(skillIds).size !== skillIds.length ||
        new Set(artifactIds).size !== artifactIds.length ||
        new Set(explicitFileIds).size !== explicitFileIds.length
      )
        fail(400, "Invalid chat request");
      if (
        !(await models(dataDir)).some(
          (item) => item.provider === provider && item.id === model,
        )
      )
        fail(400, "Choose an available model for this provider");
      const skills = skillIds.map(
        (id) =>
          q("SELECT * FROM skills WHERE id=? AND enabled=1", Number(id)) ||
          fail(404, "Skill not found"),
      );
      for (const s of skills)
        if (!membership(req.user, s.group_key))
          fail(403, "Skill is not assigned to your group");
      const artifacts = artifactIds.map((id) => artifact(id));
      for (const a of artifacts)
        if (a.project_id !== p.id)
          fail(403, "Artifact belongs to another project");
      const files = attachmentIds.map(
        (id) =>
          q("SELECT * FROM attachments WHERE id=?", Number(id)) ||
          fail(404, "Attachment not found"),
      );
      for (const f of files)
        if (
          f.project_id !== p.id ||
          (f.scope === "chat" &&
            !f.chat_message_id &&
            f.owner_id !== req.user.id)
        )
          fail(403, "Attachment not available");
      const history = all(
        "SELECT role,body FROM chat_messages WHERE project_id=? ORDER BY id DESC LIMIT 12",
        p.id,
      ).reverse();
      const answer = await pi({
        message,
        provider,
        model,
        skills,
        artifacts,
        files,
        history,
        project: p,
        dataDir,
      });
      tx(() => {
        const userMessageId = run(
          "INSERT INTO chat_messages(project_id,user_id,role,body,context_json) VALUES(?,?,?,?,?)",
          p.id,
          req.user.id,
          "user",
          message,
          JSON.stringify({
            provider,
            model,
            skillIds,
            artifactIds,
            attachmentIds,
          }),
        ).lastInsertRowid;
        for (const f of files)
          if (f.scope === "chat" && !f.chat_message_id)
            run(
              "UPDATE attachments SET chat_message_id=? WHERE id=?",
              userMessageId,
              f.id,
            );
        run(
          "INSERT INTO chat_messages(project_id,user_id,role,body) VALUES(?,?,?,?)",
          p.id,
          null,
          "assistant",
          answer,
        );
        audit(req.user, p.id, null, "chat.completed", `${provider}/${model}`);
      });
      res.json({ answer });
    }),
  );

  app.use("/api", (_req, _res, next) =>
    next(Object.assign(new Error("Not found"), { status: 404 })),
  );
  const dist = path.resolve("dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get("*splat", (_req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use((err, _req, res, _next) => {
    if (!res.headersSent)
      res
        .status(err.status || 500)
        .json({ error: err.status ? err.message : "Internal server error" });
  });
  return { app, db };
}
