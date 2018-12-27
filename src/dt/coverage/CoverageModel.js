// Copyright (c) 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** @typedef {{startOffset: number, endOffset: number, count: number}} */
Coverage.RangeUseCount;

/** @typedef {{end: number, count: (number|undefined)}} */
Coverage.CoverageSegment;

/**
 * @enum {number}
 */
Coverage.CoverageType = {
  CSS: (1 << 0),
  JavaScript: (1 << 1),
  JavaScriptCoarse: (1 << 2),
};

Coverage.CoverageModel = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    this._cpuProfilerModel = target.model(SDK.CPUProfilerModel);
    this._cssModel = target.model(SDK.CSSModel);
    this._debuggerModel = target.model(SDK.DebuggerModel);

    /** @type {!Map<string, !Coverage.URLCoverageInfo>} */
    this._coverageByURL = new Map();
    /** @type {!Map<!Common.ContentProvider, !Coverage.CoverageInfo>} */
    this._coverageByContentProvider = new Map();
    /** @type {?Promise<!Array<!Protocol.Profiler.ScriptCoverage>>} */
    this._bestEffortCoveragePromise = null;
  }

  /**
   * @return {boolean}
   */
  start() {
    if (this._cssModel) {
      // Note there's no JS coverage since JS won't ever return
      // coverage twice, even after it's restarted.
      this._clearCSS();
      this._cssModel.startCoverage();
    }
    if (this._cpuProfilerModel) {
      this._bestEffortCoveragePromise = this._cpuProfilerModel.bestEffortCoverage();
      this._cpuProfilerModel.startPreciseCoverage();
    }
    return !!(this._cssModel || this._cpuProfilerModel);
  }

  /**
   * @return {!Promise<!Array<!Coverage.CoverageInfo>>}
   */
  stop() {
    const pollPromise = this.poll();
    if (this._cpuProfilerModel)
      this._cpuProfilerModel.stopPreciseCoverage();
    if (this._cssModel)
      this._cssModel.stopCoverage();
    return pollPromise;
  }

  reset() {
    this._coverageByURL = new Map();
    this._coverageByContentProvider = new Map();
  }

  /**
   * @return {!Promise<!Array<!Coverage.CoverageInfo>>}
   */
  async poll() {
    const updates = await Promise.all([this._takeCSSCoverage(), this._takeJSCoverage()]);
    return updates[0].concat(updates[1]);
  }

  /**
   * @return {!Array<!Coverage.URLCoverageInfo>}
   */
  entries() {
    return Array.from(this._coverageByURL.values());
  }

  /**
   * @param {!Common.ContentProvider} contentProvider
   * @param {number} startOffset
   * @param {number} endOffset
   * @return {boolean|undefined}
   */
  usageForRange(contentProvider, startOffset, endOffset) {
    const coverageInfo = this._coverageByContentProvider.get(contentProvider);
    return coverageInfo && coverageInfo.usageForRange(startOffset, endOffset);
  }

  _clearCSS() {
    for (const entry of this._coverageByContentProvider.values()) {
      if (entry.type() !== Coverage.CoverageType.CSS)
        continue;
      const contentProvider = /** @type {!SDK.CSSStyleSheetHeader} */ (entry.contentProvider());
      this._coverageByContentProvider.delete(contentProvider);
      const key = `${contentProvider.startLine}:${contentProvider.startColumn}`;
      const urlEntry = this._coverageByURL.get(entry.url());
      if (!urlEntry || !urlEntry._coverageInfoByLocation.delete(key))
        continue;
      urlEntry._size -= entry._size;
      urlEntry._usedSize -= entry._usedSize;
      if (!urlEntry._coverageInfoByLocation.size)
        this._coverageByURL.delete(entry.url());
    }
  }

  /**
   * @return {!Promise<!Array<!Coverage.CoverageInfo>>}
   */
  async _takeJSCoverage() {
    if (!this._cpuProfilerModel)
      return [];
    let rawCoverageData = await this._cpuProfilerModel.takePreciseCoverage();
    if (this._bestEffortCoveragePromise) {
      const bestEffortCoverage = await this._bestEffortCoveragePromise;
      this._bestEffortCoveragePromise = null;
      rawCoverageData = bestEffortCoverage.concat(rawCoverageData);
    }
    return this._processJSCoverage(rawCoverageData);
  }

  /**
   * @param {!Array<!Protocol.Profiler.ScriptCoverage>} scriptsCoverage
   * @return {!Array<!Coverage.CoverageInfo>}
   */
  _processJSCoverage(scriptsCoverage) {
    const updatedEntries = [];
    for (const entry of scriptsCoverage) {
      const script = this._debuggerModel.scriptForId(entry.scriptId);
      if (!script)
        continue;
      const ranges = [];
      let type = Coverage.CoverageType.JavaScript;
      for (const func of entry.functions) {
        // Do not coerce undefined to false, i.e. only consider blockLevel to be false
        // if back-end explicitly provides blockLevel field, otherwise presume blockLevel
        // coverage is not available. Also, ignore non-block level functions that weren't
        // ever called.
        if (func.isBlockCoverage === false && !(func.ranges.length === 1 && !func.ranges[0].count))
          type |= Coverage.CoverageType.JavaScriptCoarse;
        for (const range of func.ranges)
          ranges.push(range);
      }
      const subentry =
          this._addCoverage(script, script.contentLength, script.lineOffset, script.columnOffset, ranges, type);
      if (subentry)
        updatedEntries.push(subentry);
    }
    return updatedEntries;
  }

  /**
   * @return {!Promise<!Array<!Coverage.CoverageInfo>>}
   */
  async _takeCSSCoverage() {
    if (!this._cssModel)
      return [];
    const rawCoverageData = await this._cssModel.takeCoverageDelta();
    return this._processCSSCoverage(rawCoverageData);
  }

  /**
   * @param {!Array<!Protocol.CSS.RuleUsage>} ruleUsageList
   * @return {!Array<!Coverage.CoverageInfo>}
   */
  _processCSSCoverage(ruleUsageList) {
    const updatedEntries = [];
    /** @type {!Map<!SDK.CSSStyleSheetHeader, !Array<!Coverage.RangeUseCount>>} */
    const rulesByStyleSheet = new Map();
    for (const rule of ruleUsageList) {
      const styleSheetHeader = this._cssModel.styleSheetHeaderForId(rule.styleSheetId);
      if (!styleSheetHeader)
        continue;
      let ranges = rulesByStyleSheet.get(styleSheetHeader);
      if (!ranges) {
        ranges = [];
        rulesByStyleSheet.set(styleSheetHeader, ranges);
      }
      ranges.push({startOffset: rule.startOffset, endOffset: rule.endOffset, count: Number(rule.used)});
    }
    for (const entry of rulesByStyleSheet) {
      const styleSheetHeader = /** @type {!SDK.CSSStyleSheetHeader} */ (entry[0]);
      const ranges = /** @type {!Array<!Coverage.RangeUseCount>} */ (entry[1]);
      const subentry = this._addCoverage(
          styleSheetHeader, styleSheetHeader.contentLength, styleSheetHeader.startLine, styleSheetHeader.startColumn,
          ranges, Coverage.CoverageType.CSS);
      if (subentry)
        updatedEntries.push(subentry);
    }
    return updatedEntries;
  }

  /**
   * @param {!Array<!Coverage.RangeUseCount>} ranges
   * @return {!Array<!Coverage.CoverageSegment>}
   */
  static _convertToDisjointSegments(ranges) {
    ranges.sort((a, b) => a.startOffset - b.startOffset);

    const result = [];
    const stack = [];
    for (const entry of ranges) {
      let top = stack.peekLast();
      while (top && top.endOffset <= entry.startOffset) {
        append(top.endOffset, top.count);
        stack.pop();
        top = stack.peekLast();
      }
      append(entry.startOffset, top ? top.count : undefined);
      stack.push(entry);
    }

    while (stack.length) {
      const top = stack.pop();
      append(top.endOffset, top.count);
    }

    /**
     * @param {number} end
     * @param {number} count
     */
    function append(end, count) {
      const last = result.peekLast();
      if (last) {
        if (last.end === end)
          return;
        if (last.count === count) {
          last.end = end;
          return;
        }
      }
      result.push({end: end, count: count});
    }

    return result;
  }

  /**
   * @param {!Common.ContentProvider} contentProvider
   * @param {number} contentLength
   * @param {number} startLine
   * @param {number} startColumn
   * @param {!Array<!Coverage.RangeUseCount>} ranges
   * @param {!Coverage.CoverageType} type
   * @return {?Coverage.CoverageInfo}
   */
  _addCoverage(contentProvider, contentLength, startLine, startColumn, ranges, type) {
    const url = contentProvider.contentURL();
    if (!url)
      return null;
    let urlCoverage = this._coverageByURL.get(url);
    if (!urlCoverage) {
      urlCoverage = new Coverage.URLCoverageInfo(url);
      this._coverageByURL.set(url, urlCoverage);
    }

    const coverageInfo = urlCoverage._ensureEntry(contentProvider, contentLength, startLine, startColumn, type);
    this._coverageByContentProvider.set(contentProvider, coverageInfo);
    const segments = Coverage.CoverageModel._convertToDisjointSegments(ranges);
    if (segments.length && segments.peekLast().end < contentLength)
      segments.push({end: contentLength});
    const oldUsedSize = coverageInfo._usedSize;
    coverageInfo.mergeCoverage(segments);
    if (coverageInfo._usedSize === oldUsedSize)
      return null;
    urlCoverage._usedSize += coverageInfo._usedSize - oldUsedSize;
    return coverageInfo;
  }

  /**
   * @param {!Bindings.FileOutputStream} fos
   */
  async exportReport(fos) {
    const result = [];
    for (const urlInfo of this._coverageByURL.values()) {
      const url = urlInfo.url();
      if (url.startsWith('extensions::') || url.startsWith('chrome-extension://'))
        continue;

      // For .html resources, multiple scripts share URL, but have different offsets.
      let useFullText = false;
      for (const info of urlInfo._coverageInfoByLocation.values()) {
        if (info._lineOffset || info._columnOffset) {
          useFullText = !!url;
          break;
        }
      }

      let fullText = null;
      if (useFullText) {
        const resource = SDK.ResourceTreeModel.resourceForURL(url);
        fullText = resource ? new TextUtils.Text(await resource.requestContent()) : null;
      }

      // We have full text for this resource, resolve the offsets using the text line endings.
      if (fullText) {
        const entry = {url, ranges: [], text: fullText.value()};
        for (const info of urlInfo._coverageInfoByLocation.values()) {
          const offset = fullText ? fullText.offsetFromPosition(info._lineOffset, info._columnOffset) : 0;
          let start = 0;
          for (const segment of info._segments) {
            if (segment.count)
              entry.ranges.push({start: start + offset, end: segment.end + offset});
            else
              start = segment.end;
          }
        }
        result.push(entry);
        continue;
      }

      // Fall back to the per-script operation.
      for (const info of urlInfo._coverageInfoByLocation.values()) {
        const entry = {url, ranges: [], text: await info.contentProvider().requestContent()};
        let start = 0;
        for (const segment of info._segments) {
          if (segment.count)
            entry.ranges.push({start: start, end: segment.end});
          else
            start = segment.end;
        }
        result.push(entry);
      }
    }
    await fos.write(JSON.stringify(result, undefined, 2));
    fos.close();
  }
};

