import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import axios from 'axios';
import {
    Loader2,
    Phone,
    PhoneOff,
    Mic,
    AlertCircle,
    CheckCircle
} from 'lucide-react';
import InterviewHeader from '@/components/interview/InterviewHeader';
import TimerComponent from '@/components/interview/TimerComponent';
import AntiCheatingMonitor from '@/components/interview/AntiCheatingMonitor';
import AlertConfirmation from '@/components/interview/AlertConfirmation';
import { useInterviewData } from '@/contexts/InterviewDataContext';
import { getRetellClient, registerRetellListeners, removeRetellListeners } from '@/lib/retellConfig';
import { interviewStorage } from '@/lib/interviewStorage';
import { logger } from '@/lib/logger';
import CodingConsole from '@/components/interview/CodingConsole';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface TranscriptMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string | Date;
}

// Helper to avoid 'undefined' string in greeting
const sanitizeName = (name: string | undefined | null) => {
    if (!name || String(name).toLowerCase() === 'undefined' || String(name).trim() === '') {
        return 'there';
    }
    return String(name).trim();
};

export default function CandidateInterviewStart() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { interviewInfo, setInterviewInfo } = useInterviewData();

    const [loading, setLoading] = useState(true);
    const [callActive, setCallActive] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
    const [currentMessage, setCurrentMessage] = useState('');
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
    const [aiContext, setAiContext] = useState<any>(null);
    const [serverStartTime, setServerStartTime] = useState<number | null>(null);
    const [readyToStart, setReadyToStart] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [isRestored, setIsRestored] = useState(false);

    const transcriptRef = useRef<TranscriptMessage[]>([]);
    const videoRef = useRef<HTMLVideoElement>(null);
    const videoStreamRef = useRef<MediaStream | null>(null);
    const isRedirectingRef = useRef(false);
    const isStartingRef = useRef(false);
    const isUnloadingRef = useRef(false);
    const isMountedRef = useRef(true);
    const isFreshStartRef = useRef(false);
    const isFinalizingRef = useRef(false);
    const restoredHistoryRef = useRef<TranscriptMessage[]>([]);
    const isRestoredRef = useRef(false); // NEW: Use ref to avoid stale state in async calls

    const [verificationStatus, setVerificationStatus] = useState<'verifying' | 'ready' | 'completed' | 'expired' | 'error' | 'conflict'>('verifying');
    const [statusMessage, setStatusMessage] = useState('Please wait while we prepare your interview...');

    // Gatekeeper logic (from temp.md)
    const [showGate, setShowGate] = useState(() => {
        if (typeof window !== 'undefined') {
            const justJoined = sessionStorage.getItem('just_joined_interview') === 'true';
            if (justJoined) {
                sessionStorage.removeItem('just_joined_interview');
                isFreshStartRef.current = true;
                return false;
            }
            // If we have context, don't show gate
            if (interviewInfo) return false;
            // Otherwise, show gate for recovery
            return true;
        }
        return false;
    });

    // Get client ID for session locking
    const getClientId = () => {
        if (typeof window === 'undefined') return '';
        const key = `interview_client_id_${id}`;
        let clientId = sessionStorage.getItem(key); // Use sessionStorage to keep it tab-isolated
        if (!clientId) {
            clientId = crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15);
            sessionStorage.setItem(key, clientId);
        }
        return clientId;
    };

    const clientIdRef = useRef<string>(getClientId());

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Verification & Restoration Flow (Optimized)
    useEffect(() => {
        const verifyAccess = async () => {
            if (!id) return;

            try {
                let currentEmail = interviewInfo?.email;
                let candidateName = interviewInfo?.candidate_name;

                // 1. Context/Storage Restore
                if (!currentEmail) {
                    const storedInfo = sessionStorage.getItem('interviewInfo') || localStorage.getItem('interviewInfo');
                    if (storedInfo) {
                        try {
                            const parsed = JSON.parse(storedInfo);
                            currentEmail = parsed.email;
                            candidateName = parsed.candidate_name;
                            if (parsed && !interviewInfo) {
                                setInterviewInfo(parsed);
                            }
                        } catch (e) { }
                    }
                }

                if (!currentEmail) {
                    if (isMountedRef.current) {
                        logger.warn('Auth missing, redirecting');
                        navigate(`/interview/${id}`);
                    }
                    return;
                }

                // 2. Fresh Start Cleanup
                if (isFreshStartRef.current) {
                    logger.log('✨ Fresh start detected. Clearing stale state...');
                    localStorage.removeItem(`interview_state_${id}`);
                    localStorage.removeItem(`timer_start_${id}`);
                    localStorage.removeItem(`timer_end_${id}`);
                    localStorage.removeItem(`timer_start_${id}_${currentEmail.toLowerCase()}`);
                    localStorage.removeItem(`timer_end_${id}_${currentEmail.toLowerCase()}`);
                    localStorage.removeItem(`violations_${id}_${currentEmail.toLowerCase()}`);
                }

                // 3. Status Verification (MongoDB-First Restore)
                setStatusMessage('Verifying session status...');
                const response = await axios.get(`${API_URL}/api/interviews/status/${id}?email=${currentEmail}`);
                const data = response.data;

                if (data.status === 'completed') {
                    setVerificationStatus('completed');
                    setTimeout(() => navigate(`/interview/${id}/completed`), 1500);
                    return;
                }

                if (data.status === 'expired') {
                    setVerificationStatus('expired');
                    return;
                }

                if (data.status === 'ready') {
                    // Try to claim session first to prevent double-join
                    const claimRes = await axios.post(`${API_URL}/api/interviews/session/claim`, {
                        interviewId: id,
                        candidateEmail: currentEmail,
                        clientId: clientIdRef.current
                    });

                    if (!claimRes.data.success) {
                        setVerificationStatus('conflict');
                        return;
                    }

                    // 4. Initialize AI Context & Restore Progress
                    const initResponse = await axios.post(`${API_URL}/api/interviews/initialize/${id}`, {
                        email: currentEmail,
                        name: candidateName
                    });

                    if (initResponse.data.success) {
                        const context = initResponse.data.aiContext;
                        setAiContext(context);

                        // Restore Transcript (Priority: Cloud > Local)
                        if (context.previousTranscript && context.previousTranscript.length > 0) {
                            logger.log('✅ Restored transcript from cloud');
                            setTranscript(context.previousTranscript);
                            transcriptRef.current = context.previousTranscript;
                            restoredHistoryRef.current = context.previousTranscript; // Important for merge
                            isRestoredRef.current = true; // Set ref
                            setIsRestored(true); // Keep state for UI
                            setIsRestoring(true);
                        } else if (!isFreshStartRef.current) {
                            const localT = await interviewStorage.loadTranscript(id!, currentEmail);
                            if (localT && localT.length > 0) {
                                logger.log('✅ Restored transcript from local');
                                setTranscript(localT);
                                transcriptRef.current = localT;
                                restoredHistoryRef.current = localT; // Important for merge
                                isRestoredRef.current = true; // Set ref
                                setIsRestored(true); // Keep state for UI
                                setIsRestoring(true);
                            }
                        }

                        // Restore Timer
                        if (context.timerStartTimestamp) {
                            const tStart = context.timerStartTimestamp;
                            setServerStartTime(tStart);
                            // Sync both scoped and unscoped keys for maximum compatibility
                            localStorage.setItem(`timer_start_${id}`, tStart.toString());
                            localStorage.setItem(`timer_start_${id}_${currentEmail.toLowerCase()}`, tStart.toString());
                        }

                        setVerificationStatus('ready');
                        setLoading(false);
                        setShowGate(false);
                        setReadyToStart(true);
                    }
                }
            } catch (error) {
                logger.error('Verification failed:', error);
                setVerificationStatus('error');
            }
        };

        verifyAccess();
    }, [id, interviewInfo, navigate, setInterviewInfo]);

    // Continuous Session Heartbeat (Lock Security)
    useEffect(() => {
        if (verificationStatus !== 'ready' || isCompleted) return;

        const interval = setInterval(async () => {
            if (isCompleted || isRedirectingRef.current) return;
            try {
                const res = await axios.post(`${API_URL}/api/interviews/session/claim`, {
                    interviewId: id,
                    candidateEmail: interviewInfo?.email,
                    clientId: clientIdRef.current
                });
                if (res.data.conflict) {
                    logger.warn('🚨 Session takeover detected!');
                    toast.error('Session active on another device');
                    stopInterview();
                }
            } catch (e) { }
        }, 15000); // 15s heartbeat

        return () => clearInterval(interval);
    }, [verificationStatus, isCompleted, id, interviewInfo?.email]);

    // Finalize Interview
    const finalizeInterview = useCallback(async (reason = 'call_ended') => {
        if (isFinalizingRef.current || isCompleted || isUnloadingRef.current) return;
        isFinalizingRef.current = true;
        isRedirectingRef.current = true;
        setIsCompleted(true);

        try {
            logger.log(`🚨 Finalizing: ${reason}`);

            // 1. Terminate Call
            const client = getRetellClient();
            try { client.stopCall(); } catch (e) { }

            // 2. Submit Final Progress
            const durationStart = interviewStorage.loadTimer(id!).start;
            const finalDuration = durationStart ? Math.floor((Date.now() - durationStart) / 1000) : 0;

            await axios.post(`${API_URL}/api/interviews/submit/${id}`, {
                email: interviewInfo?.email,
                responses: transcriptRef.current.map(m => ({
                    question: m.role === 'assistant' ? 'AI' : 'Candidate',
                    answer: m.content,
                    timestamp: m.timestamp || new Date()
                })),
                duration: finalDuration,
                status: reason === 'violation' ? 'Terminated' : 'Completed'
            });

            // 3. Finalize Session (AI Trigger)
            await axios.post(`${API_URL}/api/interviews/finalize-session`, {
                interview_id: id,
                email: interviewInfo?.email,
                fullname: interviewInfo?.candidate_name || 'Candidate',
                transcript: transcriptRef.current,
                reason: reason
            });

            // 4. Cleanup
            interviewStorage.clearInterviewData(id!, interviewInfo?.email);
            toast.success('Interview submitted successfully');

            setTimeout(() => {
                window.location.replace(`/interview/${id}/completed`);
            }, 800);

        } catch (error) {
            logger.error('Finalization error:', error);
            window.location.replace(`/interview/${id}/completed`);
        }
    }, [id, interviewInfo, isCompleted, navigate]);

    // Initial camera setup logic
    const initCamera = async () => {
        try {
            // Check availability
            const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
            const hasVideo = devices.some(d => d.kind === 'videoinput');
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            if (!hasVideo && !isLocal) {
                toast.error('Camera not found. It is required for this interview.');
                return null;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: hasVideo ? true : false,
                audio: false // Audio is handled by Retell SDK separately
            }).catch(err => {
                logger.error('getUserMedia error:', err);
                if (isLocal) return null; // Allow bypass in local
                throw err;
            });

            if (stream) {
                setVideoStream(stream);
                videoStreamRef.current = stream;
            }
            return stream || (isLocal ? new MediaStream() : null);
        } catch (error) {
            logger.error('Failed to initialize camera:', error);
            toast.error('Could not access camera. Please check permissions.');
            return null;
        }
    };

    // Start Interview Logic
    const startCall = async () => {
        if (!interviewInfo || isStartingRef.current || callActive) return;

        try {
            isStartingRef.current = true;
            setLoading(true);

            // Re-verify camera
            const stream = await initCamera();
            if (!stream) {
                setLoading(false);
                isStartingRef.current = false;
                return;
            }

            // Get Retell Token
            const tokenResponse = await axios.post(`${API_URL}/api/interviews/retell/token`, {
                interviewId: id,
                email: interviewInfo.email,
                candidateName: aiContext?.candidateName || interviewInfo.candidate_name,
                jobPosition: aiContext?.role || interviewInfo.job_position,
                questions: aiContext?.questions || interviewInfo.question_list?.combinedQuestions || [],
                duration: aiContext?.duration || interviewInfo.duration || 15,
                systemPrompt: aiContext?.systemPrompt,
                isRestored: isRestoredRef.current, // Use Ref
                lastTranscript: isRestoredRef.current ? transcriptRef.current.slice(-5) : undefined // Use Ref
            });

            const { accessToken } = tokenResponse.data;
            const client = getRetellClient();

            registerRetellListeners({
                onCallStarted: () => {
                    logger.log('✅ Call active');
                    setCallActive(true);
                    setLoading(false);
                    // Sync Timer Start
                    if (!serverStartTime) {
                        const now = Date.now();
                        setServerStartTime(now);
                        interviewStorage.saveTimer(id!, { start: now }, { userEmail: interviewInfo.email, clientId: clientIdRef.current });
                    }
                },
                onCallEnded: () => {
                    setCallActive(false);
                    finalizeInterview('call_ended');
                },
                onUpdate: (update) => {
                    if (update.transcript) {
                        const newMessages: TranscriptMessage[] = update.transcript.map((msg: any) => ({
                            // Robust mapping: defaults to 'user' unless clearly identified as agent/assistant
                            role: (msg.role === 'agent' || msg.role === 'assistant') ? 'assistant' : 'user',
                            content: msg.content,
                            timestamp: new Date().toISOString(),
                        }));

                        // MERGE LOGIC: Keep restored messages + add new session messages
                        let combined = [];
                        if (isRestoredRef.current && restoredHistoryRef.current.length > 0) {
                            // Deduplication: If the first new message is identical to the last restored one, 
                            // it's likely a repetition by the AI during resumption. We keep both if we want 
                            // to see the "repeat", but usually it's cleaner to just append.
                            // Retell's transcript is cumulative FOR THE CURRENT CALL.
                            combined = [...restoredHistoryRef.current, ...newMessages];
                        } else {
                            combined = newMessages;
                        }

                        setTranscript(combined);
                        transcriptRef.current = combined;

                        // Sync to cloud every update
                        interviewStorage.saveTranscript(id!, combined, { userEmail: interviewInfo.email, clientId: clientIdRef.current });

                        if (newMessages.length > 0) {
                            const lastMsg = newMessages[newMessages.length - 1];
                            if (lastMsg.role === 'assistant') {
                                setCurrentMessage(lastMsg.content);
                            }
                        }
                    }
                },
                onAgentStartTalking: () => setIsSpeaking(true),
                onAgentStopTalking: () => setIsSpeaking(false),
                onError: (err) => {
                    logger.error('Retell Error:', err);
                    toast.error('Call interrupted. Try refreshing.');
                }
            });

            await client.startCall({ accessToken, sampleRate: 24000 });
        } catch (error) {
            logger.error('Start call error:', error);
            setLoading(false);
            isStartingRef.current = false;
        }
    };

    useEffect(() => {
        if (videoRef.current && videoStream) {
            videoRef.current.srcObject = videoStream;
        }
    }, [videoStream]);

    // Auto-start hook
    useEffect(() => {
        if (!loading && readyToStart && !callActive && !isStartingRef.current && !showGate) {
            if (interviewInfo?.interviewType !== 'Problem Solving') {
                const timer = setTimeout(() => startCall(), 1500);
                return () => clearTimeout(timer);
            } else {
                // For problem-solving, just mark timer start without initiating AI call
                if (!serverStartTime) {
                    const now = Date.now();
                    setServerStartTime(now);
                    interviewStorage.saveTimer(id!, { start: now }, { userEmail: interviewInfo.email, clientId: clientIdRef.current });
                }
            }
        }
    }, [loading, readyToStart, callActive, showGate, interviewInfo, serverStartTime, id]);

    const stopInterview = () => {
        const client = getRetellClient();
        client.stopCall();
        removeRetellListeners();
    };

    const handleExitConfirm = () => {
        setShowExitConfirm(false);
        if (interviewInfo?.interviewType === 'Problem Solving') {
            finalizeInterview('call_ended');
        } else {
            stopInterview();
        }
    };

    const handleViolationLimit = useCallback(() => {
        toast.error('Violation limit reached');
        finalizeInterview('violation');
        stopInterview();
    }, [finalizeInterview]);

    if (verificationStatus !== 'ready' || showGate) {
        const statusMap = {
            verifying: { title: "Initializing", desc: "Setting up your secure environment...", icon: <Loader2 className="animate-spin text-blue-500 w-12 h-12" /> },
            completed: { title: "Completed", desc: "Redirecting to your results...", icon: <CheckCircle className="text-green-500 w-12 h-12" /> },
            expired: { title: "Expired", desc: "This interview link is no longer valid.", icon: <AlertCircle className="text-amber-500 w-12 h-12" /> },
            conflict: { title: "Active Session", desc: "This interview is open in another tab.", icon: <AlertCircle className="text-red-500 w-12 h-12" /> },
            error: { title: "Connection Error", desc: "Failed to connect to server.", icon: <AlertCircle className="text-red-500 w-12 h-12" /> }
        };

        const config = statusMap[verificationStatus as keyof typeof statusMap] || statusMap.verifying;

        return (
            <div className="fixed inset-0 bg-white z-[9999] flex flex-col items-center justify-center p-6 text-center">
                <div className="mb-6">{config.icon}</div>
                <h1 className="text-3xl font-bold mb-2">{config.title}</h1>
                <p className="text-slate-500 text-lg">{config.desc}</p>
                {verificationStatus === 'error' && (
                    <Button className="mt-8" onClick={() => window.location.reload()}>Retry Connection</Button>
                )}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <InterviewHeader />
            {interviewInfo && (
                <AntiCheatingMonitor
                    interviewId={id!}
                    email={interviewInfo.email}
                    candidateName={interviewInfo.candidate_name}
                    onViolationLimitReached={handleViolationLimit}
                    isCompleted={isCompleted}
                    isInteractionActive={isSpeaking || interviewInfo.interviewType === 'Problem Solving'}
                />
            )}
            <div className="container mx-auto px-4 py-8 max-w-7xl">
                {interviewInfo?.interviewType === 'Problem Solving' ? (
                    <div className="flex flex-col h-[calc(100vh-100px)]">
                        <div className="flex justify-between items-center mb-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                            <Button variant="destructive" onClick={() => setShowExitConfirm(true)} className="font-bold">
                                End Interview
                            </Button>
                            {interviewInfo && (
                                <TimerComponent
                                    interviewId={id!}
                                    duration={interviewInfo.duration ? String(interviewInfo.duration).replace(/\D/g, '') : '15'}
                                    onTimeout={() => finalizeInterview('timeout')}
                                    userEmail={interviewInfo.email}
                                    serverStartTime={serverStartTime}
                                />
                            )}
                        </div>
                        <CodingConsole
                            questions={aiContext?.questions || interviewInfo.question_list?.combinedQuestions || []}
                            interviewId={id!}
                            candidateEmail={interviewInfo.email}
                            candidateName={interviewInfo.candidate_name}
                            onComplete={() => finalizeInterview('coding_completed')}
                        />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-6">
                            <Card className="overflow-hidden border-none shadow-xl">
                                <CardContent className="p-0 relative">
                                    <div className="aspect-video bg-slate-900 group">
                                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
                                        <div className="absolute top-4 left-4 flex gap-2">
                                            <div className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${callActive ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-700/80 text-white backdrop-blur-md'}`}>
                                                <div className={`w-2 h-2 rounded-full ${callActive ? 'bg-white' : 'bg-slate-400'}`} />
                                                {callActive ? 'Live Interview' : 'Initializing...'}
                                            </div>
                                        </div>
                                        {isSpeaking && (
                                            <div className="absolute bottom-6 left-6 bg-blue-600/90 text-white px-4 py-2 rounded-2xl backdrop-blur-md border border-blue-400/30 flex items-center gap-2 animate-in slide-in-from-bottom-4">
                                                <Mic className="w-4 h-4" />
                                                <span className="text-sm font-medium">AI is speaking...</span>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-none shadow-lg bg-white/80 backdrop-blur-md">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between gap-6">
                                        <div className="flex items-center gap-4">
                                            {!callActive ? (
                                                <Button size="lg" onClick={startCall} className="bg-blue-600 hover:bg-blue-700 px-8 py-6 h-auto text-lg font-bold rounded-2xl shadow-lg shadow-blue-200">
                                                    <Phone className="mr-2" /> {isRestoring ? 'Resume Session' : 'Start Session'}
                                                </Button>
                                            ) : (
                                                <Button variant="destructive" size="lg" onClick={() => setShowExitConfirm(true)} className="px-8 py-6 h-auto text-lg font-bold rounded-2xl">
                                                    <PhoneOff className="mr-2" /> End Interview
                                                </Button>
                                            )}
                                        </div>
                                        {interviewInfo && (
                                            <TimerComponent
                                                interviewId={id!}
                                                duration={interviewInfo.duration ? String(interviewInfo.duration) : '15'}
                                                onTimeout={() => finalizeInterview('timeout')}
                                                userEmail={interviewInfo.email}
                                                serverStartTime={serverStartTime}
                                            />
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {currentMessage && (
                                <div className="bg-blue-600 text-white p-6 rounded-3xl shadow-lg border border-blue-400/30 animate-in fade-in slide-in-from-top-4">
                                    <p className="text-lg font-medium leading-relaxed italic">"{currentMessage}"</p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-6">
                            <Card className="h-[calc(100vh-250px)] border-none shadow-xl flex flex-col">
                                <CardContent className="p-6 flex flex-col h-full">
                                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                        <Loader2 className={`w-5 h-5 ${callActive ? 'animate-spin' : ''} text-blue-600`} />
                                        Live Transcript
                                    </h3>
                                    <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                                        {transcript.length === 0 ? (
                                            <div className="text-center py-20 opacity-30 italic">No context yet...</div>
                                        ) : (
                                            transcript.map((msg, i) => (
                                                <div key={i} className={`p-4 rounded-2xl ${msg.role === 'assistant' ? 'bg-blue-50 ml-0 border-l-4 border-blue-500' : 'bg-slate-50 ml-4 border-l-4 border-slate-300'}`}>
                                                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{msg.role === 'assistant' ? 'HireAI' : 'Candidate'}</div>
                                                    <p className="text-sm text-slate-700 leading-relaxed font-medium">{msg.content}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100 flex gap-4">
                                <AlertCircle className="text-amber-500 shrink-0 mt-1" />
                                <div className="text-sm text-amber-900 leading-snug">
                                    <span className="font-extrabold block mb-1">Stay Within View</span>
                                    Ensure you remain in the center of the frame and keep this tab active to avoid flags.
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <AlertConfirmation
                open={showExitConfirm}
                onOpenChange={setShowExitConfirm}
                onConfirm={handleExitConfirm}
                title="Finish Interview?"
                description="Your progress will be submitted for evaluation. This action cannot be undone."
            />
        </div>
    );
}
