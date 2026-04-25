import { NextResponse } from "next/server";
import {
  initialConversationState,
  type ChatRequest,
  type ChatResponse
} from "@/lib/conversation/state";

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const userMessage = body.messages.at(-1)?.content;

  const response: ChatResponse = {
    message: {
      id: crypto.randomUUID(),
      role: "assistant",
      content: userMessage
        ? "Thanks. Before recommending a router reboot, I need to qualify the issue. Is the problem affecting one device or multiple devices?"
        : "Tell me what WiFi or internet issue you are seeing, and I will help decide whether a router reboot is appropriate."
    },
    state: body.state ?? initialConversationState
  };

  return NextResponse.json(response);
}
