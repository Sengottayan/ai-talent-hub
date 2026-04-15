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
const FACE_CHECK_INTERVAL_MS = 1800;   // Balanced interval (1.8s)
const FACE_EVENT_COOLDOWN_MS = 20000;  
const BLUR_DEDUP_DELAY_MS = 350;
const WINDOW_BLUR_COOLDOWN_MS = 5000;

// Accumulator thresholds (Robustness)
const MULTI_FACE_THRESHOLD = 2; // Reduced threshold for more sensitivity
const NO_FACE_THRESHOLD = 4;    

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
    } catch (err) {
      // If native fails, fallback to face-api immediately
    }
  }

  // Priority 2: face-api.js SSD Mobilenet v1 (High accuracy, handles background faces)
  if (faceapi && faceapi.nets.ssdMobilenetv1.params) {
    try {
      const detections = await faceapi.detectAllFaces(
        video,
        new faceapi.SsdMobilenetv1Options({
          minConfidence: 0.35, // Very sensitive, will count background people
          maxResults: 5
        })
      );
      return detections.length;
    } catch (err) {
      // If SSD fails, try Tiny as last resort
    }
  }

  // Fallback: face-api.js TinyFaceDetector (Fast, light)
  if (faceapi && faceapi.nets.tinyFaceDetector.params) {
    try {
      const detections = await faceapi.detectAllFaces(
        video,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,        // Max resolution for Tiny to see small faces
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
  
  const multiFaceScoreRef = useRef(0);
  const noFaceScoreRef = useRef(0);
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
        toast.error("Violation limit reached. Interview ended.");
        onViolationLimitReached?.();
      } else {
        const score = data.suspicious_score ?? 0;
        const max = data.max_allowed_score ?? 10;
        if (score > 0 && (score >= 5 || eventType.includes("face"))) {
          toast.warning(`Suspicious activity (${score}/${max}): ${getWarningMessage(eventType)}`, { id: "ac-warn", duration: 5000 });
        }
      }
    } catch (err) {
      console.error("[ACM] Event push failed:", err);
    }
  };

  const getWarningMessage = (eventType: string) => {
    switch (eventType) {
      case "multi_face_detected": return "Multiple faces detected in camera.";
      case "no_face_detected": return "Candidate face not visible.";
      case "visibility_hidden": return "Keep interview tab active.";
      default: return "Focus on the screen.";
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

  // ─── Standard Events ──────────────────────────────────────────────────────
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

  // ─── Production Face Detection (SSD Mobilenet v1) ───────────────────────────
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

      // wait for video
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
      console.log("[ACM] 🎥 Starting high-accuracy detection loop...");

      intervalId = setInterval(async () => {
        if (!isMounted || isCompleted || isUnloadingRef.current) return;
        const video = videoRef.current;
        if (!video) return;

        const count = await detectFaceCount(video, faceapiModule, nativeDetector);
        
        // Log changes in detection for better production monitoring
        if (count >= 0 && count !== lastScoreLogRef.current) {
          console.log(`[ACM] Detected Faces: ${count}`);
          lastScoreLogRef.current = count;
        }

        if (count >= 2) {
          multiFaceScoreRef.current += 1;
          noFaceScoreRef.current = 0;
          if (multiFaceScoreRef.current >= MULTI_FACE_THRESHOLD) {
            multiFaceScoreRef.current = 0;
             await sendEvent("multi_face_detected", { faceCount: count });
          }
        } else if (count === 0) {
          noFaceScoreRef.current += 1;
          multiFaceScoreRef.current = Math.max(0, multiFaceScoreRef.current - 1);
          if (noFaceScoreRef.current >= NO_FACE_THRESHOLD) {
            noFaceScoreRef.current = 0;
            await sendEvent("no_face_detected");
          }
        } else {
          // Count = 1, regular state
          multiFaceScoreRef.current = Math.max(0, multiFaceScoreRef.current - 1);
          noFaceScoreRef.current = 0;
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
