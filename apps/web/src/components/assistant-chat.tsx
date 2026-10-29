import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { ArrowDown, ArrowUp, Square } from 'lucide-react';
import type { ReactNode } from 'react';
import './assistant-chat.css';

function MarkdownText() {
  return <MarkdownTextPrimitive />;
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="of-chat-message of-chat-user" aria-label="Your message">
      <div className="of-chat-bubble">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root
      className="of-chat-message of-chat-assistant"
      aria-label="Assistant message"
    >
      <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
    </MessagePrimitive.Root>
  );
}

export function ChatMessages() {
  return (
    <ThreadPrimitive.Messages>
      {({ message }) => (message.role === 'user' ? <UserMessage /> : <AssistantMessage />)}
    </ThreadPrimitive.Messages>
  );
}

export function ChatScrollToBottom() {
  return (
    <ThreadPrimitive.ScrollToBottom
      className="of-chat-scroll"
      aria-label="Scroll to latest message"
    >
      <ArrowDown size={16} />
    </ThreadPrimitive.ScrollToBottom>
  );
}

export function ChatComposer({
  placeholder = 'Message your agent…',
  running = false,
  pending = false,
}: {
  placeholder?: string;
  running?: boolean;
  pending?: boolean;
}) {
  return (
    <ComposerPrimitive.Root className="of-chat-composer">
      <ComposerPrimitive.Input
        aria-label={placeholder.replace('…', '')}
        placeholder={placeholder}
        rows={1}
        maxLength={16000}
      />
      <div className="of-chat-composer-footer">
        <span>Shift + Enter for a new line</span>
        {running ? (
          <ComposerPrimitive.Cancel className="of-chat-send" aria-label="Stop current run">
            <Square size={14} fill="currentColor" />
          </ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send
            className="of-chat-send"
            aria-label="Send message"
            disabled={pending}
          >
            <ArrowUp size={17} />
          </ComposerPrimitive.Send>
        )}
      </div>
    </ComposerPrimitive.Root>
  );
}

export function ChatThread({
  emptyState,
  footer,
  working = false,
  readOnly = false,
}: {
  emptyState: ReactNode;
  footer: ReactNode;
  working?: boolean;
  readOnly?: boolean;
}) {
  return (
    <ThreadPrimitive.Root className="of-chat-thread">
      <ThreadPrimitive.Viewport
        className="of-chat-viewport"
        autoScroll={!readOnly}
        scrollToBottomOnInitialize={!readOnly}
      >
        <div className="of-chat-content">
          {emptyState}
          <ChatMessages />
          {working && <output className="of-chat-working">Agent is working…</output>}
        </div>
        <ThreadPrimitive.ViewportFooter className="of-chat-footer">
          <ChatScrollToBottom />
          {footer}
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
