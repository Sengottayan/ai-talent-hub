const RescheduleRequest = require('../models/RescheduleRequest');
const Interview = require('../models/Interview');
const Candidate = require('../models/Candidate');
const axios = require('axios');
const { sendEmail } = require('../services/emailService');               // EmailJS (used for other emails)
const { sendMailNodemailer } = require('../utils/sendMailNodemailer');   // Nodemailer (used for rejection emails)

// ─── Helper: Generate Next Available Business Slots ─────────────────────────────
/**
 * Automatically finds the next available interview slots by checking both
 * the Interviews and RescheduleRequests collections for occupancy.
 * Business Hours: Monday-Friday, 9:00 AM - 6:00 PM (IST).
 */
const generateAvailableSlots = async (startDate, limit = 5) => {
  const slots = [];
  let current = new Date(startDate);
  
  // Start searching from the day after the requested date
  current.setDate(current.getDate() + 1);
  current.setHours(9, 0, 0, 0);

  let iterations = 0;
  // Look through the next 14 days maximum
  while (slots.length < limit && iterations < 14) {
    const day = current.getDay();
    
    // Skip Saturday (6) and Sunday (0)
    if (day !== 0 && day !== 6) {
      // Check hourly slots from 9:00 AM to 5:00 PM (last slot starts at 5PM)
      for (let h = 9; h <= 17; h++) {
        const slot = new Date(current);
        slot.setHours(h, 0, 0, 0);

        // Safety: ensure we don't pick past dates
        if (slot <= new Date()) continue;

        // Check occupancy in DB
        // 1. Check existing confirmed interviews (Active/Scheduled status)
        const isInterviewed = await Interview.exists({
          scheduledDate: slot,
          status: { $in: ['Active', 'Scheduled'] }
        });

        // 2. Check other pending/confirmed reschedule requests
        const isRequested = !isInterviewed && await RescheduleRequest.exists({
          $or: [
            { requestedDate: slot, status: { $in: ['Pending', 'Processing', 'Action Required'] } },
            { confirmedDate: slot, status: 'Confirmed' }
          ]
        });

        if (!isInterviewed && !isRequested) {
          slots.push(slot.toISOString());
        }

        if (slots.length >= limit) break;
      }
    }
    
    // Next day
    current.setDate(current.getDate() + 1);
    current.setHours(9, 0, 0, 0);
    iterations++;
  }
  
  return slots;
};

// ─── Helper: Trigger n8n Reschedule Webhook ─────────────────────────────────
/**
 * Fires the n8n reschedule webhook.
 * Called only when HR approves a request.
 */
const triggerN8nReschedule = async (request) => {
  const webhookUrl = process.env.N8N_RESCHEDULE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('⚠️ N8N_RESCHEDULE_WEBHOOK_URL not defined. Skipping n8n trigger.');
    return false;
  }

  const interview = request.interviewId;
  const candidate = request.candidateId;
  const jobRole = interview.jobRole || interview.role || 'Position';

  // ─── Build a human-readable calendar event title ─────────────────────────
  // This is used by n8n's Google Calendar node as the event "Summary" / Title
  const calendarTitle = `Interview: ${candidate.name} – ${jobRole}`;
  const calendarDescription = [
    `Candidate : ${candidate.name}`,
    `Email     : ${candidate.email}`,
    `Role      : ${jobRole}`,
    `Link      : ${interview.interviewLink || 'N/A'}`,
    ``,
    `Rescheduled via HireAI Platform`,
  ].join('\n');

  // Ensure we have a valid email
  const candidateEmail = candidate.email || interview.candidateEmail || "";
  if (!candidateEmail) {
    console.warn(`⚠️ Warning: No candidate email found for request ${request._id}. n8n might fail to send emails.`);
  }

  const payload = {
    rescheduleId: request._id,
    interviewId: interview._id,
    candidateId: interview.interviewId,   // compatibility string ID
    candidateEmail: candidateEmail,
    candidateName: candidate.name,
    requestedDate: request.requestedDate,
    jobRole: jobRole,
    interviewLink: interview.interviewLink,
    confirmWebhookUrl: process.env.N8N_CONFIRM_WEBHOOK_URL,
    // ─── Google Calendar fields ────────────────────────────────────────
    // In your n8n Google Calendar node, set:
    //   Summary/Title  →  {{ $json.calendarTitle }}
    //   Description    →  {{ $json.calendarDescription }}
    calendarTitle,
    calendarDescription,
  };

  console.log('📤 Sending reschedule payload to n8n:', payload);
  await axios.post(webhookUrl, payload);
  console.log(`✅ N8N Reschedule Webhook triggered for request ${request._id}`);
  return true;
};

