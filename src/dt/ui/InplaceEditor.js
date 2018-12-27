// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
UI.InplaceEditor = class {
  /**
   * @param {!Element} element
   * @param {!UI.InplaceEditor.Config=} config
   * @return {?UI.InplaceEditor.Controller}
   */
  static startEditing(element, config) {
    if (!UI.InplaceEditor._defaultInstance)
      UI.InplaceEditor._defaultInstance = new UI.InplaceEditor();
    return UI.InplaceEditor._defaultInstance.startEditing(element, config);
  }

  /**
   * @return {string}
   */
  editorContent(editingContext) {
    const element = editingContext.element;
    if (element.tagName === 'INPUT' && element.type === 'text')
      return element.value;

    return element.textContent;
  }

  setUpEditor(editingContext) {
    const element = editingContext.element;
    element.classList.add('editing');
    element.setAttribute('contenteditable', 'plaintext-only');

    const oldRole = element.getAttribute('role');
    UI.ARIAUtils.markAsTextBox(element);
    editingContext.oldRole = oldRole;

    const oldTabIndex = element.getAttribute('tabIndex');
    if (typeof oldTabIndex !== 'number' || oldTabIndex < 0)
      element.tabIndex = 0;
    this._focusRestorer = new UI.ElementFocusRestorer(element);
    editingContext.oldTabIndex = oldTabIndex;
  }

  closeEditor(editingContext) {
    const element = editingContext.element;
    element.classList.remove('editing');
    element.removeAttribute('contenteditable');

    if (typeof editingContext.oldRole !== 'string')
      element.removeAttribute('role');
    else
      element.role = editingContext.oldRole;

    if (typeof editingContext.oldTabIndex !== 'number')
      element.removeAttribute('tabIndex');
    else
      element.tabIndex = editingContext.oldTabIndex;
    element.scrollTop = 0;
    element.scrollLeft = 0;
  }

  cancelEditing(editingContext) {
    const element = editingContext.element;
    if (element.tagName === 'INPUT' && element.type === 'text')
      element.value = editingContext.oldText;
    else
      element.textContent = editingContext.oldText;
  }

  augmentEditingHandle(editingContext, handle) {
  }

  /**
   * @param {!Element} element
   * @param {!UI.InplaceEditor.Config=} config
   * @return {?UI.InplaceEditor.Controller}
   */
  startEditing(element, config) {
    if (!UI.markBeingEdited(element, true))
      return null;

    config = config || new UI.InplaceEditor.Config(function() {}, function() {});
    const editingContext = {element: element, config: config};
    const committedCallback = config.commitHandler;
    const cancelledCallback = config.cancelHandler;
    const pasteCallback = config.pasteHandler;
    const context = config.context;
    let moveDirection = '';
    const self = this;

    this.setUpEditor(editingContext);

    editingContext.oldText = this.editorContent(editingContext);

    /**
     * @param {!Event=} e
     */
    function blurEventListener(e) {
      if (config.blurHandler && !config.blurHandler(element, e))
        return;
      editingCommitted.call(element);
    }

    function cleanUpAfterEditing() {
      UI.markBeingEdited(element, false);

      element.removeEventListener('blur', blurEventListener, false);
      element.removeEventListener('keydown', keyDownEventListener, true);
      if (pasteCallback)
        element.removeEventListener('paste', pasteEventListener, true);

      if (self._focusRestorer)
        self._focusRestorer.restore();
      self.closeEditor(editingContext);
    }

    /** @this {Element} */
    function editingCancelled() {
      self.cancelEditing(editingContext);
      cleanUpAfterEditing();
      cancelledCallback(this, context);
    }

    /** @this {Element} */
    function editingCommitted() {
      cleanUpAfterEditing();

      committedCallback(this, self.editorContent(editingContext), editingContext.oldText, context, moveDirection);
    }

    /**
     * @param {!Event} event
     * @return {string}
     */
    function defaultFinishHandler(event) {
      if (isEnterKey(event))
        return 'commit';
      else if (event.keyCode === UI.KeyboardShortcut.Keys.Esc.code || event.key === 'Escape')
        return 'cancel';
      else if (event.key === 'Tab')
        return 'move-' + (event.shiftKey ? 'backward' : 'forward');
      return '';
    }

    function handleEditingResult(result, event) {
      if (result === 'commit') {
        editingCommitted.call(element);
        event.consume(true);
      } else if (result === 'cancel') {
        editingCancelled.call(element);
        event.consume(true);
      } else if (result && result.startsWith('move-')) {
        moveDirection = result.substring(5);
        if (event.key === 'Tab')
          event.consume(true);
        blurEventListener();
      }
    }

    /**
     * @param {!Event} event
     */
    function pasteEventListener(event) {
      const result = pasteCallback(event);
      handleEditingResult(result, event);
    }

    /**
     * @param {!Event} event
     */
    function keyDownEventListener(event) {
      let result = defaultFinishHandler(event);
      if (!result && config.postKeydownFinishHandler)
        result = config.postKeydownFinishHandler(event);
      handleEditingResult(result, event);
    }

    element.addEventListener('blur', blurEventListener, false);
    element.addEventListener('keydown', keyDownEventListener, true);
    if (pasteCallback)
      element.addEventListener('paste', pasteEventListener, true);

    const handle = {cancel: editingCancelled.bind(element), commit: editingCommitted.bind(element)};
    this.augmentEditingHandle(editingContext, handle);
    return handle;
  }
};

/**
 * @typedef {{cancel: function(), commit: function()}}
 */
UI.InplaceEditor.Controller;


/**
 * @template T
 * @unrestricted
 */
UI.InplaceEditor.Config = class {
  /**
   * @param {function(!Element,string,string,T,string)} commitHandler
   * @param {function(!Element,T)} cancelHandler
   * @param {T=} context
   * @param {function(!Element,!Event):boolean=} blurHandler
   */
  constructor(commitHandler, cancelHandler, context, blurHandler) {
    this.commitHandler = commitHandler;
    this.cancelHandler = cancelHandler;
    this.context = context;
    this.blurHandler = blurHandler;

    /**
     * @type {function(!Event):string|undefined}
     */
    this.pasteHandler;

    /**
     * @type {function(!Event):string|undefined}
     */
    this.postKeydownFinishHandler;
  }

  setPasteHandler(pasteHandler) {
    this.pasteHandler = pasteHandler;
  }

  /**
   * @param {function(!Event):string} postKeydownFinishHandler
   */
  setPostKeydownFinishHandler(postKeydownFinishHandler) {
    this.postKeydownFinishHandler = postKeydownFinishHandler;
  }
};
