"use client";

/**
 * Requisitions — the roles you are hiring for.
 *
 * Previously this was create-and-forget: no edit, no close, no delete, and the
 * header claimed "Engineering Requisitions (3)" on an account with none because
 * the count was written `{jobs.length || 3}`. Counts here are the real ones from
 * the database, including zero, and every requisition can be edited, paused or
 * deleted.
 *
 * The form seeds `company_name` from your own organization — the old defaults
 * hardcoded one specific company, website and role title, which every other
 * founder then saw as their starting point.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  ClipboardList,
  FileCode2,
  MapPin,
  Pencil,
  Play,
  Plus,
  Trash2,
  Users,
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
  formatDate,
  styles,
} from "./ui";
import { EXPERIENCE_LEVELS, JOB_STATUSES, WORK_MODES } from "./useRecruiterData";

const STATUS_TONE = { Active: "green", Paused: "blue", Closed: "neutral" };

function emptyJob(companyName) {
  return {
    company_name: companyName || "",
    role_title: "",
    work_mode: "Remote",
    location: "",
    salary_range: "",
    min_devscore: 0,
    required_skills: "",
    experience_level: "Mid-Level",
    description: "",
    status: "Active",
  };
}

function toSkillList(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

// -----------------------------------------------------------------------------

function RequisitionForm({ open, job, companyName, onClose, onSubmit }) {
  const [form, setForm] = useState(() => emptyJob(companyName));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSaving(false);
    setForm(
      job
        ? {
            company_name: job.company_name || companyName || "",
            role_title: job.role_title || "",
            work_mode: job.work_mode || "Remote",
            location: job.location || "",
            salary_range: job.salary_range || "",
            min_devscore: Number(job.min_devscore) || 0,
            required_skills: toSkillList(job.required_skills).join(", "),
            experience_level: job.experience_level || "Mid-Level",
            description: job.description || "",
            status: job.status || "Active",
          }
        : emptyJob(companyName)
    );
  }, [open, job, companyName]);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.company_name.trim()) nextErrors.company_name = "Required.";
    if (!form.role_title.trim()) nextErrors.role_title = "Required — candidates see this first.";
    const floor = Number(form.min_devscore);
    if (!Number.isFinite(floor) || floor < 0 || floor > 1000) {
      nextErrors.min_devscore = "A DevScore floor is between 0 and 1000.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    const okResult = await onSubmit({
      ...form,
      company_name: form.company_name.trim(),
      role_title: form.role_title.trim(),
      min_devscore: floor,
      required_skills: toSkillList(form.required_skills),
    });
    setSaving(false);
    if (okResult) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      title={job ? "Edit requisition" : "Post a requisition"}
      subtitle="Used to tag shortlists and assessments, and shown to candidates you contact."
      icon={Briefcase}
      width="max-w-2xl"
      footer={
        <>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="requisition-form" className={styles.primary} disabled={saving}>
            {saving && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
            {job ? "Save changes" : "Post requisition"}
          </button>
        </>
      }
    >
      <form id="requisition-form" onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Role title"
            required
            value={form.role_title}
            onChange={set("role_title")}
            placeholder="e.g. Backend Engineer"
            error={errors.role_title}
          />
          <Field
            label="Company name"
            required
            value={form.company_name}
            onChange={set("company_name")}
            error={errors.company_name}
          />
          <Field
            label="Work mode"
            as="select"
            value={form.work_mode}
            onChange={set("work_mode")}
            options={WORK_MODES}
          />
          <Field
            label="Location"
            value={form.location}
            onChange={set("location")}
            placeholder="e.g. Bengaluru, or Remote (IST overlap)"
          />
          <Field
            label="Compensation range"
            value={form.salary_range}
            onChange={set("salary_range")}
            placeholder="e.g. ₹28–40 LPA"
            hint="Optional, but candidates respond to requests that state it."
          />
          <Field
            label="Experience level"
            as="select"
            value={form.experience_level}
            onChange={set("experience_level")}
            options={EXPERIENCE_LEVELS}
          />
          <Field
            label="Minimum DevScore"
            type="number"
            min={0}
            max={1000}
            step={25}
            value={form.min_devscore}
            onChange={set("min_devscore")}
            error={errors.min_devscore}
            hint="0 means no floor. This is a note to your team, not a search filter."
          />
          <Field label="Status" as="select" value={form.status} onChange={set("status")} options={JOB_STATUSES} />
        </div>

        <Field
          label="Required skills"
          value={form.required_skills}
          onChange={set("required_skills")}
          placeholder="Go, Postgres, Kafka"
          hint="Comma separated."
        />

        <Field
          label="Description"
          as="textarea"
          rows={5}
          value={form.description}
          onChange={set("description")}
          placeholder="What the person will actually own in the first six months."
        />
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------

function RequisitionCard({ job, isAdmin, onEdit, onToggleStatus, onDelete }) {
  const skills = toSkillList(job.required_skills);
  const paused = job.status !== "Active";

  return (
    <article className={`${styles.card} p-5 space-y-4`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif font-semibold text-base tracking-tight text-[#262626]">{job.role_title}</h3>
          <p className="text-[11px] font-mono text-[#6E6359] mt-0.5 truncate">
            {job.company_name}
            {job.experience_level ? ` · ${job.experience_level}` : ""}
          </p>
        </div>
        <Chip tone={STATUS_TONE[job.status] || "neutral"}>{job.status}</Chip>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-mono text-[#6E6359]">
        <span className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3" />
          {[job.work_mode, job.location].filter(Boolean).join(" · ") || "Location not specified"}
        </span>
        {job.salary_range && <span className="text-[#262626]">{job.salary_range}</span>}
        {Number(job.min_devscore) > 0 && <span>DevScore floor {job.min_devscore}</span>}
      </div>

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.slice(0, 8).map((skill) => (
            <Chip key={skill} tone="neutral">
              {skill}
            </Chip>
          ))}
        </div>
      )}

      {job.description && (
        <p className="text-xs text-[#6E6359] leading-relaxed line-clamp-3">{job.description}</p>
      )}

      <div className="flex items-center gap-4 pt-3 border-t border-[#DFD5C6]/60 text-[10px] font-mono text-[#6E6359]">
        <span className="flex items-center gap-1.5">
          <Users className="h-3 w-3" />
          {Number(job.shortlist_count) || 0} in pipeline
        </span>
        <span className="flex items-center gap-1.5">
          <FileCode2 className="h-3 w-3" />
          {Number(job.assessment_count) || 0} assessed
        </span>
        <span className="ml-auto">{formatDate(job.created_at)}</span>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onEdit(job)} className={`${styles.secondary} grow`}>
          <Pencil className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => onToggleStatus(job)}
          className={styles.iconButton}
          aria-label={paused ? `Reopen ${job.role_title}` : `Pause ${job.role_title}`}
          title={paused ? "Reopen this requisition" : "Pause this requisition"}
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />}
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => onDelete(job)}
            className={styles.iconButton}
            aria-label={`Delete ${job.role_title}`}
            title="Delete this requisition"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}

// -----------------------------------------------------------------------------

export default function RequisitionsPanel({ organization, profile, jobs, isAdmin, toast }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const companyName = profile?.profile?.company_name || organization?.name || "";

  const totals = useMemo(() => {
    const items = jobs.items || [];
    return {
      total: items.length,
      active: items.filter((job) => job.status === "Active").length,
      shortlisted: items.reduce((sum, job) => sum + (Number(job.shortlist_count) || 0), 0),
      assessed: items.reduce((sum, job) => sum + (Number(job.assessment_count) || 0), 0),
    };
  }, [jobs.items]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (job) => {
    setEditing(job);
    setFormOpen(true);
  };

  const submitForm = async (fields) => {
    const result = editing ? await jobs.update(editing.id, fields) : await jobs.create(fields);
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    toast.success(editing ? "Requisition updated." : `${fields.role_title} is live.`);
    return true;
  };

  const toggleStatus = async (job) => {
    const nextStatus = job.status === "Active" ? "Paused" : "Active";
    const result = await jobs.update(job.id, { status: nextStatus });
    if (result.ok) toast.success(`${job.role_title} is now ${nextStatus.toLowerCase()}.`);
    else toast.error(result.message);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await jobs.remove(pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
    if (result.ok) toast.success("Requisition deleted.");
    else toast.error(result.message);
  };

  return (
    <div className="space-y-6">
      <PanelHeader
        title="Requisitions"
        description="The roles you are hiring for. Shortlists and assessments are tagged to these, so your pipeline counts stay attributable."
      >
        <button type="button" className={styles.primary} onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          Post requisition
        </button>
      </PanelHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Requisitions" value={totals.total} />
        <StatTile label="Active" value={totals.active} tone="green" />
        <StatTile label="In pipeline" value={totals.shortlisted} sublabel="Across all roles" />
        <StatTile label="Assessments sent" value={totals.assessed} tone="accent" />
      </div>

      <ErrorBanner message={jobs.error} onRetry={jobs.reload} />

      {jobs.loading && jobs.items.length === 0 ? (
        <LoadingBlock label="Loading requisitions" />
      ) : jobs.items.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No requisitions yet"
          message="Post the first role you are hiring for. You can source and assess without one, but tagging keeps your pipeline attributable to a role."
          action={
            <button type="button" className={styles.primary} onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              Post requisition
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {jobs.items.map((job) => (
            <RequisitionCard
              key={job.id}
              job={job}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onToggleStatus={toggleStatus}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      <RequisitionForm
        open={formOpen}
        job={editing}
        companyName={companyName}
        onClose={() => setFormOpen(false)}
        onSubmit={submitForm}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this requisition?"
        message={`"${
          pendingDelete?.role_title || "This requisition"
        }" disappears from your team's list. Candidates already in your pipeline stay, but they lose their link to this role.`}
        confirmLabel="Delete requisition"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
