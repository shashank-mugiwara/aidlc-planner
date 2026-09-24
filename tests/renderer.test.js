import { describe, expect, it } from "vitest";
import { blocks, md } from "../src/review/renderer.js";

describe("Markdown review rendering", () => {
  it("renders Obsidian frontmatter and foldable callouts with source lines", () => {
    const rendered = blocks(
      "---\ntitle: Demo\ntags: [one, two]\n---\n\n> [!warning]- Review risk\n> Check the path.\n",
    );
    expect(rendered[0].line).toBe(1);
    expect(rendered[0].html).toContain("ir-fm-table");
    expect(rendered[0].html).toContain("one");
    expect(rendered[1].line).toBe(6);
    expect(rendered[1].html).toContain("ir-callout-fold");
    expect(rendered[1].html).not.toContain('ir-callout-fold" open');
  });

  it("keeps list item anchors distinct and formats code safely", () => {
    const rendered = blocks(
      "- First item\n- Second item\n\n```js\nconst answer = 42;\n```",
    );
    expect(rendered.slice(0, 2).map((block) => block.line)).toEqual([1, 2]);
    expect(rendered[2].html).toContain("Copy code");
    expect(rendered[2].html).toContain("hljs-keyword");
    expect(md.render("<script>alert(1)</script>")).toContain("&lt;script&gt;");
  });

  it("identifies Mermaid fences for the interactive diagram renderer", () => {
    const [diagram] = blocks("```mermaid\ngraph TD\nA-->B\n```");
    expect(diagram.kind).toBe("mermaid");
    expect(diagram.code).toContain("graph TD");
  });
});
