/**
 * MTS Background Service Worker
 * Handles extension icon click to open options page
 */

// Open options page when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('options.html')
  });
});
