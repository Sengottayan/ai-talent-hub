const InterviewResult = require('../models/InterviewResult');
const Interview = require('../models/Interview');
const mongoose = require('mongoose');
const { sendMailNodemailer } = require('../utils/sendMailNodemailer');

// @desc    Get all interview results
// @route   GET /api/interviews/results/all
// @access  Private
const getAllResults = async (req, res) => {
  try {
    const results = await InterviewResult.aggregate([
      { $match: { interview_id: { $not: /^mock-/ } } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "interviews",
          localField: "interview_id",
          foreignField: "interviewId",
          as: "interviewData"
        }
      },
      {
        $addFields: {
          interviewType: { $arrayElemAt: ["$interviewData.interviewType", 0] },
          jobRole: { $arrayElemAt: ["$interviewData.jobRole", 0] }
        }
      },
      { $project: { interviewData: 0 } }
    ]);
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
const getResultsByInterview = async (req, res) => {
  try {
    const results = await InterviewResult.aggregate([
      {
        $match: {
          interview_id: req.params.interviewId,
          $and: [{ interview_id: { $not: /^mock-/ } }]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "interviews",
          localField: "interview_id",
          foreignField: "interviewId",
          as: "interviewData"
        }
      },
      {
        $addFields: {
          interviewType: { $arrayElemAt: ["$interviewData.interviewType", 0] },
          jobRole: { $arrayElemAt: ["$interviewData.jobRole", 0] }
        }
      },
      { $project: { interviewData: 0 } }
    ]);
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create or update interview result
// @route   POST /api/interviews/results
// @access  Private
const upsertResult = async (req, res) => {
  let {
    interview_id,
    candidate_id,
    email,
    candidate_name,
    fullname,
    scores,
    evaluation_summary,
    decision,
    feedback,
    strengths,
    improvements,
    n8n_evaluation
  } = req.body;

  try {
    // Fallback: If email is missing, try to get it from the interview
    if (!email && interview_id) {
      // Try by custom interviewId (a UUID string) first
      let interviewDef = await Interview.findOne({ interviewId: interview_id });

      // If not found, and it looks like a Mongo ID, fallback to findById
      if (!interviewDef && mongoose.Types.ObjectId.isValid(interview_id)) {
        interviewDef = await Interview.findById(interview_id);
      }

      if (interviewDef && interviewDef.candidateEmail) {
        email = interviewDef.candidateEmail;
        console.log(`ℹ️ Recovered missing email from Interview: ${email}`);
      }
    }

    console.log(`📥 Upserting result for interview: ${interview_id}, email: ${email}`);

    // Support lookup by candidate_id OR email
    const query = { interview_id };
    if (candidate_id && mongoose.Types.ObjectId.isValid(candidate_id)) {
      query.candidate_id = candidate_id;
    } else if (email) {
      query.email = email.toLowerCase().trim();
    }

    // Handle n8n evaluation structure (mapping its custom keys to our model)
    if (n8n_evaluation) {
      // Allow both object and stringified JSON
      if (typeof n8n_evaluation === 'string') {
        try { n8n_evaluation = JSON.parse(n8n_evaluation); } catch (e) { }
      }

      if (typeof n8n_evaluation === 'object') {
        evaluation_summary = n8n_evaluation.summary || evaluation_summary;
        strengths = n8n_evaluation.strengths || strengths;
        improvements = n8n_evaluation.growth_areas || n8n_evaluation.improvements || improvements;

        // If n8n provides a suitability_score, we can map it to our internal scores
        if (n8n_evaluation.suitability_score && !scores) {
          scores = { "Final Recruiter Score": n8n_evaluation.suitability_score };
        }
      }
    }

    let result = await InterviewResult.findOne(query);
    let previousDecision = result ? result.decision : 'pending';

    if (result) {
      result.scores = scores || result.scores;
      result.evaluation_summary = evaluation_summary || result.evaluation_summary;
      result.decision = decision || result.decision;
      result.feedback = feedback || result.feedback;
      result.strengths = (strengths && strengths.length > 0) ? strengths : result.strengths;
      result.improvements = (improvements && improvements.length > 0) ? improvements : result.improvements;
      result.n8n_evaluation = n8n_evaluation || result.n8n_evaluation;

      // Sync rating object if n8n provides score
      if (n8n_evaluation?.suitability_score) {
        result.rating = result.rating || {};
        result.rating.technical = n8n_evaluation.suitability_score;
      }

      await result.save();
      console.log(`✅ Result updated for ${email}`);
    } else {
      result = await InterviewResult.create({
        interview_id,
        candidate_id: mongoose.Types.ObjectId.isValid(candidate_id) ? candidate_id : undefined,
        email: email?.toLowerCase().trim(),
        candidate_name: candidate_name || fullname || 'Candidate',
        fullname: fullname || candidate_name || 'Candidate',
        scores: scores || {},
        evaluation_summary,
        decision: decision || 'pending',
        feedback,
        strengths: strengths || [],
        improvements: improvements || [],
        n8n_evaluation,
        isCompleted: true,
        completedAt: new Date()
      });
      console.log(`✨ New result created for ${email}`);
    }

    // ─── SEND EMAIL NOTIFICATION IF DECISION CHANGED TO SELECTED/REJECTED ───
    if (email && decision && (decision.toLowerCase() !== previousDecision.toLowerCase())) {

      // Re-fetch interview to get job role if possible
      let jobRole = "the position";
      const interviewInfo = await Interview.findOne(
        mongoose.Types.ObjectId.isValid(interview_id) ? { _id: interview_id } : { interviewId: interview_id }
      );
      if (interviewInfo && (interviewInfo.jobRole || interviewInfo.role)) {
        jobRole = interviewInfo.jobRole || interviewInfo.role;
      }

      const candidateName = candidate_name || fullname || "Candidate";
      const year = new Date().getFullYear();
      const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:6060';

      // ─── SELECTED ───
      if (decision.toLowerCase() === 'selected') {
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Congratulations - You're Hired!</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" 
               style="max-width:600px; width:100%; border-radius:16px; overflow:hidden; 
                      box-shadow:0 10px 40px rgba(0,0,0,0.1); background:#ffffff;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%); padding:48px 32px; text-align:center;">
              <div style="display:inline-block; background:rgba(255,255,255,0.2); border-radius:50%; padding:16px; margin-bottom:16px;">
                <span style="font-size:32px; line-height:1;">🎉</span>
              </div>
              <h1 style="color:#ffffff; margin:0; font-size:28px; font-weight:800; letter-spacing:-0.5px;">Congratulations!</h1>
              <p style="color:rgba(255,255,255,0.9); margin:8px 0 0; font-size:16px;">You have been selected</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:40px 40px 32px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;">
              
              <p style="color:#374151; font-size:16px; margin:0 0 16px;">Dear <strong>${candidateName}</strong>,</p>
              
              <p style="color:#4b5563; font-size:16px; line-height:1.6; margin-bottom:24px;">
                We are absolutely thrilled to offer you the position of <strong style="color:#059669;">${jobRole}</strong> at <strong>HireAI</strong>!
              </p>

              <!-- Highlight Box -->
              <div style="background:#ecfdf5; border:1px solid #d1fae5; border-left:4px solid #10b981; 
                          padding:24px; border-radius:10px; margin-bottom:32px;">
                <p style="color:#065f46; font-size:16px; font-style:italic; margin:0; line-height:1.6;">
                  "Your skills, experience, and performance during the interview process were truly impressive. We believe you will be a fantastic addition to our team."
                </p>
              </div>

              <p style="color:#4b5563; font-size:15px; margin-bottom:32px; line-height:1.6;">
                Our HR team is currently preparing your official offer letter and onboarding details. You will hear from us shortly with the next steps.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" 
                       style="display:inline-block; 
                              background:linear-gradient(135deg,#10b981 0%,#059669 100%); 
                              color:#ffffff; font-weight:700; font-size:16px; 
                              text-decoration:none; padding:14px 40px; border-radius:50px; 
                              box-shadow:0 4px 15px rgba(16,185,129,0.3);">
                      Go to My Dashboard
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f9fafb; padding:24px; text-align:center; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 16px 16px;">
              <p style="color:#9ca3af; font-size:13px; margin:0;">
                &copy; ${year} HireAI &nbsp;&middot;&nbsp; AI-Powered Recruitment Platform
              </p>
              <p style="color:#d1d5db; font-size:12px; margin:6px 0 0;">
                This is an automated message. Please do not reply directly.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

        await sendMailNodemailer(
          email,
          `🎉 Offer: You have been selected for ${jobRole}`,
          html
        );
        console.log(`📧 Selection email sent to ${email}`);
      }

      // ─── REJECTED ───
      else if (decision.toLowerCase() === 'rejected') {
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Interview Update</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" 
               style="max-width:600px; width:100%; border-radius:16px; overflow:hidden; 
                      box-shadow:0 4px 20px rgba(0,0,0,0.05); background:#ffffff;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#374151 0%,#1f2937 100%); padding:40px 32px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:700; letter-spacing:0.5px;">Interview Status Update</h1>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:40px 40px 32px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;">
              
              <p style="color:#374151; font-size:16px; margin:0 0 16px;">Dear <strong>${candidateName}</strong>,</p>
              
              <p style="color:#4b5563; font-size:15px; line-height:1.7; margin-bottom:16px;">
                Thank you so much for the time and effort you invested in interviewing for the <strong style="color:#374151;">${jobRole}</strong> position at HireAI.
              </p>
              
              <p style="color:#4b5563; font-size:15px; line-height:1.7; margin-bottom:24px;">
                We were impressed by your background. However, after careful consideration, we have decided to move forward with other candidates who more closely align with our current specific needs for this role.
              </p>

               <!-- Info Box -->
               <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:20px; margin-bottom:32px;">
                <p style="color:#64748b; font-size:14px; margin:0; line-height:1.6;">
                  We will keep your resume in our talent pool and may reach out if a role that better fits your profile opens up in the future.
                </p>
              </div>

              <p style="color:#4b5563; font-size:15px; line-height:1.7; margin-bottom:24px;">
                We appreciate your interest in our company and wish you the very best in your job search and professional endeavors.
              </p>

              <hr style="border:0; border-top:1px solid #f3f4f6; margin:32px 0;">

               <!-- Link -->
               <div style="text-align:center;">
                  <a href="${dashboardUrl}" style="color:#6b7280; font-size:14px; text-decoration:none; font-weight:500;">
                    Visit Candidate Portal &rarr;
                  </a>
               </div>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f9fafb; padding:24px; text-align:center; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 16px 16px;">
              <p style="color:#9ca3af; font-size:12px; margin:0;">
                &copy; ${year} HireAI Recruitment
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

        await sendMailNodemailer(
          email,
          `Update regarding your interview for ${jobRole}`,
          html
        );
        console.log(`📧 Rejection email sent to ${email}`);
      }
    }

    res.status(201).json(result);
  } catch (error) {
    console.error('❌ Upsert Result Error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAllResults,
  getResultsByInterview,
  upsertResult
};
