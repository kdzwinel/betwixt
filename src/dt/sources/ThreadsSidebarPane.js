// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {SDK.SDKModelObserver<!SDK.DebuggerModel>}
 * @implements {UI.ListDelegate<!SDK.DebuggerModel>}
 */
Sources.ThreadsSidebarPane = class extends UI.VBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('sources/threadsSidebarPane.css');

    /** @type {!UI.ListModel<!SDK.DebuggerModel>} */
    this._items = new UI.ListModel();
    /** @type {!UI.ListControl<!SDK.DebuggerModel>} */
    this._list = new UI.ListControl(this._items, this, UI.ListMode.NonViewport);
    this.contentElement.appendChild(this._list.element);

    UI.context.addFlavorChangeListener(SDK.Target, this._targetFlavorChanged, this);
    SDK.targetManager.observeModels(SDK.DebuggerModel, this);
  }

  /**
   * @return {boolean}
   */
  static shouldBeShown() {
    return SDK.targetManager.models(SDK.DebuggerModel).length >= 2;
  }

  /**
   * @override
   * @param {!SDK.DebuggerModel} debuggerModel
   * @return {!Element}
   */
  createElementForItem(debuggerModel) {
    const element = createElementWithClass('div', 'thread-item');
    const title = element.createChild('div', 'thread-item-title');
    const pausedState = element.createChild('div', 'thread-item-paused-state');
    element.appendChild(UI.Icon.create('smallicon-thick-right-arrow', 'selected-thread-icon'));

    function updateTitle() {
      const executionContext = debuggerModel.runtimeModel().defaultExecutionContext();
      title.textContent =
          executionContext && executionContext.label() ? executionContext.label() : debuggerModel.target().name();
    }

    function updatePausedState() {
      pausedState.textContent = Common.UIString(debuggerModel.isPaused() ? 'paused' : '');
    }

    /**
     * @param {!Common.Event} event
     */
    function targetNameChanged(event) {
      const target = /** @type {!SDK.Target} */ (event.data);
      if (target === debuggerModel.target())
        updateTitle();
    }

    debuggerModel.addEventListener(SDK.DebuggerModel.Events.DebuggerPaused, updatePausedState);
    debuggerModel.addEventListener(SDK.DebuggerModel.Events.DebuggerResumed, updatePausedState);
    debuggerModel.runtimeModel().addEventListener(SDK.RuntimeModel.Events.ExecutionContextChanged, updateTitle);
    SDK.targetManager.addEventListener(SDK.TargetManager.Events.NameChanged, targetNameChanged);

    updatePausedState();
    updateTitle();
    return element;
  }

  /**
   * @override
   * @param {!SDK.DebuggerModel} debuggerModel
   * @return {number}
   */
  heightForItem(debuggerModel) {
    console.assert(false);  // Should not be called.
    return 0;
  }

  /**
   * @override
   * @param {!SDK.DebuggerModel} debuggerModel
   * @return {boolean}
   */
  isItemSelectable(debuggerModel) {
    return true;
  }

  /**
   * @override
   * @param {?SDK.DebuggerModel} from
   * @param {?SDK.DebuggerModel} to
   * @param {?Element} fromElement
   * @param {?Element} toElement
   */
  selectedItemChanged(from, to, fromElement, toElement) {
    if (fromElement)
      fromElement.classList.remove('selected');
    if (toElement)
      toElement.classList.add('selected');
    if (to)
      UI.context.setFlavor(SDK.Target, to.target());
  }

  /**
   * @override
   * @param {!SDK.DebuggerModel} debuggerModel
   */
  modelAdded(debuggerModel) {
    this._items.insert(this._items.length, debuggerModel);
    const currentTarget = UI.context.flavor(SDK.Target);
    if (currentTarget === debuggerModel.target())
      this._list.selectItem(debuggerModel);
  }

  /**
   * @override
   * @param {!SDK.DebuggerModel} debuggerModel
   */
  modelRemoved(debuggerModel) {
    this._items.remove(this._items.indexOf(debuggerModel));
  }

  /**
   * @param {!Common.Event} event
   */
  _targetFlavorChanged(event) {
    const target = /** @type {!SDK.Target} */ (event.data);
    const debuggerModel = target.model(SDK.DebuggerModel);
    if (debuggerModel)
      this._list.selectItem(debuggerModel);
  }
};
