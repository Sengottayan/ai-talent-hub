# Candidate Interview Module Full Code



## File: app/interview/layout.jsx
```javascript
'use client';
import React, { useState } from 'react';
import InterviewHeader from './_components/InterviewHeader';
import { InterviewDataContext } from '@/context/InterviewDataContext';

const InterviewLayout = ({ children }) => {
  const [interviewInfo, setInterviewInfo] = useState();

  return (
    <InterviewDataContext.Provider value={{ interviewInfo, setInterviewInfo }}>
      <InterviewHeader />
      <div className="bg-gradient-to-br from-slate-50 via-white to-violet-50/30 min-h-[calc(100vh-64px)] pb-6">
        {children}
      </div>
    </InterviewDataContext.Provider>
  );
};

export default InterviewLayout;

```


## File: app/interview/[interview_id]/start/page.jsx
```javascript
'use client';
import { InterviewDataContext } from '@/context/InterviewDataContext';
import { Timer, Phone, Clock, Video, CheckCircle, Loader2 } from 'lucide-react';
import Image from 'next/image';
import React, {
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from 'react';
import AlertConfirmation from './_components/AlertConfirmation';
import VideoPanel from './_components/VideoPanel';
import AntiCheatingMonitor from './_components/AntiCheatingMonitor';
import DraggableCamera from './_components/DraggableCamera';
import axios from 'axios';
import TimmerComponent from './_components/TimmerComponent';
import { getVapiClient } from '@/lib/vapiconfig';
import { supabase } from '@/services/supabaseClient';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { DB_TABLES } from '@/services/Constants';
import { logger } from '@/lib/logger';
import { UserAuth } from '@/context/AuthContext';
import interviewStorage from '@/lib/storage/interviewStorage';
import { candidateSupabase } from '@/services/candidateClient';

// Helper to avoid 'undefined' string in greeting
const sanitizeName = (name) => {
  if (!name || String(name).toLowerCase() === 'undefined' || String(name).trim() === '') {
    return 'there';
  }
  return String(name).trim();
};

function StartInterview() {
  const { session } = UserAuth();
  const { interviewInfo, setInterviewInfo } = useContext(InterviewDataContext);
  const interviewInfoRef = useRef(interviewInfo);
  // Track mount status to prevent zombie redirects
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const vapi = getVapiClient();
  const [activeUser, setActiveUser] = useState(false);
  const [start, setStart] = useState(false);
  const [subtitles, setSubtitles] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [vapiCallActive, setVapiCallActive] = useState(false); // Track if VAPI call is active
  const conversation = useRef(null);
  const transcriptRef = useRef([]); // Store timestamps locally
  const { interview_id } = useParams();

  // Auto-disconnect countdown state
  const [showEndCountdown, setShowEndCountdown] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef(null);

  // -- SILENCE DETECTION STATES --
  const lastSpeechTimeRef = useRef(Date.now());
  const silenceWarningShownRef = useRef(false);
  const silenceCheckIntervalRef = useRef(null);
  // -----------------------------

  const violationsRef = useRef([]); // Store violations locally

  const router = useRouter();
  const [userProfile, setUserProfile] = useState({
    picture: null,
    name: 'Candidate',
  });

  // SESSION RECOVERY: Check for Candidate OTP Session if UserAuth is missing
  const [activeSession, setActiveSession] = useState(session);
  const [supabaseClient, setSupabaseClient] = useState(() => supabase); // Default to standard client

  useEffect(() => {
    const recoverSession = async () => {
      // 1. If global session exists, use it
      if (session) {
        setActiveSession(session);
        setSupabaseClient(supabase);
        return;
      }

      // 2. Fallback: Check Candidate Session (OTP)
      const { data: { session: candidateSession } } = await candidateSupabase.auth.getSession();
      if (candidateSession) {
        logger.log("✅ Candidate OTP Session recovered");
        setActiveSession(candidateSession);
        setSupabaseClient(candidateSupabase); // Use candidate client for DB calls
      }
    };
    recoverSession();
  }, [session]);

  // Keep UserProfile synced with interviewInfo
  useEffect(() => {
    if (interviewInfo?.candidate_name) {
      const cleanName = sanitizeName(interviewInfo.candidate_name);
      setUserProfile(prev => ({ ...prev, name: cleanName !== 'there' ? cleanName : 'Candidate' }));
    }
  }, [interviewInfo?.candidate_name]);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const isGeneratingFeedbackRef = useRef(false);
  const isFreshStartRef = useRef(false);
  const [showGate, setShowGate] = useState(() => {
    if (typeof window !== 'undefined') {
      // 0. Check for Fresh Start Flag (from prep page)
      const justJoined = sessionStorage.getItem('just_joined_interview') === 'true';
      if (justJoined) {
        sessionStorage.removeItem('just_joined_interview');
        isFreshStartRef.current = true; // FRESH START: Mark as fresh start

        // CLEANUP: Clean stale local storage to prevent "Completed" guards from blocking fresh start
        try {
          const email = interviewInfo?.email?.toLowerCase().trim();
          if (typeof window !== 'undefined' && interview_id) {
            localStorage.removeItem(`interview_state_${interview_id}`);
            localStorage.removeItem(`timer_start_${interview_id}`);
            localStorage.removeItem(`timer_end_${interview_id}`);
            if (email) {
              localStorage.removeItem(`is_completed_${interview_id}_${email}`);
              localStorage.removeItem(`is_processing_feedback_${interview_id}_${email}`);
              localStorage.removeItem(`violations_${interview_id}_${email}`);
            }
          }
        } catch (e) { }

        return false; // FRESH START: Skip gate
      }

      // Primary Check: If Context is empty but LocalStorage has info, it's a reload/restore.
      const hasContext = !!interviewInfo;
      const hasStorage = !!localStorage.getItem('interviewInfo');
      if (!hasContext && hasStorage) {
        return true;
      }

      // Secondary Check: Browser navigation type
      const nav = window.performance?.getEntriesByType?.('navigation')?.[0];
      return nav?.type === 'reload';
    }
    return false;
  }); // Gatekeeper State: Locked on Reload or Context Loss
  const retryCountRef = useRef(0); // Auto-retry counter for flaky connections
  const callStartTimeRef = useRef(null); // Track call duration to prevent immediate exits

  // Error state for debugging
  const [errorDetails, setErrorDetails] = useState(null);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);

  // State for resume logic (from first code)
  const [previousTranscript, setPreviousTranscript] = useState([]);
  const [dbRecordId, setDbRecordId] = useState(null);
  const dbRecordIdRef = useRef(null);
  const [loadingResume, setLoadingResume] = useState(true);

  // Enhanced Navigation Guard with improved logic from first code
  const isRedirectingRef = useRef(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const isRestoredRef = useRef(false);

  // --- MULTI-DEVICE LOCKING LOGIC ---
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockedOutReason, setLockedOutReason] = useState('');
  const [isInitializingLock, setIsInitializingLock] = useState(true);
  const clientIdRef = useRef(null);

  // 1. Initialize Client ID (Persistent per tab via sessionStorage)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let id = sessionStorage.getItem('interview_client_id');
      if (!id) {
        id = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
        sessionStorage.setItem('interview_client_id', id);
      }
      clientIdRef.current = id;
    }
  }, []);

  // 2. Realtime Listener for Lock Status
  useEffect(() => {
    if (!interview_id || !interviewInfo?.email || isLockedOut) return;

    const currentClientId = clientIdRef.current;
    if (!currentClientId) return;

    logger.log('📡 Starting Session Lock Realtime Monitor...');

    // Subscribe to changes in interview_sessions for this specific interview + user
    const channel = supabase
      .channel(`session_lock_${interview_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'interview_sessions',
          filter: `interview_id=eq.${interview_id}`
        },
        (payload) => {
          // Verify it's for the same user email (since filter only supports one column usually)
          if (payload.new.user_email?.toLowerCase().trim() === interviewInfo.email?.toLowerCase().trim()) {
            const newActiveSessionId = payload.new.active_session_id;

            if (newActiveSessionId && newActiveSessionId !== currentClientId) {
              logger.warn('🚨 SESSION TAKEOVER DETECTED! Ejecting current device...');
              handleEjection('This interview has been started on another device or tab.');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [interview_id, interviewInfo?.email, isLockedOut]);

  const handleEjection = (reason) => {
    setIsLockedOut(true);
    setLockedOutReason(reason);
    setStart(false);

    // Stop VAPI immediately
    if (vapi) {
      try { vapi.stop(); } catch (e) { }
    }

    toast.error(reason, {
      id: 'session-lock-error',
      duration: Infinity,
      position: 'top-center'
    });
  };
  // ---------------------------------

  // Recruiter Guard: Prevent recruiters from participating
  useEffect(() => {
    if (session?.user?.user_metadata?.role === 'recruiter') {
      toast.error('Recruiters cannot participate in interviews. Redirecting to dashboard...', { id: 'recruiter-start-error' });
      router.replace('/recruiter/dashboard');
    }
  }, [session, router]);

  useEffect(() => {
    // 1. Navigation Guard (Back/Forward) - Improved version
    const handlePopState = (event) => {
      // 1. If Generating Feedback: Show confirmation dialog
      if (isGeneratingFeedback) {
        window.history.pushState(null, null, window.location.href); // Keep URL
        setShowExitConfirmation(true);
        return;
      }

      // 2. Normal Interview Guard
      if (start && !isRedirectingRef.current) {
        // Prevent immediate navigation
        window.history.pushState(null, null, window.location.href);
        setShowExitConfirmation(true);
      }
    };

    // 2. Refresh/Close Guard
    const handleBeforeUnload = (event) => {
      if (start && !isGeneratingFeedback && !isRedirectingRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    // Initialize history state to allow intercepting back button
    window.history.pushState(null, null, window.location.href);

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Restore interviewInfo from localStorage if missing
    if (!interviewInfo && typeof window !== 'undefined') {
      const stored = localStorage.getItem('interviewInfo');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.interview_id === interview_id) {
            setInterviewInfo(parsed);
          } else {
            // interview_id mismatch, clear
            localStorage.removeItem('interviewInfo');
            router.replace(`/interview/${interview_id}`);
          }
        } catch {
          localStorage.removeItem('interviewInfo');
          router.replace(`/interview/${interview_id}`);
        }
      } else {
        // No info, redirect to join page
        router.replace(`/interview/${interview_id}`);
      }
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [interviewInfo, interview_id, setInterviewInfo, router, start, isGeneratingFeedback]);

  // FIX: MULTI-LAYERED ERROR SUPPRESSION STRATEGY
  useEffect(() => {
    // LAYER 1: Intercept Native Console Errors (for direct SDK logging)
    const originalConsoleError = console.error;
    console.error = (...args) => {
      // Check if any argument contains the suppression pattern
      const shouldSuppress = args.some(arg => {
        if (typeof arg !== 'string' && !arg?.message && !arg?.error) return false;

        // Convert arg to checkable string
        let content = '';
        if (typeof arg === 'string') content = arg;
        else if (arg?.message) content = arg.message;
        else if (arg?.error) content = typeof arg.error === 'string' ? arg.error : JSON.stringify(arg.error);
        else content = JSON.stringify(arg);

        const lower = content.toLowerCase();
        // Broader pattern matching as requested to catch variants
        return (
          (lower.includes('meeting') && lower.includes('ended') && lower.includes('ejection')) ||
          (lower.includes('meeting') && lower.includes('has ended'))
        );
      });

      if (shouldSuppress) {
        // Silent suppression
        return;
      }

      // Pass through all other errors normaly
      // Use Function.prototype.apply to safely call the original function
      if (originalConsoleError) {
        // Safer way to call console.error that works even if it's a proxy
        Function.prototype.apply.call(originalConsoleError, console, args);
      }
    };

    // LAYER 2: Global Unhandled Rejection Handler
    const handleUnhandledRejection = (event) => {
      try {
        const reason = event.reason;
        let msg = '';
        if (typeof reason === 'string') msg = reason;
        else if (reason?.message) msg = reason.message;
        else if (reason?.error) msg = typeof reason.error === 'string' ? reason.error : JSON.stringify(reason.error);
        else msg = JSON.stringify(reason);

        const lowerMsg = msg.toLowerCase();
        if (
          (lowerMsg.includes('meeting') && lowerMsg.includes('ended') && lowerMsg.includes('ejection')) ||
          (lowerMsg.includes('meeting') && lowerMsg.includes('has ended'))
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          return;
        }
      } catch (err) {
        // Fail silently
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // CLEANUP: Restore everything on unmount
    return () => {
      console.error = originalConsoleError;
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Keep Ref updated
  useEffect(() => {
    interviewInfoRef.current = interviewInfo;
  }, [interviewInfo]);

  // Sync dbRecordId to Ref (Fix for Anti-Cheating sync)
  useEffect(() => {
    dbRecordIdRef.current = dbRecordId;
  }, [dbRecordId]);

  // Logic to handle user choice on exit confirmation
  const handleExitConfirm = () => {
    // FIX 2: CONTEXT-AWARE NAVIGATION ALERT GATING
    if (isGeneratingFeedback) {
      toast.warning("Please wait, finalizing interview results...");
      return; // Prevent exit during feedback generation
    }

    setShowExitConfirmation(false);

    // FIX: Transition to Coding if applicable instead of stopping
    const hasCodingQuestion = !!interviewInfo?.question_list?.codingQuestion;
    if (hasCodingQuestion) {
      toast.info("Transitioning to Coding Round...");
      if (vapi) vapi.stop();
      router.push(`/interview/${interview_id}/coding`);
      return;
    }

    // Normal interview stop
    stopInterview('user_exit');
  };

  /**
   * CENTRALIZED INTERVIEW FINALIZER (HOTFIX)
   * Guaranteed to run ONCE and enforce redirection.
   */
  const isFinalizingRef = useRef(false);
  const hasShownFinalToastRef = useRef(false); // FIX 4: TOAST DEDUPLICATION

  const finalizeInterview = async (reason = 'completion') => {
    if (isFinalizingRef.current) return; // Idempotent Guard
    isFinalizingRef.current = true;
    isRedirectingRef.current = true; // Lock guards

    logger.log(`🚨 FINALIZING INTERVIEW (VIA API). Reason: ${reason}`);

    const info = interviewInfoRef.current;
    let normalizedEmail = info?.email?.toLowerCase().trim();
    let candidateName = info?.candidate_name || userProfile.name;

    // 🛡️ Fallback: Check LocalStorage directly if context is missing critical data
    if (typeof window !== 'undefined') {
      try {
        if (!normalizedEmail || !candidateName || candidateName === 'Candidate') {
          const storedInfo = localStorage.getItem('interviewInfo');
          if (storedInfo) {
            const parsed = JSON.parse(storedInfo);
            if (parsed.email) normalizedEmail = parsed.email.toLowerCase().trim();
            if (parsed.candidate_name) candidateName = parsed.candidate_name;
          }
        }
      } catch (e) { }
    }

    // 1. Terminate Vapi Safely
    if (vapi) {
      try {
        vapi.stop();
      } catch (e) {
        logger.warn("Vapi stop error ignored:", e);
      }
    }

    if (typeof window !== 'undefined' && normalizedEmail) {
      try {
        // Set local flags immediately to stop render
        localStorage.setItem(`is_completed_${interview_id}_${normalizedEmail}`, 'true');

        // Prepare final transcript
        const finalTranscript = transcriptRef.current || [];

        // Determine anti-cheating snapshot from local state (or ref)
        // Note: The monitor component should be updating results in real-time,
        // but we take a snapshot here for insurance.
        let localAntiCheating = null;
        try {
          const { data: res } = await supabase.from('interview_results')
            .select('anti_cheating_state')
            .eq('interview_id', interview_id)
            .eq('email', normalizedEmail)
            .maybeSingle();
          localAntiCheating = res?.anti_cheating_state;
        } catch (e) { }

        // Call the centralized finalize API
        const response = await axios.post('/api/interview/finalize', {
          interview_id,
          email: normalizedEmail,
          fullname: candidateName, // ✅ Uses robust fallback
          transcript: finalTranscript,
          anti_cheating_state: localAntiCheating,
          reason
        });

        if (response.data.success) {
          logger.log('✅ BACKEND FINALIZATION SUCCESSFUL');
        }
      } catch (e) {
        logger.error('Failed to finalize interview via API', e);
        // Fallback or continue to redirect anyway to prevent sticking
      }

      // ✅ HARD CLEANUP: Clear interview-specific storage
      localStorage.removeItem('interviewInfo');
      localStorage.removeItem(`interview_state_${interview_id}`);
      localStorage.removeItem(`timer_start_${interview_id}`);
      localStorage.removeItem(`timer_end_${interview_id}`);
      localStorage.removeItem(`is_processing_feedback_${interview_id}_${normalizedEmail}`);
    }

    // ========================================
    // 6. Force Redirect
    // ========================================
    if (!hasShownFinalToastRef.current) {
      hasShownFinalToastRef.current = true;
      toast.dismiss();
      toast.success("Interview finalized. Redirecting...");
    }

    setTimeout(() => {
      window.location.replace(`/interview/${interview_id}/completed`);
    }, 500);
  };


  const handleExitCancel = () => {
    setShowExitConfirmation(false);
    // Push state again to maintain the trap
    window.history.pushState(null, null, window.location.href);
  };


  // Handle Gaze Violations from VideoPanel -> useGazeTracker
  const handleGazeViolation = useCallback((violation) => {
    // Add to local ref
    if (start && !isRedirectingRef.current) {

      // Calculate Relative Time
      let relativeTimeStr = "00:00:00";
      if (callStartTimeRef.current) {
        const diffMs = Date.now() - callStartTimeRef.current;
        const totalSeconds = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        relativeTimeStr = [
          hours.toString().padStart(2, '0'),
          minutes.toString().padStart(2, '0'),
          seconds.toString().padStart(2, '0')
        ].join(':');
      }

      // Append relative time to the reason so it persists in DB
      const enhancedViolation = {
        ...violation,
        reason: `[${relativeTimeStr}] ${violation.type}`
      };

      violationsRef.current.push(enhancedViolation);

      // Persist immediately (Scoped Key)
      if (interviewInfo?.email && interview_id) {
        const key = `violations_${interview_id}_${interviewInfo.email}`;
        localStorage.setItem(key, JSON.stringify(violationsRef.current));

        // Save to Supabase via Secure API Route (Bypasses RLS)
        // We send the ENHANCED violation with the timestamped reason
        axios.post('/api/interview/log-violation', {
          interview_id: interview_id,
          email: interviewInfo.email,
          type: violation.type,
          severity: violation.severity,
          duration: violation.duration,
          reason: violation.reason,
          timestamp: violation.timestamp,
        }).catch(err => {
          console.error("Failed to save violation via API:", err);
        });
      }
    }
  }, [start, interviewInfo, interview_id]);

  // ✅ SUPABASE-FIRST RESTORE PIPELINE (Production Fix)
  useEffect(() => {
    const checkCompletionAndLoadProgress = async () => {
      // 0. Skip if Fresh Start
      if (isFreshStartRef.current) {
        logger.log("Fresh/Restart detected. Skipping completion check/restore.");
        setLoadingResume(false);
        return;
      }

      const normalizedEmail = interviewInfo?.email?.toLowerCase().trim();
      // If vital info is missing, we can't fetch resume data
      if (!normalizedEmail || !interview_id) {
        // If interviewInfo is missing, we are likely restoring it or redirecting.
        // Keep loading state true to prevent UI flash.
        if (interviewInfo) {
          setLoadingResume(false);
        }
        return;
      }

      try {
        // Restore violations from localStorage
        if (normalizedEmail && interview_id) {
          const violationKey = `violations_${interview_id}_${normalizedEmail}`;
          const storedViolations = localStorage.getItem(violationKey);
          if (storedViolations) {
            violationsRef.current = JSON.parse(storedViolations);
          }
        }

        // ========================================
        // PRIORITY 1: Check interview_sessions (PRIMARY SOURCE)
        // ========================================
        // Use dynamically selected client (Standard vs Candidate)
        const { data: sessionData, error: sessionError } = await supabaseClient
          .from('interview_sessions')
          .select('*')
          .eq('interview_id', interview_id)
          .eq('user_email', normalizedEmail)
          .maybeSingle();

        if (!sessionError && sessionData) {
          logger.log('✅ SESSION FOUND IN SUPABASE (PRIMARY):', sessionData);

          // ========================================
          // CONCURRENCY GUARD: Check for existing active session
          // ========================================
          if (sessionData.session_status === 'active' && sessionData.active_session_id) {
            const currentClientId = clientIdRef.current;
            if (currentClientId && sessionData.active_session_id !== currentClientId) {
              // Someone else is already master. 
              // In Takeover model, we don't block here because verification just happened,
              // but we SHOULD be aware of it.
              logger.warn('⚠️ Someone else is currently active in this session.');
            }
          }

          // ========================================
          // TERMINATION GUARD: Check session_status
          // ========================================
          if (sessionData.session_status === 'completed' || sessionData.session_status === 'auto_completed') {
            // logger.log('🚨 SESSION ALREADY COMPLETED. Terminating and clearing localStorage.');

            // HARD CLEANUP: Clear all localStorage keys
            if (typeof window !== 'undefined') {
              localStorage.removeItem('interviewInfo');
              localStorage.setItem(`is_completed_${interview_id}_${normalizedEmail}`, 'true'); // Ensure guard is set
              localStorage.removeItem(`is_processing_feedback_${interview_id}_${normalizedEmail}`); // Clear processing flag too
              localStorage.removeItem(`interview_state_${interview_id}`);
              localStorage.removeItem(`timer_start_${interview_id}`);
              localStorage.removeItem(`timer_end_${interview_id}`);
              localStorage.removeItem(`violations_${interview_id}_${normalizedEmail}`);
            }

            // RECOVERY GUARD: Check if results are indeed present
            const { data: checkRes } = await supabase.from('interview_results')
              .select('id, is_completed, recommendations')
              .eq('interview_id', interview_id)
              .eq('email', normalizedEmail)
              .maybeSingle();

            if (!checkRes || !checkRes.is_completed || !checkRes.recommendations) {
              logger.warn('⚠️ RECOVERY: Session completed but results incomplete. Triggering finalization barrier.');
              await axios.post('/api/interview/finalize', {
                interview_id,
                email: normalizedEmail,
                transcript: sessionData.current_transcript || [],
                reason: 'recovery'
              }).catch(e => console.error('Recovery finalization failed', e));
            }

            // HARD REDIRECT
            isRedirectingRef.current = true;
            window.location.replace(`/interview/${interview_id}/completed`);
            return; // EXIT IMMEDIATELY
          }

          // ========================================
          // RESTORE FROM SUPABASE SESSION (Active/In-Progress)
          // ========================================
          if (sessionData.current_transcript) {
            try {
              let parsed = sessionData.current_transcript;
              if (typeof parsed === 'string') {
                parsed = JSON.parse(parsed);
              }
              if (Array.isArray(parsed) && parsed.length > 0) {
                logger.log("✅ Restoring transcript from interview_sessions:", parsed);
                setPreviousTranscript(parsed);
                transcriptRef.current = parsed;
                isRestoredRef.current = true;

                // Set subtitles to last message
                const lastMsg = parsed[parsed.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                  setSubtitles(lastMsg.content);
                }

                // OVERWRITE localStorage with Supabase data
                if (typeof window !== 'undefined') {
                  localStorage.setItem(`interview_state_${interview_id}`, JSON.stringify({
                    transcript: parsed
                  }));
                }
              }
            } catch (e) {
              logger.error("Failed to parse session transcript", e);
            }
          }

          // Restore timer from session
          if (sessionData.timer_start_timestamp && typeof window !== 'undefined') {
            const startTimeKey = `timer_start_${interview_id}`;
            const endTimeKey = `timer_end_${interview_id}`;

            // Only restore if localStorage doesn't have it
            if (!localStorage.getItem(startTimeKey)) {
              localStorage.setItem(startTimeKey, sessionData.timer_start_timestamp.toString());
              logger.log("✅ Restored timer_start from interview_sessions");
            }

            if (sessionData.timer_end_timestamp && !localStorage.getItem(endTimeKey)) {
              localStorage.setItem(endTimeKey, sessionData.timer_end_timestamp.toString());
              logger.log("✅ Restored timer_end from interview_sessions");
            }
          }
        }

        // ========================================
        // PRIORITY 2: Fallback to interview_results (SECONDARY SOURCE)
        // ========================================
        const { data, error } = await supabaseClient
          .from(DB_TABLES.INTERVIEW_RESULTS)
          .select('id, completed_at, conversation_transcript, started_at, anti_cheating_state, violation_count')
          .eq('interview_id', interview_id)
          .eq('email', interviewInfo.email)
          .order('id', { ascending: false })
          .limit(1);

        if (data && data.length > 0) {
          const record = data[0];
          setDbRecordId(record.id);
          dbRecordIdRef.current = record.id;

          if (record.completed_at) {
            // logger.log('🚨 INTERVIEW COMPLETED (from interview_results). Terminating.');

            // ✅ SAFETY GUARD: Recover violation_count if NULL
            if (record.violation_count === null && record.anti_cheating_state) {
              try {
                const violationCount = record.anti_cheating_state.total_focus_loss_events || 0;
                logger.log('⚠️ SAFETY GUARD: Recovering NULL violation_count from anti_cheating_state:', violationCount);
                await supabase
                  .from(DB_TABLES.INTERVIEW_RESULTS)
                  .update({ violation_count: violationCount })
                  .eq('id', record.id);
                logger.log('✅ SAFETY GUARD: violation_count recovered');
              } catch (e) {
                logger.error('Failed to recover violation_count', e);
              }
            }

            // HARD CLEANUP
            if (typeof window !== 'undefined') {
              localStorage.removeItem('interviewInfo');
              localStorage.removeItem(`is_completed_${interview_id}_${interviewInfo.email}`);
              localStorage.removeItem(`is_processing_feedback_${interview_id}_${normalizedEmail}`); // Clear processing flag too
              localStorage.removeItem(`interview_state_${interview_id}`);
              localStorage.removeItem(`timer_start_${interview_id}`);
              localStorage.removeItem(`timer_end_${interview_id}`);
            }

            isRedirectingRef.current = true;
            window.location.replace(`/interview/${interview_id}/completed`);
            return; // Exit early
          } else {
            // Not completed in DB - Clear any stale strict flags
            const completionKey = `is_completed_${interview_id}_${interviewInfo.email}`;
            const processingKey = `is_processing_feedback_${interview_id}_${normalizedEmail}`;
            if (localStorage.getItem(completionKey) === 'true') {
              logger.log("Clearing stale completion flag based on DB status");
              localStorage.removeItem(completionKey);
              setIsCompletedSync(false);
            }
            if (localStorage.getItem(processingKey) === 'true') {
              logger.log("Clearing stale processing flag based on DB status");
              localStorage.removeItem(processingKey);
              setIsProcessingFeedbackSync(false);
            }

            // Only use interview_results transcript if interview_sessions didn't have it
            if (!sessionData?.current_transcript && record.conversation_transcript) {
              try {
                let parsed = record.conversation_transcript;
                if (typeof parsed === 'string') {
                  parsed = JSON.parse(parsed);
                }

                // ✅ Handle both raw array and new object { transcript: [...] }
                const transcriptData = Array.isArray(parsed) ? parsed : (parsed.transcript || []);

                if (transcriptData.length > 0) {
                  logger.log("✅ Restoring transcript from interview_results (fallback):", transcriptData);
                  setPreviousTranscript(transcriptData);
                  transcriptRef.current = transcriptData;
                  isRestoredRef.current = true;

                  const lastMsg = transcriptData[transcriptData.length - 1];
                  if (lastMsg && lastMsg.role === 'assistant') {
                    setSubtitles(lastMsg.content);
                  }
                }
              } catch (e) {
                logger.error("Failed to parse previous transcript", e);
              }

              // Restore timer state from interview_results if not from sessions
              if (record.started_at && typeof window !== 'undefined') {
                const startTimeKey = `timer_start_${interview_id}`;
                const endTimeKey = `timer_end_${interview_id}`;

                if (!localStorage.getItem(startTimeKey) && !localStorage.getItem(endTimeKey)) {
                  const dbStartTime = new Date(record.started_at).getTime();

                  const match = String(interviewInfo?.duration).match(/(\d+)/);
                  if (match) {
                    const minutes = parseInt(match[1], 10);
                    if (!isNaN(minutes) && minutes > 0) {
                      const endTime = dbStartTime + (minutes * 60 * 1000);
                      localStorage.setItem(endTimeKey, endTime.toString());
                      logger.log("Restored countdown timer from interview_results");
                    }
                  } else {
                    localStorage.setItem(startTimeKey, dbStartTime.toString());
                    logger.log("Restored count-up timer from interview_results");
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        logger.error('Error checking status:', err);
      } finally {
        if (!isRedirectingRef.current) {
          setLoadingResume(false);
        }
      }
    };

    checkCompletionAndLoadProgress();
  }, [interview_id, interviewInfo?.email, interviewInfo?.duration]);

  // STRICT COMPLETED CHECK: Prevent back navigation - MOVED TO DB CHECK
  // We no longer blindly redirect based on localStorage to prevent loops if DB is cleared.
  // Instead, we let the DB check in checkCompletionAndLoadProgress handle the redirect/clearing.

  // If we detect completion, show a placeholder while checking with DB
  // This prevents the interview UI from flashing if we are indeed done
  const [isCompletedSync, setIsCompletedSync] = useState(false);
  const [isProcessingFeedbackSync, setIsProcessingFeedbackSync] = useState(false);
  const [isChecking, setIsChecking] = useState(true); // Start true to block render

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Scoped Check: Try to get email to prevent cross-user conflicts
      let email = interviewInfo?.email;
      if (!email) {
        try {
          // Fallback: try to peek at stored interview info if context not ready
          const stored = localStorage.getItem('interviewInfo');
          if (stored) {
            const parsed = JSON.parse(stored);
            // Ensure this info matches current interview
            if (parsed && parsed.interview_id === interview_id) {
              email = parsed.email;
            }
          }
        } catch (e) { }
      }

      if (email) {
        const completionKey = `is_completed_${interview_id}_${email}`;
        const processingKey = `is_processing_feedback_${interview_id}_${email}`;
        if (localStorage.getItem(completionKey) === 'true') {
          setIsCompletedSync(true);
          // ✅ SAFETY REDIRECT: If flagged complete locally, ensure we move to completed page
          // This fixes the "Stuck on Spinner" issue if the main finalize sequence hangs.
          if (!isRedirectingRef.current) {
            isRedirectingRef.current = true;
            logger.log("🛡️ Safety Redirect triggered from sync check");
            window.location.replace(`/interview/${interview_id}/completed`);
          }
        }
        if (localStorage.getItem(processingKey) === 'true') {
          setIsProcessingFeedbackSync(true);
        }
      }
      // Allow rendering (or showing sync screen)
      setIsChecking(false);
    }
  }, [interview_id, interviewInfo]);

  // Conditional returns moved to bottom to satisfy Rules of Hooks

  // Persist progress to DB (from first code)
  const saveProgress = async (currentConversation) => {
    // Access Ref to avoid stale closure
    const info = interviewInfoRef.current;
    const normalizedEmail = info?.email?.toLowerCase().trim();
    if (loadingResume || !normalizedEmail || !interview_id) return;

    // Retrieve start time from localStorage to persist to DB
    const startTimeKey = normalizedEmail ? `timer_start_${interview_id}_${normalizedEmail}` : `timer_start_${interview_id}`;
    const endTimeKey = normalizedEmail ? `timer_end_${interview_id}_${normalizedEmail}` : `timer_end_${interview_id}`;
    let startedAt = null;

    if (typeof window !== 'undefined') {
      // First try scoped keys, then fallback to unscoped for legacy support
      let storedStart = localStorage.getItem(startTimeKey);
      let storedEnd = localStorage.getItem(endTimeKey);

      if (!storedStart && !storedEnd && normalizedEmail) {
        // Fallback to unscoped keys if scoped not found
        storedStart = localStorage.getItem(`timer_start_${interview_id}`);
        storedEnd = localStorage.getItem(`timer_end_${interview_id}`);
      }

      if (storedStart) {
        startedAt = new Date(parseInt(storedStart, 10)).toISOString();
      } else if (storedEnd) {
        // Calculate start from end time if only end exists
        const match = String(info?.duration).match(/(\d+)/);
        const minutes = match ? parseInt(match[1], 10) : 30;
        const endTime = parseInt(storedEnd, 10);
        const startTime = endTime - (minutes * 60 * 1000);
        startedAt = new Date(startTime).toISOString();
      } else if (!dbRecordIdRef.current) {
        // First save, set start time to now
        startedAt = new Date().toISOString();
      }
    }

    const payload = {
      interview_id,
      email: normalizedEmail,
      fullname: info.candidate_name || 'Candidate',
      conversation_transcript: currentConversation,
      ...(startedAt && { started_at: startedAt }),
    };

    try {
      // Use Ref ensuring we have latest ID even in stale closures
      // ✅ USE UPSERT: Handles unique constraint (interview_id, email)
      const { data: upsertData, error: upsertError } = await supabase
        .from(DB_TABLES.INTERVIEW_RESULTS)
        .upsert({
          interview_id,
          email: normalizedEmail,
          fullname: info.candidate_name || 'Candidate',
          conversation_transcript: currentConversation,
          ...(startedAt && { started_at: startedAt }),
        }, {
          onConflict: 'interview_id,email',
          ignoreDuplicates: false
        })
        .select('id')
        .single();

      if (!upsertError && upsertData) {
        setDbRecordId(upsertData.id);
        dbRecordIdRef.current = upsertData.id;
      }
    } catch (e) {
      logger.error("Failed to save progress", e);
    }

    // Hybrid Storage Sync
    try {
      if (interview_id && currentConversation) {
        // ✅ CRITICAL: Save transcript to interview_sessions.current_transcript
        await interviewStorage.saveTranscript(interview_id, currentConversation, {
          userEmail: normalizedEmail // ✅ Pass userEmail for proper DB write (no debounce - immediate)
        });

        if (startedAt) {
          await interviewStorage.saveTimer(interview_id, {
            start: new Date(startedAt).getTime()
          }, { userEmail: normalizedEmail });
        }
      }
    } catch (e) {
      logger.error("Hybrid storage sync failed", e);
    }
  };

  const startCall = async () => {
    const job_position = interviewInfo?.job_position || 'Unknown Position';
    // ✅ FIX: Respect the Active Tab selected by Recruiter
    // Fallback order: activeSection -> Combined -> JD -> CV (if others empty)
    const activeSection = interviewInfo?.question_list?.activeSection || 'combined';

    let selectedQuestions = [];
    const qList = interviewInfo?.question_list || {};

    if (activeSection === 'cv' && qList.cvQuestions?.length > 0) {
      selectedQuestions = qList.cvQuestions;
    } else if (activeSection === 'jd' && qList.jdQuestions?.length > 0) {
      selectedQuestions = qList.jdQuestions;
    } else if (activeSection === 'combined' && qList.combinedQuestions?.length > 0) {
      selectedQuestions = qList.combinedQuestions;
    } else {
      // 🛡️ Fallback: If selected section is empty, try others
      if (qList.combinedQuestions?.length > 0) selectedQuestions = qList.combinedQuestions;
      else if (qList.jdQuestions?.length > 0) selectedQuestions = qList.jdQuestions;
      else if (qList.cvQuestions?.length > 0) selectedQuestions = qList.cvQuestions;
      // Legacy Support
      else if (qList.interviewQuestions?.length > 0) selectedQuestions = qList.interviewQuestions;
    }

    // Map to just the question string if it's an object
    const finalQuestionList = selectedQuestions.map(q => typeof q === 'string' ? q : q?.question).filter(Boolean);

    logger.log(`🎯 SELECTED QUESTIONS (Active: ${activeSection}):`, finalQuestionList);

    const question_list = finalQuestionList; // Remove the slice limit if you want MORE than 10, or keep it.
    // const question_list = finalQuestionList.slice(0, 10); // Optional: Unlock limit

    // logger.log('job_position:', job_position); // redundant log
    logger.log('Final Question List passed to VAPI:', question_list);

    // Check for saved state (DB priority, then localStorage) - Combined logic
    const savedStateKey = interviewInfo?.email
      ? `interview_state_${interview_id}_${interviewInfo.email}`
      : `interview_state_${interview_id}`;

    // Legacy fallback attempt
    const legacySavedState = typeof window !== 'undefined' ? localStorage.getItem(`interview_state_${interview_id}`) : null;
    let savedState = typeof window !== 'undefined' ? localStorage.getItem(savedStateKey) : null;

    // If no scoped state found, check legacy (but only if we don't have email-specific expectations that differ)
    if (!savedState && legacySavedState) {
      savedState = legacySavedState;
    }
    const dispName = sanitizeName(interviewInfo?.candidate_name);

    let initialMsg = `Hi ${dispName}, how are you? Ready for your interview on ${interviewInfo?.job_position || 'this role'}?`;

    // Initialize transcript from DB state if available
    let transcriptToUse = [...previousTranscript];

    // If DB state is empty/missing, try localStorage backup
    if (transcriptToUse.length === 0 && savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        if (parsedState?.transcript && Array.isArray(parsedState.transcript)) {
          const lsTranscript = parsedState.transcript;
          if (lsTranscript.length > 0) {
            transcriptToUse = lsTranscript;
            initialMsg = "Connection restored. Let's continue from where we left off.";
            isRestoredRef.current = true;
            // Also update DB state so we don't depend on LS forever
            saveProgress(lsTranscript);
          }
        }
      } catch (e) {
        logger.error("Failed to parse saved state", e);
      }
    } else if (transcriptToUse.length > 0) {
      isRestoredRef.current = true;
      initialMsg = "Connection restored. Let's continue from where we left off.";
    }

    // Format questions for better readability
    const formattedQuestions = question_list.map((q, i) => `${i + 1}. ${q}`).join('\n');

    // Sanitize and truncate job description
    const cleanJobDescription = (interviewInfo?.job_description || '')
      .replace(/`/g, "'") // Replace backticks to prevent any template literal unexpected behavior (though unlikely)
      .substring(0, 2000); // Limit length

    // Check for Coding Question
    const hasCodingQuestion = !!interviewInfo?.question_list?.codingQuestion;

    const messages = [
      {
        role: 'system',
        content: `
You are an AI voice assistant conducting interviews for the ${interviewInfo?.job_position} role.
Job Description: ${cleanJobDescription}

Your job is to ask candidates provided interview questions and assess their responses.
Begin the conversation with a friendly introduction, setting a relaxed yet professional tone. Example:
"Hey ${dispName}! Welcome to your ${interviewInfo?.job_position || 'interview'}. Let's get started with a few questions!"

Ask the questions from the list below one by one.
Questions:
${formattedQuestions}

Instructions:
1. Ask the next question in the list.
2. Wait for the candidate's answer.
3. Listen to the candidate's answer. If the answer is brief, vague, or lacks specific details related to the Job Description, ask ONE relevant follow-up question.
4. If the answer is sufficient, proceed to the next question.
5. Provide brief, encouraging feedback (e.g., "That's great", "Interesting approach").

CRITICAL: You MUST ask ALL ${question_list.length} questions in the list.
- Do NOT skip any questions.
- Do NOT end the interview until all ${question_list.length} questions have been asked and answered.
- Do NOT say "That concludes the interview" until the very end.

After all questions are answered, wrap up the interview smoothly.
${hasCodingQuestion
            ? `Since there is a coding part next, say EXACTLY this phrase to conclude: "That concludes the verbal part. Let's move to the coding question."`
            : `End on a pleasant note: "Thank you for your time! We'll be in touch."`
          }

Key Guidelines:
✅ Be friendly, engaging, and witty 🎤
✅ Keep responses short and natural
✅ Adapt based on the candidate's confidence level
`.trim(),
      },

      // Inject previous conversation history
      ...transcriptToUse.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    ];

    const assistantOptions = {
      name: 'AI Recruiter',
      firstMessage: initialMsg,
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: 'en-US',
        // Improve accuracy for technical terms
        keywords: [
          'React', 'Nextjs', 'Nodejs', 'JavaScript', 'TypeScript', 'Tailwind',
          'Supabase', 'PostgreSQL', 'API', 'Redux', 'Context', 'Hook', 'Component',
          'Frontend', 'Backend', 'Fullstack', 'Vercel', 'Git', 'GitHub', 'SQL',
          'NoSQL', 'MongoDB', 'AWS', 'Docker', 'Kubernetes', 'CICD', 'Testing',
          'Jest', 'Cypress', 'Playwright', 'Agile', 'Scrum', 'Jira', 'Figma',
          'Java', 'Python', 'HTML', 'CSS', 'Bootstrap', 'MaterialUI',
          'Angular', 'Vuejs', 'Expressjs', 'Redis', 'Django', 'Flask', 'SpringBoot'
        ],
      },
      voice: {
        provider: 'azure',
        voiceId: 'en-US-SaraNeural',
      },
      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: messages,
      },
      // Debug config
      metadata: {
        interview_id: interview_id,
        user_email: interviewInfo?.email
      }
    };

    logger.log('STARTING VAPI CALL WITH OPTIONS:', JSON.stringify(assistantOptions, null, 2));

    try {
      await vapi.start(assistantOptions);
    } catch (err) {
      logger.error('Failed to start Vapi call (Detailed):', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      if (err?.message) logger.error('Vapi Start Error Message:', err.message);
      toast.error('Failed to start interview. Please check your microphone permissions.');
      setStart(false);
    }
  };

  useEffect(() => {
    logger.log('interviewInfo:', interviewInfo);
    if (interviewInfo && interviewInfo?.job_position && vapi && !start && !loadingResume) {

      // ✅ INITIALIZE SESSION FIRST (BEFORE startCall)
      const initializeSession = async () => {
        if (interview_id && interviewInfo.email) {
          try {
            logger.log('🔧 Initializing/Restoring session in interview_sessions...');
            // Don't pass job_position - it's not a column in interview_sessions table
            await interviewStorage.createOrRestoreSession(interview_id, interviewInfo.email, {});

            // ✅ CLAIM SESSION: Lock this client/tab as the master
            if (clientIdRef.current) {
              const normalizedEmail = interviewInfo.email?.toLowerCase().trim();
              logger.log('🔐 Claiming session lock for client:', clientIdRef.current);

              const claimResult = await interviewStorage.claimSession(interview_id, normalizedEmail, clientIdRef.current);

              // Check if there's a conflict
              if (claimResult.conflict) {
                logger.error('❌ SESSION CONFLICT: Another device is using this interview');
                handleEjection('This interview is currently active on another device. Please close the other session first.');
                return; // BLOCK ENTRY
              }

              if (!claimResult.success) {
                logger.error('❌ Failed to claim session:', claimResult.error);
                toast.error('Failed to initialize session. Please try again.');
                return;
              }

              logger.log('✅ Session claimed successfully');
            }

            logger.log('✅ Session initialized successfully');
          } catch (e) {
            logger.error('❌ Hybrid session init failed', e);
          }
        }

        // THEN start the interview
        setStart(true);
        startCall();
      };

      initializeSession();
    }
  }, [interviewInfo, vapi, start, loadingResume, showGate]);

  // SILENCE DETECTION LOGIC (Option 2 - Strict 25s/45s Rule)
  useEffect(() => {
    if (!start || !vapi || isGeneratingFeedback) return;

    const CHECK_INTERVAL_MS = 1000;
    const SILENCE_WARNING_THRESHOLD_MS = 20000; // 25s
    const SILENCE_TIMEOUT_THRESHOLD_MS = 40000; // 45s (20s + 20s)

    silenceCheckIntervalRef.current = setInterval(() => {
      // If AI is speaking or user is speaking, reset timer essentially (by ignoring checks)
      // Actually, we only reset tracking when USER speaks.
      // But we should pause tracking while AI is speaking so we don't punish listening.
      if (isSpeaking) {
        lastSpeechTimeRef.current = Date.now();
        if (silenceWarningShownRef.current) {
          toast.dismiss('silence-warning');
          silenceWarningShownRef.current = false;
        }
        return;
      }

      const timeSinceSpeech = Date.now() - lastSpeechTimeRef.current;

      // 1. Warning Phase (25s)
      if (timeSinceSpeech > SILENCE_WARNING_THRESHOLD_MS && !silenceWarningShownRef.current) {
        silenceWarningShownRef.current = true;
        toast.warning("Are you still there? Interview will end in 20s.", {
          id: 'silence-warning',
          duration: 20000,
          action: {
            label: "I'm here",
            onClick: () => {
              lastSpeechTimeRef.current = Date.now();
              silenceWarningShownRef.current = false;
              toast.dismiss('silence-warning');
            }
          }
        });
      }

      // 2. Timeout Phase (45s)
      if (timeSinceSpeech > SILENCE_TIMEOUT_THRESHOLD_MS) {
        logger.log("🚨 Silence timeout triggered (45s). Auto-submitting...");
        clearInterval(silenceCheckIntervalRef.current);
        toast.dismiss('silence-warning');

        // Final notification before flush
        toast.error("Session timed out due to inactivity.", { duration: 5000 });

        if (!isGeneratingFeedbackRef.current) {
          setIsGeneratingFeedback(true);
          isGeneratingFeedbackRef.current = true;

          // Stop Vapi explicitly
          if (vapi) {
            try { vapi.stop(); } catch (e) { }
          }

          GenerateFeedback(true);
        }
      }

    }, CHECK_INTERVAL_MS);

    return () => {
      if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
    };
  }, [start, vapi, isSpeaking, isGeneratingFeedback]);

  useEffect(() => {
    if (!vapi) return;
    // Set up event listeners for Vapi events
    const handleMessage = (message) => {
      // Handle transcription/conversation updates
      if (message?.type === 'conversation-update' || message?.conversation) {
        const conversationList = message.conversation;
        if (Array.isArray(conversationList) && conversationList.length > 0) {
          // Get the last message to show as live subtitle if it's from assistant
          const lastMsg = conversationList[conversationList.length - 1];
          // Update transcript logic: Show assistant's last message
          if (lastMsg.role === 'assistant') {
            setSubtitles(lastMsg.content);

            const content = lastMsg.content.toLowerCase();

            // Check for transition to coding
            const codingTransitionPhrases = [
              "move to the coding question",
              "coding challenge",
              "coding part",
              "coding interview",
              "coding round"
            ];

            const isCodingTransition = codingTransitionPhrases.some(phrase => content.includes(phrase));

            if (isCodingTransition) {
              logger.log("👨‍💻 TRIGGERING CODING TRANSITION");
              toast.success("Moving to Coding Round...");

              // Stop Vapi
              if (vapi) vapi.stop();

              // Redirect to Coding Page
              setTimeout(() => {
                router.push(`/interview/${interview_id}/coding`);
              }, 3000); // Wait for audio to finish slightly
              return;
            }

            // Check for farewell logic (Normal completion)
            // Check for farewell logic (Normal completion)
            // FIX: Only trigger farewell/countdown if there is NO coding question.
            // If there is a coding question, the 'Transition' logic above handles 'That concludes...'
            const hasCodingQuestion = !!interviewInfoRef.current?.question_list?.codingQuestion;

            if (!hasCodingQuestion) {
              const farewellPhrases = [
                'thanks for chatting',
                'thank you for your time',
                // 'that concludes', // Too risky if used in "that concludes the first part"
                'interview is complete',
                'good luck with the rest of your day',
                // 'best of luck', // Can be used casually
                "we'll be in touch",
                'hope to see you soon',
                // 'that was great', // REMOVED: Common positive reinforcement
                'end of the interview',
                'wrapping up now',
              ];
              const isEnding = farewellPhrases.some((phrase) =>
                content.includes(phrase)
              );

              if (isEnding && !showEndCountdown) {
                logger.log("⚠️ TRIGGERING END COUNTDOWN");
                setShowEndCountdown(true);
                setCountdown(10); // Reduced from 30 to 10 for faster auto-completion
              }
            }
          }

          // --- TIMESTAMP LOGIC START ---
          // Merge Vapi conversation with our local timestamped transcript
          // We assume Vapi appends messages. We match by index to preserve existing timestamps.
          const currentTranscript = transcriptRef.current;
          const newTranscript = conversationList.map((msg, index) => {
            // If we already have this message (by index) and content matches, keep our version (with timestamp)
            // We check content match loosely in case of partial updates, but index is primary for order.
            const existing = currentTranscript[index];
            if (existing && existing.role === msg.role) {
              // If content changed significantly, maybe update? But Vapi usually streams.
              // We'll keep the original timestamp if it exists.
              return {
                ...msg,
                timestamp: existing.timestamp || new Date().toISOString()
              };
            }
            // New message
            return {
              ...msg,
              timestamp: new Date().toISOString()
            };
          });
          transcriptRef.current = newTranscript;
          // --- TIMESTAMP LOGIC END ---
        }

        // Store full conversation for feedback
        // Use our ENRICHED transcriptRef which has the timestamps
        const filteredConversation =
          transcriptRef.current.filter((msg) => msg.role !== 'system') || '';
        conversation.current = JSON.stringify(filteredConversation, null, 2);

        // Save to DB (Real-time sync) - Using saveProgress from first code
        if (filteredConversation.length > 0) {
          saveProgress(filteredConversation);
        }

        // PERSIST STATE: Save transcript to localStorage
        const transcriptToSave = transcriptRef.current.filter(msg =>
          msg.role === 'user' || msg.role === 'assistant'
        );

        if (transcriptToSave.length > 0) {
          localStorage.setItem(
            `interview_state_${interview_id}`,
            JSON.stringify({
              transcript: transcriptToSave,
              lastUpdated: new Date().toISOString()
            })
          );
        }
      }
    };

    const handleSpeechStart = () => {
      // FIX 2: ACTIVE-SPEECH DEACTIVATION
      if (isGeneratingFeedback || isRedirectingRef.current) return;

      setIsSpeaking(true);
      setActiveUser(false);
    };

    const handleSpeechEnd = () => {
      setIsSpeaking(false);
      setActiveUser(true);
      // Reset silence timer on user speech end
      lastSpeechTimeRef.current = Date.now();
      if (silenceWarningShownRef.current) {
        toast.dismiss('silence-warning');
        silenceWarningShownRef.current = false;
      }
    };

    vapi.on('message', (message) => {
      // 1. SILENCE RESET: Reset timer on ANY transcript activity (User or AI)
      if (message?.type === 'transcript') {
        lastSpeechTimeRef.current = Date.now();
        if (silenceWarningShownRef.current) {
          toast.dismiss('silence-warning');
          silenceWarningShownRef.current = false;
        }
      }

      // 2. Handle Conversation Updates
      handleMessage(message);
    });

    vapi.on('call-start', () => {
      callStartTimeRef.current = Date.now();
      lastSpeechTimeRef.current = Date.now(); // Start tracking silence
      // Restore Logic: Check Ref
      // Only show "Restored" if we actually pulled data from DB/Local storage AND it's not a fresh start
      if (isRestoredRef.current && (previousTranscript.length > 0 || localStorage.getItem('interview_state_' + interview_id))) {
        toast.info('Interview session restored', { id: 'call-status' });
      } else {
        toast('Interview started...', { id: 'call-status' });
      }
      setStart(true);
      retryCountRef.current = 0; // Reset retries on successful connection
    });
    vapi.on('speech-start', handleSpeechStart);
    vapi.on('speech-end', handleSpeechEnd);
    vapi.on('error', (e) => {
      // Ignore empty errors
      if (!e || (typeof e === 'object' && Object.keys(e).length === 0)) {
        return;
      }

      // Only log unexpected errors
      const safeMsg = e?.message || e?.error || (typeof e === 'string' ? e : JSON.stringify(e));
      const msg = String(safeMsg || '');

      // Ignore empty object errors {}
      if (msg === '{}' || msg === 'undefined' || msg === 'null' || msg === '') return;

      if (msg && !msg.includes('Meeting has ended') && !msg.includes('ejection')) {
        logger.error('Vapi Error Event:', e);
      }

      const rawErrorMsg = e?.message || e?.error || (typeof e === 'string' ? e : JSON.stringify(e));
      const errorMsg = String(rawErrorMsg || '');

      // Handle "Meeting has ended" as a graceful shutdown trigger, or soft pause
      if (errorMsg.includes('Meeting has ended') || errorMsg.includes('ejection')) {
        // SUPPRESSION: Do NOT log as error to console/UI
        // logger.error('Vapi Error Event:', e); // <--- Removed to stop red console noise

        const duration = callStartTimeRef.current ? Date.now() - callStartTimeRef.current : 0;

        // EARLY EJECTION GUARD (< 10 seconds)
        if (duration < 10000 && !isGeneratingFeedbackRef.current) {
          logger.warn(`Early ejection detected (${duration}ms). Treating as connection retry.`);
          toast.error("Connection unstable. Please refresh to try again.", { duration: 5000 });
          setStart(false);
          return;
        }

        // SOFT PAUSE logic with AUTO-RETRY
        if (!isGeneratingFeedbackRef.current) {
          // Check retry count
          if (retryCountRef.current < 3) {
            retryCountRef.current += 1;
            logger.warn(`Vapi disconnected (ejection). Auto-retrying (${retryCountRef.current}/3)...`);

            // CLEANUP: Dismiss any silence warning immediately to avoid confusion
            if (silenceWarningShownRef.current) {
              toast.dismiss('silence-warning');
              silenceWarningShownRef.current = false;
            }
            // Dismiss persistent error toasts too
            toast.dismiss('vapi-retry');

            toast(`Connection refreshed. (${retryCountRef.current})`, { id: 'vapi-retry' });
            setStart(false);
            return;
          }

          // Exceeded retries -> Show Gate
          logger.warn("Vapi disconnected (ejection). Pausing session for Resume.");
          toast.warning("Connection lost due to silence. Click 'Resume Session' to continue.", { duration: 6000 });
          setStart(false);
          setShowGate(true); // Lock gate to allow clean resume
        }
        return;
      }

      // For other actual errors, show the error state
      if (errorMsg) {
        setErrorDetails(e);
        if (!isGeneratingFeedbackRef.current) {
          // If a real error occurs, we still try to generate feedback but might keep user on page to see error
          setIsGeneratingFeedback(true);
          isGeneratingFeedbackRef.current = true;
          GenerateFeedback(false);
        }
      }
    });

    // NOTE: call-end might fire after error, so we need to be careful not to double-generate or redirect if error exists
    vapi.on('call-end', () => {
      setVapiCallActive(false); // Mark VAPI call as inactive

      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }

      // Coding Transition Guard
      if (isTransitioningToCodingRef.current) {
        logger.log("Call ended during coding transition. Ignoring feedback generation.");
        return;
      }

      // If we already set start=false (Soft Pause from Error Handler), DO NOT complete.
      // This is the critical fix for the "Loophole" where error handler paused but call-end completed.
      if (!start) {
        logger.log("Call ended while in paused/stopped state. Ignoring auto-completion.");
        return;
      }

      // MINIMUM DURATION GUARD: Prevent immediate exits (UNLESS manual exit)
      const duration = callStartTimeRef.current ? Date.now() - callStartTimeRef.current : 0;
      if (duration < 4000 && !isGeneratingFeedbackRef.current) { // 4 seconds threshold, ignored if manual exit
        logger.warn(`Call ended too quickly (${duration}ms). Treating as connection error.`);
        toast.error("Connection lost. Please try again.");
        setStart(false);
        callStartTimeRef.current = null;
        return; // aborted
      }

      if (!isGeneratingFeedbackRef.current) {
        toast('Call has ended. Generating feedback...', { id: 'feedback-status' });
        setIsGeneratingFeedback(true);
        isGeneratingFeedbackRef.current = true;
        // Only redirect if no critical error is pending
        GenerateFeedback(true);
      }
    });

    return () => {
      vapi.off('message', handleMessage);
      vapi.off('call-start', () => { });
      vapi.off('speech-start', handleSpeechStart);
      vapi.off('speech-end', handleSpeechEnd);
      vapi.off('error', () => { });
      vapi.off('call-end', () => { });
      try {
        vapi.stop().catch(() => { });
      } catch (e) {
        // Ignore stop errors on unmount
      }
    };
    // CRITICAL: Removed activeTab, codingTabUnlocked, codingSubmitted, showEndCountdown from dependencies
    // These changes were causing the effect to cleanup (vapi.stop()) intermediate interview
    // We now use Refs inside the handlers to access fresh state without re-running the effect
  }, [vapi, interview_id]);

  // Countdown timer effect for auto-disconnect
  useEffect(() => {
    if (showEndCountdown && countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            vapi.stop();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
        }
      };
    }
  }, [showEndCountdown, vapi]);

  // State for coding transition
  const isTransitioningToCodingRef = useRef(false);

  const handleCodingTransition = async () => {
    if (isTransitioningToCodingRef.current) return;
    isTransitioningToCodingRef.current = true;

    logger.log("Initiating transition to Coding Phase...");
    toast.info("Moving to Coding Round...");

    // 1. Announce Transition (if VAPI is active)
    if (vapi && vapiCallActive) {
      try {
        // We don't wait for this strictly, but try to say it
        vapi.say("Now let’s move to the coding round. You will have some time to solve a challenge. Best of luck!");
        // Short delay to let it start speaking before cut off?
        // Vapi.say might be async or queued.
        // But we need to stop the session.
        // Maybe just let the UI handle the "moving" message.
      } catch (e) {
        logger.warn("Failed to announce transition", e);
      }
    }

    // 2. Save Transcript (Partial Save)
    try {
      const transcriptToSave = {
        transcript: transcriptRef.current, // Conversations so far
        is_voice_completed: true // Flag that voice part is done
      };

      const normalizedEmail = interviewInfoRef.current?.email?.toLowerCase().trim();
      if (dbRecordIdRef.current) {
        await supabase
          .from(DB_TABLES.INTERVIEW_RESULTS)
          .update({ conversation_transcript: transcriptToSave })
          .eq('id', dbRecordIdRef.current);
      } else {
        // If no record exists yet (rare), create one
        const { data } = await supabase
          .from(DB_TABLES.INTERVIEW_RESULTS)
          .insert([{
            fullname: interviewInfoRef.current?.candidate_name || 'Candidate',
            email: normalizedEmail,
            interview_id: interview_id,
            conversation_transcript: transcriptToSave,
            recommendations: 'Pending Coding',
          }])
          .select();
        if (data && data[0]) dbRecordIdRef.current = data[0].id;
      }
    } catch (err) {
      logger.error("Error saving transcript during transition:", err);
      // Continue anyway
    }

    // 3. Stop VAPI
    if (vapi) {
      try {
        await vapi.stop();
      } catch (e) { }
    }

    // 4. Redirect
    router.push(`/interview/${interview_id}/coding`);
  };

  const stopInterview = async (isViolation = false) => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }

    if (!isViolation) {
      // Check for Coding Phase
      const hasCoding = interviewInfoRef.current?.question_list?.codingQuestion;

      // Only go to coding if NOT a violation ending
      if (hasCoding) {
        await handleCodingTransition();
        return;
      }
    }

    // Explicitly set generating feedback state immediately to prevent user confusion
    if (!isGeneratingFeedbackRef.current) {
      setIsGeneratingFeedback(true);
      isGeneratingFeedbackRef.current = true;
      if (vapi) {
        // Safely stop vapi and ignore potential "ejection" errors
        vapi.stop().catch(e => logger.warn("Vapi stop error (ignored):", e));

        // Fallback: If 'call-end' event doesn't fire within 2 seconds, force generate feedback
        setTimeout(() => {
          // Check if we are still on this page (and not redirected yet)
          // Also check if we have an error; if so, don't auto-redirect
          if (typeof window !== 'undefined' && !window.location.href.includes('/completed') && !errorDetails) {
            logger.warn("Vapi call-end timeout, forcing feedback generation");
            GenerateFeedback(true);
          }
        }, 2500);
      } else {
        // If vapi is null for some reason, just end.
        GenerateFeedback(true);
      }
    }
  };

  const handleMicToggle = useCallback((isMuted) => {
    if (vapi) {
      logger.log('Toggling Vapi mute state:', isMuted);
      vapi.setMuted(isMuted);
    }
  }, [vapi]);

  const GenerateFeedback = async (shouldRedirect = true) => {
    // 1. Force Redirect Safety Hatch (EXTENDED to 60s)
    const safetyTimeout = setTimeout(() => {
      if (shouldRedirect && !errorDetails && !isRedirectingRef.current) {
        logger.warn("Feedback generation timed out. Forcing redirect...");
        finalizeInterview('timeout'); // Use centralized logic
      }
    }, 60000); // 60s to ensure LLM has time

    const info = interviewInfoRef.current;
    const normalizedEmail = info?.email?.toLowerCase().trim();

    // 2. Clear UI Clutter & Set Persistence
    if (typeof window !== 'undefined' && normalizedEmail) {
      localStorage.setItem(`is_processing_feedback_${interview_id}_${normalizedEmail}`, 'true');
      setIsGeneratingFeedback(true);
      isGeneratingFeedbackRef.current = true;
    }

    if (silenceCheckIntervalRef.current) clearInterval(silenceCheckIntervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    toast.dismiss(); // Clear all toasts
    silenceWarningShownRef.current = false;

    try {
      // ✅ STEP: Call centralized finalizer API with FULLNAME
      // This is background-safe and idempotent
      const finalTranscript = transcriptRef.current || [];

      const response = await axios.post('/api/interview/finalize', {
        interview_id,
        email: normalizedEmail,
        fullname: info?.candidate_name || userProfile.name, // ✅ RESTORE NAME PERSISTENCE
        transcript: finalTranscript,
        reason: 'completion'
      });

      if (response.data.success) {
        logger.log('✅ interview_results updated with feedback (Atomic API call successful)');
        // Set local flag to prevent render but wait for UI to finish before redirect
        if (typeof window !== 'undefined' && normalizedEmail) {
          localStorage.setItem(`is_completed_${interview_id}_${normalizedEmail}`, 'true');
        }
      }

      toast.success('Feedback processing started.', { id: 'feedback-status' });

      // Stop Media
      try {
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach(video => {
          if (video.srcObject) {
            const stream = video.srcObject;
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
          }
        });
      } catch (e) { }

      clearTimeout(safetyTimeout);

      // ❗ FLOW RESTORATION: DO NOT REDIRECT YET
      // We let the FeedbackGeneratorOverlay UI finish its steps first.
      // logger.log("Evaluation UI phase started. Waiting for steps to complete...");
    } catch (error) {
      logger.error('Feedback generation failed:', error);
      toast.error('Processing finalized. Redirecting...');

      if (shouldRedirect && !errorDetails) {
        // Fallback via centralized finalizer
        finalizeInterview('error_fallback');
      }
    } finally {
      if (errorDetails) {
        setIsGeneratingFeedback(false);
        isGeneratingFeedbackRef.current = false;
      }
    }
  };


  if (isChecking || loadingResume || isRedirecting) {
    return <div className="fixed inset-0 bg-white z-[60] flex items-center justify-center"><Loader2 className="w-8 h-8 text-violet-600 animate-spin" /></div>;
  }

  // FIX 3: PRE-REDIRECT INTERVIEW MOUNT BLOCK
  // If completion is flagged in storage, block render immediately to prevent "Fractional Return"
  if (typeof window !== 'undefined' && localStorage.getItem(`is_completed_${interview_id}_${interviewInfo?.email?.toLowerCase().trim()}`) === 'true') {
    return <div className="fixed inset-0 bg-white z-[60] flex items-center justify-center"><Loader2 className="w-8 h-8 text-violet-600 animate-spin" /></div>;
  }

  if (isCompletedSync) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50">
        <div className="text-center space-y-4 animate-in fade-in duration-300">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Interview Already Completed</h2>
          <p className="text-gray-500">Redirecting to summary...</p>
        </div>
      </div>
    );
  }

  if (loadingResume || isRedirecting) {
    return (
      <div className="flex h-screen items-center justify-center bg-white z-50">
        <Loader2 className="w-10 h-10 text-violet-600 animate-spin" />
      </div>
    );
  }




  const handleGateUnlock = () => {
    // 1. Arm Guard IMMEDIATELY (Interaction is guaranteed by click)
    window.history.pushState(null, null, window.location.href);

    // 2. Lift Gate
    setShowGate(false);

    // 3. Ensure Vapi connects if it hasn't already (optional retry)
    if (!start && interviewInfo) {
      setStart(true);
    }
  };

  // --- LOCKED OUT UI ---
  if (isLockedOut) {
    return (
      <div className="fixed inset-0 bg-white/95 backdrop-blur-md z-[9999] flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-red-100 p-8 transform animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Phone className="w-10 h-10 text-red-500 rotate-12" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Session Disconnected</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            {lockedOutReason || "This interview session has been accessed from another device or window."}
            <br /><br />
            To ensure the integrity of the interview, concurrent access is not allowed.
            If this was you, please return to the active tab to continue.
          </p>
          <div className="space-y-4">
            <button
              onClick={() => {
                alert('Please manually close this tab or window using the X button on your browser tab.');
              }}
              className="w-full bg-gray-900 text-white font-semibold py-3 px-6 rounded-xl hover:bg-black transition-all shadow-lg active:scale-95"
            >
              Close This Window
            </button>
            <p className="text-xs text-gray-400">
              Need help? Contact support if you believe this is an error.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* GATEKEEPER OVERLAY (Prevents Peeking on Refresh) */}
      {showGate && !isGeneratingFeedback && !isCompletedSync && (
        <div className="fixed inset-0 z-[70] bg-white/60 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full border border-violet-100 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Video className="w-8 h-8 text-violet-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Resume Interview</h2>
            <p className="text-gray-500 mb-8">
              Click below to continue your session. Your camera and microphone will be reactivated.
            </p>
            <button
              onClick={handleGateUnlock}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-lg shadow-lg hover:shadow-violet-500/25 active:scale-[0.98] transition-all"
            >
              Resume Session
            </button>
          </div>
        </div>
      )}

      <div className={`fixed inset-0 flex flex-col bg-gradient-to-br from-slate-100 via-white to-violet-50 overflow-hidden transition-all duration-500 ${showGate ? 'blur-md scale-[0.99] pointer-events-none' : ''}`}>
        <AntiCheatingMonitor
          interviewId={interview_id}
          email={interviewInfo?.email}
          candidateName={interviewInfo?.candidate_name}
          isCompleted={isGeneratingFeedback} // Pass completion state to gate logic
          onViolationLimitReached={() => {
            if (!isGeneratingFeedbackRef.current) {
              stopInterview(true);
            }
          }}
          onRecordCreated={(newId) => {
            if (!dbRecordId) {
              setDbRecordId(newId);
            }
          }}
        />

        {/* HEADER */}
        <div className="flex justify-between items-center px-4 py-2 bg-white border-b shadow-sm flex-none">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center shadow-sm">
              <Video className="w-4 h-4 text-violet-700" />
            </div>

            <div>
              <h1 className="text-sm font-bold text-gray-900">
                {interviewInfo?.job_position || "AI Interview"}
              </h1>
              <p className="text-xs text-gray-500">Live Session</p>
            </div>
          </div>

          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs shadow-sm
          ${start ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-700"}`}>
            <span className={`w-2 h-2 rounded-full
            ${start ? "bg-emerald-600 animate-pulse" : "bg-gray-600"}`} />
            {start ? "Active" : "Connecting"}
          </div>
        </div>

        {/* MAIN */}
        <div className="flex-1 flex gap-3 p-3 min-h-0 overflow-hidden">

          {/* LEFT PANEL - 30% */}
          <div className="w-[30%] flex flex-col gap-3 min-w-0 overflow-hidden">

            {/* Status and Timer */}
            <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm flex-none">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${start ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}
                  ></div>
                  <span className="text-sm font-semibold text-gray-700">
                    {start ? 'Interview in Progress' : 'Connecting...'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 bg-violet-50 px-3 py-2 rounded-lg">
                <Timer className="w-4 h-4 text-violet-600" />
                <span className="font-mono text-base font-bold text-gray-800">
                  {interviewInfo ? (
                    <TimmerComponent
                      start={start}
                      duration={interviewInfo?.duration}
                      interviewId={interview_id}
                      candidateEmail={interviewInfo?.email}
                      onTimeExpire={() => {
                        logger.log("Timer expired, stopping interview");
                        stopInterview(false);
                      }}
                      showWarnings={!interviewInfo?.question_list?.codingQuestion}
                    />
                  ) : (
                    <span className="text-gray-400">--:--</span>
                  )}
                </span>
              </div>
            </div>

            {/* Live Transcription */}
            <div className="flex-1 bg-white/80 backdrop-blur-sm rounded-2xl p-4 shadow-lg border border-violet-100/50 flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-2 border-b border-gray-100 pb-2">
                <h3 className="text-xs font-medium text-violet-700">Live Transcript</h3>
              </div>

              <div className="flex-1 min-h-0 bg-gray-50/50 rounded-xl p-3 border border-gray-100 mb-3 overflow-y-auto custom-scrollbar">
                <div className="h-full flex flex-col justify-center">
                  {subtitles ? (
                    <p className="text-center text-gray-800 text-sm md:text-base leading-relaxed font-medium animate-fadeIn px-4">
                      &ldquo;{subtitles}&rdquo;
                    </p>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 text-gray-400">
                      <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-violet-400 animate-spin"></div>
                      <p className="italic text-xs">Listening...</p>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Speaking Indicator and End Interview Button */}
              <div className="flex flex-col gap-3">
                {/* AI Speaking Indicator */}
                <div className="flex justify-center">
                  {isSpeaking ? (
                    <span className="flex items-center gap-2 text-xs text-violet-600 font-medium px-3 py-1.5 bg-violet-50 rounded-full border border-violet-100">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500"></span>
                      </span>
                      AI is speaking
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 px-3 py-1.5">
                      Listening...
                    </span>
                  )}
                </div>

                {/* End Interview Button */}
                <AlertConfirmation stopInterview={stopInterview}>
                  <button
                    className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-500 text-white hover:from-rose-600 hover:to-red-600 shadow-lg shadow-rose-500/25 transition-all duration-300 flex items-center justify-center gap-2 hover:-translate-y-0.5 font-medium text-sm"
                    aria-label="End call"
                  >
                    <Phone size={16} className="rotate-135" />
                    <span>End Interview</span>
                  </button>
                </AlertConfirmation>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL - 70% - Candidate Video */}
          < div className="flex-1 rounded-2xl overflow-hidden shadow-lg border border-gray-100 relative bg-black/5 flex flex-col" >
            {/* Video Panel - Always Full View */}
            < DraggableCamera
              isFloating={false}
              className="absolute inset-0 z-0"
            >
              <div className={`w-full h-full relative bg-black group ${activeUser ? 'ring-4 ring-violet-100' : ''}`}>
                <VideoPanel
                  userName={userProfile.name}
                  isInterviewActive={start && !isGeneratingFeedback}
                  onMicToggle={handleMicToggle}
                  interviewId={interview_id}
                  onViolation={handleGazeViolation}
                  onCameraError={(error) => {
                    logger.error('Camera error:', error);
                    toast.error(error);
                  }}
                  onFaceNotDetected={() => {
                    logger.warn('Face not detected');
                  }}
                  onExitInterview={(reason) => {
                    logger.log('Exit interview:', reason);
                    toast.error(`Interview ended: ${reason}`);
                    stopInterview();
                  }}
                />
              </div>
            </DraggableCamera >
          </div >
        </div >

        {/* Auto-disconnect Countdown Banner */}
        {
          showEndCountdown && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 shadow-lg animate-fade-in max-w-md">
              <div className="flex items-center justify-center gap-4">
                <div className="p-2 rounded-full bg-amber-100">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div className="text-center">
                  <p className="text-amber-800 font-medium">
                    Interview is wrapping up. Auto-disconnecting in{' '}
                    <span className="font-bold text-amber-600">{countdown}s</span>
                  </p>
                  <p className="text-sm text-amber-600">
                    Click &quot;End Interview&quot; to finish now
                  </p>
                </div>
              </div>
            </div>
          )
        }

        {/* Exit Confirmation Modal - Improved from first code */}
        {
          showExitConfirmation && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white rounded-xl max-w-md w-full shadow-2xl overflow-hidden border border-amber-200">
                <div className="p-4 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-amber-900 border-none">Warning: Navigation Detected</h3>
                </div>

                <div className="p-6">
                  <p className="text-gray-800 font-medium mb-2">
                    {isGeneratingFeedback
                      ? 'Leave Processing?'
                      : 'Are you sure you want to leave?'}
                  </p>
                  <p className="text-gray-600 text-sm mb-6">
                    {isGeneratingFeedback
                      ? 'Your interview results are being processed. If you leave now, you can view them later from your dashboard.'
                      : 'Your interview progress will be lost if you leave this page. If you clicked "Back" accidentally, please click "Stay" to resume.'}
                  </p>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={handleExitCancel}
                      className="px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                    >
                      {isGeneratingFeedback ? 'Wait Here' : 'Stay in Interview'}
                    </button>
                    <button
                      onClick={isGeneratingFeedback ? undefined : handleExitConfirm}
                      disabled={isGeneratingFeedback}
                      className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors shadow-sm ${isGeneratingFeedback
                        ? 'bg-gray-400 cursor-not-allowed opacity-70'
                        : 'bg-red-600 hover:bg-red-700'
                        }`}
                    >
                      {isGeneratingFeedback ? 'Please wait...' : 'Yes, Leave & End'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        }

        {/* Error Details Modal */}
        {
          errorDetails && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white rounded-xl max-w-lg w-full shadow-2xl overflow-hidden border border-red-200">
                <div className="p-4 bg-red-50 border-b border-red-100 flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-red-900 border-none">Interview Error</h3>
                </div>

                <div className="p-6">
                  <p className="text-gray-700 mb-4">
                    The interview session encountered an unexpected error.
                  </p>

                  <div className="bg-slate-900 rounded-lg p-4 overflow-auto max-h-60 mb-6">
                    <pre className="text-xs text-red-400 font-mono whitespace-pre-wrap break-all">
                      {typeof errorDetails === 'string'
                        ? errorDetails
                        : JSON.stringify(errorDetails, null, 2)}
                    </pre>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                    >
                      Retry Interview
                    </button>
                    <button
                      onClick={() => {
                        localStorage.removeItem('interviewInfo');
                        window.location.href = '/interview/' + interviewInfo?.interview_id + '/completed';
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
                    >
                      Proceed to Results
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        }

        {
          isGeneratingFeedback && (
            <FeedbackGeneratorOverlay
              onComplete={() => {
                logger.log("Evaluation UI complete. Triggering final redirect.");
                finalizeInterview('completion');
              }}
            />
          )
        }
      </div >
    </>
  );
}

function FeedbackGeneratorOverlay({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  // Ref pattern to prevent effect re-runs on parent renders (Fixes "Stuck on Evaluation")
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const steps = [
    { label: "Uploading interview session data", duration: 1200 },
    { label: "Analyzing conversation transcript", duration: 1800 },
    { label: "Evaluated technical responses", duration: 2200 },
    { label: "Generating AI-driven insights", duration: 2000 },
    { label: "Finalizing performance report", duration: 1000 }
  ];

  useEffect(() => {
    let timeout;
    if (currentStep < steps.length) {
      timeout = setTimeout(() => {
        setCurrentStep((prev) => prev + 1);
      }, steps[currentStep].duration);
    } else if (currentStep === steps.length) {
      // All steps completed, wait a moment then signal completion via Ref
      timeout = setTimeout(() => {
        if (onCompleteRef.current) onCompleteRef.current();
      }, 500);
    }
    return () => clearTimeout(timeout);
  }, [currentStep, steps.length]); // Removed onComplete from dependency array

  // Calculate progress percentage for the bar
  const progress = Math.min(((currentStep) / steps.length) * 100, 100);

  return (
    <div className="fixed inset-0 bg-white/10 backdrop-blur-md flex items-center justify-center z-50 animate-in fade-in duration-500">
      {/* Dynamic Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-200/40 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-fuchsia-200/40 rounded-full blur-[100px] animate-pulse delay-1000" />
      </div>

      <div className="relative bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden transform transition-all duration-700 ring-1 ring-gray-200">

        {/* Decorative Top Line */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-violet-500 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-violet-50 mb-4 ring-1 ring-violet-200">
            <Video className="w-6 h-6 text-violet-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Interview Completed</h3>
          <p className="text-gray-500 text-sm mt-1">Please wait while we process your results</p>
        </div>

        {/* Steps List - HIDDEN as per request */}
        <div className="space-y-4 px-2 hidden">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep;
            const isActive = index === currentStep;

            return (
              <div key={index} className={`flex items-center gap-3 transition-all duration-500 ${isActive || isCompleted ? 'opacity-100' : 'opacity-40'}`}>
                <div className="relative flex-none">
                  {isCompleted ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center border border-emerald-200 shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                  ) : isActive ? (
                    <div className="w-6 h-6 rounded-full border-2 border-violet-600 border-t-transparent animate-spin" />
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-gray-100" />
                  )}
                </div>
                <span className={`text-sm font-medium ${isActive ? 'text-violet-700' : isCompleted ? 'text-gray-700' : 'text-gray-400'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="mt-8 relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">
            Do not close this window
          </p>
        </div>
      </div>
    </div>
  );
}

export default StartInterview;
```


## File: app/interview/[interview_id]/coding/page.jsx
```javascript
'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/services/supabaseClient';
import { DB_TABLES } from '@/services/Constants';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, Timer, CheckCircle, AlertTriangle } from 'lucide-react';
import CodingConsole from './_components/CodingConsole';
import QuestionPanel from './_components/QuestionPanel';
import DraggableCamera from '../start/_components/DraggableCamera';
import VideoPanel from '../start/_components/VideoPanel';
import AntiCheatingMonitor from '../start/_components/AntiCheatingMonitor';
import { BOILERPLATES } from './_constants/boilerplates';
import interviewStorage from '@/lib/storage/interviewStorage';

export default function CodingPage() {
    const { interview_id } = useParams();
    const router = useRouter();

    // Data States
    const [loading, setLoading] = useState(true);
    const [interviewInfo, setInterviewInfo] = useState(null);
    const [codingQuestion, setCodingQuestion] = useState(null);

    // Coding States
    const [code, setCode] = useState('');
    const [language, setLanguage] = useState('javascript');
    const [codeMap, setCodeMap] = useState({}); // Stores code for each language
    const [output, setOutput] = useState('');
    const [outputStatus, setOutputStatus] = useState('idle'); // 'idle', 'pending', 'success', 'error'

    // Status States
    const [timeLeft, setTimeLeft] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRunning, setIsRunning] = useState(false);

    // Anti-Cheating State
    const [activeUser, setActiveUser] = useState(true);
    const [showWarning, setShowWarning] = useState(false);

    const timerRef = useRef(null);

    // Fetch Initial Data
    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data, error } = await supabase
                    .from(DB_TABLES.INTERVIEWS)
                    .select('*')
                    .eq('interview_id', interview_id)
                    .single();

                if (error) throw error;
                if (!data) throw new Error('Interview not found');

                setInterviewInfo(data);

                // Extract coding question
                const cQuestion = data.question_list?.codingQuestion;
                setCodingQuestion(cQuestion);

                // --- PERSISTENCE RESTORE START ---
                const storageKey = `coding_progress_${interview_id}`;
                const savedProgress = localStorage.getItem(storageKey);

                if (savedProgress) {
                    try {
                        const parsed = JSON.parse(savedProgress);
                        if (parsed.codeMap) setCodeMap(parsed.codeMap);
                        if (parsed.language) {
                            setLanguage(parsed.language);
                            setCode(parsed.codeMap?.[parsed.language] || BOILERPLATES[parsed.language]);
                        }
                        console.log("✅ Coding progress restored from storage");
                    } catch (e) {
                        console.error("Failed to parse saved coding progress", e);
                    }
                } else {
                    // Initialize Code with Boilerplate
                    const initialCode = BOILERPLATES['javascript'];
                    setCode(initialCode);
                    setCodeMap({ javascript: initialCode });
                }

                // --- TIMER RESTORE START ---
                // Try to load saved timer from interviewStorage
                const savedTimer = await interviewStorage.loadTimer(interview_id, data.email);

                if (savedTimer.start && !savedTimer.end) {
                    // Total duration in seconds
                    const totalDurSec = (parseInt(data.duration || '15') >= 60 ? 20 : parseInt(data.duration || '15') >= 45 ? 15 : parseInt(data.duration || '15') >= 30 ? 10 : 5) * 60;
                    const elapsed = Math.floor((Date.now() - savedTimer.start) / 1000);
                    const remaining = Math.max(0, totalDurSec - elapsed);
                    setTimeLeft(remaining);
                    console.log(`✅ Coding timer restored. Remaining: ${remaining}s`);
                } else {
                    const totalDuration = parseInt(data.duration || '15');
                    let codingDuration = 5;
                    if (totalDuration >= 60) codingDuration = 20;
                    else if (totalDuration >= 45) codingDuration = 15;
                    else if (totalDuration >= 30) codingDuration = 10;

                    const durationInSeconds = codingDuration * 60;
                    setTimeLeft(durationInSeconds);

                    // Initialize timer record
                    await interviewStorage.saveTimer(interview_id, {
                        start: Date.now()
                    }, { userEmail: data.email });
                }

            } catch (err) {
                console.error("Error fetching data:", err);
                toast.error("Failed to load interview data");
            } finally {
                setLoading(false);
            }
        };

        if (interview_id) fetchData();
    }, [interview_id]);

    // Periodically Save Progress
    useEffect(() => {
        if (!interview_id || loading) return;

        const saveInterval = setInterval(() => {
            const progress = {
                language,
                codeMap: {
                    ...codeMap,
                    [language]: code
                },
                lastUpdated: new Date().toISOString()
            };
            localStorage.setItem(`coding_progress_${interview_id}`, JSON.stringify(progress));
        }, 3000); // Save every 3 seconds

        return () => clearInterval(saveInterval);
    }, [interview_id, code, language, codeMap, loading]);

    // Handle Language Switching with Persistence
    const handleLanguageChange = (newLanguage) => {
        // 1. Save current code to map
        setCodeMap((prev) => ({
            ...prev,
            [language]: code
        }));

        // 2. Restore code for new language
        const savedCode = codeMap[newLanguage];
        if (savedCode) {
            setCode(savedCode);
        } else {
            // If no saved code, use boilerplate
            setCode(BOILERPLATES[newLanguage] || '');
        }

        // 3. Update language state
        setLanguage(newLanguage);
    };

    // Timer Logic
    useEffect(() => {
        if (loading || timeLeft <= 0) return;

        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    handleAutoSubmit();
                    return 0;
                }
                // Add warnings for coding round
                if (prev === 300) { // 5 minutes
                    toast.warning("5 minutes remaining. Please wrap up soon.");
                } else if (prev === 60) { // 1 minute
                    toast.warning("Urgent: Only 1 minute remaining!");
                }

                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [loading, timeLeft]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleAutoSubmit = () => {
        toast.warning("Time's up! Auto-submitting...");
        handleSubmit();
    };

    const handleRun = async () => {
        if (isRunning) return;
        setIsRunning(true);
        setOutputStatus('pending');
        setOutput('');

        try {
            // We use the new execute-code API (Simulation)
            const response = await axios.post('/api/execute-code', {
                code,
                language,
                question: codingQuestion
            });

            const { output: runOutput, status: runStatus, error } = response.data;

            if (error) {
                setOutput(error);
                setOutputStatus('error');
            } else {
                setOutput(runOutput || 'No output.');
                setOutputStatus(runStatus === 'error' ? 'error' : 'success');
            }
        } catch (error) {
            console.error("Run error:", error);
            const errorMessage = error.response?.data?.error || error.message || "Execution failed.";
            setOutput(errorMessage);
            setOutputStatus('error');
        } finally {
            setIsRunning(false);
        }
    };

    const handleSubmit = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        setOutputStatus('pending');

        try {
            const timeTaken = (parseInt(interviewInfo?.duration || '15') >= 60 ? 20 : parseInt(interviewInfo?.duration || '15') >= 45 ? 15 : parseInt(interviewInfo?.duration || '15') >= 30 ? 10 : 5) * 60 - timeLeft;

            let evaluation = { result: 'Pending', feedback: 'Evaluation pending...' };

            // 1. Evaluate
            toast.info("Submitting and evaluating...");
            try {
                const evalRes = await axios.post('/api/evaluate-code', {
                    code,
                    language,
                    question: codingQuestion
                });
                if (evalRes.data) evaluation = evalRes.data;

                // Show evaluation in output?
                setOutput(`Evaluation Result: ${evaluation.result}\n\nFeedback: ${evaluation.feedback}`);
                setOutputStatus(evaluation.result === 'Pass' ? 'success' : 'error');

            } catch (e) {
                console.error("Evaluation failed", e);
            }

            // 2. Save
            await supabase.from('coding_submissions').insert([{
                interview_id: interview_id,
                question_id: codingQuestion?.title || 'Unknown',
                language: language,
                code: code,
                time_taken: timeTaken,
                ai_result: evaluation.result || 'Pending',
                ai_feedback: evaluation.feedback,
                submitted_at: new Date().toISOString()
            }]);

            toast.success("Submitted successfully!");

            // 3. Mark Complete & Redirect
            // Wait a moment so user can see result? 
            // "Lock editor in read-only mode after submission" -> We redirect, so effectively locked.

            setTimeout(async () => {
                // Final Cleanup of coding progress
                localStorage.removeItem(`coding_progress_${interview_id}`);

                await supabase
                    .from(DB_TABLES.INTERVIEW_RESULTS)
                    .update({ status: 'completed' })
                    .eq('interview_id', interview_id);

                router.push(`/interview/${interview_id}/completed`);
            }, 2000);

        } catch (err) {
            console.error("Submit error:", err);
            toast.error("Submission failed.");
            setIsSubmitting(false); // Only reset if failed
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
                <span className="ml-2 text-gray-500 font-medium">Loading Environment...</span>
            </div>
        );
    }

    if (!codingQuestion) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-gray-50 p-4 text-center">
                <div className="rounded-full bg-amber-100 p-3 mb-4">
                    <AlertTriangle className="h-8 w-8 text-amber-600" />
                </div>
                <h1 className="text-xl font-bold text-gray-900">No Coding Question Found</h1>
                <Button className="mt-6" onClick={() => router.push(`/interview/${interview_id}/completed`)}>
                    Complete Interview
                </Button>
            </div>
        );
    }



    // ... (existing code) ...

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
            {/* Monitor */}
            {/* Monitor */}
            <AntiCheatingMonitor
                interviewId={interview_id}
                email={interviewInfo?.email}
                candidateName={interviewInfo?.candidate_name}
                onViolationLimitReached={() => {
                    toast.error("Violation limit reached. Submitting interview...");
                    handleAutoSubmit();
                }}
                onVisibilityChange={(isVisible) => setActiveUser(isVisible)}
                onWarning={(isWarn) => setShowWarning(isWarn)}
                isCompleted={interviewInfo?.status === 'completed' || isSubmitting}
                isInteractionActive={false} // Coding phase doesn't have verbal interaction active in the same way
            />

            {/* Split Layout */}
            {/* Left Panel: Question - 40% */}
            <div className="w-[40%] h-full min-w-[350px]">
                <QuestionPanel
                    question={codingQuestion}
                    timeLeft={timeLeft}
                    formatTime={formatTime}
                />
            </div>

            {/* Right Panel: Console - 60% */}
            <div className={`flex-1 h-full min-w-0 relative ${!activeUser ? 'blur-sm pointer-events-none' : ''}`}>
                {/* Blur if not active user */}

                <CodingConsole
                    code={code}
                    setCode={setCode}
                    language={language}
                    setLanguage={handleLanguageChange}
                    onRun={handleRun}
                    onSubmit={handleSubmit}
                    isSubmitting={isSubmitting}
                    isRunning={isRunning}
                    output={output}
                    outputStatus={outputStatus}
                    timeLeft={timeLeft}
                />

                {/* Floating Timer (Absolute Positioned in Console) */}
                <div className={`absolute top-16 right-6 px-3 py-1.5 rounded-full font-mono font-bold text-sm shadow-sm border
                    ${timeLeft < 60 ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-white text-gray-700 border-gray-200'}
                `}>
                    <div className="flex items-center gap-2">
                        <Timer className="w-3.5 h-3.5" />
                        <span>{formatTime(timeLeft)}</span>
                    </div>
                </div>

                {/* Floating Camera Overlay */}
                <DraggableCamera isFloating={true} className="z-50">
                    <VideoPanel
                        userName={interviewInfo?.candidate_name}
                        isInterviewActive={true} // Coding is active
                        interviewId={interview_id}
                    // Minimal props needed for camera to work
                    />
                </DraggableCamera>
            </div>

            {/* Tab Warning Overlay */}
            {showWarning && (
                <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full text-center shadow-2xl animate-in zoom-in duration-200">
                        <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-gray-900 mb-2">Tab Switch Detected!</h2>
                        <p className="text-gray-600 mb-6">
                            Returning to the interview... If you switch tabs again, the test may be autosubmitted or flagged.
                        </p>
                    </div>
                </div>
            )}

        </div>
    );
}

```


## File: app/interview/[interview_id]/rules/page.jsx
```javascript
'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
    CheckCircle2,
    AlertTriangle,
    Camera,
    Mic,
    Monitor,
    Clock,
    ShieldCheck,
    ArrowRight,
    Loader2
} from 'lucide-react';
import Image from 'next/image';

