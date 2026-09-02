"use client";

/**
 * The three things a recruiter does to a candidate, in one place.
 *
 * Sourcing and the pipeline board both need "request contact", "add to pipeline"
 * and "send assessment". The old portal built each dialog twice with slightly
 * different copy and slightly different bugs, so they live here as a hook that
 * returns openers plus a single `dialogs` element the panel renders once.
 *
 * The consent order is enforced in the UI as well as the API: contact is
 * requested first, and assessments only unlock once the candidate has accepted.
 * The server returns 403 either way — this just means a recruiter finds out
 * before composing a message rather than after.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Award, Calendar, FileCode2, Mail, UserPlus } from "lucide-react";
import { Chip, ErrorBanner, Field, Modal, Spinner, styles } from "./ui";
import { FALLBACK_PIPELINE_STAGES } from "./useRecruiterData";

export const DIFFICULTIES = ["Easy", "Medium", "Hard"];

/** Backend bounds: `time_limit_minutes` must be between 15 and 240. */
const MIN_TIME_LIMIT = 15;
const MAX_TIME_LIMIT = 240;
const DEFAULT_TIME_LIMIT = 60;

/** Turns the requisition list into `<select>` options, "no requisition" first. */
function jobOptions(jobs, { noneLabel = "Not tied to a requisition" } = {}) {
  return [
    { value: "0", label: noneLabel },
    ...(jobs || []).map((job) => ({
      value: String(job.id),
      label: `${job.role_title}${job.company_name ? ` · ${job.company_name}` : ""}`,
    })),
  ];
}

// -----------------------------------------------------------------------------

