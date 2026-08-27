"use client";

/**
 * =============================================================================
 * Data layer for the recruiter workspace.
 * =============================================================================
 * Everything here goes through `apiFetch`, which means:
 *
 *   - The bearer token is attached automatically and no request carries a
 *     `recruiter_id` or `user_id`. The organization a call acts on is resolved
 *     server-side from the token's membership row. The old portal sent
 *     `recruiter_id: user?.uid || "default_recruiter"` in its bodies, so editing
 *     one value in DevTools read another company's pipeline.
 *   - Failures throw with the backend's own `detail` string. Nothing is
 *     swallowed into `console.warn`; every hook exposes an `error` a panel is
 *     expected to render.
 *
 * Mutations return `{ ok, message, data }` rather than throwing, so a panel can
 * toast the outcome without wrapping each call in try/catch. Writes that change
 * a visible list update optimistically and roll back on failure.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage, withQuery } from "@/lib/api";

/** Mirrors `database.PIPELINE_STAGES`; only used until the server list lands. */
export const FALLBACK_PIPELINE_STAGES = [
  "Sourced",
  "Screening",
  "Assessment",
  "Interview",
  "Offer",
  "Hired",
  "Rejected",
];

/** Mirrors `recruiter_service.TIER_BANDS`, so the filter means what the badge means. */
export const TIER_OPTIONS = [
  "All",
  "Titan / Elite Staff",
  "Distinguished Senior",
  "Proficient Mid-Level",
  "Active Developer",
  "Apprentice / Growing",
];

/**
 * Stack filter choices. These are substring filters over what candidates typed
 * into their own profile — a shortlist of common technologies, not a claim that
 * anyone in the database uses them.
 */
export const STACK_OPTIONS = [
  "All",
  "Python",
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Go",
  "Rust",
  "Java",
  "C++",
  "Kubernetes",
  "AWS",
  "Machine Learning",
];

export const WORK_MODES = ["Remote", "Hybrid", "On-site"];
export const EXPERIENCE_LEVELS = ["Intern", "Junior", "Mid-Level", "Senior", "Staff", "Principal"];
export const JOB_STATUSES = ["Active", "Paused", "Closed"];

export const SEARCH_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

/** Uniform shape for every mutation, so callers never need try/catch. */
function ok(data) {
  return { ok: true, message: "", data };
}
function fail(err, fallback) {
  return { ok: false, message: errorMessage(err, fallback), data: null };
}

// -----------------------------------------------------------------------------
// Organization, members and invites
// -----------------------------------------------------------------------------

function useOrganization({ refreshKey, onOrganizationChange }) {
  const [organization, setOrganization] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  // Snapshot of the last rendered member list, for optimistic rollback.
  const membersRef = useRef(members);
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const data = await apiGet("/api/org");
      if (id !== requestId.current) return;
      setOrganization(data?.organization || null);
      setMembers(data?.members || []);
      setInvites(data?.pending_invites || []);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(errorMessage(err, "Could not load your organization."));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const create = useCallback(
    async (fields) => {
      try {
        const data = await apiPost("/api/org", fields);
        setOrganization(data?.organization || null);
        onOrganizationChange?.(data?.organization || null);
        // Members and invites only exist once the org does.
        reload();
        return ok(data?.organization);
      } catch (err) {
        return fail(err, "Could not create the organization.");
      }
    },
    [onOrganizationChange, reload]
  );

  const update = useCallback(
    async (fields) => {
      try {
        const data = await apiPatch("/api/org", fields);
        const next = data?.organization || null;
        // The server returns the org row without the caller's role; keep ours.
        setOrganization((prev) => (next ? { ...(prev || {}), ...next } : prev));
        if (next) onOrganizationChange?.({ ...(organization || {}), ...next });
        return ok(next);
      } catch (err) {
        return fail(err, "Could not update the organization.");
      }
    },
    [onOrganizationChange, organization]
  );

  const invite = useCallback(async (email, role) => {
    try {
      const data = await apiPost("/api/org/invite", { email, role });
      const created = data?.invite || null;
      if (created) {
        setInvites((prev) => [
          { id: created.id, email: created.email, role: created.role, expires_at: created.expires_at, created_at: null },
          ...prev.filter((row) => row.email !== created.email),
        ]);
      }
      return ok(created);
    } catch (err) {
      return fail(err, "Could not send the invite.");
    }
  }, []);

  const changeRole = useCallback(async (memberUserId, role) => {
    const snapshot = membersRef.current;
    setMembers((prev) => prev.map((m) => (m.user_id === memberUserId ? { ...m, role } : m)));
    try {
      const data = await apiPatch(`/api/org/members/${memberUserId}`, { role });
      if (data?.members) setMembers(data.members);
      return ok(data?.members);
    } catch (err) {
      setMembers(snapshot);
      return fail(err, "Could not change that role.");
    }
  }, []);

  const removeMember = useCallback(async (memberUserId) => {
    const snapshot = membersRef.current;
    setMembers((prev) => prev.filter((m) => m.user_id !== memberUserId));
    try {
      const data = await apiDelete(`/api/org/members/${memberUserId}`);
      if (data?.members) setMembers(data.members);
      return ok(data?.members);
    } catch (err) {
      setMembers(snapshot);
      return fail(err, "Could not remove that teammate.");
    }
  }, []);

  return { organization, members, invites, loading, error, reload, create, update, invite, changeRole, removeMember };
}

