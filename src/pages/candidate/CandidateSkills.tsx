import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    CheckCircle2,
    Zap,
    TrendingUp,
    Lightbulb,
    Target,
    AlertCircle,
    Upload,
    FileText,
    Loader2,
    ArrowRight,
    History,
    Calendar,
    ChevronRight
} from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const API_URL = 'http://localhost:5000/api';

interface SkillAnalysis {
    skill: string;
    proficiency: number;
    status: string;
}

interface SkillGapResult {
    _id?: string;
    targetRole: string;
    matchPercentage: number;
    skillsAnalysis: SkillAnalysis[];
    criticalGaps: string[];
    learningRoadmap: string[];
    careerInsight: string;
    createdAt?: string;
}

export default function CandidateSkills() {
    const [file, setFile] = useState<File | null>(null);
    const [targetRole, setTargetRole] = useState("");
    const [jobDescription, setJobDescription] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [results, setResults] = useState<SkillGapResult | null>(null);
    const [history, setHistory] = useState<SkillGapResult[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
            const token = userInfo.token;
            const { data } = await axios.get(`${API_URL}/resume/skill-gap/history`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (data.success) {
                setHistory(data.history);
                // Automatically show latest if none selected
                if (data.history.length > 0 && !results) {
                    // Option: setResults(data.history[0]);
                }
            }
        } catch (error) {
            console.error("Error fetching history:", error);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
        }
    };

    const handleAnalyze = async () => {
        if (!file || !targetRole) {
            toast({
                title: "Missing Information",
                description: "Please upload a resume and specify a target job role.",
                variant: "destructive",
            });
            return;
        }

        setIsAnalyzing(true);
        const formData = new FormData();
        formData.append('resume', file);
        formData.append('targetRole', targetRole);
        formData.append('jobDescription', jobDescription);

        try {
            const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
            const token = userInfo.token;
            const { data } = await axios.post(`${API_URL}/resume/skill-gap`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (data.success) {
                setResults(data.analysis);
                toast({
                    title: "Analysis Complete",
                    description: "Your skill gap analysis has been saved to your history.",
                });
                fetchHistory(); // Refresh history
            }
        } catch (error: any) {
            toast({
                title: "Analysis Failed",
                description: error.response?.data?.message || "Error analyzing skill gap.",
                variant: "destructive",
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const selectFromHistory = (item: SkillGapResult) => {
        setResults(item);
        setTargetRole(item.targetRole);
        setShowHistory(false);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        AI Skill Gap Analysis
                    </h1>
                    <p className="text-muted-foreground">Compare your resume against any job role and track your progress.</p>
                </div>
                <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => setShowHistory(!showHistory)}
                >
                    <History className="h-4 w-4" />
                    {showHistory ? "Back to Analyzer" : "View History"}
                </Button>
            </div>

            {showHistory ? (
                <div className="grid gap-4 animate-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-xl font-semibold mb-2">Previous Analyses</h2>
                    {history.length === 0 ? (
                        <Card className="p-12 text-center text-muted-foreground">
                            No history found. Try your first analysis!
                        </Card>
                    ) : (
                        history.map((item) => (
                            <Card
                                key={item._id}
                                className="hover:border-primary/50 cursor-pointer transition-all group"
                                onClick={() => selectFromHistory(item)}
                            >
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                            <Target className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold">{item.targetRole}</h4>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {format(new Date(item.createdAt!), 'PPP')}
                                                </span>
                                                <span className="font-bold text-primary">{item.matchPercentage}% Match</span>
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Input Card */}
                    <Card className="border-primary/10 shadow-sm h-fit">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Target className="h-5 w-5 text-primary" />
                                New Analysis
                            </CardTitle>
                            <CardDescription>Specify the role you want to analyze against.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Target Job Role</label>
                                <Input
                                    placeholder="e.g. Senior Frontend Engineer"
                                    value={targetRole}
                                    onChange={(e) => setTargetRole(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Job Description (Optional)</label>
                                <Textarea
                                    placeholder="Paste the job description here..."
                                    className="min-h-[100px] resize-none"
                                    value={jobDescription}
                                    onChange={(e) => setJobDescription(e.target.value)}
                                />
                            </div>

                            <div className="space-y-4">
                                <label className="text-sm font-medium">Your Resume</label>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className={cn(
                                        "border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer text-center",
                                        file ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50 hover:bg-muted/30"
                                    )}
                                >
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        className="hidden"
                                        accept=".pdf,.docx"
                                    />
                                    {file ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <FileText className="h-6 w-6 text-primary" />
                                            <span className="font-medium text-xs">{file.name}</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1">
                                            <Upload className="h-6 w-6 text-muted-foreground" />
                                            <p className="text-xs text-muted-foreground">
                                                Drop resume or <span className="text-primary font-medium">browse</span>
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Button
                                className="w-full h-11 text-base font-semibold"
                                disabled={isAnalyzing || !file || !targetRole}
                                onClick={handleAnalyze}
                            >
                                {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                                {isAnalyzing ? "Analyzing..." : "Analyze Skill Gap"}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Results Card */}
                    <div className="space-y-6">
                        {!results ? (
                            <Card className="h-full border-dashed flex flex-col items-center justify-center p-12 text-center bg-muted/20">
                                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                                    <Target className="h-8 w-8 text-primary/40" />
                                </div>
                                <h3 className="font-semibold text-lg mb-2">Ready for Analysis</h3>
                                <p className="text-sm text-muted-foreground">
                                    Analyze a new role or check your <span className="text-primary cursor-pointer hover:underline" onClick={() => setShowHistory(true)}>history</span> to see previous reports.
                                </p>
                            </Card>
                        ) : (
                            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                                <Card className="bg-primary text-primary-foreground border-none shadow-lg">
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-medium opacity-80 uppercase tracking-wider">Analysis for {results.targetRole}</p>
                                                <h3 className="text-3xl font-bold mt-1">{results.matchPercentage}% Match</h3>
                                            </div>
                                            <TrendingUp className="h-10 w-10 opacity-20" />
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base">Skill Breakdown</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {results.skillsAnalysis.map((item, i) => (
                                            <div key={i} className="space-y-1.5">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="font-medium">{item.skill}</span>
                                                    <span className={cn(
                                                        "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                                                        item.status === "Ready" ? "bg-green-500/10 text-green-500" :
                                                            item.status === "Gap" ? "bg-amber-500/10 text-amber-500" :
                                                                "bg-red-500/10 text-red-500"
                                                    )}>
                                                        {item.status}
                                                    </span>
                                                </div>
                                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className={cn(
                                                            "h-full transition-all duration-1000",
                                                            item.status === "Ready" ? "bg-green-500" :
                                                                item.status === "Gap" ? "bg-amber-500" : "bg-red-500"
                                                        )}
                                                        style={{ width: `${item.proficiency}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <Card className="border-red-500/10 bg-red-500/[0.02]">
                                        <CardHeader className="p-4 pb-2">
                                            <CardTitle className="text-xs flex items-center gap-2 text-red-500">
                                                <AlertCircle className="h-3 w-3" />
                                                Missing Skills
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0">
                                            <ul className="space-y-1">
                                                {results.criticalGaps.map((gap, i) => (
                                                    <li key={i} className="text-[11px] flex items-start gap-2">
                                                        <span className="h-1 w-1 rounded-full bg-red-500 mt-1.5" />
                                                        {gap}
                                                    </li>
                                                ))}
                                            </ul>
                                        </CardContent>
                                    </Card>

                                    <Card className="border-primary/10 bg-primary/[0.02]">
                                        <CardHeader className="p-4 pb-2">
                                            <CardTitle className="text-xs flex items-center gap-2 text-primary">
                                                <Zap className="h-3 w-3" />
                                                Action Plan
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-4 pt-0">
                                            <ul className="space-y-1">
                                                {results.learningRoadmap.map((step, i) => (
                                                    <li key={i} className="text-[11px] flex items-start gap-2">
                                                        <ArrowRight className="h-2.5 w-2.5 text-primary mt-1 shrink-0" />
                                                        {step}
                                                    </li>
                                                ))}
                                            </ul>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Card className="bg-muted/30 border-none">
                                    <CardContent className="p-4 flex gap-3 items-start">
                                        <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                                        <p className="text-[11px] text-muted-foreground italic leading-relaxed">
                                            "{results.careerInsight}"
                                        </p>
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
