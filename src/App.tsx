import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from ".//components/layout/DashboardLayout";
import { CandidateLayout } from ".//components/layout/CandidateLayout";
import { InterviewDataProvider } from ".//contexts/InterviewDataContext";
import Index from ".//pages/Index";
import Login from ".//pages/Login";
import Signup from ".//pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import Dashboard from ".//pages/Dashboard";
import ResumeUpload from "./pages/ResumeUpload";
import ShortlistedCandidates from "./pages/ShortlistedCandidates";
import Interviews from "./pages/Interviews";
import RescheduleRequests from "./pages/RescheduleRequests";
import InterviewResults from "./pages/InterviewResults";
import HRSettings from "./pages/HRSettings";
import NotFound from ".//pages/NotFound";
import CandidateDashboard from "./pages/candidate/CandidateDashboard";
import CandidateResume from "./pages/candidate/CandidateResume";
import CandidateMock from "./pages/candidate/CandidateMock";
import CandidateJobs from "./pages/candidate/CandidateJobs";
import CandidateSkills from "./pages/candidate/CandidateSkills";
import CandidateSettings from "./pages/candidate/CandidateSettings";
import InterviewSession from "./pages/candidate/InterviewSession";

// New Voice Interview Pages
import CandidateInterviewJoin from "./pages/CandidateInterviewJoin";
import CandidateInterviewPrep from "./pages/CandidateInterviewPrep";
import CandidateInterviewStart from "./pages/CandidateInterviewStart";
import CandidateInterviewCoding from "./pages/CandidateInterviewCoding";
import CandidateInterviewCompleted from "./pages/CandidateInterviewCompleted";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <InterviewDataProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* HR Admin Routes */}
            <Route path="/hr" element={<DashboardLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="upload" element={<ResumeUpload />} />
              <Route path="shortlisted" element={<ShortlistedCandidates />} />
              <Route path="interviews" element={<Interviews />} />
              <Route path="reschedule" element={<RescheduleRequests />} />
              <Route path="results" element={<InterviewResults />} />
              <Route path="settings" element={<HRSettings />} />
            </Route>

            {/* Candidate Routes */}
            <Route element={<CandidateLayout />}>
              <Route path="/candidate/dashboard" element={<CandidateDashboard />} />
              <Route path="/candidate/resume" element={<CandidateResume />} />
              <Route path="/candidate/mock" element={<CandidateMock />} />
              <Route path="/candidate/jobs" element={<CandidateJobs />} />
              <Route path="/candidate/skills" element={<CandidateSkills />} />
              <Route path="/candidate/settings" element={<CandidateSettings />} />
            </Route>

            {/* New Voice Interview Routes */}
            <Route path="/interview/:id" element={<CandidateInterviewJoin />} />
            <Route path="/interview/:id/prep" element={<CandidateInterviewPrep />} />
            <Route path="/interview/:id/start" element={<CandidateInterviewStart />} />
            <Route path="/interview/:id/coding" element={<CandidateInterviewCoding />} />
            <Route path="/interview/:id/completed" element={<CandidateInterviewCompleted />} />

            {/* Legacy Interview Route (Keep for backward compatibility) */}
            <Route path="/interview/:id/session" element={<InterviewSession />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </InterviewDataProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
