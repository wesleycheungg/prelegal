"use client";

import { useEffect, useRef, useState } from "react";

import {
  type ChatMessage,
  ChatError,
  applyFields,
  backendIsReachable,
  filledFieldNames,
  sendMessage,
} from "@/lib/chat";
import type { MndaValues } from "@/lib/mnda";

interface MndaChatProps {
  values: MndaValues;
  /**
   * Takes a function of the current values rather than the values themselves.
   *
   * A reply arrives a second or so after it was asked for, and the form is
   * reachable throughout. Merging into the values captured when the message was
   * sent would throw away anything typed in the meantime.
   */
  onValues: (merge: (current: MndaValues) => MndaValues) => void;
}

/**
 * The conversation that fills in the agreement.
 *
 * The assistant asks, the user answers, and whatever the answer settles is
 * written into the values behind the live preview. What each turn filled in is
 * listed under the reply, taken from the values themselves rather than from the
 * assistant's sentence, so the list cannot claim more than actually landed.
 *
 * The greeting is written here rather than asked for, so opening the page costs
 * nothing and the first exchange is immediate.
 */
const GREETING =
  "Hello — I can put together a Mutual NDA with you. Tell me who the two " +
  "companies are and what you will be sharing information about, and I will " +
  "fill in the rest as we go.";

interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Fields this turn filled in, shown beneath an assistant's reply. */
  filled?: string[];
  failed?: boolean;
}

export function MndaChat({ values, onValues }: MndaChatProps) {
  const [turns, setTurns] = useState<Turn[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  const transcript = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    backendIsReachable(controller.signal).then(setAvailable);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    // Keep the newest turn in view as the conversation grows. Assigning
    // `scrollTop` rather than calling `scrollTo`, which not every environment
    // that renders this component implements.
    const log = transcript.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, busy]);

  const send = async () => {
    const message = draft.trim();
    if (!message || busy) return;

    const spoken: Turn[] = [...turns, { role: "user", content: message }];
    setTurns(spoken);
    setDraft("");
    setBusy(true);

    try {
      // Only what the assistant said and what the user said: the greeting was
      // never its own, so sending it back would be putting words in its mouth.
      const history: ChatMessage[] = spoken
        .slice(1)
        .map(({ role, content }) => ({ role, content }));

      const { reply, fields } = await sendMessage(history, values);
      onValues((current) => applyFields(current, fields));
      setTurns([
        ...spoken,
        { role: "assistant", content: reply, filled: filledFieldNames(fields) },
      ]);
    } catch (cause) {
      const explanation =
        cause instanceof ChatError
          ? cause.message
          : "Something went wrong. Please try again.";

      // The message stays in the transcript, because it was said and watching
      // it disappear is worse than seeing it go unanswered. It also goes back
      // in the box, so sending again does not mean typing it again.
      setDraft(message);
      setTurns([...spoken, { role: "assistant", content: explanation, failed: true }]);
    } finally {
      setBusy(false);
      composer.current?.focus();
    }
  };

  return (
    <section aria-label="Chat" className="flex h-full flex-col gap-3">
      <div
        ref={transcript}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex min-h-[24rem] flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4"
      >
        {turns.map((turn, index) => (
          <Bubble key={index} turn={turn} />
        ))}

        {busy && (
          <p className="w-fit rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500">
            <span className="sr-only">The assistant is replying</span>
            <span aria-hidden>…</span>
          </p>
        )}
      </div>

      {available === false ? (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          The chat needs the backend running. Start it with{" "}
          <code className="font-mono">scripts/start-mac.sh</code> and open{" "}
          <a className="underline" href="http://localhost:8000">
            localhost:8000
          </a>
          . You can still use the form.
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="chat-message">
            Message
          </label>
          <textarea
            id="chat-message"
            ref={composer}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; shift and enter starts a new line, as a chat does.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Tell the assistant about your agreement…"
            className="min-h-[3rem] flex-1 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !draft.trim()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Send
          </button>
        </div>
      )}
    </section>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-slate-900 px-3 py-2 text-sm whitespace-pre-wrap text-white">
        {turn.content}
      </p>
    );
  }

  return (
    <div className="w-fit max-w-[90%]">
      <p
        role={turn.failed ? "alert" : undefined}
        className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          turn.failed ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-900"
        }`}
      >
        {turn.content}
      </p>

      {turn.filled && turn.filled.length > 0 && (
        <ul aria-label="Filled in" className="mt-1 flex flex-wrap gap-1">
          {turn.filled.map((name) => (
            <li
              key={name}
              className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800"
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
