"use client";

/**
 * The candidate dossier.
 *
 * Two things make this different from the panel it replaces. First, it fetches
 * `GET /api/recruiter/candidates/{id}` on open, so it works from anywhere — the
 * old "Dossier" button silently did nothing whenever the candidate wasn't in the
 * currently-loaded search page. Second, every number here is either real or
 * absent: an unconnected platform says "not connected" instead of showing an
 * invented repo count, and the DevScore breakdown is the same one the candidate
 * sees on their own profile.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Award,
  BadgeCheck,
  Briefcase,
  Clock,
  ExternalLink,
  FileCode2,
  FileText,
  Lock,
  Mail,
  MapPin,
  Mic,
  Send,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { apiGet, errorMessage } from "@/lib/api";
import { Chip, ErrorBanner, LoadingBlock, Modal, StatTile, formatDate, styles } from "./ui";

const GithubIcon = ({ className = "h-4 w-4", ...props }) => (
  <svg className={className} viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

/** Fallback maxima, so an older stored breakdown still renders a sane bar. */
const BREAKDOWN_ROWS = [
  { key: "leetcode", label: "LeetCode", max: 350 },
  { key: "codeforces", label: "Codeforces", max: 250 },
  { key: "github", label: "GitHub", max: 200 },
  { key: "prepai", label: "PrepFlow interviews", max: 200 },
];

function tierTone(devscore) {
  if (devscore >= 900) return "accent";
  if (devscore >= 750) return "green";
  if (devscore >= 600) return "blue";
  return "neutral";
}

