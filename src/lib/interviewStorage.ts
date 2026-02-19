import axios from 'axios';
import { logger } from './logger';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface TranscriptMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: Date | string;
}

interface TimerData {
    start?: number;
    end?: number;
}

/**
 * Hybrid storage utility for interview data
 * Stores data in both localStorage (for immediate access) and backend (for persistence)
 */
class InterviewStorage {
    private saveTimeout: any = null;

    /**
     * Save transcript to both localStorage and backend (Debounced)
     */
    async saveTranscript(
        interviewId: string,
        transcript: TranscriptMessage[],
        options?: { userEmail?: string; clientId?: string }
    ): Promise<void> {
        try {
            // 1. Save to localStorage immediately (synchronous for reliability)
            const key = `interview_state_${interviewId}`;
            localStorage.setItem(
                key,
                JSON.stringify({
                    transcript,
                    lastUpdated: new Date().toISOString(),
                })
            );

            // 2. Debounce the backend save to prevent server overload (500 errors)
            if (this.saveTimeout) clearTimeout(this.saveTimeout);

            this.saveTimeout = setTimeout(async () => {
                if (options?.userEmail) {
                    try {
                        await axios.post(`${API_URL}/api/interviews/session/save`, {
                            interviewId,
                            candidateEmail: options.userEmail,
                            clientId: options.clientId,
                            currentTranscript: transcript,
                        });
                        logger.log('✅ Transcript synced to cloud');
                    } catch (err: any) {
                        logger.error('Failed to sync transcript to cloud:', err.message);
                    }
                }
            }, 2000); // 2 second debounce

        } catch (error) {
            logger.error('Failed to save transcript to local storage:', error);
        }
    }

    /**
     * Load transcript from localStorage or backend
     */
    async loadTranscript(
        interviewId: string,
        userEmail?: string
    ): Promise<TranscriptMessage[]> {
        try {
            // Try localStorage first
            const key = `interview_state_${interviewId}`;
            const stored = localStorage.getItem(key);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.transcript && Array.isArray(parsed.transcript)) {
                    logger.log('✅ Transcript loaded from localStorage');
                    return parsed.transcript;
                }
            }

            // Fallback to backend if email is provided
            if (userEmail) {
                const response = await axios.get(
                    `${API_URL}/api/interviews/session/${interviewId}/${userEmail}`
                );
                if (response.data.success && response.data.data?.currentTranscript) {
                    logger.log('✅ Transcript loaded from backend');
                    return response.data.data.currentTranscript;
                }
            }

            return [];
        } catch (error) {
            logger.error('Failed to load transcript:', error);
            return [];
        }
    }

    /**
     * Save timer state
     */
    async saveTimer(
        interviewId: string,
        timer: TimerData,
        options?: { userEmail?: string; clientId?: string }
    ): Promise<void> {
        try {
            // Save to localStorage
            if (timer.start) {
                localStorage.setItem(`timer_start_${interviewId}`, timer.start.toString());
            }
            if (timer.end) {
                localStorage.setItem(`timer_end_${interviewId}`, timer.end.toString());
            }

            // Save to backend if email is provided
            if (options?.userEmail) {
                await axios.post(`${API_URL}/api/interviews/session/save`, {
                    interviewId,
                    candidateEmail: options.userEmail,
                    clientId: options.clientId,
                    timerStartTimestamp: timer.start,
                    timerEndTimestamp: timer.end,
                });
            }
        } catch (error) {
            logger.error('Failed to save timer:', error);
        }
    }

    /**
     * Load timer state
     */
    loadTimer(interviewId: string): TimerData {
        try {
            const startKey = `timer_start_${interviewId}`;
            const endKey = `timer_end_${interviewId}`;

            const start = localStorage.getItem(startKey);
            const end = localStorage.getItem(endKey);

            return {
                start: start ? parseInt(start, 10) : undefined,
                end: end ? parseInt(end, 10) : undefined,
            };
        } catch (error) {
            logger.error('Failed to load timer:', error);
            return {};
        }
    }

    /**
     * Create or restore interview session
     */
    async createOrRestoreSession(
        interviewId: string,
        userEmail: string,
        metadata?: any
    ): Promise<any> {
        try {
            const response = await axios.post(`${API_URL}/api/interviews/session/save`, {
                interviewId,
                candidateEmail: userEmail,
                clientId: metadata?.clientId,
                status: 'Started',
                ...metadata,
            });
            logger.log('✅ Session created/restored');
            return response.data;
        } catch (error) {
            logger.error('Failed to create/restore session:', error);
            throw error;
        }
    }

    /**
     * Claim session lock (prevent multi-device access)
     */
    async claimSession(
        interviewId: string,
        userEmail: string,
        clientId: string
    ): Promise<{ success: boolean; conflict?: boolean; error?: string }> {
        try {
            const response = await axios.post(`${API_URL}/api/interviews/session/claim`, {
                interviewId,
                candidateEmail: userEmail,
                clientId,
            });

            if (response.data.success) {
                logger.log('✅ Session claimed successfully');
                return { success: true };
            } else if (response.data.conflict) {
                logger.warn('⚠️ Session conflict detected');
                return { success: false, conflict: true };
            }

            return { success: false, error: response.data.message };
        } catch (error: any) {
            logger.error('Failed to claim session:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Clear all interview-related data from localStorage
     */
    clearInterviewData(interviewId: string, userEmail?: string): void {
        try {
            const keys = [
                'interviewInfo',
                `interview_state_${interviewId}`,
                `timer_start_${interviewId}`,
                `timer_end_${interviewId}`,
            ];

            if (userEmail) {
                keys.push(
                    `is_completed_${interviewId}_${userEmail}`,
                    `is_processing_feedback_${interviewId}_${userEmail}`,
                    `violations_${interviewId}_${userEmail}`,
                    `interview_client_id_${interviewId}`
                );
            }

            keys.forEach((key) => localStorage.removeItem(key));
            logger.log('✅ Interview data cleared from localStorage');
        } catch (error) {
            logger.error('Failed to clear interview data:', error);
        }
    }
}

// Export singleton instance
export const interviewStorage = new InterviewStorage();
export default interviewStorage;
