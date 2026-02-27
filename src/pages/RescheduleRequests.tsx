import { useState, useEffect } from "react";
import { Clock, Calendar, Check, X, MessageSquare, Loader2, RefreshCw, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import axios from "axios";


const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface RescheduleRequest {
  _id: string;
  candidateId?: {
    name: string;
    email: string;
  };
  interviewId?: {
    _id: string;
    jobRole: string;
    interviewDate: string;
    scheduledDate?: string;
  };
  reason: string;
  requestedDate: string;
  status: "Pending" | "Processing" | "Approved" | "Rejected" | "Confirmed" | "Action Required";
  n8nStatus?: string;
  confirmedDate?: string;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  Pending: { label: "Pending HR Review", className: "bg-warning/10 text-warning border-warning/20" },
  Processing: { label: "Processing (n8n)", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  Approved: { label: "Approved", className: "bg-success/10 text-success border-success/20" },
  Confirmed: { label: "Confirmed", className: "bg-success/10 text-success border-success/20" },
  Rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive border-destructive/20" },
  "Action Required": { label: "Action Required", className: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
};

export default function RescheduleRequests() {
  const [requests, setRequests] = useState<RescheduleRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, "approve" | "reject" | null>>({});
  const { toast } = useToast();

  const fetchRequests = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/reschedule`);
      setRequests(data);
    } catch (error) {
      console.error("Error fetching reschedule requests:", error);
      toast({ title: "Error", description: "Failed to fetch reschedule requests.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApprove = async (id: string) => {
    setActionLoading((prev) => ({ ...prev, [id]: "approve" }));
    try {
      const { data } = await axios.post(`${API_URL}/reschedule/${id}/approve`);
      setRequests((prev) =>
        prev.map((r) => (r._id === id ? { ...r, status: "Processing" } : r))
      );
      toast({
        title: "✅ Request Approved",
        description: data.n8nError
          ? "Approved, but n8n automation failed. Check server logs."
          : "n8n has been triggered to reschedule the interview automatically.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.response?.data?.message || "Failed to approve the request.",
        variant: "destructive",
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: null }));
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading((prev) => ({ ...prev, [id]: "reject" }));
    try {
      const { data } = await axios.post(`${API_URL}/reschedule/${id}/reject`);
      setRequests((prev) =>
        prev.map((r) => (r._id === id ? { ...r, status: "Rejected" } : r))
      );
      toast({
        title: "❌ Request Rejected",
        description: data.emailSent
          ? "The candidate has been notified by email."
          : "Request rejected. Note: rejection email could not be sent.",
        variant: "destructive",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.response?.data?.message || "Failed to reject the request.",
        variant: "destructive",
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: null }));
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "Pending" && r.candidateId && r.interviewId);
  const processedRequests = requests.filter((r) => r.status !== "Pending");

  // Group processed requests by interview ID
  const groupedProcessed = processedRequests.reduce((acc, req) => {
    // Skip items that are broken/missing data
    if (!req.interviewId) return acc;

    const iid = req.interviewId?._id || "unknown";
    if (!acc[iid]) {
      acc[iid] = {
        details: req.interviewId,
        items: [],
      };
    }
    acc[iid].items.push(req);
    return acc;
  }, {} as Record<string, { details: any; items: RescheduleRequest[] }>);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reschedule Requests</h1>
          <p className="mt-1 text-muted-foreground">
            Review and approve or reject candidate reschedule requests. Approved requests automatically trigger the n8n calendar workflow.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-warning/10 p-3">
              <Clock className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{pendingRequests.length}</p>
              <p className="text-sm text-muted-foreground">Pending Review</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-blue-500/10 p-3">
              <RefreshCw className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {requests.filter((r) => r.status === "Processing").length}
              </p>
              <p className="text-sm text-muted-foreground">Processing</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-success/10 p-3">
              <Check className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {requests.filter((r) => ["Approved", "Confirmed"].includes(r.status)).length}
              </p>
              <p className="text-sm text-muted-foreground">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-destructive/10 p-3">
              <X className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {requests.filter((r) => r.status === "Rejected").length}
              </p>
              <p className="text-sm text-muted-foreground">Rejected</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            Pending <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center rounded-full text-[10px]">{pendingRequests.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="processed">Processed</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-warning" />
                Pending Requests ({pendingRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground/30" />
                  <p className="mt-4 text-muted-foreground text-sm">No pending reschedule requests</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingRequests.map((request) => (
                    <div
                      key={request._id}
                      className="rounded-xl border border-border bg-card p-6 transition-all hover:shadow-md"
                    >
                      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex-1 space-y-4">
                          {/* Candidate Info */}
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-sm font-bold text-warning">
                              {request.candidateId?.name?.substring(0, 2).toUpperCase() ?? "CN"}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">
                                {request.candidateId?.name ?? "Unknown Candidate"}
                              </p>
                              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                <Mail className="h-3 w-3" />
                                {request.candidateId?.email ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {request.interviewId?.jobRole ?? "No Role Specified"}
                              </p>
                            </div>
                          </div>

                          {/* Reason */}
                          <div className="rounded-xl border border-border bg-muted/30 p-4">
                            <div className="flex items-start gap-2">
                              <MessageSquare className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-foreground">Candidate's Reason</p>
                                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                                  {request.reason}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Dates */}
                          <div className="flex flex-wrap gap-6">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Current / Original Date
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                                <Calendar className="h-4 w-4 text-destructive" />
                                {request.interviewId?.scheduledDate || request.interviewId?.interviewDate
                                  ? new Date(
                                    request.interviewId.scheduledDate ?? request.interviewId.interviewDate!
                                  ).toLocaleDateString("en-IN", { dateStyle: "medium" })
                                  : "Not Set"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Candidate Requested
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                                <Calendar className="h-4 w-4 text-success" />
                                {new Date(request.requestedDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Submitted
                              </p>
                              <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                                {new Date(request.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-row lg:flex-col gap-2 self-start lg:self-center shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive text-destructive hover:bg-destructive hover:text-white flex-1 lg:flex-none lg:w-32"
                            disabled={!!actionLoading[request._id]}
                            onClick={() => handleReject(request._id)}
                          >
                            {actionLoading[request._id] === "reject" ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <X className="mr-1.5 h-4 w-4" />
                            )}
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            className="bg-success hover:bg-success/90 flex-1 lg:flex-none lg:w-32"
                            disabled={!!actionLoading[request._id]}
                            onClick={() => handleApprove(request._id)}
                          >
                            {actionLoading[request._id] === "approve" ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="mr-1.5 h-4 w-4" />
                            )}
                            Approve
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="processed" className="mt-6 space-y-4">
          {Object.keys(groupedProcessed).length > 0 ? (
            <Accordion type="multiple" className="space-y-4">
              {Object.entries(groupedProcessed).map(([iid, group]) => (
                <AccordionItem key={iid} value={iid} className="border rounded-xl bg-card overflow-hidden">
                  <AccordionTrigger className="hover:no-underline px-6 py-4 bg-muted/10">
                    <div className="flex flex-1 items-center justify-between text-left pr-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">Interview:</span>
                          <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            {iid.slice(-8).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {group.details?.jobRole || "Role Not Specified"}
                        </p>
                      </div>
                      <Badge variant="outline" className="bg-white ml-auto">
                        {group.items.length} Request{group.items.length > 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-0">
                    <div className="divide-y divide-border">
                      {group.items.map((request) => {
                        const sc = statusConfig[request.status] ?? { label: request.status, className: "bg-muted text-muted-foreground" };
                        return (
                          <div
                            key={request._id}
                            className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-muted/10"
                          >
                            <div className="flex items-center gap-4">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                                {request.candidateId?.name?.substring(0, 2).toUpperCase() ?? "CN"}
                              </div>
                              <div>
                                <p className="font-semibold text-foreground text-sm">
                                  {request.candidateId?.name ?? "Unknown"}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Requested: <span className="font-medium">{new Date(request.requestedDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
                                  </p>
                                  {request.confirmedDate && (
                                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                      <Check className="h-3 w-3 text-success" />
                                      Confirmed: <span className="font-medium text-success">{new Date(request.confirmedDate).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                            <Badge variant="outline" className={cn("text-[10px] py-0", sc.className)}>
                              {sc.label}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <RefreshCw className="h-12 w-12 text-muted-foreground/30" />
                <p className="mt-4 text-muted-foreground text-sm">No processed requests found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