function BreakdownBars({ breakdown, devscore, source }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className={styles.microLabel}>DevScore</p>
          <p className={`${styles.metric} mt-1`}>{devscore}</p>
        </div>
        <p className={`${styles.hint} text-right max-w-[16rem]`}>
          {source === "computed"
            ? "Computed live from their connected platforms."
            : "Taken from their profile — the same figure the candidate sees."}
        </p>
      </div>

      <div className="space-y-2.5">
        {BREAKDOWN_ROWS.map((row) => {
          const points = Number(breakdown?.[`${row.key}_points`]) || 0;
          const max = Number(breakdown?.[`${row.key}_max`]) || row.max;
          const pct = max > 0 ? Math.min(100, Math.round((points / max) * 100)) : 0;
          return (
            <div key={row.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-[#6E6359]">{row.label}</span>
                <span className="text-[10px] font-mono font-bold text-[#262626]">
                  {points} <span className="text-[#6E6359]/70">/ {max}</span>
                </span>
              </div>
              <div className="h-1.5 bg-[#DFD5C6]/50 rounded-full overflow-hidden">
                <div className="h-full bg-[#C85A32] rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PlatformCard({ icon: Icon, title, connected, handle, rows }) {
  return (
    <div className={`${styles.panel} p-3 space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${connected ? "text-[#262626]" : "text-[#6E6359]/50"}`} />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#262626] truncate">
            {title}
          </span>
        </span>
        {connected && handle ? (
          <span className="text-[10px] font-mono text-[#6E6359] truncate max-w-[8rem]">{handle}</span>
        ) : null}
      </div>

      {connected ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-2">
              <dt className="text-[10px] font-mono text-[#6E6359] truncate">{label}</dt>
              <dd className="text-[11px] font-mono font-bold text-[#262626]">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-[10px] font-mono text-[#6E6359]/70">Not connected</p>
      )}
    </div>
  );
}

function VerifiedPlatforms({ stats }) {
  const leetcode = stats?.leetcode || {};
  const codeforces = stats?.codeforces || {};
  const github = stats?.github || {};
  const prepai = stats?.prepai || {};

  return (
    <section className="space-y-2">
      <p className={styles.microLabel}>Verified platforms</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <PlatformCard
          icon={Trophy}
          title="LeetCode"
          connected={Boolean(leetcode.connected)}
          handle={leetcode.handle}
          rows={[
            ["Solved", leetcode.total_solved ?? 0],
            ["Hard", leetcode.hard_solved ?? 0],
            ["Medium", leetcode.medium_solved ?? 0],
            ["Contest", leetcode.contest_rating ?? 0],
          ]}
        />
        <PlatformCard
          icon={Award}
          title="Codeforces"
          connected={Boolean(codeforces.connected)}
          handle={codeforces.handle}
          rows={[
            ["Rating", codeforces.rating ?? 0],
            ["Peak", codeforces.max_rating ?? 0],
            ["Rank", codeforces.rank || "—"],
            ["Solved", codeforces.solved_count ?? 0],
          ]}
        />
        <PlatformCard
          icon={GithubIcon}
          title="GitHub"
          connected={Boolean(github.connected)}
          handle={github.username}
          rows={[
            ["Repos", github.public_repos ?? 0],
            ["Stars", github.stars_total ?? 0],
            ["Strength", github.github_strength ?? 0],
            ["Open source", github.open_source_score ?? 0],
          ]}
        />
        <PlatformCard
          icon={Mic}
          title="PrepFlow interviews"
          connected={Boolean(prepai.connected)}
          handle={prepai.sessions_count ? `${prepai.sessions_count} sessions` : ""}
          rows={[
            ["Voice", prepai.voice_rating ?? 0],
            ["Technical", prepai.technical_depth ?? 0],
            ["Communication", prepai.communication ?? 0],
          ]}
        />
      </div>
      {Array.isArray(github.primary_languages) && github.primary_languages.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {github.primary_languages.slice(0, 8).map((language) => (
            <Chip key={String(language)} tone="neutral">
              {String(language)}
            </Chip>
          ))}
        </div>
      )}
    </section>
  );
}

function ContactSection({ candidate, onRequestContact }) {
  const status = candidate.outreach_status;

  if (!candidate.contact_unlocked) {
    return (
      <section className={`${styles.panel} p-4 space-y-3`}>
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-[#6E6359]" />
          <p className="text-xs font-bold text-[#262626]">Contact details locked</p>
        </div>
        <p className={styles.hint}>
          This candidate chose to be discoverable, not contactable. Their name, email, résumé and profile links
          unlock only after they accept a request from your organization.
        </p>
        {status === "pending" ? (
          <Chip tone="blue" icon={Clock}>
            request pending
          </Chip>
        ) : status === "declined" ? (
          <div className="space-y-2">
            <Chip tone="danger">request declined</Chip>
            <p className={styles.hint}>They passed on this one. You can send a new request for a different role.</p>
            <button type="button" className={styles.secondary} onClick={onRequestContact}>
              <Mail className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              Request again
            </button>
          </div>
        ) : (
          <button type="button" className={styles.primary} onClick={onRequestContact}>
            <Send className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            Request contact
          </button>
        )}
      </section>
    );
  }

  const links = [
    ["GitHub", candidate.github_url],
    ["LinkedIn", candidate.linkedin_url],
    ["Portfolio", candidate.portfolio_url],
  ].filter(([, url]) => Boolean(url));

  return (
    <section className={`${styles.panel} p-4 space-y-4`}>
      <div className="flex items-center gap-2">
        <BadgeCheck className="h-3.5 w-3.5 text-[#2E5A44]" />
        <p className="text-xs font-bold text-[#262626]">Contact unlocked</p>
        <Chip tone="green">accepted</Chip>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className={styles.microLabel}>Name</p>
          <p className="text-xs font-bold text-[#262626]">{candidate.name || candidate.display_name}</p>
        </div>
        <div className="space-y-1">
          <p className={styles.microLabel}>Email</p>
          {candidate.email ? (
            <a
              href={`mailto:${candidate.email}`}
              className={`text-xs font-mono text-[#C85A32] hover:text-[#B83A14] break-all rounded ${styles.focusRing}`}
            >
              {candidate.email}
            </a>
          ) : (
            <p className="text-xs font-mono text-[#6E6359]">Not on file</p>
          )}
        </div>
      </div>

      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map(([label, url]) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FCFAF7] border border-[#DFD5C6] rounded-lg text-[10px] font-mono font-bold text-[#262626] hover:border-[#C85A32] transition-colors ${styles.focusRing}`}
            >
              <ExternalLink className="h-3 w-3" />
              {label}
            </a>
          ))}
        </div>
      )}

      {candidate.resume_text ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className={styles.microLabel}>
              Résumé{candidate.resume_name ? ` · ${candidate.resume_name}` : ""}
            </p>
            <button
              type="button"
              onClick={() => {
                const content = candidate.resume_text;
                const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
                const link = document.createElement("a");
                link.href = url;
                link.download = `${(candidate.name || candidate.display_name || "Candidate").replace(/\s+/g, "_")}_Resume.txt`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
              }}
              className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono font-bold text-[#C85A32] bg-[#FAF4EB] border border-[#C85A32]/20 rounded hover:bg-[#F5EDE3] transition-colors ${styles.focusRing}`}
            >
              <FileText className="h-3 w-3" />
              Download
            </button>
          </div>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl p-3 text-[11px] font-mono text-[#262626] leading-relaxed">
            {candidate.resume_text}
          </pre>
        </div>
      ) : (
        <p className={styles.hint}>
          <FileText className="h-3 w-3 inline mr-1 -mt-0.5" />
          They have not uploaded a résumé.
        </p>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------

export default function CandidateDossier({
  candidateId,
  onClose,
  onRequestContact,
  onAddToPipeline,
  onSendAssessment,
}) {
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!candidateId) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiGet(`/api/recruiter/candidates/${encodeURIComponent(candidateId)}`);
      setCandidate(data?.candidate || null);
    } catch (err) {
      setError(errorMessage(err, "Could not load this candidate."));
      setCandidate(null);
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    load();
  }, [load]);

  const open = Boolean(candidateId);
  const alreadyShortlisted = Boolean(candidate?.shortlist_id);
  const assessment = candidate?.assessment;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={candidate?.display_name || "Candidate dossier"}
      subtitle={candidate?.headline || "Verified signal only — nothing here is estimated."}
      icon={Users}
      width="max-w-3xl"
      footer={
        candidate ? (
          <>
            <button type="button" className={styles.secondary} onClick={onClose}>
              Close
            </button>
            {!alreadyShortlisted && (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => onAddToPipeline?.(candidate)}
              >
                <UserPlus className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                Add to pipeline
              </button>
            )}
            {candidate.contact_unlocked ? (
              <button type="button" className={styles.primary} onClick={() => onSendAssessment?.(candidate)}>
                <FileCode2 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                Send assessment
              </button>
            ) : (
              candidate.outreach_status !== "pending" && (
                <button type="button" className={styles.primary} onClick={() => onRequestContact?.(candidate)}>
                  <Mail className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                  Request contact
                </button>
              )
            )}
          </>
        ) : (
          <button type="button" className={styles.secondary} onClick={onClose}>
            Close
          </button>
        )
      }
    >
      {loading && !candidate && <LoadingBlock label="Loading dossier" />}
      <ErrorBanner message={error} onRetry={load} />

      {candidate && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={tierTone(candidate.devscore)} icon={Award}>
              {candidate.tier}
            </Chip>
            {candidate.percentile && <Chip tone="neutral">{candidate.percentile}</Chip>}
            {alreadyShortlisted && candidate.stage && <Chip tone="ink">{candidate.stage}</Chip>}
            {candidate.contact_unlocked ? (
              <Chip tone="green" icon={BadgeCheck}>
                contact unlocked
              </Chip>
            ) : (
              <Chip tone="neutral" icon={Lock}>
                contact locked
              </Chip>
            )}
          </div>

          <BreakdownBars
            breakdown={candidate.breakdown}
            devscore={candidate.devscore}
            source={candidate.devscore_source}
          />

          <section className="space-y-2">
            <p className={styles.microLabel}>What they are looking for</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              <p className="text-xs text-[#262626] flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-[#6E6359]/70 shrink-0" />
                {candidate.role || "Role not specified"}
              </p>
              <p className="text-xs text-[#262626] flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-[#6E6359]/70 shrink-0" />
                {[candidate.location, candidate.work_mode].filter(Boolean).join(" · ") || "Location not specified"}
              </p>
              <p className="text-xs text-[#262626] flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#6E6359]/70 shrink-0" />
                {candidate.notice_period ? `Notice: ${candidate.notice_period}` : "Notice period not specified"}
              </p>
              <p className="text-xs text-[#262626] font-mono">
                {candidate.expected_salary || "Compensation expectation not specified"}
              </p>
            </div>
            {candidate.opportunity_preferences && (
              <p className={`${styles.hint} pt-1`}>“{candidate.opportunity_preferences}”</p>
            )}
          </section>

          {Array.isArray(candidate.primary_stack) && candidate.primary_stack.length > 0 && (
            <section className="space-y-2">
              <p className={styles.microLabel}>Stack</p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.primary_stack.map((item) => (
                  <Chip key={item} tone="accent">
                    {item}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          <VerifiedPlatforms stats={candidate.platform_stats} />

          {Array.isArray(candidate.badges) && candidate.badges.length > 0 && (
            <section className="space-y-2">
              <p className={styles.microLabel}>Badges</p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.badges.map((badge) => (
                  <Chip key={badge} tone="green" icon={BadgeCheck}>
                    {badge}
                  </Chip>
                ))}
              </div>
            </section>
          )}

          {assessment && (
            <section className="space-y-2">
              <p className={styles.microLabel}>Take-home assessment</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <StatTile label="Status" value={assessment.status || "—"} />
                <StatTile
                  label="Score"
                  value={assessment.score == null ? "—" : assessment.score}
                  sublabel={assessment.score == null ? "Not submitted yet" : "out of 1000"}
                  tone="accent"
                />
                <StatTile
                  label="Chaos resilience"
                  value={
                    assessment.chaos_resilience == null
                      ? "—"
                      : `${Math.round(Number(assessment.chaos_resilience) * 100)}%`
                  }
                />
              </div>
              <p className={styles.hint}>
                {assessment.problem_title || "Problem not recorded"}
                {assessment.completed_at ? ` · completed ${formatDate(assessment.completed_at, { withTime: true })}` : ""}
              </p>
            </section>
          )}

          <ContactSection candidate={candidate} onRequestContact={() => onRequestContact?.(candidate)} />
        </div>
      )}
    </Modal>
  );
}
