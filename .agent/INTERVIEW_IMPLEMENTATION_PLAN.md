# Candidate Interview Section Implementation Plan

## Overview
This document outlines the implementation plan to update the candidate interview section from the Supabase-based reference code to our MongoDB-based tech stack.

## Tech Stack Mapping

### Reference Code (Supabase)
- **Frontend**: Next.js (App Router)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Real-time**: Supabase Realtime
- **Voice**: VAPI SDK

### Our Stack (MongoDB)
- **Frontend**: React + Vite + TypeScript
- **Database**: MongoDB
- **Backend**: Express.js + Node.js
- **Auth**: JWT-based authentication
- **Voice**: VAPI SDK (same)

## Key Features to Implement

### 1. **Voice Interview System (VAPI Integration)**
   - Real-time voice conversation with AI
   - Speech-to-text transcription
   - Conversation history tracking
   - Auto-save progress to database

### 2. **Session Management**
   - Multi-device locking (prevent concurrent sessions)
   - Session state persistence
   - Resume capability after disconnection
   - Auto-completion on timeout

### 3. **Anti-Cheating System**
   - Tab switch detection
   - Window blur/focus tracking
   - Mouse leave detection
   - Violation scoring system
   - Auto-termination on threshold breach

### 4. **Interview Flow**
   - Join page (OTP/Email verification)
   - Preparation page (instructions, camera/mic check)
   - Interview page (voice interaction)
   - Coding round (optional)
   - Completion page (feedback display)

### 5. **Timer System**
   - Countdown timer for timed interviews
   - Count-up timer for untimed interviews
   - Persistent timer state (survives page refresh)
   - Auto-submit on timeout

### 6. **Feedback Generation**
   - AI-powered performance analysis
   - Rating system (multiple criteria)
   - Recommendations
   - Summary generation

## Database Schema Changes

### New Collections Needed

#### 1. `interview_sessions`
```javascript
{
  _id: ObjectId,
  interview_id: String (ref to interviews),
  user_email: String,
  session_status: String, // 'active', 'completed', 'auto_completed'
  active_session_id: String, // Client ID for multi-device locking
  current_transcript: Array, // Real-time conversation backup
  timer_start_timestamp: Number,
  timer_end_timestamp: Number,
  created_at: Date,
  updated_at: Date
}
```

#### 2. `interview_results` (Enhanced)
```javascript
{
  _id: ObjectId,
  interview_id: String,
  email: String,
  fullname: String,
  conversation_transcript: Array,
  started_at: Date,
  completed_at: Date,
  is_completed: Boolean,
  
  // Feedback fields
  recommendations: String,
  summary: String,
  rating: Object, // { technical: 8, communication: 7, ... }
  
  // Anti-cheating fields
  anti_cheating_state: Object,
  violation_count: Number,
  
  // Coding round (if applicable)
  coding_submission: Object,
  
  created_at: Date,
  updated_at: Date
}
```

#### 3. `anti_cheating_events`
```javascript
{
  _id: ObjectId,
  interview_id: String,
  email: String,
  candidate_name: String,
  event_type: String, // 'window_blur', 'visibility_hidden', 'mouse_leave', etc.
  timestamp: Date,
  timestamp_str: String, // Relative time "MM:SS"
  duration_ms: Number, // For focus loss events
  suspicious_score: Number,
  max_allowed_score: Number,
  interview_status: String, // 'active', 'auto_completed'
  created_at: Date
}
```

## Backend API Routes to Implement

### Interview Session Management
```
POST   /api/interviews/session/save          - Save session state
POST   /api/interviews/session/claim         - Claim session lock
POST   /api/interviews/session/terminate     - End session
GET    /api/interviews/session/:id/:email    - Get session state
```

### Interview Execution
```
POST   /api/interviews/finalize              - Finalize interview & generate feedback
POST   /api/interviews/log-violation         - Log anti-cheating violation
POST   /api/interviews/anti-cheating-event   - Process anti-cheating event
```

### Results
```
GET    /api/interviews/results/:interviewId  - Get interview results
POST   /api/interviews/results               - Upsert result
```

## Frontend Components to Create

### Pages
1. **CandidateInterviewJoin** (`/interview/:id`)
   - Email/OTP verification
   - Interview details display
   - Join button

