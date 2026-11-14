console.log("🚀 PatternMind content.js loaded");

let lastUrl = window.location.href;
let lastProblemKey = "";

// ============================================================
// CURRENT PROBLEM DETECTION
// ============================================================

function getProblemData() {
  const pageText = document.body.innerText;

  // Find title + difficulty
  const match = pageText.match(
    /(?:^|\n)(\d+\.\s+[^\n]+)\n(Easy|Medium|Hard)\n/
  );

  if (!match) {
    return null;
  }

  const title = match[1].trim();
  const difficulty = match[2];

  // Get text after difficulty
  const startIndex = match.index + match[0].length;
  const remainingText = pageText.slice(startIndex);

  // Find where the actual description ends
  const endMarkers = [
    "\n\nExample 1:",
    "\nExample 1:",
    "\n\nConstraints:",
    "\nConstraints:",
    "\n\nSeen this question"
  ];

  let description = remainingText;

  for (const marker of endMarkers) {
    const index = description.indexOf(marker);

    if (index !== -1) {
      description = description.substring(0, index);
      break;
    }
  }

  // Remove unwanted navigation text
  description = description
    .replace(/^Topics\s+Companies\s+/i, "")
    .trim();

  return {
    title,
    difficulty,
    description,
    url: window.location.href
  };
}

function detectProblem() {
  const problem = getProblemData();

  if (!problem) {
    console.log("⏳ Problem not ready yet...");
    return;
  }

  const problemKey = `${problem.url}|${problem.title}`;

  // Don't save exact same problem repeatedly
  if (problemKey === lastProblemKey) {
    return;
  }

  lastProblemKey = problemKey;

  console.log("🧠 PATTERNMIND PROBLEM DETECTED");
  console.log(problem);

  chrome.storage.local.set(
    {
      patternmind_problem: problem
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error(
          "❌ Storage error:",
          chrome.runtime.lastError
        );
        return;
      }

      console.log("✅ Updated PatternMind problem");
    }
  );
}

// ============================================================
// LEETCODE PRACTICE HISTORY SYNC
// ============================================================

function isProgressPage() {
  return window.location.pathname.startsWith("/progress");
}

function normalizeProblemTitle(title) {
  return title
    .replace(/\s+/g, " ")
    .trim();
}

function extractProblemNumber(title) {
  const match = title.match(/^(\d+)\./);

  if (!match) {
    return "";
  }

  return match[1];
}

function extractLeetCodeHistory() {
  if (!isProgressPage()) {
    return [];
  }

  console.log("📚 PatternMind scanning LeetCode Practice History...");

  const results = [];

  // ----------------------------------------------------------
  // Find all problem links
  // ----------------------------------------------------------

  const links = document.querySelectorAll(
    'a[href*="/problems/"]'
  );

  links.forEach((link) => {
    const anchor = link;

    const title = normalizeProblemTitle(
      anchor.textContent || ""
    );

    const href = anchor.href || "";

    // Ignore empty/non-problem links
    if (!title || !href.includes("/problems/")) {
      return;
    }

    // Ignore navigation-like links
    if (
      title.length < 3 ||
      title.toLowerCase() === "problems"
    ) {
      return;
    }

    // --------------------------------------------------------
    // Find nearby row text
    // --------------------------------------------------------

    let rowText = "";

    const row =
      anchor.closest("tr") ||
      anchor.closest("li") ||
      anchor.closest('[role="row"]') ||
      anchor.parentElement?.parentElement ||
      anchor.parentElement;

    if (row) {
      rowText = normalizeProblemTitle(
        row.innerText || ""
      );
    }

    // --------------------------------------------------------
    // Difficulty
    // --------------------------------------------------------

    let difficulty = "";

    const difficultyMatch = rowText.match(
      /\b(Easy|Medium|Hard)\b/i
    );

    if (difficultyMatch) {
      difficulty =
        difficultyMatch[1].charAt(0).toUpperCase() +
        difficultyMatch[1].slice(1).toLowerCase();
    }

    // --------------------------------------------------------
    // Result / status
    // --------------------------------------------------------

    let status = "";

    if (/\bAccepted\b/i.test(rowText)) {
      status = "Accepted";
    } else if (/\bWrong Answer\b/i.test(rowText)) {
      status = "Wrong Answer";
    } else if (/\bTime Limit Exceeded\b/i.test(rowText)) {
      status = "Time Limit Exceeded";
    } else if (/\bRuntime Error\b/i.test(rowText)) {
      status = "Runtime Error";
    } else if (/\bCompile Error\b/i.test(rowText)) {
      status = "Compile Error";
    }

    // --------------------------------------------------------
    // Only keep useful problem entries
    // --------------------------------------------------------

    const problemNumber =
      extractProblemNumber(title);

    const key = `${problemNumber}|${title}`;

    if (!results.some((item) => item.key === key)) {
      results.push({
        key,
        problemNumber,
        problemTitle: title,
        problemUrl: href,
        difficulty,
        status,
        source: "leetcode-progress",
        syncedAt: Date.now()
      });
    }
  });

  console.log(
    `📚 Found ${results.length} LeetCode history entries`
  );

  return results;
}

