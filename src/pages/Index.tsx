import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot, ArrowRight, CheckCircle, Users, Brain, Calendar, Shield, Zap, FileText, Video, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const features = [
    {
        icon: Brain,
        title: "AI-Powered Screening",
        description: "Automatically evaluate resumes and match candidates to job requirements with intelligent scoring.",
    },
    {
        icon: Video,
        title: "Smart Interviews",
        description: "Conduct AI-driven interviews that assess technical skills and communication abilities.",
    },
    {
        icon: Calendar,
        title: "Automated Scheduling",
        description: "Let our system handle interview scheduling and rescheduling requests seamlessly.",
    },
    {
        icon: FileText,
        title: "Detailed Analytics",
        description: "Get comprehensive reports and insights on candidate performance and hiring metrics.",
    },
];

const rules = [
    "Upload resumes in PDF or DOC format for accurate parsing",
    "Candidates receive automated interview invitations via email",
    "AI evaluates responses based on role-specific criteria",
    "Real-time monitoring ensures interview integrity",
    "Detailed feedback is generated for every candidate",
    "All data is encrypted and securely stored",
];

const stats = [
    { value: "85%", label: "Time Saved" },
    { value: "3x", label: "Faster Hiring" },
    { value: "95%", label: "Accuracy Rate" },
    { value: "500+", label: "Companies Trust Us" },
];

