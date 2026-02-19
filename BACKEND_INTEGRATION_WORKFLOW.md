# Backend Integration Workflow - n8n Interview Reschedule System
## Documentation for Anti-Gravity Team (No Code - Workflow Only)

---

## 📋 DOCUMENT PURPOSE

This document provides the **complete workflow logic** for integrating the n8n interview reschedule automation with your HR backend. 

**No code included** - just the step-by-step flow that your team needs to implement.

---

## 🎯 SYSTEM OVERVIEW

### Current Flow (Before n8n)
```
Step 1: Candidate submits reschedule request
Step 2: HR manually checks calendar
Step 3: HR manually sends email to candidate
Step 4: HR manually updates interview date
```

### New Flow (With n8n)
```
Step 1: Candidate submits reschedule request
Step 2: Backend automatically triggers n8n workflow
Step 3: n8n checks calendar, creates event, sends emails
Step 4: n8n notifies backend of result
Step 5: Backend updates database automatically
```

---

## 📊 COMPLETE INTEGRATION ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                    SYSTEM ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────┘

                    ┌──────────────┐
                    │   Frontend   │
                    │ (Candidate)  │
                    └──────┬───────┘
                           │
                   User clicks "Reschedule"
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │         YOUR HR BACKEND                  │
        │  (This is what Anti-Gravity implements)  │
        └──────────────────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
   [Database]                          [n8n Webhook]
   Save request                        Trigger workflow
        │                                     │
        │                                     ▼
        │                          ┌────────────────────┐
        │                          │   n8n WORKFLOW     │
        │                          │  (Already built)   │
        │                          └─────────┬──────────┘
        │                                    │
        │                          ┌─────────┴─────────┐
        │                          │                   │
        │                    Checks Calendar    Sends Emails
        │                          │                   │
        │                          ▼                   ▼
        │                    Creates Event      To Candidate
        │                          │
        │                          │
        │              ┌───────────┴───────────┐
        │              │                       │
        │         Date Available         Date NOT Available
        │              │                       │
        │              ▼                       ▼
        │      Calls /confirm           Calls /pending
        │      endpoint                 endpoint
        │              │                       │
        └──────────────┴───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │      YOUR HR BACKEND                 │
        │   (Receives callback from n8n)       │
        │   Updates database with result       │
        └──────────────────────────────────────┘
```

---

## 🗄️ DATABASE REQUIREMENTS

### What Anti-Gravity Team Needs to Add

#### New Table: `reschedule_requests`

**Purpose:** Track all reschedule requests and their status

**Required Columns:**
| Column Name | Type | Description |
|------------|------|-------------|
| id | String (Primary Key) | Unique reschedule request ID |
| interview_id | String (Foreign Key) | Links to interviews table |
| candidate_email | String | Candidate's email |
| candidate_name | String | Candidate's full name |
| job_role | String | Position being interviewed for |
| original_date | DateTime | Current scheduled interview date |
| requested_date | DateTime | Date candidate wants to reschedule to |
| confirmed_date | DateTime (Nullable) | Final confirmed date (after n8n processes) |
| status | Enum | Current status: 'pending', 'processing', 'confirmed', 'failed' |
| n8n_status | String (Nullable) | Status returned from n8n: 'confirmed' or 'pending' |
| available_dates | JSON (Nullable) | Alternative dates if requested date unavailable |
| reason | Text (Nullable) | Why candidate wants to reschedule |
| created_at | DateTime | When request was created |
| updated_at | DateTime | Last update time |

**Indexes Needed:**
- Index on `interview_id`
- Index on `status`
- Index on `created_at`

---

## 🔌 API ENDPOINTS REQUIRED

### Overview

Anti-Gravity team needs to create **4 API endpoints**:

```
┌────────────────────────────────────────────────────────────┐
│                  API ENDPOINTS NEEDED                      │
└────────────────────────────────────────────────────────────┘

