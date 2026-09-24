import { test, expect } from "playwright/test";

const password = "correct-horse-battery-staple";
async function signup(page, name) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByPlaceholder("you@company.com").fill(`${name}@example.test`);
  await page.getByPlaceholder("At least 12 characters").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}
async function assign(adminPage, name, group, level) {
  await adminPage.getByRole("button", { name: "Administration" }).click();
  await adminPage.getByRole("button", { name: "People & groups" }).click();
  await adminPage.getByRole("button", { name: "Refresh people" }).click();
  await adminPage
    .locator(".person-row")
    .filter({ hasText: `${name}@example.test` })
    .getByRole("button", { name: "Manage" })
    .click();
  const membership = adminPage.locator(".membership-editor > div").filter({
    has: adminPage.getByRole("checkbox", { name: group }),
  });
  await membership.getByRole("checkbox", { name: group }).check();
  await membership.getByRole("combobox").selectOption(String(level));
  await adminPage.getByRole("button", { name: "Save access" }).click();
}
async function openProject(page) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: /Customer onboarding/ }).click();
}
async function fillMarkdown(page, markdown) {
  const sourceMode = page.getByRole("radio", { name: "Source mode" });
  if (!(await sourceMode.isChecked())) await sourceMode.click();
  await page.locator(".mdxeditor-source-editor .cm-content").fill(markdown);
}
async function editAndSubmit(page, title) {
  await page.getByRole("button", { name: "Edit Markdown" }).click();
  await page.getByRole("textbox", { name: "Document title" }).fill(title);
  await fillMarkdown(
    page,
    `# ${title}\n\n## Outcome\n\nDeliver a measurable onboarding improvement.`,
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".document-heading h2")).toHaveText(title);
  await page.getByRole("button", { name: "Send for review" }).click();
}
async function approveFromInbox(page, title) {
  await page.reload();
  await page.getByRole("button", { name: /Review inbox/ }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
}

test("teams move a reviewed project from BRD through Jira stories", async ({
  browser,
  page,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1800, height: 1000 });
  await signup(page, "admin");
  await expect(
    page.getByRole("heading", { name: /Delivery, in one place/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Administration" }).click();
  await page.getByRole("button", { name: "Manage" }).click();
  await page.getByRole("checkbox", { name: "Product Managers" }).check();
  await page.getByRole("button", { name: "Save access" }).click();
  await page.getByRole("button", { name: "Overview" }).click();
  await page.getByRole("button", { name: "New project" }).click();
  await page
    .getByPlaceholder("e.g. Customer onboarding refresh")
    .fill("Customer onboarding");
  await page
    .getByPlaceholder("A few sentences to give the team context")
    .fill("Reduce setup friction for new customers.");
  await page
    .locator(".modal")
    .getByRole("button", { name: "Create project" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Customer onboarding" }),
  ).toBeVisible();
  await expect(page.getByText(/0 eligible reviewers assigned/)).toBeVisible();
  await page.getByRole("button", { name: "Configure workflow" }).click();
  await expect(
    page.getByRole("heading", { name: "Project workflow v1" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Stage name 4" })
    .fill("Solution blueprint");
  await page.getByRole("button", { name: "Publish for this project" }).click();
  await expect(page.getByText("Project workflow v2")).toBeVisible();
  await page.getByRole("button", { name: "Overview" }).click();
  await page.getByRole("button", { name: "New project" }).click();
  await page
    .getByPlaceholder("e.g. Customer onboarding refresh")
    .fill("Copied delivery process");
  await page
    .getByRole("combobox", { name: "Starting workflow" })
    .selectOption({ index: 1 });
  await page
    .locator(".modal")
    .getByRole("button", { name: "Create project" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Copied delivery process" }),
  ).toBeVisible();
  await expect(page.getByText("Solution blueprint")).toBeVisible();
  await page.getByRole("button", { name: "Configure workflow" }).click();
  await page
    .getByRole("textbox", { name: "Stage name 5" })
    .fill("Delivery tickets");
  await page.getByRole("button", { name: "Publish for this project" }).click();
  await expect(page.getByText("Project workflow v2")).toBeVisible();
  await openProject(page);
  await page.getByRole("button", { name: "Configure workflow" }).click();
  await page
    .getByRole("combobox", { name: "Copy workflow from project" })
    .selectOption({ index: 1 });
  await page.getByRole("button", { name: "Load a copy" }).click();
  await expect(page.getByRole("textbox", { name: "Stage name 5" })).toHaveValue(
    "Delivery tickets",
  );
  await page.getByRole("button", { name: "Publish for this project" }).click();
  await expect(page.getByText("Project workflow v3")).toBeVisible();
  await expect(page.locator(".chat-pane")).toBeVisible();
  await expect(
    page.getByText("Anthropic is not connected to Pi."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Configure provider" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect Pi models" }),
  ).toBeVisible();
  await page
    .getByLabel("anthropic API key")
    .fill("browser-test-placeholder-key");
  await page.getByRole("button", { name: "Save key" }).first().click();
  await page
    .getByLabel("openai API key")
    .fill("browser-test-openai-placeholder");
  await page.getByRole("button", { name: "Save key" }).last().click();
  await page.getByRole("button", { name: "Projects" }).click();
  await expect(
    page.getByRole("heading", { name: /All projects/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Customer onboarding/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Model" }).locator("option"),
  ).not.toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Model" })
    .selectOption({ index: 1 });
  await expect(page.getByRole("combobox", { name: "Model" })).not.toHaveValue(
    "",
  );
  await page.getByRole("combobox", { name: "Provider" }).selectOption("openai");
  await expect(
    page.getByRole("combobox", { name: "Model" }).locator("option"),
  ).not.toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Model" })
    .selectOption({ index: 1 });
  await expect(page.getByRole("combobox", { name: "Model" })).not.toHaveValue(
    "",
  );
  const chat = page.locator(".chat-pane");
  const initialWidth = (await chat.boundingBox()).width;
  await page.getByRole("separator", { name: "Resize agent pane" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => (await chat.boundingBox()).width)
    .toBeGreaterThan(initialWidth);
  const handle = await page
    .getByRole("separator", { name: "Resize agent pane" })
    .boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 130);
  await page.mouse.down();
  await page.mouse.move(handle.x - 70, handle.y + 130, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await chat.boundingBox()).width)
    .toBeGreaterThan(initialWidth + 50);
  const readingWidth = (await page.locator(".artifact-area").boundingBox())
    .width;
  await page.getByRole("button", { name: "Focus reading" }).click();
  await expect(chat).toBeHidden();
  await expect
    .poll(
      async () => (await page.locator(".artifact-area").boundingBox()).width,
    )
    .toBeGreaterThan(readingWidth + 200);
  await page.getByRole("button", { name: "Exit focus" }).click();
  await page
    .locator(".project-workflow-actions")
    .getByRole("button", { name: /Project files/ })
    .click();
  await page.locator('input[aria-label="Upload project files"]').setInputFiles({
    name: "project plan.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Project plan"),
  });
  await expect(page.locator(".project-file-list")).toContainText(
    "project plan.md",
  );
  await expect(page.locator(".project-file-list")).toContainText(
    "Project upload",
  );
  await page
    .locator('input[aria-label="Upload current artifact files"]')
    .setInputFiles({
      name: "brd-evidence.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("BRD evidence"),
    });
  await expect(page.locator(".project-file-list")).toContainText(
    "brd-evidence.txt",
  );
  await expect(page.locator(".project-file-list")).toContainText("Artifact ·");
  await page.getByRole("button", { name: "Remove brd-evidence.txt" }).click();
  await expect(page.locator(".project-file-list")).not.toContainText(
    "brd-evidence.txt",
  );
  await page.locator(".chat-form input[type=file]").setInputFiles({
    name: "chat-note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Pending chat note"),
  });
  await expect(page.locator(".project-file-list")).toContainText(
    "Unsent chat upload",
  );
  await page
    .getByRole("textbox", { name: "Ask project agent" })
    .fill("Review @project plan");
  await page
    .locator(".mention-list")
    .getByRole("button", { name: /project plan.md/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Ask project agent" }),
  ).toHaveValue(/@file#\d+/);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit Markdown source" }),
  ).toBeVisible();
  await fillMarkdown(
    page,
    "# Initial BRD source\n\nProduct Manager owns this draft.",
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Document" }).click();
  await page.getByRole("button", { name: "Edit Markdown" }).click();
  await expect(page.getByRole("radio", { name: "Rich text" })).toBeChecked();
  await expect(page.locator(".rich-markdown-content h1")).toContainText(
    "Initial BRD source",
  );
  const liveEditor = page.locator(".rich-markdown-content");
  await liveEditor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Live rich paragraph.");
  await expect(liveEditor).toContainText("Live rich paragraph.");
  await page.getByRole("button", { name: "Insert Table" }).click();
  await expect(liveEditor.locator("table")).toBeVisible();
  await page.getByRole("button", { name: "Insert image" }).click();
  const imageDialog = page.getByRole("dialog", { name: "Upload an image" });
  await imageDialog.locator('input[type="file"]').setInputFiles({
    name: "flow.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await imageDialog.getByRole("button", { name: "Save" }).click();
  await expect(liveEditor.locator("img")).toBeVisible();
  await expect(liveEditor.locator("img")).toHaveAttribute(
    "src",
    /\/api\/attachments\/\d+/,
  );
  await page.screenshot({ path: "test-results/rich-editor-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/rich-editor-mobile.png" });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.getByRole("button", { name: "Show agent" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Switch to Source mode, then save",
  );
  await page.getByRole("radio", { name: "Source mode" }).click();
  await expect(
    page.locator(".mdxeditor-source-editor .cm-content"),
  ).toContainText(/!\[\]\(\/api\/attachments\/\d+\)/);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".markdown table")).toBeVisible();
  await expect(page.locator(".markdown img")).toBeVisible();
  await page.getByRole("button", { name: "Edit Markdown" }).click();
  expect(
    (await page.locator(".rich-markdown-editor").boundingBox()).width,
  ).toBeGreaterThan(900);
  await page
    .getByRole("textbox", { name: "Document title" })
    .fill("Onboarding BRD");
  await fillMarkdown(
    page,
    "# Onboarding BRD\n\n## Problem\n\nCustomers need a shorter setup flow.",
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page
      .locator(".document-heading")
      .getByRole("heading", { name: "Onboarding BRD" }),
  ).toBeVisible();
  await page.locator(".doc-block").first().hover();
  await page.getByRole("button", { name: "Comment on line 1" }).click();
  await page
    .getByPlaceholder("Add your feedback here…")
    .fill("What is the current setup time?");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.locator(".comment-card")).toContainText(
    "What is the current setup time?",
  );
  await page.getByRole("button", { name: "Comment on line 3" }).click();
  await page
    .getByPlaceholder("Add your feedback here…")
    .fill("Who owns this problem?");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.locator(".comment-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Comment on line 5" }).click();
  await page.getByPlaceholder("Add your feedback here…").fill("Old wording");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.locator(".comment-card")).toHaveCount(3);
  await page
    .locator(".comment-card")
    .last()
    .getByRole("button", { name: "Edit comment" })
    .click();
  await page
    .getByRole("textbox", { name: "Edit comment text" })
    .fill("Updated wording");
  await page.getByRole("button", { name: "Save comment" }).click();
  await expect(page.locator(".comment-card").last()).toContainText(
    "Updated wording",
  );
  await page
    .locator(".comment-card")
    .last()
    .getByRole("button", { name: "Edit history" })
    .click();
  await expect(page.locator(".comment-history")).toContainText("Old wording");
  await page
    .locator(".comment-card")
    .last()
    .getByRole("button", { name: "Remove comment" })
    .click();
  await expect(page.locator(".comment-card")).toHaveCount(2);
  await page.getByRole("button", { name: "List comments" }).click();
  await expect(page.locator(".comment-index")).toContainText(
    "Who owns this problem?",
  );
  await page
    .locator(".comment-index")
    .getByRole("button", { name: /Who owns this problem/ })
    .click();
  await expect(page.locator(".comment-card.flash")).toContainText(
    "Who owns this problem?",
  );
  await expect(page.locator(".comment-rail button")).toHaveCount(2);
  await page.getByRole("button", { name: "Export review comments" }).click();
  await page.getByRole("button", { name: "Copy this document" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "2 review comments copied",
  );
  await page.getByRole("button", { name: "Export review comments" }).click();
  await page.getByRole("button", { name: "Copy all project comments" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "2 review comments copied",
  );
  await page.getByRole("button", { name: "Previous comment" }).click();
  await expect(page.locator(".comment-card.flash")).toContainText(
    "What is the current setup time?",
  );
  await page.getByRole("button", { name: "Find in document" }).click();
  await page
    .getByRole("textbox", { name: "Find text in document" })
    .fill("Customers need");
  await expect(page.locator(".review-find").getByRole("status")).toHaveText(
    "1 of 1",
  );
  await expect
    .poll(() => page.evaluate(() => CSS.highlights.has("arc-find-current")))
    .toBe(true);
  await page.getByRole("button", { name: "Regular expression" }).click();
  await page
    .getByRole("textbox", { name: "Find text in document" })
    .fill("Customers.*flow");
  await expect(page.locator(".review-find").getByRole("status")).toHaveText(
    "1 of 1",
  );
  await page.getByRole("button", { name: "Close find" }).click();
  await page
    .locator(".comment-card")
    .first()
    .getByRole("button", { name: "Resolve thread" })
    .click();
  await expect(page.locator(".comment-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Show 1 resolved" }).click();
  await expect(page.locator(".comment-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Hide 1 resolved" }).click();
  await page.getByRole("button", { name: "Activity" }).click();
  await expect(page.locator(".history-list")).toContainText(
    "Who owns this problem?",
  );
  await expect(page.locator(".history-list")).toContainText(
    "What is the current setup time?",
  );
  await page.getByRole("button", { name: "Document" }).click();
  await page.getByRole("button", { name: "Edit Markdown" }).click();
  await fillMarkdown(
    page,
    "---\ntitle: Onboarding BRD\ntags: [onboarding, ux]\n---\n\n# Onboarding BRD\n\n> [!warning]- Risk review\n> Confirm the legacy account path.\n\n```js\nconst duration = 3;\n```\n\n```mermaid\ngraph TD\n  A[Start] --> B[Done]\n```",
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".ir-fm-table")).toContainText("onboarding");
  await expect(page.locator("details.ir-callout")).not.toHaveAttribute("open");
  await page.locator("details.ir-callout summary").click();
  await expect(page.locator("details.ir-callout")).toContainText(
    "Confirm the legacy account path.",
  );
  await expect(page.locator(".code-tools")).toContainText("js");
  await page.getByRole("button", { name: "Copy code" }).click();
  await expect(page.getByRole("alert")).toContainText("Code copied");
  await expect(page.locator(".mermaid-canvas svg")).toBeVisible();
  await page.getByRole("button", { name: "Expand diagram" }).click();
  await expect(page.locator(".mermaid-view.expanded")).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(
    page.getByRole("button", { name: "Reset diagram zoom" }),
  ).toContainText("125%");
  await page.getByRole("button", { name: "Close diagram overlay" }).click();
  await expect(page.locator(".orphan-comments")).toContainText(
    "Who owns this problem?",
  );
  await page.getByRole("button", { name: "Open Markdown source" }).click();
  await expect(
    page.getByRole("heading", { name: "Markdown source" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Comment on source line 6" }).click();
  await page
    .getByPlaceholder("Add a comment on this source line…")
    .fill("Keep this heading aligned with the PRD.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(
    page
      .locator(".source-comment")
      .filter({ hasText: "Keep this heading aligned with the PRD." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Document" }).click();
  await expect(
    page
      .locator(".comment-card")
      .filter({ hasText: "Keep this heading aligned with the PRD." }),
  ).toBeVisible();
  await expect(page.locator(".chat-pane")).toBeVisible();
  const chatAfterReview = await page.locator(".chat-pane").boundingBox();
  expect(chatAfterReview.x + chatAfterReview.width).toBeLessThanOrEqual(
    page.viewportSize().width + 1,
  );
  await page.screenshot({
    path: "test-results/project-desktop.png",
    fullPage: true,
  });

  const businessContext = await browser.newContext();
  const businessPage = await businessContext.newPage();
  await signup(businessPage, "businesslead");
  await expect(
    businessPage.getByRole("heading", { name: "Your account is ready" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Administration" }).click();
  await page.getByRole("button", { name: "People & groups" }).click();
  await page.getByRole("button", { name: "Manage" }).last().click();
  await page.getByRole("checkbox", { name: "Business Users" }).check();
  await page.getByRole("combobox").last().selectOption("2");
  await page.getByRole("button", { name: "Save access" }).click();
  await page.getByRole("button", { name: "Projects" }).click();
  await expect(
    page.getByRole("heading", { name: /All projects/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Customer onboarding/ }).click();
  await expect(page.getByText(/1 eligible reviewer assigned/)).toBeVisible();
  await page.getByRole("button", { name: "Send for review" }).click();
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.locator(".rich-markdown-editor")).toHaveCount(0);
  await page
    .locator(".toolbar-actions")
    .getByRole("button", { name: "Withdraw review & edit" })
    .click();
  await expect(page.locator(".rich-markdown-editor")).toBeVisible();
  const pendingBody = await page
    .locator(".mdxeditor-source-editor .cm-content")
    .innerText();
  await fillMarkdown(
    page,
    `${pendingBody}\n\nProduct Manager revision before Business review.`,
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Send for review" }).click();
  await businessPage.reload();
  await businessPage.getByRole("button", { name: /Review inbox/ }).click();
  await expect(
    businessPage.getByRole("heading", { name: "Onboarding BRD" }),
  ).toBeVisible();
  await businessPage.getByRole("button", { name: "Open artifact" }).click();
  await businessPage
    .getByRole("button", { name: "Source", exact: true })
    .click();
  await expect(businessPage.locator(".rich-markdown-editor")).toHaveCount(0);
  await expect(
    businessPage.getByRole("button", { name: "Withdraw review & edit" }),
  ).toHaveCount(0);
  await businessPage.getByRole("button", { name: "Document" }).click();
  await expect(
    businessPage.getByRole("button", { name: "Request changes" }),
  ).toBeVisible();
  await businessPage.getByRole("button", { name: "Request changes" }).click();
  await businessPage
    .getByRole("textbox", { name: "What needs to change?" })
    .fill("State the target conversion rate.");
  await businessPage
    .getByRole("button", { name: "Send change request" })
    .click();
  await expect(businessPage.getByRole("alert")).toContainText(
    "Changes requested",
  );
  await page.reload();
  await openProject(page);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.locator(".rich-markdown-editor")).toBeVisible();
  await fillMarkdown(
    page,
    "# Onboarding BRD\n\n## Outcome\n\nTarget conversion rate is 85%.",
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Send for review" }).click();
  await businessPage.reload();
  await businessPage.getByRole("button", { name: /Review inbox/ }).click();
  await businessPage.getByRole("button", { name: "Approve" }).click();
  await page.reload();
  await expect(
    page.getByText("Product requirements", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Administration" }).click();
  await page.getByRole("button", { name: "Workflow", exact: true }).click();
  await page
    .getByRole("combobox", { name: "brd minimum level" })
    .selectOption("3");
  await page.getByRole("button", { name: "Publish revision" }).click();
  await expect(page.getByText("v2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Agent skills" }).click();
  await page
    .getByPlaceholder("e.g. Write acceptance criteria")
    .fill("PRD reviewer");
  await page
    .getByPlaceholder("Describe how the agent should help this group…")
    .fill("Check that each requirement has a measurable outcome.");
  await page.getByRole("button", { name: "Add skill" }).click();
  await expect(page.getByText("PRD reviewer")).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByPlaceholder("e.g. Write acceptance criteria")
    .fill("PRD quality review");
  await page.getByRole("button", { name: "Save skill" }).click();
  await expect(page.getByText("PRD quality review")).toBeVisible();
  await page.getByRole("button", { name: "Projects" }).click();
  await page.getByRole("button", { name: /Customer onboarding/ }).click();
  await expect(page.getByText("Project workflow v3")).toBeVisible();
  const team = [];
  for (const [name, group, level] of [
    ["productlead", "Product Managers", 2],
    ["projectmember", "Project Managers", 1],
    ["projectlead", "Project Managers", 2],
    ["engineer", "Engineers", 1],
    ["engineerlead", "Engineers", 2],
  ]) {
    const context = await browser.newContext();
    const memberPage = await context.newPage();
    await signup(memberPage, name);
    await expect(
      memberPage.getByRole("heading", { name: "Your account is ready" }),
    ).toBeVisible();
    await assign(page, name, group, level);
    team.push({ name, context, page: memberPage });
  }
  const member = (name) => team.find((person) => person.name === name).page;
  await openProject(page);
  await editAndSubmit(page, "Onboarding PRD");
  await approveFromInbox(member("productlead"), "Onboarding PRD");

  const projectMember = member("projectmember");
  await projectMember.reload();
  await openProject(projectMember);
  await expect(
    projectMember.getByText("Pre-planning", { exact: true }).first(),
  ).toBeVisible();
  await projectMember.getByRole("button", { name: "Send for review" }).click();
  await expect(projectMember.getByRole("alert")).toContainText(
    "Schedule the pre-planning call first",
  );
  await projectMember
    .getByRole("textbox", { name: "Meeting attendees" })
    .fill("Engineering manager, team lead");
  await projectMember
    .getByRole("textbox", { name: "Meeting date and time" })
    .fill("2026-10-14T10:30");
  await projectMember.getByRole("button", { name: "Save call" }).click();
  await editAndSubmit(projectMember, "Onboarding pre-planning brief");
  await approveFromInbox(
    member("projectlead"),
    "Onboarding pre-planning brief",
  );

  const engineer = member("engineer");
  await engineer.reload();
  await openProject(engineer);
  await editAndSubmit(engineer, "Onboarding solution design");
  await approveFromInbox(member("engineerlead"), "Onboarding solution design");
  await engineer.reload();
  await openProject(engineer);
  await editAndSubmit(engineer, "Onboarding Jira stories");
  await approveFromInbox(member("projectlead"), "Onboarding Jira stories");
  await page.reload();
  await openProject(page);
  await expect(page.locator(".stage-step.done")).toHaveCount(5);
  await expect(page.locator(".artifact-list button")).toHaveCount(5);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText("Swipe sideways to see all stages"),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/project-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Configure workflow" }).click();
  await expect(
    page.getByRole("heading", { name: "Project workflow v3" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".project-workflow-modal .workflow-editor")
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    )
    .toBe(true);
  await page.screenshot({ path: "test-results/workflow-mobile.png" });
  await page.getByRole("button", { name: "Close project workflow" }).click();
  await businessContext.close();
  for (const person of team) await person.context.close();
});
