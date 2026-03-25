import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Business hours: 9 AM to 6 PM slots in 30-min increments
const TIME_SLOTS = (() => {
  const slots: { label: string; value: string }[] = [];
  for (let h = 9; h < 18; h++) {
    for (const m of [0, 30]) {
      const hh = h.toString().padStart(2, "0");
      const mm = m === 0 ? "00" : "30";
      const suffix = h < 12 ? "AM" : h === 12 ? "PM" : "PM";
      const displayH = h <= 12 ? h : h - 12;
      slots.push({
        label: `${displayH}:${mm} ${suffix}`,
        value: `${hh}:${mm}`,
      });
    }
  }
  return slots;
})();

interface RescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interview: {
    _id: string;
    jobRole: string;
    interviewId: string;
  } | null;
  candidateId: string;
  onSuccess: () => void;
}

export function RescheduleDialog({
  open,
  onOpenChange,
  interview,
  candidateId,
  onSuccess,
}: RescheduleDialogProps) {
  const [date, setDate] = useState<Date>();
  const [timeSlot, setTimeSlot] = useState<string>("");
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadyPending, setAlreadyPending] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!date || !timeSlot || !reason.trim() || !interview) return;

    // Combine chosen date + chosen time into a proper local datetime
    // e.g. date = Sat Feb 21 2026, timeSlot = "10:30"
    // → "2026-02-21T10:30:00" treated as LOCAL time, not UTC midnight
    const [hours, minutes] = timeSlot.split(":").map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);

    setIsSubmitting(true);
    setAlreadyPending(false);
    try {
      await api.post(`/reschedule`, {
        interviewId: interview._id,
        candidateId: candidateId,
        requestedDate: combined.toISOString(), // Full ISO with time
        reason: reason,
      });

      toast({
        title: "✅ Request Submitted",
        description:
          "Your reschedule request has been sent to HR for review. You will be notified once it is approved or rejected.",
      });

      onSuccess();
      onOpenChange(false);
      setDate(undefined);
      setTimeSlot("");
      setReason("");
    } catch (error: any) {
      const msg: string = error?.response?.data?.message || "";

      // Check if server returned a duplicate-request error
      if (
        error?.response?.status === 409 ||
        msg.toLowerCase().includes("already") ||
        msg.toLowerCase().includes("pending")
      ) {
        setAlreadyPending(true);
        toast({
          title: "⚠️ Request Already Pending",
          description:
            msg ||
            "You already have an active reschedule request for this interview. Please wait for HR to review it.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to submit reschedule request. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = !!date && !!timeSlot && reason.trim().length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setAlreadyPending(false);
      }}
    >
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Request Interview Reschedule</DialogTitle>
          <DialogDescription>
            Propose a new <strong>date and time</strong> for your{" "}
            <span className="font-semibold text-foreground">
              {interview?.jobRole}
            </span>{" "}
            interview.
          </DialogDescription>
        </DialogHeader>

        {alreadyPending && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              You already have an active reschedule request for this interview.
              Please wait for HR to review it before submitting another.
            </span>
          </div>
        )}

        <div className="grid gap-5 py-2">
          {/* ── Date Picker ───────────────────────────────────── */}
          <div className="grid gap-2">
            <Label htmlFor="date" className="flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
              New Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? (
                    format(date, "EEEE, MMMM d, yyyy")
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  disabled={(d) => d < new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* ── Time Picker ───────────────────────────────────── */}
          <div className="grid gap-2">
            <Label htmlFor="time" className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              Preferred Time{" "}
              <span className="text-xs font-normal text-muted-foreground ml-1">
                (business hours · IST)
              </span>
            </Label>
            <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto rounded-lg border border-input p-2">
              {TIME_SLOTS.map((slot) => (
                <button
                  key={slot.value}
                  type="button"
                  onClick={() => setTimeSlot(slot.value)}
                  className={cn(
                    "rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors",
                    timeSlot === slot.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/40 text-foreground hover:bg-muted",
                  )}
                >
                  {slot.label}
                </button>
              ))}
            </div>
            {timeSlot && (
              <p className="text-xs text-muted-foreground">
                Selected:{" "}
                <strong>
                  {TIME_SLOTS.find((s) => s.value === timeSlot)?.label}
                </strong>
                {date && (
                  <>
                    {" "}
                    on <strong>{format(date, "EEE, MMM d")}</strong>
                  </>
                )}
              </p>
            )}
          </div>

          {/* ── Reason ────────────────────────────────────────── */}
          <div className="grid gap-2">
            <Label htmlFor="reason">Reason for Rescheduling</Label>
            <Textarea
              id="reason"
              placeholder="Please provide a reason for rescheduling..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[90px] resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!isValid || isSubmitting}
            onClick={handleSubmit}
            className="gap-2"
          >
            {isSubmitting && (
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            )}
            {isSubmitting ? "Submitting..." : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