YOUR BACKEND ENDPOINTS (What you create):
├── 1. POST /api/reschedule/request
│      Purpose: Receive reschedule request from frontend
│      Called by: Your frontend/candidate
│      Action: Save to DB, call n8n webhook
│
├── 2. POST /api/reschedule/confirm
│      Purpose: Receive confirmation from n8n (date available)
│      Called by: n8n workflow
│      Action: Update DB, mark as confirmed
│
├── 3. POST /api/reschedule/pending
│      Purpose: Receive notification from n8n (date NOT available)
│      Called by: n8n workflow
│      Action: Update DB with alternative dates
│
└── 4. GET /api/reschedule/:rescheduleId/status
       Purpose: Frontend checks status of reschedule request
       Called by: Your frontend
       Action: Return current status from DB

N8N ENDPOINTS (Already exist - you just call them):
└── POST https://your-n8n-instance.com/webhook/reschedule-interview
    Purpose: Trigger the reschedule workflow
    Called by: Your backend (#1 above)
```

---

## 🔄 DETAILED WORKFLOW STEPS

### FLOW 1: Candidate Submits Reschedule Request

```
┌────────────────────────────────────────────────────────────┐
│  FLOW 1: Initial Reschedule Request                       │
└────────────────────────────────────────────────────────────┘

Step 1: Frontend Sends Request
├─ Candidate clicks "Reschedule Interview"
├─ Frontend collects: interviewId, requestedDate, reason
└─ Frontend calls: POST /api/reschedule/request

Step 2: Your Backend Receives Request
├─ Validate authentication (is this the right candidate?)
├─ Validate interviewId exists in database
├─ Validate requestedDate is in the future
└─ Continue to Step 3

Step 3: Your Backend Saves to Database
├─ Generate unique rescheduleId (UUID)
├─ Insert record into reschedule_requests table:
│   └─ id = rescheduleId
│   └─ interview_id = from request
│   └─ candidate_email = from interviews table
│   └─ candidate_name = from interviews table
│   └─ job_role = from interviews table
│   └─ original_date = current interview date
│   └─ requested_date = from request
│   └─ status = 'processing'
│   └─ reason = from request
└─ Continue to Step 4

Step 4: Your Backend Calls n8n Webhook
├─ Prepare payload:
│   {
│     "rescheduleId": "generated-uuid",
│     "interviewId": "from-request",
│     "candidateEmail": "from-database",
│     "candidateName": "from-database",
│     "requestedDate": "2024-03-20T10:00:00.000Z",
│     "jobRole": "from-database"
│   }
├─ Make HTTP POST request to:
│   URL: https://your-n8n-instance.com/webhook/reschedule-interview
│   Method: POST
│   Headers: Content-Type: application/json
│   Body: Above payload
└─ Continue to Step 5

Step 5: n8n Processes Request (Automatic)
├─ n8n receives webhook
├─ n8n checks Google Calendar for availability
├─ n8n makes decision:
│   ├─ If date AVAILABLE → Go to Flow 2
│   └─ If date NOT AVAILABLE → Go to Flow 3
└─ (Your backend waits for callback)

Step 6: Your Backend Returns Response to Frontend
├─ Don't wait for n8n to finish (async)
├─ Return immediate response:
│   {
│     "success": true,
│     "message": "Request submitted, you'll receive email shortly",
│     "rescheduleId": "generated-uuid",
│     "status": "processing"
│   }
└─ Frontend shows success message to candidate
```

---

### FLOW 2: n8n Confirms Date is Available

```
┌────────────────────────────────────────────────────────────┐
│  FLOW 2: Date Available - Immediate Confirmation          │
└────────────────────────────────────────────────────────────┘

Step 1: n8n Completes Processing
├─ n8n checked calendar → date IS available
├─ n8n created calendar event
├─ n8n sent confirmation email to candidate
└─ Continue to Step 2

Step 2: n8n Calls Your Backend
├─ n8n makes HTTP POST to: /api/reschedule/confirm
├─ Payload sent:
│   {
│     "rescheduleId": "original-uuid",
│     "interviewId": "original-id",
│     "status": "confirmed",
│     "confirmedDate": "2024-03-20T10:00:00.000Z",
│     "candidateEmail": "candidate@example.com"
│   }
└─ Continue to Step 3

Step 3: Your Backend Receives Callback
├─ Endpoint: POST /api/reschedule/confirm
├─ Validate webhook is from n8n (check API key/signature)
└─ Continue to Step 4

Step 4: Your Backend Updates Database
├─ Find record: WHERE reschedule_requests.id = rescheduleId
├─ Update record:
│   └─ status = 'confirmed'
│   └─ n8n_status = 'confirmed'
│   └─ confirmed_date = confirmedDate from payload
│   └─ processed_at = NOW()
├─ Also update main interviews table:
│   └─ scheduled_date = confirmedDate
│   └─ status = 'scheduled'
└─ Continue to Step 5

Step 5: Your Backend Sends Response to n8n
├─ Return success response:
│   {
│     "success": true,
│     "message": "Status updated successfully"
│   }
└─ END OF FLOW 2

What Candidate Sees:
├─ Candidate receives email from n8n: "Interview confirmed for [date]"
├─ Candidate sees updated date in your portal
└─ Calendar invite sent automatically
```

---

### FLOW 3: n8n Reports Date NOT Available

```
┌────────────────────────────────────────────────────────────┐
│  FLOW 3: Date NOT Available - Alternative Dates Offered   │
└────────────────────────────────────────────────────────────┘

Step 1: n8n Completes Processing
├─ n8n checked calendar → date is NOT available
├─ n8n generated 5 alternative dates
├─ n8n sent email to candidate with date options (clickable links)
└─ Continue to Step 2

Step 2: n8n Calls Your Backend
├─ n8n makes HTTP POST to: /api/reschedule/pending
├─ Payload sent:
│   {
│     "rescheduleId": "original-uuid",
│     "interviewId": "original-id",
│     "status": "pending",
│     "requestedDate": "2024-03-20T10:00:00.000Z",
│     "availableDates": [
│       "2024-03-21T10:00:00.000Z",
│       "2024-03-21T14:00:00.000Z",
│       "2024-03-22T10:00:00.000Z",
│       "2024-03-22T14:00:00.000Z",
│       "2024-03-23T10:00:00.000Z"
│     ]
│   }
└─ Continue to Step 3

Step 3: Your Backend Receives Callback
├─ Endpoint: POST /api/reschedule/pending
├─ Validate webhook is from n8n
└─ Continue to Step 4

Step 4: Your Backend Updates Database
├─ Find record: WHERE reschedule_requests.id = rescheduleId
├─ Update record:
│   └─ status = 'pending'
│   └─ n8n_status = 'pending'
│   └─ available_dates = JSON array of alternative dates
│   └─ processed_at = NOW()
└─ Continue to Step 5

Step 5: Your Backend Sends Response to n8n
├─ Return success response:
│   {
│     "success": true,
│     "message": "Alternative dates saved"
│   }
└─ Continue to Step 6 (wait for candidate)

Step 6: Candidate Receives Email
├─ Email contains: "Your requested date is not available"
├─ Email shows 5 clickable date options
├─ Each option is a link like:
│   https://your-n8n.com/webhook/confirm-date?rescheduleId=xxx&date=2024-03-21T10:00:00.000Z
└─ Candidate clicks one date → Go to Flow 4
```

---

### FLOW 4: Candidate Selects Alternative Date

```
┌────────────────────────────────────────────────────────────┐
│  FLOW 4: Candidate Selects Alternative Date               │
└────────────────────────────────────────────────────────────┘

Step 1: Candidate Clicks Date Link in Email
├─ Link goes directly to n8n webhook (not your backend)
├─ Example: https://n8n.com/webhook/confirm-date?rescheduleId=xxx&date=2024-03-21T10:00:00.000Z
└─ Continue to Step 2

Step 2: n8n Processes Selection (Automatic)
├─ n8n receives the selected date
├─ n8n creates calendar event for selected date
├─ n8n sends final confirmation email to candidate
└─ Continue to Step 3

Step 3: n8n Calls Your Backend Again
├─ n8n makes HTTP POST to: /api/reschedule/confirm
├─ Payload sent:
│   {
│     "rescheduleId": "original-uuid",
│     "interviewId": "original-id",
│     "status": "confirmed",
│     "confirmedDate": "2024-03-21T10:00:00.000Z",
│     "candidateEmail": "candidate@example.com"
│   }
└─ Continue to Step 4

Step 4: Your Backend Updates Database
├─ Find record: WHERE reschedule_requests.id = rescheduleId
├─ Update record:
│   └─ status = 'confirmed'
│   └─ n8n_status = 'confirmed'
│   └─ confirmed_date = confirmedDate from payload
│   └─ processed_at = NOW()
├─ Update main interviews table:
│   └─ scheduled_date = confirmedDate
└─ Continue to Step 5

Step 5: Your Backend Sends Response
├─ Return success to n8n
└─ END OF FLOW 4

What Candidate Sees:
├─ Browser shows: "Interview confirmed!" success page
├─ Candidate receives email: "Final confirmation for [selected date]"
└─ Updated date shows in your portal
```

---

## 📝 DATA FLOW SUMMARY

### Data You Send TO n8n

**Endpoint:** `POST https://your-n8n-instance.com/webhook/reschedule-interview`

**Payload Structure:**
```
{
  "rescheduleId": "string (UUID you generate)",
  "interviewId": "string (from your database)",
  "candidateEmail": "string",
  "candidateName": "string",
  "requestedDate": "string (ISO 8601 format: 2024-03-20T10:00:00.000Z)",
  "jobRole": "string"
}
```

**Example:**
```
{
  "rescheduleId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "interviewId": "int_12345",
  "candidateEmail": "john.doe@example.com",
  "candidateName": "John Doe",
  "requestedDate": "2024-03-20T10:00:00.000Z",
  "jobRole": "Senior Software Engineer"
}
```

---

### Data You Receive FROM n8n

#### Scenario A: Date is Available (Immediate Confirmation)

**Your Endpoint:** `POST /api/reschedule/confirm`

**Payload You Receive:**
```
{
  "rescheduleId": "string (same UUID you sent)",
  "interviewId": "string",
  "status": "confirmed",
  "confirmedDate": "string (ISO 8601 format)",
  "candidateEmail": "string"
}
```

**Example:**
```
{
  "rescheduleId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "interviewId": "int_12345",
  "status": "confirmed",
  "confirmedDate": "2024-03-20T10:00:00.000Z",
  "candidateEmail": "john.doe@example.com"
}
```

**What This Means:**
- Date was available
- Calendar event created
- Confirmation email sent to candidate
- You should: Update interview date in database to confirmedDate

---

#### Scenario B: Date NOT Available (Alternative Dates)

**Your Endpoint:** `POST /api/reschedule/pending`

**Payload You Receive:**
```
{
  "rescheduleId": "string",
  "interviewId": "string",
  "status": "pending",
  "requestedDate": "string (original requested date)",
  "availableDates": [
    "2024-03-21T10:00:00.000Z",
    "2024-03-21T14:00:00.000Z",
    "2024-03-22T10:00:00.000Z",
    "2024-03-22T14:00:00.000Z",
    "2024-03-23T10:00:00.000Z"
  ]
}
```

**Example:**
```
{
  "rescheduleId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "interviewId": "int_12345",
  "status": "pending",
  "requestedDate": "2024-03-20T10:00:00.000Z",
  "availableDates": [
    "2024-03-21T10:00:00.000Z",
    "2024-03-21T14:00:00.000Z",
    "2024-03-22T10:00:00.000Z"
  ]
}
```

**What This Means:**
- Requested date was NOT available
- n8n generated alternative dates
- Email sent to candidate with clickable date options
- You should: Save availableDates in database, wait for candidate to choose
- Later: n8n will call /confirm endpoint again when candidate selects a date

---

## 🔐 SECURITY REQUIREMENTS

### Webhook Authentication

**Problem:** How does your backend know the request is really from n8n and not a hacker?

**Solution:** Use API Key validation

### Implementation Steps:

1. **Generate Secret Key**
   - Create a random, secure string (32+ characters)
   - Example: `n8n_secret_abc123xyz789_secure_key_here`

2. **Store in Both Systems**
   - Save in your backend environment variables
   - Configure in n8n HTTP request nodes

3. **Validation Logic**
   - When n8n calls your /confirm or /pending endpoints
   - n8n sends header: `X-API-Key: your_secret_key`
   - Your backend checks: if header matches your stored key → proceed
   - If doesn't match → return 401 Unauthorized

---

## ⚠️ ERROR HANDLING

### What Could Go Wrong?

#### Error 1: n8n Webhook is Down
**When:** Your backend calls n8n, but n8n doesn't respond

**What to do:**
- Set timeout on HTTP request (30 seconds max)
- If timeout → Save status as 'failed' in database
- Send notification to admin/support team
- Show error message to candidate: "System temporarily unavailable"

---

#### Error 2: n8n Takes Too Long
**When:** n8n is processing but not responding quickly

**What to do:**
- Don't make frontend wait for n8n response
- Return immediate response: "Request submitted, check email"
- Process n8n response asynchronously via webhook callbacks
- Frontend can poll: GET /api/reschedule/:id/status to check progress

---

#### Error 3: Database Update Fails
**When:** n8n calls your /confirm or /pending endpoint, but your DB is down

**What to do:**
- Return error response to n8n (500 status code)
- n8n should retry the request (configure retry logic)
- Log the error for manual investigation
- Have a retry queue or manual reconciliation process

---

#### Error 4: Invalid Data from n8n
**When:** n8n sends malformed data or missing fields

**What to do:**
- Validate all required fields exist
- Check data types match expected format
- If invalid → return 400 Bad Request with error details
- Log the payload for debugging
- Don't crash - handle gracefully

---

## 📊 STATUS TRACKING

### Status Field Values

Track reschedule request status through these states:

```
┌────────────────────────────────────────────────────────────┐
│              STATUS LIFECYCLE                              │
└────────────────────────────────────────────────────────────┘

pending
  ↓
  Candidate submits request
  ↓
processing
  ↓
  Your backend calls n8n
  ↓
  ┌─────────┴─────────┐
  │                   │
confirmed          pending (waiting for candidate)
  │                   │
  END                 Candidate clicks date link
                      │
                   confirmed
                      │
                     END
```

### Status Descriptions:

| Status | Meaning | What Happens Next |
|--------|---------|-------------------|
| pending | Initial state when created | Backend will call n8n |
| processing | Sent to n8n, waiting for response | Wait for n8n callback |
| confirmed | Interview date finalized | Nothing - done! |
| failed | Error occurred | Admin investigates, may retry |

---

## 🧪 TESTING CHECKLIST

### What Anti-Gravity Team Should Test:

#### Test 1: Happy Path - Date Available
```
1. Candidate requests reschedule for available date
2. Backend saves to database ✓
3. Backend calls n8n successfully ✓
4. n8n calls /confirm endpoint ✓
5. Database updated with confirmed date ✓
6. Candidate receives confirmation email ✓
7. Frontend shows updated date ✓
```

#### Test 2: Date NOT Available
```
1. Candidate requests reschedule for unavailable date
2. Backend saves to database ✓
3. Backend calls n8n successfully ✓
4. n8n calls /pending endpoint with alternatives ✓
5. Database updated with alternative dates ✓
6. Candidate receives email with date options ✓
7. Candidate clicks one date option ✓
8. n8n calls /confirm with selected date ✓
9. Database updated with final date ✓
10. Frontend shows updated date ✓
```

#### Test 3: Error Scenarios
```
1. n8n is down - Backend handles gracefully ✓
2. Invalid API key - Backend rejects webhook ✓
3. Database is down - Proper error returned ✓
4. Invalid date format - Validation catches it ✓
5. Interview doesn't exist - Returns 404 ✓
```

---

## 📋 IMPLEMENTATION CHECKLIST FOR ANTI-GRAVITY

### Phase 1: Database Setup
- [ ] Create `reschedule_requests` table with all required columns
- [ ] Add indexes on interview_id, status, created_at
- [ ] Test database connections and queries
- [ ] Add foreign key constraint to interviews table

### Phase 2: API Endpoints
- [ ] Create POST /api/reschedule/request endpoint
- [ ] Create POST /api/reschedule/confirm endpoint
- [ ] Create POST /api/reschedule/pending endpoint
- [ ] Create GET /api/reschedule/:id/status endpoint
- [ ] Add webhook authentication middleware
- [ ] Add input validation for all endpoints

### Phase 3: n8n Integration
- [ ] Get n8n webhook URL from your team
- [ ] Store n8n URL in environment variables
- [ ] Generate and store API secret key
- [ ] Configure API key in n8n HTTP request nodes
- [ ] Test calling n8n webhook manually
- [ ] Verify n8n can call your /confirm and /pending endpoints

### Phase 4: Error Handling
- [ ] Add timeout handling for n8n webhook calls
- [ ] Add retry logic for failed n8n calls
- [ ] Add logging for all webhook interactions
- [ ] Create admin dashboard to view failed requests
- [ ] Add email notifications for system errors

### Phase 5: Testing
- [ ] Test with available date
- [ ] Test with unavailable date
- [ ] Test candidate selecting alternative date
- [ ] Test all error scenarios
- [ ] Load test with multiple concurrent requests
- [ ] Security test webhook authentication

### Phase 6: Deployment
- [ ] Deploy database changes to staging
- [ ] Deploy backend code to staging
- [ ] Test end-to-end in staging
- [ ] Deploy to production
- [ ] Monitor logs for first 24 hours
- [ ] Create rollback plan if issues arise

---

## 📞 INTEGRATION POINTS SUMMARY

### What Your Backend Must Do:

#### Outgoing (Your Backend → n8n):
```
Action: Trigger reschedule workflow
When: Candidate submits reschedule request
Method: POST
URL: https://your-n8n-instance.com/webhook/reschedule-interview
Headers: Content-Type: application/json
Payload: {rescheduleId, interviewId, candidateEmail, candidateName, requestedDate, jobRole}
```

#### Incoming (n8n → Your Backend):
```
Action 1: Receive confirmation (date available)
Endpoint: POST /api/reschedule/confirm
Payload: {rescheduleId, interviewId, status: "confirmed", confirmedDate, candidateEmail}
Your Action: Update database, set status='confirmed', update interview date

Action 2: Receive pending notification (date unavailable)
Endpoint: POST /api/reschedule/pending
Payload: {rescheduleId, interviewId, status: "pending", requestedDate, availableDates[]}
Your Action: Update database, set status='pending', save alternative dates

Action 3: Receive final confirmation (after candidate selects alternative)
Endpoint: POST /api/reschedule/confirm (same as Action 1)
Payload: {rescheduleId, interviewId, status: "confirmed", confirmedDate, candidateEmail}
Your Action: Update database, set status='confirmed', update interview date
```

---

## 🎯 QUICK REFERENCE

### Environment Variables Needed:
```
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/reschedule-interview
N8N_API_KEY=your_secret_api_key_here
BACKEND_WEBHOOK_SECRET=your_webhook_secret_for_n8n_callbacks
```

### Database Tables Needed:
- `reschedule_requests` (new table)
- `interviews` (existing - may need minor updates)

### API Endpoints Needed:
- POST /api/reschedule/request (candidate-facing)
- POST /api/reschedule/confirm (n8n webhook)
- POST /api/reschedule/pending (n8n webhook)
- GET /api/reschedule/:id/status (frontend polling)

---

## ✅ SUCCESS CRITERIA

Integration is successful when:

1. ✅ Candidate can submit reschedule request from frontend
2. ✅ Backend saves request to database
3. ✅ Backend successfully calls n8n webhook
4. ✅ n8n processes request and calls backend webhook
5. ✅ Database is updated with final status
6. ✅ Candidate receives email notifications
7. ✅ Frontend displays updated interview date
8. ✅ All error scenarios are handled gracefully
9. ✅ Webhook security is properly implemented
10. ✅ System can handle concurrent reschedule requests

---

## 📚 ADDITIONAL NOTES

### Timeline Estimate:
- Database setup: 2-4 hours
- API endpoints: 8-12 hours
- Testing: 4-6 hours
- **Total: 2-3 days** for full implementation

### Dependencies:
- n8n workflow must be active and accessible
- Google Calendar credentials must be configured in n8n
- SMTP email service must be configured in n8n
- Database must support JSON column type

### Support:
If you need clarification on any workflow step, please provide:
1. Which flow step you need clarification on
2. Specific question about the logic
3. Any error messages you're encountering

---

**END OF WORKFLOW DOCUMENT**

This document contains ZERO code - only the workflow logic that Anti-Gravity team needs to implement.
