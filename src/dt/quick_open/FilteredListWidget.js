/*
 * Copyright (c) 2012 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */
/**
 * @unrestricted
 * @implements {UI.ListDelegate}
 */
QuickOpen.FilteredListWidget = class extends UI.VBox {
  /**
   * @param {?QuickOpen.FilteredListWidget.Provider} provider
   * @param {!Array<string>=} promptHistory
   * @param {function(string)=} queryChangedCallback
   */
  constructor(provider, promptHistory, queryChangedCallback) {
    super(true);
    this._promptHistory = promptHistory || [];

    this.contentElement.classList.add('filtered-list-widget');
    this.contentElement.addEventListener('keydown', this._onKeyDown.bind(this), true);
    this.registerRequiredCSS('quick_open/filteredListWidget.css');

    this._promptElement = this.contentElement.createChild('div', 'filtered-list-widget-input');
    this._promptElement.setAttribute('spellcheck', 'false');
    this._promptElement.setAttribute('contenteditable', 'plaintext-only');
    this._prompt = new UI.TextPrompt();
    this._prompt.initialize(() => Promise.resolve([]));
    const promptProxy = this._prompt.attach(this._promptElement);
    promptProxy.addEventListener('input', this._onInput.bind(this), false);
    promptProxy.classList.add('filtered-list-widget-prompt-element');

    this._bottomElementsContainer = this.contentElement.createChild('div', 'vbox');
    this._progressElement = this._bottomElementsContainer.createChild('div', 'filtered-list-widget-progress');
    this._progressBarElement = this._progressElement.createChild('div', 'filtered-list-widget-progress-bar');

    /** @type {!UI.ListModel<number>} */
    this._items = new UI.ListModel();
    /** @type {!UI.ListControl<number>} */
    this._list = new UI.ListControl(this._items, this, UI.ListMode.EqualHeightItems);
    this._itemElementsContainer = this._list.element;
    this._itemElementsContainer.classList.add('container');
    this._bottomElementsContainer.appendChild(this._itemElementsContainer);
    this._itemElementsContainer.addEventListener('click', this._onClick.bind(this), false);

    this._notFoundElement = this._bottomElementsContainer.createChild('div', 'not-found-text');
    this._notFoundElement.classList.add('hidden');

    this.setDefaultFocusedElement(this._promptElement);

    this._prefix = '';
    this._provider = provider;
    this._queryChangedCallback = queryChangedCallback;
  }

  /**
   * @param {!Element} element
   * @param {string} query
   * @param {boolean=} caseInsensitive
   * @return {boolean}
   */
  static highlightRanges(element, query, caseInsensitive) {
    if (!query)
      return false;

    /**
     * @param {string} text
     * @param {string} query
     * @return {?Array.<!TextUtils.SourceRange>}
     */
    function rangesForMatch(text, query) {
      const opcodes = Diff.Diff.charDiff(query, text);
      let offset = 0;
      const ranges = [];
      for (let i = 0; i < opcodes.length; ++i) {
        const opcode = opcodes[i];
        if (opcode[0] === Diff.Diff.Operation.Equal)
          ranges.push(new TextUtils.SourceRange(offset, opcode[1].length));
        else if (opcode[0] !== Diff.Diff.Operation.Insert)
          return null;
        offset += opcode[1].length;
      }
      return ranges;
    }

    const text = element.textContent;
    let ranges = rangesForMatch(text, query);
    if (!ranges || caseInsensitive)
      ranges = rangesForMatch(text.toUpperCase(), query.toUpperCase());
    if (ranges) {
      UI.highlightRangesWithStyleClass(element, ranges, 'highlight');
      return true;
    }
    return false;
  }

  /**
   * @param {string} placeholder
   */
  setPlaceholder(placeholder) {
    this._prompt.setPlaceholder(placeholder);
  }

  showAsDialog() {
    this._dialog = new UI.Dialog();
    this._dialog.setMaxContentSize(new UI.Size(504, 340));
    this._dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.SetExactWidthMaxHeight);
    this._dialog.setContentPosition(null, 22);
    this.show(this._dialog.contentElement);
    this._dialog.show();
  }

  /**
   * @param {string} prefix
   */
  setPrefix(prefix) {
    this._prefix = prefix;
  }

  /**
   * @param {?QuickOpen.FilteredListWidget.Provider} provider
   */
  setProvider(provider) {
    if (provider === this._provider)
      return;

    if (this._provider)
      this._provider.detach();
    this._clearTimers();

    this._provider = provider;
    if (this.isShowing())
      this._attachProvider();
  }

  _attachProvider() {
    this._items.replaceAll([]);
    this._list.invalidateItemHeight();
    if (this._provider) {
      this._provider.setRefreshCallback(this._itemsLoaded.bind(this, this._provider));
      this._provider.attach();
    }
    this._itemsLoaded(this._provider);
  }

  /**
   * @return {string}
   */
  _value() {
    return this._prompt.text().trim();
  }

  _cleanValue() {
    return this._value().substring(this._prefix.length);
  }

  /**
   * @override
   */
  wasShown() {
    this._attachProvider();
  }

  /**
   * @override
   */
  willHide() {
    if (this._provider)
      this._provider.detach();
    this._clearTimers();
  }

  _clearTimers() {
    clearTimeout(this._filterTimer);
    clearTimeout(this._scoringTimer);
    clearTimeout(this._loadTimeout);
    delete this._filterTimer;
    delete this._scoringTimer;
    delete this._loadTimeout;
    delete this._refreshListWithCurrentResult;
  }

  /**
   * @param {!Event} event
   */
  _onEnter(event) {
    if (!this._provider)
      return;
    const selectedIndexInProvider = this._provider.itemCount() ? this._list.selectedItem() : null;

    this._selectItem(selectedIndexInProvider);
    if (this._dialog)
      this._dialog.hide();
  }

  /**
   * @param {?QuickOpen.FilteredListWidget.Provider} provider
   */
  _itemsLoaded(provider) {
    if (this._loadTimeout || provider !== this._provider)
      return;
    this._loadTimeout = setTimeout(this._updateAfterItemsLoaded.bind(this), 0);
  }

  _updateAfterItemsLoaded() {
    delete this._loadTimeout;
    this._filterItems();
  }

  /**
   * @override
   * @param {number} item
   * @return {!Element}
   */
  createElementForItem(item) {
    const itemElement = createElement('div');
    itemElement.className = 'filtered-list-widget-item ' + (this._provider.renderAsTwoRows() ? 'two-rows' : 'one-row');
    const titleElement = itemElement.createChild('div', 'filtered-list-widget-title');
    const subtitleElement = itemElement.createChild('div', 'filtered-list-widget-subtitle');
    subtitleElement.textContent = '\u200B';
    this._provider.renderItem(item, this._cleanValue(), titleElement, subtitleElement);
    return itemElement;
  }

  /**
   * @override
   * @param {number} item
   * @return {number}
   */
  heightForItem(item) {
    // Let the list measure items for us.
    return 0;
  }

  /**
   * @override
   * @param {number} item
   * @return {boolean}
   */
  isItemSelectable(item) {
    return true;
  }

  /**
   * @override
   * @param {?number} from
   * @param {?number} to
   * @param {?Element} fromElement
   * @param {?Element} toElement
   */
  selectedItemChanged(from, to, fromElement, toElement) {
    if (fromElement)
      fromElement.classList.remove('selected');
    if (toElement) {
      toElement.classList.add('selected');
      UI.ARIAUtils.alert(toElement.textContent, toElement);
    }
  }

  /**
   * @param {!Event} event
   */
  _onClick(event) {
    const item = this._list.itemForNode(/** @type {?Node} */ (event.target));
    if (item === null)
      return;

    event.consume(true);
    this._selectItem(item);
    if (this._dialog)
      this._dialog.hide();
  }

  /**
   * @param {string} query
   */
  setQuery(query) {
    this._prompt.focus();
    this._prompt.setText(query);
    this._queryChanged();
    this._prompt.autoCompleteSoon(true);
    this._scheduleFilter();
  }

  /**
   * @return {boolean}
   */
  _tabKeyPressed() {
    const userEnteredText = this._prompt.text();
    let completion;
    for (let i = this._promptHistory.length - 1; i >= 0; i--) {
      if (this._promptHistory[i] !== userEnteredText && this._promptHistory[i].startsWith(userEnteredText)) {
        completion = this._promptHistory[i];
        break;
      }
    }
    if (!completion)
      return false;
    this._prompt.focus();
    this._prompt.setText(completion);
    this._prompt.setDOMSelection(userEnteredText.length, completion.length);
    this._scheduleFilter();
    return true;
  }

  _itemsFilteredForTest() {
    // Sniffed in tests.
  }

  _filterItems() {
    delete this._filterTimer;
    if (this._scoringTimer) {
      clearTimeout(this._scoringTimer);
      delete this._scoringTimer;

      if (this._refreshListWithCurrentResult)
        this._refreshListWithCurrentResult();
    }

    if (!this._provider) {
      this._bottomElementsContainer.classList.toggle('hidden', true);
      this._itemsFilteredForTest();
      return;
    }

    this._bottomElementsContainer.classList.toggle('hidden', false);

    this._progressBarElement.style.transform = 'scaleX(0)';
    this._progressBarElement.classList.remove('filtered-widget-progress-fade');
    this._progressBarElement.classList.remove('hidden');

    const query = this._provider.rewriteQuery(this._cleanValue());
    this._query = query;

    const filterRegex = query ? String.filterRegex(query) : null;

    const filteredItems = [];

    const bestScores = [];
    const bestItems = [];
    const bestItemsToCollect = 100;
    let minBestScore = 0;
    const overflowItems = [];
    const scoreStartTime = window.performance.now();

    const maxWorkItems = Number.constrain(10, 500, (this._provider.itemCount() / 10) | 0);

    scoreItems.call(this, 0);

    /**
     * @param {number} a
     * @param {number} b
     * @return {number}
     */
    function compareIntegers(a, b) {
      return b - a;
    }

    /**
     * @param {number} fromIndex
     * @this {QuickOpen.FilteredListWidget}
     */
    function scoreItems(fromIndex) {
      delete this._scoringTimer;
      let workDone = 0;
      let i;

      for (i = fromIndex; i < this._provider.itemCount() && workDone < maxWorkItems; ++i) {
        // Filter out non-matching items quickly.
        if (filterRegex && !filterRegex.test(this._provider.itemKeyAt(i)))
          continue;

        // Score item.
        const score = this._provider.itemScoreAt(i, query);
        if (query)
          workDone++;

        // Find its index in the scores array (earlier elements have bigger scores).
        if (score > minBestScore || bestScores.length < bestItemsToCollect) {
          const index = bestScores.upperBound(score, compareIntegers);
          bestScores.splice(index, 0, score);
          bestItems.splice(index, 0, i);
          if (bestScores.length > bestItemsToCollect) {
            // Best list is too large -> drop last elements.
            overflowItems.push(bestItems.peekLast());
            bestScores.length = bestItemsToCollect;
            bestItems.length = bestItemsToCollect;
          }
          minBestScore = bestScores.peekLast();
        } else {
          filteredItems.push(i);
        }
      }

      this._refreshListWithCurrentResult = this._refreshList.bind(this, bestItems, overflowItems, filteredItems);

      // Process everything in chunks.
      if (i < this._provider.itemCount()) {
        this._scoringTimer = setTimeout(scoreItems.bind(this, i), 0);
        if (window.performance.now() - scoreStartTime > 50)
          this._progressBarElement.style.transform = 'scaleX(' + i / this._provider.itemCount() + ')';
        return;
      }
      if (window.performance.now() - scoreStartTime > 100) {
        this._progressBarElement.style.transform = 'scaleX(1)';
        this._progressBarElement.classList.add('filtered-widget-progress-fade');
      } else {
        this._progressBarElement.classList.add('hidden');
      }
      this._refreshListWithCurrentResult();
    }
  }

  /**
   * @param {!Array<number>} bestItems
   * @param {!Array<number>} overflowItems
   * @param {!Array<number>} filteredItems
   */
  _refreshList(bestItems, overflowItems, filteredItems) {
    delete this._refreshListWithCurrentResult;
    filteredItems = [].concat(bestItems, overflowItems, filteredItems);
    this._updateNotFoundMessage(!!filteredItems.length);
    const oldHeight = this._list.element.offsetHeight;
    this._items.replaceAll(filteredItems);
    if (filteredItems.length)
      this._list.selectItem(filteredItems[0]);
    if (this._list.element.offsetHeight !== oldHeight)
      this._list.viewportResized();
    this._itemsFilteredForTest();
  }

  /**
   * @param {boolean} hasItems
   */
  _updateNotFoundMessage(hasItems) {
    this._list.element.classList.toggle('hidden', !hasItems);
    this._notFoundElement.classList.toggle('hidden', hasItems);
    if (!hasItems)
      this._notFoundElement.textContent = this._provider.notFoundText(this._cleanValue());
  }

  _onInput() {
    this._queryChanged();
    this._scheduleFilter();
  }

  _queryChanged() {
    if (this._queryChangedCallback)
      this._queryChangedCallback(this._value());
    if (this._provider)
      this._provider.queryChanged(this._cleanValue());
  }

  /**
   * @param {!Event} event
   */
  _onKeyDown(event) {
    let handled = false;
    switch (event.key) {
      case 'Enter':
        this._onEnter(event);
        return;
      case 'Tab':
        handled = this._tabKeyPressed();
        break;
      case 'ArrowUp':
        handled = this._list.selectPreviousItem(true, false);
        break;
      case 'ArrowDown':
        handled = this._list.selectNextItem(true, false);
        break;
      case 'PageUp':
        handled = this._list.selectItemPreviousPage(false);
        break;
      case 'PageDown':
        handled = this._list.selectItemNextPage(false);
        break;
    }
    if (handled)
      event.consume(true);
  }

  _scheduleFilter() {
    if (this._filterTimer)
      return;
    this._filterTimer = setTimeout(this._filterItems.bind(this), 0);
  }

  /**
   * @param {?number} itemIndex
   */
  _selectItem(itemIndex) {
    this._promptHistory.push(this._value());
    if (this._promptHistory.length > 100)
      this._promptHistory.shift();
    this._provider.selectItem(itemIndex, this._cleanValue());
  }
};


