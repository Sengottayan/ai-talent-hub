/**
 * AntiCheatingMonitor — Highly Optimized Production-Grade Proctoring
 * Enhanced for rapid detection and minimal latency.
 */

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { logger } from "@/lib/logger";

// ─── Configuration ────────────────────────────────────────────────────────────
const GRACE_PERIOD_MS = 5000;          // 5s initial grace
const CHECK_INTERVAL_MS = 1000;       // Faster polling (1 frame per second)
const COOLDOWN_MS = 15000;            // 15s between backend events
const WINDOW_SIZE = 5;                // Rolling history

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

// ─── Model Management ─────────────────────────────────────────────────────────
let modelPromise: Promise<FaceApiModule | null> | null = null;

const loadModels = (): Promise<FaceApiModule | null> => {
  if (modelPromise) return modelPromise;
  modelPromise = import("face-api.js")
    .then(async (faceapi) => {
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
      console.log("[ACM] ✅ Face Detection Engine Ready");
      return faceapi as FaceApiModule;
    })
    .catch((err) => {
      console.error("[ACM] ❌ Model Load Failure:", err);
      modelPromise = null;
      return null;
    });
  return modelPromise;
};

// ─── Component ────────────────────────────────────────────────────────────────
const AntiCheatingMonitor: React.FC<AntiCheatingMonitorProps> = ({
  interviewId,
  email,
  candidateName,
  onViolationLimitReached,
  isCompleted = false,
  videoRef,
}) => {
  // Persistence Refs
  const isUnloading = useRef(false);
  const startTime = useRef(Date.now());
  const lastEventFiredAt = useRef<Record<string, number>>({});
  
  // Detection Buffer
  const detectionBuffer = useRef<number[]>([]);
  const lastLogEntry = useRef<number>(-1);

  // ─── 1. Backend Sync ───────────────────────────────────────────────────────
  const triggerViolation = useCallback(async (type: string, metadata: any = {}) => {
    if (isCompleted || isUnloading.current) return;
    
    const now = Date.now();
    if (now - startTime.current < GRACE_PERIOD_MS) return;

    // Cooldown check
    const lastFired = lastEventFiredAt.current[type] || 0;
    if (now - lastFired < COOLDOWN_MS) return;
    lastEventFiredAt.current[type] = now;

    // ─── Phase A: UI Feedback (Instant) ───────────────────────────────────
    const messages: Record<string, { title: string; desc: string }> = {
      multi_face_detected: {
        title: "⚠️ MULTIPLE PEOPLE DETECTED",
        desc: "Security alert: More than one person visible. This is recorded in the monitor log."
      },
      no_face_detected: {
        title: "⚠️ FACE NOT DETECTED",
        desc: "Please ensure your face is fully visible within the camera frame."
      },
      visibility_hidden: {
        title: "⚠️ TAB SWITCH DETECTED",
        desc: "Focus lost. Stay on the interview page to avoid disqualification."
      },
      window_blur: {
        title: "⚠️ WINDOW FOCUS LOST",
        desc: "Interview window minimized or background app activated."
      }
    };

    const alert = messages[type] || { title: "⚠️ INTEGRITY WARNING", desc: "Suspicious activity detected." };
    
    // Stable ID to prevent overlap
    toast.error(alert.title, {
      id: `ac-violation-${type}`,
      description: alert.desc,
      duration: 8000,
    });

    console.log(`[ACM] → FIRING VIOLATION: ${type}`);

    // ─── Phase B: Persistence (Async) ───────────────────────────────────────
    try {
      const { data } = await api.post(`/interviews/anti-cheating-event`, {
        interview_id: interviewId,
        email,
        candidate_name: candidateName,
        event_type: type,
        clientId: sessionStorage.getItem(`interview_client_id_${interviewId}`),
        timestamp: new Date().toISOString(),
        timestamp_str: getTimerString(),
        ...metadata,
      });

      if (data.interview_status === "auto_completed") {
        toast.error("INTERVIEW TERMINATED", {
          description: "Multiple integrity violations detected. Your session has ended.",
          duration: 15000,
        });
        onViolationLimitReached?.();
      }
    } catch (err) {
      console.error("[ACM] Backend sync failed:", err);
    }
  }, [interviewId, email, candidateName, isCompleted, onViolationLimitReached]);

  const getTimerString = () => {
    try {
      const raw = localStorage.getItem(`timer_start_${interviewId}`) || localStorage.getItem(`timer_start_${interviewId}_${email}`);
      if (!raw) return "00:00";
      const s = Math.floor((Date.now() - parseInt(raw, 10)) / 1000);
      return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    } catch { return "00:00"; }
  };

  // ─── 2. Browser Window Events ──────────────────────────────────────────────
  useEffect(() => {
    if (!interviewId || isCompleted) return;

    const onUnload = () => { isUnloading.current = true; };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") triggerViolation("visibility_hidden");
    };
    const onBlur = () => {
      setTimeout(() => {
        if (!isUnloading.current && document.visibilityState === "visible") {
          triggerViolation("window_blur");
        }
      }, 500);
    };

    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [interviewId, isCompleted, triggerViolation]);

  // ─── 3. Professional Face Detection Loop ──────────────────────────────────
  useEffect(() => {
    if (!videoRef || isCompleted) return;
    let loopId: any = null;
    let isActive = true;

    const start = async () => {
      // Initialize engines
      let native: any = null;
      if (typeof window !== "undefined" && "FaceDetector" in window) {
        try { native = new (window as any).FaceDetector({ fastMode: false, maxDetectedFaces: 5 }); } catch {}
      }
      
      const faceapi = await loadModels();
      if (!faceapi && !native) return;

      // Sync with video readiness
      await new Promise<void>((res) => {
        const check = setInterval(() => {
          const v = videoRef.current;
          if (!isActive) { clearInterval(check); res(); return; }
          if (v && v.readyState >= 2 && v.videoWidth > 0) { clearInterval(check); res(); }
        }, 300); // Fast poller for video load
      });

      if (!isActive) return;
      console.log("[ACM] Monitoring Loop Active");

      loopId = setInterval(async () => {
        if (!isActive || isCompleted || isUnloading.current) return;
        const video = videoRef.current;
        if (!video) return;

        let found = -1;
        
        // Strategy: Performance first, Fallback accurate
        if (native) {
          try {
            const faces = await native.detect(video);
            found = faces.length;
          } catch {}
        }

        if (found < 0 && faceapi) {
          try {
            const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({
              inputSize: 416, // Optimized size for speed + accuracy
              scoreThreshold: 0.35
            }));
            found = detections.length;
          } catch {}
        }

        if (found >= 0) {
          if (found !== lastLogEntry.current) {
            console.log(`[ACM] Face Count: ${found}`);
            lastLogEntry.current = found;
          }

          detectionBuffer.current.push(found);
          if (detectionBuffer.current.length > WINDOW_SIZE) detectionBuffer.current.shift();

          const buf = detectionBuffer.current;
          // Minimum buffer to start making decisions
          if (buf.length < 2) return;

          // DETERMINISTIC FAST-TRACK LOGIC:
          
          // MULTI: Highly sensitive. If 2+ faces in 2 out of recent 3 frames.
          const recentBuf = buf.slice(-3);
          const multiCount = recentBuf.filter(c => c >= 2).length;
          if (multiCount >= 2) {
            detectionBuffer.current = [1, 1, 1]; // Reset
            triggerViolation("multi_face_detected", { faceCount: found });
            return;
          }

          // NO FACE: Robust check to avoid false positives. 4 of last 5 frames.
          const noCount = buf.filter(c => c === 0).length;
          if (noCount >= 4) {
            detectionBuffer.current = [1, 1, 1, 1, 1];
            triggerViolation("no_face_detected");
            return;
          }
        }
      }, CHECK_INTERVAL_MS);
    };

    start();
    return () => {
      isActive = false;
      if (loopId) clearInterval(loopId);
    };
  }, [videoRef, isCompleted, triggerViolation]);

  return null;
};

export default AntiCheatingMonitor;
