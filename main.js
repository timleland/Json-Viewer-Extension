$(function () {
	function renderJson() {
		var bodyText = $('body').text();
		if (document.contentType == 'application/json' || (document.contentType == 'application/javascript' && JSON.parse(bodyText)) || (document.contentType == 'text/plain' && JSON.parse(bodyText))) {
			try {
				$('body').attr('id', 'json-viewer-body').html('<pre id="json-renderer"></pre>');
				var input = eval('(' + bodyText + ')');
				$('#json-renderer').jsonViewer(input, { rootCollapsable: false, collapsed: false, withQuotes: true, withLinks: true });
			} catch (error) {
				return console.log('Cannot parse JSON: ' + error);
			}
		}
	}

	renderJson();
});
