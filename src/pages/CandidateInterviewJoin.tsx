import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import axios from 'axios';
import { Loader2, Briefcase, Clock, User, Mail, CheckCircle2 } from 'lucide-react';
import InterviewHeader from '@/components/interview/InterviewHeader';
import { useInterviewData } from '@/contexts/InterviewDataContext';
import { logger } from '@/lib/logger';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function CandidateInterviewJoin() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { setInterviewInfo } = useInterviewData();

    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [interview, setInterview] = useState<any>(null);
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [conflict, setConflict] = useState(false);
    const [isReadOnly, setIsReadOnly] = useState(false);
    const location = useLocation();

    // OTP States
    const [showOtpInput, setShowOtpInput] = useState(false);
    const [otp, setOtp] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (resendCooldown > 0) {
            timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
        }
        return () => clearTimeout(timer);
    }, [resendCooldown]);

    useEffect(() => {
        // Check for conflict state from navigation
        if (window.history.state?.usr?.conflict) {
            setConflict(true);
            setTimeout(() => setConflict(false), 10000); // Reset after 10s (matching server timeout)
        }

        // Check for pre-filled data from dashboard
        if (location.state) {
            if (location.state.candidateName) setName(location.state.candidateName);
            if (location.state.candidateEmail) setEmail(location.state.candidateEmail);
            if (location.state.readOnly) setIsReadOnly(true);
        } else {
            // Fallback to localStorage if available
            const storedUser = localStorage.getItem('userInfo');
            if (storedUser) {
                try {
                    const parsed = JSON.parse(storedUser);
                    if (parsed.name) setName(parsed.name);
                    if (parsed.email) setEmail(parsed.email);
                } catch (e) {
                    console.error("Error parsing userInfo", e);
                }
            }
        }

        const fetchInterview = async () => {
            try {
                const res = await axios.get(`${API_URL}/api/interviews/${id}`);
                setInterview(res.data.data);
                logger.log('Interview loaded:', res.data.data);
            } catch (error: any) {
                console.error(error);
                toast.error('Failed to load interview. Please check the link.');
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            fetchInterview();
        }
    }, [id]);

    const handleRequestOtp = async () => {
        if (!email.trim()) {
            toast.error('Please enter your email address.');
            return;
        }

        if (!name.trim()) {
            toast.error('Please enter your name.');
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            toast.error('Please enter a valid email address.');
            return;
        }

        setJoining(true);

        try {
            // Request OTP
            await axios.post(`${API_URL}/api/interviews/otp/request`, {
                interviewId: id,
                email: email.toLowerCase().trim()
            });

            toast.success('Verification code sent to your email.');
            setShowOtpInput(true);
            setResendCooldown(60);
        } catch (error: any) {
            console.error(error);
            toast.error(error.response?.data?.message || 'Failed to send verification code.');
        } finally {
            setJoining(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otp || otp.length < 6) {
            toast.error('Please enter a valid 6-digit verification code.');
            return;
        }

        setJoining(true);

        try {
            // Verify OTP
            const res = await axios.post(`${API_URL}/api/interviews/otp/verify`, {
                interviewId: id,
                email: email.toLowerCase().trim(),
                otp: otp
            });

            const token = res.data.token;

            // Store interview info in context
            const interviewInfo = {
                interview_id: id!,
                email: email.toLowerCase().trim(),
                candidate_name: name.trim(),
                job_position: interview.jobRole,
                job_description: interview.description,
                duration: interview.duration ? `${interview.duration} minutes` : undefined,
                question_list: {
                    combinedQuestions: interview.questions || [],
                    activeSection: 'combined' as const,
                },
                interviewType: interview.interviewType || interview.type,
                token: token // Save token for authenticated requests
            };

            setInterviewInfo(interviewInfo);

            // Persist to session storage for recovery on refresh
            sessionStorage.setItem('interviewInfo', JSON.stringify(interviewInfo));

            // Mark as fresh start
            sessionStorage.setItem('just_joined_interview', 'true');

            logger.log('Joining interview with info:', interviewInfo);
            toast.success('Verification successful! Loading interview...');

            // Navigate to prep page
            setTimeout(() => {
                navigate(`/interview/${id}/prep`);
            }, 500);

        } catch (error: any) {
            console.error(error);
            toast.error(error.response?.data?.message || 'Invalid verification code.');
            setJoining(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!interview) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
                <InterviewHeader />
                <div className="flex items-center justify-center min-h-[calc(100vh-64px)] p-4">
                    <Card className="max-w-md w-full">
                        <CardHeader>
                            <CardTitle className="text-red-600">Interview Not Found</CardTitle>
                            <CardDescription>
                                The interview link you're trying to access is invalid or has expired.
                            </CardDescription>
                        </CardHeader>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
            <InterviewHeader />

            <div className="flex flex-col items-center justify-center flex-1 p-4">
                <div className="w-full max-w-2xl space-y-4 animate-in fade-in duration-500 py-4">
                    {/* Welcome Card */}
                    <Card className="border-none bg-white/40 backdrop-blur-xl shadow-2xl shadow-blue-500/10 rounded-[2rem] overflow-hidden">
                        <CardHeader className="py-8 text-center relative">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
                            <CardTitle className="text-3xl font-black tracking-tight bg-gradient-to-br from-slate-900 via-blue-800 to-indigo-900 bg-clip-text text-transparent">
                                Welcome to Your Interview
                            </CardTitle>
                            <CardDescription className="text-base font-medium text-slate-500 mt-2">
                                You're one step away from showcasing your talent.
                            </CardDescription>
                        </CardHeader>
                    </Card>

                    {/* Interview Details */}
                    <Card className="shadow-xl border-none bg-white/60 backdrop-blur-md rounded-[1.5rem]">
                        <CardHeader className="pb-2 border-b border-slate-100/50">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-slate-800">
                                <div className="p-2 bg-blue-100 rounded-lg">
                                    <Briefcase className="w-4 h-4 text-blue-600" />
                                </div>
                                Role Overview
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-blue-50 to-indigo-50/30 rounded-2xl border border-blue-100/50 transition-all hover:shadow-md">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                                        <Briefcase className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-blue-600 font-black uppercase tracking-widest mb-0.5">Position</p>
                                        <p className="text-base font-bold text-slate-900 truncate">{interview.jobRole}</p>
                                    </div>
                                </div>

                                {interview.duration && (
                                    <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-2xl border border-slate-100/50 transition-all hover:shadow-md">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                                            <Clock className="w-6 h-6 text-indigo-600" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest mb-0.5">Estimated Time</p>
                                            <p className="text-base font-bold text-slate-900 truncate">{interview.duration} minutes</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 bg-blue-600/5 rounded-2xl border border-blue-600/10 flex items-center justify-between group hover:bg-blue-600/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                                    <span className="text-sm font-semibold text-slate-700">Interview Readiness</span>
                                </div>
                                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
                                    {interview.questions?.length || 0} Questions Ready
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Candidate Information */}
                    <Card className="shadow-md border-blue-100">
                        <CardHeader className="py-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <User className="w-4 h-4 text-blue-600" />
                                Your Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 py-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="name" className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                                    Full Name *
                                </Label>
                                <Input
                                    id="name"
                                    type="text"
                                    placeholder="Enter your full name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="h-10 text-sm focus:ring-blue-500 focus:border-blue-500"
                                    disabled={joining || showOtpInput || isReadOnly}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                                    Email Address *
                                </Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="your.email@example.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="h-10 text-sm pl-9 focus:ring-blue-500 focus:border-blue-500"
                                        disabled={joining || showOtpInput || isReadOnly}
                                    />
                                </div>
                            </div>

                            {showOtpInput && (
                                <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                                    <Label htmlFor="otp" className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                                        Verification Code *
                                    </Label>
                                    <Input
                                        id="otp"
                                        type="text"
                                        placeholder="Enter 6-digit code"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                        className="h-10 text-sm focus:ring-blue-500 focus:border-blue-500 text-center tracking-widest font-bold"
                                        disabled={joining}
                                        maxLength={6}
                                    />
                                    <p className="text-[10px] text-slate-500">Check your email for the code sent.</p>
                                </div>
                            )}

                            {!showOtpInput ? (
                                <Button
                                    size="lg"
                                    onClick={handleRequestOtp}
                                    disabled={joining || conflict}
                                    className={`w-full h-11 text-base shadow-lg transition-all ${conflict
                                        ? 'bg-amber-500 hover:bg-amber-600'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white font-bold'
                                        }`}
                                >
                                    {joining ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            Sending Code...
                                        </>
                                    ) : conflict ? (
                                        <>
                                            <Clock className="w-4 h-4 mr-2" />
                                            Session Busy (Wait 10s)
                                        </>
                                    ) : (
                                        'Send Verification Code'
                                    )}
                                </Button>
                            ) : (
                                <div className="space-y-2">
                                    <Button
                                        size="lg"
                                        onClick={handleVerifyOtp}
                                        disabled={joining}
                                        className="w-full h-11 text-base shadow-lg transition-all bg-green-600 hover:bg-green-700 text-white font-bold"
                                    >
                                        {joining ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                Verifying...
                                            </>
                                        ) : (
                                            'Verify & Join Interview'
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleRequestOtp}
                                        disabled={joining || conflict || resendCooldown > 0}
                                        className="w-full"
                                    >
                                        {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Code'}
                                    </Button>
                                </div>
                            )}

                            <p className="text-[10px] text-center text-slate-400 font-medium">
                                By continuing, you agree to be recorded and monitored during the interview
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
