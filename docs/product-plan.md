# Product and verification plan

## People and decisions

The first signup becomes the administrator unless bootstrap credentials create that account. Later signups start without access. The admin assigns each person to one or more of Business Users, Product Managers, Project Managers, and Engineers, with Member, Lead, or Manager level. Membership gives project visibility and comments. An artifact's current owning group can edit it; the review group can approve only at the configured level. Reviewers who edited the artifact or requested its review cannot approve it.

Product Managers open a project and write or edit the BRD in a wide, live-rendered Markdown editor. They can format text, insert tables and images, or switch to Source mode for raw Markdown and advanced syntax. Inserted images are artifact attachments. Business Users review the BRD and cannot write it. A Product Manager can withdraw a pending review to revise the BRD; this closes that approval request and requires a fresh submission. Approval creates the PRD. A different Product Manager lead reviews the PRD. Approval moves the project to Project Managers, who schedule a pre-planning call with engineering managers and team leads and write the meeting brief. Engineers receive the approved brief, create a solution design, then prepare Jira-ready stories. Completed stages stay readable with their versions, comments, and decisions.

## Information layout

- **Overview:** stage counts, pending reviews, and a project creation action. **Projects** opens a separate searchable list.
- **Project workspace:** stage rail, artifact list, wide rich Markdown authoring with in-place rendering and a Source toggle, rendered reviews with block comments, version history, project file library, activity, and a resizable Pi side pane. The chat starts closed on narrower desktop screens.
- **Review inbox:** actionable approvals for the member's group and level, excluding their own work.
- **Administration:** signup queue, group levels, global default workflow editor, per-project workflow revision and copy controls, and group skills.

The artifact review interaction draws on the owner's [VS Code inline-review extension](https://github.com/shashank-mugiwara/vscode-inline-review): comments attach to rendered Markdown blocks or source lines and retain their source quote and line. AIDLC Planner has its own web renderer and SQLite comment store because VS Code webview components cannot be embedded directly as a web app. It includes a comment rail and list, previous/next navigation, open/resolved filtering, search options, review export, frontmatter, callouts, syntax-highlighted code, and Mermaid controls. A comment whose quoted block changed remains visible in an “earlier text” section. Comment edits keep earlier text in a separate history table; removal is soft-deleted for audit.

[Antigravity's artifact documentation](https://antigravity.google/docs/artifacts/) informed the milestone-centered review surface. Its [artifact review policy](https://antigravity.google/docs/artifact-review/) inspired explicit submit, comment, approve, and change-request actions. Its [project model](https://www.antigravity.google/docs/projects/) informed the project-scoped artifact and agent context. AIDLC Planner implements business workflow ownership and group hierarchy specifically for this product.

## Persistence and guardrails

SQLite uses WAL, foreign keys, a busy timeout, and indexes for sessions, projects by stage/update time, project workflow revisions, artifacts and activities by project, comments/versions by artifact, pending reviews, attachments, and chat. Each project points to one immutable project workflow revision. Publishing a project route creates another revision; prior reviewed stages are locked. Artifact edits use a client-supplied version to reject stale saves. Approval, transition, next artifact creation, and audit events occur in one SQLite transaction.

Session cookies are opaque and HttpOnly with SameSite=Lax. State-changing requests check Origin when present. Passwords use per-user salt and scrypt. Login attempts are throttled. Uploaded filenames never become storage paths. Image attachments render inline in artifacts; other downloads use attachment disposition. Pi receives context through a tool-disabled subprocess, with a timeout and bounded output.

## Edge cases and acceptance checks

| Case                                         | Expected result                            | Check                 |
| -------------------------------------------- | ------------------------------------------ | --------------------- |
| New signup with no membership                | Can sign in; project data denied           | API and browser tests |
| Wrong owner edits                            | Denied                                     | API test              |
| Stale editor saves                           | Conflict; no overwritten version           | API test              |
| Author approves own work                     | Denied                                     | API test              |
| Review requests changes                      | Owner edits and resubmits                  | API test              |
| Planning has no meeting                      | Cannot request approval                    | API test              |
| Workflow has a cycle or disconnected stage   | Publication rejected                       | API test              |
| Admin changes another project's workflow     | Existing project retains its own revision  | API and browser tests |
| Admin copies a route into an active project  | Reviewed stages cannot be rewritten        | API and browser tests |
| Six files or file over 5 MB                  | Upload rejected                            | API test              |
| File used in agent chat or approved artifact | Removal rejected; history remains readable | API test              |
| Attachment references another project        | Chat request denied                        | API test              |
| Group skill used by another group            | Chat request denied                        | API test              |
| 1,000+ projects or 10,000+ activity rows     | Indexed queries stay bounded               | `npm run perf`        |

The browser suite covers login, provider configuration and model selection, chat resizing, project creation/list navigation, live rich-text typing, table and image insertion, source editing, rendered and source comments, navigation/search/export, edit and resolve behavior, activity text, Markdown rendering, all five approval stages with real group members, workflow administration, skills, and responsive layout. The Docker smoke check verifies the built image serves the UI and API with a mounted data folder.