2. **CandidateInterviewPrep** (`/interview/:id/prep`)
   - Instructions display
   - Camera/microphone permissions
   - Device check
   - Start button

3. **CandidateInterviewStart** (`/interview/:id/start`)
   - VAPI voice interface
   - Live transcription display
   - Timer component
   - Anti-cheating monitor
   - Video panel (candidate camera)
   - Progress indicators

4. **CandidateInterviewCoding** (`/interview/:id/coding`)
   - Code editor
   - Question display
   - Submit functionality

5. **CandidateInterviewCompleted** (`/interview/:id/completed`)
   - Success message
   - Feedback display (if available)
   - Close tab functionality

### Components
1. **InterviewHeader** - Header with logo
2. **TimerComponent** - Countdown/count-up timer
3. **VideoPanel** - Candidate camera feed
4. **DraggableCamera** - Draggable camera overlay
5. **AntiCheatingMonitor** - Invisible monitoring component
6. **AlertConfirmation** - Exit confirmation dialog

### Utilities
1. **vapiConfig** - VAPI client initialization
2. **interviewStorage** - Hybrid localStorage + DB storage
3. **logger** - Development logging utility

## Implementation Steps

### Phase 1: Database & Backend Setup
1. Create MongoDB schemas/models
2. Implement session management controllers
3. Implement anti-cheating event controllers
4. Implement feedback generation controller
5. Add API routes

### Phase 2: Frontend Core Components
1. Create InterviewDataContext
2. Create logger utility
3. Create VAPI configuration
4. Create storage utility (interviewStorage)

### Phase 3: Interview Flow Pages
1. Implement Join page
2. Implement Prep page
3. Implement Start page (main interview)
4. Implement Coding page
5. Implement Completed page

### Phase 4: Supporting Components
1. Timer component
2. Video panel component
3. Anti-cheating monitor
4. Alert dialogs
5. Header component

### Phase 5: Integration & Testing
1. Test full interview flow
2. Test session recovery
3. Test multi-device locking
4. Test anti-cheating system
5. Test feedback generation

## Key Differences & Adaptations

### 1. **Database Calls**
- **Supabase**: `supabase.from('table').select()`
- **MongoDB**: `Model.find()` or API calls to Express backend

### 2. **Real-time Updates**
- **Supabase**: Realtime subscriptions
- **MongoDB**: Polling or Socket.io (if needed)

### 3. **Authentication**
- **Supabase**: `supabase.auth.getSession()`
- **MongoDB**: JWT token verification

### 4. **File Structure**
- **Next.js**: `app/interview/[id]/page.jsx`
- **React**: `src/pages/CandidateInterview.tsx`

### 5. **Routing**
- **Next.js**: File-based routing
- **React**: React Router (`useParams`, `useNavigate`)

## Environment Variables Needed

```env
# VAPI Configuration
VITE_VAPI_PUBLIC_KEY=your_vapi_public_key
VITE_VAPI_PRIVATE_KEY=your_vapi_private_key

# API Configuration
VITE_API_URL=http://localhost:5000

# OpenAI (for feedback generation)
OPENAI_API_KEY=your_openai_key
```

## Critical Implementation Notes

1. **Session Locking**: Implement client ID generation using `crypto.randomUUID()` or fallback
2. **State Persistence**: Use hybrid approach (localStorage + MongoDB) for reliability
3. **Error Handling**: Suppress VAPI "Meeting has ended" errors (expected behavior)
4. **Navigation Guards**: Prevent accidental exit during interview
5. **Cleanup**: Clear all interview-related localStorage on completion
6. **Feedback Generation**: Use OpenAI API to analyze conversation transcript

## Testing Checklist

- [ ] Can join interview with valid link
- [ ] Camera/mic permissions work
- [ ] VAPI voice call starts successfully
- [ ] Conversation is transcribed correctly
- [ ] Timer counts down/up correctly
- [ ] Session persists on page refresh
- [ ] Multi-device locking prevents concurrent access
- [ ] Anti-cheating detects tab switches
- [ ] Interview auto-completes on timeout
- [ ] Feedback is generated correctly
- [ ] Coding round transitions work
- [ ] Completion page displays correctly
- [ ] All localStorage is cleared on completion

## Next Steps

1. Review this plan with the team
2. Set up database schemas
3. Begin Phase 1 implementation
4. Test incrementally after each phase
