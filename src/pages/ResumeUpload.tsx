import { useState, useRef, useEffect } from "react";
import { Upload, X, Loader2, Link as LinkIcon, Trash2, Plus, Mail, MessageSquareQuoteIcon, SparklesIcon, CheckCircle2, Copy, ExternalLink, Calendar, Clock, List, Share2, Phone, Linkedin, ArrowLeft, PlusIcon, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

type Question = {
    question: string;
    type: string;
}

export default function ResumeUpload() {
    // Form State
    const [jobRole, setJobRole] = useState("");
    const [jobDescription, setJobDescription] = useState("");
    const [duration, setDuration] = useState("30");
    const [interviewType, setInterviewType] = useState("Technical");
    const [questionCount, setQuestionCount] = useState("10");

    // Candidate Source State
    const [files, setFiles] = useState<File[]>([]);
    const [manualEmails, setManualEmails] = useState("");
    const [shareEmail, setShareEmail] = useState("");
    const [isSharing, setIsSharing] = useState(false);

    // Output State
    const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
    const [extractedEmails, setExtractedEmails] = useState<string[]>([]);
    const [interviewData, setInterviewData] = useState<any>(null); // For success step

    // UI State
    const [isProcessing, setIsProcessing] = useState(false);
    const [step, setStep] = useState(1);
    const { toast } = useToast();

    // Editor State (Step 2)
    const [newQuestion, setNewQuestion] = useState("");
    const [newQuestionType, setNewQuestionType] = useState("Technical");

    // AI Job Description Generator State
    const [showAIDialog, setShowAIDialog] = useState(false);
    const [aiRole, setAiRole] = useState("");
    const [aiExperience, setAiExperience] = useState("");
    const [aiSkills, setAiSkills] = useState("");
    const [aiResponsibilities, setAiResponsibilities] = useState("");
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [isSuggestingSkills, setIsSuggestingSkills] = useState(false);

    // --- Handlers ---

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            setFiles([...files, ...newFiles]);
        }
    };

    const handleRemoveFile = (index: number) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    // Step 1: Submit to Draft (Generate Questions & Parse Emails)
    const handleDraftSubmit = async () => {
        if (!jobRole || !jobDescription) {
            toast({ title: "Missing Information", description: "Job Role and Description are required.", variant: "destructive" });
            return;
        }
        if (files.length === 0 && !manualEmails) {
            toast({ title: "No Candidates", description: "Please provide resumes or emails.", variant: "destructive" });
            return;
        }

        setIsProcessing(true);
        const formData = new FormData();
        formData.append("jobRole", jobRole);
        formData.append("jobDescription", jobDescription);
        formData.append("duration", duration);
        formData.append("interviewType", interviewType);
        formData.append("questionCount", questionCount);
        files.forEach((file) => formData.append("resumes", file));
        if (manualEmails) {
            const emails = manualEmails.split(/[\n,]+/).map(e => e.trim().toLowerCase()).filter(e => e);
            if (emails.length > 0) formData.append("candidateEmails", JSON.stringify(emails));
        }

        try {
            const userInfo = localStorage.getItem('userInfo');
            const token = userInfo ? JSON.parse(userInfo).token : null;
            const config = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } };

            const response = await axios.post(`${API_URL}/interviews/draft`, formData, config);

            setGeneratedQuestions(response.data.data.questions || []);
            setExtractedEmails(response.data.data.candidateEmails || []);
            setStep(2); // Move to Editor

        } catch (error: any) {
            console.error(error);
            toast({ title: "Error", description: error.response?.data?.message || "Failed to generate draft.", variant: "destructive" });
        } finally {
            setIsProcessing(false);
        }
    };

    // Step 2: Advanced Question Editor
    const handleAddQuestion = () => {
        if (!newQuestion.trim()) {
            toast({ title: "Empty Question", description: "Please enter a question text.", variant: "destructive" });
            return;
        }
        setGeneratedQuestions([...generatedQuestions, { question: newQuestion, type: newQuestionType }]);
        setNewQuestion("");
        toast({ title: "Question Added", description: "Successfully added to the list." });
    };

    const removeQuestion = (index: number) => {
        setGeneratedQuestions(generatedQuestions.filter((_, i) => i !== index));
        toast({ title: "Deleted", description: "Question removed." });
    };

    // Step 3 -> 4: Finalize & Send
    const handleFinalize = async () => {
        setIsProcessing(true);
        try {
            const userInfo = localStorage.getItem('userInfo');
            const token = userInfo ? JSON.parse(userInfo).token : null;
            const config = { headers: { Authorization: `Bearer ${token}` } };

            const response = await axios.post(`${API_URL}/interviews/finalize`, {
                jobRole,
                jobDescription,
                duration,
                interviewType,
                candidateEmails: extractedEmails,
                questions: generatedQuestions
            }, config);

            const responseData = response.data.data;
            const interview = Array.isArray(responseData) ? responseData[0] : responseData;
            setInterviewData(interview);
            setStep(4); // Success View
            toast({ title: "Success", description: "Interview created and emails sent!", duration: 5000 });

        } catch (error: any) {
            console.error(error);
            toast({ title: "Error", description: error.response?.data?.message || "Failed to finalize.", variant: "destructive" });
        } finally {
            setIsProcessing(false);
        }
    };

    // Step 4: Success View Logic
    const onCopyLink = async () => {
        if (interviewData?.interviewLink) {
            await navigator.clipboard.writeText(interviewData.interviewLink);
            toast({ title: "Copied!", description: "Link copied to clipboard." });
        }
    };

    const handleSendDirectEmail = async () => {
        if (!shareEmail.trim()) {
            toast({ title: "Email Required", description: "Please enter a candidate email.", variant: "destructive" });
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(shareEmail)) {
            toast({ title: "Invalid Email", description: "Please enter a valid email address.", variant: "destructive" });
            return;
        }

        setIsSharing(true);
        try {
            const userInfo = localStorage.getItem('userInfo');
            const token = userInfo ? JSON.parse(userInfo).token : null;
            const config = { headers: { Authorization: `Bearer ${token}` } };

            await axios.post(`${API_URL}/interviews/share/${interviewData.interviewId}`, { email: shareEmail }, config);

            toast({ title: "Sent!", description: `Invitation sent to ${shareEmail}` });
            setShareEmail("");
        } catch (error: any) {
            console.error(error);
            toast({ title: "Error", description: error.response?.data?.message || "Failed to send invitation.", variant: "destructive" });
        } finally {
            setIsSharing(false);
        }
    };

    const handleSuggestSkills = async () => {
        if (!aiRole.trim()) {
            toast({ title: "Role Required", description: "Please enter a job role first to suggest skills.", variant: "destructive" });
            return;
        }

        setIsSuggestingSkills(true);
        try {
            const response = await axios.post(`${API_URL}/ai/suggest-skills`, { role: aiRole });
            const suggested = response.data.skills || '';
            setAiSkills(suggested);
            toast({ title: "Skills Suggested", description: "Auto-populated essential skills for this role." });
        } catch (error) {
            console.error(error);
            toast({ title: "Suggestion Failed", description: "Failed to suggest skills. Please enter them manually.", variant: "destructive" });
        } finally {
            setIsSuggestingSkills(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (aiRole.trim() && !aiSkills.trim() && showAIDialog) {
                handleSuggestSkills();
            }
        }, 1500); // 1.5s debounce

        return () => clearTimeout(timer);
    }, [aiRole, showAIDialog]);

    const handleGenerateAI = async () => {
        if (!aiRole.trim() || !aiExperience.trim() || !aiSkills.trim()) {
            toast({ title: "Missing Information", description: "Job Role, Experience, and Required Skills are mandatory.", variant: "destructive" });
            return;
        }

        setIsGeneratingAI(true);
        try {
            const prompt = `Generate a comprehensive job description for the following role:

Role: ${aiRole}
Experience Required: ${aiExperience || 'Not specified'}
Required Skills: ${aiSkills || 'Not specified'}
Key Responsibilities: ${aiResponsibilities || 'Not specified'}

Please create a professional, detailed job description that includes:
- Overview of the role
- Key responsibilities
- Required qualifications and skills
- Preferred qualifications
- What the candidate will work on

Format it in a clear, professional manner suitable for a job posting.`;

            const response = await axios.post(`${API_URL}/ai/generate-description`, { prompt });

            const generatedDesc = response.data.description || response.data.data?.description || '';
            setJobDescription(generatedDesc);
            setJobRole(aiRole); // Auto-fill job role too
            setShowAIDialog(false);

            // Reset AI form
            setAiRole("");
            setAiExperience("");
            setAiSkills("");
            setAiResponsibilities("");

            toast({ title: "Success!", description: "Job description generated successfully.", duration: 3000 });
        } catch (error: any) {
            console.error(error);
            toast({
                title: "Generation Failed",
                description: error.response?.data?.message || "Could not generate description. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsGeneratingAI(false);
        }
    };



    const resetForm = () => {
        setStep(1);
        setJobRole("");
        setJobDescription("");
        setFiles([]);
        setManualEmails("");
        setGeneratedQuestions([]);
        setExtractedEmails([]);
        setInterviewData(null);
    };

    return (
        <div className="space-y-12 animate-fade-in max-w-7xl mx-auto pb-20 px-4 md:px-0">
            {step < 4 && (
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2 border-b border-border">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-foreground mb-2">
                            Create <span className="text-primary italic">Interview</span>
                        </h1>
                        <p className="text-muted-foreground font-medium">Configure your AI-powered evaluation session</p>
                    </div>

                    {/* Stepper Visual */}
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-secondary/30 p-1.5 rounded-2xl glass border-border">
                        <div
                            className={`px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer flex items-center gap-2 ${step === 1 ? 'bg-primary text-primary-foreground shadow-glow' : 'text-muted-foreground hover:bg-muted'}`}
                            onClick={() => setStep(1)}
                        >
                            <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] ${step === 1 ? 'bg-background text-primary' : 'bg-muted text-muted-foreground'}`}>1</span>
                            Job & Candidates
                        </div>
                        <div
                            className={`px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer flex items-center gap-2 ${step === 2 ? 'bg-primary text-primary-foreground shadow-glow' : 'text-muted-foreground hover:bg-muted'} ${generatedQuestions.length === 0 ? 'opacity-50 cursor-not-allowed text-[10px]' : ''}`}
                            onClick={() => generatedQuestions.length > 0 && setStep(2)}
                        >
                            <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] ${step === 2 ? 'bg-background text-primary' : 'bg-muted text-muted-foreground'}`}>2</span>
                            Edit Questions
                        </div>
                        <div
                            className={`px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer flex items-center gap-2 ${step === 3 ? 'bg-primary text-primary-foreground shadow-glow' : 'text-muted-foreground hover:bg-muted'} ${generatedQuestions.length === 0 ? 'opacity-50 cursor-not-allowed text-[10px]' : ''}`}
                            onClick={() => generatedQuestions.length > 0 && setStep(3)}
                        >
                            <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] ${step === 3 ? 'bg-background text-primary' : 'bg-muted text-muted-foreground'}`}>3</span>
                            Review & Send
                        </div>
                    </div>
                </div>
            )}


            {/* STEP 1: INPUT */}
            {step === 1 && (
                <div className="grid gap-8 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-6">
                        <Card className="glass border-border overflow-hidden group">
                            <CardHeader className="border-b border-border bg-card">
                                <CardTitle className="text-xl flex items-center gap-2 text-foreground">
                                    <span className="w-1.5 h-8 bg-primary rounded-full" />
                                    Job Details
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="space-y-2">
                                    <Label>Job Position *</Label>
                                    <Input value={jobRole} onChange={(e) => setJobRole(e.target.value)} placeholder="e.g. Senior Frontend Engineer" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Job Description *</Label>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setShowAIDialog(true)}
                                            className="h-8 text-xs"
                                        >
                                            <SparklesIcon className="h-3 w-3 mr-1" />
                                            Generate with AI
                                        </Button>
                                    </div>
                                    <Textarea
                                        value={jobDescription}
                                        onChange={(e) => setJobDescription(e.target.value)}
                                        placeholder="Full job description..."
                                        className="min-h-[150px]"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Duration</Label>
                                        <Select value={duration} onValueChange={setDuration}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="15">15 Minutes</SelectItem>
                                                <SelectItem value="30">30 Minutes</SelectItem>
                                                <SelectItem value="45">45 Minutes</SelectItem>
                                                <SelectItem value="60">60 Minutes</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Type</Label>
                                        <Select value={interviewType} onValueChange={setInterviewType}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Technical">Technical</SelectItem>
                                                <SelectItem value="Behavioral">Behavioral</SelectItem>
                                                <SelectItem value="Problem Solving">Problem Solving</SelectItem>
                                                <SelectItem value="Leadership">Leadership</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Question Limit</Label>
                                        <Select value={questionCount} onValueChange={setQuestionCount}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="5">5 Questions</SelectItem>
                                                <SelectItem value="10">10 Questions</SelectItem>
                                                <SelectItem value="15">15 Questions</SelectItem>
                                                <SelectItem value="20">20 Questions</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {isProcessing && (
                            <div className="w-full h-24 rounded-lg bg-primary/10 border border-primary/20 flex flex-col items-center justify-center animate-pulse">
                                <div className="flex items-center gap-2 text-primary font-semibold mb-1">
                                    <SparklesIcon className="animate-spin h-5 w-5" />
                                    <span>AI Agent Working...</span>
                                </div>
                                <p className="text-xs text-muted-foreground">Analyzing job & generating questions</p>
                            </div>
                        )}
                    </div>
                    <div className="space-y-6">
                        <Card>
                            <CardHeader><CardTitle>Candidates</CardTitle></CardHeader>
                            <CardContent className="space-y-6">
                                <Button className="w-full h-10 mb-2 shadow-sm order-first" onClick={handleDraftSubmit} disabled={isProcessing}>
                                    {isProcessing ? <Loader2 className="animate-spin" /> : "Next: Generate Questions"}
                                </Button>
                                <div className="space-y-2">
                                    <Label>Manual Emails</Label>
                                    <Textarea value={manualEmails} onChange={(e) => setManualEmails(e.target.value)} placeholder="a@a.com, b@b.com" className="h-20" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Upload Resumes</Label>
                                    <div className="flex items-center justify-center w-full">
                                        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors border-border">
                                            <Upload className="h-6 w-6 text-muted-foreground" />
                                            <input type="file" className="hidden" multiple accept=".pdf,.docx" onChange={handleFileChange} />
                                        </label>
                                    </div>
                                    {files.map((f, i) => (
                                        <div key={i} className="flex justify-between text-xs p-2 bg-muted rounded"><span className="truncate w-40">{f.name}</span><X className="h-4 w-4 cursor-pointer" onClick={() => handleRemoveFile(i)} /></div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )
            }


            {/* STEP 2: EDIT QUESTIONS (Enhanced UI) */}
            {
                step === 2 && (
                    <div className="space-y-8 animate-in slide-in-from-right-10 fade-in duration-300">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-bold text-foreground mb-2">Generated Questions</h2>
                            <p className="text-muted-foreground text-sm">Review and customize your interview questions</p>
                        </div>

                        {/* Add Question Form */}
                        <div className="mb-8 p-5 bg-card rounded-xl border border-border shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <MessageSquareQuoteIcon className="w-4 h-4 text-primary" />
                                <h3 className="font-semibold text-foreground">Add Custom Question</h3>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="text"
                                    value={newQuestion}
                                    onChange={(e) => setNewQuestion(e.target.value)}
                                    placeholder="Enter your question..."
                                    className="flex-1 px-4 py-2.5 border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm text-foreground"
                                />
                                <select
                                    value={newQuestionType}
                                    onChange={(e) => setNewQuestionType(e.target.value)}
                                    className="px-4 py-2.5 border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm min-w-35 text-foreground"
                                >
                                    <option value="Technical">Technical</option>
                                    <option value="Behavioral">Behavioral</option>
                                    <option value="Problem Solving">Problem Solving</option>
                                    <option value="Leadership">Leadership</option>
                                </select>
                                <Button onClick={handleAddQuestion} variant="default">
                                    <PlusIcon className="w-4 h-4 mr-2" /> Add
                                </Button>
                            </div>
                        </div>

                        {/* Questions List */}
                        <div className="space-y-3">
                            {generatedQuestions.map((item, index) => (
                                <div key={index} className="group p-4 bg-card border border-border rounded-xl shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start gap-3">
                                                <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center shadow-sm">
                                                    {index + 1}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-foreground leading-relaxed">{item.question}</p>
                                                    <span className="inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground capitalize">
                                                        {item.type}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => removeQuestion(index)} className="shrink-0 p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between mt-10 pt-6 border-t border-border">
                            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                            <Button onClick={() => setStep(3)} size="lg">Next: Final Review</Button>
                        </div>
                    </div>
                )
            }

            {/* STEP 3: FINAL REVIEW */}
            {
                step === 3 && (
                    <div className="max-w-3xl mx-auto space-y-6 animate-in zoom-in-95 duration-300">
                        <Card className="border-primary/20 shadow-lg">
                            <CardHeader>
                                <CardTitle className="text-2xl">Ready to Launch?</CardTitle>
                                <CardDescription>Review the details before sending invites to the candidates.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-lg">
                                    <div><span className="font-semibold text-muted-foreground">Role:</span> <span className="ml-2">{jobRole}</span></div>
                                    <div><span className="font-semibold text-muted-foreground">Duration:</span> <span className="ml-2">{duration} min</span></div>
                                    <div><span className="font-semibold text-muted-foreground">Type:</span> <span className="ml-2">{interviewType}</span></div>
                                    <div><span className="font-semibold text-muted-foreground">Questions:</span> <span className="ml-2">{generatedQuestions.length}</span></div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" /> Candidates found ({extractedEmails.length})</Label>
                                    <div className="p-4 bg-muted rounded-md text-sm max-h-60 overflow-y-auto border border-border">
                                        {extractedEmails.length > 0 ? extractedEmails.map((e, i) => (
                                            <div key={i} className="py-2 border-b last:border-0 border-border flex items-center gap-2 text-foreground">
                                                <div className="h-2 w-2 rounded-full bg-success"></div>
                                                {e}
                                            </div>
                                        )) : <div className="text-destructive flex items-center gap-2"><X className="h-4 w-4" /> No valid emails found. Please go back and add candidates.</div>}
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="flex justify-between bg-muted/10 p-6">
                                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                                <Button className="w-1/2 text-lg h-12 shadow-lg hover:shadow-xl transition-all" onClick={handleFinalize} disabled={isProcessing || extractedEmails.length === 0}>
                                    {isProcessing ? <><Loader2 className="animate-spin mr-2" /> Sending Invites...</> : "Send Links & Start Process"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>
                )
            }

            {/* STEP 4: PREMIUM SUCCESS VIEW */}
            {
                step === 4 && (
                    <div className="relative max-w-5xl mx-auto py-4 px-4 animate-in fade-in zoom-in-95 duration-700">
                        {/* Decorative Background Elements */}
                        <div className="absolute top-1/4 left-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -z-10 animate-pulse" />
                        <div className="absolute bottom-1/4 right-0 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl -z-10 animate-pulse delay-700" />

                        <div className="flex flex-col items-center text-center space-y-4 mb-8">
                            <div className="relative group">
                                <div className="absolute inset-0 bg-success/40 rounded-full blur-2xl opacity-40 group-hover:opacity-60 transition-opacity duration-500 animate-pulse" />
                                <div className="relative w-16 h-16 bg-gradient-to-br from-emerald-400 to-green-600 rounded-full flex items-center justify-center shadow-2xl shadow-emerald-500/30 transform group-hover:scale-110 transition-transform duration-500">
                                    <CheckCircle2 className="w-8 h-8 text-white" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <h2 className="text-3xl font-extrabold text-foreground tracking-tight">
                                    Interview <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">Successfully Created!</span>
                                </h2>
                                <p className="text-muted-foreground text-base max-w-lg mx-auto leading-relaxed">
                                    Your AI interviewer is prepped and ready to meet your top candidates.
                                </p>
                            </div>
                        </div>

                        {/* Glassmorphism Main Card */}
                        <div className="grid gap-6 md:grid-cols-5 items-start">
                            {/* Left: Link & Stats (3 cols) */}
                            <div className="md:col-span-3 space-y-6">
                                <div className="bg-card/80 backdrop-blur-xl border border-border shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 relative overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-500">
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                                <LinkIcon className="w-4 h-4 text-primary" />
                                            </div>
                                            <h3 className="font-bold text-foreground uppercase tracking-wider text-xs">Interview Access Link</h3>
                                        </div>
                                        <Badge className="bg-success/10 text-success hover:bg-success/20 border-none font-bold py-1 px-3">
                                            <span className="w-1.5 h-1.5 rounded-full bg-success mr-2 animate-pulse" />
                                            LIVE NOW
                                        </Badge>
                                    </div>

                                    <div className="relative flex items-center gap-3 bg-muted/50 p-1.5 rounded-2xl border border-border transition-colors focus-within:bg-card focus-within:border-primary/20">
                                        <Input
                                            value={interviewData?.interviewLink}
                                            readOnly
                                            className="h-10 text-sm font-mono border-none bg-transparent shadow-none focus-visible:ring-0 text-foreground w-full"
                                        />
                                        <Button
                                            onClick={onCopyLink}
                                            size="sm"
                                            className="h-8 px-4 bg-card hover:bg-muted text-primary border border-border shadow-sm rounded-xl font-bold transition-all active:scale-95"
                                        >
                                            <Copy className="w-3.5 h-3.5 mr-2" /> Copy
                                        </Button>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-border">
                                        <div className="flex flex-col items-center text-center">
                                            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center mb-1.5">
                                                <Clock className="w-4 h-4 text-blue-500" />
                                            </div>
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase">Duration</p>
                                            <p className="text-sm font-bold text-foreground mt-0.5">{duration}m</p>
                                        </div>
                                        <div className="flex flex-col items-center text-center">
                                            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center mb-1.5">
                                                <List className="w-4 h-4 text-indigo-500" />
                                            </div>
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase">Questions</p>
                                            <p className="text-sm font-bold text-foreground mt-0.5">{generatedQuestions.length}</p>
                                        </div>
                                        <div className="flex flex-col items-center text-center">
                                            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center mb-1.5">
                                                <Mail className="w-4 h-4 text-purple-500" />
                                            </div>
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase">Invited</p>
                                            <p className="text-sm font-bold text-foreground mt-0.5">{extractedEmails.length}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Quick Invite Tool (2 cols) */}
                            <div className="md:col-span-2">
                                <Card className="bg-card/80 backdrop-blur-xl border-border shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl overflow-hidden group hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-500">
                                    <div className="p-6 space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                                                <Share2 className="w-4 h-4 text-indigo-600" />
                                            </div>
                                            <h3 className="font-bold text-foreground uppercase tracking-wider text-xs">Direct Invitation</h3>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-muted-foreground ml-1">CANDIDATE EMAIL</label>
                                                <Input
                                                    type="email"
                                                    placeholder="candidate@example.com"
                                                    value={shareEmail}
                                                    onChange={(e) => setShareEmail(e.target.value)}
                                                    className="h-10 rounded-2xl bg-muted/50 border-border focus:bg-card focus:ring-primary/10 focus:border-primary focus:shadow-lg focus:shadow-primary/5 transition-all text-sm"
                                                />
                                            </div>

                                            <Button
                                                onClick={handleSendDirectEmail}
                                                disabled={isSharing}
                                                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white shadow-xl shadow-blue-500/20 rounded-2xl font-bold transition-all hover:scale-[1.02] active:scale-95 group"
                                            >
                                                {isSharing ? (
                                                    <Loader2 className="animate-spin w-4 h-4" />
                                                ) : (
                                                    <div className="flex items-center justify-center gap-2 text-sm">
                                                        <span>Send Interview Invite</span>
                                                        <Send className="w-3.5 h-3.5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                                    </div>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="px-6 py-3 bg-muted/50 border-t border-border">
                                        <p className="text-[10px] text-muted-foreground text-center uppercase font-bold tracking-tighter">
                                            Invitations use your company template
                                        </p>
                                    </div>
                                </Card>
                            </div>
                        </div>

                        {/* Secondary Actions */}
                        <div className="mt-8 flex justify-center">
                            <Button
                                onClick={resetForm}
                                variant="ghost"
                                className="group h-10 px-6 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-2xl font-semibold transition-all text-sm"
                            >
                                <PlusIcon className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform duration-500" />
                                Create Another Campaign
                            </Button>
                        </div>
                    </div>
                )
            }

            {/* AI Job Description Generator Dialog */}
            <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <SparklesIcon className="h-5 w-5 text-primary" />
                            Generate Job Description with AI
                        </DialogTitle>
                        <DialogDescription>
                            Provide details about the role and let AI create a professional job description for you.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="ai-role">Job Role *</Label>
                            <Input
                                id="ai-role"
                                value={aiRole}
                                onChange={(e) => setAiRole(e.target.value)}
                                placeholder="e.g., Senior Full Stack Developer"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="ai-experience">Experience Required *</Label>
                            <Input
                                id="ai-experience"
                                value={aiExperience}
                                onChange={(e) => setAiExperience(e.target.value)}
                                placeholder="e.g., 5+ years in web development"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="ai-skills">Required Skills *</Label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleSuggestSkills}
                                    disabled={isSuggestingSkills || !aiRole}
                                    className="h-7 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/5 gap-1.5"
                                >
                                    {isSuggestingSkills ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <SparklesIcon className="h-3 w-3" />
                                    )}
                                    Auto-Suggest
                                </Button>
                            </div>
                            <Textarea
                                id="ai-skills"
                                value={aiSkills}
                                onChange={(e) => setAiSkills(e.target.value)}
                                placeholder="e.g., React, Node.js, TypeScript, MongoDB"
                                className="h-20"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="ai-responsibilities">Key Responsibilities</Label>
                            <Textarea
                                id="ai-responsibilities"
                                value={aiResponsibilities}
                                onChange={(e) => setAiResponsibilities(e.target.value)}
                                placeholder="e.g., Lead development team, architect solutions, code reviews"
                                className="h-20"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAIDialog(false)} disabled={isGeneratingAI}>
                            Cancel
                        </Button>
                        <Button onClick={handleGenerateAI} disabled={isGeneratingAI}>
                            {isGeneratingAI ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <SparklesIcon className="mr-2 h-4 w-4" />
                                    Generate Description
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
