// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Accessibility.AccessibilitySidebarView = class extends UI.ThrottledWidget {
  constructor() {
    super();
    this._node = null;
    this._axNode = null;
    this._skipNextPullNode = false;
    this._sidebarPaneStack = UI.viewManager.createStackLocation();
    this._breadcrumbsSubPane = new Accessibility.AXBreadcrumbsPane(this);
    this._sidebarPaneStack.showView(this._breadcrumbsSubPane);
    this._ariaSubPane = new Accessibility.ARIAAttributesPane();
    this._sidebarPaneStack.showView(this._ariaSubPane);
    this._axNodeSubPane = new Accessibility.AXNodeSubPane();
    this._sidebarPaneStack.showView(this._axNodeSubPane);
    this._sidebarPaneStack.widget().show(this.element);
    UI.context.addFlavorChangeListener(SDK.DOMNode, this._pullNode, this);
    this._pullNode();
  }

  /**
   * @return {?SDK.DOMNode}
   */
  node() {
    return this._node;
  }

  /**
   * @return {?Accessibility.AccessibilityNode}
   */
  axNode() {
    return this._axNode;
  }

  /**
   * @param {?SDK.DOMNode} node
   * @param {boolean=} fromAXTree
   */
  setNode(node, fromAXTree) {
    this._skipNextPullNode = !!fromAXTree;
    this._node = node;
    this.update();
  }

  /**
   * @param {?Accessibility.AccessibilityNode} axNode
   */
  accessibilityNodeCallback(axNode) {
    if (!axNode)
      return;

    this._axNode = axNode;

    if (axNode.isDOMNode())
      this._sidebarPaneStack.showView(this._ariaSubPane, this._axNodeSubPane);
    else
      this._sidebarPaneStack.removeView(this._ariaSubPane);

    if (this._axNodeSubPane)
      this._axNodeSubPane.setAXNode(axNode);
    if (this._breadcrumbsSubPane)
      this._breadcrumbsSubPane.setAXNode(axNode);
  }

  /**
   * @override
   * @protected
   * @return {!Promise.<?>}
   */
  doUpdate() {
    const node = this.node();
    this._axNodeSubPane.setNode(node);
    this._ariaSubPane.setNode(node);
    this._breadcrumbsSubPane.setNode(node);
    if (!node)
      return Promise.resolve();
    const accessibilityModel = node.domModel().target().model(Accessibility.AccessibilityModel);
    accessibilityModel.clear();
    return accessibilityModel.requestPartialAXTree(node).then(() => {
      this.accessibilityNodeCallback(accessibilityModel.axNodeForDOMNode(node));
    });
  }

  /**
   * @override
   */
  wasShown() {
    super.wasShown();

    this._breadcrumbsSubPane.setNode(this.node());
    this._breadcrumbsSubPane.setAXNode(this.axNode());
    this._axNodeSubPane.setNode(this.node());
    this._axNodeSubPane.setAXNode(this.axNode());
    this._ariaSubPane.setNode(this.node());

    SDK.targetManager.addModelListener(SDK.DOMModel, SDK.DOMModel.Events.AttrModified, this._onAttrChange, this);
    SDK.targetManager.addModelListener(SDK.DOMModel, SDK.DOMModel.Events.AttrRemoved, this._onAttrChange, this);
    SDK.targetManager.addModelListener(
        SDK.DOMModel, SDK.DOMModel.Events.CharacterDataModified, this._onNodeChange, this);
    SDK.targetManager.addModelListener(
        SDK.DOMModel, SDK.DOMModel.Events.ChildNodeCountUpdated, this._onNodeChange, this);
  }

  /**
   * @override
   */
  willHide() {
    SDK.targetManager.removeModelListener(SDK.DOMModel, SDK.DOMModel.Events.AttrModified, this._onAttrChange, this);
    SDK.targetManager.removeModelListener(SDK.DOMModel, SDK.DOMModel.Events.AttrRemoved, this._onAttrChange, this);
    SDK.targetManager.removeModelListener(
        SDK.DOMModel, SDK.DOMModel.Events.CharacterDataModified, this._onNodeChange, this);
    SDK.targetManager.removeModelListener(
        SDK.DOMModel, SDK.DOMModel.Events.ChildNodeCountUpdated, this._onNodeChange, this);
  }

  _pullNode() {
    if (this._skipNextPullNode) {
      this._skipNextPullNode = false;
      return;
    }
    this.setNode(UI.context.flavor(SDK.DOMNode));
  }

  /**
   * @param {!Common.Event} event
   */
  _onAttrChange(event) {
    if (!this.node())
      return;
    const node = event.data.node;
    if (this.node() !== node)
      return;
    this.update();
  }

  /**
   * @param {!Common.Event} event
   */
  _onNodeChange(event) {
    if (!this.node())
      return;
    const node = event.data;
    if (this.node() !== node)
      return;
    this.update();
  }
};

/**
 * @unrestricted
 */
Accessibility.AccessibilitySubPane = class extends UI.SimpleView {
  /**
   * @param {string} name
   */
  constructor(name) {
    super(name);

    this._axNode = null;
    this.registerRequiredCSS('accessibility/accessibilityProperties.css');
  }

  /**
   * @param {?Accessibility.AccessibilityNode} axNode
   * @protected
   */
  setAXNode(axNode) {
  }

  /**
   * @return {?SDK.DOMNode}
   */
  node() {
    return this._node;
  }

  /**
   * @param {?SDK.DOMNode} node
   */
  setNode(node) {
    this._node = node;
  }

  /**
   * @param {string} textContent
   * @param {string=} className
   * @return {!Element}
   */
  createInfo(textContent, className) {
    const classNameOrDefault = className || 'gray-info-message';
    const info = this.element.createChild('div', classNameOrDefault);
    info.textContent = textContent;
    return info;
  }

  /**
   * @return {!UI.TreeOutline}
   */
  createTreeOutline() {
    const treeOutline = new UI.TreeOutlineInShadow();
    treeOutline.registerRequiredCSS('accessibility/accessibilityNode.css');
    treeOutline.registerRequiredCSS('accessibility/accessibilityProperties.css');
    treeOutline.registerRequiredCSS('object_ui/objectValue.css');

    treeOutline.element.classList.add('hidden');
    treeOutline.hideOverflow();
    this.element.appendChild(treeOutline.element);
    return treeOutline;
  }
};
