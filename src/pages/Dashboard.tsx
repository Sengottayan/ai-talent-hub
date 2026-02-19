import { useEffect, useState } from "react";
import { FileText, Users, Calendar, CheckCircle, UserCheck } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import api from "@/lib/api";

const iconMap: { [key: string]: any } = {
    FileText,
    Users,
    Calendar,
    CheckCircle,
    UserCheck
};

interface Stat {
    title: string;
    value: number;
    icon: string;
    trend: { value: number; isPositive: boolean; };
}

interface Candidate {
    name: string;
    role: string;
    status: string;
    score: number;
}

interface Interview {
    candidate: string;
    role: string;
    time: string;
    type: string;
}

export default function Dashboard() {
    const [stats, setStats] = useState<Stat[]>([]);
    const [recentCandidates, setRecentCandidates] = useState<Candidate[]>([]);
    const [upcomingInterviews, setUpcomingInterviews] = useState<Interview[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const { data } = await api.get('/stats/dashboard');
                setStats(data.stats);
                setRecentCandidates(data.recentCandidates);
                setUpcomingInterviews(data.upcomingInterviews);
            } catch (error) {
                console.error("Failed to fetch dashboard stats:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (isLoading) {
        return <div className="text-center p-8">Loading dashboard...</div>;
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
                <p className="mt-1 text-muted-foreground">
                    Welcome back! Here's an overview of your hiring pipeline.
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {stats.map((stat, index) => {
                    const IconComponent = iconMap[stat.icon] || FileText;
                    return (
                        <StatCard
                            key={stat.title}
                            title={stat.title}
                            value={stat.value}
                            icon={IconComponent}
                            trend={stat.trend}
                            className={`animation-delay-${index * 100}`}
                        />
                    );
                })}
            </div>

            {/* Content Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Recent Candidates */}
                <Card className="animate-fade-in">
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold">Recent Candidates</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentCandidates.length === 0 ? (
                                <p className="text-muted-foreground text-sm">No recent candidates found.</p>
                            ) : (
                                recentCandidates.map((candidate, i) => (
                                    <div
                                        key={i} // Using index as fallback key since names might duplicate in dev
                                        className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50 gap-3"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                                {candidate.name.split(" ").map((n) => n[0]).join("")}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium text-foreground truncate">{candidate.name}</p>
                                                <p className="text-sm text-muted-foreground truncate">{candidate.role}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between sm:justify-end gap-3">
                                            <span className="text-sm font-medium text-foreground">{candidate.score}%</span>
                                            <StatusBadge variant={candidate.status as any}>
                                                {candidate.status.charAt(0).toUpperCase() + candidate.status.slice(1)}
                                            </StatusBadge>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Upcoming Interviews */}
                <Card className="animate-fade-in">
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold">Upcoming Interviews</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {upcomingInterviews.length === 0 ? (
                                <p className="text-muted-foreground text-sm">No upcoming interviews scheduled.</p>
                            ) : (
                                upcomingInterviews.map((interview, index) => (
                                    <div
                                        key={index}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50 gap-3"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                                                {interview.candidate.split(" ").map((n) => n[0]).join("")}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium text-foreground truncate">{interview.candidate}</p>
                                                <p className="text-sm text-muted-foreground truncate">{interview.role}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-row sm:flex-col justify-between sm:text-right gap-1 lowercase sm:normal-case">
                                            <p className="text-sm font-medium text-foreground">{interview.time}</p>
                                            <p className="text-sm text-muted-foreground">{interview.type}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
