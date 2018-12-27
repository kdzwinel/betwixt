/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @unrestricted
 */
Resources.DatabaseQueryView = class extends UI.VBox {
  constructor(database) {
    super();

    this.database = database;

    this.element.classList.add('storage-view', 'query', 'monospace');
    this.element.addEventListener('selectstart', this._selectStart.bind(this), false);

    this._promptContainer = this.element.createChild('div', 'database-query-prompt-container');
    this._promptContainer.appendChild(UI.Icon.create('smallicon-text-prompt', 'prompt-icon'));
    this._promptElement = this._promptContainer.createChild('div');
    this._promptElement.className = 'database-query-prompt';
    this._promptElement.addEventListener('keydown', this._promptKeyDown.bind(this));

    this._prompt = new UI.TextPrompt();
    this._prompt.initialize(this.completions.bind(this), ' ');
    this._proxyElement = this._prompt.attach(this._promptElement);

    this.element.addEventListener('click', this._messagesClicked.bind(this), true);
    this.element.tabIndex = 0;
    this.element.addEventListener('focus', this._prompt.focus.bind(this._prompt));
  }

  _messagesClicked() {
    if (!this._prompt.isCaretInsidePrompt() && !this.element.hasSelection())
      this._prompt.moveCaretToEndOfPrompt();
  }

  /**
   * @param {string} expression
   * @param {string} prefix
   * @param {boolean=} force
   * @return {!Promise<!UI.SuggestBox.Suggestions>}
   */
  async completions(expression, prefix, force) {
    if (!prefix)
      return [];

    prefix = prefix.toLowerCase();
    const tableNames = await this.database.tableNames();
    return tableNames.map(name => name + ' ')
        .concat(Resources.DatabaseQueryView._SQL_BUILT_INS)
        .filter(proposal => proposal.toLowerCase().startsWith(prefix))
        .map(completion => ({text: completion}));
  }

  _selectStart(event) {
    if (this._selectionTimeout)
      clearTimeout(this._selectionTimeout);

    this._prompt.clearAutocomplete();

    /**
     * @this {Resources.DatabaseQueryView}
     */
    function moveBackIfOutside() {
      delete this._selectionTimeout;
      if (!this._prompt.isCaretInsidePrompt() && !this.element.hasSelection())
        this._prompt.moveCaretToEndOfPrompt();
      this._prompt.autoCompleteSoon();
    }

    this._selectionTimeout = setTimeout(moveBackIfOutside.bind(this), 100);
  }

  _promptKeyDown(event) {
    if (isEnterKey(event)) {
      this._enterKeyPressed(event);
      return;
    }
  }

  async _enterKeyPressed(event) {
    event.consume(true);

    const query = this._prompt.textWithCurrentSuggestion();
    this._prompt.clearAutocomplete();

    if (!query.length)
      return;

    this._prompt.setEnabled(false);
    try {
      const result = await new Promise((resolve, reject) => {
        this.database.executeSql(
            query, (columnNames, values) => resolve({columnNames, values}), errorText => reject(errorText));
      });
      this._queryFinished(query, result.columnNames, result.values);
    } catch (e) {
      this._appendErrorQueryResult(query, e);
    }
    this._prompt.setEnabled(true);
    this._prompt.setText('');
    this._prompt.focus();
  }

  _queryFinished(query, columnNames, values) {
    const dataGrid = DataGrid.SortableDataGrid.create(columnNames, values);
    const trimmedQuery = query.trim();

    let view = null;
    if (dataGrid) {
      dataGrid.setStriped(true);
      dataGrid.renderInline();
      dataGrid.autoSizeColumns(5);
      view = dataGrid.asWidget();
    }
    this._appendViewQueryResult(trimmedQuery, view);

    if (trimmedQuery.match(/^create /i) || trimmedQuery.match(/^drop table /i))
      this.dispatchEventToListeners(Resources.DatabaseQueryView.Events.SchemaUpdated, this.database);
  }

  /**
   * @param {string} query
   * @param {?UI.Widget} view
   */
  _appendViewQueryResult(query, view) {
    const resultElement = this._appendQueryResult(query);
    if (view)
      view.show(resultElement);
    else
      resultElement.remove();
    this._promptElement.scrollIntoView(false);
  }

  /**
   * @param {string} query
   * @param {string} errorText
   */
  _appendErrorQueryResult(query, errorText) {
    const resultElement = this._appendQueryResult(query);
    resultElement.classList.add('error');
    resultElement.appendChild(UI.Icon.create('smallicon-error', 'prompt-icon'));
    resultElement.createTextChild(errorText);

    this._promptElement.scrollIntoView(false);
  }

  /**
   * @param {string} query
   */
  _appendQueryResult(query) {
    const element = createElement('div');
    element.className = 'database-user-query';
    element.appendChild(UI.Icon.create('smallicon-user-command', 'prompt-icon'));
    this.element.insertBefore(element, this._promptContainer);

    const commandTextElement = createElement('span');
    commandTextElement.className = 'database-query-text';
    commandTextElement.textContent = query;
    element.appendChild(commandTextElement);

    const resultElement = createElement('div');
    resultElement.className = 'database-query-result';
    element.appendChild(resultElement);
    return resultElement;
  }
};

/** @enum {symbol} */
Resources.DatabaseQueryView.Events = {
  SchemaUpdated: Symbol('SchemaUpdated')
};

Resources.DatabaseQueryView._SQL_BUILT_INS = [
  'SELECT ', 'FROM ', 'WHERE ', 'LIMIT ', 'DELETE FROM ', 'CREATE ', 'DROP ', 'TABLE ', 'INDEX ', 'UPDATE ',
  'INSERT INTO ', 'VALUES ('
];
