import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Compass, Loader2, RotateCcw, Send } from "lucide-react";
import { Alumni } from "@/services/alumniService";
import { streamExplore } from "@/services/exploreService";
import AlumniCard from "@/components/AlumniCard";

interface ExploreMessage {
  role: "user" | "assistant";
  text: string;
  people: Alumni[];
  activity?: string;
  error?: string;
}

const STARTERS = [
  "What are recent grads (2023-2025) doing right after HBS?",
  "Which sectors are founders clustering in?",
  "How has the share of alumni joining startups changed over time?",
  "Where do alumni who came from consulting end up?",
  "What are alumni in London working on?",
  "Who could I talk to about starting a climate tech company?",
];

// Inline **bold** only; everything else is rendered as plain text
const renderInline = (text: string): React.ReactNode =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>
  );

// Small markdown renderer for the assistant's answers: paragraphs, headings, lists and tables
const renderAnswer = (content: string): React.ReactNode[] => {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      elements.push(
        <div key={elements.length} className="overflow-x-auto my-3">
          <table className="text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>{rows[0]?.map((c, k) => <th key={k} className="px-3 py-2 text-left font-semibold text-gray-700 border-b">{renderInline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(1).map((r, k) => (
                <tr key={k} className="border-b last:border-0">{r.map((c, j) => <td key={j} className="px-3 py-1.5 text-gray-700">{renderInline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^#{1,3} /.test(line)) {
      elements.push(<h3 key={elements.length} className="font-semibold text-gray-900 mt-4 mb-1">{renderInline(line.replace(/^#{1,3} /, ""))}</h3>);
    } else if (/^\s*[-*] /.test(line)) {
      elements.push(
        <div key={elements.length} className="flex gap-2 ml-2 my-0.5">
          <span className="text-harvard-crimson">•</span>
          <span>{renderInline(line.replace(/^\s*[-*] /, ""))}</span>
        </div>
      );
    } else if (/^\s*\d+\. /.test(line)) {
      elements.push(
        <div key={elements.length} className="flex gap-2 ml-2 my-0.5">
          <span className="text-gray-500">{line.match(/\d+/)?.[0]}.</span>
          <span>{renderInline(line.replace(/^\s*\d+\. /, ""))}</span>
        </div>
      );
    } else if (line.trim()) {
      elements.push(<p key={elements.length} className="my-2">{renderInline(line)}</p>);
    }
    i++;
  }
  return elements;
};

const ExplorePage: React.FC = () => {
  const [messages, setMessages] = useState<ExploreMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [limits, setLimits] = useState<{ peopleShown: number; peopleLimit: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Update the assistant message currently being streamed (always the last one)
  const updateLast = (change: (m: ExploreMessage) => ExploreMessage) =>
    setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? change(m) : m)));

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || isStreaming) return;
    setInput("");
    setIsStreaming(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", text, people: [] },
      { role: "assistant", text: "", people: [], activity: "Thinking" },
    ]);
    abortRef.current = new AbortController();

    await streamExplore(
      text,
      conversationId,
      {
        onSession: setConversationId,
        onText: (delta) => updateLast((m) => ({ ...m, text: m.text + delta, activity: undefined })),
        onTool: (label) => updateLast((m) => ({ ...m, activity: label })),
        onPeople: (people) =>
          updateLast((m) => ({
            ...m,
            people: [...m.people, ...people.filter((p) => !m.people.some((existing) => existing.id === p.id))],
          })),
        onDone: (info) => setLimits({ peopleShown: info.peopleShown, peopleLimit: info.peopleLimit }),
        onError: (message) => updateLast((m) => ({ ...m, error: message, activity: undefined })),
      },
      abortRef.current.signal
    );

    updateLast((m) => ({ ...m, activity: undefined }));
    setIsStreaming(false);
  };

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setLimits(null);
    setIsStreaming(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="w-full py-4 px-6 md:px-12 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-harvard-crimson mr-4">ConnectLTV</h1>
            <span className="text-gray-600 text-sm">Explore</span>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                New conversation
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Search
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Conversation */}
      <main className="flex-grow w-full max-w-4xl mx-auto px-4 py-8">
        {messages.length === 0 ? (
          <div className="text-center mt-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-50 border border-red-100 mb-6">
              <Compass className="h-7 w-7 text-harvard-crimson" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900">Explore what alumni are doing</h1>
            <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
              Ask about themes, trends and paths across HBS Launching Tech Ventures alumni, and get a few people worth reaching out to
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto text-left">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  onClick={() => ask(starter)}
                  className="p-4 rounded-lg border border-gray-200 text-gray-700 hover:border-harvard-crimson hover:bg-red-50 transition-colors"
                >
                  {starter}
                </button>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-10 max-w-2xl mx-auto">
              To protect alumni privacy, Explore answers with counts and trends and shows only a handful of people at a time.
              For a full list of matches, use Search.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={index} className="flex justify-end">
                  <div className="max-w-2xl px-4 py-3 rounded-lg bg-harvard-crimson text-white">{message.text}</div>
                </div>
              ) : (
                <div key={index} className="space-y-4">
                  {(message.text || message.activity) && (
                    <div className="p-4 rounded-lg bg-gray-50 border text-gray-800 leading-relaxed">
                      {renderAnswer(message.text)}
                      {message.activity && (
                        <div className="flex items-center gap-1.5 text-xs text-harvard-crimson bg-red-50 px-2 py-0.5 rounded-full border border-red-100 w-fit mt-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>{message.activity}...</span>
                        </div>
                      )}
                    </div>
                  )}
                  {message.error && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-800">{message.error}</div>
                  )}
                  {message.people.length > 0 && (
                    <div className="space-y-3">
                      <span className="text-sm text-gray-500">People mentioned</span>
                      {message.people.map((alumni, personIndex) => (
                        <AlumniCard key={alumni.id} alumni={alumni} index={personIndex} />
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {/* Input */}
      <div className="sticky bottom-0 w-full bg-white border-t">
        <div className="w-full max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden shadow-sm">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask(input)}
              placeholder="Ask about themes, trends or people..."
              disabled={isStreaming}
              className="border-0 h-12 text-base flex-grow focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Button
              onClick={() => ask(input)}
              disabled={isStreaming || !input.trim()}
              className="h-12 px-6 rounded-none bg-harvard-crimson hover:bg-harvard-crimson-light text-white flex items-center justify-center"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {limits && (
            <p className="text-xs text-gray-500 mt-2">
              {limits.peopleShown} of {limits.peopleLimit} people shown in this conversation
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExplorePage;
