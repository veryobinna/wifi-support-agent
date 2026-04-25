import type { ChatRole } from "@/lib/conversation/state";

export type Message = {
  id: string;
  role: ChatRole;
  content: string;
};

type MessageBubbleProps = {
  message: Message;
};

export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <article className={`message-row ${message.role}`}>
      <div className="message-bubble">{message.content}</div>
    </article>
  );
}
