// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Formatter.FormatterWorkerPool = class {
  constructor() {
    this._taskQueue = [];
    /** @type {!Map<!Common.Worker, ?Formatter.FormatterWorkerPool.Task>} */
    this._workerTasks = new Map();
  }

  /**
   * @return {!Common.Worker}
   */
  _createWorker() {
    const worker = new Common.Worker('formatter_worker');
    worker.onmessage = this._onWorkerMessage.bind(this, worker);
    worker.onerror = this._onWorkerError.bind(this, worker);
    return worker;
  }

  _processNextTask() {
    if (!this._taskQueue.length)
      return;

    let freeWorker = this._workerTasks.keysArray().find(worker => !this._workerTasks.get(worker));
    if (!freeWorker && this._workerTasks.size < Formatter.FormatterWorkerPool.MaxWorkers)
      freeWorker = this._createWorker();
    if (!freeWorker)
      return;

    const task = this._taskQueue.shift();
    this._workerTasks.set(freeWorker, task);
    freeWorker.postMessage({method: task.method, params: task.params});
  }

  /**
   * @param {!Common.Worker} worker
   * @param {!MessageEvent} event
   */
  _onWorkerMessage(worker, event) {
    const task = this._workerTasks.get(worker);
    if (task.isChunked && event.data && !event.data['isLastChunk']) {
      task.callback(event.data);
      return;
    }

    this._workerTasks.set(worker, null);
    this._processNextTask();
    task.callback(event.data ? event.data : null);
  }

  /**
   * @param {!Common.Worker} worker
   * @param {!Event} event
   */
  _onWorkerError(worker, event) {
    console.error(event);
    const task = this._workerTasks.get(worker);
    worker.terminate();
    this._workerTasks.delete(worker);

    const newWorker = this._createWorker();
    this._workerTasks.set(newWorker, null);
    this._processNextTask();
    task.callback(null);
  }

  /**
   * @param {string} methodName
   * @param {!Object<string, string>} params
   * @param {function(boolean, *)} callback
   */
  _runChunkedTask(methodName, params, callback) {
    const task = new Formatter.FormatterWorkerPool.Task(methodName, params, onData, true);
    this._taskQueue.push(task);
    this._processNextTask();

    /**
     * @param {?Object} data
     */
    function onData(data) {
      if (!data) {
        callback(true, null);
        return;
      }
      const isLastChunk = !!data['isLastChunk'];
      const chunk = data['chunk'];
      callback(isLastChunk, chunk);
    }
  }

  /**
   * @param {string} methodName
   * @param {!Object<string, string>} params
   * @return {!Promise<*>}
   */
  _runTask(methodName, params) {
    let callback;
    const promise = new Promise(fulfill => callback = fulfill);
    const task = new Formatter.FormatterWorkerPool.Task(methodName, params, callback, false);
    this._taskQueue.push(task);
    this._processNextTask();
    return promise;
  }

  /**
   * @param {string} content
   * @return {!Promise<*>}
   */
  parseJSONRelaxed(content) {
    return this._runTask('parseJSONRelaxed', {content: content});
  }

  /**
   * @param {string} content
   * @return {!Promise<!Array<!Formatter.FormatterWorkerPool.SCSSRule>>}
   */
  parseSCSS(content) {
    return this._runTask('parseSCSS', {content: content}).then(rules => rules || []);
  }

  /**
   * @param {string} mimeType
   * @param {string} content
   * @param {string} indentString
   * @return {!Promise<!Formatter.FormatterWorkerPool.FormatResult>}
   */
  format(mimeType, content, indentString) {
    const parameters = {mimeType: mimeType, content: content, indentString: indentString};
    return /** @type {!Promise<!Formatter.FormatterWorkerPool.FormatResult>} */ (this._runTask('format', parameters));
  }

  /**
   * @param {string} content
   * @return {!Promise<!Array<!{name: string, offset: number}>>}
   */
  javaScriptIdentifiers(content) {
    return this._runTask('javaScriptIdentifiers', {content: content}).then(ids => ids || []);
  }

  /**
   * @param {string} content
   * @return {!Promise<string>}
   */
  evaluatableJavaScriptSubstring(content) {
    return this._runTask('evaluatableJavaScriptSubstring', {content: content}).then(text => text || '');
  }

  /**
   * @param {string} content
   * @return {!Promise<string>}
   */
  preprocessTopLevelAwaitExpressions(content) {
    return this._runTask('preprocessTopLevelAwaitExpressions', {content: content}).then(text => text || '');
  }

  /**
   * @param {string} content
   * @param {function(boolean, !Array<!Formatter.FormatterWorkerPool.CSSRule>)} callback
   */
  parseCSS(content, callback) {
    this._runChunkedTask('parseCSS', {content: content}, onDataChunk);

    /**
     * @param {boolean} isLastChunk
     * @param {*} data
     */
    function onDataChunk(isLastChunk, data) {
      const rules = /** @type {!Array<!Formatter.FormatterWorkerPool.CSSRule>} */ (data || []);
      callback(isLastChunk, rules);
    }
  }

  /**
   * @param {string} content
   * @param {function(boolean, !Array<!Formatter.FormatterWorkerPool.JSOutlineItem>)} callback
   */
  javaScriptOutline(content, callback) {
    this._runChunkedTask('javaScriptOutline', {content: content}, onDataChunk);

    /**
     * @param {boolean} isLastChunk
     * @param {*} data
     */
    function onDataChunk(isLastChunk, data) {
      const items = /** @type {!Array.<!Formatter.FormatterWorkerPool.JSOutlineItem>} */ (data || []);
      callback(isLastChunk, items);
    }
  }

  /**
   * @param {string} content
   * @param {string} mimeType
   * @param {function(boolean, !Array<!Formatter.FormatterWorkerPool.OutlineItem>)} callback
   * @return {boolean}
   */
  outlineForMimetype(content, mimeType, callback) {
    switch (mimeType) {
      case 'text/html':
      case 'text/javascript':
        this.javaScriptOutline(content, javaScriptCallback);
        return true;
      case 'text/css':
        this.parseCSS(content, cssCallback);
        return true;
    }
    return false;

    /**
     * @param {boolean} isLastChunk
     * @param {!Array<!Formatter.FormatterWorkerPool.JSOutlineItem>} items
     */
    function javaScriptCallback(isLastChunk, items) {
      callback(
          isLastChunk,
          items.map(item => ({line: item.line, column: item.column, title: item.name, subtitle: item.arguments})));
    }

    /**
     * @param {boolean} isLastChunk
     * @param {!Array<!Formatter.FormatterWorkerPool.CSSRule>} rules
     */
    function cssCallback(isLastChunk, rules) {
      callback(
          isLastChunk,
          rules.map(
              rule => ({line: rule.lineNumber, column: rule.columnNumber, title: rule.selectorText || rule.atRule})));
    }
  }

  /**
   * @param {string} content
   * @return {!Promise<?{baseExpression: string, possibleSideEffects:boolean}>}
   */
  findLastExpression(content) {
    return /** @type {!Promise<?{baseExpression: string, possibleSideEffects:boolean}>} */ (
        this._runTask('findLastExpression', {content}));
  }

  /**
   * @param {string} content
   * @return {!Promise<?{baseExpression: string, possibleSideEffects:boolean, receiver: string, argumentIndex: number, functionName: string}>}
   */
  findLastFunctionCall(content) {
    return /** @type {!Promise<?{baseExpression: string, possibleSideEffects:boolean, receiver: string, argumentIndex: number, functionName: string}>} */ (
        this._runTask('findLastFunctionCall', {content}));
  }

  /**
   * @param {string} content
   * @return {!Promise<!Array<string>>}
   */
  argumentsList(content) {
    return /** @type {!Promise<!Array<string>>} */ (this._runTask('argumentsList', {content}));
  }
};

