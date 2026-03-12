import { useState, useEffect } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Briefcase,
    Calendar,
    Trophy,
    Star,
    TrendingUp,
    ArrowRight,
    FileText,
    Video,
    Zap,
    CheckCircle2,
    Loader2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { RescheduleDialog } from "@/components/candidate/RescheduleDialog";
import { ActionRequiredDialog } from "@/components/candidate/ActionRequiredDialog";
import axios from "axios";
import { format, isBefore, subMinutes } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function CandidateDashboard() {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const navigate = useNavigate();
    const { toast } = useToast();

    const [interviews, setInterviews] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedInterview, setSelectedInterview] = useState<any>(null);
    const [showReschedule, setShowReschedule] = useState(false);

    // New state for Action Required Dialog
    const [actionRequiredRequest, setActionRequiredRequest] = useState<any>(null);
    const [showActionRequired, setShowActionRequired] = useState(false);

    // Resume Data State
    const [latestAnalysis, setLatestAnalysis] = useState<any>(null);

    const fetchInterviews = async () => {
        try {
            const { data } = await axios.get(`${API_URL}/interviews/my-interviews/${userInfo.email}`);
            setInterviews(data.data || []);
        } catch (error) {
            console.error("Failed to fetch interviews:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchResumeData = async () => {
        try {
            const config = { headers: { Authorization: `Bearer ${userInfo?.token}` } };
            const { data } = await axios.get(`${API_URL}/resume/optimize/history`, config);
            if (data.success && data.history && data.history.length > 0) {
                // Get the most recent analysis
                setLatestAnalysis(data.history[0]);
            }
        } catch (error) {
            console.error("Failed to fetch resume history:", error);
        }
    };

    useEffect(() => {
        if (userInfo.email) {
            fetchInterviews();
            fetchResumeData();
        }
    }, [userInfo.email]);

    const checkRescheduleStatus = async (interview: any) => {
        try {
            const { data } = await axios.get(`${API_URL}/reschedule/interview/${interview._id}`);
            if (data.success && data.data) {
                const request = data.data;

                if (request.status === 'Action Required') {
                    setActionRequiredRequest(request);
                    setShowActionRequired(true);
                } else if (request.status === 'Pending' || request.status === 'Processing') {
                    toast({
                        title: "Request Pending",
                        description: "Your reschedule request is still being reviewed by HR.",
                    });
                } else {
                    toast({
                        title: "Status Update",
                        description: `Current status: ${request.status}`,
                    });
                }
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Could not fetch reschedule details.",
                variant: "destructive"
            });
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Welcome back, {userInfo.name || 'Candidate'}!</h1>
                <p className="text-muted-foreground">Here's what's happening with your job applications and AI career growth.</p>
            </div>

            {/* Top Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Application Score</CardTitle>
                        <Star className="h-4 w-4 text-warning" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{latestAnalysis ? `${latestAnalysis.atsScore}%` : '0%'}</div>
                        <p className="text-xs text-muted-foreground mt-1 text-success flex items-center gap-1">
                            {latestAnalysis ? <><TrendingUp className="h-3 w-3" /> Profile Analyzed</> : <><TrendingUp className="h-3 w-3" /> New Candidate</>}
                        </p>
                    </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Active Applications</CardTitle>
                        <Briefcase className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0</div>
                        <p className="text-xs text-muted-foreground mt-1">0 pending review</p>
                    </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Interviews</CardTitle>
                        <Calendar className="h-4 w-4 text-accent" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{interviews.length}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {interviews.length > 0 ? `Next: Tomorrow at 10 AM` : 'No upcoming sessions'}
                        </p>
                    </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Skill Badges</CardTitle>
                        <Trophy className="h-4 w-4 text-warning" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0</div>
                        <p className="text-xs text-muted-foreground mt-1">0 new badges earned</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-7">
                {/* Left Column */}
                <div className="lg:col-span-4 space-y-6">


                    {/* Scheduled Interviews */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Scheduled Interviews</CardTitle>
                            <CardDescription>Official recruitment interviews waiting for you</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary" /></div>
                            ) : interviews.length > 0 ? (
                                <div className="space-y-4">
                                    {interviews.map((interview) => {
                                        const scheduledDate = interview.scheduledDate ? new Date(interview.scheduledDate) : null;
                                        const isTooEarly = scheduledDate ? isBefore(new Date(), subMinutes(scheduledDate, 30)) : false;

                                        return (
                                            <div key={interview._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border bg-muted/30 gap-4">
                                                <div className="flex items-start gap-4">
                                                    <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
                                                        <Calendar className="h-5 w-5" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h4 className="font-semibold text-sm">{interview.jobRole}</h4>
                                                            {interview.status === 'Rescheduled' && (
                                                                <Badge variant="outline" className="text-[10px] h-4 border-primary/20 bg-primary/10 text-primary">Rescheduled</Badge>
                                                            )}
                                                            {interview.status === 'Active' && scheduledDate && (
                                                                <Badge variant="outline" className="text-[10px] h-4 border-success/20 bg-success/10 text-success">Confirmed</Badge>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">{interview.interviewType} Assessment</p>
                                                        {scheduledDate && (
                                                            <p className="text-xs font-medium text-primary flex items-center gap-1">
                                                                <Calendar className="h-3 w-3" />
                                                                Scheduled: {format(scheduledDate, "PPp")}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 self-end sm:self-center">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        // Enable button to check status if Rescheduled
                                                        className={interview.status === 'Rescheduled' ? 'border-primary text-primary hover:bg-primary/10' : ''}
                                                        onClick={() => {
                                                            if (interview.status === 'Rescheduled') {
                                                                checkRescheduleStatus(interview);
                                                            } else {
                                                                setSelectedInterview(interview);
                                                                setShowReschedule(true);
                                                            }
                                                        }}
                                                    >
                                                        {interview.status === 'Rescheduled' ? 'Check Status' : 'Reschedule'}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        disabled={isTooEarly || interview.status === 'Rescheduled'}
                                                        title={isTooEarly ? `Interview will be available 30 mins before ${format(scheduledDate!, "p")}` : ""}
                                                        onClick={() => {
                                                            navigate(`/interview/${interview.interviewId}`, {
                                                                state: {
                                                                    candidateName: userInfo.name,
                                                                    candidateEmail: userInfo.email,
                                                                    readOnly: true
                                                                }
                                                            });
                                                        }}
                                                    >
                                                        {isTooEarly ? "Locked" : "Start"}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                                        <Video className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <p className="text-sm text-muted-foreground truncate">No interviews scheduled yet. Keep applying!</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Proactive Tip / Helper Banner */}
                    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100 overflow-hidden relative mt-6">
                        <div className="absolute right-0 top-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl translate-x-10 -translate-y-10" />
                        <CardContent className="p-6">
                            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                                <div className="space-y-1 z-10">
                                    <div className="flex items-center gap-2">
                                        <Zap className="h-4 w-4 text-blue-600" />
                                        <h4 className="font-semibold text-blue-900">Need more interview practice?</h4>
                                    </div>
                                    <p className="text-sm text-blue-700/80">
                                        Launch an on-demand AI mock session to sharpen your speaking skills and reduce pre-interview anxiety.
                                    </p>
                                </div>
                                <Button className="shrink-0 bg-blue-600 hover:bg-blue-700 z-10" onClick={() => navigate('/candidate/mock')}>
                                    <Video className="h-4 w-4 mr-2" />
                                    Start Mock Interview
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column */}
                <div className="lg:col-span-3 space-y-6">
                    {/* Quick AI Tools */}
                    <Card className="bg-primary text-primary-foreground border-none shadow-lg">
                        <CardHeader>
                            <CardTitle>AI Career Suite</CardTitle>
                            <CardDescription className="text-primary-foreground/80">Supercharge your career with AI</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Button
                                className="w-full justify-between bg-white text-primary hover:bg-white/90"
                                variant="secondary"
                                onClick={() => navigate("/candidate/resume")}
                            >
                                <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Optimize Resume</span>
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                            <Button
                                className="w-full justify-between bg-white text-primary hover:bg-white/90"
                                variant="secondary"
                                onClick={() => navigate("/candidate/mock")}
                            >
                                <span className="flex items-center gap-2"><Video className="h-4 w-4" /> AI Mock Interview</span>
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                            <Button
                                className="w-full justify-between bg-white text-primary hover:bg-white/90"
                                variant="secondary"
                                onClick={() => navigate("/candidate/skills")}
                            >
                                <span className="flex items-center gap-2"><Zap className="h-4 w-4" /> Skill Gap Analysis</span>
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Skill Gap Analysis Preview */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Skill Gap Analysis</CardTitle>
                            <CardDescription>Areas discovered from your resume</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {latestAnalysis ? (
                                <>
                                    {latestAnalysis.areasForImprovement?.slice(0, 3).map((area: string, idx: number) => (
                                        <div key={idx} className="space-y-2">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="font-medium truncate max-w-[200px]" title={area}>{area}</span>
                                                <span className="text-xs text-warning font-medium">Critical Gap</span>
                                            </div>
                                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                                <div className="h-full bg-warning" style={{ width: `${Math.floor(Math.random() * 40) + 30}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                    <Button variant="link" className="w-full text-xs p-0 h-auto" onClick={() => navigate('/candidate/resume')}>
                                        View Full Analysis
                                    </Button>
                                </>
                            ) : (
                                <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                                    <Zap className="h-8 w-8 text-muted mx-auto mb-2" />
                                    <p>Upload your resume to see skill gaps</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Weekly Achievements */}
                    <Card className="border-accent/20 bg-accent/5">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">Achievements</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {latestAnalysis ? (
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                                            <Trophy className="h-4 w-4 text-success" />
                                        </div>
                                        <p className="text-xs font-medium">Resume Score: {latestAnalysis.atsScore}%</p>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center">
                                            <Trophy className="h-4 w-4 text-accent" />
                                        </div>
                                        <p className="text-xs font-medium">Upload Resume to unlock achievements</p>
                                    </div>
                                )}
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center">
                                        <CheckCircle2 className="h-4 w-4 text-accent" />
                                    </div>
                                    <p className="text-xs font-medium">Joined AI Career Network</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <RescheduleDialog
                open={showReschedule}
                onOpenChange={setShowReschedule}
                interview={selectedInterview}
                candidateId={userInfo.id || userInfo._id || userInfo.user_id}
                onSuccess={fetchInterviews}
            />

            <ActionRequiredDialog
                open={showActionRequired}
                onOpenChange={setShowActionRequired}
                rescheduleRequest={actionRequiredRequest}
                onSuccess={() => {
                    fetchInterviews();
                    setShowActionRequired(false);
                }}
            />
        </div>
    );
}
