import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Lock, User, Eye, EyeOff, Save, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function HRSettings() {
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const { toast } = useToast();

    // ── Controlled state for Personal Information ────────────────────────────
    const [name, setName] = useState<string>(userInfo.name || "");
    const [company, setCompany] = useState<string>(userInfo.company || "");
    const [isSaving, setIsSaving] = useState(false);

    // ── Password ─────────────────────────────────────────────────────────────
    const [newPassword, setNewPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isUpdatingPass, setIsUpdatingPass] = useState(false);

    // ── Notifications ────────────────────────────────────────────────────────
    const [notifications, setNotifications] = useState({ email: true, reminders: true });

    // ── Save Personal Information ────────────────────────────────────────────
    const handleSaveProfile = async () => {
        if (!name.trim()) {
            toast({ title: "Validation Error", description: "Full name cannot be empty.", variant: "destructive" });
            return;
        }

        setIsSaving(true);
        try {
            const { data } = await axios.put(
                `${API_URL}/auth/update-profile`,
                { name: name.trim(), company: company.trim() },
                { headers: { Authorization: `Bearer ${userInfo.token}` } }
            );

            // Update localStorage so the new name is reflected everywhere
            const updated = { ...userInfo, name: name.trim(), company: company.trim() };
            localStorage.setItem('userInfo', JSON.stringify(updated));

            toast({ title: "✅ Profile Updated", description: "Your personal information has been saved." });
        } catch (error: any) {
            // Graceful fallback: if the endpoint doesn't exist yet, save to localStorage only
            const status = error?.response?.status;
            if (status === 404 || status === 405) {
                const updated = { ...userInfo, name: name.trim(), company: company.trim() };
                localStorage.setItem('userInfo', JSON.stringify(updated));
                toast({ title: "✅ Profile Saved Locally", description: "Changes saved. (Server profile endpoint not configured.)" });
            } else {
                toast({
                    title: "Save Failed",
                    description: error.response?.data?.message || "Could not save profile.",
                    variant: "destructive",
                });
            }
        } finally {
            setIsSaving(false);
        }
    };

    // ── Update Password ──────────────────────────────────────────────────────
    const handleUpdatePassword = async () => {
        if (!newPassword.trim()) {
            toast({ title: "Error", description: "Please enter a new password.", variant: "destructive" });
            return;
        }
        if (newPassword.length < 6) {
            toast({ title: "Error", description: "Password must be at least 6 characters.", variant: "destructive" });
            return;
        }

        setIsUpdatingPass(true);
        try {
            await axios.post(`${API_URL}/auth/reset-password`, {
                email: userInfo.email,
                password: newPassword,
            });
            toast({ title: "✅ Password Updated", description: "Your password has been changed successfully." });
            setNewPassword("");
        } catch (error: any) {
            toast({
                title: "Update Failed",
                description: error.response?.data?.message || "Could not update password.",
                variant: "destructive",
            });
        } finally {
            setIsUpdatingPass(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Account Settings</h1>
                <p className="text-muted-foreground">Manage your recruiter profile and preferences.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* ── Personal Information ───────────────────────────────── */}
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
                            <Label htmlFor="settings-name">Full Name</Label>
                            <Input
                                id="settings-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your full name"
                                autoComplete="off"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="settings-email">Email Address</Label>
                            <Input
                                id="settings-email"
                                value={userInfo.email || ""}
                                disabled
                                className="cursor-not-allowed opacity-60"
                                autoComplete="off"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="settings-company">Company</Label>
                            <Input
                                id="settings-company"
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
                                placeholder="Your company name"
                                autoComplete="organization"
                            />
                        </div>
                        <Button
                            className="w-full gap-2"
                            onClick={handleSaveProfile}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                            ) : (
                                <><Save className="h-4 w-4" /> Save Changes</>
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* ── Notifications ──────────────────────────────────────── */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Bell className="h-5 w-5 text-primary" />
                            Notifications
                        </CardTitle>
                        <CardDescription>Configure how you receive updates.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-semibold">Email Alerts</Label>
                                <p className="text-xs text-muted-foreground">Receive application updates via email.</p>
                            </div>
                            <Switch
                                checked={notifications.email}
                                onCheckedChange={(val) => {
                                    setNotifications({ ...notifications, email: val });
                                    toast({ title: "Preferences updated", description: `Email alerts ${val ? 'enabled' : 'disabled'}` });
                                }}
                            />
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-semibold">Interview Reminders</Label>
                                <p className="text-xs text-muted-foreground">Get notified before scheduled interviews.</p>
                            </div>
                            <Switch
                                checked={notifications.reminders}
                                onCheckedChange={(val) => {
                                    setNotifications({ ...notifications, reminders: val });
                                    toast({ title: "Preferences updated", description: `Interview reminders ${val ? 'enabled' : 'disabled'}` });
                                }}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* ── Security ───────────────────────────────────────────── */}
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
                            <Label htmlFor="settings-new-pass">New Password</Label>
                            <div className="relative">
                                <Input
                                    id="settings-new-pass"
                                    type={showPassword ? "text" : "password"}
                                    value={newPassword}
                                    placeholder="Enter new password (min 6 chars)"
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="pr-10"
                                    autoComplete="new-password"   // prevents browser autofill here
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
                            className="w-full gap-2"
                            onClick={handleUpdatePassword}
                            disabled={isUpdatingPass}
                        >
                            {isUpdatingPass ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Updating...</>
                            ) : (
                                "Update Password"
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* ── Danger Zone ────────────────────────────────────────── */}
                <Card className="border-destructive/20 bg-destructive/5">
                    <CardHeader>
                        <CardTitle className="text-destructive">Danger Zone</CardTitle>
                        <CardDescription>Delete your account and all associated data.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="destructive" className="w-full">Delete Account</Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
