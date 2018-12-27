// Copyright 2017 The Chromium Authors. All
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview using private properties isn't a Closure violation in tests.
 * @suppress {accessControls}
 */

AccessibilityTestRunner.accessibilitySidebarPane = function() {
  return self.runtime.sharedInstance(Accessibility.AccessibilitySidebarView);
};

AccessibilityTestRunner.selectNodeAndWaitForAccessibility = function(idValue) {
  return new Promise(resolve => {
    ElementsTestRunner.selectNodeWithId(idValue, function() {
      self.runtime.sharedInstance(Accessibility.AccessibilitySidebarView).doUpdate().then(resolve);
    });
  });
};

AccessibilityTestRunner.dumpSelectedElementAccessibilityNode = function() {
  const sidebarPane = AccessibilityTestRunner.accessibilitySidebarPane();

  if (!sidebarPane) {
    TestRunner.addResult('No sidebarPane in dumpSelectedElementAccessibilityNode');
    TestRunner.completeTest();
    return;
  }

  AccessibilityTestRunner.dumpAccessibilityNode(sidebarPane._axNodeSubPane._axNode);
};

AccessibilityTestRunner.dumpAccessibilityNode = function(accessibilityNode) {
  if (!accessibilityNode) {
    TestRunner.addResult('<null>');
    TestRunner.completeTest();
    return;
  }

  const builder = [];
  builder.push(accessibilityNode.role().value);
  builder.push((accessibilityNode.name() ? '"' + accessibilityNode.name().value + '"' : '<undefined>'));

  if (accessibilityNode.properties()) {
    for (const property of accessibilityNode.properties()) {
      if ('value' in property)
        builder.push(property.name + '="' + property.value.value + '"');
    }
  }

  TestRunner.addResult(builder.join(' '));
};

AccessibilityTestRunner.findARIAAttributeTreeElement = function(attribute) {
  const sidebarPane = AccessibilityTestRunner.accessibilitySidebarPane();

  if (!sidebarPane) {
    TestRunner.addResult('Could not get Accessibility sidebar pane.');
    TestRunner.completeTest();
    return;
  }

  const ariaSubPane = sidebarPane._ariaSubPane;
  const treeOutline = ariaSubPane._treeOutline;
  const childNodes = treeOutline._rootElement._children;

  for (const treeElement of childNodes) {
    if (treeElement._attribute.name === attribute)
      return treeElement;
  }

  return null;
};
