//Set browser for Firefox extensions to be chrome
if (typeof browser !== 'undefined') {
	window.chrome = browser;
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onInstalled) {
	chrome.runtime.onInstalled.addListener(function (details) {
		if (details.reason == 'install') {
			chrome.tabs.create({
				url: 'https://timleland.com/json-viewer-extension/',
			});
		} else if (details.reason == 'update') {
		}
	});
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.setUninstallURL) {
	chrome.runtime.setUninstallURL('https://timleland.com/extensions/');
}
