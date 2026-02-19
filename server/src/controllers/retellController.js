const Retell = require('retell-sdk');

const retell = new Retell({
    apiKey: process.env.RETELL_API_KEY,
});

// @desc    Create Web Call for Interview
// @route   POST /api/interviews/retell/token
// @access  Public (Candidate)
const generateRetellToken = async (req, res) => {
    try {
        const { interviewId, email, candidateName, jobPosition, questions, duration, systemPrompt } = req.body;

        if (!interviewId || !email || !candidateName) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: interviewId, email, candidateName',
            });
        }

        const agent_id = process.env.RETELL_AGENT_ID;
        console.log("Using Retell Agent ID:", agent_id);
        if (!agent_id) {
            console.error("❌ RETELL_AGENT_ID is missing in environment variables");
            return res.status(500).json({
                success: false,
                error: 'RETELL_AGENT_ID not configured in server'
            });
        }

        console.log("Creating interview web call for:", candidateName, "Position:", jobPosition);

        // Prepare dynamic variables for the LLM (Must be strings)
        const formattedQuestions = questions && Array.isArray(questions)
            ? questions.map((q, idx) => `${idx + 1}. ${q.question}`).join('\n')
            : "No specific questions provided.";

        // Prepare dynamic variables for the LLM (Must match variables in Retell Prompt dashboard)
        const isRestored = req.body.isRestored;
        const lastTranscript = req.body.lastTranscript;

        // Build history context for LLM memory injection
        let historyContext = "";
        if (isRestored && lastTranscript && Array.isArray(lastTranscript)) {
            historyContext = lastTranscript
                .map(m => `${(m.role === 'assistant' || m.role === 'agent') ? 'AI' : 'Candidate'}: ${m.content}`)
                .join('\n');
        }

        const dynamicVariables = {
            candidate_name: String(candidateName),
            name: String(candidateName),
            candidate: String(candidateName),
            job_position: String(jobPosition || "Position"),
            job_role: String(jobPosition || "Position"),
            role: String(jobPosition || "Position"),
            position: String(jobPosition || "Position"),
            interview_id: String(interviewId),
            questions_count: String(questions?.length || 0),
            interview_questions: String(formattedQuestions),
            interview_duration: String(duration || "15"),
            system_prompt: String(systemPrompt || ""),
            // NEW: Add history for resumption
            interview_history: isRestored
                ? `[RESUMPTION DATA - IMPORTANT]\nThis interview is being resumed. DO NOT use your standard introduction. Skip steps in your structure that are already covered in the history below:\n${historyContext}`
                : "Fresh Start - Follow standard intro.",
        };

        // Create initial message that establishes context immediately
        const greeting = isRestored
            ? `Welcome back, ${candidateName}. We're resuming your interview for the ${jobPosition || 'position'}. I've reviewed our previous conversation, so let's continue right where we left off. Shall we?`
            : `Hello ${candidateName}! I'm HireAI. I see you're here for the ${jobPosition || 'position'} interview. I've reviewed your details and I'm ready to start. Shall we proceed?`;

        // Create payload
        const payload = {
            agent_id: agent_id,
            initial_message: greeting,
            metadata: {
                interview_id: String(interviewId),
                candidate_email: String(email),
                candidate_name: String(candidateName),
                job_position: String(jobPosition || ""),
            },
            retell_llm_dynamic_variables: dynamicVariables,
        };

        console.log("📡 Sending payload to Retell:", JSON.stringify(payload, null, 2));

        const webCallResponse = await retell.call.createWebCall(payload);
        console.log("✅ Interview web call created:", webCallResponse.call_id);

        res.json({
            success: true,
            accessToken: webCallResponse.access_token,
            callId: webCallResponse.call_id,
        });
    } catch (error) {
        console.error('❌ Error creating interview web call:', error.message);
        if (error.response) {
            console.error('📡 Retell API Error Response (Status):', error.response.status);
            console.error('📡 Retell API Error Response (Data):', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('🛑 Full Error Object:', error);
            console.error('🛑 Full Error Message:', error.message);
            if (error.stack) console.error('🛑 Error Stack:', error.stack);
        }
        res.status(500).json({
            success: false,
            error: 'Failed to create interview call',
            details: error.message
        });
    }
};

// @desc    Legacy create web call (for backward compatibility)
// @route   POST /api/retell/create-web-call
// @access  Public
const createWebCall = async (req, res) => {
    const agent_id = (req.body && req.body.agent_id) || process.env.RETELL_AGENT_ID;

    if (!agent_id) {
        return res.status(500).json({ error: 'RETELL_AGENT_ID not configured in server' });
    }

    try {
        console.log("Creating web call for agent:", agent_id);
        const payload = {
            agent_id: agent_id,
        };

        if (req.body && req.body.retell_llm_dynamic_variables) {
            payload.retell_llm_dynamic_variables = req.body.retell_llm_dynamic_variables;
        }

        const webCallResponse = await retell.call.createWebCall(payload);
        console.log("Web call created successfully:", webCallResponse);
        res.json(webCallResponse);
    } catch (error) {
        console.error('Error creating web call:', error);
        if (error.response) {
            console.error('Retell API Response:', error.response.data);
        }
        res.status(500).json({ error: 'Failed to create web call', details: error.message });
    }
};

// @desc    Handle Retell AI webhook events
// @route   POST /api/interviews/retell/webhook
// @access  Public (Retell AI)
const handleRetellWebhook = async (req, res) => {
    try {
        const { event, call } = req.body;

        console.log('📞 Retell webhook event:', event, 'Call ID:', call?.call_id);

        const InterviewResult = require('../models/InterviewResult');

        // Handle different event types
        switch (event) {
            case 'call_started':
                console.log('Call started:', call.call_id);
                break;

            case 'call_ended':
            case 'call_analyzed':
                console.log(`📞 Processing Retell ${event} for ${call.call_id}`);

                const { interview_id, candidate_email } = call.metadata || {};

                if (interview_id && candidate_email) {
                    const transcript = call.transcript_object?.map(t => ({
                        role: t.role === 'agent' ? 'assistant' : 'user',
                        content: t.content,
                        timestamp: new Date()
                    })) || [];

                    if (transcript.length > 0) {
                        console.log(`💾 Persisting final transcript from Retell for ${candidate_email}`);

                        // Find existing or wait for finalize controller
                        const existing = await InterviewResult.findOne({
                            interview_id,
                            email: candidate_email.toLowerCase().trim()
                        });

                        // Only write if new transcript is better
                        if (transcript.length >= (existing?.conversationTranscript?.length || 0)) {
                            await InterviewResult.findOneAndUpdate(
                                { interview_id, email: candidate_email.toLowerCase().trim() },
                                {
                                    $set: {
                                        conversationTranscript: transcript,
                                        isCompleted: true,
                                        completedAt: new Date()
                                    }
                                },
                                { upsert: true }
                            );
                            console.log(`✅ Webhook update successful for ${candidate_email}`);
                        }
                    }
                }
                break;

            default:
                console.log('Unknown event:', event);
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    createWebCall,
    generateRetellToken,
    handleRetellWebhook,
};

