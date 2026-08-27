"use client";

/**
 * The hiring pipeline — now an actual pipeline.
 *
 * The old version could do exactly one thing to a shortlisted candidate: delete
 * them. Stage was whatever string happened to be written at insert time, and two
 * of those strings ("Shortlisted", "Take-Home Dispatched") weren't stages the
 * backend recognised. This board moves people through the seven real stages,
 * keeps notes, and shows the audit trail of who moved whom and when.
 *
 * Moves are optimistic and roll back if the request fails, so a dropped
 * connection can't leave the board showing a stage the server never accepted.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Briefcase,
  History,
  StickyNote,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import CandidateDossier from "./CandidateDossier";
import { useCandidateActions } from "./candidateActions";
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
  formatDate,
  formatRelative,
  styles,
} from "./ui";
import { FALLBACK_PIPELINE_STAGES } from "./useRecruiterData";

const STAGE_TONE = {
  Sourced: "neutral",
  Screening: "blue",
  Assessment: "accent",
  Interview: "blue",
  Offer: "green",
  Hired: "green",
  Rejected: "danger",
};

/** Terminal stages don't get an "advance" shortcut — there is nowhere to go. */
const TERMINAL_STAGES = new Set(["Hired", "Rejected"]);

function nextStage(stages, current) {
  const index = stages.indexOf(current);
  if (index < 0 || TERMINAL_STAGES.has(current)) return null;
  return stages[index + 1] || null;
}

// -----------------------------------------------------------------------------