Formatter.FormatterWorkerPool.MaxWorkers = 2;

/**
 * @unrestricted
 */
Formatter.FormatterWorkerPool.Task = class {
  /**
   * @param {string} method
   * @param {!Object<string, string>} params
   * @param {function(?MessageEvent)} callback
   * @param {boolean=} isChunked
   */
  constructor(method, params, callback, isChunked) {
    this.method = method;
    this.params = params;
    this.callback = callback;
    this.isChunked = isChunked;
  }
};

Formatter.FormatterWorkerPool.FormatResult = class {
  constructor() {
    /** @type {string} */
    this.content;
    /** @type {!Formatter.FormatterWorkerPool.FormatMapping} */
    this.mapping;
  }
};

/** @typedef {{original: !Array<number>, formatted: !Array<number>}} */
Formatter.FormatterWorkerPool.FormatMapping;

/** @typedef {{line: number, column: number, title: string, subtitle: (string|undefined) }} */
Formatter.FormatterWorkerPool.OutlineItem;

Formatter.FormatterWorkerPool.JSOutlineItem = class {
  constructor() {
    /** @type {string} */
    this.name;
    /** @type {(string|undefined)} */
    this.arguments;
    /** @type {number} */
    this.line;
    /** @type {number} */
    this.column;
  }
};

