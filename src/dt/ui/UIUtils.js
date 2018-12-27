/*
 * Copyright (C) 2011 Google Inc.  All rights reserved.
 * Copyright (C) 2006, 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2007 Matt Lilek (pewtermoose@gmail.com).
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
UI.highlightedSearchResultClassName = 'highlighted-search-result';
UI.highlightedCurrentSearchResultClassName = 'current-search-result';

/**
 * @param {!Element} element
 * @param {?function(!MouseEvent): boolean} elementDragStart
 * @param {function(!MouseEvent)} elementDrag
 * @param {?function(!MouseEvent)} elementDragEnd
 * @param {?string} cursor
 * @param {?string=} hoverCursor
 * @param {number=} startDelay
 */
UI.installDragHandle = function(
    element, elementDragStart, elementDrag, elementDragEnd, cursor, hoverCursor, startDelay) {
  /**
   * @param {!Event} event
   */
  function onMouseDown(event) {
    const dragHandler = new UI.DragHandler();
    const dragStart = dragHandler.elementDragStart.bind(
        dragHandler, element, elementDragStart, elementDrag, elementDragEnd, cursor, event);
    if (startDelay)
      startTimer = setTimeout(dragStart, startDelay);
    else
      dragStart();
  }

  function onMouseUp() {
    if (startTimer)
      clearTimeout(startTimer);
    startTimer = null;
  }

  let startTimer;
  element.addEventListener('mousedown', onMouseDown, false);
  if (startDelay)
    element.addEventListener('mouseup', onMouseUp, false);
  if (hoverCursor !== null)
    element.style.cursor = hoverCursor || cursor || '';
};

/**
 * @param {!Element} targetElement
 * @param {?function(!MouseEvent):boolean} elementDragStart
 * @param {function(!MouseEvent)} elementDrag
 * @param {?function(!MouseEvent)} elementDragEnd
 * @param {?string} cursor
 * @param {!Event} event
 */
UI.elementDragStart = function(targetElement, elementDragStart, elementDrag, elementDragEnd, cursor, event) {
  const dragHandler = new UI.DragHandler();
  dragHandler.elementDragStart(targetElement, elementDragStart, elementDrag, elementDragEnd, cursor, event);
};

/**
 * @unrestricted
 */
UI.DragHandler = class {
  constructor() {
    this._elementDragMove = this._elementDragMove.bind(this);
    this._elementDragEnd = this._elementDragEnd.bind(this);
    this._mouseOutWhileDragging = this._mouseOutWhileDragging.bind(this);
  }

  _createGlassPane() {
    this._glassPaneInUse = true;
    if (!UI.DragHandler._glassPaneUsageCount++) {
      UI.DragHandler._glassPane = new UI.GlassPane();
      UI.DragHandler._glassPane.setPointerEventsBehavior(UI.GlassPane.PointerEventsBehavior.BlockedByGlassPane);
      UI.DragHandler._glassPane.show(UI.DragHandler._documentForMouseOut);
    }
  }

  _disposeGlassPane() {
    if (!this._glassPaneInUse)
      return;
    this._glassPaneInUse = false;
    if (--UI.DragHandler._glassPaneUsageCount)
      return;
    UI.DragHandler._glassPane.hide();
    delete UI.DragHandler._glassPane;
    delete UI.DragHandler._documentForMouseOut;
  }

  /**
   * @param {!Element} targetElement
   * @param {?function(!MouseEvent):boolean} elementDragStart
   * @param {function(!MouseEvent)} elementDrag
   * @param {?function(!MouseEvent)} elementDragEnd
   * @param {?string} cursor
   * @param {!Event} event
   */
  elementDragStart(targetElement, elementDragStart, elementDrag, elementDragEnd, cursor, event) {
    // Only drag upon left button. Right will likely cause a context menu. So will ctrl-click on mac.
    if (event.button || (Host.isMac() && event.ctrlKey))
      return;

    if (this._elementDraggingEventListener)
      return;

    if (elementDragStart && !elementDragStart(/** @type {!MouseEvent} */ (event)))
      return;

    const targetDocument = event.target.ownerDocument;
    this._elementDraggingEventListener = elementDrag;
    this._elementEndDraggingEventListener = elementDragEnd;
    console.assert(
        (UI.DragHandler._documentForMouseOut || targetDocument) === targetDocument, 'Dragging on multiple documents.');
    UI.DragHandler._documentForMouseOut = targetDocument;
    this._dragEventsTargetDocument = targetDocument;
    try {
      this._dragEventsTargetDocumentTop = targetDocument.defaultView.top.document;
    } catch (e) {
      this._dragEventsTargetDocumentTop = this._dragEventsTargetDocument;
    }

    targetDocument.addEventListener('mousemove', this._elementDragMove, true);
    targetDocument.addEventListener('mouseup', this._elementDragEnd, true);
    targetDocument.addEventListener('mouseout', this._mouseOutWhileDragging, true);
    if (targetDocument !== this._dragEventsTargetDocumentTop)
      this._dragEventsTargetDocumentTop.addEventListener('mouseup', this._elementDragEnd, true);

    if (typeof cursor === 'string') {
      this._restoreCursorAfterDrag = restoreCursor.bind(this, targetElement.style.cursor);
      targetElement.style.cursor = cursor;
      targetDocument.body.style.cursor = cursor;
    }
    /**
     * @param {string} oldCursor
     * @this {UI.DragHandler}
     */
    function restoreCursor(oldCursor) {
      targetDocument.body.style.removeProperty('cursor');
      targetElement.style.cursor = oldCursor;
      this._restoreCursorAfterDrag = null;
    }
    event.preventDefault();
  }

  _mouseOutWhileDragging() {
    this._unregisterMouseOutWhileDragging();
    this._createGlassPane();
  }

  _unregisterMouseOutWhileDragging() {
    if (!UI.DragHandler._documentForMouseOut)
      return;
    UI.DragHandler._documentForMouseOut.removeEventListener('mouseout', this._mouseOutWhileDragging, true);
  }

  _unregisterDragEvents() {
    if (!this._dragEventsTargetDocument)
      return;
    this._dragEventsTargetDocument.removeEventListener('mousemove', this._elementDragMove, true);
    this._dragEventsTargetDocument.removeEventListener('mouseup', this._elementDragEnd, true);
    if (this._dragEventsTargetDocument !== this._dragEventsTargetDocumentTop)
      this._dragEventsTargetDocumentTop.removeEventListener('mouseup', this._elementDragEnd, true);
    delete this._dragEventsTargetDocument;
    delete this._dragEventsTargetDocumentTop;
  }

  /**
   * @param {!Event} event
   */
  _elementDragMove(event) {
    if (event.buttons !== 1) {
      this._elementDragEnd(event);
      return;
    }
    if (this._elementDraggingEventListener(/** @type {!MouseEvent} */ (event)))
      this._cancelDragEvents(event);
  }

  /**
   * @param {!Event} event
   */
  _cancelDragEvents(event) {
    this._unregisterDragEvents();
    this._unregisterMouseOutWhileDragging();

    if (this._restoreCursorAfterDrag)
      this._restoreCursorAfterDrag();

    this._disposeGlassPane();

    delete this._elementDraggingEventListener;
    delete this._elementEndDraggingEventListener;
  }

  /**
   * @param {!Event} event
   */
  _elementDragEnd(event) {
    const elementDragEnd = this._elementEndDraggingEventListener;
    this._cancelDragEvents(/** @type {!MouseEvent} */ (event));
    event.preventDefault();
    if (elementDragEnd)
      elementDragEnd(/** @type {!MouseEvent} */ (event));
  }
};

UI.DragHandler._glassPaneUsageCount = 0;

/**
 * @param {?Node=} node
 * @return {boolean}
 */
