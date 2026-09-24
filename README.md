# AIDLC Planner

AIDLC Planner is a self-hosted workspace for taking a project from business requirements through product requirements, pre-planning, solution design, and Jira-ready stories. It keeps artifacts, approvals, comments, versions, files, activity, and project agent chat together in a local SQLite-backed application.

## Run locally with Docker

```sh
cp .env.example .env
# Optionally set ADMIN_EMAIL and a 12+ character ADMIN_PASSWORD in .env.
docker compose up --build -d
```

This workstation has an optional Linux ARM64 image export at `artifacts/aidlc-planner-linux-arm64.tar.gz`. The archive is not included in the source repository. To load it instead of building locally:

```sh
docker load -i artifacts/aidlc-planner-linux-arm64.tar.gz
docker compose up -d --no-build
```

On this workstation, the service was started with the isolated `arc-build` Colima profile because Docker Desktop did not respond. To manage that running container from a terminal, prefix Docker commands with `DOCKER_HOST=unix://$HOME/.colima/arc-build/docker.sock`.

Open `http://localhost:3000` to sign in or create an account.

`./data` is the bind-mounted persistent folder. It contains `planner.sqlite`, `planner.sqlite-wal`, `planner.sqlite-shm`, uploaded files, and Pi credentials or sessions. Back up the folder with the service stopped, or use SQLite's backup API for live backups. Do not commit it.

## People, groups, and levels

The first signup becomes the administrator unless bootstrap credentials create that account. Later signups can sign in but cannot access projects until an administrator assigns a group in **Administration → People & groups**. The administrator manages memberships, levels, active status, provider credentials, skills, and workflows. Admin status alone does not grant permission to write or approve an artifact: the administrator must also join its owning or approving group.

An active user can belong to more than one group. Any user with a group can view all projects and artifacts, comment, and use project files and chat. Only the **current owning group** can edit an artifact while it is a draft or has changes requested. Other groups can follow the work without changing its text; completed artifacts remain readable with their versions and decisions.

| Group                | Responsibility in the default workflow                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| **Business Users**   | Review the BRD, comment, approve, or request changes. They do not write the BRD.               |
| **Product Managers** | Create projects and write BRDs and PRDs. A different eligible Product Manager reviews the PRD. |
| **Project Managers** | Record the pre-planning call, write and review its brief, and approve Jira-ready stories.      |
| **Engineers**        | Write and review the solution design, then write Jira-ready stories.                           |

Each membership has a level: **Member (1)**, **Lead (2)**, or **Manager (3)**. Members of an owning group can author its active artifact. A stage's policy sets the approving group, minimum reviewer level, and number of distinct approvals required. By default, every stage needs **one approval from a Lead or Manager** in its approving group. A Manager in a different group is not eligible merely because of their title.

## Default artifact and approval flow

Creating a project starts its first artifact from a Markdown template. The next artifact appears only after the current stage receives all required approvals. The default route is:

| Step | Artifact                                 | Owning group: writes and revises | Approving group         | Result of approval                                                                          |
| ---- | ---------------------------------------- | -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| 1    | **BRD** — Business Requirements Document | Product Managers                 | Business Users, Lead+   | Opens the PRD stage.                                                                        |
| 2    | **PRD** — Product Requirements Document  | Product Managers                 | Product Managers, Lead+ | Opens pre-planning. The requester or anyone who edited this PRD cannot approve it.          |
| 3    | **Pre-planning Brief**                   | Project Managers                 | Project Managers, Lead+ | Opens solution design. A future call time and attendees must be recorded before submission. |
| 4    | **Solution Design Document**             | Engineers                        | Engineers, Lead+        | Opens Jira stories.                                                                         |
| 5    | **Jira-ready Stories**                   | Engineers                        | Project Managers, Lead+ | Marks the project complete.                                                                 |

A Product Manager creates the project and writes the BRD, then asks the Business team to review it. After Business approval, Product Managers write the PRD and seek review from another eligible Product Manager Lead or Manager. Project Managers then record a pre-planning call with engineering managers and team leads, write the brief, and seek a separate Project Manager approval. Engineers write the solution design and obtain Engineering approval. They prepare stories for final approval by Project Managers. The application records the call time and attendees but does not send calendar invitations; Jira-ready stories remain Markdown artifacts and are not created in Jira automatically.

### What happens during review

