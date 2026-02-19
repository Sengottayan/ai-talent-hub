import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload, CheckCircle2, AlertCircle, Sparkles, TrendingUp, Target, Lightbulb } from "lucide-react";
import React, { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

const API_URL = 'http://localhost:5000/api';

interface AnalysisResult {
    atsScore: number;
    keyStrengths: string[];
    areasForImprovement: string[];
    kpiSuggestions: string[];
    suggestedKeywords: string[];
    overallFeedback: string;
}

export default function CandidateResume() {
    const [file, setFile] = useState<File | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

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
        formData.append('resume', file);

        try {
            const { data } = await axios.post(`${API_URL}/resume/optimize`, formData);

            if (data.success) {
                setAnalysis(data.analysis);
                toast({
                    title: "Analysis Complete",
                    description: "Your resume has been optimized by AI.",
                });
            }
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.response?.data?.message || "Failed to analyze resume.",
                variant: "destructive",
            });
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">AI Resume Optimizer</h1>
                <p className="text-muted-foreground">Get expert feedback and actionable suggestions to beat the ATS.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Left Side: Upload and Main Results */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Resume Upload</CardTitle>
                            <CardDescription>Upload your resume (PDF/DOCX) for a deep AI scan.</CardDescription>
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
                                className="border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 bg-muted/20 hover:bg-muted/30 transition-all cursor-pointer border-primary/20 hover:border-primary/40 group"
                            >
                                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                    <Upload className="h-8 w-8" />
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-foreground">
                                        {file ? file.name : "Select your resume file"}
                                    </p>
                                    <p className="text-sm text-muted-foreground">PDF or DOCX (Max 10MB)</p>
                                </div>
                            </div>

                            {file && (
                                <div className="flex items-center justify-between p-4 rounded-xl border bg-primary/5 border-primary/20 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="flex items-center gap-3">
                                        <FileText className="h-6 w-6 text-primary" />
                                        <div>
                                            <p className="text-sm font-medium truncate max-w-[200px]">{file.name}</p>
                                            <p className="text-xs text-muted-foreground">Ready for analysis</p>
                                        </div>
                                    </div>
                                    <Button onClick={handleAnalyze} disabled={isAnalyzing} className="shadow-lg hover:shadow-primary/20">
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
                                            <div key={i} className="p-3 bg-secondary/30 rounded-lg text-sm border border-secondary">
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
                                            <div key={i} className="p-3 bg-amber-500/5 rounded-lg text-sm border border-amber-500/20">
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
                                    <CardDescription>Quantifiable results to impress recruiters.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {analysis.kpiSuggestions.map((kpi, i) => (
                                        <div key={i} className="p-3 border rounded-lg text-sm italic text-muted-foreground bg-primary/5 border-primary/10">
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
                                    <CardDescription>Missing technical terms to pass ATS filters.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-wrap gap-2">
                                        {analysis.suggestedKeywords.map((tag, i) => (
                                            <span key={i} className="px-3 py-1 bg-secondary text-secondary-foreground rounded-full text-xs font-medium">
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
                                Upload your resume and click analyze to see detailed AI insights here.
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
