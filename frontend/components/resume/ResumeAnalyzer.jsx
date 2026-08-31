"use client";

/**
 * Resume Analyzer
 *
 * Design rules:
 *   - All colour tokens are shared with the recruiter portal via the local `C`
 *     and `s` objects. The exact values match `ui.jsx` so both workspaces look
 *     like one product.
 *   - SVG elements (recharts charts) do not inherit CSS backgrounds; all fill,
 *     stroke, and colour props are set explicitly on the chart primitives so
 *     they render correctly on any background.
 *   - The feature list in the upload hero uses Lucide icons, never recharts
 *     primitives as decorative images.
 */

import React, { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BarChart2,
  BookOpen,
  Briefcase,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  FileText,
  GraduationCap,
  Info,
  ListChecks,
  Loader2,
  Monitor,
  Package,
  Radar as RadarIcon,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Target,
  Trophy,
  UploadCloud,
  User,
  Wand2,
  X,
  XCircle,
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

// ─── Design tokens (mirror recruiter/ui.jsx) ───────────────────────────────────
const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85A32]";

const C = {
  bg: "bg-[#FAF6F0]",
  card: "bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl shadow-2xs",
  accent: "text-[#C85A32]",
  ink: "text-[#262626]",
  muted: "text-[#6E6359]",
  green: "text-[#2E5A44]",
  blue: "text-[#2563EB]",
  amber: "text-[#A6690B]",
  danger: "text-[#B91C1C]",
};

const s = {
  chip: (tone) => {
    const map = {
      green: "bg-[#E8F2EC] text-[#2E5A44] border-[#2E5A44]/25",
      blue: "bg-[#EFF6FF] text-[#2563EB] border-[#2563EB]/25",
      accent: "bg-[#FEF0E7] text-[#C85A32] border-[#C85A32]/25",
      amber: "bg-[#FEF9E7] text-[#A6690B] border-[#A6690B]/25",
      danger: "bg-[#FEF2F2] text-[#B91C1C] border-[#B91C1C]/25",
      neutral: "bg-[#FAF6F0] text-[#6E6359] border-[#DFD5C6]",
      ink: "bg-[#262626] text-[#FCFAF7] border-[#262626]",
    };
    return `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${map[tone] || map.neutral}`;
  },
  sectionTitle: "font-serif font-semibold text-lg tracking-tight text-[#262626]",
  microLabel: "text-[10px] font-mono uppercase tracking-widest text-[#6E6359]",
  focusRing: FOCUS_RING,
  input:
    "w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono " +
    "focus:outline-none focus:border-[#C85A32] placeholder:text-[#6E6359]/40",
  primary:
    "px-5 py-2.5 bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] rounded-xl text-xs font-bold " +
    "transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 " +
    FOCUS_RING,
  secondary:
    "px-4 py-2 bg-[#FAF6F0] hover:bg-[#F2EAE0] text-[#6E6359] font-bold rounded-xl border border-[#DFD5C6] " +
    "transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",
  iconBtn:
    "p-1.5 rounded-lg border border-[#DFD5C6] text-[#6E6359] hover:text-[#262626] hover:bg-[#FAF6F0] " +
    "transition-all cursor-pointer",
  metric: "text-5xl md:text-6xl font-black font-mono leading-none tracking-tight",
};

// ─── Colour helpers ─────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 75) return "text-[#2E5A44]";
  if (score >= 50) return "text-[#A6690B]";
  return "text-[#C85A32]";
}
function scoreBg(score) {
  if (score >= 75) return "bg-[#E8F2EC]";
  if (score >= 50) return "bg-[#FEF9E7]";
  return "bg-[#FEF0E7]";
}
function scoreTone(score) {
  if (score >= 75) return "green";
  if (score >= 50) return "amber";
  return "danger";
}
function barColor(tone) {
  if (tone === "green") return "bg-[#2E5A44]";
  if (tone === "amber") return "bg-[#A6690B]";
  return "bg-[#C85A32]";
}

// ─── Dimension map ──────────────────────────────────────────────────────────
const DIMENSION_LABELS = {
  ats_compatibility: "ATS Compatibility",
  impact_metrics: "Impact & Metrics",
  bullet_quality: "Bullet Quality",
  skills_relevance: "Skills Relevance",
  experience_depth: "Experience Depth",
  section_completeness: "Sections",
  format_readability: "Format",
  brevity: "Brevity",
};

