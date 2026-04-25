import { ChatWindow } from "@/components/ChatWindow";

export default function Home() {
  return (
    <main className="app-shell">
      <section className="support-surface" aria-label="WiFi support chatbot">
        <div className="support-header">
          <p className="eyebrow">Linksys EA6350 support</p>
          <h1>WiFi Support Agent</h1>
        </div>
        <ChatWindow />
      </section>
    </main>
  );
}
