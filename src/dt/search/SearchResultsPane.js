// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
Search.SearchResultsPane = class extends UI.VBox {
  /**
   * @param {!Search.SearchConfig} searchConfig
   */
  constructor(searchConfig) {
    super(true);
    this._searchConfig = searchConfig;

    /** @type {!Array<!Search.SearchResult>} */
    this._searchResults = [];
    this._treeOutline = new UI.TreeOutlineInShadow();
    this._treeOutline.hideOverflow();
    this._treeOutline.registerRequiredCSS('search/searchResultsPane.css');
    this.contentElement.appendChild(this._treeOutline.element);

    this._matchesExpandedCount = 0;
  }

  /**
   * @param {!Search.SearchResult} searchResult
   */
  addSearchResult(searchResult) {
    this._searchResults.push(searchResult);
    this._addTreeElement(searchResult);
  }

  /**
   * @param {!Search.SearchResult} searchResult
   */
  _addTreeElement(searchResult) {
    const treeElement = new Search.SearchResultsPane.SearchResultsTreeElement(this._searchConfig, searchResult);
    this._treeOutline.appendChild(treeElement);
    // Expand until at least a certain number of matches is expanded.
    if (this._matchesExpandedCount < Search.SearchResultsPane._matchesExpandedByDefault)
      treeElement.expand();
    this._matchesExpandedCount += searchResult.matchesCount();
  }
};

Search.SearchResultsPane._matchesExpandedByDefault = 20;
Search.SearchResultsPane._matchesShownAtOnce = 20;

Search.SearchResultsPane.SearchResultsTreeElement = class extends UI.TreeElement {
  /**
   * @param {!Search.SearchConfig} searchConfig
   * @param {!Search.SearchResult} searchResult
   */
  constructor(searchConfig, searchResult) {
    super('', true);
    this._searchConfig = searchConfig;
    this._searchResult = searchResult;
    this._initialized = false;

    this.toggleOnClick = true;
    this.selectable = false;
  }

  /**
   * @override
   */
  onexpand() {
    if (this._initialized)
      return;

    this._updateMatchesUI();
    this._initialized = true;
  }

  _updateMatchesUI() {
    this.removeChildren();
    const toIndex = Math.min(this._searchResult.matchesCount(), Search.SearchResultsPane._matchesShownAtOnce);
    if (toIndex < this._searchResult.matchesCount()) {
      this._appendSearchMatches(0, toIndex - 1);
      this._appendShowMoreMatchesElement(toIndex - 1);
    } else {
      this._appendSearchMatches(0, toIndex);
    }
  }

  /**
   * @override
   */
  onattach() {
    this._updateSearchMatches();
  }

  _updateSearchMatches() {
    this.listItemElement.classList.add('search-result');

    const fileNameSpan = span(this._searchResult.label(), 'search-result-file-name');
    fileNameSpan.appendChild(span('\u2014', 'search-result-dash'));
    fileNameSpan.appendChild(span(this._searchResult.description(), 'search-result-qualifier'));

    this.tooltip = this._searchResult.description();
    this.listItemElement.appendChild(fileNameSpan);
    const matchesCountSpan = createElement('span');
    matchesCountSpan.className = 'search-result-matches-count';

    matchesCountSpan.textContent = `${this._searchResult.matchesCount()}`;

    this.listItemElement.appendChild(matchesCountSpan);
    if (this.expanded)
      this._updateMatchesUI();

    /**
     * @param {string} text
     * @param {string} className
     * @return {!Element}
     */
    function span(text, className) {
      const span = createElement('span');
      span.className = className;
      span.textContent = text;
      return span;
    }
  }

  /**
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  _appendSearchMatches(fromIndex, toIndex) {
    const searchResult = this._searchResult;

    const queries = this._searchConfig.queries();
    const regexes = [];
    for (let i = 0; i < queries.length; ++i)
      regexes.push(createSearchRegex(queries[i], !this._searchConfig.ignoreCase(), this._searchConfig.isRegex()));

    for (let i = fromIndex; i < toIndex; ++i) {
      const lineContent = searchResult.matchLineContent(i).trim();
      let matchRanges = [];
      for (let j = 0; j < regexes.length; ++j)
        matchRanges = matchRanges.concat(this._regexMatchRanges(lineContent, regexes[j]));

      const anchor = Components.Linkifier.linkifyRevealable(searchResult.matchRevealable(i), '');
      anchor.classList.add('search-match-link');
      const lineNumberSpan = createElement('span');
      lineNumberSpan.classList.add('search-match-line-number');
      lineNumberSpan.textContent = searchResult.matchLabel(i);
      anchor.appendChild(lineNumberSpan);

      const contentSpan = this._createContentSpan(lineContent, matchRanges);
      anchor.appendChild(contentSpan);

      const searchMatchElement = new UI.TreeElement();
      searchMatchElement.selectable = false;
      this.appendChild(searchMatchElement);
      searchMatchElement.listItemElement.className = 'search-match';
      searchMatchElement.listItemElement.appendChild(anchor);
      searchMatchElement.tooltip = lineContent;
    }
  }

  /**
   * @param {number} startMatchIndex
   */
  _appendShowMoreMatchesElement(startMatchIndex) {
    const matchesLeftCount = this._searchResult.matchesCount() - startMatchIndex;
    const showMoreMatchesText = Common.UIString('Show %d more', matchesLeftCount);
    const showMoreMatchesTreeElement = new UI.TreeElement(showMoreMatchesText);
    this.appendChild(showMoreMatchesTreeElement);
    showMoreMatchesTreeElement.listItemElement.classList.add('show-more-matches');
    showMoreMatchesTreeElement.onselect =
        this._showMoreMatchesElementSelected.bind(this, showMoreMatchesTreeElement, startMatchIndex);
  }

  /**
   * @param {string} lineContent
   * @param {!Array.<!TextUtils.SourceRange>} matchRanges
   * @return {!Element}
   */
  _createContentSpan(lineContent, matchRanges) {
    let trimBy = 0;
    if (matchRanges.length > 0 && matchRanges[0].offset > 20)
      trimBy = 15;
    lineContent = lineContent.substring(trimBy, 1000 + trimBy);
    if (trimBy) {
      matchRanges = matchRanges.map(range => new TextUtils.SourceRange(range.offset - trimBy + 1, range.length));
      lineContent = '\u2026' + lineContent;
    }
    const contentSpan = createElement('span');
    contentSpan.className = 'search-match-content';
    contentSpan.textContent = lineContent;
    UI.highlightRangesWithStyleClass(contentSpan, matchRanges, 'highlighted-match');
    return contentSpan;
  }

  /**
   * @param {string} lineContent
   * @param {!RegExp} regex
   * @return {!Array.<!TextUtils.SourceRange>}
   */
  _regexMatchRanges(lineContent, regex) {
    regex.lastIndex = 0;
    let match;
    const matchRanges = [];
    while ((regex.lastIndex < lineContent.length) && (match = regex.exec(lineContent)))
      matchRanges.push(new TextUtils.SourceRange(match.index, match[0].length));

    return matchRanges;
  }

  /**
   * @param {!UI.TreeElement} showMoreMatchesTreeElement
   * @param {number} startMatchIndex
   * @return {boolean}
   */
  _showMoreMatchesElementSelected(showMoreMatchesTreeElement, startMatchIndex) {
    this.removeChild(showMoreMatchesTreeElement);
    this._appendSearchMatches(startMatchIndex, this._searchResult.matchesCount());
    return false;
  }
};
