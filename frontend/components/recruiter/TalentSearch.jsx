"use client";

/**
 * Talent Radar — sourcing.
 *
 * What changed from the version this replaces:
 *   - The results are real people who opted in. There are no benchmark profiles,
 *     no `random.randint()` repo counts and no "Apurve" special case; if the
 *     database has nobody opted in, this says so instead of inventing two
 *     candidates with plausible email addresses.
 *   - Typing no longer fires one full-table search per keystroke. The hook
 *     debounces, aborts superseded requests and pages properly.
 *   - Names and contact details are absent until the candidate accepts a request
 *     from this organization, and the UI explains that rather than showing a
 *     greyed-out field.
 */

import React, { useState } from "react";
import {
  Award,
  BadgeCheck,
  Clock,
  FileCode2,
  Filter,
  Github,
  Lock,
  Mail,
  MapPin,
  Radar,
  RotateCcw,
  Search,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import CandidateDossier from "./CandidateDossier";
import { useCandidateActions } from "./candidateActions";
import { Chip, EmptyState, ErrorBanner, Field, LoadingBlock, PanelHeader, Spinner, styles } from "./ui";
import { STACK_OPTIONS, TIER_OPTIONS, useTalentSearch } from "./useRecruiterData";

/** Thresholds line up with the tier bands, so the filter matches the badge. */
const SCORE_THRESHOLDS = [
  { value: "0", label: "Any DevScore" },
  { value: "400", label: "400+ · Active Developer" },
  { value: "600", label: "600+ · Proficient Mid-Level" },
  { value: "750", label: "750+ · Distinguished Senior" },
  { value: "900", label: "900+ · Titan / Elite Staff" },
];

function tierTone(devscore) {
  if (devscore >= 900) return "accent";
  if (devscore >= 750) return "green";
  if (devscore >= 600) return "blue";
  return "neutral";
}

/** Only connected platforms produce a stat. Nothing is filled in for the rest. */
function platformSignals(stats) {
  const signals = [];
  if (stats?.leetcode?.connected) {
    signals.push({ key: "lc", icon: Trophy, text: `${stats.leetcode.total_solved ?? 0} solved` });
  }
  if (stats?.codeforces?.connected) {
    signals.push({ key: "cf", icon: Award, text: `CF ${stats.codeforces.rating ?? 0}` });
  }
  if (stats?.github?.connected) {
    signals.push({ key: "gh", icon: Github, text: `${stats.github.public_repos ?? 0} repos` });
  }
  return signals;
}

function CandidateCard({ candidate, onOpenDossier, actions }) {
  const signals = platformSignals(candidate.platform_stats);
  const shortlisted = Boolean(candidate.shortlist_id);
  const pending = candidate.outreach_status === "pending";
  const declined = candidate.outreach_status === "declined";

  return (
    <article className={`${styles.card} p-5 flex flex-col gap-4`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif font-semibold text-base tracking-tight text-[#262626] truncate">
            {candidate.display_name}
          </h3>
          <p className="text-[11px] font-mono text-[#6E6359] mt-0.5 truncate">{candidate.headline}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-black font-mono leading-none text-[#262626]">{candidate.devscore}</p>
          <p className="text-[9px] font-mono uppercase tracking-widest text-[#6E6359]/70 mt-1">DevScore</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={tierTone(candidate.devscore)} icon={Award}>
          {candidate.tier}
        </Chip>
        {candidate.percentile && <Chip tone="neutral">{candidate.percentile}</Chip>}
        {candidate.contact_unlocked ? (
          <Chip tone="green" icon={BadgeCheck}>
            contact unlocked
          </Chip>
        ) : pending ? (
          <Chip tone="blue" icon={Clock}>
            request pending
          </Chip>
        ) : declined ? (
          <Chip tone="danger">declined</Chip>
        ) : (
          <Chip tone="neutral" icon={Lock}>
            contact locked
          </Chip>
        )}
        {shortlisted && candidate.stage && <Chip tone="ink">{candidate.stage}</Chip>}
      </div>

      <p className="text-[11px] font-mono text-[#6E6359] flex items-center gap-1.5 truncate">
        <MapPin className="h-3 w-3 shrink-0" />
        {[candidate.location, candidate.work_mode].filter(Boolean).join(" · ") || "Location not specified"}
      </p>

      {Array.isArray(candidate.primary_stack) && candidate.primary_stack.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {candidate.primary_stack.slice(0, 5).map((item) => (
            <Chip key={item} tone="neutral">
              {item}
            </Chip>
          ))}
          {candidate.primary_stack.length > 5 && (
            <span className="text-[10px] font-mono text-[#6E6359]/70 self-center">
              +{candidate.primary_stack.length - 5}
            </span>
          )}
        </div>
      ) : (
        <p className="text-[10px] font-mono text-[#6E6359]/60">No stack listed</p>
      )}

      {signals.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 border-t border-[#DFD5C6]/60">
          {signals.map((signal) => {
            const Icon = signal.icon;
            return (
              <span key={signal.key} className="flex items-center gap-1.5 text-[10px] font-mono text-[#262626]">
                <Icon className="h-3 w-3 text-[#6E6359]/70" />
                {signal.text}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] font-mono text-[#6E6359]/60 pt-1 border-t border-[#DFD5C6]/60">
          No coding platforms connected
        </p>
      )}

      {candidate.assessment && (
        <p className="text-[10px] font-mono text-[#6E6359]">
          Assessment: <span className="text-[#262626] font-bold">{candidate.assessment.status}</span>
          {candidate.assessment.score != null && ` · ${candidate.assessment.score}/1000`}
        </p>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1">
        <button
          type="button"
          onClick={() => onOpenDossier(candidate.id)}
          className={`${styles.secondary} grow`}
        >
          View dossier
        </button>

        {!shortlisted && (
          <button
            type="button"
            onClick={() => actions.addToPipeline(candidate)}
            className={styles.iconButton}
            aria-label={`Add ${candidate.display_name} to pipeline`}
            title="Add to pipeline"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        )}

        {candidate.contact_unlocked ? (
          <button
            type="button"
            onClick={() => actions.sendAssessment(candidate)}
            className={styles.primary}
            title="Send take-home assessment"
          >
            <FileCode2 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            Assess
          </button>
        ) : (
          <button
            type="button"
            onClick={() => actions.requestContact(candidate)}
            className={styles.primary}
            disabled={pending}
            title={pending ? "Waiting on their response" : "Request contact details"}
          >
            <Mail className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            {pending ? "Pending" : "Contact"}
          </button>
        )}
      </div>
    </article>
  );
}

// -----------------------------------------------------------------------------

export default function TalentSearch({ enabled = true, jobs, pipeline, outreach, assessments, toast }) {
  const search = useTalentSearch({ enabled });
  const [dossierId, setDossierId] = useState(null);

  const actions = useCandidateActions({
    jobs: jobs.items,
    pipeline,
    outreach,
    assessments,
    toast,
    // Patch the one row instead of refetching the page the recruiter is reading.
    onChanged: (candidateId, partial) => {
      if (partial) search.patchCandidate(candidateId, partial);
    },
  });

  const { filters, setFilter, resetFilters, filtersActive, candidates, totalCount, hasMore } = search;
  const showing = candidates.length;

  return (
    <div className="space-y-6">
      <PanelHeader
        title="Talent Radar"
        description="Developers who switched on “open to opportunities”. You see verified scores and skills; their name, email and résumé unlock only when they accept your request."
      >
        <Chip tone="neutral" icon={Users}>
          {totalCount} {totalCount === 1 ? "candidate" : "candidates"}
        </Chip>
      </PanelHeader>

      {/* Filters */}
      <section className={`${styles.card} p-5 space-y-4`} aria-label="Search filters">
        <div className="relative">
          <Search className="h-4 w-4 text-[#6E6359]/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={filters.query}
            onChange={(event) => setFilter("query", event.target.value)}
            placeholder="Search by role, stack, city or what they're looking for"
            aria-label="Search candidates"
            className={`${styles.input} pl-9`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field
            label="Minimum DevScore"
            as="select"
            value={String(filters.minDevscore)}
            onChange={(event) => setFilter("minDevscore", Number(event.target.value))}
            options={SCORE_THRESHOLDS}
          />
          <Field
            label="Stack"
            as="select"
            value={filters.stack}
            onChange={(event) => setFilter("stack", event.target.value)}
            options={STACK_OPTIONS}
          />
          <Field
            label="Tier"
            as="select"
            value={filters.tier}
            onChange={(event) => setFilter("tier", event.target.value)}
            options={TIER_OPTIONS}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className={styles.hint}>
            <Filter className="h-3 w-3 inline mr-1 -mt-0.5" />
            Search covers the role, stack, cities and preferences a candidate published — never their name or email.
          </p>
          {filtersActive && (
            <button type="button" onClick={resetFilters} className={`${styles.secondary} shrink-0`}>
              <RotateCcw className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
              Clear
            </button>
          )}
        </div>
      </section>

      <ErrorBanner message={search.error} onRetry={search.reload} />

      {search.loading && showing === 0 ? (
        <LoadingBlock label="Searching" />
      ) : showing === 0 ? (
        <EmptyState
          icon={Radar}
          title={filtersActive ? "No candidates match these filters" : "No candidates are open to opportunities yet"}
          message={
            filtersActive
              ? "Widen the DevScore floor or clear the stack and tier filters. Only developers who opted in are searchable."
              : "Developers appear here once they switch on “open to opportunities” in their profile. Nothing is pre-populated — this list is exactly who has opted in."
          }
          action={
            filtersActive ? (
              <button type="button" className={styles.primary} onClick={resetFilters}>
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className={styles.microLabel}>
              Showing {showing} of {totalCount}
            </p>
            {search.loading && (
              <span className="flex items-center gap-1.5">
                <Spinner className="h-3 w-3" />
                <span className={styles.microLabel}>Updating</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                onOpenDossier={setDossierId}
                actions={actions}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={search.loadMore}
                className={styles.secondary}
                disabled={search.loadingMore}
              >
                {search.loadingMore && <Spinner className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
                Load more
              </button>
            </div>
          )}
        </>
      )}

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

      {actions.dialogs}
    </div>
  );
}
