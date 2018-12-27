// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {SDK.SDKModelObserver<!SDK.RuntimeModel>}
 * @implements {UI.SoftDropDown.Delegate<!SDK.ExecutionContext>}
 */
Console.ConsoleContextSelector = class {
  constructor() {
    /** @type {!UI.ListModel<!SDK.ExecutionContext>} */
    this._items = new UI.ListModel();
    /** @type {!UI.SoftDropDown<!SDK.ExecutionContext>} */
    this._dropDown = new UI.SoftDropDown(this._items, this);
    this._dropDown.setRowHeight(36);
    this._toolbarItem = new UI.ToolbarItem(this._dropDown.element);
    this._toolbarItem.setEnabled(false);
    this._toolbarItem.setTitle(ls`JavaScript contexts`);
    this._items.addEventListener(
        UI.ListModel.Events.ItemsReplaced, () => this._toolbarItem.setEnabled(!!this._items.length));

    /** @type {!Map<!SDK.ExecutionContext, !ProductRegistry.BadgePool>} */
    this._badgePoolForExecutionContext = new Map();

    this._toolbarItem.element.classList.add('toolbar-has-dropdown');

    SDK.targetManager.addModelListener(
        SDK.RuntimeModel, SDK.RuntimeModel.Events.ExecutionContextCreated, this._onExecutionContextCreated, this);
    SDK.targetManager.addModelListener(
        SDK.RuntimeModel, SDK.RuntimeModel.Events.ExecutionContextChanged, this._onExecutionContextChanged, this);
    SDK.targetManager.addModelListener(
        SDK.RuntimeModel, SDK.RuntimeModel.Events.ExecutionContextDestroyed, this._onExecutionContextDestroyed, this);
    SDK.targetManager.addModelListener(
        SDK.ResourceTreeModel, SDK.ResourceTreeModel.Events.FrameNavigated, this._frameNavigated, this);

    UI.context.addFlavorChangeListener(SDK.ExecutionContext, this._executionContextChangedExternally, this);
    UI.context.addFlavorChangeListener(SDK.DebuggerModel.CallFrame, this._callFrameSelectedInUI, this);
    SDK.targetManager.observeModels(SDK.RuntimeModel, this);
    SDK.targetManager.addModelListener(
        SDK.DebuggerModel, SDK.DebuggerModel.Events.CallFrameSelected, this._callFrameSelectedInModel, this);
  }

  /**
   * @return {!UI.ToolbarItem}
   */
  toolbarItem() {
    return this._toolbarItem;
  }

  /**
   * @override
   * @param {?SDK.ExecutionContext} from
   * @param {?SDK.ExecutionContext} to
   * @param {?Element} fromElement
   * @param {?Element} toElement
   */
  highlightedItemChanged(from, to, fromElement, toElement) {
    SDK.OverlayModel.hideDOMNodeHighlight();
    if (to && to.frameId) {
      const overlayModel = to.target().model(SDK.OverlayModel);
      if (overlayModel)
        overlayModel.highlightFrame(to.frameId);
    }
    if (fromElement)
      fromElement.classList.remove('highlighted');
    if (toElement)
      toElement.classList.add('highlighted');
  }

  /**
   * @override
   * @param {!SDK.ExecutionContext} executionContext
   * @return {string}
   */
  titleFor(executionContext) {
    const target = executionContext.target();
    let label = executionContext.label() ? target.decorateLabel(executionContext.label()) : '';
    if (executionContext.frameId) {
      const resourceTreeModel = target.model(SDK.ResourceTreeModel);
      const frame = resourceTreeModel && resourceTreeModel.frameForId(executionContext.frameId);
      if (frame)
        label = label || frame.displayName();
    }
    label = label || executionContext.origin;

    return label;
  }

  /**
   * @param {!SDK.ExecutionContext} executionContext
   * @return {number}
   */
  _depthFor(executionContext) {
    let target = executionContext.target();
    let depth = 0;
    if (!executionContext.isDefault)
      depth++;
    if (executionContext.frameId) {
      const resourceTreeModel = target.model(SDK.ResourceTreeModel);
      let frame = resourceTreeModel && resourceTreeModel.frameForId(executionContext.frameId);
      while (frame) {
        frame = frame.parentFrame || frame.crossTargetParentFrame();
        if (frame) {
          depth++;
          target = frame.resourceTreeModel().target();
        }
      }
    }
    let targetDepth = 0;
    while (target.parentTarget()) {
      if (target.parentTarget().type() === SDK.Target.Type.ServiceWorker) {
        // Special casing service workers to be top-level.
        targetDepth = 0;
        break;
      }
      targetDepth++;
      target = target.parentTarget();
    }
    depth += targetDepth;
    return depth;
  }

  /**
   * @param {!SDK.ExecutionContext} executionContext
   * @return {?Element}
   */
  _badgeFor(executionContext) {
    if (!executionContext.frameId || !executionContext.isDefault)
      return null;
    const resourceTreeModel = executionContext.target().model(SDK.ResourceTreeModel);
    const frame = resourceTreeModel && resourceTreeModel.frameForId(executionContext.frameId);
    if (!frame)
      return null;
    const badgePool = new ProductRegistry.BadgePool();
    this._badgePoolForExecutionContext.set(executionContext, badgePool);
    return badgePool.badgeForFrame(frame);
  }

  /**
   * @param {!SDK.ExecutionContext} executionContext
   */
  _disposeExecutionContextBadge(executionContext) {
    const badgePool = this._badgePoolForExecutionContext.get(executionContext);
    if (!badgePool)
      return;
    badgePool.reset();
    this._badgePoolForExecutionContext.delete(executionContext);
  }

  /**
   * @param {!SDK.ExecutionContext} executionContext
   */
  _executionContextCreated(executionContext) {
    // FIXME(413886): We never want to show execution context for the main thread of shadow page in service/shared worker frontend.
    // This check could be removed once we do not send this context to frontend.
    if (executionContext.target().type() === SDK.Target.Type.ServiceWorker)
      return;

    this._items.insertWithComparator(executionContext, executionContext.runtimeModel.executionContextComparator());

    if (executionContext === UI.context.flavor(SDK.ExecutionContext))
      this._dropDown.selectItem(executionContext);
  }

  /**
   * @param {!Common.Event} event
   */
  _onExecutionContextCreated(event) {
    const executionContext = /** @type {!SDK.ExecutionContext} */ (event.data);
    this._executionContextCreated(executionContext);
  }

  /**
   * @param {!Common.Event} event
   */
  _onExecutionContextChanged(event) {
    const executionContext = /** @type {!SDK.ExecutionContext} */ (event.data);
    if (this._items.indexOf(executionContext) === -1)
      return;
    this._executionContextDestroyed(executionContext);
    this._executionContextCreated(executionContext);
  }

  /**
   * @param {!SDK.ExecutionContext} executionContext
   */
  _executionContextDestroyed(executionContext) {
    const index = this._items.indexOf(executionContext);
    if (index === -1)
      return;
    this._disposeExecutionContextBadge(executionContext);
    this._items.remove(index);
  }

  /**
   * @param {!Common.Event} event
   */
  _onExecutionContextDestroyed(event) {
    const executionContext = /** @type {!SDK.ExecutionContext} */ (event.data);
    this._executionContextDestroyed(executionContext);
  }

  /**
   * @param {!Common.Event} event
   */
  _executionContextChangedExternally(event) {
    const executionContext = /** @type {?SDK.ExecutionContext} */ (event.data);
    this._dropDown.selectItem(executionContext);
  }

  /**
   * @param {?SDK.ExecutionContext} executionContext
   * @return {boolean}
   */
  _isTopContext(executionContext) {
    if (!executionContext || !executionContext.isDefault)
      return false;
    const resourceTreeModel = executionContext.target().model(SDK.ResourceTreeModel);
    const frame =
        executionContext.frameId && resourceTreeModel && resourceTreeModel.frameForId(executionContext.frameId);
    if (!frame)
      return false;
    return frame.isTopFrame();
  }

  /**
   * @return {boolean}
   */
  _hasTopContext() {
    return this._items.some(executionContext => this._isTopContext(executionContext));
  }

  /**
   * @override
   * @param {!SDK.RuntimeModel} runtimeModel
   */
  modelAdded(runtimeModel) {
    runtimeModel.executionContexts().forEach(this._executionContextCreated, this);
  }

  /**
   * @override
   * @param {!SDK.RuntimeModel} runtimeModel
   */
  modelRemoved(runtimeModel) {
    for (let i = this._items.length - 1; i >= 0; i--) {
      if (this._items.at(i).runtimeModel === runtimeModel)
        this._executionContextDestroyed(this._items.at(i));
    }
  }

  /**
   * @override
   * @param {!SDK.ExecutionContext} item
   * @return {!Element}
   */
  createElementForItem(item) {
    const element = createElementWithClass('div');
    const shadowRoot = UI.createShadowRootWithCoreStyles(element, 'console/consoleContextSelector.css');
    const title = shadowRoot.createChild('div', 'title');
    title.createTextChild(this.titleFor(item).trimEnd(100));
    const subTitle = shadowRoot.createChild('div', 'subtitle');
    const badgeElement = this._badgeFor(item);
    if (badgeElement) {
      badgeElement.classList.add('badge');
      subTitle.appendChild(badgeElement);
    }
    subTitle.createTextChild(this._subtitleFor(item));
    element.style.paddingLeft = (8 + this._depthFor(item) * 15) + 'px';
    return element;
  }

  /**
   * @param {!SDK.ExecutionContext} executionContext
   * @return {string}
   */
  _subtitleFor(executionContext) {
    const target = executionContext.target();
    let frame;
    if (executionContext.frameId) {
      const resourceTreeModel = target.model(SDK.ResourceTreeModel);
      frame = resourceTreeModel && resourceTreeModel.frameForId(executionContext.frameId);
    }
    if (executionContext.origin.startsWith('chrome-extension://'))
      return Common.UIString('Extension');
    if (!frame || !frame.parentFrame || frame.parentFrame.securityOrigin !== executionContext.origin) {
      const url = executionContext.origin.asParsedURL();
      if (url)
        return url.domain();
    }

    if (frame) {
      const callFrame = frame.findCreationCallFrame(callFrame => !!callFrame.url);
      if (callFrame)
        return new Common.ParsedURL(callFrame.url).domain();
      return Common.UIString('IFrame');
    }
    return '';
  }

  /**
   * @override
   * @param {!SDK.ExecutionContext} item
   * @return {boolean}
   */
  isItemSelectable(item) {
    const callFrame = item.debuggerModel.selectedCallFrame();
    const callFrameContext = callFrame && callFrame.script.executionContext();
    return !callFrameContext || item === callFrameContext;
  }

  /**
   * @override
   * @param {?SDK.ExecutionContext} item
   */
  itemSelected(item) {
    this._toolbarItem.element.classList.toggle('warning', !this._isTopContext(item) && this._hasTopContext());
    UI.context.setFlavor(SDK.ExecutionContext, item);
  }

  _callFrameSelectedInUI() {
    const callFrame = UI.context.flavor(SDK.DebuggerModel.CallFrame);
    const callFrameContext = callFrame && callFrame.script.executionContext();
    if (callFrameContext)
      UI.context.setFlavor(SDK.ExecutionContext, callFrameContext);
  }

  /**
   * @param {!Common.Event} event
   */
  _callFrameSelectedInModel(event) {
    const debuggerModel = /** @type {!SDK.DebuggerModel} */ (event.data);
    for (const executionContext of this._items) {
      if (executionContext.debuggerModel === debuggerModel) {
        this._disposeExecutionContextBadge(executionContext);
        this._dropDown.refreshItem(executionContext);
      }
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _frameNavigated(event) {
    const frame = /** @type {!SDK.ResourceTreeFrame} */ (event.data);
    const runtimeModel = frame.resourceTreeModel().target().model(SDK.RuntimeModel);
    if (!runtimeModel)
      return;
    for (const executionContext of runtimeModel.executionContexts()) {
      if (frame.id === executionContext.frameId) {
        this._disposeExecutionContextBadge(executionContext);
        this._dropDown.refreshItem(executionContext);
      }
    }
  }
};