// ─── Helper: Send Rejection Email via Nodemailer (Gmail App Password) ───────
/**
 * Sends a rejection notification to the candidate via Nodemailer.
 * Uses Gmail + App Password — no EmailJS template needed.
 *
 * Required .env vars:
 *   NODEMAILER_EMAIL  – Gmail address used as sender
 *   NODEMAILER_PASS   – 16-char Gmail App Password
 */
const sendRejectionEmail = async (candidateEmail, candidateName, jobRole, requestedDate) => {
  const formattedDate = requestedDate
    ? new Date(requestedDate).toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    : 'your requested date';

  const year = new Date().getFullYear();
  const dashboardUrl = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL}/candidate/dashboard`
    : 'https://ai-talent-hub.vercel.app/candidate/dashboard';

  // ── Same design as the EmailJS template ─────────────────────────────────
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reschedule Request Update</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px; width:100%; border-radius:16px; overflow:hidden;
                       box-shadow:0 4px 24px rgba(0,0,0,0.10);">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); padding:40px 32px; text-align:center;">
              <div style="display:inline-block; background:rgba(255,255,255,0.15); border-radius:12px; padding:10px 14px; margin-bottom:16px;">
                <span style="font-size:24px;">&#129302;</span>
              </div>
              <h1 style="color:#ffffff; margin:0; font-size:26px; font-weight:800; letter-spacing:-0.5px;">HireAI Recruitment</h1>
              <p style="color:rgba(255,255,255,0.80); margin:8px 0 0; font-size:14px;">Interview Reschedule Update</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff; padding:36px 36px 28px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;">

              <p style="color:#374151; font-size:16px; margin:0 0 8px;">Dear <strong>${candidateName}</strong>,</p>
              <p style="color:#6b7280; font-size:15px; margin:0 0 24px; line-height:1.6;">
                Thank you for submitting a reschedule request for your
                <strong style="color:#374151;">${jobRole}</strong> interview.
                We have reviewed your request and have an update for you.
              </p>

              <!-- Alert Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #ef4444;
                             border-radius:10px; padding:18px 20px;">
                    <p style="color:#dc2626; font-weight:700; margin:0 0 8px; font-size:15px;">
                      &#9888;&#65039; &nbsp;Reschedule Request Not Approved
                    </p>
                    <p style="color:#7f1d1d; margin:0; font-size:14px; line-height:1.6;">
                      Unfortunately, your request to reschedule to
                      <strong>${formattedDate}</strong> has been reviewed
                      and could not be accommodated at this time.<br/>
                      Your <strong>original interview schedule remains in place</strong>.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; padding:18px 20px;">
                    <p style="color:#0369a1; font-weight:700; margin:0 0 8px; font-size:14px;">&#128197; &nbsp;What happens next?</p>
                    <ul style="color:#0c4a6e; font-size:14px; line-height:1.8; margin:0; padding-left:18px;">
                      <li>Your original interview date and time remain unchanged.</li>
                      <li>Log in to the <strong>Candidate Portal</strong> to view your schedule.</li>
                      <li>For urgent concerns, please contact us directly.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="color:#6b7280; font-size:14px; margin:0 0 28px; line-height:1.6;">
                We appreciate your understanding and look forward to your interview.
                Best of luck, <strong style="color:#374151;">${candidateName}</strong>!
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}"
                       style="display:inline-block;
                               background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
                               color:#ffffff; font-weight:700; font-size:15px;
                               text-decoration:none; padding:14px 36px; border-radius:10px;
                               box-shadow:0 4px 12px rgba(102,126,234,0.4);">
                      View My Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f9fafb; padding:20px 36px;
                       border:1px solid #e5e7eb; border-top:none;
                       border-radius:0 0 16px 16px; text-align:center;">
              <p style="color:#9ca3af; font-size:12px; margin:0;">
                &copy; ${year} HireAI &nbsp;&middot;&nbsp; AI-Powered Recruitment Platform
              </p>
              <p style="color:#d1d5db; font-size:11px; margin:6px 0 0;">
                This is an automated message. Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

  // ── Send via Nodemailer (Gmail App Password — no EmailJS template needed) ─
  return sendMailNodemailer(
    candidateEmail,
    `Update on Your Reschedule Request \u2013 ${jobRole}`,
    html
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create a new reschedule request (saves as Pending — does NOT call n8n)
// @route   POST /api/reschedule  |  POST /api/reschedule/request
// @access  Public (Candidate)
// Status guard: one active request per interview at a time.
// ─────────────────────────────────────────────────────────────────────────────
const createRescheduleRequest = async (req, res) => {
  console.log('📋 Create Reschedule Request Initiated (pending HR approval).');
  try {
    const { interviewId, candidateId, requestedDate, reason } = req.body;

    if (!interviewId || !candidateId || !requestedDate || !reason) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // ── 1. Validate the requested datetime is in the future ──────────────────
    const parsedDate = new Date(requestedDate);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: 'Invalid requestedDate format.' });
    }
    if (parsedDate <= new Date()) {
      return res.status(400).json({ message: 'Requested date must be in the future.' });
    }

    // ── 2. Duplicate guard ──────────────────────────────────────────────────
    // Block if there is already a Pending / Processing / Action Required request
    // for the SAME interview. Rejected / Confirmed requests don’t count.
    const ACTIVE_STATUSES = ['Pending', 'Processing', 'Action Required'];
    const existing = await RescheduleRequest.findOne({
      interviewId,
      status: { $in: ACTIVE_STATUSES },
    });

    if (existing) {
      console.warn(`⚠️ Duplicate reschedule blocked for interview ${interviewId}. Existing: ${existing._id} (${existing.status})`);
      return res.status(409).json({
        message: `You already have an active reschedule request for this interview (status: "${existing.status}"). Please wait for HR to process it before submitting another.`,
        existingRequestId: existing._id,
        existingStatus: existing.status,
      });
    }

    // ── 2.5 Candidate Collision Guard ──────────────────────────────────────
    // NEW: Prevent the candidate from double-booking themselves.
    // Check for other interviews or pending requests at the same time.
    const collisionTime = parsedDate;

    // 1. Check for other confirmed interviews at the same time
    const interviewCollision = await Interview.findOne({
      candidateId,
      _id: { $ne: interviewId }, // Must be a different interview
      scheduledDate: collisionTime,
      status: { $in: ['Active', 'Scheduled', 'Rescheduled'] }
    });

    if (interviewCollision) {
      const timeStr = collisionTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = collisionTime.toLocaleDateString('en-IN');
      return res.status(409).json({
        message: `Collision: You already have another interview (${interviewCollision.jobRole || 'Position'}) scheduled for ${dateStr} at ${timeStr}. Please choose a different slot.`,
      });
    }

    // 2. Check for other pending reschedule requests at the same time
    const requestCollision = await RescheduleRequest.findOne({
      candidateId,
      interviewId: { $ne: interviewId }, // Different interview
      requestedDate: collisionTime,
      status: { $in: ACTIVE_STATUSES }
    });

    if (requestCollision) {
      const timeStr = collisionTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = collisionTime.toLocaleDateString('en-IN');
      return res.status(409).json({
        message: `Collision: You have already submitted a reschedule request for another interview at ${dateStr} ${timeStr}. Please pick a different slot.`,
      });
    }

    // ── 2.7 Global Slot Occupancy Guard ──────────────────────────────────────
    // Check if ANY other candidate has a confirmed interview at this exact time.
    // This prevents multiple candidates from requesting the same slot if it's already "taken".
    const globalCollision = await Interview.findOne({
      scheduledDate: collisionTime,
      status: { $in: ['Active', 'Scheduled'] },
      _id: { $ne: interviewId }
    });

    if (globalCollision) {
      return res.status(409).json({
        message: `Slot Unavailable: This time slot is already booked by another candidate. Please choose a different time.`,
      });
    }

    // ── 3. Create the request ───────────────────────────────────────────────
    // Always start as Pending — HR must approve before n8n is triggered
    const request = await RescheduleRequest.create({
      interviewId,
      candidateId,
      requestedDate: parsedDate,   // Stored as proper Date object with time
      reason,
      status: 'Pending',
    });

    // Update interview status to indicate rescheduling is requested
    await Interview.findByIdAndUpdate(interviewId, { status: 'Rescheduled' });

    console.log(`📥 Reschedule request ${request._id} saved for ${parsedDate.toISOString()}. Awaiting HR approval.`);

    res.status(201).json({
      success: true,
      message: 'Reschedule request submitted. Awaiting HR approval.',
      data: request,
    });
  } catch (error) {
    console.error('Create Reschedule Error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    HR Approves a reschedule request → triggers n8n
// @route   POST /api/reschedule/:id/approve
// @access  Private (HR)
// ─────────────────────────────────────────────────────────────────────────────
const approveRescheduleRequest = async (req, res) => {
  try {
    let request = await RescheduleRequest.findById(req.params.id)
      .populate('candidateId interviewId');

    if (!request) {
      return res.status(404).json({ message: 'Reschedule request not found.' });
    }

    if (request.status !== 'Pending') {
      return res.status(400).json({
        message: `Cannot approve a request that is already "${request.status}".`,
      });
    }

    // Safety check for populated fields

    // Safety check for populated fields
    if (!request.interviewId || !request.candidateId) {
      console.warn(`⚠️ Cannot approve request ${request._id}: missing interview or candidate details.`);
      return res.status(422).json({
        message: 'This request is missing critical data (candidate or interview) and cannot be approved automatically.'
      });
    }

    request.status = 'Processing';
    await request.save();

    // Trigger n8n
    try {
      await triggerN8nReschedule(request);
    } catch (webhookError) {
      console.error('❌ Failed to trigger n8n webhook:', webhookError.message);
      // Fallback: mark as Approved without n8n automation
      request.status = 'Approved';
      request.n8nStatus = 'failed';
      await request.save();
      return res.status(207).json({
        success: true,
        message: 'Request approved but n8n automation failed. Please process manually.',
        data: request,
        n8nError: webhookError.message,
      });
    }

    res.json({
      success: true,
      message: 'Reschedule request approved. n8n automation triggered.',
      data: request,
    });
  } catch (error) {
    console.error('Approve Reschedule Error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    HR Rejects a reschedule request → sends EmailJS rejection email
// @route   POST /api/reschedule/:id/reject
// @access  Private (HR)
// ─────────────────────────────────────────────────────────────────────────────
const rejectRescheduleRequest = async (req, res) => {
  try {
    const request = await RescheduleRequest.findById(req.params.id)
      .populate('candidateId interviewId');

    if (!request) {
      return res.status(404).json({ message: 'Reschedule request not found.' });
    }

    if (request.status !== 'Pending') {
      return res.status(400).json({
        message: `Cannot reject a request that is already "${request.status}".`,
      });
    }

    // Mark as Rejected
    request.status = 'Rejected';
    await request.save();

    // Revert interview status to Active (original schedule stands) - Null check added
    if (request.interviewId && request.interviewId._id) {
      await Interview.findByIdAndUpdate(request.interviewId._id, { status: 'Active' });
    } else {
      console.warn(`⚠️ Request ${request._id} has no interviewId attached. Skipping interview status update.`);
    }

    // Send rejection email
    const candidate = request.candidateId;
    const interview = request.interviewId;

    let emailResult = { success: false };
    try {
      emailResult = await sendRejectionEmail(
        candidate.email,
        candidate.name,
        interview.jobRole || interview.role || 'the position',
        request.requestedDate,
        request.reason
      );
      if (emailResult.success) {
        console.log(`📧 Rejection email sent to ${candidate.email}`);
      } else {
        console.warn(`⚠️ Rejection email failed for ${candidate.email}:`, emailResult.error);
      }
    } catch (emailError) {
      console.error('❌ Email error during rejection:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Reschedule request rejected.',
      emailSent: emailResult.success,
      data: request,
    });
  } catch (error) {
    console.error('Reject Reschedule Error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Handle N8N Callback: Date Available → Confirm reschedule
// @route   POST /api/reschedule/confirm
// @access  Private (n8n Webhook via protectServer)
// ─────────────────────────────────────────────────────────────────────────────
const confirmReschedule = async (req, res) => {
  try {
    const { rescheduleId, confirmedDate } = req.body;

    if (!rescheduleId || !confirmedDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const request = await RescheduleRequest.findById(rescheduleId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Reschedule request not found' });
    }

    // Update request
    request.status = 'Confirmed';
    request.n8nStatus = 'confirmed';
    request.confirmedDate = new Date(confirmedDate);
    await request.save();

    // Update the interview with the new confirmed date
    const interview = await Interview.findById(request.interviewId);
    if (interview) {
      interview.status = 'Active';
      interview.scheduledDate = new Date(confirmedDate);
      // Extend expiry by 48 hours from the new date
      interview.expiresAt = new Date(new Date(confirmedDate).getTime() + 48 * 60 * 60 * 1000);
      await interview.save();
    }

    console.log(`✅ Reschedule Confirmed via N8N: ${rescheduleId} → ${confirmedDate}`);
    res.json({ success: true, message: 'Reschedule confirmed successfully' });

  } catch (error) {
    console.error('Confirm Reschedule Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Handle N8N Callback: Date Unavailable → Save alternative dates
// @route   POST /api/reschedule/pending
// @access  Private (n8n Webhook via protectServer)
// ─────────────────────────────────────────────────────────────────────────────
const pendingReschedule = async (req, res) => {
  try {
    const { rescheduleId, availableDates } = req.body;

    if (!rescheduleId) {
      return res.status(400).json({ success: false, message: 'Missing rescheduleId' });
    }

    // Populate so we can send a notification email
    const request = await RescheduleRequest.findById(rescheduleId)
      .populate('candidateId interviewId');
    if (!request) {
      return res.status(404).json({ success: false, message: 'Reschedule request not found' });
    }

    request.status = 'Action Required'; // Candidate needs to pick from alternatives
    request.n8nStatus = 'pending';

    // ── Dynamic Slot Generation ───────────────────────────────────────────
    // Instead of relying on potentially static/hardcoded dates from n8n,
    // we dynamically generate the next 5 available slots from our database.
    const dynamicSlots = await generateAvailableSlots(request.requestedDate, 5);
    
    // Use dynamic slots as primary, fallback to n8n provided dates if any
    let finalDates = dynamicSlots;
    if (!finalDates || finalDates.length === 0) {
      finalDates = availableDates;
      if (typeof availableDates === 'string') {
        try { finalDates = JSON.parse(availableDates); } catch (e) { /* ignore */ }
      }
    }
    
    request.availableDates = Array.isArray(finalDates) ? finalDates : [];
    await request.save();

    // ── Notify candidate that their requested date was NOT available ──────
    const candidate = request.candidateId;
    const interview = request.interviewId;
    const jobRole = interview.jobRole || interview.role || 'Position';
    const requestedDateStr = new Date(request.requestedDate).toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const year = new Date().getFullYear();
    const dashboardUrl = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/candidate/dashboard`
      : 'https://ai-talent-hub.vercel.app/candidate/dashboard';

    if (candidate?.email) {
      // Build the list of alternative dates
      const dateListItems = (request.availableDates || []).map(d =>
        `<li style="margin-bottom:8px;">
                     <strong>${new Date(d).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
                 </li>`
      ).join('');

      const alternateDatesHtml = (request.availableDates || []).length > 0
        ? `<div style="background:#fff7ed; border:1px solid #fed7aa; border-left:4px solid #f97316; border-radius:10px; padding:18px 20px; margin-bottom:24px;">
                        <p style="color:#c2410c; font-weight:700; margin:0 0 12px; font-size:15px;">
                          &#128197; &nbsp;Alternative Slots Available
                        </p>
                        <p style="color:#7c2d12; margin:0 0 12px; font-size:14px;">
                          Unfortunately, <strong>${requestedDateStr}</strong> is already booked.
                          However, the following times are available:
                        </p>
                        <ul style="color:#7c2d12; font-size:14px; line-height:1.6; margin:0; padding-left:20px;">
                           ${dateListItems}
                        </ul>
                        <p style="color:#7c2d12; margin:12px 0 0; font-size:13px;">
                          Please log in to your dashboard to confirm one of these slots.
                        </p>
                   </div>`
        : `<div style="background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #ef4444; border-radius:10px; padding:18px 20px; margin-bottom:24px;">
                        <p style="color:#dc2626; font-weight:700; margin:0 0 8px;">No Slots Available</p>
                        <p style="color:#7f1d1d; margin:0; font-size:14px;">Please contact HR directly to arrange a suitable time.</p>
                   </div>`;

      // Rich HTML Template (matching rejection email style)
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reschedule Options</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.10);">
          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); padding:40px 32px; text-align:center;">
              <div style="display:inline-block; background:rgba(255,255,255,0.15); border-radius:12px; padding:10px 14px; margin-bottom:16px;">
                <span style="font-size:24px;">&#128337;</span>
              </div>
              <h1 style="color:#ffffff; margin:0; font-size:26px; font-weight:800; letter-spacing:-0.5px;">HireAI Recruitment</h1>
              <p style="color:rgba(255,255,255,0.80); margin:8px 0 0; font-size:14px;">Reschedule Update</p>
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="background:#ffffff; padding:36px 36px 28px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;">
              <p style="color:#374151; font-size:16px; margin:0 0 8px;">Dear <strong>${candidate.name}</strong>,</p>
              <p style="color:#6b7280; font-size:15px; margin:0 0 24px; line-height:1.6;">
                Regarding your reschedule request for the <strong style="color:#374151;">${jobRole}</strong> interview:
              </p>

              ${alternateDatesHtml}

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" style="display:inline-block; background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); color:#ffffff; font-weight:700; font-size:15px; text-decoration:none; padding:14px 36px; border-radius:10px; box-shadow:0 4px 12px rgba(102,126,234,0.4);">
                      Select a New Time &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#9ca3af; font-size:13px; text-align:center; margin-top:20px;">
                (Log in to your dashboard to confirm)
              </p>
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background:#f9fafb; padding:20px 36px; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 16px 16px; text-align:center;">
              <p style="color:#9ca3af; font-size:12px; margin:0;">&copy; ${year} HireAI &nbsp;&middot;&nbsp; AI-Powered Recruitment Platform</p>
              <p style="color:#d1d5db; font-size:11px; margin:6px 0 0;">This is an automated message. Please do not reply directly.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      try {
        // Use Nodemailer instead of EmailJS
        await sendMailNodemailer(
          candidate.email,
          `Action Required: Alternative Interview Dates – ${jobRole}`,
          html
        );
        console.log(`📧 Date-unavailable (Alternative Options) email sent to ${candidate.email} via Nodemailer`);
      } catch (emailErr) {
        console.warn('⚠️ Could not send date-unavailable email:', emailErr.message);
      }
    }

    console.log(`ℹ️ Reschedule Pending – Date occupied, alternatives stored: ${rescheduleId}`);
    res.json({ success: true, message: 'Reschedule alternatives saved and candidate notified.' });

  } catch (error) {
    console.error('Pending Reschedule Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all reschedule requests
// @route   GET /api/reschedule
// @access  Private (HR)
// ─────────────────────────────────────────────────────────────────────────────
const getRescheduleRequests = async (req, res) => {
  try {
    const requests = await RescheduleRequest.find({})
      .populate('interviewId')
      .populate('candidateId')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get status of a specific reschedule request
// @route   GET /api/reschedule/:id/status
// @access  Public / Candidate
// ─────────────────────────────────────────────────────────────────────────────
const getRescheduleStatus = async (req, res) => {
  try {
    const request = await RescheduleRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }
    res.json({
      status: request.status,
      n8nStatus: request.n8nStatus,
      availableDates: request.availableDates,
      confirmedDate: request.confirmedDate,
      interviewId: request.interviewId,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Generic status update (kept as fallback for manual overrides)
// @route   PUT /api/reschedule/:id
// @access  Private (HR)
// ─────────────────────────────────────────────────────────────────────────────
const updateRescheduleStatus = async (req, res) => {
  const { status } = req.body;
  try {
    const request = await RescheduleRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }
    request.status = status;
    await request.save();
    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get Latest Active Reschedule Request by Interview ID
// @route   GET /api/reschedule/interview/:interviewId
// @access  Public / Candidate
// ─────────────────────────────────────────────────────────────────────────────
const getRescheduleByInterview = async (req, res) => {
  try {
    // Find the most recent request for this interview
    const requests = await RescheduleRequest.find({
      interviewId: req.params.interviewId
    })
      .sort({ createdAt: -1 }) // Get latest first
      .limit(1);

    if (!requests || requests.length === 0) {
      return res.status(404).json({ message: 'No reschedule requests found for this interview.' });
    }

    const latest = requests[0];
    res.json({
      success: true,
      data: latest
    });
  } catch (error) {
    console.error("Get Reschedule By Interview Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Candidate Confirms an Alternative Date
// @route   POST /api/reschedule/:id/candidate-confirm
// @access  Public / Candidate
// ─────────────────────────────────────────────────────────────────────────────
const confirmRescheduleCandidate = async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmedDate } = req.body;

    if (!confirmedDate) {
      return res.status(400).json({ success: false, message: 'Missing confirmedDate' });
    }

    const request = await RescheduleRequest.findById(id).populate('interviewId candidateId');
    if (!request) {
      return res.status(404).json({ success: false, message: 'Reschedule request not found' });
    }

    // Validate status
    if (request.status !== 'Action Required') {
      return res.status(400).json({
        success: false,
        message: `Cannot confirm request in status "${request.status}".`
      });
    }

    // Update request
    request.status = 'Confirmed';
    request.n8nStatus = 'confirmed';
    request.confirmedDate = new Date(confirmedDate);
    await request.save();

    // Update the interview with the new confirmed date
    const interview = request.interviewId;
    if (interview) {
      interview.status = 'Active';
      interview.scheduledDate = new Date(confirmedDate);
      // Extend expiry by 48 hours from the new date
      interview.expiresAt = new Date(new Date(confirmedDate).getTime() + 48 * 60 * 60 * 1000);
      await interview.save();
    }

    // ── 1. Trigger n8n Webhook (Create Google Calendar Event) ────────────────
    // We trigger n8n via POST. n8n workflow has been updated to accept POST and read from body.
    const n8nConfirmUrl = process.env.N8N_CONFIRM_WEBHOOK_URL;
    if (n8nConfirmUrl) {
      try {
        const payload = {
          rescheduleId: request._id,
          interviewId: interview._id,
          date: confirmedDate,
          email: request.candidateId.email,
          name: request.candidateId.name,
          role: interview.jobRole || interview.role
        };
        await axios.post(n8nConfirmUrl, payload);
        console.log(`✅ N8N Confirmation Webhook triggered for ${request._id}`);
      } catch (webhookErr) {
        console.warn('⚠️ Failed to trigger n8n confirmation webhook:', webhookErr.message);
      }
    } else {
      console.warn('⚠️ N8N_CONFIRM_WEBHOOK_URL not set. Skipping calendar event creation.');
    }

    // ── 2. Send Rich Confirmation Email ─────────────────────────────────────
    if (request.candidateId && request.candidateId.email) {
      const formattedDate = new Date(confirmedDate).toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const dashboardUrl = process.env.FRONTEND_URL || 'http://localhost:6060/candidate/dashboard';
      const year = new Date().getFullYear();

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reschedule Confirmed</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px; width:100%; border-radius:16px; overflow:hidden;
                      box-shadow:0 4px 24px rgba(0,0,0,0.10);">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%); padding:40px 32px; text-align:center;">
              <div style="display:inline-block; background:rgba(255,255,255,0.2); border-radius:12px; padding:10px 14px; margin-bottom:16px;">
                <span style="font-size:24px;">&#9989;</span>
              </div>
              <h1 style="color:#ffffff; margin:0; font-size:26px; font-weight:800; letter-spacing:-0.5px;">HireAI Recruitment</h1>
              <p style="color:rgba(255,255,255,0.9); margin:8px 0 0; font-size:14px;">Reschedule Confirmed</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff; padding:36px 36px 28px; border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb;">

              <p style="color:#374151; font-size:16px; margin:0 0 8px;">Hi <strong>${request.candidateId.name}</strong>,</p>
              <p style="color:#6b7280; font-size:15px; margin:0 0 24px; line-height:1.6;">
                Great news! Your reschedule request for the <strong style="color:#374151;">${interview.jobRole}</strong> position has been successfully confirmed.
              </p>

              <!-- Success Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#ecfdf5; border:1px solid #d1fae5; border-left:4px solid #10b981;
                             border-radius:10px; padding:18px 20px;">
                    <p style="color:#047857; font-weight:700; margin:0 0 8px; font-size:15px;">
                      &#128197; &nbsp;New Interview Time
                    </p>
                    <p style="color:#065f46; margin:0; font-size:16px; font-weight:600;">
                      ${formattedDate}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="color:#6b7280; font-size:14px; margin:0 0 28px; line-height:1.6;">
                We have updated your schedule. Please ensure you are ready 5 minutes before the start time.
                Good luck with your interview!
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}"
                       style="display:inline-block;
                              background:linear-gradient(135deg,#10b981 0%,#059669 100%);
                              color:#ffffff; font-weight:700; font-size:15px;
                              text-decoration:none; padding:14px 36px; border-radius:10px;
                              box-shadow:0 4px 12px rgba(16,185,129,0.4);">
                      Go to Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f9fafb; padding:20px 36px;
                       border:1px solid #e5e7eb; border-top:none;
                       border-radius:0 0 16px 16px; text-align:center;">
              <p style="color:#9ca3af; font-size:12px; margin:0;">
                &copy; ${year} HireAI &nbsp;&middot;&nbsp; AI-Powered Recruitment Platform
              </p>
              <p style="color:#d1d5db; font-size:11px; margin:6px 0 0;">
                This is an automated message. Please do not reply directly to this email.
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
        request.candidateId.email,
        `Interview Confirmed – ${interview.jobRole}`,
        html
      );
    }

    console.log(`✅ Reschedule Confirmed by Candidate: ${id} → ${confirmedDate}`);
    res.json({ success: true, message: 'Reschedule confirmed successfully' });

  } catch (error) {
    console.error('Candidate Confirm Reschedule Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getRescheduleRequests,
  createRescheduleRequest,
  approveRescheduleRequest,
  rejectRescheduleRequest,
  updateRescheduleStatus,
  confirmReschedule,
  pendingReschedule,
  getRescheduleStatus,
  getRescheduleByInterview,
  confirmRescheduleCandidate
};
