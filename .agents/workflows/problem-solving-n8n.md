---
description: Setup a dedicated n8n workflow for Problem Solving (Coding) questions
---

To ensure high-quality coding questions and test cases, follow these steps to create a specialized n8n workflow:

### 1. Create a New n8n Workflow
1. Log in to your n8n instance.
2. Click **"Add Workflow"** and name it `Problem Solving Specialist`.
3. Add a **Webhook** node:
   - **HTTP Method**: POST
   - **Path**: `problem-solving/generation`
   - Copy the **Production URL**.

### 2. Configure the AI Agent Node
1. Add an **AI Agent** node:
   - **Agent Type**: Tools Agent
   - **Prompt Type**: Define
   - **Prompt**: 
     ```text
     =Generate {{ $json.body.questionCount }} CODING problems for a {{ $json.body.jobRole }}.
     
     Job Description:
     {{ $json.body.jobDescription }}

     Instructions:
     {{ $json.body.requirements }}

     STRICT JSON OUTPUT FORMAT:
     - Return ONLY a raw JSON array of objects.
     - Each object MUST have: "question", "type": "Coding", "difficulty", "testCases".
     - "testCases" must be an array of 3-5 objects with: "input" (string), "output" (string).
     - Do NOT use markdown code blocks (no ```json).
     ```
2. Connect a **Chat Model** node (using Groq/Llama-3.3-70b or Gemini 1.5 Pro for best logic).

### 3. Add a Code Node (JSON Parser)
1. Add a **Code** node after the AI Agent:
   - **Language**: JavaScript
   - **Code**:
     ```javascript
     const outputText = $input.all()[0].json.output;
     let questions = [];
     try {
       // Clean markdown if the AI mistakenly included it
       let cleanText = outputText.replace(/```json/g, '').replace(/```/g, '').trim();
       questions = JSON.parse(cleanText);
     } catch (e) {
       console.error("JSON Parse Error", e);
       questions = [];
     }
     return { questions: questions };
     ```

### 4. Direct Your Application to the New Workflow
1. Open your `server/.env` file.
2. Add the new variable (using the Webhook URL you copied in Step 1.3):
   ```env
   N8N_PROBLEM_SOLVING_WEBHOOK_URL=https://your-n8n-instance.com/webhook/problem-solving/generation
   ```
3. Restart your server.

**Result:** The application will now use this specialized workflow ONLY when the "Problem Solving" type is selected, while other types will continue using your default webhook.
