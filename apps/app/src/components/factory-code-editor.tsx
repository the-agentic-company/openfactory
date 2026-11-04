import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { yaml, yamlFrontmatter } from '@codemirror/lang-yaml';
import { markdown } from '@codemirror/lang-markdown';
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { Redo2, Search, Undo2, WrapText } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

const basicSetup = { lineNumbers: true, foldGutter: true, highlightActiveLine: true };

export default function FactoryCodeEditor({
  path,
  source,
  disabled,
  onChange,
  onSave,
}: {
  path: string;
  source: string;
  disabled: boolean;
  onChange: (source: string) => void;
  onSave: () => void;
}) {
  const editor = useRef<ReactCodeMirrorRef>(null);
  const [wrap, setWrap] = useState(true);
  const [position, setPosition] = useState({ line: 1, column: 1, undo: 0, redo: 0 });
  const extensions = useMemo(
    () => [
      path.endsWith('.yaml') || path.endsWith('.yml')
        ? yaml()
        : path.endsWith('/agent.md')
          ? yamlFrontmatter({ content: markdown() })
          : markdown(),
      EditorView.contentAttributes.of({
        'aria-label': `Source code for ${path}`,
        spellcheck: 'false',
      }),
      ...(wrap ? [EditorView.lineWrapping] : []),
    ],
    [path, wrap],
  );

  function run(command: (view: EditorView) => boolean) {
    const view = editor.current?.view;
    if (view) {
      command(view);
      view.focus();
    }
  }

  return (
    <div className="definition-code-surface">
      <div className="definition-editor-toolbar" role="toolbar" aria-label="Editor tools">
        <button
          type="button"
          title="Undo (⌘Z / Ctrl+Z)"
          aria-label="Undo"
          disabled={disabled || !position.undo}
          onClick={() => run(undo)}
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          title="Redo (⇧⌘Z / Ctrl+Shift+Z)"
          aria-label="Redo"
          disabled={disabled || !position.redo}
          onClick={() => run(redo)}
        >
          <Redo2 size={15} />
        </button>
        <span className="definition-toolbar-divider" />
        <button
          type="button"
          title="Find and replace (⌘F / Ctrl+F)"
          aria-label="Find and replace"
          onClick={() => run(openSearchPanel)}
        >
          <Search size={15} />
          <span>Find</span>
        </button>
        <button
          type="button"
          title="Wrap long lines"
          aria-label="Wrap long lines"
          aria-pressed={wrap}
          onClick={() => setWrap((value) => !value)}
        >
          <WrapText size={15} />
          <span>Wrap</span>
        </button>
      </div>
      <CodeMirror
        ref={editor}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            onSave();
          }
        }}
        className="definition-codemirror"
        value={source}
        theme="none"
        height="100%"
        extensions={extensions}
        editable={!disabled}
        readOnly={disabled}
        indentWithTab={false}
        onChange={onChange}
        onUpdate={({ state }) => {
          const line = state.doc.lineAt(state.selection.main.head);
          const next = {
            line: line.number,
            column: state.selection.main.head - line.from + 1,
            undo: undoDepth(state),
            redo: redoDepth(state),
          };
          setPosition((previous) =>
            previous.line === next.line &&
            previous.column === next.column &&
            previous.undo === next.undo &&
            previous.redo === next.redo
              ? previous
              : next,
          );
        }}
        basicSetup={basicSetup}
      />
      <div className="definition-editor-status">
        <span>
          {disabled
            ? 'Read only'
            : path.endsWith('.yaml') || path.endsWith('.yml')
              ? 'YAML'
              : 'Markdown'}
        </span>
        <span>
          Ln {position.line}, Col {position.column}
        </span>
      </div>
    </div>
  );
}
