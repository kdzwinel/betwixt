// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @return {!Help.ReleaseNote}
 */
Help.latestReleaseNote = function() {
  if (!Help._latestReleaseNote) {
    /** @type {!Help.ReleaseNote} */
    Help._latestReleaseNote = Help.releaseNoteText.reduce((acc, note) => note.version > acc.version ? note : acc);
  }
  return Help._latestReleaseNote;
};

Help._showReleaseNoteIfNeeded = function() {
  Help._innerShowReleaseNoteIfNeeded(
      Help._releaseNoteVersionSetting.get(), Help.latestReleaseNote().version,
      Common.settings.moduleSetting('help.show-release-note').get());
};

/**
 * @param {number} lastSeenVersion
 * @param {number} latestVersion
 * @param {boolean} showReleaseNote
 */
Help._innerShowReleaseNoteIfNeeded = function(lastSeenVersion, latestVersion, showReleaseNote) {
  if (!lastSeenVersion) {
    Help._releaseNoteVersionSetting.set(latestVersion);
    return;
  }
  if (!showReleaseNote)
    return;
  if (lastSeenVersion >= latestVersion)
    return;
  Help._releaseNoteVersionSetting.set(latestVersion);
  UI.viewManager.showView(Help.releaseNoteViewId, true);
};

/**
 * @const
 * @type {string}
 */
Help.releaseNoteViewId = 'release-note';

/** @typedef {!{title: string, subtitle: string, link: string}} */
Help.ReleaseNoteHighlight;

/**
 * @typedef {!{version: number, header: string, highlights: !Array<!Help.ReleaseNoteHighlight>,
 *    link: string}}
 */
Help.ReleaseNote;

/**
 * @implements {Common.Runnable}
 */
Help.HelpLateInitialization = class {
  /**
   * @override
   */
  run() {
    Help._showReleaseNoteIfNeeded();
  }
};

/**
 * @implements {UI.ActionDelegate}
 */
Help.ReleaseNotesActionDelegate = class {
  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    InspectorFrontendHost.openInNewTab(Help.latestReleaseNote().link);
    return true;
  }
};

/** @type {!Common.Setting} */
Help._releaseNoteVersionSetting = Common.settings.createSetting('releaseNoteVersionSeen', 0);
