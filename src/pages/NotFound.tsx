import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileQuestion, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground animate-fade-in">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="rounded-full bg-primary/10 p-6">
          <FileQuestion className="h-16 w-16 text-primary animate-pulse" />
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
            404 - Page Not Found
          </h1>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            Oops! The page you are looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="flex gap-4">
          <Button
            asChild
            size="lg"
            className="gap-2 shadow-lg shadow-primary/20"
          >
            <Link to="/">
              <Home className="h-4 w-4" />
              Return Home
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/login">Go to Login</Link>
          </Button>
        </div>
      </div>

      <div className="absolute bottom-8 text-sm text-muted-foreground opacity-50">
        HireAI Platform System
      </div>
    </div>
  );
}
