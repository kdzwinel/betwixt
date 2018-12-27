// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Console.ConsoleFilter = class {
  /**
   * @param {string} name
   * @param {!Array<!TextUtils.FilterParser.ParsedFilter>} parsedFilters
   * @param {?SDK.ExecutionContext} executionContext
   * @param {!Object<string, boolean>=} levelsMask
   */
  constructor(name, parsedFilters, executionContext, levelsMask) {
    this.name = name;
    this.parsedFilters = parsedFilters;
    this.executionContext = executionContext;
    this.levelsMask = levelsMask || Console.ConsoleFilter.defaultLevelsFilterValue();
  }

  /**
   * @return {!Object<string, boolean>}
   */
  static allLevelsFilterValue() {
    const result = {};
    for (const name of Object.values(SDK.ConsoleMessage.MessageLevel))
      result[name] = true;
    return result;
  }

  /**
   * @return {!Object<string, boolean>}
   */
  static defaultLevelsFilterValue() {
    const result = Console.ConsoleFilter.allLevelsFilterValue();
    result[SDK.ConsoleMessage.MessageLevel.Verbose] = false;
    return result;
  }

  /**
   * @param {string} level
   * @return {!Object<string, boolean>}
   */
  static singleLevelMask(level) {
    const result = {};
    result[level] = true;
    return result;
  }

  /**
   * @return {!Console.ConsoleFilter}
   */
  clone() {
    const parsedFilters = this.parsedFilters.map(TextUtils.FilterParser.cloneFilter);
    const levelsMask = Object.assign({}, this.levelsMask);
    return new Console.ConsoleFilter(this.name, parsedFilters, this.executionContext, levelsMask);
  }

  /**
   * @param {!Console.ConsoleViewMessage} viewMessage
   * @return {boolean}
   */
  shouldBeVisible(viewMessage) {
    const message = viewMessage.consoleMessage();
    if (this.executionContext &&
        (this.executionContext.runtimeModel !== message.runtimeModel() ||
         this.executionContext.id !== message.executionContextId))
      return false;

    if (message.type === SDK.ConsoleMessage.MessageType.Command ||
        message.type === SDK.ConsoleMessage.MessageType.Result || message.isGroupMessage())
      return true;

    if (message.level && !this.levelsMask[/** @type {string} */ (message.level)])
      return false;

    for (const filter of this.parsedFilters) {
      if (!filter.key) {
        if (filter.regex && viewMessage.matchesFilterRegex(filter.regex) === filter.negative)
          return false;
        if (filter.text && viewMessage.matchesFilterText(filter.text) === filter.negative)
          return false;
      } else {
        switch (filter.key) {
          case Console.ConsoleFilter.FilterType.Context:
            if (!passesFilter(filter, message.context, false /* exactMatch */))
              return false;
            break;
          case Console.ConsoleFilter.FilterType.Source:
            const sourceNameForMessage = message.source ?
                SDK.ConsoleMessage.MessageSourceDisplayName.get(
                    /** @type {!SDK.ConsoleMessage.MessageSource} */ (message.source)) :
                message.source;
            if (!passesFilter(filter, sourceNameForMessage, true /* exactMatch */))
              return false;
            break;
          case Console.ConsoleFilter.FilterType.Url:
            if (!passesFilter(filter, message.url, false /* exactMatch */))
              return false;
            break;
        }
      }
    }
    return true;

    /**
     * @param {!TextUtils.FilterParser.ParsedFilter} filter
     * @param {?string|undefined} value
     * @param {boolean} exactMatch
     * @return {boolean}
     */
    function passesFilter(filter, value, exactMatch) {
      if (!filter.text)
        return !!value === filter.negative;
      if (!value)
        return !filter.text === !filter.negative;
      const filterText = /** @type {string} */ (filter.text).toLowerCase();
      const lowerCaseValue = value.toLowerCase();
      if (exactMatch && (lowerCaseValue === filterText) === filter.negative)
        return false;
      if (!exactMatch && lowerCaseValue.includes(filterText) === filter.negative)
        return false;
      return true;
    }
  }
};

/** @enum {string} */
Console.ConsoleFilter.FilterType = {
  Context: 'context',
  Source: 'source',
  Url: 'url'
};