UI.isBeingEdited = function(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE)
    return false;
  let element = /** {!Element} */ (node);
  if (element.classList.contains('text-prompt') || element.nodeName === 'INPUT' || element.nodeName === 'TEXTAREA')
    return true;

  if (!UI.__editingCount)
    return false;

  while (element) {
    if (element.__editing)
      return true;
    element = element.parentElementOrShadowHost();
  }
  return false;
};

/**
 * @return {boolean}
 * @suppressGlobalPropertiesCheck
 */
UI.isEditing = function() {
  if (UI.__editingCount)
    return true;

  const focused = document.deepActiveElement();
  if (!focused)
    return false;
  return focused.classList.contains('text-prompt') || focused.nodeName === 'INPUT' || focused.nodeName === 'TEXTAREA';
};

/**
 * @param {!Element} element
 * @param {boolean} value
 * @return {boolean}
 */
UI.markBeingEdited = function(element, value) {
  if (value) {
    if (element.__editing)
      return false;
    element.classList.add('being-edited');
    element.__editing = true;
    UI.__editingCount = (UI.__editingCount || 0) + 1;
  } else {
    if (!element.__editing)
      return false;
    element.classList.remove('being-edited');
    delete element.__editing;
    --UI.__editingCount;
  }
  return true;
};

// Avoids Infinity, NaN, and scientific notation (e.g. 1e20), see crbug.com/81165.
UI._numberRegex = /^(-?(?:\d+(?:\.\d+)?|\.\d+))$/;

UI.StyleValueDelimiters = ' \xA0\t\n"\':;,/()';

/**
 * @param {!Event} event
 * @return {?string}
 */
UI._valueModificationDirection = function(event) {
  let direction = null;
  if (event.type === 'mousewheel') {
    // When shift is pressed while spinning mousewheel, delta comes as wheelDeltaX.
    if (event.wheelDeltaY > 0 || event.wheelDeltaX > 0)
      direction = 'Up';
    else if (event.wheelDeltaY < 0 || event.wheelDeltaX < 0)
      direction = 'Down';
  } else {
    if (event.key === 'ArrowUp' || event.key === 'PageUp')
      direction = 'Up';
    else if (event.key === 'ArrowDown' || event.key === 'PageDown')
      direction = 'Down';
  }
  return direction;
};

/**
 * @param {string} hexString
 * @param {!Event} event
 * @return {?string}
 */
UI._modifiedHexValue = function(hexString, event) {
  const direction = UI._valueModificationDirection(event);
  if (!direction)
    return null;

  const mouseEvent = /** @type {!MouseEvent} */ (event);
  const number = parseInt(hexString, 16);
  if (isNaN(number) || !isFinite(number))
    return null;

  const hexStrLen = hexString.length;
  const channelLen = hexStrLen / 3;

  // Colors are either rgb or rrggbb.
  if (channelLen !== 1 && channelLen !== 2)
    return null;

  // Precision modifier keys work with both mousewheel and up/down keys.
  // When ctrl is pressed, increase R by 1.
  // When shift is pressed, increase G by 1.
  // When alt is pressed, increase B by 1.
  // If no shortcut keys are pressed then increase hex value by 1.
  // Keys can be pressed together to increase RGB channels. e.g trying different shades.
  let delta = 0;
  if (UI.KeyboardShortcut.eventHasCtrlOrMeta(mouseEvent))
    delta += Math.pow(16, channelLen * 2);
  if (mouseEvent.shiftKey)
    delta += Math.pow(16, channelLen);
  if (mouseEvent.altKey)
    delta += 1;
  if (delta === 0)
    delta = 1;
  if (direction === 'Down')
    delta *= -1;

  // Increase hex value by 1 and clamp from 0 ... maxValue.
  const maxValue = Math.pow(16, hexStrLen) - 1;
  const result = Number.constrain(number + delta, 0, maxValue);

  // Ensure the result length is the same as the original hex value.
  let resultString = result.toString(16).toUpperCase();
  for (let i = 0, lengthDelta = hexStrLen - resultString.length; i < lengthDelta; ++i)
    resultString = '0' + resultString;
  return resultString;
};

/**
 * @param {number} number
 * @param {!Event} event
 * @param {number=} modifierMultiplier
 * @return {?number}
 */
UI._modifiedFloatNumber = function(number, event, modifierMultiplier) {
  const direction = UI._valueModificationDirection(event);
  if (!direction)
    return null;

  const mouseEvent = /** @type {!MouseEvent} */ (event);

  // Precision modifier keys work with both mousewheel and up/down keys.
  // When ctrl is pressed, increase by 100.
  // When shift is pressed, increase by 10.
  // When alt is pressed, increase by 0.1.
  // Otherwise increase by 1.
  let delta = 1;
  if (UI.KeyboardShortcut.eventHasCtrlOrMeta(mouseEvent))
    delta = 100;
  else if (mouseEvent.shiftKey)
    delta = 10;
  else if (mouseEvent.altKey)
    delta = 0.1;

  if (direction === 'Down')
    delta *= -1;
  if (modifierMultiplier)
    delta *= modifierMultiplier;

  // Make the new number and constrain it to a precision of 6, this matches numbers the engine returns.
  // Use the Number constructor to forget the fixed precision, so 1.100000 will print as 1.1.
  const result = Number((number + delta).toFixed(6));
  if (!String(result).match(UI._numberRegex))
    return null;
  return result;
};

/**
 * @param {string} wordString
 * @param {!Event} event
 * @param {function(string, number, string):string=} customNumberHandler
 * @return {?string}
 */
