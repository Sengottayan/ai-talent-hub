import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FileText, Video, Briefcase, Award, Settings, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const sidebarItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/candidate/dashboard" },
    { icon: FileText, label: "Resume", href: "/candidate/resume" },
    { icon: Video, label: "Mock Interviews", href: "/candidate/mock" },
    { icon: Award, label: "Skills", href: "/candidate/skills" },
];

export function CandidateLayout() {
    const location = useLocation();
    const [open, setOpen] = useState(false);

    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
            <div className="p-6">
                <Link to="/" className="text-xl font-bold flex items-center gap-2 text-sidebar-foreground hover:scale-105 transition-transform">
                    <span className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">C</span>
                    Candidate
                </Link>
            </div>

            <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
                {sidebarItems.map((item) => {
                    const isActive = location.pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            to={item.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                            )}
                        >
                            <item.icon className={cn("w-5 h-5", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/70")} />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-sidebar-border space-y-2">
                <Link
                    to="/candidate/settings"
                    onClick={() => setOpen(false)}
                    className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                        location.pathname.startsWith("/candidate/settings")
                            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                >
                    <Settings className={cn("w-5 h-5", location.pathname.startsWith("/candidate/settings") ? "text-sidebar-primary" : "text-sidebar-foreground/70")} />
                    Settings
                </Link>

                <button
                    onClick={() => {
                        localStorage.removeItem("userInfo");
                        window.location.href = "/";
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    Log Out
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-64 border-r border-sidebar-border bg-sidebar flex-col shrink-0 transition-all duration-300">
                <SidebarContent />
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 shrink-0">
                    <div className="flex items-center gap-4">
                        <Sheet open={open} onOpenChange={setOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className="md:hidden">
                                    <Menu className="h-5 w-5" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="p-0 w-64">
                                <SidebarContent />
                            </SheetContent>
                        </Sheet>
                        <h2 className="text-lg font-semibold text-foreground truncate">
                            {sidebarItems.find(i => location.pathname.startsWith(i.href))?.label || (location.pathname.includes('settings') ? "Settings" : "Candidate Portal")}
                        </h2>
                    </div>
                </header>
                <div className="flex-1 overflow-y-auto p-4 md:p-8 animate-fade-in">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
