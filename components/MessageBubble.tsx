export type Message = {
  id: string;
  role: "assistant" | "user";
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
