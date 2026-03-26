import { useEffect, useState } from "react";
import {
  FileText,
  Users,
  Calendar,
  CheckCircle,
  UserCheck,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import api from "@/lib/api";

const iconMap: { [key: string]: any } = {
  FileText,
  Users,
  Calendar,
  CheckCircle,
  UserCheck,
};

interface Stat {
  title: string;
  value: number;
  icon: string;
  trend: { value: number; isPositive: boolean };
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
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const COLORS = ["#0ea5e9", "#10b981", "#6366f1", "#f43f5e", "#f59e0b"];

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get("/stats/dashboard");
        setStats(data.stats || []);
        setRecentCandidates(data.recentCandidates || []);
        setUpcomingInterviews(data.upcomingInterviews || []);
        setAnalytics(data.analytics || null);
      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="space-y-2">
          <Skeleton className="h-10 w-48 bg-slate-200" />
          <Skeleton className="h-4 w-64 bg-slate-100" />
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i} className="border-none shadow-sm overflow-hidden">
               <CardContent className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-3 flex-1">
                      <Skeleton className="h-4 w-24 bg-slate-100" />
                      <Skeleton className="h-10 w-16 bg-slate-200" />
                      <Skeleton className="h-3 w-32 bg-slate-100" />
                    </div>
                    <Skeleton className="h-12 w-12 rounded-xl bg-primary/5" />
                  </div>
               </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-none shadow-sm">
            <CardHeader><Skeleton className="h-6 w-40 bg-slate-200" /></CardHeader>
            <CardContent><Skeleton className="h-[250px] w-full bg-slate-50 rounded-xl" /></CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardHeader><Skeleton className="h-6 w-40 bg-slate-200" /></CardHeader>
            <CardContent><Skeleton className="h-[250px] w-full bg-slate-50 rounded-xl" /></CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-none shadow-sm">
            <CardHeader><Skeleton className="h-6 w-40 bg-slate-200" /></CardHeader>
            <CardContent className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full bg-slate-50 rounded-lg" />
              ))}
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardHeader><Skeleton className="h-6 w-40 bg-slate-200" /></CardHeader>
            <CardContent className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full bg-slate-50 rounded-lg" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
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

      {/* Analytics Grid */}
      {analytics && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="animate-fade-in shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                Candidate Pipeline Status
              </CardTitle>
              <CardDescription>
                Live breakdown of all candidate progression stages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full flex items-center justify-center">
                {analytics.statusDistribution?.some((d: any) => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.statusDistribution || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}
                      >
                        {(analytics.statusDistribution || []).map(
                          (entry: any, index: number) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ),
                        )}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">No interview data yet</p>
                    <p className="text-xs text-muted-foreground/60">Complete your first interview to see stats</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="animate-fade-in shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                AI Assessment Scores
              </CardTitle>
              <CardDescription>
                Overall performance distribution across technical rounds
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full flex items-center justify-center">
                {analytics.scoreDistribution?.some((d: any) => d.candidates > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={analytics.scoreDistribution || []}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "transparent" }}
                        contentStyle={{ borderRadius: "8px" }}
                      />
                      <Bar
                        dataKey="candidates"
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">No scores yet</p>
                    <p className="text-xs text-muted-foreground/60">Finalize some interview results to see distributions</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Candidates */}
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Recent Candidates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentCandidates.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No recent candidates found.
                </p>
              ) : (
                recentCandidates.map((candidate, i) => (
                  <div
                    key={i} // Using index as fallback key since names might duplicate in dev
                    className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50 gap-3"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {candidate.name
                          ?.split(" ")
                          .map((n) => n[0])
                          .join("") || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {candidate.name || "Unknown"}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {candidate.role || "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3">
                      <span className="text-sm font-medium text-foreground">
                        {candidate.score || 0}%
                      </span>
                      <StatusBadge variant={(candidate.status || "pending") as any}>
                        {(candidate.status || "pending").charAt(0).toUpperCase() +
                          (candidate.status || "pending").slice(1)}
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
            <CardTitle className="text-lg font-semibold">
              Upcoming Interviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingInterviews.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No upcoming interviews scheduled.
                </p>
              ) : (
                upcomingInterviews.map((interview, index) => (
                  <div
                    key={index}
                    className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted/50 gap-3"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                        {interview.candidate
                          ?.split(" ")
                          .map((n) => n[0])
                          .join("") || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {interview.candidate || "Unknown"}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {interview.role || "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-row sm:flex-col justify-between sm:text-right gap-1 lowercase sm:normal-case">
                      <p className="text-sm font-medium text-foreground">
                        {interview.time || "N/A"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {interview.type || "N/A"}
                      </p>
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
