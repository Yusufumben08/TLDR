document.addEventListener("DOMContentLoaded", () => {

  const content   = document.getElementById("content");
  const myButton  = document.getElementById("testbtn");
  const keyInput  = document.getElementById("OPENROUTER_API_KEY");

  chrome.storage.local.get(["openrouterKey"], result => {
    if (result.openrouterKey) {
      keyInput.value = result.openrouterKey;
    }
  });

  keyInput.addEventListener("input", () => {
    const value = keyInput.value.trim();
    chrome.storage.local.set({ openrouterKey: value });
  });


  myButton.addEventListener("click", async () => {

    const OPENROUTER_API_KEY = keyInput.value.trim();

    if (!OPENROUTER_API_KEY) {
      content.textContent = "Please enter your API key.";
      return;
    }

    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: evaluatecontent
    });

    const text = injected?.[0]?.result;

    if (!text || text.length < 100) {
      content.textContent = "No readable content found on this page.";
      return;
    }
    console.log("Extracted text:", text);
    const summary = await summarizeText(text, OPENROUTER_API_KEY);

    content.textContent = summary;
  });

}); 

function evaluatecontent() {
  return new Promise(resolve => {
    const run = () => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );

      let text = "", node;

      while (node = walker.nextNode()) {
        const t = node.nodeValue.trim();
        if (t.length > 40) text += t + "\n";
      }

      resolve(text);
    };

    if (document.readyState === "complete") run();
    else window.addEventListener("load", run);
  });
}



async function summarizeText(text, OPENROUTER_API_KEY) {

  const url = "https://openrouter.ai/api/v1/chat/completions";

  const payload = {
    model: "xiaomi/mimo-v2-flash:free",
    messages: [
      {
        role: "user",
        content: `This text is taken from a webpage. Please summarise the contents of the webpage, in just a couple sentences:\n\n${text}`
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