Coverage.URLCoverageInfo = class {
  /**
   * @param {string} url
   */
  constructor(url) {
    this._url = url;
    /** @type {!Map<string, !Coverage.CoverageInfo>} */
    this._coverageInfoByLocation = new Map();
    this._size = 0;
    this._usedSize = 0;
    /** @type {!Coverage.CoverageType} */
    this._type;
    this._isContentScript = false;
  }

  /**
   * @return {string}
   */
  url() {
    return this._url;
  }

  /**
   * @return {!Coverage.CoverageType}
   */
  type() {
    return this._type;
  }

  /**
   * @return {number}
   */
  size() {
    return this._size;
  }

  /**
   * @return {number}
   */
  usedSize() {
    return this._usedSize;
  }

  /**
   * @return {number}
   */
  unusedSize() {
    return this._size - this._usedSize;
  }

  /**
   * @return {boolean}
   */
  isContentScript() {
    return this._isContentScript;
  }

  /**
   * @param {!Common.ContentProvider} contentProvider
   * @param {number} contentLength
   * @param {number} lineOffset
   * @param {number} columnOffset
   * @param {!Coverage.CoverageType} type
   * @return {!Coverage.CoverageInfo}
   */
  _ensureEntry(contentProvider, contentLength, lineOffset, columnOffset, type) {
    const key = `${lineOffset}:${columnOffset}`;
    let entry = this._coverageInfoByLocation.get(key);

    if ((type & Coverage.CoverageType.JavaScript) && !this._coverageInfoByLocation.size)
      this._isContentScript = /** @type {!SDK.Script} */ (contentProvider).isContentScript();
    this._type |= type;

    if (entry) {
      entry._coverageType |= type;
      return entry;
    }

    if ((type & Coverage.CoverageType.JavaScript) && !this._coverageInfoByLocation.size)
      this._isContentScript = /** @type {!SDK.Script} */ (contentProvider).isContentScript();

    entry = new Coverage.CoverageInfo(contentProvider, contentLength, lineOffset, columnOffset, type);
    this._coverageInfoByLocation.set(key, entry);
    this._size += contentLength;

    return entry;
  }
};

