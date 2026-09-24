import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  Plus,
  Search,
  X,
} from "lucide-react";
import { blocks } from "./renderer.js";
import MermaidView from "./MermaidView.jsx";
import { copyText } from "./clipboard.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function report(rows) {
  return rows
    .map(
      (item) =>
        `## ${item.title || "Document"}\n### L${item.line}\n\`\`\`markdown\n${item.quote.split("\n").slice(0, 8).join("\n")}\n\`\`\`\n- ${item.body}`,
    )
    .join("\n\n");
}

export default function ArtifactReview({
  artifact,
  onComment,
  onResolve,
  onEdit,
  onDelete,
  getCommentHistory,
  onOpenSource,
  canComment,
  user,
  getProjectComments,
  notify,
}) {
  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [projectComments, setProjectComments] = useState(null);
  const [editingComment, setEditingComment] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [history, setHistory] = useState(null);
  const [cursor, setCursor] = useState(-1);
  const [flash, setFlash] = useState(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findCase, setFindCase] = useState(false);
  const [findWord, setFindWord] = useState(false);
  const [findRegex, setFindRegex] = useState(false);
  const [findCount, setFindCount] = useState(0);
  const [findIndex, setFindIndex] = useState(0);
  const [findError, setFindError] = useState("");
  const [findRevision, setFindRevision] = useState(0);
  const root = useRef(null);
  const findInput = useRef(null);
  const findRanges = useRef([]);
  const rendered = useMemo(() => blocks(artifact.body), [artifact.body]);
  const comments = useMemo(
    () =>
      (artifact.comments || [])
        .filter((comment) => showResolved || !comment.resolved)
        .sort((a, b) => a.line - b.line || a.id - b.id),
    [artifact.comments, showResolved],
  );
  const submitComment = async (block) => {
    if (posting || !draft.trim()) return;
    setPosting(true);
    try {
      if (
        await onComment({
          line: block.line,
          quote: block.source.slice(0, 500),
          body: draft,
        })
      ) {
        setActive(null);
        setDraft("");
      }
    } finally {
      setPosting(false);
    }
  };
  const openCount = (artifact.comments || []).filter(
    (comment) => !comment.resolved,
  ).length;
  const resolvedCount = (artifact.comments || []).length - openCount;
  const locations = useMemo(() => {
    const positions = new Map();
    for (const comment of comments) {
      const candidates = rendered
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => block.source.slice(0, 500) === comment.quote);
      if (candidates.length)
        positions.set(
          comment.id,
          candidates.sort(
            (a, b) =>
              Math.abs(a.block.line - comment.line) -
              Math.abs(b.block.line - comment.line),
          )[0].index,
        );
    }
    return positions;
  }, [comments, rendered]);
  useEffect(() => {
    let live = true;
    getProjectComments()
      .then((rows) => {
        if (live) setProjectComments(rows);
      })
      .catch(() => {
        if (live) setProjectComments(null);
      });
    return () => {
      live = false;
    };
  }, [artifact.id, artifact.comments]);

  const jump = (index) => {
    if (!comments.length) return;
    const next =
      ((index % comments.length) + comments.length) % comments.length;
    const item = comments[next];
    const target = root.current?.querySelector(
      `[data-comment-id="${item.id}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    setCursor(next);
    setFlash(item.id);
    setListOpen(false);
    window.setTimeout(
      () => setFlash((id) => (id === item.id ? null : id)),
      1200,
    );
  };
  const step = (direction) => {
    if (!comments.length) return;
    if (cursor >= 0) return jump(cursor + direction);
    const scroll = root.current?.closest(".artifact-scroll");
    const midpoint = scroll
      ? scroll.getBoundingClientRect().top + scroll.clientHeight / 2
      : window.innerHeight / 2;
    const index = comments.findIndex(
      (item) =>
        root.current
          ?.querySelector(`[data-comment-id="${item.id}"]`)
          ?.getBoundingClientRect().top > midpoint,
    );
    jump(
      index < 0
        ? direction > 0
          ? 0
          : comments.length - 1
        : index + (direction > 0 ? 0 : -1),
    );
  };
  const copy = async (scope) => {
    try {
      const rows =
        scope === "document"
          ? (artifact.comments || [])
              .filter((item) => !item.resolved)
              .map((item) => ({ ...item, title: artifact.title }))
          : (projectComments || []).filter((item) => !item.resolved);
      await copyText(report(rows));
      notify(
        `${rows.length} review comment${rows.length === 1 ? "" : "s"} copied`,
      );
      setExportOpen(false);
    } catch (error) {
      notify(error.message);
    }
  };
  const download = async () => {
    try {
      const rows = (await getProjectComments()).filter(
        (item) => !item.resolved,
      );
      const url = URL.createObjectURL(
        new Blob([report(rows)], { type: "text/markdown" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "CLAUDE-REVIEW.md";
      link.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch (error) {
      notify(error.message);
    }
  };

  useEffect(() => {
    if (findOpen) findInput.current?.focus();
  }, [findOpen]);
  useEffect(() => {
    window.CSS?.highlights?.delete("arc-find");
    window.CSS?.highlights?.delete("arc-find-current");
    findRanges.current = [];
    setFindError("");
    if (!findOpen || !findQuery || !root.current) {
      setFindCount(0);
      return;
    }
    let pattern;
    try {
      const source = findRegex ? findQuery : escapeRegex(findQuery);
      pattern = new RegExp(
        findWord ? `\\b(?:${source})\\b` : source,
        findCase ? "g" : "gi",
      );
    } catch {
      setFindError("Invalid regular expression");
      setFindCount(0);
      return;
    }
    for (const block of root.current.querySelectorAll(".doc-block .markdown")) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.parentElement?.closest(".code-tools,svg,script,style")
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        },
      });
      let content = "";
      const nodes = [];
      while (walker.nextNode()) {
        const node = walker.currentNode;
        nodes.push({ node, start: content.length });
        content += node.nodeValue;
      }
      let match;
      while (
        findRanges.current.length < 500 &&
        (match = pattern.exec(content))
      ) {
        if (!match[0]) {
          pattern.lastIndex++;
          continue;
        }
        const start = nodes.findLast((item) => item.start <= match.index);
        const end = nodes.findLast(
          (item) => item.start <= match.index + match[0].length,
        );
        if (!start || !end) continue;
        const range = document.createRange();
        range.setStart(start.node, match.index - start.start);
        range.setEnd(end.node, match.index + match[0].length - end.start);
        findRanges.current.push(range);
      }
      pattern.lastIndex = 0;
    }
    setFindCount(findRanges.current.length);
    setFindIndex(0);
    setFindRevision((revision) => revision + 1);
    return () => {
      window.CSS?.highlights?.delete("arc-find");
      window.CSS?.highlights?.delete("arc-find-current");
    };
  }, [
    findOpen,
    findQuery,
    findCase,
    findWord,
    findRegex,
    artifact.body,
    artifact.comments,
  ]);
  useEffect(() => {
    const ranges = findRanges.current;
    if (!findOpen || !ranges.length) return;
    const current = ranges[findIndex % ranges.length];
    if (window.CSS?.highlights && window.Highlight) {
      window.CSS.highlights.set(
        "arc-find",
        new window.Highlight(...ranges.filter((range) => range !== current)),
      );
      window.CSS.highlights.set(
        "arc-find-current",
        new window.Highlight(current),
      );
    }
    current?.startContainer.parentElement
      ?.closest(".doc-block")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [findIndex, findCount, findOpen, findRevision]);
  useEffect(() => {
    const keys = (event) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "f" && !event.altKey) {
        event.preventDefault();
        setFindOpen(true);
      } else if ((event.metaKey || event.ctrlKey) && key === "g" && findCount) {
        event.preventDefault();
        setFindIndex(
          (index) =>
            (index + (event.shiftKey ? -1 : 1) + findCount) % findCount,
        );
      } else if (event.key === "Escape") {
        setFindOpen(false);
        setListOpen(false);
        setExportOpen(false);
      } else if (
        !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "") &&
        event.altKey &&
        event.key === "ArrowDown"
      ) {
        event.preventDefault();
        step(1);
      } else if (
        !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "") &&
        event.altKey &&
        event.key === "ArrowUp"
      ) {
        event.preventDefault();
        step(-1);
      }
    };
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, [comments, cursor, findCount]);

  const card = (comment) => (
    <div
      className={`comment-card ${comment.resolved ? "resolved" : ""} ${flash === comment.id ? "flash" : ""}`}
      data-comment-id={comment.id}
      key={comment.id}
    >
      <div className="comment-head">
        <span className="avatar tiny">{comment.author?.[0] || "U"}</span>
        <strong>{comment.author}</strong>
        <span className="muted">
          {new Date(comment.created_at + "Z").toLocaleDateString()}
        </span>
        {comment.resolved && <span className="resolved-label">Resolved</span>}
      </div>
      {editingComment === comment.id ? (
        <div className="comment-compose">
          <textarea
            aria-label="Edit comment text"
            value={editDraft}
            onChange={(event) => setEditDraft(event.target.value)}
          />
          <div>
            <button className="quiet" onClick={() => setEditingComment(null)}>
              Cancel
            </button>
            <button
              className="primary small"
              disabled={!editDraft.trim()}
              onClick={async () => {
                if (await onEdit(comment.id, editDraft))
                  setEditingComment(null);
              }}
            >
              Save comment
            </button>
          </div>
        </div>
      ) : (
        <p>{comment.body}</p>
      )}
      <div className="comment-actions">
        {(comment.author_id === user.id ||
          user.memberships.some(
            (membership) => membership.groupKey === artifact.owner_group,
          )) && (
          <button
            className="text-action"
            onClick={() => onResolve(comment.id, !comment.resolved)}
          >
            {comment.resolved ? "Reopen thread" : "Resolve thread"}
          </button>
        )}
        {comment.author_id === user.id && (
          <>
            <button
              className="text-action"
              onClick={() => {
                setEditingComment(comment.id);
                setEditDraft(comment.body);
              }}
            >
              Edit comment
            </button>
            <button
              className="text-action"
              onClick={() => onDelete(comment.id)}
            >
              Remove comment
            </button>
          </>
        )}
        {comment.edited_at && (
          <button
            className="text-action"
            onClick={async () => {
              try {
                setHistory(
                  history?.id === comment.id
                    ? null
                    : {
                        id: comment.id,
                        data: await getCommentHistory(comment.id),
                      },
                );
              } catch (error) {
                notify(error.message);
              }
            }}
          >
            Edit history
          </button>
        )}
      </div>
      {history?.id === comment.id && (
        <div className="comment-history">
          <strong>Previous text</strong>
          {history.data.previous.map((edit, index) => (
            <p key={index}>{edit.body}</p>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="review-surface" ref={root}>
      <div className="review-toolbar">
        <button
          aria-label="Previous comment"
          title="Previous comment · Alt+↑"
          disabled={!comments.length}
          onClick={() => step(-1)}
        >
          <ArrowUp size={16} />
        </button>
        <button
          aria-label="Next comment"
          title="Next comment · Alt+↓"
          disabled={!comments.length}
          onClick={() => step(1)}
        >
          <ArrowDown size={16} />
        </button>
        <div className="review-menu-host">
          <button
            aria-label="List comments"
            aria-expanded={listOpen}
            onClick={() => setListOpen((value) => !value)}
          >
            {openCount} open <ChevronDown size={14} />
          </button>
          {listOpen && (
            <div className="review-menu comment-index">
              {comments.length ? (
                comments.map((comment, index) => (
                  <button key={comment.id} onClick={() => jump(index)}>
                    <strong>L{comment.line}</strong>
                    <span>{comment.body}</span>
                  </button>
                ))
              ) : (
                <p>No open comments</p>
              )}
            </div>
          )}
        </div>
        <button
          aria-label="Find in document"
          title="Find in document · ⌘F"
          onClick={() => setFindOpen(true)}
        >
          <Search size={16} />
        </button>
        <button
          aria-label="Open Markdown source"
          title="Open source at the current comment"
          onClick={() => onOpenSource(comments[cursor]?.line || 1)}
        >
          <Code2 size={15} /> Source
        </button>
        <div className="review-menu-host">
          <button
            aria-label="Export review comments"
            aria-expanded={exportOpen}
            onClick={() => setExportOpen((value) => !value)}
          >
            <Copy size={15} /> Copy review <ChevronDown size={14} />
          </button>
          {exportOpen && (
            <div className="review-menu export-menu">
              <button onClick={() => copy("document")}>
                Copy this document
              </button>
              <button
                disabled={!projectComments}
                onClick={() => copy("project")}
              >
                Copy all project comments
              </button>
              <button onClick={download}>
                <Download size={14} /> Download review notes
              </button>
            </div>
          )}
        </div>
        {resolvedCount > 0 && (
          <button
            className={showResolved ? "active" : ""}
            onClick={() => setShowResolved((value) => !value)}
          >
            <Check size={14} /> {showResolved ? "Hide" : "Show"} {resolvedCount}{" "}
            resolved
          </button>
        )}
      </div>
      {findOpen && (
        <div className="review-find">
          <Search size={16} />
          <input
            ref={findInput}
            aria-label="Find text in document"
            value={findQuery}
            onChange={(event) => setFindQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && findCount) {
                event.preventDefault();
                setFindIndex(
                  (index) =>
                    (index + (event.shiftKey ? -1 : 1) + findCount) % findCount,
                );
              }
            }}
            placeholder="Find in rendered document"
          />
          <button
            className={findCase ? "active" : ""}
            aria-label="Match case"
            title="Match case"
            onClick={() => setFindCase((value) => !value)}
          >
            Aa
          </button>
          <button
            className={findWord ? "active" : ""}
            aria-label="Whole word"
            title="Whole word"
            onClick={() => setFindWord((value) => !value)}
          >
            W
          </button>
          <button
            className={findRegex ? "active" : ""}
            aria-label="Regular expression"
            title="Regular expression"
            onClick={() => setFindRegex((value) => !value)}
          >
            .*
          </button>
          <span role="status">
            {findError ||
              (findQuery
                ? findCount
                  ? `${findIndex + 1} of ${findCount}`
                  : "No results"
                : "")}
          </span>
          <button
            aria-label="Previous match"
            disabled={!findCount}
            onClick={() =>
              setFindIndex((index) => (index - 1 + findCount) % findCount)
            }
          >
            <ArrowUp size={15} />
          </button>
          <button
            aria-label="Next match"
            disabled={!findCount}
            onClick={() => setFindIndex((index) => (index + 1) % findCount)}
          >
            <ArrowDown size={15} />
          </button>
          <button aria-label="Close find" onClick={() => setFindOpen(false)}>
            <X size={16} />
          </button>
        </div>
      )}
      <div
        className="document"
        onClick={(event) => {
          const button = event.target.closest(".copy-code");
          if (button) {
            const source = button
              .closest(".code-frame")
              ?.querySelector("pre code")?.textContent;
            if (source)
              copyText(source)
                .then(() => notify("Code copied"))
                .catch((error) => notify(error.message));
          }
        }}
      >
        {rendered.map((block, index) => (
          <div
            className="doc-block"
            key={`${block.line}-${index}`}
            data-line={block.line}
            onDoubleClick={(event) => {
              if (event.target.closest(".markdown")) onOpenSource(block.line);
            }}
          >
            <div className="doc-line" title={`Source line ${block.line}`} aria-label={`Source line ${block.line}`}>
              L{block.line}
            </div>
            <div className="doc-content">
              {block.kind === "mermaid" ? (
                <MermaidView code={block.code} />
              ) : (
                <div
                  className="markdown"
                  dangerouslySetInnerHTML={{ __html: block.html }}
                />
              )}
              {comments
                .filter((comment) => locations.get(comment.id) === index)
                .map(card)}
              {active === index && (
                <div className="comment-compose">
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (event.metaKey || event.ctrlKey) &&
                        draft.trim()
                      ) {
                        event.preventDefault();
                        submitComment(block);
                      }
                    }}
                    placeholder="Add your feedback here…"
                  />
                  <div>
                    <button className="quiet" onClick={() => setActive(null)}>
                      Cancel
                    </button>
                    <button
                      className="primary small"
                      disabled={!draft.trim() || posting}
                      onClick={() => submitComment(block)}
                    >
                      Post comment
                    </button>
                  </div>
                </div>
              )}
            </div>
            {canComment && (
              <button
                className="add-comment"
                aria-label={`Comment on line ${block.line}`}
                title={`Comment on line ${block.line}`}
                onClick={() => {
                  setActive(index);
                  setDraft("");
                }}
              >
                <Plus size={15} />
              </button>
            )}
          </div>
        ))}
        {comments.some((comment) => !locations.has(comment.id)) && (
          <div className="orphan-comments">
            <h4>Comments on earlier text</h4>
            {comments.filter((comment) => !locations.has(comment.id)).map(card)}
          </div>
        )}
      </div>
      <div className="comment-rail" aria-label="Comment positions">
        {comments.map((comment, index) => (
          <button
            key={comment.id}
            aria-label={`Go to comment on line ${comment.line}: ${comment.body.slice(0, 60)}`}
            title={`Line ${comment.line}: ${comment.body}`}
            className={cursor === index ? "active" : ""}
            style={{
              top: `${Math.min(97, (comment.line / Math.max(1, artifact.body.split("\n").length)) * 100)}%`,
            }}
            onClick={() => jump(index)}
          />
        ))}
      </div>
    </div>
  );
}
