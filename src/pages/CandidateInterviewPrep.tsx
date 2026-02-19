import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import {
    Camera,
    Mic,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Video,
    Headphones,
    Shield,
    Clock,
    Loader2
} from 'lucide-react';
import InterviewHeader from '@/components/interview/InterviewHeader';
import { useInterviewData } from '@/contexts/InterviewDataContext';
import { logger } from '@/lib/logger';

export default function CandidateInterviewPrep() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { interviewInfo } = useInterviewData();
    const videoRef = useRef<HTMLVideoElement>(null);

    const [cameraPermission, setCameraPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
    const [micPermission, setMicPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
    const [stream, setStream] = useState<MediaStream | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [checking, setChecking] = useState(false);
    const [canStart, setCanStart] = useState(false);

    // Update ref when stream changes
    useEffect(() => {
        streamRef.current = stream;
    }, [stream]);

    // Redirect if no interview info
    useEffect(() => {
        if (interviewInfo && id && !id.includes(':id') && id !== 'undefined') {
            // Already have info, good
        } else if (!interviewInfo) {
            toast.error('Please start from the interview link');
            navigate(`/interview/${id}`);
        }
    }, [interviewInfo, id, navigate]);

    // Handle video assignment
    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    // Request permissions
    const requestPermissions = async () => {
        setChecking(true);

        try {
            // Check what devices are actually available first to give better error messages
            const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
            const hasVideo = devices.some(device => device.kind === 'videoinput');
            const hasAudio = devices.some(device => device.kind === 'audioinput');

            logger.log('📡 Hardware Check:', { hasVideo, hasAudio, deviceCount: devices.length });

            // If we're on localhost, we might want to allow mock/no-camera for testing
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            if (!hasVideo && !isLocal) {
                throw new Error('NoCameraFound');
            }
            if (!hasAudio && !isLocal) {
                throw new Error('NoMicFound');
            }

            // Attempt to get stream (requesting only what is available if local)
            const constraints = {
                video: hasVideo ? true : (isLocal ? false : true),
                audio: hasAudio ? true : (isLocal ? false : true)
            };

            const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

            setStream(mediaStream);
            setCameraPermission(hasVideo ? 'granted' : (isLocal ? 'pending' : 'denied'));
            setMicPermission(hasAudio ? 'granted' : (isLocal ? 'pending' : 'denied'));

            // If local and missing one, we still allow proceeding
            if (isLocal || (hasVideo && hasAudio)) {
                setCanStart(true);
            }

            if (hasVideo && hasAudio) {
                toast.success('Camera and microphone access granted!');
            } else if (isLocal) {
                toast.warning('Mock mode: Proceeding without full hardware (Local Dev Only)');
            }

            logger.log('✅ Media permissions handled');
        } catch (error: any) {
            logger.error('Media permission error:', error);

            if (error.name === 'NotAllowedError' || error.message === 'Permission denied') {
                setCameraPermission('denied');
                setMicPermission('denied');
                toast.error('Permissions denied. Please enable camera/mic in your browser address bar.');
            } else if (error.message === 'NoCameraFound') {
                setCameraPermission('denied');
                toast.error('No camera detected. A camera is mandatory for this interview.');
            } else if (error.name === 'NotFoundError') {
                toast.error('Hardware not found. Please connect your camera and microphone.');
            } else {
                toast.error(`Hardware Error: ${error.message || 'Check connections'}`);
            }
        } finally {
            setChecking(false);
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                logger.log('🛑 [Prep] Cleaning up camera stream on unmount...');
                streamRef.current.getTracks().forEach((track) => {
                    track.stop();
                    logger.log(`✅ Stopped track: ${track.kind}`);
                });
                streamRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };
    }, []);

    const handleStartInterview = () => {
        if (!canStart) {
            toast.error('Please grant camera and microphone permissions first');
            return;
        }

        // Stop preview stream (will be restarted in interview page)
        if (streamRef.current) {
            logger.log('🛑 [Prep] Stopping preview stream before navigation');
            streamRef.current.getTracks().forEach((track) => {
                track.stop();
                logger.log(`✅ Stopped track: ${track.kind}`);
            });
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setStream(null);

        // Mark as fresh start
        sessionStorage.setItem('just_joined_interview', 'true');

        logger.log('Starting interview...');
        navigate(`/interview/${id}/start`);
    };

    const PermissionStatus = ({
        status,
        label,
        icon: Icon
    }: {
        status: 'pending' | 'granted' | 'denied';
        label: string;
        icon: any;
    }) => {
        const statusConfig = {
            pending: { color: 'text-slate-400', bg: 'bg-slate-100', Icon: AlertCircle },
            granted: { color: 'text-green-600', bg: 'bg-green-100', Icon: CheckCircle2 },
            denied: { color: 'text-red-600', bg: 'bg-red-100', Icon: XCircle },
        };

        const config = statusConfig[status];
        const StatusIcon = config.Icon;

        return (
            <div className={`flex items-center gap-3 p-4 rounded-lg ${config.bg}`}>
                <Icon className={`w-6 h-6 ${config.color}`} />
                <div className="flex-1">
                    <div className="font-semibold text-slate-800">{label}</div>
                    <div className={`text-sm ${config.color} capitalize`}>{status}</div>
                </div>
                <StatusIcon className={`w-5 h-5 ${config.color}`} />
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
            <InterviewHeader />

            <div className="flex flex-col items-center justify-start min-h-[calc(100vh-64px)] p-4 pt-10">
                <div className="w-full max-w-6xl space-y-8 animate-in fade-in duration-500 pb-12">

                    {/* Title Card */}
                    <Card className="border-blue-200 bg-white/80 backdrop-blur-sm">
                        <CardHeader className="text-center">
                            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                                Interview Preparation
                            </CardTitle>
                            <CardDescription className="text-base">
                                Let's make sure everything is ready for your interview
                            </CardDescription>
                        </CardHeader>
                    </Card>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                        {/* Left Column: Instructions */}
                        <div className="space-y-6">

                            {/* Instructions Card */}
                            <Card className="shadow-lg border-blue-100">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <Shield className="w-5 h-5 text-blue-600" />
                                        Interview Guidelines
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <span className="text-xs font-bold text-blue-600">1</span>
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm text-slate-800">Find a Quiet Space</div>
                                            <div className="text-xs text-slate-600">Minimize background noise for best results</div>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <span className="text-xs font-bold text-blue-600">2</span>
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm text-slate-800">Stay on This Tab</div>
                                            <div className="text-xs text-slate-600">Switching tabs may be flagged as suspicious activity</div>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <span className="text-xs font-bold text-blue-600">3</span>
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm text-slate-800">Speak Clearly</div>
                                            <div className="text-xs text-slate-600">Answer questions naturally and at a moderate pace</div>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <span className="text-xs font-bold text-blue-600">4</span>
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm text-slate-800">Be Yourself</div>
                                            <div className="text-xs text-slate-600">Relax and showcase your authentic skills</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Interview Info */}
                            <Card className="shadow-lg border-blue-100">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <Clock className="w-5 h-5 text-blue-600" />
                                        Interview Details
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex justify-between items-center p-3 bg-violet-50 rounded-lg">
                                        <span className="text-sm font-medium text-slate-700">Position</span>
                                        <span className="text-sm font-bold text-violet-700">{interviewInfo?.job_position}</span>
                                    </div>
                                    {interviewInfo?.duration && (
                                        <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-lg">
                                            <span className="text-sm font-medium text-slate-700">Duration</span>
                                            <span className="text-sm font-bold text-indigo-700">{interviewInfo.duration}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                                        <span className="text-sm font-medium text-slate-700">Questions</span>
                                        <span className="text-sm font-bold text-blue-700">
                                            {interviewInfo?.question_list?.combinedQuestions?.length || 0}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Right Column: Device Check */}
                        <div className="space-y-6">

                            {/* Camera Preview */}
                            <Card className="shadow-lg border-blue-100">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <Video className="w-5 h-5 text-blue-600" />
                                        Camera Preview
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden">
                                        {stream ? (
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                playsInline
                                                muted
                                                className="w-full h-full object-cover -scale-x-100"
                                            />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="text-center text-slate-400">
                                                    <Camera className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                                    <p className="text-sm">Camera preview will appear here</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Permissions Status */}
                            <Card className="shadow-lg border-blue-100">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <Headphones className="w-5 h-5 text-blue-600" />
                                        Device Permissions
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <PermissionStatus status={cameraPermission} label="Camera" icon={Camera} />
                                    <PermissionStatus status={micPermission} label="Microphone" icon={Mic} />

                                    {!canStart && (
                                        <Button
                                            onClick={requestPermissions}
                                            disabled={checking}
                                            className="w-full h-12 bg-blue-600 hover:bg-blue-700"
                                        >
                                            {checking ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                                    Checking Devices...
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle2 className="w-5 h-5 mr-2" />
                                                    Grant Permissions
                                                </>
                                            )}
                                        </Button>
                                    )}

                                    {canStart && (
                                        <Button
                                            onClick={handleStartInterview}
                                            className="w-full h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                                        >
                                            <Video className="w-5 h-5 mr-2" />
                                            Start Interview
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Warning */}
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-800">
                                        <div className="font-semibold mb-1">Important</div>
                                        <div>This interview will be recorded and monitored. Ensure you're in a well-lit, quiet environment.</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