const rules = [
    {
        icon: Camera,
        title: 'Camera Required',
        description: 'Your camera will be on throughout the interview for identity verification and proctoring.',
    },
    {
        icon: Mic,
        title: 'Microphone Access',
        description: 'Please allow microphone access for verbal responses. Speak clearly and at a moderate pace.',
    },
    {
        icon: Monitor,
        title: 'No Tab Switching',
        description: 'Switching tabs or windows during the interview may be flagged as suspicious activity.',
    },
    {
        icon: Clock,
        title: 'Time Limit',
        description: 'The interview has a set duration. Answer questions promptly to complete within the time limit.',
    },
    {
        icon: AlertTriangle,
        title: 'No External Assistance',
        description: 'Do not use external resources, notes, or seek help from others during the interview.',
    },
    {
        icon: ShieldCheck,
        title: 'Secure Environment',
        description: 'Ensure you are in a quiet, well-lit room with a stable internet connection.',
    },
];

export default function RulesPage() {
    const params = useParams();
    const router = useRouter();
    const interview_id = params?.interview_id;

    const [agreed, setAgreed] = useState(false);
    const [loading, setLoading] = useState(false);

    // Check if already acknowledged
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const rulesAcknowledged = localStorage.getItem(`rules_acknowledged_${interview_id}`);
            if (rulesAcknowledged) {
                router.replace(`/interview/${interview_id}`);
            }
        }
    }, [interview_id, router]);

    const handleContinue = () => {
        if (!agreed) return;

        setLoading(true);
        // Store acknowledgment
        if (typeof window !== 'undefined') {
            localStorage.setItem(`rules_acknowledged_${interview_id}`, 'true');
        }

        // Navigate back to interview page
        setTimeout(() => {
            router.replace(`/interview/${interview_id}`);
        }, 500);
    };

    return (
        <div className="fixed inset-0 w-full h-full bg-gradient-to-br from-slate-50 via-white to-violet-50/50 flex items-center justify-center p-4 overflow-auto">
            {/* Background decorations */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-violet-100/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-100/30 rounded-full blur-3xl pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative z-10 w-full max-w-3xl bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl shadow-violet-200/40 border border-white/60 overflow-hidden"
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-700 px-8 py-6 text-white relative">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

                    <div className="relative z-10 flex items-center gap-4">
                        <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
                            <Image src="/logo.png" alt="Logo" width={32} height={32} className="object-contain" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Interview Guidelines</h1>
                            <p className="text-violet-100 text-sm mt-1">Please read and acknowledge before proceeding</p>
                        </div>
                    </div>
                </div>

                {/* Rules List */}
                <div className="p-8">
                    <div className="grid gap-4">
                        {rules.map((rule, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="flex items-start gap-4 p-4 bg-gray-50/80 rounded-xl border border-gray-100 hover:border-violet-200 hover:bg-violet-50/30 transition-all group"
                            >
                                <div className="shrink-0 w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600 group-hover:bg-violet-200 transition-colors">
                                    <rule.icon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 group-hover:text-violet-900 transition-colors">
                                        {rule.title}
                                    </h3>
                                    <p className="text-sm text-gray-600 mt-0.5 leading-relaxed">
                                        {rule.description}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Agreement Checkbox */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="mt-8 p-4 bg-amber-50/80 rounded-xl border border-amber-200"
                    >
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={agreed}
                                onChange={(e) => setAgreed(e.target.checked)}
                                className="mt-1 w-5 h-5 rounded border-amber-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 cursor-pointer"
                            />
                            <span className="text-sm text-amber-900 leading-relaxed">
                                I have read and understood the interview guidelines. I agree to follow these rules and understand that any violation may result in disqualification.
                            </span>
                        </label>
                    </motion.div>

                    {/* Continue Button */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                        className="mt-6"
                    >
                        <Button
                            onClick={handleContinue}
                            disabled={!agreed || loading}
                            className={`w-full h-14 text-base font-bold rounded-xl transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 group ${agreed
                                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-lg shadow-violet-200'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Preparing...
                                </>
                            ) : (
                                <>
                                    Continue to Interview
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </Button>
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}

```


## File: app/interview/[interview_id]/completed/page.jsx
```javascript
'use client';

import { Check, Clock, Mail, Shield } from 'lucide-react';
import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';

const InterviewCompleted = () => {
  const { interview_id } = useParams();
  // Clean up any lingering media streams when this page loads
  useEffect(() => {
    const cleanup = () => {
      try {
        // Find and stop all active media streams
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach(video => {
          if (video.srcObject) {
            const stream = video.srcObject;
            stream.getTracks().forEach(track => {
              track.stop();
              console.log('Stopped lingering media track:', track.kind);
            });
            video.srcObject = null;
          }
        });

        // Also try to stop any MediaStream tracks globally
        if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
          // This is a fallback to ensure all tracks are stopped
          console.log('Media cleanup completed');
        }
      } catch (e) {
        console.error('Error during media cleanup:', e);
      }
    };

    // Run cleanup immediately on mount
    cleanup();

    // Also run after a short delay to catch any delayed streams
    const timer = setTimeout(cleanup, 100);

    return () => clearTimeout(timer);
  }, []);

  // Prevent back navigation and attempt auto-close
  useEffect(() => {
    // 1. Aggressive back navigation block
    // Push multiple states to make the back button ineffective for multiple clicks
    const blockBack = () => {
      window.history.pushState(null, null, window.location.href);
    };

    blockBack();
    blockBack();
    blockBack();

    const handlePopState = (e) => {
      // Force the current page to stay active
      blockBack();
      // Force move forward if they somehow get behind
      window.history.go(1);
    };

    window.addEventListener('popstate', handlePopState);

    // 2. Clear interview specific storage but keep a completion flag
    const interviewKeys = Object.keys(localStorage);
    interviewKeys.forEach(key => {
      if (key.includes(interview_id) || key === 'interviewInfo') {
        localStorage.removeItem(key);
      }
    });
    localStorage.setItem(`interview_completed_${interview_id}`, 'true');

    // 3. Attempt auto-close after 10 seconds
    const closeTimer = setTimeout(() => {
      try {
        window.close();
      } catch (e) { }
    }, 10000);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      clearTimeout(closeTimer);
    }
  }, [interview_id]); // added dependency

  const handleClose = () => {
    window.close();
    // Fallback: alert if window.close() fails (browser restriction)
    setTimeout(() => {
      alert("Please close this tab manually for security.");
    }, 300);
  };

  return (
    <div className="fixed inset-0 w-full h-full bg-gradient-to-br from-slate-50 via-white to-violet-50/50 flex items-center justify-center p-4 overflow-hidden font-sans text-center">
      <div className="w-full max-w-3xl bg-white/80 backdrop-blur-xl p-8 rounded-[2rem] shadow-2xl shadow-violet-200/40 border border-white/60 relative flex flex-col gap-6 items-center ring-1 ring-violet-50">

        {/* Decorative elements - Subtle & Premium */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-100/30 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-100/30 rounded-full blur-3xl -ml-12 -mb-12 pointer-events-none"></div>

        {/* Success Header */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 mb-4 shadow-lg shadow-green-200 animate-in zoom-in duration-500">
            <Check className="h-8 w-8 text-white stroke-[3]" />
          </div>

          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight mb-2">
            Interview Submitted <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">Successfully</span>
          </h1>

          <p className="text-slate-500 font-medium">
            Thank you for completing your interview with <span className="font-bold text-violet-700">Recruiter AI</span>
          </p>
        </div>

        {/* Info Cards - Compact Grid */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4 mx-auto w-full">
          <div className="bg-white/60 p-4 rounded-2xl border border-violet-100/50 shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center group">
            <div className="bg-violet-100/50 p-2.5 rounded-xl mb-3 group-hover:bg-violet-100 transition-colors">
              <Shield className="h-5 w-5 text-violet-600" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm mb-1.5">Secure Processing</h3>
            <p className="text-slate-500 text-xs leading-relaxed">
              Responses encrypted & stored with enterprise security.
            </p>
          </div>

          <div className="bg-white/60 p-4 rounded-2xl border border-purple-100/50 shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center group">
            <div className="bg-purple-100/50 p-2.5 rounded-xl mb-3 group-hover:bg-purple-100 transition-colors">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm mb-1.5">Review Timeline</h3>
            <p className="text-slate-500 text-xs leading-relaxed">
              Expected review within <span className="font-bold text-purple-700">3 days</span>.
            </p>
          </div>

          <div className="bg-white/60 p-4 rounded-2xl border border-emerald-100/50 shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center group">
            <div className="bg-emerald-100/50 p-2.5 rounded-xl mb-3 group-hover:bg-emerald-100 transition-colors">
              <Mail className="h-5 w-5 text-emerald-600" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm mb-1.5">Next Steps</h3>
            <p className="text-slate-500 text-xs leading-relaxed">
              Check your email spam folder for updates.
            </p>
          </div>
        </div>

        {/* Action Area */}
        <div className="relative z-10 mt-2 space-y-4 max-w-sm mx-auto w-full flex flex-col items-center">
          <div className="bg-slate-50 rounded-xl py-2 px-4 border border-slate-100 w-full mb-2">
            <p className="text-slate-500 font-medium text-xs">
              You've completed all steps! This window will attempt to close automatically in 10 seconds.
            </p>
          </div>

          <button
            onClick={handleClose}
            className="w-full h-12 bg-slate-900 hover:bg-black text-white font-bold rounded-xl shadow-xl shadow-slate-200 hover:shadow-2xl transition-all duration-200 flex items-center justify-center gap-2 group transform active:scale-[0.98]"
          >
            Close Tab Now
          </button>

        </div>

      </div>
    </div>
  );
};

export default InterviewCompleted;

```


## File: app/interview/_components/InterviewHeader.jsx
```javascript
import React from 'react';
import Image from 'next/image';

function InterviewHeader() {
  return (
    <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-violet-100/50 sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center">
        <div className="flex-shrink-0 group">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-violet-500/20 to-purple-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <Image
              src="/logo.png"
              alt="Logo"
              width={120}
              height={40}
              className="h-auto w-[100px] sm:w-[120px] relative transition-transform duration-300 group-hover:scale-105"
              priority
            />
          </div>
        </div>
      </div>
    </header>
  );
}

export default InterviewHeader;

```


## File: app/interview/[interview_id]/start/_components/AlertConfirmation.jsx
```javascript
import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const AlertConfirmation = ({ children, stopInterview }) => {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. Your interview will end.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => stopInterview()}>
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default AlertConfirmation;

```


## File: app/interview/[interview_id]/start/_components/AntiCheatingMonitor.jsx
```javascript
'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import axios from 'axios';

const AntiCheatingMonitor = ({
    interviewId,
    email,
    candidateName,
    onViolationLimitReached,
    onRecordCreated,
    isCompleted,
    isInteractionActive,
    onVisibilityChange, // NEW: Callback for visibility changes (true=active/visible, false=hidden/blurred)
    onWarning // NEW: Callback when a warning is triggered
}) => {
    const hasInitializedRef = useRef(false);
    // Ref to track if we are currently hidden to prevent blur from firing
    const isHiddenRef = useRef(false);

    const handleStateUpdate = (state) => {
        if (!state) return;

        // If already completed in DB (auto_completed), notify parent and stop
        if (state.interview_status === 'auto_completed') {
            // Dismiss active warnings
            toast.dismiss('ac-warning');
            if (onWarning) onWarning(false); // Clear warning overlay

            // Show error if we aren't already completed LOCALLY (avoid spam during feedback phase)
            if (!isCompleted) {
                toast.error("Interview ended due to repeated focus violations.", {
                    id: 'ac-violation-end',
                    duration: 10000
                });
            }
            if (onViolationLimitReached) onViolationLimitReached();
            return;
        }

        // If we are locally completed (e.g. generating feedback), do not show any warnings
        if (isCompleted) {
            toast.dismiss('ac-warning');
            if (onWarning) onWarning(false);
            return;
        }

        const score = state.suspicious_score;
        const max = state.max_allowed_score;
        const violationsLeft = max - score;

        // Warnings logic
        if (score > 0 && score < max) {
            let message = `Warning (${score}/${max}): Please stay on the interview tab.`;
            if (violationsLeft === 1) {
                message = `Critical Warning (${score}/${max}): One more tab switch will end the interview.`;
            }

            toast.warning(message, {
                id: 'ac-warning',
                duration: 4000
            });

            // Trigger external warning callback (e.g. for overlay)
            if (onWarning) {
                onWarning(true);
                // Auto-clear logic for overlay could be handled by parent or a timeout here
                setTimeout(() => onWarning(false), 4000);
            }
        }
    };

    // Helper to format relative time
    const getFormattedRelativeTime = () => {
        if (typeof window === 'undefined') return null;

        let startTime = null;
        try {
            // Priority 1: Check standard key used in page.jsx
            const standardKey = `timer_start_${interviewId}`;
            const storedStandard = localStorage.getItem(standardKey);

            if (storedStandard) {
                startTime = parseInt(storedStandard, 10);
            } else {
                // Priority 2: Scoped Key (fallback)
                const scopedKey = `timer_start_${interviewId}_${email}`;
                const storedScoped = localStorage.getItem(scopedKey);
                if (storedScoped) startTime = parseInt(storedScoped, 10);
            }
        } catch (e) { }

        if (!startTime) return "00:00";

        const now = Date.now();
        const diffMs = now - startTime;
        if (diffMs < 0) return "00:00";

        const totalSeconds = Math.floor(diffMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Helper to send event
    const sendEvent = async (eventType, extraData = {}) => {
        // GATING: Do not send events if completed OR if interaction is active (speaking)
        if (isCompleted) return;
        if (isInteractionActive && eventType !== 'window_blur' && eventType !== 'visibility_hidden') {
            // We allow severe violations like blur/hidden even when speaking
        }

        const timestampStr = getFormattedRelativeTime();

        try {
            const { data: state } = await axios.post('/api/interview/anti-cheating-event', {
                interview_id: interviewId,
                email: email,
                candidate_name: candidateName,
                event_type: eventType,
                timestamp: new Date().toISOString(),
                timestamp_str: timestampStr, // Send relative time string
                ...extraData
            });

            if (state.id && onRecordCreated) {
                onRecordCreated(state.id);
            }

            handleStateUpdate(state);
        } catch (error) {
            console.error('Anti-cheating event error:', error);
        }
    };

    // Initial Check on Mount
    useEffect(() => {
        const checkState = async () => {
            try {
                const { data: state } = await axios.post('/api/interview/anti-cheating-event', {
                    interview_id: interviewId,
                    email: email,
                    candidate_name: candidateName,
                    event_type: 'window_focus',
                    timestamp: new Date().toISOString()
                });

                if (state.id && onRecordCreated) {
                    onRecordCreated(state.id);
                }

                handleStateUpdate(state);
            } catch (e) {
                console.error("Failed to check anti-cheating state", e);
            }
        };

        if (interviewId && email && !isCompleted) {
            checkState();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interviewId, email]);

    // Track if we are unloading to prevent false positives on refresh
    const isUnloadingRef = useRef(false);
    // Track start time of focus loss
    const startBlurTimeRef = useRef(null);

    // Event Listeners
    useEffect(() => {
        if (!interviewId || !email || isCompleted) return;

        const handleBeforeUnload = () => {
            isUnloadingRef.current = true;
        };

        const handleVisibilityChange = () => {
            if (isUnloadingRef.current) return; // Ignore if unloading

            if (document.visibilityState === 'hidden') {
                isHiddenRef.current = true;
                startBlurTimeRef.current = Date.now();
                if (onVisibilityChange) onVisibilityChange(false);
                sendEvent('visibility_hidden');
            } else {
                isHiddenRef.current = false;
                const duration = startBlurTimeRef.current ? Date.now() - startBlurTimeRef.current : 0;
                startBlurTimeRef.current = null; // Reset
                if (onVisibilityChange) onVisibilityChange(true);
                sendEvent('window_focus', { durationMs: duration });
            }
        };

        const handleBlur = () => {
            if (isUnloadingRef.current) return; // Ignore if unloading

            setTimeout(() => {
                if (document.visibilityState !== 'hidden') {
                    startBlurTimeRef.current = Date.now();
                    if (onVisibilityChange) onVisibilityChange(false);
                    sendEvent('window_blur');
                }
            }, 200);
        };

        const handleFocus = () => {
            if (isUnloadingRef.current) return;

            const duration = startBlurTimeRef.current ? Date.now() - startBlurTimeRef.current : 0;
            startBlurTimeRef.current = null; // Reset

            if (onVisibilityChange) onVisibilityChange(true);
            sendEvent('window_focus', { durationMs: duration });
        };

        const handleMouseLeave = (e) => {
            if (isUnloadingRef.current || isCompleted) return;

            // Record leave time
            startBlurTimeRef.current = Date.now();

            sendEvent('mouse_leave', {
                clientY: e.clientY,
                clientX: e.clientX,
                screenY: e.screenY
            });

            // Trigger visual warning if callback provided
            if (onWarning) onWarning(true);
        };

        const handleMouseEnter = () => {
            if (isUnloadingRef.current || isCompleted) return;

            const duration = startBlurTimeRef.current ? Date.now() - startBlurTimeRef.current : 0;
            startBlurTimeRef.current = null;

            if (onWarning) onWarning(false);
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

    return null;
};

export default AntiCheatingMonitor;

```


## File: app/interview/[interview_id]/start/_components/CodeEditor.jsx
```javascript
'use client';
import React, { useState, useEffect } from 'react';
// import Editor from '@monaco-editor/react'; // Removed due to missing pkg
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, UploadCloud, Terminal, RotateCcw, Loader2 } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const LANGUAGES = {
  javascript: {
    label: 'JavaScript',
    value: 'javascript',
    pistonRuntime: 'javascript',
    version: '18.15.0',
    boilerplate: `// JavaScript Solution
function solve(input) {
  // Write your code here
  console.log("Hello World");
}

solve();`
  },
  python: {
    label: 'Python',
    value: 'python',
    pistonRuntime: 'python',
    version: '3.10.0',
    boilerplate: `# Python Solution
def solve():
    # Write your code here
    print("Hello World")

if __name__ == "__main__":
    solve()`
  },
  java: {
    label: 'Java',
    value: 'java',
    pistonRuntime: 'java',
    version: '15.0.2',
    boilerplate: `public class Main {
    public static void main(String[] args) {
        // Write your code here
        System.out.println("Hello World");
    }
}`
  },
  c: {
    label: 'C',
    value: 'c',
    pistonRuntime: 'c',
    version: '10.2.0',
    boilerplate: `#include <stdio.h>

int main() {
    // Write your code here
    printf("Hello World\\n");
    return 0;
}`
  },
  cpp: {
    label: 'C++',
    value: 'cpp',
    pistonRuntime: 'cpp',
    version: '10.2.0',
    boilerplate: `#include <iostream>

using namespace std;

int main() {
    // Write your code here
    cout << "Hello World" << endl;
    return 0;
}`
  }
};

const CodeEditor = ({ onChange, initialLanguage = 'javascript', onSubmit, timeLimit, startTimer = false }) => {
  console.log("[CodeEditor] Received timeLimit:", timeLimit, "Start:", startTimer);
  const [language, setLanguage] = useState(initialLanguage);
  const [code, setCode] = useState(LANGUAGES[initialLanguage].boilerplate);
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Timer State
  const [timeLeft, setTimeLeft] = useState(timeLimit ? timeLimit * 60 : 0);

  // Initialize timer when timeLimit changes
  useEffect(() => {
    if (timeLimit) {
      setTimeLeft(timeLimit * 60);
    }
  }, [timeLimit]);

  // Countdown Logic
  useEffect(() => {
    // Only run if: 
    // 1. Timer has started (tab active)
    // 2. Not submitted
    // 3. Time limit exists
    // 4. Time left > 0
    if (!startTimer || !timeLimit || timeLeft <= 0 || isSubmitted) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLimit, timeLeft, isSubmitted, startTimer]);

  // Auto-Submit on Timeout
  useEffect(() => {
    // Only auto-submit if timer WAS running (startTimer=true)
    if (startTimer && timeLimit && timeLeft === 0 && !isSubmitted) {
      setIsSubmitted(true);
      toast.warning("Time's up! Submitting solution...");
      if (onSubmit) onSubmit(code, true); // true indicates timeout
    }
  }, [timeLeft, timeLimit, onSubmit, code, isSubmitted, startTimer]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleLanguageChange = (value) => {
    setLanguage(value);
    const newBoilerplate = LANGUAGES[value].boilerplate;
    setCode(newBoilerplate);
    setOutput('');
    if (onChange) onChange(newBoilerplate);
  };

  const handleEditorChange = (value) => {
    setCode(value);
    if (onChange) onChange(value);
  };

  const handleRun = async () => {
    setIsRunning(true);
    setOutput('Running...');

    const langConfig = LANGUAGES[language];

    try {
      const response = await axios.post('https://emkc.org/api/v2/piston/execute', {
        language: langConfig.pistonRuntime,
        version: langConfig.version,
        files: [
          {
            content: code
          }
        ]
      });

      const { run } = response.data;
      setOutput(run.output || 'No output');

      if (run.stderr) {
        toast.warning("Code finished with some errors.");
      } else {
        toast.success("Code ran successfully!");
      }

    } catch (error) {
      console.error("Execution error:", error);
      setOutput(error?.message || "Failed to execute code. Please try again.");
      toast.error("Execution failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = () => {
    if (isSubmitted) return;
    setIsSubmitted(true);
    toast.success("Solution submitted successfully!");
    if (onSubmit) onSubmit(code, false);
  };

  const handleReset = () => {
    setCode(LANGUAGES[language].boilerplate);
    setOutput('');
    toast.info("Code reset to default.");
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-violet-100/50 rounded-md text-violet-600">
            <Terminal size={14} />
          </div>
          <span className="font-semibold text-gray-700 text-sm">Code Editor</span>

          {/* Timer Display */}
          {timeLimit && (
            <div className={`ml-2 px-2 py-0.5 rounded text-xs font-mono font-bold ${timeLeft < 60 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-200 text-gray-700'}`}>
              ⏱ {formatTime(timeLeft)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500/20 shadow-sm"
          >
            {Object.values(LANGUAGES).map((lang) => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>

          <div className="h-4 w-[1px] bg-gray-300 mx-1"></div>

          <button
            onClick={handleReset}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-all"
            title="Reset Code"
          >
            <RotateCcw size={14} />
          </button>

          <button
            onClick={handleRun}
            disabled={isRunning}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${isRunning
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 border border-emerald-100'
              }`}
          >
            {isRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
            Run
          </button>

          <button
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-200 transition-all active:scale-95"
          >
            <UploadCloud size={14} />
            Submit
          </button>
        </div>
      </div>

      {/* Editor & Output Split */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Editor Area */}
        <div className="flex-grow relative">
          <textarea
            className="w-full h-full p-4 font-mono text-sm bg-gray-50 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/30 text-gray-800"
            value={code}
            onChange={(e) => handleEditorChange(e.target.value)}
            spellCheck="false"
            placeholder="// Write your code here..."
          />
          {/* 
              FALLBACK NOTE: 
              Monaco Editor (@monaco-editor/react) was removed to fix build errors due to missing dependency.
              To restore: npm install @monaco-editor/react and restore the Editor component.
            */}
        </div>

        {/* Output Console (Collapsible or Fixed Height) */}
        <div className="h-[30%] min-h-[100px] border-t border-gray-200 bg-slate-900 text-slate-100 flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950 border-b border-slate-800">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest pl-1">Console Output</span>
            <button onClick={() => setOutput('')} className="text-[10px] text-slate-500 hover:text-slate-300">Clear</button>
          </div>
          <div className="flex-1 p-3 font-mono text-xs overflow-auto custom-scrollbar whitespace-pre-wrap">
            {output ? (
              <span className={output.includes('Error') || output.includes('Exception') ? 'text-red-400' : 'text-emerald-300'}>
                {output}
              </span>
            ) : (
              <span className="text-slate-600 italic">Run code to see output...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;

```


## File: app/interview/[interview_id]/start/_components/DraggableCamera.jsx
```javascript
import React, { useRef, useEffect } from 'react';
import { motion, useMotionValue } from 'framer-motion';

const DraggableCamera = ({ children, isFloating = true, className = '' }) => {
  const constraintsRef = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useEffect(() => {
    // Load saved position
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('camera_pos');
      if (saved) {
        try {
          const { x: sx, y: sy } = JSON.parse(saved);
          if (!isNaN(sx) && !isNaN(sy)) {
            x.set(sx);
            y.set(sy);
          }
        } catch (e) {
          console.error('Failed to parse camera position', e);
        }
      }
    }
  }, [x, y]);

  const handleDragEnd = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('camera_pos', JSON.stringify({ x: x.get(), y: y.get() }));
    }
  };

  if (!isFloating) {
    return (
      <div className={`relative overflow-hidden rounded-2xl shadow-lg border border-gray-100 bg-black/5 ${className}`}>
        {children}
      </div>
    );
  }

  return (
    <>
      <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-[50]" />

      <motion.div
        drag
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        style={{ x, y, touchAction: 'none' }}
        initial={{ right: 16, bottom: 16 }}
        animate={{ right: 16, bottom: 16 }} // Ensure anchor stays
        className={`fixed bottom-4 right-4 w-56 h-56 bg-black rounded-xl shadow-2xl overflow-hidden cursor-move z-[60] pointer-events-auto border-2 border-white/20 aspect-square ${className}`}
      >
        {children}
      </motion.div>
    </>
  );
};

export default DraggableCamera;

```


## File: app/interview/[interview_id]/start/_components/TimmerComponent.jsx
```javascript
'use client';
import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTimer } from '@/lib/storage';

const formatTime = (totalSeconds) => {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
    2,
    '0'
  );
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const TimmerComponent = ({ start, duration, interviewId, candidateEmail, onTimeExpire, showWarnings = true }) => {
  const [time, setTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(null);
  const [isCountDown, setIsCountDown] = useState(false);
  const intervalRef = useRef(null);
  const hasExpiredRef = useRef(false); // Ref to prevent double triggering

  // 🆕 Use hybrid storage hook for timer state
  const { timerState, saveTimer, loading } = useTimer(interviewId, candidateEmail);

  useEffect(() => {
    // Determine if countdown or countup
    let shouldUseCountdown = false;
    if (duration) {
      const matches = String(duration).match(/(\d+)/g);
      if (matches && matches.length > 0) {
        const minutes = Math.max(...matches.map(Number));
        if (!isNaN(minutes) && minutes > 0) {
          shouldUseCountdown = true;
        }
      }
    }

    // 🆕 Check if we already have a countdown in hybrid storage
    if (timerState?.end) {
      shouldUseCountdown = true;
    }

    setIsCountDown(shouldUseCountdown);
  }, [duration, timerState]);

  useEffect(() => {
    if (start && interviewId && !loading) {
      if (intervalRef.current) clearInterval(intervalRef.current);

      if (isCountDown) {
        // 🆕 Load end time from hybrid storage
        let targetEndTime;

        if (timerState?.end) {
          // Restore from saved state
          targetEndTime = timerState.end;
        } else {
          // Create new countdown
          const matches = String(duration).match(/(\d+)/g);
          const minutes = (matches && matches.length > 0) ? Math.max(...matches.map(Number)) : 30; // Use max or 30 min fallback

          targetEndTime = Date.now() + minutes * 60 * 1000;

          // 🆕 Save to hybrid storage (saves to both DB and localStorage)
          saveTimer({
            start: Date.now(),
            end: targetEndTime,
            duration: minutes * 60
          });
        }

        const updateTimer = () => {
          const now = Date.now();
          const diff = Math.ceil((targetEndTime - now) / 1000);
          if (diff <= 0) {
            setRemainingTime(0);
            if (intervalRef.current) clearInterval(intervalRef.current);
          } else {
            setRemainingTime(diff);
          }
        };

        updateTimer(); // Run immediately
        intervalRef.current = setInterval(updateTimer, 1000);

      } else {
        // Count Up
        // 🆕 Load start time from hybrid storage
        let startTime;

        if (timerState?.start) {
          // Restore from saved state
          startTime = timerState.start;
        } else {
          // Create new timer
          startTime = Date.now();

          // 🆕 Save to hybrid storage
          saveTimer({
            start: startTime,
            end: null,
            duration: null
          });
        }

        const updateTimer = () => {
          const now = Date.now();
          const elapsed = Math.floor((now - startTime) / 1000);
          setTime(elapsed);
        }

        updateTimer();
        intervalRef.current = setInterval(updateTimer, 1000);
      }
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [start, isCountDown, interviewId, duration, timerState, loading, saveTimer]);

  // Separate effect for time limit warnings
  useEffect(() => {
    if (!isCountDown || remainingTime === null || !showWarnings) return;

    if (remainingTime === 600) { // 10 minutes
      toast.info('10 minutes remaining in your interview.', { id: 'timer-10m' });
    } else if (remainingTime === 300) { // 5 minutes
      toast.warning('5 minutes remaining. Please wrap up soon.', { id: 'timer-5m' });
    } else if (remainingTime === 60) { // 1 minute
      toast.warning('Urgent: Only 1 minute remaining!', { id: 'timer-1m' });
    } else if (remainingTime <= 0 && start && !hasExpiredRef.current) {
      hasExpiredRef.current = true;
      toast.error('Time is up! Ending interview...', { id: 'timer-0m' });
      onTimeExpire?.();
    }
  }, [remainingTime, isCountDown, start, onTimeExpire, showWarnings]);

  const displayTime = isCountDown && remainingTime !== null ? remainingTime : time;

  return (
    <div>
      <h2 suppressHydrationWarning>{formatTime(displayTime)}</h2>
    </div>
  );
};

export default TimmerComponent;

```


## File: app/interview/[interview_id]/start/_components/VideoPanel.jsx
```javascript
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  User,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useGazeTracker } from '../_hooks/useGazeTracker';

// Configuration
const CONFIG = {
  FACE_CHECK_INTERVAL: 2000, // Check face every 2 seconds
  WARNING_THRESHOLD: 15, // Show warning after 15 seconds without face
  EXIT_THRESHOLD: 60, // Exit after 60 seconds without face
  CAMERA_RETRY_LIMIT: 3, // Max retries for camera access
};

/**
 * VideoPanel - Video component with face detection, camera controls, and monitoring
 */
export default function VideoPanel({
  userName = 'Candidate',
  onCameraError,
  onFaceNotDetected,
  onExitInterview,
  isInterviewActive = true,
  onMicToggle,
  onViolation,
  interviewId
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const faceCheckIntervalRef = useRef(null);
  const noFaceTimerRef = useRef(null);

  // Video/Audio states
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Face detection states
  const [isFaceDetected, setIsFaceDetected] = useState(true);
  const [noFaceSeconds, setNoFaceSeconds] = useState(0);
  const [showRetryPrompt, setShowRetryPrompt] = useState(false);
  const [faceDetectionEnabled, setFaceDetectionEnabled] = useState(true);

  // Stop showing face warnings when monitoring is paused (e.g., during evaluation)
  useEffect(() => {
    if (!isInterviewActive) {
      setShowRetryPrompt(false);
      setNoFaceSeconds(0);
    }
  }, [isInterviewActive]);

  // Permission states
  const [permissionStatus, setPermissionStatus] = useState({
    camera: 'pending',
    microphone: 'pending',
  });

  // Integreate Gaze Tracker
  const { gazeStatus, status: trackerStatus, isCalibrated, startCalibration, captureCalibrationPoint, finalizeCalibration, debugData } = useGazeTracker(
    videoRef,
    isInterviewActive && isCameraOn,
    onViolation,
    interviewId
  );

  // Track if component is mounted
  const isMountedRef = useRef(true);
  // Track if media has been initialized to prevent duplicate requests
  const isInitializedRef = useRef(false);
  const isInitializingRef = useRef(false);

  /**
   * Initialize camera and microphone
   */
  const initializeMedia = useCallback(async () => {
    // Prevent duplicate initialization
    if (isInitializedRef.current && streamRef.current) {
      logger.log('Media already initialized, skipping');
      return true;
    }

    if (isInitializingRef.current) {
      logger.log('Media initialization already in progress, skipping');
      return false;
    }

    isInitializingRef.current = true;

    try {
      setCameraError(null);
      setIsVideoReady(false);

      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      await new Promise(r => setTimeout(r, 200));

      // Request permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: true,
      });

      // Check if component is still mounted
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        isInitializingRef.current = false;
        return false;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Use onloadedmetadata event instead of direct play()
        await new Promise((resolve, reject) => {
          const video = videoRef.current;
          if (!video) {
            reject(new Error('Video element not found'));
            return;
          }

          if (isMountedRef.current) {
            isInitializedRef.current = true;
            // Only start playing if not already playing or paused
            if (video.paused || video.ended) {
              video.onloadedmetadata = () => {
                video
                  .play()
                  .then(resolve)
                  .catch((err) => {
                    // Ignore AbortError - it happens when stream is replaced
                    if (err.name === 'AbortError') {
                      logger.log('Video play aborted (stream replaced)');
                      resolve();
                    } else {
                      reject(err);
                    }
                  });
              };
            } else {
              resolve();
            }

            video.onerror = () => reject(new Error('Video loading error'));
          } else {
            stream.getTracks().forEach((track) => track.stop());
            return false;
          }
        });

        if (isMountedRef.current) {
          isInitializedRef.current = true;
          setIsVideoReady(true);
          setPermissionStatus({ camera: 'granted', microphone: 'granted' });
          logger.log('✅ Camera and microphone initialized');
        }
      }

      isInitializingRef.current = false;
      return true;
    } catch (err) {
      isInitializingRef.current = false;
      // Ignore AbortError - it's expected when reinitializing
      if (err.name === 'AbortError') {
        logger.log('Media initialization aborted');
        return false;
      }

      logger.error('Media initialization error:', err);

      let errorMessage = 'Failed to access camera';
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera/microphone permission denied';
        setPermissionStatus({ camera: 'denied', microphone: 'denied' });
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera or microphone found';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is being used by another application';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = 'Camera constraints could not be satisfied';
      }

      if (isMountedRef.current) {
        setCameraError(errorMessage);
        onCameraError?.(errorMessage);
      }
      return false;
    }
  }, [onCameraError]);

  /**
   * Simple face detection using canvas brightness analysis
   * This is a lightweight approach - for production, consider using TensorFlow.js or face-api.js
   */
  // NOTE: This is now secondary to the GazeTracker
  const detectFace = useCallback(() => {
    // ALWAYS check GazeTracker status first for Critical Violations
    if (gazeStatus === 'Multiple Faces') return 'multiple'; // Special flag

    // If GazeTracker says "No Face", rely on that first if calibrated
    // (If not calibrated, we fall back to canvas check below as a safety net)
    if (isCalibrated) {
      if (gazeStatus === 'No Face') return false;
      return true;
    }

    if (!videoRef.current || !canvasRef.current || !isCameraOn) return true;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx || video.videoWidth === 0) return true;

    // Set canvas size only if needed to avoid clearing
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Draw current frame
    ctx.drawImage(video, 0, 0);

    // Get image data from the center region (where face should be)
    const centerX = canvas.width * 0.25;
    const centerY = canvas.height * 0.1;
    const regionWidth = canvas.width * 0.5;
    const regionHeight = canvas.height * 0.6;

    try {
      const imageData = ctx.getImageData(
        centerX,
        centerY,
        regionWidth,
        regionHeight
      );
      const data = imageData.data;

      // Analyze skin tone presence (simplified)
      let skinPixels = 0;
      let totalPixels = 0;

      for (let i = 0; i < data.length; i += 16) {
        // Sample every 4th pixel for performance
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Simple skin tone detection (works for various skin tones)
        // This checks for warm tones typical of human skin
        const isSkinTone =
          r > 60 &&
          r < 255 &&
          g > 40 &&
          g < 230 &&
          b > 20 &&
          b < 200 &&
          r > g &&
          r > b &&
          Math.abs(r - g) > 10;

        if (isSkinTone) skinPixels++;
        totalPixels++;
      }

      const skinRatio = skinPixels / totalPixels;

      // If more than 5% skin-like pixels detected, assume face is present
      return skinRatio > 0.05;
    } catch (err) {
      logger.error('Face detection error:', err);
      return true; // Assume face is present on error
    }
  }, [isCameraOn, isCalibrated, gazeStatus]);

  /**
   * Check for face presence periodically
   */
  const startFaceDetection = useCallback(() => {
    if (faceCheckIntervalRef.current) {
      clearInterval(faceCheckIntervalRef.current);
    }

    faceCheckIntervalRef.current = setInterval(() => {
      if (!faceDetectionEnabled || !isInterviewActive) return;

      const facePresent = detectFace();
      setIsFaceDetected(facePresent);

      if (!facePresent) {
        setNoFaceSeconds((prev) => {
          const newValue = prev + CONFIG.FACE_CHECK_INTERVAL / 1000;

          // Show warning after threshold
          if (newValue >= CONFIG.WARNING_THRESHOLD && !showRetryPrompt) {
            setShowRetryPrompt(true);
            toast.warning(
              'Face not detected! Please ensure you are visible on camera.',
              { id: 'face-not-detected-warning' }
            );
            onFaceNotDetected?.();
          }

          // Exit after exit threshold
          if (newValue >= CONFIG.EXIT_THRESHOLD) {
            toast.error(
              'Interview ended due to prolonged absence from camera.'
            );
            onExitInterview?.('face_not_detected');
            return newValue;
          }

          return newValue;
        });
      } else {
        // Reset counter when face is detected
        setNoFaceSeconds(0);
        setShowRetryPrompt(false);
      }
    }, CONFIG.FACE_CHECK_INTERVAL);
  }, [
    detectFace,
    faceDetectionEnabled,
    isInterviewActive,
    showRetryPrompt,
    onFaceNotDetected,
    onExitInterview,
  ]);


  const retryCamera = useCallback(async () => {
    if (retryCount >= CONFIG.CAMERA_RETRY_LIMIT) {
      toast.error('Maximum retry attempts reached');
      onExitInterview?.('camera_error');
      return;
    }

    setRetryCount((prev) => prev + 1);
    toast.info('Retrying camera access...');

    // Stop existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    const success = await initializeMedia();
    if (success) {
      setNoFaceSeconds(0);
      setShowRetryPrompt(false);
    }
  }, [retryCount, initializeMedia, onExitInterview]);

  /**
   * Handle retry when face not detected
   */
  const handleRetryFaceDetection = useCallback(() => {
    setNoFaceSeconds(0);
    setShowRetryPrompt(false);
    toast.info('Face detection reset. Please stay visible on camera.');
  }, []);

  // Initialize media on mount - only once
  useEffect(() => {
    isMountedRef.current = true;

    // Only initialize if not already done
    if (!isInitializedRef.current) {
      initializeMedia();
    }

    return () => {
      // Mark as unmounted first
      isMountedRef.current = false;
      isInitializedRef.current = false;

      // Cleanup streams
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      // Clear video source
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      // Clear intervals
      if (faceCheckIntervalRef.current) {
        clearInterval(faceCheckIntervalRef.current);
      }
      if (noFaceTimerRef.current) {
        clearInterval(noFaceTimerRef.current);
      }
    };
  }, []); // Empty dependency array - only run on mount/unmount

  // Start face detection when video is ready
  useEffect(() => {
    if (isVideoReady && isInterviewActive) {
      startFaceDetection();
    }

    return () => {
      if (faceCheckIntervalRef.current) {
        clearInterval(faceCheckIntervalRef.current);
      }
    };
  }, [isVideoReady, isInterviewActive, startFaceDetection]);

  // Calculate warning progress
  const warningProgress = Math.min(
    (noFaceSeconds / CONFIG.EXIT_THRESHOLD) * 100,
    100
  );

  return (
    <div className="relative w-full h-full">
      {/* Hidden canvas for face detection */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Video container */}
      <div className="relative w-full h-full bg-gray-900 rounded-2xl overflow-hidden shadow-xl">
        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${!isCameraOn ? 'invisible' : ''}`}
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Camera off overlay */}
        {!isCameraOn && isVideoReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-10">
            <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-3">
              <User className="w-10 h-10 text-gray-500" />
            </div>
            <p className="text-gray-400 text-sm font-medium">Camera is off</p>
          </div>
        )}

        {/* ... (Error and Loading overlays remain) ... */}

        {/* Face detection status indicator */}
        {isVideoReady && isCameraOn && (
          <div
            className={`absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${isFaceDetected === 'multiple'
              ? 'bg-red-500/80 text-white border border-red-400 animate-pulse'
              : isFaceDetected
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
              }`}
          >
            {isFaceDetected === 'multiple' ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Multiple Faces!</span>
              </>
            ) : isFaceDetected ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Face Detected</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5" />
                <span>Face Not Detected</span>
              </>
            )}
          </div>
        )}

        {/* User name badge */}
        <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded-lg z-20 border border-white/10">
          <p className="text-white text-xs font-medium tracking-wide">{userName}</p>
        </div>
      </div>

      {/* Face not detected warning overlay */}
      {showRetryPrompt && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-6 animate-fade-in z-10">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              Face Not Detected
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              Please ensure your face is visible on camera. The interview will
              end automatically if you remain undetected.
            </p>

            {/* Warning progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Time remaining</span>
                <span>
                  {Math.max(CONFIG.EXIT_THRESHOLD - noFaceSeconds, 0)}s
                </span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-red-500 transition-all duration-1000"
                  style={{ width: `${warningProgress}%` }}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleRetryFaceDetection}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                I&apos;m Here
              </Button>
              <Button
                onClick={() => onExitInterview?.('user_exit')}
                variant="outline"
                className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
              >
                Exit Interview
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

```


## File: app/interview/[interview_id]/start/_components/VideoStream.jsx
```javascript

```


## File: app/interview/[interview_id]/start/_hooks/useGazeTracker.js
```javascript
import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';

/* ---------------- CONSTANTS ---------------- */
const CONFIG = {
    // Limits - VERY RELAXED Mode
    LIMIT_X: 0.20,
    LIMIT_Y: 0.20,
    YAW_LIMIT: 0.40,
    PITCH_LIMIT: 0.30,
    BLINK_THRESHOLD: 0.30,
    DEAD_ZONE: 0.10,

    // Timing Rules - Balanced for Alerting
    VIOLATION_SOFT_MS: 3000,      // 3s (was 5s)
    VIOLATION_MEDIUM_MS: 8000,    // 8s
    VIOLATION_HIGH_MS: 15000,     // 15s
    VIOLATION_CRITICAL_MS: 30000, // 30s

    STRIKE_COOLDOWN_MS: 5000,     // 5s
    RETURN_TO_CENTER_MS: 500,

    // Smoothness
    SMOOTHING_ALPHA: 0.92,
    FRAME_SKIP: 2,
    RULE_THROTTLE_MS: 300,

    // CRITICAL: Disable all auto-termination
    MAX_STRIKES_BEFORE_TERMINATION: 999999,
    ENABLE_AUTO_TERMINATION: false,
};

const ZONES = {
    CENTER: 'Center',
    LEFT_MIDDLE: 'Left-middle',
    RIGHT_MIDDLE: 'Right-middle',
    CENTER_BOTTOM: 'Center-bottom', // Often safe (looking at camera/bar)
    LEFT_TOP: 'Left-Top',
    RIGHT_TOP: 'Right-Top',
    LEFT_BOTTOM: 'Left-Bottom',
    RIGHT_BOTTOM: 'Right-Bottom',
    UP: 'Up',
    DOWN: 'Down',
    NO_FACE: 'No Face',
    MULTIPLE_FACES: 'Multiple Faces'
};

const ZONE_REASONS = {
    'Right-Top': 'Looking at top-right area',
    'Left-Bottom': 'Looking at bottom-left area',
    'Right-Bottom': 'Looking at bottom-right area',
    'Left-Top': 'Looking at top-left area',
    'Up': 'Looking upward',
    'Down': 'Looking downward',
    'No Face': 'Face not detected',
    'Out of Screen (Left)': 'Looking out of screen (Left)',
    'Out of Screen (Right)': 'Looking out of screen (Right)',
    'Out of Screen (Down)': 'Looking out of screen (Down)',
    'Multiple Faces': 'Multiple people detected in view',
};

/* ---------------- HELPERS ---------------- */
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const isViolationZone = (zone) => {
    // Re-enabled Peripheral Zones for Alerts
    if (typeof zone === 'string' && zone.includes('Out of Screen')) return true;

    return [
        ZONES.NO_FACE,
        ZONES.LEFT_TOP,
        ZONES.RIGHT_TOP,
        ZONES.LEFT_BOTTOM,
        ZONES.RIGHT_BOTTOM,
        ZONES.UP,
        ZONES.DOWN,
        ZONES.MULTIPLE_FACES
        // Note: LEFT_MIDDLE, RIGHT_MIDDLE, CENTER_BOTTOM are considered SAFE
    ].includes(zone);
};

const getSeverity = (duration, zone) => {
    // More lenient severity levels
    if (zone === ZONES.MULTIPLE_FACES) return 'Critical';
    if (zone === ZONES.NO_FACE && duration > CONFIG.VIOLATION_CRITICAL_MS) return 'Critical';
    if (duration > CONFIG.VIOLATION_HIGH_MS) return 'High';
    if (duration > CONFIG.VIOLATION_MEDIUM_MS) return 'Medium';
    if (duration > CONFIG.VIOLATION_SOFT_MS) return 'Soft';
    return null;
};

const getViolationReason = (zone) => {
    return ZONE_REASONS[zone] || 'Gaze deviation detected';
};

const getEyeGaze = (iris, inner, outer, top, bottom) => {
    const eyeW = Math.abs(outer.x - inner.x);
    const cx = (inner.x + outer.x) / 2;
    const cy = (top.y + bottom.y) / 2;
    if (eyeW < 0.0001) return { x: 0, y: 0 };
    return {
        x: (iris.x - cx) / eyeW,
        y: (iris.y - cy) / eyeW
    };
};

/* ---------------- HOOK ---------------- */
export const useGazeTracker = (videoRef, isEnabled = true, onViolation, interviewId) => {
    const [gazeStatus, setGazeStatus] = useState('UNINIT');
    const [timeOffCenter, setTimeOffCenter] = useState(0);
    const [calibration, setCalibration] = useState({
        isCalibrated: false,
        points: {},
        bounds: null
    });

    const [status, setStatus] = useState({
        strikeCount: 0,
        isWarning: false,
        warningMessage: '',
        isCritical: false,
        shouldTerminate: false,  // LOCKED TO FALSE
        cheatingReason: null,
        direction: null
    });

    const faceMeshRef = useRef(null);
    const rafRef = useRef(null);
    const frameRef = useRef(0);
    const lastRuleRunRef = useRef(0);
    const lastViolationRef = useRef(0);
    const violationSuppressionRef = useRef(false);  // Prevent violation spam

    const stateRef = useRef({
        gaze: { x: 0, y: 0 },
        currentZone: ZONES.CENTER,
        zoneStartTime: 0,
        lastLogTime: 0,
        isCalibrating: false,
        calibrationBuffer: [],
        calibrationPoints: {},
        consecutiveNoFaceFrames: 0,
        consecutiveNoFaceFrames: 0,
        totalFramesProcessed: 0,
        maxFacesInThrottleWindow: 0 // New: Track peak faces between rule runs
    });

    const statusRef = useRef(status);
    useEffect(() => { statusRef.current = status; }, [status]);

    const calibrationRef = useRef(calibration);
    useEffect(() => { calibrationRef.current = calibration; }, [calibration]);

    // Restore calibration from storage on mount
    useEffect(() => {
        if (typeof window !== 'undefined' && interviewId) {
            const storageKey = `gaze_calibration_bounds_${interviewId}`;
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                try {
                    const bounds = JSON.parse(saved);
                    setCalibration(prev => ({
                        ...prev,
                        isCalibrated: true,
                        bounds
                    }));
                    setGazeStatus(ZONES.CENTER);
                    console.log('[GazeTracker] Restored calibration from storage');
                } catch (e) {
                    console.error('Failed to parse saved calibration', e);
                }
            } else {
                // Explicitly ensure not calibrated if no key exists (New Session)
                setCalibration(prev => ({ ...prev, isCalibrated: false }));
            }
        }
    }, [interviewId]);

    /* ---------------- CALIBRATION API ---------------- */
    const startCalibration = useCallback(() => {
        console.log('[GazeTracker] Starting Calibration Mode...');

        // Clear storage to force fresh start
        if (typeof window !== 'undefined' && interviewId) {
            const storageKey = `gaze_calibration_bounds_${interviewId}`;
            localStorage.removeItem(storageKey);
        }

        setCalibration(prev => ({ ...prev, isCalibrated: false, points: {}, bounds: null }));
        stateRef.current.isCalibrating = true;
        stateRef.current.calibrationBuffer = [];
        stateRef.current.calibrationPoints = {};
        setGazeStatus('CALIBRATING');
        toast.info('Calibration started', { id: 'calibration-status' });
    }, []);

    const resetCalibrationBuffer = useCallback(() => {
        stateRef.current.calibrationBuffer = [];
    }, []);

    const captureCalibrationPoint = useCallback((pointKey) => {
        const s = stateRef.current;
        const buffer = s.calibrationBuffer;

        if (buffer.length < 10) {
            console.warn(`[GazeTracker] Point ${pointKey}: Need more frames (${buffer.length}/10)`);
            toast.warning(`Hold steady... (${buffer.length}/10 frames)`, { id: 'calibration-capture' });
            return false;
        }

        const recentFrames = buffer.slice(-40);
        const avgX = recentFrames.reduce((sum, p) => sum + p.x, 0) / recentFrames.length;
        const avgY = recentFrames.reduce((sum, p) => sum + p.y, 0) / recentFrames.length;

        console.log(`[GazeTracker] ✓ Captured ${pointKey}: (${avgX.toFixed(4)}, ${avgY.toFixed(4)})`);

        s.calibrationPoints[pointKey] = { x: avgX, y: avgY };

        setCalibration(prev => ({
            ...prev,
            points: {
                ...prev.points,
                [pointKey]: { x: avgX, y: avgY }
            }
        }));

        s.calibrationBuffer = [];
        toast.success(`✓ Point ${pointKey} captured!`, { id: 'calibration-capture' });
        return true;
    }, []);

    const finalizeCalibration = useCallback(() => {
        const points = stateRef.current.calibrationPoints;

        if (!points.TL || !points.BR || !points.BL || !points.TR) {
            console.error('[GazeTracker] Missing calibration points!', points);
            toast.error("Missing calibration points. Please complete all 4 corners.", { id: 'calibration-status' });
            return false;
        }

        const leftEdge = (points.TL.x + points.BL.x) / 2;
        const rightEdge = (points.TR.x + points.BR.x) / 2;
        const topEdge = (points.TL.y + points.TR.y) / 2;
        const bottomEdge = (points.BL.y + points.BR.y) / 2;

        let minX = Math.min(leftEdge, rightEdge);
        let maxX = Math.max(leftEdge, rightEdge);
        let minY = Math.min(topEdge, bottomEdge);
        let maxY = Math.max(topEdge, bottomEdge);

        // EXPAND BOUNDS by 60% (Very Relaxed)
        const width = maxX - minX;
        const height = maxY - minY;
        const PADDING_X = width * 0.60;
        const PADDING_Y = height * 0.60;

        const bounds = {
            minX: minX - PADDING_X,
            maxX: maxX + PADDING_X,
            minY: minY - PADDING_Y,
            maxY: maxY + PADDING_Y,
        };

        console.log('[GazeTracker] ✓ Calibration Complete. Bounds:', bounds);

        setCalibration(prev => ({
            ...prev,
            isCalibrated: true,
            bounds
        }));

        // Persist to storage (Scoped by Interview ID)
        if (typeof window !== 'undefined' && interviewId) {
            const storageKey = `gaze_calibration_bounds_${interviewId}`;
            localStorage.setItem(storageKey, JSON.stringify(bounds));
        }

        stateRef.current.isCalibrating = false;
        setGazeStatus(ZONES.CENTER);
        toast.success("✓ Calibration complete! Tracking started.", { id: 'calibration-status' });
        return true;
    }, [interviewId]);

    /* ---------------- ZONE LOGIC ---------------- */
    const getZoneFromBounds = useCallback((x, y, bounds) => {
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;

        if (width === 0 || height === 0) return ZONES.CENTER;

        const nx = (x - bounds.minX) / width;
        const ny = (y - bounds.minY) / height;

        // "Out of Screen" - Strict limits (0.0 - 1.0)
        // Anything outside the padded calibration box is "Out of Screen"
        if (nx < 0.0) return 'Out of Screen (Right)'; // Small X = Right
        if (nx > 1.0) return 'Out of Screen (Left)';  // Large X = Left

        // Y-Axis: Standard Logic (0 = Top, 1 = Bottom)
        if (ny < 0.0) return ZONES.UP;                  // Top (Thinking/Ceiling)
        if (ny > 1.0) return 'Out of Screen (Down)';    // Bottom (Keyboard/Phone)

        // Map to 3x3 Grid - BALANCED
        let horiz = 'Center';
        if (nx < 0.25) horiz = 'Right';  // Small X = Right
        else if (nx > 0.75) horiz = 'Left'; // Large X = Left

        let vert = 'Middle';
        // Standard Top/Bottom Logic
        if (ny < 0.25) vert = 'Top';    // Small Y = Top
        else if (ny > 0.75) vert = 'Bottom'; // Large Y = Bottom

        // Combine
        if (horiz === 'Center' && vert === 'Middle') return ZONES.CENTER;

        if (horiz === 'Center') {
            if (vert === 'Top') return ZONES.UP;
            if (vert === 'Bottom') return ZONES.CENTER_BOTTOM;
            return ZONES.CENTER;
        }

        if (vert === 'Middle') {
            return `${horiz}-middle`;  // Side middle is fine
        }

        return `${horiz}-${vert}`;
    }, []);

    /* ---------------- PROCESS RULES (NO AUTO-TERMINATION) ---------------- */
    const processRules = useCallback((now, isFaceMissing, gaze, faceCount = 1) => {
        const st = statusRef.current;
        const s = stateRef.current;
        const cal = calibrationRef.current;

        let effectiveZone = ZONES.CENTER;

        if (isFaceMissing) {
            s.consecutiveNoFaceFrames++;
            // Only trigger NO_FACE after many consecutive frames
            if (s.consecutiveNoFaceFrames > 10) {
                effectiveZone = ZONES.NO_FACE;
            } else {
                return; // Don't process yet
            }
        } else if (faceCount > 1) {
            effectiveZone = ZONES.MULTIPLE_FACES;
            s.consecutiveNoFaceFrames = 0;
        } else {
            s.consecutiveNoFaceFrames = 0;
            // Only check gaze awareness if calibrated. Otherwise assume CENTER (Safe)
            if (cal.isCalibrated && cal.bounds) {
                effectiveZone = getZoneFromBounds(gaze.x, gaze.y, cal.bounds);
            } else {
                effectiveZone = ZONES.CENTER;
            }
        }

        // Update zone
        if (effectiveZone !== s.currentZone) {
            console.log(`[GazeTracker] Zone change: ${s.currentZone} → ${effectiveZone}`);
            s.currentZone = effectiveZone;
            s.zoneStartTime = now;
            s.lastLogTime = 0;
            setGazeStatus(effectiveZone);

            // Clear warnings when returning to safe zone
            if (!isViolationZone(effectiveZone)) {
                violationSuppressionRef.current = false;
                setStatus(prev => ({
                    ...prev,
                    isWarning: false,
                    warningMessage: '',
                    direction: null,
                    isCritical: false,
                    shouldTerminate: false  // ALWAYS FALSE
                }));
            }
        }

        const duration = now - s.zoneStartTime;

        // Only log violations for actual violation zones
        if (isViolationZone(effectiveZone)) {
            const severity = getSeverity(duration, effectiveZone);

            // Log violation (Critical bypasses cooldown)
            if (severity &&
                (!violationSuppressionRef.current || severity === 'Critical') &&
                ((now - lastViolationRef.current > CONFIG.STRIKE_COOLDOWN_MS) || severity === 'Critical')) {

                violationSuppressionRef.current = true;
                lastViolationRef.current = now;

                const newStrikeCount = st.strikeCount + 1;

                console.log(`[GazeTracker] Violation #${newStrikeCount}: ${severity} - ${effectiveZone} (${(duration / 1000).toFixed(1)}s)`);

                // Update status - NO TERMINATION
                setStatus(prev => ({
                    ...prev,
                    strikeCount: newStrikeCount,
                    isWarning: true,
                    warningMessage: `${severity}: ${effectiveZone}`,
                    direction: effectiveZone,
                    isCritical: severity === 'Critical',
                    shouldTerminate: false  // LOCKED TO FALSE
                }));

                // Show appropriate toast
                // Show appropriate toast - EXCEPT for Multiple Faces as requested
                if (effectiveZone !== ZONES.MULTIPLE_FACES) {
                    const msg = `${severity} Violation: ${effectiveZone} (${(duration / 1000).toFixed(1)}s) - Strike ${newStrikeCount}`;
                    if (severity === 'Critical') {
                        toast.error(msg, { id: 'gaze-violation', duration: 5000 });
                    } else if (severity === 'High') {
                        toast.error(msg, { id: 'gaze-violation', duration: 4000 });
                    } else {
                        toast.warning(msg, { id: 'gaze-violation', duration: 3000 });
                    }
                }

                // Call violation callback
                if (onViolation) {
                    onViolation({
                        zone: effectiveZone,
                        type: effectiveZone, // CHANGED: Use the actual violation name (e.g. "Multiple Faces")
                        duration: `${(duration / 1000).toFixed(1)}s`,
                        severity: severity,
                        reason: getViolationReason(effectiveZone),
                        timestamp: new Date().toISOString(),
                        strikeCount: newStrikeCount,
                        willTerminate: false  // ALWAYS FALSE
                    });
                }

                // Re-enable violations after cooldown
                setTimeout(() => {
                    violationSuppressionRef.current = false;
                }, CONFIG.STRIKE_COOLDOWN_MS);
            }
        } else {
            // In safe zone
            if (st.isWarning && duration > CONFIG.RETURN_TO_CENTER_MS) {
                setStatus(prev => ({
                    ...prev,
                    isWarning: false,
                    warningMessage: '',
                    direction: null,
                    isCritical: false,
                    shouldTerminate: false  // ALWAYS FALSE
                }));
            }
        }

        // Update time tracking
        if (effectiveZone !== ZONES.CENTER) {
            setTimeOffCenter(duration);
        } else {
            setTimeOffCenter(0);
        }
    }, [getZoneFromBounds, onViolation]);

    /* ---------------- FACEMESH ---------------- */
    const onResults = useCallback((res) => {
        if (!isEnabled) return;
        const now = Date.now();
        const state = stateRef.current;

        state.totalFramesProcessed++;

        // Track peak faces in this window
        const currentFaceCount = res.multiFaceLandmarks?.length || 0;
        if (currentFaceCount > state.maxFacesInThrottleWindow) {
            state.maxFacesInThrottleWindow = currentFaceCount;
        }

        // No face detected
        if (!res.multiFaceLandmarks?.length) {
            if (now - lastRuleRunRef.current > CONFIG.RULE_THROTTLE_MS) {
                lastRuleRunRef.current = now;
                processRules(now, true, null);
                state.maxFacesInThrottleWindow = 0; // Reset
            }
            return;
        }

        const lm = res.multiFaceLandmarks[0];

        // Blink detection
        const ear = (distance(lm[159], lm[145]) + distance(lm[386], lm[374])) /
            (distance(lm[33], lm[133]) + distance(lm[362], lm[263]));
        if (ear < CONFIG.BLINK_THRESHOLD) return;

        // Calculate gaze
        const rg = getEyeGaze(lm[468], lm[33], lm[133], lm[159], lm[145]);
        const lg = getEyeGaze(lm[473], lm[362], lm[263], lm[386], lm[374]);
        const targetX = (rg.x + lg.x) / 2;
        const targetY = (rg.y + lg.y) / 2;

        // Ultra-smooth transitions
        state.gaze.x = CONFIG.SMOOTHING_ALPHA * targetX + (1 - CONFIG.SMOOTHING_ALPHA) * state.gaze.x;
        state.gaze.y = CONFIG.SMOOTHING_ALPHA * targetY + (1 - CONFIG.SMOOTHING_ALPHA) * state.gaze.y;

        // Calibration mode
        if (state.isCalibrating) {
            state.calibrationBuffer.push({ x: state.gaze.x, y: state.gaze.y });
            if (state.calibrationBuffer.length > 150) state.calibrationBuffer.shift();
            return;
        }

        // Process rules - ALWAYS run this to detect Multiple Faces / No Face even before calibration
        // if (calibrationRef.current.isCalibrated) { 
        if (now - lastRuleRunRef.current > CONFIG.RULE_THROTTLE_MS) {
            lastRuleRunRef.current = now;

            // Use the PEAK face count seen in the last 300ms, not just right now
            // This catches flickery partial faces that might only appear in 1 of 10 frames
            const peakFaces = Math.max(state.maxFacesInThrottleWindow, res.multiFaceLandmarks.length);

            // Pass face count
            processRules(now, false, state.gaze, peakFaces);

            // Reset peak for next window
            state.maxFacesInThrottleWindow = 0;
        }
        // }
    }, [processRules, isEnabled]);

    // Initialize FaceMesh
    useEffect(() => {
        if (!isEnabled || !videoRef.current) return;
        let cancelled = false;

        const init = async () => {
            try {
                const { FaceMesh } = await import('@mediapipe/face_mesh');
                const fm = new FaceMesh({
                    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
                });

                fm.setOptions({
                    maxNumFaces: 4, // More buffer
                    refineLandmarks: true,
                    minDetectionConfidence: 0.35, // Balanced for partial faces vs hands
                    minTrackingConfidence: 0.35   // Balanced for partial faces vs hands
                });

                fm.onResults(r => !cancelled && onResults(r));
                faceMeshRef.current = fm;

                const loop = async () => {
                    if (cancelled) return;
                    frameRef.current++;

                    if (frameRef.current % CONFIG.FRAME_SKIP === 0 &&
                        videoRef.current &&
                        videoRef.current.readyState >= 2) {
                        try {
                            await fm.send({ image: videoRef.current });
                        } catch (e) {
                            // Silent catch - frame processing errors are normal
                        }
                    }
                    rafRef.current = requestAnimationFrame(loop);
                };

                console.log('[GazeTracker] Initialized successfully');
                loop();
            } catch (error) {
                console.error('[GazeTracker] Init error:', error);
                toast.error('Gaze tracking initialization failed');
            }
        };

        init();

        return () => {
            cancelled = true;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (faceMeshRef.current) faceMeshRef.current.close();
            console.log('[GazeTracker] Cleaned up');
        };
    }, [isEnabled, onResults]);

    return {
        gazeStatus,
        status: {
            ...status,
            shouldTerminate: false  // Force to false always
        },
        timeOffCenter,
        isCalibrated: calibration.isCalibrated,
        startCalibration,
        captureCalibrationPoint,
        resetCalibrationBuffer,
        finalizeCalibration,
        CONFIG,
        debugData: {
            gaze: stateRef.current.gaze,
            bounds: calibration.bounds,
            currentZone: stateRef.current.currentZone,
            framesProcessed: stateRef.current.totalFramesProcessed,
            autoTerminationEnabled: CONFIG.ENABLE_AUTO_TERMINATION  // Always false
        }
    };
};

```


## File: app/interview/[interview_id]/coding/_components/CodingConsole.jsx
```javascript
import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useTheme } from 'next-themes';
import {
    Play,
    Send,
    Settings,
    Terminal as TerminalIcon,
    Moon,
    Sun,
    RotateCcw,
    Maximize2,
    Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BOILERPLATES, LANGUAGE_OPTIONS } from '../_constants/boilerplates';

const CodingConsole = ({
    code,
    setCode,
    language,
    setLanguage,
    onRun,
    onSubmit,
    isSubmitting,
    isRunning,
    output,
    outputStatus, // 'success', 'error', 'pending', 'idle'
    timeLeft
}) => {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState('output'); // 'output' | 'problems'
    const [fontSize, setFontSize] = useState(14);

    const [consoleHeight, setConsoleHeight] = useState(35); // Percentage
    const [isDragging, setIsDragging] = useState(false);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        e.preventDefault();
    };

    useEffect(() => {
        setMounted(true);
    }, []);

    // Sync Monaco theme with Next-themes
    const editorTheme = mounted && theme === 'dark' ? 'vs-dark' : 'light';

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            const windowHeight = window.innerHeight;
            const newHeight = ((windowHeight - e.clientY) / windowHeight) * 100;
            if (newHeight > 10 && newHeight < 80) { // Limit between 10% and 80%
                setConsoleHeight(newHeight);
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);


    const handleCopyPaste = (e) => {
        e.preventDefault();
        e.stopPropagation();
        toast.warning("Copy/Paste is disabled during the interview.", {
            className: 'bg-red-50 border-red-200 text-red-800'
        });
    };

    // Global Event Listener for robust blocking
    useEffect(() => {
        const blockAction = (e) => handleCopyPaste(e);

        window.addEventListener('copy', blockAction);
        window.addEventListener('cut', blockAction);
        window.addEventListener('paste', blockAction);
        window.addEventListener('contextmenu', (e) => e.preventDefault());

        return () => {
            window.removeEventListener('copy', blockAction);
            window.removeEventListener('cut', blockAction);
            window.removeEventListener('paste', blockAction);
            window.removeEventListener('contextmenu', (e) => e.preventDefault());
        };
    }, []);

    // Handle Editor Mount to block paste internally
    const handleEditorDidMount = (editor, monaco) => {
        const domNode = editor.getContainerDomNode();

        const stopAction = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toast.warning("Action disabled: Anti-cheating protocol active.", {
                className: 'bg-red-50 border-red-200 text-red-800'
            });
        }

        domNode.addEventListener('paste', stopAction, true);
        domNode.addEventListener('copy', stopAction, true);
        domNode.addEventListener('cut', stopAction, true);
        domNode.addEventListener('contextmenu', stopAction, true);

        // Also block via keybindings if possible or relying on DOM events
        editor.onKeyDown((e) => {
            const { keyCode, ctrlKey, metaKey } = e;
            if ((ctrlKey || metaKey) && (keyCode === 33 /* KeyV */ || keyCode === 31 /* KeyC */ || keyCode === 52 /* KeyX */)) {
                e.preventDefault();
                e.stopPropagation();
                toast.warning("Keyboard shortcuts disabled.", {
                    className: 'bg-red-50 border-red-200 text-red-800'
                });
            }
        });
    };

    return (
        <div
            className="flex flex-col h-full bg-gray-50 dark:bg-black/20 overflow-hidden cursor-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJibGFjayIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIxIj48cGF0aCBkPSJNNSAzLjIxbDEwLjA4IDkuMzgtNC4yNyAxLjE1IDIuMTYgNC45Ny0yLjAyLjktMi4xOC01LjA0LTMuMSAzLjI2VjMuMjF6Ii8+PC9zdmc+'),_auto] select-none"
            onCopy={handleCopyPaste}
            onCut={handleCopyPaste}
            onPaste={handleCopyPaste}
            onContextMenu={(e) => {
                e.preventDefault();
                toast.warning("Right-click is disabled.");
            }}
        >

            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-[#1e1e1e] border-b border-gray-200 dark:border-[#333] h-14 shrink-0">
                {/* ... (Toolbar content remains same, just ensuring no overflow here too) ... */}
                {/* Left: Language & Settings */}
                <div className="flex items-center gap-3">
                    <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="w-[140px] h-9 bg-gray-50 dark:bg-[#2d2d2d] border-gray-200 dark:border-[#444] text-xs font-medium focus:ring-violet-500">
                            <SelectValue placeholder="Language" />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-[#1e1e1e] dark:border-[#333]">
                            {LANGUAGE_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="h-6 w-px bg-gray-200 dark:bg-[#444] mx-1" />

                    {/* Font Size Controls (Mini) */}
                    <div className="flex items-center bg-gray-50 dark:bg-[#2d2d2d] rounded-md border border-gray-200 dark:border-[#444] p-0.5">
                        <button
                            onClick={() => setFontSize(Math.max(10, fontSize - 1))}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                        >
                            A-
                        </button>
                        <button
                            onClick={() => setFontSize(Math.min(24, fontSize + 1))}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                        >
                            A+
                        </button>
                    </div>
                </div>

                {/* Right: Actions & Theme */}
                <div className="flex items-center gap-3">
                    {/* Theme Toggle */}
                    {/* Theme Toggle Hidden */}

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onRun}
                        disabled={isRunning || isSubmitting}
                        className="h-9 gap-2 bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-200 dark:bg-[#2d2d2d] dark:hover:bg-[#3d3d3d] dark:text-gray-200 dark:border-[#444]"
                    >
                        {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                        Run Code
                    </Button>

                    <Button
                        size="sm"
                        onClick={onSubmit}
                        disabled={isSubmitting || isRunning}
                        className="h-9 gap-2 bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20"
                    >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Submit
                    </Button>
                </div>
            </div>

            {/* Editor Area (Flex-Grow) */}
            <div className="flex-1 relative min-h-0 bg-white dark:bg-[#1e1e1e]">
                <Editor
                    height="100%"
                    language={language}
                    value={code}
                    onMount={handleEditorDidMount}
                    onChange={(val) => setCode(val || '')}
                    theme={editorTheme}
                    options={{
                        mouseStyle: 'default',
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: fontSize,
                        wordWrap: 'on',
                        padding: { top: 16 },
                        fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
                        fontLigatures: true,
                        smoothScrolling: true,
                        cursorBlinking: 'smooth',
                        renderLineHighlight: 'all',
                        hideCursorInOverviewRuler: true,
                        overviewRulerBorder: false,
                        scrollbar: {
                            vertical: 'hidden', // "Hide scrollbars inside the code editor for a clean UI."
                            horizontal: 'hidden',
                            handleMouseWheel: true
                        }
                    }}
                />
            </div>

            {/* Draggable Console Panel */}
            <div
                className="shrink-0 bg-white dark:bg-[#1e1e1e] border-t border-gray-200 dark:border-[#333] flex flex-col relative shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-10"
                style={{ height: `${consoleHeight}%`, transition: isDragging ? 'none' : 'height 0.3s ease' }}
            >
                {/* Drag Handle */}
                <div
                    className="absolute -top-3 left-0 right-0 h-6 cursor-row-resize flex items-center justify-center group z-20 hover:bg-violet-500/5 transition-colors"
                    onMouseDown={handleMouseDown}
                >
                    <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full group-hover:bg-violet-400 transition-colors" />
                </div>

                {/* Terminal Tabs */}
                <div className="flex items-center px-4 border-b border-gray-100 dark:border-[#333] bg-gray-50 dark:bg-[#252526] select-none">
                    <button
                        className={`py-2 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2
                ${activeTab === 'output'
                                ? 'border-violet-600 text-violet-600 dark:text-violet-400'
                                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
                        onClick={() => setActiveTab('output')}
                    >
                        <TerminalIcon size={14} />
                        Console Output
                    </button>
                    <div className="ml-auto text-xs text-gray-400 hidden sm:block">
                        {isDragging ? 'Dragging...' : 'Drag handle to resize'}
                    </div>
                </div>

                {/* Terminal Content - Scrollbar Hidden via CSS */}
                <div className="flex-1 p-4 overflow-y-auto font-mono text-sm bg-white dark:bg-[#1e1e1e]
                     scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-gray-200 dark:hover:scrollbar-thumb-gray-700 scrollbar-track-transparent">
                    {outputStatus === 'pending' || isRunning ? (
                        <div className="flex items-center gap-2 text-gray-500 mt-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Executing code...</span>
                        </div>
                    ) : output ? (
                        <pre className={`whitespace-pre-wrap ${outputStatus === 'error' ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 p-2 rounded' : 'text-gray-800 dark:text-gray-300'
                            }`}>
                            {output}
                        </pre>
                    ) : (
                        <div className="text-gray-400 dark:text-gray-600 italic text-xs mt-2">
                            Run your code to see output here...
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default CodingConsole;

```


## File: app/interview/[interview_id]/coding/_components/QuestionPanel.jsx
```javascript
import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertCircle } from 'lucide-react';

const QuestionPanel = ({ question, timeLeft, formatTime }) => {
    if (!question) return null;

    return (
        <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start bg-white dark:bg-gray-900">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                        {question.title || 'Coding Challenge'}
                    </h1>
                    <div className="flex gap-2">
                        <Badge variant="secondary" className="bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300">
                            {question.difficulty || 'Medium'}
                        </Badge>
                        <Badge variant="outline" className="text-gray-500 border-gray-200 dark:border-gray-700 dark:text-gray-400">
                            {question.topic || 'Algorithms'}
                        </Badge>
                    </div>
                </div>

                {/* Timer Display if needed here, but usually it's global. Keep it simple. */}
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
                <div className="p-6 space-y-8">

                    {/* Description */}
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                        <p className="whitespace-pre-wrap text-base leading-relaxed text-gray-700 dark:text-gray-300">
                            {question.description}
                        </p>
                    </div>

                    {/* Examples */}
                    {question.examples && question.examples.length > 0 && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Examples</h3>
                            {question.examples.map((ex, i) => (
                                <div key={i} className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-xl p-4 transition-all hover:border-violet-200 dark:hover:border-violet-800">
                                    <div className="grid gap-3">
                                        <div>
                                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1 block">Input</span>
                                            <code className="block bg-white dark:bg-gray-950 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 font-mono text-sm text-gray-800 dark:text-gray-200 shadow-sm overflow-x-auto">
                                                {ex.input}
                                            </code>
                                        </div>
                                        <div>
                                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1 block">Output</span>
                                            <code className="block bg-white dark:bg-gray-950 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 font-mono text-sm text-gray-800 dark:text-gray-200 shadow-sm overflow-x-auto">
                                                {ex.output}
                                            </code>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Constraints */}
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                            <h3 className="text-sm font-bold text-amber-900 dark:text-amber-500 uppercase tracking-wider">Constraints & Notes</h3>
                        </div>
                        <ul className="list-disc list-inside space-y-2 text-sm text-amber-900/80 dark:text-amber-200/80">
                            <li>Time Complexity: O(n) preferred</li>
                            <li>Values usually fit within standard integer ranges unless specified.</li>
                            <li>Write clean, modular code.</li>
                        </ul>
                    </div>

                </div>
            </ScrollArea>
        </div>
    );
};

export default QuestionPanel;

```


## File: app/interview/[interview_id]/coding/_constants/boilerplates.js
```javascript
export const BOILERPLATES = {
    javascript: `// JavaScript Solution
// Write your code here

/**
 * @param {any} input
 * @return {any}
 */
function solve(input) {
  // Your logic here
  return input;
}

console.log("Hello World");
`,
    python: `# Python Solution
import sys
import math

def solve():
    # Write your code here
    pass

if __name__ == '__main__':
    print("Hello World")
    solve()
`,
    java: `// Java Solution
import java.util.*;
import java.io.*;

public class Solution {
    public static void main(String[] args) {
        System.out.println("Hello World");
        // Write your code here
    }
}
`,
    cpp: `// C++ Solution
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

using namespace std;

int main() {
    cout << "Hello World" << endl;
    // Write your code here
    return 0;
}
`,
    c: `// C Solution
#include <stdio.h>
#include <stdlib.h>

int main() {
    printf("Hello World\\n");
    // Write your code here
    return 0;
}
`,
    go: `// Go Solution
package main

import "fmt"

func main() {
    fmt.Println("Hello World")
    // Write your code here
}
`,
    sql: `-- SQL Solution
-- Write your query here
SELECT 'Hello World';
`
};

export const LANGUAGE_OPTIONS = [
    { value: 'javascript', label: 'JavaScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'cpp', label: 'C++' },
    { value: 'c', label: 'C' },
    { value: 'go', label: 'Go' },
    { value: 'sql', label: 'SQL' },
];

```


## File: app/api/interview/anti-cheating-event/route.js
```javascript
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req) {
    try {
        const body = await req.json();
        const { interview_id, event_type, email, candidate_name, timestamp_str, timestamp } = body;

        // 0. Normalize Inputs
        const normalizedEmail = email?.toLowerCase().trim();
        const normalizedInterviewId = interview_id?.trim();

        if (!normalizedInterviewId) {
            return NextResponse.json({ error: 'Missing interview_id' }, { status: 400 });
        }

        const cookieStore = await cookies();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        // Debug Key Usage (Safe Log)
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.warn('[AntiCheating] WARNING: SUPABASE_SERVICE_ROLE_KEY is missing. Using ANON_KEY. Violations insert might fail if RLS is enabled.');
        } else {
            console.log('[AntiCheating] Using Service Role Key for privileged operations.');
        }

        const supabase = createServerClient(
            supabaseUrl,
            supabaseKey,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch { }
                    },
                },
            }
        );

        // 1. Fetch or Create Result Record
        let { data: records, error: fetchError } = await supabase
            .from('interview_results')
            .select('id, anti_cheating_state, fullname, violation_count, interview_id')
            .eq('interview_id', normalizedInterviewId)
            .eq('email', normalizedEmail)
            .order('id', { ascending: false })
            .limit(1);

        if (fetchError) {
            console.error('[anti-cheating] Fetch error:', fetchError);
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        let record;

        if (!records || records.length === 0) {
            // Initial State
            const initialState = {
                visibility_hidden_count: 0,
                window_blur_count: 0,
                total_focus_loss_events: 0,
                suspicious_score: 0,
                max_allowed_score: 3,
                interview_status: 'in_progress',
                last_event_at: new Date().toISOString()
            };

            const { data: upsertData, error: upsertError } = await supabase
                .from('interview_results')
                .upsert({
                    interview_id: normalizedInterviewId,
                    email: normalizedEmail,
                    fullname: candidate_name,
                    anti_cheating_state: initialState,
                    violation_count: 0,
                    is_completed: false
                }, {
                    onConflict: 'interview_id,email',
                    ignoreDuplicates: false
                })
                .select('id, anti_cheating_state, fullname, violation_count')
                .single();

            if (upsertError) {
                console.error('[anti-cheating] Upsert error:', upsertError);
                return NextResponse.json({ error: upsertError.message }, { status: 500 });
            }
            record = upsertData;
        } else {
            record = records[0];
        }

        const recordId = record.id;
        let state = record.anti_cheating_state || {};

        // 2. DEFINE ATOMIC EVENT LOGGING
        // If it's a violation event, log it to the 'violations' table first.
        // This makes the count persistent even if JSONB overwrites happen.
        if (event_type === 'visibility_hidden' || event_type === 'window_blur' || event_type === 'mouse_leave') {
            const violationType = event_type === 'mouse_leave' ? 'Mouse Exit' : 'Tab Switch';

            // Format reason with relative timestamp if available [MM:SS]
            const reasonText = timestamp_str
                ? `[${timestamp_str}] User lost focus: ${event_type}`
                : `User lost focus: ${event_type}`;

            const { data: violationData, error: violationError } = await supabase.from('violations').insert({
                interview_id: normalizedInterviewId,
                user_email: normalizedEmail,
                type: violationType,
                severity: 'high',
                reason: reasonText,
                occurred_at: timestamp || new Date().toISOString() // Use client timestamp if available
            })
                .select();

            if (violationError) {
                console.error('[AntiCheating] Violation Insert Error:', violationError);
            }
        }

        // 3. RECALCULATE DEFENITIVE COUNT FROM VIOLATIONS LOG
        // We count focus loss events (Tab Switch + Mouse Exit) to determine the new state.
        const { count: focusLossCount, error: countError } = await supabase
            .from('violations')
            .select('*', { count: 'exact', head: true })
            .eq('interview_id', normalizedInterviewId)
            .eq('user_email', normalizedEmail)
            .in('type', ['Tab Switch', 'Mouse Exit']);

        if (countError) {
            console.error('[anti-cheating] Count error:', countError);
        }

        // 3.1 UPDATE DURATION ON RETURN (window_focus or mouse_enter)
        if ((event_type === 'window_focus' || event_type === 'mouse_enter') && body.durationMs && body.durationMs > 0) {
            // Find the latest open violation (where duration is null)
            const { data: latestViolation, error: findError } = await supabase
                .from('violations')
                .select('id')
                .eq('interview_id', normalizedInterviewId)
                .eq('user_email', normalizedEmail)
                .in('type', ['Tab Switch', 'Mouse Exit'])
                .is('duration', null)
                .order('occurred_at', { ascending: false })
                .limit(1)
                .single();

            if (latestViolation && !findError) {
                // Update duration
                await supabase
                    .from('violations')
                    .update({
                        // Postgres interval format: 'X milliseconds' works
                        duration: `${Math.round(body.durationMs)} milliseconds`
                    })
                    .eq('id', latestViolation.id);

                console.log(`[AntiCheating] Updated duration for violation ${latestViolation.id}: ${body.durationMs}ms`);
            }
        }

        // Update the state object based on the definitive DB count
        const currentCount = countError ? (state.total_focus_loss_events || 0) + (event_type === 'window_focus' ? 0 : 1) : (focusLossCount || 0);

        // Define specific rules constants
        const MAX_ALLOWED_SCORE = 3;

        // Merge and update state
        state = {
            ...state,
            total_focus_loss_events: currentCount,
            suspicious_score: currentCount,
            max_allowed_score: MAX_ALLOWED_SCORE,
            last_event_at: new Date().toISOString(),
            interview_status: state.interview_status || 'in_progress'
        };

        // Track internal counts in JSONB too for legacy compatibility
        if (event_type === 'visibility_hidden') {
            state.visibility_hidden_count = (state.visibility_hidden_count || 0) + 1;
        } else if (event_type === 'window_blur') {
            state.window_blur_count = (state.window_blur_count || 0) + 1;
        } else if (event_type === 'mouse_leave') {
            state.mouse_leave_count = (state.mouse_leave_count || 0) + 1;
        }

        // 4. Enforce Rules
        if (state.suspicious_score >= state.max_allowed_score && state.interview_status === 'in_progress') {
            state.interview_status = 'auto_completed';

            // Update interview_sessions
            if (normalizedEmail) {
                try {
                    const completedAt = new Date().toISOString();
                    await supabase
                        .from('interview_sessions')
                        .update({
                            session_status: 'auto_completed',
                            completed_at: completedAt
                        })
                        .eq('interview_id', normalizedInterviewId)
                        .eq('user_email', normalizedEmail);

                    // console.log('[anti-cheating] session marked as auto_completed');
                } catch (e) {
                    console.error('[anti-cheating] Failed to update session:', e);
                }
            }
        }

        // 5. Persist to Supabase with normalized payload
        const updatePayload = {
            anti_cheating_state: state,
            violation_count: state.total_focus_loss_events, // Sync integer column
            fullname: candidate_name || record.fullname
        };

        if (state.interview_status === 'auto_completed') {
            updatePayload.completed_at = new Date().toISOString();
            updatePayload.is_completed = true;
        }

        const { error: updateError } = await supabase
            .from('interview_results')
            .update(updatePayload)
            .eq('id', recordId);

        if (updateError) {
            console.error('[AntiCheating] Final Update Error:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json(state);

    } catch (error) {
        console.error('Anti-cheating API Error:', error);
        // Return more specific error info for debugging
        return NextResponse.json({
            error: 'Internal Server Error',
            details: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}

```


## File: app/api/interview/finalize/route.js
```javascript

import { NextResponse } from 'next/server';
import { performFinalization } from '@/lib/interview/finalization';
import { logger } from '@/lib/logger';

export async function POST(req) {
    try {
        const body = await req.json();
        const { interview_id, email, fullname, transcript, anti_cheating_state, reason } = body;

        if (!interview_id || !email) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const result = await performFinalization({
            interview_id,
            email,
            fullname,
            transcript,
            anti_cheating_state,
            reason
        });

        if (result.success) {
            return NextResponse.json({ success: true, sessionId: result.sessionId });
        } else {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }
    } catch (err) {
        logger.error('Finalization API Error:', err);
        return NextResponse.json(
            { error: err.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}

```


## File: app/api/interview/get-violations/route.js
```javascript

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const interview_id = searchParams.get('interview_id');
        const email = searchParams.get('email'); // Optional filter

        if (!interview_id) {
            return NextResponse.json({ error: 'Missing interview_id' }, { status: 400 });
        }

        const cookieStore = await cookies();

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        // cookies().set(name, value, options)
                    },
                },
            }
        );

        let query = supabase
            .from(process.env.NEXT_PUBLIC_VIOLATIONS_TABLE_NAME || 'violations')
            // Select all, plus map user_email->email and occurred_at->timestamp for frontend compatibility
            .select('*, email:user_email, timestamp:occurred_at')
            .eq('interview_id', interview_id);

        // Optional: Filter by specific email if provided (strict server-side filtering)
        // But we usually filter on client for robustness with case sensitivity.
        // Let's just return all for the interview ID and let client filter, 
        // OR filtering here is safer if we trust the email param.
        // Given the previous requirement of case-insensitive issue, fetching all and filtering on client 
        // (or filtering loosely here) is the way. Let's fetch all for ID.

        const { data, error } = await query.order('occurred_at', { ascending: true });

        if (error) {
            console.error('Supabase Violation Fetch Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ violations: data || [] });

    } catch (error) {
        console.error('Get Violations API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

```


## File: app/api/interview/log-violation/route.js
```javascript

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req) {
    try {
        const body = await req.json();
        // Check if body is array (Bulk) or object (Single)
        const entries = Array.isArray(body) ? body : [body];

        if (entries.length === 0) return NextResponse.json({ success: true });

        const cookieStore = await cookies();

        // Use Service Role Key if available to bypass RLS
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        const supabase = createServerClient(
            supabaseUrl,
            supabaseKey,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        // Optional
                    },
                },
            }
        );

        // Map entries to DB format (User Schema Adaptation)
        const records = entries.map(entry => ({
            interview_id: entry.interview_id,
            user_email: entry.email, // Mapped from email
            type: entry.type,
            severity: entry.severity || 'Medium',
            // Postgres INTERVAL is flexible, but let's be safe. '1s' usually works.
            duration: entry.duration || '0 seconds',
            reason: entry.reason || 'Violation detected',
            occurred_at: entry.timestamp || new Date().toISOString() // Mapped from timestamp
        })).filter(r => r.interview_id && r.type); // Basic validation

        if (records.length === 0) {
            return NextResponse.json({ error: 'No valid records' }, { status: 400 });
        }

        // Attempt to insert
        const tableName = process.env.NEXT_PUBLIC_VIOLATIONS_TABLE_NAME || 'violations';

        const { error } = await supabase
            .from(tableName)
            .insert(records);

        if (error) {
            console.error('Supabase Violation Insert Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Log Violation API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

```


## File: app/api/interview/save-results/route.js
```javascript

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req) {
    try {
        const body = await req.json();
        const { interview_id, email, fullname, conversation_transcript, recommendations, completed_at } = body;

        if (!interview_id || !email) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const cookieStore = await cookies();

        // Use Service Role Key if available to bypass RLS, otherwise fallback to Anon Key
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        const supabase = createServerClient(
            supabaseUrl,
            supabaseKey,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch {
                            // Ignored
                        }
                    },
                },
            }
        );

        // Check if record exists
        const { data: existing, error: fetchError } = await supabase
            .from('interview_results')
            .select('id')
            .eq('interview_id', interview_id)
            .single();

        let error;

        if (existing) {
            const { error: updateError } = await supabase
                .from('interview_results')
                .update({
                    conversation_transcript,
                    recommendations,
                    completed_at,
                    fullname // Update name in case it changed
                })
                .eq('id', existing.id);
            error = updateError;
        } else {
            const { error: insertError } = await supabase
                .from('interview_results')
                .insert([{
                    interview_id,
                    email,
                    fullname,
                    conversation_transcript,
                    recommendations,
                    completed_at
                }]);
            error = insertError;
        }

        if (error) {
            console.error('Save Results DB Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Save Results API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

```


## File: lib/interview/finalization.js
```javascript

import { FEEDBACK_PROMPT } from '@/services/Constants';
import { chatWithLLM } from '@/lib/llm';
import { getModelForTask } from '@/lib/getModel';
import { logger } from '@/lib/logger';
import { createClient } from '@supabase/supabase-js';

// Create a server-side client with the service role key to bypass RLS and ensure reliable writes
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const supabase = supabaseAdmin;

/**
 * Shared utility to generate AI feedback for an interview
 * @param {Array|string} conversation - The interview transcript
 * @returns {Promise<Object>} The generated feedback object
 */
export async function generateAIFeedback(conversation) {
    // Ensure conversation is an array
    let transcript = conversation;
    if (typeof transcript === 'string') {
        try {
            transcript = JSON.parse(transcript);
        } catch (e) {
            logger.error('Failed to parse conversation string:', e);
            transcript = [];
        }
    }

    // Check if user has actually participated meaningfully
    const userMessages = Array.isArray(transcript)
        ? transcript.filter((msg) => msg.role === 'user' && msg.content?.trim().length > 0)
        : [];

    const totalUserWords = userMessages.reduce((count, msg) => {
        return count + (msg.content ? msg.content.trim().split(/\s+/).length : 0);
    }, 0);

    if (userMessages.length === 0 || totalUserWords < 5) {
        return {
            vendor: 'manual',
            model: 'manual',
            feedback: {
                rating: { TechnicalSkills: 0, Communication: 0, ProblemSolving: 0, Experience: 0, Behavioral: 0, Thinking: 0 },
                summery: 'Candidate did not participate meaningfully in the interview.',
                Recommendation: 'Not recommended for hire',
                'Recommendation Message': 'The candidate did not provide sufficient responses for evaluation.'
            }
        };
    }

    const FINAL_PROMPT = FEEDBACK_PROMPT.replace('{{conversation}}', JSON.stringify(transcript, null, 2));
    const { vendor, model } = getModelForTask('FEEDBACK');

    const llmRequest = {
        model,
        messages: [{ role: 'user', content: FINAL_PROMPT }]
    };

    const responseText = await chatWithLLM(vendor, llmRequest);

    let parsed = null;
    try {
        parsed = JSON.parse(responseText);
    } catch (err) {
        logger.debug('JSON parse failed → returning raw text:', err);
        parsed = { raw: responseText };
    }

    return { vendor, model, feedback: parsed };
}

/**
 * Finalizes an interview from the server side
 * This is the SINGLE IDEMPOTENT FINALIZATION BARRIER
 */
export async function performFinalization({
    interview_id,
    email,
    fullname: passedFullname,
    transcript,
    anti_cheating_state,
    reason = 'completion'
}) {

    const normalizedEmail = email.toLowerCase().trim();
    const completedAt = new Date().toISOString();

    // 0. Check if already completed to prevent overwrites/spoofing
    // CHANGE: We allow finalization if the existing result is NULL or was 'auto_completed'
    // but not yet truly 'finalized' with feedback.
    const { data: existingResult, error: checkError } = await supabase
        .from('interview_results')
        .select('is_completed, recommendations')
        .eq('interview_id', interview_id)
        .eq('email', normalizedEmail)
        .maybeSingle();

    // If it's already completed AND has recommendations (meaning feedback was generated), skip.
    // If it was completed by Anti-Cheating but has no transcript/feedback, we allow this finalization.
    if (existingResult?.is_completed && existingResult?.recommendations && !existingResult.recommendations.includes('Pending')) {
        logger.warn(`[Finalization] Attempted overwrite for already fully finalized interview: ${interview_id} for ${normalizedEmail}`);
        return { success: true, message: 'Already fully finalized' };
    }

    // 1. Mark interview_sessions as completed (IDEMPOTENT)
    const completionStatus = (reason === 'auto_complete' || reason === 'violation' || reason === 'auto_completed') ? 'auto_completed' : 'completed';

    const { data: sessionData, error: sessionError } = await supabase
        .from('interview_sessions')
        .update({
            session_status: completionStatus,
            completed_at: completedAt,
            current_transcript: transcript
        })
        .eq('interview_id', interview_id)
        .eq('user_email', normalizedEmail)
        .select('id')
        .maybeSingle();

    if (sessionError) {
        logger.error('[Finalization] Error updating session:', sessionError);
    }

    const sessionId = sessionData?.id;
    const fullname = passedFullname || 'Candidate';

    // 2. Determine Anti-Cheating Snapshot
    let finalAntiCheating = anti_cheating_state;
    if (!finalAntiCheating) {
        // Try to fetch existing from interview_results
        const { data: resultData } = await supabase
            .from('interview_results')
            .select('anti_cheating_state')
            .eq('interview_id', interview_id)
            .eq('email', normalizedEmail)
            .maybeSingle();

        finalAntiCheating = resultData?.anti_cheating_state || {
            visibility_hidden_count: 0,
            window_blur_count: 0,
            total_focus_loss_events: 0,
            suspicious_score: 0,
            max_allowed_score: 3,
            interview_status: completionStatus,
            last_event_at: completedAt
        };
    }

    // Ensure status is updated in snapshot
    finalAntiCheating.interview_status = completionStatus;
    const violationCount = finalAntiCheating.total_focus_loss_events || 0;

    // 3. Generate Feedback (Background Safe)
    let feedbackResult = null;
    let recommendationText = 'Recommended';

    try {
        feedbackResult = await generateAIFeedback(transcript);

        // Determine recommendation text
        if (violationCount >= 3) {
            recommendationText = 'Not Recommended - Multiple focus violations detected during interview';
        } else if (violationCount > 0) {
            recommendationText = `Proceed with Caution - ${violationCount} focus violation(s) detected`;
        } else {
            recommendationText = 'Recommended - No violations detected';
        }
    } catch (e) {
        logger.error('[Finalization] AI Feedback generation failed:', e);
    }

    // 4. Upsert interview_results
    const resultPayload = {
        interview_id,
        email: normalizedEmail,
        fullname,
        // ✅ KEY FIX: We store the TRANSCRIPT ARRAY directly in the column
        // but we can also store the AI feedback metadata alongside it if needed.
        // To maintain compatibility with restoration logic, conversation_transcript SHOULD be an array.
        // However, the current dashboard might expect an object with feedback.
        // DECISION: Store object with { transcript, feedback, score }
        conversation_transcript: {
            transcript: transcript || [],
            feedback: feedbackResult?.feedback || null,
            score: (() => {
                const ratings = feedbackResult?.feedback?.rating;
                if (!ratings) return 0;
                const getRating = (r) => {
                    if (typeof r === 'number') return r;
                    if (typeof r === 'object' && r !== null) return Number(r.rating) || 0;
                    return 0;
                };
                const values = Object.values(ratings).map(getRating);
                if (values.length === 0) return 0;
                return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
            })()
        },
        completed_at: completedAt,
        anti_cheating_state: finalAntiCheating,
        violation_count: violationCount,
        session_id: sessionId,
        is_completed: true,
        recommendations: recommendationText
    };

    const { error: upsertError } = await supabase
        .from('interview_results')
        .upsert(resultPayload, {
            onConflict: 'interview_id,email',
            ignoreDuplicates: false
        });

    if (upsertError) {
        logger.error('[Finalization] Error upserting results:', upsertError);
        return { success: false, error: upsertError.message };
    }

    // logger.log(`[Finalization] Completed successfully for ${email}`);
    return { success: true, sessionId };
}

```


## File: lib/services/codingQuestionService.js
```javascript
/**
 * Coding Question Generation Service
 * Dynamically generates LeetCode/HackerRank-style coding problems using LLM
 */

import { chatWithLLM } from '@/lib/llm';
import { getModelForTask } from '@/lib/getModel';

/**
 * Analyze job requirements to determine appropriate difficulty distribution
 * @param {string} jobPosition - The job title/position
 * @param {string} jobDescription - The job description
 * @returns {Object} - Difficulty analysis with primary and secondary levels
 */
export function analyzeDifficulty(jobPosition, jobDescription) {
    const position = jobPosition.toLowerCase();
    const description = jobDescription.toLowerCase();

    // Analyze seniority level
    let primaryDifficulty = 'Medium';
    let difficultyMix = [];

    // Senior/Lead/Principal roles → Hard focus
    if (position.includes('senior') || position.includes('lead') ||
        position.includes('principal') || position.includes('architect') ||
        position.includes('staff')) {
        primaryDifficulty = 'Hard';
        difficultyMix = ['Medium', 'Hard', 'Hard'];
    }
    // Junior/Entry/Intern roles → Easy focus
    else if (position.includes('junior') || position.includes('entry') ||
        position.includes('intern') || position.includes('trainee') ||
        position.includes('associate')) {
        primaryDifficulty = 'Easy';
        difficultyMix = ['Easy', 'Easy', 'Medium'];
    }
    // Mid-level → Medium focus
    else {
        primaryDifficulty = 'Medium';
        difficultyMix = ['Easy', 'Medium', 'Medium'];
    }

    return {
        primary: primaryDifficulty,
        mix: difficultyMix,
        requiresAlgorithms: description.includes('algorithm') || description.includes('data structure'),
        requiresSystemDesign: position.includes('architect') || description.includes('system design')
    };
}

/**
 * Extract technical skills and requirements from job description
 * @param {string} jobDescription - The job description
 * @returns {Object} - Extracted technical context
 */
function extractTechnicalContext(jobDescription) {
    const description = jobDescription.toLowerCase();

    const context = {
        languages: [],
        domains: [],
        skills: []
    };

    // Detect programming languages
    const languages = ['python', 'javascript', 'java', 'c++', 'go', 'rust', 'typescript', 'ruby', 'php', 'c#'];
    languages.forEach(lang => {
        if (description.includes(lang)) context.languages.push(lang);
    });

    // Detect domain areas
    if (description.includes('web') || description.includes('frontend') || description.includes('ui')) {
        context.domains.push('web development');
    }
    if (description.includes('backend') || description.includes('api') || description.includes('server')) {
        context.domains.push('backend systems');
    }
    if (description.includes('data') || description.includes('analytics') || description.includes('ml')) {
        context.domains.push('data processing');
    }
    if (description.includes('database') || description.includes('sql')) {
        context.domains.push('database operations');
    }
    if (description.includes('algorithm') || description.includes('optimization')) {
        context.domains.push('algorithms');
    }

    // Detect key skills
    const skillKeywords = ['array', 'string', 'hash', 'tree', 'graph', 'dynamic programming',
        'recursion', 'sorting', 'searching', 'optimization'];
    skillKeywords.forEach(skill => {
        if (description.includes(skill)) context.skills.push(skill);
    });

    return context;
}

/**
 * Build the LLM prompt for dynamic coding question generation
 */
function buildCodingQuestionPrompt(jobPosition, jobDescription, numQuestions, difficultyAnalysis) {
    const technicalContext = extractTechnicalContext(jobDescription);

    return `You are a LeetCode/HackerRank problem creator. Generate ${numQuestions} ORIGINAL coding problems based on the job requirements below.

JOB POSITION: ${jobPosition}
JOB DESCRIPTION: ${jobDescription}

DIFFICULTY DISTRIBUTION: ${difficultyAnalysis.mix.join(', ')}
${technicalContext.domains.length > 0 ? `RELEVANT DOMAINS: ${technicalContext.domains.join(', ')}` : ''}
${technicalContext.languages.length > 0 ? `PREFERRED LANGUAGES: ${technicalContext.languages.join(', ')}` : ''}

REQUIREMENTS:
1. Generate STANDARD algorithmic/data structure problems (like LeetCode problems)
2. Each problem must be LANGUAGE-AGNOSTIC (solvable in any programming language)
3. Problems should test skills relevant to: ${technicalContext.domains.join(', ') || 'general programming'}
4. Include COMPLETE and EXECUTABLE test cases
5. Provide clear input/output specifications

DIFFICULTY GUIDELINES:
- Easy: Arrays, Strings, Hash Tables, Basic Math, Two Pointers (Time: O(n) or O(n log n))
- Medium: Trees, Graphs, Backtracking, Greedy, Binary Search, Stack/Queue (Time: O(n²) acceptable)
- Hard: Dynamic Programming, Advanced Graphs, Segment Trees, Complex Optimization (Time: O(n²) or better)

OUTPUT FORMAT (JSON):
{
  "questions": [
    {
      "title": "Problem Title (like 'Two Sum' or 'Longest Substring')",
      "difficulty": "Easy|Medium|Hard",
      "tags": ["Array", "Hash Table", "Two Pointers"],
      "problemStatement": "Clear problem description with examples",
      "constraints": [
        "1 <= nums.length <= 10^4",
        "-10^9 <= nums[i] <= 10^9"
      ],
      "inputFormat": "Detailed input specification",
      "outputFormat": "Expected output specification",
      "examples": [
        {
          "input": "nums = [2,7,11,15], target = 9",
          "output": "[0,1]",
          "explanation": "Because nums[0] + nums[1] == 9, we return [0, 1]."
        }
      ],
      "testCases": [
        {
          "input": "nums = [3,2,4], target = 6",
          "output": "[1,2]"
        },
        {
          "input": "nums = [3,3], target = 6",
          "output": "[0,1]"
        }
      ],
      "hints": [
        "Think about using a hash map to store seen numbers",
        "Can you solve it in one pass?"
      ],
      "timeComplexity": "O(n)",
      "spaceComplexity": "O(n)"
    }
  ]
}

CRITICAL RULES:
- Problems must be ORIGINAL (not copied from LeetCode/HackerRank)
- Test cases must be CORRECT and COMPLETE
- Input/Output must be PRECISELY specified
- Include edge cases in test cases
- Make problems relevant to job requirements
- Use standard algorithm problem format`;
}

/**
 * Validate the structure of generated coding questions
 */
export function validateQuestionStructure(questionData) {
    if (!questionData || !questionData.questions || !Array.isArray(questionData.questions)) {
        throw new Error('Invalid question structure: missing questions array');
    }

    for (const question of questionData.questions) {
        const required = ['title', 'difficulty', 'problemStatement', 'constraints',
            'inputFormat', 'outputFormat', 'examples', 'testCases'];

        for (const field of required) {
            if (!question[field]) {
                throw new Error(`Invalid question structure: missing field '${field}'`);
            }
        }

        // Validate examples
        if (!Array.isArray(question.examples) || question.examples.length < 1) {
            throw new Error('Each question must have at least 1 example');
        }

        for (const example of question.examples) {
            if (!example.input || !example.output || !example.explanation) {
                throw new Error('Examples must have input, output, and explanation');
            }
        }

        // Validate test cases
        if (!Array.isArray(question.testCases) || question.testCases.length < 2) {
            throw new Error('Each question must have at least 2 test cases');
        }

        for (const testCase of question.testCases) {
            if (!testCase.input || !testCase.output) {
                throw new Error('Test cases must have input and output');
            }
        }
    }

    return true;
}

/**
 * Generate dynamic coding questions based on job requirements
 * @param {string} jobPosition - The job title/position
 * @param {string} jobDescription - The job description
 * @param {number} numQuestions - Optional: number of questions (default: 2-3 based on role)
 * @returns {Promise<Object>} - Generated coding questions
 */
export async function generateCodingQuestions(jobPosition, jobDescription, numQuestions = null) {
    try {
        // Analyze difficulty requirements
        const difficultyAnalysis = analyzeDifficulty(jobPosition, jobDescription);

        // Determine question count
        const questionCount = numQuestions || difficultyAnalysis.mix.length;

        console.log(`Generating ${questionCount} coding questions for: ${jobPosition}`);
        console.log(`Difficulty distribution: ${difficultyAnalysis.mix.join(', ')}`);

        // Get the appropriate LLM model
        const { vendor, model } = getModelForTask('QUESTION_GENERATION');

        // Build the prompt
        const prompt = buildCodingQuestionPrompt(jobPosition, jobDescription, questionCount, difficultyAnalysis);

        // Call LLM with increased token limit for complex problems
        const response = await chatWithLLM(vendor, {
            model,
            task: 'QUESTION_GENERATION',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert coding problem creator for technical interviews. Generate original, high-quality algorithmic problems. Respond ONLY with valid JSON.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ]
        });

        // Parse the response
        let cleanedResponse = response
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const questionData = JSON.parse(cleanedResponse);

        // Validate structure
        validateQuestionStructure(questionData);

        console.log(`✅ Successfully generated ${questionData.questions.length} coding questions`);

        return {
            success: true,
            jobPosition,
            difficultyDistribution: difficultyAnalysis.mix,
            questionCount: questionData.questions.length,
            questions: questionData.questions,
            metadata: {
                vendor,
                model,
                generatedAt: new Date().toISOString()
            }
        };

    } catch (error) {
        console.error('Error generating coding questions:', error);
        throw new Error(`Failed to generate coding questions: ${error.message}`);
    }
}

```


## File: lib/services/fraudDetectionService.js
```javascript
import { extractResumeData } from './resumeParser.js';
import { performRuleBasedValidation } from './ruleBasedValidation.js';
import { performLLMAnalysis } from './llmService.js';
import { performExternalVerification } from './verificationService.js';

/**
 * Complete Resume Fraud Detection Analysis
 * Implements the full workflow: File Check → Rule-Based → LLM → Verification → Scoring
 */
export async function analyzeResumeComplete(config) {
    const startTime = Date.now();

    try {
        const { fileName, filePath, text, apiKey, provider, analysisMode } = config;

        console.log(`Starting analysis for: ${fileName}`);
        console.log(`Mode: ${analysisMode}, Provider: ${provider}`);

        // Extract structured data from resume
        const resumeData = extractResumeData(text);
        resumeData.fileName = fileName;

        let ruleBasedResults = null;
        let llmResults = null;
        let verificationResults = null;

        // Stage 1: Rule-Based Validation (skip in LLM-only mode)
        if (analysisMode === 'hybrid' || analysisMode === 'rule_based') {
            console.log('Stage 1: Rule-Based Validation...');
            ruleBasedResults = performRuleBasedValidation(resumeData);
        } else {
            // Create empty rule-based results for LLM-only mode
            ruleBasedResults = {
                score: 0,
                flags: [],
                passed: true,
                primaryFraudType: 'none'
            };
        }

        // Stage 2: LLM Analysis (if applicable)
        if (analysisMode === 'hybrid' || analysisMode === 'llm_only') {
            console.log('Stage 2: LLM Analysis...');
            try {
                llmResults = await performLLMAnalysis(resumeData, ruleBasedResults, apiKey, provider);
            } catch (error) {
                console.warn('LLM analysis failed, continuing with rule-based only:', error.message);
                llmResults = {
                    score: 0,
                    explanation: 'LLM analysis unavailable',
                    confidence: 0,
                    error: error.message
                };
            }
        }

        // Stage 3: External Verification
        if (analysisMode === 'hybrid' || analysisMode === 'rule_based') {
            console.log('Stage 3: External Verification...');
            verificationResults = await performExternalVerification(resumeData, ruleBasedResults);
        }

        // Final Risk Scoring
        console.log('Computing final risk score...');
        const finalScore = calculateFinalRiskScore(
            ruleBasedResults,
            llmResults,
            verificationResults,
            analysisMode
        );

        const riskLevel = getRiskLevel(finalScore);
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);

        // Generate comprehensive explanation
        const explanation = generateExplanation(
            ruleBasedResults,
            llmResults,
            verificationResults,
            finalScore,
            riskLevel,
            analysisMode
        );

        // Build final result
        const result = {
            id: Date.now() + Math.random(),
            candidateName: fileName.replace(/\.(pdf|docx|doc)$/i, '').replace(/_/g, ' '),
            fileName,
            riskScore: finalScore,
            riskLevel,
            fraudType: ruleBasedResults.primaryFraudType || 'none',
            detectedIssues: ruleBasedResults.flags.length,
            processingTime,
            aiExplanation: explanation,
            timestamp: new Date().toISOString(),

            // Detailed breakdown
            details: {
                analysisMode,

                ruleBasedResults: {
                    stage: 'rule_based_validation',
                    score: ruleBasedResults.score,
                    flags: ruleBasedResults.flags,
                    passed: ruleBasedResults.passed
                },

                llmResults: llmResults ? {
                    stage: 'llm_analysis',
                    score: llmResults.score,
                    confidence: llmResults.confidence,
                    explanation: llmResults.explanation,
                    concerns: llmResults.concerns || []
                } : null,

                verificationResults: verificationResults ? {
                    stage: 'external_verification',
                    score: verificationResults.score,
                    verifications: verificationResults.verifications,
                    allVerified: verificationResults.allVerified
                } : null,

                extractedData: {
                    education: resumeData.education,
                    experience: resumeData.experience,
                    skills: resumeData.skills,
                    certifications: resumeData.certifications
                }
            },

            // Recommendations
            recommendations: generateRecommendations(riskLevel, ruleBasedResults, verificationResults)
        };

        console.log(`✅ Analysis complete: Risk=${finalScore}/10, Level=${riskLevel}`);
        return result;

    } catch (error) {
        console.error('Analysis failed:', error);
        throw error;
    }
}

/**
 * Calculate final risk score based on all analysis stages
 */
function calculateFinalRiskScore(ruleResults, llmResults, verificationResults, mode) {
    let finalScore = 0;

    switch (mode) {
        case 'hybrid':
            // Weighted: 40% rules, 30% LLM, 30% verification
            const ruleScore = ruleResults?.score || 0;
            const llmScore = llmResults?.score || 0;
            const verifyScore = verificationResults?.score || 0;

            finalScore = (ruleScore * 0.4) + (llmScore * 0.3) + (verifyScore * 0.3);
            break;

        case 'llm_only':
            finalScore = llmResults?.score || 0;
            break;

        case 'rule_based':
            const rScore = ruleResults?.score || 0;
            const vScore = verificationResults?.score || 0;
            finalScore = (rScore * 0.7) + (vScore * 0.3);
            break;
    }

    return Math.min(Math.round(finalScore * 10) / 10, 10);
}

/**
 * Determine risk level from score
 */
function getRiskLevel(score) {
    if (score <= 2) return 'low';
    if (score <= 5) return 'medium';
    if (score <= 8) return 'high';
    return 'critical';
}

/**
 * Generate comprehensive explanation
 */
function generateExplanation(ruleResults, llmResults, verificationResults, finalScore, riskLevel, mode) {
    const flagCount = ruleResults?.flags?.length || 0;
    const verificationIssues = verificationResults
        ? Object.values(verificationResults.verifications).filter(v => !v.verified).length
        : 0;

    let explanation = '';

    // Base explanation based on risk level
    if (riskLevel === 'low') {
        explanation = `This resume appears legitimate with ${flagCount} minor concern(s) detected. `;

        if (verificationResults?.allVerified) {
            explanation += 'All key information has been verified through external sources. ';
        }

        explanation += 'The candidate\'s experience progression is realistic and consistent with industry standards. ';

        if (llmResults?.explanation) {
            explanation += `AI Analysis: ${llmResults.explanation} `;
        }

        explanation += 'No significant red flags were identified during the analysis.';
    }
    else if (riskLevel === 'medium') {
        explanation = `The resume shows ${flagCount} potential concern(s) that warrant further review. `;

        if (verificationIssues > 0) {
            explanation += `${verificationIssues} external verification check(s) could not be completed. `;
        }

        explanation += 'While not definitively fraudulent, these inconsistencies suggest the need for additional verification through reference checks and direct confirmation with previous employers or educational institutions. ';

        if (llmResults?.concerns && llmResults.concerns.length > 0) {
            explanation += `AI detected: ${llmResults.concerns.join(', ')}. `;
        }
    }
    else if (riskLevel === 'high') {
        explanation = `Significant concerns detected with ${flagCount} red flag(s) identified. `;

        if (verificationIssues > 0) {
            explanation += `${verificationIssues} critical verification(s) failed. `;
        }

        const fraudTypes = ruleResults.flags.map(f => f.type).join(', ');
        explanation += `The resume contains suspicious patterns including: ${fraudTypes}. `;

        explanation += 'These indicators strongly suggest potential fraud. Thorough background screening and verification of all claims is strongly recommended before proceeding. ';

        if (llmResults?.explanation) {
            explanation += `AI Assessment: ${llmResults.explanation}`;
        }
    }
    else {
        // Critical
        explanation = `🚨 CRITICAL RISK: Multiple severe fraud indicators detected with ${flagCount} major red flags. `;

        if (verificationIssues > 0) {
            explanation += `${verificationIssues} essential verifications failed. `;
        }

        const fraudTypes = ruleResults.flags.map(f => f.type).join(', ');
        explanation += `The resume exhibits clear patterns of fabrication including: ${fraudTypes}. `;

        explanation += 'This candidate requires immediate and comprehensive background investigation. DO NOT PROCEED without complete verification of all claims. ';

        if (llmResults?.explanation) {
            explanation += `AI Analysis: ${llmResults.explanation}`;
        }
    }

    return explanation.trim();
}

/**
 * Generate actionable recommendations based on analysis
 */
function generateRecommendations(riskLevel, ruleResults, verificationResults) {
    const recommendations = [];

    if (riskLevel === 'low') {
        recommendations.push({
            priority: 'low',
            action: 'Standard reference checks with previous employers',
            reason: 'Routine verification process'
        });
        recommendations.push({
            priority: 'low',
            action: 'Verify most recent employment dates',
            reason: 'Best practice for all candidates'
        });
    }
    else if (riskLevel === 'medium') {
        recommendations.push({
            priority: 'medium',
            action: 'Conduct thorough reference checks with all listed employers',
            reason: 'Minor inconsistencies detected requiring verification'
        });
        recommendations.push({
            priority: 'medium',
            action: 'Verify education credentials with issuing institutions',
            reason: 'Standard verification for this risk level'
        });
        recommendations.push({
            priority: 'medium',
            action: 'Request additional documentation for employment history',
            reason: 'To clarify timeline concerns'
        });
    }
    else if (riskLevel === 'high') {
        recommendations.push({
            priority: 'high',
            action: 'Comprehensive background check through professional service',
            reason: 'Significant fraud indicators detected'
        });
        recommendations.push({
            priority: 'high',
            action: 'Direct verification of all claims with listed organizations',
            reason: 'Multiple verification failures'
        });
        recommendations.push({
            priority: 'high',
            action: 'Request official transcripts and employment letters',
            reason: 'Document authentication required'
        });
        recommendations.push({
            priority: 'high',
            action: 'In-depth technical interview to verify claimed skills',
            reason: 'Skills validation needed'
        });
    }
    else {
        // Critical
        recommendations.push({
            priority: 'critical',
            action: '🚨 DO NOT PROCEED with this candidate without investigation',
            reason: 'Multiple severe fraud indicators'
        });
        recommendations.push({
            priority: 'critical',
            action: 'Engage professional background screening service immediately',
            reason: 'Critical risk level requires expert verification'
        });
        recommendations.push({
            priority: 'critical',
            action: 'Obtain official documentation for ALL claims',
            reason: 'High probability of fabricated information'
        });
        recommendations.push({
            priority: 'critical',
            action: 'Consider legal consultation before proceeding',
            reason: 'Potential fraud liability'
        });
    }

    return recommendations;
}

```


## File: lib/yoloDetection.js
```javascript

```


## File: services/Constants.jsx
```javascript
import {
  BriefcaseBusinessIcon,
  Code2Icon,
  User2Icon,
  Component,
  Puzzle,
  Calendar,
  LayoutDashboard,
  List,
  WalletCards,
  Video,
  Shield,
  Laptop
} from 'lucide-react';

export const SideBarOptions = [
  {
    name: 'Dashboard',
    icon: LayoutDashboard,
    path: '/recruiter/dashboard',
  },
  {
    name: 'Job Descriptions',
    icon: BriefcaseBusinessIcon,
    path: '/recruiter/dashboard/job-descriptions',
  },
  {
    name: 'Interviews',
    icon: Video,
    path: '/recruiter/interviews', // Parent path, mostly for active state detection if needed, or ignored
    children: [
      {
        name: 'Schedule Round-1',
        icon: Calendar,
        path: '/recruiter/schedule-interview',
      },
      {
        name: 'Round-1 Results',
        icon: List,
        path: '/recruiter/round1-status',
      },
      {
        name: 'All Interviews',
        icon: List,
        path: '/recruiter/all-interview',
      },
    ]
  },
  {
    name: 'Resume Detector',
    icon: Shield,
    path: '/recruiter/fraud-detector',
  },
];

export const SideBarCondidate = [
  {
    name: 'Dashboard',
    icon: LayoutDashboard,
    path: '/candidate/dashboard',
  },
  {
    name: 'Interviews',
    icon: Video,
    path: '/candidate/interviews',
  },

];

export const InterviewType = [
  {
    name: 'Technical',
    icon: Code2Icon,
  },
  {
    name: 'Coding',
    icon: Laptop,
  },
  {
    name: 'Behavioral',
    icon: User2Icon,
  },
  {
    name: 'Experience',
    icon: BriefcaseBusinessIcon,
  },
  {
    name: 'Problem Solving',
    icon: Puzzle,
  },
  {
    name: 'Leadership',
    icon: Component,
  },
];

export const QUESTIONS_PROMPT = `You are an expert technical interviewer.
Based on the following inputs, generate a well-structured list of high-quality interview questions organized into THREE separate sections.

Job Title: {{job_position}}

Job Description:{{job_description}}

{{resume_content}}

Interview Duration: {{duration}}

Interview Type: {{type}}

📝 Your task:

1. Analyze the job description to identify key responsibilities, required skills, and expected experience.
2. IF a resume/CV is provided, analyze it to identify the candidate's specific projects, skills, achievements, tools used, and any gaps.

Generate THREE separate sets of interview questions:

## Section 1: CV-Based Questions (10 questions)
Focus ONLY on the candidate's resume/CV content:
- Skills, technologies, and tools mentioned in the CV
- Projects and their outcomes
- Work experience and achievements
- Educational background and certifications
- Specific accomplishments and metrics mentioned
**If no resume is provided, this array should be empty.**

## Section 2: JD-Based Questions (10 questions)
Focus ONLY on the job description requirements:
- Role responsibilities and expectations
- Required technical and soft skills listed in JD
- Company/team expectations
- Day-to-day tasks mentioned in the JD
- Required qualifications and experience levels

## Section 3: Combined CV+JD Questions (10 questions)
Focus on the INTERSECTION of CV and JD:
- How candidate's experience matches job requirements
- Real-world scenarios combining their background with role needs
- Skill gaps and how they plan to address them
- Specific projects that demonstrate relevant experience
- Role fit assessment questions

⚠️ STRICT RULES:
1. **NO DUPLICATE QUESTIONS** across the three sections. Each question must be unique.
2. Each section should have EXACTLY 10 questions (unless Resume is not provided, then cvQuestions can be empty).
3. Follow this ORDER within each section:
   - Candidate Introduction (Brief ice-breaker) - only in first section
   - Behavioral Questions (Soft skills, past experiences)
   - Technical Questions (Core concepts, knowledge check)
   - Problem Solving / Situational Questions
   - Leadership / Experience Questions
   - Closing / HR Questions - only in last section

🧩 IMPORTANT: Return ONLY valid JSON with no additional text. Use this exact format:
{
  "cvQuestions": [
    {
      "question": "Question based on candidate's CV/Resume...",
      "type": "Experience/Technical/Behavioral/Project/Achievement"
    }
  ],
  "jdQuestions": [
    {
      "question": "Question based on Job Description requirements...",
      "type": "Technical/Behavioral/Experience/Problem Solving/Leadership"
    }
  ],
  "combinedQuestions": [
    {
      "question": "Question combining CV experience with JD requirements...",
      "type": "Technical/Behavioral/Experience/Problem Solving/Situational"
    }
  ],
  "codingQuestion": {
    "title": "Short title of the coding problem",
    "description": "Detailed problem statement...",
    "examples": [
      { "input": "...", "output": "..." }
    ],
    "difficulty": "Easy/Medium/Hard"
  }
}

⚠️ ADDITIONAL RULES:
- IF and ONLY IF the interview type includes "Coding", generate a "codingQuestion" object. Otherwise set it to null.
- The coding question should be relevant to the job role and candidate's experience level.
- "cvQuestions" should ONLY be populated if resume/CV content is provided. If no resume, return an empty array.
- "jdQuestions" should ALWAYS have 10 questions based on the job description.
- "combinedQuestions" should ONLY be populated if resume/CV is provided. If no resume, return an empty array.
- Ensure no question is repeated across sections.
- Ensure the JSON is valid.

Question types should be one of: Candidate Introduction, Technical, Behavioral, Experience, Problem Solving, Leadership, Project, Achievement, Situational, Salary Negotiation, or Closing.

🎯 The goal is to create a comprehensive, structured, and time-optimized interview plan for a {{job_position}} role with clear separation between CV-based, JD-based, and combined assessment questions.

Remember: Return ONLY the JSON object, do NOT wrap it in markdown code blocks, do NOT add explanations.`;

export const FEEDBACK_PROMPT = `{{conversation}}

Based on the interview conversation above between the 'assistant' (Interviewer) and the 'user' (Candidate), provide a detailed and strict evaluation.

CRITICAL SCORING GUIDELINES:
1. **Strict Evaluation**: Do NOT be lenient. If the candidate answers "I don't know", "I have no experience", or gives vague/short answers, the score for that category MUST be low (0-3).
2. **"I don't know"**: If the candidate explicitly admits to not knowing a key topic, the Technical Skills score should not exceed 3/10.
3. **Incomplete Interview**: If the interview ended prematurely or very few questions were answered, the scores should reflect this lack of data (penalize heavily).
4. **Differentiation**: Use the full range of 0-10. 5/10 is NOT a default; it means "average/acceptable". If they are below average, give 2, 3, or 4.

Please provide a rating out of 10 for the following categories:
- Technical Skills
- Communication
- Problem Solving
- Experience
- Behavioral
- Thinking

Also provide:
- A 3-line summary of the interview performance.
- A strict "Recommended" or "Not Recommended" status.
- A concise recommendation message explaining the decision.

**IMPORTANT**: Return the response in the following strict JSON format ONLY:
{
    "feedback": {
        "rating": {
            "TechnicalSkills": { "rating": 0, "explanation": "Reasoning...", "improvement_tip": "Specific actionable advice on HOW to improve this skill..." },
            "Communication": { "rating": 0, "explanation": "Reasoning...", "improvement_tip": "Specific actionable advice on HOW to improve this skill..." },
            "ProblemSolving": { "rating": 0, "explanation": "Reasoning...", "improvement_tip": "Specific actionable advice on HOW to improve this skill..." },
            "Experience": { "rating": 0, "explanation": "Reasoning...", "improvement_tip": "Specific actionable advice on HOW to improve this skill..." },
            "Behavioral": { "rating": 0, "explanation": "Reasoning...", "improvement_tip": "Specific actionable advice on HOW to improve this skill..." },
            "Thinking": { "rating": 0, "explanation": "Reasoning...", "improvement_tip": "Specific actionable advice on HOW to improve this skill..." }
        },
        "summery": "Refer to the candidate as 'The Candidate' or by their name. Do NOT use 'You'. A concise professional summary of their performance...",
        "Recommendation": "Recommended / Not Recommended",
        "Recommendation Message": "Very concise (max 3 sentences) reason for the recommendation..."
    }
}
`;

export const DB_TABLES = {
  USERS: process.env.NEXT_PUBLIC_USERS_TABLE_NAME,
  INTERVIEWS: process.env.NEXT_PUBLIC_INTERVIEWS_TABLE_NAME,
  INTERVIEW_RESULTS: process.env.NEXT_PUBLIC_INTERVIEW_RESULTS_TABLE_NAME,
  VIOLATIONS: process.env.NEXT_PUBLIC_VIOLATIONS_TABLE_NAME || 'violations',
};

// LLM Provider Models
export const GOOGLE_MODELS = {
  QUESTION_GENERATION: process.env.GOOGLE_MODEL_QUESTION_GENERATION,
  ANSWER_EVALUATION: process.env.GOOGLE_MODEL_ANSWER_EVALUATION,
  FEEDBACK: process.env.GOOGLE_MODEL_FEEDBACK,
  CODE_EXECUTION: process.env.GOOGLE_MODEL_CODE_EXECUTION || 'gemini-1.5-flash',
};

// Alias for compatibility
export const GEMINI_MODELS = GOOGLE_MODELS;

export const OPENROUTER_MODELS = {
  QUESTION_GENERATION:
    process.env.OPENROUTER_MODEL_QUESTION_GENERATION ||
    'deepseek/deepseek-r1:free',
  ANSWER_EVALUATION:
    process.env.OPENROUTER_MODEL_ANSWER_EVALUATION ||
    'deepseek/deepseek-r1:free',
  FEEDBACK:
    process.env.OPENROUTER_MODEL_FEEDBACK || 'deepseek/deepseek-r1:free',
  CODE_EXECUTION:
    process.env.OPENROUTER_MODEL_CODE_EXECUTION || 'deepseek/deepseek-r1:free',
};

export const LLM_PROVIDER = process.env.LLM_PROVIDER || 'azure';

export const AZURE_MODELS = {
  QUESTION_GENERATION: process.env.AZURE_OPENAI_MODEL_QUESTION_GENERATION,
  ANSWER_EVALUATION: process.env.AZURE_OPENAI_MODEL_ANSWER_EVALUATION,
  FEEDBACK: process.env.AZURE_OPENAI_MODEL_FEEDBACK,
  CODE_EXECUTION: process.env.AZURE_OPENAI_MODEL_CODE_EXECUTION || 'gpt-4o-mini',
};

export const OPENAI_MODELS = {
  QUESTION_GENERATION:
    process.env.OPENAI_MODEL_QUESTION_GENERATION || 'gpt-4o-mini',
  ANSWER_EVALUATION:
    process.env.OPENAI_MODEL_ANSWER_EVALUATION || 'gpt-4o-mini',
  FEEDBACK: process.env.OPENAI_MODEL_FEEDBACK || 'gpt-4o-mini',
  CODE_EXECUTION: process.env.OPENAI_MODEL_CODE_EXECUTION || 'gpt-4o-mini',
};

export const ANTHROPIC_MODELS = {
  QUESTION_GENERATION:
    process.env.ANTHROPIC_MODEL_QUESTION_GENERATION ||
    'claude-3-haiku-20240307',
  ANSWER_EVALUATION:
    process.env.ANTHROPIC_MODEL_ANSWER_EVALUATION || 'claude-3-haiku-20240307',
  FEEDBACK: process.env.ANTHROPIC_MODEL_FEEDBACK || 'claude-3-haiku-20240307',
  CODE_EXECUTION: process.env.ANTHROPIC_MODEL_CODE_EXECUTION || 'claude-3-haiku-20240307',
};

```


## File: lib/llm.js
```javascript
// lib/llm.js
import OpenAI, { AzureOpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { withRetry } from '@/lib/retryUtils';
import { logger } from '@/lib/logger';

import {
  AZURE_MODELS,
  OPENAI_MODELS,
  OPENROUTER_MODELS,
  ANTHROPIC_MODELS,
  GEMINI_MODELS,
} from '@/services/Constants';

/**
 * Validate API key for a specific vendor
 * @param {string} vendor - The LLM vendor
 * @throws {Error} - If API key is missing
 */
function validateApiKey(vendor) {
  const validations = {
    azure: {
      keys: ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY'],
      values: [process.env.AZURE_OPENAI_ENDPOINT, process.env.AZURE_OPENAI_API_KEY],
    },
    openai: {
      keys: ['OPENAI_API_KEY'],
      values: [process.env.OPENAI_API_KEY],
    },
    openrouter: {
      keys: ['OPENROUTER_API_KEY'],
      values: [process.env.OPENROUTER_API_KEY],
    },
    anthropic: {
      keys: ['ANTHROPIC_API_KEY'],
      values: [process.env.ANTHROPIC_API_KEY],
    },
    gemini: {
      keys: ['GOOGLE_API_KEY'],
      values: [process.env.GOOGLE_API_KEY],
    },
  };

  const validation = validations[vendor];
  if (!validation) {
    logger.warn(`No validation configured for vendor: ${vendor}`);
    return;
  }

  const missingKeys = validation.keys.filter(
    (key, index) => !validation.values[index]
  );

  if (missingKeys.length > 0) {
    throw new Error(
      `❌ Missing API key(s) for ${vendor}:\n` +
      missingKeys.map((key) => `  - ${key} ❌`).join('\n') +
      '\n\nPlease check your .env.local file and add the required API keys.'
    );
  }
}

/**
 * Automatically returns a default model based on provider + task.
 */
export function getDefaultModel(provider, task) {
  switch (provider) {
    case 'azure':
      return AZURE_MODELS[task];

    case 'openai':
      return OPENAI_MODELS[task];

    case 'openrouter':
      return OPENROUTER_MODELS[task];

    case 'anthropic':
      return ANTHROPIC_MODELS[task];

    case 'gemini':
      return GEMINI_MODELS[task];

    default:
      return OPENROUTER_MODELS[task]; // fallback
  }
}

/**
 * Internal function that performs the actual LLM call
 * This is wrapped by chatWithLLM which adds retry logic
 */
async function chatWithLLMInternal(vendor, req) {
  // Task type is required for default model selection
  const task = req.task || 'QUESTION_GENERATION';

  // Validate API key before making the call
  validateApiKey(vendor);

  // Auto-select model if not provided
  const modelToUse = req.model || getDefaultModel(vendor, task);

  if (!modelToUse) {
    throw new Error(
      `No model found for vendor "${vendor}" and task "${task}". Check your .env and constants.js.`
    );
  }

  switch (vendor) {
    case 'azure': {
      const client = new AzureOpenAI({
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-10-21',
      });

      const completion = await client.chat.completions.create({
        model: modelToUse,
        messages: req.messages,
      });

      return completion?.choices?.[0]?.message?.content ?? '';
    }

    case 'openai': {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const completion = await client.chat.completions.create({
        model: modelToUse,
        messages: req.messages,
      });

      return completion?.choices?.[0]?.message?.content ?? '';
    }

    case 'openrouter': {
      const client = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: process.env.OPENROUTER_ENDPOINT || 'https://openrouter.ai/api/v1',
      });

      const completion = await client.chat.completions.create({
        model: modelToUse,
        messages: req.messages,
      });

      return completion?.choices?.[0]?.message?.content ?? '';
    }

    case 'anthropic': {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const userText = req.messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join('\n');

      const msg = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 2048,
        messages: [
          { role: 'user', content: [{ type: 'text', text: userText }] },
        ],
      });

      const first = Array.isArray(msg?.content)
        ? msg.content.find((c) => c.type === 'text')
        : null;

      return first?.text ?? '';
    }

    case 'gemini': {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      const model = genAI.getGenerativeModel({ model: modelToUse });

      const userText = req.messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join('\n');

      const res = await model.generateContent(userText);
      return res?.response?.text?.() ?? '';
    }

    default:
      throw new Error(`Unsupported vendor: ${vendor}`);
  }
}

/**
 * Chat with LLM with automatic retry logic
 * This is the main export that should be used by other modules
 * @param {string} vendor - The LLM vendor (azure, openai, openrouter, anthropic, gemini)
 * @param {Object} req - Request object with model, messages, and task
 * @returns {Promise<string>} - The LLM response text
 */
export async function chatWithLLM(vendor, req) {
  return withRetry(
    () => chatWithLLMInternal(vendor, req),
    {
      operationName: `LLM call to ${vendor}`,
      maxAttempts: 3,
    }
  );
}

```


## File: lib/logger.js
```javascript
/**
 * Development-only logger utility
 * Wraps console methods to only log in development mode
 * Usage: import { logger } from '@/lib/logger'
 *        logger.log('message')
 *        logger.error('error message')
 *        logger.warn('warning')
 *        logger.debug('debug info')
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  log: (...args) => {
    if (isDev) {
      console.log(...args);
    }
  },

  error: (...args) => {
    // Always log errors, even in production
    console.error(...args);
  },

  warn: (...args) => {
    if (isDev) {
      console.warn(...args);
    }
  },

  debug: (...args) => {
    if (isDev) {
      console.debug(...args);
    }
  },

  info: (...args) => {
    if (isDev) {
      console.info(...args);
    }
  },

  // Group related logs together
  group: (label, fn) => {
    if (isDev) {
      console.group(label);
      fn();
      console.groupEnd();
    }
  },

  // Table format for objects/arrays
  table: (data) => {
    if (isDev) {
      console.table(data);
    }
  },
};

export default logger;

```


## File: context/InterviewDataContext.jsx
```javascript
import { createContext } from 'react';

export const InterviewDataContext = createContext();

```
