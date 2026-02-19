import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, TrendingUp } from "lucide-react";

interface FeedbackModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    interview: {
        position: string;
        score: number;
        date: string;
        improvements: string[];
        feedback: string;
    } | null;
}

export function FeedbackModal({ open, onOpenChange, interview }: FeedbackModalProps) {
    if (!interview) return null;

    const getScoreColor = (score: number) => {
        if (score >= 70) return "text-green-500";
        if (score >= 50) return "text-orange-500";
        return "text-red-500";
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold">Interview Feedback</DialogTitle>
                    <p className="text-sm text-muted-foreground">{interview.position}</p>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Overall Score */}
                    <div className="rounded-xl border border-border bg-muted/30 p-6 text-center">
                        <p className="text-sm font-medium text-muted-foreground mb-2">Overall Score</p>
                        <div className={`text-5xl font-bold ${getScoreColor(interview.score)}`}>
                            {interview.score}%
                        </div>
                        <div className="mt-3 w-full">
                            <Progress
                                value={interview.score}
                                className="h-2"
                            />
                        </div>
                        <div className="mt-2 flex justify-center">
                            <Badge
                                variant={interview.score >= 70 ? "default" : interview.score >= 50 ? "secondary" : "destructive"}
                                className="text-xs"
                            >
                                {interview.score >= 70 ? "Excellent" : interview.score >= 50 ? "Good" : "Needs Improvement"}
                            </Badge>
                        </div>
                    </div>

                    {/* Key Areas of Improvement */}
                    <div>
                        <h4 className="flex items-center gap-2 font-semibold text-foreground mb-3">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            Key Areas of Improvement
                        </h4>
                        <ul className="space-y-2">
                            {interview.improvements.map((item, index) => (
                                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                                    <AlertCircle className="h-4 w-4 mt-0.5 text-orange-500 flex-shrink-0" />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* AI Feedback */}
                    <div>
                        <h4 className="flex items-center gap-2 font-semibold text-foreground mb-3">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            AI Feedback
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed bg-muted/50 rounded-lg p-4 border border-border">
                            {interview.feedback}
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
