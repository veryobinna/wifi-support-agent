import type { ChatRole } from "@/lib/conversation/state";

export type Message = {
  id: string;
  role: ChatRole;
  content: string;
};

type MessageBubbleProps = {
  message: Message;
};

function WifiIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function renderContent(content: string) {
  return content.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isAssistant = message.role === "assistant";

  return (
    <article className={`message-row ${message.role}`}>
      {isAssistant && (
        <div className="message-avatar" aria-hidden="true">
          <WifiIcon />
        </div>
      )}
      <div className="message-bubble">
        {renderContent(message.content)}
      </div>
    </article>
  );
}

export function TypingIndicator() {
  return (
    <div className="message-row assistant" aria-label="Assistant is typing">
      <div className="message-avatar" aria-hidden="true">
        <WifiIcon />
      </div>
      <div className="typing-bubble">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}