/**
 * @unrestricted
 */
QuickOpen.FilteredListWidget.Provider = class {
  /**
   * @param {function():void} refreshCallback
   */
  setRefreshCallback(refreshCallback) {
    this._refreshCallback = refreshCallback;
  }

  attach() {
  }

  /**
   * @return {number}
   */
  itemCount() {
    return 0;
  }

  /**
   * @param {number} itemIndex
   * @return {string}
   */
  itemKeyAt(itemIndex) {
    return '';
  }

  /**
   * @param {number} itemIndex
   * @param {string} query
   * @return {number}
   */
  itemScoreAt(itemIndex, query) {
    return 1;
  }

  /**
   * @param {number} itemIndex
   * @param {string} query
   * @param {!Element} titleElement
   * @param {!Element} subtitleElement
   */
  renderItem(itemIndex, query, titleElement, subtitleElement) {
  }

  /**
   * @return {boolean}
   */
  renderAsTwoRows() {
    return false;
  }

  /**
   * @param {?number} itemIndex
   * @param {string} promptValue
   */
  selectItem(itemIndex, promptValue) {
  }

  refresh() {
    this._refreshCallback();
  }

  /**
   * @param {string} query
   * @return {string}
   */
  rewriteQuery(query) {
    return query;
  }

  /**
   * @param {string} query
   */
  queryChanged(query) {
  }

  /**
   * @param {string} query
   * @return {string}
   */
  notFoundText(query) {
    return Common.UIString('No results found');
  }

  detach() {
  }
};
