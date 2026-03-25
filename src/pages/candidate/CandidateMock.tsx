import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Video,
  Play,
  History,
  Star,
  ArrowRight,
  Zap,
  Loader2,
  Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// Get candidate email from localStorage
const getUserEmail = () => {
  try {
    const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
    return userInfo.email || "candidate@example.com";
  } catch {
    return "candidate@example.com";
  }
};

interface InterviewSession {
  sessionId: string;
  interviewId: string;
  jobRole: string;
  status: string;
  startedAt: string;
  completedAt: string;
  duration: number;
  score: number;
  violations: number;
  isMock: boolean;
}

export default function CandidateMock() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [recentSessions, setRecentSessions] = useState<InterviewSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Dialog states
  const [showTailoredDialog, setShowTailoredDialog] = useState(
    location.state?.autoOpen || false,
  );
  const [jobRole, setJobRole] = useState(location.state?.jobRole || "");
  const [jobDescription, setJobDescription] = useState(
    location.state?.jobDescription || "",
  );

  // Fetch recent sessions on mount
  useEffect(() => {
    fetchRecentSessions();
  }, []);

  const fetchRecentSessions = async () => {
    try {
      setIsLoading(true);
      const { data } = await axios.get(
        `${API_URL}/mock-interviews/history/${getUserEmail()}`,
      );
      setRecentSessions(data.data || []);
    } catch (error: any) {
      console.error("Failed to fetch sessions:", error);
      toast({
        title: "Error",
        description: "Failed to load recent sessions",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createMockInterview = async (type: "general" | "tailored") => {
    try {
      setIsCreating(true);

      const payload = {
        candidateEmail: getUserEmail(),
        jobRole: type === "tailored" ? jobRole : "General Practice",
        jobDescription:
          type === "tailored"
            ? jobDescription
            : "Standard industry questions for common roles.",
        interviewType: "Mock",
        duration: 30,
      };

      const { data } = await axios.post(
        `${API_URL}/mock-interviews/create`,
        payload,
      );

      if (data.success) {
        toast({
          title: "Mock Interview Created",
          description: `Starting ${data.data.jobRole} interview...`,
        });

        // Clean out any stale sessions that might force Problem Solving mode
        const mockInfo = {
          email: payload.candidateEmail,
          candidate_name: "Candidate",
          interviewType: "Mock",
          job_position: data.data.jobRole,
          duration: data.data.duration,
          question_list: { combinedQuestions: [] },
        };
        sessionStorage.setItem("interviewInfo", JSON.stringify(mockInfo));
        localStorage.setItem("interviewInfo", JSON.stringify(mockInfo));
        sessionStorage.setItem("just_joined_interview", "true");

        // Navigate to the interview prep
        navigate(`/interview/${data.data.interviewId}/prep`);
      }
    } catch (error: any) {
      console.error("Failed to create mock interview:", error);
      toast({
        title: "Error",
        description:
          error.response?.data?.message || "Failed to create mock interview",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
      setShowTailoredDialog(false);
    }
  };

  const handleGeneralPractice = () => {
    createMockInterview("general");
  };

  const handleTailoredPractice = () => {
    setShowTailoredDialog(true);
  };

  const handleTailoredSubmit = () => {
    if (!jobRole.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a job role",
        variant: "destructive",
      });
      return;
    }
    createMockInterview("tailored");
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30)
      return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;
    return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? "s" : ""} ago`;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          AI Mock Interview
        </h1>
        <p className="text-muted-foreground">
          Practice with our AI agent in a realistic interview environment.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Section */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Start New Session</CardTitle>
            <CardDescription>
              Select a role or upload a job description to begin a tailored
              practice session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div
                className="p-6 rounded-2xl border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer group"
                onClick={handleTailoredPractice}
              >
                <Zap className="h-8 w-8 text-primary mb-4 group-hover:scale-110 transition-transform" />
                <h4 className="font-bold text-lg mb-2">Tailored Practice</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Focused on your specific target job description.
                </p>
                <Button
                  className="w-full"
                  disabled={isCreating}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTailoredPractice();
                  }}
                >
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Start <Play className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
              <div
                className="p-6 rounded-2xl border-2 border-accent/20 bg-accent/5 hover:bg-accent/10 transition-colors cursor-pointer group"
                onClick={handleGeneralPractice}
              >
                <Video className="h-8 w-8 text-accent mb-4 group-hover:scale-110 transition-transform" />
                <h4 className="font-bold text-lg mb-2">General Practice</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Standard industry questions for common roles.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={isCreating}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGeneralPractice();
                  }}
                >
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Start <Play className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Previous Sessions */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-lg">Recent Sessions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">
                  Loading sessions...
                </p>
              </div>
            ) : recentSessions.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No sessions yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Start your first mock interview!
                </p>
              </div>
            ) : (
              <>
                <div className="divide-y">
                  {recentSessions.slice(0, 5).map((session, i) => (
                    <div
                      key={i}
                      className="px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => {
                        // In future, navigate to session details
                        toast({
                          title: "Session Details",
                          description: `View detailed results for ${session.jobRole}`,
                        });
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-semibold truncate">
                          {session.jobRole}
                        </h5>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(session.completedAt)} • {session.duration}
                          m
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-yellow-500 font-bold ml-2">
                        <Star className="h-3 w-3 fill-current" />
                        {session.score.toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>
                {recentSessions.length > 5 && (
                  <div className="p-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-primary"
                      onClick={() => {
                        toast({
                          title: "Coming Soon",
                          description:
                            "Full session history view is under development",
                        });
                      }}
                    >
                      View all sessions <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tailored Practice Dialog */}
      <Dialog open={showTailoredDialog} onOpenChange={setShowTailoredDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Tailored Practice Setup
            </DialogTitle>
            <DialogDescription>
              Provide details about the role you're preparing for to get
              customized interview questions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="jobRole">Job Role *</Label>
              <Input
                id="jobRole"
                placeholder="e.g., Senior React Developer"
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobDescription">Job Description (Optional)</Label>
              <Textarea
                id="jobDescription"
                placeholder="Paste the job description here for more targeted questions..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={6}
                disabled={isCreating}
              />
              <p className="text-xs text-muted-foreground">
                The more details you provide, the more tailored your practice
                session will be.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowTailoredDialog(false)}
              disabled={isCreating}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleTailoredSubmit}
              disabled={isCreating || !jobRole.trim()}
              className="flex-1"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  Start Interview
                  <Play className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
