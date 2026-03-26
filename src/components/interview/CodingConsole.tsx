import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Send,
  ChevronLeft,
  ChevronRight,
  Loader2,
  TerminalSquare,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import Editor from "@monaco-editor/react";

interface TestCase {
  input: string;
  output: string;
}

interface Question {
  title?: string;
  question: string;
  description?: string;
  examples?: string;
  constraints?: string;
  testCases?: TestCase[];
  difficulty?: string;
}

interface CodingConsoleProps {
  questions: Question[];
  interviewId: string;
  candidateEmail: string;
  candidateName: string;
  onComplete: () => void;
}

const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "go", label: "Go" },
];

const LANGUAGE_TEMPLATES: Record<string, string> = {
  javascript:
    "// JavaScript Template\n\nfunction solution() {\n  // your code here\n\n}",
  python:
    "# Python Template\n\ndef solution():\n    # your code here\n    pass",
  java: "import java.util.*;\nimport java.io.*;\n\nclass Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        // your code here\n    }\n}",
  cpp: "#include <iostream>\n#include <string>\n#include <vector>\nusing namespace std;\n\nint main() {\n    // your code here\n    return 0;\n}",
  csharp:
    "using System;\n\nclass Program {\n    static void Main(string[] args) {\n        // your code here\n    }\n}",
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    // your code here\n}',
};

