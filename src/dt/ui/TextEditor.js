// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @interface
 */
UI.TextEditorFactory = function() {};

UI.TextEditorFactory.prototype = {
  /**
   * @param {!UI.TextEditor.Options} options
   * @return {!UI.TextEditor}
   */
  createEditor(options) {}
};

/**
 * @interface
 * @extends {Common.EventTarget}
 */
UI.TextEditor = function() {};

UI.TextEditor.prototype = {

  /**
   * @return {!UI.Widget}
   */
  widget() {},

  /**
   * @return {!TextUtils.TextRange}
   */
  fullRange() {},

  /**
   * @return {!TextUtils.TextRange}
   */
  selection() {},

  /**
   * @param {!TextUtils.TextRange} selection
   */
  setSelection(selection) {},

  /**
   * @param {!TextUtils.TextRange=} textRange
   * @return {string}
   */
  text(textRange) {},

  /**
   * @return {string}
   */
  textWithCurrentSuggestion() {},

  /**
   * @param {string} text
   */
  setText(text) {},

  /**
   * @param {number} lineNumber
   * @return {string}
   */
  line(lineNumber) {},

  newlineAndIndent() {},

  /**
   * @param {function(!KeyboardEvent)} handler
   */
  addKeyDownHandler(handler) {},

  /**
   * @param {?UI.AutocompleteConfig} config
   */
  configureAutocomplete(config) {},

  clearAutocomplete() {},

  /**
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {!{x: number, y: number}}
   */
  visualCoordinates(lineNumber, columnNumber) {},

  /**
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {?{startColumn: number, endColumn: number, type: string}}
   */
  tokenAtTextPosition(lineNumber, columnNumber) {},

  /**
   * @param {string} placeholder
   */
  setPlaceholder(placeholder) {}
};

/** @enum {symbol} */
UI.TextEditor.Events = {
  TextChanged: Symbol('TextChanged'),
  SuggestionChanged: Symbol('SuggestionChanged')
};

/**
 * @typedef {{
 *  bracketMatchingSetting: (!Common.Setting|undefined),
 *  lineNumbers: boolean,
 *  lineWrapping: boolean,
 *  mimeType: (string|undefined),
 *  autoHeight: (boolean|undefined),
 *  padBottom: (boolean|undefined),
 *  maxHighlightLength: (number|undefined),
 *  placeholder: (string|undefined)
 * }}
 */
UI.TextEditor.Options;

/**
 * @typedef {{
 *     substituteRangeCallback: ((function(number, number):?TextUtils.TextRange)|undefined),
 *     tooltipCallback: ((function(number, number):!Promise<?Element>)|undefined),
 *     suggestionsCallback: ((function(!TextUtils.TextRange, !TextUtils.TextRange, boolean=):?Promise.<!UI.SuggestBox.Suggestions>)|undefined),
 *     isWordChar: ((function(string):boolean)|undefined),
 *     anchorBehavior: (UI.GlassPane.AnchorBehavior|undefined)
 * }}
 */
UI.AutocompleteConfig;
