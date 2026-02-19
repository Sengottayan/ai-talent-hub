import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, MapPin, DollarSign, Clock, Zap, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function CandidateJobs() {
    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">AI Job Matcher</h1>
                <p className="text-muted-foreground">Premium job recommendations based on your unique AI profile and skill set.</p>
            </div>

            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-10" placeholder="Search jobs, companies, or keywords..." />
                </div>
                <Button variant="outline"><Filter className="mr-2 h-4 w-4" /> Filters</Button>
            </div>

            <div className="grid gap-6">
                {[
                    { title: "AI Research Scientist", company: "DeepTech AI", location: "San Francisco, CA / Remote", salary: "$160k - $220k", match: "99%", tags: ["PyTorch", "NLP", "LLMs"] },
                    { title: "Senior Frontend Engineer", company: "WebScale Corp", location: "New York, NY / Hybrid", salary: "$140k - $190k", match: "95%", tags: ["React", "TypeScript", "Next.js"] },
                    { title: "Machine Learning Ops", company: "CloudNative", location: "Austin, TX / Remote", salary: "$150k - $200k", match: "92%", tags: ["Docker", "Kubernetes", "Python"] }
                ].map((job, i) => (
                    <Card key={i} className="hover:shadow-lg transition-all cursor-pointer group">
                        <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="flex items-start gap-4">
                                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
                                        {job.company[0]}
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-xl font-bold group-hover:text-primary transition-colors">{job.title}</h3>
                                        <p className="text-sm font-medium text-muted-foreground">{job.company}</p>
                                        <div className="flex flex-wrap gap-4 mt-2">
                                            <span className="flex items-center text-xs text-muted-foreground"><MapPin className="mr-1 h-3 w-3" /> {job.location}</span>
                                            <span className="flex items-center text-xs text-muted-foreground"><DollarSign className="mr-1 h-3 w-3" /> {job.salary}</span>
                                            <span className="flex items-center text-xs text-muted-foreground"><Clock className="mr-1 h-3 w-3" /> Posted 2d ago</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-3">
                                    <div className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-bold">
                                        <Zap className="h-3 w-3 fill-current" />
                                        {job.match} AI Match
                                    </div>
                                    <Button className="w-full md:w-auto px-8">Quick Apply</Button>
                                </div>
                            </div>
                            <div className="mt-6 flex gap-2">
                                {job.tags.map(tag => (
                                    <span key={tag} className="px-3 py-1 rounded-md bg-muted text-muted-foreground text-xs font-medium">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
