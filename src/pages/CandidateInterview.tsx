import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import axios from "axios";
import { Loader2, Mic, Send, CheckCircle2 } from "lucide-react";

interface Question {
  question: string;
  type: string;
}

interface InterviewData {
  jobRole: string;
  description: string;
  questions: Question[];
  duration: number;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export default function CandidateInterview() {
  const { id } = useParams<{ id: string }>();
  const [interview, setInterview] = useState<InterviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [conversation, setConversation] = useState<Message[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const fetchInterview = async () => {
      try {
        // In a real app, use environment variable for API URL
        const res = await axios.get(
          `http://localhost:5000/api/interviews/${id}`,
        );
        setInterview(res.data.data);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load interview. Please check the link.");
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchInterview();
  }, [id]);

  const handleNext = async () => {
    if (!answer.trim()) {
      toast.error("Please provide an answer.");
      return;
    }

    const currentQ = interview?.questions[currentQuestionIndex];
    if (!currentQ) return;

    // Record the interaction
    const newHistory: Message[] = [
      ...conversation,
      { role: "assistant", content: currentQ.question },
      { role: "user", content: answer },
    ];

    setConversation(newHistory);
    setAnswer("");

    if (currentQuestionIndex < (interview?.questions.length || 0) - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      // Finished
      await submitInterview(newHistory);
    }
  };

  const submitInterview = async (history: Message[]) => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("conversation", JSON.stringify(history));

      const res = await axios.post(
        `http://localhost:5000/api/interviews/feedback`,
        { conversation: history },
      );
      setFeedback(res.data.data);
      setCompleted(true);
    } catch (error) {
      console.error(error);
      toast.error("Failed to submit interview.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!interview)
    return <div className="text-center p-10">Interview not found.</div>;

  if (completed && feedback) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="text-center">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <CardTitle className="text-3xl text-green-800">
              Interview Completed
            </CardTitle>
            <CardDescription>
              Thank you for your time. Here is your AI-generated feedback.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-700 leading-relaxed">{feedback.summary}</p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {Object.entries(feedback.rating).map(
                ([key, score]: [string, any]) => (
                  <div
                    key={key}
                    className="p-3 bg-muted rounded-lg text-center"
                  >
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </div>
                    <div className="text-2xl font-bold text-primary">
                      {score}/10
                    </div>
                  </div>
                ),
              )}
            </div>
          </CardContent>
          <CardFooter className="bg-muted/20 p-6 flex flex-col items-start gap-2">
            <div className="font-semibold text-lg">
              Recommendation:{" "}
              <span
                className={
                  feedback.Recommendation === "Not Recommended"
                    ? "text-red-500"
                    : "text-green-600"
                }
              >
                {feedback.Recommendation}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {feedback["Recommendation Message"]}
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const currentQ = interview.questions[currentQuestionIndex];
  const progress =
    ((currentQuestionIndex + 1) / interview.questions.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {interview.jobRole} Interview
          </h1>
          <p className="text-sm text-gray-500">
            Question {currentQuestionIndex + 1} of {interview.questions.length}
          </p>
        </div>

        <Progress value={progress} className="h-2" />

        <Card className="shadow-lg border-primary/10">
          <CardHeader>
            <span className="text-xs font-semibold text-violet-600 uppercase tracking-wider">
              {currentQ.type} Question
            </span>
            <CardTitle className="text-xl leading-relaxed">
              {currentQ.question}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here..."
              className="min-h-[200px] text-lg p-4 resize-none focus-visible:ring-violet-500"
              autoFocus
            />
          </CardContent>
          <CardFooter className="flex justify-between p-6 bg-gray-50/50">
            <div className="text-xs text-gray-400 flex items-center gap-2">
              <Mic className="w-4 h-4" /> Voice input coming soon
            </div>
            <Button
              size="lg"
              onClick={handleNext}
              disabled={isSubmitting}
              className="px-8"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin mr-2" />
              ) : currentQuestionIndex === interview.questions.length - 1 ? (
                "Submit Interview"
              ) : (
                "Next Question"
              )}{" "}
              <Send className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
