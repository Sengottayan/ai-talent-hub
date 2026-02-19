import React, { useState, useEffect, useRef } from 'react';
import { Clock, Timer as TimerIcon } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface TimerComponentProps {
    interviewId: string;
    duration?: string; // e.g., "30 minutes" or null for count-up
    onTimeout?: () => void;
    userEmail?: string;
    serverStartTime?: number;
}

const TimerComponent: React.FC<TimerComponentProps> = ({
    interviewId,
    duration,
    onTimeout,
    userEmail,
    serverStartTime,
}) => {
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [elapsedTime, setElapsedTime] = useState<number>(0);
    const [isCountdown, setIsCountdown] = useState<boolean>(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // Use refs to track the latest state without triggering effect resets
    const timeLeftRef = useRef<number | null>(null);
    const elapsedTimeRef = useRef<number>(0);
    const onTimeoutRef = useRef(onTimeout);
    const lastToastTimeRef = useRef<number | null>(null);
    const isCountdownRef = useRef<boolean>(false);

    useEffect(() => {
        onTimeoutRef.current = onTimeout;
    }, [onTimeout]);

    useEffect(() => {
        // Determine if this is a countdown or count-up timer
        const durationStr = duration ? String(duration) : null;
        const durationMatch = durationStr?.match(/(\d+)/);
        const minutes = durationMatch ? parseInt(durationMatch[1], 10) : null;

        const startTimeKey = userEmail
            ? `timer_start_${interviewId}_${userEmail}`
            : `timer_start_${interviewId}`;
        const endTimeKey = userEmail
            ? `timer_end_${interviewId}_${userEmail}`
            : `timer_end_${interviewId}`;

        let storedStart = localStorage.getItem(startTimeKey);
        let storedEnd = localStorage.getItem(endTimeKey);

        // Fallback to unscoped keys if scoped not found
        if (!storedStart && !storedEnd) {
            storedStart = localStorage.getItem(`timer_start_${interviewId}`);
            storedEnd = localStorage.getItem(`timer_end_${interviewId}`);
        }

        // Priority: Server start time > Local Storage
        if (serverStartTime) {
            const serverStartStr = serverStartTime.toString();
            // If server time is provided, we should sync with it for consistency across refreshes/devices
            if (storedStart !== serverStartStr) {
                logger.log('⏱️ Syncing with server start time:', serverStartTime);
                storedStart = serverStartStr;
                localStorage.setItem(startTimeKey, serverStartStr);
                // Clear stale end time if we're syncing a new start time
                localStorage.removeItem(endTimeKey);
                storedEnd = null;
            }
        }

        if (minutes && minutes > 0) {
            // Countdown timer
            isCountdownRef.current = true;
            setIsCountdown(true);

            let remaining = 0;
            if (storedEnd) {
                // Resume from stored end time
                const endTime = parseInt(storedEnd, 10);
                const now = Date.now();
                remaining = Math.max(0, Math.floor((endTime - now) / 1000));
            } else if (storedStart) {
                // Derived end time from start time and duration
                const startTime = parseInt(storedStart, 10);
                const totalSeconds = minutes * 60;
                const endTime = startTime + totalSeconds * 1000;
                const now = Date.now();
                remaining = Math.max(0, Math.floor((endTime - now) / 1000));

                logger.log('⏱️ Deriving end time from start time:', { startTime, totalSeconds, remaining });
                localStorage.setItem(endTimeKey, endTime.toString());
            } else {
                // Initialize new countdown
                const now = Date.now();
                const totalSeconds = minutes * 60;
                const endTime = now + totalSeconds * 1000;
                localStorage.setItem(endTimeKey, endTime.toString());
                localStorage.setItem(startTimeKey, now.toString());
                remaining = totalSeconds;
            }

            setTimeLeft(remaining);
            timeLeftRef.current = remaining;
            lastToastTimeRef.current = Math.floor((minutes * 60 - remaining) / 300) * 300;
        } else {
            // Count-up timer
            isCountdownRef.current = false;
            setIsCountdown(false);

            let elapsed = 0;
            if (storedStart) {
                // Resume from stored start time
                const startTime = parseInt(storedStart, 10);
                const now = Date.now();
                elapsed = Math.floor((now - startTime) / 1000);
            } else {
                // Initialize new count-up
                const now = Date.now();
                localStorage.setItem(startTimeKey, now.toString());
                elapsed = 0;
            }
            setElapsedTime(Math.max(0, elapsed));
            elapsedTimeRef.current = Math.max(0, elapsed);
            lastToastTimeRef.current = null; // Reset for count-up
        }
        setIsInitialized(true);
    }, [interviewId, duration, userEmail, serverStartTime]);

    useEffect(() => {
        if (!isInitialized) return;

        const interval = setInterval(() => {
            const now = Date.now();

            if (isCountdownRef.current) {
                // For countdown, we need the end time
                const endTimeKey = userEmail
                    ? `timer_end_${interviewId}_${userEmail}`
                    : `timer_end_${interviewId}`;
                const storedEnd = localStorage.getItem(endTimeKey);

                if (storedEnd) {
                    const endTime = parseInt(storedEnd, 10);
                    const remaining = Math.max(0, Math.floor((endTime - now) / 1000));

                    if (remaining !== timeLeftRef.current) {
                        timeLeftRef.current = remaining;
                        setTimeLeft(remaining);

                        if (remaining === 0) {
                            onTimeoutRef.current?.();
                        }

                        // Toast every 5 minutes
                        const durationStr = duration ? String(duration) : "0";
                        const durationMatch = durationStr.match(/(\d+)/);
                        const totalSecs = (durationMatch ? parseInt(durationMatch[1], 10) : 0) * 60;
                        const elapsed = totalSecs - remaining;

                        if (elapsed > 0 && elapsed % 300 === 0 && elapsed !== lastToastTimeRef.current) {
                            toast.info(`${elapsed / 60} minutes have passed. Stay focused!`);
                            lastToastTimeRef.current = elapsed;
                        }
                    }
                }
            } else {
                // For count-up, we need the start time
                const startTimeKey = userEmail
                    ? `timer_start_${interviewId}_${userEmail}`
                    : `timer_start_${interviewId}`;
                const storedStart = localStorage.getItem(startTimeKey);

                if (storedStart) {
                    const startTime = parseInt(storedStart, 10);
                    const elapsed = Math.max(0, Math.floor((now - startTime) / 1000));

                    if (elapsed !== elapsedTimeRef.current) {
                        elapsedTimeRef.current = elapsed;
                        setElapsedTime(elapsed);

                        if (elapsed > 0 && elapsed % 300 === 0 && elapsed !== lastToastTimeRef.current) {
                            toast.info(`${elapsed / 60} minutes have passed.`);
                            lastToastTimeRef.current = elapsed;
                        }
                    }
                }
            }
        }, 500); // Higher frequency check (every 500ms) for smoother UI, but state only updates on second change

        return () => clearInterval(interval);
    }, [isInitialized, interviewId, userEmail, duration]);

    const formatTime = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes
                .toString()
                .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const displayTime = isCountdown
        ? formatTime(timeLeft ?? 0)
        : formatTime(elapsedTime);

    const isWarning = isCountdown && (timeLeft ?? 0) < 300; // Last 5 minutes
    const isCritical = isCountdown && (timeLeft ?? 0) < 60; // Last 1 minute

    return (
        <div
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg font-semibold transition-all ${isCritical
                ? 'bg-red-100 text-red-700 animate-pulse'
                : isWarning
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-violet-100 text-violet-700'
                }`}
        >
            {isCountdown ? (
                <TimerIcon className="w-5 h-5" />
            ) : (
                <Clock className="w-5 h-5" />
            )}
            <span>{displayTime}</span>
            {isCountdown && (
                <span className="text-xs font-normal opacity-75">remaining</span>
            )}
        </div>
    );
};

export default TimerComponent;
