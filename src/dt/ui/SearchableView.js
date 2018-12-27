/*
 * Copyright (C) 2006, 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2007 Matt Lilek (pewtermoose@gmail.com).
 * Copyright (C) 2009 Joseph Pecoraro
 * Copyright (C) 2011 Google Inc. All rights reserved.
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

/**
 * @unrestricted
 */
UI.SearchableView = class extends UI.VBox {
  /**
   * @param {!UI.Searchable} searchable
   * @param {string=} settingName
   */
  constructor(searchable, settingName) {
    super(true);
    this.registerRequiredCSS('ui/searchableView.css');
    this.element[UI.SearchableView._symbol] = this;

    this._searchProvider = searchable;
    this._setting = settingName ? Common.settings.createSetting(settingName, {}) : null;
    this._replaceable = false;

    this.contentElement.createChild('content');
    this._footerElementContainer = this.contentElement.createChild('div', 'search-bar hidden');
    this._footerElementContainer.style.order = 100;
    this._footerElement = this._footerElementContainer.createChild('div', 'toolbar-search');

    const replaceToggleToolbar = new UI.Toolbar('replace-toggle-toolbar', this._footerElement);
    this._replaceToggleButton = new UI.ToolbarToggle(Common.UIString('Replace'), 'mediumicon-replace');
    this._replaceToggleButton.addEventListener(UI.ToolbarButton.Events.Click, this._toggleReplace, this);
    replaceToggleToolbar.appendToolbarItem(this._replaceToggleButton);

    const searchInputElements = this._footerElement.createChild('div', 'toolbar-search-inputs');
    const searchControlElement = searchInputElements.createChild('div', 'toolbar-search-control');

    this._searchInputElement = UI.HistoryInput.create();
    this._searchInputElement.classList.add('search-replace');
    this._searchInputElement.id = 'search-input-field';
    this._searchInputElement.placeholder = Common.UIString('Find');
    searchControlElement.appendChild(this._searchInputElement);

    this._matchesElement = searchControlElement.createChild('label', 'search-results-matches');
    this._matchesElement.setAttribute('for', 'search-input-field');

    const searchNavigationElement = searchControlElement.createChild('div', 'toolbar-search-navigation-controls');

    this._searchNavigationPrevElement =
        searchNavigationElement.createChild('div', 'toolbar-search-navigation toolbar-search-navigation-prev');
    this._searchNavigationPrevElement.addEventListener('click', this._onPrevButtonSearch.bind(this), false);
    this._searchNavigationPrevElement.title = Common.UIString('Search previous');

    this._searchNavigationNextElement =
        searchNavigationElement.createChild('div', 'toolbar-search-navigation toolbar-search-navigation-next');
    this._searchNavigationNextElement.addEventListener('click', this._onNextButtonSearch.bind(this), false);
    this._searchNavigationNextElement.title = Common.UIString('Search next');

    this._searchInputElement.addEventListener('keydown', this._onSearchKeyDown.bind(this), true);
    this._searchInputElement.addEventListener('input', this._onInput.bind(this), false);

    this._replaceInputElement =
        searchInputElements.createChild('input', 'search-replace toolbar-replace-control hidden');
    this._replaceInputElement.addEventListener('keydown', this._onReplaceKeyDown.bind(this), true);
    this._replaceInputElement.placeholder = Common.UIString('Replace');

    this._buttonsContainer = this._footerElement.createChild('div', 'toolbar-search-buttons');
    const firstRowButtons = this._buttonsContainer.createChild('div', 'first-row-buttons');

    const toolbar = new UI.Toolbar('toolbar-search-options', firstRowButtons);

    if (this._searchProvider.supportsCaseSensitiveSearch()) {
      this._caseSensitiveButton = new UI.ToolbarToggle(Common.UIString('Match Case'));
      this._caseSensitiveButton.setText('Aa');
      this._caseSensitiveButton.addEventListener(UI.ToolbarButton.Events.Click, this._toggleCaseSensitiveSearch, this);
      toolbar.appendToolbarItem(this._caseSensitiveButton);
    }

    if (this._searchProvider.supportsRegexSearch()) {
      this._regexButton = new UI.ToolbarToggle(Common.UIString('Use Regular Expression'));
      this._regexButton.setText('.*');
      this._regexButton.addEventListener(UI.ToolbarButton.Events.Click, this._toggleRegexSearch, this);
      toolbar.appendToolbarItem(this._regexButton);
    }

    const cancelButtonElement =
        UI.createTextButton(Common.UIString('Cancel'), this.closeSearch.bind(this), 'search-action-button');
    firstRowButtons.appendChild(cancelButtonElement);

    this._secondRowButtons = this._buttonsContainer.createChild('div', 'second-row-buttons hidden');

    this._replaceButtonElement =
        UI.createTextButton(Common.UIString('Replace'), this._replace.bind(this), 'search-action-button');
    this._replaceButtonElement.disabled = true;
    this._secondRowButtons.appendChild(this._replaceButtonElement);

    this._replaceAllButtonElement =
        UI.createTextButton(Common.UIString('Replace all'), this._replaceAll.bind(this), 'search-action-button');
    this._secondRowButtons.appendChild(this._replaceAllButtonElement);
    this._replaceAllButtonElement.disabled = true;

    this._minimalSearchQuerySize = 3;
    this._loadSetting();
  }

  /**
   * @param {?Element} element
   * @return {?UI.SearchableView}
   */
  static fromElement(element) {
    let view = null;
    while (element && !view) {
      view = element[UI.SearchableView._symbol];
      element = element.parentElementOrShadowHost();
    }
    return view;
  }

  _toggleCaseSensitiveSearch() {
    this._caseSensitiveButton.setToggled(!this._caseSensitiveButton.toggled());
    this._saveSetting();
    this._performSearch(false, true);
  }

  _toggleRegexSearch() {
    this._regexButton.setToggled(!this._regexButton.toggled());
    this._saveSetting();
    this._performSearch(false, true);
  }

  _toggleReplace() {
    this._replaceToggleButton.setToggled(!this._replaceToggleButton.toggled());
    this._updateSecondRowVisibility();
  }

  _saveSetting() {
    if (!this._setting)
      return;
    const settingValue = this._setting.get() || {};
    settingValue.caseSensitive = this._caseSensitiveButton.toggled();
    settingValue.isRegex = this._regexButton.toggled();
    this._setting.set(settingValue);
  }

  _loadSetting() {
    const settingValue = this._setting ? (this._setting.get() || {}) : {};
    if (this._searchProvider.supportsCaseSensitiveSearch())
      this._caseSensitiveButton.setToggled(!!settingValue.caseSensitive);
    if (this._searchProvider.supportsRegexSearch())
      this._regexButton.setToggled(!!settingValue.isRegex);
  }

  /**
   * @param {number} minimalSearchQuerySize
   */
  setMinimalSearchQuerySize(minimalSearchQuerySize) {
    this._minimalSearchQuerySize = minimalSearchQuerySize;
  }

  /**
   * @param {string} placeholder
   */
  setPlaceholder(placeholder) {
    this._searchInputElement.placeholder = placeholder;
  }

  /**
   * @param {boolean} replaceable
   */
  setReplaceable(replaceable) {
    this._replaceable = replaceable;
  }

  /**
   * @param {number} matches
   */
  updateSearchMatchesCount(matches) {
    if (this._searchProvider.currentSearchMatches === matches)
      return;
    this._searchProvider.currentSearchMatches = matches;
    this._updateSearchMatchesCountAndCurrentMatchIndex(this._searchProvider.currentQuery ? matches : 0, -1);
  }

  /**
   * @param {number} currentMatchIndex
   */
  updateCurrentMatchIndex(currentMatchIndex) {
    this._updateSearchMatchesCountAndCurrentMatchIndex(this._searchProvider.currentSearchMatches, currentMatchIndex);
  }

  /**
   * @return {boolean}
   */
  isSearchVisible() {
    return this._searchIsVisible;
  }

  closeSearch() {
    this.cancelSearch();
    if (this._footerElementContainer.hasFocus())
      this.focus();
  }

  _toggleSearchBar(toggled) {
    this._footerElementContainer.classList.toggle('hidden', !toggled);
    this.doResize();
  }

  cancelSearch() {
    if (!this._searchIsVisible)
      return;
    this.resetSearch();
    delete this._searchIsVisible;
    this._toggleSearchBar(false);
  }

  resetSearch() {
    this._clearSearch();
    this._updateReplaceVisibility();
    this._matchesElement.textContent = '';
  }

  refreshSearch() {
    if (!this._searchIsVisible)
      return;
    this.resetSearch();
    this._performSearch(false, false);
  }

  /**
   * @return {boolean}
   */
  handleFindNextShortcut() {
    if (!this._searchIsVisible)
      return false;
    this._searchProvider.jumpToNextSearchResult();
    return true;
  }

  /**
   * @return {boolean}
   */
  handleFindPreviousShortcut() {
    if (!this._searchIsVisible)
      return false;
    this._searchProvider.jumpToPreviousSearchResult();
    return true;
  }

  /**
   * @return {boolean}
   */
  handleFindShortcut() {
    this.showSearchField();
    return true;
  }

  /**
   * @return {boolean}
   */
  handleCancelSearchShortcut() {
    if (!this._searchIsVisible)
      return false;
    this.closeSearch();
    return true;
  }

  /**
   * @param {boolean} enabled
   */
  _updateSearchNavigationButtonState(enabled) {
    this._replaceButtonElement.disabled = !enabled;
    this._replaceAllButtonElement.disabled = !enabled;
    this._searchNavigationPrevElement.classList.toggle('enabled', enabled);
    this._searchNavigationNextElement.classList.toggle('enabled', enabled);
  }

  /**
   * @param {number} matches
   * @param {number} currentMatchIndex
   */
  _updateSearchMatchesCountAndCurrentMatchIndex(matches, currentMatchIndex) {
    if (!this._currentQuery)
      this._matchesElement.textContent = '';
    else if (matches === 0 || currentMatchIndex >= 0)
      this._matchesElement.textContent = Common.UIString('%d of %d', currentMatchIndex + 1, matches);
    else if (matches === 1)
      this._matchesElement.textContent = Common.UIString('1 match');
    else
      this._matchesElement.textContent = Common.UIString('%d matches', matches);
    this._updateSearchNavigationButtonState(matches > 0);
  }

  showSearchField() {
    if (this._searchIsVisible)
      this.cancelSearch();

    let queryCandidate;
    if (!this._searchInputElement.hasFocus()) {
      const selection = UI.inspectorView.element.window().getSelection();
      if (selection.rangeCount)
        queryCandidate = selection.toString().replace(/\r?\n.*/, '');
    }

    this._toggleSearchBar(true);
    this._updateReplaceVisibility();
    if (queryCandidate)
      this._searchInputElement.value = queryCandidate;
    this._performSearch(false, false);
    this._searchInputElement.focus();
    this._searchInputElement.select();
    this._searchIsVisible = true;
  }

  _updateReplaceVisibility() {
    this._replaceToggleButton.setVisible(this._replaceable);
    if (!this._replaceable) {
      this._replaceToggleButton.setToggled(false);
      this._updateSecondRowVisibility();
    }
  }

  /**
   * @param {!Event} event
   */
  _onSearchKeyDown(event) {
    if (isEscKey(event)) {
      this.closeSearch();
      event.consume(true);
      return;
    }
    if (!isEnterKey(event))
      return;

    if (!this._currentQuery)
      this._performSearch(true, true, event.shiftKey);
    else
      this._jumpToNextSearchResult(event.shiftKey);
  }

  /**
   * @param {!Event} event
   */
  _onReplaceKeyDown(event) {
    if (isEnterKey(event))
      this._replace();
  }

  /**
   * @param {boolean=} isBackwardSearch
   */
  _jumpToNextSearchResult(isBackwardSearch) {
    if (!this._currentQuery || !this._searchNavigationPrevElement.classList.contains('enabled'))
      return;

    if (isBackwardSearch)
      this._searchProvider.jumpToPreviousSearchResult();
    else
      this._searchProvider.jumpToNextSearchResult();
  }

  _onNextButtonSearch(event) {
    if (!this._searchNavigationNextElement.classList.contains('enabled'))
      return;
    this._jumpToNextSearchResult();
    this._searchInputElement.focus();
  }

  _onPrevButtonSearch(event) {
    if (!this._searchNavigationPrevElement.classList.contains('enabled'))
      return;
    this._jumpToNextSearchResult(true);
    this._searchInputElement.focus();
  }

  _onFindClick(event) {
    if (!this._currentQuery)
      this._performSearch(true, true);
    else
      this._jumpToNextSearchResult();
    this._searchInputElement.focus();
  }

  _onPreviousClick(event) {
    if (!this._currentQuery)
      this._performSearch(true, true, true);
    else
      this._jumpToNextSearchResult(true);
    this._searchInputElement.focus();
  }

  _clearSearch() {
    delete this._currentQuery;
    if (!!this._searchProvider.currentQuery) {
      delete this._searchProvider.currentQuery;
      this._searchProvider.searchCanceled();
    }
    this._updateSearchMatchesCountAndCurrentMatchIndex(0, -1);
  }

  /**
   * @param {boolean} forceSearch
   * @param {boolean} shouldJump
   * @param {boolean=} jumpBackwards
   */
  _performSearch(forceSearch, shouldJump, jumpBackwards) {
    const query = this._searchInputElement.value;
    if (!query || (!forceSearch && query.length < this._minimalSearchQuerySize && !this._currentQuery)) {
      this._clearSearch();
      return;
    }

    this._currentQuery = query;
    this._searchProvider.currentQuery = query;

    const searchConfig = this._currentSearchConfig();
    this._searchProvider.performSearch(searchConfig, shouldJump, jumpBackwards);
  }

  /**
   * @return {!UI.SearchableView.SearchConfig}
   */
  _currentSearchConfig() {
    const query = this._searchInputElement.value;
    const caseSensitive = this._caseSensitiveButton ? this._caseSensitiveButton.toggled() : false;
    const isRegex = this._regexButton ? this._regexButton.toggled() : false;
    return new UI.SearchableView.SearchConfig(query, caseSensitive, isRegex);
  }

  _updateSecondRowVisibility() {
    const secondRowVisible = this._replaceToggleButton.toggled();
    this._footerElementContainer.classList.toggle('replaceable', secondRowVisible);
    this._secondRowButtons.classList.toggle('hidden', !secondRowVisible);
    this._replaceInputElement.classList.toggle('hidden', !secondRowVisible);

    if (secondRowVisible)
      this._replaceInputElement.focus();
    else
      this._searchInputElement.focus();
    this.doResize();
  }

  _replace() {
    const searchConfig = this._currentSearchConfig();
    /** @type {!UI.Replaceable} */ (this._searchProvider)
        .replaceSelectionWith(searchConfig, this._replaceInputElement.value);
    delete this._currentQuery;
    this._performSearch(true, true);
  }

  _replaceAll() {
    const searchConfig = this._currentSearchConfig();
    /** @type {!UI.Replaceable} */ (this._searchProvider).replaceAllWith(searchConfig, this._replaceInputElement.value);
  }

  /**
   * @param {!Event} event
   */
  _onInput(event) {
    if (this._valueChangedTimeoutId)
      clearTimeout(this._valueChangedTimeoutId);
    const timeout = this._searchInputElement.value.length < 3 ? 200 : 0;
    this._valueChangedTimeoutId = setTimeout(this._onValueChanged.bind(this), timeout);
  }

  _onValueChanged() {
    if (!this._searchIsVisible)
      return;
    delete this._valueChangedTimeoutId;
    this._performSearch(false, true);
  }
};


