import { createRoot } from 'react-dom/client';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  ThreadPrimitive,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { ChatMessages } from '../components/assistant-chat';
import { HtmlVisualization } from '../components/html-visualization';
import '../base.css';

const html = `<h1>Factory capacity</h1>
<p>Choose how many agents to run.</p>
<label>Agents <input type="range" min="1" max="8" value="2" oninput="document.querySelector('output').textContent=this.value"></label>
<output>2</output>
<button onclick="this.textContent='Updated'">Update</button>
<details><summary>Details</summary><div style="height:320px">More capacity information</div></details>
<style>h1{font-size:24px;margin:0 0 8px}input{accent-color:var(--accent)}output{display:block;font-size:48px}button{padding:8px 16px}details{margin-top:16px}</style>`;
const hostile = `<p id="isolation">Checking isolation</p><script>
let blocked = 0;
try { parent.document.body.dataset.compromised = 'yes'; } catch { blocked++; }
try { localStorage.setItem('compromised','yes'); } catch { blocked++; }
fetch('https://blocked.invalid/probe').catch(() => { document.querySelector('#isolation').textContent = 'Isolated ' + blocked; });
</script><img alt="" src="https://blocked.invalid/pixel"><iframe src="https://blocked.invalid/frame"></iframe>`;
const fence = (language: string, value: string) => `\`\`\`${language}\n${value}\n\`\`\``;
const messages: ThreadMessageLike[] = [
  {
    id: 'user',
    role: 'user',
    content: [{ type: 'text', text: fence('openfactory-html', '<b>User example</b>') }],
  },
  {
    id: 'answer',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: `Here is the capacity planner.\n\n${fence('openfactory-html', html)}\n\nRegular source example:\n${fence('html', '<b>Ordinary HTML</b>')}\n\n${fence('openfactory-html', hostile)}`,
      },
    ],
  },
];

function Fixture() {
  const runtime = useExternalStoreRuntime({
    messages,
    onNew: async () => {},
    convertMessage: (message: ThreadMessageLike) => message,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root>
        <div style={{ maxWidth: 760, padding: 16, margin: 'auto' }}>
          <ChatMessages />
        </div>
      </ThreadPrimitive.Root>
      {new URLSearchParams(location.search).has('oversize') && (
        <HtmlVisualization code={'🟠'.repeat(250_001)} />
      )}
    </AssistantRuntimeProvider>
  );
}
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Fixture />);
}