const DIMENSION_ICONS = {
  ats_compatibility: FileText,
  impact_metrics: Trophy,
  bullet_quality: BarChart2,
  skills_relevance: Package,
  experience_depth: Briefcase,
  section_completeness: ListChecks,
  format_readability: Monitor,
  brevity: ClipboardList,
};

// ─── Radar Chart ────────────────────────────────────────────────────────────
// SVG elements do not inherit CSS backgrounds, so every fill and stroke is set
// explicitly on the primitives. Without this the chart renders with invisible
// grid lines on any background.
function DimensionRadar({ scores }) {
  const data = Object.entries(scores).map(([key, value]) => ({
    dimension: DIMENSION_LABELS[key] || key,
    score: value,
    fullMark: 100,
  }));

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="68%">
          {/* Explicit background so lines are visible on any parent bg */}
          <PolarGrid stroke="#DFD5C6" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{
              fill: "#6E6359",
              fontSize: 9,
              fontWeight: "bold",
              fontFamily: "monospace",
            }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, 100]}
            tick={false}
            axisLine={false}
            tickCount={5}
          />
          <RechartsTooltip
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #DFD5C6",
              backgroundColor: "#FCFAF7",
              color: "#262626",
              fontFamily: "monospace",
              fontSize: "11px",
            }}
            formatter={(value) => [`${value}/100`, "Score"]}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="#C85A32"
            strokeWidth={2}
            fill="#C85A32"
            fillOpacity={0.15}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Dimension bars ─────────────────────────────────────────────────────────
