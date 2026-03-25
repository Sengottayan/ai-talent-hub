const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenAI = require('openai');
const InterviewResult = require('../models/InterviewResult');
const InterviewSession = require('../models/InterviewSession');
const Interview = require('../models/Interview');
const AntiCheatingEvent = require('../models/AntiCheatingEvent');
const axios = require('axios');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Initialize Groq SDK (Failover)
const groq = process.env.GROQ_API_KEY ? new OpenAI({
    apiKey: process.env.GROQ_API_KEY.trim(),
    baseURL: "https://api.groq.com/openai/v1"
}) : null;

/**
 * @desc    Finalize interview and generate AI feedback
 * @route   POST /api/interviews/finalize
 * @access  Public (Candidate)
 */
const finalizeInterview = async (req, res) => {
    try {
        const { interview_id, email, fullname, transcript, reason } = req.body;

        if (!interview_id || !email) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: interview_id, email',
            });
        }

        console.log(`Finalizing interview ${interview_id} for ${email}`);

        // Fetch anti-cheating state
        const events = await AntiCheatingEvent.find({ interview_id, email: email.toLowerCase().trim() }).sort({ createdAt: 1 });
        const latestEvent = events[events.length - 1];
        const antiCheatingSummary = {
            violationCount: latestEvent?.suspicious_score || 0,
            eventsCount: events.length,
            autoTerminated: latestEvent?.interview_status === 'auto_completed'
        };

        // Generate AI feedback from transcript
        let feedback = null;
        if (transcript && transcript.length > 0) {
            feedback = await generateFeedback(transcript, fullname || 'Candidate', antiCheatingSummary);
        }

        // Update session status
        await InterviewSession.findOneAndUpdate(
            { interviewId: interview_id, candidateEmail: email },
            {
                sessionStatus: 'completed',
                completedAt: new Date(),
                timerEndTimestamp: Date.now(),
                currentTranscript: transcript || [],
                status: 'Completed',
            },
            { upsert: true }
        );

        // Create or update interview result
        const existingResult = await InterviewResult.findOne({ interview_id, email: email.toLowerCase().trim() });

        const resultData = {
            interview_id,
            email: email.toLowerCase().trim(),
            fullname: fullname || 'Candidate',
            candidate_name: fullname || 'Candidate',
            // ONLY update transcript if the new one is significantly longer or if no transcript exists
            // This prevents "Empty Transcript" bugs if the frontend fails to send it all
            conversationTranscript: (transcript?.length > (existingResult?.conversationTranscript?.length || 0))
                ? transcript : (existingResult?.conversationTranscript || []),
            isCompleted: true,
            completedAt: new Date(),
            startedAt: existingResult?.startedAt || new Date(),
        };

        // Add feedback if generated
        if (feedback) {
            resultData.rating = feedback.rating;
            resultData.summary = feedback.summary;
            resultData.recommendations = feedback.recommendations;
            resultData.evaluation_summary = feedback.summary;
            resultData.strengths = feedback.strengths || [];
            resultData.improvements = feedback.improvements || [];
            resultData.responses = feedback.responses || []; // NEW: Q&A mapping
        }

        // Add Anti-Cheating Data
        resultData.violationCount = antiCheatingSummary.violationCount;
        resultData.antiCheatingState = {
            totalEvents: antiCheatingSummary.eventsCount,
            autoTerminated: antiCheatingSummary.autoTerminated,
            finalScore: antiCheatingSummary.violationCount
        };

        console.log(`🔍 Updating interview result: ${interview_id}`);
        const resultUpdate = await InterviewResult.findOneAndUpdate(
            { interview_id, email: email.toLowerCase().trim() },
            resultData,
            { upsert: true, new: true }
        );
        console.log(`✅ Result status updated: ${resultUpdate?.isCompleted ? 'Completed' : 'Failed'}`);

        // Update main Interview status
        console.log(`🔍 Updating main interview record: ${interview_id}`);
        const interviewUpdate = await Interview.findOneAndUpdate(
            { interviewId: interview_id },
            { status: 'Completed' },
            { new: true }
        );
        console.log(`✅ Main interview status updated: ${interviewUpdate?.status || 'Failed'}`);

        // --- NEW: Cooldown Logic ---
        if (resultData.isCompleted) {
            try {
                const CandidateInterviewHistory = require('../models/CandidateInterviewHistory');
                
                // Cooldown: 90 days from completion
                const cooldownPeriodDays = 90;
                const cooldownUntil = new Date();
                cooldownUntil.setDate(cooldownUntil.getDate() + cooldownPeriodDays);

                await CandidateInterviewHistory.findOneAndUpdate(
                    { 
                        candidateEmail: email.toLowerCase().trim(),
                        jobRole: interviewUpdate?.jobRole || 'Unknown',
                        companyName: interviewUpdate?.companyName || 'AI Talent Hub'
                    },
                    {
                        candidateEmail: email.toLowerCase().trim(),
                        candidateId: existingResult?.candidate_id,
                        jobRole: interviewUpdate?.jobRole || 'Unknown',
                        companyName: interviewUpdate?.companyName || 'AI Talent Hub',
                        interviewId: interview_id,
                        interviewCompletedAt: new Date(),
                        cooldownUntil: cooldownUntil
                    },
                    { upsert: true, new: true }
                );
                console.log(`⏱️ Cooldown recorded for ${email} until ${cooldownUntil.toDateString()}`);
            } catch (cooldownErr) {
                console.error('❌ Failed to record cooldown:', cooldownErr.message);
            }
        }

        console.log(`✅ Interview ${interview_id} finalized successfully`);

        // NEW: Trigger n8n evaluation if webhook is configured
        const N8N_WEBHOOK = process.env.N8N_RESULT_WEBHOOK_URL;
        if (N8N_WEBHOOK) {
            console.log(`📡 Sending result to n8n for additional evaluation: ${N8N_WEBHOOK}`);
            axios.post(N8N_WEBHOOK, {
                interview_id,
                email,
                fullname: fullname || 'Candidate',
                transcript: transcript || [],
                antiCheating: antiCheatingSummary,
                aiFeedback: feedback,
                timestamp: new Date()
            }).catch(e => console.error('n8n Webhook Error:', e.message));
        }

        res.status(200).json({
            success: true,
            message: 'Interview finalized successfully',
            feedback: feedback || null,
        });
    } catch (error) {
        console.error('Finalization error:', error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * Generate AI feedback from interview transcript
 * Uses Gemini or OpenRouter with fallback to basic analysis
 */
/**
 * Generate AI feedback from interview transcript
 * Uses Gemini or OpenRouter with fallback to basic analysis
 */
async function generateFeedback(transcript, candidateName, antiCheatingSummary) {
    try {
        // 0. Participation Check
        const candidateMessages = transcript.filter(m =>
            m.role !== 'assistant' && m.role !== 'agent' && m.role !== 'system' && m.content.length > 2
        );

        if (candidateMessages.length === 0) {
            console.log(`⚠️ No meaningful candidate participation detected for ${candidateName}`);
            return {
                summary: `The interview session was concluded without any verbal response from ${candidateName}. No technical evaluation possible.`,
                rating: { technical: 0, communication: 0, problemSolving: 0, clarity: 0, confidence: 0 },
                recommendations: "Verify the candidate's audio settings or reschedule the session.",
                strengths: [],
                improvements: ["No verbal participation detected"],
                responses: []
            };
        }

        const transcriptText = transcript
            .map((msg) => `${(msg.role === 'assistant' || msg.role === 'agent') ? 'INTERVIEWER' : 'CANDIDATE'}: ${msg.content}`)
            .join('\n');

        const prompt = `You are an elite technical recruiter and talent analyst. Evaluate this technical interview for ${candidateName}.
        
INTEGRITY ALERT:
- Suspension Score: ${antiCheatingSummary?.violationCount || 0}/10
- Auto-Terminated: ${antiCheatingSummary?.autoTerminated ? 'YES' : 'NO'}
- Total Suspicious Events: ${antiCheatingSummary?.eventsCount || 0}

TRANSCRIPT:
${transcriptText}

INSTRUCTIONS:
1. Provide a professional, deep-dive evaluation based ONLY on the provided transcript.
2. CRITICAL: If the candidate gave very short, generic, or non-answers, the ratings MUST reflect this (score 1-3).
3. If the suspension score is high (>5), you MUST mention the integrity concerns in the summary and lower the "confidence" and "clarity" ratings.
4. Be fair but highly critical. Do not hallucinate or invent technical knowledge that isn't clearly demonstrated in the candidate's responses.
5. If the transcript contains mostly silence or brief "yes/no" responses, the evaluation must be "Not Recommended".

Return ONLY a raw JSON object (no markdown, no backticks):
{
  "summary": "A comprehensive 3-5 sentence professional summary. Mention integrity issues if relevant.",
  "rating": {
    "technical": 1-10,
    "communication": 1-10,
    "problemSolving": 1-10,
    "clarity": 1-10,
    "confidence": 1-10
  },
  "recommendations": "Provide 2-3 specific, actionable growth areas or reasons for rejection.",
  "strengths": ["Strength 1", "Strength 2"],
  "improvements": ["Improvement 1", "Improvement 2"],
  "responses": [
    {"question": "Question asked", "answer": "The ACTUAL answer given by the candidate. If they didn't answer well, state 'Candidate provided no detailed response'."}
  ]
}
Note: If there are no candidate answers for a question, do NOT invent one.`;

        // 1. Try Gemini Direct (Best Quality)
        if (genAI) {
            try {
                console.log(`📡 Requesting Gemini feedback for ${candidateName}...`);
                const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

                // Add a timeout to avoid hanging
                const result = await model.generateContent(prompt).catch(e => {
                    console.error("❌ Gemini generateContent threw:", e.message);
                    return null;
                });

                if (!result) throw new Error("Gemini generation failed or timed out");

                const response = await result.response;
                let text = response.text().trim();

                if (text.startsWith('```')) {
                    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                }

                try {
                    const feedback = JSON.parse(text);
                    console.log('✅ Gemini feedback generated');
                    return feedback;
                } catch (e) {
                    console.error('Gemini JSON Parse Error:', e, "Raw Text:", text);
                }
            } catch (err) {
                console.warn('Gemini Feedback Attempt failed:', err.message);
                
                // 1.1 Groq Fallback within Gemini block
                if (groq) {
                    try {
                        console.log("📡 Falling back to Groq SDK for feedback...");
                        const completion = await groq.chat.completions.create({
                            messages: [{ role: 'user', content: prompt }],
                            model: 'llama-3.3-70b-versatile',
                            response_format: { type: 'json_object' },
                            temperature: 0.1
                        });
                        const groqText = completion.choices[0]?.message?.content;
                        if (groqText) {
                            return JSON.parse(groqText);
                        }
                    } catch (groqErr) {
                        console.error("❌ Groq Feedback Fallback Error:", groqErr.message);
                    }
                }
            }
        }

        // 2. Try OpenRouter fallback
        if (OPENROUTER_API_KEY) {
            try {
                const response = await axios.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    {
                        model: 'openai/gpt-3.5-turbo',
                        messages: [{ role: 'user', content: prompt }],
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                            'Content-Type': 'application/json',
                        },
                        timeout: 30000,
                    }
                );

                const content = response.data.choices[0].message.content;
                let jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            } catch (error) {
                console.error('OpenRouter API error:', error.message);
            }
        }

        // 3. Fallback to basic analysis
        return generateBasicFeedback(transcript, candidateName);
    } catch (error) {
        console.error('Feedback generation error:', error);
        return generateBasicFeedback(transcript, candidateName);
    }
}

