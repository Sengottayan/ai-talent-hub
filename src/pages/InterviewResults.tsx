import { useState, useEffect } from "react";
import {
  CheckCircle,
  XCircle,
  Star,
  MessageSquare,
  Award,
  TrendingUp,
  Loader2,
  Filter,
  FileText,
  History,
  AlertTriangle,
  Clock,
  User,
  Bot,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from "recharts";

import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import api from "@/lib/api";

interface InterviewResult {
  _id: string;
  interview_id: string;
  email: string;
  candidate_id: string;
  candidate_name: string;
  role?: string;
  interviewDate?: string;
  scores: Record<string, number>;
  totalScore: number;
  maxTotalScore: number;
  evaluation_summary: string;
  strengths: string[];
  improvements: string[];
  decision: "pending" | "selected" | "rejected" | "on-hold";
  violationCount?: number;
  antiCheatingState?: {
    totalEvents?: number;
    autoTerminated?: boolean;
    finalScore?: number;
  };
  conversationTranscript?: {
    role: string;
    content: string;
    timestamp: string;
  }[];
  responses?: {
    question: string;
    answer: string;
    timestamp?: string;
  }[];
  interviewType?: string;
  jobRole?: string;
  codingSubmission?: any;
}

export default function InterviewResults() {
  const [results, setResults] = useState<InterviewResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterInterviewId, setFilterInterviewId] = useState<string>("");
  const { toast } = useToast();

  // Modal State
  const [selectedResult, setSelectedResult] = useState<InterviewResult | null>(
    null,
  );
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isViolationsOpen, setIsViolationsOpen] = useState(false);
  const [violationEvents, setViolationEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Coding Results Modal State
  const [isCodingOpen, setIsCodingOpen] = useState(false);
  const [codingSubmissions, setCodingSubmissions] = useState<any[]>([]);
  const [loadingCoding, setLoadingCoding] = useState(false);

  const fetchResults = async (interviewId?: string) => {
    setIsLoading(true);
    try {
      const url = interviewId
        ? `/interviews/results/${interviewId}`
        : `/interviews/results/all`;
      const { data } = await api.get(url);

      const mappedResults = data.map((r: any) => {
        const scoresValues = Object.values(r.scores || {}) as number[];
        const total = scoresValues.reduce((a, b) => a + b, 0);
        return {
          ...r,
          totalScore: total,
          maxTotalScore: scoresValues.length * 10 || 50,
        };
      });
      setResults(mappedResults);
    } catch (error) {
      console.error("Error fetching results:", error);
      toast({
        title: "Error",
        description: "Failed to fetch interview results",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchViolationEvents = async (interviewId: string, email: string) => {
    setLoadingEvents(true);
    try {
      const { data } = await api.get(
        `/interviews/anti-cheating-events/${interviewId}/${email}`,
      );
      if (data.success) {
        setViolationEvents(data.data);
      }
    } catch (error) {
      console.error("Error fetching violations:", error);
      toast({
        title: "Error",
        description: "Failed to fetch violation logs",
        variant: "destructive",
      });
    } finally {
      setLoadingEvents(false);
    }
  };

  const fetchCodingSubmissions = async (interviewId: string, email: string) => {
    setLoadingCoding(true);
    try {
      const { data } = await api.get(
        `/interviews/coding-submissions/${interviewId}/${email}`,
      );
      if (data.success) {
        setCodingSubmissions(data.data);
      }
    } catch (error) {
      console.error("Error fetching coding submissions:", error);
      toast({
        title: "Error",
        description: "Failed to fetch coding submissions",
        variant: "destructive",
      });
    } finally {
      setLoadingCoding(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, []);

  const handleDecision = async (
    id: string,
    candidate_id: string,
    interview_id: string,
    decision: "selected" | "rejected",
  ) => {
    try {
      await api.post(`/interviews/results`, {
        interview_id,
        candidate_id,
        decision,
      });

      setResults((prev) =>
        prev.map((r) => (r._id === id ? { ...r, decision } : r)),
      );

      toast({
        title: `Candidate ${decision.charAt(0).toUpperCase() + decision.slice(1)}`,
        description: `The candidate status has been updated to ${decision}.`,
        variant: decision === "rejected" ? "destructive" : "default",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update decision",
        variant: "destructive",
      });
    }
  };

  const openTranscript = (result: InterviewResult) => {
    setSelectedResult(result);
    setIsTranscriptOpen(true);
  };

  const openViolations = (result: InterviewResult) => {
    setSelectedResult(result);
    setIsViolationsOpen(true);
    fetchViolationEvents(result.interview_id, result.email);
  };

  const openCoding = (result: InterviewResult) => {
    setSelectedResult(result);
    setIsCodingOpen(true);
    fetchCodingSubmissions(result.interview_id, result.email);
  };

  const getScoreColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 80) return "text-success";
    if (percentage >= 60) return "text-primary";
    return "text-warning";
  };

  const pendingCount = results.filter((r) => r.decision === "pending").length;
  const selectedCount = results.filter((r) => r.decision === "selected").length;
  const rejectedCount = results.filter((r) => r.decision === "rejected").length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Interview Results
          </h1>
          <p className="mt-1 text-muted-foreground">
            Review detailed AI assessments and finalize hiring decisions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter by Interview ID..."
              className="h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={filterInterviewId}
              onChange={(e) => setFilterInterviewId(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && fetchResults(filterInterviewId)
              }
            />
          </div>
          <Button onClick={() => fetchResults(filterInterviewId)}>Apply</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="flex items-center gap-4 p-6">
                <Skeleton className="h-12 w-12 rounded-lg bg-slate-100" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-8 bg-slate-200" />
                  <Skeleton className="h-4 w-24 bg-slate-100" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-warning/10 p-3">
                  <Star className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {pendingCount}
                  </p>
                  <p className="text-sm text-muted-foreground">Pending Decision</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-success/10 p-3">
                  <Award className="h-6 w-6 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {selectedCount}
                  </p>
                  <p className="text-sm text-muted-foreground">Selected</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-destructive/10 p-3">
                  <XCircle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {rejectedCount}
                  </p>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Results */}
      <div className="space-y-6 pb-12">
        {isLoading ? (
          [...Array(2)].map((_, i) => (
            <Card key={i} className="overflow-hidden border-border shadow-sm">
              <CardHeader className="border-b border-border bg-muted/20">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-14 w-14 rounded-full bg-slate-200" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-6 w-48 bg-slate-200" />
                    <Skeleton className="h-4 w-64 bg-slate-100" />
                  </div>
                  <Skeleton className="h-12 w-24 bg-slate-200" />
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid gap-8 lg:grid-cols-2">
                  <Skeleton className="h-80 w-full bg-slate-50 rounded-xl" />
                  <div className="space-y-4">
                    <Skeleton className="h-32 w-full bg-slate-50 rounded-xl" />
                    <Skeleton className="h-40 w-full bg-slate-50 rounded-xl" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : results.length > 0 ? (
          results.map((result) => (
            <Card
              key={result._id}
              className="overflow-hidden border-border shadow-sm transition-shadow hover:shadow-md"
            >
              <CardHeader className="border-b border-border bg-muted/20">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                      {result.candidate_name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-xl">
                          {result.candidate_name}
                        </CardTitle>
                      </div>
                      <CardDescription>
                        Interview ID:{" "}
                        <span className="font-mono text-xs">
                          {result.interview_id}
                        </span>
                        <span className="mx-2">•</span>
                        {result.email}
                      </CardDescription>
                      <div className="mt-1 flex gap-2">
                        {result.interviewType && (
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
                            {result.interviewType}
                          </span>
                        )}
                        {result.jobRole && (
                          <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                            {result.jobRole}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <div className="space-y-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs flex items-center gap-2"
                        onClick={() => openTranscript(result)}
                      >
                        <FileText className="w-3 h-3" />
                        View Transcript
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs flex items-center gap-2 border-amber-200 hover:bg-amber-50"
                        onClick={() => openViolations(result)}
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        Violations Log
                      </Button>
                      {result.interviewType === "Problem Solving" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs flex items-center gap-2 border-indigo-200 hover:bg-indigo-50 text-indigo-700"
                          onClick={() => openCoding(result)}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="16 18 22 12 16 6"></polyline>
                            <polyline points="8 6 2 12 8 18"></polyline>
                          </svg>
                          View Code
                        </Button>
                      )}
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-border min-w-[80px]">
                      <p className="text-2xl font-bold text-foreground">
                        {result.totalScore}/{result.maxTotalScore}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
                        Final Score
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid gap-8 lg:grid-cols-2">
                  <div className="space-y-6">
                    {/* Skill Scores */}
                    <div className="space-y-4">
                      <h4 className="flex items-center gap-2 font-semibold text-foreground">
                        <TrendingUp className="h-4 w-4" />
                        AI Skill Assessment
                      </h4>

                      {/* Radar Chart */}
                      {Object.keys(result.scores || {}).length >= 3 && (
                        <div className="h-[280px] w-full mt-2 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-200 shadow-sm p-2 relative overflow-hidden">
                          <div className="absolute top-2 right-3 flex items-center gap-1.5 opacity-60">
                            <span className="w-2 h-2 rounded-full bg-blue-500 shadow-sm"></span>
                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                              Radar View
                            </span>
                          </div>
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart
                              cx="50%"
                              cy="50%"
                              outerRadius="65%"
                              data={Object.entries(result.scores || {}).map(
                                ([skill, score]) => ({
                                  subject: skill,
                                  score: score,
                                  fullMark: 10,
                                }),
                              )}
                            >
                              <PolarGrid
                                stroke="#e2e8f0"
                                strokeDasharray="3 3"
                              />
                              <PolarAngleAxis
                                dataKey="subject"
                                tick={{
                                  fill: "#334155",
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              />
                              <PolarRadiusAxis
                                angle={90}
                                domain={[0, 10]}
                                tick={{ fill: "#94a3b8", fontSize: 10 }}
                                tickCount={6}
                                orientation="middle"
                              />
                              <Radar
                                name={result.candidate_name}
                                dataKey="score"
                                stroke="#3b82f6"
                                strokeWidth={2.5}
                                fill="#3b82f6"
                                fillOpacity={0.25}
                                activeDot={{
                                  r: 4,
                                  fill: "#2563eb",
                                  stroke: "#ffffff",
                                  strokeWidth: 2,
                                }}
                              />
                              <ChartTooltip
                                contentStyle={{
                                  borderRadius: "12px",
                                  border: "1px solid #e2e8f0",
                                  boxShadow:
                                    "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                                  fontSize: "13px",
                                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                                  backdropFilter: "blur(4px)",
                                }}
                                itemStyle={{
                                  color: "#0f172a",
                                  fontWeight: "bold",
                                }}
                                formatter={(value: number) => [
                                  `${value} / 10`,
                                  "Score",
                                ]}
                              />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      <div className="space-y-4 pt-2">
                        {Object.entries(result.scores || {}).map(
                          ([skill, score]) => (
                            <div key={skill} className="space-y-1.5">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                  {skill}
                                </span>
                                <span
                                  className={`font-semibold ${getScoreColor(score, 10)}`}
                                >
                                  {score}/10
                                </span>
                              </div>
                              <Progress value={score * 10} className="h-2" />
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    {/* Integrity Logs Summary */}
                    <div className="space-y-4 pt-4 border-t border-border/50">
                      <h4 className="flex items-center gap-2 font-semibold text-foreground">
                        <Award
                          className={`h-4 w-4 ${(result.violationCount || 0) > 5 ? "text-destructive" : "text-success"}`}
                        />
                        Integrity Summary
                      </h4>
                      <div
                        className={`rounded-xl border ${(result.violationCount || 0) > 5 ? "border-destructive/20 bg-destructive/5" : "border-success/20 bg-success/5"} p-4`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-700">
                            Suspicion Level
                          </span>
                          <span
                            className={`text-lg font-bold ${(result.violationCount || 0) > 5 ? "text-destructive" : "text-success"}`}
                          >
                            {result.violationCount || 0} / 10
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                            <span>Focus Loss Events</span>
                            <span className="text-slate-900">
                              {result.antiCheatingState?.totalEvents || 0} times
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Status</span>
                            <span
                              className={
                                result.antiCheatingState?.autoTerminated
                                  ? "text-destructive font-bold"
                                  : "text-success font-bold"
                              }
                            >
                              {result.antiCheatingState?.autoTerminated
                                ? "AUTO-TERMINATED"
                                : "Completed Normally"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI Analysis */}
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <h4 className="flex items-center gap-2 font-semibold text-foreground">
                        <MessageSquare className="h-4 w-4" />
                        Evaluation Summary
                      </h4>
                      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
                        {result.evaluation_summary}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 rounded-lg bg-success/5 p-3 border border-success/10">
                        <h5 className="flex items-center gap-1 text-sm font-semibold text-success">
                          <CheckCircle className="h-4 w-4" />
                          Strengths
                        </h5>
                        <ul className="space-y-1">
                          {result.strengths?.map((s, i) => (
                            <li
                              key={i}
                              className="text-xs text-muted-foreground flex items-top gap-1.5"
                            >
                              <span className="block h-1 w-1 rounded-full bg-success mt-1.5 shrink-0" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-2 rounded-lg bg-warning/5 p-3 border border-warning/10">
                        <h5 className="flex items-center gap-1 text-sm font-semibold text-warning">
                          <TrendingUp className="h-4 w-4" />
                          Key Improvements
                        </h5>
                        <ul className="space-y-1">
                          {result.improvements?.map((s, i) => (
                            <li
                              key={i}
                              className="text-xs text-muted-foreground flex items-top gap-1.5"
                            >
                              <span className="block h-1 w-1 rounded-full bg-warning mt-1.5 shrink-0" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* NEW: Detailed Q&A Responses */}
                    {result.responses && result.responses.length > 0 && (
                      <div className="space-y-3 pt-4 border-t border-border/50">
                        <h4 className="flex items-center gap-2 font-semibold text-foreground text-sm">
                          <FileText className="h-4 w-4 text-blue-500" />
                          Detailed Interview Responses
                        </h4>
                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                          {result.responses.map((resp, idx) => (
                            <div
                              key={idx}
                              className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2"
                            >
                              <p className="text-xs font-bold text-slate-700 leading-tight">
                                Q: {resp.question}
                              </p>
                              <p className="text-xs text-slate-600 pl-3 border-l-2 border-slate-200">
                                {resp.answer}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-8 flex justify-end gap-3 border-t border-border pt-6">
                  {result.decision === "pending" ? (
                    <>
                      <Button
                        variant="outline"
                        className="border-destructive text-destructive hover:bg-destructive hover:text-white"
                        onClick={() =>
                          handleDecision(
                            result._id,
                            result.candidate_id,
                            result.interview_id,
                            "rejected",
                          )
                        }
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        onClick={() =>
                          handleDecision(
                            result._id,
                            result.candidate_id,
                            result.interview_id,
                            "selected",
                          )
                        }
                        className="bg-success hover:bg-success/90"
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Select Candidate
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      Decision made:{" "}
                      <span className="font-bold uppercase">
                        {result.decision}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
            <div className="rounded-full bg-muted p-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">
              No results found
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              {filterInterviewId
                ? `We couldn't find any results for interview ID "${filterInterviewId}"`
                : "Results will appear here once candidates complete their interviews."}
            </p>
            {filterInterviewId && (
              <Button
                variant="link"
                onClick={() => {
                  setFilterInterviewId("");
                  fetchResults("");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Transcript Modal */}
      <Dialog open={isTranscriptOpen} onOpenChange={setIsTranscriptOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <DialogTitle>Interview Transcript</DialogTitle>
                <DialogDescription>
                  Full conversation log for {selectedResult?.candidate_name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4 py-4">
              {selectedResult?.conversationTranscript &&
                selectedResult.conversationTranscript.length > 0 ? (
                selectedResult.conversationTranscript.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.role === "assistant" ? "items-start" : "items-end"}`}
                  >
                    <div
                      className={`flex items-center gap-2 mb-1 ${msg.role === "assistant" ? "flex-row" : "flex-row-reverse"}`}
                    >
                      {msg.role === "assistant" ? (
                        <Bot className="w-3 h-3 text-blue-600" />
                      ) : (
                        <User className="w-3 h-3 text-slate-600" />
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {msg.role === "assistant"
                          ? "AI Interviewer"
                          : "Candidate"}
                      </span>
                      <span className="text-[10px] text-slate-300">
                        {msg.timestamp
                          ? new Date(msg.timestamp).toLocaleTimeString()
                          : ""}
                      </span>
                    </div>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === "assistant"
                          ? "bg-blue-50 text-blue-900 rounded-tl-none border border-blue-100"
                          : "bg-slate-100 text-slate-900 rounded-tr-none border border-slate-200"
                        }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-muted-foreground italic">
                  No transcript available for this session.
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>      {/* Violations Modal */}
      <Dialog open={isViolationsOpen} onOpenChange={setIsViolationsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <DialogTitle>Violation &amp; Focus Timeline</DialogTitle>
                <DialogDescription>
                  Integrity monitoring logs for {selectedResult?.candidate_name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            {loadingEvents ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
                <p className="text-sm text-slate-500">
                  Loading monitoring data...
                </p>
              </div>
            ) : (() => {
              // Filter out zero-impact log-only events from display
              const DISPLAY_HIDDEN_EVENTS = ["window_focus", "mouse_enter", "mouse_leave"];
              const displayEvents = violationEvents.filter(
                (e) => !DISPLAY_HIDDEN_EVENTS.includes(e.event_type)
              );

              // Metadata for each event type
              const EVENT_META: Record<string, {
                label: string;
                description: string;
                severity: "critical" | "warning" | "info";
              }> = {
                visibility_hidden: {
                  label: "Tab Hidden / Minimized",
                  description: "Interview tab was switched, minimized, or the screen was locked.",
                  severity: "warning",
                },
                window_blur: {
                  label: "Window Lost Focus",
                  description: "Interview window lost focus — candidate switched to another application.",
                  severity: "warning",
                },
                multi_face_detected: {
                  label: "Multiple Faces Detected",
                  description: "More than one person was detected in the camera frame. This is a serious violation.",
                  severity: "critical",
                },
                no_face_detected: {
                  label: "Face Not Visible",
                  description: "Candidate's face was not detected in the camera frame.",
                  severity: "info",
                },
                tab_switch: {
                  label: "Tab Switch",
                  description: "Candidate switched away from the interview tab.",
                  severity: "warning",
                },
              };

              const getSeverityStyle = (severity: string) => {
                switch (severity) {
                  case "critical": return { dot: "bg-red-500", card: "border-red-100 bg-red-50/40", badge: "bg-red-100 text-red-700", icon: "bg-red-100" };
                  case "warning": return { dot: "bg-amber-500", card: "border-amber-100 bg-amber-50/40", badge: "bg-amber-100 text-amber-700", icon: "bg-amber-100" };
                  default: return { dot: "bg-blue-400", card: "border-slate-100 bg-white", badge: "bg-slate-100 text-slate-600", icon: "bg-blue-50" };
                }
              };

              return displayEvents.length > 0 ? (
                <div className="relative space-y-4 py-4 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                  {displayEvents.map((event, idx) => {
                    const meta = EVENT_META[event.event_type] ?? {
                      label: event.event_type.replace(/_/g, " ").toUpperCase(),
                      description: "",
                      severity: "info",
                    };
                    const style = getSeverityStyle(meta.severity);
                    // Compute score delta from adjacent events
                    const prevScore = idx > 0 ? displayEvents[idx - 1].suspicious_score : 0;
                    const scoreDelta = event.suspicious_score - prevScore;

                    return (
                      <div
                        key={idx}
                        className="relative flex items-start gap-4 pl-10"
                      >
                        {/* Timeline dot */}
                        <div
                          className={`absolute left-0 w-10 h-10 rounded-full flex items-center justify-center border-4 border-white shadow-sm ${style.icon}`}
                        >
                          {meta.severity === "critical" ? (
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                          ) : meta.severity === "warning" ? (
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                          ) : (
                            <History className="w-4 h-4 text-blue-600" />
                          )}
                        </div>

                        {/* Event card */}
                        <div className={`flex-1 p-3 rounded-xl border shadow-sm ${style.card}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold uppercase text-slate-900 tracking-wide">
                              {meta.label}
                            </span>
                            <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                              {event.timestamp_str || "—"}
                            </span>
                          </div>

                          {meta.description && (
                            <p className="text-xs text-slate-600 mb-2">
                              {meta.description}
                            </p>
                          )}

                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Cumulative score */}
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${event.suspicious_score >= 8
                                  ? "bg-red-100 text-red-700"
                                  : event.suspicious_score >= 5
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                            >
                              Score: {event.suspicious_score} / 10
                            </span>

                            {/* Score delta (only show if > 0) */}
                            {scoreDelta > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-50 text-red-500 border border-red-100">
                                +{scoreDelta} pts
                              </span>
                            )}

                            {/* Duration away (for tab-switch events) */}
                            {event.duration_ms > 0 && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {Math.round(event.duration_ms / 1000)}s away
                              </span>
                            )}

                            {/* Face count (for multi-face events) */}
                            {event.faceCount > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-50 text-red-500 border border-red-100">
                                {event.faceCount} faces
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200 mt-4">
                  <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium text-slate-900">
                    Perfect Focus!
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    No violations or focus loss detected for this session.
                  </p>
                </div>
              );
            })()}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Coding Submissions Modal */}
      <Dialog open={isCodingOpen} onOpenChange={setIsCodingOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-indigo-600"
                >
                  <polyline points="16 18 22 12 16 6"></polyline>
                  <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
              </div>
              <div>
                <DialogTitle>Coding Responses</DialogTitle>
                <DialogDescription>
                  Code submissions and test cases for{" "}
                  {selectedResult?.candidate_name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            {loadingCoding ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            ) : codingSubmissions.length > 0 ? (
              <div className="space-y-6 py-4">
                {codingSubmissions.map((sub, idx) => (
                  <Card key={idx} className="overflow-hidden">
                    <CardHeader className="bg-muted/30 pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base">
                            Question {sub.questionIndex + 1}
                          </CardTitle>
                          <p className="text-sm border-l-2 pl-3 mt-2 font-medium">
                            {sub.question}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${sub.allPassed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                        >
                          {sub.allPassed ? "ALL PASSED" : "TESTS FAILED"}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="bg-[#1e1e1e] p-4 text-[#d4d4d4] font-mono text-xs overflow-x-auto">
                        <pre>
                          <code>{sub.code}</code>
                        </pre>
                      </div>

                      <div className="p-4 bg-slate-50 border-t">
                        <h5 className="text-xs font-bold text-slate-500 uppercase mb-2 outline-none">
                          Test Cases
                        </h5>
                        <div className="grid gap-2">
                          {sub.results &&
                            sub.results.map((tc: any, tIdx: number) => (
                              <div
                                key={tIdx}
                                className={`p-2 rounded text-xs border ${tc.passed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}
                              >
                                <span className="font-bold mr-2">
                                  Test {tIdx + 1}:
                                </span>{" "}
                                {tc.passed ? "✅ Passed" : "❌ Failed"}
                                {!tc.passed && (
                                  <div className="mt-2 text-[11px] grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="font-bold text-slate-500">
                                        Expected:
                                      </span>{" "}
                                      <br />
                                      {tc.expectedOutput}
                                    </div>
                                    <div>
                                      <span className="font-bold text-slate-500">
                                        Output:
                                      </span>{" "}
                                      <br />
                                      {tc.actualOutput}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground italic">
                No coding submissions recorded for this session.
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
