import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import java from "highlight.js/lib/languages/java";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import ini from "highlight.js/lib/languages/ini";
import { install as installFrontmatter } from "./frontmatter.js";
import { install as installCallouts } from "./callouts.js";

const autoLanguages = [
  "javascript",
  "typescript",
  "python",
  "java",
  "go",
  "rust",
  "bash",
  "json",
  "yaml",
  "sql",
  "xml",
  "css",
  "ini",
];
const grammars = [
  javascript, typescript, python, java, go, rust, bash,
  json, yaml, sql, xml, css, ini,
];
autoLanguages.forEach((name, index) => hljs.registerLanguage(name, grammars[index]));

export const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  highlight(code, info) {
    const language = (info || "")
      .trim()
      .split(/[\s:{,]/)[0]
      .toLowerCase();
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      } catch {
        // Keep the source readable if a language grammar rejects it.
      }
    }
    if (!language) {
      const guess = hljs.highlightAuto(code, autoLanguages);
      if (guess.relevance >= 8) return guess.value;
    }
    return md.utils.escapeHtml(code);
  },
});

installFrontmatter(md, () => true);
installCallouts(md, () => true);

const originalFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const language = (token.info || "").trim().split(/\s+/)[0].toLowerCase();
  if (language === "mermaid")
    return `<pre class="mermaid-source"><code>${md.utils.escapeHtml(token.content)}</code></pre>`;
  const rendered = originalFence(tokens, index, options, env, self);
  return `<div class="code-frame"><div class="code-tools"><span>${md.utils.escapeHtml(language || "code")}</span><button type="button" class="copy-code">Copy code</button></div>${rendered}</div>`;
};

export function blocks(body) {
  const lines = body.split("\n");
  const tokens = md.parse(body, {});
  const chosen = [];
  for (const token of tokens) {
    if (!token.map || token.nesting === -1) continue;
    if (
      token.level === 0 &&
      ["bullet_list_open", "ordered_list_open"].includes(token.type)
    )
      continue;
    if (
      token.level !== 0 &&
      !(token.level === 1 && token.type === "list_item_open")
    )
      continue;
    if (
      ![
        "heading_open",
        "paragraph_open",
        "fence",
        "code_block",
        "blockquote_open",
        "table_open",
        "hr",
        "ir_frontmatter",
        "ir_callout_open",
        "list_item_open",
      ].includes(token.type)
    )
      continue;
    const [start, end] = token.map;
    if (chosen.some((block) => start >= block.start && end <= block.end))
      continue;
    const source = lines.slice(start, end).join("\n");
    chosen.push({
      start,
      end,
      line: start + 1,
      source,
      html: md.render(source),
      kind:
        token.type === "fence" && token.info.trim().toLowerCase() === "mermaid"
          ? "mermaid"
          : "markdown",
      code: token.type === "fence" ? token.content : "",
    });
  }
  if (!chosen.length)
    return [
      {
        start: 0,
        end: lines.length,
        line: 1,
        source: body,
        html: md.render(body),
        kind: "markdown",
        code: "",
      },
    ];
  return chosen.sort((a, b) => a.start - b.start || a.end - b.end);
}
