import { useState, useEffect } from "react";
import { Clock, User, Mail, Calendar, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface Interview {
  _id: string;
  interviewId: string;
  candidateName: string;
  candidateEmails: string[];
  jobRole: string;
  duration: number;
  interviewType: string;
  status: "Created" | "Active" | "Completed" | "Terminated";
  email_sent: boolean;
  email_sent_at?: string;
  createdAt: string;
}

export default function Interviews() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchInterviews = async () => {
    setIsLoading(true);
    try {
      const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
      const token = userInfo.token;

      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };

      const { data } = await axios.get(`${API_URL}/interviews/all`, config);
      setInterviews(data);
    } catch (error) {
      console.error("Error fetching interviews:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInterviews();
  }, []);

  const handleShareEmail = async (interviewId: string) => {
    setIsSending(interviewId);
    try {
      const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
      const token = userInfo.token;

      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };

      const { data } = await axios.post(`${API_URL}/interviews/resend/${interviewId}`, {}, config);
      toast({
        title: "Success",
        description: data.message || "Interview link shared via email.",
      });
      // Refresh list to show updated email status
      fetchInterviews();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to send email.",
        variant: "destructive",
      });
    } finally {
      setIsSending(null);
    }
  };

  const scheduledInterviews = interviews.filter((i) => i.status === "Active" || i.status === "Created");
  const pastInterviews = interviews.filter((i) => i.status === "Completed" || i.status === "Terminated");

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Interview Management</h1>
        <p className="mt-1 text-muted-foreground">
          Generate links and share them with candidates via email
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-primary/10 p-3">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{scheduledInterviews.length}</p>
              <p className="text-sm text-muted-foreground">Active / Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-success/10 p-3">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{interviews.filter(i => i.status === 'Completed').length}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-destructive/10 p-3">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{interviews.filter(i => i.status === 'Terminated').length}</p>
              <p className="text-sm text-muted-foreground">Terminated</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scheduled Interviews */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Pending Invitations & Active Interviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {scheduledInterviews.length > 0 ? (
              scheduledInterviews.map((interview) => (
                <div
                  key={interview._id}
                  className="flex flex-col gap-4 rounded-xl border border-border p-5 transition-all hover:border-primary/50 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {interview.candidateName?.substring(0, 2).toUpperCase() || "CN"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{interview.candidateName || interview.candidateEmails[0]}</p>

                      </div>
                      <p className="text-sm text-muted-foreground">{interview.jobRole} • {interview.interviewType}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:items-end">
                    <div className="flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        {interview.email_sent ? (
                          <span className="flex items-center gap-1 text-success font-medium">
                            <CheckCircle2 className="h-3 w-3" />
                            Email Sent
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-warning font-medium">
                            <Clock className="h-3 w-3" />
                            Email Pending
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground">
                        Created: {new Date(interview.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleShareEmail(interview.interviewId)}
                      disabled={isSending === interview.interviewId}
                      className="min-w-[160px]"
                    >
                      {isSending === interview.interviewId ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="mr-2 h-4 w-4" />
                      )}
                      {interview.email_sent ? "Resend Link" : "Share Link via Email"}
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 border border-dashed rounded-lg">
                <p className="text-muted-foreground text-sm">No pending interviews found.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Past Interviews */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Past Interviews</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {pastInterviews.length > 0 ? (
              pastInterviews.map((interview) => (
                <div
                  key={interview._id}
                  className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between opacity-70"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {interview.candidateName?.substring(0, 2).toUpperCase() || "CN"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{interview.candidateName || interview.candidateEmails[0]}</p>

                      </div>
                      <p className="text-xs text-muted-foreground">{interview.jobRole}</p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>Completed: {new Date(interview.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center py-6 text-sm text-muted-foreground">No past interviews found.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
