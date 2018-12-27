/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

ObjectUI.ObjectPopoverHelper = class {
  /**
   * @param {?Components.Linkifier} linkifier
   * @param {boolean} resultHighlightedAsDOM
   */
  constructor(linkifier, resultHighlightedAsDOM) {
    this._linkifier = linkifier;
    this._resultHighlightedAsDOM = resultHighlightedAsDOM;
  }

  dispose() {
    if (this._resultHighlightedAsDOM)
      SDK.OverlayModel.hideDOMNodeHighlight();
    if (this._linkifier)
      this._linkifier.dispose();
  }

  /**
   * @param {!SDK.RemoteObject} result
   * @param {!UI.GlassPane} popover
   * @return {!Promise<?ObjectUI.ObjectPopoverHelper>}
   */
  static async buildObjectPopover(result, popover) {
    const description = result.description.trimEnd(ObjectUI.ObjectPopoverHelper.MaxPopoverTextLength);
    let popoverContentElement = null;
    if (result.type === 'object') {
      let linkifier = null;
      let resultHighlightedAsDOM = false;
      if (result.subtype === 'node') {
        SDK.OverlayModel.highlightObjectAsDOMNode(result);
        resultHighlightedAsDOM = true;
      }

      if (result.customPreview()) {
        const customPreviewComponent = new ObjectUI.CustomPreviewComponent(result);
        customPreviewComponent.expandIfPossible();
        popoverContentElement = customPreviewComponent.element;
      } else {
        popoverContentElement = createElementWithClass('div', 'object-popover-content');
        UI.appendStyle(popoverContentElement, 'object_ui/objectPopover.css');
        const titleElement = popoverContentElement.createChild('div', 'monospace object-popover-title');
        titleElement.createChild('span').textContent = description;
        linkifier = new Components.Linkifier();
        const section = new ObjectUI.ObjectPropertiesSection(
            result, '', linkifier, undefined, undefined, undefined, true /* showOverflow */);
        section.element.classList.add('object-popover-tree');
        section.titleLessMode();
        popoverContentElement.appendChild(section.element);
      }
      popover.setMaxContentSize(new UI.Size(300, 250));
      popover.setSizeBehavior(UI.GlassPane.SizeBehavior.SetExactSize);
      popover.contentElement.appendChild(popoverContentElement);
      return new ObjectUI.ObjectPopoverHelper(linkifier, resultHighlightedAsDOM);
    }

    popoverContentElement = createElement('span');
    UI.appendStyle(popoverContentElement, 'object_ui/objectValue.css');
    UI.appendStyle(popoverContentElement, 'object_ui/objectPopover.css');
    const valueElement = popoverContentElement.createChild('span', 'monospace object-value-' + result.type);
    valueElement.style.whiteSpace = 'pre';

    if (result.type === 'string')
      valueElement.createTextChildren(`"${description}"`);
    else if (result.type !== 'function')
      valueElement.textContent = description;

    if (result.type !== 'function') {
      popover.contentElement.appendChild(popoverContentElement);
      return new ObjectUI.ObjectPopoverHelper(null, false);
    }

    ObjectUI.ObjectPropertiesSection.formatObjectAsFunction(result, valueElement, true);
    const response = await result.debuggerModel().functionDetailsPromise(result);
    if (!response)
      return null;

    const container = createElementWithClass('div', 'object-popover-container');
    const title = container.createChild('div', 'function-popover-title source-code');
    const functionName = title.createChild('span', 'function-name');
    functionName.textContent = UI.beautifyFunctionName(response.functionName);

    const rawLocation = response.location;
    const linkContainer = title.createChild('div', 'function-title-link-container');
    const sourceURL = rawLocation && rawLocation.script() && rawLocation.script().sourceURL;
    let linkifier = null;
    if (sourceURL) {
      linkifier = new Components.Linkifier();
      linkContainer.appendChild(linkifier.linkifyRawLocation(rawLocation, sourceURL));
    }
    container.appendChild(popoverContentElement);
    popover.contentElement.appendChild(container);
    return new ObjectUI.ObjectPopoverHelper(linkifier, false);
  }
};

ObjectUI.ObjectPopoverHelper.MaxPopoverTextLength = 10000;
