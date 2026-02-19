# Visual Flowchart - Backend Integration with n8n
## For Anti-Gravity Team

---

## 🎨 MAIN INTEGRATION FLOW

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPLETE SYSTEM FLOW                             │
└─────────────────────────────────────────────────────────────────────┘


    👤 CANDIDATE                    🖥️  YOUR BACKEND               🤖 N8N WORKFLOW
    (Frontend)                      (Anti-Gravity builds)          (Already exists)

        │                                   │                             │
        │  1. Click "Reschedule"           │                             │
        │  Enter new date                  │                             │
        │                                   │                             │
        ├──────────────────────────────────>│                             │
        │  POST /api/reschedule/request    │                             │
        │  {interviewId, requestedDate}    │                             │
        │                                   │                             │
        │                                   │  2. Validate request        │
        │                                   │     Check auth              │
        │                                   │     Check interview exists  │
        │                                   │                             │
        │                                   │  3. Save to database        │
        │                                   │     INSERT INTO             │
        │                                   │     reschedule_requests     │
        │                                   │                             │
        │                                   │                             │
        │                                   │  4. Call n8n webhook        │
        │                                   ├────────────────────────────>│
        │                                   │  POST /webhook/reschedule-  │
        │                                   │       interview              │
        │                                   │  {rescheduleId,             │
        │                                   │   candidateEmail,           │
        │                                   │   requestedDate...}         │
        │                                   │                             │
        │                                   │                             │  5. Check Google Calendar
        │                                   │                             │     Is requestedDate free?
        │                                   │                             │
        │                                   │                             ├──────┐
        │                                   │                             │      │
        │  6. Return immediate response    │                             │      │
        │<──────────────────────────────────┤                             │      │
        │  {success: true,                 │                             │      │
        │   status: "processing"}          │                             │      │
        │                                   │                             │      │
        │  7. Show message:                │                             │      │
        │  "Request submitted,             │                             │      │
        │   check your email"              │                             │      │
        │                                   │                             │      │
        │                                   │                             │      │
        │                                   │                    ┌────────┴──────┴─────────┐
        │                                   │                    │                          │
        │                                   │              YES - Available          NO - Not Available
        │                                   │                    │                          │
        │                                   │                    ▼                          ▼
        │                                   │          Create calendar event      Generate 5 alternative
        │                                   │          Send confirmation email    dates & send email
        │                                   │                    │                          │
        │                                   │                    │                          │
        │                                   │  8. Webhook Back   │                          │
        │                                   │<───────────────────┤                          │
        │                                   │  POST /api/                                   │
        │                                   │  reschedule/confirm│                          │
        │                                   │  {status:"confirmed│                          │
        │                                   │   confirmedDate}   │                          │
        │                                   │                    │                          │
        │                                   │  9. Update DB      │                          │
        │                                   │     status =       │                          │
        │                                   │     'confirmed'    │                          │
        │                                   │                    │                          │
        │                                   │                    │         OR               │
        │                                   │                    │                          │
        │                                   │  8. Webhook Back   │                          │
        │                                   │<────────────────────────────────────────────--┤
        │                                   │  POST /api/                                   │
        │                                   │  reschedule/pending                           │
        │                                   │  {status:"pending",                           │
        │                                   │   availableDates:[]}                          │
        │                                   │                                               │
        │                                   │  9. Update DB                                 │
        │                                   │     status = 'pending'                        │
        │                                   │     save alternative dates                    │
        │                                   │                                               │
        │                                   │                                               │
        │  10. Candidate receives email    │                                               │
        │<─────────────────────────────────────────────────────────────────────────────────┤
        │      from n8n with:              │                                               │
        │      - Confirmation OR           │                                               │
        │      - 5 clickable date options  │                                               │
        │                                   │                                               │
        │  (If dates unavailable)          │                                               │
        │  11. Click alternative date link │                                               │
        │────────────────────────────────────────────────────────────────────────────────>│
        │      https://n8n.com/webhook/    │                                               │
        │      confirm-date?date=...       │                                               │
        │                                   │                                               │
        │                                   │                             12. Create event  │
        │                                   │                                 for selected  │
        │                                   │                                 date          │
        │                                   │                                               │
        │                                   │  13. Final webhook                            │
        │                                   │<──────────────────────────────────────────────┤
        │                                   │      POST /api/reschedule/confirm             │
        │                                   │      {status:"confirmed",                     │
        │                                   │       confirmedDate: selectedDate}            │
        │                                   │                                               │
        │                                   │  14. Update DB                                │
        │                                   │      final confirmed date                     │
        │                                   │                                               │
        │  15. Final email confirmation    │                                               │
        │<─────────────────────────────────────────────────────────────────────────────────┤
        │      "Interview confirmed!"      │                                               │
        │                                   │                                               │

        ✅ DONE                            ✅ DONE                                      ✅ DONE
```

---

## 🔄 SIMPLIFIED 3-STEP VIEW

```
┌──────────────────────────────────────────────────────────────────┐
│                     SIMPLE 3-STEP FLOW                           │
└──────────────────────────────────────────────────────────────────┘

