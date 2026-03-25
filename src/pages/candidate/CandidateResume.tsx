import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  TrendingUp,
  Target,
  Lightbulb,
  History,
  Clock,
  FileEdit,
  Video,
  Copy,
  Loader2,
} from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

const API_URL = "http://localhost:5000/api";

interface AnalysisResult {
  atsScore: number;
  keyStrengths: string[];
  areasForImprovement: string[];
  kpiSuggestions: string[];
  suggestedKeywords: string[];
  overallFeedback: string;
  bulletPointRewrites?: { original: string; rewrite: string }[];
}

export default function CandidateResume() {
  const [file, setFile] = useState<File | null>(null);
  const [targetJobDescription, setTargetJobDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  // Cover Letter States
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const [showCoverLetterDialog, setShowCoverLetterDialog] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const userInfoStr = localStorage.getItem("userInfo");
  const userInfo = userInfoStr ? JSON.parse(userInfoStr) : null;
  const config = {
    headers: {
      Authorization: `Bearer ${userInfo?.token}`,
    },
  };

  useEffect(() => {
    const fetchHistory = async () => {
      if (!userInfo?.token) return;
      try {
        const { data } = await axios.get(
          `${API_URL}/resume/optimize/history`,
          config,
        );
        if (data.success) {
          setHistory(data.history);
          if (data.history && data.history.length > 0) {
            setAnalysis(data.history[0]);
          }
        }
      } catch (error) {
        console.error("Failed to load resume history");
      }
    };
    fetchHistory();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const allowedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];

      if (!allowedTypes.includes(selectedFile.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF or DOCX file.",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append("resume", file);
    if (targetJobDescription.trim()) {
      formData.append("targetJobDescription", targetJobDescription.trim());
    }

    try {
      const { data } = await axios.post(
        `${API_URL}/resume/optimize`,
        formData,
        config,
      );

      if (data.success) {
        setAnalysis(data.analysis);
        toast({
          title: "Analysis Complete",
          description: "Your resume has been optimized by AI.",
        });

        // Re-fetch history to update the list
        const historyRes = await axios.get(
          `${API_URL}/resume/optimize/history`,
          config,
        );
        if (historyRes.data.success) setHistory(historyRes.data.history);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error.response?.data?.message || "Failed to analyze resume.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!analysis) return;
    setIsGeneratingCoverLetter(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/resume/cover-letter`,
        {
          targetJobDescription,
          keyStrengths: analysis.keyStrengths,
          overallFeedback: analysis.overallFeedback,
        },
        config,
      );

      if (data.success) {
        setCoverLetter(data.coverLetter);
        setShowCoverLetterDialog(true);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error.response?.data?.message || "Failed to generate cover letter.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const handlePracticeMock = () => {
    navigate("/candidate/mock", {
      state: {
        jobRole: "Skill Gap Refinement",
        jobDescription: `Please format questions to test me on these specific areas of improvement: ${analysis?.areasForImprovement.join(", ")}`,
        autoOpen: true,
      },
    });
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          AI Resume Optimizer
        </h1>
        <p className="text-muted-foreground">
          Get expert feedback and actionable suggestions to beat the ATS.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Side: Upload and Main Results */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resume Upload</CardTitle>
              <CardDescription>
                Upload your resume (PDF/DOCX) for a deep AI scan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,.docx"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 bg-muted/20 hover:bg-muted/30 transition-all cursor-pointer border-primary/20 hover:border-primary/40 group mt-4 mb-4"
              >
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Upload className="h-7 w-7" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-foreground">
                    {file ? file.name : "Select your resume file"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    PDF or DOCX (Max 10MB)
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Target Job Description (Optional)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Paste a job description to score against it for a specific
                  role.
                </p>
                <Textarea
                  className="min-h-[100px] text-sm bg-background/50"
                  placeholder="Paste job description here..."
                  value={targetJobDescription}
                  onChange={(e) => setTargetJobDescription(e.target.value)}
                />
              </div>

              {file && (
                <div className="flex items-center justify-between p-4 rounded-xl border bg-primary/5 border-primary/20 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-primary" />
                    <div>
                      <p className="text-sm font-medium truncate max-w-[200px]">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ready for analysis
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="shadow-lg hover:shadow-primary/20"
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        Analyze with AI
                        <Sparkles className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {history.length > 0 && !analysis && (
            <Card className="animate-in fade-in slide-in-from-bottom-4">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Previous Scans
                </CardTitle>
                <CardDescription>
                  Review your past resume optimization results.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {history.map((item, index) => (
                    <div
                      key={index}
                      onClick={() => setAnalysis(item)}
                      className="flex items-center justify-between p-4 rounded-xl border bg-muted/20 hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">Scan Result</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(item.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="font-bold text-success text-sm flex items-center gap-1">
                        {item.atsScore}% Score
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {analysis && (
            <Card className="animate-in fade-in zoom-in-95 duration-500">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Detailed Analysis</CardTitle>
                  <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full text-primary font-bold text-sm">
                    <TrendingUp className="h-4 w-4" />
                    ATS SCORE: {analysis.atsScore}%
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-primary font-semibold">
                    <CheckCircle2 className="h-5 w-5" />
                    <span>Key Strengths</span>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    {analysis.keyStrengths.map((str, i) => (
                      <div
                        key={i}
                        className="p-3 bg-secondary/30 rounded-lg text-sm border border-secondary"
                      >
                        {str}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-amber-500 font-semibold">
                    <AlertCircle className="h-5 w-5" />
                    <span>Areas for Improvement</span>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    {analysis.areasForImprovement.map((area, i) => (
                      <div
                        key={i}
                        className="p-3 bg-amber-500/5 rounded-lg text-sm border border-amber-500/20"
                      >
                        {area}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-muted/30 rounded-xl space-y-2 border border-border">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-primary" />
                    Overall Feedback
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {analysis.overallFeedback}
                  </p>
                </div>

                {analysis.bulletPointRewrites &&
                  analysis.bulletPointRewrites.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-2 text-primary font-semibold">
                        <Sparkles className="h-5 w-5" />
                        <span>Smart Rewrites</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Upgrade weak bullet points using our AI suggestions.
                      </p>
                      <div className="space-y-4">
                        {analysis.bulletPointRewrites.map((rewrite, i) => (
                          <div key={i} className="grid md:grid-cols-2 gap-4">
                            <div className="p-4 bg-destructive/5 rounded-xl border border-destructive/20 relative">
                              <div className="absolute top-2 right-2 text-[10px] font-bold uppercase text-destructive/70 bg-destructive/10 px-2 py-0.5 rounded">
                                Original
                              </div>
                              <p className="text-sm text-muted-foreground italic mt-2">
                                "{rewrite.original}"
                              </p>
                            </div>
                            <div className="p-4 bg-success/5 rounded-xl border border-success/20 relative">
                              <div className="absolute top-2 right-2 text-[10px] font-bold uppercase text-success bg-success/10 px-2 py-0.5 rounded">
                                Better
                              </div>
                              <p className="text-sm font-medium mt-2">
                                "{rewrite.rewrite}"
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-border">
                  <Button
                    onClick={handleGenerateCoverLetter}
                    disabled={isGeneratingCoverLetter}
                    className="w-full bg-blue-600 hover:bg-blue-700 h-11"
                  >
                    {isGeneratingCoverLetter ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <FileEdit className="w-4 h-4 mr-2" />
                    )}
                    Generate Cover Letter
                  </Button>
                  <Button
                    onClick={handlePracticeMock}
                    variant="outline"
                    className="w-full h-11 border-primary/20 hover:bg-primary/10 text-primary"
                  >
                    <Video className="w-4 h-4 mr-2" />
                    Practice Gaps in Mock Interview
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Side: Quick Insights & Keywords */}
        <div className="space-y-6">
          {analysis ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    KPI Suggestions
                  </CardTitle>
                  <CardDescription>
                    Quantifiable results to impress recruiters.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analysis.kpiSuggestions.map((kpi, i) => (
                    <div
                      key={i}
                      className="p-3 border rounded-lg text-sm italic text-muted-foreground bg-primary/5 border-primary/10"
                    >
                      "{kpi}"
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Suggested Keywords
                  </CardTitle>
                  <CardDescription>
                    Missing technical terms to pass ATS filters.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {analysis.suggestedKeywords.map((tag, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-xs font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="bg-primary/5 border-dashed">
              <CardHeader>
                <CardTitle className="text-lg">Waiting for scan...</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground text-center py-8">
                Upload your resume and click analyze to see detailed AI insights
                here.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog
        open={showCoverLetterDialog}
        onOpenChange={setShowCoverLetterDialog}
      >
        <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileEdit className="h-5 w-5 text-primary" />
              AI Generated Cover Letter
            </DialogTitle>
            <DialogDescription>
              Tailored specifically to your strengths and the target job
              description.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 bg-muted/20 rounded-lg border border-border whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {coverLetter}
          </div>
          <DialogFooter className="mt-4 flex sm:justify-between items-center w-full">
            <Button
              variant="outline"
              onClick={() => setShowCoverLetterDialog(false)}
            >
              Close
            </Button>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(coverLetter);
                toast({ title: "Copied to clipboard!" });
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
