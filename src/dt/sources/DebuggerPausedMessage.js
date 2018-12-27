// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Sources.DebuggerPausedMessage = class {
  constructor() {
    this._element = createElementWithClass('div', 'paused-message flex-none');
    const root = UI.createShadowRootWithCoreStyles(this._element, 'sources/debuggerPausedMessage.css');
    this._contentElement = root.createChild('div');
  }

  /**
   * @return {!Element}
   */
  element() {
    return this._element;
  }

  /**
   * @param {string} description
   */
  static _descriptionWithoutStack(description) {
    const firstCallFrame = /^\s+at\s/m.exec(description);
    return firstCallFrame ? description.substring(0, firstCallFrame.index - 1) :
                            description.substring(0, description.lastIndexOf('\n'));
  }

  /**
   * @param {!SDK.DebuggerPausedDetails} details
   * @return {!Promise<!Element>}
   */
  static async _createDOMBreakpointHitMessage(details) {
    const messageWrapper = createElement('span');
    const domDebuggerModel = details.debuggerModel.target().model(SDK.DOMDebuggerModel);
    if (!details.auxData || !domDebuggerModel)
      return messageWrapper;
    const data = domDebuggerModel.resolveDOMBreakpointData(/** @type {!Object} */ (details.auxData));
    if (!data)
      return messageWrapper;

    const mainElement = messageWrapper.createChild('div', 'status-main');
    mainElement.appendChild(UI.Icon.create('smallicon-info', 'status-icon'));
    mainElement.appendChild(createTextNode(
        String.sprintf('Paused on %s', Sources.DebuggerPausedMessage.BreakpointTypeNouns.get(data.type))));

    const subElement = messageWrapper.createChild('div', 'status-sub monospace');
    const linkifiedNode = await Common.Linkifier.linkify(data.node);
    subElement.appendChild(linkifiedNode);

    if (data.targetNode) {
      const targetNodeLink = await Common.Linkifier.linkify(data.targetNode);
      let message;
      if (data.insertion)
        message = data.targetNode === data.node ? 'Child %s added' : 'Descendant %s added';
      else
        message = 'Descendant %s removed';
      subElement.appendChild(createElement('br'));
      subElement.appendChild(UI.formatLocalized(message, [targetNodeLink]));
    }
    return messageWrapper;
  }

  /**
   * @param {?SDK.DebuggerPausedDetails} details
   * @param {!Bindings.DebuggerWorkspaceBinding} debuggerWorkspaceBinding
   * @param {!Bindings.BreakpointManager} breakpointManager
   * @return {!Promise}
   */
  async render(details, debuggerWorkspaceBinding, breakpointManager) {
    this._contentElement.removeChildren();
    this._contentElement.hidden = !details;
    if (!details)
      return;

    const status = this._contentElement.createChild('div', 'paused-status');

    const errorLike = details.reason === SDK.DebuggerModel.BreakReason.Exception ||
        details.reason === SDK.DebuggerModel.BreakReason.PromiseRejection ||
        details.reason === SDK.DebuggerModel.BreakReason.Assert || details.reason === SDK.DebuggerModel.BreakReason.OOM;
    let messageWrapper;
    if (details.reason === SDK.DebuggerModel.BreakReason.DOM) {
      messageWrapper = await Sources.DebuggerPausedMessage._createDOMBreakpointHitMessage(details);
    } else if (details.reason === SDK.DebuggerModel.BreakReason.EventListener) {
      let eventNameForUI = '';
      if (details.auxData) {
        eventNameForUI =
            SDK.domDebuggerManager.resolveEventListenerBreakpointTitle(/** @type {!Object} */ (details.auxData));
      }
      messageWrapper = buildWrapper(Common.UIString('Paused on event listener'), eventNameForUI);
    } else if (details.reason === SDK.DebuggerModel.BreakReason.XHR) {
      messageWrapper = buildWrapper(Common.UIString('Paused on XHR or fetch'), details.auxData['url'] || '');
    } else if (details.reason === SDK.DebuggerModel.BreakReason.Exception) {
      const description = details.auxData['description'] || details.auxData['value'] || '';
      const descriptionWithoutStack = Sources.DebuggerPausedMessage._descriptionWithoutStack(description);
      messageWrapper = buildWrapper(Common.UIString('Paused on exception'), descriptionWithoutStack, description);
    } else if (details.reason === SDK.DebuggerModel.BreakReason.PromiseRejection) {
      const description = details.auxData['description'] || details.auxData['value'] || '';
      const descriptionWithoutStack = Sources.DebuggerPausedMessage._descriptionWithoutStack(description);
      messageWrapper =
          buildWrapper(Common.UIString('Paused on promise rejection'), descriptionWithoutStack, description);
    } else if (details.reason === SDK.DebuggerModel.BreakReason.Assert) {
      messageWrapper = buildWrapper(Common.UIString('Paused on assertion'));
    } else if (details.reason === SDK.DebuggerModel.BreakReason.DebugCommand) {
      messageWrapper = buildWrapper(Common.UIString('Paused on debugged function'));
    } else if (details.reason === SDK.DebuggerModel.BreakReason.OOM) {
      messageWrapper = buildWrapper(Common.UIString('Paused before potential out-of-memory crash'));
    } else if (details.callFrames.length) {
      const uiLocation = debuggerWorkspaceBinding.rawLocationToUILocation(details.callFrames[0].location());
      const breakpoint = uiLocation ? breakpointManager.findBreakpoint(uiLocation) : null;
      const defaultText = breakpoint ? Common.UIString('Paused on breakpoint') : Common.UIString('Debugger paused');
      messageWrapper = buildWrapper(defaultText);
    } else {
      console.warn(
          'ScriptsPanel paused, but callFrames.length is zero.');  // TODO remove this once we understand this case better
    }

    status.classList.toggle('error-reason', errorLike);
    if (messageWrapper)
      status.appendChild(messageWrapper);

    /**
     * @param  {string} mainText
     * @param  {string=} subText
     * @param  {string=} title
     * @return {!Element}
     */
    function buildWrapper(mainText, subText, title) {
      const messageWrapper = createElement('span');
      const mainElement = messageWrapper.createChild('div', 'status-main');
      const icon = UI.Icon.create(errorLike ? 'smallicon-error' : 'smallicon-info', 'status-icon');
      mainElement.appendChild(icon);
      mainElement.appendChild(createTextNode(mainText));
      if (subText) {
        const subElement = messageWrapper.createChild('div', 'status-sub monospace');
        subElement.textContent = subText;
        subElement.title = title || subText;
      }
      return messageWrapper;
    }
  }
};

Sources.DebuggerPausedMessage.BreakpointTypeNouns = new Map([
  [SDK.DOMDebuggerModel.DOMBreakpoint.Type.SubtreeModified, Common.UIString('subtree modifications')],
  [SDK.DOMDebuggerModel.DOMBreakpoint.Type.AttributeModified, Common.UIString('attribute modifications')],
  [SDK.DOMDebuggerModel.DOMBreakpoint.Type.NodeRemoved, Common.UIString('node removal')],
]);