/**
 * Generate basic feedback without AI
 */
function generateBasicFeedback(transcript, candidateName) {
    const userMessages = transcript.filter((msg) => msg.role === 'user' || msg.role === 'candidate');
    const userMessageCount = userMessages.length;

    if (userMessageCount === 0) {
        return {
            summary: `No verbal interaction was recorded for ${candidateName || 'the candidate'}. This may be due to technical issues or lack of participation.`,
            rating: { technical: 0, communication: 0, problemSolving: 0, clarity: 0, confidence: 0 },
            recommendations: 'Reschedule the session and verify audio connectivity.',
            strengths: [],
            improvements: ['No verbal participation detected'],
            responses: []
        };
    }

    // Calculate average response length
    const totalLength = userMessages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
    const avgResponseLength = totalLength / userMessageCount;

    // Basic scoring based on engagement
    const engagementScore = Math.min(10, Math.floor(userMessageCount / 2) + 2);
    const qualityScore = avgResponseLength > 100 ? 7 : (avgResponseLength > 30 ? 5 : 2);

    return {
        summary: `The candidate, ${candidateName}, provided ${userMessageCount} responses during the interview. The average response length was ${Math.round(avgResponseLength)} characters.`,
        rating: {
            technical: engagementScore,
            communication: qualityScore,
            problemSolving: Math.floor((engagementScore + qualityScore) / 2),
            clarity: qualityScore,
            confidence: engagementScore,
        },
        recommendations: 'Manual review of the transcript is recommended to assess technical depth.',
        strengths: ["Participated in the session"],
        improvements: ["Greater detail in technical responses may be required"],
        responses: []
    };
}

module.exports = {
    finalizeInterview,
};
