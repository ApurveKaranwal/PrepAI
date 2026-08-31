"use client";

/**
 * Live assessments tracker with analytics and score breakdown.
 *
 * Replaces the basic inline implementation in RecruiterPortal.
 * Shows live status, scores, chaos resilience, and allows code inspection.
 */

import React, { useMemo, useState } from "react";
import {
  Clock,
  Cpu,
  ExternalLink,
  FileCode2,
  Trash2,
} from "lucide-react";
import {
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  PanelHeader,
  Spinner,
  StatTile,
  styles,
} from "./ui";

/** Score tier thresholds */
const SCORE_TIERS = [
  { min: 850, label: "Titan", color: "text-[#9333EA]" },
  { min: 700, label: "Distinguished", color: "text-[#C85A32]" },
  { min: 550, label: "Proficient", color: "text-[#262626]" },
  { min: 0, label: "Needs Work", color: "text-[#6E6359]" },
];

function scoreTier(score) {
  for (const tier of SCORE_TIERS) {
    if (score >= tier.min) return tier;
  }
  return SCORE_TIERS[SCORE_TIERS.length - 1];
}

function StatusBadge({ status }) {
  const map = {
    Pending: { tone: "neutral", label: "Pending" },
    Sent: { tone: "blue", label: "Sent" },
    "In Progress": { tone: "accent", label: "In Progress" },
    Completed: { tone: "green", label: "Completed" },
    Expired: { tone: "danger", label: "Expired" },
  };
  const cfg = map[status] || { tone: "neutral", label: status };
  return <Chip tone={cfg.tone}>{cfg.label}</Chip>;
}

// -----------------------------------------------------------------------------
// Score Analytics Row
// -----------------------------------------------------------------------------