function DimensionBars({ scores, weights }) {
  const data = Object.entries(scores).map(([key, value]) => ({
    dimension: DIMENSION_LABELS[key] || key,
    score: value,
    weight: Math.round((weights?.[key] || 0) * 100),
    key,
  }));

  return (
    <div className="space-y-3">
      {data.map(({ dimension, score, weight, key }) => {
        const Icon = DIMENSION_ICONS[key] || Star;
        const tone = scoreTone(score);
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-mono text-[#6E6359]">
                <Icon className="h-3 w-3" />
                {dimension}
                <span className="text-[#6E6359]/50">({weight}%)</span>
              </span>
              <span className={`text-xs font-black font-mono ${scoreColor(score)}`}>
                {score}
              </span>
            </div>
            <div className="h-1.5 bg-[#FAF6F0] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor(tone)}`}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Score header ───────────────────────────────────────────────────────────
function ScoreHeader({ score, jobRole, filename, date, onScanAnother }) {
  const tone = scoreTone(score);
  const tierLabel =
    score >= 900
      ? "Elite"
      : score >= 750
      ? "Distinguished Senior"
      : score >= 600
      ? "Proficient Mid-Level"
      : score >= 400
      ? "Active Developer"
      : "Needs Work";

  return (
    <div className={`${C.card} p-6 flex flex-col md:flex-row items-center gap-6`}>
      {/* Giant score */}
      <div className="flex flex-col items-center gap-2 shrink-0">
        <div className={`${s.metric} ${scoreColor(score)}`}>{score}</div>
        <div className="text-[10px] font-mono text-[#6E6359]/60 uppercase tracking-widest">
          out of 100
        </div>
        <div className={s.chip(tone)}>{tierLabel}</div>
      </div>

      {/* Divider */}
      <div className="hidden md:block w-px h-20 bg-[#DFD5C6]" />

      {/* Meta */}
      <div className="flex-1 space-y-3 text-center md:text-left">
        <div>
          <p className={s.microLabel}>Scanned for</p>
          <p className="text-sm font-serif font-semibold text-[#262626]">{jobRole}</p>
        </div>
        {filename && (
          <div>
            <p className={s.microLabel}>Resume</p>
            <p className="text-xs font-mono text-[#6E6359]">{filename}</p>
          </div>
        )}
        <div>
          <p className={s.microLabel}>Scanned on</p>
          <p className="text-xs font-mono text-[#6E6359]">{date}</p>
        </div>
      </div>

      {/* Scan another */}
      <button
        type="button"
        onClick={onScanAnother}
        className={`${s.secondary} whitespace-nowrap`}
      >
        <UploadCloud className="h-3.5 w-3.5" />
        Scan Another
      </button>
    </div>
  );
}

// ─── JD Match panel ─────────────────────────────────────────────────────────
function JDMatchPanel({ matchedKeywords, missingKeywords, roleCluster }) {
  const [tab, setTab] = useState("matched");

  const matched = matchedKeywords || [];
  const missing = missingKeywords || [];
  const critMissing = missing.filter((m) => m.severity === "critical");
  const recMissing = missing.filter((m) => m.severity === "recommended");

  const total = matched.length + missing.length;
  const matchPct = total > 0 ? Math.round((matched.length / total) * 100) : 0;

  return (
    <div className={`${C.card} p-6 space-y-4`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className={s.sectionTitle}>Keyword Match</h3>
          <p className="text-[10px] font-mono text-[#6E6359] mt-0.5">
            vs. {roleCluster} cluster · {matchPct}% of known keywords found
          </p>
        </div>
        <div className="flex gap-1">
          {[
            { key: "matched", label: "Found", count: matched.length },
            { key: "missing", label: "Missing", count: missing.length },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold transition-all ${
                tab === key
                  ? key === "matched"
                    ? "bg-[#E8F2EC] text-[#2E5A44]"
                    : "bg-[#FEF0E7] text-[#C85A32]"
                  : "bg-[#FAF6F0] text-[#6E6359]"
              }`}
            >
              {label} {count}
            </button>
          ))}
        </div>
      </div>

      {tab === "matched" && (
        <div className="flex flex-wrap gap-1.5">
          {matched.length === 0 ? (
            <p className="text-xs text-[#6E6359]/60 font-mono italic">
              No cluster keywords matched.
            </p>
          ) : (
            matched.map((m, i) => (
              <span
                key={i}
                className={s.chip(m.category === "core" ? "green" : "blue")}
                title={`${m.category} keyword · appears ${m.frequency}×`}
              >
                {m.keyword}
                {m.frequency > 1 && (
                  <span className="opacity-60">×{m.frequency}</span>
                )}
              </span>
            ))
          )}
        </div>
      )}

      {tab === "missing" && (
        <div className="space-y-3">
          {critMissing.length > 0 && (
            <div>
              <p className="text-[10px] font-mono font-bold text-[#B91C1C] mb-1.5 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Core keywords (add to Skills or bullets)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {critMissing.map((m, i) => (
                  <span key={i} className={s.chip("danger")}>
                    {m.keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
          {recMissing.length > 0 && (
            <div>
              <p className="text-[10px] font-mono font-bold text-[#A6690B] mb-1.5 flex items-center gap-1">
                <Info className="h-3 w-3" />
                Differentiators (add if you have them)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {recMissing.map((m, i) => (
                  <span key={i} className={s.chip("amber")}>
                    {m.keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
          {missing.length === 0 && (
            <p className="text-xs text-[#6E6359]/60 font-mono italic">
              No missing cluster keywords.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section deep dive ──────────────────────────────────────────────────────
const SECTION_ICON_MAP = {
  summary: User,
  experience: Briefcase,
  education: GraduationCap,
  skills: Package,
  projects: FileText,
};

const SECTION_LABELS = {
  summary: "Professional Summary",
  experience: "Work Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
};

function SectionDeepDive({ sectionScores }) {
  const order = ["summary", "experience", "education", "skills", "projects"];
  const present = order.filter((k) => sectionScores?.[k]);

  if (!present.length) return null;

  const totalScore = present.reduce(
    (sum, k) => sum + (sectionScores[k]?.score || 0),
    0
  );
  const totalMax = present.reduce(
    (sum, k) => sum + (sectionScores[k]?.max || 0),
    0
  );

  return (
    <div className={`${C.card} p-6 space-y-4`}>
      <div className="flex items-center justify-between">
        <h3 className={s.sectionTitle}>Section Breakdown</h3>
        <div className="text-right">
          <p className="text-[10px] font-mono text-[#6E6359]">
            Overall section score
          </p>
          <p
            className={`text-lg font-black font-mono ${scoreColor(
              Math.round((totalScore / totalMax) * 100)
            )}`}
          >
            {totalScore}/{totalMax}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {order.map((key) => {
          const sec = sectionScores?.[key];
          const Icon = SECTION_ICON_MAP[key] || FileText;

          if (!sec) {
            return (
              <div
                key={key}
                className="bg-[#FAF6F0] border border-[#DFD5C6]/40 rounded-xl p-4 opacity-50"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#6E6359]/60 mb-2">
                  <Icon className="h-4 w-4" />
                  {SECTION_LABELS[key]}
                </div>
                <p className="text-[11px] text-[#6E6359]/60 font-mono italic">
                  Not detected
                </p>
              </div>
            );
          }

          const pct = Math.round((sec.score / sec.max) * 100);
          const tone = scoreTone(pct);

          return (
            <div
              key={key}
              className="border border-[#DFD5C6] rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#6E6359]">
                  <Icon className="h-4 w-4" />
                  {SECTION_LABELS[key]}
                </div>
                <span className={s.chip(tone)}>
                  {sec.score}/{sec.max}
                </span>
              </div>

              <div className="h-1 bg-[#FAF6F0] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor(tone)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <p className="text-[10px] font-mono text-[#6E6359] leading-relaxed">
                {sec.feedback}
              </p>

              {sec.bullet_count != null && (
                <p className="text-[9px] font-mono text-[#6E6359]/60">
                  {sec.bullet_count} bullets
                  {sec.quantified_ratio != null &&
                    ` · ${Math.round(sec.quantified_ratio * 100)}% quantified`}
                </p>
              )}
              {sec.skill_count != null && (
                <p className="text-[9px] font-mono text-[#6E6359]/60">
                  {sec.skill_count} skills listed
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Issues list ────────────────────────────────────────────────────────────
function IssuesList({ issues }) {
  const [tab, setTab] = useState("all");
  const [expanded, setExpanded] = useState(null);

  if (!issues?.length) return null;

  const filtered =
    tab === "all" ? issues : issues.filter((i) => i.severity === tab);
  const counts = {
    all: issues.length,
    critical: 0,
    recommended: 0,
    nice: 0,
  };
  issues.forEach((i) => {
    if (counts[i.severity] !== undefined) counts[i.severity]++;
  });

  const sevColors = {
    critical: {
      bg: "bg-[#FEF2F2]",
      border: "border-[#B91C1C]/20",
      dot: "bg-[#B91C1C]",
      text: "text-[#B91C1C]",
      badge: "bg-[#FEF2F2] text-[#B91C1C]",
    },
    recommended: {
      bg: "bg-[#FEF9E7]",
      border: "border-[#A6690B]/20",
      dot: "bg-[#A6690B]",
      text: "text-[#A6690B]",
      badge: "bg-[#FEF9E7] text-[#A6690B]",
    },
    nice: {
      bg: "bg-[#EFF6FF]",
      border: "border-[#2563EB]/20",
      dot: "bg-[#2563EB]",
      text: "text-[#2563EB]",
      badge: "bg-[#EFF6FF] text-[#2563EB]",
    },
  };

  return (
    <div className={`${C.card} p-6 space-y-4`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className={s.sectionTitle}>Issues Found</h3>
        <div className="flex gap-1">
          {[
            { key: "all", label: "All", count: counts.all },
            { key: "critical", label: "Critical", count: counts.critical },
            { key: "recommended", label: "Rec.", count: counts.recommended },
            { key: "nice", label: "Nice", count: counts.nice },
          ].map(({ key, label, count }) =>
            count === 0 && key !== "all" ? null : (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold transition-all ${
                  tab === key
                    ? key === "critical"
                      ? sevColors.critical.badge
                      : key === "recommended"
                      ? sevColors.recommended.badge
                      : key === "nice"
                      ? sevColors.nice.badge
                      : "bg-[#262626] text-[#FCFAF7]"
                    : "bg-[#FAF6F0] text-[#6E6359]"
                }`}
              >
                {label} {count}
              </button>
            )
          )}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-xs text-[#6E6359]/60 font-mono italic text-center py-4">
            No issues in this category.
          </p>
        )}
        {filtered.map((issue, idx) => {
          const isOpen = expanded === idx;
          const col = sevColors[issue.severity] || sevColors.nice;
          const dimLabel =
            DIMENSION_LABELS[issue.dimension] || issue.dimension;

          return (
            <div
              key={idx}
              className={`${col.bg} border ${col.border} rounded-xl overflow-hidden`}
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : idx)}
                className="w-full flex items-start gap-3 p-4 text-left"
              >
                <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${col.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase ${col.text}`}
                    >
                      {issue.severity}
                    </span>
                    <span className="text-[10px] font-mono text-[#6E6359]/70">
                      {dimLabel}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-[#262626] mt-0.5 leading-relaxed">
                    {issue.message}
                  </p>
                </div>
                <span className="text-[#6E6359]/40 shrink-0 mt-0.5">
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-[#DFD5C6]/40 space-y-2">
                  {issue.evidence && (
                    <div>
                      <p className="text-[9px] font-mono text-[#6E6359]/60 uppercase tracking-wider">
                        Evidence
                      </p>
                      <p className="text-[10px] font-mono text-[#6E6359] mt-0.5 bg-[#FAF6F0] px-2 py-1 rounded">
                        {issue.evidence}
                      </p>
                    </div>
                  )}
                  {issue.fix && (
                    <div>
                      <p className="text-[9px] font-mono text-[#6E6359]/60 uppercase tracking-wider">
                        How to fix
                      </p>
                      <p className="text-[11px] text-[#262626] mt-0.5 leading-relaxed">
                        {issue.fix}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bullet rewrite carousel ────────────────────────────────────────────────
function BulletRewriteCarousel({ rewrites }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const items = rewrites || [];

  if (!items.length) return null;

  const current = items[active];

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`${C.card} p-6 space-y-4`}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className={s.sectionTitle}>Bullet Rewrites</h3>
          <p className="text-[10px] font-mono text-[#6E6359] mt-0.5">
            Rewritten using only facts already in your resume.
          </p>
        </div>
        {items.length > 1 && (
          <div className="flex gap-1">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === active ? "w-5 bg-[#C85A32]" : "w-1.5 bg-[#DFD5C6]"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border border-[#DFD5C6] rounded-xl p-5 bg-[#FAF6F0] space-y-4">
        {/* Original */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#6E6359]/60">
            <XCircle className="h-3 w-3" />
            Original
          </div>
          <p className="text-xs text-[#6E6359] leading-relaxed italic line-through decoration-[#DFD5C6]">
            {current.original}
          </p>
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <ArrowRight className="h-4 w-4 text-[#DFD5C6]" />
        </div>

        {/* Optimized */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#2E5A44]">
              <CheckCircle className="h-3 w-3" />
              Optimized
            </div>
            <button
              type="button"
              onClick={() => copy(current.optimized)}
              className={`${s.iconBtn} py-1 px-2`}
              title="Copy to clipboard"
            >
              {copied ? (
                <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-[#2E5A44]">
                  <Check className="h-3 w-3" /> Copied
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-mono font-bold">
                  <Copy className="h-3 w-3" /> Copy
                </span>
              )}
            </button>
          </div>
          <p className="text-xs text-[#262626] font-semibold leading-relaxed">
            {current.optimized}
          </p>
        </div>

        {current.explanation && (
          <p className="text-[10px] font-mono text-[#6E6359] leading-relaxed pt-2 border-t border-[#DFD5C6]/60">
            {current.explanation}
          </p>
        )}
      </div>

      {items.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-mono font-bold border transition-all ${
                i === active
                  ? "bg-[#C85A32] text-[#FCFAF7] border-[#C85A32]"
                  : "bg-[#FAF6F0] text-[#6E6359] border-[#DFD5C6]"
              }`}
            >
              Bullet {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Skills chips ───────────────────────────────────────────────────────────
function SkillsChips({ skillsExtracted }) {
  const { technical = [], certifications = [], soft = [] } = skillsExtracted || {};

  const groups = [
    { label: "Technical", items: technical, tone: "neutral" },
    { label: "Certifications", items: certifications, tone: "blue" },
    { label: "Soft Skills", items: soft, tone: "accent" },
  ].filter((g) => g.items.length > 0);

  if (!groups.length) return null;

  return (
    <div className={`${C.card} p-6 space-y-4`}>
      <h3 className={s.sectionTitle}>Skills Detected</h3>
      <div className="space-y-3">
        {groups.map(({ label, items, tone }) => (
          <div key={label}>
            <p className="text-[10px] font-mono text-[#6E6359]/70 uppercase tracking-wider mb-1.5">
              {label} ({items.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {items.map((item, i) => (
                <span key={i} className={s.chip(tone)}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Action plan ────────────────────────────────────────────────────────────
function ActionPlan({ suggestions }) {
  const items = suggestions || [];
  if (!items.length) return null;

  return (
    <div className={`${C.card} p-6 space-y-4`}>
      <h3 className={s.sectionTitle}>Action Plan</h3>
      <div className="space-y-3">
        {items.map((item, i) => {
          const dimLabel =
            DIMENSION_LABELS[item.dimension] || item.dimension;
          return (
            <div
              key={i}
              className="flex items-start gap-3 p-4 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl"
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#FCFAF7] border border-[#DFD5C6] text-[#C85A32] text-[10px] font-black font-mono shrink-0">
                {item.priority ?? i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#262626] leading-relaxed">
                  {item.text}
                </p>
                <p className="text-[9px] font-mono text-[#6E6359]/70 mt-1">
                  {dimLabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stats row ─────────────────────────────────────────────────────────────
function StatsRow({ stats }) {
  if (!stats) return null;
  const tiles = [
    { label: "Words", value: stats.word_count, Icon: FileText },
    { label: "Bullets", value: stats.bullet_count, Icon: BarChart2 },
    { label: "Pages", value: stats.page_estimate, Icon: BookOpen },
    { label: "Yrs Exp.", value: stats.experience_years, Icon: Briefcase },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {tiles.map(({ label, value, Icon }) => (
        <div
          key={label}
          className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-4 text-center space-y-1"
        >
          <Icon className="h-4 w-4 text-[#6E6359]/50 mx-auto" />
          <p className="text-xl font-black font-mono text-[#262626]">
            {value ?? "—"}
          </p>
          <p className="text-[9px] font-mono text-[#6E6359]/60 uppercase tracking-wider">
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Narrative cards (Summary / Pros / Cons) ─────────────────────────────────
function NarrativeCards({ analysis }) {
  const { overall_summary, pros = [], cons = [], experience_feedback } =
    analysis || {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Summary — spans 2 cols on large */}
      <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-5 lg:col-span-2 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-xl bg-[#C85A32]/10 flex items-center justify-center shrink-0">
            <RadarIcon className="h-4 w-4 text-[#C85A32]" />
          </span>
          <h3 className="font-serif font-semibold text-base text-[#262626] tracking-tight">
            Overall Assessment
          </h3>
        </div>
        <p className="text-sm text-[#6E6359] leading-relaxed">
          {overall_summary || "No assessment generated."}
        </p>
        {experience_feedback && (
          <div className="bg-[#FAF6F0] rounded-xl p-3 border border-[#DFD5C6]/40">
            <p className="text-[10px] font-mono font-bold text-[#6E6359]/60 uppercase tracking-wider mb-1">
              Bullet Quality
            </p>
            <p className="text-xs text-[#6E6359] leading-relaxed">
              {experience_feedback}
            </p>
          </div>
        )}
      </div>

      {/* Pros */}
      <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-xl bg-[#E8F2EC] flex items-center justify-center shrink-0">
            <CheckCircle className="h-4 w-4 text-[#2E5A44]" />
          </span>
          <h3 className="font-serif font-semibold text-base text-[#262626] tracking-tight">
            Strengths
          </h3>
        </div>
        <ul className="space-y-2">
          {pros.length > 0 ? (
            pros.map((pt, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-[#6E6359]"
              >
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#2E5A44] shrink-0" />
                <span className="leading-relaxed">{pt}</span>
              </li>
            ))
          ) : (
            <li className="text-[11px] text-[#6E6359]/60 italic font-mono">
              None identified.
            </li>
          )}
        </ul>
      </div>

      {/* Cons — hidden on small, shown on lg */}
      <div className="hidden lg:block bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-xl bg-[#FEF0E7] flex items-center justify-center shrink-0">
            <XCircle className="h-4 w-4 text-[#C85A32]" />
          </span>
          <h3 className="font-serif font-semibold text-base text-[#262626] tracking-tight">
            Weaknesses
          </h3>
        </div>
        <ul className="space-y-2">
          {cons.length > 0 ? (
            cons.map((pt, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-[#6E6359]"
              >
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#C85A32] shrink-0" />
                <span className="leading-relaxed">{pt}</span>
              </li>
            ))
          ) : (
            <li className="text-[11px] text-[#6E6359]/60 italic font-mono">
              None identified.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

// ─── Upload form ────────────────────────────────────────────────────────────
// The hero matches the platform's page aesthetic: serif headings, mono micro-
// labels, clay accent chips, no hard shadows or heavy cards.
function UploadForm({ jobRole, setJobRole, file, setFile, loading, error, onSubmit }) {
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected && selected.type !== "application/pdf") return;
    setFile(selected || null);
  };

  const features = [
    {
      Icon: RadarIcon,
      title: "8-Dimension Scoring",
      desc: "ATS compatibility, impact, bullet quality, skills relevance, experience depth and more — all computed deterministically.",
    },
    {
      Icon: Target,
      title: "JD-Aware Keyword Gap",
      desc: "Your target role maps to a real keyword cluster. What you have and what you're missing is shown with severity badges.",
    },
    {
      Icon: Wand2,
      title: "Evidence-Based Issues",
      desc: "Every issue is grounded in your resume text — not a generic checklist.",
    },
    {
      Icon: Sparkles,
      title: "Bullet Rewrites in One Click",
      desc: "Your weakest bullets are rewritten using only facts already in the document.",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Page header */}
      <div className="mb-8 space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-widest bg-[#C85A32]/10 text-[#C85A32] border border-[#C85A32]/20 px-3 py-1 rounded-full font-mono">
          ATS Optimization
        </span>
        <h1 className="text-3xl md:text-4xl font-serif font-semibold text-[#262626] leading-tight tracking-tight">
          Resume Analyzer
        </h1>
        <p className="text-xs text-[#6E6359] max-w-2xl leading-relaxed">
          Ensure your resume isn't filtered out by automated screeners. Upload your
          CV and enter the job title you're targeting to get an 8-dimension
          breakdown, keyword gap analysis, evidence-based issues, and ATS-optimized
          bullet rewrites.
        </p>
      </div>

      {/* Main content: upload + features */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: upload card */}
        <div className="lg:col-span-5 bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 space-y-5">
          <div className="space-y-1">
            <h3 className="font-serif font-semibold text-base text-[#262626] tracking-tight">
              Analyze Your Resume
            </h3>
            <p className="text-xs text-[#6E6359]">
              Upload a PDF and enter the job title you're targeting.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className={s.microLabel}>
                Target Job Role
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Backend Engineer, Full-Stack Developer"
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                className={s.input}
              />
            </div>

            <div className="space-y-1.5">
              <label className={s.microLabel}>Upload Resume (PDF)</label>
              <label
                className="flex flex-col items-center justify-center w-full h-40 border border-dashed border-[#DFD5C6] rounded-xl cursor-pointer bg-[#FAF6F0] hover:bg-[#C85A32]/5 hover:border-[#C85A32]/50 transition-colors duration-200"
              >
                <UploadCloud className="w-7 h-7 text-[#C85A32] mb-2.5" />
                <p className="text-xs text-[#6E6359]">
                  <span className="font-bold text-[#C85A32] hover:text-[#B83A14]">
                    Click to upload
                  </span>{" "}
                  or drag and drop
                </p>
                <p className="text-[10px] text-[#6E6359]/70 mt-1 font-mono uppercase tracking-wider">
                  {file ? (
                    <span className="text-[#262626] font-bold">{file.name}</span>
                  ) : (
                    "PDF format only"
                  )}
                </p>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            {error && (
              <div className="bg-[#FEF2F2] border border-[#B91C1C]/30 text-[#B91C1C] p-3 rounded-xl flex items-center gap-2 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !file || !jobRole.trim()}
              className={`${s.primary} w-full`}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Scan Resume
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right: feature list */}
        <div className="lg:col-span-7 space-y-5">
          {features.map(({ Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-4">
              <span className="h-9 w-9 rounded-xl bg-[#C85A32]/10 border border-[#C85A32]/20 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-[#C85A32]" />
              </span>
              <div>
                <h4 className="text-xs font-bold text-[#262626]">{title}</h4>
                <p className="text-[11px] text-[#6E6359] mt-0.5 leading-relaxed">
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function ResumeAnalyzer() {
  const [analysis, setAnalysis] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const cached = localStorage.getItem("prepflow_latest_resume_analysis");
      if (cached) {
        const p = JSON.parse(cached);
        if (p?.analysis?.composite_score != null) return p.analysis;
      }
    } catch (_) {}
    return null;
  });
  const [jobRole, setJobRole] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const cached = localStorage.getItem("prepflow_latest_resume_analysis");
      if (cached) {
        const p = JSON.parse(cached);
        return p?.jobRole || "";
      }
    } catch (_) {}
    return "";
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [partialWarning, setPartialWarning] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!jobRole.trim()) {
      setError("Please specify a target job role.");
      return;
    }
    if (!file) {
      setError("Please upload a resume PDF.");
      return;
    }

    setLoading(true);
    setError("");
    setPartialWarning(false);

    const formData = new FormData();
    formData.append("job_role", jobRole);
    formData.append("resume", file);

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";
      const res = await fetch(`${backendUrl}/api/resume-analyze`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || `Analysis failed (${res.status}).`);
      }

      if (!data.analysis) {
        throw new Error("Invalid response from server.");
      }

      setAnalysis(data.analysis);
      if (data.status === "partial") setPartialWarning(true);

      try {
        localStorage.setItem(
          "prepflow_latest_resume_analysis",
          JSON.stringify({
            analysis: data.analysis,
            fileName: file?.name || "resume.pdf",
            jobRole,
            date: new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          })
        );
      } catch (_) {}
    } catch (err) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleScanAnother = () => {
    setAnalysis(null);
    setPartialWarning(false);
    setError("");
  };

  // ── Report ──────────────────────────────────────────────────────────────
  if (analysis) {
    const date =
      typeof window !== "undefined"
        ? new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "—";

    return (
      <div className="w-full max-w-6xl mx-auto p-4 md:p-8 space-y-5">
        {/* Partial warning */}
        {partialWarning && (
          <div className="bg-[#FEF9E7] border border-[#A6690B]/30 rounded-xl p-4 flex items-start gap-3 text-xs">
            <Info className="h-4 w-4 text-[#A6690B] shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[#A6690B]">
                Numerical report loaded
              </p>
              <p className="text-[#A6690B]/80 mt-0.5">
                The LLM narrative is unavailable right now. Scores, the issues
                list, and the keyword gap are all computed locally — they are
                accurate.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <ScoreHeader
          score={analysis.composite_score ?? 0}
          jobRole={jobRole}
          filename={file?.name}
          date={date}
          onScanAnother={handleScanAnother}
        />

        {/* Stats */}
        <StatsRow stats={analysis.stats} />

        {/* Dimension breakdown: radar + bars */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${C.card} p-6`}>
            <h3 className={`${s.sectionTitle} mb-4`}>Dimension Radar</h3>
            <DimensionRadar scores={analysis.dimension_scores || {}} />
          </div>
          <div className={`${C.card} p-6`}>
            <h3 className={`${s.sectionTitle} mb-4`}>Dimension Breakdown</h3>
            <DimensionBars
              scores={analysis.dimension_scores || {}}
              weights={analysis.dimension_weights}
            />
          </div>
        </div>

        {/* JD match + Section deep dive */}
        <JDMatchPanel
          matchedKeywords={analysis.matched_keywords}
          missingKeywords={analysis.missing_keywords}
          roleCluster={analysis.role_cluster || jobRole}
        />

        <SectionDeepDive sectionScores={analysis.section_scores} />

        {/* Issues */}
        <IssuesList issues={analysis.issues} />

        {/* Narrative */}
        <NarrativeCards analysis={analysis} />

        {/* Bullet rewrites + action plan */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BulletRewriteCarousel rewrites={analysis.bullet_rewrites} />
          <ActionPlan suggestions={analysis.suggestions} />
        </div>

        {/* Skills */}
        <SkillsChips skillsExtracted={analysis.skills_extracted} />
      </div>
    );
  }

  // ── Upload ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#FAF6F0]">
      <UploadForm
        jobRole={jobRole}
        setJobRole={setJobRole}
        file={file}
        setFile={setFile}
        loading={loading}
        error={error}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
