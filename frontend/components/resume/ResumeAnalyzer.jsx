import React, { useState } from 'react';
import { UploadCloud, CheckCircle, XCircle, AlertCircle, Loader2, Star, Target, FileText, Lightbulb, Wand2, Copy, ArrowRight } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

const ResumeAnalyzer = () => {
  const [analysis, setAnalysis] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem('prepflow_latest_resume_analysis');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.analysis) return parsed.analysis;
        }
      } catch (e) {
        console.error("Failed to load resume analysis from localStorage", e);
      }
    }
    return null;
  });
  const [jobRole, setJobRole] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem('prepflow_latest_resume_analysis');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.jobRole) return parsed.jobRole;
        }
      } catch (e) {
        console.error("Failed to load resume analysis from localStorage", e);
      }
    }
    return '';
  });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rewrites, setRewrites] = useState(null);
  const [rewriting, setRewriting] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected && selected.type !== 'application/pdf') {
      setError('Please select a PDF file.');
      setFile(null);
    } else {
      setError('');
      setFile(selected);
    }
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!jobRole.trim()) {
      setError('Please specify a job role.');
      return;
    }
    if (!file) {
      setError('Please upload a resume (PDF).');
      return;
    }

    setLoading(true);
    setError('');
    setAnalysis(null);
    setRewrites(null);

    const formData = new FormData();
    formData.append('job_role', jobRole);
    formData.append('resume', file);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';
      const response = await fetch(`${backendUrl}/api/resume-analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to analyze resume');
      }

      const data = await response.json();
      if (data.status === 'success' && data.analysis) {
        setAnalysis(data.analysis);
        try {
          localStorage.setItem('prepflow_latest_resume_analysis', JSON.stringify({
            analysis: data.analysis,
            fileName: file ? file.name : 'resume.pdf',
            jobRole: jobRole,
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          }));
        } catch (e) {
          console.error("Failed to save resume analysis to localStorage", e);
        }
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error("Resume analysis error:", err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRewrite = async () => {
    setRewriting(true);
    setError('');
    
    const formData = new FormData();
    formData.append('job_role', jobRole);
    formData.append('resume', file);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';
      const response = await fetch(`${backendUrl}/api/resume-rewrite`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to tailor resume');
      }

      const data = await response.json();
      if (data.status === 'success' && data.data && data.data.rewrites) {
        setRewrites(data.data.rewrites);
      } else {
        throw new Error('Invalid rewrite response format');
      }
    } catch (err) {
      console.error("Rewrite error:", err);
      setError(err.message || 'An error occurred while rewriting. Please try again.');
    } finally {
      setRewriting(false);
    }
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getScoreColor = (score) => {
  if (score >= 80) return 'text-[#2E5A44]';
  if (score >= 50) return 'text-[#A6690B]';
  return 'text-[#C85A32]';
};

return (
  <div className="w-full max-w-5xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-[#262626]">
    {!analysis ? (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center min-h-[70vh] py-4">
        {/* Left Column: Product Info & Features */}
        <div className="lg:col-span-5 space-y-6 text-left">
          <div className="space-y-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest bg-[#C85A32]/10 text-[#C85A32] border border-[#C85A32]/20 px-3 py-1 rounded-full font-mono">
              ATS Optimization
            </span>
            <h1 className="text-3xl md:text-4xl font-serif font-medium text-[#262626] leading-tight">
              Resume Analyzer
            </h1>
          </div>
          
          <p className="text-[#6E6359] text-xs md:text-sm leading-relaxed font-medium">
            Ensure your resume isn&apos;t filtered out by automated screeners. Upload your CV and target role to get straightforward, actionable feedback to align with modern hiring standards.
          </p>

          <div className="space-y-4 pt-5 border-t border-[#DFD5C6]/60">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-[#C85A32]/5 border border-[#C85A32]/15 flex items-center justify-center text-[#C85A32] shrink-0">
                <Star className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#262626]">ATS Scoring & Alignment</h4>
                <p className="text-[11px] text-[#6E6359] mt-0.5 leading-relaxed font-medium">Instant calculation of match confidence against your target role profile.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-[#C85A32]/5 border border-[#C85A32]/15 flex items-center justify-center text-[#C85A32] shrink-0">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#262626]">Keyword Gap Discovery</h4>
                <p className="text-[11px] text-[#6E6359] mt-0.5 leading-relaxed font-medium">Scans the job description to identify essential skills and tools missing from your text.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-[#C85A32]/5 border border-[#C85A32]/15 flex items-center justify-center text-[#C85A32] shrink-0">
                <Wand2 className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#262626]">Magic Bullet Rewrite</h4>
                <p className="text-[11px] text-[#6E6359] mt-0.5 leading-relaxed font-medium">Rewrites weak experience sentences into high-impact, results-driven metric bullets.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Upload Card */}
        <div className="lg:col-span-7 bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
          <div className="space-y-1">
            <h3 className="text-lg font-serif text-[#262626] font-medium">Analyze Your Profile</h3>
            <p className="text-xs text-[#6E6359] font-medium">Upload your resume PDF and specify the job title below.</p>
          </div>

          <form onSubmit={handleAnalyze} className="space-y-6">
            <div className="space-y-2 group/input">
              <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono ml-0.5 transition-colors group-hover/input:text-[#C85A32]">Target Job Role</label>
              <input
                type="text"
                required
                placeholder="e.g. Backend Engineer using FastAPI or Bun"
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                className="w-full bg-[#FCFAF7] border border-[#DFD5C6] text-[#262626] rounded-xl px-4 py-3 focus:outline-none focus:ring-4 focus:ring-[#C85A32]/10 focus:border-[#C85A32] transition-all placeholder-[#6E6359]/40 shadow-sm hover:border-[#DFD5C6]/80 text-xs font-medium"
              />
            </div>

            <div className="space-y-2 group/upload">
              <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono ml-0.5">Upload Resume (PDF)</label>
              <label className="flex flex-col items-center justify-center w-full h-44 border border-dashed border-[#DFD5C6] rounded-xl cursor-pointer bg-[#FAF6F0] hover:bg-[#C85A32]/5 hover:border-[#C85A32] transition-colors duration-200">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadCloud className="w-8 h-8 text-[#C85A32] mb-3 animate-bounce" />
                  <p className="text-xs text-[#6E6359]">
                    <span className="font-bold text-[#C85A32] hover:text-[#B83A14]">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-[10px] text-[#6E6359]/70 mt-1 font-mono uppercase tracking-wider">
                    {file ? <span className="text-[#262626] font-bold">{file.name}</span> : "PDF format only"}
                  </p>
                </div>
                <input type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
              </label>
            </div>

            {error && (
              <div className="bg-[#FAF4EB] border border-[#C85A32]/30 text-[#C85A32] p-4 rounded-xl flex items-center space-x-3 text-xs animate-in zoom-in-95 duration-300 shadow-sm font-semibold">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !file || !jobRole.trim()}
              className="w-full py-3 bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] font-bold rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <span>Scan Resume</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    ) : (
      <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-5 shadow-sm transition-all duration-300 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-0.5 text-left">
            <h2 className="text-lg font-serif font-medium text-[#262626] tracking-tight">
              Resume Analyzer
            </h2>
            <p className="text-[#6E6359] text-xs font-medium">
              Tailored for: <span className="font-bold text-[#C85A32]">{jobRole}</span> {file && <span>({file.name})</span>}
            </p>
          </div>
          
          <button
            onClick={() => {
              setAnalysis(null);
              setRewrites(null);
            }}
            className="text-xs font-bold text-[#C85A32] hover:text-[#B83A14] border border-[#C85A32]/20 hover:border-[#C85A32] bg-[#C85A32]/5 px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 self-start md:self-auto hover:scale-[1.01] active:scale-[0.99]"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            Scan Another Resume
          </button>
        </div>
      </div>
    )}

    {analysis && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
        
        {/* Top Row: Score and Overall Summary */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {/* ATS Match Score */}
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-8 shadow-sm flex flex-col items-center justify-center text-center">
            <h2 className="text-lg font-semibold text-[#262626] mb-2">ATS Match Score</h2>
            <div className={`text-6xl md:text-7xl font-bold ${getScoreColor(analysis.ats_score)} tracking-tight`}>
              {analysis.ats_score}<span className="text-2xl text-[#6E6359]/60 font-normal">/100</span>
            </div>
            <p className="text-[#6E6359] text-sm mt-4 font-medium">
              Based on relevance to:<br/>
              <span className="font-bold text-[#C85A32] mt-1 inline-block">{jobRole}</span>
            </p>
          </div>

          {/* Radar Chart */}
          {analysis.sub_scores && (
            <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 shadow-sm flex-1 flex flex-col items-center justify-center">
              <h3 className="text-sm font-semibold text-[#262626] mb-4 w-full text-center font-serif">Score Breakdown</h3>
              <div className="w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                    { subject: 'Skills', A: analysis.sub_scores.skills, fullMark: 100 },
                    { subject: 'Experience', A: analysis.sub_scores.experience, fullMark: 100 },
                    { subject: 'Formatting', A: analysis.sub_scores.formatting, fullMark: 100 },
                    { subject: 'Impact', A: analysis.sub_scores.impact, fullMark: 100 }
                  ]}>
                    <PolarGrid stroke="#DFD5C6" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#6E6359', fontSize: 11, fontWeight: 'bold' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #DFD5C6', backgroundColor: '#FCFAF7', color: '#262626' }} />
                    <Radar name="Score" dataKey="A" stroke="#C85A32" strokeWidth={2.5} fill="#C85A32" fillOpacity={0.08} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-8 shadow-sm h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-[#FAF6F0] rounded-lg border border-[#DFD5C6]/40 text-[#C85A32]">
                  <Star className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-[#262626] font-serif">Overall Fit</h3>
              </div>
              <p className="text-[#6E6359] leading-relaxed text-sm md:text-base font-medium">
                {analysis.overall_summary || "No summary provided."}
              </p>
            </div>

            <div className="mt-8 border-t border-[#DFD5C6] pt-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-[#FAF6F0] rounded-lg border border-[#DFD5C6]/40 text-[#C85A32]">
                  <Target className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-[#262626] font-serif">Missing ATS Keywords</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.missing_keywords && analysis.missing_keywords.length > 0 ? (
                  analysis.missing_keywords.map((kw, i) => (
                    <span key={i} className="px-3 py-1 bg-[#FAF6F0] text-[#6E6359] text-xs font-bold rounded-md border border-[#DFD5C6]">
                      {kw}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-[#6E6359] italic font-medium">No missing keywords detected.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Middle Row: Pros, Cons, and Experience Feedback */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-[#DFD5C6]">
              <div className="bg-[#E8F2EC] p-2 rounded-lg text-[#2E5A44]">
                <CheckCircle className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#262626] font-serif">Strengths (Pros)</h3>
            </div>
            <ul className="space-y-4">
              {analysis.pros && analysis.pros.length > 0 ? analysis.pros.map((pt, i) => (
                <li key={i} className="flex items-start space-x-3 text-sm text-[#6E6359] font-medium">
                  <span className="flex-shrink-0 w-1 h-1 rounded-full bg-[#2E5A44] mt-2"></span>
                  <span className="leading-relaxed">{pt}</span>
                </li>
              )) : <li className="text-sm text-[#6E6359]/60 italic font-medium">None found.</li>}
            </ul>
          </div>

          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-[#DFD5C6]">
              <div className="bg-[#FAF4EB] p-2 rounded-lg text-[#C85A32]">
                <XCircle className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#262626] font-serif">Weaknesses (Cons)</h3>
            </div>
            <ul className="space-y-4">
              {analysis.cons && analysis.cons.length > 0 ? analysis.cons.map((pt, i) => (
                <li key={i} className="flex items-start space-x-3 text-sm text-[#6E6359] font-medium">
                  <span className="flex-shrink-0 w-1 h-1 rounded-full bg-[#C85A32] mt-2"></span>
                  <span className="leading-relaxed">{pt}</span>
                </li>
              )) : <li className="text-sm text-[#6E6359]/60 italic font-medium">None found.</li>}
            </ul>
          </div>

          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 shadow-sm">
             <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-[#DFD5C6]">
              <div className="bg-[#FAF6F0] p-2 rounded-lg text-[#C85A32]">
                <FileText className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#262626] font-serif">Bullet Point Audit</h3>
            </div>
            <div className="bg-[#FAF6F0] rounded-lg p-4 border border-[#DFD5C6]">
              <p className="text-sm text-[#6E6359] leading-relaxed font-medium">
                {analysis.experience_feedback || "No feedback on experience bullet points."}
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Row: Suggestions */}
        <div className="lg:col-span-3">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-8 shadow-sm">
            <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-[#DFD5C6]">
              <div className="p-2 bg-[#FAF6F0] rounded-lg text-[#C85A32]">
                <Lightbulb className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#262626] font-serif">Actionable Suggestions</h3>
                <p className="text-xs text-[#6E6359]/80 mt-0.5 font-medium">Steps to improve your resume immediately</p>
              </div>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.suggestions && analysis.suggestions.length > 0 ? analysis.suggestions.map((imp, i) => (
                <li key={i} className="flex items-start space-x-4 p-4 rounded-xl border border-[#DFD5C6] bg-[#FAF6F0] shadow-3xs">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#FCFAF7] border border-[#DFD5C6] text-[#C85A32] flex items-center justify-center text-xs font-bold shadow-sm">
                    {i + 1}
                  </span>
                  <span className="text-sm text-[#6E6359] leading-relaxed pt-0.5 font-medium">{imp}</span>
                </li>
              )) : <li className="text-sm text-[#6E6359]/60 italic p-4 font-medium">No suggestions provided.</li>}
            </ul>
          </div>
        </div>

        {/* Magic Rewrite Section */}
        <div className="lg:col-span-3 mt-4">
          {!rewrites && (
            <button
              onClick={handleRewrite}
              disabled={rewriting}
              className="w-full relative overflow-hidden rounded-xl border border-[#C85A32] bg-[#FCFAF7] hover:bg-[#C85A32]/5 shadow-sm transition-all duration-200 px-8 py-4 flex items-center justify-center space-x-3 active:scale-[0.99] cursor-pointer"
            >
              {rewriting ? (
                <>
                  <Loader2 className="w-5 h-5 text-[#C85A32] animate-spin" />
                  <span className="font-bold text-[#C85A32]">Crafting your perfect resume...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5 text-[#C85A32]" />
                  <span className="font-bold text-[#C85A32]">
                    Auto-Tailor Resume
                  </span>
                </>
              )}
            </button>
          )}

          {rewrites && (
            <div className="animate-in slide-in-from-bottom-8 duration-700 fade-in zoom-in-95">
              <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-8 shadow-sm">
                <div className="flex items-center space-x-3 mb-8 pb-4 border-b border-[#DFD5C6]">
                  <div className="p-2 bg-[#FAF6F0] rounded-lg text-[#C85A32]">
                    <Wand2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#262626] font-serif">Magic Rewrites</h3>
                    <p className="text-sm text-[#6E6359] mt-0.5 font-medium">Your weakest bullet points, completely optimized for ATS.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {rewrites.map((rw, index) => (
                    <div key={index} className="border border-[#DFD5C6] rounded-xl p-6 bg-[#FCFAF7] shadow-sm">
                      <div className="flex flex-col md:flex-row gap-8">
                        
                        {/* Original */}
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center space-x-2 text-[#6E6359]/70 font-bold text-xs tracking-wider uppercase">
                            <XCircle className="w-4 h-4" />
                            <span>Original</span>
                          </div>
                          <p className="text-[#6E6359]/50 line-through decoration-[#DFD5C6] text-sm leading-relaxed font-medium">
                            {rw.original}
                          </p>
                        </div>

                        <div className="hidden md:flex items-center justify-center text-[#DFD5C6]">
                          <ArrowRight className="w-5 h-5" />
                        </div>

                        {/* Optimized */}
                        <div className="flex-[1.5] space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-[#262626] font-bold text-xs tracking-wider uppercase">
                              <CheckCircle className="w-4 h-4 text-[#2E5A44]" />
                              <span>Optimized</span>
                            </div>
                            <button
                              onClick={() => copyToClipboard(rw.optimized, index)}
                              className="text-[#6E6359] hover:text-[#262626] bg-[#FCFAF7] shadow-sm border border-[#DFD5C6] hover:border-[#C85A32] hover:bg-[#FAF6F0] px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-all active:scale-95 cursor-pointer"
                            >
                              {copiedIndex === index ? (
                                <>
                                  <CheckCircle className="w-3.5 h-3.5 text-[#2E5A44]" />
                                  <span className="text-xs font-bold text-[#2E5A44]">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span className="text-xs font-bold">Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="bg-[#FAF6F0] border border-[#DFD5C6] p-4 rounded-lg">
                            <p className="text-[#262626] font-semibold text-sm leading-relaxed">
                              {rw.optimized}
                            </p>
                          </div>
                          <p className="text-xs text-[#6E6359] mt-2 font-medium">
                            {rw.explanation}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
);
};

export default ResumeAnalyzer;
