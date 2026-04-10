chrome.runtime.onInstalled.addListener(function (details) {
	if (details.reason !== 'install') {
		return;
	}

	chrome.tabs.create({
		url: 'https://timleland.com/json-viewer-extension/',
	});
});