STEP 1: Receive & Forward
┌─────────────────────────────┐
│  Frontend → Your Backend    │
│                             │
│  Actions:                   │
│  • Receive request          │
│  • Validate                 │
│  • Save to DB               │
│  • Call n8n                 │
│  • Return "processing"      │
└─────────────────────────────┘
              ↓
STEP 2: n8n Does the Work
┌─────────────────────────────┐
│  n8n Workflow               │
│                             │
│  Actions:                   │
│  • Check calendar           │
│  • Create events            │
│  • Send emails              │
│  • Decide outcome           │
└─────────────────────────────┘
              ↓
STEP 3: Receive Result
┌─────────────────────────────┐
│  n8n → Your Backend         │
│                             │
│  Actions:                   │
│  • Receive webhook          │
│  • Update database          │
│  • Done!                    │
└─────────────────────────────┘
```

---

## 📊 DATA FLOW DIAGRAM

```
┌──────────────────────────────────────────────────────────────────┐
│                    WHAT DATA GOES WHERE                          │
└──────────────────────────────────────────────────────────────────┘


Frontend sends:                      You send to n8n:
┌─────────────────────┐             ┌──────────────────────────┐
│ {                   │             │ {                        │
│   interviewId,      │──────┐      │   rescheduleId,          │
│   requestedDate,    │      │      │   interviewId,           │
│   reason            │      │      │   candidateEmail,        │
│ }                   │      │      │   candidateName,         │
└─────────────────────┘      │      │   requestedDate,         │
                             │      │   jobRole                │
                             ▼      │ }                        │
                     ┌──────────────┴┐                         │
                     │  YOUR BACKEND  │─────────────────────────┘
                     │                │
                     │  Add from DB:  │
                     │  • rescheduleId│      
                     │  • email       │      n8n sends back:
                     │  • name        │      ┌────────────────────────┐
                     │  • role        │      │ Option A (Available):  │
                     └────────────────┘      │ {                      │
                             ▲               │   status: "confirmed", │
                             │               │   confirmedDate        │
                             │               │ }                      │
                             │               │                        │
                             │               │ Option B (Unavailable):│
                             │               │ {                      │
                             └───────────────│   status: "pending",   │
                                             │   availableDates: []   │
                                             │ }                      │
                                             └────────────────────────┘
```

---

## 🎯 YOUR BACKEND'S RESPONSIBILITIES

```
┌──────────────────────────────────────────────────────────────────┐
│              WHAT ANTI-GRAVITY TEAM MUST BUILD                   │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 1. ENDPOINT: POST /api/reschedule/request                       │
├─────────────────────────────────────────────────────────────────┤
│ Receives: Frontend request                                      │
│ Does:                                                           │
│   ✓ Authenticate user                                          │
│   ✓ Validate interview exists                                  │
│   ✓ Generate rescheduleId                                      │
│   ✓ INSERT into reschedule_requests table                     │
│   ✓ GET candidate details from interviews table               │
│   ✓ Make HTTP POST to n8n webhook                             │
│   ✓ Return success response to frontend                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. ENDPOINT: POST /api/reschedule/confirm                       │
├─────────────────────────────────────────────────────────────────┤
│ Receives: n8n webhook (date confirmed)                         │
│ Does:                                                           │
│   ✓ Validate webhook is from n8n (check API key)              │
│   ✓ UPDATE reschedule_requests SET status='confirmed'         │
│   ✓ UPDATE interviews SET scheduled_date=confirmedDate        │
│   ✓ Return success response to n8n                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 3. ENDPOINT: POST /api/reschedule/pending                       │
├─────────────────────────────────────────────────────────────────┤
│ Receives: n8n webhook (date unavailable, alternatives sent)    │
│ Does:                                                           │
│   ✓ Validate webhook is from n8n                              │
│   ✓ UPDATE reschedule_requests SET status='pending'           │
│   ✓ UPDATE reschedule_requests SET available_dates=JSON       │
│   ✓ Return success response to n8n                            │
│   (Then wait for candidate to click date link)                │
│   (n8n will call /confirm endpoint when candidate selects)    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 4. ENDPOINT: GET /api/reschedule/:rescheduleId/status          │
├─────────────────────────────────────────────────────────────────┤
│ Receives: Frontend polling request                             │
│ Does:                                                           │
│   ✓ SELECT * FROM reschedule_requests WHERE id=rescheduleId   │
│   ✓ Return current status to frontend                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ DATABASE OPERATIONS

