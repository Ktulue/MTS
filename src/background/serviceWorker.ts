/**
 * HC Background Service Worker
 * Handles extension icon click to open options page
 */

// Open options page when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('options.html')
  });
});

// Open options page on fresh install for onboarding
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('options.html')
    });
  }
});