// -----------------------------------------------------------------------------
// Company profile (one per organization)
// -----------------------------------------------------------------------------

function useStartupProfile({ enabled }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const data = await apiGet("/api/recruiter/startup-profile");
      if (id !== requestId.current) return;
      setProfile(data?.profile || null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(errorMessage(err, "Could not load the company profile."));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(async (fields) => {
    try {
      const data = await apiPost("/api/recruiter/startup-profile", fields);
      if (data?.profile) setProfile(data.profile);
      return ok(data?.profile);
    } catch (err) {
      return fail(err, "Could not save the company profile.");
    }
  }, []);

  return { profile, loading, error, reload, save };
}

// -----------------------------------------------------------------------------
// Requisitions
// -----------------------------------------------------------------------------

function useJobs({ enabled }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const reload = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const data = await apiGet("/api/recruiter/jobs");
      if (id !== requestId.current) return;
      setItems(data?.jobs || []);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(errorMessage(err, "Could not load your requisitions."));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = useCallback(async (fields) => {
    try {
      const data = await apiPost("/api/recruiter/jobs", fields);
      const job = data?.job;
      if (job) setItems((prev) => [job, ...prev]);
      return ok(job);
    } catch (err) {
      return fail(err, "Could not post the requisition.");
    }
  }, []);

  const update = useCallback(async (jobId, fields) => {
    const snapshot = itemsRef.current;
    setItems((prev) => prev.map((job) => (job.id === jobId ? { ...job, ...fields } : job)));
    try {
      const data = await apiPatch(`/api/recruiter/jobs/${jobId}`, fields);
      const job = data?.job;
      if (job) setItems((prev) => prev.map((row) => (row.id === jobId ? job : row)));
      return ok(job);
    } catch (err) {
      setItems(snapshot);
      return fail(err, "Could not update the requisition.");
    }
  }, []);

  const remove = useCallback(async (jobId) => {
    const snapshot = itemsRef.current;
    setItems((prev) => prev.filter((job) => job.id !== jobId));
    try {
      await apiDelete(`/api/recruiter/jobs/${jobId}`);
      return ok(true);
    } catch (err) {
      setItems(snapshot);
      return fail(err, "Could not delete the requisition.");
    }
  }, []);

  return { items, loading, error, reload, create, update, remove };
}

// -----------------------------------------------------------------------------
// Pipeline
// -----------------------------------------------------------------------------

function usePipeline({ enabled }) {
  const [items, setItems] = useState([]);
  const [stages, setStages] = useState(FALLBACK_PIPELINE_STAGES);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const reload = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const data = await apiGet("/api/recruiter/shortlist");
      if (id !== requestId.current) return;
      setItems(data?.shortlists || []);
      if (Array.isArray(data?.stages) && data.stages.length) setStages(data.stages);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(errorMessage(err, "Could not load your hiring pipeline."));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Add or re-stage a candidate. The server owns the display name. */
  const add = useCallback(
    async ({ candidateId, jobId = 0, stage = "Sourced", notes = "" }) => {
      try {
        const data = await apiPost("/api/recruiter/shortlist", {
          candidate_id: String(candidateId),
          job_id: Number(jobId) || 0,
          stage,
          notes,
        });
        await reload();
        return ok(data?.shortlist);
      } catch (err) {
        return fail(err, "Could not add that candidate to the pipeline.");
      }
    },
    [reload]
  );

  /** Optimistic stage move; rolls the row back to its previous stage on failure. */
  const move = useCallback(async (shortlistId, patch) => {
    const snapshot = itemsRef.current;
    setItems((prev) =>
      prev.map((row) => (row.id === shortlistId ? { ...row, ...patch, updated_at: new Date().toISOString() } : row))
    );
    try {
      const data = await apiPatch(`/api/recruiter/shortlist/${shortlistId}`, patch);
      return ok(data?.shortlist);
    } catch (err) {
      setItems(snapshot);
      return fail(err, "Could not move that candidate.");
    }
  }, []);

  const remove = useCallback(async (shortlistId) => {
    const snapshot = itemsRef.current;
    setItems((prev) => prev.filter((row) => row.id !== shortlistId));
    try {
      await apiDelete(`/api/recruiter/shortlist/${shortlistId}`);
      return ok(true);
    } catch (err) {
      setItems(snapshot);
      return fail(err, "Could not remove that pipeline entry.");
    }
  }, []);

  const fetchEvents = useCallback(async (shortlistId) => {
    try {
      const data = await apiGet(`/api/recruiter/shortlist/${shortlistId}/events`);
      return ok(data?.events || []);
    } catch (err) {
      return fail(err, "Could not load the stage history.");
    }
  }, []);

  return { items, stages, loading, error, reload, add, move, remove, fetchEvents };
}

// -----------------------------------------------------------------------------
// Take-home assessments
// -----------------------------------------------------------------------------

function useAssessments({ enabled }) {
  const [items, setItems] = useState([]);
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const reload = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const [assessmentData, problemData] = await Promise.all([
        apiGet("/api/recruiter/assessments"),
        // The problem catalog is decoration on a failure; a missing list must not
        // hide the assessments the recruiter already sent.
        apiGet("/api/recruiter/assessment-problems").catch(() => null),
      ]);
      if (id !== requestId.current) return;
      setItems(assessmentData?.assessments || []);
      if (problemData?.problems) setProblems(problemData.problems);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(errorMessage(err, "Could not load your assessments."));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  const send = useCallback(
    async ({ candidateId, jobId = 0, roleTitle = "", problemSlug, difficulty = "Medium", timeLimitMinutes = 60 }) => {
      try {
        const data = await apiPost("/api/recruiter/send-assessment", {
          candidate_id: String(candidateId),
          job_id: Number(jobId) || 0,
          role_title: roleTitle,
          problem_slug: problemSlug,
          difficulty,
          time_limit_minutes: Number(timeLimitMinutes) || 60,
        });
        await reload();
        return ok(data?.assessment);
      } catch (err) {
        return fail(err, "Could not send the assessment.");
      }
    },
    [reload]
  );

  const resend = useCallback(async (assessmentId) => {
    try {
      await apiPost(`/api/recruiter/assessments/${assessmentId}/resend`, {});
      return ok(true);
    } catch (err) {
      return fail(err, "Could not resend the invite.");
    }
  }, []);

  const remove = useCallback(async (assessmentId) => {
    const snapshot = itemsRef.current;
    setItems((prev) => prev.filter((row) => row.id !== assessmentId));
    try {
      await apiDelete(`/api/recruiter/assessments/${assessmentId}`);
      return ok(true);
    } catch (err) {
      setItems(snapshot);
      return fail(err, "Could not delete that assessment.");
    }
  }, []);

  return { items, problems, loading, error, reload, send, resend, remove };
}

// -----------------------------------------------------------------------------
// Outreach (the consent handshake)
// -----------------------------------------------------------------------------

function useOutreach({ enabled }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      return;
    }
    try {
      const data = await apiGet("/api/recruiter/outreach");
      setItems(data?.outreach || []);
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Could not load your outreach requests."));
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  const send = useCallback(
    async ({ candidateId, jobId = 0, message = "" }) => {
      try {
        const data = await apiPost("/api/recruiter/outreach", {
          candidate_id: String(candidateId),
          job_id: Number(jobId) || 0,
          message,
        });
        reload();
        return ok(data?.outreach);
      } catch (err) {
        return fail(err, "Could not send the request.");
      }
    },
    [reload]
  );

  return { items, error, reload, send };
}

// -----------------------------------------------------------------------------
// Talent search
// -----------------------------------------------------------------------------

export const DEFAULT_FILTERS = { query: "", minDevscore: 0, stack: "All", tier: "All" };

/**
 * Debounced, abortable, paginated talent search.
 *
 * The old effect fired a full-table search on every keystroke with no
 * cancellation, so results could arrive out of order and overwrite a newer
 * query. Here each run supersedes the last through an `AbortController`, and
 * "load more" pages against the server's `{candidates, total_count, has_more}`.
 */
export function useTalentSearch({ enabled = true } = {}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [candidates, setCandidates] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const offsetRef = useRef(0);

  const buildPath = useCallback(
    (offset) =>
      withQuery("/api/recruiter/candidates", {
        query: filters.query.trim(),
        min_devscore: filters.minDevscore > 0 ? filters.minDevscore : undefined,
        primary_stack: filters.stack,
        tier: filters.tier,
        limit: SEARCH_PAGE_SIZE,
        offset,
      }),
    [filters]
  );

  useEffect(() => {
    if (!enabled) {
      setCandidates([]);
      setTotalCount(0);
      setHasMore(false);
      setLoading(false);
      return undefined;
    }

    // Show the pending state the instant a filter changes, not 300 ms later.
    setLoading(true);
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setError("");
      try {
        const data = await apiGet(buildPath(0), { signal: controller.signal });
        const page = data?.candidates || [];
        setCandidates(page);
        setTotalCount(Number(data?.total_count) || 0);
        setHasMore(Boolean(data?.has_more));
        offsetRef.current = page.length;
      } catch (err) {
        if (err?.name === "AbortError") return;
        setError(errorMessage(err, "Talent search is temporarily unavailable."));
        setCandidates([]);
        setTotalCount(0);
        setHasMore(false);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, buildPath, nonce]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await apiGet(buildPath(offsetRef.current));
      const page = data?.candidates || [];
      setCandidates((prev) => {
        const seen = new Set(prev.map((candidate) => candidate.id));
        return [...prev, ...page.filter((candidate) => !seen.has(candidate.id))];
      });
      // Advance by the server page length, not the deduped length, or the next
      // offset would re-request rows we already skipped.
      offsetRef.current += page.length;
      setTotalCount(Number(data?.total_count) || 0);
      setHasMore(Boolean(data?.has_more));
      setError("");
    } catch (err) {
      setError(errorMessage(err, "Could not load more candidates."));
    } finally {
      setLoadingMore(false);
    }
  }, [buildPath, hasMore, loadingMore]);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  /** Patch one row after outreach or an assessment, without a full refetch. */
  const patchCandidate = useCallback((candidateId, partial) => {
    setCandidates((prev) =>
      prev.map((candidate) => (candidate.id === candidateId ? { ...candidate, ...partial } : candidate))
    );
  }, []);

  const filtersActive = useMemo(
    () =>
      filters.query.trim() !== "" ||
      filters.minDevscore > 0 ||
      filters.stack !== "All" ||
      filters.tier !== "All",
    [filters]
  );

  return {
    filters,
    setFilter,
    resetFilters,
    filtersActive,
    candidates,
    totalCount,
    hasMore,
    loading,
    loadingMore,
    error,
    loadMore,
    reload,
    patchCandidate,
  };
}

