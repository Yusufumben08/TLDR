//code to get stuff from the current web page
function getpagetext() {
  for (const div of document.querySelectorAll('div')) {
    if (div.textContent.includes('lorem')) {
      return div.textContent;
    }
  }
  return null;
};



chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageText") {
    const pageText = getpagetext();
    sendResponse({ text: pageText });
  }
  return true;
});

