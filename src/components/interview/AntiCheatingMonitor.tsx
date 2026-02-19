import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { logger } from '@/lib/logger';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface AntiCheatingMonitorProps {
    interviewId: string;
    email: string;
    candidateName: string;
    onViolationLimitReached?: () => void;
    isCompleted?: boolean;
    isInteractionActive?: boolean; // Is the candidate currently speaking?
}

const AntiCheatingMonitor: React.FC<AntiCheatingMonitorProps> = ({
    interviewId,
    email,
    candidateName,
    onViolationLimitReached,
    isCompleted = false,
    isInteractionActive = false,
}) => {
    const isUnloadingRef = useRef(false);
    const startBlurTimeRef = useRef<number | null>(null);

    const startTimeRef = useRef<number>(Date.now());
    const GRACE_PERIOD_MS = 5000; // 5 seconds grace period on start

    // Helper to get relative time from interview start
    const getFormattedRelativeTime = (): string => {
        if (typeof window === 'undefined') return '00:00';

        let startTime: number | null = null;
        try {
            const standardKey = `timer_start_${interviewId}`;
            const storedStandard = localStorage.getItem(standardKey);

            if (storedStandard) {
                startTime = parseInt(storedStandard, 10);
            } else {
                const scopedKey = `timer_start_${interviewId}_${email}`;
                const storedScoped = localStorage.getItem(scopedKey);
                if (storedScoped) startTime = parseInt(storedScoped, 10);
            }
        } catch (e) {
            logger.error('Failed to get timer start:', e);
        }

        if (!startTime) return '00:00';

        const now = Date.now();
        const diffMs = now - startTime;
        if (diffMs < 0) return '00:00';

        const totalSeconds = Math.floor(diffMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return `${minutes.toString().padStart(2, '0')}:${seconds
            .toString()
            .padStart(2, '0')}`;
    };

    // Send event to backend
    const sendEvent = async (eventType: string, extraData: any = {}) => {
        if (isCompleted) return;

        // Ignore events during grace period
        if (Date.now() - startTimeRef.current < GRACE_PERIOD_MS) {
            logger.log(`Ignoring ${eventType} during grace period`);
            return;
        }

        const timestampStr = getFormattedRelativeTime();

        // Get clientId from sessionStorage
        const clientId = typeof window !== 'undefined' ? sessionStorage.getItem(`interview_client_id_${interviewId}`) : null;

        try {
            const { data } = await axios.post(
                `${API_URL}/api/interviews/anti-cheating-event`,
                {
                    interview_id: interviewId,
                    email: email,
                    candidate_name: candidateName,
                    event_type: eventType,
                    clientId: clientId, // Include clientId for session validation
                    timestamp: new Date().toISOString(),
                    timestamp_str: timestampStr,
                    ...extraData,
                }
            );

            // Handle response
            if (data.interview_status === 'auto_completed') {
                toast.dismiss();
                toast.error('Interview ended due to repeated violations.', {
                    id: 'ac-violation-end',
                    duration: 10000,
                });
                if (onViolationLimitReached) {
                    onViolationLimitReached();
                }
                return;
            }

            // Show warnings
            const score = data.suspicious_score;
            const max = data.max_allowed_score;
            const violationsLeft = max - score;

            if (score > 0 && score < max) {
                let message = `Warning (${score}/${max}): Please stay on the interview tab.`;
                if (violationsLeft === 1) {
                    message = `Critical Warning (${score}/${max}): One more violation will end the interview.`;
                }

                toast.warning(message, {
                    id: 'ac-warning',
                    duration: 4000,
                });
            }
        } catch (error) {
            logger.error('Anti-cheating event error:', error);
        }
    };

    // Initial check on mount
    useEffect(() => {
        if (interviewId && email && !isCompleted) {
            sendEvent('window_focus');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interviewId, email]);

    // Event listeners
    useEffect(() => {
        if (!interviewId || !email || isCompleted) return;

        const handleBeforeUnload = () => {
            isUnloadingRef.current = true;
        };

        const handleVisibilityChange = () => {
            if (isUnloadingRef.current) return;

            if (document.visibilityState === 'hidden') {
                startBlurTimeRef.current = Date.now();
                sendEvent('visibility_hidden');
            } else {
                const duration = startBlurTimeRef.current
                    ? Date.now() - startBlurTimeRef.current
                    : 0;
                startBlurTimeRef.current = null;
                sendEvent('window_focus', { durationMs: duration });
            }
        };

        const handleBlur = () => {
            if (isUnloadingRef.current) return;

            setTimeout(() => {
                if (document.visibilityState !== 'hidden') {
                    startBlurTimeRef.current = Date.now();
                    sendEvent('window_blur');
                }
            }, 200);
        };

        const handleFocus = () => {
            if (isUnloadingRef.current) return;

            const duration = startBlurTimeRef.current
                ? Date.now() - startBlurTimeRef.current
                : 0;
            startBlurTimeRef.current = null;
            sendEvent('window_focus', { durationMs: duration });
        };

        const handleMouseLeave = (e: MouseEvent) => {
            if (isUnloadingRef.current || isCompleted) return;

            startBlurTimeRef.current = Date.now();
            sendEvent('mouse_leave', {
                clientY: e.clientY,
                clientX: e.clientX,
            });
        };

        const handleMouseEnter = () => {
            if (isUnloadingRef.current || isCompleted) return;

            const duration = startBlurTimeRef.current
                ? Date.now() - startBlurTimeRef.current
                : 0;
            startBlurTimeRef.current = null;
            sendEvent('mouse_enter', { durationMs: duration });
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('focus', handleFocus);
        document.addEventListener('mouseleave', handleMouseLeave);
        document.addEventListener('mouseenter', handleMouseEnter);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('mouseleave', handleMouseLeave);
            document.removeEventListener('mouseenter', handleMouseEnter);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interviewId, email, isCompleted]);

    return null; // This is an invisible monitoring component
};

export default AntiCheatingMonitor;
