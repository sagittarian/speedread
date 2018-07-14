// ==UserScript==
// @name		 SpeedRead
// @namespace	 http://www.mesha.org/
// @version		 0.1
// @description	 Speed read
// @match		 http://*/*
// @match		 https://*/*
// @grant		 none
// @copyright	 2014, Adam Mesha
// ==/UserScript==

(function (root, doc, onready) {
	// jquery-el
	var jqel = function ($) {
		var attrletters, el, tagletters;
		tagletters = 'a-zA-Z0-9';
		attrletters = tagletters + '_-';
		el = $.el = function(tag, attrs) {
			var $el, attr, classes, cls, id, rest, sigil, signs, split, val, _i, _j, _len, _len1;
			if (tag == null) {
				tag = '';
			}
			if (attrs == null) {
				attrs = {};
			}
			classes = [];
			split = tag.match(RegExp("^([" + tagletters + "]*)(([#.][" + attrletters + "]+)*)$"));
			tag = split[1] ? split[1] : 'div';
			if (split[2] != null) {
				signs = split[2].match(RegExp("([#.][" + attrletters + "]+)", "g"));
				if (signs != null) {
					for (_i = 0, _len = signs.length; _i < _len; _i++) {
						attr = signs[_i];
						sigil = attr.slice(0, 1);
						rest = attr.slice(1);
						if (sigil === '#') {
							id = rest;
						} else {
							classes.push(rest);
						}
					}
				}
			}
			$el = $(document.createElement(tag));
			for (_j = 0, _len1 = classes.length; _j < _len1; _j++) {
				cls = classes[_j];
				$el.addClass(cls);
			}
			if (id != null) {
				$el.attr('id', id);
			}
			for (attr in attrs) {
				val = attrs[attr];
				if (attr === 'text' || attr === 'html' || attr === 'val') {
					$el[attr](val);
				} else {
					$el.attr(attr, val);
				}
			}
			return $el;
		};
		$.fn.el = function(tag, attrs) {
			return el(tag, attrs).appendTo(this);
		};
		$.fn.appendEl = function(tag, attrs) {
			return this.append(el(tag, attrs));
		};
		return el;
	};

	function addJquery(callback) {
		var head = doc.head,
			script = doc.createElement('script'),
			src = '//ajax.googleapis.com/ajax/libs/jquery/2.1.1/jquery.min.js';
		script.setAttribute('src', src);
		script.onload = function () {
			var jquery = jQuery.noConflict(true);
			jqel(jquery);
			typeof callback === 'function' && callback(jquery, doc);
		};
		head.appendChild(script);
	}

	addJquery(onready);
}(this, window.document, function ($, doc) {
	'use strict';

	// config
	var defaultSettings = {
		charsPerWord: 5,
		wordsPerChunk: 15,
		targetWPM: 350
	};

	// we want to automatically start increasing the targetWPM
	var startDate = new Date(2014, 9, 1), // Wed Oct 01 2014 00:00:00 GMT+0300 (IDT)
	    daysSince = Math.max(0, (Date.now() - startDate) / (1000*60*60*24)) |0;
	defaultSettings.targetWPM += daysSince;

	var color = 'rgba(255, 255, 0, 0.3)'; // translucent yellow

	// utils
	var
	commonKeys = {
		uparrow: 38,
		downarrow: 40,
		leftarrow: 37,
		rightarrow: 39,
		enterkey: 13,
		esckey: 27,
	},
	mozKeys = $.extend({
		pluskey: 52,
		minuskey: 173,
	}, commonKeys),
	chromeKeys = $.extend({
		pluskey: 187,
		minuskey: 189,
	}, commonKeys),
	keys = navigator.userAgent.indexOf('Chrome') !== -1 ? chromeKeys : mozKeys;
	var phi = (Math.sqrt(5) + 1) / 2;
	function walkDom(root, acc, func) {
		acc = func(acc, root);
		root.children().each(function (i, child) {
			var $child = $(child);
			acc = walkDom($child, acc, func);
		});
		return acc;
	}

	function highestZIndex() {
		return +walkDom($('body'), null, function (acc, element) {
			var zIndex = element.css('z-index');
			if (zIndex === 'auto') { return acc; }
			return (acc == null || +zIndex > acc) ? zIndex : acc;
		}) || 0;
	}

	// you know doubleclicking?	 well this is double pressing.
	var lastWhich, lastWhichWhen, threshold = 500;
	$(doc).on('keyup', function (event) {
		var now = Date.now();
		if (lastWhich && event.which === lastWhich && now - lastWhichWhen < threshold) {
			$(event.target).trigger('doublepress', {
				which: event.which,
				interval: now - lastWhichWhen
			});
			lastWhich = null;
			lastWhichWhen = null;
		} else {
			lastWhich = event.which;
			lastWhichWhen = now;
		}
	});

	$(doc).on('doublepress', function (e, params) {
		console.log('got a doublepress, which = ', params.which, 'interval = ', params.interval);
	});


	// selecting an element in the DOM
	var selecting = false, className = 'amesha-selected-element', elementList = [];

	// some site-specific logic stuff
	var getParentSelectorList = function () {
		var selectorList = arguments;
		return function (node) {
			var parent;
			$.each(selectorList, function (i, selector) {
				var result = node.parents(selector);
				if (result.length > 0) {
					parent = result;
					return false;
				}
				return null;
			});
			return parent || node.parent();
		};
	};

	var siteSpecific = {
		'quora\.com': {
			getParent: getParentSelectorList('.Answer', '.AnswerPagedList'),
			selectContent: function () {
				return $('.AnswerPagedList').first();
			},
			pruneTree: (function () {
				var selectors = ['.AnswerHeader', '.AnswerFooter',
								 '.ActionBar', '.suggested_edits',
								 '.PromoteAnswer', '.action_bar_comments',
								 '.QuestionTopicsEditor', '.action_button',
								 '.view_topics'
								].join(', ');
				return function (node) {
					return node.is(selectors);
				};
			}())
		},
		'wikipedia\.org': {
			selectContent: function () {
				return $('#bodyContent');
			}
		}
	};

	var thisSite = {
		getParent: function (node) {
			return node.parent();
		},
		pruneTree: function () { return false; }
	};

	$.each(siteSpecific, function (regex, config) {
		if (document.location.href.match(new RegExp(regex, 'i'))) {
			thisSite = $.extend({}, thisSite, config);
			return false;
		}
	});

	$('head').appendEl('style', {
		text: '.' + className +' {background-color: ' + color + '}'
	});

	function resetState() {
		selecting = false;
		$.each(elementList, function (i, element) {
			element.removeClass(className);
		});
		var result = elementList[elementList.length - 1];
		elementList = [];
		return result;
	}

	function selectElement(target) {
		target.addClass(className);
		elementList.push(target);
	}

	function selectChild() {
		if (!selecting || elementList.length === 0) {
			return;
		}
		elementList.pop().removeClass(className);
	}

	function selectParent() {
		if (!selecting || elementList.length === 0) {
			return;
		}
		var curElement = elementList[elementList.length - 1];
		selectElement(thisSite.getParent(curElement));
	}

	function pruneChildren(element, test) {
		element.children().each(function (i, child) {
			var $child = $(child);
			if (test($child)) {
				$child.remove();
			} else {
				pruneChildren($child, test);
			}
		});
	}


	// function getText(node) {
	// 	var result = node.clone(),
	// 	    pruneTree = thisSite.pruneTree;
	// 	pruneChildren(result, function (element) {
	// 		return element.is('script, style') || pruneTree(element);
	// 	});
	// 	return result.text();
	// }

	function getText(node, test) {
		// fancier way of extracting text from a DOM node
		test = test || function () { return false; };
		var textNodeType = 3, commentNodeType = 8;
		if (node.css('display') === 'none' || node.css('visibility') === 'hidden') { return ''; }
		var result = [],
		    isDisplayBlock = node.css('display').match(/^(block|table.*)$/i);
		isDisplayBlock && result.push(' ');
		node.contents().each(function (i, child) {
			var $child = $(child);
            if (child.nodeType === commentNodeType) {
                return;
            }
			else if (child.nodeType === textNodeType) {
				result.push($child.text().trim());
			}
            else if (!$child.is('script, style') && !test($child)) {
				result.push(getText($child));
			}
		});
		isDisplayBlock && result.push(' ');
		var text = result.join(' ');
		return text.trim().replace(/\s\s+/g, ' ');
	}

	$(doc)
		.on('click', function (ev) {
			if (!ev.ctrlKey) { return; }
			selecting = true;
			var target = $(ev.target);
			selectElement(target);
			ev.preventDefault();
			ev.stopImmediatePropagation();
		})
		.on('keyup', function (ev) {
			if (!selecting) {
				var content;
				if (ev.which === keys.enterkey && ev.ctrlKey &&
					typeof thisSite.selectContent === 'function') {
					content = thisSite.selectContent();
					if (!content || !content.length) { return; }
					selecting = true;
					selectElement(content);
				}
				return;
			}
			if (ev.which === keys.uparrow) {
				selectParent();
			} else if (ev.which === keys.enterkey) {
				var node = resetState(),
				    text = getText(node, thisSite.pruneTree);
				speedRead(text, {
					// start one level faster than the target
					targetWPM: defaultSettings.targetWPM * phi
				});
			} else if (ev.which === keys.downarrow) {
				selectChild();
			}
			ev.preventDefault();
			ev.stopImmediatePropagation();
		});

	var camelCaseToDashed = function (identifier) {
		return identifier.replace(/([a-z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
	};

	var popupOverlay = $('body').el('.amesha-popup-overlay').hide(),
		popup = $('body').el('.amesha-popup', {tabindex: -1}).hide(),
		popupContent = popup.el('.amesha-popup-content'),
		progressIndicator = popup.el('.amesha-progress-indicator');
	var zIndex = highestZIndex() + 1;
	var stylesheetRules = {
		'body.amesha-open-popup': {
			overflow: 'hidden'
		},
		'.amesha-popup, .amesha-popup *, .amesha-popup-overlay': {
			boxSizing: 'border-box'
		},
		'.amesha-progress-indicator': {
			position: 'absolute',
			bottom: 0,
			left: 0,
			width: '50px',
			height: '10px',
			backgroundColor: 'black',
			borderRadius: '5px',
			transition: 'all 0.5s linear'
		},
		'.amesha-popup': {
			position: 'fixed',
			top: '5%',
			left: '5%',
			width: '90%',
			height: '90%',
			overflow: 'auto',
			backgroundColor: 'white',
			border: '25px solid blue',
			borderRadius: '10px',
			zIndex: zIndex + 1,
			textAlign: 'center',
			boxShadow: '3px 3px 8px 8px black, -3px -3px 8px 8px black'
		},
		'.amesha-popup.fast': {
			borderColor: 'green'
		},
		'.amesha-popup.slow': {
			borderColor: 'yellow'
		},
		'.amesha-popup.paused': {
			borderColor: 'red'
		},
		'.amesha-popup .amesha-popup-content': {
			position: 'absolute',
			top: '50%',
			height: 'auto',
			left: 0,
			right: 0,
			textAlign: 'center',
			fontSize: '48px',
			color: 'black',
			textDecoration: 'none',
			fontWeight: 'normal',
			fontStyle: 'normal',
			// "Times New Roman", Times, serif
			// Georgia, serif
			// Arial, Helvetica, sans-serif
			fontFamily: '"Times New Roman", Times, serif',
			lineHeight: 1.5,
			borderRadius: '5px',
			padding: '25px',
			overflow: 'auto'
		},
		'.amesha-popup-overlay': {
			position: 'fixed',
			backgroundColor: 'rgba(0, 0, 0, 0.3)',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			zIndex: zIndex
		}
	};
	var popupStylesheet = makeCss(stylesheetRules).appendTo('head');

	function resetPopupClass() {
		popup.removeClass().addClass('amesha-popup');
	}

	function showPopup (text) {
		resetPopupClass();
		popup.text(text).show().focus();
		popupOverlay.show();
		$('body').addClass('amesha-open-popup');
	}
	function hidePopup () {
		popup.hide();
		popupOverlay.hide();
		$('body').removeClass('amesha-open-popup');
	}

	function speedRead(text, options) {
		var words = text.split(/\s+/g),
			normText = words.join(' '),
			idx, maxidx, startTime = Date.now(), timeoutId;
		var settings = $.extend({}, defaultSettings);
		var charsPerWord, wordsPerChunk, targetWPM, charsPerChunk;
		var level, sign, extraClass;

		var initSettings = function (opts) {
			settings = $.extend(settings, opts || {});
			charsPerWord = settings.charsPerWord;
			wordsPerChunk = settings.wordsPerChunk;
			targetWPM = settings.targetWPM;
			charsPerChunk = charsPerWord * wordsPerChunk;
			level = Math.round(
				Math.log(targetWPM / defaultSettings.targetWPM) / Math.log(phi));
			sign = level === 0 ? level : Math.abs(level) / level;
			extraClass = ['slow', '', 'fast'][sign+1] + ' level_' + level;
			console.log( 'targetWPM is', targetWPM );
			console.log( 'Level is', level );
		};
		initSettings(options);

		console.log( (normText.length / charsPerWord) +
					 ' (normalized) words in the selection.' );
		var expectedMinutes = Math.round(normText.length / (targetWPM * charsPerWord) * 10) / 10;
		console.log( 'Expected to take ' + expectedMinutes + ' minutes.' );

		// var extraPopupClasses = [];


		var isPaused = function () {
			return timeoutId == null;
		};

		var isRunning = function () {
			return idx != null;
		};

		var setidx = function (i) {
			idx = i;
			if (maxidx == null || idx > maxidx) {
				maxidx = idx;
			}
			var contentWidth = popupContent.width(),
				indicatorWidth = progressIndicator.width(),
				progressOffset = idx/words.length *
					(contentWidth - indicatorWidth);
			progressIndicator.css('left', progressOffset + 'px');
		};

		var incidx = function () {
			var next = nextidx(1);
			setidx(next.newidx);
		};

		var decidx = function () {
			var prev = nextidx(-1);
			setidx(prev.newidx);
		};

		var cachedResults;
		var resetCache = function () {
			cachedResults = {
				'1': {}, '-1': {}
			};
		};
		resetCache();

		var nextidx = function (direction) {
			direction = direction || 1;
			if (!cachedResults[direction][idx]) {
				var charsSeen = 0, i = idx, endCondition = direction > 0 ?
						function () {
							return i >= words.length;
						} : function () {
							return i <= 0;
						};
				while (!endCondition() && charsSeen < charsPerChunk) {
					i += direction;
					var curWord = words[direction > 0 ? i - 1 : i];
					charsSeen += curWord.length + 1; // + 1 for the space
				}
				cachedResults[direction][idx] = {
					newidx: i,
					chars: charsSeen,
					delay: 60000 * charsSeen / (targetWPM * charsPerWord)
				};
			}

			return cachedResults[direction][idx];
		};

		var nextChunk = function () {
			setidx(idx == null ? 0 : nextidx().newidx);
			playChunks();
		};

		var playChunks = function () {
			var next = nextidx(), i = next.newidx, delay = next.delay;
			clearTimeout(timeoutId); // in case we're skipping forward
									 // or backward
			showChunk(i);
			timeoutId = (i >= words.length) ?
				setTimeout(function () { recurseAgain(-1); }, delay) :
				setTimeout(nextChunk, delay);

		};

		var showChunk = function (end) {
			var slice;
			end = end || nextidx().newidx;
			slice = words.slice(idx, end);
			popupContent.text(slice.join(' '));
			absoluteCenter(popupContent);
		};

		var pauseRead = function () {
			console.log( 'pausing' );

			if (isPaused()) { return; }
			popup.addClass('paused');
			timeoutId = clearTimeout(timeoutId);
		};

		var resumeRead = function () {
			console.log( 'resuming' );

			if (!isRunning()) { return; }
			popup.removeClass('paused');
			timeoutId = setTimeout(nextChunk, nextidx().delay);
		};

		var endRead = function (recurse) {
			console.log( 'ending' );
			var endTime = Date.now();

			$(doc).off('.speedread');
			hidePopup();
			timeoutId = clearTimeout(timeoutId);
			setidx(null);

			var secs = Math.round((endTime - startTime) / 1000),
				secsPerWord = secs / maxidx,
				wordsPerSec = maxidx / secs;
			console.log( 'Read ' + maxidx + ' words in ' + Math.round((endTime - startTime) / 1000) + ' s (' + Math.round(60 * wordsPerSec) + ' word/min, ' + secsPerWord +' s/word).');

		};

		var recurseAgain = function (nextLevel) {
			endRead();
			settings.targetWPM *= Math.pow(phi, nextLevel);
			speedRead(text, settings);
		};

		var changeSpeed = function (levelDiff) {
			settings.targetWPM *= Math.pow(phi, levelDiff);
			popup.removeClass(extraClass);
			initSettings();
			popup.addClass(extraClass);
			resetCache();
			// XXX refactor so that we don't have to do so much here
		};

		var backChunk = function () {
			console.log( 'back' );

			// if (!isPaused()) { return; }
			// setidx(Math.max(0, idx - chunksize));
			decidx();
			isPaused() ? showChunk() : playChunks();
		};

		var forwardChunk = function () {
			console.log( 'forward' );

			// if (!isPaused()) { return; }
			// setidx(Math.min(words.length, idx + chunksize));
			incidx();
			isPaused() ? showChunk() : playChunks();
		};

		var eventHandler = function (e) {
			if (e.which === keys.esckey) {
				endRead();
			} else if (e.which === keys.pluskey && e.altKey) {
				recurseAgain(1);
			} else if (e.which === keys.minuskey && e.altKey) {
				recurseAgain(-1);
			} else if (e.which === keys.enterkey) {
				if (timeoutId != null) {
					pauseRead();
				} else {
					resumeRead();
				}
			} else if (isRunning()) {
				if (e.which === keys.leftarrow) {
					backChunk();
				} else if (e.which === keys.rightarrow) {
					forwardChunk();
				}
			}
		};

		$(doc).on('keyup.speedread', eventHandler)
			.on('doublepress.speedread', function (event, params) {
				if (params.which === keys.pluskey) {
					changeSpeed(1);
				} else if (params.which === keys.minuskey) {
					changeSpeed(-1);
				}
			});


		showPopup();
		popup.addClass(extraClass);
		nextChunk();
	}

	function absoluteCenter(element) {
		var halfTheParent = element.parent().height() / 2,
			margin = Math.min(halfTheParent, element.height() / 2);
		element.css('margin-top',  -margin + 'px');
	}

	function makeCssRule(rule) {
		var result = [];
		for (var prop in rule) {
			result.push(camelCaseToDashed(prop) + ': ' + rule[prop] + ';');
		}
		return result.join(' ');
	}

	function makeCss(cssObj) {
		// return a jquery object
		var text = [];
		for (var selector in cssObj) {
			text.push(selector + '{' + makeCssRule(cssObj[selector]) + '}');
		}
		return $.el('style', {text: text.join(' ')});
	}

}));