UI.SearchableView._symbol = Symbol('searchableView');


/**
 * @interface
 */
UI.Searchable = function() {};

UI.Searchable.prototype = {
  searchCanceled() {},

  /**
   * @param {!UI.SearchableView.SearchConfig} searchConfig
   * @param {boolean} shouldJump
   * @param {boolean=} jumpBackwards
   */
  performSearch(searchConfig, shouldJump, jumpBackwards) {},

  jumpToNextSearchResult() {},

  jumpToPreviousSearchResult() {},

  /**
   * @return {boolean}
   */
  supportsCaseSensitiveSearch() {},

  /**
   * @return {boolean}
   */
  supportsRegexSearch() {}
};

/**
 * @interface
 */
UI.Replaceable = function() {};

UI.Replaceable.prototype = {
  /**
   * @param {!UI.SearchableView.SearchConfig} searchConfig
   * @param {string} replacement
   */
  replaceSelectionWith(searchConfig, replacement) {},

  /**
   * @param {!UI.SearchableView.SearchConfig} searchConfig
   * @param {string} replacement
   */
  replaceAllWith(searchConfig, replacement) {}
};

/**
 * @unrestricted
 */
UI.SearchableView.SearchConfig = class {
  /**
   * @param {string} query
   * @param {boolean} caseSensitive
   * @param {boolean} isRegex
   */
  constructor(query, caseSensitive, isRegex) {
    this.query = query;
    this.caseSensitive = caseSensitive;
    this.isRegex = isRegex;
  }

  /**
   * @param {boolean=} global
   * @return {!RegExp}
   */
  toSearchRegex(global) {
    let modifiers = this.caseSensitive ? '' : 'i';
    if (global)
      modifiers += 'g';
    const query = this.isRegex ? '/' + this.query + '/' : this.query;

    let regex;

    // First try creating regex if user knows the / / hint.
    try {
      if (/^\/.+\/$/.test(query)) {
        regex = new RegExp(query.substring(1, query.length - 1), modifiers);
        regex.__fromRegExpQuery = true;
      }
    } catch (e) {
      // Silent catch.
    }

    // Otherwise just do a plain text search.
    if (!regex)
      regex = createPlainTextSearchRegex(query, modifiers);

    return regex;
  }
};