export default function Home() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const NavLinks = ({ className = "", onClick = () => { } }) => (
        <nav className={className}>
            <a href="#features" onClick={onClick} className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
                Features
            </a>
            <a href="#how-it-works" onClick={onClick} className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
                How It Works
            </a>
            <a href="#rules" onClick={onClick} className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
                Guidelines
            </a>
        </nav>
    );

    return (
        <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
            {/* SEO Meta Tags (Simplified as this is a React component) */}
            <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
                    <Link to="/" className="flex items-center gap-3 transition-transform hover:scale-105">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20">
                            <Bot className="h-6 w-6 text-primary-foreground" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-foreground">HireAI</h1>
                            <p className="hidden text-[10px] text-muted-foreground sm:block">AI-Powered Hiring</p>
                        </div>
                    </Link>

                    <NavLinks className="hidden items-center gap-8 md:flex" />

                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="hidden sm:flex items-center gap-2">
                            <Button variant="ghost" asChild className="text-muted-foreground hover:text-primary hover:bg-primary/10 px-3">
                                <Link to="/login">Sign In</Link>
                            </Button>
                            <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20">
                                <Link to="/signup">
                                    Get Started
                                </Link>
                            </Button>
                        </div>

                        {/* Mobile Menu */}
                        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className="md:hidden">
                                    <Menu className="h-6 w-6" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-[300px] flex flex-col p-6">
                                <Link to="/" className="flex items-center gap-3 mb-8" onClick={() => setIsMenuOpen(false)}>
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                                        <Bot className="h-6 w-6 text-primary-foreground" />
                                    </div>
                                    <span className="text-xl font-bold">HireAI</span>
                                </Link>
                                <NavLinks className="flex flex-col gap-6 mb-8" onClick={() => setIsMenuOpen(false)} />
                                <div className="mt-auto space-y-4">
                                    <Button variant="outline" asChild className="w-full" onClick={() => setIsMenuOpen(false)}>
                                        <Link to="/login">Sign In</Link>
                                    </Button>
                                    <Button asChild className="w-full" onClick={() => setIsMenuOpen(false)}>
                                        <Link to="/signup">Get Started</Link>
                                    </Button>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative overflow-hidden pt-32 pb-16 md:pt-48 md:pb-32">
                <div className="absolute inset-x-0 top-0 -z-10 h-[500px] bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.15),transparent_70%)]" />
                <div className="container mx-auto px-4 md:px-8">
                    <div className="mx-auto max-w-4xl text-center animate-fade-in">
                        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary border border-primary/20">
                            <Zap className="h-4 w-4 fill-primary" />
                            <span className="hidden sm:inline">The Future of </span> Recruitment Platform
                        </div>
                        <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl leading-[1.2] pb-2">
                            Hire Smarter with{" "}
                            <span className="inline-block bg-gradient-to-r from-primary via-blue-500 to-indigo-600 bg-clip-text text-transparent italic px-2 py-1 bg-decoration-clone tracking-normal overflow-visible">
                                AI Precision
                            </span>
                        </h1>
                        <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl leading-relaxed">
                            Stop wasting hours on manual screening. Our AI agents evaluate resumes and conduct interviews to find your star talent instantly.
                        </p>
                        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                            <Button size="lg" asChild className="w-full sm:w-auto px-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/25 h-14 text-base font-bold transition-all hover:scale-105 active:scale-95">
                                <Link to="/signup">
                                    Start Hiring Free
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Link>
                            </Button>
                            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto px-8 border-border text-foreground hover:bg-muted h-14 text-base font-semibold">
                                <Link to="/candidate/dashboard">
                                    <Users className="mr-2 h-5 w-5" />
                                    Candidate Portal
                                </Link>
                            </Button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="mx-auto mt-20 grid max-w-5xl grid-cols-2 gap-4 sm:gap-8 md:grid-cols-4 px-4 sm:px-0">
                        {stats.map((stat, index) => (
                            <div
                                key={stat.label}
                                className="group relative rounded-2xl border border-border bg-card/50 p-6 text-center animate-fade-in hover:border-primary/50 transition-colors"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <p className="text-3xl font-black text-primary md:text-4xl lg:text-5xl group-hover:scale-110 transition-transform">{stat.value}</p>
                                <p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="bg-card/50 py-24 border-y border-border">
                <div className="container mx-auto px-4 md:px-8">
                    <div className="mb-16 text-center space-y-4">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                            Intelligence in Every Step
                        </h2>
                        <p className="mx-auto max-w-2xl text-muted-foreground text-lg">
                            We've automated the tedious parts of recruitment so you can focus on making final hiring decisions.
                        </p>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {features.map((feature, index) => (
                            <Card
                                key={feature.title}
                                className="group border-border bg-card transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-2 animate-fade-in rounded-2xl overflow-hidden"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <CardContent className="p-8">
                                    <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground group-hover:rotate-6 shadow-sm">
                                        <feature.icon className="h-7 w-7" />
                                    </div>
                                    <h3 className="mb-3 text-xl font-bold text-foreground">{feature.title}</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed italic">{feature.description}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section id="how-it-works" className="py-24 bg-muted/20 relative">
                <div className="container mx-auto px-4 md:px-8">
                    <div className="mb-16 text-center space-y-4">
                        <h2 className="text-3xl font-bold text-foreground sm:text-4xl md:text-5xl">
                            How It Works
                        </h2>
                        <p className="mx-auto max-w-2xl text-muted-foreground text-lg">
                            Get up and running with HireAI in minutes.
                        </p>
                    </div>

                    <div className="mx-auto max-w-5xl">
                        <div className="grid gap-12 md:grid-cols-3">
                            {[
                                { step: "01", title: "Upload Resumes", description: "Simply upload your candidate resumes and the system parses them instantly." },
                                { step: "02", title: "AI Selection", description: "AI evaluates skills and experience to find the top 5% of your pipeline." },
                                { step: "03", title: "Automated Interviews", description: "Interviews are scheduled and conducted by our AI agents automatically." },
                            ].map((item, index) => (
                                <div
                                    key={item.step}
                                    className="relative flex flex-col items-center text-center animate-fade-in group"
                                    style={{ animationDelay: `${index * 150}ms` }}
                                >
                                    <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-[2rem] bg-primary text-3xl font-black text-primary-foreground shadow-2xl shadow-primary/30 group-hover:scale-110 transition-transform">
                                        {item.step}
                                    </div>
                                    <h3 className="mb-3 text-2xl font-bold text-foreground">{item.title}</h3>
                                    <p className="text-muted-foreground leading-relaxed">{item.description}</p>
                                    {index < 2 && (
                                        <div className="absolute right-0 top-10 hidden h-0.5 w-1/2 translate-x-1/2 bg-gradient-to-r from-primary/30 to-transparent md:block lg:w-3/4" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Rules Section */}
            <section id="rules" className="bg-sidebar py-24 text-sidebar-foreground">
                <div className="container mx-auto px-4 md:px-8 flex flex-col items-center">
                    <div className="mb-16 text-center space-y-4">
                        <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl text-sidebar-foreground tracking-tight">
                            Platform Guidelines
                        </h2>
                        <p className="mx-auto max-w-2xl text-sidebar-muted text-lg">
                            Designed for high-integrity, efficient recruitment.
                        </p>
                    </div>

                    <div className="w-full max-w-4xl grid sm:grid-cols-2 gap-4">
                        {rules.map((rule, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-4 rounded-2xl bg-sidebar-accent/50 p-6 transition-all duration-300 hover:bg-sidebar-accent animate-slide-in border border-sidebar-border/50 group"
                                style={{ animationDelay: `${index * 100}ms` }}
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary group-hover:scale-110 transition-transform">
                                    <CheckCircle className="h-5 w-5" />
                                </div>
                                <p className="text-sidebar-foreground font-medium text-sm leading-snug">{rule}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 bg-background px-4">
                <div className="container mx-auto">
                    <div className="mx-auto max-w-5xl rounded-[3rem] bg-gradient-to-br from-primary via-blue-600 to-indigo-700 p-8 md:p-16 text-center text-primary-foreground shadow-[0_20px_50px_rgba(37,99,235,0.3)] relative overflow-hidden group">
                        {/* Decorative glow */}
                        <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl" />

                        <div className="relative z-10">
                            <Shield className="mx-auto mb-6 h-16 w-16 opacity-90 animate-bounce" />
                            <h2 className="mb-6 text-4xl font-black md:text-5xl tracking-tight">
                                Ready to find your next star?
                            </h2>
                            <p className="mb-10 text-lg opacity-90 text-primary-foreground/90 max-w-2xl mx-auto leading-relaxed">
                                Join forward-thinking companies who have already cut their time-to-hire by 70%.
                            </p>
                            <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
                                <Button size="lg" variant="secondary" asChild className="w-full sm:w-auto px-10 h-14 bg-white text-primary hover:bg-white/90 text-lg font-bold rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95">
                                    <Link to="/signup">
                                        Get Started Free
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Link>
                                </Button>
                                <Button size="lg" variant="outline" className="w-full sm:w-auto px-10 h-14 bg-transparent border-white/30 text-white hover:bg-white/10 text-lg font-bold rounded-2xl" asChild>
                                    <Link to="/login">Sign In</Link>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-border bg-card/30 py-12">
                <div className="container mx-auto px-4 md:px-8">
                    <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
                        <Link to="/" className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                                <Bot className="h-6 w-6 text-primary-foreground" />
                            </div>
                            <span className="text-xl font-bold text-foreground">HireAI</span>
                        </Link>

                        <div className="flex gap-8">
                            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Privacy Policy</a>
                            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Terms of Service</a>
                            <a href="#" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Contact</a>
                        </div>

                        <p className="text-sm font-medium text-muted-foreground">
                            © 2024 HireAI. Built with precision for the future of work.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
