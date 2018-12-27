// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Elements.ElementStatePaneWidget = class extends UI.Widget {
  constructor() {
    super(true);
    this.registerRequiredCSS('elements/elementStatePaneWidget.css');
    this.contentElement.className = 'styles-element-state-pane';
    this.contentElement.createChild('div').createTextChild(Common.UIString('Force element state'));
    const table = createElementWithClass('table', 'source-code');

    const inputs = [];
    this._inputs = inputs;

    /**
     * @param {!Event} event
     */
    function clickListener(event) {
      const node = UI.context.flavor(SDK.DOMNode);
      if (!node)
        return;
      node.domModel().cssModel().forcePseudoState(node, event.target.state, event.target.checked);
    }

    /**
     * @param {string} state
     * @return {!Element}
     */
    function createCheckbox(state) {
      const td = createElement('td');
      const label = UI.CheckboxLabel.create(':' + state);
      const input = label.checkboxElement;
      input.state = state;
      input.addEventListener('click', clickListener, false);
      inputs.push(input);
      td.appendChild(label);
      return td;
    }

    let tr = table.createChild('tr');
    tr.appendChild(createCheckbox.call(null, 'active'));
    tr.appendChild(createCheckbox.call(null, 'hover'));

    tr = table.createChild('tr');
    tr.appendChild(createCheckbox.call(null, 'focus'));
    tr.appendChild(createCheckbox.call(null, 'visited'));

    tr = table.createChild('tr');
    tr.appendChild(createCheckbox.call(null, 'focus-within'));
    try {
      tr.querySelector(':focus-visible');  // Will throw if not supported
      tr.appendChild(createCheckbox.call(null, 'focus-visible'));
    } catch (e) {
    }

    this.contentElement.appendChild(table);
    UI.context.addFlavorChangeListener(SDK.DOMNode, this._update, this);
  }

  /**
   * @param {?SDK.CSSModel} cssModel
   */
  _updateModel(cssModel) {
    if (this._cssModel === cssModel)
      return;
    if (this._cssModel)
      this._cssModel.removeEventListener(SDK.CSSModel.Events.PseudoStateForced, this._update, this);
    this._cssModel = cssModel;
    if (this._cssModel)
      this._cssModel.addEventListener(SDK.CSSModel.Events.PseudoStateForced, this._update, this);
  }

  /**
   * @override
   */
  wasShown() {
    this._update();
  }

  _update() {
    if (!this.isShowing())
      return;

    let node = UI.context.flavor(SDK.DOMNode);
    if (node)
      node = node.enclosingElementOrSelf();

    this._updateModel(node ? node.domModel().cssModel() : null);
    if (node) {
      const nodePseudoState = node.domModel().cssModel().pseudoState(node);
      for (const input of this._inputs) {
        input.disabled = !!node.pseudoType();
        input.checked = nodePseudoState.indexOf(input.state) >= 0;
      }
    } else {
      for (const input of this._inputs) {
        input.disabled = true;
        input.checked = false;
      }
    }
  }
};

/**
 * @implements {UI.ToolbarItem.Provider}
 * @unrestricted
 */
Elements.ElementStatePaneWidget.ButtonProvider = class {
  constructor() {
    this._button = new UI.ToolbarToggle(Common.UIString('Toggle Element State'), '');
    this._button.setText(Common.UIString(':hov'));
    this._button.addEventListener(UI.ToolbarButton.Events.Click, this._clicked, this);
    this._button.element.classList.add('monospace');
    this._view = new Elements.ElementStatePaneWidget();
  }

  _clicked() {
    Elements.ElementsPanel.instance().showToolbarPane(!this._view.isShowing() ? this._view : null, this._button);
  }

  /**
   * @override
   * @return {!UI.ToolbarItem}
   */
  item() {
    return this._button;
  }
};
