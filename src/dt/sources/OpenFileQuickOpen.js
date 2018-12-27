/*
 * Copyright (c) 2012 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

Sources.OpenFileQuickOpen = class extends Sources.FilteredUISourceCodeListProvider {
  /**
   * @override
   */
  attach() {
    this.setDefaultScores(Sources.SourcesView.defaultUISourceCodeScores());
    super.attach();
  }

  /**
   * @override
   * @param {?Workspace.UISourceCode} uiSourceCode
   * @param {number=} lineNumber
   * @param {number=} columnNumber
   */
  uiSourceCodeSelected(uiSourceCode, lineNumber, columnNumber) {
    Host.userMetrics.actionTaken(Host.UserMetrics.Action.SelectFileFromFilePicker);

    if (!uiSourceCode)
      return;
    if (typeof lineNumber === 'number')
      Common.Revealer.reveal(uiSourceCode.uiLocation(lineNumber, columnNumber));
    else
      Common.Revealer.reveal(uiSourceCode);
  }

  /**
   * @override
   * @param {!Workspace.Project} project
   * @return {boolean}
   */
  filterProject(project) {
    return !project.isServiceProject();
  }

  /**
   * @override
   * @return {boolean}
   */
  renderAsTwoRows() {
    return true;
  }
};