function EntryDetail({ entry, stages, pipeline, toast, onClose, onOpenDossier, onRemove }) {
  const { fetchEvents } = pipeline;
  const [stage, setStage] = useState(entry?.stage || stages[0]);
  const [notes, setNotes] = useState(entry?.notes || "");
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventsError, setEventsError] = useState("");
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setStage(entry.stage || stages[0]);
    setNotes(entry.notes || "");
    setSaving(false);
  }, [entry, stages]);

  useEffect(() => {
    if (!entry?.id) return undefined;
    let cancelled = false;
    setEvents([]);
    setLoadingEvents(true);
    setEventsError("");
    // Depend on the stable `fetchEvents` callback, not the whole hook result —
    // that object is new on every render and would refetch forever.
    fetchEvents(entry.id).then((result) => {
      if (cancelled) return;
      setLoadingEvents(false);
      if (result.ok) setEvents(result.data || []);
      else setEventsError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [entry?.id, fetchEvents]);

  if (!entry) return null;

  const dirty = stage !== entry.stage || notes !== (entry.notes || "");

  const save = async () => {
    const patch = {};
    if (stage !== entry.stage) patch.stage = stage;
    if (notes !== (entry.notes || "")) patch.notes = notes;
    // The API rejects an empty patch with "Nothing to update." — don't send one.
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    const result = await pipeline.move(entry.id, patch);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(patch.stage ? `Moved to ${patch.stage}.` : "Notes saved.");
    onClose();
  };

  return (
    <Modal
      open={Boolean(entry)}
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      title={entry.candidate_name || "Pipeline entry"}
      subtitle={entry.job_role_title ? `For ${entry.job_role_title}` : "Not tied to a requisition"}
      icon={UserRound}
      width="max-w-xl"
      footer={
        <>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={saving}>
            Close
          </button>
          <button type="button" className={styles.primary} onClick={save} disabled={saving || !dirty}>
            {saving && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
            Save
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={STAGE_TONE[entry.stage] || "neutral"}>{entry.stage}</Chip>
          <span className={styles.hint}>
            added {formatDate(entry.created_at)} · last moved {formatRelative(entry.updated_at || entry.created_at)}
          </span>
        </div>

        <Field
          label="Stage"
          as="select"
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          options={stages}
          hint="Every change is recorded below with who made it."
        />

        <Field
          label="Notes"
          as="textarea"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Screening notes, interview feedback, follow-ups."
        />

        <section className="space-y-2">
          <p className={styles.microLabel}>
            <History className="h-3 w-3 inline mr-1 -mt-0.5" />
            Stage history
          </p>
          <ErrorBanner message={eventsError} />
          {loadingEvents ? (
            <p className={styles.hint}>Loading history…</p>
          ) : events.length === 0 ? (
            <p className={styles.hint}>No stage changes yet — they are still where they were added.</p>
          ) : (
            <ol className="space-y-2">
              {events.map((event, index) => (
                <li
                  key={`${event.created_at}-${index}`}
                  className={`${styles.panel} p-2.5 flex items-start gap-2 text-[10px] font-mono`}
                >
                  <span className="text-[#6E6359] shrink-0">{formatDate(event.created_at, { withTime: true })}</span>
                  <span className="flex items-center gap-1.5 text-[#262626] font-bold">
                    {event.from_stage || "—"}
                    <ArrowRight className="h-3 w-3 text-[#C85A32]" />
                    {event.to_stage}
                  </span>
                  <span className="text-[#6E6359] ml-auto shrink-0">{event.actor_name || "—"}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="flex items-center gap-2 pt-2 border-t border-[#DFD5C6]/60">
          <button type="button" className={styles.secondary} onClick={() => onOpenDossier(entry.candidate_id)}>
            View dossier
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ml-auto`}
            onClick={() => onRemove(entry)}
            aria-label="Remove from pipeline"
            title="Remove from pipeline"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------

function EntryCard({ entry, stages, onOpen, onMove }) {
  const advance = nextStage(stages, entry.stage);

  return (
    <div className={`${styles.card} p-3 space-y-2.5`}>
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className={`text-left w-full group rounded ${styles.focusRing}`}
      >
        <p className="text-xs font-bold text-[#262626] truncate group-hover:text-[#C85A32] transition-colors">
          {entry.candidate_name || "Candidate"}
        </p>
        <p className="text-[10px] font-mono text-[#6E6359] truncate mt-0.5">
          {entry.job_role_title || "No requisition"}
        </p>
      </button>

      {entry.notes && (
        <p className="text-[10px] font-mono text-[#6E6359] leading-relaxed line-clamp-2">
          <StickyNote className="h-3 w-3 inline mr-1 -mt-0.5" />
          {entry.notes}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-mono text-[#6E6359]/70">
          {formatRelative(entry.updated_at || entry.created_at)}
        </span>
        {advance && (
          <button
            type="button"
            onClick={() => onMove(entry, advance)}
            className={`flex items-center gap-1 text-[10px] font-mono font-bold text-[#C85A32] hover:text-[#B83A14] cursor-pointer rounded ${styles.focusRing}`}
            title={`Move to ${advance}`}
          >
            {advance}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------

export default function PipelineBoard({ jobs, pipeline, outreach, assessments, toast }) {
  const [jobFilter, setJobFilter] = useState("all");
  const [detail, setDetail] = useState(null);
  const [dossierId, setDossierId] = useState(null);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [removing, setRemoving] = useState(false);

  const stages = pipeline.stages?.length ? pipeline.stages : FALLBACK_PIPELINE_STAGES;

  const actions = useCandidateActions({
    jobs: jobs.items,
    pipeline,
    outreach,
    assessments,
    toast,
    onChanged: () => pipeline.reload(),
  });

  const entries = useMemo(() => {
    const items = pipeline.items || [];
    if (jobFilter === "all") return items;
    if (jobFilter === "none") return items.filter((row) => !Number(row.job_id));
    return items.filter((row) => String(row.job_id) === jobFilter);
  }, [pipeline.items, jobFilter]);

  const byStage = useMemo(() => {
    const grouped = new Map(stages.map((stage) => [stage, []]));
    for (const entry of entries) {
      // A stage the client doesn't know about still has to be visible somewhere.
      if (!grouped.has(entry.stage)) grouped.set(entry.stage, []);
      grouped.get(entry.stage).push(entry);
    }
    return grouped;
  }, [entries, stages]);

  const totals = useMemo(() => {
    const counts = { active: 0, hired: 0, rejected: 0 };
    for (const entry of entries) {
      if (entry.stage === "Hired") counts.hired += 1;
      else if (entry.stage === "Rejected") counts.rejected += 1;
      else counts.active += 1;
    }
    return counts;
  }, [entries]);

  const move = async (entry, stage) => {
    const result = await pipeline.move(entry.id, { stage });
    if (result.ok) toast.success(`${entry.candidate_name || "Candidate"} moved to ${stage}.`);
    else toast.error(result.message);
  };

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;
    setRemoving(true);
    const result = await pipeline.remove(pendingRemoval.id);
    setRemoving(false);
    setPendingRemoval(null);
    setDetail(null);
    if (result.ok) toast.success("Removed from the pipeline.");
    else toast.error(result.message);
  };

  const jobFilterOptions = [
    { value: "all", label: "All requisitions" },
    { value: "none", label: "No requisition" },
    ...(jobs.items || []).map((job) => ({ value: String(job.id), label: job.role_title })),
  ];

  return (
    <div className="space-y-6">
      <PanelHeader
        title="Hiring pipeline"
        description="Shared with everyone in your organization. Moving someone records who did it, so a handover never loses context."
      >
        <div className="w-52">
          <Field
            as="select"
            value={jobFilter}
            onChange={(event) => setJobFilter(event.target.value)}
            options={jobFilterOptions}
            aria-label="Filter pipeline by requisition"
          />
        </div>
      </PanelHeader>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="In progress" value={totals.active} sublabel="Sourced through Offer" />
        <StatTile label="Hired" value={totals.hired} tone="green" />
        <StatTile label="Rejected" value={totals.rejected} />
      </div>

      <ErrorBanner message={pipeline.error} onRetry={pipeline.reload} />

      {pipeline.loading && pipeline.items.length === 0 ? (
        <LoadingBlock label="Loading pipeline" />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Users}
          title={jobFilter === "all" ? "Nobody in the pipeline yet" : "Nothing for this requisition"}
          message={
            jobFilter === "all"
              ? "Add candidates from Talent Radar. They land in Sourced and move through Screening, Assessment, Interview and Offer as you go."
              : "Either pick another requisition, or add candidates to this one from Talent Radar."
          }
          action={
            jobFilter !== "all" ? (
              <button type="button" className={styles.secondary} onClick={() => setJobFilter("all")}>
                Show all requisitions
              </button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <div className="flex gap-3 min-w-max">
            {Array.from(byStage.entries()).map(([stage, rows]) => (
              <section key={stage} className="w-60 shrink-0 space-y-2.5" aria-label={`${stage} — ${rows.length}`}>
                <header className="flex items-center justify-between gap-2 px-1">
                  <Chip tone={STAGE_TONE[stage] || "neutral"}>{stage}</Chip>
                  <span className="text-[10px] font-mono font-bold text-[#6E6359]">{rows.length}</span>
                </header>

                <div className="space-y-2.5">
                  {rows.length === 0 ? (
                    <p className="text-[10px] font-mono text-[#6E6359]/60 border border-dashed border-[#DFD5C6] rounded-xl px-3 py-6 text-center">
                      Empty
                    </p>
                  ) : (
                    rows.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        stages={stages}
                        onOpen={setDetail}
                        onMove={move}
                      />
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {(jobs.items || []).length === 0 && entries.length > 0 && (
        <p className={styles.hint}>
          <Briefcase className="h-3 w-3 inline mr-1 -mt-0.5" />
          None of these are tied to a requisition yet. Post one to keep per-role counts.
        </p>
      )}

      <EntryDetail
        entry={detail}
        stages={stages}
        pipeline={pipeline}
        toast={toast}
        onClose={() => setDetail(null)}
        onOpenDossier={(candidateId) => {
          setDetail(null);
          setDossierId(candidateId);
        }}
        onRemove={setPendingRemoval}
      />

      <CandidateDossier
        candidateId={dossierId}
        onClose={() => setDossierId(null)}
        onRequestContact={(candidate) => {
          setDossierId(null);
          actions.requestContact(candidate);
        }}
        onAddToPipeline={(candidate) => {
          setDossierId(null);
          actions.addToPipeline(candidate);
        }}
        onSendAssessment={(candidate) => {
          setDossierId(null);
          actions.sendAssessment(candidate);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        title="Remove from pipeline?"
        message={`${
          pendingRemoval?.candidate_name || "This candidate"
        } is removed along with their notes and stage history. Assessments you already sent are not affected.`}
        confirmLabel="Remove"
        busy={removing}
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />

      {actions.dialogs}
    </div>
  );
}
