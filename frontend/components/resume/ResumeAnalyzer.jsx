import React, { useState } from 'react';
import { UploadCloud, CheckCircle, XCircle, TrendingUp, AlertCircle, Loader2, Star, Target, FileText, Lightbulb, Wand2, Copy, ArrowRight } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

const ResumeAnalyzer = () => {
  const [jobRole, setJobRole] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
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
    if (score >= 80) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-rose-600';
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm transition-all duration-300 relative overflow-hidden">
        <div className="relative z-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight mb-2">
            Resume Analyzer
          </h1>
          <p className="text-gray-500 text-lg mb-8 font-normal">
            Get straightforward feedback on your resume tailored to your target job.
          </p>

          <form onSubmit={handleAnalyze} className="space-y-6">
            <div className="space-y-2 group/input">
              <label className="text-sm font-semibold text-gray-700 ml-1 transition-colors group-hover/input:text-blue-600">Target Job Role</label>
              <input
                type="text"
                placeholder="e.g. Backend Engineer using FastAPI or Bun"
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-gray-400 shadow-sm hover:border-gray-300"
              />
            </div>

            <div className="space-y-2 group/upload">
              <label className="text-sm font-semibold text-gray-700 ml-1">Upload Resume (PDF)</label>
              <label className="flex flex-col items-center justify-center w-full h-32 border border-dashed border-gray-300 rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors duration-200">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadCloud className="w-6 h-6 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold text-gray-900">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {file ? <span className="text-gray-900 font-semibold">{file.name}</span> : "PDF format only"}
                  </p>
                </div>
                <input type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-center space-x-3 text-sm animate-in zoom-in-95 duration-300 shadow-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !file || !jobRole.trim()}
              className="w-full md:w-auto px-6 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <span>Scan Resume</span>
              )}
            </button>
          </form>
        </div>
      </div>

      {analysis && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
          
          {/* Top Row: Score and Overall Summary */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            {/* ATS Match Score */}
            <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm flex flex-col items-center justify-center text-center">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">ATS Match Score</h2>
              <div className={`text-6xl md:text-7xl font-bold ${getScoreColor(analysis.ats_score)} tracking-tight`}>
                {analysis.ats_score}<span className="text-2xl text-gray-400 font-normal">/100</span>
              </div>
              <p className="text-gray-500 text-sm mt-4">
                Based on relevance to:<br/>
                <span className="font-medium text-gray-900 mt-1 inline-block">{jobRole}</span>
              </p>
            </div>

            {/* Radar Chart */}
            {analysis.sub_scores && (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex-1 flex flex-col items-center justify-center">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 w-full text-center">Score Breakdown</h3>
                <div className="w-full h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                      { subject: 'Skills', A: analysis.sub_scores.skills, fullMark: 100 },
                      { subject: 'Experience', A: analysis.sub_scores.experience, fullMark: 100 },
                      { subject: 'Formatting', A: analysis.sub_scores.formatting, fullMark: 100 },
                      { subject: 'Impact', A: analysis.sub_scores.impact, fullMark: 100 }
                    ]}>
                      <PolarGrid stroke="#f3f4f6" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: 'none' }} />
                      <Radar name="Score" dataKey="A" stroke="#111827" strokeWidth={2} fill="#374151" fillOpacity={0.05} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm h-full">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Star className="w-5 h-5 text-gray-700" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Overall Fit</h3>
              </div>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                {analysis.overall_summary || "No summary provided."}
              </p>

              <div className="mt-8 border-t border-gray-100 pt-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Target className="w-5 h-5 text-gray-700" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">Missing ATS Keywords</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis.missing_keywords && analysis.missing_keywords.length > 0 ? (
                    analysis.missing_keywords.map((kw, i) => (
                      <span key={i} className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-md border border-gray-200">
                        {kw}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500 italic">No missing keywords detected.</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Middle Row: Pros, Cons, and Experience Feedback */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-gray-100">
                <div className="bg-gray-100 p-2 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-gray-700" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Strengths (Pros)</h3>
              </div>
              <ul className="space-y-4">
                {analysis.pros && analysis.pros.length > 0 ? analysis.pros.map((pt, i) => (
                  <li key={i} className="flex items-start space-x-3 text-sm text-gray-600">
                    <span className="flex-shrink-0 w-1 h-1 rounded-full bg-gray-400 mt-2"></span>
                    <span className="leading-relaxed">{pt}</span>
                  </li>
                )) : <li className="text-sm text-gray-400 italic">None found.</li>}
              </ul>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-gray-100">
                <div className="bg-gray-100 p-2 rounded-lg">
                  <XCircle className="w-4 h-4 text-gray-700" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Weaknesses (Cons)</h3>
              </div>
              <ul className="space-y-4">
                {analysis.cons && analysis.cons.length > 0 ? analysis.cons.map((pt, i) => (
                  <li key={i} className="flex items-start space-x-3 text-sm text-gray-600">
                    <span className="flex-shrink-0 w-1 h-1 rounded-full bg-gray-400 mt-2"></span>
                    <span className="leading-relaxed">{pt}</span>
                  </li>
                )) : <li className="text-sm text-gray-400 italic">None found.</li>}
              </ul>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
               <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-gray-100">
                <div className="bg-gray-100 p-2 rounded-lg">
                  <FileText className="w-4 h-4 text-gray-700" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Bullet Point Audit</h3>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                <p className="text-sm text-gray-600 leading-relaxed">
                  {analysis.experience_feedback || "No feedback on experience bullet points."}
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Row: Suggestions */}
          <div className="lg:col-span-3">
            <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
              <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-gray-100">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Lightbulb className="w-5 h-5 text-gray-700" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Actionable Suggestions</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Steps to improve your resume immediately</p>
                </div>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysis.suggestions && analysis.suggestions.length > 0 ? analysis.suggestions.map((imp, i) => (
                  <li key={i} className="flex items-start space-x-4 p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-600 flex items-center justify-center text-xs font-medium shadow-sm">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-600 leading-relaxed pt-0.5">{imp}</span>
                  </li>
                )) : <li className="text-sm text-gray-500 italic p-4">No suggestions provided.</li>}
              </ul>
            </div>
          </div>

          {/* Magic Rewrite Section */}
          <div className="lg:col-span-3 mt-4">
            {!rewrites && (
              <button
                onClick={handleRewrite}
                disabled={rewriting}
                className="w-full relative overflow-hidden rounded-xl border border-gray-200 bg-white hover:bg-gray-50 shadow-sm transition-all duration-200 px-8 py-4 flex items-center justify-center space-x-3 active:scale-[0.99]"
              >
                {rewriting ? (
                  <>
                    <Loader2 className="w-5 h-5 text-gray-900 animate-spin" />
                    <span className="font-semibold text-gray-900">Crafting your perfect resume...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5 text-gray-900" />
                    <span className="font-semibold text-gray-900">
                      Auto-Tailor Resume
                    </span>
                  </>
                )}
              </button>
            )}

            {rewrites && (
              <div className="animate-in slide-in-from-bottom-8 duration-700 fade-in zoom-in-95">
                <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
                  <div className="flex items-center space-x-3 mb-8 pb-4 border-b border-gray-100">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Wand2 className="w-5 h-5 text-gray-700" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Magic Rewrites</h3>
                      <p className="text-sm text-gray-500 mt-0.5">Your weakest bullet points, completely optimized for ATS.</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {rewrites.map((rw, index) => (
                      <div key={index} className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm">
                        <div className="flex flex-col md:flex-row gap-8">
                          
                          {/* Original */}
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center space-x-2 text-gray-500 font-semibold text-xs tracking-wider uppercase">
                              <XCircle className="w-4 h-4" />
                              <span>Original</span>
                            </div>
                            <p className="text-gray-400 line-through decoration-gray-300 text-sm leading-relaxed">
                              {rw.original}
                            </p>
                          </div>

                          <div className="hidden md:flex items-center justify-center text-gray-300">
                            <ArrowRight className="w-5 h-5" />
                          </div>

                          {/* Optimized */}
                          <div className="flex-[1.5] space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2 text-gray-900 font-bold text-xs tracking-wider uppercase">
                                <CheckCircle className="w-4 h-4 text-gray-700" />
                                <span>Optimized</span>
                              </div>
                              <button
                                onClick={() => copyToClipboard(rw.optimized, index)}
                                className="text-gray-500 hover:text-gray-900 bg-white shadow-sm border border-gray-200 hover:border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded-md flex items-center space-x-1.5 transition-all active:scale-95"
                              >
                                {copiedIndex === index ? (
                                  <>
                                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="text-xs font-semibold text-emerald-600">Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span className="text-xs font-medium">Copy</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <div className="bg-gray-50 border border-gray-100 p-4 rounded-lg">
                              <p className="text-gray-900 font-medium text-sm leading-relaxed">
                                {rw.optimized}
                              </p>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
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
