/*
 * Copyright 2018 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

Sources.BreakpointEditDialog = class extends UI.Widget {
  /**
   * @param {number} editorLineNumber
   * @param {string} oldCondition
   * @param {boolean} preferLogpoint
   * @param {function({committed: boolean, condition: string})} onFinish
   */
  constructor(editorLineNumber, oldCondition, preferLogpoint, onFinish) {
    super(true);
    this.registerRequiredCSS('sources/breakpointEditDialog.css');
    this._onFinish = onFinish;
    this._finished = false;
    /** @type {?UI.TextEditor} */
    this._editor = null;
    const isNewBreakpointsEnabled = Runtime.experiments.isEnabled('sourcesLogpoints');
    this.element.tabIndex = -1;

    const logpointPrefix = Sources.BreakpointEditDialog._LogpointPrefix;
    const logpointSuffix = Sources.BreakpointEditDialog._LogpointSuffix;
    this._isLogpoint = oldCondition.startsWith(logpointPrefix) && oldCondition.endsWith(logpointSuffix);
    if (this._isLogpoint)
      oldCondition = oldCondition.substring(logpointPrefix.length, oldCondition.length - logpointSuffix.length);
    this._isLogpoint = this._isLogpoint || preferLogpoint;

    if (isNewBreakpointsEnabled) {
      this.element.classList.add('sources-edit-breakpoint-dialog');
      const toolbar = new UI.Toolbar('source-frame-breakpoint-toolbar', this.contentElement);
      toolbar.appendText(`Line ${editorLineNumber + 1}:`);

      this._typeSelector = new UI.ToolbarComboBox(this._onTypeChanged.bind(this));
      this._typeSelector.createOption(ls`Breakpoint`, '', Sources.BreakpointEditDialog.BreakpointType.Breakpoint);
      const conditionalOption = this._typeSelector.createOption(
          ls`Conditional breakpoint`, '', Sources.BreakpointEditDialog.BreakpointType.Conditional);
      const logpointOption =
          this._typeSelector.createOption(ls`Logpoint`, '', Sources.BreakpointEditDialog.BreakpointType.Logpoint);
      this._typeSelector.select(this._isLogpoint ? logpointOption : conditionalOption);
      toolbar.appendToolbarItem(this._typeSelector);

    } else {
      const labelElement = this.contentElement.createChild('label', 'source-frame-breakpoint-message');
      labelElement.htmlFor = 'source-frame-breakpoint-condition';
      const labelText = this._isLogpoint ? ls`On line ${editorLineNumber + 1}, log to the Console:` : ls
      `The breakpoint on line ${editorLineNumber + 1} will stop only if this expression is true:`;
      labelElement.createTextChild(labelText);
    }

    self.runtime.extension(UI.TextEditorFactory).instance().then(factory => {
      const editorOptions = {lineNumbers: false, lineWrapping: true, mimeType: 'javascript', autoHeight: true};
      this._editor = factory.createEditor(editorOptions);
      if (isNewBreakpointsEnabled) {
        this._updatePlaceholder();
        this._editor.widget().element.classList.add('condition-editor');
      } else {
        this._editor.widget().element.id = 'source-frame-breakpoint-condition';
      }
      this._editor.configureAutocomplete(ObjectUI.JavaScriptAutocompleteConfig.createConfigForEditor(this._editor));
      if (oldCondition)
        this._editor.setText(oldCondition);
      this._editor.widget().show(this.contentElement);
      this._editor.setSelection(this._editor.fullRange());
      this._editor.widget().focus();
      this._editor.widget().element.addEventListener('keydown', this._onKeyDown.bind(this), true);
      this.contentElement.addEventListener('blur', event => {
        if (event.relatedTarget && !event.relatedTarget.isSelfOrDescendant(this.element))
          this._finishEditing(true);
      }, true);
    });
  }

  /**
   * @param {string} condition
   * @return {string}
   */
  static _conditionForLogpoint(condition) {
    return `${Sources.BreakpointEditDialog._LogpointPrefix}${condition}${Sources.BreakpointEditDialog._LogpointSuffix}`;
  }

  _onTypeChanged() {
    const value = this._typeSelector.selectedOption().value;
    this._isLogpoint = value === Sources.BreakpointEditDialog.BreakpointType.Logpoint;
    this._updatePlaceholder();
    if (value === Sources.BreakpointEditDialog.BreakpointType.Breakpoint) {
      this._editor.setText('');
      this._finishEditing(true);
    }
  }

  _updatePlaceholder() {
    const selectedValue = this._typeSelector.selectedOption().value;
    if (selectedValue === Sources.BreakpointEditDialog.BreakpointType.Conditional) {
      this._editor.setPlaceholder(ls`Expression to check before pausing, e.g. x > 5`);
      this._typeSelector.element.title = ls`Pause only when the condition is true`;
    } else if (selectedValue === Sources.BreakpointEditDialog.BreakpointType.Logpoint) {
      this._editor.setPlaceholder(ls`Log message, e.g. 'x is', x`);
      this._typeSelector.element.title = ls`Log a message to Console, do not break`;
    }
  }

  /**
   * @param {boolean} committed
   */
  _finishEditing(committed) {
    if (this._finished)
      return;
    this._finished = true;
    this._editor.widget().detach();
    let condition = this._editor.text();
    if (this._isLogpoint)
      condition = Sources.BreakpointEditDialog._conditionForLogpoint(condition);
    this._onFinish({committed, condition});
  }

  /**
   * @param {!Event} event
   */
  async _onKeyDown(event) {
    if (isEnterKey(event) && !event.shiftKey) {
      event.consume(true);
      const expression = this._editor.text();
      if (event.ctrlKey || await ObjectUI.JavaScriptAutocomplete.isExpressionComplete(expression))
        this._finishEditing(true);
      else
        this._editor.newlineAndIndent();
    }
    if (isEscKey(event))
      this._finishEditing(false);
  }
};

Sources.BreakpointEditDialog._LogpointPrefix = '/** DEVTOOLS_LOGPOINT */ console.log(';
Sources.BreakpointEditDialog._LogpointSuffix = ')';

Sources.BreakpointEditDialog.BreakpointType = {
  Breakpoint: 'Breakpoint',
  Conditional: 'Conditional',
  Logpoint: 'Logpoint',
};
