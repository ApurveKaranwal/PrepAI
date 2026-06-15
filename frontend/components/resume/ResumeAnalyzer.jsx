import React, { useState } from 'react';
import { UploadCloud, CheckCircle, XCircle, TrendingUp, AlertCircle, Loader2, Star, Target, FileText, Lightbulb } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

const ResumeAnalyzer = () => {
  const [jobRole, setJobRole] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);

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

    const formData = new FormData();
    formData.append('job_role', jobRole);
    formData.append('resume', file);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
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

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-500 relative overflow-hidden group">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 rounded-full bg-blue-50 blur-[100px] pointer-events-none group-hover:bg-blue-100 transition-colors duration-700" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 rounded-full bg-purple-50 blur-[100px] pointer-events-none group-hover:bg-purple-100 transition-colors duration-700" />
        
        <div className="relative z-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-2">
            Resume Analyzer
          </h1>
          <p className="text-gray-500 text-lg mb-8 font-medium">
            Get instant AI feedback on your resume tailored to your dream job.
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
              <label className="text-sm font-semibold text-gray-700 ml-1 transition-colors group-hover/upload:text-blue-600">Upload Resume (PDF)</label>
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer bg-gray-50 hover:bg-blue-50/50 hover:border-blue-400 transition-all duration-300 group-hover/upload:shadow-inner">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadCloud className="w-8 h-8 text-gray-400 mb-2 group-hover/upload:text-blue-500 transition-colors group-hover/upload:scale-110 duration-300" />
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold text-blue-600">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    {file ? <span className="text-blue-600 font-semibold">{file.name}</span> : "PDF format only (Max 5MB)"}
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
              className="w-full md:w-auto px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:shadow-blue-500/20 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none transition-all duration-300 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Analyzing Resume...</span>
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
            <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 flex flex-col items-center justify-center group hover:-translate-y-1">
              <h2 className="text-xl font-bold text-gray-800 mb-4 group-hover:text-blue-600 transition-colors">ATS Match Score</h2>
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-100 to-indigo-50 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className={`relative z-10 text-6xl md:text-7xl font-black ${getScoreColor(analysis.ats_score)} tracking-tighter drop-shadow-sm`}>
                  {analysis.ats_score}<span className="text-2xl md:text-3xl text-gray-400 font-bold">/100</span>
                </div>
              </div>
              <p className="text-gray-500 text-sm mt-4 text-center leading-relaxed">
                Based on relevance to:<br/>
                <span className="font-bold text-gray-800 bg-gray-50 px-2 py-1 rounded-md mt-1 inline-block">{jobRole}</span>
              </p>
            </div>

            {/* Radar Chart */}
            {analysis.sub_scores && (
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 flex-1 group hover:-translate-y-1 flex flex-col items-center justify-center">
                <h3 className="text-lg font-bold text-gray-800 mb-2 w-full text-center">Score Breakdown</h3>
                <div className="w-full h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                      { subject: 'Skills', A: analysis.sub_scores.skills, fullMark: 100 },
                      { subject: 'Experience', A: analysis.sub_scores.experience, fullMark: 100 },
                      { subject: 'Formatting', A: analysis.sub_scores.formatting, fullMark: 100 },
                      { subject: 'Impact', A: analysis.sub_scores.impact, fullMark: 100 }
                    ]}>
                      <PolarGrid stroke="#e5e7eb" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#4b5563', fontSize: 12, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                      <Radar name="Score" dataKey="A" stroke="#4f46e5" strokeWidth={3} fill="#6366f1" fillOpacity={0.4} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 h-full hover:-translate-y-1">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Star className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-800">Overall Fit</h3>
              </div>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base">
                {analysis.overall_summary || "No summary provided."}
              </p>

              <div className="mt-8 border-t border-gray-50 pt-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-purple-50 rounded-lg">
                    <Target className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800">Missing ATS Keywords</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis.missing_keywords && analysis.missing_keywords.length > 0 ? (
                    analysis.missing_keywords.map((kw, i) => (
                      <span key={i} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full border border-gray-200 hover:border-gray-300 hover:bg-gray-200 transition-colors cursor-default">
                        {kw}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500 italic">No missing keywords detected. Great job!</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Middle Row: Pros, Cons, and Experience Feedback */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-1">
              <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-gray-50">
                <div className="bg-green-50 p-2 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-800">Strengths (Pros)</h3>
              </div>
              <ul className="space-y-4">
                {analysis.pros && analysis.pros.length > 0 ? analysis.pros.map((pt, i) => (
                  <li key={i} className="flex items-start space-x-3 text-sm text-gray-600 group">
                    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-green-500 mt-2 transition-transform group-hover:scale-150 group-hover:bg-green-600"></span>
                    <span className="leading-relaxed group-hover:text-gray-900 transition-colors">{pt}</span>
                  </li>
                )) : <li className="text-sm text-gray-400 italic">None found.</li>}
              </ul>
            </div>

            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-1">
              <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-gray-50">
                <div className="bg-red-50 p-2 rounded-lg">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-800">Weaknesses (Cons)</h3>
              </div>
              <ul className="space-y-4">
                {analysis.cons && analysis.cons.length > 0 ? analysis.cons.map((pt, i) => (
                  <li key={i} className="flex items-start space-x-3 text-sm text-gray-600 group">
                    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-400 mt-2 transition-transform group-hover:scale-150 group-hover:bg-red-600"></span>
                    <span className="leading-relaxed group-hover:text-gray-900 transition-colors">{pt}</span>
                  </li>
                )) : <li className="text-sm text-gray-400 italic">None found.</li>}
              </ul>
            </div>

            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-1">
               <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-gray-50">
                <div className="bg-amber-50 p-2 rounded-lg">
                  <FileText className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-800">Bullet Point Audit</h3>
              </div>
              <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-100/50">
                <p className="text-sm text-gray-700 leading-relaxed font-medium">
                  {analysis.experience_feedback || "No feedback on experience bullet points."}
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Row: Suggestions */}
          <div className="lg:col-span-3">
            <div className="bg-white border border-gray-100 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300 group hover:-translate-y-1">
              <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-gray-50">
                <div className="p-2.5 bg-indigo-50 rounded-xl group-hover:bg-indigo-100 transition-colors duration-300">
                  <Lightbulb className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Actionable Suggestions</h3>
                  <p className="text-xs font-medium text-gray-400 mt-0.5">Steps to improve your resume immediately</p>
                </div>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysis.suggestions && analysis.suggestions.length > 0 ? analysis.suggestions.map((imp, i) => (
                  <li key={i} className="bg-gray-50/50 hover:bg-white rounded-2xl p-5 text-sm text-gray-600 border border-transparent hover:border-indigo-100 hover:shadow-md transition-all duration-300 flex items-start space-x-4 group/item cursor-default hover:-translate-y-0.5">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-black shadow-sm group-hover/item:bg-indigo-600 group-hover/item:text-white group-hover/item:border-indigo-600 transition-colors duration-300">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed group-hover/item:text-gray-900 pt-1">{imp}</span>
                  </li>
                )) : <li className="text-sm text-gray-500 italic p-4">No suggestions provided.</li>}
              </ul>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default ResumeAnalyzer;
