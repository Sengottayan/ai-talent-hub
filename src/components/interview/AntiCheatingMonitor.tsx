/**
 * AntiCheatingMonitor — Production proctoring component
 *
 * Face detection strategy (priority order):
 *   1. Chrome/Edge native FaceDetector API (Shape Detection API)
 *      → Zero model files, zero packages, runs in the browser process itself
 *   2. face-api.js TinyFaceDetector (fallback for Firefox/Safari)
 *      → ~190KB model, loaded from /models/
 *
 * Violation counting: strictly monotonically increasing (never decreases)
 * Event deduplication: per-event-type cooldowns on both frontend + backend
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
const GRACE_PERIOD_MS = 8000;          // 8s before any events fire
const FACE_CHECK_INTERVAL_MS = 2000;   // Check every 2s
const FACE_EVENT_COOLDOWN_MS = 15000;  // Min 15s between same face events
const FACE_REQUIRED_CONSECUTIVE = 3;   // Require 3 matching frames before firing
const BLUR_DEDUP_DELAY_MS = 350;
const WINDOW_BLUR_COOLDOWN_MS = 5000;

// face-api.js fallback: singleton promise
let faceApiLoadPromise: Promise<FaceApiModule | null> | null = null;

const loadFaceApiModel = (): Promise<FaceApiModule | null> => {
  if (faceApiLoadPromise) return faceApiLoadPromise;
  faceApiLoadPromise = import("face-api.js")
    .then(async (faceapi) => {
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
      logger.log("✅ face-api.js fallback model loaded");
      return faceapi as FaceApiModule;
    })
    .catch((err) => {
      logger.warn("⚠️ face-api.js failed to load:", err);
      faceApiLoadPromise = null;
      return null;
    });
  return faceApiLoadPromise;
};

// ─── Face detection engine ────────────────────────────────────────────────────
// Returns number of detected faces, or -1 if detection failed entirely.
async function detectFaceCount(
  video: HTMLVideoElement,
  faceapi: FaceApiModule | null,
  nativeDetector: any
): Promise<number> {
  // Sanity check: video must be playing and have data
  if (
    !video ||
    video.readyState < 2 || // HAVE_CURRENT_DATA
    video.videoWidth === 0 ||
    video.videoHeight === 0
  ) {
    return -1;
  }

  // ── Path 1: Chrome/Edge native FaceDetector ────────────────────────────────
  if (nativeDetector) {
    try {
      const faces = await nativeDetector.detect(video);
      logger.log(`[ACM] Native FaceDetector: ${faces.length} face(s)`);
      return faces.length;
    } catch (err) {
      logger.log("[ACM] Native FaceDetector error (skipping frame):", err);
      return -1;
    }
  }

  // ── Path 2: face-api.js TinyFaceDetector (fallback) ───────────────────────
  if (faceapi) {
    try {
      const detections = await faceapi.detectAllFaces(
        video,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 224,
          scoreThreshold: 0.5,
        })
      );
      // Filter out implausibly small detections (< 50px wide)
      const real = detections.filter(
        (d) => d.box.width >= 50 && d.box.height >= 50
      );
      logger.log(`[ACM] face-api.js: ${real.length} face(s)`);
      return real.length;
    } catch (err) {
      logger.log("[ACM] face-api.js error (skipping frame):", err);
      return -1;
    }
  }

  // Neither engine available
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

  const multiFaceConsecutiveRef = useRef(0);
  const noFaceConsecutiveRef = useRef(0);

  const lastEventTimeRef = useRef<Record<string, number>>({});

  // ─── Send event to backend ─────────────────────────────────────────────────
  const sendEvent = async (
    eventType: string,
    extraData: Record<string, unknown> = {}
  ) => {
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
    if (now - lastFired < cooldown) {
      logger.log(
        `[ACM] Suppressed "${eventType}" (${Math.round((cooldown - (now - lastFired)) / 1000)}s cooldown)`
      );
      return;
    }
    lastEventTimeRef.current[eventType] = now;

    const timestampStr = getFormattedRelativeTime();
    const clientId =
      typeof window !== "undefined"
        ? sessionStorage.getItem(`interview_client_id_${interviewId}`)
        : null;

    logger.log(`[ACM] → ${eventType} @ ${timestampStr}`);

    try {
      const { data } = await api.post(`/interviews/anti-cheating-event`, {
        interview_id: interviewId,
        email,
        candidate_name: candidateName,
        event_type: eventType,
        clientId,
        timestamp: new Date().toISOString(),
        timestamp_str: timestampStr,
        ...extraData,
      });

      if (data.interview_status === "auto_completed") {
        toast.dismiss();
        toast.error("Interview ended due to repeated violations.", {
          id: "ac-violation-end",
          duration: 10000,
        });
        onViolationLimitReached?.();
        return;
      }

      const score = data.suspicious_score ?? 0;
      const max = data.max_allowed_score ?? 10;
      if (score > 0 && score < max) {
        const isCritical = max - score <= 1;
        toast[isCritical ? "error" : "warning"](
          isCritical
            ? `⚠️ Critical Warning (${score}/${max}): One more violation ends the interview!`
            : `Warning (${score}/${max}): ${getWarningMessage(eventType)}`,
          { id: "ac-warning", duration: isCritical ? 6000 : 4000 }
        );
      }
    } catch (err) {
      logger.error("[ACM] Failed to send event:", err);
    }
  };

  const getWarningMessage = (eventType: string) => {
    switch (eventType) {
      case "visibility_hidden": return "Please stay on the interview tab.";
      case "window_blur":       return "Keep the interview window focused.";
      case "multi_face_detected": return "Multiple people detected — this is recorded.";
      case "no_face_detected":  return "Please stay in front of the camera.";
      default: return "Suspicious activity detected.";
    }
  };

  const getFormattedRelativeTime = (): string => {
    if (typeof window === "undefined") return "00:00";
    try {
      const raw =
        localStorage.getItem(`timer_start_${interviewId}`) ||
        localStorage.getItem(`timer_start_${interviewId}_${email}`);
      if (!raw) return "00:00";
      const totalS = Math.floor(Math.max(0, Date.now() - parseInt(raw, 10)) / 1000);
      return `${String(Math.floor(totalS / 60)).padStart(2, "0")}:${String(totalS % 60).padStart(2, "0")}`;
    } catch {
      return "00:00";
    }
  };

  // ─── Mount: initial focus log ──────────────────────────────────────────────
  useEffect(() => {
    if (interviewId && email && !isCompleted) {
      const t = setTimeout(() => sendEvent("window_focus"), GRACE_PERIOD_MS + 500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId, email]);

  // ─── Tab visibility + window focus/blur ───────────────────────────────────
  useEffect(() => {
    if (!interviewId || !email || isCompleted) return;

    const handleBeforeUnload = () => { isUnloadingRef.current = true; };

    const handleVisibilityChange = () => {
      if (isUnloadingRef.current) return;
      if (document.visibilityState === "hidden") {
        visibilityHiddenAtRef.current = Date.now();
        startBlurTimeRef.current = Date.now();
        sendEvent("visibility_hidden");
      } else {
        const duration = startBlurTimeRef.current
          ? Date.now() - startBlurTimeRef.current
          : 0;
        startBlurTimeRef.current = null;
        sendEvent("window_focus", { durationMs: duration });
      }
    };

    const handleBlur = () => {
      if (isUnloadingRef.current) return;
      setTimeout(() => {
        if (isUnloadingRef.current) return;
        if (Date.now() - visibilityHiddenAtRef.current < BLUR_DEDUP_DELAY_MS * 2) return;
        if (document.visibilityState === "hidden") return;
        startBlurTimeRef.current = Date.now();
        sendEvent("window_blur");
      }, BLUR_DEDUP_DELAY_MS);
    };

    const handleFocus = () => {
      if (isUnloadingRef.current) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId, email, isCompleted]);

  // ─── Face Detection ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!videoRef || isCompleted) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let isMounted = true;

    const startDetection = async () => {
      // ── Step 1: Initialise detection engine ────────────────────────────────
      let nativeDetector: any = null;
      let faceapiModule: FaceApiModule | null = null;

      const hasNativeFaceDetector =
        typeof window !== "undefined" && "FaceDetector" in window;

      if (hasNativeFaceDetector) {
        try {
          // Chrome/Edge native Face Detector — most reliable, no model loading
          nativeDetector = new (window as any).FaceDetector({
            fastMode: false,      // Higher accuracy mode
            maxDetectedFaces: 10,
          });
          logger.log("✅ [ACM] Using native FaceDetector API");
        } catch (e) {
          logger.warn("⚠️ [ACM] Native FaceDetector failed to init:", e);
          nativeDetector = null;
        }
      }

      if (!nativeDetector) {
        // Fallback: face-api.js TinyFaceDetector
        logger.log("[ACM] Native FaceDetector unavailable — loading face-api.js");
        faceapiModule = await loadFaceApiModel();
        if (!faceapiModule) {
          logger.error("[ACM] ❌ No face detection engine available");
          return;
        }
      }

      if (!isMounted) return;
      logger.log("[ACM] Face detection loop starting");

      // ── Step 2: Wait for video to be ready ─────────────────────────────────
      // Poll until video has data (handles race with camera init)
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
      logger.log("[ACM] Video is ready — starting frame analysis");

      // ── Step 3: Detection loop ─────────────────────────────────────────────
      intervalId = setInterval(async () => {
        if (!isMounted || isCompleted || isUnloadingRef.current) return;

        const video = videoRef.current;
        if (!video) return;

        const count = await detectFaceCount(video, faceapiModule, nativeDetector);
        if (count === -1) return; // Detection error — skip frame

        // Multi-face: N consecutive frames with 2+ faces
        if (count >= 2) {
          multiFaceConsecutiveRef.current += 1;
          noFaceConsecutiveRef.current = 0;
          logger.log(`[ACM] Multi-face frame ${multiFaceConsecutiveRef.current}/${FACE_REQUIRED_CONSECUTIVE}`);

          if (multiFaceConsecutiveRef.current >= FACE_REQUIRED_CONSECUTIVE) {
            multiFaceConsecutiveRef.current = 0;
            await sendEvent("multi_face_detected", { faceCount: count });
            toast.error(
              `🚨 Multiple people detected (${count} faces). This is being recorded.`,
              { id: "multi-face-toast", duration: 6000 }
            );
          }
        } else {
          multiFaceConsecutiveRef.current = 0;
        }

        // No-face: N consecutive frames with 0 faces
        if (count === 0) {
          noFaceConsecutiveRef.current += 1;
          logger.log(`[ACM] No-face frame ${noFaceConsecutiveRef.current}/${FACE_REQUIRED_CONSECUTIVE}`);

          if (noFaceConsecutiveRef.current >= FACE_REQUIRED_CONSECUTIVE) {
            noFaceConsecutiveRef.current = 0;
            await sendEvent("no_face_detected");
            toast.warning(
              "Face not visible. Please stay in front of the camera.",
              { id: "no-face-toast", duration: 5000 }
            );
          }
        } else {
          noFaceConsecutiveRef.current = 0;
        }
      }, FACE_CHECK_INTERVAL_MS);
    };

    startDetection().catch((err) =>
      logger.error("[ACM] Detection startup error:", err)
    );

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, isCompleted]);

  return null;
};

export default AntiCheatingMonitor;