function OutreachDialog({ open, candidate, jobs, outreach, toast, onDone, onClose }) {
  const [jobId, setJobId] = useState("0");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setJobId(String(candidate?.job_id || candidate?.jobId || "0"));
      setMessage("");
      setSending(false);
    }
  }, [open, candidate]);

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    const result = await outreach.send({ candidateId: candidate.id, jobId: Number(jobId), message: message.trim() });
    setSending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`Request sent. ${candidate.display_name} will see it in their inbox on PrepFlow.`);
    onDone?.({ outreach_status: "pending" });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={sending ? undefined : onClose}
      dismissible={!sending}
      title="Request contact details"
      subtitle="They decide whether you get their name, email and résumé."
      icon={Mail}
      footer={
        <>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="submit" form="outreach-form" className={styles.primary} disabled={sending}>
            {sending && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
            Send request
          </button>
        </>
      }
    >
      <form id="outreach-form" onSubmit={submit} className="space-y-5">
        <div className={`${styles.panel} p-3 space-y-2`}>
          <p className={styles.microLabel}>Candidate</p>
          <p className="text-xs font-bold text-[#262626]">{candidate.display_name}</p>
          <p className={styles.hint}>
            Until they accept you see their scores, verified platform stats and skills — never their name, email,
            résumé or profile links.
          </p>
        </div>

        <Field
          label="Which role is this for?"
          as="select"
          value={jobId}
          onChange={(event) => setJobId(event.target.value)}
          options={jobOptions(jobs)}
          hint="Shown to the candidate so they know what they are being contacted about."
        />

        <Field
          label="Message"
          as="textarea"
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Why you're reaching out, and what the role actually involves."
          hint="Specific beats generic. This is the whole basis for their decision."
        />
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------

function ShortlistDialog({ open, candidate, jobs, pipeline, toast, onDone, onClose }) {
  const [jobId, setJobId] = useState("0");
  const [stage, setStage] = useState("Sourced");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const stages = pipeline.stages?.length ? pipeline.stages : FALLBACK_PIPELINE_STAGES;

  useEffect(() => {
    if (open) {
      setJobId(String(candidate?.job_id || candidate?.jobId || "0"));
      setStage(stages[0] || "Sourced");
      setNotes("");
      setSaving(false);
    }
    // `stages` is stable between opens; re-seeding on every change would fight typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidate]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const result = await pipeline.add({
      candidateId: candidate.id,
      jobId: Number(jobId),
      stage,
      notes: notes.trim(),
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`${candidate.display_name} is in your pipeline at ${stage}.`);
    onDone?.({ in_pipeline: true, stage });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      title="Add to pipeline"
      subtitle="Visible to everyone in your organization."
      icon={UserPlus}
      footer={
        <>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="shortlist-form" className={styles.primary} disabled={saving}>
            {saving && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
            Add candidate
          </button>
        </>
      }
    >
      <form id="shortlist-form" onSubmit={submit} className="space-y-5">
        <div className={`${styles.panel} p-3`}>
          <p className={styles.microLabel}>Candidate</p>
          <p className="text-xs font-bold text-[#262626] mt-1">{candidate.display_name}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Requisition"
            as="select"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            options={jobOptions(jobs)}
          />
          <Field
            label="Starting stage"
            as="select"
            value={stage}
            onChange={(event) => setStage(event.target.value)}
            options={stages}
          />
        </div>

        <Field
          label="Notes"
          as="textarea"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="What stood out, or what to check next."
        />
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------

function AssessmentDialog({ open, candidate, jobs, assessments, pipeline, toast, onDone, onClose }) {
  const [jobId, setJobId] = useState("0");
  const [problemSlug, setProblemSlug] = useState("");
  const [difficulty, setDifficulty] = useState("Medium");
  const [timeLimit, setTimeLimit] = useState(String(DEFAULT_TIME_LIMIT));
  const [timeError, setTimeError] = useState("");
  const [sending, setSending] = useState(false);

  const problems = useMemo(() => assessments.problems || [], [assessments.problems]);

  useEffect(() => {
    if (!open) return;
    setJobId(String(candidate?.job_id || candidate?.jobId || "0"));
    setProblemSlug(problems[0]?.slug || "");
    setDifficulty("Medium");
    setTimeLimit(String(DEFAULT_TIME_LIMIT));
    setTimeError("");
    setSending(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidate]);

  // Keep the problem selection valid if the catalog arrives after the dialog opens.
  useEffect(() => {
    if (open && !problemSlug && problems.length) setProblemSlug(problems[0].slug);
  }, [open, problemSlug, problems]);

  const selectedJob = useMemo(
    () => (jobs || []).find((job) => String(job.id) === jobId) || null,
    [jobs, jobId]
  );

  const submit = async (event) => {
    event.preventDefault();
    const minutes = Number(timeLimit);
    if (!Number.isFinite(minutes) || minutes < MIN_TIME_LIMIT || minutes > MAX_TIME_LIMIT) {
      setTimeError(`Pick something between ${MIN_TIME_LIMIT} and ${MAX_TIME_LIMIT} minutes.`);
      return;
    }
    setTimeError("");
    setSending(true);
    const result = await assessments.send({
      candidateId: candidate.id,
      jobId: Number(jobId),
      roleTitle: selectedJob?.role_title || "",
      problemSlug,
      difficulty,
      timeLimitMinutes: minutes,
    });
    setSending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`Assessment emailed to ${candidate.display_name}. They have ${minutes} minutes once they start.`);
    // The server also moves them to the Assessment stage, so the board has to refetch.
    pipeline.reload?.();
    onDone?.({ in_pipeline: true, stage: "Assessment", assessment: result.data || null });
    onClose();
  };

  const catalogMissing = problems.length === 0;

  return (
    <Modal
      open={open}
      onClose={sending ? undefined : onClose}
      dismissible={!sending}
      title="Send take-home assessment"
      subtitle="Emailed straight to the candidate with a private, expiring link."
      icon={FileCode2}
      width="max-w-xl"
      footer={
        <>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button
            type="submit"
            form="assessment-form"
            className={styles.primary}
            disabled={sending || catalogMissing || !problemSlug}
          >
            {sending && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
            Send assessment
          </button>
        </>
      }
    >
      <form id="assessment-form" onSubmit={submit} className="space-y-5">
        <div className={`${styles.panel} p-3 flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            <p className={styles.microLabel}>Candidate</p>
            <p className="text-xs font-bold text-[#262626] mt-1 truncate">{candidate.display_name}</p>
          </div>
          <Chip tone="green">contact unlocked</Chip>
        </div>

        {catalogMissing && (
          <ErrorBanner
            message="The problem catalog did not load, so there is nothing to send yet."
            onRetry={assessments.reload}
          />
        )}

        <Field
          label="Problem"
          as="select"
          required
          value={problemSlug}
          onChange={(event) => setProblemSlug(event.target.value)}
          options={problems.map((problem) => ({ value: problem.slug, label: problem.title }))}
          disabled={catalogMissing}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field
            label="Requisition"
            as="select"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            options={jobOptions(jobs)}
            className="sm:col-span-2"
          />
          <Field
            label="Difficulty"
            as="select"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
            options={DIFFICULTIES}
          />
        </div>

        <Field
          label="Time limit (minutes)"
          type="number"
          min={MIN_TIME_LIMIT}
          max={MAX_TIME_LIMIT}
          step={5}
          value={timeLimit}
          onChange={(event) => setTimeLimit(event.target.value)}
          error={timeError}
          hint={`Counts down from the moment they open the link. ${MIN_TIME_LIMIT}–${MAX_TIME_LIMIT} minutes.`}
        />

        <p className={styles.hint}>
          The link is private to this candidate and expires. You will never see it — only whether they started,
          submitted, or let it lapse.
        </p>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------

function ScheduleInterviewDialog({ open, candidate, jobs, pipeline, toast, onDone, onClose }) {
  const [jobId, setJobId] = useState("0");
  const [roundName, setRoundName] = useState("Technical Round");
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setJobId(String(candidate?.job_id || candidate?.jobId || "0"));
    setRoundName("Technical Round");
    setInterviewDate("");
    setInterviewTime("");
    setMeetingUrl("");
    setInterviewer("");
    setNotes("");
    setSaving(false);
  }, [open, candidate]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const dateStr = [interviewDate, interviewTime].filter(Boolean).join(" ");
    const scheduleSummary = [
      `Interview: ${roundName}`,
      dateStr ? `Scheduled: ${dateStr}` : null,
      interviewer ? `Interviewer: ${interviewer}` : null,
      meetingUrl ? `Link: ${meetingUrl}` : null,
      notes ? `Notes: ${notes}` : null,
    ].filter(Boolean).join(" | ");

    const entryId = candidate?.entry_id || candidate?.shortlist_id || candidate?.pipeline_id || candidate?.id;
    if (entryId && pipeline?.move) {
      await pipeline.move(entryId, {
        stage: "Interview",
        notes: scheduleSummary,
        job_id: Number(jobId) || undefined,
      });
    }
    setSaving(false);
    toast.success(`Interview scheduled with ${candidate.display_name} (${roundName}).`);
    pipeline?.reload?.();
    onDone?.({ stage: "Interview", notes: scheduleSummary });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      title="Schedule interview"
      subtitle="Arrange an interview session and record meeting details."
      icon={Calendar}
      width="max-w-xl"
      footer={
        <>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="interview-form" className={styles.primary} disabled={saving}>
            {saving && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
            Schedule interview
          </button>
        </>
      }
    >
      <form id="interview-form" onSubmit={submit} className="space-y-5">
        <div className={`${styles.panel} p-3 flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            <p className={styles.microLabel}>Candidate</p>
            <p className="text-xs font-bold text-[#262626] mt-1 truncate">{candidate.display_name}</p>
          </div>
          <Chip tone="blue">Interview stage</Chip>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Requisition"
            as="select"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            options={jobOptions(jobs)}
          />
          <Field
            label="Interview Round"
            value={roundName}
            onChange={(event) => setRoundName(event.target.value)}
            placeholder="e.g. System Design, Technical Deep Dive"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Date"
            type="date"
            value={interviewDate}
            onChange={(event) => setInterviewDate(event.target.value)}
          />
          <Field
            label="Time"
            type="time"
            value={interviewTime}
            onChange={(event) => setInterviewTime(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Interviewer Name / Host"
            value={interviewer}
            onChange={(event) => setInterviewer(event.target.value)}
            placeholder="e.g. Lead Engineer, Hiring Manager"
          />
          <Field
            label="Meeting Link"
            type="url"
            value={meetingUrl}
            onChange={(event) => setMeetingUrl(event.target.value)}
            placeholder="https://meet.google.com/..."
          />
        </div>

        <Field
          label="Notes / Instructions"
          as="textarea"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Topics to evaluate, links to questions, or instructions for the candidate."
        />
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------

function ExtendOfferDialog({ open, candidate, jobs, pipeline, toast, onDone, onClose }) {
  const [jobId, setJobId] = useState("0");
  const [salary, setSalary] = useState("");
  const [equity, setEquity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setJobId(String(candidate?.job_id || candidate?.jobId || "0"));
    setSalary("");
    setEquity("");
    setStartDate("");
    setExpiryDate("");
    setNotes("");
    setSaving(false);
  }, [open, candidate]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const offerSummary = [
      `Offer Extended`,
      salary ? `Compensation: ${salary}` : null,
      equity ? `Equity/Bonus: ${equity}` : null,
      startDate ? `Start: ${startDate}` : null,
      expiryDate ? `Expires: ${expiryDate}` : null,
      notes ? `Notes: ${notes}` : null,
    ].filter(Boolean).join(" | ");

    const entryId = candidate?.entry_id || candidate?.shortlist_id || candidate?.pipeline_id || candidate?.id;
    if (entryId && pipeline?.move) {
      await pipeline.move(entryId, {
        stage: "Offer",
        notes: offerSummary,
        job_id: Number(jobId) || undefined,
      });
    }
    setSaving(false);
    toast.success(`Offer details recorded for ${candidate.display_name}.`);
    pipeline?.reload?.();
    onDone?.({ stage: "Offer", notes: offerSummary });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      title="Extend job offer"
      subtitle="Record compensation details and offer terms."
      icon={Award}
      width="max-w-xl"
      footer={
        <>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="offer-form" className={styles.primary} disabled={saving}>
            {saving && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
            Record offer
          </button>
        </>
      }
    >
      <form id="offer-form" onSubmit={submit} className="space-y-5">
        <div className={`${styles.panel} p-3 flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            <p className={styles.microLabel}>Candidate</p>
            <p className="text-xs font-bold text-[#262626] mt-1 truncate">{candidate.display_name}</p>
          </div>
          <Chip tone="green">Offer stage</Chip>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Requisition"
            as="select"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            options={jobOptions(jobs)}
          />
          <Field
            label="Compensation / Base Salary"
            value={salary}
            onChange={(event) => setSalary(event.target.value)}
            placeholder="e.g. $130,000 / year or ₹24 LPA"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Equity / Bonus (optional)"
            value={equity}
            onChange={(event) => setEquity(event.target.value)}
            placeholder="e.g. 0.2% equity, $10k sign-on"
          />
          <Field
            label="Target Start Date"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>

        <Field
          label="Offer Expiration Date"
          type="date"
          value={expiryDate}
          onChange={(event) => setExpiryDate(event.target.value)}
        />

        <Field
          label="Notes / Terms summary"
          as="textarea"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Additional benefits, relocation, or key agreement terms."
        />
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------

/**
 * @param onChanged  called with `(candidateId, partial)` after a successful
 *                   action, so a list can patch one row instead of refetching.
 */
export function useCandidateActions({ jobs, pipeline, outreach, assessments, toast, onChanged }) {
  const [active, setActive] = useState(null); // { kind, candidate }

  const close = () => setActive(null);
  const done = (partial) => {
    if (active?.candidate?.id != null) onChanged?.(active.candidate.id, partial);
  };

  const openers = useMemo(
    () => ({
      requestContact: (candidate) => setActive({ kind: "outreach", candidate }),
      addToPipeline: (candidate) => setActive({ kind: "shortlist", candidate }),
      sendAssessment: (candidate) => setActive({ kind: "assessment", candidate }),
      scheduleInterview: (candidate) => setActive({ kind: "interview", candidate }),
      extendOffer: (candidate) => setActive({ kind: "offer", candidate }),
    }),
    []
  );

  const candidate = active?.candidate || { id: null, display_name: "This candidate" };

  const dialogs = (
    <>
      <OutreachDialog
        open={active?.kind === "outreach"}
        candidate={candidate}
        jobs={jobs}
        outreach={outreach}
        toast={toast}
        onDone={done}
        onClose={close}
      />
      <ShortlistDialog
        open={active?.kind === "shortlist"}
        candidate={candidate}
        jobs={jobs}
        pipeline={pipeline}
        toast={toast}
        onDone={done}
        onClose={close}
      />
      <AssessmentDialog
        open={active?.kind === "assessment"}
        candidate={candidate}
        jobs={jobs}
        assessments={assessments}
        pipeline={pipeline}
        toast={toast}
        onDone={done}
        onClose={close}
      />
      <ScheduleInterviewDialog
        open={active?.kind === "interview"}
        candidate={candidate}
        jobs={jobs}
        pipeline={pipeline}
        toast={toast}
        onDone={done}
        onClose={close}
      />
      <ExtendOfferDialog
        open={active?.kind === "offer"}
        candidate={candidate}
        jobs={jobs}
        pipeline={pipeline}
        toast={toast}
        onDone={done}
        onClose={close}
      />
    </>
  );

  return { ...openers, dialogs };
}
