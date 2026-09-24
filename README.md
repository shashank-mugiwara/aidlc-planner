# AIDLC Planner: AI delivery lifecycle workspace

AIDLC Planner is a self-hosted web workspace for the path from a Business Requirements Document (BRD) to Jira-ready stories. It stores projects, artifact versions, inline Markdown comments, approvals, meetings, attachments, activity, group skills, and Pi chat in a local SQLite database and file volume.

## Run locally with Docker

```sh
cp .env.example .env
# Optionally set ADMIN_EMAIL and a 12+ character ADMIN_PASSWORD in .env.
docker compose up --build -d
```

An exported Linux ARM64 image is available at `artifacts/aidlc-planner-linux-arm64.tar.gz`. To load it instead of building locally:

```sh
docker load -i artifacts/aidlc-planner-linux-arm64.tar.gz
docker compose up -d --no-build
```

On this workstation, the service was started with the isolated `arc-build` Colima profile because Docker Desktop did not respond. To manage that running container from a terminal, prefix Docker commands with `DOCKER_HOST=unix://$HOME/.colima/arc-build/docker.sock`.

Open `http://localhost:3000`. If no administrator was configured in `.env`, the first signup becomes the administrator. Later signups wait for an administrator to assign a group and level. The administrator can assign themselves to a group to edit its artifacts.

`./data` is the bind-mounted persistent folder. It contains `planner.sqlite`, `planner.sqlite-wal`, `planner.sqlite-shm`, uploaded files, and Pi credentials or sessions. Back up the folder with the service stopped, or use SQLite's backup API for live backups. Do not commit it.

### Pi model authentication

AIDLC Planner runs [Pi](https://pi.dev/docs/latest/cli-integration) inside the container. An administrator can open **Administration → AI providers** and save an Anthropic or OpenAI API key. Saved keys live in `./data/pi/auth.json` with private file permissions and are never returned by the API. Alternatively, set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` in `.env` and restart the container. For a Pi-supported subscription login, run `docker compose exec aidlc-planner pi /login`; Pi's configuration persists under `./data/pi`. The chat pane lists models available to the configured Pi providers. Select a provider and model before sending. The pane can be resized by dragging its left edge or focusing the separator and pressing Left/Right Arrow.

The platform supplies only the selected project artifacts, selected group skills, attached files, and recent project chat as context. Pi runs without coding tools, extensions, or automatic skill discovery. Chat output becomes an artifact only when a group owner chooses **Use in editor** and saves a version.

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

The default workflow is BRD → PRD → pre-planning → solution design → Jira stories. Product Managers own and edit BRD and PRD; Business Users review the BRD but cannot write it. A different Product Manager lead approves the PRD. Project Managers schedule the pre-planning call and own its brief. Engineers own solution design and stories. The owning group edits in a wide, live-rendered [MDXEditor](https://mdxeditor.dev/) surface with formatting, tables, and image insertion; **Source mode** is available in the same editor for raw Markdown and advanced syntax. Inserted images become artifact files in the project library and count toward the five-file, 5 MB-per-file artifact limit. If an image inserted into a table cell has not reached the Markdown, Save prompts the author to switch to Source mode before saving so the image is not silently lost. The Source tab opens the editor in Source mode. Once an artifact is sent for review, its owner can select **Withdraw review & edit** to revise it; the earlier review closes and the new version needs a fresh submission. The administrator can configure each project's workflow and copy a route from another project. Each publication creates an immutable revision; reviewed stages remain locked, and existing approval records retain their original policy. The global workflow is the default for new projects. A reviewer must belong to the approving group at the required level and cannot have edited the artifact. Change requests require a note.

The review surface supports comments on rendered Markdown blocks and source lines; open/resolved filters; a comment rail, list, previous/next navigation, and edit history; document search with case, whole-word, and regular-expression options; copy/export of document or project comments; and block-to-source navigation. It renders frontmatter tables, Obsidian/GitHub callouts (including folded callouts), syntax-highlighted code with copy, and Mermaid diagrams with zoom, pan, and expand. The [inline-review extension](https://github.com/shashank-mugiwara/vscode-inline-review) informed this web adaptation; its MIT-licensed frontmatter and callout logic is credited in [NOTICE.md](src/review/NOTICE.md). No fork or upstream library change was needed.

See [the product and test plan](docs/product-plan.md) for the roles, workflow, security boundaries, and edge cases.
