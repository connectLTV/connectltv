import { Alumni, transformResult } from "@/services/alumniService";

// The Explore agent backend (agent/ in this repo). In development Vite proxies /api/explore to it.
const EXPLORE_API = import.meta.env.VITE_EXPLORE_API || "/api/explore";

// Explore needs its own backend. Show the entry point in development, or in a build that was given the backend's URL.
export const EXPLORE_ENABLED = import.meta.env.DEV || Boolean(import.meta.env.VITE_EXPLORE_API);

export interface ExploreCallbacks {
  onSession?: (conversationId: string) => void;
  onText?: (delta: string) => void;
  onTool?: (label: string) => void;
  onPeople?: (people: Alumni[]) => void;
  onDone?: (info: { peopleShown: number; peopleLimit: number; turnsLeft: number }) => void;
  onError?: (message: string) => void;
}

// Send one message to the Explore agent and stream its answer
export const streamExplore = async (
  message: string,
  conversationId: string | null,
  callbacks: ExploreCallbacks,
  signal?: AbortSignal
): Promise<void> => {
  try {
    const response = await fetch(EXPLORE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversation_id: conversationId }),
      signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.error || `Explore request failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const raw of events) {
        if (!raw.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(raw.slice(6));
          if (event.type === "session") callbacks.onSession?.(event.conversation_id);
          else if (event.type === "text") callbacks.onText?.(event.text);
          else if (event.type === "tool") callbacks.onTool?.(event.label);
          else if (event.type === "people") {
            callbacks.onPeople?.((event.people as Record<string, unknown>[]).map(transformResult));
          } else if (event.type === "done") {
            callbacks.onDone?.({ peopleShown: event.people_shown, peopleLimit: event.people_limit, turnsLeft: event.turns_left });
          } else if (event.type === "error") callbacks.onError?.(event.message);
        } catch (e) {
          console.error("Failed to parse Explore event:", e, raw);
        }
      }
    }
  } catch (error) {
    if (signal?.aborted) return;
    console.error("Error in streamExplore:", error);
    callbacks.onError?.(
      error instanceof Error && error.message.includes("Too many")
        ? error.message
        : "The Explore assistant is not reachable right now."
    );
  }
};
