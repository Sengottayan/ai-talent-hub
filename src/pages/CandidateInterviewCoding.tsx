import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import axios from 'axios';
import { Loader2, Code, Play, Send, Clock, TerminalSquare } from 'lucide-react';
import InterviewHeader from '@/components/interview/InterviewHeader';
import TimerComponent from '@/components/interview/TimerComponent';
import { useInterviewData } from '@/contexts/InterviewDataContext';
import { logger } from '@/lib/logger';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import Editor from "@monaco-editor/react";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const LANGUAGES = [
    { value: 'javascript', label: 'JavaScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'cpp', label: 'C++' },
    { value: 'csharp', label: 'C#' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' },
];

export default function CandidateInterviewCoding() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { interviewInfo } = useInterviewData();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [running, setRunning] = useState(false);
    const [question, setQuestion] = useState<any>(null);
    const [code, setCode] = useState('');
    const [language, setLanguage] = useState('javascript');

    // Output state
    const [output, setOutput] = useState('');
    const [errorOutput, setErrorOutput] = useState('');

    useEffect(() => {
        if (!interviewInfo) {
            toast.error('Please start from the interview link');
            navigate(`/interview/${id}`);
            return;
        }

        const codingQ = interviewInfo.question_list?.codingQuestion;
        if (codingQ) {
            setQuestion(codingQ);

            // Set basic starter code based on language
            const defaultCode = `// Write your ${language} code here\n\n`;
            setCode(defaultCode);

        } else {
            toast.info('No coding round for this interview');
            navigate(`/interview/${id}/completed`);
            return;
        }

        setLoading(false);
    }, [interviewInfo, id, navigate, language]);

    const handleRunCode = async () => {
        if (!code.trim()) {
            toast.error('Please write some code before running');
            return;
        }

        setRunning(true);
        setOutput('Executing code...\n');
        setErrorOutput('');

        try {
            const formData = new FormData();
            formData.append('interview_id', id || '');
            formData.append('email', interviewInfo?.email || '');
            formData.append('language', language);
            formData.append('code', code);

            const response = await axios.post(`${API_URL}/api/interviews/coding-execute`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (response.data.success) {
                setOutput(response.data.output || 'Code executed successfully with no output.');
                setErrorOutput(response.data.stderr || '');
            } else {
                setErrorOutput(response.data.message || 'Execution failed.');
            }
        } catch (error: any) {
            logger.error('Failed to run code:', error);
            setErrorOutput(error.response?.data?.message || 'Failed to run code. Please try again.');
        } finally {
            setRunning(false);
        }
    };

    const handleSubmit = async () => {
        if (!code.trim()) {
            toast.error('Please write some code before submitting');
            return;
        }

        setSubmitting(true);

        try {
            // Option to run code one last time on submit (can customize this)
            await axios.post(`${API_URL}/api/interviews/coding-submission`, {
                interview_id: id,
                email: interviewInfo?.email,
                candidate_name: interviewInfo?.candidate_name,
                submission: {
                    question: question?.question || question?.title,
                    code,
                    language,
                    output,
                    errorOutput,
                    submittedAt: new Date().toISOString(),
                },
            });

            logger.log('✅ Coding submission saved');
            toast.success('Code submitted successfully!');

            setTimeout(() => {
                navigate(`/interview/${id}/completed`);
            }, 1000);
        } catch (error: any) {
            logger.error('Failed to submit code:', error);
            toast.error(error.response?.data?.message || 'Failed to submit code');
            setSubmitting(false);
        }
    };

    const handleSkip = () => {
        toast.info('Coding round skipped');
        navigate(`/interview/${id}/completed`);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
            {/* Header Area */}
            <div className="flex-none">
                <InterviewHeader />
            </div>

            {/* Top Toolbar */}
            <div className="flex-none bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <Code className="w-5 h-5 text-violet-600" />
                    <span className="font-semibold text-lg text-slate-800">Coding Assessment</span>
                </div>

                <div className="flex items-center gap-4">
                    {interviewInfo && (
                        <div className="bg-blue-50 text-blue-800 px-3 py-1.5 rounded-full text-sm font-medium border border-blue-100 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <TimerComponent
                                interviewId={id!}
                                duration="45 minutes"
                                onTimeout={handleSubmit}
                                userEmail={interviewInfo.email}
                            />
                        </div>
                    )}

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSkip}
                        disabled={submitting || running}
                        className="text-slate-500"
                    >
                        Skip
                    </Button>
                </div>
            </div>

            {/* Split View */}
            <div className="flex-1 overflow-hidden p-2">
                <ResizablePanelGroup direction="horizontal" className="h-full w-full rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                    {/* Left Panel: Problem Description */}
                    <ResizablePanel defaultSize={40} minSize={30} className="bg-white overflow-hidden flex flex-col">
                        <div className="p-4 bg-slate-50 border-b border-slate-200 flex-none">
                            <h2 className="text-xl font-bold text-slate-800">Problem Statement</h2>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 prose prose-slate max-w-none">
                            <h3 className="text-xl font-semibold mb-4 text-violet-900 border-b pb-2">
                                {question?.title || "Coding Challenge"}
                            </h3>

                            <div className="text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                                {question?.question || question?.description}
                            </div>

                            {question?.examples && (
                                <div className="mt-8">
                                    <h4 className="font-bold text-slate-800 mb-3">Examples:</h4>
                                    <div className="bg-slate-100 rounded-md p-4 text-sm font-mono text-slate-800 whitespace-pre-wrap border border-slate-200">
                                        {question.examples}
                                    </div>
                                </div>
                            )}

                            {question?.constraints && (
                                <div className="mt-8">
                                    <h4 className="font-bold text-slate-800 mb-3">Constraints:</h4>
                                    <ul className="bg-yellow-50 rounded-md p-4 text-sm text-yellow-900 border border-yellow-200 list-disc pl-6 space-y-1">
                                        <li>{question.constraints}</li>
                                    </ul>
                                </div>
                            )}
                        </div>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    {/* Right Panel: Editor & Console */}
                    <ResizablePanel defaultSize={60} minSize={30}>
                        <ResizablePanelGroup direction="vertical" className="h-full">

                            {/* Editor Area */}
                            <ResizablePanel defaultSize={70} minSize={20} className="flex flex-col bg-[#1e1e1e]">
                                {/* Editor Toolbar */}
                                <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-[#444] flex-none">
                                    <Select value={language} onValueChange={setLanguage}>
                                        <SelectTrigger className="w-40 h-8 bg-[#3c3c3c] text-slate-200 border-[#555] focus:ring-1 focus:ring-violet-500">
                                            <SelectValue placeholder="Language" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#2d2d2d] text-slate-200 border-[#444]">
                                            {LANGUAGES.map((lang) => (
                                                <SelectItem
                                                    key={lang.value}
                                                    value={lang.value}
                                                    className="focus:bg-[#3c3c3c] focus:text-white cursor-pointer"
                                                >
                                                    {lang.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={handleRunCode}
                                            disabled={running || submitting}
                                            className="bg-slate-200 hover:bg-white text-slate-800 font-medium px-4 h-8"
                                        >
                                            {running ? (
                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            ) : (
                                                <Play className="w-4 h-4 mr-2" />
                                            )}
                                            Run Code
                                        </Button>

                                        <Button
                                            size="sm"
                                            onClick={handleSubmit}
                                            disabled={submitting || running}
                                            className="bg-green-600 hover:bg-green-500 text-white font-medium px-4 h-8"
                                        >
                                            {submitting ? (
                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            ) : (
                                                <Send className="w-4 h-4 mr-2" />
                                            )}
                                            Submit
                                        </Button>
                                    </div>
                                </div>

                                {/* Monaco Editor */}
                                <div className="flex-1 overflow-hidden relative">
                                    <Editor
                                        height="100%"
                                        language={language}
                                        value={code}
                                        onChange={(val) => setCode(val || '')}
                                        theme="vs-dark"
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 14,
                                            lineHeight: 24,
                                            padding: { top: 16 },
                                            scrollBeyondLastLine: false,
                                            smoothScrolling: true,
                                            cursorBlinking: "smooth",
                                            cursorSmoothCaretAnimation: "on",
                                            formatOnPaste: true,
                                            wordWrap: "on"
                                        }}
                                    />
                                </div>
                            </ResizablePanel>

                            <ResizableHandle withHandle className="bg-[#444]" />

                            {/* Console/Output Area */}
                            <ResizablePanel defaultSize={30} minSize={10} className="bg-[#1e1e1e] flex flex-col">
                                <div className="px-4 py-2 bg-[#2d2d2d] border-b border-[#444] flex items-center justify-between flex-none">
                                    <div className="flex items-center gap-2 text-slate-300 text-sm font-medium">
                                        <TerminalSquare className="w-4 h-4" />
                                        Test Results
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
                                    {!output && !errorOutput && !running && (
                                        <div className="text-slate-500 italic h-full flex items-center justify-center">
                                            Run your code to see outputs here.
                                        </div>
                                    )}
                                    {running && (
                                        <div className="text-slate-400 animate-pulse">
                                            Executing and evaluating test cases...
                                        </div>
                                    )}
                                    {output && !running && (
                                        <pre className="text-green-400 whitespace-pre-wrap mb-4 font-mono">{output}</pre>
                                    )}
                                    {errorOutput && !running && (
                                        <pre className="text-red-400 whitespace-pre-wrap font-mono mt-2">{errorOutput}</pre>
                                    )}
                                </div>
                            </ResizablePanel>

                        </ResizablePanelGroup>
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
}
