import { useState, useRef, useEffect } from "react";
import {
  Upload,
  X,
  Loader2,
  Link as LinkIcon,
  Trash2,
  Plus,
  Mail,
  MessageSquareQuoteIcon,
  SparklesIcon,
  CheckCircle2,
  Copy,
  ExternalLink,
  Calendar,
  Clock,
  List,
  Share2,
  Phone,
  Linkedin,
  ArrowLeft,
  PlusIcon,
  Send,
  Pencil,
  Users,
  AlertCircle,
  Info,
  HelpCircle,
  Briefcase,
  Layout,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

type TestCase = {
  input: string;
  output: string;
};

type Question = {
  question: string;
  type: string;
  difficulty?: string;
  testCases?: TestCase[];
};

export default function ResumeUpload() {
  // Form State
  const [jobRole, setJobRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [duration, setDuration] = useState("30");
  const [interviewType, setInterviewType] = useState("Technical");
  const [questionCount, setQuestionCount] = useState("10");
  const [cooldownPeriod, setCooldownPeriod] = useState("90");
  const [questionMode, setQuestionMode] = useState("JD_ONLY");

  // Candidate Source State
  const [files, setFiles] = useState<File[]>([]);
  const [manualEmails, setManualEmails] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [isSharing, setIsSharing] = useState(false);

  // Output State
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [extractedEmails, setExtractedEmails] = useState<string[]>([]);
  const [cooldownInfo, setCooldownInfo] = useState<any[]>([]);
  const [interviewData, setInterviewData] = useState<any>(null); // For success step
  const [resumeTexts, setResumeTexts] = useState<any>({}); // map of email -> text from server

  // UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState(1);
  const [editingEmail, setEditingEmail] = useState<{
    index: number;
    value: string;
  } | null>(null);
  const { toast } = useToast();

  // Editor State (Step 2)
  const [newQuestion, setNewQuestion] = useState("");
  const [newQuestionType, setNewQuestionType] = useState("Technical");
  const [newQuestionDifficulty, setNewQuestionDifficulty] = useState("Medium");
  const [newTestCases, setNewTestCases] = useState<TestCase[]>([
    { input: "", output: "" },
  ]);

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

      // Limit to 1 resume for personalized modes for better quality control in Step 2 review
      if (questionMode !== "JD_ONLY" && files.length + newFiles.length > 1) {
        toast({
          title: "Limit: 1 Resume",
          description: `${questionMode.replace("_", " ")} mode focuses on individual personalization. Please upload 1 resume at a time to review its unique questions.`,
          variant: "destructive",
        });
        return;
      }

      setFiles([...files, ...newFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  // Step 1: Submit to Draft (Generate Questions & Parse Emails)
  const handleDraftSubmit = async () => {
    // Validation: Job fields are required for JD_ONLY and HYBRID, but but not necessarily CV_ONLY
    if (questionMode !== "CV_ONLY" && (!jobRole || !jobDescription)) {
      toast({
        title: "Missing Information",
        description: "Job Role and Description are required for this mode.",
        variant: "destructive",
      });
      return;
    }

    // Even for CV_ONLY, let's suggest a default Job Role name if empty for interview title
    if (questionMode === "CV_ONLY" && !jobRole) {
      setJobRole("Candidate Assessment");
    }

    // Strict Requirement for Resume in CV-based modes
    if (
      (questionMode === "CV_ONLY" || questionMode === "HYBRID") &&
      files.length === 0
    ) {
      toast({
        title: "Resumes Required",
        description: `For ${questionMode.replace("_", " ")} mode, you must upload at least one resume.`,
        variant: "destructive",
      });
      return;
    }

    if (files.length === 0 && !manualEmails) {
      toast({
        title: "No Candidates",
        description: "Please provide resumes or emails.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    const formData = new FormData();
    formData.append("jobRole", jobRole);
    formData.append("jobDescription", jobDescription);
    formData.append("duration", duration);
    formData.append("interviewType", interviewType);
    formData.append("questionCount", questionCount);
    formData.append("questionMode", questionMode); // Send mode to server
    files.forEach((file) => formData.append("resumes", file));
    if (manualEmails) {
      const emails = manualEmails
        .split(/[\n,]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e);
      if (emails.length > 0)
        formData.append("candidateEmails", JSON.stringify(emails));
    }

    try {
      const userInfo = localStorage.getItem("userInfo");
      const token = userInfo ? JSON.parse(userInfo).token : null;
      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      };

      const response = await axios.post(
        `${API_URL}/interviews/draft`,
        formData,
        config,
      );

      const {
        questions,
        candidateEmails,
        cooldownInfo,
        isCooldownViolation,
        resumeTexts: extractedTexts,
      } = response.data.data;

      setGeneratedQuestions(questions || []);
      setExtractedEmails(candidateEmails || []);
      setCooldownInfo(cooldownInfo || []);
      setResumeTexts(extractedTexts || {});

      if (isCooldownViolation && (!questions || questions.length === 0)) {
        // Cooldown blocked generation
        setStep(3); // Jump to review so they can remove candidates
        toast({
          title: "Cooldown Detected",
          description: `Questions were NOT generated to save resources. Please remove duplicate candidates from the review list.`,
          variant: "destructive",
        });
        return;
      }

      if (cooldownInfo?.length > 0) {
        toast({
          title: "Cooldown Warning",
          description: `Some candidates are in a cooldown period. Review them before proceeding.`,
          variant: "destructive",
        });
      }

      // Only move to step 2 if we actually have questions to edit
      if (questions && questions.length > 0) {
        setStep(2);
      } else {
        setStep(3);
      }
    } catch (error: any) {
      console.error(error);
      const status = error.response?.status;
      const errorData = error.response?.data?.data;

      if (status === 409 && error.response?.data?.isCooldownViolation) {
        // Backend strictly blocked generation due to cooldown
        setExtractedEmails(errorData.candidateEmails || []);
        setCooldownInfo(errorData.cooldownInfo || []);
        setGeneratedQuestions([]);
        setStep(3); // Jump to review step so they can see the badges and remove candidates

        toast({
          title: "Cooldown Violation",
          description:
            "Resources preserved. High-priority cooldown detected. Please remove candidates to proceed.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Error",
        description:
          error.response?.data?.message || "Failed to generate draft.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2: Advanced Question Editor
  const handleAddQuestion = () => {
    if (!newQuestion.trim()) {
      toast({
        title: "Empty Question",
        description: "Please enter a question text.",
        variant: "destructive",
      });
      return;
    }
    const questionPayload: Question = {
      question: newQuestion,
      type: newQuestionType === "Problem Solving" ? "Coding" : newQuestionType,
      difficulty: newQuestionDifficulty,
    };
    if (newQuestionType === "Problem Solving") {
      const validTestCases = newTestCases.filter(
        (tc) => tc.input.trim() || tc.output.trim(),
      );
      if (validTestCases.length > 0) {
        questionPayload.testCases = validTestCases;
      }
    }
    setGeneratedQuestions([...generatedQuestions, questionPayload]);
    setNewQuestion("");
    setNewQuestionDifficulty("Medium");
    setNewTestCases([{ input: "", output: "" }]);
    toast({
      title: "Question Added",
      description: "Successfully added to the list.",
    });
  };

  const removeQuestion = (index: number) => {
    setGeneratedQuestions(generatedQuestions.filter((_, i) => i !== index));
    toast({ title: "Deleted", description: "Question removed." });
  };

  // Step 3 -> 4: Finalize & Send
  const handleFinalize = async () => {
    setIsProcessing(true);
    try {
      const userInfo = localStorage.getItem("userInfo");
      const token = userInfo ? JSON.parse(userInfo).token : null;
      const config = { headers: { Authorization: `Bearer ${token}` } };

      const response = await axios.post(
        `${API_URL}/interviews/finalize`,
        {
          jobRole,
          jobDescription,
          duration,
          interviewType,
          candidateEmails: extractedEmails,
          questions: generatedQuestions,
          cooldownPeriod: parseInt(cooldownPeriod),
          questionMode, // Send the selected mode
          resumeTexts, // Send the map of email -> text
        },
        config,
      );

      const responseData = response.data.data;
      const interview = Array.isArray(responseData)
        ? responseData[0]
        : responseData;
      setInterviewData(interview);
      setStep(4); // Success View
      toast({
        title: "Success",
        description: "Interview created and emails sent!",
        duration: 5000,
      });
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to finalize.",
        variant: "destructive",
      });
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
      toast({
        title: "Email Required",
        description: "Please enter a candidate email.",
        variant: "destructive",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(shareEmail)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSharing(true);
    try {
      const userInfo = localStorage.getItem("userInfo");
      const token = userInfo ? JSON.parse(userInfo).token : null;
      const config = { headers: { Authorization: `Bearer ${token}` } };

      await axios.post(
        `${API_URL}/interviews/share/${interviewData.interviewId}`,
        { email: shareEmail },
        config,
      );

      toast({
        title: "Sent!",
        description: `Invitation sent to ${shareEmail}`,
      });
      setShareEmail("");
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Error",
        description:
          error.response?.data?.message || "Failed to send invitation.",
        variant: "destructive",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const handleSuggestSkills = async () => {
    if (!aiRole.trim()) {
      toast({
        title: "Role Required",
        description: "Please enter a job role first to suggest skills.",
        variant: "destructive",
      });
      return;
    }

    setIsSuggestingSkills(true);
    try {
      const response = await axios.post(`${API_URL}/ai/suggest-skills`, {
        role: aiRole,
      });
      const suggested = response.data.skills || "";
      setAiSkills(suggested);
      toast({
        title: "Skills Suggested",
        description: "Auto-populated essential skills for this role.",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Suggestion Failed",
        description: "Failed to suggest skills. Please enter them manually.",
        variant: "destructive",
      });
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
      toast({
        title: "Missing Information",
        description: "Job Role, Experience, and Required Skills are mandatory.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingAI(true);
    try {
      const prompt = `Generate a comprehensive job description for the following role:

Role: ${aiRole}
Experience Required: ${aiExperience || "Not specified"}
Required Skills: ${aiSkills || "Not specified"}
Key Responsibilities: ${aiResponsibilities || "Not specified"}

Please create a professional, detailed job description that includes:
- Overview of the role
- Key responsibilities
- Required qualifications and skills
- Preferred qualifications
- What the candidate will work on

Format it in a clear, professional manner suitable for a job posting.`;

      const response = await axios.post(`${API_URL}/ai/generate-description`, {
        prompt,
      });

      const generatedDesc =
        response.data.description || response.data.data?.description || "";
      setJobDescription(generatedDesc);
      setJobRole(aiRole); // Auto-fill job role too
      setShowAIDialog(false);

      // Reset AI form
      setAiRole("");
      setAiExperience("");
      setAiSkills("");
      setAiResponsibilities("");

      toast({
        title: "Success!",
        description: "Job description generated successfully.",
        duration: 3000,
      });
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Generation Failed",
        description:
          error.response?.data?.message ||
          "Could not generate description. Please try again.",
        variant: "destructive",
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

  const handleEditCandidate = (index: number) => {
    setEditingEmail({ index, value: extractedEmails[index] });
  };

  const saveEditedEmail = () => {
    if (!editingEmail) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editingEmail.value)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    const updated = [...extractedEmails];
    updated[editingEmail.index] = editingEmail.value.toLowerCase().trim();
    setExtractedEmails(updated);
    setEditingEmail(null);
    toast({
      title: "Email Updated",
      description: "Candidate email has been corrected.",
    });
  };

  const removeCandidate = (index: number) => {
    setExtractedEmails(extractedEmails.filter((_, i) => i !== index));
    toast({
      title: "Candidate Removed",
      description: "Email removed from the invitation list.",
    });
  };

  return (
    <div className="space-y-12 animate-fade-in max-w-7xl mx-auto pb-20 px-4 md:px-0">
      {step < 4 && (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2 border-b border-border">
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-foreground mb-2">
              Create <span className="text-primary italic">Interview</span>
            </h1>
            <p className="text-muted-foreground font-medium">
              Configure your AI-powered evaluation session
            </p>
          </div>

          {/* Stepper Visual */}
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-secondary/30 p-1.5 rounded-2xl glass border-border">
            <div
              className={`px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer flex items-center gap-2 ${step === 1 ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setStep(1)}
            >
              <span
                className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] ${step === 1 ? "bg-background text-primary" : "bg-muted text-muted-foreground"}`}
              >
                1
              </span>
              Job & Candidates
            </div>
            <div
              className={`px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer flex items-center gap-2 ${step === 2 ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:bg-muted"} ${generatedQuestions.length === 0 ? "opacity-50 cursor-not-allowed text-[10px]" : ""}`}
              onClick={() => generatedQuestions.length > 0 && setStep(2)}
            >
              <span
                className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] ${step === 2 ? "bg-background text-primary" : "bg-muted text-muted-foreground"}`}
              >
                2
              </span>
              Edit Questions
            </div>
            <div
              className={`px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer flex items-center gap-2 ${step === 3 ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:bg-muted"} ${generatedQuestions.length === 0 ? "opacity-50 cursor-not-allowed text-[10px]" : ""}`}
              onClick={() => generatedQuestions.length > 0 && setStep(3)}
            >
              <span
                className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] ${step === 3 ? "bg-background text-primary" : "bg-muted text-muted-foreground"}`}
              >
                3
              </span>
              Review & Send
            </div>
          </div>
        </div>
      )}

      {/* Edit Candidate Email Dialog */}
      <Dialog
        open={editingEmail !== null}
        onOpenChange={(open) => !open && setEditingEmail(null)}
      >
        <DialogContent className="sm:max-w-md bg-card border-border backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Edit Candidate Email
            </DialogTitle>
            <DialogDescription>
              Correct any errors in the extracted email address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email Address</Label>
              <Input
                id="edit-email"
                value={editingEmail?.value || ""}
                onChange={(e) =>
                  setEditingEmail((prev) =>
                    prev ? { ...prev, value: e.target.value } : null,
                  )
                }
                placeholder="name@example.com"
                className="bg-background border-border"
                onKeyDown={(e) => e.key === "Enter" && saveEditedEmail()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEmail(null)}>
              Cancel
            </Button>
            <Button onClick={saveEditedEmail}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <div className="space-y-2 border-b border-border pb-6 mb-6">
                  <Label className="text-sm font-bold flex items-center gap-2">
                    <SparklesIcon className="w-4 h-4 text-primary" />
                    AI Question Generation Mode
                  </Label>
                  <div className="grid grid-cols-3 gap-3 pt-1">
                    {["JD_ONLY", "CV_ONLY", "HYBRID"].map((mode) => (
                      <div
                        key={mode}
                        onClick={() => setQuestionMode(mode)}
                        className={`cursor-pointer border rounded-xl p-3 flex flex-col items-center gap-1.5 transition-all duration-300 ${questionMode === mode ? "bg-primary/10 border-primary shadow-glow scale-[1.02]" : "bg-background hover:bg-muted border-border"}`}
                      >
                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                          {mode.replace("_", " ")}
                        </span>
                        <span className="text-[9px] text-muted-foreground text-center leading-tight">
                          {mode === "JD_ONLY"
                            ? "Based on Job Desc"
                            : mode === "CV_ONLY"
                              ? "Based on Resume"
                              : "Resume + Job Desc"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    {questionMode === "JD_ONLY" &&
                      "Generates one set of questions for all candidates based on your Job Description."}
                    {questionMode === "CV_ONLY" &&
                      "Analyzes each candidate's resume individually (Job context is optional)."}
                    {questionMode === "HYBRID" &&
                      "Combines role-specific JD requirements with candidate-specific resume insights."}
                  </p>
                </div>

                <div
                  className={`space-y-6 transition-all duration-500 ${questionMode === "CV_ONLY" ? "opacity-40 grayscale pointer-events-none select-none" : ""}`}
                >
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">
                      Job Position *
                    </Label>
                    <Input
                      value={jobRole}
                      onChange={(e) => setJobRole(e.target.value)}
                      placeholder="e.g. Senior Frontend Engineer"
                      className="max-w-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">
                        Job Description *
                      </Label>
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
                      className="min-h-[150px] text-base leading-relaxed p-4"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Duration</Label>
                      <Select value={duration} onValueChange={setDuration}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
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
                      <Select
                        value={interviewType}
                        onValueChange={setInterviewType}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Technical">Technical</SelectItem>
                          <SelectItem value="Behavioral">Behavioral</SelectItem>
                          <SelectItem value="Problem Solving">
                            Problem Solving
                          </SelectItem>
                          <SelectItem value="Leadership">Leadership</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Question Limit</Label>
                      <Select
                        value={questionCount}
                        onValueChange={setQuestionCount}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 Questions</SelectItem>
                          <SelectItem value="10">10 Questions</SelectItem>
                          <SelectItem value="15">15 Questions</SelectItem>
                          <SelectItem value="20">20 Questions</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Cooldown Period</Label>
                      <Select
                        value={cooldownPeriod}
                        onValueChange={setCooldownPeriod}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">No Cooldown</SelectItem>
                          <SelectItem value="30">30 Days</SelectItem>
                          <SelectItem value="60">60 Days</SelectItem>
                          <SelectItem value="90">90 Days (3 Months)</SelectItem>
                          <SelectItem value="180">
                            180 Days (6 Months)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
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
                <p className="text-xs text-muted-foreground">
                  Analyzing job & generating questions
                </p>
              </div>
            )}
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Candidates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <Button
                  className="w-full h-10 mb-2 shadow-sm order-first"
                  onClick={handleDraftSubmit}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    "Next: Generate Questions"
                  )}
                </Button>
                <div
                  className={`space-y-2 transition-all duration-300 ${questionMode === "CV_ONLY" ? "opacity-30 grayscale pointer-events-none select-none" : ""}`}
                >
                  <Label className="text-sm font-semibold">Manual Emails</Label>
                  <Textarea
                    value={manualEmails}
                    onChange={(e) => setManualEmails(e.target.value)}
                    placeholder={
                      questionMode === "CV_ONLY"
                        ? "N/A for CV Mode"
                        : "a@a.com, b@b.com"
                    }
                    className="h-24 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      Upload Resumes
                      {(questionMode === "CV_ONLY" ||
                        questionMode === "HYBRID") && (
                        <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-bold uppercase">
                          Required
                        </span>
                      )}
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      {files.length} added
                    </span>
                  </div>
                  {(questionMode === "CV_ONLY" || questionMode === "HYBRID") &&
                    files.length === 0 && (
                      <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-xs text-destructive flex items-start gap-2 animate-pulse shadow-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>
                          Please upload at least one resume to use{" "}
                          {questionMode.replace("_", " ")} mode.
                        </span>
                      </div>
                    )}
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-all border-primary/20 hover:border-primary/50 group bg-secondary/10">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <div className="p-3 bg-primary/10 rounded-full mb-3 group-hover:scale-110 transition-transform">
                          <Upload className="h-8 w-8 text-primary" />
                        </div>
                        <p className="mb-2 text-sm font-bold text-foreground">
                          <span className="text-primary italic">
                            Click to upload
                          </span>{" "}
                          or drag and drop
                        </p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                          PDF or DOCX (Max 10MB)
                        </p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept=".pdf,.docx"
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                  <div className="space-y-2 mt-4">
                    {files.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 bg-card border border-border rounded-lg shadow-sm group animate-in fade-in slide-in-from-left-2"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="p-2 bg-primary/10 rounded text-primary">
                            <Briefcase className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-semibold truncate text-foreground">
                            {f.name}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveFile(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* STEP 2: EDIT QUESTIONS (Enhanced UI) */}
      {step === 2 && (
        <div className="space-y-8 animate-in slide-in-from-right-10 fade-in duration-300">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Generated Questions
            </h2>
            <p className="text-muted-foreground text-sm">
              Review and customize your interview questions
            </p>
          </div>

          {/* Add Question Form */}
          <div className="mb-8 p-5 bg-card rounded-xl border border-border shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquareQuoteIcon className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">
                Add Custom Question
              </h3>
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
              <select
                value={newQuestionDifficulty}
                onChange={(e) => setNewQuestionDifficulty(e.target.value)}
                className="px-4 py-2.5 border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm min-w-30 text-foreground"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
              <Button onClick={handleAddQuestion} variant="default">
                <PlusIcon className="w-4 h-4 mr-2" /> Add
              </Button>
            </div>
            {newQuestionType === "Problem Solving" && (
              <div className="mt-4 space-y-3 p-4 bg-muted/30 rounded-lg border border-border">
                <h4 className="text-sm font-semibold text-foreground">
                  Test Cases (for code evaluation)
                </h4>
                {newTestCases.map((tc, index) => (
                  <div key={index} className="flex gap-3">
                    <Input
                      placeholder="Input (e.g., 'hello')"
                      value={tc.input}
                      onChange={(e) => {
                        const updated = [...newTestCases];
                        updated[index].input = e.target.value;
                        setNewTestCases(updated);
                      }}
                      className="flex-1 text-sm bg-background"
                    />
                    <Input
                      placeholder="Output (e.g., 'hello')"
                      value={tc.output}
                      onChange={(e) => {
                        const updated = [...newTestCases];
                        updated[index].output = e.target.value;
                        setNewTestCases(updated);
                      }}
                      className="flex-1 text-sm bg-background"
                    />
                    {newTestCases.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setNewTestCases(
                            newTestCases.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setNewTestCases([
                      ...newTestCases,
                      { input: "", output: "" },
                    ])
                  }
                >
                  <PlusIcon className="h-4 w-4 mr-1" /> Add Test Case
                </Button>
              </div>
            )}
          </div>

          {/* Questions List */}
          <div className="space-y-3">
            {generatedQuestions.map((item, index) => (
              <div
                key={index}
                className="group p-4 bg-card border border-border rounded-xl shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center shadow-sm">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground leading-relaxed">
                          {item.question}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground capitalize">
                            {item.type}
                          </span>
                          {item.difficulty && (
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.difficulty === "Hard" ? "bg-red-100 text-red-700" : item.difficulty === "Medium" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}
                            >
                              {item.difficulty}
                            </span>
                          )}
                          {item.testCases && item.testCases.length > 0 && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              {item.testCases.length} Test Cases
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeQuestion(index)}
                    className="shrink-0 p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between mt-10 pt-6 border-t border-border">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)} size="lg">
              Next: Final Review
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: FINAL REVIEW */}
      {step === 3 && (
        <div className="max-w-3xl mx-auto space-y-6 animate-in zoom-in-95 duration-300">
          <Card className="border-primary/20 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Ready to Launch?</CardTitle>
              <CardDescription>
                Review the details before sending invites to the candidates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-lg">
                <div>
                  <span className="font-semibold text-muted-foreground">
                    Role:
                  </span>{" "}
                  <span className="ml-2">{jobRole}</span>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground">
                    Duration:
                  </span>{" "}
                  <span className="ml-2">{duration} min</span>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground">
                    Type:
                  </span>{" "}
                  <span className="ml-2">{interviewType}</span>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground">
                    Questions:
                  </span>{" "}
                  <span className="ml-2">{generatedQuestions.length}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 font-semibold">
                  <Mail className="h-4 w-4" /> Candidates found (
                  {extractedEmails.length})
                </Label>
                <div className="p-4 bg-muted rounded-md text-sm max-h-60 overflow-y-auto border border-border">
                  {extractedEmails.length > 0 ? (
                    extractedEmails.map((e, i) => {
                      const violation = cooldownInfo.find(
                        (c) => c.email.toLowerCase() === e.toLowerCase(),
                      );
                      return (
                        <div
                          key={i}
                          className="py-3 border-b last:border-0 border-border flex items-center justify-between text-foreground"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div
                              className={`h-2 w-2 rounded-full ${violation ? "bg-destructive" : "bg-success"} shrink-0`}
                            ></div>
                            <span className="font-medium truncate">{e}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {violation?.isViolation && (
                              <div className="flex flex-col items-end gap-0.5 mr-2">
                                <Badge
                                  variant="destructive"
                                  className="font-bold text-[9px] scale-90 py-0 h-4 uppercase tracking-tighter"
                                >
                                  COOLDOWN
                                </Badge>
                                <span className="text-[8px] text-destructive italic font-bold">
                                  Wait until:{" "}
                                  {new Date(
                                    violation.cooldownUntil,
                                  ).toLocaleDateString()}
                                </span>
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors"
                              onClick={() => handleEditCandidate(i)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-colors"
                              onClick={() => removeCandidate(i)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-destructive flex items-center gap-2">
                      <X className="h-4 w-4" /> No valid emails found. Please go
                      back and add candidates.
                    </div>
                  )}
                </div>

                {cooldownInfo.some(
                  (c) => c.isViolation && extractedEmails.includes(c.email),
                ) && (
                  <div className="mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 animate-pulse">
                    <p className="text-xs text-destructive font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Action Required: Please remove candidates with a COOLDOWN
                      badge to enable the send button.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between bg-muted/10 p-6">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                className="w-1/2 text-lg h-12 shadow-lg hover:shadow-xl transition-all"
                onClick={handleFinalize}
                disabled={
                  isProcessing ||
                  extractedEmails.length === 0 ||
                  cooldownInfo.some(
                    (c) => c.isViolation && extractedEmails.includes(c.email),
                  )
                }
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="animate-spin mr-2" /> Sending Invites...
                  </>
                ) : (
                  "Send Links & Start Process"
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* STEP 4: PREMIUM SUCCESS VIEW */}
      {step === 4 && (
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
                Interview{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                  Successfully Created!
                </span>
              </h2>
              <p className="text-muted-foreground text-base max-w-lg mx-auto leading-relaxed">
                Your AI interviewer is prepped and ready to meet your top
                candidates.
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
                    <h3 className="font-bold text-foreground uppercase tracking-wider text-xs">
                      Interview Access Link
                    </h3>
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
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">
                      Duration
                    </p>
                    <p className="text-sm font-bold text-foreground mt-0.5">
                      {duration}m
                    </p>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center mb-1.5">
                      <List className="w-4 h-4 text-indigo-500" />
                    </div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">
                      Questions
                    </p>
                    <p className="text-sm font-bold text-foreground mt-0.5">
                      {generatedQuestions.length}
                    </p>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center mb-1.5">
                      <Mail className="w-4 h-4 text-purple-500" />
                    </div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">
                      Invited
                    </p>
                    <p className="text-sm font-bold text-foreground mt-0.5">
                      {extractedEmails.length}
                    </p>
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
                    <h3 className="font-bold text-foreground uppercase tracking-wider text-xs">
                      Direct Invitation
                    </h3>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground ml-1">
                        CANDIDATE EMAIL
                      </label>
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
      )}

      {/* AI Job Description Generator Dialog */}
      <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SparklesIcon className="h-5 w-5 text-primary" />
              Generate Job Description with AI
            </DialogTitle>
            <DialogDescription>
              Provide details about the role and let AI create a professional
              job description for you.
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
            <Button
              variant="outline"
              onClick={() => setShowAIDialog(false)}
              disabled={isGeneratingAI}
            >
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
    </div>
  );
}
