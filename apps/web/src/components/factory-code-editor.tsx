import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { yaml, yamlFrontmatter } from '@codemirror/lang-yaml';
import { markdown } from '@codemirror/lang-markdown';

export default function FactoryCodeEditor({
  path,
  source,
  disabled,
  onChange,
}: {
  path: string;
  source: string;
  disabled: boolean;
  onChange: (source: string) => void;
}) {
  return (
    <CodeMirror
      aria-label={`Source code for ${path}`}
      value={source}
      theme="dark"
      height="100%"
      extensions={[
        path.endsWith('.yaml')
          ? yaml()
          : path.endsWith('/agent.md')
            ? yamlFrontmatter({ content: markdown() })
            : markdown(),
        EditorView.contentAttributes.of({ 'aria-label': `Source code for ${path}` }),
      ]}
      editable={!disabled}
      indentWithTab={false}
      onChange={onChange}
      basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
    />
  );
}
