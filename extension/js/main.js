(function () {
	const MAX_AUTO_PARSE_CHARS = 3_000_000;
	const AUTO_COLLAPSE_CHARS = 250_000;
	const LARGE_COLLECTION_SIZE = 100;
	const THEME_STORAGE_KEY = 'json-viewer-theme';
	const nodeState = new WeakMap();

	function normalizeContentType(contentType) {
		return (contentType || '').split(';')[0].trim().toLowerCase();
	}

	function isSupportedContentType(contentType) {
		return contentType === 'application/json' || /\+json$/.test(contentType) || contentType === 'application/javascript' || contentType === 'text/plain';
	}

	function looksLikeJson(bodyText) {
		const trimmed = (bodyText || '').trim();
		return trimmed.startsWith('{') || trimmed.startsWith('[');
	}

	function formatNumber(value) {
		return value.toLocaleString();
	}

	function isObject(value) {
		return value !== null && typeof value === 'object' && !Array.isArray(value);
	}

	function isCollapsible(value) {
		return Array.isArray(value) ? value.length > 0 : isObject(value) ? Object.keys(value).length > 0 : false;
	}

	function getCollectionSize(value) {
		return Array.isArray(value) ? value.length : Object.keys(value).length;
	}

	function getCollectionLabel(value) {
		const count = getCollectionSize(value);
		return count === 1 ? '1 item' : formatNumber(count) + ' items';
	}

	function createElement(tagName, className, textContent) {
		const element = document.createElement(tagName);

		if (className) {
			element.className = className;
		}

		if (textContent !== undefined) {
			element.textContent = textContent;
		}

		return element;
	}

	function createToast() {
		const toast = createElement('div', 'json-viewer__toast');
		toast.setAttribute('aria-live', 'polite');
		toast.setAttribute('role', 'status');
		toast.hidden = true;
		return toast;
	}

	function hideToast(toast) {
		window.clearTimeout(toast.hideTransitionTimer);
		toast.classList.remove('is-visible');
		toast.hideTransitionTimer = window.setTimeout(function () {
			toast.hidden = true;
		}, 180);
	}

	function showToast(toast, message, tone) {
		window.clearTimeout(toast.hideTimer);
		window.clearTimeout(toast.hideTransitionTimer);
		toast.textContent = message;
		toast.dataset.tone = tone || 'success';
		toast.hidden = false;

		window.requestAnimationFrame(function () {
			toast.classList.add('is-visible');
		});

		toast.hideTimer = window.setTimeout(function () {
			hideToast(toast);
		}, 1800);
	}

	function getStoredTheme() {
		try {
			const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
			return theme === 'light' || theme === 'dark' ? theme : null;
		} catch (error) {
			return null;
		}
	}

	function getPreferredTheme() {
		const storedTheme = getStoredTheme();
		if (storedTheme) {
			return storedTheme;
		}

		return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}

	function applyTheme(theme) {
		document.body.dataset.theme = theme;
	}

	function persistTheme(theme) {
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, theme);
		} catch (error) {
			// Ignore storage failures so the viewer still works in restricted contexts.
		}
	}

	function updateThemeButton(button, theme) {
		const nextTheme = theme === 'dark' ? 'light' : 'dark';
		const label = 'Switch to ' + nextTheme + ' mode';
		const iconMarkup =
			nextTheme === 'dark'
				? '<span class="json-viewer__theme-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.5 1.5a5.75 5.75 0 1 0 4 9.88A6.5 6.5 0 1 1 10.5 1.5Z" fill="currentColor"/></svg></span>'
				: '<span class="json-viewer__theme-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>';
		button.innerHTML = iconMarkup;
		button.setAttribute('aria-label', label);
		button.setAttribute('title', label);
	}

	function getToolbarButtonIconMarkup(iconName) {
		const icons = {
			copy: '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5.2" y="4.2" width="7.3" height="8.3" rx="1.4" stroke="currentColor" stroke-width="1.4"/><path d="M4.5 11.3H3.7c-.8 0-1.5-.7-1.5-1.5V3.7c0-.8.7-1.5 1.5-1.5h5.1c.8 0 1.5.7 1.5 1.5V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
			download: '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2.5v6.5M5.5 6.8 8 9.5l2.5-2.7M3 12.5h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
			error: '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2.2 13.2 12a1 1 0 0 1-.88 1.5H3.68A1 1 0 0 1 2.8 12L8 2.2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 5.6v3.2M8 11.2h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
			parsed: '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.2 2.5C3.9 2.9 3.4 3.8 3.4 5.2v1.1c0 .9-.3 1.5-1 1.7.7.2 1 .8 1 1.7v1.1c0 1.4.5 2.3 1.8 2.7M10.8 2.5c1.3.4 1.8 1.3 1.8 2.7v1.1c0 .9.3 1.5 1 1.7-.7.2-1 .8-1 1.7v1.1c0 1.4-.5 2.3-1.8 2.7M7.1 5.2h1.8M7.1 8h1.8M7.1 10.8h1.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
			raw: '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 3 3 8l3 5M10 3l3 5-3 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
			success: '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 8.3 6.4 11 12.5 4.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		};

		return '<span class="json-viewer__button-icon" aria-hidden="true">' + icons[iconName] + '</span>';
	}

	function setToolbarButtonContent(button, iconName, label) {
		button.innerHTML = getToolbarButtonIconMarkup(iconName) + '<span class="json-viewer__button-label">' + label + '</span>';
	}

	function getDownloadFilename() {
		const path = window.location.pathname || '';
		const lastSegment = path.split('/').pop() || 'response';
		const sanitized = lastSegment.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'response';

		return /\.json$/i.test(sanitized) ? sanitized : sanitized + '.json';
	}

	function downloadTextFile(text, filename) {
		const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
		const blobUrl = window.URL.createObjectURL(blob);
		const link = createElement('a');

		link.href = blobUrl;
		link.download = filename;
		link.hidden = true;
		document.body.append(link);
		link.click();
		link.remove();
		window.setTimeout(function () {
			window.URL.revokeObjectURL(blobUrl);
		}, 0);
	}

	function createQuotedText(text, className) {
		const fragment = document.createDocumentFragment();
		fragment.append('"');

		const value = createElement('span', className, text);
		fragment.append(value);
		fragment.append('"');

		return fragment;
	}

	function createKeyElement(key) {
		if (key === null) {
			return null;
		}

		const keyWrapper = createElement('span', 'json-viewer__key-wrap');
		keyWrapper.append(createQuotedText(String(key), 'json-viewer__key'));
		keyWrapper.append(': ');
		return keyWrapper;
	}

	function createPrimitiveValue(value) {
		if (typeof value === 'string') {
			const valueElement = createElement('span', 'json-viewer__string');
			valueElement.append(createQuotedText(value, 'json-viewer__string-value'));
			return valueElement;
		}

		if (typeof value === 'number') {
			return createElement('span', 'json-viewer__number', String(value));
		}

		if (typeof value === 'boolean') {
			return createElement('span', 'json-viewer__boolean', String(value));
		}

		return createElement('span', 'json-viewer__null', 'null');
	}

	function setNodeCollapsed(node, collapsed) {
		const state = nodeState.get(node);
		if (!state) {
			return;
		}

		node.dataset.collapsed = collapsed ? 'true' : 'false';
		state.toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
		state.toggle.setAttribute('aria-label', collapsed ? 'Expand node' : 'Collapse node');
		state.children.hidden = collapsed;
		state.closing.hidden = collapsed;
		state.summary.hidden = !collapsed;
	}

	function renderNodeChildren(node, context) {
		const state = nodeState.get(node);
		if (!state || state.hydrated) {
			return;
		}

		const fragment = document.createDocumentFragment();
		const childContext = {
			defaultCollapsed: context.defaultCollapsed,
			bodyLength: context.bodyLength,
		};

		if (state.type === 'array') {
			state.value.forEach(function (childValue, index) {
				fragment.append(buildNode(index, childValue, state.depth + 1, childContext));
			});
		} else {
			Object.keys(state.value).forEach(function (key) {
				fragment.append(buildNode(key, state.value[key], state.depth + 1, childContext));
			});
		}

		state.children.append(fragment);
		state.hydrated = true;
	}

	function toggleNode(node, context, forceCollapsed) {
		const state = nodeState.get(node);
		if (!state) {
			return;
		}

		const shouldCollapse = forceCollapsed !== undefined ? forceCollapsed : node.dataset.collapsed !== 'true';
		if (!shouldCollapse) {
			renderNodeChildren(node, context);
		}

		setNodeCollapsed(node, shouldCollapse);
	}

	function buildLeafNode(key, value, depth) {
		const line = createElement('div', 'json-viewer__line');
		const node = createElement('div', 'json-viewer__node');
		node.style.setProperty('--json-indent', String(depth));

		const spacer = createElement('span', 'json-viewer__spacer');
		line.append(spacer);

		const keyElement = createKeyElement(key);
		if (keyElement) {
			line.append(keyElement);
		}

		line.append(createPrimitiveValue(value));
		node.append(line);

		return node;
	}

	function shouldStartCollapsed(value, depth, context) {
		if (!isCollapsible(value)) {
			return false;
		}

		return context.defaultCollapsed || (depth > 0 && getCollectionSize(value) >= LARGE_COLLECTION_SIZE);
	}

	function buildNode(key, value, depth, context) {
		if (!isCollapsible(value)) {
			return buildLeafNode(key, value, depth);
		}

		const type = Array.isArray(value) ? 'array' : 'object';
		const openToken = type === 'array' ? '[' : '{';
		const closeToken = type === 'array' ? ']' : '}';
		const collapsed = shouldStartCollapsed(value, depth, context);

		const node = createElement('div', 'json-viewer__node');
		const line = createElement('div', 'json-viewer__line');
		const toggle = createElement('button', 'json-viewer__toggle');
		const summary = createElement('button', 'json-viewer__summary', openToken + ' ' + getCollectionLabel(value) + ' ' + closeToken);
		const open = createElement('span', 'json-viewer__brace', openToken);
		const children = createElement('div', 'json-viewer__children');
		const closing = createElement('div', 'json-viewer__line json-viewer__line--closing', closeToken);

		node.style.setProperty('--json-indent', String(depth));
		toggle.type = 'button';
		toggle.setAttribute('aria-label', collapsed ? 'Expand node' : 'Collapse node');
		toggle.dataset.role = 'toggle';
		toggle.innerHTML = '<span aria-hidden="true"></span>';

		summary.type = 'button';
		summary.dataset.role = 'toggle';

		const keyElement = createKeyElement(key);
		line.append(toggle);
		if (keyElement) {
			line.append(keyElement);
		}
		line.append(open, summary);

		node.append(line, children, closing);

		nodeState.set(node, {
			children: children,
			closing: closing,
			depth: depth,
			hydrated: false,
			summary: summary,
			toggle: toggle,
			type: type,
			value: value,
		});

		if (!collapsed) {
			renderNodeChildren(node, context);
		}
		setNodeCollapsed(node, collapsed);

		return node;
	}

	function renderParsedView(container, json, bodyLength, defaultCollapsed) {
		const tree = createElement('div', 'json-viewer__tree');
		const rootNode = buildNode(null, json, 0, {
			bodyLength: bodyLength,
			defaultCollapsed: defaultCollapsed,
		});

		tree.append(rootNode);
		tree.addEventListener('click', function (event) {
			const trigger = event.target.closest('[data-role="toggle"]');
			if (!trigger) {
				return;
			}

			const node = trigger.closest('.json-viewer__node');
			if (!node) {
				return;
			}

			toggleNode(node, {
				bodyLength: bodyLength,
				defaultCollapsed: defaultCollapsed,
			});
		});

		container.replaceChildren(tree);
	}

	function setMode(rawPanel, parsedPanel, rawButton, parsedButton, mode) {
		const showRaw = mode === 'raw';

		rawPanel.hidden = !showRaw;
		parsedPanel.hidden = showRaw;
		rawButton.classList.toggle('is-selected', showRaw);
		parsedButton.classList.toggle('is-selected', !showRaw);
	}

	async function copyTextToClipboard(text) {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(text);
			return;
		}

		const textarea = createElement('textarea');
		textarea.value = text;
		textarea.setAttribute('readonly', 'readonly');
		textarea.style.position = 'fixed';
		textarea.style.top = '-9999px';
		textarea.style.left = '-9999px';
		document.body.append(textarea);
		textarea.focus();
		textarea.select();

		const successful = document.execCommand('copy');
		textarea.remove();

		if (!successful) {
			throw new Error('Clipboard copy failed');
		}
	}

	function buildViewer(bodyText, options) {
		const body = document.body;
		const app = createElement('div', 'json-viewer');
		const toolbar = createElement('div', 'json-viewer__toolbar');
		const actions = createElement('div', 'json-viewer__actions');
		const rightActions = createElement('div', 'json-viewer__actions json-viewer__actions--right');
		const rawButton = createElement('button', 'json-viewer__button');
		const parsedButton = createElement('button', 'json-viewer__button');
		const copyButton = createElement('button', 'json-viewer__button');
		const downloadButton = createElement('button', 'json-viewer__button');
		const themeButton = createElement('button', 'json-viewer__button json-viewer__button--icon json-viewer__theme-button');
		const meta = createElement('div', 'json-viewer__meta', options.metaText);
		const rawPanel = createElement('pre', 'json-viewer__raw');
		const parsedPanel = createElement('section', 'json-viewer__parsed');
		const toast = createToast();
		let currentTheme = getPreferredTheme();

		body.id = 'json-viewer-body';
		body.classList.add('json-viewer-body');
		applyTheme(currentTheme);
		body.replaceChildren(app);

		rawButton.type = 'button';
		parsedButton.type = 'button';
		copyButton.type = 'button';
		downloadButton.type = 'button';
		themeButton.type = 'button';
		setToolbarButtonContent(rawButton, 'raw', 'Raw');
		setToolbarButtonContent(parsedButton, 'parsed', 'Parsed');
		setToolbarButtonContent(copyButton, 'copy', 'Copy');
		setToolbarButtonContent(downloadButton, 'download', 'Download');
		updateThemeButton(themeButton, currentTheme);
		rawPanel.textContent = bodyText;
		parsedPanel.hidden = true;
		app.append(toolbar);

		if (options.noticeText) {
			app.append(createElement('div', 'json-viewer__notice', options.noticeText));
		}

		if (options.parsedJson !== undefined) {
			renderParsedView(parsedPanel, options.parsedJson, options.bodyLength, options.shouldCollapse);
		} else {
			parsedButton.disabled = !options.onForceParse;
		}

		rawButton.addEventListener('click', function () {
			setMode(rawPanel, parsedPanel, rawButton, parsedButton, 'raw');
		});

		parsedButton.addEventListener('click', function () {
			if (options.parsedJson === undefined && options.onForceParse) {
				parsedButton.disabled = true;
				setToolbarButtonContent(parsedButton, 'parsed', 'Parsing...');

				window.requestAnimationFrame(function () {
					window.setTimeout(function () {
						try {
							options.onForceParse(parsedPanel);
							options.parsedJson = true;
							setToolbarButtonContent(parsedButton, 'parsed', 'Parsed');
							parsedButton.disabled = false;
							setMode(rawPanel, parsedPanel, rawButton, parsedButton, 'parsed');
						} catch (error) {
							setToolbarButtonContent(parsedButton, 'parsed', 'Parsed');
							parsedButton.disabled = false;
							window.alert('Parsed view failed for this response: ' + error.message);
						}
					}, 0);
				});
				return;
			}

			setMode(rawPanel, parsedPanel, rawButton, parsedButton, 'parsed');
		});

		copyButton.addEventListener('click', async function () {
			copyButton.disabled = true;
			setToolbarButtonContent(copyButton, 'copy', 'Copying...');

			try {
				await copyTextToClipboard(bodyText);
				setToolbarButtonContent(copyButton, 'success', 'Copied');
				showToast(toast, 'Copied to clipboard');
			} catch (error) {
				setToolbarButtonContent(copyButton, 'error', 'Failed');
				showToast(toast, 'Could not copy JSON to clipboard', 'error');
			}

			window.setTimeout(function () {
				setToolbarButtonContent(copyButton, 'copy', 'Copy');
				copyButton.disabled = false;
			}, 1200);
		});

		downloadButton.addEventListener('click', function () {
			downloadButton.disabled = true;
			setToolbarButtonContent(downloadButton, 'download', 'Downloading...');

			try {
				downloadTextFile(bodyText, getDownloadFilename());
				setToolbarButtonContent(downloadButton, 'success', 'Downloaded');
				showToast(toast, 'JSON downloaded');
			} catch (error) {
				setToolbarButtonContent(downloadButton, 'error', 'Failed');
				showToast(toast, 'Could not download JSON', 'error');
			}

			window.setTimeout(function () {
				setToolbarButtonContent(downloadButton, 'download', 'Download');
				downloadButton.disabled = false;
			}, 1200);
		});

		themeButton.addEventListener('click', function () {
			currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
			applyTheme(currentTheme);
			persistTheme(currentTheme);
			updateThemeButton(themeButton, currentTheme);
			showToast(toast, currentTheme === 'dark' ? 'Dark mode enabled' : 'Light mode enabled');
		});

		actions.append(rawButton, parsedButton);
		rightActions.append(copyButton, downloadButton, themeButton);
		toolbar.append(actions, meta, rightActions);
		app.append(rawPanel, parsedPanel, toast);

		if (options.startMode === 'parsed' && options.parsedJson !== undefined) {
			setMode(rawPanel, parsedPanel, rawButton, parsedButton, 'parsed');
		} else {
			setMode(rawPanel, parsedPanel, rawButton, parsedButton, 'raw');
		}
	}

	function renderJson() {
		const contentType = normalizeContentType(document.contentType);
		const bodyText = document.body ? document.body.textContent || '' : '';
		const bodyLength = bodyText.length;
		const metaText = formatNumber(bodyLength) + ' chars';

		if (!isSupportedContentType(contentType)) {
			return;
		}

		if (contentType !== 'application/json' && !/\+json$/.test(contentType) && !looksLikeJson(bodyText)) {
			return;
		}

		if (bodyLength > MAX_AUTO_PARSE_CHARS) {
			buildViewer(bodyText, {
				bodyLength: bodyLength,
				metaText: metaText,
				noticeText: 'Large JSON detected. Parsed view stays off by default above ' + formatNumber(MAX_AUTO_PARSE_CHARS) + ' characters to avoid locking the tab.',
				onForceParse: function (parsedPanel) {
					const json = JSON.parse(bodyText);
					renderParsedView(parsedPanel, json, bodyLength, true);
				},
				startMode: 'raw',
			});
			return;
		}

		try {
			const json = JSON.parse(bodyText);
			const shouldCollapse = bodyLength >= AUTO_COLLAPSE_CHARS;
			const noticeText = shouldCollapse ? 'Large JSON detected. Parsed view starts collapsed to reduce rendering overhead.' : '';

			buildViewer(bodyText, {
				bodyLength: bodyLength,
				metaText: metaText,
				noticeText: noticeText,
				parsedJson: json,
				shouldCollapse: shouldCollapse,
				startMode: 'parsed',
			});
		} catch (error) {
			buildViewer(bodyText, {
				bodyLength: bodyLength,
				metaText: metaText,
				noticeText: 'This response looks like JSON, but parsing failed. Showing the raw body instead. Error: ' + error.message,
				startMode: 'raw',
			});
			console.log('Cannot parse JSON:', error);
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', renderJson, { once: true });
	} else {
		renderJson();
	}
})();
