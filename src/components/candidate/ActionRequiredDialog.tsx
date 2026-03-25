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
import { CalendarIcon, AlertCircle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import axios from "axios";
import { useToast } from "@/hooks/use-toast";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

interface ActionRequiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rescheduleRequest: any;
  onSuccess: () => void;
}

export function ActionRequiredDialog({
  open,
  onOpenChange,
  rescheduleRequest,
  onSuccess,
}: ActionRequiredDialogProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  if (!rescheduleRequest) return null;

  const availableDates = rescheduleRequest.availableDates || [];
  const jobRole = rescheduleRequest.jobRole || "Interview";

  const handleConfirm = async () => {
    if (!selectedDate) return;

    setIsSubmitting(true);

    try {
      await axios.post(
        `${API_URL}/reschedule/${rescheduleRequest._id}/candidate-confirm`,
        {
          confirmedDate: selectedDate,
        },
      );

      toast({
        title: "✅ Interview Confirmed",
        description: "Your interview has been rescheduled successfully.",
      });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error.response?.data?.message || "Failed to confirm interview.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-5 w-5" />
            Action Required: Select New Time
          </DialogTitle>
          <DialogDescription>
            Your requested time was not available. Please select one of the
            following alternative slots proposed by our team for your{" "}
            <strong>{jobRole}</strong> interview.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="grid gap-3">
            {availableDates.map((dateStr: string) => {
              const date = new Date(dateStr);
              const isSelected = selectedDate === dateStr;

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`
                                        cursor-pointer rounded-lg border p-4 flex items-center justify-between transition-all
                                        ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input hover:bg-muted/50"}
                                    `}
                >
                  <div className="flex items-center gap-3">
                    <CalendarIcon
                      className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <div className="flex flex-col">
                      <span
                        className={`font-medium ${isSelected ? "text-primary" : "text-foreground"}`}
                      >
                        {format(date, "EEEE, MMMM d, yyyy")}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {format(date, "h:mm a")}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <CheckCircle className="h-5 w-5 text-primary" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedDate || isSubmitting}
          >
            {isSubmitting ? "Confirming..." : "Confirm Selection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
