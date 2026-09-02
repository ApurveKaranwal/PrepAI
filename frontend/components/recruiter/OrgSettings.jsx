"use client";

/**
 * Organization settings: the tenancy boundary made visible.
 *
 * An organization is what every requisition, shortlist and assessment is scoped
 * to. Until one exists there is nothing for a recruiter to do, so this component
 * doubles as the onboarding screen — the portal renders it exclusively when
 * `GET /api/auth/me` reported no membership.
 *
 * Role affordances are shown honestly rather than hidden: a member sees the
 * company profile read-only and is told who can change it, instead of being
 * handed a form that 403s on save.
 */

import React, { useEffect, useState } from "react";
import {
  Building2,
  Check,
  Copy,
  Crown,
  Globe,
  Link2,
  Mail,
  Save,
  Shield,
  Trash2,
  UserPlus,
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
  formatDate,
  formatRelative,
  styles,
} from "./ui";

const FUNDING_STAGES = [
  "",
  "Bootstrapped",
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C+",
  "Public",
];

const TEAM_SIZES = ["", "1-10", "11-50", "51-200", "201-500", "500+"];
const EMPTY_PROFILE = {};

const ROLE_COPY = {
  owner: "Full control, including billing, roles and deleting the organization.",
  admin: "Can post requisitions, source candidates and edit the company profile.",
  member: "Can source candidates and move the pipeline, but not change company settings.",
};

