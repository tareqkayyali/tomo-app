"use client";

import { useState } from "react";

interface Props {
  token: string;
  athleteName: string;
}

export function RefereeSubmitForm({ token, athleteName }: Props) {
  const [rating, setRating] = useState<number>(0);
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="cv-card" style={{ textAlign: "center", padding: 40 }}>
        <div
          style={{
            width: 52, height: 52, borderRadius: "50%",
            background: "var(--cv-sage-30)", color: "var(--cv-sage)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 700, margin: "0 auto 16px",
          }}
        >
          ✓
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Thanks — reference sent</h2>
        <p style={{ color: "var(--cv-cream-body)", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          Tomo will verify you coached {athleteName} and publish it to their CV within 48 hours.
          {athleteName} will be notified when it's live.
        </p>
      </div>
    );
  }

  const submit = async () => {
    if (!rating) { setError("Please give a rating."); return; }
    if (note.trim().length < 10) { setError("Add at least one short sentence."); return; }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/cv/reference/submit/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, note: note.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.error === "already_submitted") {
          setError("This link has already been used.");
        } else if (body?.error === "invalid_token") {
          setError("This link is no longer valid.");
        } else {
          setError("Could not send. Try again.");
        }
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="cv-card">
      <div className="cv-card-header">
        <span className="cv-overline">Your rating (1–5)</span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            disabled={busy}
            style={{
              flex: 1,
              padding: "16px 0",
              borderRadius: 10,
              border: `1px solid ${rating >= n ? "var(--cv-sage-30)" : "var(--cv-cream-10)"}`,
              background: rating >= n ? "var(--cv-sage-15)" : "var(--cv-cream-06)",
              color: rating >= n ? "var(--cv-sage)" : "var(--cv-cream-body)",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 120ms",
            }}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="cv-overline" style={{ marginBottom: 8 }}>Your note (2 lines)</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={`Describe ${athleteName} in 1–2 sentences. What stands out? Where are they heading?`}
        maxLength={500}
        rows={4}
        disabled={busy}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 10,
          border: "1px solid var(--cv-cream-10)",
          background: "var(--cv-cream-06)",
          color: "var(--cv-cream)",
          fontSize: 14,
          lineHeight: 1.5,
          resize: "vertical",
          fontFamily: "inherit",
          boxSizing: "border-box",
        }}
      />
      <div style={{ textAlign: "right", fontSize: 11, color: "var(--cv-cream-muted)", marginTop: 4 }}>
        {note.length}/500
      </div>

      {error ? (
        <div style={{ color: "#E56B6F", fontSize: 13, marginTop: 10 }}>{error}</div>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        style={{
          width: "100%",
          marginTop: 16,
          padding: "14px 0",
          borderRadius: 12,
          border: "1px solid var(--cv-sage-30)",
          background: "var(--cv-sage-15)",
          color: "var(--cv-sage)",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: 0.5,
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.5 : 1,
        }}
      >
        {busy ? "Sending..." : "Send reference"}
      </button>
    </div>
  );
}
