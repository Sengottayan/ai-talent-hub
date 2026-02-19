import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Bot, Mail, Lock, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

            const { data } = await axios.post(`${API_URL}/auth/login`, {
                email: email.toLowerCase().trim(),
                password,
            });

            localStorage.setItem("userInfo", JSON.stringify(data));

            toast({
                title: "Welcome back!",
                description: "Successfully logged in.",
            });

            if (data.role === "candidate") {
                navigate("/candidate/dashboard");
            } else {
                navigate("/hr/dashboard");
            }
        } catch (error: any) {
            toast({
                title: "Login Failed",
                description: error.response?.data?.message || "Invalid credentials",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen">
            {/* Left Panel - Branding */}
            <div className="hidden w-1/2 flex-col justify-between bg-sidebar p-12 lg:flex">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                        <Bot className="h-7 w-7 text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-sidebar-foreground">HireAI</h1>
                        <p className="text-sm text-sidebar-muted">AI-Powered Hiring</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <h2 className="text-4xl font-bold leading-tight text-sidebar-foreground">
                        Streamline your hiring process with AI
                    </h2>
                    <p className="text-lg text-sidebar-muted">
                        Automatically screen resumes, schedule interviews, and find the best candidates faster than ever.
                    </p>
                    <div className="grid grid-cols-2 gap-4 pt-4">
                        <div className="rounded-lg bg-sidebar-accent p-4">
                            <p className="text-2xl font-bold text-sidebar-foreground">85%</p>
                            <p className="text-sm text-sidebar-muted">Time Saved</p>
                        </div>
                        <div className="rounded-lg bg-sidebar-accent p-4">
                            <p className="text-2xl font-bold text-sidebar-foreground">3x</p>
                            <p className="text-sm text-sidebar-muted">Faster Hiring</p>
                        </div>
                    </div>
                </div>

                <p className="text-sm text-sidebar-muted">
                    © 2024 HireAI. All rights reserved.
                </p>
            </div>

            {/* Right Panel - Login Form */}
            <div className="flex w-full flex-col items-center justify-center px-8 lg:w-1/2">
                <div className="w-full max-w-md space-y-8 animate-fade-in">
                    <div className="text-center lg:text-left">
                        <div className="mb-6 flex items-center justify-center gap-3 lg:hidden">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                                <Bot className="h-7 w-7 text-primary-foreground" />
                            </div>
                            <h1 className="text-2xl font-bold text-foreground">HireAI</h1>
                        </div>
                        <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
                        <p className="mt-2 text-muted-foreground">
                            Sign in to your account
                        </p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="name@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10"
                                    required
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Password</Label>
                                <Link to="/forgot-password" title="Forgot password?" className="text-sm text-primary hover:underline">
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 pr-10"
                                    required
                                    autoComplete="off"
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

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                <>
                                    Sign in
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </form>

                    <p className="text-center text-sm text-muted-foreground">
                        Don't have an account?{" "}
                        <a href="/signup" className="text-primary hover:underline">
                            Create Account
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
