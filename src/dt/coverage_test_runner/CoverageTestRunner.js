// Copyright 2017 The Chromium Authors. All
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview using private properties isn't a Closure violation in tests.
 * @suppress {accessControls}
 */

CoverageTestRunner.startCoverage = function() {
  UI.viewManager.showView('coverage');
  const coverageView = self.runtime.sharedInstance(Coverage.CoverageView);
  coverageView._startRecording();
};

/**
 * @return {!Promise}
 */
CoverageTestRunner.stopCoverage = function() {
  const coverageView = self.runtime.sharedInstance(Coverage.CoverageView);
  return coverageView._stopRecording();
};

/**
 * @return {!Promise}
 */
CoverageTestRunner.pollCoverage = function() {
  const coverageView = self.runtime.sharedInstance(Coverage.CoverageView);
  return coverageView._poll();
};

/**
 * @return {!Promise<string>}
 */
CoverageTestRunner.exportReport = async function() {
  const coverageView = self.runtime.sharedInstance(Coverage.CoverageView);
  let data;
  await coverageView._model.exportReport({write: d => data = d, close: _ => 0});
  return data;
};

/**
 * @return {!Promise<!SourceFrame.SourceFrame>}
 */
CoverageTestRunner.sourceDecorated = async function(source) {
  await UI.inspectorView.showPanel('sources');
  const decoratePromise = TestRunner.addSnifferPromise(Coverage.CoverageView.LineDecorator.prototype, '_innerDecorate');
  const sourceFrame = await SourcesTestRunner.showScriptSourcePromise(source);
  await decoratePromise;
  return sourceFrame;
};

CoverageTestRunner.dumpDecorations = async function(source) {
  const sourceFrame = await CoverageTestRunner.sourceDecorated(source);
  CoverageTestRunner.dumpDecorationsInSourceFrame(sourceFrame);
};

/**
 * @return {?DataGrid.DataGridNode}
 */
CoverageTestRunner.findCoverageNodeForURL = function(url) {
  const coverageListView = self.runtime.sharedInstance(Coverage.CoverageView)._listView;
  const rootNode = coverageListView._dataGrid.rootNode();

  for (const child of rootNode.children) {
    if (child._coverageInfo.url().endsWith(url))
      return child;
  }

  return null;
};

CoverageTestRunner.dumpDecorationsInSourceFrame = function(sourceFrame) {
  const markerMap = new Map([['used', '+'], ['unused', '-']]);
  const codeMirror = sourceFrame.textEditor.codeMirror();

  for (let line = 0; line < codeMirror.lineCount(); ++line) {
    const text = codeMirror.getLine(line);
    let markerType = ' ';
    const lineInfo = codeMirror.lineInfo(line);

    if (!lineInfo)
      continue;

    const gutterElement = lineInfo.gutterMarkers && lineInfo.gutterMarkers['CodeMirror-gutter-coverage'];

    if (gutterElement) {
      const markerClass = /^text-editor-coverage-(\w*)-marker$/.exec(gutterElement.classList)[1];
      markerType = markerMap.get(markerClass) || gutterElement.classList;
    }

    TestRunner.addResult(`${line}: ${markerType} ${text}`);
  }
};

CoverageTestRunner.dumpCoverageListView = function() {
  const coverageListView = self.runtime.sharedInstance(Coverage.CoverageView)._listView;
  const dataGrid = coverageListView._dataGrid;
  dataGrid.updateInstantly();

  for (const child of dataGrid.rootNode().children) {
    const data = child._coverageInfo;
    const url = TestRunner.formatters.formatAsURL(data.url());

    if (url.startsWith('test://'))
      continue;

    const type = Coverage.CoverageListView._typeToString(data.type());
    TestRunner.addResult(`${url} ${type} used: ${data.usedSize()} unused: ${data.unusedSize()} total: ${data.size()}`);
  }
};
