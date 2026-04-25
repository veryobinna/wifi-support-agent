"use client";

import { FormEvent, useState } from "react";
import { initialConversationState, type ConversationState } from "@/lib/conversation/state";
import { MessageBubble, type Message } from "./MessageBubble";

const welcomeMessage: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi. I can help decide whether rebooting your Linksys EA6350 router is the right next step. What WiFi or internet issue are you seeing?"
};

function createMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
}

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<ConversationState>(initialConversationState);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || isSending) {
      return;
    }

    const userMessage: Message = {
      id: createMessageId(),
      role: "user",
      content: trimmedInput
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: nextMessages,
          state
        })
      });

      if (!response.ok) {
        throw new Error("The assistant could not respond.");
      }

      const data = await response.json();
      setMessages((currentMessages) => [...currentMessages, data.message]);
      setState(data.state);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="chat-panel">
      <div className="message-list" aria-live="polite">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <input
          className="chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Describe your WiFi issue"
          aria-label="Message"
        />
        <button className="send-button" disabled={isSending} type="submit">
          {isSending ? "Sending" : "Send"}
        </button>
        {error ? <p className="chat-error">{error}</p> : null}
      </form>
    </div>
  );
}