UI.createReplacementString = function(wordString, event, customNumberHandler) {
  let prefix;
  let suffix;
  let number;
  let replacementString = null;
  let matches = /(.*#)([\da-fA-F]+)(.*)/.exec(wordString);
  if (matches && matches.length) {
    prefix = matches[1];
    suffix = matches[3];
    number = UI._modifiedHexValue(matches[2], event);
    if (number !== null)
      replacementString = prefix + number + suffix;
  } else {
    matches = /(.*?)(-?(?:\d+(?:\.\d+)?|\.\d+))(.*)/.exec(wordString);
    if (matches && matches.length) {
      prefix = matches[1];
      suffix = matches[3];
      number = UI._modifiedFloatNumber(parseFloat(matches[2]), event);
      if (number !== null) {
        replacementString =
            customNumberHandler ? customNumberHandler(prefix, number, suffix) : prefix + number + suffix;
      }
    }
  }
  return replacementString;
};

/**
 * @param {!Event} event
 * @param {!Element} element
 * @param {function(string,string)=} finishHandler
 * @param {function(string)=} suggestionHandler
 * @param {function(string, number, string):string=} customNumberHandler
 * @return {boolean}
 */
UI.handleElementValueModifications = function(event, element, finishHandler, suggestionHandler, customNumberHandler) {
  /**
   * @return {?Range}
   * @suppressGlobalPropertiesCheck
   */
  function createRange() {
    return document.createRange();
  }

  const arrowKeyOrMouseWheelEvent =
      (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.type === 'mousewheel');
  const pageKeyPressed = (event.key === 'PageUp' || event.key === 'PageDown');
  if (!arrowKeyOrMouseWheelEvent && !pageKeyPressed)
    return false;

  const selection = element.getComponentSelection();
  if (!selection.rangeCount)
    return false;

  const selectionRange = selection.getRangeAt(0);
  if (!selectionRange.commonAncestorContainer.isSelfOrDescendant(element))
    return false;

  const originalValue = element.textContent;
  const wordRange =
      selectionRange.startContainer.rangeOfWord(selectionRange.startOffset, UI.StyleValueDelimiters, element);
  const wordString = wordRange.toString();

  if (suggestionHandler && suggestionHandler(wordString))
    return false;

  const replacementString = UI.createReplacementString(wordString, event, customNumberHandler);

  if (replacementString) {
    const replacementTextNode = createTextNode(replacementString);

    wordRange.deleteContents();
    wordRange.insertNode(replacementTextNode);

    const finalSelectionRange = createRange();
    finalSelectionRange.setStart(replacementTextNode, 0);
    finalSelectionRange.setEnd(replacementTextNode, replacementString.length);

    selection.removeAllRanges();
    selection.addRange(finalSelectionRange);

    event.handled = true;
    event.preventDefault();

    if (finishHandler)
      finishHandler(originalValue, replacementString);

    return true;
  }
  return false;
};

/**
 * @param {number} ms
 * @param {number=} precision
 * @return {string}
 */
Number.preciseMillisToString = function(ms, precision) {
  precision = precision || 0;
  const format = '%.' + precision + 'f\xa0ms';
  return Common.UIString(format, ms);
};

/** @type {!Common.UIStringFormat} */
UI._microsFormat = new Common.UIStringFormat('%.0f\xa0\u03bcs');

/** @type {!Common.UIStringFormat} */
UI._subMillisFormat = new Common.UIStringFormat('%.2f\xa0ms');

/** @type {!Common.UIStringFormat} */
UI._millisFormat = new Common.UIStringFormat('%.0f\xa0ms');

/** @type {!Common.UIStringFormat} */
UI._secondsFormat = new Common.UIStringFormat('%.2f\xa0s');

/** @type {!Common.UIStringFormat} */
UI._minutesFormat = new Common.UIStringFormat('%.1f\xa0min');

/** @type {!Common.UIStringFormat} */
UI._hoursFormat = new Common.UIStringFormat('%.1f\xa0hrs');

/** @type {!Common.UIStringFormat} */
UI._daysFormat = new Common.UIStringFormat('%.1f\xa0days');

/**
 * @param {number} ms
 * @param {boolean=} higherResolution
 * @return {string}
 */
Number.millisToString = function(ms, higherResolution) {
  if (!isFinite(ms))
    return '-';

  if (ms === 0)
    return '0';

  if (higherResolution && ms < 0.1)
    return UI._microsFormat.format(ms * 1000);
  if (higherResolution && ms < 1000)
    return UI._subMillisFormat.format(ms);
  if (ms < 1000)
    return UI._millisFormat.format(ms);

  const seconds = ms / 1000;
  if (seconds < 60)
    return UI._secondsFormat.format(seconds);

  const minutes = seconds / 60;
  if (minutes < 60)
    return UI._minutesFormat.format(minutes);

  const hours = minutes / 60;
  if (hours < 24)
    return UI._hoursFormat.format(hours);

  const days = hours / 24;
  return UI._daysFormat.format(days);
};

/**
 * @param {number} seconds
 * @param {boolean=} higherResolution
 * @return {string}
 */
Number.secondsToString = function(seconds, higherResolution) {
  if (!isFinite(seconds))
    return '-';
  return Number.millisToString(seconds * 1000, higherResolution);
};

/**
 * @param {number} bytes
 * @return {string}
 */
Number.bytesToString = function(bytes) {
  if (bytes < 1024)
    return Common.UIString('%.0f\xa0B', bytes);

  const kilobytes = bytes / 1024;
  if (kilobytes < 100)
    return Common.UIString('%.1f\xa0KB', kilobytes);
  if (kilobytes < 1024)
    return Common.UIString('%.0f\xa0KB', kilobytes);

  const megabytes = kilobytes / 1024;
  if (megabytes < 100)
    return Common.UIString('%.1f\xa0MB', megabytes);
  else
    return Common.UIString('%.0f\xa0MB', megabytes);
};

/**
 * @param {number} num
 * @return {string}
 */
Number.withThousandsSeparator = function(num) {
  let str = num + '';
  const re = /(\d+)(\d{3})/;
  while (str.match(re))
    str = str.replace(re, '$1\xa0$2');  // \xa0 is a non-breaking space
  return str;
};

/**
 * @param {string} format
 * @param {?ArrayLike} substitutions
 * @return {!Element}
 */
UI.formatLocalized = function(format, substitutions) {
  const formatters = {s: substitution => substitution};
  /**
   * @param {!Element} a
   * @param {string|!Element} b
   * @return {!Element}
   */
  function append(a, b) {
    a.appendChild(typeof b === 'string' ? createTextNode(b) : b);
    return a;
  }
  return String.format(Common.UIString(format), substitutions, formatters, createElement('span'), append)
      .formattedResult;
};

/**
 * @return {string}
 */
UI.openLinkExternallyLabel = function() {
  return Common.UIString('Open in new tab');
};

/**
 * @return {string}
 */
UI.copyLinkAddressLabel = function() {
  return Common.UIString('Copy link address');
};

/**
 * @return {string}
 */
UI.anotherProfilerActiveLabel = function() {
  return Common.UIString('Another profiler is already active');
};

/**
 * @param {string|undefined} description
 * @return {string}
 */
UI.asyncStackTraceLabel = function(description) {
  if (description) {
    if (description === 'Promise.resolve')
      description = Common.UIString('Promise resolved');
    else if (description === 'Promise.reject')
      description = Common.UIString('Promise rejected');
    return description + ' ' + Common.UIString('(async)');
  }
  return Common.UIString('Async Call');
};

/**
 * @param {!Element} element
 */
UI.installComponentRootStyles = function(element) {
  UI.appendStyle(element, 'ui/inspectorCommon.css');
  UI.themeSupport.injectHighlightStyleSheets(element);
  UI.themeSupport.injectCustomStyleSheets(element);
  element.classList.add('platform-' + Host.platform());

  // Detect overlay scrollbar enable by checking for nonzero scrollbar width.
  if (!Host.isMac() && UI.measuredScrollbarWidth(element.ownerDocument) === 0)
    element.classList.add('overlay-scrollbar-enabled');
};

/**
 * @param {?Document} document
 * @return {number}
 */
UI.measuredScrollbarWidth = function(document) {
  if (typeof UI._measuredScrollbarWidth === 'number')
    return UI._measuredScrollbarWidth;
  if (!document)
    return 16;
  const scrollDiv = document.createElement('div');
  scrollDiv.setAttribute('style', 'width: 100px; height: 100px; overflow: scroll;');
  document.body.appendChild(scrollDiv);
  UI._measuredScrollbarWidth = scrollDiv.offsetWidth - scrollDiv.clientWidth;
  document.body.removeChild(scrollDiv);
  return UI._measuredScrollbarWidth;
};

/**
 * @param {!Element} element
 * @param {string=} cssFile
 * @return {!DocumentFragment}
 */
UI.createShadowRootWithCoreStyles = function(element, cssFile) {
  const shadowRoot = element.createShadowRoot();
  UI.appendStyle(shadowRoot, 'ui/inspectorCommon.css');
  UI.themeSupport.injectHighlightStyleSheets(shadowRoot);
  UI.themeSupport.injectCustomStyleSheets(shadowRoot);
  if (cssFile)
    UI.appendStyle(shadowRoot, cssFile);
  shadowRoot.addEventListener('focus', UI._focusChanged.bind(UI), true);
  return shadowRoot;
};

/**
 * @param {!Document} document
 * @param {!Event} event
 */
UI._windowFocused = function(document, event) {
  if (event.target.document.nodeType === Node.DOCUMENT_NODE)
    document.body.classList.remove('inactive');
  UI._keyboardFocus = true;
  const listener = () => {
    const activeElement = document.deepActiveElement();
    if (activeElement)
      activeElement.removeAttribute('data-keyboard-focus');
    UI._keyboardFocus = false;
  };
  document.defaultView.requestAnimationFrame(() => {
    UI._keyboardFocus = false;
    document.removeEventListener('mousedown', listener, true);
  });
  document.addEventListener('mousedown', listener, true);

};

/**
 * @param {!Document} document
 * @param {!Event} event
 */
UI._windowBlurred = function(document, event) {
  if (event.target.document.nodeType === Node.DOCUMENT_NODE)
    document.body.classList.add('inactive');
};

/**
 * @param {!Event} event
 */
UI._focusChanged = function(event) {
  const document = event.target && event.target.ownerDocument;
  const element = document ? document.deepActiveElement() : null;
  UI.Widget.focusWidgetForNode(element);
  UI.XWidget.focusWidgetForNode(element);
  if (!UI._keyboardFocus)
    return;
  element.setAttribute('data-keyboard-focus', 'true');
  element.addEventListener('blur', () => element.removeAttribute('data-keyboard-focus'), {once: true, capture: true});
};

/**
 * @unrestricted
 */
UI.ElementFocusRestorer = class {
  /**
   * @param {!Element} element
   */
  constructor(element) {
    this._element = element;
    this._previous = element.ownerDocument.deepActiveElement();
    element.focus();
  }

  restore() {
    if (!this._element)
      return;
    if (this._element.hasFocus() && this._previous)
      this._previous.focus();
    this._previous = null;
    this._element = null;
  }
};

/**
 * @param {!Element} element
 * @param {number} offset
 * @param {number} length
 * @param {!Array.<!Object>=} domChanges
 * @return {?Element}
 */
UI.highlightSearchResult = function(element, offset, length, domChanges) {
  const result = UI.highlightSearchResults(element, [new TextUtils.SourceRange(offset, length)], domChanges);
  return result.length ? result[0] : null;
};

/**
 * @param {!Element} element
 * @param {!Array.<!TextUtils.SourceRange>} resultRanges
 * @param {!Array.<!Object>=} changes
 * @return {!Array.<!Element>}
 */
UI.highlightSearchResults = function(element, resultRanges, changes) {
  return UI.highlightRangesWithStyleClass(element, resultRanges, UI.highlightedSearchResultClassName, changes);
};

/**
 * @param {!Element} element
 * @param {string} className
 */
UI.runCSSAnimationOnce = function(element, className) {
  function animationEndCallback() {
    element.classList.remove(className);
    element.removeEventListener('webkitAnimationEnd', animationEndCallback, false);
  }

  if (element.classList.contains(className))
    element.classList.remove(className);

  element.addEventListener('webkitAnimationEnd', animationEndCallback, false);
  element.classList.add(className);
};

/**
 * @param {!Element} element
 * @param {!Array.<!TextUtils.SourceRange>} resultRanges
 * @param {string} styleClass
 * @param {!Array.<!Object>=} changes
 * @return {!Array.<!Element>}
 */
UI.highlightRangesWithStyleClass = function(element, resultRanges, styleClass, changes) {
  changes = changes || [];
  const highlightNodes = [];
  const textNodes = element.childTextNodes();
  const lineText = textNodes
                       .map(function(node) {
                         return node.textContent;
                       })
                       .join('');
  const ownerDocument = element.ownerDocument;

  if (textNodes.length === 0)
    return highlightNodes;

  const nodeRanges = [];
  let rangeEndOffset = 0;
  for (let i = 0; i < textNodes.length; ++i) {
    const range = {};
    range.offset = rangeEndOffset;
    range.length = textNodes[i].textContent.length;
    rangeEndOffset = range.offset + range.length;
    nodeRanges.push(range);
  }

  let startIndex = 0;
  for (let i = 0; i < resultRanges.length; ++i) {
    const startOffset = resultRanges[i].offset;
    const endOffset = startOffset + resultRanges[i].length;

    while (startIndex < textNodes.length &&
           nodeRanges[startIndex].offset + nodeRanges[startIndex].length <= startOffset)
      startIndex++;
    let endIndex = startIndex;
    while (endIndex < textNodes.length && nodeRanges[endIndex].offset + nodeRanges[endIndex].length < endOffset)
      endIndex++;
    if (endIndex === textNodes.length)
      break;

    const highlightNode = ownerDocument.createElement('span');
    highlightNode.className = styleClass;
    highlightNode.textContent = lineText.substring(startOffset, endOffset);

    const lastTextNode = textNodes[endIndex];
    const lastText = lastTextNode.textContent;
    lastTextNode.textContent = lastText.substring(endOffset - nodeRanges[endIndex].offset);
    changes.push({node: lastTextNode, type: 'changed', oldText: lastText, newText: lastTextNode.textContent});

    if (startIndex === endIndex) {
      lastTextNode.parentElement.insertBefore(highlightNode, lastTextNode);
      changes.push({node: highlightNode, type: 'added', nextSibling: lastTextNode, parent: lastTextNode.parentElement});
      highlightNodes.push(highlightNode);

      const prefixNode =
          ownerDocument.createTextNode(lastText.substring(0, startOffset - nodeRanges[startIndex].offset));
      lastTextNode.parentElement.insertBefore(prefixNode, highlightNode);
      changes.push({node: prefixNode, type: 'added', nextSibling: highlightNode, parent: lastTextNode.parentElement});
    } else {
      const firstTextNode = textNodes[startIndex];
      const firstText = firstTextNode.textContent;
      const anchorElement = firstTextNode.nextSibling;

      firstTextNode.parentElement.insertBefore(highlightNode, anchorElement);
      changes.push(
          {node: highlightNode, type: 'added', nextSibling: anchorElement, parent: firstTextNode.parentElement});
      highlightNodes.push(highlightNode);

      firstTextNode.textContent = firstText.substring(0, startOffset - nodeRanges[startIndex].offset);
      changes.push({node: firstTextNode, type: 'changed', oldText: firstText, newText: firstTextNode.textContent});

      for (let j = startIndex + 1; j < endIndex; j++) {
        const textNode = textNodes[j];
        const text = textNode.textContent;
        textNode.textContent = '';
        changes.push({node: textNode, type: 'changed', oldText: text, newText: textNode.textContent});
      }
    }
    startIndex = endIndex;
    nodeRanges[startIndex].offset = endOffset;
    nodeRanges[startIndex].length = lastTextNode.textContent.length;
  }
  return highlightNodes;
};

UI.applyDomChanges = function(domChanges) {
  for (let i = 0, size = domChanges.length; i < size; ++i) {
    const entry = domChanges[i];
    switch (entry.type) {
      case 'added':
        entry.parent.insertBefore(entry.node, entry.nextSibling);
        break;
      case 'changed':
        entry.node.textContent = entry.newText;
        break;
    }
  }
};

UI.revertDomChanges = function(domChanges) {
  for (let i = domChanges.length - 1; i >= 0; --i) {
    const entry = domChanges[i];
    switch (entry.type) {
      case 'added':
        entry.node.remove();
        break;
      case 'changed':
        entry.node.textContent = entry.oldText;
        break;
    }
  }
};

/**
 * @param {!Element} element
 * @param {?Element=} containerElement
 * @return {!UI.Size}
 */
UI.measurePreferredSize = function(element, containerElement) {
  const oldParent = element.parentElement;
  const oldNextSibling = element.nextSibling;
  containerElement = containerElement || element.ownerDocument.body;
  containerElement.appendChild(element);
  element.positionAt(0, 0);
  const result = element.getBoundingClientRect();

  element.positionAt(undefined, undefined);
  if (oldParent)
    oldParent.insertBefore(element, oldNextSibling);
  else
    element.remove();
  return new UI.Size(result.width, result.height);
};

/**
 * @unrestricted
 */
UI.InvokeOnceHandlers = class {
  /**
   * @param {boolean} autoInvoke
   */
  constructor(autoInvoke) {
    this._handlers = null;
    this._autoInvoke = autoInvoke;
  }

  /**
   * @param {!Object} object
   * @param {function()} method
   */
  add(object, method) {
    if (!this._handlers) {
      this._handlers = new Map();
      if (this._autoInvoke)
        this.scheduleInvoke();
    }
    let methods = this._handlers.get(object);
    if (!methods) {
      methods = new Set();
      this._handlers.set(object, methods);
    }
    methods.add(method);
  }

  /**
   * @suppressGlobalPropertiesCheck
   */
  scheduleInvoke() {
    if (this._handlers)
      requestAnimationFrame(this._invoke.bind(this));
  }

  _invoke() {
    const handlers = this._handlers;
    this._handlers = null;
    const keys = handlers.keysArray();
    for (let i = 0; i < keys.length; ++i) {
      const object = keys[i];
      const methods = handlers.get(object).valuesArray();
      for (let j = 0; j < methods.length; ++j)
        methods[j].call(object);
    }
  }
};

UI._coalescingLevel = 0;
UI._postUpdateHandlers = null;

UI.startBatchUpdate = function() {
  if (!UI._coalescingLevel++)
    UI._postUpdateHandlers = new UI.InvokeOnceHandlers(false);
};

UI.endBatchUpdate = function() {
  if (--UI._coalescingLevel)
    return;
  UI._postUpdateHandlers.scheduleInvoke();
  UI._postUpdateHandlers = null;
};

/**
 * @param {!Object} object
 * @param {function()} method
 */
UI.invokeOnceAfterBatchUpdate = function(object, method) {
  if (!UI._postUpdateHandlers)
    UI._postUpdateHandlers = new UI.InvokeOnceHandlers(true);
  UI._postUpdateHandlers.add(object, method);
};

/**
 * @param {!Window} window
 * @param {!Function} func
 * @param {!Array.<{from:number, to:number}>} params
 * @param {number} duration
 * @param {function()=} animationComplete
 * @return {function()}
 */
UI.animateFunction = function(window, func, params, duration, animationComplete) {
  const start = window.performance.now();
  let raf = window.requestAnimationFrame(animationStep);

  function animationStep(timestamp) {
    const progress = Number.constrain((timestamp - start) / duration, 0, 1);
    func(...params.map(p => p.from + (p.to - p.from) * progress));
    if (progress < 1)
      raf = window.requestAnimationFrame(animationStep);
    else if (animationComplete)
      animationComplete();
  }

  return () => window.cancelAnimationFrame(raf);
};

/**
 * @unrestricted
 */
UI.LongClickController = class extends Common.Object {
  /**
   * @param {!Element} element
   * @param {function(!Event)} callback
   */
  constructor(element, callback) {
    super();
    this._element = element;
    this._callback = callback;
    this._enable();
  }

  reset() {
    if (this._longClickInterval) {
      clearInterval(this._longClickInterval);
      delete this._longClickInterval;
    }
  }

  _enable() {
    if (this._longClickData)
      return;
    const boundMouseDown = mouseDown.bind(this);
    const boundMouseUp = mouseUp.bind(this);
    const boundReset = this.reset.bind(this);

    this._element.addEventListener('mousedown', boundMouseDown, false);
    this._element.addEventListener('mouseout', boundReset, false);
    this._element.addEventListener('mouseup', boundMouseUp, false);
    this._element.addEventListener('click', boundReset, true);

    this._longClickData = {mouseUp: boundMouseUp, mouseDown: boundMouseDown, reset: boundReset};

    /**
     * @param {!Event} e
     * @this {UI.LongClickController}
     */
    function mouseDown(e) {
      if (e.which !== 1)
        return;
      const callback = this._callback;
      this._longClickInterval = setTimeout(callback.bind(null, e), 200);
    }

    /**
     * @param {!Event} e
     * @this {UI.LongClickController}
     */
    function mouseUp(e) {
      if (e.which !== 1)
        return;
      this.reset();
    }
  }

  dispose() {
    if (!this._longClickData)
      return;
    this._element.removeEventListener('mousedown', this._longClickData.mouseDown, false);
    this._element.removeEventListener('mouseout', this._longClickData.reset, false);
    this._element.removeEventListener('mouseup', this._longClickData.mouseUp, false);
    this._element.addEventListener('click', this._longClickData.reset, true);
    delete this._longClickData;
  }
};

/**
 * @param {!Document} document
 * @param {!Common.Setting} themeSetting
 */
UI.initializeUIUtils = function(document, themeSetting) {
  document.body.classList.toggle('inactive', !document.hasFocus());
  document.defaultView.addEventListener('focus', UI._windowFocused.bind(UI, document), false);
  document.defaultView.addEventListener('blur', UI._windowBlurred.bind(UI, document), false);
  document.addEventListener('focus', UI._focusChanged.bind(UI), true);
  document.addEventListener('keydown', event => {
    UI._keyboardFocus = true;
    document.defaultView.requestAnimationFrame(() => void(UI._keyboardFocus = false));
  }, true);

  if (!UI.themeSupport)
    UI.themeSupport = new UI.ThemeSupport(themeSetting);
  UI.themeSupport.applyTheme(document);

  const body = /** @type {!Element} */ (document.body);
  UI.appendStyle(body, 'ui/inspectorStyle.css');
  UI.GlassPane.setContainer(/** @type {!Element} */ (document.body));
};

/**
 * @param {string} name
 * @return {string}
 */
UI.beautifyFunctionName = function(name) {
  return name || Common.UIString('(anonymous)');
};

/**
 * @param {string} localName
 * @param {string} typeExtension
 * @param {!Object} prototype
 * @return {function()}
 * @suppressGlobalPropertiesCheck
 * @template T
 */
UI.registerCustomElement = function(localName, typeExtension, prototype) {
  return document.registerElement(typeExtension, {prototype: Object.create(prototype), extends: localName});
};

/**
 * @param {string} text
 * @param {function(!Event)=} clickHandler
 * @param {string=} className
 * @param {boolean=} primary
 * @return {!Element}
 */
UI.createTextButton = function(text, clickHandler, className, primary) {
  const element = createElementWithClass('button', className || '', 'text-button');
  element.textContent = text;
  if (primary)
    element.classList.add('primary-button');
  if (clickHandler)
    element.addEventListener('click', clickHandler, false);
  return element;
};

/**
 * @param {string=} className
 * @param {string=} type
 * @return {!Element}
 */
UI.createInput = function(className, type) {
  const element = createElementWithClass('input', className || '');
  element.spellcheck = false;
  element.classList.add('harmony-input');
  if (type)
    element.type = type;
  return element;
};

/**
 * @param {string} name
 * @param {string} title
 * @param {boolean=} checked
 * @return {!Element}
 */
UI.createRadioLabel = function(name, title, checked) {
  const element = createElement('label', 'dt-radio');
  element.radioElement.name = name;
  element.radioElement.checked = !!checked;
  element.createTextChild(title);
  return element;
};

/**
 * @param {string} title
 * @param {string} iconClass
 * @return {!Element}
 */
UI.createLabel = function(title, iconClass) {
  const element = createElement('label', 'dt-icon-label');
  element.createChild('span').textContent = title;
  element.type = iconClass;
  return element;
};

/**
 * @return {!Element}
 * @param {number} min
 * @param {number} max
 * @param {number} tabIndex
 */
UI.createSliderLabel = function(min, max, tabIndex) {
  const element = createElement('label', 'dt-slider');
  element.sliderElement.min = min;
  element.sliderElement.max = max;
  element.sliderElement.step = 1;
  element.sliderElement.tabIndex = tabIndex;
  return element;
};

/**
 * @param {!Node} node
 * @param {string} cssFile
 * @suppressGlobalPropertiesCheck
 */
UI.appendStyle = function(node, cssFile) {
  const content = Runtime.cachedResources[cssFile] || '';
  if (!content)
    console.error(cssFile + ' not preloaded. Check module.json');
  let styleElement = createElement('style');
  styleElement.type = 'text/css';
  styleElement.textContent = content;
  node.appendChild(styleElement);

  const themeStyleSheet = UI.themeSupport.themeStyleSheet(cssFile, content);
  if (themeStyleSheet) {
    styleElement = createElement('style');
    styleElement.type = 'text/css';
    styleElement.textContent = themeStyleSheet + '\n' + Runtime.resolveSourceURL(cssFile + '.theme');
    node.appendChild(styleElement);
  }
};

/**
 * @extends {HTMLLabelElement}
 */
UI.CheckboxLabel = class extends HTMLLabelElement {
  constructor() {
    super();
    /** @type {!DocumentFragment} */
    this._shadowRoot;
    /** @type {!HTMLInputElement} */
    this.checkboxElement;
    /** @type {!Element} */
    this.textElement;
    throw new Error('Checkbox must be created via factory method.');
  }

  /**
   * @override
   */
  createdCallback() {
    UI.CheckboxLabel._lastId = (UI.CheckboxLabel._lastId || 0) + 1;
    const id = 'ui-checkbox-label' + UI.CheckboxLabel._lastId;
    this._shadowRoot = UI.createShadowRootWithCoreStyles(this, 'ui/checkboxTextLabel.css');
    this.checkboxElement = /** @type {!HTMLInputElement} */ (this._shadowRoot.createChild('input'));
    this.checkboxElement.type = 'checkbox';
    this.checkboxElement.setAttribute('id', id);
    this.textElement = this._shadowRoot.createChild('label', 'dt-checkbox-text');
    this.textElement.setAttribute('for', id);
    this._shadowRoot.createChild('content');
  }

  /**
   * @param {string=} title
   * @param {boolean=} checked
   * @param {string=} subtitle
   * @return {!UI.CheckboxLabel}
   */
  static create(title, checked, subtitle) {
    if (!UI.CheckboxLabel._constructor)
      UI.CheckboxLabel._constructor = UI.registerCustomElement('label', 'dt-checkbox', UI.CheckboxLabel.prototype);
    const element = /** @type {!UI.CheckboxLabel} */ (new UI.CheckboxLabel._constructor());
    element.checkboxElement.checked = !!checked;
    if (title !== undefined) {
      element.textElement.textContent = title;
      if (subtitle !== undefined)
        element.textElement.createChild('div', 'dt-checkbox-subtitle').textContent = subtitle;
    }
    return element;
  }

  /**
   * @param {string} color
   * @this {Element}
   */
  set backgroundColor(color) {
    this.checkboxElement.classList.add('dt-checkbox-themed');
    this.checkboxElement.style.backgroundColor = color;
  }

  /**
   * @param {string} color
   * @this {Element}
   */
  set checkColor(color) {
    this.checkboxElement.classList.add('dt-checkbox-themed');
    const stylesheet = createElement('style');
    stylesheet.textContent = 'input.dt-checkbox-themed:checked:after { background-color: ' + color + '}';
    this._shadowRoot.appendChild(stylesheet);
  }

  /**
   * @param {string} color
   * @this {Element}
   */
  set borderColor(color) {
    this.checkboxElement.classList.add('dt-checkbox-themed');
    this.checkboxElement.style.borderColor = color;
  }
};

(function() {
  UI.registerCustomElement('button', 'text-button', {
    /**
     * @this {Element}
     */
    createdCallback: function() {
      this.type = 'button';
      const root = UI.createShadowRootWithCoreStyles(this, 'ui/textButton.css');
      root.createChild('content');
    },

    __proto__: HTMLButtonElement.prototype
  });

  UI.registerCustomElement('label', 'dt-radio', {
    /**
     * @this {Element}
     */
    createdCallback: function() {
      this.radioElement = this.createChild('input', 'dt-radio-button');
      this.radioElement.type = 'radio';
      const root = UI.createShadowRootWithCoreStyles(this, 'ui/radioButton.css');
      root.createChild('content').select = '.dt-radio-button';
      root.createChild('content');
      this.addEventListener('click', radioClickHandler, false);
    },

    __proto__: HTMLLabelElement.prototype
  });

  /**
   * @param {!Event} event
   * @suppressReceiverCheck
   * @this {Element}
   */
  function radioClickHandler(event) {
    if (this.radioElement.checked || this.radioElement.disabled)
      return;
    this.radioElement.checked = true;
    this.radioElement.dispatchEvent(new Event('change'));
  }

  UI.registerCustomElement('label', 'dt-icon-label', {
    /**
     * @this {Element}
     */
    createdCallback: function() {
      const root = UI.createShadowRootWithCoreStyles(this);
      this._iconElement = UI.Icon.create();
      this._iconElement.style.setProperty('margin-right', '4px');
      root.appendChild(this._iconElement);
      root.createChild('content');
    },

    /**
     * @param {string} type
     * @this {Element}
     */
    set type(type) {
      this._iconElement.setIconType(type);
    },

    __proto__: HTMLLabelElement.prototype
  });

  UI.registerCustomElement('label', 'dt-slider', {
    /**
     * @this {Element}
     */
    createdCallback: function() {
      const root = UI.createShadowRootWithCoreStyles(this, 'ui/slider.css');
      this.sliderElement = createElementWithClass('input', 'dt-range-input');
      this.sliderElement.type = 'range';
      root.appendChild(this.sliderElement);
    },

    /**
     * @param {number} amount
     * @this {Element}
     */
    set value(amount) {
      this.sliderElement.value = amount;
    },

    /**
     * @this {Element}
     */
    get value() {
      return this.sliderElement.value;
    },

    __proto__: HTMLLabelElement.prototype
  });

  UI.registerCustomElement('label', 'dt-small-bubble', {
    /**
     * @this {Element}
     */
    createdCallback: function() {
      const root = UI.createShadowRootWithCoreStyles(this, 'ui/smallBubble.css');
      this._textElement = root.createChild('div');
      this._textElement.className = 'info';
      this._textElement.createChild('content');
    },

    /**
     * @param {string} type
     * @this {Element}
     */
    set type(type) {
      this._textElement.className = type;
    },

    __proto__: HTMLLabelElement.prototype
  });

  UI.registerCustomElement('div', 'dt-close-button', {
    /**
     * @this {Element}
     */
    createdCallback: function() {
      const root = UI.createShadowRootWithCoreStyles(this, 'ui/closeButton.css');
      this._buttonElement = root.createChild('div', 'close-button');
      const regularIcon = UI.Icon.create('smallicon-cross', 'default-icon');
      this._hoverIcon = UI.Icon.create('mediumicon-red-cross-hover', 'hover-icon');
      this._activeIcon = UI.Icon.create('mediumicon-red-cross-active', 'active-icon');
      this._buttonElement.appendChild(regularIcon);
      this._buttonElement.appendChild(this._hoverIcon);
      this._buttonElement.appendChild(this._activeIcon);
    },

    /**
     * @param {boolean} gray
     * @this {Element}
     */
    set gray(gray) {
      if (gray) {
        this._hoverIcon.setIconType('mediumicon-gray-cross-hover');
        this._activeIcon.setIconType('mediumicon-gray-cross-active');
      } else {
        this._hoverIcon.setIconType('mediumicon-red-cross-hover');
        this._activeIcon.setIconType('mediumicon-red-cross-active');
      }
    },

    __proto__: HTMLDivElement.prototype
  });
})();

/**
 * @param {!Element} input
 * @param {function(string)} apply
 * @param {function(string):boolean} validate
 * @param {boolean} numeric
 * @param {number=} modifierMultiplier
 * @return {function(string)}
 */
UI.bindInput = function(input, apply, validate, numeric, modifierMultiplier) {
  input.addEventListener('change', onChange, false);
  input.addEventListener('input', onInput, false);
  input.addEventListener('keydown', onKeyDown, false);
  input.addEventListener('focus', input.select.bind(input), false);

  function onInput() {
    input.classList.toggle('error-input', !validate(input.value));
  }

  function onChange() {
    const valid = validate(input.value);
    input.classList.toggle('error-input', !valid);
    if (valid)
      apply(input.value);
  }

  /**
   * @param {!Event} event
   */
  function onKeyDown(event) {
    if (isEnterKey(event)) {
      if (validate(input.value))
        apply(input.value);
      event.preventDefault();
      return;
    }

    if (!numeric)
      return;

    const value = UI._modifiedFloatNumber(parseFloat(input.value), event, modifierMultiplier);
    const stringValue = value ? String(value) : '';
    if (!validate(stringValue) || !value)
      return;

    input.value = stringValue;
    apply(input.value);
    event.preventDefault();
  }

  /**
   * @param {string} value
   */
  function setValue(value) {
    if (value === input.value)
      return;
    const valid = validate(value);
    input.classList.toggle('error-input', !valid);
    input.value = value;
  }

  return setValue;
};

/**
 * @param {!CanvasRenderingContext2D} context
 * @param {string} text
 * @param {number} maxWidth
 * @param {function(string, number):string} trimFunction
 * @return {string}
 */
UI.trimText = function(context, text, maxWidth, trimFunction) {
  const maxLength = 200;
  if (maxWidth <= 10)
    return '';
  if (text.length > maxLength)
    text = trimFunction(text, maxLength);
  const textWidth = UI.measureTextWidth(context, text);
  if (textWidth <= maxWidth)
    return text;

  let l = 0;
  let r = text.length;
  let lv = 0;
  let rv = textWidth;
  while (l < r && lv !== rv && lv !== maxWidth) {
    const m = Math.ceil(l + (r - l) * (maxWidth - lv) / (rv - lv));
    const mv = UI.measureTextWidth(context, trimFunction(text, m));
    if (mv <= maxWidth) {
      l = m;
      lv = mv;
    } else {
      r = m - 1;
      rv = mv;
    }
  }
  text = trimFunction(text, l);
  return text !== '\u2026' ? text : '';
};

/**
 * @param {!CanvasRenderingContext2D} context
 * @param {string} text
 * @param {number} maxWidth
 * @return {string}
 */
UI.trimTextMiddle = function(context, text, maxWidth) {
  return UI.trimText(context, text, maxWidth, (text, width) => text.trimMiddle(width));
};

/**
 * @param {!CanvasRenderingContext2D} context
 * @param {string} text
 * @param {number} maxWidth
 * @return {string}
 */
UI.trimTextEnd = function(context, text, maxWidth) {
  return UI.trimText(context, text, maxWidth, (text, width) => text.trimEnd(width));
};

/**
 * @param {!CanvasRenderingContext2D} context
 * @param {string} text
 * @return {number}
 */
UI.measureTextWidth = function(context, text) {
  const maxCacheableLength = 200;
  if (text.length > maxCacheableLength)
    return context.measureText(text).width;

  let widthCache = UI.measureTextWidth._textWidthCache;
  if (!widthCache) {
    widthCache = new Map();
    UI.measureTextWidth._textWidthCache = widthCache;
  }
  const font = context.font;
  let textWidths = widthCache.get(font);
  if (!textWidths) {
    textWidths = new Map();
    widthCache.set(font, textWidths);
  }
  let width = textWidths.get(text);
  if (!width) {
    width = context.measureText(text).width;
    textWidths.set(text, width);
  }
  return width;
};

/**
 * @unrestricted
 */
UI.ThemeSupport = class {
  /**
   * @param {!Common.Setting} setting
   */
  constructor(setting) {
    this._themeName = setting.get() || 'default';
    this._themableProperties = new Set([
      'color', 'box-shadow', 'text-shadow', 'outline-color', 'background-image', 'background-color',
      'border-left-color', 'border-right-color', 'border-top-color', 'border-bottom-color', '-webkit-border-image',
      'fill', 'stroke'
    ]);
    /** @type {!Map<string, string>} */
    this._cachedThemePatches = new Map();
    this._setting = setting;
    this._customSheets = new Set();
  }

  /**
   * @return {boolean}
   */
  hasTheme() {
    return this._themeName !== 'default';
  }

  /**
   * @return {string}
   */
  themeName() {
    return this._themeName;
  }

  /**
   * @param {!Element} element
   */
  injectHighlightStyleSheets(element) {
    this._injectingStyleSheet = true;
    UI.appendStyle(element, 'ui/inspectorSyntaxHighlight.css');
    if (this._themeName === 'dark')
      UI.appendStyle(element, 'ui/inspectorSyntaxHighlightDark.css');
    this._injectingStyleSheet = false;
  }

   /**
   * @param {!Element|!ShadowRoot} element
   */
  injectCustomStyleSheets(element) {
    for (const sheet of this._customSheets){
      const styleElement = createElement('style');
      styleElement.type = 'text/css';
      styleElement.textContent = sheet;
      element.appendChild(styleElement);
    }
  }

  /**
   * @param {string} sheetText
   */
  addCustomStylesheet(sheetText) {
    this._customSheets.add(sheetText);
  }

  /**
   * @param {!Document} document
   */
  applyTheme(document) {
    if (!this.hasTheme())
      return;

    if (this._themeName === 'dark')
      document.documentElement.classList.add('-theme-with-dark-background');

    const styleSheets = document.styleSheets;
    const result = [];
    for (let i = 0; i < styleSheets.length; ++i)
      result.push(this._patchForTheme(styleSheets[i].href, styleSheets[i]));
    result.push('/*# sourceURL=inspector.css.theme */');

    const styleElement = createElement('style');
    styleElement.type = 'text/css';
    styleElement.textContent = result.join('\n');
    document.head.appendChild(styleElement);
  }

  /**
   * @param {string} id
   * @param {string} text
   * @return {string}
   * @suppressGlobalPropertiesCheck
   */
  themeStyleSheet(id, text) {
    if (!this.hasTheme() || this._injectingStyleSheet)
      return '';

    let patch = this._cachedThemePatches.get(id);
    if (!patch) {
      const styleElement = createElement('style');
      styleElement.type = 'text/css';
      styleElement.textContent = text;
      document.body.appendChild(styleElement);
      patch = this._patchForTheme(id, styleElement.sheet);
      document.body.removeChild(styleElement);
    }
    return patch;
  }

  /**
   * @param {string} id
   * @param {!StyleSheet} styleSheet
   * @return {string}
   */
  _patchForTheme(id, styleSheet) {
    const cached = this._cachedThemePatches.get(id);
    if (cached)
      return cached;

    try {
      const rules = styleSheet.cssRules;
      const result = [];
      for (let j = 0; j < rules.length; ++j) {
        if (rules[j] instanceof CSSImportRule) {
          result.push(this._patchForTheme(rules[j].styleSheet.href, rules[j].styleSheet));
          continue;
        }
        const output = [];
        const style = rules[j].style;
        const selectorText = rules[j].selectorText;
        for (let i = 0; style && i < style.length; ++i)
          this._patchProperty(selectorText, style, style[i], output);
        if (output.length)
          result.push(rules[j].selectorText + '{' + output.join('') + '}');
      }

      const fullText = result.join('\n');
      this._cachedThemePatches.set(id, fullText);
      return fullText;
    } catch (e) {
      this._setting.set('default');
      return '';
    }
  }

  /**
   * @param {string} selectorText
   * @param {!CSSStyleDeclaration} style
   * @param {string} name
   * @param {!Array<string>} output
   *
   * Theming API is primarily targeted at making dark theme look good.
   * - If rule has ".-theme-preserve" in selector, it won't be affected.
   * - One can create specializations for dark themes via body.-theme-with-dark-background selector in host context.
   */
  _patchProperty(selectorText, style, name, output) {
    if (!this._themableProperties.has(name))
      return;

    const value = style.getPropertyValue(name);
    if (!value || value === 'none' || value === 'inherit' || value === 'initial' || value === 'transparent')
      return;
    if (name === 'background-image' && value.indexOf('gradient') === -1)
      return;

    if (selectorText.indexOf('-theme-') !== -1)
      return;

    let colorUsage = UI.ThemeSupport.ColorUsage.Unknown;
    if (name.indexOf('background') === 0 || name.indexOf('border') === 0)
      colorUsage |= UI.ThemeSupport.ColorUsage.Background;
    if (name.indexOf('background') === -1)
      colorUsage |= UI.ThemeSupport.ColorUsage.Foreground;

    output.push(name);
    output.push(':');
    const items = value.replace(Common.Color.Regex, '\0$1\0').split('\0');
    for (let i = 0; i < items.length; ++i)
      output.push(this.patchColorText(items[i], colorUsage));
    if (style.getPropertyPriority(name))
      output.push(' !important');
    output.push(';');
  }

  /**
   * @param {string} text
   * @param {!UI.ThemeSupport.ColorUsage} colorUsage
   * @return {string}
   */
  patchColorText(text, colorUsage) {
    const color = Common.Color.parse(text);
    if (!color)
      return text;
    const outColor = this.patchColor(color, colorUsage);
    let outText = outColor.asString(null);
    if (!outText)
      outText = outColor.asString(outColor.hasAlpha() ? Common.Color.Format.RGBA : Common.Color.Format.RGB);
    return outText || text;
  }

  /**
   * @param {!Common.Color} color
   * @param {!UI.ThemeSupport.ColorUsage} colorUsage
   * @return {!Common.Color}
   */
  patchColor(color, colorUsage) {
    const hsla = color.hsla();
    this._patchHSLA(hsla, colorUsage);
    const rgba = [];
    Common.Color.hsl2rgb(hsla, rgba);
    return new Common.Color(rgba, color.format());
  }

  /**
   * @param {!Array<number>} hsla
   * @param {!UI.ThemeSupport.ColorUsage} colorUsage
   */
  _patchHSLA(hsla, colorUsage) {
    const hue = hsla[0];
    const sat = hsla[1];
    let lit = hsla[2];
    const alpha = hsla[3];

    switch (this._themeName) {
      case 'dark':
        const minCap = colorUsage & UI.ThemeSupport.ColorUsage.Background ? 0.14 : 0;
        const maxCap = colorUsage & UI.ThemeSupport.ColorUsage.Foreground ? 0.9 : 1;
        lit = 1 - lit;
        if (lit < minCap * 2)
          lit = minCap + lit / 2;
        else if (lit > 2 * maxCap - 1)
          lit = maxCap - 1 / 2 + lit / 2;

        break;
    }
    hsla[0] = Number.constrain(hue, 0, 1);
    hsla[1] = Number.constrain(sat, 0, 1);
    hsla[2] = Number.constrain(lit, 0, 1);
    hsla[3] = Number.constrain(alpha, 0, 1);
  }
};

/**
 * @enum {number}
 */
UI.ThemeSupport.ColorUsage = {
  Unknown: 0,
  Foreground: 1 << 0,
  Background: 1 << 1,
};

/**
 * @param {string} article
 * @param {string} title
 * @return {!Element}
 */
UI.createDocumentationLink = function(article, title) {
  return UI.XLink.create('https://developers.google.com/web/tools/chrome-devtools/' + article, title);
};

/**
 * @param {string} url
 * @return {!Promise<?Image>}
 */
UI.loadImage = function(url) {
  return new Promise(fulfill => {
    const image = new Image();
    image.addEventListener('load', () => fulfill(image));
    image.addEventListener('error', () => fulfill(null));
    image.src = url;
  });
};

/**
 * @param {?string} data
 * @return {!Promise<?Image>}
 */
UI.loadImageFromData = function(data) {
  return data ? UI.loadImage('data:image/jpg;base64,' + data) : Promise.resolve(null);
};

/** @type {!UI.ThemeSupport} */
UI.themeSupport;

/**
 * @param {function(!File)} callback
 * @return {!Node}
 */
UI.createFileSelectorElement = function(callback) {
  const fileSelectorElement = createElement('input');
  fileSelectorElement.type = 'file';
  fileSelectorElement.style.display = 'none';
  fileSelectorElement.setAttribute('tabindex', -1);
  fileSelectorElement.onchange = onChange;
  function onChange(event) {
    callback(fileSelectorElement.files[0]);
  }
  return fileSelectorElement;
};

/**
 * @const
 * @type {number}
 */
UI.MaxLengthForDisplayedURLs = 150;

UI.MessageDialog = class {
  /**
   * @param {string} message
   * @param {!Document|!Element=} where
   * @return {!Promise}
   */
  static async show(message, where) {
    const dialog = new UI.Dialog();
    dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
    dialog.setDimmed(true);
    const shadowRoot = UI.createShadowRootWithCoreStyles(dialog.contentElement, 'ui/confirmDialog.css');
    const content = shadowRoot.createChild('div', 'widget');
    await new Promise(resolve => {
      const okButton = UI.createTextButton(Common.UIString('OK'), resolve, '', true);
      content.createChild('div', 'message').createChild('span').textContent = message;
      content.createChild('div', 'button').appendChild(okButton);
      dialog.setOutsideClickCallback(event => {
        event.consume();
        resolve();
      });
      dialog.show(where);
      okButton.focus();
    });
    dialog.hide();
  }
};

UI.ConfirmDialog = class {
  /**
   * @param {string} message
   * @param {!Document|!Element=} where
   * @return {!Promise<boolean>}
   */
  static async show(message, where) {
    const dialog = new UI.Dialog();
    dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
    dialog.setDimmed(true);
    const shadowRoot = UI.createShadowRootWithCoreStyles(dialog.contentElement, 'ui/confirmDialog.css');
    const content = shadowRoot.createChild('div', 'widget');
    content.createChild('div', 'message').createChild('span').textContent = message;
    const buttonsBar = content.createChild('div', 'button');
    const result = await new Promise(resolve => {
      buttonsBar.appendChild(UI.createTextButton(Common.UIString('OK'), () => resolve(true), '', true));
      buttonsBar.appendChild(UI.createTextButton(Common.UIString('Cancel'), () => resolve(false)));
      dialog.setOutsideClickCallback(event => {
        event.consume();
        resolve(false);
      });
      dialog.show(where);
    });
    dialog.hide();
    return result;
  }
};

/**
 * @param {!UI.ToolbarToggle} toolbarButton
 * @return {!Element}
 */
UI.createInlineButton = function(toolbarButton) {
  const element = createElement('span');
  const shadowRoot = UI.createShadowRootWithCoreStyles(element, 'ui/inlineButton.css');
  element.classList.add('inline-button');
  const toolbar = new UI.Toolbar('');
  toolbar.appendToolbarItem(toolbarButton);
  shadowRoot.appendChild(toolbar.element);
  return element;
};

/**
 * @param {string} text
 * @param {number} maxLength
 * @return {!DocumentFragment}
 */
UI.createExpandableText = function(text, maxLength) {
  const fragment = createDocumentFragment();
  fragment.textContent = text.slice(0, maxLength);
  const hiddenText = text.slice(maxLength);

  const expandButton = fragment.createChild('span', 'expandable-inline-button');
  expandButton.setAttribute('data-text', ls`Show ${Number.withThousandsSeparator(hiddenText.length)} more`);
  expandButton.addEventListener('click', () => {
    if (expandButton.parentElement)
      expandButton.parentElement.insertBefore(createTextNode(hiddenText), expandButton);
    expandButton.remove();
  });

  const copyButton = fragment.createChild('span', 'expandable-inline-button');
  copyButton.setAttribute('data-text', ls`Copy`);
  copyButton.addEventListener('click', () => {
    InspectorFrontendHost.copyText(text);
  });
  return fragment;
};

/**
 * @interface
 */
UI.Renderer = function() {};

UI.Renderer.prototype = {
  /**
   * @param {!Object} object
   * @param {!UI.Renderer.Options=} options
   * @return {!Promise<?{node: !Node, tree: ?UI.TreeOutline}>}
   */
  render(object, options) {}
};

/**
 * @param {?Object} object
 * @param {!UI.Renderer.Options=} options
 * @return {!Promise<?{node: !Node, tree: ?UI.TreeOutline}>}
 */
UI.Renderer.render = async function(object, options) {
  if (!object)
    throw new Error('Can\'t render ' + object);
  const renderer = await self.runtime.extension(UI.Renderer, object).instance();
  return renderer ? renderer.render(object, options || {}) : null;
};

/** @typedef {!{title: (string|!Element|undefined), editable: (boolean|undefined) }} */
UI.Renderer.Options;