// ============================================================
// SAVE LEETCODE HISTORY
// ============================================================

function syncLeetCodeHistory() {
  if (!isProgressPage()) {
    return;
  }

  const detectedHistory =
    extractLeetCodeHistory();

  if (detectedHistory.length === 0) {
    console.log(
      "⏳ No LeetCode history detected yet..."
    );

    return;
  }

  chrome.storage.local.get(
    ["patternmind_leetcode_history"],
    (result) => {
      if (chrome.runtime.lastError) {
        console.error(
          "❌ Could not read LeetCode history storage:",
          chrome.runtime.lastError
        );

        return;
      }

      const existing =
        result.patternmind_leetcode_history || [];

      const historyMap = new Map();

      // Existing history first
      existing.forEach((item) => {
        const key =
          item.key ||
          `${item.problemNumber || ""}|${item.problemTitle || ""}`;

        historyMap.set(key, item);
      });

      // New detected history
      detectedHistory.forEach((item) => {
        const oldItem =
          historyMap.get(item.key);

        historyMap.set(
          item.key,
          {
            ...oldItem,
            ...item,
            syncedAt: Date.now()
          }
        );
      });

      const updatedHistory =
        Array.from(historyMap.values());

      chrome.storage.local.set(
        {
          patternmind_leetcode_history:
            updatedHistory
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(
              "❌ Failed to save LeetCode history:",
              chrome.runtime.lastError
            );

            return;
          }

          console.log(
            "✅ PatternMind LeetCode history synced:",
            updatedHistory.length,
            "problems"
          );

          console.log(
            "📚 History:",
            updatedHistory
          );
        }
      );
    }
  );
}

// ============================================================
// INITIAL DETECTION
// ============================================================

setTimeout(() => {
  detectProblem();
  syncLeetCodeHistory();
}, 3000);

// ============================================================
// CHECK FOR LEETCODE SPA NAVIGATION
// ============================================================

setInterval(() => {
  const currentUrl =
    window.location.href;

  if (currentUrl !== lastUrl) {
    console.log(
      "🔄 LeetCode page changed"
    );

    lastUrl = currentUrl;
    lastProblemKey = "";

    // Give LeetCode time to render
    setTimeout(() => {
      detectProblem();
      syncLeetCodeHistory();
    }, 2000);
  }
}, 1000);

// ============================================================
// PERIODIC CHECK
// ============================================================

setInterval(() => {
  detectProblem();

  if (isProgressPage()) {
    syncLeetCodeHistory();
  }
}, 5000);

// ============================================================
// RECEIVE STUDENT CODE FROM PAGE BRIDGE
// ============================================================

window.addEventListener(
  "message",
  (event) => {
    if (event.source !== window) {
      return;
    }

    if (!event.data) {
      return;
    }

    if (
      event.data.source !==
      "patternmind-page"
    ) {
      return;
    }

    if (
      event.data.type !==
      "CODE_UPDATE"
    ) {
      return;
    }

    const codeData =
      event.data.data;

    console.log(
      "💻 PATTERNMIND CODE RECEIVED:",
      codeData
    );

    chrome.storage.local.set(
      {
        patternmind_code: codeData
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "❌ Code storage error:",
            chrome.runtime.lastError
          );

          return;
        }

        console.log(
          "✅ Student code saved"
        );
      }
    );
  }
);