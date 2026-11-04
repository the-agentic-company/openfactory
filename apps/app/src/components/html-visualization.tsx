import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SyntaxHighlighterProps } from '@assistant-ui/react-markdown';
import { z } from 'zod';
import { Modal } from './modal';
import {
  visualizationDocument,
  visualizationLimit,
  visualizationThemeProperties,
} from './html-visualization-document';
import './html-visualization.css';

const frameMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('openfactory-ready') }),
  z.object({ type: z.literal('openfactory-height'), height: z.number().finite() }),
]);

export function VisualFrame({
  html,
  expanded = false,
  onMessage,
}: {
  html: string;
  expanded?: boolean;
  onMessage?: (data: unknown, reply: (message: unknown) => void, engaged: boolean) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const gestureAt = useRef(0);
  const loadedAt = useRef(0);
  const [height, setHeight] = useState(240);
  const document = useMemo(() => visualizationDocument(html), [html]);
  useEffect(() => {
    const frame = ref.current;
    const sendTheme = () => {
      const style = getComputedStyle(window.document.documentElement);
      frame?.contentWindow?.postMessage(
        {
          type: 'openfactory-theme',
          properties: Object.fromEntries(
            visualizationThemeProperties.map((key) => [key, style.getPropertyValue(key).trim()]),
          ),
          colorScheme: style.colorScheme,
        },
        '*',
      );
    };
    const recordGesture = (event: Event) => {
      if (event.isTrusted) {
        gestureAt.current = Date.now();
      }
    };
    const recordKeyboard = (event: KeyboardEvent) => {
      if (event.isTrusted && event.key === 'Tab') {
        gestureAt.current = Date.now();
      }
    };
    const panel = frame?.closest('.of-visual');
    panel?.addEventListener('pointermove', recordGesture, true);
    panel?.addEventListener('pointerdown', recordGesture, true);
    panel?.addEventListener('touchstart', recordGesture, true);
    window.addEventListener('keydown', recordKeyboard);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame?.contentWindow) {
        return;
      }
      const message = frameMessage.safeParse(event.data);
      if (!message.success) {
        onMessage?.(
          event.data,
          (data) => frame?.contentWindow?.postMessage(data, '*'),
          window.document.activeElement === frame &&
            Date.now() - gestureAt.current < 60_000 &&
            Date.now() - loadedAt.current > 1000,
        );
        return;
      }
      if (message.data.type === 'openfactory-ready') {
        sendTheme();
      } else {
        setHeight(Math.max(80, Math.min(1600, message.data.height)));
      }
    };
    window.addEventListener('message', receive);
    frame?.addEventListener('load', sendTheme);
    const observer = new MutationObserver(sendTheme);
    observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
    return () => {
      panel?.removeEventListener('pointermove', recordGesture, true);
      panel?.removeEventListener('pointerdown', recordGesture, true);
      panel?.removeEventListener('touchstart', recordGesture, true);
      window.removeEventListener('keydown', recordKeyboard);
      window.removeEventListener('message', receive);
      frame?.removeEventListener('load', sendTheme);
      observer.disconnect();
    };
  }, [onMessage]);
  return (
    <iframe
      ref={ref}
      onLoad={() => {
        loadedAt.current = Date.now();
        gestureAt.current = 0;
      }}
      title="Interactive visualization"
      sandbox={onMessage ? 'allow-scripts allow-forms' : 'allow-scripts'}
      referrerPolicy="no-referrer"
      srcDoc={document}
      style={{ height: expanded ? '70dvh' : height }}
    />
  );
}

export function HtmlVisualization({ code }: Pick<SyntaxHighlighterProps, 'code'>) {
  const [source, setSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const titleId = useId();
  if (new TextEncoder().encode(code).byteLength > visualizationLimit) {
    return (
      <div className="of-visual">
        <p>Visual exceeds the 1 MB limit. Showing source.</p>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    );
  }
  return (
    <section className="of-visual" aria-label="HTML visualization">
      <div className="of-visual-toolbar">
        <span>Visualization</span>
        <button type="button" aria-pressed={source} onClick={() => setSource(!source)}>
          {source ? 'Preview' : 'Source'}
        </button>
        <button type="button" onClick={() => setRevision(revision + 1)}>
          Reset
        </button>
        <button type="button" onClick={() => setExpanded(true)}>
          Expand
        </button>
      </div>
      <div hidden={source}>
        <VisualFrame key={revision} html={code} />
      </div>
      {source && (
        <textarea aria-label="Visualization source" readOnly spellCheck={false} value={code} />
      )}
      {expanded && (
        <Modal titleId={titleId} onClose={() => setExpanded(false)} wide>
          <div className="of-visual-toolbar">
            <h2 id={titleId}>Visualization</h2>
            <button type="button" onClick={() => setExpanded(false)}>
              Close
            </button>
          </div>
          <VisualFrame key={revision} html={code} expanded />
        </Modal>
      )}
    </section>
  );
}
