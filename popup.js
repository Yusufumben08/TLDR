document.addEventListener("DOMContentLoaded", () => {
  const questionInput = document.getElementById("question");
  const askButton = document.getElementById("askBtn");
  const responseBox = document.getElementById("responseBox");
  const questionBox = document.getElementById("questionBox");
  const apiBox = document.getElementById("apibox");
  const setKeyBtn = document.getElementById("setKeyBtn");
  let pageContext = "";
  let pageSummary = "";

  const content = document.getElementById("content");
  const myButton = document.getElementById("testbtn");
  const keyInput = document.getElementById("OPENROUTER_API_KEY");

  chrome.storage.local.get(["openrouterKey"], result => {
    if (result.openrouterKey) {
      keyInput.value = result.openrouterKey;
      apiBox.style.display = "none";
      myButton.style.display = "block";
    }
    else {
      questionBox.style.display = "none";
      apiBox.style.display = "block";
      myButton.style.display = "none";
    }
  });

  setKeyBtn.addEventListener("click", () => {
    const value = keyInput.value.trim();
    chrome.storage.local.set({ openrouterKey: value });
    window.location.reload();
  });


  myButton.addEventListener("click", async () => {

    const OPENROUTER_API_KEY = keyInput.value.trim();

    if (!OPENROUTER_API_KEY) {
      content.textContent = "Please enter your API key.";
      return;
    }

    questionBox.style.display = "block";
    myButton.style.display = "none";

    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: evaluatecontent
    });

    const text = injected?.[0]?.result;

    if (!text || isHumanReadable(text) === false) {
      content.textContent = "No readable content found on this page.";
      return;
    }
    console.log("Extracted text:", text);
    const summary = await summarizeText(text, OPENROUTER_API_KEY);
    pageContext = text;
    pageSummary = summary;

    responseBox.textContent = summary;
    askButton.disabled = false;
  });

  askButton.addEventListener("click", async () => {
    const question = questionInput.value.trim();
    if (!question || !pageContext) return;

    const OPENROUTER_API_KEY = keyInput.value.trim();

    const prompt = `
      You are answering questions about this webpage that has its data scraped and turned into text. 
      You are allowed to quote parts of the text to support your answers. If you do, please quote it with double stars(**like this**). Do not use any quotation marks.
      If the answer is not contained in the text, please say "Not enough information to answer the question.".
      Please keep your answers concise and to the point. It should be no longer than 3 sentences. You should not quote different parts of the text at the same time, and dont quote too much text.

      PAGE CONTENT:
      ${pageContext}

      SUMMARY:
      ${pageSummary}

      USER QUESTION:
      ${question}
      `;

    const answer = await askAI(prompt, OPENROUTER_API_KEY);
    console.log("ai answer:", answer); //remove this later
    const matches = [...answer.matchAll(/\*\*(.*?)\*\*/g)].map(m => m[1]);
    responseBox.textContent = answer;
    console.log("matches:", matches);
    for (const match of matches) {
      highlightTextOnPage(match);
      console.log("matched:", match)
    }

  });


});

function evaluatecontent() {
  return new Promise(resolve => {

    const isVisible = el => {
      const style = window.getComputedStyle(el);
      return style && style.display !== "none" && style.visibility !== "hidden";
    };

    const badTags = new Set([
      "SCRIPT", "STYLE", "NOSCRIPT", "SVG", "CANVAS", "FOOTER",
      "HEADER", "NAV", "ASIDE", "FORM", "BUTTON", "INPUT"
    ]);

    let text = "";

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT
    );

    let node;

    while (node = walker.nextNode()) {
      if (badTags.has(node.tagName)) continue;
      if (!isVisible(node)) continue;

      const t = node.innerText?.trim();
      if (!t) continue;

      
      if (t.length < 60) continue;
      if (t.split(" ").length < 8) continue;
      if (/[{}<>;]/.test(t)) continue;
      if (/function\s*\(|const\s+|var\s+|let\s+/.test(t)) continue;

      text += t + "\n\n";
    }

    resolve(text);
  });
}




async function summarizeText(text, OPENROUTER_API_KEY) {

  const url = "https://openrouter.ai/api/v1/chat/completions";

  const payload = {
    model: "xiaomi/mimo-v2-flash:free",
    messages: [
      {
        role: "user",
        content: `
        This text is a webpage. It may have strange characters, formatting, ads and various unneccesary stuff. Please ignore those and focus on the actual helpful main content. You dont need to quote anything here.
        Please summarise the contents of the webpage, in just a couple sentences:\n\n${text}`
      }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter error: ${response.status} — ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No summary returned.";
}

async function askAI(prompt, OPENROUTER_API_KEY) {
  const payload = {
    model: "xiaomi/mimo-v2-flash:free",
    messages: [{ role: "user", content: prompt }]
  };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response.";
}

function isHumanReadable(text) {
  const cleaned = text.replace(/[\x20-\x7E\n\r\t]/g, "");
  const readabilityRatio = cleaned.length / text.length;
  return readabilityRatio < 0.05;
}

function highlightTextOnPage(text) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {

    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      args: [text],
      function: phrase => {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "i");

        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT
        );

        let node;
        document.querySelectorAll("mark").forEach(m => {
          m.replaceWith(...m.childNodes);
        });

        while (node = walker.nextNode()) {
          const match = node.nodeValue.match(regex);
          if (!match) continue;

          const range = document.createRange();

          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);

          const span = document.createElement("span");
          span.textContent = match[0];
          span.style.background = "#ffe066";
          span.style.color = "#000";
          span.style.padding = "2px 3px";
          span.style.borderRadius = "4px";
          const after = node.splitText(match.index);
          after.splitText(match[0].length);
          after.parentNode.replaceChild(span, after);

          node.parentElement.scrollIntoView({ behavior: "smooth", block: "center" });
          break;
        }
      }
    });
  });
}


