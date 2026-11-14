const http = require("http");
const https = require("https");
const tls = require("tls");
const fs = require("fs");
const path = require("path");

// ============================================================
// LOAD .ENV
// ============================================================

const envPath = path.join(__dirname, ".env");

if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, "utf8");

  envFile.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const index = trimmed.indexOf("=");

    if (index === -1) {
      return;
    }

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();

    process.env[key] = value;
  });
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PORT = 3000;

// ============================================================
// HTTPS POST
// ============================================================

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "POST",
        headers,
        ca: tls.getCACertificates("system"),
      },
      (response) => {
        let data = "";

        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          resolve({
            status: response.statusCode,
            data,
          });
        });
      }
    );

    request.on("error", reject);

    request.write(body);
    request.end();
  });
}

// ============================================================
// GEMINI CALL
// ============================================================

async function callGemini(prompt, purpose = "request") {
  const modelsToTry = [
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
  ];

  let lastError = "All Gemini models failed.";

  for (const model of modelsToTry) {
    console.log(
      `🤖 Trying Gemini model for ${purpose}: ${model}`
    );

    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const requestBody = JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      });

      const response = await httpsPost(
        url,
        {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
          "x-goog-api-key": GEMINI_API_KEY,
        },
        requestBody
      );

      let data = {};

      try {
        data = JSON.parse(response.data);
      } catch {
        data = {};
      }

      console.log(
        `📡 Gemini status (${purpose}):`,
        response.status
      );

      if (
        response.status >= 200 &&
        response.status < 300
      ) {
        console.log(
          `✅ Gemini succeeded: ${model}`
        );

        return data;
      }

      lastError =
        data?.error?.message ||
        `Gemini returned ${response.status}`;

      console.error(
        `❌ ${model}:`,
        lastError
      );

      if (
        response.status === 429 ||
        response.status === 500 ||
        response.status === 503
      ) {
        console.log(
          "🔄 Trying fallback model..."
        );

        continue;
      }

      throw new Error(lastError);

    } catch (error) {
      lastError = error.message;

      console.error(
        `❌ Gemini error (${purpose}):`,
        error
      );

      continue;
    }
  }

  throw new Error(lastError);
}

// ============================================================
// EXTRACT GEMINI TEXT
// ============================================================

function extractGeminiText(data) {
  return (
    data
      ?.candidates?.[0]
      ?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || ""
  );
}

// ============================================================
// CLEAN JSON
// ============================================================

function cleanJsonText(text) {
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
  }

  return cleaned;
}

// ============================================================
// FIND RELEVANT LEARNING MEMORY
// ============================================================