function AnalyticsRow({ items }) {
  const stats = useMemo(() => {
    const completed = items.filter((a) => a.status === "Completed");
    const avgScore =
      completed.length > 0
        ? Math.round(completed.reduce((s, a) => s + (Number(a.score) || 0), 0) / completed.length)
        : 0;
    const avgChaos =
      completed.length > 0
        ? Math.round(
            completed.reduce((s, a) => s + (Number(a.chaos_resilience) || 0), 0) / completed.length
          )
        : 0;
    const passCount = completed.filter((a) => (Number(a.score) || 0) >= 600).length;
    const passRate = completed.length > 0 ? Math.round((passCount / completed.length) * 100) : 0;

    // Score distribution
    const distribution = { titan: 0, distinguished: 0, proficient: 0, needsWork: 0 };
    for (const a of completed) {
      const s = Number(a.score) || 0;
      if (s >= 850) distribution.titan++;
      else if (s >= 700) distribution.distinguished++;
      else if (s >= 550) distribution.proficient++;
      else distribution.needsWork++;
    }

    return { completed: completed.length, total: items.length, avgScore, avgChaos, passRate, distribution };
  }, [items]);

  if (stats.total === 0) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatTile
        label="Average Score"
        value={stats.avgScore || "—"}
        sublabel={`${stats.completed} completed`}
        tone={stats.avgScore >= 700 ? "accent" : "ink"}
      />
      <StatTile
        label="Pass Rate"
        value={stats.completed > 0 ? `${stats.passRate}%` : "—"}
        sublabel="Score ≥ 600"
        tone={stats.passRate >= 70 ? "green" : "accent"}
      />
      <StatTile
        label="Avg Chaos Resilience"
        value={stats.avgChaos ? `${stats.avgChaos}%` : "—"}
        sublabel="Under stress"
        tone="ink"
      />
      <StatTile
        label="Total Dispatched"
        value={stats.total}
        sublabel={`${stats.total - stats.completed} pending`}
        tone="ink"
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Assessment Card
// -----------------------------------------------------------------------------

function AssessmentCard({ assm, onInspect, onDelete }) {
  const tier = assm.status === "Completed" ? scoreTier(Number(assm.score) || 0) : null;

  return (
    <div className={`${styles.card} p-5 space-y-4`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif font-semibold text-base text-[#262626] truncate">
            {assm.candidate_name || "Candidate"}
          </h3>
          <p className="text-[11px] font-mono text-[#6E6359] truncate">
            {assm.role_title || "No requisition"}
          </p>
        </div>
        <StatusBadge status={assm.status} />
      </header>

      {assm.problem_title && (
        <p className="text-[11px] font-mono text-[#262626] bg-[#FAF6F0] border border-[#DFD5C6] rounded-lg px-3 py-2">
          <FileCode2 className="h-3 w-3 inline mr-1.5 -mt-0.5" />
          <strong>{assm.problem_title}</strong>
          {assm.difficulty && <span className="text-[#6E6359] ml-2">{assm.difficulty}</span>}
        </p>
      )}

      {assm.status === "Completed" && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-3">
            <div className="flex-1 text-center">
              <p className="text-[9px] font-mono uppercase text-[#6E6359]">Score</p>
              <p className={`text-xl font-black font-mono ${tier?.color || "text-[#262626]"}`}>
                {assm.score}
                <span className="text-[10px] font-normal text-[#6E6359]">/1000</span>
              </p>
            </div>
            <div className="h-8 w-px bg-[#DFD5C6]" />
            <div className="flex-1 text-center">
              <p className="text-[9px] font-mono uppercase text-[#6E6359]">Chaos</p>
              <p className="text-xl font-black font-mono text-[#2E5A44]">
                {assm.chaos_resilience}
                <span className="text-[10px] font-normal text-[#6E6359]">%</span>
              </p>
            </div>
            {tier && (
              <>
                <div className="h-8 w-px bg-[#DFD5C6]" />
                <div className="flex-1 text-center">
                  <p className="text-[9px] font-mono uppercase text-[#6E6359]">Tier</p>
                  <p className={`text-base font-bold font-mono ${tier.color}`}>{tier.label}</p>
                </div>
              </>
            )}
          </div>

          {assm.submitted_at && (
            <p className="text-[10px] font-mono text-[#6E6359] text-right">
              <Clock className="h-3 w-3 inline mr-1 -mt-0.5" />
              Submitted{" "}
              {new Date(assm.submitted_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      )}

      {assm.status !== "Completed" && assm.token && (
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-[#6E6359]">Test Link:</span>
          <a
            href={`/takehome/${assm.token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-[#C85A32] hover:text-[#B83A14] flex items-center gap-1"
          >
            Open Sandbox
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-[#DFD5C6]/60">
        {assm.status === "Completed" && onInspect && (
          <button
            type="button"
            onClick={() => onInspect(assm)}
            className={`${styles.secondary} grow`}
          >
            <FileCode2 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            Inspect Code
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(assm)}
          className={styles.iconButton}
          aria-label="Delete assessment"
          title="Delete assessment record"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------

export default function AssessmentsTracker({ assessments, onInspect, toast }) {
  const [filter, setFilter] = useState("all"); // 'all' | 'pending' | 'completed'
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const items = useMemo(() => assessments?.items || [], [assessments?.items]);
  const loading = assessments?.loading;
  const error = assessments?.error;
  const reload = assessments?.reload;
  const remove = assessments?.remove;

  const filtered = useMemo(() => {
    if (filter === "pending") return items.filter((a) => a.status !== "Completed");
    if (filter === "completed") return items.filter((a) => a.status === "Completed");
    return items;
  }, [items, filter]);

  const handleDelete = async () => {
    if (!pendingDelete || !remove) return;
    setDeleting(true);
    const result = await remove(pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
    if (result?.ok) toast?.success("Assessment record removed.");
    else if (result?.message) toast?.error(result.message);
  };

  return (
    <div className="space-y-6">
      <PanelHeader
        title="Live Assessments"
        description="Real-time tracking of take-home invitations, executions, and scored submissions."
      >
        <div className="flex items-center gap-1.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl px-1 py-0.5">
          {[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "completed", label: "Completed" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1 rounded-lg text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                filter === opt.value
                  ? "bg-[#262626] text-white"
                  : "text-[#6E6359] hover:text-[#262626]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </PanelHeader>

      <ErrorBanner message={error} onRetry={reload} />

      <AnalyticsRow items={items} />

      {loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Spinner />
          <span className="text-[10px] font-mono uppercase text-[#6E6359]">Loading assessments</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Cpu}
          title={
            filter === "completed"
              ? "No completed assessments yet"
              : filter === "pending"
              ? "No pending assessments"
              : "No assessments dispatched"
          }
          message={
            filter === "all"
              ? "Send a take-home from the Talent Sourcing Radar."
              : filter === "pending"
              ? "Pending assessments will appear here."
              : "Completed submissions will appear here."
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((assm) => (
            <AssessmentCard
              key={assm.id || assm.token}
              assm={assm}
              onInspect={onInspect}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove this assessment?"
        message={`The assessment record for ${pendingDelete?.candidate_name || "this candidate"} will be removed from your tracker.`}
        confirmLabel="Remove assessment"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
