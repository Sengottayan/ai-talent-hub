import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import axios from 'axios';
import { Loader2, Code, Send, Clock } from 'lucide-react';
import InterviewHeader from '@/components/interview/InterviewHeader';
import TimerComponent from '@/components/interview/TimerComponent';
import { useInterviewData } from '@/contexts/InterviewDataContext';
import { logger } from '@/lib/logger';

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
    const [question, setQuestion] = useState<any>(null);
    const [code, setCode] = useState('');
    const [language, setLanguage] = useState('javascript');
    const [explanation, setExplanation] = useState('');

    useEffect(() => {
        if (!interviewInfo) {
            toast.error('Please start from the interview link');
            navigate(`/interview/${id}`);
            return;
        }

        // Get coding question from interview info
        const codingQ = interviewInfo.question_list?.codingQuestion;
        if (codingQ) {
            setQuestion(codingQ);
        } else {
            // If no coding question, skip to completion
            toast.info('No coding round for this interview');
            navigate(`/interview/${id}/completed`);
            return;
        }

        setLoading(false);
    }, [interviewInfo, id, navigate]);

    const handleSubmit = async () => {
        if (!code.trim()) {
            toast.error('Please write some code before submitting');
            return;
        }

        setSubmitting(true);

        try {
            await axios.post(`${API_URL}/api/interviews/coding-submission`, {
                interview_id: id,
                email: interviewInfo?.email,
                candidate_name: interviewInfo?.candidate_name,
                submission: {
                    question: question?.question || question?.title,
                    code,
                    language,
                    explanation,
                    submittedAt: new Date().toISOString(),
                },
            });

            logger.log('✅ Coding submission saved');
            toast.success('Code submitted successfully!');

            // Navigate to completion
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
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30">
            <InterviewHeader />

            <div className="container mx-auto px-4 py-6 max-w-6xl">
                <div className="space-y-6">

                    {/* Header */}
                    <Card className="border-violet-200 bg-white/80 backdrop-blur-sm">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
                                    <Code className="w-6 h-6 text-violet-600" />
                                    Coding Round
                                </CardTitle>
                                <p className="text-slate-600 mt-1">Write your solution below</p>
                            </div>

                            {interviewInfo && (
                                <TimerComponent
                                    interviewId={id!}
                                    duration="30 minutes"
                                    onTimeout={handleSubmit}
                                    userEmail={interviewInfo.email}
                                />
                            )}
                        </CardHeader>
                    </Card>

                    {/* Question */}
                    <Card className="shadow-lg border-violet-100">
                        <CardHeader>
                            <CardTitle className="text-lg">Problem Statement</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="prose prose-slate max-w-none">
                                <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">
                                    {question?.question || question?.title || question?.description}
                                </p>

                                {question?.examples && (
                                    <div className="mt-4 p-4 bg-slate-50 rounded-lg">
                                        <div className="font-semibold text-sm text-slate-700 mb-2">Examples:</div>
                                        <pre className="text-sm text-slate-800 whitespace-pre-wrap">
                                            {question.examples}
                                        </pre>
                                    </div>
                                )}

                                {question?.constraints && (
                                    <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                                        <div className="font-semibold text-sm text-blue-700 mb-2">Constraints:</div>
                                        <p className="text-sm text-blue-800">{question.constraints}</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Code Editor */}
                    <Card className="shadow-lg border-violet-100">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg">Your Solution</CardTitle>
                                <Select value={language} onValueChange={setLanguage}>
                                    <SelectTrigger className="w-40">
                                        <SelectValue placeholder="Language" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {LANGUAGES.map((lang) => (
                                            <SelectItem key={lang.value} value={lang.value}>
                                                {lang.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="Write your code here..."
                                className="min-h-[400px] font-mono text-sm"
                                disabled={submitting}
                            />
                        </CardContent>
                    </Card>

                    {/* Explanation */}
                    <Card className="shadow-lg border-violet-100">
                        <CardHeader>
                            <CardTitle className="text-lg">Explanation (Optional)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                value={explanation}
                                onChange={(e) => setExplanation(e.target.value)}
                                placeholder="Explain your approach, time complexity, space complexity, etc."
                                className="min-h-[150px]"
                                disabled={submitting}
                            />
                        </CardContent>
                    </Card>

                    {/* Actions */}
                    <Card className="shadow-lg border-violet-100">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between gap-4">
                                <Button
                                    variant="outline"
                                    size="lg"
                                    onClick={handleSkip}
                                    disabled={submitting}
                                >
                                    Skip Coding Round
                                </Button>

                                <Button
                                    size="lg"
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                    className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-5 h-5 mr-2" />
                                            Submit Solution
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Info */}
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start gap-3">
                            <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-800">
                                <div className="font-semibold mb-1">Time Limit</div>
                                <div>You have 30 minutes to complete this coding challenge. Your solution will be auto-submitted when time expires.</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
