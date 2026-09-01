"use client";

/**
 * Custom Assessment — public take page.
 *
 * A recruiter creates a custom written question with a reference answer; the
 * candidate opens this page via a private token, types their answer, and the
 * backend grades it with the configured LLM against the reference.
 */

import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Send, Loader2, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

export default function CustomAssessmentTakePage() {
  const router = useRouter();
  const params = useParams();
  const token = params?.token;

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const wordCountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/career/custom-assessments/take/${token}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Could not load this assessment.");
        }
        const data = await res.json();
        if (!cancelled) setQuestion(data.question || "");
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Could not load this assessment.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async () => {
    if (submitting) return;
    if (!answer.trim()) {
      setError("Please write an answer before submitting.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/career/custom-assessments/take/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answer.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Could not submit your answer.");
      }
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err?.message || "Could not submit your answer.");
    } finally {
      setSubmitting(false);
    }
  };

  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  const verdictTone: Record<string, string> = {
    strong: "green",
    adequate: "blue",
    weak: "neutral",
    off_topic: "neutral",
  };
  const verdictLabel: Record<string, string> = {
    strong: "Strong",
    adequate: "Adequate",
    weak: "Needs work",
    off_topic: "Off topic",
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] font-sans text-[#262626]">
      <div className="max-w-3xl mx-auto p-6 md:p-10 space-y-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-xs text-[#6E6359] hover:text-[#C85A32] font-mono"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>

        <header className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest bg-[#C85A32]/10 text-[#C85A32] border border-[#C85A32]/20 px-3 py-1 rounded-full font-mono">
            Custom Assessment
          </span>
          <h1 className="text-3xl font-serif font-medium tracking-tight text-[#262626] mt-2">
            Written response
          </h1>
          <p className="text-xs text-[#6E6359]">
            Take your time. The hiring team will receive an AI-graded evaluation against their reference answer.
          </p>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 text-[#C85A32] animate-spin" />
            <p className="text-xs font-mono text-[#6E6359]">Loading question...</p>
          </div>
        ) : error && !result ? (
          <div className="p-5 bg-[#FAEAE5] border border-[#C85A32]/30 rounded-2xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[#C85A32] mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-[#262626]">This link can't be used.</p>
              <p className="text-xs text-[#6E6359]">{error}</p>
            </div>
          </div>
        ) : result ? (
          <div className="space-y-4">
            <div className="p-6 bg-white border border-[#DFD5C6] rounded-2xl shadow-2xs space-y-4">
              <div className="flex items-center gap-2 text-[#2E5A44]">
                <CheckCircle2 className="h-5 w-5" />
                <p className="text-sm font-serif font-bold">Submitted. Here is your evaluation.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono uppercase text-[#6E6359]">Score</p>
                  <p className="text-3xl font-serif font-bold text-[#C85A32]">{result.score}/100</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-mono uppercase text-[#6E6359]">Verdict</p>
                  <p className="text-base font-bold text-[#262626]">
                    {verdictLabel[result.verdict] || result.verdict}
                  </p>
                </div>
              </div>
              {result.summary && (
                <p className="text-sm text-[#262626] leading-relaxed">{result.summary}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div>
                  <p className="text-[10px] font-mono uppercase text-[#2E5A44] font-bold mb-1">Strengths</p>
                  <ul className="text-xs text-[#262626] list-disc pl-4 space-y-1">
                    {(result.strengths || []).map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                    {(!result.strengths || result.strengths.length === 0) && (
                      <li className="text-[#6E6359] list-none">No strengths recorded.</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase text-[#C85A32] font-bold mb-1">Gaps</p>
                  <ul className="text-xs text-[#262626] list-disc pl-4 space-y-1">
                    {(result.gaps || []).map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                    {(!result.gaps || result.gaps.length === 0) && (
                      <li className="text-[#6E6359] list-none">No gaps recorded.</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-6 bg-white border border-[#DFD5C6] rounded-2xl shadow-2xs space-y-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-[#6E6359]">Question</p>
              <p className="text-base font-serif text-[#262626] leading-relaxed whitespace-pre-wrap">
                {question}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono uppercase tracking-wider text-[#6E6359]">Your answer</p>
                <span className="text-[10px] font-mono text-[#6E6359]" ref={wordCountRef}>
                  {wordCount} word{wordCount === 1 ? "" : "s"}
                </span>
              </div>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={14}
                placeholder="Write a clear, structured answer. The AI evaluation looks for accuracy, depth, and coverage of the key ideas."
                className="w-full bg-white border border-[#DFD5C6] rounded-2xl p-4 text-sm text-[#262626] focus:border-[#C85A32] focus:outline-none focus:ring-2 focus:ring-[#C85A32]/20 font-sans resize-y"
                disabled={submitting}
              />
              {error && (
                <p className="text-xs text-[#C85A32] font-medium">{error}</p>
              )}
              <button
                onClick={submit}
                disabled={submitting || !answer.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#C85A32] text-white rounded-xl text-sm font-bold hover:bg-[#B83A14] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit answer
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
