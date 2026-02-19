import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface InterviewInfo {
    interview_id: string;
    email: string;
    candidate_name: string;
    job_position: string;
    job_description?: string;
    duration?: string;
    question_list?: {
        cvQuestions?: any[];
        jdQuestions?: any[];
        combinedQuestions?: any[];
        codingQuestion?: any;
        activeSection?: 'cv' | 'jd' | 'combined';
    };
    recruiter_id?: string;
    company_name?: string;
    token?: string;
}

interface InterviewDataContextType {
    interviewInfo: InterviewInfo | null;
    setInterviewInfo: (info: InterviewInfo | null) => void;
}

const InterviewDataContext = createContext<InterviewDataContextType | undefined>(undefined);

export const InterviewDataProvider = ({ children }: { children: ReactNode }) => {
    const [interviewInfo, setInterviewInfoState] = useState<InterviewInfo | null>(() => {
        // Initialize from localStorage if available
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('interviewInfo');
            if (stored) {
                try {
                    return JSON.parse(stored);
                } catch (e) {
                    console.error('Failed to parse stored interview info:', e);
                    return null;
                }
            }
        }
        return null;
    });

    // Persist to localStorage whenever it changes
    const setInterviewInfo = (info: InterviewInfo | null) => {
        setInterviewInfoState(info);
        if (typeof window !== 'undefined') {
            if (info) {
                localStorage.setItem('interviewInfo', JSON.stringify(info));
            } else {
                localStorage.removeItem('interviewInfo');
            }
        }
    };

    return (
        <InterviewDataContext.Provider value={{ interviewInfo, setInterviewInfo }}>
            {children}
        </InterviewDataContext.Provider>
    );
};

export const useInterviewData = () => {
    const context = useContext(InterviewDataContext);
    if (context === undefined) {
        throw new Error('useInterviewData must be used within an InterviewDataProvider');
    }
    return context;
};

export { InterviewDataContext };
