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
  isInteractionActive?: boolean; // When AI is speaking or candidate is focused on coding
  videoRef?: React.RefObject<HTMLVideoElement>;
}

type FaceApiModule = typeof import("face-api.js");

// ─── Constants ────────────────────────────────────────────────────────────────
const GRACE_PERIOD_MS = 8000;          
const FACE_CHECK_INTERVAL_MS = 1600;   // Slightly faster checks (1.6s)
const FACE_EVENT_COOLDOWN_MS = 15000;  // 15s between violation events
const BLUR_DEDUP_DELAY_MS = 350;
const WINDOW_BLUR_COOLDOWN_MS = 5000;

// Detection Buffer (Moving average / Sliding window)
// We look at the last N frames to determine the core state.
const DETECTION_BUFFER_SIZE = 5;

// face-api.js singleton promise
let faceApiLoadPromise: Promise<FaceApiModule | null> | null = null;

const loadFaceApiModel = (): Promise<FaceApiModule | null> => {
  if (faceApiLoadPromise) return faceApiLoadPromise;
  faceApiLoadPromise = import("face-api.js")
    .then(async (faceapi) => {
      // Load both SSD Mobilenet (accurate) and Tiny (fast fallback)
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
        faceapi.nets.tinyFaceDetector.loadFromUri("/models")
      ]);
      console.log("[ACM] ✅ face-api.js (SSD + Tiny) models loaded successfully");
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

  // Priority 1: Chrome/Edge native FaceDetector (Zero-cost, very accurate)
  if (nativeDetector) {
    try {
      const faces = await nativeDetector.detect(video);
      return faces.length;
    } catch (err) {}
  }

  // Priority 2: face-api.js SSD Mobilenet v1 (High accuracy)
  if (faceapi && faceapi.nets.ssdMobilenetv1.params) {
    try {
      const detections = await faceapi.detectAllFaces(
        video,
        new faceapi.SsdMobilenetv1Options({
          minConfidence: 0.30, // Highly sensitive for production robustness
          maxResults: 5
        })
      );
      return detections.length;
    } catch (err) {}
  }

  // Fallback: face-api.js TinyFaceDetector
  if (faceapi && faceapi.nets.tinyFaceDetector.params) {
    try {
      const detections = await faceapi.detectAllFaces(
        video,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.4
        })
      );
      return detections.length;
    } catch (err) {}
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
  
  // High-accuracy sliding window
  const faceHistoryRef = useRef<number[]>([]);
  const lastScoreLogRef = useRef(-1);
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

    // Show warning IMMEDIATELY to candidate
    const warningMsg = getWarningMessage(eventType);
    toast.error(`⚠️ Security Warning: ${warningMsg}`, { 
      id: `ac-${eventType}`, 
      duration: 6000,
      description: "This event has been recorded in the integrity log."
    });

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
        toast.error("Critical: Multiple integrity violations detected. Interview terminated.", { duration: 10000 });
        onViolationLimitReached?.();
      }
    } catch (err) {
      console.error("[ACM] Event push failed:", err);
    }
  };

  const getWarningMessage = (eventType: string) => {
    switch (eventType) {
      case "multi_face_detected": return "Multiple people detected. Ensure you are alone.";
      case "no_face_detected": return "Face not visible. Please stay in front of the camera.";
      case "visibility_hidden": return "Tab switched or minimized.";
      case "window_blur": return "Window lost focus.";
      default: return "Integrity check failed.";
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

  // ─── Browser Events ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!interviewId || isCompleted) return;
    const handleBeforeUnload = () => { isUnloadingRef.current = true; };
    const handleVisibilityChange = () => {
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

  // ─── Face Detection Loop ──────────────────────────────────────────────────
  useEffect(() => {
    if (!videoRef || isCompleted) return;
    let intervalId: any = null;
    let isMounted = true;

    const startDetection = async () => {
      let nativeDetector: any = null;
      let faceapiModule: FaceApiModule | null = null;

      if (typeof window !== "undefined" && "FaceDetector" in window) {
        try {
          nativeDetector = new (window as any).FaceDetector({ fastMode: false, maxDetectedFaces: 5 });
          console.log("[ACM] ✅ FaceDetector API ready.");
        } catch (e) {}
      }

      faceapiModule = await loadFaceApiModel();
      if (!faceapiModule && !nativeDetector && isMounted) return;

      // sync video readiness
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
      console.log("[ACM] 🔍 Integrity monitoring active.");

      intervalId = setInterval(async () => {
        if (!isMounted || isCompleted || isUnloadingRef.current) return;
        const video = videoRef.current;
        if (!video) return;

        const count = await detectFaceCount(video, faceapiModule, nativeDetector);
        
        if (count >= 0) {
          // Log changes in detection for better production monitoring
          if (count !== lastScoreLogRef.current) {
            console.log(`[ACM] Detected Faces: ${count}`);
            lastScoreLogRef.current = count;
          }

          // Maintain sliding window buffer
          faceHistoryRef.current.push(count);
          if (faceHistoryRef.current.length > DETECTION_BUFFER_SIZE) {
            faceHistoryRef.current.shift();
          }

          // Evaluate integrity based on the buffer
          const buffer = faceHistoryRef.current;
          if (buffer.length < 3) return; // Wait for buffer to prime

          // Integrity Check 1: Multiple Faces
          // If 2+ faces appear in at least 40% (2 out of 5) of the recent checks
          const multiFaceFrames = buffer.filter(c => c >= 2).length;
          if (multiFaceFrames >= 2) {
            faceHistoryRef.current = []; // Clear buffer to prevent spamming
            await sendEvent("multi_face_detected", { faceCount: count });
          }

          // Integrity Check 2: No Face
          // If 0 faces appear in 80% (4 out of 5) of the recent checks
          const noFaceFrames = buffer.filter(c => c === 0).length;
          if (noFaceFrames >= 4) {
            faceHistoryRef.current = []; // Clear buffer to prevent spamming
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
