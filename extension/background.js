// The toolbar button opens the side panel. A side panel, unlike a popup, stays
// open while you click around the page, so a long extraction is not cut short.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
