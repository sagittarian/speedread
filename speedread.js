// ==UserScript==
// @name       SpeedRead
// @namespace  http://www.mesha.org/
// @version    0.1
// @description  Speed read
// @match      http://*/*
// @match      https://*/*
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

	var chunksize = 100, delayPerWord = 1000 * 60 / 750;

	var color = 'rgba(255, 255, 0, 0.3)'; // translucent yellow
	var selecting = false;
	var uparrow = 38, downarrow = 40, enterkey = 13, esckey = 27, leftarrow = 37, rightarrow = 39;
	var className = 'amesha-selected-element';
	var elementList = [];

	var el = function () { return doc.createElement.apply(doc, arguments); };

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

		var nextChunk = function () {
			if (idx >= words.length) { endRead(); return; }
            showChunk();
			timeoutId = setTimeout(nextChunk, delayPerWord * chunksize);
		};

        var showChunk = function () {
			var end, slice;
			end = idx + chunksize;
			slice = words.slice(idx, end);
			popupContent.text(slice.join(' '));
			absoluteCenter(popupContent);
	        if (!isPaused()) { // running
		        setidx(end);
	        }
        };

		var pauseRead = function () {
			console.log( 'pausing' );

			if (isPaused()) { return; }
			clearTimeout(timeoutId);
			timeoutId = null;
		};

		var resumeRead = function () {
			console.log( 'resuming' );

			if (!isRunning()) { return; }
			timeoutId = setTimeout(nextChunk, delayPerWord * chunksize);
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
            setidx(Math.max(0, idx - chunksize));
            showChunk();
        };

        var forwardChunk = function () {
            console.log( 'forward' );

            if (!isPaused()) { return; }
            setidx(Math.min(words.length, idx + chunksize));
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
		timeoutId = setTimeout(nextChunk, 0);
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
