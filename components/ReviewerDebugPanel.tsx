"use client";

import type { ChatDebugInfo, ConversationSession } from "@/lib/conversation/state";

type ReviewerDebugPanelProps = {
  session: ConversationSession;
  debug: ChatDebugInfo | null;
};

export function ReviewerDebugPanel({
  session,
  debug
}: ReviewerDebugPanelProps) {
  return (
    <aside className="debug-panel" aria-label="Reviewer debug panel">
      <header className="debug-panel-header">
        <div>
          <div className="debug-panel-title">Reviewer Debug Panel</div>
          <div className="debug-panel-subtitle">
            Deterministic workflow trace
          </div>
        </div>
      </header>

      <div className="debug-panel-scroll">
        <section className="debug-section">
          <div className="debug-section-title">Session</div>
          <DebugGrid
            items={[
              ["Current state", session.state],
              ["Current question", session.currentQuestionId ?? "none"],
              ["Reboot step index", String(session.rebootStepIndex)]
            ]}
          />
        </section>

        <section className="debug-section">
          <div className="debug-section-title">Qualification</div>
          <DebugGrid
            items={[
              ["Device impact", session.qualification.deviceImpact ?? "unset"],
              [
                "Connectivity scope",
                session.qualification.connectivityScope ?? "unset"
              ],
              [
                "Equipment status",
                session.qualification.equipmentStatus ?? "unset"
              ],
              ["Known outage", formatBoolean(session.qualification.knownOutage)],
              [
                "Can access equipment",
                formatBoolean(session.qualification.canAccessEquipment)
              ],
              [
                "Accepts interruption",
                formatBoolean(session.qualification.acceptsTemporaryInterruption)
              ]
            ]}
          />
        </section>

        <section className="debug-section">
          <div className="debug-section-title">Last Turn</div>
          {debug ? (
            <>
              <DebugGrid
                items={[
                  ["Turn id", debug.turnId],
                  ["Latency total", formatLatency(debug.latencyMs.total)],
                  [
                    "Latency breakdown",
                    [
                      `classifier ${formatLatency(debug.latencyMs.classifier)}`,
                      `engine ${formatLatency(debug.latencyMs.engine)}`,
                      `response ${formatLatency(debug.latencyMs.response)}`
                    ].join(" · ")
                  ],
                  ["Previous state", debug.previousState],
                  ["Next state", debug.nextState],
                  ["Previous question", debug.previousQuestionId ?? "none"],
                  ["Next question", debug.nextQuestionId ?? "none"],
                  [
                    "Classifier",
                    `${debug.classifierSource} · ${debug.classifierReason}`
                  ],
                  [
                    "Response",
                    `${debug.responseSource} · ${debug.responseReason}`
                  ]
                ]}
              />
              <DebugBlock label="Intent" value={debug.intent} />
              <DebugBlock label="Draft response" value={debug.draftResponse} />
              <DebugBlock
                label="Final assistant response"
                value={debug.assistantMessage}
              />
            </>
          ) : (
            <p className="debug-empty">
              Send a message to inspect the latest turn.
            </p>
          )}
        </section>
      </div>
    </aside>
  );
}

function DebugGrid({ items }: { items: [string, string][] }) {
  return (
    <dl className="debug-grid">
      {items.map(([label, value]) => (
        <div className="debug-grid-row" key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DebugBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="debug-block">
      <div className="debug-block-label">{label}</div>
      <pre className="debug-block-value">{value}</pre>
    </div>
  );
}

function formatBoolean(value: boolean | undefined): string {
  if (value === undefined) {
    return "unset";
  }

  return value ? "true" : "false";
}

function formatLatency(value: number): string {
  return `${value.toFixed(1)} ms`;
}
