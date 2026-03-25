import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Check, Shield, Clock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import InterviewHeader from "@/components/interview/InterviewHeader";

export default function CandidateInterviewCompleted() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    // Cleanup: Stop any media streams
    const cleanup = () => {
      try {
        const videos = document.querySelectorAll("video");
        videos.forEach((video) => {
          if (video.srcObject) {
            const stream = video.srcObject as MediaStream;
            stream.getTracks().forEach((track) => track.stop());
            video.srcObject = null;
          }
        });
      } catch (e) {
        console.error("Error during media cleanup:", e);
      }
    };

    cleanup();

    // Clear interview-specific storage
    const interviewKeys = Object.keys(localStorage);
    interviewKeys.forEach((key) => {
      if (key.includes(id || "") || key === "interviewInfo") {
        localStorage.removeItem(key);
      }
    });
    localStorage.setItem(`interview_completed_${id}`, "true");

    // Attempt auto-close after 10 seconds
    const closeTimer = setTimeout(() => {
      try {
        window.close();
      } catch (e) {
        console.log("Cannot auto-close window");
      }
    }, 10000);

    // Prevent back navigation
    const blockBack = () => {
      window.history.pushState(null, "", window.location.href);
    };

    blockBack();
    blockBack();
    blockBack();

    const handlePopState = () => {
      blockBack();
      window.history.go(1);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      clearTimeout(closeTimer);
    };
  }, [id]);

  const handleClose = () => {
    window.close();
    setTimeout(() => {
      alert("Please close this tab manually for security.");
    }, 300);
  };

  const handleGoToDashboard = () => {
    navigate("/candidate/dashboard");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <InterviewHeader />

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Top Branding Section */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-8 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10">
              <svg
                className="w-full h-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
              </svg>
            </div>

            <div className="relative z-10">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-white/20 backdrop-blur-md rounded-full mb-4 border border-white/30 animate-pulse">
                <Check className="w-7 h-7 text-white stroke-[3px]" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">
                Interview Completed!
              </h1>
              <p className="text-blue-100 text-sm">
                You've successfully finished your AIA Talent Hub assessment.
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {/* Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-blue-50/50 border border-blue-100">
                <div className="bg-blue-100 p-2 rounded-xl mt-0.5">
                  <Shield className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm mb-0.5">
                    Securely Processed
                  </h3>
                  <p className="text-[12px] text-slate-600 leading-tight">
                    Your data has been encrypted and sent to recruiters.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-sky-50/50 border border-sky-100">
                <div className="bg-sky-100 p-2 rounded-xl mt-0.5">
                  <Clock className="w-4 h-4 text-sky-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm mb-0.5">
                    What's Next?
                  </h3>
                  <p className="text-[12px] text-slate-600 leading-tight">
                    Expect an update within 3-5 business days via email.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button
                onClick={handleGoToDashboard}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white text-base font-bold rounded-xl shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5"
              >
                Go to Dashboard
              </Button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-100"></div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  or
                </span>
                <div className="h-px flex-1 bg-slate-100"></div>
              </div>

              <button
                onClick={handleClose}
                className="w-full h-10 bg-white hover:bg-slate-50 text-slate-600 font-semibold rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-2 text-sm"
              >
                Close Session
              </button>
            </div>

            {/* Security Footer */}
            <div className="mt-8 flex flex-col items-center">
              <p className="text-[11px] text-slate-400 text-center max-w-sm mb-3 grayscale">
                For your security, please close this window once you're
                finished.
              </p>
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                <Check className="w-3 h-3" />
                <span className="text-[9px] font-bold uppercase tracking-wider">
                  Responses Synced
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