Coverage.CoverageInfo = class {
  /**
   * @param {!Common.ContentProvider} contentProvider
   * @param {number} size
   * @param {number} lineOffset
   * @param {number} columnOffset
   * @param {!Coverage.CoverageType} type
   */
  constructor(contentProvider, size, lineOffset, columnOffset, type) {
    this._contentProvider = contentProvider;
    this._size = size;
    this._usedSize = 0;
    this._lineOffset = lineOffset;
    this._columnOffset = columnOffset;
    this._coverageType = type;

    /** !Array<!Coverage.CoverageSegment> */
    this._segments = [];
  }

  /**
   * @return {!Common.ContentProvider}
   */
  contentProvider() {
    return this._contentProvider;
  }

  /**
   * @return {string}
   */
  url() {
    return this._contentProvider.contentURL();
  }

  /**
   * @return {!Coverage.CoverageType}
   */
  type() {
    return this._coverageType;
  }

  /**
   * @param {!Array<!Coverage.CoverageSegment>} segments
   */
  mergeCoverage(segments) {
    this._segments = Coverage.CoverageInfo._mergeCoverage(this._segments, segments);
    this._updateStats();
  }

  /**
   * @param {number} start
   * @param {number} end
   * @return {boolean}
   */
  usageForRange(start, end) {
    let index = this._segments.upperBound(start, (position, segment) => position - segment.end);
    for (; index < this._segments.length && this._segments[index].end < end; ++index) {
      if (this._segments[index].count)
        return true;
    }
    return index < this._segments.length && !!this._segments[index].count;
  }

  /**
   * @param {!Array<!Coverage.CoverageSegment>} segmentsA
   * @param {!Array<!Coverage.CoverageSegment>} segmentsB
   */
  static _mergeCoverage(segmentsA, segmentsB) {
    const result = [];

    let indexA = 0;
    let indexB = 0;
    while (indexA < segmentsA.length && indexB < segmentsB.length) {
      const a = segmentsA[indexA];
      const b = segmentsB[indexB];
      const count =
          typeof a.count === 'number' || typeof b.count === 'number' ? (a.count || 0) + (b.count || 0) : undefined;
      const end = Math.min(a.end, b.end);
      const last = result.peekLast();
      if (!last || last.count !== count)
        result.push({end: end, count: count});
      else
        last.end = end;
      if (a.end <= b.end)
        indexA++;
      if (a.end >= b.end)
        indexB++;
    }

    for (; indexA < segmentsA.length; indexA++)
      result.push(segmentsA[indexA]);
    for (; indexB < segmentsB.length; indexB++)
      result.push(segmentsB[indexB]);
    return result;
  }

  _updateStats() {
    this._usedSize = 0;

    let last = 0;
    for (const segment of this._segments) {
      if (segment.count)
        this._usedSize += segment.end - last;
      last = segment.end;
    }
  }
};
