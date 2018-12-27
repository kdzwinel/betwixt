/*
 * Copyright (C) 2011 Google Inc.  All rights reserved.
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008 Matt Lilek <webkit@mattlilek.com>
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
Components.JSPresentationUtils = {};

/**
 * @param {?SDK.Target} target
 * @param {!Components.Linkifier} linkifier
 * @param {!Protocol.Runtime.StackTrace=} stackTrace
 * @param {function()=} contentUpdated
 * @return {{element: !Element, links: !Array<!Element>}}
 */
Components.JSPresentationUtils.buildStackTracePreviewContents = function(
    target, linkifier, stackTrace, contentUpdated) {
  const element = createElement('span');
  element.style.display = 'inline-block';
  const shadowRoot = UI.createShadowRootWithCoreStyles(element, 'components/jsUtils.css');
  const contentElement = shadowRoot.createChild('table', 'stack-preview-container');
  let totalHiddenCallFramesCount = 0;
  let totalCallFramesCount = 0;
  /** @type {!Array<!Element>} */
  const links = [];

  /**
   * @param {!Protocol.Runtime.StackTrace} stackTrace
   * @return {boolean}
   */
  function appendStackTrace(stackTrace) {
    let hiddenCallFrames = 0;
    for (const stackFrame of stackTrace.callFrames) {
      totalCallFramesCount++;
      let shouldHide = totalCallFramesCount > 30 && stackTrace.callFrames.length > 31;
      const row = createElement('tr');
      row.createChild('td').textContent = '\n';
      row.createChild('td', 'function-name').textContent = UI.beautifyFunctionName(stackFrame.functionName);
      const link = linkifier.maybeLinkifyConsoleCallFrame(target, stackFrame);
      if (link) {
        link.addEventListener('contextmenu', populateContextMenu.bind(null, link));
        const uiLocation = Components.Linkifier.uiLocation(link);
        if (uiLocation && Bindings.blackboxManager.isBlackboxedUISourceCode(uiLocation.uiSourceCode))
          shouldHide = true;
        row.createChild('td').textContent = ' @ ';
        row.createChild('td').appendChild(link);
        links.push(link);
      }
      if (shouldHide) {
        row.classList.add('blackboxed');
        ++hiddenCallFrames;
      }
      contentElement.appendChild(row);
    }
    totalHiddenCallFramesCount += hiddenCallFrames;
    return stackTrace.callFrames.length === hiddenCallFrames;
  }

  /**
   * @param {!Element} link
   * @param {!Event} event
   */
  function populateContextMenu(link, event) {
    const contextMenu = new UI.ContextMenu(event);
    event.consume(true);
    const uiLocation = Components.Linkifier.uiLocation(link);
    if (uiLocation && Bindings.blackboxManager.canBlackboxUISourceCode(uiLocation.uiSourceCode)) {
      if (Bindings.blackboxManager.isBlackboxedUISourceCode(uiLocation.uiSourceCode)) {
        contextMenu.debugSection().appendItem(
            ls`Stop blackboxing`, () => Bindings.blackboxManager.unblackboxUISourceCode(uiLocation.uiSourceCode));
      } else {
        contextMenu.debugSection().appendItem(
            ls`Blackbox script`, () => Bindings.blackboxManager.blackboxUISourceCode(uiLocation.uiSourceCode));
      }
    }
    contextMenu.appendApplicableItems(event);
    contextMenu.show();
  }

  if (!stackTrace)
    return {element, links};

  appendStackTrace(stackTrace);

  let asyncStackTrace = stackTrace.parent;
  while (asyncStackTrace) {
    if (!asyncStackTrace.callFrames.length) {
      asyncStackTrace = asyncStackTrace.parent;
      continue;
    }
    const row = contentElement.createChild('tr');
    row.createChild('td').textContent = '\n';
    row.createChild('td', 'stack-preview-async-description').textContent =
        UI.asyncStackTraceLabel(asyncStackTrace.description);
    row.createChild('td');
    row.createChild('td');
    if (appendStackTrace(asyncStackTrace))
      row.classList.add('blackboxed');
    asyncStackTrace = asyncStackTrace.parent;
  }

  if (totalHiddenCallFramesCount) {
    const row = contentElement.createChild('tr', 'show-blackboxed-link');
    row.createChild('td').textContent = '\n';
    const cell = row.createChild('td');
    cell.colSpan = 4;
    const showAllLink = cell.createChild('span', 'link');
    if (totalHiddenCallFramesCount === 1)
      showAllLink.textContent = ls`Show 1 more frame`;
    else
      showAllLink.textContent = ls`Show ${totalHiddenCallFramesCount} more frames`;
    showAllLink.addEventListener('click', () => {
      contentElement.classList.add('show-blackboxed');
      if (contentUpdated)
        contentUpdated();
    }, false);
  }

  return {element, links};
};
