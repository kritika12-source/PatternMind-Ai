<div align="center">

# PatternMind AI

### Your Personal AI Coding Mentor

**Think Better · Debug Smarter · Solve Independently**

<img src="docs/images/Screenshot%202026-11-14%20230639.png"  alt="PatternMind AI banner" width="100%">

<p>
  An AI-powered Chrome extension that helps learners reason through LeetCode problems,
  inspect their code, and learn from mistakes instead of jumping straight to an answer.
</p>

</div>

<p align="center">
  <img src="https://img.shields.io/badge/React-Frontend-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-Frontend-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-Backend-339933?logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-API-000000?logo=express" alt="Express">
  <img src="https://img.shields.io/badge/Google-Gemini%20API-4285F4?logo=google" alt="Gemini API">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white" alt="Chrome extension">
</p>

---

## What is PatternMind AI?

PatternMind AI is a Chrome extension built to support problem-solving practice on LeetCode. It brings AI guidance alongside the coding workflow and is designed to help learners understand *where* their reasoning needs attention and *why* a particular approach may fail.

The focus is guided learning: hints are delivered progressively, code can be reviewed through logic analysis, and useful problem-solving experiences can be saved as learning memory.

## At a glance

- **Progressive hints:** staged guidance from a nudge toward more specific help.
- **Logic analysis:** an explanation of execution and potential logic issues.
- **Code dry run:** a step-by-step view of how code and variables behave.
- **Learning memory:** a place to retain useful problem-solving notes.
- **LeetCode integration:** detects the active problem and works alongside the practice page.

## See it in action

### Extension dashboard and current problem

The extension displays the detected problem, current code, and actions for requesting a hint or analysing logic.

<p align="center">
  <img src="docs/images/Screenshot%202026-11-14%20230639.png"  alt="PatternMind AI extension showing current code, hint and logic analysis" width="390">
</p>

### Logic analysis

The following captures show the execution trace and explanation sections produced by the logic-analysis experience.

<p align="center">
  <img src="docs/images/Screenshot%202026-11-14%20230832.png" alt="Logic analysis execution trace" width="390">
</p>

<p align="center">
  <img src="docs/images/Screenshot%202026-11-14%20230843.png"  alt="Logic analysis explanation and thinking question" width="390">
</p>

### Progressive hints

Hints are designed to reveal guidance in stages, helping the learner keep ownership of the solution.

**Hint Level 1 — Where should I look?**

<p align="center">
  <img src="docs/images/Screenshot%202026-11-14%20230916.png"  alt="PatternMind AI Hint Level 1" width="390">
</p>

**Hint Level 2 — What concept should I think about?**

<p align="center">
  <img src="docs/images/Screenshot%202026-11-14%20230946.png" alt="PatternMind AI Hint Level 2" width="390">
</p>

**Hint Level 5 — Small code help**

<p align="center">
  <img src="docs/images/Screenshot%202026-11-14%20231137.png" alt="PatternMind AI Hint Level 5" width="390">
</p>

> These are screenshots from the current development build. AI analysis and hint quality depend on the submitted problem and code; outputs should be reviewed as part of testing.

## How the workflow fits together

```mermaid
flowchart TD
    A["Open a LeetCode problem"] --> B["Extension detects problem context"]
    B --> C["Read current code"]
    C --> D["Choose an assistance feature"]
    D --> E["Progressive hint"]
    D --> F["Logic analysis"]
    D --> G["Code dry run"]
    E --> H["Review guidance"]
    F --> H
    G --> H
    H --> I["Revise code and keep learning"]
```

## System architecture

```mermaid
flowchart TD
    A["LeetCode page"] <--> B["Chrome extension scripts"]
    B --> C["React + TypeScript interface"]
    C --> D["Node.js + Express backend"]
    D --> E["Prompt and context handling"]
    E <--> F["Google Gemini API"]
    F --> G["AI response"]
    G --> C
    C <--> H["Chrome local storage"]
```

## Technology

| Technology | Role |
|---|---|
| React | Extension user interface |
| TypeScript | Frontend application code |
| Vite | Frontend development and build |
| Node.js | Backend runtime |
| Express | Backend API |
| Google Gemini API | AI-assisted hints and analysis |
| Chrome Extension Manifest V3 | Browser integration |
| Chrome Storage API | Local extension data and learning memory |
| JavaScript | Content script, page bridge and extension logic |

## Project layout

```text
PatternMind-Ai/
├── backend/
│   ├── server.js
│   └── package.json
├── extension/
│   ├── manifest.json
│   └── background.js
├── src/
│   ├── assets/
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   └── main.tsx
├── docs/
│   └── images/
├── content.js
├── page-bridge.js
├── index.html
├── package.json
└── README.md
```

## Run locally

### Prerequisites

- Node.js and npm
- Google Chrome
- A Google Gemini API key

### 1. Clone the repository

```bash
git clone https://github.com/kritika12-source/PatternMind-Ai.git
cd PatternMind-Ai
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Install backend dependencies

```bash
cd backend
npm install
```

### 4. Add the Gemini API key

Create `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key
```

Keep this file private. Do not commit API keys or credentials to GitHub.

### 5. Start the backend

From the `backend` directory:

```bash
node --use-system-ca server.js
```

### 6. Start the frontend

Open a second terminal in the project root:

```bash
npm run dev
```

### 7. Build the extension

Open a third terminal in the project root:

```bash
npm run build
```

The unpacked extension folder must contain `manifest.json`, `background.js`, `content.js`, and `page-bridge.js`, alongside the built frontend assets. If your build does not copy the extension files automatically, copy them into `dist`:

```powershell
Copy-Item ".\extension\manifest.json" ".\dist\manifest.json" -Force
Copy-Item ".\extension\background.js" ".\dist\background.js" -Force
Copy-Item ".\content.js" ".\dist\content.js" -Force
Copy-Item ".\page-bridge.js" ".\dist\page-bridge.js" -Force
```

### 8. Load it in Chrome

1. Open `chrome://extensions/`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the project's `dist` folder.
5. Open LeetCode and launch PatternMind AI.

## Development roadmap

- [x] React and TypeScript interface
- [x] Node.js and Express backend
- [x] Gemini API integration
- [x] LeetCode problem detection
- [x] Progressive hint interface
- [x] Logic-analysis interface
- [x] Learning-memory interface
- [ ] Verify LeetCode Practice History synchronization end to end
- [ ] Improve AI response formatting in the extension
- [ ] Add learning analytics and progress insights
- [ ] Expand algorithm-pattern recognition
- [ ] Explore support for additional coding platforms

## The idea

A useful coding mentor does not always give you the answer. Sometimes the most valuable help is a small hint, a clear explanation of a mistake, or a question that makes you rethink your approach.

**PatternMind AI is built around that idea: help learners become better problem solvers, one problem at a time.**

---

<div align="center">

**PatternMind AI**

*Think Better · Debug Smarter · Solve Independently*

Developed by **Kritika Grover**

[GitHub Profile](https://github.com/kritika12-source) · [Project Repository](https://github.com/kritika12-source/PatternMind-Ai)

</div>