export default function CodingConsole({
  questions,
  interviewId,
  candidateEmail,
  candidateName,
  onComplete,
}: CodingConsoleProps) {
  const [codeState, setCodeState] = useState<
    Record<
      number,
      {
        code: string;
        language: string;
        runOutput: string;
        errorOutput: string;
        results: any[];
        allPassed: boolean;
      }
    >
  >(() => {
    try {
      const saved = localStorage.getItem(`interview_code_${interviewId}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  });

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Output states
  const [runOutput, setRunOutput] = useState("");
  const [errorOutput, setErrorOutput] = useState("");
  const [lastResults, setLastResults] = useState<any[]>([]);
  const [lastAllPassed, setLastAllPassed] = useState(false);

  const currentQuestion = questions[currentQuestionIndex] as
    | Question
    | undefined;

  useEffect(() => {
    // Load saved state or set default code when question changes
    if (codeState[currentQuestionIndex]) {
      const saved = codeState[currentQuestionIndex];
      setLanguage(saved.language);
      setCode(saved.code);
      setRunOutput(saved.runOutput);
      setErrorOutput(saved.errorOutput);
      setLastResults(saved.results || []);
      setLastAllPassed(saved.allPassed || false);
    } else {
      const defaultCode =
        LANGUAGE_TEMPLATES[language] ||
        `// Write your ${language} code here\n\n`;
      setCode(defaultCode);
      setRunOutput("");
      setErrorOutput("");
      setLastResults([]);
      setLastAllPassed(false);
    }
  }, [currentQuestionIndex]);

  // Save state whenever code, language, runOutput, errorOutput changes
  useEffect(() => {
    setCodeState((prev) => {
      const newState = {
        ...prev,
        [currentQuestionIndex]: {
          code,
          language,
          runOutput,
          errorOutput,
          results: lastResults,
          allPassed: lastAllPassed,
        },
      };
      try {
        localStorage.setItem(
          `interview_code_${interviewId}`,
          JSON.stringify(newState),
        );
      } catch (e) {}
      return newState;
    });
  }, [
    code,
    language,
    runOutput,
    errorOutput,
    lastResults,
    lastAllPassed,
    currentQuestionIndex,
    interviewId,
  ]);

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    setCode(
      LANGUAGE_TEMPLATES[newLang] || `// Write your ${newLang} code here\n\n`,
    );
  };

  const runCode = async () => {
    if (!code.trim()) {
      toast.error("Please write some code before running");
      return;
    }

    setIsRunning(true);
    setRunOutput("Executing code...\n");
    setErrorOutput("");

    try {
      const formData = new FormData();
      formData.append("interview_id", interviewId);
      formData.append("email", candidateEmail);
      formData.append("language", language);
      formData.append("code", code);

      // Optional: send test cases to execute against if backend supports it
      if (currentQuestion?.testCases) {
        formData.append("testCases", JSON.stringify(currentQuestion.testCases));
      }

      const response = await api.post(`/interviews/coding-execute`, formData);

      if (response.data.success) {
        setRunOutput(
          response.data.output || "Code executed successfully with no output.",
        );
        setErrorOutput(response.data.stderr || "");
        if (response.data.results) {
          setLastResults(response.data.results);
          setLastAllPassed(response.data.allPassed);
        }
        toast.success("Code executed!");
      } else {
        setErrorOutput(
          response.data.message || response.data.stderr || "Execution failed.",
        );
      }
    } catch (err: any) {
      console.error("Execution failure:", err);
      setErrorOutput(
        err.response?.data?.message ||
          err.message ||
          "Unknown execution error.",
      );
    } finally {
      setIsRunning(false);
    }
  };

  const submitAnswer = async () => {
    if (!code.trim()) {
      toast.error("Please write some code before submitting");
      return;
    }

    setIsSubmitting(true);
    try {
      const submission = {
        questionIndex: currentQuestionIndex,
        question: currentQuestion?.question || currentQuestion?.title,
        code,
        language,
        output: runOutput,
        errorOutput,
        results: lastResults,
        allPassed: lastAllPassed,
        submittedAt: new Date().toISOString(),
      };

      await api.post(`/interviews/coding-submission`, {
        interview_id: interviewId,
        email: candidateEmail,
        candidate_name: candidateName,
        submission,
      });

      toast.success("Solution submitted successfully!");

      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex((prev) => prev + 1);
      } else {
        toast.success("All challenges completed!");
        onComplete();
      }
    } catch (error: any) {
      toast.error("Failed to submit: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full flex-1 overflow-hidden h-full bg-slate-50 border border-slate-200 rounded-lg shadow-sm">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        {/* Left Panel: Problem Description */}
        <ResizablePanel
          defaultSize={40}
          minSize={30}
          className="bg-white flex flex-col"
        >
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-800">
                Problem {currentQuestionIndex + 1}
              </h2>
              {currentQuestion?.difficulty && (
                <Badge
                  variant={
                    currentQuestion.difficulty === "Hard"
                      ? "destructive"
                      : currentQuestion.difficulty === "Medium"
                        ? "default"
                        : "secondary"
                  }
                >
                  {currentQuestion.difficulty}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 prose prose-slate max-w-none">
            <h3 className="text-xl font-semibold mb-4 text-violet-900 border-b pb-2">
              {currentQuestion?.title ||
                `Coding Challenge ${currentQuestionIndex + 1}`}
            </h3>

            <div className="text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
              {currentQuestion?.question || currentQuestion?.description}
            </div>

            {currentQuestion?.examples && (
              <div className="mt-8">
                <h4 className="font-bold text-slate-800 mb-3">Examples:</h4>
                <div className="bg-slate-100 rounded-md p-4 text-sm font-mono text-slate-800 whitespace-pre-wrap border border-slate-200">
                  {currentQuestion.examples}
                </div>
              </div>
            )}

            {currentQuestion?.testCases &&
              currentQuestion.testCases.length > 0 &&
              !currentQuestion?.examples && (
                <div className="mt-8">
                  <h4 className="font-bold text-slate-800 mb-3">
                    Sample Test Cases:
                  </h4>
                  {currentQuestion.testCases.map((tc, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-100 rounded-md p-4 mt-2 text-sm font-mono text-slate-800 whitespace-pre-wrap border border-slate-200"
                    >
                      <div>
                        <strong>Input:</strong> {tc.input}
                      </div>
                      <div>
                        <strong>Output:</strong> {tc.output}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            {currentQuestion?.constraints && (
              <div className="mt-8">
                <h4 className="font-bold text-slate-800 mb-3">Constraints:</h4>
                <ul className="bg-amber-50 rounded-md p-4 text-sm text-amber-900 border border-amber-200 list-disc pl-6 space-y-1">
                  <li>{currentQuestion.constraints}</li>
                </ul>
              </div>
            )}
          </div>

          {/* Pagination for questions */}
          {questions.length > 1 && (
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={currentQuestionIndex === 0}
                onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>
              <span className="text-sm font-medium text-slate-500">
                {currentQuestionIndex + 1} of {questions.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentQuestionIndex === questions.length - 1}
                onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel: Editor & Console */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <ResizablePanelGroup direction="vertical" className="h-full">
            {/* Editor Area */}
            <ResizablePanel
              defaultSize={65}
              minSize={20}
              className="flex flex-col bg-[#1e1e1e]"
            >
              {/* Editor Toolbar */}
              <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-[#444] flex-none">
                <Select value={language} onValueChange={handleLanguageChange}>
                  <SelectTrigger className="w-40 h-8 bg-[#3c3c3c] text-slate-200 border-[#555] focus:ring-1 focus:ring-blue-500">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2d2d2d] text-slate-200 border-[#444]">
                    {LANGUAGES.map((lang) => (
                      <SelectItem
                        key={lang.value}
                        value={lang.value}
                        className="focus:bg-[#3c3c3c] focus:text-white cursor-pointer"
                      >
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={runCode}
                    disabled={isRunning || isSubmitting}
                    className="bg-slate-200 hover:bg-white text-slate-800 font-bold px-4 h-8"
                  >
                    {isRunning ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Run Code
                  </Button>

                  <Button
                    size="sm"
                    onClick={submitAnswer}
                    disabled={isSubmitting || isRunning}
                    className="bg-green-600 hover:bg-green-500 text-white font-bold px-4 h-8"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Submit
                  </Button>
                </div>
              </div>

              {/* Monaco Editor */}
              <div
                className="flex-1 relative overflow-hidden"
                onPasteCapture={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toast.error("Pasting code is disabled during the interview.");
                }}
                onCopyCapture={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toast.error("Copying code is disabled during the interview.");
                }}
              >
                <Editor
                  height="100%"
                  language={language}
                  value={code}
                  onChange={(val) => setCode(val || "")}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineHeight: 24,
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    cursorBlinking: "smooth",
                    cursorSmoothCaretAnimation: "on",
                    formatOnPaste: true,
                    wordWrap: "on",
                  }}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-[#444]" />

            {/* Console/Output Area */}
            <ResizablePanel
              defaultSize={35}
              minSize={15}
              className="bg-[#1e1e1e] flex flex-col"
            >
              <div className="px-4 py-2 bg-[#2d2d2d] border-b border-[#444] flex items-center justify-between flex-none">
                <div className="flex items-center gap-2 text-slate-300 text-sm font-bold tracking-wide uppercase">
                  <TerminalSquare className="w-4 h-4" />
                  Test Results
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRunOutput("");
                    setErrorOutput("");
                  }}
                  className="h-6 text-xs text-slate-400 hover:text-white"
                >
                  Clear
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
                {!runOutput && !errorOutput && !isRunning && (
                  <div className="text-slate-500 italic h-full flex flex-col items-center justify-center opacity-70">
                    <TerminalSquare className="w-8 h-8 mb-2" />
                    Run your code to see outputs here.
                  </div>
                )}
                {isRunning && (
                  <div className="text-slate-400 animate-pulse flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Executing and evaluating test cases...
                  </div>
                )}
                {runOutput && !isRunning && (
                  <pre className="text-green-400 whitespace-pre-wrap mb-4 font-mono">
                    {runOutput}
                  </pre>
                )}
                {errorOutput && !isRunning && (
                  <pre className="text-red-400 whitespace-pre-wrap font-mono mt-2 bg-red-950/20 p-3 rounded-md border border-red-900/50">
                    {errorOutput}
                  </pre>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
