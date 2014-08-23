// ==UserScript==
// @name	   SpeedRead
// @namespace  http://www.mesha.org/
// @version	   0.1
// @description	 Speed read
// @match	   http://*/*
// @match	   https://*/*
// @copyright  2014, Adam Mesha
// ==/UserScript==

(function (root, doc, onready) {
	function addJquery(callback) {
		var head = doc.head,
			script = doc.createElement('script'),
			src = '//ajax.googleapis.com/ajax/libs/jquery/2.1.1/jquery.min.js';
		script.setAttribute('src', src);
		script.onload = function () {
			var jquery = jQuery.noConflict(true);
			typeof callback === 'function' && callback(jquery, doc);
		};
		head.appendChild(script);
	}

	addJquery(onready);
}(this, window.document, function ($, doc) {
	'use strict';

    var charsPerWord = 5, wordsPerChunk = 30, targetWPM = 750,
        charsPerChunk = wordsPerChunk * charsPerWord;

	var color = 'rgba(255, 255, 0, 0.3)'; // translucent yellow

	var uparrow = 38, downarrow = 40, enterkey = 13, esckey = 27, leftarrow = 37, rightarrow = 39;


	var el = function () { return doc.createElement.apply(doc, arguments); };

    // selecting an element in the DOM
	var selecting = false, className = 'amesha-selected-element', elementList = [];

	var stylesheet = $(el('style')).text('.' + className +' {background-color: ' + color + '}');
	$('head').append(stylesheet);

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
				var result = resetState();
				speedRead(result.text());
			} else if (ev.which === downarrow) {
				selectChild();
			}
			ev.preventDefault();
			ev.stopImmediatePropagation();
		});


	var popupClass = 'amesha-popup', popupOverlayClass = 'amesha-popup-overlay',
		popupContentClass = 'amesha-popup-content';
	var popup = $(el('div')).addClass(popupClass).appendTo('body').hide();
	var popupContent = $(el('div')).addClass(popupContentClass).appendTo(popup);
	var popupOverlay = $(el('div')).addClass(popupOverlayClass).appendTo('body').hide();
	var stylesheetRules = {
		'.amesha-popup': {
			position: 'fixed',
			top: '5%',
			left: '5%',
			width: '90%',
			height: '90%',
			overflow: 'auto',
			'background-color': 'white',
			border: 'thick solid green',
			'border-radius': '5px',
			'z-index': 20001,
			'text-align': 'center'
		},
		'.amesha-popup .amesha-popup-content': {
			position: 'absolute',
			top: '50%',
			width: 'calc(100% - 50px)',
			height: 'auto',
			left: 0,
			'text-align': 'center',
			'font-size': '48px',
			'line-height': 1.5,
			'border-radius': '5px',
			padding: '25px',
			'overflow': 'auto'
		},

		'.amesha-popup-overlay': {
			position: 'fixed',
			'background-color': 'rgba(0, 0, 0, 0.3)',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			'z-index': 20000
		}
	};
	var popupStylesheet = makeCss(stylesheetRules).appendTo('head');

	function showPopup (text) {
		popup.text(text);
		popup.show();
		popupOverlay.show();
	}
	function hidePopup () {
		popup.hide();
		popupOverlay.hide();
	}

	function speedRead(text) {
		var words = text.split(/\s+/g), idx, maxidx, startTime = Date.now(), timeoutId;

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
	                charsSeen += words[i].length + 1; // + 1 for the space
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
			if (idx >= words.length) { endRead(); return; }
            var next = nextidx(), i = next.newidx, delay = next.delay;
			timeoutId = setTimeout(nextChunk, delay);
			showChunk(i);
		};

		var showChunk = function (end) {
			var slice;
            end = end || nextidx().newidx;
			slice = words.slice(idx, end);
			popupContent.text(slice.join(' '));
			absoluteCenter(popupContent);
			if (!isPaused()) {
				setidx(end);
			}
		};

		var pauseRead = function () {
			console.log( 'pausing' );

			if (isPaused()) { return; }
			timeoutId = clearTimeout(timeoutId);
		};

		var resumeRead = function () {
			console.log( 'resuming' );

			if (!isRunning()) { return; }
			timeoutId = setTimeout(nextChunk, nextidx().delay);
		};

		var endRead = function () {
			console.log( 'ending' );
			var endTime = Date.now();

			hidePopup();
			clearTimeout(timeoutId);
			timeoutId = null;
			setidx(null);

			var secs = Math.round((endTime - startTime) / 1000),
				secsPerWord = secs / maxidx,
				wordsPerSec = maxidx / secs;
			console.log( 'Read ' + maxidx + ' words in ' + Math.round((endTime - startTime) / 1000) + ' s (' + Math.round(60 * wordsPerSec) + ' word/min, ' + secsPerWord +' s/word).');
		};

		var backChunk = function () {
			console.log( 'back' );

			if (!isPaused()) { return; }
			// setidx(Math.max(0, idx - chunksize));
			decidx();
			showChunk();
		};

		var forwardChunk = function () {
			console.log( 'forward' );

			if (!isPaused()) { return; }
			// setidx(Math.min(words.length, idx + chunksize));
			incidx();
			showChunk();
		};

		$(doc).on('keyup', function (e) {
			if (e.which === esckey) {
				endRead();
			} else if (e.which === enterkey) {
				if (timeoutId != null) {
					pauseRead();
				} else {
					resumeRead();
				}
			} else if (isPaused() && isRunning()) { // paused but running
				if (e.which === leftarrow) {
					backChunk();
				} else if (e.which === rightarrow) {
					forwardChunk();
				}
			}
		});

		setidx(0);
		showPopup();
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
			result.push(prop + ': ' + rule[prop] + ';');
		}
		return result.join(' ');
	}

	function makeCss(cssObj) {
		// return a jquery object
		var style = $(el('style'));
		var text = [];
		for (var selector in cssObj) {
			text.push(selector + '{' + makeCssRule(cssObj[selector]) + '}');
		}
		return style.text(text.join(' '));
	}
}));