async function findRelevantMemory(problem, history) {
  if (
    !problem ||
    !Array.isArray(history) ||
    history.length === 0
  ) {
    return {
      relevant: false,
      score: 0,
      previousProblemTitle: "",
      reason: "",
      connection: "",
    };
  }

  // ----------------------------------------------------------
  // REMOVE DUPLICATES
  // ----------------------------------------------------------

  const uniqueHistory = [];
  const seen = new Set();

  for (const item of history) {
    const key = [
      item.problemTitle || "",
      item.codeSnapshot || "",
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueHistory.push(item);
  }

  // ----------------------------------------------------------
  // PREPARE HISTORY FOR GEMINI
  // ----------------------------------------------------------

  const historyForMatching = uniqueHistory
    .slice(-20)
    .map((item, index) => ({
      id: index,
      problemTitle: item.problemTitle || "",
      approach: item.approach || "",
      patterns: Array.isArray(item.patterns)
        ? item.patterns
        : [],
      concepts: Array.isArray(item.concepts)
        ? item.concepts
        : [],
      mistakes: Array.isArray(item.mistakes)
        ? item.mistakes
        : [],
      learning: item.learning || "",
    }));

  // ----------------------------------------------------------
  // MEMORY MATCHING PROMPT
  // ----------------------------------------------------------

  const prompt = `
You are PatternMind's PERSONAL LEARNING MEMORY MATCHER.

Your job is to determine whether the student's CURRENT problem
has a meaningful connection to something the student solved
BEFORE.

CURRENT PROBLEM:
${JSON.stringify(problem, null, 2)}

STUDENT'S PREVIOUS LEARNING:
${JSON.stringify(historyForMatching, null, 2)}

IMPORTANT MATCHING RULES:

1. Look for TRANSFERABLE reasoning.

2. Strong matches include:
   - same algorithm
   - same data structure
   - same problem-solving pattern
   - same important concept
   - a previous mistake that is directly useful now
   - a previous technique that can be reused differently

3. Weak matches are NOT enough:
   - both use Java
   - both use loops
   - both use arrays
   - both involve strings
   - both have similar difficulty

4. Do NOT force a connection.

5. Prefer a specific useful connection over a generic one.

6. If there is no meaningful connection, return relevant=false.

7. Select ONLY ONE previous problem.

8. The connection must be something the student can
   actually use to reason about the CURRENT problem.

9. If a previous memory has the SAME problem title as the
   current problem, treat it as a STRONG candidate.

10. A previous attempt at the SAME problem is highly relevant
    because it represents the student's own previous learning.

11. Prefer:

SAME PROBLEM
>
SAME ALGORITHM / PATTERN
>
SAME DATA STRUCTURE / CONCEPT
>
WEAKER TRANSFERABLE CONNECTION

12. Do NOT provide a solution to the current problem.

13. Do NOT provide implementation steps.

14. Do NOT give code.

Return JSON ONLY:

{
  "relevant": true,
  "score": 0.0,
  "previousProblemTitle": "",
  "reason": "",
  "connection": ""
}

SCORING:

SAME PROBLEM:
0.90 - 1.00

SAME ALGORITHM / PATTERN:
0.75 - 0.89

SAME DATA STRUCTURE / STRONG CONCEPT:
0.65 - 0.74

ONLY GENERIC OVERLAP:
0.00 - 0.59

Only set relevant=true when score >= 0.60.

If no meaningful connection exists:

{
  "relevant": false,
  "score": 0,
  "previousProblemTitle": "",
  "reason": "",
  "connection": ""
}

Return ONLY valid JSON.
`;

  try {
    const geminiData = await callGemini(
      prompt,
      "relevant learning memory matching"
    );

    const responseText =
      extractGeminiText(geminiData);

    const cleaned =
      cleanJsonText(responseText);

    const result =
      JSON.parse(cleaned);

    if (
      !result ||
      typeof result !== "object" ||
      typeof result.relevant !== "boolean"
    ) {
      throw new Error(
        "Invalid memory matching response"
      );
    }

    const score =
      Number(result.score) || 0;

    if (score < 0.60) {
      return {
        relevant: false,
        score,
        previousProblemTitle: "",
        reason: "",
        connection: "",
      };
    }

    return {
      relevant: true,
      score,
      previousProblemTitle:
        result.previousProblemTitle || "",
      reason:
        result.reason || "",
      connection:
        result.connection || "",
    };

  } catch (error) {
    console.error(
      "❌ Memory matching error:",
      error.message
    );

    return {
      relevant: false,
      score: 0,
      previousProblemTitle: "",
      reason: "",
      connection: "",
    };
  }
}

// ============================================================
// SERVER
// ============================================================

const server = http.createServer(
  async (req, res) => {

    // ========================================================
    // CORS
    // ========================================================

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );

    // ========================================================
    // OPTIONS
    // ========================================================

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ========================================================
    // HEALTH CHECK
    // ========================================================

    if (
      req.method === "GET" &&
      req.url === "/"
    ) {
      res.writeHead(200, {
        "Content-Type":
          "application/json",
      });

      res.end(
        JSON.stringify({
          success: true,
          message:
            "PatternMind backend is running",
          geminiConfigured:
            !!GEMINI_API_KEY,
        })
      );

      return;
    }

    // ========================================================
    // ANALYZE MY LOGIC
    // ========================================================

    if (
      req.method === "POST" &&
      req.url === "/analyze-logic"
    ) {

      let body = "";

      req.on("data", (chunk) => {
        body += chunk;
      });

      req.on("end", async () => {

        try {

          const requestData =
            JSON.parse(body);

          const problem =
            requestData.problem;

          const code =
            requestData.code;

          console.log(
            "\n🧠 ANALYZE LOGIC REQUEST"
          );

          console.log(
            "📚 Problem:",
            problem?.title
          );

          console.log(
            "💻 Language:",
            code?.language
          );

          // --------------------------------------------------
          // VALIDATION
          // --------------------------------------------------

          if (!problem || !code) {
            throw new Error(
              "Problem or code is missing"
            );
          }

          if (!GEMINI_API_KEY) {
            throw new Error(
              "GEMINI_API_KEY is missing in .env"
            );
          }

          // --------------------------------------------------
          // ANALYSIS PROMPT
          // --------------------------------------------------

          const prompt = `
You are PatternMind, an AI coding mentor.

Your job is to DEBUG the student's CURRENT code
through a REAL execution trace.

IMPORTANT:

You MUST first determine whether the code is actually
incorrect.

DO NOT assume there is a bug.

==================================================
OUTCOME A — REAL LOGIC ERROR
==================================================

If the student's code actually contains a compilation
error, runtime error, or incorrect logic:

1. Choose ONE useful testcase.
2. Execute the student's ACTUAL code.
3. Track important variables.
4. Find the FIRST meaningful incorrect state.
5. STOP immediately at that point.
6. Explain exactly why it is wrong.
7. Give ONE thinking question.
8. Give ONE testcase to try after the student fixes it.

==================================================
OUTCOME B — NO ACTUAL LOGIC BREAK
==================================================

If the student's code correctly handles the selected
testcase:

DO NOT invent a logic break.

Write:

✅ NO LOGIC BREAK FOUND

Then:

1. Briefly explain why the execution works.
2. Mention the important state/condition.
3. Give ONE useful edge case.
4. If a boundary weakness exists, mention it separately.

==================================================
COMPILATION ERROR
==================================================

If the code cannot compile:

1. Identify the exact problematic code.
2. Explain why it cannot compile.
3. Do NOT pretend the code executed.
4. Do NOT invent runtime values.

==================================================
RUNTIME ERROR
==================================================

If execution crashes:

1. Show the last valid state.
2. Show the operation causing the crash.
3. STOP.
4. Explain the crash.

==================================================
DRY RUN RULE
==================================================

Use ONLY the student's actual code.

Never silently fix the code.

Never use an imaginary corrected version.

Use the student's actual variable names.

Track important variables.

When evaluating conditions, calculate the actual values.

A valid intermediate value is NOT a logic break.

Before writing:

❌ LOGIC BREAK HERE

you MUST prove that the current operation:

- produces an incorrect value
- violates a required condition
- causes an invalid state
- causes overflow/underflow
- exits incorrectly
- or produces an incorrect result

If a possible bug exists later, continue the dry run
until the FIRST ACTUAL point where the bug manifests.

==================================================
INTEGER OVERFLOW RULE
==================================================

For integer overflow:

Do NOT assume an operation overflows merely because
the value is large.

Calculate the resulting value.

Java int range:

Integer.MAX_VALUE = 2147483647
Integer.MIN_VALUE = -2147483648

If the code checks overflow before an operation,
verify whether that check actually prevents the overflow.

For boundary conditions, inspect the exact digit/value.

Distinguish:

ACTUAL LOGIC BREAK
from
POTENTIAL BOUNDARY ISSUE.

==================================================
IMPORTANT
==================================================

NEVER invent a logic break.

NEVER contradict yourself.

NEVER say the code has a bug and then demonstrate
that it works.

Do NOT provide complete solution code.

Do NOT rewrite the student's code.

Do NOT dump the optimal algorithm.

==================================================
STYLE
==================================================

Short.
Beginner-friendly.
Code-style variable traces.
Important conditions only.
Normally below 300 words.

==================================================
PROBLEM
==================================================

${JSON.stringify(problem, null, 2)}

==================================================
STUDENT CODE
==================================================

${JSON.stringify(code, null, 2)}
`;

          console.log(
            "🤖 Sending logic analysis to Gemini..."
          );

          const geminiData =
            await callGemini(
              prompt,
              "logic analysis"
            );

          const analysis =
            extractGeminiText(
              geminiData
            );

          if (!analysis) {
            throw new Error(
              "Gemini returned an empty analysis"
            );
          }

          console.log(
            "✅ Analysis received"
          );

          res.writeHead(200, {
            "Content-Type":
              "application/json",
          });

          res.end(
            JSON.stringify({
              success: true,
              analysis,
            })
          );

        } catch (error) {

          console.error(
            "❌ Analysis error:",
            error
          );

          res.writeHead(500, {
            "Content-Type":
              "application/json",
          });

          res.end(
            JSON.stringify({
              success: false,
              error:
                error.message,
            })
          );
        }
      });

      return;
    }

    // ========================================================
    // LEARNING MEMORY
    // ========================================================

    if (
      req.method === "POST" &&
      req.url === "/learning-memory"
    ) {

      let body = "";

      req.on("data", (chunk) => {
        body += chunk;
      });

      req.on("end", async () => {

        try {

          const requestData =
            JSON.parse(body);

          const problem =
            requestData.problem;

          const code =
            requestData.code;

          const analysis =
            requestData.analysis;

          console.log(
            "\n🧠 LEARNING MEMORY REQUEST"
          );

          console.log(
            "📚 Problem:",
            problem?.title
          );

          if (
            !problem ||
            !code ||
            !analysis
          ) {
            throw new Error(
              "Problem, code or analysis is missing"
            );
          }

          if (!GEMINI_API_KEY) {
            throw new Error(
              "GEMINI_API_KEY is missing in .env"
            );
          }

          const prompt = `
You are PatternMind's Learning Memory Engine.

Create ONE compact, accurate memory of how the
student approached this problem.

The memory will be used later to personalize hints.

IMPORTANT:

- Use ONLY information supported by the student's code
  and analysis.
- Do NOT invent techniques.
- Do NOT claim the student learned something they did not.
- Do NOT describe the optimal solution unless the student
  actually used it.
- Do NOT generate generic filler.
- Keep each field concise.
- Only include actual mistakes.

Return ONLY valid JSON.

EXACT FORMAT:

{
  "approach": "",
  "patterns": [],
  "concepts": [],
  "mistakes": [],
  "learning": ""
}

APPROACH:
Describe what the student actually attempted.

PATTERNS:
Use meaningful reusable patterns only.

Examples:

- Stack
- Two Pointers
- Sliding Window
- HashMap
- Binary Search
- DFS
- BFS
- Recursion
- Dynamic Programming
- Digit Extraction
- String Traversal

CONCEPTS:
Use concepts genuinely present.

MISTAKES:
Only actual mistakes.

LEARNING:
One concise reusable lesson.

==================================================
PROBLEM
==================================================

${JSON.stringify(problem, null, 2)}

==================================================
STUDENT CODE
==================================================

${JSON.stringify(code, null, 2)}

==================================================
ANALYSIS
==================================================

${analysis}
`;

          const geminiData =
            await callGemini(
              prompt,
              "learning memory"
            );

          const rawMemory =
            extractGeminiText(
              geminiData
            );

          if (!rawMemory) {
            throw new Error(
              "Gemini returned empty learning memory"
            );
          }

          console.log(
            "🧠 Raw learning memory:",
            rawMemory
          );

          let memory;

          try {

            memory =
              JSON.parse(
                cleanJsonText(
                  rawMemory
                )
              );

          } catch {

            throw new Error(
              "Gemini returned invalid learning memory JSON"
            );
          }

          // --------------------------------------------------
          // NORMALIZE MEMORY
          // --------------------------------------------------

          memory = {
            approach:
              typeof memory.approach ===
              "string"
                ? memory.approach
                : "",

            patterns:
              Array.isArray(
                memory.patterns
              )
                ? memory.patterns
                : [],

            concepts:
              Array.isArray(
                memory.concepts
              )
                ? memory.concepts
                : [],

            mistakes:
              Array.isArray(
                memory.mistakes
              )
                ? memory.mistakes
                : [],

            learning:
              typeof memory.learning ===
              "string"
                ? memory.learning
                : "",
          };

          console.log(
            "✅ Structured learning memory:",
            memory
          );

          res.writeHead(200, {
            "Content-Type":
              "application/json",
          });

          res.end(
            JSON.stringify({
              success: true,
              memory,
            })
          );

        } catch (error) {

          console.error(
            "❌ Learning memory error:",
            error
          );

          res.writeHead(500, {
            "Content-Type":
              "application/json",
          });

          res.end(
            JSON.stringify({
              success: false,
              error:
                error.message,
            })
          );
        }
      });

      return;
    }

    // ========================================================
    // HINT SYSTEM
    // ========================================================

    if (
      req.method === "POST" &&
      req.url === "/hint"
    ) {

      let body = "";

      req.on("data", (chunk) => {
        body += chunk;
      });

      req.on("end", async () => {

        try {

          const requestData =
            JSON.parse(body);

          const {
            problem,
            studentCode:
              incomingStudentCode,
            hintLevel:
              requestHintLevel,
            previousHint,
            history,
          } = requestData;

          // Supports both:
          // studentCode
          // code

          const studentCode =
            incomingStudentCode ??
            requestData.code;

          const hintLevel =
            Math.min(
              5,
              Math.max(
                1,
                Number(
                  requestHintLevel
                ) || 1
              )
            );

          const previousHintText =
            typeof previousHint ===
            "string"
              ? previousHint
              : "";

          const historyList =
            Array.isArray(history)
              ? history
              : [];

          console.log(
            "\n💡 HINT REQUEST"
          );

          console.log(
            "🎯 Level:",
            hintLevel
          );

          console.log(
            "📚 History count:",
            historyList.length
          );

          if (
            !problem ||
            !studentCode
          ) {
            throw new Error(
              "Problem or code is missing"
            );
          }

          if (!GEMINI_API_KEY) {
            throw new Error(
              "GEMINI_API_KEY is missing in .env"
            );
          }

          // --------------------------------------------------
          // CLEAN HISTORY FOR NORMAL HINTS
          // --------------------------------------------------

          const safeHistory =
            historyList
              .slice(-15)
              .map((item) => ({
                problemTitle:
                  item.problemTitle || "",

                difficulty:
                  item.difficulty || "",

                approach:
                  item.approach || "",

                patterns:
                  Array.isArray(
                    item.patterns
                  )
                    ? item.patterns
                    : [],

                concepts:
                  Array.isArray(
                    item.concepts
                  )
                    ? item.concepts
                    : [],

                mistakes:
                  Array.isArray(
                    item.mistakes
                  )
                    ? item.mistakes
                    : [],

                learning:
                  item.learning || "",
              }));

          // --------------------------------------------------
          // FIND RELEVANT MEMORY FOR H3
          // --------------------------------------------------

          let relevantMemory = null;

          if (hintLevel === 3) {

            relevantMemory =
              await findRelevantMemory(
                problem,
                historyList
              );

            console.log(
              "🧠 H3 selected memory:",
              JSON.stringify(
                relevantMemory,
                null,
                2
              )
            );
          }
          

          // --------------------------------------------------
          // LEVEL INSTRUCTIONS
          // --------------------------------------------------

          let levelInstruction = "";

          if (hintLevel === 1) {

            levelInstruction = `
HINT 1 — 👀 WHERE SHOULD I LOOK?

Point the student toward ONE real location
in their CURRENT code.

Examples:

- a variable
- a condition
- a loop
- an operation
- a return statement

Do NOT explain the fix.

Do NOT give code.

Do NOT give the algorithm.

The student should discover the issue.
`;

          } else if (hintLevel === 2) {

            levelInstruction = `
HINT 2 — 🧠 WHAT CONCEPT?

The student has already received H1.

Introduce the relevant concept needed to reason
about the CURRENT problem.

Do NOT repeat H1.

Do NOT provide complete implementation.

Do NOT give the full algorithm.

You may mention the general technique or concept.
`;

          } else if (hintLevel === 3) {

            levelInstruction = `
HINT 3 — 🔗 CONNECT WITH YOUR HISTORY

Your purpose is ONLY to connect the CURRENT problem
to the student's PREVIOUS LEARNING.

==================================================
SELECTED MEMORY
==================================================

${JSON.stringify(
  relevantMemory,
  null,
  2
)}

==================================================
IF relevantMemory.relevant === true
==================================================

- Mention ONLY ONE previous problem by name.
- Explain what the student previously did or learned.
- Explain ONE specific connection between that previous
  learning and the CURRENT problem.
- Explain why that previous learning is useful here.
- Ask EXACTLY ONE transfer question.

==================================================
STRICT H3 LIMITS
==================================================

H3 must NOT solve the current problem.

H3 must NOT provide:
- code
- pseudocode
- implementation steps
- exact conditions
- exact boundary values
- exact formulas needed to solve the current problem
- the next construction step
- the final algorithm
- the final answer

Do NOT introduce a new algorithmic hint.

Do NOT turn the historical connection into a solution.

If the previous memory contains the exact solution
to the current problem, summarize ONLY the learning
or concept. Never copy or reveal the solution.

The transfer question must make the student think
about how their OLD learning could apply to the NEW
problem.

==================================================
GOOD H3 STRUCTURE
==================================================

Use this structure:

🔗 Previous Problem: [problem name]

You previously learned:
[short description of previous learning]

Connection:
[one specific transferable connection]

Transfer question:
[ONE question that makes the student apply
the previous learning to the current problem]

==================================================
IF relevantMemory.relevant === false
==================================================

Return ONLY:

🔗 No directly relevant previous learning found.

Do NOT add:
- a conceptual hint
- a solution hint
- an implementation suggestion
- a new algorithm
- a question about the current solution

Do NOT mention any previous problem.
`;
          } else if (hintLevel === 4) {

            levelInstruction = `
HINT 4 — 🛠️ BUILD IT WITH ME

The student has already received H1-H3.

Do NOT explain the entire algorithm.

Help with ONLY the NEXT missing construction step.

Give at most 1-2 small reasoning steps.

Focus on what the student should decide or construct
RIGHT NOW.

Do NOT list the entire algorithm from beginning to end.

Do NOT provide complete solution code.

Pseudocode is allowed only if necessary.

The student must still implement the next step.
`;

          } else {

            levelInstruction = `
HINT 5 — 💻 SMALL CODE HELP

The student is still stuck.

Give ONE tiny implementation clue for the
IMMEDIATE subproblem.

A very small code fragment is allowed.

Do NOT provide the complete solution.

Do NOT rewrite the student's code.

Do NOT provide multiple large code blocks.

The student must still combine the pieces.
`;

          }  
          const formattingRule = `
==================================================
OUTPUT FORMATTING RULE
==================================================

Keep normal explanations and code visually separate.

INLINE CODE:

Use Markdown backticks for short code references.

Example:

Think about \`rev\` and \`digit\`.

CODE BLOCK:

Whenever showing:
- multiple lines of code
- a condition
- a statement
- pseudocode
- a code fragment

put it inside a fenced code block.

Example:

\`\`\`java
if (rev > Integer.MAX_VALUE / 10 ||
    rev < Integer.MIN_VALUE / 10) {
    return 0;
}
\`\`\`

Then explain the code in a separate paragraph.

NEVER put multi-line code directly inside
a normal paragraph.

Do not mix important code and explanation
in the same paragraph.

H1-H3:

Normally use normal text and inline code only.

H4:

Small code fragments are allowed, but always
use fenced code blocks.

H5:

Small code fragments are allowed, but always
use fenced code blocks.

Never provide complete solution code unless
the student explicitly asks for it.
`; 
              
          

          // --------------------------------------------------
          // HISTORY RULE
          // --------------------------------------------------

          const historyRule = `
HISTORY SAFETY RULE:

Never force a historical connection.

For H3, use ONLY the selected relevant memory
provided by findRelevantMemory().

If relevantMemory.relevant is false:

- Do NOT mention any previous problem.
- Do NOT invent a connection.

Relevant history is more important than recent history.

Do not choose a memory simply because it is
the most recent one.
`;


          // --------------------------------------------------
          // PROGRESSION RULE
          // --------------------------------------------------

          const progressionRule = `
HINT PROGRESSION:

H1 = LOCATION

H2 = CONCEPT

H3 = PERSONAL CONNECTION

H4 = NEXT CONSTRUCTION STEP

H5 = SMALL CODE HELP

Every level must add NEW information.

Never repeat the previous hint.

Never jump directly to the complete solution.

Never reveal the complete answer.
`;

          // --------------------------------------------------
          // HINT PROMPT
          // --------------------------------------------------

          const prompt = `
You are PatternMind, an AI coding mentor.

Help the student solve the CURRENT problem without
solving it completely for them.

==================================================
CURRENT PROBLEM
==================================================

${JSON.stringify(
  problem,
  null,
  2
)}

==================================================
CURRENT STUDENT CODE
==================================================

${JSON.stringify(
  studentCode,
  null,
  2
)}

==================================================
CURRENT HINT LEVEL
==================================================

${hintLevel}

==================================================
PREVIOUS HINT
==================================================

${previousHintText || "None"}

==================================================
SELECTED LEARNING MEMORY
==================================================

${
  hintLevel === 3
    ? JSON.stringify(
        relevantMemory,
        null,
        2
      )
    : JSON.stringify(
        safeHistory,
        null,
        2
      )
}

==================================================
CURRENT LEVEL INSTRUCTION
==================================================

${levelInstruction}

==================================================
HISTORY RULE
==================================================

${historyRule}

==================================================
PROGRESSION RULE
==================================================

${progressionRule}
${formattingRule}

==================================================
GENERAL RULES
==================================================

- Use the student's CURRENT code.
- Never invent an error.
- Never invent a historical connection.
- Never repeat the previous hint.
- Do not provide complete solution code.
- Do not rewrite the complete code.
- Keep it beginner-friendly.
- Keep it concise.
- Return ONLY the hint.

Before responding, internally check:

1. Is this based on the actual code?
2. Is this new information?
3. Is this appropriate for Hint ${hintLevel}?
4. If H3, is the historical connection genuinely relevant?
5. Did I avoid the complete solution?

Return only the final hint.
`;


          const geminiData =
            await callGemini(
              prompt,
              `Hint ${hintLevel}`
            );

          const hint =
            extractGeminiText(
              geminiData
            );

          if (!hint) {
            throw new Error(
              "Gemini returned empty hint"
            );
          }

          console.log(
            `✅ Hint ${hintLevel} received`
          );

          res.writeHead(200, {
            "Content-Type":
              "application/json",
          });

          res.end(
            JSON.stringify({
              success: true,
              hint,
            })
          );

        } catch (error) {

          console.error(
            "❌ Hint error:",
            error
          );

          res.writeHead(500, {
            "Content-Type":
              "application/json",
          });

          res.end(
            JSON.stringify({
              success: false,
              error:
                error.message,
            })
          );
        }
      });

      return;
    }

    // ========================================================
    // 404
    // ========================================================

    res.writeHead(404, {
      "Content-Type":
        "application/json",
    });

    res.end(
      JSON.stringify({
        success: false,
        error: "Not found",
      })
    );
  }
);

// ============================================================
// START SERVER
// ============================================================

server.listen(
  PORT,
  () => {

    console.log(
      `🚀 PatternMind backend running on http://localhost:${PORT}`
    );

    console.log(
      `🔐 Gemini API configured: ${!!GEMINI_API_KEY}`
    );
  }
);