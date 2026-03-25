import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Bot,
  PhoneOff,
  FileText,
  Loader2,
  ShieldAlert,
  Clock,
  User,
  Mail,
  CheckCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { RetellWebClient } from "retell-client-js-sdk";
import { VideoPanel } from "@/components/interview/VideoPanel";
import { InterviewStorage } from "@/utils/InterviewStorage";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

type SessionState =
  | "loading"
  | "precheck"
  | "ready"
  | "interview"
  | "ending"
  | "error";

export default function InterviewSession() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Retell Client Ref
  const retellClient = useRef<RetellWebClient | null>(null);

  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [interviewData, setInterviewData] = useState<any>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);

  // User Context State
  const [candidateName, setCandidateName] = useState<string>("");
  const [candidateEmail, setCandidateEmail] = useState<string>("");

  // UI State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showBackNavDialog, setShowBackNavDialog] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Monitoring State
  const [violations, setViolations] = useState<
    { type: string; timestamp: string; description?: string }[]
  >([]);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [backNavAttempts, setBackNavAttempts] = useState(0);

  // Transcript State
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [transcriptHistory, setTranscriptHistory] = useState<
    { role: string; content: string }[]
  >([]);

  // 0. AUTH & CONTEXT CHECK
  useEffect(() => {
    const loadContext = () => {
      const userInfoStr = localStorage.getItem("userInfo");

      if (!userInfoStr) {
        // Redirect if not logged in
        const currentPath = window.location.pathname;
        navigate(`/login?redirect=${encodeURIComponent(currentPath)}`);
        return;
      }

      try {
        const userInfo = JSON.parse(userInfoStr);
        // Priority: UserInfo Name > "Candidate"
        setCandidateName(userInfo.name || "Candidate");
        setCandidateEmail(userInfo.email || "");
        console.log("Context Loaded:", {
          name: userInfo.name,
          email: userInfo.email,
        });
      } catch (e) {
        console.error("Failed to parse user info");
        navigate("/login");
      }
    };

    loadContext();
  }, [navigate]);

  // 1. DATA FETCHING & RECOVERY
  useEffect(() => {
    const fetchInterview = async () => {
      if (!id) return;
      try {
        const { data } = await axios.get(`${API_URL}/interviews/${id}`);
        setInterviewData(data.data);

        if (data.data.status !== "Active" && data.data.status !== "Created") {
          // setSessionState("error"); // Allow re-entry for demo purposes or handle strictly
          // return;
        }

        // Check for recovery
        const saved = InterviewStorage.loadSession(id);
        if (saved) {
          setTranscriptHistory(saved.transcript || []);
          setElapsedTime(saved.elapsedTime || 0);
          setViolations(saved.violations || []);
          setTabSwitchCount(saved.tabSwitchCount || 0);
          setBackNavAttempts(saved.backNavAttempts || 0);
          toast({
            title: "Session Restored",
            description: "Continuing from where you left off.",
          });
        }

        setSessionState("precheck");
      } catch (error: any) {
        console.error("Fetch Interview Error:", error);
        setSessionState("error");
      }
    };

    fetchInterview();
  }, [id, toast]);

  // 2. ANTI-CHEATING: Page Navigation & Visibility
  useEffect(() => {
    if (sessionState !== "interview") return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        "Are you sure you want to leave? Your interview is in progress.";
      return e.returnValue;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount((prev) => prev + 1);
        handleViolation("tab_switch", "User switched tabs/windows");
        toast({
          title: "Security Warning",
          description: "Switching tabs is monitored and recorded.",
          variant: "destructive",
        });
      }
    };

    const handlePopState = (e: PopStateEvent) => {
      window.history.pushState(null, "", window.location.href);
      setBackNavAttempts((prev) => prev + 1);
      handleViolation("back_navigation", "Attempted back navigation");
      setShowBackNavDialog(true);
    };

    window.history.pushState(null, "", window.location.href);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [sessionState, toast]);

  // 3. AUTO-TERMINATION Logic
  useEffect(() => {
    const totalViolations = tabSwitchCount + backNavAttempts;
    if (totalViolations >= 5 && sessionState === "interview") {
      handleEndInterview("Terminated", "Exceeded violation threshold");
    }
  }, [tabSwitchCount, backNavAttempts, sessionState]);

  // 4. PERSISTENCE
  useEffect(() => {
    if (!id || sessionState !== "interview") return;

    const interval = setInterval(() => {
      const dataToSave = {
        transcript: transcriptHistory,
        elapsedTime,
        violations,
        tabSwitchCount,
        backNavAttempts,
        lastUpdated: new Date().toISOString(),
      };

      InterviewStorage.saveSession(id, dataToSave);
      syncToBackend(dataToSave, "In_Progress");
    }, 5000);

    return () => clearInterval(interval);
  }, [
    id,
    sessionState,
    transcriptHistory,
    elapsedTime,
    violations,
    tabSwitchCount,
    backNavAttempts,
  ]);

  const syncToBackend = async (data: any, status: string) => {
    try {
      await axios.post(`${API_URL}/interviews/session/save`, {
        interviewId: id,
        candidateEmail: candidateEmail || "unknown",
        transcript: data.transcript,
        violations: data.violations,
        tab_switch_count: data.tabSwitchCount,
        back_navigation_attempts: data.backNavAttempts,
        status: status,
      });
    } catch (e) {
      console.error("Backend sync failed", e);
    }
  };

  const handleViolation = useCallback((type: string, description: string) => {
    setViolations((prev) => [
      ...prev,
      { type, description, timestamp: new Date().toISOString() },
    ]);
  }, []);

  const handleFaceStatus = useCallback(
    (isDetected: boolean) => {
      if (!isDetected && sessionState === "interview") {
        handleViolation("face_not_detected", "Face not visible in camera");
      }
    },
    [handleViolation, sessionState],
  );

  // Initialize Retell Client
  useEffect(() => {
    if (!retellClient.current) {
      retellClient.current = new RetellWebClient();
      setupRetellListeners();
    }
  }, []);

  const setupRetellListeners = () => {
    const client = retellClient.current!;
    client.on("call_started", () => {
      setIsListening(true);
      toast({
        title: "Interview Started",
        description: "Good luck! Speak clearly.",
      });
    });
    client.on("call_ended", () => handleEndInterview("Completed"));
    client.on("agent_start_talking", () => {
      setIsSpeaking(true);
      setIsListening(false);
    });
    client.on("agent_stop_talking", () => {
      setIsSpeaking(false);
      setIsListening(true);
    });
    client.on("update", (update: any) => {
      if (update.transcript && update.transcript.length > 0) {
        const latest = update.transcript[update.transcript.length - 1];
        setCurrentTranscript(latest.content);
        setTranscriptHistory((prev) => {
          // Deduplicate based on content/role to avoid choppy updates
          const newHistory = [...prev];
          const lastIndex = newHistory.length - 1;
          if (lastIndex >= 0 && newHistory[lastIndex].role === latest.role) {
            newHistory[lastIndex].content = latest.content;
          } else {
            newHistory.push({ role: latest.role, content: latest.content });
          }
          return newHistory;
        });
      }
    });
    client.on("error", (err) => {
      console.error("Retell Error:", err);
      // Don't kill session immediately on minor errors, but warn
      toast({
        title: "Connection Unstable",
        description: "Please check your internet.",
        variant: "destructive",
      });
    });
  };

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (sessionState === "interview") {
      interval = setInterval(() => setElapsedTime((prev) => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [sessionState]);

  const startInterview = async () => {
    setSessionState("ready");
    try {
      // Priority: Local User Name > Interview Data Name > Email Fallback
      const finalName =
        candidateName ||
        interviewData?.candidateName ||
        candidateEmail.split("@")[0];

      console.log("Starting Interview with Context:", {
        name: finalName,
        role: interviewData?.jobRole,
      });

      const { data } = await axios.post(`${API_URL}/retell/create-web-call`, {
        retell_llm_dynamic_variables: {
          candidate_name: finalName,
          job_role: interviewData?.jobRole || "General Role",
          job_description:
            interviewData?.jobDescription || "Standard interview.",
        },
      });

      if (!data.access_token) throw new Error("No access token received");

      await retellClient.current?.startCall({ accessToken: data.access_token });
      setSessionState("interview");
    } catch (error) {
      console.error("Start Error:", error);
      toast({
        title: "Start Failed",
        description: "Could not initialize AI agent.",
        variant: "destructive",
      });
      setSessionState("precheck");
    }
  };

  const handleEndInterview = async (finalStatus: string, reason?: string) => {
    if (sessionState === "interview") retellClient.current?.stopCall();
    setSessionState("ending");

    const finalData = {
      transcript: transcriptHistory,
      violations: violations,
      tabSwitchCount,
      backNavAttempts,
      elapsedTime,
    };

    // Final Persistence
    await syncToBackend(finalData, finalStatus);

    // Save to specialized results endpoint
    const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
    const finalCandidateId = interviewData?.candidateId || userInfo.user_id;

    try {
      await axios.post(`${API_URL}/interviews/results`, {
        interview_id: id,
        candidate_id: finalCandidateId,
        candidate_name:
          candidateName || interviewData?.candidateName || candidateEmail,
        scores: { Total: 0 },
        evaluation_summary: `Interview ${finalStatus}. ${reason || ""}. Duration: ${Math.floor(elapsedTime / 60)}m. Violations: ${violations.length}`,
        decision: finalStatus === "Completed" ? "pending" : "rejected",
      });
    } catch (e) {
      console.error("Failed to save final results", e);
    }

    if (id) InterviewStorage.clearSession(id);
    navigate("/candidate/dashboard");
  };

  if (sessionState === "loading")
    return <LoadingScreen message="Loading interview session..." />;
  if (sessionState === "error")
    return <ErrorScreen onBack={() => navigate("/candidate/dashboard")} />;
  if (sessionState === "precheck")
    return (
      <PrecheckScreen
        interviewData={interviewData}
        candidateName={candidateName}
        candidateEmail={candidateEmail}
        onStart={startInterview}
        onGrant={setPermissionsGranted}
        permissionsGranted={permissionsGranted}
        onCancel={() => navigate("/candidate/dashboard")}
      />
    );
  if (sessionState === "ready" || sessionState === "ending")
    return (
      <LoadingScreen
        message={
          sessionState === "ready"
            ? "Connecting to AI..."
            : "Finalizing session..."
        }
      />
    );

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans selection:bg-primary/30">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md px-6 py-4 sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-600 shadow-lg shadow-primary/20">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight tracking-tight">
                {interviewData?.jobRole}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="text-xs text-white/50 font-medium">
                  Live Session Active
                </p>
              </div>
            </div>
            {tabSwitchCount + backNavAttempts > 0 && (
              <Badge
                variant="destructive"
                className="ml-4 flex gap-1 items-center animate-in fade-in zoom-in"
              >
                <ShieldAlert className="h-3 w-3" />
                {tabSwitchCount + backNavAttempts} Violations
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <p className="text-[10px] uppercase font-bold tracking-widest text-white/40 mb-1">
                Duration
              </p>
              <Badge
                variant="outline"
                className="font-mono text-primary border-primary/20 bg-primary/5 px-3 py-1"
              >
                {Math.floor(elapsedTime / 60)}:
                {(elapsedTime % 60).toString().padStart(2, "0")}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-screen-2xl mx-auto w-full p-6 flex gap-6 overflow-hidden bg-dot-pattern">
        <div className="flex-1 flex flex-col gap-6">
          {/* Visualizer / AI Avatar */}
          <Card className="flex-[2] bg-gradient-to-b from-[#111] to-[#0a0a0a] border-white/10 relative overflow-hidden flex items-center justify-center shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent opacity-50" />

            <div
              className={cn(
                "relative z-10 h-64 w-64 rounded-full flex items-center justify-center transition-all duration-700 ease-in-out",
                isSpeaking
                  ? "bg-primary/20 shadow-[0_0_100px_rgba(124,58,237,0.3)] scale-105"
                  : "bg-white/5 scale-100",
              )}
            >
              {isSpeaking && (
                <span className="absolute inset-0 rounded-full border border-primary/30 animate-ping opacity-20 duration-1000" />
              )}
              <Bot
                className={cn(
                  "h-32 w-32 transition-all duration-500",
                  isSpeaking
                    ? "text-primary drop-shadow-[0_0_20px_rgba(124,58,237,0.5)]"
                    : "text-white/20",
                )}
              />
            </div>

            {/* Status Text */}
            <div className="absolute bottom-8 text-center">
              <p
                className={cn(
                  "text-sm font-medium transition-colors duration-300",
                  isSpeaking ? "text-primary animate-pulse" : "text-white/30",
                )}
              >
                {isSpeaking ? "AI Interviewer is speaking..." : "Listening..."}
              </p>
            </div>
          </Card>

          {/* Candidate Camera */}
          <div className="flex-1 min-h-[250px] relative group">
            <Card className="h-full bg-black border-white/10 overflow-hidden shadow-lg ring-1 ring-white/5 group-hover:ring-white/10 transition-all">
              <VideoPanel
                isActive={sessionState === "interview"}
                onFaceDetectedStatusChange={handleFaceStatus}
              />
              <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/60 backdrop-blur rounded text-[10px] text-white/70 font-mono border border-white/10">
                {candidateName} (You)
              </div>
            </Card>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-[400px] flex flex-col gap-6">
          <Card className="flex-1 bg-[#0a0a0a] border-white/10 flex flex-col shadow-xl">
            <CardHeader className="border-b border-white/5 py-4 px-5 bg-white/2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Live Transcript
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-5 space-y-4 overflow-y-auto custom-scrollbar">
              {transcriptHistory.length === 0 && (
                <div className="text-center text-white/20 text-sm mt-10 italic">
                  Conversation will appear here...
                </div>
              )}
              {transcriptHistory.map((t, i) => (
                <div
                  key={i}
                  className={cn(
                    "p-3.5 rounded-2xl text-sm leading-relaxed max-w-[90%]",
                    t.role === "agent"
                      ? "bg-primary/10 border border-primary/10 mr-auto rounded-tl-sm text-white/90"
                      : "bg-white/10 border border-white/5 ml-auto rounded-tr-sm text-white/80",
                  )}
                >
                  <p className="text-[9px] uppercase font-bold tracking-wider mb-1.5 opacity-50 flex items-center gap-1">
                    {t.role === "agent" ? (
                      <Bot className="h-3 w-3" />
                    ) : (
                      <User className="h-3 w-3" />
                    )}
                    {t.role === "agent" ? "AI Interviewer" : "You"}
                  </p>
                  <p>{t.content}</p>
                </div>
              ))}
            </CardContent>
            <div className="p-4 border-t border-white/5 bg-white/2">
              <Button
                variant="destructive"
                onClick={() => setShowEndDialog(true)}
                className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 hover:border-red-500 transition-all"
              >
                <PhoneOff className="h-4 w-4 mr-2" />
                End Interview
              </Button>
            </div>
          </Card>
        </div>
      </main>

      {/* Dialogs */}
      <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <AlertDialogContent className="bg-[#111] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>End Interview?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              This will submit your responses and conclude the session. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Resume Protocol
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleEndInterview("Completed")}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              Conclude Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBackNavDialog} onOpenChange={setShowBackNavDialog}>
        <AlertDialogContent className="bg-red-950/20 border-red-500/20 text-white backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500">
              <ShieldAlert className="h-5 w-5" />
              Security Alert
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/80">
              Navigation attempt detected. This action is flagged as a potential
              security violation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setShowBackNavDialog(false)}
              className="bg-white/5 border-white/10 text-white"
            >
              Return to Session
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                handleEndInterview(
                  "Terminated",
                  "User attempted back navigation",
                )
              }
              className="bg-red-600 hover:bg-red-700"
            >
              Terminate Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Bot className="h-6 w-6 text-primary" />
        </div>
      </div>
      <p className="text-white/50 animate-pulse font-medium tracking-wide">
        {message}
      </p>
    </div>
  );
}

function ErrorScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <Card className="max-w-md w-full bg-[#111] border-white/10 shadow-2xl">
        <CardContent className="p-8 text-center space-y-6">
          <div className="h-20 w-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500 ring-1 ring-red-500/20">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Access Denied
            </h2>
            <p className="text-white/50">
              This interview session cannot be accessed. It may be invalid,
              expired, or already completed.
            </p>
          </div>
          <Button onClick={onBack} size="lg" className="w-full font-semibold">
            Return to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PrecheckScreen({
  interviewData,
  candidateName,
  candidateEmail,
  onStart,
  onGrant,
  permissionsGranted,
  onCancel,
}: any) {
  const requestPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.getTracks().forEach((track) => track.stop());
      onGrant(true);
    } catch {
      onGrant(false);
      alert("Camera/Microphone access is required.");
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-primary/10 via-black to-black opacity-50" />

      <Card className="w-full max-w-4xl bg-[#0f0f0f] border-white/10 shadow-2xl overflow-hidden relative z-10 grid md:grid-cols-5">
        {/* Left Side - Info */}
        <div className="md:col-span-2 bg-white/5 p-8 flex flex-col justify-between border-r border-white/5">
          <div>
            <div className="h-14 w-14 bg-gradient-to-br from-primary to-violet-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl">
              <Bot className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2 leading-tight">
              Technical
              <br />
              Interview
            </h1>
            <p className="text-white/40 text-sm mb-6">AI-Powered Assessment</p>

            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                <p className="text-[10px] uppercase font-bold text-white/30 mb-1">
                  Position
                </p>
                <p className="text-white font-medium">
                  {interviewData?.jobRole}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                <p className="text-[10px] uppercase font-bold text-white/30 mb-1">
                  Candidate
                </p>
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-primary" />
                  <p className="text-white font-medium text-sm truncate">
                    {candidateName}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Mail className="h-3.5 w-3.5 text-white/40" />
                  <p className="text-white/40 text-xs truncate">
                    {candidateEmail}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-white/20 mt-8">
            Session ID: {interviewData?.interviewId?.substring(0, 8)}...
          </div>
        </div>

        {/* Right Side - Actions */}
        <div className="md:col-span-3 p-8 flex flex-col justify-center">
          <div className="mb-8 space-y-2">
            <h2 className="text-xl font-semibold text-white">System Check</h2>
            <p className="text-white/50 text-sm">
              Review protocols before beginning.
            </p>
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <div className="h-10 w-10 min-w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-medium text-white text-sm">
                  Proctoring Active
                </h3>
                <p className="text-xs text-white/40 leading-relaxed mt-1">
                  Full-screen monitoring enabled. Tab switching or face absence
                  will be flagged as violations.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <div className="h-10 w-10 min-w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-medium text-white text-sm">
                  Duration: {interviewData?.duration} Minutes
                </h3>
                <p className="text-xs text-white/40 leading-relaxed mt-1">
                  Timer starts automatically. Provide concise answers.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {!permissionsGranted ? (
              <Button
                onClick={requestPermissions}
                size="lg"
                className="w-full text-base font-semibold h-14 bg-white/10 hover:bg-white/20 text-white border-0"
              >
                <CheckCircle className="mr-2 h-5 w-5" />
                Verify Camera & Audio
              </Button>
            ) : (
              <Button
                onClick={onStart}
                size="lg"
                className="w-full text-base font-bold h-14 bg-gradient-to-r from-primary to-violet-600 hover:opacity-90 shadow-lg shadow-primary/25 border-0 animate-in fade-in zoom-in"
              >
                Initialize Secure Session
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={onCancel}
              className="text-white/30 hover:text-white hover:bg-transparent"
            >
              Cancel Session
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}
