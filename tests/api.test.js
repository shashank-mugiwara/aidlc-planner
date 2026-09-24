import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { openDb } from "../server/db.js";

let dir, db, app, admin, piCalls;
const password = "correct-horse-battery-staple";
const post = (agent, url, body = {}) => agent.post("/api" + url).send(body);
const put = (agent, url, body = {}) => agent.put("/api" + url).send(body);
const get = (agent, url) => agent.get("/api" + url);
async function signup(name) {
  const agent = request.agent(app);
  const res = await post(agent, "/auth/signup", {
    name,
    email: `${name}@example.test`,
    password,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { agent, user: res.body };
}
async function assign(person, memberships) {
  const res = await put(admin.agent, `/admin/users/${person.user.id}`, {
    memberships,
    active: true,
    isAdmin: false,
  });
  expect(res.status).toBe(200);
}
async function member(name, group, level) {
  const p = await signup(name);
  await assign(p, [{ groupKey: group, level }]);
  return p.agent;
}
async function edit(agent, id, version, title) {
  return put(agent, `/artifacts/${id}`, {
    title,
    body: `# ${title}\n\nA specific requirement with a testable result.`,
    version,
  });
}
async function projectWithFirstArtifact(pm) {
  const created = await post(pm, "/projects", {
    name: "Onboarding",
    description: "Improve the customer start.",
  });
  expect(created.status).toBe(201);
  const p = (await get(pm, `/projects/${created.body.id}`)).body;
  return { p, a: p.artifacts[0] };
}
beforeEach(async () => {
  piCalls = [];
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-test-"));
  db = openDb(dir);
  app = createApp({
    db,
    dataDir: dir,
    pi: async (input) => {
      piCalls.push(input);
      return "Drafted with Pi test adapter.";
    },
    models: async () => [{ provider: "anthropic", id: "example-model" }],
  }).app;
  admin = await signup("admin");
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("identity and permissions", () => {
  it("keeps provider credentials admin-only and out of read responses", async () => {
    const pm = await member("pm", "product", 1);
    expect((await get(pm, "/admin/providers")).status).toBe(403);
    expect(
      (await put(pm, "/admin/providers/anthropic", { key: "secret" })).status,
    ).toBe(403);
    expect(
      (
        await put(admin.agent, "/admin/providers/anthropic", {
          key: "test-only-key",
        })
      ).status,
    ).toBe(200);
    const status = await get(admin.agent, "/admin/providers");
    expect(status.body.find((p) => p.provider === "anthropic")).toMatchObject({
      configured: true,
      source: "stored key",
    });
    expect(JSON.stringify(status.body)).not.toContain("test-only-key");
    const file = path.join(dir, "pi", "auth.json");
    expect(JSON.parse(fs.readFileSync(file, "utf8")).anthropic).toEqual({
      type: "api_key",
      key: "test-only-key",
    });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(
      (await admin.agent.delete("/api/admin/providers/anthropic")).status,
    ).toBe(200);
    expect(
      (await get(admin.agent, "/admin/providers")).body.find(
        (p) => p.provider === "anthropic",
      ).source,
    ).toBe(null);
  });
  it("keeps new signups pending and enforces owner-only edits and current versions", async () => {
    const pending = await signup("pending");
    expect((await get(pending.agent, "/projects")).status).toBe(403);
    const pm = await member("pm", "product", 1);
    const engineer = await member("engineer", "engineering", 1);
    const { p, a } = await projectWithFirstArtifact(pm);
    expect((await edit(engineer, a.id, 1, "Wrong owner")).status).toBe(403);
    expect((await edit(pm, a.id, 1, "BRD draft")).status).toBe(200);
    expect((await edit(pm, a.id, 1, "Stale draft")).status).toBe(409);
    const detail = (await get(pm, `/artifacts/${a.id}`)).body;
    expect(detail.version).toBe(2);
    expect(detail.versions.map((v) => v.version)).toEqual([2, 1]);
    const comment = await post(engineer, `/artifacts/${a.id}/comments`, {
      line: 1,
      quote: "# BRD draft",
      body: "Clarify the metric.",
    });
    expect(comment.status).toBe(201);
    expect((await get(pm, `/artifacts/${a.id}`)).body.comments).toHaveLength(1);
    const activity = (await get(pm, `/projects/${p.id}`)).body.activities;
    expect(
      activity.find((event) => event.action === "comment.added").detail,
    ).toContain("Clarify the metric.");
    expect(
      (
        await pm
          .patch(`/api/comments/${comment.body.id}`)
          .send({ resolved: true })
      ).status,
    ).toBe(200);
    expect(
      (await get(pm, `/artifacts/${a.id}`)).body.comments[0].resolved,
    ).toBe(1);
    expect(
      (
        await pm
          .patch(`/api/comments/${comment.body.id}`)
          .send({ body: "Unauthorized edit" })
      ).status,
    ).toBe(403);
    expect(
      (
        await engineer
          .patch(`/api/comments/${comment.body.id}`)
          .send({ body: "Clarify the conversion metric." })
      ).status,
    ).toBe(200);
    expect(
      (await get(pm, `/comments/${comment.body.id}/history`)).body.previous[0]
        .body,
    ).toBe("Clarify the metric.");
    expect((await get(pm, `/artifacts/${a.id}`)).body.comments[0].body).toBe(
      "Clarify the conversion metric.",
    );
    expect(
      (await engineer.delete(`/api/comments/${comment.body.id}`)).status,
    ).toBe(200);
    expect((await get(pm, `/artifacts/${a.id}`)).body.comments).toHaveLength(0);
    expect(
      (await get(pm, `/projects/${p.id}`)).body.activities.some(
        (event) => event.action === "comment.removed",
      ),
    ).toBe(true);
  });
  it("explains BRD review eligibility by group and level", async () => {
    const pm = await member("pm", "product", 1);
    await member("productlead", "product", 2);
    await member("projectmanager", "project", 3);
    const { a } = await projectWithFirstArtifact(pm);
    const policy = (await get(pm, `/artifacts/${a.id}`)).body.reviewPolicy;
    expect(policy).toMatchObject({
      group: "business",
      minLevel: 2,
      approvals: 1,
      eligible: 0,
    });
    const denied = await post(pm, `/artifacts/${a.id}/submit`);
    expect(denied.status).toBe(409);
    expect(denied.body.error).toContain("business");
    await member("businesslead", "business", 2);
    expect(
      (await get(pm, `/artifacts/${a.id}`)).body.reviewPolicy.eligible,
    ).toBe(1);
  });
  it("requires an eligible reviewer and advances BRD through stories", async () => {
    const pm = await member("pm", "product", 1);
    const productLead = await member("productlead", "product", 2);
    const businessLead = await member("businesslead", "business", 2);
    const projectMember = await member("projectmember", "project", 1);
    const projectLead = await member("projectlead", "project", 2);
    const engineer = await member("engineer", "engineering", 1);
    const engineerLead = await member("engineerlead", "engineering", 2);
    const { p, a } = await projectWithFirstArtifact(pm);
    const sequence = [
      { actor: pm, reviewer: businessLead, type: "BRD" },
      { actor: pm, reviewer: productLead, type: "PRD" },
      { actor: projectMember, reviewer: projectLead, type: "PLANNING" },
      { actor: engineer, reviewer: engineerLead, type: "DESIGN" },
      { actor: engineer, reviewer: projectLead, type: "STORIES" },
    ];
    let artifactId = a.id;
    for (const [index, stage] of sequence.entries()) {
      const detail = (await get(stage.actor, `/artifacts/${artifactId}`)).body;
      expect(detail.type).toBe(stage.type);
      expect(
        (
          await edit(
            stage.actor,
            artifactId,
            detail.version,
            `${stage.type} ready`,
          )
        ).status,
      ).toBe(200);
      if (stage.type === "PLANNING") {
        expect(
          (await post(stage.actor, `/artifacts/${artifactId}/submit`)).status,
        ).toBe(409);
        expect(
          (
            await post(stage.actor, `/projects/${p.id}/meeting`, {
              at: new Date(Date.now() + 86400000).toISOString(),
              attendees: "Engineering manager, team lead",
            })
          ).status,
        ).toBe(200);
      }
      const submitted = await post(
        stage.actor,
        `/artifacts/${artifactId}/submit`,
      );
      expect(submitted.status).toBe(201);
      expect(
        (
          await edit(
            stage.actor,
            artifactId,
            detail.version + 1,
            "Edit during review",
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await post(stage.actor, `/reviews/${submitted.body.id}/decision`, {
            decision: "approve",
          })
        ).status,
      ).toBe(403);
      expect(
        (await get(stage.reviewer, "/inbox")).body.some(
          (r) => r.id === submitted.body.id,
        ),
      ).toBe(true);
      const decided = await post(
        stage.reviewer,
        `/reviews/${submitted.body.id}/decision`,
        { decision: "approve" },
      );
      expect(decided.status).toBe(200);
      expect(decided.body.advanced).toBe(true);
      const next = (await get(pm, `/projects/${p.id}`)).body;
      expect(next.artifacts).toHaveLength(index + 1 + (index < 4 ? 1 : 0));
      if (index < 4) artifactId = next.artifacts.at(-1).id;
      else expect(next.current_stage).toBe("complete");
    }
    const activity = (await get(pm, `/projects/${p.id}`)).body.activities;
    expect(activity.filter((x) => x.action === "review.approve")).toHaveLength(
      5,
    );
  });
  it("returns changes for editing, then allows a new review", async () => {
    const pm = await member("pm", "product", 1);
    const businessLead = await member("businesslead", "business", 2);
    const { p, a } = await projectWithFirstArtifact(pm);
    const first = await post(pm, `/artifacts/${a.id}/submit`);
    expect(first.status).toBe(201);
    const fileUrl = `/api/projects/${p.id}/attachments`;
    expect(
      (
        await pm
          .post(fileUrl)
          .field("scope", "artifact")
          .field("artifactId", String(a.id))
          .attach("files", Buffer.from("in review"), {
            filename: "review.txt",
            contentType: "text/plain",
          })
      ).status,
    ).toBe(409);
    expect(
      (
        await post(businessLead, `/reviews/${first.body.id}/decision`, {
          decision: "changes_requested",
          note: "  ",
        })
      ).status,
    ).toBe(400);
    expect((await get(pm, `/artifacts/${a.id}`)).body.status).toBe("in_review");
    expect(
      (
        await post(businessLead, `/reviews/${first.body.id}/decision`, {
          decision: "changes_requested",
          note: "Define the success measure.",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await pm
          .post(fileUrl)
          .field("scope", "artifact")
          .field("artifactId", String(a.id))
          .attach("files", Buffer.from("new evidence"), {
            filename: "evidence.txt",
            contentType: "text/plain",
          })
      ).status,
    ).toBe(201);
    expect((await edit(pm, a.id, 1, "Updated measure")).status).toBe(200);
    expect((await post(pm, `/artifacts/${a.id}/submit`)).status).toBe(201);
  });
  it("lets the Product Manager withdraw a pending BRD review and revise its source", async () => {
    const pm = await member("pm", "product", 1);
    const businessLead = await member("businesslead", "business", 2);
    const businessManager = await member("businessmanager", "business", 3);
    const { p, a } = await projectWithFirstArtifact(pm);
    const workflow = (await get(admin.agent, `/projects/${p.id}/workflow`))
      .body;
    workflow.stages[0].approvals = 2;
    expect(
      (
        await post(admin.agent, `/projects/${p.id}/workflow`, {
          baseRevision: workflow.revision,
          stages: workflow.stages,
        })
      ).status,
    ).toBe(201);
    const first = await post(pm, `/artifacts/${a.id}/submit`);
    expect(first.status).toBe(201);
    expect(
      (
        await post(businessLead, `/reviews/${first.body.id}/decision`, {
          decision: "approve",
        })
      ).body.advanced,
    ).toBe(false);
    expect(
      (await post(businessManager, `/artifacts/${a.id}/withdraw-review`))
        .status,
    ).toBe(403);
    expect(
      (await edit(businessManager, a.id, 1, "Business rewrite")).status,
    ).toBe(409);
    expect((await post(pm, `/artifacts/${a.id}/withdraw-review`)).status).toBe(
      200,
    );
    const withdrawn = (await get(pm, `/artifacts/${a.id}`)).body;
    expect(withdrawn.status).toBe("draft");
    expect(withdrawn.review.status).toBe("withdrawn");
    expect(withdrawn.version).toBe(1);
    expect(
      (await get(businessLead, "/inbox")).body.some(
        (item) => item.id === first.body.id,
      ),
    ).toBe(false);
    expect(
      (await edit(businessManager, a.id, 1, "Business rewrite")).status,
    ).toBe(403);
    expect((await edit(pm, a.id, 1, "PM revised BRD")).status).toBe(200);
    const second = await post(pm, `/artifacts/${a.id}/submit`);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
    expect(
      (
        await post(businessLead, `/reviews/${first.body.id}/decision`, {
          decision: "approve",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post(businessLead, `/reviews/${second.body.id}/decision`, {
          decision: "approve",
        })
      ).body.advanced,
    ).toBe(false);
    expect(
      (
        await post(businessManager, `/reviews/${second.body.id}/decision`, {
          decision: "approve",
        })
      ).body.advanced,
    ).toBe(true);
    expect(
      (await get(pm, `/projects/${p.id}`)).body.activities.some(
        (event) =>
          event.action === "review.withdrawn" &&
          event.detail.includes(String(first.body.id)),
      ),
    ).toBe(true);
  });
});

describe("workflow, attachments, and agent context", () => {
  it("migrates an existing project into its own pinned workflow snapshot", async () => {
    const pm = await member("pm", "product", 1);
    const { p } = await projectWithFirstArtifact(pm);
    const template = (await get(admin.agent, "/workflow")).body;
    template.stages[0].approver = "engineering";
    expect(
      (
        await post(admin.agent, "/admin/workflow", {
          stages: template.stages,
        })
      ).status,
    ).toBe(201);
    db.prepare("UPDATE projects SET project_workflow_id=NULL WHERE id=?").run(
      p.id,
    );
    db.prepare("DELETE FROM project_workflows WHERE project_id=?").run(p.id);
    db.close();
    db = openDb(dir);
    const restored = db
      .prepare(
        "SELECT pw.revision,pw.stages_json FROM projects p JOIN project_workflows pw ON pw.id=p.project_workflow_id WHERE p.id=?",
      )
      .get(p.id);
    expect(restored.revision).toBe(1);
    expect(JSON.parse(restored.stages_json)[0].approver).toBe("business");
  });
  it("owns workflow revisions per project and copies without sharing future edits", async () => {
    const pm = await member("pm", "product", 1);
    const businessLead = await member("businesslead", "business", 2);
    const source = await projectWithFirstArtifact(pm);
    const target = await projectWithFirstArtifact(pm);
    const sourceWorkflow = (
      await get(admin.agent, `/projects/${source.p.id}/workflow`)
    ).body;
    expect(sourceWorkflow.revision).toBe(1);
    const tailored = structuredClone(sourceWorkflow.stages);
    tailored[1].approvals = 2;
    const published = await post(
      admin.agent,
      `/projects/${source.p.id}/workflow`,
      {
        baseRevision: 1,
        stages: tailored,
      },
    );
    expect(published.status).toBe(201);
    expect(published.body.revision).toBe(2);
    expect(
      (await get(pm, `/projects/${target.p.id}`)).body.stages[1].approvals,
    ).toBe(1);
    const copied = await post(
      admin.agent,
      `/projects/${target.p.id}/workflow`,
      {
        baseRevision: 1,
        stages: tailored,
        copiedFromProjectId: source.p.id,
        copiedFromRevision: 2,
      },
    );
    expect(copied.status).toBe(201);
    expect(copied.body.copiedFromProjectId).toBe(source.p.id);
    expect(copied.body.copiedFromRevision).toBe(2);
    expect(
      (await get(pm, `/projects/${target.p.id}`)).body.workflow_revision,
    ).toBe(2);
    const updatedSource = structuredClone(tailored);
    updatedSource[1].approvals = 3;
    expect(
      (
        await post(admin.agent, `/projects/${source.p.id}/workflow`, {
          baseRevision: 2,
          stages: updatedSource,
        })
      ).status,
    ).toBe(201);
    expect(
      (await get(pm, `/projects/${target.p.id}`)).body.stages[1].approvals,
    ).toBe(2);
    expect(
      (
        await post(admin.agent, `/projects/${target.p.id}/workflow`, {
          baseRevision: 1,
          stages: tailored,
        })
      ).status,
    ).toBe(409);
    const createdFromCopy = await post(pm, "/projects", {
      name: "Copied process",
      description: "Use the source route.",
      copyWorkflowFromProjectId: source.p.id,
    });
    expect(createdFromCopy.status).toBe(201);
    const newDetail = (await get(pm, `/projects/${createdFromCopy.body.id}`))
      .body;
    expect(newDetail.workflow_revision).toBe(1);
    expect(newDetail.stages[1].approvals).toBe(3);
    expect((await get(admin.agent, "/workflow")).body.revision).toBe(1);
    const submitted = await post(pm, `/artifacts/${source.a.id}/submit`);
    expect(submitted.status).toBe(201);
    const changedLockedStage = structuredClone(updatedSource);
    changedLockedStage[0].approver = "engineering";
    expect(
      (
        await post(admin.agent, `/projects/${source.p.id}/workflow`, {
          baseRevision: 3,
          stages: changedLockedStage,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post(businessLead, `/reviews/${submitted.body.id}/decision`, {
          decision: "approve",
        })
      ).status,
    ).toBe(200);
    expect((await get(pm, `/projects/${source.p.id}`)).body.current_stage).toBe(
      "prd",
    );
    expect(
      (await get(pm, `/projects/${source.p.id}/workflow`)).body.stages[0]
        .approver,
    ).toBe("business");
  });
  it("updates draft ownership only in its project and reserves workflow edits for admins", async () => {
    const pm = await member("pm", "product", 1);
    const projectMember = await member("projectmember", "project", 1);
    const first = await projectWithFirstArtifact(pm);
    const second = await projectWithFirstArtifact(pm);
    const stages = structuredClone(first.p.stages);
    stages[0].owner = "project";
    stages[0].approvals = 2;
    const url = `/projects/${first.p.id}/workflow`;
    expect((await post(pm, url, { baseRevision: 1, stages })).status).toBe(403);
    expect(
      (await post(admin.agent, url, { baseRevision: 1, stages })).status,
    ).toBe(201);
    const updated = (await get(pm, `/artifacts/${first.a.id}`)).body;
    expect(updated.owner_group).toBe("project");
    expect(updated.reviewPolicy.approvals).toBe(2);
    expect((await edit(pm, first.a.id, 1, "Wrong group")).status).toBe(403);
    expect(
      (await edit(projectMember, first.a.id, 1, "Owned by project")).status,
    ).toBe(200);
    expect(
      (await get(pm, `/projects/${second.p.id}`)).body.stages[0].owner,
    ).toBe("product");
  });
  it("rejects cycles and pins active projects to their published workflow", async () => {
    const pm = await member("pm", "product", 1);
    const { p } = await projectWithFirstArtifact(pm);
    const old = (await get(pm, `/projects/${p.id}`)).body.workflow_id;
    const workflow = (await get(admin.agent, "/workflow")).body;
    workflow.stages[0].approver = "engineering";
    const published = await post(admin.agent, "/admin/workflow", {
      stages: workflow.stages,
    });
    expect(published.status).toBe(201);
    expect((await get(pm, `/projects/${p.id}`)).body.workflow_id).toBe(old);
    const invalid = structuredClone(workflow.stages);
    invalid.at(-1).next = invalid[0].key;
    expect(
      (await post(admin.agent, "/admin/workflow", { stages: invalid })).status,
    ).toBe(400);
  });
  it("enforces file count, size, and content type", async () => {
    const pm = await member("pm", "product", 1);
    const { p, a } = await projectWithFirstArtifact(pm);
    const uploadUrl = `/api/projects/${p.id}/attachments`;
    const good = await pm
      .post(uploadUrl)
      .field("artifactId", String(a.id))
      .attach("files", Buffer.from("# note\n"), {
        filename: "note.md",
        contentType: "text/markdown",
      });
    expect(good.status).toBe(201);
    expect((await get(pm, `/attachments/${good.body[0].id}`)).status).toBe(200);
    const tooMany = pm.post(uploadUrl).field("artifactId", String(a.id));
    for (let i = 0; i < 5; i++)
      tooMany.attach("files", Buffer.from("x"), {
        filename: `${i}.txt`,
        contentType: "text/plain",
      });
    expect((await tooMany).status).toBe(400);
    expect(
      (
        await pm
          .post(uploadUrl)
          .attach("files", Buffer.alloc(5 * 1024 * 1024 + 1, 65), {
            filename: "large.txt",
            contentType: "text/plain",
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await pm
          .post(uploadUrl)
          .attach("files", Buffer.from("<script>x</script>"), {
            filename: "bad.png",
            contentType: "image/png",
          })
      ).status,
    ).toBe(400);
  });
  it("limits pending chat files and records selected context", async () => {
    const pm = await member("pm", "product", 1);
    const { p, a } = await projectWithFirstArtifact(pm);
    const uploadUrl = `/api/projects/${p.id}/attachments`;
    const uploaded = pm.post(uploadUrl);
    for (let i = 0; i < 5; i++)
      uploaded.attach("files", Buffer.from(`note ${i}`), {
        filename: `${i}.txt`,
        contentType: "text/plain",
      });
    const files = (await uploaded).body;
    expect(files).toHaveLength(5);
    expect(
      (
        await pm.post(uploadUrl).attach("files", Buffer.from("more"), {
          filename: "more.txt",
          contentType: "text/plain",
        })
      ).status,
    ).toBe(400);
    expect((await pm.delete(`/api/attachments/${files[0].id}`)).status).toBe(
      200,
    );
    const replacement = await pm
      .post(uploadUrl)
      .attach("files", Buffer.from("replacement"), {
        filename: "replacement.txt",
        contentType: "text/plain",
      });
    expect(replacement.status).toBe(201);
    const sent = await post(pm, `/projects/${p.id}/chat`, {
      message: "Review the selected artifact and file",
      provider: "anthropic",
      model: "example-model",
      artifactIds: [a.id],
      attachmentIds: [replacement.body[0].id],
    });
    expect(sent.status).toBe(200);
    expect(
      (await pm.delete(`/api/attachments/${replacement.body[0].id}`)).status,
    ).toBe(403);
    const messages = (await get(pm, `/projects/${p.id}/chat`)).body;
    expect(JSON.parse(messages[0].context_json).attachmentIds).toEqual([
      replacement.body[0].id,
    ]);
  });
  it("lists project, artifact, and sent chat files and reuses @file references", async () => {
    const pm = await member("pm", "product", 1);
    const engineer = await member("engineer", "engineering", 1);
    const { p, a } = await projectWithFirstArtifact(pm);
    const other = await projectWithFirstArtifact(pm);
    const uploadUrl = `/api/projects/${p.id}/attachments`;
    const projectFile = await pm
      .post(uploadUrl)
      .field("scope", "project")
      .attach("files", Buffer.from("project plan"), {
        filename: "plan.md",
        contentType: "text/markdown",
      });
    expect(projectFile.status).toBe(201);
    const initialActivity = (await get(pm, `/projects/${p.id}`)).body
      .activities;
    expect(
      initialActivity.some(
        (event) =>
          event.action === "attachment.uploaded" &&
          event.detail.includes("plan.md"),
      ),
    ).toBe(true);
    expect(
      (await engineer.delete(`/api/attachments/${projectFile.body[0].id}`))
        .status,
    ).toBe(403);
    const temporary = await pm
      .post(uploadUrl)
      .field("scope", "project")
      .attach("files", Buffer.from("temporary"), {
        filename: "temporary.txt",
        contentType: "text/plain",
      });
    expect(temporary.status).toBe(201);
    expect(
      (await pm.delete(`/api/attachments/${temporary.body[0].id}`)).status,
    ).toBe(200);
    const removalActivity = (await get(pm, `/projects/${p.id}`)).body
      .activities;
    expect(
      removalActivity.some(
        (event) =>
          event.action === "attachment.removed" &&
          event.detail.includes("temporary.txt"),
      ),
    ).toBe(true);
    const artifactFile = await pm
      .post(uploadUrl)
      .field("scope", "artifact")
      .field("artifactId", String(a.id))
      .attach("files", Buffer.from("BRD notes"), {
        filename: "brd.txt",
        contentType: "text/plain",
      });
    expect(artifactFile.status).toBe(201);
    const chatFile = await pm
      .post(uploadUrl)
      .attach("files", Buffer.from("chat evidence"), {
        filename: "evidence.txt",
        contentType: "text/plain",
      });
    expect(chatFile.status).toBe(201);
    const chatId = chatFile.body[0].id;
    const beforeSend = (await get(engineer, `/projects/${p.id}/attachments`))
      .body;
    expect(beforeSend.map((file) => file.scope).sort()).toEqual([
      "artifact",
      "project",
    ]);
    expect((await get(engineer, `/attachments/${chatId}`)).status).toBe(403);
    expect(
      (
        await post(engineer, `/projects/${p.id}/chat`, {
          message: `Read @file#${chatId}`,
          provider: "anthropic",
          model: "example-model",
        })
      ).status,
    ).toBe(403);
    const first = await post(pm, `/projects/${p.id}/chat`, {
      message: `Summarize @file#${chatId}`,
      provider: "anthropic",
      model: "example-model",
    });
    expect(first.status).toBe(200);
    expect(piCalls.at(-1).files.map((file) => file.id)).toEqual([chatId]);
    const shared = (await get(engineer, `/projects/${p.id}/attachments`)).body;
    expect(shared.map((file) => file.scope).sort()).toEqual([
      "artifact",
      "chat",
      "project",
    ]);
    expect(
      shared.find((file) => file.id === chatId).chat_message_id,
    ).toBeTruthy();
    expect((await get(engineer, `/attachments/${chatId}`)).status).toBe(200);
    const reused = await post(engineer, `/projects/${p.id}/chat`, {
      message: `Compare @file#${chatId} with @file#${projectFile.body[0].id}`,
      provider: "anthropic",
      model: "example-model",
    });
    expect(reused.status).toBe(200);
    expect(piCalls.at(-1).files.map((file) => file.id)).toEqual([
      chatId,
      projectFile.body[0].id,
    ]);
    expect(
      (await pm.delete(`/api/attachments/${projectFile.body[0].id}`)).status,
    ).toBe(409);
    expect((await pm.delete(`/api/attachments/${chatId}`)).status).toBe(403);
    const stray = await post(pm, `/projects/${p.id}/chat`, {
      message: `Ignore @file#${artifactFile.body[0].id}suffix`,
      provider: "anthropic",
      model: "example-model",
    });
    expect(stray.status).toBe(200);
    expect(piCalls.at(-1).files).toEqual([]);
    expect(
      (
        await post(engineer, `/projects/${other.p.id}/chat`, {
          message: `Read @file#${chatId}`,
          provider: "anthropic",
          model: "example-model",
        })
      ).status,
    ).toBe(403);
  });
  it("serves embedded artifact images inline and keeps referenced versions intact", async () => {
    const pm = await member("pm", "product", 1);
    const { p, a } = await projectWithFirstArtifact(pm);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
      "base64",
    );
    const upload = await pm
      .post(`/api/projects/${p.id}/attachments`)
      .field("scope", "artifact")
      .field("artifactId", String(a.id))
      .attach("files", png, {
        filename: "diagram.png",
        contentType: "image/png",
      });
    expect(upload.status).toBe(201);
    const fileId = upload.body[0].id;
    const image = await get(pm, `/attachments/${fileId}`);
    expect(image.status).toBe(200);
    expect(image.headers["content-disposition"]).toContain("inline");
    expect(image.headers["content-type"]).toContain("image/png");
    expect(
      (
        await put(pm, `/artifacts/${a.id}`, {
          title: "BRD with diagram",
          body: `# BRD\n\n![Architecture](/api/attachments/${fileId})`,
          version: 1,
        })
      ).status,
    ).toBe(200);
    expect((await pm.delete(`/api/attachments/${fileId}`)).status).toBe(409);
    expect((await get(pm, `/artifacts/${a.id}`)).body.body).toContain(
      `![Architecture](/api/attachments/${fileId})`,
    );
  });
  it("caps a project file library by total count and bytes", async () => {
    const pm = await member("pm", "product", 1);
    const { p } = await projectWithFirstArtifact(pm);
    const insert = db.prepare(
      "INSERT INTO attachments(project_id,owner_id,filename,stored_name,mime,bytes,scope) VALUES(?,?,?,?,?,?,?)",
    );
    for (let i = 0; i < 99; i++)
      insert.run(
        p.id,
        admin.user.id,
        `${i}.txt`,
        `fixture-${i}`,
        "text/plain",
        1,
        "project",
      );
    const url = `/api/projects/${p.id}/attachments`;
    const tooMany = pm.post(url).field("scope", "project");
    for (let i = 0; i < 2; i++)
      tooMany.attach("files", Buffer.from("content"), {
        filename: `extra-${i}.txt`,
        contentType: "text/plain",
      });
    expect((await tooMany).status).toBe(400);
    expect(
      db
        .prepare("SELECT count(*) AS n FROM attachments WHERE project_id=?")
        .get(p.id).n,
    ).toBe(99);
    db.prepare("DELETE FROM attachments WHERE project_id=?").run(p.id);
    for (let i = 0; i < 50; i++)
      insert.run(
        p.id,
        admin.user.id,
        `${i}.txt`,
        `large-fixture-${i}`,
        "text/plain",
        5 * 1024 * 1024,
        "project",
      );
    expect(
      (
        await pm
          .post(url)
          .field("scope", "project")
          .attach("files", Buffer.from("content"), {
            filename: "extra.txt",
            contentType: "text/plain",
          })
      ).status,
    ).toBe(400);
  });
  it("restricts group skills and cross-project artifact references in chat", async () => {
    const pm = await member("pm", "product", 1);
    const engineer = await member("engineer", "engineering", 1);
    const first = await projectWithFirstArtifact(pm);
    const second = await projectWithFirstArtifact(pm);
    const skill = await post(admin.agent, "/admin/skills", {
      groupKey: "product",
      name: "PRD writer",
      instructions: "Write concise acceptance criteria.",
    });
    expect(skill.status).toBe(201);
    const payload = {
      message: "Review this",
      provider: "anthropic",
      model: "example-model",
      skillIds: [skill.body.id],
      artifactIds: [first.a.id],
    };
    expect(
      (await post(engineer, `/projects/${first.p.id}/chat`, payload)).status,
    ).toBe(403);
    expect(
      (await post(pm, `/projects/${second.p.id}/chat`, payload)).status,
    ).toBe(403);
    const okay = await post(pm, `/projects/${first.p.id}/chat`, payload);
    expect(okay.status).toBe(200);
    expect(okay.body.answer).toContain("Pi test adapter");
    expect((await get(pm, `/projects/${first.p.id}/chat`)).body).toHaveLength(
      2,
    );
  });
});
