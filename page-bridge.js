console.log("🌉 PatternMind page bridge loaded");

let lastCode = "";

function getCurrentEditorCode() {
  if (
    typeof monaco === "undefined" ||
    !monaco.editor
  ) {
    return null;
  }

  const editors = monaco.editor.getEditors();

  if (!editors || editors.length === 0) {
    return null;
  }

  const editor = editors.find((editor) => {
    const model = editor.getModel();

    return (
      model &&
      model.getLanguageId() !== "plaintext"
    );
  });

  if (!editor) {
    return null;
  }

  const model = editor.getModel();

  return {
    language: model.getLanguageId(),
    code: model.getValue()
  };
}

function sendCode() {
  const codeData = getCurrentEditorCode();

  if (!codeData || !codeData.code) {
    return;
  }

  if (codeData.code === lastCode) {
    return;
  }

  lastCode = codeData.code;

  console.log(
    "💻 PatternMind code detected:",
    codeData
  );

  window.postMessage(
    {
      source: "patternmind-page",
      type: "CODE_UPDATE",
      data: codeData
    },
    "*"
  );
}

// Wait for Monaco to be ready
const codeDetectionInterval = setInterval(() => {
  if (
    typeof monaco !== "undefined" &&
    monaco.editor
  ) {
    sendCode();

    clearInterval(codeDetectionInterval);

    // Check periodically for editor changes
    setInterval(sendCode, 1000);
  }
}, 1000);