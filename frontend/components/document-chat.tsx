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
import { Button, focusRing } from "./ui";
import type { DocumentValues } from "@/lib/document-values";
import type { DocumentSchema } from "@/lib/field-schema";

interface ChosenDocument {
  slug: string;
  schema: DocumentSchema;
  values: DocumentValues;
}

interface DocumentChatProps {
  /** The document being filled in, or null while one is still being chosen. */
  document: ChosenDocument | null;
  /** Called when the assistant settles on which agreement is wanted. */
  onDocument: (slug: string) => void;
  /**
   * Takes a function of the current values rather than the values themselves.
   *
   * A reply arrives a second or so after it was asked for, and the form is
   * reachable throughout. Merging into the values captured when the message was
   * sent would throw away anything typed in the meantime.
   */
  onValues: (merge: (current: DocumentValues) => DocumentValues) => void;
}

/**
 * The conversation that chooses an agreement and fills it in.
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
  "Hello — I can help you put together an agreement. Tell me what you need " +
  "and who it is between, and I will find the right document and fill it in " +
  "as we go.";

interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Fields this turn filled in, shown beneath an assistant's reply. */
  filled?: string[];
  failed?: boolean;
}

export function DocumentChat({
  document,
  onDocument,
  onValues,
}: DocumentChatProps) {
  const [turns, setTurns] = useState<Turn[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  const transcript = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  /** Which agreement is open now, as opposed to when a request was sent. */
  const open = useRef<string | null>(document?.slug ?? null);

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

  useEffect(() => {
    // Put the cursor back where the next message gets typed once the assistant
    // has finished. This runs after the DOM has settled rather than inside the
    // request's `finally`, so it survives the composer being replaced — which
    // is what happens when a reply chooses the document and the pane rebuilds.
    if (!busy && available !== false) composer.current?.focus();
  }, [busy, available, document?.slug]);

  useEffect(() => {
    // Read by `send` after its request comes back, to find out whether the
    // answer is still about the agreement it was asked about.
    open.current = document?.slug ?? null;
  });

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

      const asked = document;
      const turn = await sendMessage(history, asked);

      // The agreement can be changed from the picker while this was in the
      // air. The answer describes the one that was open when it was asked
      // for, and most cover pages share field names, so applying it now would
      // merge cleanly and invisibly into a document nobody confirmed it for.
      if (open.current !== (asked?.slug ?? null)) {
        setTurns([
          ...spoken,
          {
            role: "assistant",
            content:
              "You changed agreement while I was answering, so I have left " +
              "that out. Tell me again and I will fill in this one.",
            failed: true,
          },
        ]);
        return;
      }

      if (turn.document && !asked) onDocument(turn.document);
      if (asked) {
        onValues((current) => applyFields(asked.schema, current, turn.fields));
      }

      setTurns([
        ...spoken,
        {
          role: "assistant",
          content: turn.reply,
          filled: asked ? filledFieldNames(asked.schema, turn.fields) : [],
        },
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
      setTurns([
        ...spoken,
        { role: "assistant", content: explanation, failed: true },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Chat" className="flex h-full flex-col gap-3">
      <div
        ref={transcript}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex min-h-[24rem] flex-1 flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-surface p-4"
      >
        {turns.map((turn, index) => (
          <Bubble key={index} turn={turn} />
        ))}

        {busy && (
          <p className="w-fit rounded-lg bg-canvas px-3 py-2 text-sm text-muted">
            <span className="sr-only">The assistant is replying</span>
            <span aria-hidden>…</span>
          </p>
        )}
      </div>

      {available === false ? (
        <p
          role="status"
          className="rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-navy"
        >
          The chat needs the backend running. Start it with{" "}
          <code className="font-mono text-navy">scripts/start-mac.sh</code> and
          open{" "}
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
            placeholder={
              document
                ? "Tell the assistant about your agreement…"
                : "Describe the agreement you need…"
            }
            className={`min-h-[3rem] flex-1 resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm text-navy placeholder:text-muted focus:outline-none ${focusRing}`}
          />
          <Button onClick={send} disabled={busy || !draft.trim()}>
            Send
          </Button>
        </div>
      )}
    </section>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-navy px-3 py-2 text-sm whitespace-pre-wrap text-white">
        {turn.content}
      </p>
    );
  }

  return (
    <div className="w-fit max-w-[90%]">
      <p
        role={turn.failed ? "alert" : undefined}
        className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          turn.failed ? "bg-red-50 text-red-700" : "bg-canvas text-navy"
        }`}
      >
        {turn.content}
      </p>

      {turn.filled && turn.filled.length > 0 && (
        <ul aria-label="Filled in" className="mt-1 flex flex-wrap gap-1">
          {turn.filled.map((name) => (
            <li
              key={name}
              className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
