/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
 * @implements {UI.ContextFlavorListener}
 * @unrestricted
 */
Sources.ScopeChainSidebarPane = class extends UI.VBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('sources/scopeChainSidebarPane.css');
    this._expandController = new ObjectUI.ObjectPropertiesSectionExpandController();
    this._linkifier = new Components.Linkifier();
    this._update();
  }

  /**
   * @override
   * @param {?Object} object
   */
  flavorChanged(object) {
    this._update();
  }

  _update() {
    const callFrame = UI.context.flavor(SDK.DebuggerModel.CallFrame);
    const details = UI.context.flavor(SDK.DebuggerPausedDetails);
    this._linkifier.reset();
    Sources.SourceMapNamesResolver.resolveThisObject(callFrame).then(this._innerUpdate.bind(this, details, callFrame));
  }

  /**
   * @param {?SDK.DebuggerPausedDetails} details
   * @param {?SDK.DebuggerModel.CallFrame} callFrame
   * @param {?SDK.RemoteObject} thisObject
   */
  _innerUpdate(details, callFrame, thisObject) {
    this.contentElement.removeChildren();

    if (!details || !callFrame) {
      const infoElement = createElement('div');
      infoElement.className = 'gray-info-message';
      infoElement.textContent = Common.UIString('Not paused');
      this.contentElement.appendChild(infoElement);
      return;
    }

    let foundLocalScope = false;
    const scopeChain = callFrame.scopeChain();
    for (let i = 0; i < scopeChain.length; ++i) {
      const scope = scopeChain[i];
      let title = scope.typeName();
      let emptyPlaceholder = null;
      const extraProperties = [];

      switch (scope.type()) {
        case Protocol.Debugger.ScopeType.Local:
          foundLocalScope = true;
          emptyPlaceholder = Common.UIString('No variables');
          if (thisObject)
            extraProperties.push(new SDK.RemoteObjectProperty('this', thisObject));
          if (i === 0) {
            const exception = details.exception();
            if (exception) {
              extraProperties.push(new SDK.RemoteObjectProperty(
                  Common.UIString('Exception'), exception, undefined, undefined, undefined, undefined, undefined,
                  true));
            }
            const returnValue = callFrame.returnValue();
            if (returnValue) {
              extraProperties.push(new SDK.RemoteObjectProperty(
                  Common.UIString('Return value'), returnValue, undefined, undefined, undefined, undefined, undefined,
                  true, callFrame.setReturnValue.bind(callFrame)));
            }
          }
          break;
        case Protocol.Debugger.ScopeType.Closure:
          const scopeName = scope.name();
          if (scopeName)
            title = Common.UIString('Closure (%s)', UI.beautifyFunctionName(scopeName));
          else
            title = Common.UIString('Closure');
          emptyPlaceholder = Common.UIString('No variables');
          break;
      }

      let subtitle = scope.description();
      if (!title || title === subtitle)
        subtitle = undefined;

      const titleElement = createElementWithClass('div', 'scope-chain-sidebar-pane-section-header');
      titleElement.createChild('div', 'scope-chain-sidebar-pane-section-subtitle').textContent = subtitle;
      titleElement.createChild('div', 'scope-chain-sidebar-pane-section-title').textContent = title;

      const section = new ObjectUI.ObjectPropertiesSection(
          Sources.SourceMapNamesResolver.resolveScopeInObject(scope), titleElement, this._linkifier, emptyPlaceholder,
          true, extraProperties);
      this._expandController.watchSection(title + (subtitle ? ':' + subtitle : ''), section);

      if (scope.type() === Protocol.Debugger.ScopeType.Global)
        section.objectTreeElement().collapse();
      else if (!foundLocalScope || scope.type() === Protocol.Debugger.ScopeType.Local)
        section.objectTreeElement().expand();

      section.element.classList.add('scope-chain-sidebar-pane-section');
      this.contentElement.appendChild(section.element);
    }
    this._sidebarPaneUpdatedForTest();
  }

  _sidebarPaneUpdatedForTest() {
  }
};

Sources.ScopeChainSidebarPane._pathSymbol = Symbol('path');
