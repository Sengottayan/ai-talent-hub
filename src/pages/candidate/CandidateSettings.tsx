import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Lock, User, Eye, EyeOff, FileText, Upload, Loader2, CheckCircle2 } from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

const API_URL = 'http://localhost:5000/api';

export default function CandidateSettings() {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const { toast } = useToast();
    const [passwords, setPasswords] = useState({ new: "" });
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploadingResume, setIsUploadingResume] = useState(false);
    const [notifications, setNotifications] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpdatePassword = async () => {
        if (!passwords.new) {
            toast({
                title: "Error",
                description: "Please enter a new password.",
                variant: "destructive"
            });
            return;
        }

        setIsLoading(true);
        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
            const { data } = await axios.post(`${API_URL}/auth/reset-password`, {
                email: userInfo.email,
                password: passwords.new
            });

            if (data.success) {
                toast({
                    title: "Success",
                    description: "Password updated successfully via profile email.",
                });
                setPasswords({ new: "" });
            }
        } catch (error: any) {
            toast({
                title: "Update Failed",
                description: error.response?.data?.message || "Could not update password.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;

        const file = e.target.files[0];
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowedTypes.includes(file.type)) {
            toast({ title: "Invalid file type", description: "Please upload a PDF or DOCX file.", variant: "destructive" });
            return;
        }

        setIsUploadingResume(true);
        const formData = new FormData();
        formData.append('resume', file);

        try {
            const config = { headers: { Authorization: `Bearer ${userInfo?.token}` } };
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
            const { data } = await axios.post(`${API_URL}/resume/optimize`, formData, config);

            if (data.success) {
                toast({
                    title: "Resume Synced",
                    description: "Your resume profile data has been successfully analyzed and updated.",
                });
            }
        } catch (error: any) {
            toast({
                title: "Upload Failed",
                description: "Failed to upload and analyze your resume.",
                variant: "destructive"
            });
        } finally {
            setIsUploadingResume(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
                <p className="text-muted-foreground">Manage your profile and preferences.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5 text-primary" />
                            Personal Information
                        </CardTitle>
                        <CardDescription>Update your basic profile details.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Full Name</Label>
                            <Input id="name" defaultValue={userInfo.name} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input id="email" defaultValue={userInfo.email} disabled />
                        </div>
                        <Button className="w-full">Save Changes</Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Bell className="h-5 w-5 text-primary" />
                            Notifications
                        </CardTitle>
                        <CardDescription>Configure how you receive updates.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-2 rounded-lg border bg-muted/20">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-semibold">Email Alerts</Label>
                                <p className="text-xs text-muted-foreground">Receive job match notifications via email.</p>
                            </div>
                            <Switch
                                checked={notifications}
                                onCheckedChange={(val) => {
                                    setNotifications(val);
                                    toast({ title: "Preferences updated", description: `Email alerts ${val ? 'enabled' : 'disabled'}` });
                                }}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-primary" />
                            Resume Profile
                        </CardTitle>
                        <CardDescription>Upload your latest resume to update your profile data.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg bg-muted/10 transition-colors">
                            <input
                                type="file"
                                accept=".pdf,.docx"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleResumeUpload}
                            />
                            {isUploadingResume ? (
                                <div className="text-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                                    <p className="text-sm font-medium">Analyzing resume...</p>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                    <p className="text-sm font-medium mb-4">Select a PDF or DOCX file to sync latest skills</p>
                                    <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                                        Choose File
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="h-5 w-5 text-primary" />
                            Security
                        </CardTitle>
                        <CardDescription>Manage your password and authentication.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="new-pass">New Password</Label>
                            <div className="relative">
                                <Input
                                    id="new-pass"
                                    type={showPassword ? "text" : "password"}
                                    value={passwords.new}
                                    placeholder="Enter new password"
                                    onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={handleUpdatePassword}
                            disabled={isLoading}
                        >
                            {isLoading ? "Updating..." : "Update Password"}
                        </Button>
                    </CardContent>
                </Card>

                <Card className="border-destructive/20 bg-destructive/5">
                    <CardHeader>
                        <CardTitle className="text-destructive">Danger Zone</CardTitle>
                        <CardDescription>Once you delete your account, there is no going back.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="destructive" className="w-full">Delete Account</Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
