/*
 * Copyright (c) 2012 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @unrestricted
 */
Sources.FilteredUISourceCodeListProvider = class extends QuickOpen.FilteredListWidget.Provider {
  constructor() {
    super();

    this._queryLineNumberAndColumnNumber = '';
    this._defaultScores = null;
    this._scorer = new Sources.FilePathScoreFunction('');
  }

  /**
   * @param {!Common.Event} event
   */
  _projectRemoved(event) {
    const project = /** @type {!Workspace.Project} */ (event.data);
    this._populate(project);
    this.refresh();
  }

  /**
   * @param {!Workspace.Project=} skipProject
   */
  _populate(skipProject) {
    /** @type {!Array.<!Workspace.UISourceCode>} */
    this._uiSourceCodes = [];
    const projects = Workspace.workspace.projects().filter(this.filterProject.bind(this));
    for (let i = 0; i < projects.length; ++i) {
      if (skipProject && projects[i] === skipProject)
        continue;
      const uiSourceCodes = projects[i].uiSourceCodes().filter(this._filterUISourceCode.bind(this));
      this._uiSourceCodes = this._uiSourceCodes.concat(uiSourceCodes);
    }
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {boolean}
   */
  _filterUISourceCode(uiSourceCode) {
    const binding = Persistence.persistence.binding(uiSourceCode);
    return !binding || binding.fileSystem === uiSourceCode;
  }

  /**
   * @param {?Workspace.UISourceCode} uiSourceCode
   * @param {number=} lineNumber
   * @param {number=} columnNumber
   */
  uiSourceCodeSelected(uiSourceCode, lineNumber, columnNumber) {
    // Overridden by subclasses
  }

  /**
   * @param {!Workspace.Project} project
   * @return {boolean}
   */
  filterProject(project) {
    return true;
    // Overridden by subclasses
  }

  /**
   * @override
   * @return {number}
   */
  itemCount() {
    return this._uiSourceCodes.length;
  }

  /**
   * @override
   * @param {number} itemIndex
   * @return {string}
   */
  itemKeyAt(itemIndex) {
    return this._uiSourceCodes[itemIndex].url();
  }

  /**
   * @protected
   * @param {?Map.<!Workspace.UISourceCode, number>} defaultScores
   */
  setDefaultScores(defaultScores) {
    this._defaultScores = defaultScores;
  }

  /**
   * @override
   * @param {number} itemIndex
   * @param {string} query
   * @return {number}
   */
  itemScoreAt(itemIndex, query) {
    const uiSourceCode = this._uiSourceCodes[itemIndex];
    const score = this._defaultScores ? (this._defaultScores.get(uiSourceCode) || 0) : 0;
    if (!query || query.length < 2)
      return score;

    if (this._query !== query) {
      this._query = query;
      this._scorer = new Sources.FilePathScoreFunction(query);
    }

    let multiplier = 10;
    if (uiSourceCode.project().type() === Workspace.projectTypes.FileSystem &&
        !Persistence.persistence.binding(uiSourceCode))
      multiplier = 5;

    const fullDisplayName = uiSourceCode.fullDisplayName();
    return score + multiplier * this._scorer.score(fullDisplayName, null);
  }

  /**
   * @override
   * @param {number} itemIndex
   * @param {string} query
   * @param {!Element} titleElement
   * @param {!Element} subtitleElement
   */
  renderItem(itemIndex, query, titleElement, subtitleElement) {
    query = this.rewriteQuery(query);
    const uiSourceCode = this._uiSourceCodes[itemIndex];
    const fullDisplayName = uiSourceCode.fullDisplayName();
    const indexes = [];
    new Sources.FilePathScoreFunction(query).score(fullDisplayName, indexes);
    const fileNameIndex = fullDisplayName.lastIndexOf('/');

    titleElement.classList.add('monospace');
    subtitleElement.classList.add('monospace');
    titleElement.textContent = uiSourceCode.displayName() + (this._queryLineNumberAndColumnNumber || '');
    this._renderSubtitleElement(subtitleElement, fullDisplayName);
    subtitleElement.title = fullDisplayName;
    const ranges = [];
    for (let i = 0; i < indexes.length; ++i)
      ranges.push({offset: indexes[i], length: 1});

    if (indexes[0] > fileNameIndex) {
      for (let i = 0; i < ranges.length; ++i)
        ranges[i].offset -= fileNameIndex + 1;
      UI.highlightRangesWithStyleClass(titleElement, ranges, 'highlight');
    } else {
      UI.highlightRangesWithStyleClass(subtitleElement, ranges, 'highlight');
    }
  }

  /**
   * @param {!Element} element
   * @param {string} text
   */
  _renderSubtitleElement(element, text) {
    element.removeChildren();
    let splitPosition = text.lastIndexOf('/');
    if (text.length > 55)
      splitPosition = text.length - 55;
    const first = element.createChild('div', 'first-part');
    first.textContent = text.substring(0, splitPosition);
    const second = element.createChild('div', 'second-part');
    second.textContent = text.substring(splitPosition);
    element.title = text;
  }

  /**
   * @override
   * @param {?number} itemIndex
   * @param {string} promptValue
   */
  selectItem(itemIndex, promptValue) {
    const parsedExpression = promptValue.trim().match(/^([^:]*)(:\d+)?(:\d+)?$/);
    if (!parsedExpression)
      return;

    let lineNumber;
    let columnNumber;
    if (parsedExpression[2])
      lineNumber = parseInt(parsedExpression[2].substr(1), 10) - 1;
    if (parsedExpression[3])
      columnNumber = parseInt(parsedExpression[3].substr(1), 10) - 1;
    const uiSourceCode = itemIndex !== null ? this._uiSourceCodes[itemIndex] : null;
    this.uiSourceCodeSelected(uiSourceCode, lineNumber, columnNumber);
  }

  /**
   * @override
   * @param {string} query
   * @return {string}
   */
  rewriteQuery(query) {
    query = query ? query.trim() : '';
    if (!query || query === ':')
      return '';
    const lineNumberMatch = query.match(/^([^:]+)((?::[^:]*){0,2})$/);
    this._queryLineNumberAndColumnNumber = lineNumberMatch ? lineNumberMatch[2] : '';
    return lineNumberMatch ? lineNumberMatch[1] : query;
  }

  /**
   * @param {!Common.Event} event
   */
  _uiSourceCodeAdded(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data);
    if (!this._filterUISourceCode(uiSourceCode) || !this.filterProject(uiSourceCode.project()))
      return;
    this._uiSourceCodes.push(uiSourceCode);
    this.refresh();
  }

  /**
   * @override
   * @return {string}
   */
  notFoundText() {
    return Common.UIString('No files found');
  }

  /**
   * @override
   */
  attach() {
    Workspace.workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAdded, this);
    Workspace.workspace.addEventListener(Workspace.Workspace.Events.ProjectRemoved, this._projectRemoved, this);
    this._populate();
  }

  /**
   * @override
   */
  detach() {
    Workspace.workspace.removeEventListener(
        Workspace.Workspace.Events.UISourceCodeAdded, this._uiSourceCodeAdded, this);
    Workspace.workspace.removeEventListener(Workspace.Workspace.Events.ProjectRemoved, this._projectRemoved, this);
    this._queryLineNumberAndColumnNumber = '';
    this._defaultScores = null;
  }
};
