const { suggestAISkills, generateAIDescription } = require('../services/geminiService');

/**
 * Generate job description using AI
 * @route POST /api/ai/generate-description
 */
const generateJobDescription = async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ message: 'Prompt is required' });
        }

        const description = await generateAIDescription(prompt);

        res.status(200).json({ 
            success: true, 
            description 
        });

    } catch (error) {
        console.error('❌ Controller: AI Generation Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to generate job description',
            error: error.message
        });
    }
};

/**
 * Suggest skills based on job role
 * @route POST /api/ai/suggest-skills
 */
const suggestSkills = async (req, res) => {
    try {
        const { role } = req.body;

        if (!role) {
            return res.status(400).json({ message: 'Job role is required' });
        }

        const skills = await suggestAISkills(role);

        res.status(200).json({ 
            success: true, 
            skills 
        });

    } catch (error) {
        console.error('❌ Controller: AI Suggestion Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to suggest skills',
            error: error.message
        });
    }
};

module.exports = {
    generateJobDescription,
    suggestSkills
};

