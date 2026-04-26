"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { chatRole } from "@/lib/conversation/constants";
import {
  createInitialConversationSession,
  type ChatResponse,
  type ConversationSession
} from "@/lib/conversation/state";
import { MessageBubble, TypingIndicator, type Message } from "./MessageBubble";

const welcomeMessage: Message = {
  id: "welcome",
  role: chatRole.assistant,
  content:
    "Hi. I can help decide whether rebooting your Linksys EA6350 router is the right next step.\n\nWhat WiFi or internet issue are you seeing?"
};

function createMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
}

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

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

export function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [session, setSession] = useState<ConversationSession>(
    createInitialConversationSession
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || isSending) return;

    const userMessage: Message = {
      id: createMessageId(),
      role: chatRole.user,
      content: trimmedInput
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);
    setError(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, session })
      });

      if (!response.ok) {
        throw new Error("The assistant could not respond.");
      }

      const data = (await response.json()) as ChatResponse;

      if (!data.session) {
        throw new Error("The assistant response did not include a session.");
      }

      setMessages((prev) => [...prev, data.message]);
      setSession(data.session);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="chat-card">
      {/* Header */}
      <header className="chat-header">
        <div className="chat-header-icon">
          <WifiIcon />
        </div>
        <div className="chat-header-text">
          <div className="chat-header-title">WiFi Support Agent</div>
          <div className="chat-header-subtitle">Linksys EA6350 · Router Reboot Guide</div>
        </div>
        <div className="chat-header-badge">Online</div>
      </header>

      {/* Messages */}
      <div className="message-list" role="log" aria-live="polite" aria-label="Conversation">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isSending && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-bar">
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        <form className="chat-input-row" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Describe your WiFi issue…"
            aria-label="Message"
          />
          <button
            className="send-button"
            type="submit"
            disabled={isSending || !input.trim()}
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </form>
      </div>
    </div>
  );
}