```
┌──────────────────────────────────────────────────────────────────┐
│                   DATABASE CHANGES NEEDED                        │
└──────────────────────────────────────────────────────────────────┘

When candidate submits request:
┌────────────────────────────────────────┐
│ INSERT INTO reschedule_requests        │
│ (                                      │
│   id = generated_uuid,                 │
│   interview_id = from_request,         │
│   candidate_email = from_interviews,   │
│   candidate_name = from_interviews,    │
│   job_role = from_interviews,          │
│   original_date = current_date,        │
│   requested_date = from_request,       │
│   status = 'processing',               │
│   created_at = NOW()                   │
│ )                                      │
└────────────────────────────────────────┘

When n8n confirms date:
┌────────────────────────────────────────┐
│ UPDATE reschedule_requests             │
│ SET                                    │
│   status = 'confirmed',                │
│   confirmed_date = from_webhook,       │
│   n8n_status = 'confirmed',            │
│   processed_at = NOW()                 │
│ WHERE id = rescheduleId                │
│                                        │
│ UPDATE interviews                      │
│ SET                                    │
│   scheduled_date = confirmed_date      │
│ WHERE id = interviewId                 │
└────────────────────────────────────────┘

When n8n sends alternatives:
┌────────────────────────────────────────┐
│ UPDATE reschedule_requests             │
│ SET                                    │
│   status = 'pending',                  │
│   n8n_status = 'pending',              │
│   available_dates = JSON_array,        │
│   processed_at = NOW()                 │
│ WHERE id = rescheduleId                │
└────────────────────────────────────────┘
```

---

## 🔐 SECURITY CHECKLIST

```
┌──────────────────────────────────────────────────────────────────┐
│                    SECURITY REQUIREMENTS                         │
└──────────────────────────────────────────────────────────────────┘

✓ Endpoint 1 (/api/reschedule/request):
  └─ Check: User authentication (JWT/session)
  └─ Check: User owns the interview
  └─ Check: Interview is not cancelled
  └─ Check: Date is in future

✓ Endpoints 2 & 3 (/confirm, /pending):
  └─ Check: Request has valid API key in header
  └─ Check: API key matches your stored secret
  └─ Check: rescheduleId exists in database
  └─ Reject: If any validation fails

✓ Rate Limiting:
  └─ Limit: Max 5 reschedule requests per candidate per day
  └─ Limit: Max 100 webhook calls per minute from n8n

✓ Environment Variables:
  └─ Never hardcode: n8n URL, API keys, secrets
  └─ Store in: .env file or environment config
  └─ Different keys: for staging vs production
```

---

## ⚡ QUICK IMPLEMENTATION GUIDE

```
┌──────────────────────────────────────────────────────────────────┐
│            STEP-BY-STEP IMPLEMENTATION ORDER                     │
└──────────────────────────────────────────────────────────────────┘

DAY 1: Database
├─ Hour 1-2: Create reschedule_requests table
├─ Hour 3-4: Add indexes and test queries
└─ Hour 5-6: Write migration scripts

DAY 2: Core Endpoints
├─ Hour 1-4: Build POST /api/reschedule/request
│            (Receive from frontend, call n8n)
├─ Hour 5-8: Build POST /api/reschedule/confirm
│            (Receive from n8n, update DB)
└─ Hour 9-12: Build POST /api/reschedule/pending
             (Receive from n8n, save alternatives)

DAY 3: Testing & Polish
├─ Hour 1-4: Add webhook authentication
├─ Hour 5-8: Add error handling
├─ Hour 9-12: Test all flows end-to-end
└─ Hour 13-16: Fix bugs, add logging

DAY 4: Deploy
├─ Hour 1-2: Deploy to staging
├─ Hour 3-6: Test in staging environment
└─ Hour 7-8: Deploy to production
```

---

## 📞 INTEGRATION CHECKLIST

```
┌──────────────────────────────────────────────────────────────────┐
│          BEFORE STARTING - GET THESE FROM YOUR TEAM              │
└──────────────────────────────────────────────────────────────────┘

□ n8n webhook URL
  Example: https://n8n.yourcompany.com/webhook/reschedule-interview

□ API secret key for webhook authentication
  Generate a random 32+ character string

□ n8n team contact person
  Who to ask if n8n has issues

□ Email templates review
  Check emails n8n sends look good

□ Google Calendar access
  Ensure n8n can read/write to calendar

□ Test environment
  Staging n8n URL for testing
```

---

## ✅ DEFINITION OF DONE

```
┌──────────────────────────────────────────────────────────────────┐
│             INTEGRATION IS COMPLETE WHEN:                        │
└──────────────────────────────────────────────────────────────────┘

□ Candidate can submit reschedule request from frontend
□ Request is saved to database correctly
□ Backend calls n8n webhook successfully
□ n8n calls /confirm endpoint when date available
□ n8n calls /pending endpoint when date unavailable
□ Database is updated with confirmed dates
□ Database is updated with alternative dates
□ Candidate receives confirmation emails
□ Candidate receives alternative date emails
□ Candidate can click alternative date links
□ Final confirmation works after clicking link
□ Frontend shows updated interview dates
□ All error scenarios return proper responses
□ Webhook authentication is working
□ Production deployment is successful
□ Monitoring and logging is in place
```

---

**END OF VISUAL FLOWCHART**

This document provides visual representation of the integration workflow
without any code - perfect for Anti-Gravity team to understand the flow!
