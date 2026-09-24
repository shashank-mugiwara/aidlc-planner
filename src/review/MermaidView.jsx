import React, { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";

let mermaidPromise;
function loadMermaid() {
  mermaidPromise ||= import("mermaid").then((module) => {
    module.default.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "neutral",
    });
    return module.default;
  });
  return mermaidPromise;
}

export default function MermaidView({ code }) {
  const id = useRef(`arc-diagram-${Math.random().toString(36).slice(2)}`);
  const drag = useRef(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let live = true;
    loadMermaid()
      .then((mermaid) => mermaid.render(id.current, code))
      .then(({ svg: output }) => {
        if (live) {
          setSvg(output);
          setError("");
        }
      })
      .catch((cause) => {
        if (live) setError(cause.message || "Diagram could not be rendered");
      });
    return () => {
      live = false;
    };
  }, [code]);

  useEffect(() => {
    if (!expanded) return;
    const close = (event) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);

  const fit = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };
  const zoom = (factor) =>
    setScale((value) => Math.max(0.35, Math.min(4, value * factor)));
  return (
    <div className={`mermaid-view ${expanded ? "expanded" : ""}`}>
      {expanded && (
        <button
          className="mermaid-backdrop"
          aria-label="Close diagram"
          onClick={() => setExpanded(false)}
        />
      )}
      <div className="mermaid-panel">
        <div className="mermaid-tools">
          <span>Mermaid diagram</span>
          <button aria-label="Zoom out" onClick={() => zoom(0.8)}>
            <Minus size={15} />
          </button>
          <button aria-label="Zoom in" onClick={() => zoom(1.25)}>
            <Plus size={15} />
          </button>
          <button aria-label="Reset diagram zoom" onClick={fit}>
            {Math.round(scale * 100)}%
          </button>
          <button
            aria-label={expanded ? "Collapse diagram" : "Expand diagram"}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          {expanded && (
            <button
              aria-label="Close diagram overlay"
              onClick={() => setExpanded(false)}
            >
              <X size={15} />
            </button>
          )}
        </div>
        {error ? (
          <div className="mermaid-error" role="alert">
            {error}
            <pre>{code}</pre>
          </div>
        ) : (
          <div
            className="mermaid-viewport"
            aria-label="Diagram canvas; drag to pan, use controls to zoom"
            onDoubleClick={fit}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              drag.current = { x: event.clientX, y: event.clientY, pan };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              setPan({
                x: drag.current.pan.x + event.clientX - drag.current.x,
                y: drag.current.pan.y + event.clientY - drag.current.y,
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onWheel={(event) => {
              if (event.metaKey || event.ctrlKey) {
                event.preventDefault();
                zoom(event.deltaY < 0 ? 1.1 : 0.9);
              } else if (event.shiftKey) {
                setPan((value) => ({ ...value, x: value.x - event.deltaY }));
              }
            }}
          >
            {svg ? (
              <div
                className="mermaid-canvas"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <p>Rendering diagram…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