// -----------------------------------------------------------------------------
// Composite
// -----------------------------------------------------------------------------

/**
 * Everything the portal shell needs. The panels receive slices of this as props
 * so there is one copy of each list — the header's counts and the pipeline board
 * can never disagree.
 */
export function useRecruiterData({ organization: initialOrganization, onOrganizationChange }) {
  const org = useOrganization({ refreshKey: initialOrganization?.id ?? null, onOrganizationChange });

  // Prefer the freshly fetched org, falling back to what the shell already knew
  // so the panels do not flicker through a "no organization" state on reload.
  const organization = org.organization || initialOrganization || null;
  const hasOrg = Boolean(organization?.id);
  const role = organization?.role || initialOrganization?.role || "member";
  const isAdmin = role === "admin" || role === "owner";
  const isOwner = role === "owner";

  const profile = useStartupProfile({ enabled: hasOrg });
  const jobs = useJobs({ enabled: hasOrg });
  const pipeline = usePipeline({ enabled: hasOrg });
  const assessments = useAssessments({ enabled: hasOrg });
  const outreach = useOutreach({ enabled: hasOrg });

  const reloadAll = useCallback(() => {
    org.reload();
    profile.reload();
    jobs.reload();
    pipeline.reload();
    assessments.reload();
    outreach.reload();
  }, [org, profile, jobs, pipeline, assessments, outreach]);

  return { organization, hasOrg, role, isAdmin, isOwner, org, profile, jobs, pipeline, assessments, outreach, reloadAll };
}
