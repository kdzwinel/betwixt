// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
Diff.Diff = {
  /**
   * @param {string} text1
   * @param {string} text2
   * @param {boolean=} cleanup
   * @return {!Array.<!{0: number, 1: string}>}
   */
  charDiff: function(text1, text2, cleanup) {
    const differ = new diff_match_patch();
    const diff = differ.diff_main(text1, text2);
    if (cleanup)
      differ.diff_cleanupSemantic(diff);
    return diff;
  },

  /**
   * @param {!Array.<string>} lines1
   * @param {!Array.<string>} lines2
   * @return {!Diff.Diff.DiffArray}
   */
  lineDiff: function(lines1, lines2) {
    /** @type {!Common.CharacterIdMap<string>} */
    const idMap = new Common.CharacterIdMap();
    const text1 = lines1.map(line => idMap.toChar(line)).join('');
    const text2 = lines2.map(line => idMap.toChar(line)).join('');

    const diff = Diff.Diff.charDiff(text1, text2);
    const lineDiff = [];
    for (let i = 0; i < diff.length; i++) {
      const lines = [];
      for (let j = 0; j < diff[i][1].length; j++)
        lines.push(idMap.fromChar(diff[i][1][j]));

      lineDiff.push({0: diff[i][0], 1: lines});
    }
    return lineDiff;
  },

  /**
   * @param {!Diff.Diff.DiffArray} diff
   * @return {!Array<!Array<number>>}
   */
  convertToEditDiff: function(diff) {
    const normalized = [];
    let added = 0;
    let removed = 0;
    for (let i = 0; i < diff.length; ++i) {
      const token = diff[i];
      if (token[0] === Diff.Diff.Operation.Equal) {
        flush();
        normalized.push([Diff.Diff.Operation.Equal, token[1].length]);
      } else if (token[0] === Diff.Diff.Operation.Delete) {
        removed += token[1].length;
      } else {
        added += token[1].length;
      }
    }
    flush();
    return normalized;

    function flush() {
      if (added && removed) {
        const min = Math.min(added, removed);
        normalized.push([Diff.Diff.Operation.Edit, min]);
        added -= min;
        removed -= min;
      }
      if (added || removed) {
        const balance = added - removed;
        const type = balance < 0 ? Diff.Diff.Operation.Delete : Diff.Diff.Operation.Insert;
        normalized.push([type, Math.abs(balance)]);
        added = 0;
        removed = 0;
      }
    }
  }

};

/** @enum {number} */
Diff.Diff.Operation = {
  Equal: 0,
  Insert: 1,
  Delete: -1,
  Edit: 2
};

/** @typedef {!Array<!{0: !Diff.Diff.Operation, 1: !Array<string>}>} */
Diff.Diff.DiffArray;