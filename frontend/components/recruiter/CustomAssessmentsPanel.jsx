"use client";

/**
 * Custom Assessments — recruiter writes a question + reference answer, dispatches
 * a private link to a candidate, and gets AI-graded feedback when they submit.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Copy,
  Edit3,
  FileText,
  Link2,
  Loader2,
  Plus,
  Send,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Users,
  Clipboard,
  Check,
} from "lucide-react";
import {
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingBlock,
  Modal,
  PanelHeader,
  Spinner,
  StatTile,
  styles,
} from "./ui";
import { apiGet, apiPost } from "@/lib/api";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8001';

function ScoreTag({ score }) {
  if (score >= 85) return <Chip tone="accent">Strong ({score}/100)</Chip>;
  if (score >= 60) return <Chip tone="blue">Adequate ({score}/100)</Chip>;
  if (score > 0) return <Chip tone="neutral">Weak ({score}/100)</Chip>;
  return <Chip tone="neutral">Pending</Chip>;
}

// -----------------------------------------------------------------------------
// Create / Edit Form
// -----------------------------------------------------------------------------

function AssessmentForm({ open, assessment, onClose, onSaved }) {
  const [question, setQuestion] = useState("");
  const [referenceAnswer, setReferenceAnswer] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (assessment) {
      setQuestion(assessment.question || "");
      setReferenceAnswer(assessment.reference_answer || "");
    } else {
      setQuestion("");
      setReferenceAnswer("");
    }
    setErrors({});
    setSaving(false);
  }, [open, assessment]);

  const submit = async (event) => {
    event.preventDefault();
    const errs = {};
    if (!question.trim()) errs.question = "Required.";
    if (!referenceAnswer.trim()) errs.referenceAnswer = "Required — the AI grades against this.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const res = await apiPost("/api/career/custom-assessments", {
        question: question.trim(),
        reference_answer: referenceAnswer.trim(),
      });
      setSaving(false);
      if (res?.status === "success") {
        onSaved(res.assessment);
        onClose();
      } else {
        setErrors({ form: res?.detail || "Could not save. Try again." });
      }
    } catch {
      setSaving(false);
      setErrors({ form: "Could not save. Try again." });
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      title={assessment ? "Edit assessment" : "Create custom assessment"}
      subtitle="Write a question and your model answer. Share the private link with a candidate."
      icon={FileText}
      width="max-w-2xl"
      footer={
        <>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="assessment-form" className={styles.primary} disabled={saving}>
            {saving && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
            {assessment ? "Save changes" : "Create assessment"}
          </button>
        </>
      }
    >
      <form id="assessment-form" onSubmit={submit} className="space-y-5">
        {errors.form && (
          <div className="p-3 bg-[#FAEAE5] border border-[#C85A32]/30 rounded-xl text-xs text-[#C85A32]">
            {errors.form}
          </div>
        )}

        <Field
          label="Interview question"
          as="textarea"
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Describe a system design problem, behavioral question, or coding challenge."
          error={errors.question}
          hint="Be specific enough that the reference answer can cover the key points."
        />

        <Field
          label="Reference answer"
          as="textarea"
          rows={8}
          value={referenceAnswer}
          onChange={(e) => setReferenceAnswer(e.target.value)}
          placeholder="The ideal answer. Include key points, trade-offs, or approach you expect."
          error={errors.referenceAnswer}
          hint="The AI grades submissions against this. Include everything a strong answer should cover."
        />
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Dispatch Dialog
// -----------------------------------------------------------------------------

function DispatchDialog({ open, assessment, onClose }) {
  const [dispatching, setDispatching] = useState(false);
  const [token, setToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) { setToken(null); setError(""); setCopied(false); }
  }, [open]);

  const dispatch = async () => {
    if (!assessment || dispatching) return;
    setDispatching(true);
    setError("");
    try {
      const res = await apiPost(`/api/career/custom-assessments/${assessment.id}/dispatch`);
      setDispatching(false);
      if (res?.status === "success") {
        setToken(res.token);
      } else {
        setError(res?.detail || "Could not dispatch.");
      }
    } catch {
      setDispatching(false);
      setError("Could not dispatch. Try again.");
    }
  };

  const shareUrl = token
    ? `${window.location.origin}/custom-assessment/take/${token}`
    : null;

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Modal
      open={open}
      onClose={dispatching ? undefined : onClose}
      dismissible={!dispatching}
      title="Dispatch assessment"
      subtitle="Share the private link with your candidate. They see only the question."
      icon={Link2}
      footer={
        token ? (
          <button type="button" className={styles.secondary} onClick={onClose}>Done</button>
        ) : (
          <>
            <button type="button" className={styles.secondary} onClick={onClose} disabled={dispatching}>
              Cancel
            </button>
            <button type="button" className={styles.primary} onClick={dispatch} disabled={dispatching}>
              {dispatching && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
              Generate link
            </button>
          </>
        )
      }
    >
      {error && (
        <div className="mb-4 p-3 bg-[#FAEAE5] border border-[#C85A32]/30 rounded-xl text-xs text-[#C85A32]">
          {error}
        </div>
      )}

      {token && shareUrl ? (
        <div className="space-y-4">
          <div className="p-4 bg-[#F0F8F0] border border-[#2E5A44]/20 rounded-xl">
            <div className="flex items-center gap-2 text-[#2E5A44] mb-2">
              <CheckCircle2 className="h-4 w-4" />
              <p className="text-sm font-bold">Link generated</p>
            </div>
            <p className="text-xs text-[#6E6359]">
              Share this link with your candidate. They see only the question, not your reference answer.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl px-3 py-2 text-xs font-mono text-[#262626] focus:outline-none"
            />
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-[#C85A32] text-white rounded-xl text-xs font-bold hover:bg-[#B83A14] transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-[10px] font-mono text-[#6E6359]">
            This link is private. Only someone with this link can view the question.
          </p>
        </div>
      ) : (
        <p className="text-sm text-[#6E6359]">
          Generate a one-time link to share with your candidate.
        </p>
      )}
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Submission View Dialog
// -----------------------------------------------------------------------------

function SubmissionDialog({ open, assessment, onClose }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!open || !assessment) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiGet(`/api/career/custom-assessments/${assessment.id}/submissions`);
      setLoading(false);
      if (res?.status === "success") {
        setSubmissions(res.submissions || []);
      } else {
        setError("Could not load results.");
      }
    } catch {
      setLoading(false);
      setError("Could not load results.");
    }
  }, [open, assessment]);

  useEffect(() => {
    if (open) load();
    if (!open) { setSubmissions([]); setError(""); }
  }, [open, load]);

  const sub = submissions[0];
  const verdictLabel = { strong: "Strong", adequate: "Adequate", weak: "Needs work", off_topic: "Off topic" };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI Evaluation"
      subtitle="Graded against your reference answer."
      icon={FileText}
      width="max-w-2xl"
      footer={
        <button type="button" className={styles.secondary} onClick={onClose}>Close</button>
      }
    >
      {loading ? (
        <LoadingBlock label="Loading evaluation" />
      ) : error ? (
        <ErrorBanner message={error} onRetry={load} />
      ) : !sub ? (
        <div className="p-8 text-center">
          <p className="text-sm text-[#6E6359]">No submissions yet. Share the link with your candidate.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl">
              <p className="text-[10px] font-mono uppercase text-[#6E6359] mb-1">Score</p>
              <p className="text-3xl font-serif font-bold text-[#C85A32]">{sub.score}/100</p>
            </div>
            <div className="p-4 bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl">
              <p className="text-[10px] font-mono uppercase text-[#6E6359] mb-1">Verdict</p>
              <p className="text-base font-bold text-[#262626]">{verdictLabel[sub.verdict] || sub.verdict}</p>
            </div>
          </div>

          {sub.summary && (
            <div className="p-4 bg-white border border-[#DFD5C6] rounded-xl">
              <p className="text-[10px] font-mono uppercase text-[#6E6359] mb-2">AI Summary</p>
              <p className="text-sm text-[#262626] leading-relaxed">{sub.summary}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-[#F0F8F0] border border-[#2E5A44]/20 rounded-xl">
              <p className="text-[10px] font-mono uppercase text-[#2E5A44] font-bold mb-2">Strengths</p>
              <ul className="text-xs text-[#262626] list-disc pl-4 space-y-1">
                {(sub.strengths || []).map((s, i) => <li key={i}>{s}</li>)}
                {(!sub.strengths || sub.strengths.length === 0) && <li className="text-[#6E6359]">—</li>}
              </ul>
            </div>
            <div className="p-4 bg-[#FAEAE5] border border-[#C85A32]/20 rounded-xl">
              <p className="text-[10px] font-mono uppercase text-[#C85A32] font-bold mb-2">Gaps</p>
              <ul className="text-xs text-[#262626] list-disc pl-4 space-y-1">
                {(sub.gaps || []).map((s, i) => <li key={i}>{s}</li>)}
                {(!sub.gaps || sub.gaps.length === 0) && <li className="text-[#6E6359]">—</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Main Panel
// -----------------------------------------------------------------------------

export default function CustomAssessmentsPanel({ toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [dispatching, setDispatching] = useState(null);
  const [viewingSubmission, setViewingSubmission] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiGet("/api/career/custom-assessments");
      setLoading(false);
      if (res?.status === "success") {
        setItems(res.assessments || []);
      } else {
        setError("Could not load custom assessments.");
      }
    } catch {
      setLoading(false);
      setError("Could not load custom assessments.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (saved) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === saved.id);
      if (idx >= 0) {
        return prev.map((item) => (item.id === saved.id ? { ...item, ...saved } : item));
      }
      return [{ ...saved, submitted: false, score: 0 }, ...prev];
    });
    toast?.success("Assessment saved.");
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    // Note: no delete endpoint exists yet; the recruiter just removes from their list
    setDeleting(false);
    setPendingDelete(null);
    setItems((prev) => prev.filter((i) => i.id !== pendingDelete.id));
    toast?.success("Assessment removed.");
  };

  const stats = {
    total: items.length,
    submitted: items.filter((i) => i.submitted).length,
    avgScore: (() => {
      const scored = items.filter((i) => i.submitted && i.score > 0);
      if (!scored.length) return 0;
      return Math.round(scored.reduce((s, i) => s + (i.score || 0), 0) / scored.length);
    })(),
  };

  return (
    <div className="space-y-6">
      <PanelHeader
        title="Custom Assessments"
        description="Write a question with a reference answer. Share a private link — the AI grades the candidate's submission against your reference."
      >
        <button type="button" className={styles.primary} onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          New assessment
        </button>
      </PanelHeader>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile label="Assessments" value={stats.total} />
        <StatTile label="Submitted" value={stats.submitted} tone="green" />
        <StatTile
          label="Avg Score"
          value={stats.avgScore || "—"}
          sublabel={stats.submitted > 0 ? "out of 100" : "no submissions yet"}
          tone={stats.avgScore >= 70 ? "accent" : "ink"}
        />
      </div>

      <ErrorBanner message={error} onRetry={load} />

      {loading && items.length === 0 ? (
        <LoadingBlock label="Loading assessments" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No custom assessments yet"
          message="Write a question and your reference answer. Share the private link with a candidate and get AI-graded feedback."
          action={
            <button type="button" className={styles.primary} onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              New assessment
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((item) => (
            <article key={item.id} className={`${styles.card} p-5 space-y-3`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-serif font-semibold text-[#262626] line-clamp-2 flex-1">
                  {item.question}
                </p>
                <div className="shrink-0">
                  <ScoreTag score={item.score} />
                </div>
              </div>

              <div className="flex items-center gap-4 text-[10px] font-mono text-[#6E6359]">
                <span className="flex items-center gap-1">
                  {item.submitted ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-[#2E5A44]" />
                      Submitted
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3" />
                      Awaiting submission
                    </>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#DFD5C6]/60">
                <button
                  type="button"
                  onClick={() => { setEditing(item); setFormOpen(true); }}
                  className={`${styles.secondary} grow`}
                >
                  <Edit3 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDispatching(item)}
                  className={styles.iconButton}
                  title="Dispatch link"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
                {item.submitted && (
                  <button
                    type="button"
                    onClick={() => setViewingSubmission(item)}
                    className={styles.iconButton}
                    title="View AI evaluation"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPendingDelete(item)}
                  className={styles.iconButton}
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <AssessmentForm
        open={formOpen}
        assessment={editing}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />

      <DispatchDialog
        open={Boolean(dispatching)}
        assessment={dispatching}
        onClose={() => setDispatching(null)}
      />

      <SubmissionDialog
        open={Boolean(viewingSubmission)}
        assessment={viewingSubmission}
        onClose={() => setViewingSubmission(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove this assessment?"
        message="It disappears from your list. Existing submission results are not affected."
        confirmLabel="Remove"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
