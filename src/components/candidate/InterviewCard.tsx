import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Play, Eye } from "lucide-react";

interface InterviewCardProps {
    id: string;
    position: string;
    status: "active" | "completed";
    date: string;
    duration: string;
    score?: number;
    onStart?: () => void;
    onViewFeedback?: () => void;
}

export function InterviewCard({
    position,
    status,
    date,
    duration,
    score,
    onStart,
    onViewFeedback,
}: InterviewCardProps) {
    const getScoreColor = (score: number) => {
        if (score >= 70) return "text-green-500";
        if (score >= 50) return "text-orange-500";
        return "text-red-500";
    };

    const getScoreBg = (score: number) => {
        if (score >= 70) return "bg-green-500/10";
        if (score >= 50) return "bg-orange-500/10";
        return "bg-red-500/10";
    };

    return (
        <Card className="group hover:shadow-lg transition-all duration-300 hover:border-primary/30">
            <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                        <h3 className="font-semibold text-foreground line-clamp-1">{position}</h3>
                        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {date}
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {duration}
                            </span>
                        </div>
                    </div>
                    <Badge
                        variant={status === "active" ? "default" : "secondary"}
                        className={
                            status === "active"
                                ? "bg-purple-500/10 text-purple-600 border-purple-500/20"
                                : "bg-green-500/10 text-green-600 border-green-500/20"
                        }
                    >
                        {status === "active" ? "Active" : "Completed"}
                    </Badge>
                </div>

                {status === "completed" && score !== undefined && (
                    <div className={`rounded-lg p-3 mb-4 ${getScoreBg(score)}`}>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-muted-foreground">Score</span>
                            <span className={`text-2xl font-bold ${getScoreColor(score)}`}>
                                {score}%
                            </span>
                        </div>
                    </div>
                )}

                <div className="flex gap-2">
                    {status === "active" ? (
                        <Button onClick={onStart} className="w-full gap-2">
                            <Play className="h-4 w-4" />
                            Start Interview
                        </Button>
                    ) : (
                        <Button variant="outline" onClick={onViewFeedback} className="w-full gap-2">
                            <Eye className="h-4 w-4" />
                            View Feedback
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
