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