1. A member of the owning group edits the active artifact and saves it. Each save creates a new version; a stale version number is rejected rather than overwriting another person's work.
2. **Send for review** checks that enough active, eligible reviewers are assigned in the approving group at the required level. The requester and everyone who edited any version of the artifact are excluded. If too few eligible people exist, submission is blocked and the required count is shown.
3. Submission freezes editing and puts the request in eligible reviewers' **Review inbox**. Reviewers can open the artifact, comment, **Approve**, or **Request changes** from the inbox or the open artifact. Each person gets one decision per review request.
4. Approvals are recorded individually. When the configured number of distinct approvals is reached, the artifact is approved and the next stage and template are created automatically. An approval below the threshold leaves the review pending.
5. **Request changes** requires a note and closes that request. The artifact returns to its owning group for edits and a new submission. An owning-group member can also **Withdraw review & edit** while a review is pending. Withdrawal closes the request and returns the artifact to draft. Previous partial approvals do not count toward the next request.

The current project's workflow decides ownership and approval. A user cannot approve a review they requested or an artifact they edited, even if they also belong to its approving group. This is why assigning a Lead or Manager alone may still leave a review without an eligible approver.

## Configure each project's workflow

An administrator publishes the **global default workflow** for newly created projects. Each project gets its own workflow snapshot and revision history; changing the global default does not rewrite existing projects. At creation, Product Managers can start from that default or copy another project's current route. Later, an administrator can open **Configure workflow** in a project, load a copy from another project, edit it, and **Publish for this project**. Copying makes a separate snapshot, so future changes in the source project do not affect the target.

The workflow editor sets stage names, artifact types, owning and approving groups, minimum reviewer levels, approval counts, and transitions. It supports a single valid route of 2–20 stages. The current draft stage may change owner and review rules, but its key and artifact type cannot change after its artifact exists. Stages with review history or completed artifacts are locked against policy and route changes, preserving earlier decisions. Publishing creates a new project revision and rejects stale edits or invalid routes.

## Authoring and review history

The owning group writes in a wide, live-rendered Markdown editor with formatting, tables, and image insertion. **Source mode** in the same editor preserves raw Markdown and advanced syntax; the artifact **Source** tab opens directly in that mode. Inserted images become artifact files in the project library and count toward the five-file, 5 MB-per-file artifact limit. If an image inside a table cell has not reached the Markdown, Save prompts a switch to Source mode so it is not silently lost.

All group members can comment on rendered blocks or source lines. The review surface has open/resolved filters, a comment rail and list, previous/next navigation, document search, source navigation, copy/export, and comment edit history. It renders frontmatter, Obsidian/GitHub callouts, highlighted code, and Mermaid diagrams. Comments, resolutions, decisions, edits, and file events appear in activity history. The [VS Code inline-review extension](https://github.com/shashank-mugiwara/vscode-inline-review) informed this web adaptation; its adapted MIT-licensed frontmatter and callout logic is credited in [NOTICE.md](src/review/NOTICE.md). No fork of that extension was needed.

## Project agent, skills, and files

AIDLC Planner runs [Pi](https://pi.dev/docs/latest/cli-integration) inside the container. An administrator can open **Administration → AI providers** and save an Anthropic or OpenAI API key. Saved keys live in `./data/pi/auth.json` with private file permissions and are never returned by the API. Alternatively, set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env` and restart the container. For a Pi-supported subscription login, run `docker compose exec aidlc-planner pi /login`; Pi's configuration persists under `./data/pi`. The chat pane lists models available to the configured Pi providers. Select a provider and model before sending. The pane can be resized by dragging its left edge or focusing the separator and pressing Left/Right Arrow.

The administrator configures skills for each group in **Administration → Agent skills**. Group members can toggle their available skills in the chat pane and mention project artifacts or files with `@`. The platform supplies only the selected project artifacts, selected group skills, attached files, and recent project chat as context. Pi runs without coding tools, extensions, or automatic skill discovery. Chat output becomes an artifact only when a group owner chooses **Use in editor** and saves a version.

PDF attachments are converted to text with `pdftotext`; PNG, JPEG, and WebP files are passed to Pi as images. TXT and Markdown are read as text. The **Project files** library accepts direct uploads and shows artifact files and sent chat files. Type `@` in chat to find a project file by name; up to five referenced files accompany one message. The API rejects more than five files in an upload or chat message, files over 5 MB, unsupported types, and mismatched file signatures. Each project is limited to 100 files and 250 MB. Uploaders and admins can remove unused project files; chat-referenced or review-locked files stay in history.

## Development

```sh
npm ci
npm run server   # API on port 3000
npm run dev      # Vite UI on port 5173, proxies /api to port 3000
npm test
npm run build
npm run test:e2e
npm run perf
sh scripts/docker-smoke.sh
```

See [the product and test plan](docs/product-plan.md) for the roles, workflow, security boundaries, and edge cases.
