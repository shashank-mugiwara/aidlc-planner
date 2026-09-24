import React, { useMemo, useRef, useState } from "react";
import {
  MDXEditor,
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  CreateLink,
  DiffSourceToggleWrapper,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  ListsToggle,
  Separator,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";

export default function RichMarkdownEditor({
  markdown,
  onChange,
  onUploadImage,
  editorRef,
  source = false,
}) {
  const [parseError, setParseError] = useState("");
  const uploadRef = useRef(onUploadImage);
  uploadRef.current = onUploadImage;
  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      imagePlugin({ imageUploadHandler: (file) => uploadRef.current(file) }),
      tablePlugin(),
      frontmatterPlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: "text" }),
      codeMirrorPlugin({
        codeBlockLanguages: {
          js: "JavaScript",
          ts: "TypeScript",
          json: "JSON",
          mermaid: "Mermaid",
          text: "Plain text",
        },
      }),
      diffSourcePlugin({ viewMode: source ? "source" : "rich-text" }),
      markdownShortcutPlugin(),
      toolbarPlugin({
        toolbarContents: () => (
          <DiffSourceToggleWrapper options={["rich-text", "source"]}>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <BoldItalicUnderlineToggles />
            <CodeToggle />
            <Separator />
            <ListsToggle />
            <CreateLink />
            <Separator />
            <InsertTable />
            <InsertImage />
            <InsertCodeBlock />
          </DiffSourceToggleWrapper>
        ),
      }),
    ],
    [source],
  );
  return (
    <div className="rich-markdown-editor" aria-label="Markdown content">
      <MDXEditor
        ref={editorRef}
        markdown={markdown}
        onChange={(next, initialNormalize) => {
          if (!initialNormalize) onChange(next);
          setParseError("");
        }}
        onError={({ error }) => setParseError(error)}
        plugins={plugins}
        contentEditableClassName="rich-markdown-content"
        className="aidlc-mdxeditor"
      />
      {parseError && (
        <p className="editor-error" role="alert">
          This Markdown could not be shown in rich mode: {parseError}. Switch to
          Source to keep editing the original text.
        </p>
      )}
    </div>
  );
}
