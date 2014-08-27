// ==UserScript==
// @name         SpeedRead
// @namespace    http://www.mesha.org/
// @version      0.1
// @description  Speed read
// @match        http://*/*
// @match        https://*/*
// @grant        none
// @copyright    2014, Adam Mesha
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
		wordsPerChunk: 30,
		targetWPM: 450
	};

	var color = 'rgba(255, 255, 0, 0.3)'; // translucent yellow

	// utils
	var uparrow = 38, downarrow = 40, enterkey = 13, esckey = 27,
		leftarrow = 37, rightarrow = 39, pluskey = 187, minuskey = 189;
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

	// you know doubleclicking?  well this is double pressing.
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
		console.log('got a doublepress, which = ', params.which);
	});


	// selecting an element in the DOM
	var selecting = false, className = 'amesha-selected-element', elementList = [];

	var stylesheet = $.el('style').text();
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
		selectElement(curElement.parent());
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

	$(doc)
		.on('click', function (ev) {
			if (!ev.shiftKey || !ev.ctrlKey) { return; }
			selecting = true;
			var target = $(ev.target);
			selectElement(target);
			ev.preventDefault();
			ev.stopImmediatePropagation();
		})
		.on('keyup', function (ev) {
			if (!selecting) { return; }
			if (ev.which === uparrow) {
				selectParent();
			} else if (ev.which === enterkey) {
				var result = resetState().clone();
				pruneChildren(result, function (element) {
					return element.is('script, style');
				});
				speedRead(result.text(), {
					// start one level faster than the target
					targetWPM: defaultSettings.targetWPM * phi
				});
			} else if (ev.which === downarrow) {
				selectChild();
			}
			ev.preventDefault();
			ev.stopImmediatePropagation();
		});

	var camelCaseToDashed = function (identifier) {
		return identifier.replace(/([a-z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
	};

	var popupOverlay = $('body').el('.amesha-popup-overlay').hide(),
		popup = $('body').el('.amesha-popup').hide(),
	    popupContent = popup.el('.amesha-popup-content'),
	    progressIndicator = popup.el('.amesha-progress-indicator');
	var zIndex = highestZIndex() + 1;
	var stylesheetRules = {
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
			transition: 'all 0.5s linear 0'
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
			textAlign: 'center'
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
		popup.text(text).show();
		popupOverlay.show();
	}
	function hidePopup () {
		popup.hide();
		popupOverlay.hide();
	}

	function speedRead(text, options) {
		var words = text.split(/\s+/g),
		    normText = words.join(' '),
		    idx, maxidx, startTime = Date.now(), timeoutId;
		var settings = $.extend({}, defaultSettings, options || {});
		var charsPerWord = settings.charsPerWord,
			wordsPerChunk = settings.wordsPerChunk,
			targetWPM = settings.targetWPM,
			charsPerChunk = charsPerWord * wordsPerChunk;
		console.log( 'starting, targetWPM is', targetWPM );
		console.log( (normText.length / charsPerWord) +
		             ' (normalized) words in the selection.' );
		var expectedMinutes = Math.round(normText.length / (targetWPM * charsPerWord) * 10) / 10;
		console.log( 'Expected to take ' + expectedMinutes + ' minutes.' );

		var level = Math.round(
			Math.log(targetWPM / defaultSettings.targetWPM) / Math.log(phi)),
			sign = level === 0 ? level : Math.abs(level) / level,
			extraClass = ['slow', '', 'fast'][sign+1] + ' level_' + level;
		console.log( 'level is', level );

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

		var cachedResults = {
			'1': {}, '-1': {}
		};
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

			$(doc).off('keyup.speedread');
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

		$(doc).on('keyup.speedread', function (e) {
			if (e.which === esckey) {
				endRead();
			} else if (e.which === pluskey && e.altKey) {
				recurseAgain(1);
			} else if (e.which === minuskey && e.altKey) {
				recurseAgain(-1);
			} else if (e.which === enterkey) {
				if (timeoutId != null) {
					pauseRead();
				} else {
					resumeRead();
				}
			} else if (isRunning()) {
				if (e.which === leftarrow) {
					backChunk();
				} else if (e.which === rightarrow) {
					forwardChunk();
				}
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
