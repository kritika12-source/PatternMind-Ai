import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Problem {
  title: string;
  difficulty: string;
  description: string;
  url: string;
}

interface StudentCode {
  language: string;
  code: string;
}

interface LearningMemory {
  id: string;
  problemTitle: string;
  problemUrl: string;
  difficulty: string;
  language: string;
  approach: string;
  patterns: string[];
  concepts: string[];
  mistakes: string[];
  learning: string;
  codeSnapshot: string;
  createdAt: number;
}

function dedupeLearningHistory(
  history: LearningMemory[]
): LearningMemory[] {
  const seen = new Set<string>();
  const result: LearningMemory[] = [];

  // Keep the newest version of an identical
  // problem + code memory.
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];

    const key = [
      item.problemTitle || "",
      item.codeSnapshot || "",
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.unshift(item);
  }

  return result;
}

function App() {
  const [problem, setProblem] =
    useState<Problem | null>(null);

  const [code, setCode] =
    useState<StudentCode | null>(null);

  const [learningHistory, setLearningHistory] =
    useState<LearningMemory[]>([]);

  const [isAnalyzing, setIsAnalyzing] =
    useState(false);

  const [analysis, setAnalysis] =
    useState<string>("");

  const [isHinting, setIsHinting] =
    useState(false);

  const [hint, setHint] =
    useState<string>("");

  const [hintLevel, setHintLevel] =
    useState(0);

  const [isSavingLearning, setIsSavingLearning] =
    useState(false);

  // =========================================================
  // LOAD PROBLEM + CODE + LEARNING HISTORY
  // =========================================================

  useEffect(() => {
    // -------------------------------------------------------
    // LOAD CURRENT PROBLEM
    // -------------------------------------------------------

    const loadProblem = () => {
      chrome.storage.local.get(
        ["patternmind_problem"],
        (
          result: {
            patternmind_problem?: Problem;
          }
        ) => {
          if (result.patternmind_problem) {
            setProblem(result.patternmind_problem);
          }
        }
      );
    };

    // -------------------------------------------------------
    // LOAD CURRENT CODE
    // -------------------------------------------------------

    const loadCode = () => {
      chrome.storage.local.get(
        ["patternmind_code"],
        (
          result: {
            patternmind_code?: StudentCode;
          }
        ) => {
          if (result.patternmind_code) {
            setCode(result.patternmind_code);
          }
        }
      );
    };

    // -------------------------------------------------------
    // LOAD LEARNING HISTORY
    // -------------------------------------------------------

    const loadLearningHistory = () => {
      chrome.storage.local.get(
        ["patternmind_history"],
        (
          result: {
            patternmind_history?: LearningMemory[];
          }
        ) => {
          const history =
            result.patternmind_history || [];

          const cleanedHistory =
            dedupeLearningHistory(history);

          console.log(
            "🧠 PatternMind learning history:",
            cleanedHistory
          );

          setLearningHistory(cleanedHistory);

          // Persist cleaned history so duplicate memories
          // are removed from Chrome storage too.
          if (
            cleanedHistory.length !== history.length
          ) {
            chrome.storage.local.set({
              patternmind_history: cleanedHistory,
            });
          }
        }
      );
    };

    loadProblem();
    loadCode();
    loadLearningHistory();

    // =======================================================
    // LISTEN FOR STORAGE CHANGES
    // =======================================================

    const handleStorageChange = (
      changes: {
        [key: string]:
          chrome.storage.StorageChange;
      },
      areaName: string
    ) => {
      if (areaName !== "local") return;

      // -----------------------------------------------------
      // PROBLEM CHANGED
      // -----------------------------------------------------

      if (changes.patternmind_problem) {
        const newProblem =
          changes.patternmind_problem
            .newValue as
            | Problem
            | undefined;

        if (newProblem) {
          console.log(
            "📚 PatternMind problem changed:",
            newProblem.title
          );

          setProblem(newProblem);

          // Clear old analysis
          setAnalysis("");

          // Clear old hint
          setHint("");

          // Reset hint level
          setHintLevel(0);
        }
      }

      // -----------------------------------------------------
      // CODE CHANGED
      // -----------------------------------------------------

      if (changes.patternmind_code) {
        const newCode =
          changes.patternmind_code
            .newValue as
            | StudentCode
            | undefined;

        if (newCode) {
          console.log(
            "💻 PatternMind code updated"
          );

          setCode(newCode);

          // Current code changed.
          // Old analysis and hints are no longer reliable.
          setAnalysis("");
          setHint("");
          setHintLevel(0);
        }
      }

      // -----------------------------------------------------
      // LEARNING HISTORY CHANGED
      // -----------------------------------------------------

      if (changes.patternmind_history) {
        const newHistory =
          changes.patternmind_history
            .newValue as
            | LearningMemory[]
            | undefined;

        if (Array.isArray(newHistory)) {
          const cleanedHistory =
            dedupeLearningHistory(newHistory);

          console.log(
            "🧠 Learning history updated:",
            cleanedHistory
          );

          setLearningHistory(
            cleanedHistory
          );
        }
      }
    };

    chrome.storage.onChanged.addListener(
      handleStorageChange
    );

    return () => {
      chrome.storage.onChanged.removeListener(
        handleStorageChange
      );
    };
  }, []);

  // =========================================================
  // SAVE LEARNING MEMORY
  // =========================================================

  const saveLearningMemory = async () => {
    if (
      !problem ||
      !code ||
      !analysis
    ) {
      console.log(
        "❌ Cannot save learning memory"
      );
      return;
    }

    if (isSavingLearning) {
      return;
    }

    try {
      setIsSavingLearning(true);

      console.log(
        "🧠 Generating learning memory..."
      );

      const response = await fetch(
        "http://localhost:3000/learning-memory",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            problem,
            code,
            analysis,
          }),
        }
      );

      const data =
        await response.json();

      console.log(
        "🧠 LEARNING MEMORY BACKEND RESPONSE:",
        data
      );

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Server returned ${response.status}`
        );
      }

      if (!data.success) {
        throw new Error(
          data.error ||
            "Learning memory generation failed"
        );
      }

      const aiMemory =
        data.memory || {};

      // ---------------------------------------------------
      // CREATE STRUCTURED MEMORY
      // ---------------------------------------------------

      const memory: LearningMemory = {
        id:
          `${Date.now()}-${problem.title}`,

        problemTitle:
          problem.title,

        problemUrl:
          problem.url,

        difficulty:
          problem.difficulty,

        language:
          code.language,

        approach:
          typeof aiMemory.approach ===
          "string"
            ? aiMemory.approach
            : "",

        patterns:
          Array.isArray(
            aiMemory.patterns
          )
            ? aiMemory.patterns
            : [],

        concepts:
          Array.isArray(
            aiMemory.concepts
          )
            ? aiMemory.concepts
            : [],

        mistakes:
          Array.isArray(
            aiMemory.mistakes
          )
            ? aiMemory.mistakes
            : [],

        learning:
          typeof aiMemory.learning ===
          "string"
            ? aiMemory.learning
            : "",

        codeSnapshot:
          code.code,

        createdAt:
          Date.now(),
      };

      console.log(
        "🧠 AI Learning Memory:",
        memory
      );

      // ---------------------------------------------------
      // GET EXISTING HISTORY
      // ---------------------------------------------------

      chrome.storage.local.get(
        ["patternmind_history"],
        (
          result: {
            patternmind_history?:
              LearningMemory[];
          }
        ) => {
          const rawHistory =
            result.patternmind_history ||
            [];

          const history =
            dedupeLearningHistory(
              rawHistory
            );

          // -------------------------------------------------
          // PREVENT EXACT DUPLICATE MEMORY
          // -------------------------------------------------

          const alreadySaved =
            history.some(
              (item) =>
                item.problemTitle ===
                  memory.problemTitle &&
                item.codeSnapshot ===
                  memory.codeSnapshot
            );

          if (alreadySaved) {
            console.log(
              "⚠️ This exact code memory already exists."
            );

            setIsSavingLearning(false);

            alert(
              "🧠 This learning is already saved!"
            );

            return;
          }

          // -------------------------------------------------
          // ADD NEW MEMORY
          // -------------------------------------------------

          const updatedHistory = [
            ...history,
            memory,
          ];

          chrome.storage.local.set(
            {
              patternmind_history:
                updatedHistory,
            },
            () => {
              if (
                chrome.runtime.lastError
              ) {
                console.error(
                  "❌ Storage error:",
                  chrome.runtime.lastError
                );

                setIsSavingLearning(false);

                alert(
                  "❌ Could not save learning memory."
                );

                return;
              }

              console.log(
                "✅ Learning memory saved:",
                memory
              );

              setLearningHistory(
                updatedHistory
              );

              setIsSavingLearning(false);

              alert(
                "🧠 Learning saved successfully!"
              );
            }
          );
        }
      );
    } catch (error) {
      console.error(
        "❌ Learning memory error:",
        error
      );

      setIsSavingLearning(false);

      alert(
        `❌ Could not save learning memory.\n\n${
          error instanceof Error
            ? error.message
            : "Unknown error"
        }`
      );
    }
  };

  // =========================================================
  // ANALYZE MY LOGIC
  // =========================================================

  const analyzeLogic = async () => {
    console.log(
      "🧠 Analyze My Logic clicked"
    );

    setIsAnalyzing(true);
    setAnalysis("");

    // Clear previous hint because
    // we are generating a fresh analysis.
    setHint("");
    setHintLevel(0);

    chrome.storage.local.get(
      [
        "patternmind_problem",
        "patternmind_code",
      ],
      async (result) => {
        const currentProblem =
          result.patternmind_problem as
            | Problem
            | undefined;

        const currentCode =
          result.patternmind_code as
            | StudentCode
            | undefined;

        console.log(
          "📚 Problem:",
          currentProblem
        );

        console.log(
          "💻 Student Code:",
          currentCode
        );

        // ---------------------------------------------------
        // CHECK PROBLEM
        // ---------------------------------------------------

        if (!currentProblem) {
          setAnalysis(
            "❌ No LeetCode problem detected."
          );

          setIsAnalyzing(false);
          return;
        }

        // ---------------------------------------------------
        // CHECK CODE
        // ---------------------------------------------------

        if (
          !currentCode ||
          !currentCode.code
        ) {
          setAnalysis(
            "❌ No student code detected."
          );

          setIsAnalyzing(false);
          return;
        }

        try {
          const response =
            await fetch(
              "http://localhost:3000/analyze-logic",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify({
                  problem:
                    currentProblem,
                  code:
                    currentCode,
                }),
              }
            );

          const data =
            await response.json();

          console.log(
            "🤖 PATTERNMIND BACKEND RESPONSE:",
            data
          );

          if (!response.ok) {
            throw new Error(
              data.error ||
                `Server returned ${response.status}`
            );
          }

          if (data.success) {
            console.log(
              "✅ Analysis received"
            );

            setAnalysis(
              data.analysis
            );
          } else {
            console.error(
              "❌ Backend analysis error:",
              data.error
            );

            setAnalysis(
              `❌ ${
                data.error ||
                "Analysis failed"
              }`
            );
          }
        } catch (error) {
          console.error(
            "❌ PatternMind backend error:",
            error
          );

          setAnalysis(
            `❌ Could not connect to PatternMind backend.\n\n${
              error instanceof Error
                ? error.message
                : ""
            }`
          );
        } finally {
          setIsAnalyzing(false);
        }
      }
    );
  };

  // =========================================================
  // PROGRESSIVE HINT SYSTEM
  //
  // H1 → WHERE
  // H2 → CONCEPT
  // H3 → YOUR HISTORY
  // H4 → BUILD WITH ME
  // H5 → SMALL CODE HELP
  // =========================================================

  const getHint = async () => {
    console.log(
      "💡 Hint clicked"
    );

    const nextLevel =
      hintLevel + 1;

    // -------------------------------------------------------
    // MAXIMUM 5 HINTS
    // -------------------------------------------------------

    if (nextLevel > 5) {
      setHint(
        "🚫 You've reached the maximum hints. Try solving it yourself now!"
      );

      return;
    }

    setIsHinting(true);
    setHint("");

    chrome.storage.local.get(
      [
        "patternmind_problem",
        "patternmind_code",
      ],
      async (result) => {
        const currentProblem =
          result.patternmind_problem as
            | Problem
            | undefined;

        const currentCode =
          result.patternmind_code as
            | StudentCode
            | undefined;

        // ---------------------------------------------------
        // CHECK PROBLEM
        // ---------------------------------------------------

        if (!currentProblem) {
          setHint(
            "❌ No LeetCode problem detected."
          );

          setIsHinting(false);
          return;
        }

        // ---------------------------------------------------
        // CHECK CODE
        // ---------------------------------------------------

        if (
          !currentCode ||
          !currentCode.code
        ) {
          setHint(
            "❌ No student code detected."
          );

          setIsHinting(false);
          return;
        }

        try {
          console.log(
            `💡 Requesting Hint Level ${nextLevel}`
          );

          console.log(
            "🧠 Sending learning history:",
            learningHistory
          );

          // -------------------------------------------------
          // SEND HISTORY TO BACKEND
          // -------------------------------------------------

          const response =
            await fetch(
              "http://localhost:3000/hint",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify({
                  problem:
                    currentProblem,

                  studentCode:
                    currentCode,

                  hintLevel:
                    nextLevel,

                  previousHint:
                    hint,

                  // ⭐ PERSONALIZED LEARNING
                  history:
                    learningHistory,
                }),
              }
            );

          const data =
            await response.json();

          console.log(
            "💡 PATTERNMIND HINT RESPONSE:",
            data
          );

          if (!response.ok) {
            throw new Error(
              data.error ||
                `Server returned ${response.status}`
            );
          }

          if (data.success) {
            console.log(
              `✅ Hint ${nextLevel} received`
            );

            setHintLevel(
              nextLevel
            );

            setHint(
              data.hint
            );
          } else {
            setHint(
              `❌ ${
                data.error ||
                "Hint generation failed"
              }`
            );
          }
        } catch (error) {
          console.error(
            "❌ PatternMind hint error:",
            error
          );

          setHint(
            `❌ Could not connect to PatternMind backend.\n\n${
              error instanceof Error
                ? error.message
                : ""
            }`
          );
        } finally {
          setIsHinting(false);
        }
      }
    );
  };

  // =========================================================
  // GET HINT BUTTON LABEL
  // =========================================================

  const getHintButtonLabel = () => {
    if (isHinting) {
      return "Thinking...";
    }

    if (hintLevel === 0) {
      return "💡 Hint 1";
    }

    if (hintLevel === 1) {
      return "🧠 Hint 2";
    }

    if (hintLevel === 2) {
      return "🔗 Hint 3";
    }

    if (hintLevel === 3) {
      return "🛠️ Hint 4";
    }

    if (hintLevel === 4) {
      return "💻 Hint 5";
    }

    return "🚫 Hints Used";
  };

  // =========================================================
  // HINT DESCRIPTION
  // =========================================================

  const getHintType = () => {
    if (hintLevel === 1) {
      return "👀 Where should I look?";
    }

    if (hintLevel === 2) {
      return "🧠 What concept should I think about?";
    }

    if (hintLevel === 3) {
      return "🔗 Connect with YOUR history";
    }

    if (hintLevel === 4) {
      return "🛠️ Build it with me";
    }

    if (hintLevel === 5) {
      return "💻 Small code help";
    }

    return "";
  };

  // =========================================================
  // UI
  // =========================================================

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "20px",
        boxSizing: "border-box",
        fontFamily: "Arial, sans-serif",
        background: "#f8fafc",
        color: "#111827",
      }}
    >
      {/* =====================================================
          HEADER
      ===================================================== */}

      <h1
        style={{
          marginTop: 0,
          marginBottom: "6px",
        }}
      >
        PatternMind AI
      </h1>

      <p
        style={{
          color: "#6b7280",
          marginTop: 0,
        }}
      >
        Your AI Coding Mentor
      </p>

      {/* =====================================================
          LEARNING COUNTER
      ===================================================== */}

      <p
        style={{
          color: "#6b7280",
          fontSize: "13px",
        }}
      >
        🧠 Learning memories:{" "}
        {learningHistory.length}
      </p>

      <hr />

      {/* =====================================================
          NO PROBLEM
      ===================================================== */}

      {!problem ? (
        <div>
          <h3>
            No problem detected
          </h3>

          <p
            style={{
              color: "#6b7280",
            }}
          >
            Open a LeetCode problem
            to get started.
          </p>
        </div>
      ) : (
        <div>
          {/* =================================================
              PROBLEM
          ================================================= */}

          <h2>
            {problem.title}
          </h2>

          <p>
            <strong>
              Difficulty:
            </strong>{" "}
            {problem.difficulty}
          </p>

          {/* =================================================
              PROBLEM DESCRIPTION
          ================================================= */}

          <div
            style={{
              marginTop: "20px",
              padding: "15px",
              background: "white",
              borderRadius: "10px",
              border:
                "1px solid #e5e7eb",
            }}
          >
            <h3>
              Problem Description
            </h3>

            <p
              style={{
                lineHeight: 1.6,
              }}
            >
              {problem.description}
            </p>
          </div>

          {/* =================================================
              CURRENT CODE
          ================================================= */}

          {code && (
            <div
              style={{
                marginTop: "20px",
                padding: "15px",
                background: "#111827",
                color: "#f9fafb",
                borderRadius: "10px",
                overflow: "auto",
              }}
            >
              <h3>
                Your Current Code
              </h3>

              <div
                style={{
                  color: "#9ca3af",
                  marginBottom: "10px",
                }}
              >
                Language:{" "}
                {code.language}
              </div>

              <pre
                style={{
                  whiteSpace:
                    "pre-wrap",
                  fontFamily:
                    "monospace",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {code.code}
              </pre>
            </div>
          )}

          {/* =================================================
              ACTION BUTTONS
          ================================================= */}

          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "20px",
              flexWrap: "wrap",
            }}
          >
            {/* ANALYZE BUTTON */}

            <button
              onClick={analyzeLogic}
              disabled={isAnalyzing}
              style={{
                padding:
                  "11px 16px",
                border: "none",
                borderRadius: "8px",
                cursor:
                  isAnalyzing
                    ? "not-allowed"
                    : "pointer",
                background:
                  isAnalyzing
                    ? "#9ca3af"
                    : "#111827",
                color: "white",
                fontWeight: "600",
              }}
            >
              {isAnalyzing
                ? "Analyzing..."
                : "🧠 Analyze My Logic"}
            </button>

            {/* HINT BUTTON */}

            <button
              onClick={getHint}
              disabled={
                isHinting ||
                hintLevel >= 5
              }
              style={{
                padding:
                  "11px 16px",
                border: "none",
                borderRadius: "8px",
                cursor:
                  isHinting ||
                  hintLevel >= 5
                    ? "not-allowed"
                    : "pointer",
                background:
                  isHinting ||
                  hintLevel >= 5
                    ? "#9ca3af"
                    : "#e5e7eb",
                color:
                  "#111827",
                fontWeight: "600",
              }}
            >
              {getHintButtonLabel()}
            </button>

            {/* SAVE LEARNING BUTTON */}

            {analysis && (
              <button
                onClick={
                  saveLearningMemory
                }
                disabled={
                  isSavingLearning
                }
                style={{
                  padding:
                    "11px 16px",
                  border: "none",
                  borderRadius:
                    "8px",
                  cursor:
                    isSavingLearning
                      ? "not-allowed"
                      : "pointer",
                  background:
                    isSavingLearning
                      ? "#9ca3af"
                      : "#dcfce7",
                  color:
                    "#166534",
                  fontWeight:
                    "600",
                }}
              >
                {isSavingLearning
                  ? "Saving..."
                  : "🧠 Save Learning"}
              </button>
            )}
          </div>

          {/* =================================================
              HINT DISPLAY
          ================================================= */}

          {hint && (
            <div
              style={{
                marginTop: "20px",
                padding: "16px",
                background:
                  "#fff7ed",
                borderRadius:
                  "12px",
                border:
                  "1px solid #fed7aa",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: "6px",
                }}
              >
                💡 Hint Level{" "}
                {hintLevel}
              </h3>

              <p
                style={{
                  marginTop: 0,
                  marginBottom:
                    "12px",
                  fontSize: "13px",
                  color: "#9a3412",
                  fontWeight: "600",
                }}
              >
                {getHintType()}
              </p>

             <div
  style={{
    lineHeight: 1.6,
    fontSize: "14px",
    color: "#374151",
  }}
>
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      code({ className, children, ...props }) {
        const isBlock = !!className;

        if (!isBlock) {
          return (
            <code
              style={{
                background: "#f3f4f6",
                padding: "2px 5px",
                borderRadius: "4px",
                fontFamily: "monospace",
                fontSize: "13px",
              }}
              {...props}
            >
              {children}
            </code>
          );
        }

        return (
          <code
            className={className}
            style={{
              fontFamily: "monospace",
              fontSize: "13px",
            }}
            {...props}
          >
            {children}
          </code>
        );
      },

      pre({ children }) {
        return (
          <pre
            style={{
              background: "#111827",
              color: "#f9fafb",
              padding: "12px",
              borderRadius: "8px",
              overflowX: "auto",
              marginTop: "10px",
              marginBottom: "10px",
            }}
          >
            {children}
          </pre>
        );
      },
    }}
  >
    {hint}
  </ReactMarkdown>
</div>
            </div>
          )}

          {/* =================================================
              AI ANALYSIS
          ================================================= */}

          {analysis && (
            <div
              style={{
                marginTop: "25px",
                padding: "18px",
                background: "white",
                borderRadius: "12px",
                border:
                  "1px solid #dbe1ea",
                boxShadow:
                  "0 2px 8px rgba(0,0,0,0.05)",
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                  marginBottom:
                    "15px",
                }}
              >
                🧠 Logic Analysis
              </h2>

              <div
                style={{
                  whiteSpace:
                    "pre-wrap",
                  fontFamily:
                    "Arial, sans-serif",
                  lineHeight: 1.7,
                  fontSize: "14px",
                  color: "#374151",
                }}
              >
                {analysis}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;