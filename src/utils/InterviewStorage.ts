export const InterviewStorage = {
  saveSession: (interviewId: string, data: any) => {
    try {
      localStorage.setItem(
        `interview_session_${interviewId}`,
        JSON.stringify(data),
      );
    } catch (e) {
      console.error("Failed to save to local storage", e);
    }
  },

  loadSession: (interviewId: string) => {
    try {
      const data = localStorage.getItem(`interview_session_${interviewId}`);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  clearSession: (interviewId: string) => {
    localStorage.removeItem(`interview_session_${interviewId}`);
  },
};