/** Splits a comma-separated field into a clean array (no empty entries). */
function toList(value) {
  if (Array.isArray(value)) return value;
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// -----------------------------------------------------------------------------
// Onboarding: no organization yet
// -----------------------------------------------------------------------------

function CreateOrganization({ org, toast, onCreated }) {
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [description, setDescription] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setFieldError("Enter your company name — at least two characters.");
      return;
    }
    setFieldError("");
    setSaving(true);
    const result = await org.create({
      name: trimmed,
      website_url: websiteUrl.trim(),
      description: description.trim(),
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`${trimmed} is set up. You can start sourcing now.`);
    onCreated?.();
  };

  return (
    <div className="max-w-xl mx-auto py-6 space-y-6">
      <div className="text-center space-y-3">
        <span className="h-11 w-11 rounded-2xl bg-[#C85A32]/10 flex items-center justify-center mx-auto">
          <Building2 className="h-5 w-5 text-[#C85A32]" />
        </span>
        <h1 className="font-serif font-semibold text-2xl tracking-tight text-[#262626]">
          Create your hiring organization
        </h1>
        <p className="text-xs text-[#6E6359] leading-relaxed max-w-md mx-auto">
          Everything on the hiring side belongs to an organization: your requisitions, your candidate pipeline
          and your assessments. Teammates you invite share the same pipeline — nobody outside it can see your data.
        </p>
      </div>

      <ErrorBanner message={org.error} onRetry={org.reload} />

      <form onSubmit={submit} className={`${styles.card} p-6 space-y-5`}>
        <Field
          label="Company name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Northwind Systems"
          error={fieldError}
          autoComplete="organization"
        />
        <Field
          label="Website"
          type="url"
          value={websiteUrl}
          onChange={(event) => setWebsiteUrl(event.target.value)}
          placeholder="https://"
          hint="Shown to candidates in outreach and assessment invites."
          autoComplete="url"
        />
        <Field
          label="What you're building"
          as="textarea"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="One or two sentences a candidate would actually read."
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="submit" className={styles.primary} disabled={saving}>
            {saving && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
            Create organization
          </button>
        </div>
      </form>

      <p className={`${styles.hint} text-center`}>
        You become the owner. You can rename the organization or transfer nothing away later — ownership stays with you.
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Invite dialog
// -----------------------------------------------------------------------------

function InviteDialog({ open, onClose, org, toast }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [sending, setSending] = useState(false);
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setRole("member");
      setIssued(null);
      setCopied(false);
    }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    const result = await org.invite(email.trim(), role);
    setSending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setIssued(result.data);
    toast.success(`Invite sent to ${result.data?.email || email.trim()}.`);
  };

  const copyLink = async () => {
    const url = issued?.accept_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info("Copying is blocked in this browser — select the link and copy it manually.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={issued ? "Invite created" : "Invite a teammate"}
      subtitle={
        issued
          ? "They receive an email with this link. It works once and expires."
          : "They will share this organization's requisitions, pipeline and assessments."
      }
      icon={UserPlus}
      footer={
        issued ? (
          <>
            <button type="button" className={styles.secondary} onClick={() => setIssued(null)}>
              Invite someone else
            </button>
            <button type="button" className={styles.primary} onClick={onClose}>
              Done
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.secondary} onClick={onClose} disabled={sending}>
              Cancel
            </button>
            <button type="submit" form="invite-form" className={styles.primary} disabled={sending}>
              {sending && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
              Send invite
            </button>
          </>
        )
      }
    >
      {issued ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Chip tone="green" icon={Mail}>
              {issued.email}
            </Chip>
            <Chip tone="neutral">{issued.role}</Chip>
            <Chip tone="neutral">expires {formatRelative(issued.expires_at)}</Chip>
          </div>
          <div className="space-y-1.5">
            <p className={styles.label}>Invite link</p>
            <div className="flex items-stretch gap-2">
              <code className="grow px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-[10px] font-mono text-[#262626] break-all leading-relaxed">
                {issued.accept_url}
              </code>
              <button
                type="button"
                onClick={copyLink}
                className={`${styles.iconButton} shrink-0 self-start mt-1`}
                aria-label="Copy invite link"
                title="Copy invite link"
              >
                {copied ? <Check className="h-4 w-4 text-[#2E5A44]" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className={styles.hint}>
              Share this only with the person you invited — whoever opens it joins your organization.
            </p>
          </div>
        </div>
      ) : (
        <form id="invite-form" onSubmit={submit} className="space-y-5">
          <Field
            label="Work email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@yourcompany.com"
            hint="The invite only works for this address."
            autoComplete="email"
          />
          <Field
            label="Role"
            as="select"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            options={[
              { value: "member", label: "Member" },
              { value: "admin", label: "Admin" },
            ]}
            hint={ROLE_COPY[role]}
          />
        </form>
      )}
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Team
// -----------------------------------------------------------------------------

function TeamSection({ user, org, isAdmin, isOwner, toast }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [removing, setRemoving] = useState(false);

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;
    setRemoving(true);
    const result = await org.removeMember(pendingRemoval.user_id);
    setRemoving(false);
    setPendingRemoval(null);
    if (result.ok) toast.success(`${pendingRemoval.name || "That teammate"} no longer has access.`);
    else toast.error(result.message);
  };

  const changeRole = async (member, role) => {
    const result = await org.changeRole(member.user_id, role);
    if (result.ok) toast.success(`${member.name || member.email} is now ${role === "admin" ? "an admin" : "a member"}.`);
    else toast.error(result.message);
  };

  return (
    <section className={`${styles.card} p-6 space-y-5`}>
      <PanelHeader
        title="Team"
        description="Everyone here shares one pipeline. Roles decide who can change company settings and close requisitions."
      >
        {isAdmin && (
          <button type="button" className={styles.primary} onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            Invite teammate
          </button>
        )}
      </PanelHeader>

      <ul className="divide-y divide-[#DFD5C6]/60">
        {org.members.map((member) => {
          const isSelf = String(member.user_id) === String(user?.uid);
          return (
            <li key={member.user_id} className="py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="h-8 w-8 rounded-full bg-[#C85A32] text-white flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
                  {(member.name || member.email || "??").slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#262626] truncate">
                    {member.name || member.email || "Teammate"}
                    {isSelf && <span className="text-[#6E6359] font-normal font-mono text-[10px] ml-1.5">(you)</span>}
                  </p>
                  <p className="text-[10px] font-mono text-[#6E6359] truncate">
                    {member.email} · joined {formatDate(member.joined_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {member.role === "owner" ? (
                  <Chip tone="accent" icon={Crown}>
                    owner
                  </Chip>
                ) : isOwner ? (
                  <select
                    value={member.role}
                    onChange={(event) => changeRole(member, event.target.value)}
                    aria-label={`Role for ${member.name || member.email}`}
                    className={`${styles.input} w-auto py-1 cursor-pointer`}
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                ) : (
                  <Chip tone={member.role === "admin" ? "blue" : "neutral"} icon={member.role === "admin" ? Shield : undefined}>
                    {member.role}
                  </Chip>
                )}

                {isOwner && member.role !== "owner" && (
                  <button
                    type="button"
                    onClick={() => setPendingRemoval(member)}
                    className={styles.iconButton}
                    aria-label={`Remove ${member.name || member.email}`}
                    title="Remove from organization"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {org.invites.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[#DFD5C6]/60">
          <p className={styles.microLabel}>Pending invites</p>
          <ul className="space-y-1.5">
            {org.invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-3 bg-[#FAF6F0]/80 border border-[#DFD5C6] rounded-xl px-3 py-2"
              >
                <span className="text-xs font-mono text-[#262626] truncate">{invite.email}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <Chip tone="neutral">{invite.role}</Chip>
                  <span className="text-[10px] font-mono text-[#6E6359]">
                    expires {formatRelative(invite.expires_at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} org={org} toast={toast} />
      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        title="Remove this teammate?"
        message={`${
          pendingRemoval?.name || pendingRemoval?.email || "This person"
        } loses access to your requisitions, pipeline and assessments immediately. Anything they added stays.`}
        confirmLabel="Remove access"
        busy={removing}
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </section>
  );
}

// -----------------------------------------------------------------------------
// Company profile
// -----------------------------------------------------------------------------

function CompanyProfileSection({ organization, profile, isAdmin, toast }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  // Seed the form from the server once it arrives. Empty is empty — the old
  // portal pre-filled one person's real name, company and website as the
  // defaults every other founder saw.
  useEffect(() => {
    // useStartupProfile exposes the profile record directly. Accept the
    // wrapped shape too so this panel remains compatible with older callers.
    const data = profile?.profile || EMPTY_PROFILE;
    setForm({
      company_name: data.company_name || organization?.name || "",
      founder_name: data.founder_name || "",
      founder_role: data.founder_role || "",
      tagline: data.tagline || "",
      stage: data.stage || "",
      website_url: data.website_url || organization?.website_url || "",
      industry: data.industry || "",
      location: data.location || "",
      team_size: data.team_size || "",
      primary_tech_stack: toList(data.primary_tech_stack).join(", "),
      about: data.about || "",
      logo_url: data.logo_url || "",
    });
  }, [profile?.profile, organization?.name, organization?.website_url]);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const cancelEdit = () => {
    const data = profile?.profile || EMPTY_PROFILE;
    setForm({
      company_name: data.company_name || organization?.name || "",
      founder_name: data.founder_name || "",
      founder_role: data.founder_role || "",
      tagline: data.tagline || "",
      stage: data.stage || "",
      website_url: data.website_url || organization?.website_url || "",
      industry: data.industry || "",
      location: data.location || "",
      team_size: data.team_size || "",
      primary_tech_stack: toList(data.primary_tech_stack).join(", "),
      about: data.about || "",
      logo_url: data.logo_url || "",
    });
    setNameError("");
    setEditing(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.company_name.trim()) {
      setNameError("A company name is required — it appears on every candidate invite.");
      return;
    }
    setNameError("");
    setSaving(true);
    const result = await profile.save({
      ...form,
      company_name: form.company_name.trim(),
      primary_tech_stack: toList(form.primary_tech_stack),
    });
    setSaving(false);
    if (result.ok) {
      toast.success("Company profile saved.");
      setEditing(false);
    } else {
      toast.error(result.message);
    }
  };

  if (profile.loading && !form) return <LoadingBlock label="Loading company profile" />;

  if (profile.error && !form) {
    return (
      <section className={`${styles.card} p-6`}>
        <ErrorBanner message={profile.error} onRetry={profile.reload} />
      </section>
    );
  }

  if (!form) return null;

  const readOnly = !isAdmin;
  const techStackList = toList(form.primary_tech_stack);

  return (
    <section className={`${styles.card} p-6 space-y-5`}>
      <PanelHeader
        title="Company profile"
        description="Candidates see this in outreach messages and assessment invites. It is the only thing they know about you before they reply."
      >
        {isAdmin && !editing && (
          <button type="button" className={styles.secondary} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        {readOnly && <Chip tone="neutral">Admins can edit</Chip>}
      </PanelHeader>

      <ErrorBanner message={profile.error} onRetry={profile.reload} />

      {editing ? (
        <form onSubmit={submit} className="space-y-5">
          <fieldset disabled={readOnly} className="space-y-5 disabled:opacity-70">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Company name"
                required
                value={form.company_name}
                onChange={set("company_name")}
                placeholder="Your company"
                error={nameError}
              />
              <Field
                label="Website"
                type="url"
                value={form.website_url}
                onChange={set("website_url")}
                placeholder="https://"
              />
              <Field label="Your name" value={form.founder_name} onChange={set("founder_name")} placeholder="Who candidates hear from" />
              <Field label="Your title" value={form.founder_role} onChange={set("founder_role")} placeholder="e.g. Co-founder" />
              <Field
                label="Funding stage"
                as="select"
                value={form.stage}
                onChange={set("stage")}
                options={FUNDING_STAGES.map((stage) => ({ value: stage, label: stage || "Not specified" }))}
              />
              <Field
                label="Team size"
                as="select"
                value={form.team_size}
                onChange={set("team_size")}
                options={TEAM_SIZES.map((size) => ({ value: size, label: size || "Not specified" }))}
              />
              <Field label="Industry" value={form.industry} onChange={set("industry")} placeholder="e.g. Developer tools" />
              <Field label="Location" value={form.location} onChange={set("location")} placeholder="e.g. Remote (EU timezones)" />
            </div>

            <Field
              label="Tagline"
              value={form.tagline}
              onChange={set("tagline")}
              placeholder="One line on what you do"
              hint="Appears under your company name in candidate-facing emails."
            />
            <Field
              label="Core technologies"
              value={form.primary_tech_stack}
              onChange={set("primary_tech_stack")}
              placeholder="Python, React, Postgres"
              hint="Comma separated."
            />
            <Field
              label="About"
              as="textarea"
              rows={4}
              value={form.about}
              onChange={set("about")}
              placeholder="What the team is building and why someone good should care."
            />
            <Field label="Logo URL" type="url" value={form.logo_url} onChange={set("logo_url")} placeholder="https://" />
          </fieldset>

          {!readOnly && (
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className={styles.secondary}
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className={styles.primary} disabled={saving}>
                {saving ? (
                  <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                ) : (
                  <Save className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                )}
                Save profile
              </button>
            </div>
          )}
        </form>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className={styles.microLabel}>Company name</p>
            <p className="text-xs font-bold text-[#262626]">{form.company_name || "—"}</p>
          </div>
          <div className="space-y-1">
            <p className={styles.microLabel}>Website</p>
            {form.website_url ? (
              <a
                href={form.website_url.startsWith("http") ? form.website_url : `https://${form.website_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-xs font-mono text-[#C85A32] hover:text-[#B83A14] inline-flex items-center gap-1.5 rounded ${styles.focusRing}`}
              >
                <Globe className="h-3 w-3" />
                Visit
              </a>
            ) : (
              <p className="text-xs font-mono text-[#6E6359]">Not set</p>
            )}
          </div>
          <div className="space-y-1">
            <p className={styles.microLabel}>Contact / Sender</p>
            <p className="text-xs text-[#262626]">
              {form.founder_name || "—"}
              {form.founder_role && (
                <span className="text-[#6E6359] font-mono text-[10px] ml-1.5">({form.founder_role})</span>
              )}
            </p>
          </div>
          <div className="space-y-1">
            <p className={styles.microLabel}>Funding stage</p>
            <p className="text-xs font-mono text-[#262626]">{form.stage || "Not specified"}</p>
          </div>
          <div className="space-y-1">
            <p className={styles.microLabel}>Team size</p>
            <p className="text-xs font-mono text-[#262626]">{form.team_size ? `${form.team_size} members` : "Not specified"}</p>
          </div>
          <div className="space-y-1">
            <p className={styles.microLabel}>Industry & Location</p>
            <p className="text-xs text-[#262626]">
              {[form.industry, form.location].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          {form.tagline && (
            <div className="space-y-1 sm:col-span-3">
              <p className={styles.microLabel}>Tagline</p>
              <p className="text-xs font-serif italic text-[#262626]">"{form.tagline}"</p>
            </div>
          )}
          {techStackList.length > 0 && (
            <div className="space-y-1.5 sm:col-span-3">
              <p className={styles.microLabel}>Core technologies</p>
              <div className="flex flex-wrap gap-1.5">
                {techStackList.map((tech, idx) => (
                  <Chip key={idx} tone="neutral">
                    {tech}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {form.about && (
            <div className="space-y-1 sm:col-span-3">
              <p className={styles.microLabel}>About</p>
              <p className="text-xs text-[#6E6359] leading-relaxed whitespace-pre-line">{form.about}</p>
            </div>
          )}
          {form.logo_url && (
            <div className="space-y-1 sm:col-span-3">
              <p className={styles.microLabel}>Logo</p>
              <div className="flex items-center gap-3">
                <img
                  src={form.logo_url}
                  alt={form.company_name ? `${form.company_name} logo` : "Logo"}
                  className="h-8 max-w-[140px] object-contain rounded bg-white p-1 border border-[#DFD5C6]"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <a
                  href={form.logo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-[10px] font-mono text-[#C85A32] hover:text-[#B83A14] inline-flex items-center gap-1 underline ${styles.focusRing}`}
                >
                  <Globe className="h-3 w-3" />
                  View logo URL
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Organization identity
// -----------------------------------------------------------------------------

function OrganizationSection({ organization, org, isAdmin, toast }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(organization?.name || "");
  const [websiteUrl, setWebsiteUrl] = useState(organization?.website_url || "");
  const [description, setDescription] = useState(organization?.description || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(organization?.name || "");
    setWebsiteUrl(organization?.website_url || "");
    setDescription(organization?.description || "");
  }, [organization?.name, organization?.website_url, organization?.description]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const result = await org.update({
      name: name.trim(),
      website_url: websiteUrl.trim(),
      description: description.trim(),
    });
    setSaving(false);
    if (result.ok) {
      toast.success("Organization updated.");
      setEditing(false);
    } else {
      toast.error(result.message);
    }
  };

  return (
    <section className={`${styles.card} p-6 space-y-5`}>
      <PanelHeader title="Organization" description="The tenant every requisition, shortlist and assessment belongs to.">
        {isAdmin && !editing && (
          <button type="button" className={styles.secondary} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </PanelHeader>

      <ErrorBanner message={org.error} onRetry={org.reload} />

      {editing ? (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" required value={name} onChange={(event) => setName(event.target.value)} />
          <Field
            label="Website"
            type="url"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
            placeholder="https://"
          />
          <Field
            label="Description"
            as="textarea"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="flex items-center justify-end gap-2">
            <button type="button" className={styles.secondary} onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className={styles.primary} disabled={saving}>
              {saving && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className={styles.microLabel}>Name</p>
            <p className="text-xs font-bold text-[#262626]">{organization?.name || "—"}</p>
          </div>
          <div className="space-y-1">
            <p className={styles.microLabel}>Workspace id</p>
            <p className="text-xs font-mono text-[#6E6359] flex items-center gap-1.5">
              <Link2 className="h-3 w-3" />
              {organization?.slug || "—"}
            </p>
          </div>
          <div className="space-y-1">
            <p className={styles.microLabel}>Website</p>
            {organization?.website_url ? (
              <a
                href={organization.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-xs font-mono text-[#C85A32] hover:text-[#B83A14] inline-flex items-center gap-1.5 rounded ${styles.focusRing}`}
              >
                <Globe className="h-3 w-3" />
                Visit
              </a>
            ) : (
              <p className="text-xs font-mono text-[#6E6359]">Not set</p>
            )}
          </div>
          {organization?.description && (
            <div className="space-y-1 sm:col-span-3">
              <p className={styles.microLabel}>Description</p>
              <p className="text-xs text-[#6E6359] leading-relaxed">{organization.description}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------

export default function OrgSettings({ user, organization, org, profile, isAdmin, isOwner, toast, onCreated }) {
  if (org.loading && !organization) return <LoadingBlock label="Loading organization" />;

  if (!organization) {
    return <CreateOrganization org={org} toast={toast} onCreated={onCreated} />;
  }

  return (
    <div className="space-y-6">
      <OrganizationSection organization={organization} org={org} isAdmin={isAdmin} toast={toast} />
      <CompanyProfileSection organization={organization} profile={profile} isAdmin={isAdmin} toast={toast} />
      {org.members.length > 0 ? (
        <TeamSection user={user} org={org} isAdmin={isAdmin} isOwner={isOwner} toast={toast} />
      ) : (
        <section className={`${styles.card} p-6`}>
          <EmptyState
            icon={Users}
            title="No teammates yet"
            message="Invite the people who will screen and interview with you. They share this pipeline."
            action={
              isAdmin ? (
                <button type="button" className={styles.primary} onClick={org.reload}>
                  Reload team
                </button>
              ) : null
            }
          />
        </section>
      )}
    </div>
  );
}
