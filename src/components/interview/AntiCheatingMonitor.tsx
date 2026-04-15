/**
 * AntiCheatingMonitor — Production-grade proctoring monitor
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AntiCheatingMonitorProps {
  interviewId: string;
  email: string;
  candidateName: string;
  onViolationLimitReached?: () => void;
  isCompleted?: boolean;
  isInteractionActive?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

type FaceApiModule = typeof import("face-api.js");

// ─── Constants ────────────────────────────────────────────────────────────────
const GRACE_PERIOD_MS = 8000;          
const FACE_CHECK_INTERVAL_MS = 1500;   // Slightly faster checks (1.5s)
const FACE_EVENT_COOLDOWN_MS = 20000;  // 20s between violation events
const BLUR_DEDUP_DELAY_MS = 350;
const WINDOW_BLUR_COOLDOWN_MS = 5000;

// Accumulator thresholds (Production robustness)
// Instead of strict "consecutive", we use a "suspicion score" that fills up.
const MULTI_FACE_THRESHOLD = 3; // Need ~3 detections to fire
const NO_FACE_THRESHOLD = 4;    // Need ~4 detections to fire

// face-api.js fallback: singleton promise
let faceApiLoadPromise: Promise<FaceApiModule | null> | null = null;

const loadFaceApiModel = (): Promise<FaceApiModule | null> => {
  if (faceApiLoadPromise) return faceApiLoadPromise;
  faceApiLoadPromise = import("face-api.js")
    .then(async (faceapi) => {
      // Load from absolute URL to avoid potential relative path issues in sub-routes
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
      console.log("[ACM] ✅ face-api.js model loaded successfully");
      return faceapi as FaceApiModule;
    })
    .catch((err) => {
      console.error("[ACM] ❌ face-api.js failed to load:", err);
      faceApiLoadPromise = null;
      return null;
    });
  return faceApiLoadPromise;
};

// ─── Face detection engine ────────────────────────────────────────────────────
async function detectFaceCount(
  video: HTMLVideoElement,
  faceapi: FaceApiModule | null,
  nativeDetector: any
): Promise<number> {
  if (!video || video.readyState < 2 || video.videoWidth === 0) return -1;

  // Priority 1: Native FaceDetector (Chrome/Edge)
  if (nativeDetector) {
    try {
      const faces = await nativeDetector.detect(video);
      return faces.length;
    } catch (err) {
      return -1;
    }
  }

  // Priority 2: face-api.js (Fallback)
  if (faceapi) {
    try {
      const detections = await faceapi.detectAllFaces(
        video,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,        // Increased from 224 for better accuracy in production
          scoreThreshold: 0.45,  // Slightly lower threshold for better recall
        })
      );
      // Filter out artifacts (very small boxes often aren't faces)
      const real = detections.filter(d => d.box.width > 40 && d.box.height > 40);
      return real.length;
    } catch (err) {
      return -1;
    }
  }

  return -1;
}

// ─── Component ────────────────────────────────────────────────────────────────
const AntiCheatingMonitor: React.FC<AntiCheatingMonitorProps> = ({
  interviewId,
  email,
  candidateName,
  onViolationLimitReached,
  isCompleted = false,
  isInteractionActive = false,
  videoRef,
}) => {
  const isUnloadingRef = useRef(false);
  const startTimeRef = useRef<number>(Date.now());
  const visibilityHiddenAtRef = useRef<number>(0);
  const startBlurTimeRef = useRef<number | null>(null);
  
  // Accumulators (More robust than "consecutive" logic)
  const multiFaceScoreRef = useRef(0);
  const noFaceScoreRef = useRef(0);
  const hasEverDetectedFaceRef = useRef(false);

  const lastEventTimeRef = useRef<Record<string, number>>({});

  const sendEvent = async (eventType: string, extraData: Record<string, unknown> = {}) => {
    if (isCompleted || isUnloadingRef.current) return;
    const now = Date.now();
    if (now - startTimeRef.current < GRACE_PERIOD_MS) return;

    const cooldowns: Record<string, number> = {
      visibility_hidden: 1000,
      window_blur: WINDOW_BLUR_COOLDOWN_MS,
      window_focus: 2000,
      multi_face_detected: FACE_EVENT_COOLDOWN_MS,
      no_face_detected: FACE_EVENT_COOLDOWN_MS,
    };

    const cooldown = cooldowns[eventType] ?? 2000;
    const lastFired = lastEventTimeRef.current[eventType] ?? 0;
    if (now - lastFired < cooldown) return;
    lastEventTimeRef.current[eventType] = now;

    console.log(`[ACM] Firing violation event: ${eventType}`);

    try {
      const { data } = await api.post(`/interviews/anti-cheating-event`, {
        interview_id: interviewId,
        email,
        candidate_name: candidateName,
        event_type: eventType,
        clientId: typeof window !== "undefined" ? sessionStorage.getItem(`interview_client_id_${interviewId}`) : null,
        timestamp: new Date().toISOString(),
        timestamp_str: getFormattedRelativeTime(),
        ...extraData,
      });

      if (data.interview_status === "auto_completed") {
        toast.error("Interview ended due to repeated violations.");
        onViolationLimitReached?.();
      } else {
        const score = data.suspicious_score ?? 0;
        const max = data.max_allowed_score ?? 10;
        if (score > 0 && score < max) {
          const isCritical = max - score <= 1;
          const msg = isCritical 
            ? `⚠️ Critical Warning (${score}/${max}): Only 1 violation remaining!`
            : `Warning (${score}/${max}): Stay focused on the screen.`;
          toast[isCritical ? "error" : "warning"](msg, { id: "ac-warn", duration: 5000 });
        }
      }
    } catch (err) {
      console.error("[ACM] Event failed:", err);
    }
  };

  const getFormattedRelativeTime = (): string => {
    try {
      const raw = localStorage.getItem(`timer_start_${interviewId}`) || localStorage.getItem(`timer_start_${interviewId}_${email}`);
      if (!raw) return "00:00";
      const totalS = Math.floor(Math.max(0, Date.now() - parseInt(raw, 10)) / 1000);
      return `${String(Math.floor(totalS / 60)).padStart(2, "0")}:${String(totalS % 60).padStart(2, "0")}`;
    } catch { return "00:00"; }
  };

  // ─── Standard Event Listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!interviewId || isCompleted) return;
    const handleBeforeUnload = () => { isUnloadingRef.current = true; };
    const handleVisibilityChange = () => {
      if (isUnloadingRef.current) return;
      if (document.visibilityState === "hidden") {
        visibilityHiddenAtRef.current = Date.now();
        startBlurTimeRef.current = Date.now();
        sendEvent("visibility_hidden");
      } else {
        const duration = startBlurTimeRef.current ? Date.now() - startBlurTimeRef.current : 0;
        startBlurTimeRef.current = null;
        sendEvent("window_focus", { durationMs: duration });
      }
    };
    const handleBlur = () => {
      setTimeout(() => {
        if (isUnloadingRef.current || document.visibilityState === "hidden") return;
        if (Date.now() - visibilityHiddenAtRef.current < BLUR_DEDUP_DELAY_MS * 2) return;
        startBlurTimeRef.current = Date.now();
        sendEvent("window_blur");
      }, BLUR_DEDUP_DELAY_MS);
    };
    const handleFocus = () => {
      if (document.visibilityState === "visible" && startBlurTimeRef.current) {
        const duration = Date.now() - startBlurTimeRef.current;
        startBlurTimeRef.current = null;
        sendEvent("window_focus", { durationMs: duration });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [interviewId, isCompleted]);

  // ─── Production Face Detection ─────────────────────────────────────────────
  useEffect(() => {
    if (!videoRef || isCompleted) return;
    let intervalId: any = null;
    let isMounted = true;

    const startDetection = async () => {
      // Engine initialization
      let nativeDetector: any = null;
      let faceapiModule: FaceApiModule | null = null;

      if (typeof window !== "undefined" && "FaceDetector" in window) {
        try {
          nativeDetector = new (window as any).FaceDetector({ fastMode: false, maxDetectedFaces: 5 });
          console.log("[ACM] ✅ Using Native FaceDetector API");
        } catch (e) { nativeDetector = null; }
      }

      if (!nativeDetector) {
        faceapiModule = await loadFaceApiModel();
        if (!faceapiModule && isMounted) {
          console.error("[ACM] ❌ No detection engine found. Anti-cheating limited.");
          return;
        }
      }

      // Wait for video stream
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          const v = videoRef.current;
          if (!isMounted) { clearInterval(check); resolve(); return; }
          if (v && v.readyState >= 2 && v.videoWidth > 0) {
            clearInterval(check);
            resolve();
          }
        }, 500);
      });

      if (!isMounted) return;
      console.log("[ACM] 🎥 Video stream active. Detection loop starting...");

      intervalId = setInterval(async () => {
        if (!isMounted || isCompleted || isUnloadingRef.current) return;
        const video = videoRef.current;
        if (!video) return;

        const count = await detectFaceCount(video, faceapiModule, nativeDetector);
        
        // Debug: Log only changes or occasional heartbeat
        if (count >= 0 && !hasEverDetectedFaceRef.current) {
          hasEverDetectedFaceRef.current = true;
          console.log("[ACM] 🔍 First face detection successful.");
        }

        // ─── Multi-face logic (Accumulative) ──────────────────────────
        if (count >= 2) {
          multiFaceScoreRef.current += 1;
          noFaceScoreRef.current = 0; // Reset no-face counter
          
          if (multiFaceScoreRef.current >= MULTI_FACE_THRESHOLD) {
            multiFaceScoreRef.current = 0; // Reset after firing
            await sendEvent("multi_face_detected", { faceCount: count });
          }
        } else if (count === 1) {
          // If 1 face is seen, gradually decay the multi-face suspicion
          multiFaceScoreRef.current = Math.max(0, multiFaceScoreRef.current - 1);
          noFaceScoreRef.current = 0;
        } else if (count === 0) {
          // ─── No-face logic (Accumulative) ───────────────────────────
          noFaceScoreRef.current += 1;
          multiFaceScoreRef.current = Math.max(0, multiFaceScoreRef.current - 1);
          
          if (noFaceScoreRef.current >= NO_FACE_THRESHOLD) {
            noFaceScoreRef.current = 0;
            await sendEvent("no_face_detected");
          }
        }
      }, FACE_CHECK_INTERVAL_MS);
    };

    startDetection();
    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [videoRef, isCompleted]);

  return null;
};

export default AntiCheatingMonitor;