/**
 * @typedef {{startLine: number, startColumn: number, endLine: number, endColumn: number}}
 */
Formatter.FormatterWorkerPool.TextRange;

Formatter.FormatterWorkerPool.CSSProperty = class {
  constructor() {
    /** @type {string} */
    this.name;
    /** @type {!Formatter.FormatterWorkerPool.TextRange} */
    this.nameRange;
    /** @type {string} */
    this.value;
    /** @type {!Formatter.FormatterWorkerPool.TextRange} */
    this.valueRange;
    /** @type {!Formatter.FormatterWorkerPool.TextRange} */
    this.range;
    /** @type {(boolean|undefined)} */
    this.disabled;
  }
};

Formatter.FormatterWorkerPool.CSSStyleRule = class {
  constructor() {
    /** @type {string} */
    this.selectorText;
    /** @type {!Formatter.FormatterWorkerPool.TextRange} */
    this.styleRange;
    /** @type {number} */
    this.lineNumber;
    /** @type {number} */
    this.columnNumber;
    /** @type {!Array.<!Formatter.FormatterWorkerPool.CSSProperty>} */
    this.properties;
  }
};

/**
 * @typedef {{atRule: string, lineNumber: number, columnNumber: number}}
 */
Formatter.FormatterWorkerPool.CSSAtRule;

/**
 * @typedef {(Formatter.FormatterWorkerPool.CSSStyleRule|Formatter.FormatterWorkerPool.CSSAtRule)}
 */
Formatter.FormatterWorkerPool.CSSRule;

Formatter.FormatterWorkerPool.SCSSProperty = class {
  constructor() {
    /** @type {!Formatter.FormatterWorkerPool.TextRange} */
    this.range;
    /** @type {!Formatter.FormatterWorkerPool.TextRange} */
    this.name;
    /** @type {!Formatter.FormatterWorkerPool.TextRange} */
    this.value;
    /** @type {boolean} */
    this.disabled;
  }
};

Formatter.FormatterWorkerPool.SCSSRule = class {
  constructor() {
    /** @type {!Array<!Formatter.FormatterWorkerPool.TextRange>} */
    this.selectors;
    /** @type {!Array<!Formatter.FormatterWorkerPool.SCSSProperty>} */
    this.properties;
    /** @type {!Formatter.FormatterWorkerPool.TextRange} */
    this.styleRange;
  }
};

/**
 * @return {!Formatter.FormatterWorkerPool}
 */
Formatter.formatterWorkerPool = function() {
  if (!Formatter._formatterWorkerPool)
    Formatter._formatterWorkerPool = new Formatter.FormatterWorkerPool();
  return Formatter._formatterWorkerPool;
};
