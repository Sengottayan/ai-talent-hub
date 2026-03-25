import React, { useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";

interface VideoPanelProps {
  onFaceDetectedStatusChange: (isDetected: boolean) => void;
  isActive: boolean;
}

export const VideoPanel: React.FC<VideoPanelProps> = ({
  onFaceDetectedStatusChange,
  isActive,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [faceDetected, setFaceDetected] = useState(true);

  // 1. Initialize Camera
  useEffect(() => {
    const startCamera = async () => {
      if (!isActive) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.error("Camera access denied:", e);
        // Assume face not detected if camera fails
        setFaceDetected(false);
        onFaceDetectedStatusChange(false);
      }
    };

    if (isActive) {
      startCamera();
    } else {
      // Stop tracks if inactive
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    }
  }, [isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // 2. Simple Pixel-Based Skin Detection (Proxy for Face)
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (!ctx) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = frame.data;
        let skinPixels = 0;

        // Sample every 10th pixel for performance
        for (let i = 0; i < data.length; i += 40) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Basic skin color thresholding
          if (
            r > 60 &&
            g > 40 &&
            b > 20 &&
            r > g &&
            r > b &&
            Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
            Math.abs(r - g) > 15
          ) {
            skinPixels++;
          }
        }

        // If > 2% of pixels are skin-like, assume face present
        const totalPixelsCheck = data.length / 40;
        const isPresent = skinPixels / totalPixelsCheck > 0.02;

        if (isPresent !== faceDetected) {
          setFaceDetected(isPresent);
          onFaceDetectedStatusChange(isPresent);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, faceDetected, onFaceDetectedStatusChange]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover transform scale-x-[-1]"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Overlay Status */}
      {!faceDetected && isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <p className="text-red-500 font-bold animate-pulse">
            FACE NOT DETECTED
          </p>
        </div>
      )}
    </div>
  );
};
