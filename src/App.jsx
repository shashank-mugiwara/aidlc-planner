import React, { useEffect, useMemo, useState } from "react";
import { md } from "./review/renderer.js";
import ArtifactReview from "./review/ArtifactReview.jsx";
import SourceReview from "./review/SourceReview.jsx";
import {
  activeMentionQuery,
  artifactMentionKeys,
  fileMentionIds,
} from "../shared/mentions.js";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Plus,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";

const groupNames = {
  business: "Business Users",
  product: "Product Managers",
  project: "Project Managers",
  engineering: "Engineers",
};
const typeNames = {
  BRD: "Business Requirements",
  PRD: "Product Requirements",
  PLANNING: "Pre-planning Brief",
  DESIGN: "Solution Design",
  STORIES: "Jira Stories",
};
const levels = { 1: "Member", 2: "Lead", 3: "Manager" };
const RichMarkdownEditor = React.lazy(() => import("./RichMarkdownEditor.jsx"));
const icons = {
  BRD: BookOpen,
  PRD: FileText,
  PLANNING: Clock3,
  DESIGN: FolderKanban,
  STORIES: CheckCircle2,
};
async function api(url, options = {}) {
  const body =
    options.body instanceof FormData
      ? options.body
      : options.body
        ? JSON.stringify(options.body)
        : undefined;
  const res = await fetch("/api" + url, {
    credentials: "same-origin",
    ...options,
    body,
    headers: {
      ...(body instanceof FormData
        ? {}
        : body
          ? { "Content-Type": "application/json" }
          : {}),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
function IconButton({ icon: Icon, children, ...props }) {
  return (
    <button className="icon-button" {...props} title={props.title || children}>
      <Icon size={18} />
      {children}
    </button>
  );
}
function Toast({ message, clear }) {
  return (
    message && (
      <div className="toast" role="alert">
        <span>{message}</span>
        <button onClick={clear} aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    )
  );
}
function Auth({ onAuth }) {
  const [mode, setMode] = useState("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onAuth(
        await api("/auth/" + mode, {
          method: "POST",
          body: { email, password, name },
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-art">
        <div className="brand-mark large">
          A<span>✳</span>
        </div>
        <div className="auth-art-content">
          <span className="eyebrow light">A BETTER WAY TO BUILD</span>
          <h1>
            From first idea
            <br />
            to ready to build.
          </h1>
          <p>
            One place for requirements, decisions, review, and the people who
            move work forward.
          </p>
          <div className="auth-track">
            <span>BRD</span>
            <i />
            <span>PRD</span>
            <i />
            <span>DESIGN</span>
            <i />
            <span>STORIES</span>
          </div>
        </div>
        <div className="auth-orb orb-one" />
        <div className="auth-orb orb-two" />
      </div>
      <div className="auth-panel">
        <div className="mobile-brand">
          <div className="brand-mark">
            A<span>✳</span>
          </div>{" "}
          AIDLC Planner
        </div>
        <div className="auth-box">
          <span className="eyebrow">WELCOME TO AIDLC PLANNER</span>
          <h2>
            {mode === "login"
              ? "Sign in to your workspace"
              : "Create your account"}
          </h2>
          <p className="muted">
            {mode === "login"
              ? "Pick up where your team left off."
              : "Your administrator will assign your team access."}
          </p>
          <form onSubmit={submit}>
            {mode === "signup" && (
              <label>
                Full name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  maxLength={80}
                />
              </label>
            )}
            <label>
              Work email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 12 characters"
                required
                minLength={mode === "signup" ? 12 : 1}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary wide" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}{" "}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="switch-auth">
            {mode === "login"
              ? "New to AIDLC Planner?"
              : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
        <p className="auth-foot">From requirements to stories.</p>
      </div>
    </div>
  );
}
function ChatPane({
  project,
  artifacts,
  projectFiles,
  user,
  notify,
  onUseAnswer,
  onClose,
  onOpenProviders,
  onFilesChanged,
  width,
  onWidthChange,
}) {
  const contextFiles = (row) => {
    try {
      const ids = JSON.parse(row.context_json || "{}").attachmentIds || [];
      return ids
        .map((id) => projectFiles.find((file) => file.id === id))
        .filter(Boolean);
    } catch {
      return [];
    }
  };
  const [messages, setMessages] = useState([]),
    [message, setMessage] = useState(""),
    [provider, setProvider] = useState("anthropic"),
    [model, setModel] = useState(""),
    [skills, setSkills] = useState([]),
    [models, setModels] = useState([]),
    [selected, setSelected] = useState([]),
    [files, setFiles] = useState([]),
    [busy, setBusy] = useState(false),
    [showMentions, setShowMentions] = useState(false),
    [modelError, setModelError] = useState("");
  useEffect(() => {
    api(`/projects/${project.id}/chat`)
      .then(setMessages)
      .catch((e) => notify(e.message));
    api("/skills")
      .then(setSkills)
      .catch(() => {});
    api("/models")
      .then((available) => {
        setModels(available);
        if (
          !available.some((item) => item.provider === provider) &&
          available[0]
        )
          setProvider(available[0].provider);
      })
      .catch((e) => setModelError(e.message));
    api(`/projects/${project.id}/pending-attachments`)
      .then(setFiles)
      .catch((e) => notify(e.message));
  }, [project.id]);
  const artifactKeys = artifactMentionKeys(message);
  const mentioned = artifacts
    .filter((a) => artifactKeys.has(`${a.type}#${a.id}`))
    .map((a) => a.id);
  const mentionedFileIds = fileMentionIds(message);
  const mentionQuery = activeMentionQuery(message) || "";
  async function upload(list) {
    if (!list?.length) return;
    if (files.length + list.length > 5)
      return notify("Maximum five files per chat message");
    const form = new FormData();
    for (const file of list) {
      if (file.size > 5 * 1024 * 1024)
        return notify(`${file.name} exceeds 5 MB`);
      form.append("files", file);
    }
    try {
      const added = await api(`/projects/${project.id}/attachments`, {
        method: "POST",
        body: form,
      });
      setFiles((current) => [...current, ...added]);
      await onFilesChanged();
    } catch (e) {
      notify(e.message);
    }
  }
  async function removeFile(file) {
    try {
      await api(`/attachments/${file.id}`, { method: "DELETE" });
      setFiles((current) => current.filter((item) => item.id !== file.id));
      await onFilesChanged();
    } catch (e) {
      notify(e.message);
    }
  }
  async function send(e) {
    e.preventDefault();
    const selectedFileIds = [
      ...new Set([...files.map((file) => file.id), ...mentionedFileIds]),
    ];
    if (!message.trim() || !model.trim())
      return notify("Choose a model and write a message");
    if (selectedFileIds.length > 5)
      return notify("Choose no more than five files per message");
    setBusy(true);
    const sent = message;
    setMessages((m) => [...m, { role: "user", body: sent, id: "pending" }]);
    setMessage("");
    try {
      await api(`/projects/${project.id}/chat`, {
        method: "POST",
        body: {
          message: sent,
          provider,
          model,
          skillIds: selected,
          artifactIds: mentioned,
          attachmentIds: selectedFileIds,
        },
      });
      setFiles([]);
      await onFilesChanged();
      setMessages(await api(`/projects/${project.id}/chat`));
    } catch (e) {
      notify(e.message);
      setMessages((m) => m.filter((x) => x.id !== "pending"));
      setMessage(sent);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="chat-pane" style={{ width }}>
      <div
        className="chat-resize-handle"
        role="separator"
        tabIndex={0}
        aria-label="Resize agent pane"
        aria-orientation="vertical"
        aria-valuemin={280}
        aria-valuemax={720}
        aria-valuenow={width}
        title="Drag to resize agent pane"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            onWidthChange(
              Math.max(280, Math.min(720, window.innerWidth - e.clientX)),
            );
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            onWidthChange(
              Math.max(
                280,
                Math.min(720, width + (e.key === "ArrowLeft" ? 24 : -24)),
              ),
            );
          }
        }}
      />
      <div className="chat-head">
        <div className="chat-spark">
          <Sparkles size={17} />
        </div>
        <div>
          <strong>Project agent</strong>
          <small>Pi-powered collaborator</small>
        </div>
        <span className="online-dot" />
        <button
          className="chat-close"
          aria-label="Close agent"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="chat-config">
        <div className="config-row">
          <select
            aria-label="Provider"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setModel("");
            }}
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI API</option>
            <option value="openai-codex">OpenAI Codex</option>
          </select>
          <select
            aria-label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">
              {models.some((m) => m.provider === provider)
                ? "Choose model"
                : "No models available"}
            </option>
            {models
              .filter((m) => m.provider === provider)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
          </select>
        </div>
        {!models.some((m) => m.provider === provider) && (
          <p className="model-help" role="status">
            {modelError ||
              `${provider === "anthropic" ? "Anthropic" : provider === "openai" ? "OpenAI" : "OpenAI Codex"} is not connected to Pi.`}{" "}
            {user.isAdmin ? (
              <button onClick={onOpenProviders}>Configure provider</button>
            ) : (
              "Ask an administrator to connect it."
            )}
          </p>
        )}
        {skills.length > 0 && (
          <div className="skill-toggles">
            {skills.map((s) => (
              <button
                key={s.id}
                className={selected.includes(s.id) ? "skill selected" : "skill"}
                onClick={() =>
                  setSelected(
                    selected.includes(s.id)
                      ? selected.filter((x) => x !== s.id)
                      : [...selected, s.id],
                  )
                }
              >
                <Sparkles size={12} />
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <Sparkles size={25} />
            </div>
            <h3>Ask about this project</h3>
            <p>
              Ask for a draft, challenge a requirement, or use @ to bring an
              artifact or project file into context.
            </p>
            <button
              onClick={() =>
                setMessage(
                  "Help me identify gaps in @BRD#" + (artifacts[0]?.id || ""),
                )
              }
            >
              Review the BRD <ArrowRight size={14} />
            </button>
          </div>
        )}
        {messages.map((m, i) => (
          <div className={`chat-message ${m.role}`} key={m.id || i}>
            <span className="chat-author">
              {m.role === "user" ? user.name : "AIDLC Planner agent"}
            </span>
            <div
              className="markdown"
              dangerouslySetInnerHTML={{ __html: md.render(m.body) }}
            />
            {m.role === "user" && contextFiles(m).length > 0 && (
              <div
                className="chat-context-files"
                aria-label="Files used in message"
              >
                {contextFiles(m).map((file) => (
                  <a href={`/api/attachments/${file.id}`} key={file.id}>
                    <Paperclip size={12} /> {file.filename}
                  </a>
                ))}
              </div>
            )}
            {m.role === "assistant" && onUseAnswer && (
              <button
                className="text-action"
                onClick={() => onUseAnswer(m.body)}
              >
                Use in editor
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="thinking">
            <i />
            <i />
            <i /> Thinking with Pi…
          </div>
        )}
      </div>
      <form className="chat-form" onSubmit={send}>
        <div className="chat-files">
          {files.map((f) => (
            <span key={f.id}>
              <Paperclip size={12} />
              {f.filename}
              <button
                type="button"
                aria-label={`Remove ${f.filename}`}
                onClick={() => removeFile(f)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        {showMentions && (
          <div className="mention-list">
            {artifacts
              .filter((a) =>
                `${a.type}#${a.id} ${a.title}`
                  .toLowerCase()
                  .includes(mentionQuery),
              )
              .slice(0, 8)
              .map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => {
                    setMessage(
                      message.replace(/@[^@\n]*$/, `@${a.type}#${a.id} `),
                    );
                    setShowMentions(false);
                  }}
                >
                  <FileText size={14} />
                  {a.title} <small>{a.type}</small>
                </button>
              ))}
            {projectFiles
              .filter((file) =>
                `file#${file.id} ${file.filename}`
                  .toLowerCase()
                  .includes(mentionQuery),
              )
              .slice(0, 8)
              .map((file) => (
                <button
                  type="button"
                  key={`file-${file.id}`}
                  onClick={() => {
                    setMessage(
                      message.replace(/@[^@\n]*$/, `@file#${file.id} `),
                    );
                    setShowMentions(false);
                  }}
                >
                  <Paperclip size={14} />
                  {file.filename} <small>Project file</small>
                </button>
              ))}
          </div>
        )}
        <textarea
          aria-label="Ask project agent"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setShowMentions(activeMentionQuery(e.target.value) !== null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
          placeholder="Ask anything… use @ for artifacts or files"
        />
        <div className="chat-actions">
          <label className="attach-button" title="Attach up to five files">
            <Paperclip size={17} />
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
              onChange={(e) => {
                upload([...e.target.files]);
                e.target.value = "";
              }}
            />
          </label>
          <span>5 files · 5 MB each</span>
          <button
            className="send-button"
            disabled={busy || !message.trim() || !model}
            title="Send"
          >
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </aside>
  );
}
function MarkdownEditor({
  title,
  setTitle,
  body,
  setBody,
  source = false,
  projectId,
  artifactId,
  onImageUploaded,
  notify,
  editorRef,
}) {
  async function uploadImage(file) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      const error = new Error("Choose a PNG, JPEG, or WebP image");
      notify(error.message);
      throw error;
    }
    if (file.size > 5 * 1024 * 1024) {
      const error = new Error("Each image must be 5 MB or smaller");
      notify(error.message);
      throw error;
    }
    const form = new FormData();
    form.append("scope", "artifact");
    form.append("artifactId", String(artifactId));
    form.append("files", file);
    try {
      const [image] = await api(`/projects/${projectId}/attachments`, {
        method: "POST",
        body: form,
      });
      await onImageUploaded();
      return `/api/attachments/${image.id}`;
    } catch (error) {
      notify(error.message);
      throw error;
    }
  }
  return (
    <div className="editor" aria-label="Markdown editor">
      <div className="editor-heading">
        <div>
          <h2>{source ? "Edit Markdown source" : "Write your document"}</h2>
          <p>
            Format as you write. Use Rich text for a live document or Source for
            raw Markdown.
          </p>
        </div>
      </div>
      <label>
        Document title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
        />
      </label>
      <React.Suspense fallback={<p role="status">Loading rich editor…</p>}>
        <RichMarkdownEditor
          key={source ? "source" : "rich"}
          markdown={body}
          onChange={setBody}
          onUploadImage={uploadImage}
          editorRef={editorRef}
          source={source}
        />
      </React.Suspense>
      <p>Save a new version before sending for review.</p>
    </div>
  );
}
function App() {
  const [user, setUser] = useState(undefined),
    [page, setPage] = useState("projects"),
    [projects, setProjects] = useState([]),
    [inbox, setInbox] = useState([]),
    [project, setProject] = useState(null),
    [projectFiles, setProjectFiles] = useState([]),
    [artifact, setArtifact] = useState(null),
    [tab, setTab] = useState("review"),
    [editing, setEditing] = useState(false),
    [changeRequest, setChangeRequest] = useState(null),
    [changeNote, setChangeNote] = useState(""),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [notice, setNotice] = useState(""),
    [showCreate, setShowCreate] = useState(false),
    [showProjectWorkflow, setShowProjectWorkflow] = useState(false),
    [showChat, setShowChat] = useState(() => window.innerWidth >= 1440),
    [focusReading, setFocusReading] = useState(false),
    [chatWidth, setChatWidth] = useState(() => {
      const saved = Number(
        window.localStorage.getItem("aidlc-planner.chatWidth") ??
          window.localStorage.getItem("arc.chatWidth"),
      );
      return Number.isFinite(saved) && saved >= 280 && saved <= 720
        ? saved
        : 286;
    }),
    [adminSection, setAdminSection] = useState("people"),
    [search, setSearch] = useState(""),
    [mobileNav, setMobileNav] = useState(false),
    [versionView, setVersionView] = useState(null),
    [sourceLine, setSourceLine] = useState(1);
  const editorRef = React.useRef(null);
  const notify = (m) => {
    setNotice(m);
    setTimeout(() => setNotice(""), 5000);
  };
  const refreshLists = async () => {
    try {
      const [p, i] = await Promise.all([api("/projects"), api("/inbox")]);
      setProjects(p);
      setInbox(i);
    } catch (e) {
      if (e.message.includes("Waiting")) return;
      notify(e.message);
    }
  };
  const refreshProjectFiles = async (id) => {
    setProjectFiles(await api(`/projects/${id}/attachments`));
  };
  useEffect(() => {
    api("/me")
      .then((u) => {
        setUser(u);
      })
      .catch(() => setUser(null));
    const mq = window.matchMedia("(max-width: 1100px)");
    const change = () => {
      if (mq.matches) setShowChat(false);
    };
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (user && (user.isAdmin || user.memberships.length)) {
      refreshLists();
      const id = new URLSearchParams(location.search).get("project");
      if (id) openProject(id);
    }
  }, [user]);
  const openProject = async (id, artifactId = null) => {
    try {
      const requestedArtifact = Number(
        new URLSearchParams(location.search).get("artifact"),
      );
      const p = await api(`/projects/${id}`);
      setProject(p);
      await refreshProjectFiles(p.id);
      setPage("workspace");
      setShowProjectWorkflow(false);
      setArtifact(null);
      setEditing(false);
      setTab("review");
      setMobileNav(false);
      if (p.artifacts.length)
        await openArtifact(
          p.artifacts.find(
            (a) => a.id === Number(artifactId || requestedArtifact),
          )?.id || p.artifacts.at(-1).id,
        );
    } catch (e) {
      notify(e.message);
    }
  };
  const openArtifact = async (id) => {
    try {
      const a = await api(`/artifacts/${id}`);
      setArtifact(a);
      setTitle(a.title);
      setBody(a.body);
      setEditing(false);
      setTab("review");
      setVersionView(null);
      setSourceLine(1);
      const url = new URL(location.href);
      url.searchParams.set("project", a.project_id);
      url.searchParams.set("artifact", a.id);
      history.replaceState(null, "", url);
    } catch (e) {
      notify(e.message);
    }
  };
  const navigate = (destination) => {
    setPage(destination);
    setMobileNav(false);
    history.replaceState(null, "", "/");
  };
  const resizeChat = (value) => {
    setChatWidth(value);
    window.localStorage.setItem("aidlc-planner.chatWidth", String(value));
  };
  const refreshArtifact = async (keepTab = false) => {
    const previousTab = tab;
    const previousLine = sourceLine;
    if (artifact) await openArtifact(artifact.id);
    if (keepTab) {
      setTab(previousTab);
      setSourceLine(previousLine);
    }
    if (project) {
      setProject(await api(`/projects/${project.id}`));
      await refreshProjectFiles(project.id);
    }
    await refreshLists();
  };
  const ownsCurrentArtifact =
    artifact &&
    project?.current_stage === artifact.stage_key &&
    user?.memberships.some((m) => m.groupKey === artifact.owner_group);
  const canEdit =
    ownsCurrentArtifact &&
    ["draft", "changes_requested"].includes(artifact.status);
  const canWithdraw =
    ownsCurrentArtifact &&
    artifact.status === "in_review" &&
    artifact.review?.status === "pending";
  async function save() {
    try {
      const savedTab = tab;
      const currentBody = editorRef.current?.getMarkdown() ?? body;
      const unsavedImage =
        !document.querySelector(".mdxeditor-source-editor") &&
        [
          ...document.querySelectorAll(
            '.rich-markdown-content img[src^="/api/attachments/"]',
          ),
        ].some((image) => !currentBody.includes(image.getAttribute("src")));
      if (unsavedImage) {
        notify(
          "An image in a table is not yet in the Markdown. Switch to Source mode, then save.",
        );
        return;
      }
      await api(`/artifacts/${artifact.id}`, {
        method: "PUT",
        body: {
          title,
          body: currentBody,
          version: artifact.version,
        },
      });
      notify("Version saved");
      await refreshArtifact();
      if (savedTab === "source") setTab("source");
    } catch (e) {
      notify(e.message);
    }
  }
  async function submitReview() {
    try {
      await api(`/artifacts/${artifact.id}/submit`, { method: "POST" });
      notify("Sent for review");
      await refreshArtifact();
    } catch (e) {
      notify(e.message);
    }
  }
  async function withdrawReview() {
    try {
      const nextTab = tab;
      await api(`/artifacts/${artifact.id}/withdraw-review`, {
        method: "POST",
      });
      notify(
        "Review withdrawn. Edit the BRD, save, then send it for review again.",
      );
      await refreshArtifact();
      setTab(nextTab);
      setEditing(true);
    } catch (error) {
      notify(error.message);
    }
  }
  async function comment(c) {
    try {
      await api(`/artifacts/${artifact.id}/comments`, {
        method: "POST",
        body: c,
      });
      await refreshArtifact(true);
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  }
  async function resolve(id, resolved = true) {
    try {
      await api(`/comments/${id}`, {
        method: "PATCH",
        body: { resolved },
      });
      await refreshArtifact(true);
    } catch (e) {
      notify(e.message);
    }
  }
  async function editComment(id, value) {
    try {
      await api(`/comments/${id}`, { method: "PATCH", body: { body: value } });
      await refreshArtifact(true);
      return true;
    } catch (e) {
      notify(e.message);
      return false;
    }
  }
  async function deleteComment(id) {
    try {
      await api(`/comments/${id}`, { method: "DELETE" });
      await refreshArtifact(true);
    } catch (e) {
      notify(e.message);
    }
  }
  async function uploadAttachments(fileList, artifactId = null) {
    if (!fileList.length) return;
    if (fileList.length > 5)
      return notify("Choose no more than five files at a time");
    if (fileList.some((file) => file.size > 5 * 1024 * 1024))
      return notify("Each file must be 5 MB or smaller");
    if (artifactId && artifact.attachments.length + fileList.length > 5)
      return notify("Maximum five attachments per artifact");
    const form = new FormData();
    form.append("scope", artifactId ? "artifact" : "project");
    if (artifactId) form.append("artifactId", String(artifactId));
    fileList.forEach((file) => form.append("files", file));
    try {
      await api(`/projects/${project.id}/attachments`, {
        method: "POST",
        body: form,
      });
      notify("Files added to the project library");
      await refreshArtifact(true);
    } catch (error) {
      notify(error.message);
    }
  }
  async function removeProjectFile(file) {
    try {
      await api(`/attachments/${file.id}`, { method: "DELETE" });
      notify(`${file.filename} removed`);
      await refreshArtifact(true);
    } catch (error) {
      notify(error.message);
    }
  }
  async function decide(id, decision, note = "") {
    if (decision === "changes_requested" && !note.trim()) {
      setChangeRequest(id);
      setChangeNote("");
      return;
    }
    try {
      const result = await api(`/reviews/${id}/decision`, {
        method: "POST",
        body: { decision, note },
      });
      notify(
        result.advanced
          ? "Approved. Project moved to the next stage."
          : decision === "approve"
            ? "Approval recorded"
            : "Changes requested",
      );
      setChangeRequest(null);
      setChangeNote("");
      await refreshArtifact();
    } catch (e) {
      notify(e.message);
    }
  }
  if (user === undefined)
    return (
      <div className="loading-screen">
        <div className="brand-mark">
          A<span>✳</span>
        </div>
        <p>Opening your workspace…</p>
      </div>
    );
  if (!user) return <Auth onAuth={setUser} />;
  const hasAccess = user.isAdmin || user.memberships.length > 0;
  const myReview = artifact && inbox.find((r) => r.artifact_id === artifact.id);
  const activeStage = project?.stages.find(
    (s) => s.key === project.current_stage,
  );
  const filtered = projects.filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            A<span>✳</span>
          </div>
          <div>
            <strong>aidlc planner</strong>
            <small>AI DELIVERY LIFECYCLE</small>
          </div>
        </div>
        <div className="workspace-switch">
          <div className="workspace-initial">W</div>
          <div>
            <strong>Workspace</strong>
            <small>Team environment</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav className="main-nav">
          <span className="nav-label">WORKSPACE</span>
          <button
            className={page === "projects" ? "active" : ""}
            onClick={() => {
              navigate("projects");
            }}
          >
            <LayoutDashboard size={18} /> Overview
          </button>
          <button
            className={
              page === "project-list" || page === "workspace" ? "active" : ""
            }
            onClick={() => {
              navigate("project-list");
            }}
          >
            <FolderKanban size={18} /> Projects
          </button>
          <button
            className={page === "inbox" ? "active" : ""}
            onClick={() => {
              navigate("inbox");
              refreshLists();
            }}
          >
            <Bell size={18} /> Review inbox{" "}
            {inbox.length > 0 && (
              <span className="nav-count">{inbox.length}</span>
            )}
          </button>
          {user.isAdmin && (
            <>
              <span className="nav-label admin-label">MANAGE</span>
              <button
                className={page === "admin" ? "active" : ""}
                onClick={() => {
                  navigate("admin");
                }}
              >
                <Settings2 size={18} /> Administration
              </button>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Sparkles size={18} />
            <strong>Review work together</strong>
            <p>Your next reviews appear in the inbox.</p>
          </div>
          <div className="sidebar-user">
            <span className="avatar">{user.name?.[0]}</span>
            <div>
              <strong>{user.name}</strong>
              <small>
                {user.isAdmin
                  ? "Administrator"
                  : user.memberships
                      .map((m) => groupNames[m.groupKey])
                      .join(", ") || "Awaiting access"}
              </small>
            </div>
            <button
              title="Sign out"
              onClick={async () => {
                await api("/auth/logout", { method: "POST" });
                setUser(null);
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main id="main-content" className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileNav(!mobileNav)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {page === "workspace" && project
                ? project.name
                : page === "inbox"
                  ? "Review inbox"
                  : page === "admin"
                    ? "Administration"
                    : page === "project-list"
                      ? "Projects"
                      : "Overview"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="user-pill">
              <span className="avatar tiny">{user.name?.[0]}</span>
              {user.name}
            </span>
          </div>
        </header>
        {!hasAccess ? (
          <div className="pending-access">
            <ShieldCheck size={40} />
            <h2>Your account is ready</h2>
            <p>
              An administrator needs to assign your team and level before you
              can open project work.
            </p>
          </div>
        ) : page === "projects" ? (
          <div className="page-content overview">
            <div className="page-heading">
              <div>
                <span className="eyebrow">YOUR WORKSPACE</span>
                <h1>
                  Delivery, in one place<span className="accent-dot">.</span>
                </h1>
                <p>
                  Follow ideas from the first business need to stories ready for
                  engineering.
                </p>
              </div>
              <button className="primary" onClick={() => setShowCreate(true)}>
                <Plus size={17} /> New project
              </button>
            </div>
            <div className="overview-metrics">
              <div>
                <span className="metric-icon purple">
                  <FolderKanban size={19} />
                </span>
                <span>
                  <strong>{projects.length}</strong>
                  <small>Projects</small>
                </span>
              </div>
              <div>
                <span className="metric-icon amber">
                  <Bell size={19} />
                </span>
                <span>
                  <strong>{inbox.length}</strong>
                  <small>Awaiting your review</small>
                </span>
              </div>
              <div>
                <span className="metric-icon teal">
                  <CheckCircle2 size={19} />
                </span>
                <span>
                  <strong>
                    {
                      projects.filter((p) => p.current_stage === "complete")
                        .length
                    }
                  </strong>
                  <small>Completed flows</small>
                </span>
              </div>
            </div>
            <div className="section-heading">
              <div>
                <h2>Projects</h2>
                <p>Every artifact, decision, and handoff in one place.</p>
              </div>
              <div className="search-box">
                <Search size={17} />
                <input
                  aria-label="Search projects"
                  placeholder="Search projects"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="project-grid">
              {filtered.map((p) => (
                <button
                  className="project-card"
                  key={p.id}
                  onClick={() => openProject(p.id)}
                >
                  <div className="card-top">
                    <div className="project-monogram">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <MoreHorizontal size={19} />
                  </div>
                  <h3>{p.name}</h3>
                  <p>
                    {p.description ||
                      "A new delivery journey is ready to begin."}
                  </p>
                  <div className="card-divider" />
                  <div className="card-foot">
                    <span
                      className={`status-badge ${p.current_stage === "complete" ? "complete" : ""}`}
                    >
                      <span />
                      {p.current_stage === "complete"
                        ? "Complete"
                        : p.current_stage.toUpperCase()}
                    </span>
                    <span>
                      Open <ArrowRight size={15} />
                    </span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="empty-projects">
                  <FolderKanban size={29} />
                  <h3>
                    {search
                      ? "No matching projects"
                      : "Your projects will appear here"}
                  </h3>
                  <p>
                    {search
                      ? "Try a different search."
                      : "Create a project to start with a Business Requirements Document."}
                  </p>
                  {!search && (
                    <button
                      className="secondary"
                      onClick={() => setShowCreate(true)}
                    >
                      <Plus size={16} /> Create project
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : page === "project-list" ? (
          <div className="page-content project-index">
            <div className="page-heading">
              <div>
                <span className="eyebrow">PROJECTS</span>
                <h1>
                  All projects<span className="accent-dot">.</span>
                </h1>
                <p>
                  Open a project to see its artifacts, reviews, and activity.
                </p>
              </div>
              <button className="primary" onClick={() => setShowCreate(true)}>
                <Plus size={17} /> New project
              </button>
            </div>
            <div className="section-heading">
              <div>
                <h2>{projects.length} projects</h2>
                <p>Grouped by delivery lifecycle stage.</p>
              </div>
              <div className="search-box">
                <Search size={17} />
                <input
                  aria-label="Search projects"
                  placeholder="Search projects"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="project-list-table">
              {filtered.map((p) => (
                <button key={p.id} onClick={() => openProject(p.id)}>
                  <span className="project-monogram">
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.description || "No description yet"}</small>
                  </span>
                  <span
                    className={`status-badge ${p.current_stage === "complete" ? "complete" : ""}`}
                  >
                    <span />
                    {p.current_stage === "complete"
                      ? "Complete"
                      : p.current_stage.toUpperCase()}
                  </span>
                  <ArrowRight size={17} />
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="empty-list">
                  <FolderKanban size={29} />
                  <h3>{search ? "No matching projects" : "No projects yet"}</h3>
                </div>
              )}
            </div>
          </div>
        ) : page === "inbox" ? (
          <div className="page-content">
            <div className="page-heading">
              <div>
                <span className="eyebrow">DECISIONS</span>
                <h1>
                  Review inbox<span className="accent-dot">.</span>
                </h1>
                <p>Requests that need your perspective and approval.</p>
              </div>
            </div>
            <div className="inbox-list">
              {inbox.length === 0 && (
                <div className="empty-list">
                  <CheckCircle2 size={34} />
                  <h3>All caught up</h3>
                  <p>
                    Reviews assigned to your group and level will appear here.
                  </p>
                </div>
              )}
              {inbox.map((r) => (
                <div className="inbox-item" key={r.id}>
                  <div className="inbox-icon">
                    <FileText size={19} />
                  </div>
                  <div>
                    <span className="eyebrow">
                      {r.project_name} · {r.type}
                    </span>
                    <h3>{r.title}</h3>
                    <p>
                      Requested{" "}
                      {new Date(r.created_at + "Z").toLocaleDateString()}
                    </p>
                  </div>
                  <div className="inbox-actions">
                    <button
                      className="secondary"
                      onClick={() => openProject(r.project_id, r.artifact_id)}
                    >
                      Open artifact
                    </button>
                    <button
                      className="quiet danger"
                      onClick={() => decide(r.id, "changes_requested")}
                    >
                      Request changes
                    </button>
                    <button
                      className="primary small"
                      onClick={() => decide(r.id, "approve")}
                    >
                      <Check size={15} /> Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : page === "admin" ? (
          <Admin
            user={user}
            onUserUpdated={setUser}
            notify={notify}
            section={adminSection}
            setSection={setAdminSection}
          />
        ) : (
          project && (
            <div
              className={`workspace ${showChat ? "" : "chat-hidden"} ${focusReading ? "focus-reading" : ""}`}
            >
              <div className="workspace-main">
                <div className="project-header">
                  <button
                    className="back-link"
                    onClick={() => navigate("projects")}
                  >
                    <ArrowLeft size={16} /> All projects
                  </button>
                  <div className="project-title-row">
                    <div>
                      <span className="eyebrow">PROJECT WORKSPACE</span>
                      <h1>{project.name}</h1>
                      <p>
                        {project.description ||
                          "Make the next decision together."}
                      </p>
                    </div>
                    <div className="project-workflow-actions">
                      <button
                        className="secondary small"
                        onClick={() => setTab("attachments")}
                      >
                        Project files ({projectFiles.length})
                      </button>
                      <span className="workflow-revision">
                        Project workflow v{project.workflow_revision}
                      </span>
                      {user.isAdmin && (
                        <button
                          className="secondary small"
                          onClick={() => setShowProjectWorkflow(true)}
                        >
                          Configure workflow
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="stage-track">
                    {project.stages.map((s, i) => {
                      const a = project.artifacts.find(
                          (x) => x.stage_key === s.key,
                        ),
                        isCurrent = project.current_stage === s.key;
                      return (
                        <button
                          key={s.key}
                          className={`stage-step ${a?.status === "approved" ? "done" : isCurrent ? "current" : ""}`}
                          disabled={!a}
                          onClick={() => a && openArtifact(a.id)}
                        >
                          <span className="stage-number">
                            {a?.status === "approved" ? (
                              <Check size={14} />
                            ) : (
                              i + 1
                            )}
                          </span>
                          <span>{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="stage-scroll-hint">
                    Swipe sideways to see all stages →
                  </div>
                </div>
                <div className="artifact-shell">
                  <aside className="artifact-list">
                    <div className="list-heading">
                      <span>ARTIFACTS</span>
                      <span>{project.artifacts.length}</span>
                    </div>
                    {project.artifacts.map((a) => {
                      const Icon = icons[a.type] || FileText;
                      return (
                        <button
                          key={a.id}
                          className={artifact?.id === a.id ? "selected" : ""}
                          onClick={() => openArtifact(a.id)}
                          aria-label={`Open ${a.title}, ${a.status.replace("_", " ")}`}
                          title={a.title}
                        >
                          <span className="artifact-icon">
                            <Icon size={17} />
                          </span>
                          <span>
                            <strong>
                              {a.type === "STORIES"
                                ? "Jira Stories"
                                : a.type === "PLANNING"
                                  ? "Pre-planning"
                                  : a.type}
                            </strong>
                            <small>{a.status.replace("_", " ")}</small>
                          </span>
                          {a.status === "approved" && (
                            <CheckCircle2 size={15} className="approved-icon" />
                          )}
                        </button>
                      );
                    })}
                    <div className="list-note">
                      <ShieldCheck size={16} />
                      <p>
                        Editing belongs to the owning group. Everyone can follow
                        the work.
                      </p>
                    </div>
                  </aside>
                  <div className="artifact-area">
                    {artifact && (
                      <>
                        <div className="artifact-toolbar">
                          <div>
                            <span className="artifact-type">
                              {typeNames[artifact.type]}
                            </span>
                            <span
                              className={`artifact-state ${artifact.status}`}
                            >
                              {artifact.status.replace("_", " ")}
                            </span>
                          </div>
                          <div className="toolbar-actions">
                            <span className="version-label">
                              v{artifact.version}
                            </span>
                            {canEdit && !editing && (
                              <button
                                className="secondary small"
                                onClick={() => {
                                  setTab("review");
                                  setEditing(true);
                                }}
                              >
                                Edit Markdown
                              </button>
                            )}
                            {canWithdraw && (
                              <button
                                className="secondary small"
                                onClick={withdrawReview}
                              >
                                Withdraw review &amp; edit
                              </button>
                            )}
                            {editing && (
                              <>
                                <button
                                  className="quiet"
                                  onClick={() => {
                                    setEditing(false);
                                    setBody(artifact.body);
                                    setTitle(artifact.title);
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  className="primary small"
                                  onClick={save}
                                >
                                  <Save size={15} /> Save changes
                                </button>
                              </>
                            )}
                            {canEdit && !editing && (
                              <button
                                className="primary small"
                                onClick={submitReview}
                              >
                                <Send size={15} /> Send for review
                              </button>
                            )}
                            {myReview && (
                              <>
                                <button
                                  className="secondary small"
                                  onClick={() =>
                                    decide(myReview.id, "changes_requested")
                                  }
                                >
                                  Request changes
                                </button>
                                <button
                                  className="primary small"
                                  onClick={() => decide(myReview.id, "approve")}
                                >
                                  <Check size={15} /> Approve
                                </button>
                              </>
                            )}
                            <button
                              className="quiet small focus-toggle"
                              onClick={() => setFocusReading((value) => !value)}
                            >
                              {focusReading ? "Exit focus" : "Focus reading"}
                            </button>
                            <button
                              className="secondary small"
                              aria-label={
                                showChat ? "Hide agent" : "Show agent"
                              }
                              onClick={() => {
                                setFocusReading(false);
                                setShowChat(!showChat);
                              }}
                            >
                              <MessageCircle size={15} />{" "}
                              {showChat ? "Hide agent" : "Show agent"}
                            </button>
                          </div>
                        </div>
                        <div className="artifact-tabs">
                          <button
                            className={tab === "review" ? "active" : ""}
                            onClick={() => setTab("review")}
                          >
                            Document
                          </button>
                          <button
                            className={tab === "source" ? "active" : ""}
                            onClick={() => {
                              setTab("source");
                              if (canEdit) setEditing(true);
                            }}
                          >
                            Source
                          </button>
                          <button
                            className={tab === "activity" ? "active" : ""}
                            onClick={() => setTab("activity")}
                          >
                            Activity
                          </button>
                          <button
                            className={tab === "versions" ? "active" : ""}
                            onClick={() => setTab("versions")}
                          >
                            Versions <span>{artifact.versions?.length}</span>
                          </button>
                          <button
                            className={tab === "attachments" ? "active" : ""}
                            onClick={() => setTab("attachments")}
                          >
                            Project files <span>{projectFiles.length}</span>
                          </button>
                        </div>
                        <div className="artifact-scroll">
                          {tab === "review" &&
                            (editing ? (
                              <MarkdownEditor
                                title={title}
                                setTitle={setTitle}
                                body={body}
                                setBody={setBody}
                                projectId={project.id}
                                artifactId={artifact.id}
                                onImageUploaded={() =>
                                  refreshProjectFiles(project.id)
                                }
                                notify={notify}
                                editorRef={editorRef}
                              />
                            ) : (
                              <>
                                <div className="document-heading">
                                  <span className="eyebrow">
                                    {artifact.type} · VERSION {artifact.version}
                                  </span>
                                  <h2>{artifact.title}</h2>
                                  <p>
                                    Owned by {groupNames[artifact.owner_group]}{" "}
                                    ·{" "}
                                    {
                                      (artifact.comments || []).filter(
                                        (c) => !c.resolved,
                                      ).length
                                    }{" "}
                                    open comments
                                  </p>
                                  {canEdit && artifact.reviewPolicy && (
                                    <p
                                      className={`review-requirement ${artifact.reviewPolicy.eligible < artifact.reviewPolicy.approvals ? "missing" : ""}`}
                                    >
                                      Review requires{" "}
                                      {artifact.reviewPolicy.approvals}{" "}
                                      {groupNames[artifact.reviewPolicy.group]}{" "}
                                      approval
                                      {artifact.reviewPolicy.approvals === 1
                                        ? ""
                                        : "s"}{" "}
                                      at{" "}
                                      {levels[artifact.reviewPolicy.minLevel]}{" "}
                                      level or higher.{" "}
                                      {artifact.reviewPolicy.eligible} eligible
                                      reviewer
                                      {artifact.reviewPolicy.eligible === 1
                                        ? ""
                                        : "s"}{" "}
                                      assigned. Artifact editors cannot approve
                                      their own work.
                                    </p>
                                  )}
                                  {!canEdit && (
                                    <p className="edit-guidance">
                                      {artifact.status === "in_review"
                                        ? canWithdraw
                                          ? "The BRD is awaiting Business review. Withdraw it to revise this version."
                                          : "Editing is paused during review. The owning group can withdraw it to revise."
                                        : artifact.status === "approved" ||
                                            project.current_stage !==
                                              artifact.stage_key
                                          ? "This stage is complete. Its approved version is read-only."
                                          : `Only ${groupNames[artifact.owner_group]} can edit this artifact.`}
                                    </p>
                                  )}
                                </div>
                                {artifact.type === "PLANNING" &&
                                  project.current_stage === "planning" && (
                                    <Meeting
                                      project={project}
                                      canEdit={canEdit}
                                      notify={notify}
                                      refresh={() => openProject(project.id)}
                                    />
                                  )}
                                <ArtifactReview
                                  artifact={artifact}
                                  onComment={comment}
                                  onResolve={resolve}
                                  onEdit={editComment}
                                  onDelete={deleteComment}
                                  getCommentHistory={(id) =>
                                    api(`/comments/${id}/history`)
                                  }
                                  canComment={hasAccess}
                                  user={user}
                                  getProjectComments={() =>
                                    api(
                                      `/projects/${project.id}/review-comments`,
                                    )
                                  }
                                  notify={notify}
                                  onOpenSource={(line) => {
                                    setSourceLine(line);
                                    setTab("source");
                                  }}
                                />
                              </>
                            ))}
                          {tab === "source" &&
                            (editing ? (
                              <MarkdownEditor
                                title={title}
                                setTitle={setTitle}
                                body={body}
                                setBody={setBody}
                                source
                                projectId={project.id}
                                artifactId={artifact.id}
                                onImageUploaded={() =>
                                  refreshProjectFiles(project.id)
                                }
                                notify={notify}
                                editorRef={editorRef}
                              />
                            ) : (
                              <SourceReview
                                artifact={artifact}
                                canComment={hasAccess}
                                onComment={comment}
                                onResolve={resolve}
                                revealLine={sourceLine}
                                canEdit={canEdit}
                                canWithdraw={canWithdraw}
                                onEditSource={() => setEditing(true)}
                                onWithdraw={withdrawReview}
                              />
                            ))}
                          {tab === "activity" && (
                            <div className="history-list">
                              <h2>Project activity</h2>
                              {project.activities.map((a) => (
                                <div key={a.id}>
                                  <span className="history-dot" />
                                  <div>
                                    <strong>{a.actor || "System"}</strong>{" "}
                                    {a.action.replaceAll(".", " ")}
                                    <small>
                                      {a.detail && `${a.detail} · `}
                                      {new Date(
                                        a.created_at + "Z",
                                      ).toLocaleString()}
                                    </small>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {tab === "versions" && (
                            <div className="versions-list">
                              <h2>Version history</h2>
                              <p>
                                Every saved change remains available for review.
                              </p>
                              {artifact.versions.map((v) => (
                                <button
                                  key={v.version}
                                  onClick={async () =>
                                    setVersionView(
                                      await api(
                                        `/artifacts/${artifact.id}/versions/${v.version}`,
                                      ),
                                    )
                                  }
                                >
                                  <History size={17} />
                                  <div>
                                    <strong>Version {v.version}</strong>
                                    <small>
                                      {v.editor} ·{" "}
                                      {new Date(
                                        v.created_at + "Z",
                                      ).toLocaleString()}
                                    </small>
                                  </div>
                                  <ArrowRight size={16} />
                                </button>
                              ))}
                              {versionView && (
                                <div className="version-panel">
                                  <button
                                    className="quiet"
                                    onClick={() => setVersionView(null)}
                                  >
                                    <X size={15} /> Close version
                                  </button>
                                  <h3>{versionView.title}</h3>
                                  <div
                                    className="markdown"
                                    dangerouslySetInnerHTML={{
                                      __html: md.render(versionView.body),
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          {tab === "attachments" && (
                            <div className="attachment-list project-library">
                              <h2>Project files</h2>
                              <p>
                                Upload up to five files at a time, 5 MB each.
                                This project can hold 100 files or 250 MB. Files
                                shared in agent chat appear here too. Type @ in
                                chat to reference one.
                              </p>
                              <div className="library-upload-actions">
                                <label className="upload-zone">
                                  <Paperclip size={21} />
                                  <span>Add project files</span>
                                  <input
                                    type="file"
                                    multiple
                                    aria-label="Upload project files"
                                    accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
                                    onChange={async (e) => {
                                      const list = [...e.target.files];
                                      e.target.value = "";
                                      await uploadAttachments(list);
                                    }}
                                  />
                                </label>
                                {canEdit && (
                                  <label className="upload-zone">
                                    <FileText size={21} />
                                    <span>Attach to {artifact.type}</span>
                                    <input
                                      type="file"
                                      multiple
                                      aria-label="Upload current artifact files"
                                      accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md"
                                      onChange={async (event) => {
                                        const list = [...event.target.files];
                                        event.target.value = "";
                                        await uploadAttachments(
                                          list,
                                          artifact.id,
                                        );
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                              <div className="project-file-list">
                                {projectFiles.map((file) => (
                                  <div
                                    className="project-file-row"
                                    key={file.id}
                                  >
                                    <a href={`/api/attachments/${file.id}`}>
                                      <Paperclip size={17} />
                                      <span>
                                        <strong>{file.filename}</strong>
                                        <small>
                                          {file.scope === "artifact"
                                            ? `Artifact · ${file.artifact_title}`
                                            : file.scope === "project"
                                              ? "Project upload"
                                              : file.chat_message_id
                                                ? "Agent chat"
                                                : "Unsent chat upload"}
                                          {" · "}
                                          {file.uploaded_by}
                                          {" · "}
                                          {(file.bytes / 1024).toFixed(1)} KB
                                        </small>
                                      </span>
                                      <ArrowRight size={16} />
                                    </a>
                                    {(file.owner_id === user.id ||
                                      user.isAdmin) &&
                                      (file.scope === "project" ||
                                        (file.scope === "artifact" &&
                                          canEdit &&
                                          artifact.status === "draft") ||
                                        (file.scope === "chat" &&
                                          !file.chat_message_id)) && (
                                        <button
                                          className="quiet small"
                                          aria-label={`Remove ${file.filename}`}
                                          onClick={() =>
                                            removeProjectFile(file)
                                          }
                                        >
                                          Remove
                                        </button>
                                      )}
                                  </div>
                                ))}
                                {!projectFiles.length && (
                                  <p>No files in this project yet.</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {showChat && (
                <ChatPane
                  project={project}
                  artifacts={project.artifacts}
                  projectFiles={projectFiles}
                  user={user}
                  notify={notify}
                  onClose={() => setShowChat(false)}
                  width={chatWidth}
                  onWidthChange={resizeChat}
                  onOpenProviders={() => {
                    setAdminSection("providers");
                    navigate("admin");
                  }}
                  onFilesChanged={() => refreshProjectFiles(project.id)}
                  onUseAnswer={
                    canEdit
                      ? (answer) => {
                          setEditing(true);
                          setBody(answer);
                          setTab("review");
                        }
                      : null
                  }
                />
              )}
            </div>
          )
        )}
      </main>
      {showCreate && (
        <CreateProject
          projects={projects}
          close={() => setShowCreate(false)}
          created={async (id) => {
            setShowCreate(false);
            await refreshLists();
            await openProject(id);
          }}
          notify={notify}
        />
      )}
      {showProjectWorkflow && project && (
        <ProjectWorkflow
          project={project}
          projects={projects}
          notify={notify}
          close={() => setShowProjectWorkflow(false)}
          published={async () => {
            setShowProjectWorkflow(false);
            await refreshArtifact(true);
          }}
        />
      )}
      {changeRequest && (
        <div className="modal-backdrop" onClick={() => setChangeRequest(null)}>
          <form
            className="modal change-request-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              decide(changeRequest, "changes_requested", changeNote);
            }}
          >
            <span className="eyebrow">ARTIFACT REVIEW</span>
            <h2>Request changes</h2>
            <p>
              Tell the owner what to revise before this artifact can be
              approved.
            </p>
            <label>
              What needs to change?
              <textarea
                autoFocus
                required
                minLength={2}
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="quiet"
                onClick={() => setChangeRequest(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={!changeNote.trim()}>
                Send change request
              </button>
            </div>
          </form>
        </div>
      )}
      <Toast message={notice} clear={() => setNotice("")} />
    </div>
  );
}
function CreateProject({ projects, close, created, notify }) {
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [copyWorkflowFromProjectId, setCopyWorkflowFromProjectId] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={close}>
          <X size={18} />
        </button>
        <span className="eyebrow">NEW PROJECT</span>
        <h2>Create a project.</h2>
        <p>Start with the default workflow or copy one from another project.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await api("/projects", {
                method: "POST",
                body: {
                  name,
                  description,
                  copyWorkflowFromProjectId:
                    copyWorkflowFromProjectId || undefined,
                },
              });
              created(r.id);
            } catch (e) {
              notify(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Project name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer onboarding refresh"
              required
              maxLength={120}
            />
          </label>
          <label>
            What is this project about?
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A few sentences to give the team context"
              maxLength={2000}
            />
          </label>
          <label>
            Starting workflow
            <select
              aria-label="Starting workflow"
              value={copyWorkflowFromProjectId}
              onChange={(event) =>
                setCopyWorkflowFromProjectId(event.target.value)
              }
            >
              <option value="">Default workflow</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  Copy {item.name} · v{item.workflow_revision}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="quiet" onClick={close}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              Create project <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
function Meeting({ project, canEdit, notify, refresh }) {
  const [at, setAt] = useState(project.meeting_at || ""),
    [attendees, setAttendees] = useState(project.meeting_attendees || "");
  return (
    <div className="meeting-card">
      <div>
        <Clock3 size={18} />
        <strong>Pre-planning call</strong>
      </div>
      <p>
        Schedule time with engineering managers and team leads before this brief
        goes to review.
      </p>
      <div className="meeting-fields">
        <input
          type="datetime-local"
          aria-label="Meeting date and time"
          value={at}
          disabled={!canEdit}
          onChange={(e) => setAt(e.target.value)}
        />
        <input
          aria-label="Meeting attendees"
          placeholder="Engineering managers and team leads"
          value={attendees}
          disabled={!canEdit}
          onChange={(e) => setAttendees(e.target.value)}
        />
        {canEdit && (
          <button
            className="secondary small"
            onClick={async () => {
              try {
                await api(`/projects/${project.id}/meeting`, {
                  method: "POST",
                  body: { at, attendees },
                });
                notify("Pre-planning call scheduled");
                refresh();
              } catch (e) {
                notify(e.message);
              }
            }}
          >
            Save call
          </button>
        )}
      </div>
    </div>
  );
}
function WorkflowStagesEditor({
  stages,
  onUpdate,
  onRemove,
  lockedKeys = [],
  artifactKeys = [],
}) {
  return (
    <div className="workflow-editor">
      <div className="workflow-table-head">
        <span>STAGE & ARTIFACT</span>
        <span>EDITING GROUP</span>
        <span>APPROVING GROUP</span>
        <span>MIN. LEVEL</span>
        <span>APPROVALS</span>
        <span>NEXT STAGE</span>
      </div>
      {stages.map((stage, index) => {
        const locked = lockedKeys.includes(stage.key);
        return (
          <div className="workflow-row" key={stage.key}>
            <div>
              <input
                aria-label={`Stage name ${index + 1}`}
                value={stage.label}
                disabled={locked}
                onChange={(event) =>
                  onUpdate(index, "label", event.target.value)
                }
              />
              <div className="stage-meta">
                <small>
                  {stage.key}
                  {locked ? " · locked" : ""}
                </small>
                <select
                  aria-label={`${stage.key} artifact type`}
                  value={stage.type}
                  disabled={locked || artifactKeys.includes(stage.key)}
                  onChange={(event) =>
                    onUpdate(index, "type", event.target.value)
                  }
                >
                  {Object.entries(typeNames).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  aria-label={`Remove ${stage.label}`}
                  title={
                    artifactKeys.includes(stage.key)
                      ? "A stage with an artifact cannot be removed"
                      : "Remove stage"
                  }
                  disabled={artifactKeys.includes(stage.key)}
                  onClick={() => onRemove(stage.key)}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
            <label className="workflow-cell">
              <span className="mobile-field-label">Editing group</span>
              <select
                aria-label={`${stage.key} editing group`}
                value={stage.owner}
                disabled={locked}
                onChange={(event) =>
                  onUpdate(index, "owner", event.target.value)
                }
              >
                {Object.entries(groupNames).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="workflow-cell">
              <span className="mobile-field-label">Approving group</span>
              <select
                aria-label={`${stage.key} approving group`}
                value={stage.approver}
                disabled={locked}
                onChange={(event) =>
                  onUpdate(index, "approver", event.target.value)
                }
              >
                {Object.entries(groupNames).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="workflow-cell">
              <span className="mobile-field-label">Minimum level</span>
              <select
                aria-label={`${stage.key} minimum level`}
                value={stage.minLevel}
                disabled={locked}
                onChange={(event) =>
                  onUpdate(index, "minLevel", Number(event.target.value))
                }
              >
                {Object.entries(levels).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="workflow-cell">
              <span className="mobile-field-label">Approvals</span>
              <input
                aria-label={`${stage.key} approvals required`}
                type="number"
                min="1"
                max="10"
                value={stage.approvals}
                disabled={locked}
                onChange={(event) =>
                  onUpdate(index, "approvals", Number(event.target.value))
                }
              />
            </label>
            <label className="workflow-cell">
              <span className="mobile-field-label">Next stage</span>
              <select
                aria-label={`${stage.key} next stage`}
                value={stage.next || ""}
                disabled={locked}
                onChange={(event) =>
                  onUpdate(index, "next", event.target.value || null)
                }
              >
                <option value="">Finish</option>
                {stages
                  .filter((item) => item.key !== stage.key)
                  .map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        );
      })}
    </div>
  );
}
function ProjectWorkflow({ project, projects, notify, close, published }) {
  const [workflow, setWorkflow] = useState(null);
  const [sourceId, setSourceId] = useState("");
  const [copiedFrom, setCopiedFrom] = useState(null);
  const [copiedFromRevision, setCopiedFromRevision] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/projects/${project.id}/workflow`)
      .then(setWorkflow)
      .catch((error) => notify(error.message));
  }, [project.id]);
  const artifactKeys = project.artifacts.map((artifact) => artifact.stage_key);
  const lockedKeys = project.artifacts
    .filter(
      (artifact) =>
        artifact.status !== "draft" ||
        artifact.stage_key !== project.current_stage,
    )
    .map((artifact) => artifact.stage_key);
  const updateStage = (index, key, value) =>
    setWorkflow((current) => ({
      ...current,
      stages: current.stages.map((stage, at) =>
        at === index ? { ...stage, [key]: value } : stage,
      ),
    }));
  const addStage = () => {
    if (workflow.stages.length >= 20)
      return notify("Workflow limit is 20 stages");
    const terminal = workflow.stages.find((stage) => !stage.next);
    if (lockedKeys.includes(terminal.key))
      return notify("A reviewed stage cannot be rerouted");
    const key = `stage_${Date.now()}`;
    setWorkflow((current) => ({
      ...current,
      stages: [
        ...current.stages.map((stage) =>
          stage.key === terminal.key ? { ...stage, next: key } : stage,
        ),
        {
          key,
          label: "New stage",
          type: "BRD",
          owner: "product",
          approver: "business",
          minLevel: 2,
          approvals: 1,
          next: null,
        },
      ],
    }));
  };
  const removeStage = (key) => {
    if (artifactKeys.includes(key))
      return notify("A stage with an artifact cannot be removed");
    if (workflow.stages.length <= 2)
      return notify("Workflow needs at least two stages");
    const removed = workflow.stages.find((stage) => stage.key === key);
    setWorkflow((current) => ({
      ...current,
      stages: current.stages
        .filter((stage) => stage.key !== key)
        .map((stage) =>
          stage.next === key ? { ...stage, next: removed.next } : stage,
        ),
    }));
  };
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal project-workflow-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="modal-close"
          aria-label="Close project workflow"
          onClick={close}
        >
          <X size={18} />
        </button>
        <span className="eyebrow">PROJECT SETTINGS · {project.name}</span>
        <h2>Project workflow {workflow ? `v${workflow.revision}` : ""}</h2>
        <p>
          Changes apply only to this project. Stages with review history are
          locked; earlier decisions keep their original rules.
        </p>
        {workflow && (
          <>
            <div className="workflow-copy-row">
              <select
                aria-label="Copy workflow from project"
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
              >
                <option value="">Choose another project</option>
                {projects
                  .filter((item) => item.id !== project.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · v{item.workflow_revision}
                    </option>
                  ))}
              </select>
              <button
                className="secondary"
                disabled={!sourceId}
                onClick={async () => {
                  try {
                    const source = await api(`/projects/${sourceId}/workflow`);
                    setWorkflow((current) => ({
                      ...current,
                      stages: structuredClone(source.stages),
                    }));
                    setCopiedFrom(Number(sourceId));
                    setCopiedFromRevision(source.revision);
                    notify(
                      "Workflow copied into this draft. Publish to apply it to this project.",
                    );
                  } catch (error) {
                    notify(error.message);
                  }
                }}
              >
                Load a copy
              </button>
              <button className="secondary" onClick={addStage}>
                <Plus size={16} /> Add stage
              </button>
            </div>
            <WorkflowStagesEditor
              stages={workflow.stages}
              onUpdate={updateStage}
              onRemove={removeStage}
              lockedKeys={lockedKeys}
              artifactKeys={artifactKeys}
            />
            <div className="modal-actions">
              <button className="quiet" onClick={close}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/projects/${project.id}/workflow`, {
                      method: "POST",
                      body: {
                        baseRevision: workflow.revision,
                        stages: workflow.stages,
                        copiedFromProjectId: copiedFrom,
                        copiedFromRevision,
                      },
                    });
                    notify("Project workflow revision published");
                    await published();
                  } catch (error) {
                    notify(error.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Check size={16} /> Publish for this project
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function Admin({ user, onUserUpdated, notify, section, setSection }) {
  const [users, setUsers] = useState([]),
    [workflow, setWorkflow] = useState(null),
    [skills, setSkills] = useState([]),
    [providers, setProviders] = useState([]),
    [providerKeys, setProviderKeys] = useState({ anthropic: "", openai: "" }),
    [selectedUser, setSelectedUser] = useState(null),
    [editingSkill, setEditingSkill] = useState(null),
    [skillGroup, setSkillGroup] = useState("product"),
    [skillName, setSkillName] = useState(""),
    [skillText, setSkillText] = useState("");
  const load = () => {
    api("/admin/users")
      .then(setUsers)
      .catch((e) => notify(e.message));
    api("/workflow")
      .then(setWorkflow)
      .catch((e) => notify(e.message));
    api("/skills")
      .then(setSkills)
      .catch((e) => notify(e.message));
    api("/admin/providers")
      .then(setProviders)
      .catch((e) => notify(e.message));
  };
  useEffect(load, []);
  const updateStage = (index, key, value) =>
    setWorkflow({
      ...workflow,
      stages: workflow.stages.map((s, i) =>
        i === index ? { ...s, [key]: value } : s,
      ),
    });
  const addStage = () => {
    if (workflow.stages.length >= 20)
      return notify("Workflow limit is 20 stages");
    const key = `stage_${Date.now()}`;
    setWorkflow({
      ...workflow,
      stages: [
        ...workflow.stages.map((s) =>
          s.next === null ? { ...s, next: key } : s,
        ),
        {
          key,
          label: "New stage",
          type: "BRD",
          owner: "product",
          approver: "business",
          minLevel: 2,
          approvals: 1,
          next: null,
        },
      ],
    });
  };
  const removeStage = (key) => {
    if (workflow.stages.length <= 2) return notify("Workflow needs two stages");
    const removed = workflow.stages.find((s) => s.key === key);
    setWorkflow({
      ...workflow,
      stages: workflow.stages
        .filter((s) => s.key !== key)
        .map((s) => (s.next === key ? { ...s, next: removed.next } : s)),
    });
  };
  const saveUser = async () => {
    try {
      await api(`/admin/users/${selectedUser.id}`, {
        method: "PUT",
        body: {
          memberships: selectedUser.memberships,
          active: selectedUser.active,
          isAdmin: selectedUser.isAdmin,
        },
      });
      if (selectedUser.id === user.id) onUserUpdated(await api("/me"));
      setSelectedUser(null);
      load();
      notify("User access updated");
    } catch (e) {
      notify(e.message);
    }
  };
  const publish = async () => {
    try {
      const w = await api("/admin/workflow", {
        method: "POST",
        body: { stages: workflow.stages },
      });
      setWorkflow(w);
      notify(`Workflow revision ${w.revision} published for new projects`);
    } catch (e) {
      notify(e.message);
    }
  };
  return (
    <div className="page-content admin-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h1>
            Shape how work flows<span className="accent-dot">.</span>
          </h1>
          <p>
            Manage the people, skills, and approval path behind every project.
          </p>
        </div>
      </div>
      <div className="admin-tabs">
        <button
          className={section === "people" ? "active" : ""}
          onClick={() => setSection("people")}
        >
          <Users size={17} /> People & groups
        </button>
        <button
          className={section === "workflow" ? "active" : ""}
          onClick={() => setSection("workflow")}
        >
          <FolderKanban size={17} /> Workflow
        </button>
        <button
          className={section === "skills" ? "active" : ""}
          onClick={() => setSection("skills")}
        >
          <Sparkles size={17} /> Agent skills
        </button>
        <button
          className={section === "providers" ? "active" : ""}
          onClick={() => setSection("providers")}
        >
          <Settings2 size={17} /> AI providers
        </button>
      </div>
      {section === "providers" && (
        <div className="admin-panel">
          <div className="panel-heading">
            <div>
              <h2>Connect Pi models</h2>
              <p>
                Keys are stored in Pi's private configuration in the mounted
                data folder. Saved values are never returned to the browser.
              </p>
            </div>
          </div>
          <div className="provider-list">
            {["anthropic", "openai"].map((provider) => {
              const status = providers.find((p) => p.provider === provider);
              return (
                <form
                  className="provider-row"
                  key={provider}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await api(`/admin/providers/${provider}`, {
                        method: "PUT",
                        body: { key: providerKeys[provider] },
                      });
                      setProviderKeys((keys) => ({ ...keys, [provider]: "" }));
                      setProviders(await api("/admin/providers"));
                      notify(
                        `${provider === "anthropic" ? "Anthropic" : "OpenAI"} connected. Reopen the project agent to choose a model.`,
                      );
                    } catch (error) {
                      notify(error.message);
                    }
                  }}
                >
                  <div>
                    <strong>
                      {provider === "anthropic" ? "Anthropic" : "OpenAI API"}
                    </strong>
                    <small>
                      {status?.configured
                        ? `Connected via ${status.source}`
                        : "Not connected"}
                    </small>
                  </div>
                  <label>
                    API key
                    <input
                      type="password"
                      autoComplete="off"
                      aria-label={`${provider} API key`}
                      value={providerKeys[provider]}
                      onChange={(e) =>
                        setProviderKeys((keys) => ({
                          ...keys,
                          [provider]: e.target.value,
                        }))
                      }
                      placeholder="Paste provider API key"
                    />
                  </label>
                  <button
                    className="primary small"
                    disabled={!providerKeys[provider].trim()}
                  >
                    Save key
                  </button>
                  {status?.source === "stored key" && (
                    <button
                      type="button"
                      className="quiet"
                      onClick={async () => {
                        try {
                          await api(`/admin/providers/${provider}`, {
                            method: "DELETE",
                          });
                          setProviders(await api("/admin/providers"));
                          notify("Stored key removed");
                        } catch (error) {
                          notify(error.message);
                        }
                      }}
                    >
                      Remove stored key
                    </button>
                  )}
                </form>
              );
            })}
            <p className="provider-note">
              For OpenAI Codex subscription or Anthropic OAuth, run{" "}
              <code>docker compose exec aidlc-planner pi /login</code> in a
              terminal. Pi keeps that login in the same mounted data folder.
            </p>
          </div>
        </div>
      )}
      {section === "people" && (
        <div className="admin-panel">
          <div className="panel-heading">
            <div>
              <h2>People & groups</h2>
              <p>
                New signups wait here until you assign a group. Levels control
                approvals.
              </p>
            </div>
            <button className="secondary small" onClick={load}>
              Refresh people
            </button>
          </div>
          <div className="people-table">
            <div className="table-head">
              <span>PERSON</span>
              <span>GROUPS</span>
              <span>ACCESS</span>
              <span />
            </div>
            {users.map((u) => (
              <div className="person-row" key={u.id}>
                <div className="person-name">
                  <span className="avatar">{u.name[0]}</span>
                  <span>
                    <strong>{u.name}</strong>
                    <small>{u.email}</small>
                  </span>
                </div>
                <div className="group-pills">
                  {u.memberships.length ? (
                    u.memberships.map((m) => (
                      <span key={m.groupKey}>
                        {groupNames[m.groupKey]} · {levels[m.level]}
                      </span>
                    ))
                  ) : (
                    <em>Awaiting assignment</em>
                  )}
                </div>
                <span className={u.active ? "active-tag" : "inactive-tag"}>
                  {u.active ? (u.isAdmin ? "Admin" : "Active") : "Inactive"}
                </span>
                <button
                  className="secondary small"
                  onClick={() => setSelectedUser(structuredClone(u))}
                >
                  Manage
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {section === "workflow" && workflow && (
        <div className="admin-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Approval workflow{" "}
                <span className="revision-tag">v{workflow.revision}</span>
              </h2>
              <p>
                Set who owns each artifact, who approves it, and where it moves
                next. New projects use the published revision.
              </p>
            </div>
            <div className="workflow-actions">
              <button className="secondary" onClick={addStage}>
                <Plus size={16} /> Add stage
              </button>
              <button className="primary" onClick={publish}>
                <Check size={16} /> Publish revision
              </button>
            </div>
          </div>
          <WorkflowStagesEditor
            stages={workflow.stages}
            onUpdate={updateStage}
            onRemove={removeStage}
          />
          <p className="workflow-help">
            <ShieldCheck size={16} /> The server validates a single start,
            reachable stages, and no cycles before publication. Existing
            projects keep their current revision.
          </p>
        </div>
      )}
      {section === "skills" && (
        <div className="admin-panel">
          <div className="panel-heading">
            <div>
              <h2>Group agent skills</h2>
              <p>
                Only members of the assigned group can enable these instructions
                in chat.
              </p>
            </div>
          </div>
          <div className="skills-grid">
            <form
              className="skill-form"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api(
                    editingSkill
                      ? `/admin/skills/${editingSkill}`
                      : "/admin/skills",
                    {
                      method: editingSkill ? "PUT" : "POST",
                      body: {
                        groupKey: skillGroup,
                        name: skillName,
                        instructions: skillText,
                        enabled: editingSkill
                          ? !!skills.find((s) => s.id === editingSkill)?.enabled
                          : true,
                      },
                    },
                  );
                  setEditingSkill(null);
                  setSkillName("");
                  setSkillText("");
                  load();
                  notify(editingSkill ? "Skill updated" : "Skill created");
                } catch (e) {
                  notify(e.message);
                }
              }}
            >
              <h3>{editingSkill ? "Edit skill" : "Add a skill"}</h3>
              <label>
                Group
                <select
                  value={skillGroup}
                  onChange={(e) => setSkillGroup(e.target.value)}
                  disabled={!!editingSkill}
                >
                  {Object.entries(groupNames).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Skill name
                <input
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  placeholder="e.g. Write acceptance criteria"
                  required
                />
              </label>
              <label>
                Instructions
                <textarea
                  value={skillText}
                  onChange={(e) => setSkillText(e.target.value)}
                  placeholder="Describe how the agent should help this group…"
                  required
                />
              </label>
              <button className="primary">
                {editingSkill ? "Save skill" : "Add skill"} <Plus size={16} />
              </button>
              {editingSkill && (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    setEditingSkill(null);
                    setSkillName("");
                    setSkillText("");
                  }}
                >
                  Cancel edit
                </button>
              )}
            </form>
            <div className="skills-list">
              {skills.length === 0 && (
                <div className="empty-list">
                  <Sparkles size={28} />
                  <h3>No skills yet</h3>
                  <p>
                    Add the first group skill to make it available in project
                    chat.
                  </p>
                </div>
              )}
              {skills.map((s) => (
                <div className="skill-row" key={s.id}>
                  <div className="skill-icon">
                    <Sparkles size={17} />
                  </div>
                  <div>
                    <strong>{s.name}</strong>
                    <small>
                      {groupNames[s.groupKey]} · {s.instructions.slice(0, 110)}
                    </small>
                  </div>
                  <button
                    className="secondary small"
                    onClick={() => {
                      setEditingSkill(s.id);
                      setSkillGroup(s.groupKey);
                      setSkillName(s.name);
                      setSkillText(s.instructions);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className={s.enabled ? "active-tag" : "inactive-tag"}
                    onClick={async () => {
                      try {
                        await api(`/admin/skills/${s.id}`, {
                          method: "PUT",
                          body: {
                            name: s.name,
                            instructions: s.instructions,
                            enabled: !s.enabled,
                          },
                        });
                        load();
                      } catch (e) {
                        notify(e.message);
                      }
                    }}
                  >
                    {s.enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {selectedUser && (
        <div className="modal-backdrop" onClick={() => setSelectedUser(null)}>
          <div
            className="modal user-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelectedUser(null)}
            >
              <X size={18} />
            </button>
            <span className="eyebrow">PEOPLE & GROUPS</span>
            <h2>{selectedUser.name}</h2>
            <p>{selectedUser.email}</p>
            <div className="membership-editor">
              {Object.entries(groupNames).map(([k, v]) => {
                const m = selectedUser.memberships.find(
                  (m) => m.groupKey === k,
                );
                return (
                  <div key={k}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!m}
                        onChange={(e) =>
                          setSelectedUser({
                            ...selectedUser,
                            memberships: e.target.checked
                              ? [
                                  ...selectedUser.memberships,
                                  { groupKey: k, level: 1 },
                                ]
                              : selectedUser.memberships.filter(
                                  (x) => x.groupKey !== k,
                                ),
                          })
                        }
                      />
                      {v}
                    </label>
                    {m && (
                      <select
                        value={m.level}
                        onChange={(e) =>
                          setSelectedUser({
                            ...selectedUser,
                            memberships: selectedUser.memberships.map((x) =>
                              x.groupKey === k
                                ? { ...x, level: Number(e.target.value) }
                                : x,
                            ),
                          })
                        }
                      >
                        {Object.entries(levels).map(([n, l]) => (
                          <option key={n} value={n}>
                            {l}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={selectedUser.isAdmin}
                onChange={(e) =>
                  setSelectedUser({
                    ...selectedUser,
                    isAdmin: e.target.checked,
                  })
                }
              />{" "}
              Administrator
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={selectedUser.active}
                onChange={(e) =>
                  setSelectedUser({ ...selectedUser, active: e.target.checked })
                }
              />{" "}
              Active account
            </label>
            <div className="modal-actions">
              <button className="quiet" onClick={() => setSelectedUser(null)}>
                Cancel
              </button>
              <button className="primary" onClick={saveUser}>
                Save access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
