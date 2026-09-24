import React, { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

export default function SourceReview({
  artifact,
  canComment,
  onComment,
  onResolve,
  revealLine,
  canEdit,
  canWithdraw,
  onEditSource,
  onWithdraw,
}) {
  const [activeLine, setActiveLine] = useState(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const root = useRef(null);
  const lines = artifact.body.split("\n");
  useEffect(() => {
    if (revealLine)
      root.current
        ?.querySelector(`[data-source-line="${revealLine}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [revealLine, artifact.id]);
  const submit = async (line, source) => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      if (await onComment({ line, quote: source, body: draft })) {
        setActiveLine(null);
        setDraft("");
      }
    } finally {
      setPosting(false);
    }
  };
  return (
    <div className="source-review" ref={root}>
      <div className="source-review-head">
        <h2>Markdown source</h2>
        <p>
          This is the saved source. Comment on a line or edit a new version if
          you own this artifact.
        </p>
        {canEdit && (
          <button className="secondary small" onClick={onEditSource}>
            Edit source
          </button>
        )}
        {canWithdraw && (
          <button className="secondary small" onClick={onWithdraw}>
            Withdraw review &amp; edit
          </button>
        )}
      </div>
      <div className="source-lines">
        {lines.map((source, index) => {
          const line = index + 1;
          const comments = (artifact.comments || []).filter(
            (comment) =>
              !comment.resolved &&
              comment.line === line &&
              comment.quote.split("\n")[0] === source,
          );
          return (
            <div className="source-row" data-source-line={line} key={line}>
              <span className="source-number">{line}</span>
              <code>{source || " "}</code>
              {canComment && source.trim() && (
                <button
                  className="source-comment-button"
                  aria-label={`Comment on source line ${line}`}
                  title={`Comment on source line ${line}`}
                  onClick={() => {
                    setActiveLine(line);
                    setDraft("");
                  }}
                >
                  <Plus size={15} />
                </button>
              )}
              {comments.map((comment) => (
                <div className="source-comment" key={comment.id}>
                  <strong>{comment.author}</strong>: {comment.body}{" "}
                  <button onClick={() => onResolve(comment.id)}>Resolve</button>
                </div>
              ))}
              {activeLine === line && (
                <div className="comment-compose source-compose">
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (event.metaKey || event.ctrlKey)
                      ) {
                        event.preventDefault();
                        submit(line, source);
                      }
                    }}
                    placeholder="Add a comment on this source line…"
                  />
                  <div>
                    <button
                      className="quiet"
                      onClick={() => setActiveLine(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary small"
                      disabled={!draft.trim() || posting}
                      onClick={() => submit(line, source)}
                    >
                      Post comment
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
