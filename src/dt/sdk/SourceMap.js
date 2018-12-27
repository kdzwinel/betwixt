/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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

/**
 * @unrestricted
 */
SDK.SourceMapV3 = class {
  constructor() {
    /** @type {number} */ this.version;
    /** @type {string|undefined} */ this.file;
    /** @type {!Array.<string>} */ this.sources;
    /** @type {!Array.<!SDK.SourceMapV3.Section>|undefined} */ this.sections;
    /** @type {string} */ this.mappings;
    /** @type {string|undefined} */ this.sourceRoot;
    /** @type {!Array.<string>|undefined} */ this.names;
  }
};

/**
 * @unrestricted
 */
SDK.SourceMapV3.Section = class {
  constructor() {
    /** @type {!SDK.SourceMapV3} */ this.map;
    /** @type {!SDK.SourceMapV3.Offset} */ this.offset;
  }
};

/**
 * @unrestricted
 */
SDK.SourceMapV3.Offset = class {
  constructor() {
    /** @type {number} */ this.line;
    /** @type {number} */ this.column;
  }
};

/**
 * @unrestricted
 */
SDK.SourceMapEntry = class {
  /**
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @param {string=} sourceURL
   * @param {number=} sourceLineNumber
   * @param {number=} sourceColumnNumber
   * @param {string=} name
   */
  constructor(lineNumber, columnNumber, sourceURL, sourceLineNumber, sourceColumnNumber, name) {
    this.lineNumber = lineNumber;
    this.columnNumber = columnNumber;
    this.sourceURL = sourceURL;
    this.sourceLineNumber = sourceLineNumber;
    this.sourceColumnNumber = sourceColumnNumber;
    this.name = name;
  }

  /**
   * @param {!SDK.SourceMapEntry} entry1
   * @param {!SDK.SourceMapEntry} entry2
   * @return {number}
   */
  static compare(entry1, entry2) {
    if (entry1.lineNumber !== entry2.lineNumber)
      return entry1.lineNumber - entry2.lineNumber;
    return entry1.columnNumber - entry2.columnNumber;
  }
};

/**
 * @interface
 */
SDK.SourceMap = function() {};

SDK.SourceMap.prototype = {
  /**
   * @return {string}
   */
  compiledURL() {},

  /**
   * @return {string}
   */
  url() {},

  /**
   * @return {!Array<string>}
   */
  sourceURLs() {},

  /**
   * @param {string} sourceURL
   * @param {!Common.ResourceType} contentType
   * @return {!Common.ContentProvider}
   */
  sourceContentProvider(sourceURL, contentType) {},

  /**
   * @param {string} sourceURL
   * @return {?string}
   */
  embeddedContentByURL(sourceURL) {},

  /**
   * @param {number} lineNumber in compiled resource
   * @param {number} columnNumber in compiled resource
   * @return {?SDK.SourceMapEntry}
   */
  findEntry(lineNumber, columnNumber) {},
};

/**
 * @unrestricted
 */
SDK.SourceMap.EditResult = class {
  /**
   * @param {!SDK.SourceMap} map
   * @param {!Array<!TextUtils.SourceEdit>} compiledEdits
   * @param {!Map<string, string>} newSources
   */
  constructor(map, compiledEdits, newSources) {
    this.map = map;
    this.compiledEdits = compiledEdits;
    this.newSources = newSources;
  }
};

/**
 * @implements {SDK.SourceMap}
 * @unrestricted
 */
SDK.TextSourceMap = class {
  /**
   * Implements Source Map V3 model. See https://github.com/google/closure-compiler/wiki/Source-Maps
   * for format description.
   * @param {string} compiledURL
   * @param {string} sourceMappingURL
   * @param {!SDK.SourceMapV3} payload
   */
  constructor(compiledURL, sourceMappingURL, payload) {
    if (!SDK.TextSourceMap._base64Map) {
      const base64Digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      SDK.TextSourceMap._base64Map = {};
      for (let i = 0; i < base64Digits.length; ++i)
        SDK.TextSourceMap._base64Map[base64Digits.charAt(i)] = i;
    }

    this._json = payload;
    this._compiledURL = compiledURL;
    this._sourceMappingURL = sourceMappingURL;
    this._baseURL = sourceMappingURL.startsWith('data:') ? compiledURL : sourceMappingURL;

    /** @type {?Array<!SDK.SourceMapEntry>} */
    this._mappings = null;
    /** @type {!Map<string, !SDK.TextSourceMap.SourceInfo>} */
    this._sourceInfos = new Map();
    this._eachSection(this._parseSources.bind(this));
  }

  /**
   * @param {string} sourceMapURL
   * @param {string} compiledURL
   * @return {!Promise<?SDK.TextSourceMap>}
   * @this {SDK.TextSourceMap}
   */
  static load(sourceMapURL, compiledURL) {
    let callback;
    const promise = new Promise(fulfill => callback = fulfill);
    SDK.multitargetNetworkManager.loadResource(sourceMapURL, contentLoaded);
    return promise;

    /**
     * @param {number} statusCode
     * @param {!Object.<string, string>} headers
     * @param {string} content
     */
    function contentLoaded(statusCode, headers, content) {
      if (!content || statusCode >= 400) {
        callback(null);
        return;
      }

      if (content.slice(0, 3) === ')]}')
        content = content.substring(content.indexOf('\n'));
      try {
        const payload = /** @type {!SDK.SourceMapV3} */ (JSON.parse(content));
        callback(new SDK.TextSourceMap(compiledURL, sourceMapURL, payload));
      } catch (e) {
        console.error(e);
        Common.console.warn('DevTools failed to parse SourceMap: ' + sourceMapURL);
        callback(null);
      }
    }
  }

  /**
   * @override
   * @return {string}
   */
  compiledURL() {
    return this._compiledURL;
  }

  /**
   * @override
   * @return {string}
   */
  url() {
    return this._sourceMappingURL;
  }

  /**
   * @override
   * @return {!Array.<string>}
   */
  sourceURLs() {
    return this._sourceInfos.keysArray();
  }

  /**
   * @override
   * @param {string} sourceURL
   * @param {!Common.ResourceType} contentType
   * @return {!Common.ContentProvider}
   */
  sourceContentProvider(sourceURL, contentType) {
    const info = this._sourceInfos.get(sourceURL);
    if (info.content)
      return Common.StaticContentProvider.fromString(sourceURL, contentType, info.content);
    return new SDK.CompilerSourceMappingContentProvider(sourceURL, contentType);
  }

  /**
   * @override
   * @param {string} sourceURL
   * @return {?string}
   */
  embeddedContentByURL(sourceURL) {
    if (!this._sourceInfos.has(sourceURL))
      return null;
    return this._sourceInfos.get(sourceURL).content;
  }

  /**
   * @override
   * @param {number} lineNumber in compiled resource
   * @param {number} columnNumber in compiled resource
   * @return {?SDK.SourceMapEntry}
   */
  findEntry(lineNumber, columnNumber) {
    const mappings = this.mappings();
    const index = mappings.upperBound(
        undefined, (unused, entry) => lineNumber - entry.lineNumber || columnNumber - entry.columnNumber);
    return index ? mappings[index - 1] : null;
  }

  /**
   * @param {string} sourceURL
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {?SDK.SourceMapEntry}
   */
  sourceLineMapping(sourceURL, lineNumber, columnNumber) {
    const mappings = this._reversedMappings(sourceURL);
    const first = mappings.lowerBound(lineNumber, lineComparator);
    const last = mappings.upperBound(lineNumber, lineComparator);
    if (first >= mappings.length || mappings[first].sourceLineNumber !== lineNumber)
      return null;
    const columnMappings = mappings.slice(first, last);
    if (!columnMappings.length)
      return null;
    const index =
        columnMappings.lowerBound(columnNumber, (columnNumber, mapping) => columnNumber - mapping.sourceColumnNumber);
    return index >= columnMappings.length ? columnMappings[columnMappings.length - 1] : columnMappings[index];

    /**
     * @param {number} lineNumber
     * @param {!SDK.SourceMapEntry} mapping
     * @return {number}
     */
    function lineComparator(lineNumber, mapping) {
      return lineNumber - mapping.sourceLineNumber;
    }
  }

  /**
   * @param {string} sourceURL
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {!Array<!SDK.SourceMapEntry>}
   */
  findReverseEntries(sourceURL, lineNumber, columnNumber) {
    const mappings = this._reversedMappings(sourceURL);
    const endIndex = mappings.upperBound(
        undefined, (unused, entry) => lineNumber - entry.sourceLineNumber || columnNumber - entry.sourceColumnNumber);
    let startIndex = endIndex;
    while (startIndex > 0 && mappings[startIndex - 1].sourceLineNumber === mappings[endIndex - 1].sourceLineNumber &&
           mappings[startIndex - 1].sourceColumnNumber === mappings[endIndex - 1].sourceColumnNumber)
      --startIndex;

    return mappings.slice(startIndex, endIndex);
  }

  /**
   * @return {!Array<!SDK.SourceMapEntry>}
   */
  mappings() {
    if (this._mappings === null) {
      this._mappings = [];
      this._eachSection(this._parseMap.bind(this));
      this._json = null;
    }
    return /** @type {!Array<!SDK.SourceMapEntry>} */ (this._mappings);
  }

  /**
   * @param {string} sourceURL
   * @return {!Array.<!SDK.SourceMapEntry>}
   */
  _reversedMappings(sourceURL) {
    if (!this._sourceInfos.has(sourceURL))
      return [];
    const mappings = this.mappings();
    const info = this._sourceInfos.get(sourceURL);
    if (info.reverseMappings === null)
      info.reverseMappings = mappings.filter(mapping => mapping.sourceURL === sourceURL).sort(sourceMappingComparator);

    return info.reverseMappings;

    /**
     * @param {!SDK.SourceMapEntry} a
     * @param {!SDK.SourceMapEntry} b
     * @return {number}
     */
    function sourceMappingComparator(a, b) {
      if (a.sourceLineNumber !== b.sourceLineNumber)
        return a.sourceLineNumber - b.sourceLineNumber;
      if (a.sourceColumnNumber !== b.sourceColumnNumber)
        return a.sourceColumnNumber - b.sourceColumnNumber;

      if (a.lineNumber !== b.lineNumber)
        return a.lineNumber - b.lineNumber;

      return a.columnNumber - b.columnNumber;
    }
  }

  /**
   * @param {function(!SDK.SourceMapV3, number, number)} callback
   */
  _eachSection(callback) {
    if (!this._json.sections) {
      callback(this._json, 0, 0);
      return;
    }
    for (const section of this._json.sections)
      callback(section.map, section.offset.line, section.offset.column);
  }

  /**
   * @param {!SDK.SourceMapV3} sourceMap
   */
  _parseSources(sourceMap) {
    const sourcesList = [];
    let sourceRoot = sourceMap.sourceRoot || '';
    if (sourceRoot && !sourceRoot.endsWith('/'))
      sourceRoot += '/';
    for (let i = 0; i < sourceMap.sources.length; ++i) {
      const href = sourceRoot + sourceMap.sources[i];
      let url = Common.ParsedURL.completeURL(this._baseURL, href) || href;
      const source = sourceMap.sourcesContent && sourceMap.sourcesContent[i];
      if (url === this._compiledURL && source)
        url += Common.UIString('? [sm]');
      this._sourceInfos.set(url, new SDK.TextSourceMap.SourceInfo(source, null));
      sourcesList.push(url);
    }
    sourceMap[SDK.TextSourceMap._sourcesListSymbol] = sourcesList;
  }

  /**
   * @param {!SDK.SourceMapV3} map
   * @param {number} lineNumber
   * @param {number} columnNumber
   */
  _parseMap(map, lineNumber, columnNumber) {
    let sourceIndex = 0;
    let sourceLineNumber = 0;
    let sourceColumnNumber = 0;
    let nameIndex = 0;
    const sources = map[SDK.TextSourceMap._sourcesListSymbol];
    const names = map.names || [];
    const stringCharIterator = new SDK.TextSourceMap.StringCharIterator(map.mappings);
    let sourceURL = sources[sourceIndex];

    while (true) {
      if (stringCharIterator.peek() === ',') {
        stringCharIterator.next();
      } else {
        while (stringCharIterator.peek() === ';') {
          lineNumber += 1;
          columnNumber = 0;
          stringCharIterator.next();
        }
        if (!stringCharIterator.hasNext())
          break;
      }

      columnNumber += this._decodeVLQ(stringCharIterator);
      if (!stringCharIterator.hasNext() || this._isSeparator(stringCharIterator.peek())) {
        this._mappings.push(new SDK.SourceMapEntry(lineNumber, columnNumber));
        continue;
      }

      const sourceIndexDelta = this._decodeVLQ(stringCharIterator);
      if (sourceIndexDelta) {
        sourceIndex += sourceIndexDelta;
        sourceURL = sources[sourceIndex];
      }
      sourceLineNumber += this._decodeVLQ(stringCharIterator);
      sourceColumnNumber += this._decodeVLQ(stringCharIterator);

      if (!stringCharIterator.hasNext() || this._isSeparator(stringCharIterator.peek())) {
        this._mappings.push(
            new SDK.SourceMapEntry(lineNumber, columnNumber, sourceURL, sourceLineNumber, sourceColumnNumber));
        continue;
      }

      nameIndex += this._decodeVLQ(stringCharIterator);
      this._mappings.push(new SDK.SourceMapEntry(
          lineNumber, columnNumber, sourceURL, sourceLineNumber, sourceColumnNumber, names[nameIndex]));
    }

    // As per spec, mappings are not necessarily sorted.
    this._mappings.stableSort(SDK.SourceMapEntry.compare);
  }

  /**
   * @param {string} char
   * @return {boolean}
   */
  _isSeparator(char) {
    return char === ',' || char === ';';
  }

  /**
   * @param {!SDK.TextSourceMap.StringCharIterator} stringCharIterator
   * @return {number}
   */
  _decodeVLQ(stringCharIterator) {
    // Read unsigned value.
    let result = 0;
    let shift = 0;
    let digit;
    do {
      digit = SDK.TextSourceMap._base64Map[stringCharIterator.next()];
      result += (digit & SDK.TextSourceMap._VLQ_BASE_MASK) << shift;
      shift += SDK.TextSourceMap._VLQ_BASE_SHIFT;
    } while (digit & SDK.TextSourceMap._VLQ_CONTINUATION_MASK);

    // Fix the sign.
    const negative = result & 1;
    result >>= 1;
    return negative ? -result : result;
  }

  /**
   * @param {string} url
   * @param {!TextUtils.TextRange} textRange
   * @return {!TextUtils.TextRange}
   */
  reverseMapTextRange(url, textRange) {
    /**
     * @param {!{lineNumber: number, columnNumber: number}} position
     * @param {!SDK.SourceMapEntry} mapping
     * @return {number}
     */
    function comparator(position, mapping) {
      if (position.lineNumber !== mapping.sourceLineNumber)
        return position.lineNumber - mapping.sourceLineNumber;

      return position.columnNumber - mapping.sourceColumnNumber;
    }

    const mappings = this._reversedMappings(url);
    const startIndex =
        mappings.lowerBound({lineNumber: textRange.startLine, columnNumber: textRange.startColumn}, comparator);
    const endIndex =
        mappings.upperBound({lineNumber: textRange.endLine, columnNumber: textRange.endColumn}, comparator);

    const startMapping = mappings[startIndex];
    const endMapping = mappings[endIndex];
    return new TextUtils.TextRange(
        startMapping.lineNumber, startMapping.columnNumber, endMapping.lineNumber, endMapping.columnNumber);
  }
};

SDK.TextSourceMap._VLQ_BASE_SHIFT = 5;
SDK.TextSourceMap._VLQ_BASE_MASK = (1 << 5) - 1;
SDK.TextSourceMap._VLQ_CONTINUATION_MASK = 1 << 5;


/**
 * @unrestricted
 */
SDK.TextSourceMap.StringCharIterator = class {
  /**
   * @param {string} string
   */
  constructor(string) {
    this._string = string;
    this._position = 0;
  }

  /**
   * @return {string}
   */
  next() {
    return this._string.charAt(this._position++);
  }

  /**
   * @return {string}
   */
  peek() {
    return this._string.charAt(this._position);
  }

  /**
   * @return {boolean}
   */
  hasNext() {
    return this._position < this._string.length;
  }
};

/**
 * @unrestricted
 */
SDK.TextSourceMap.SourceInfo = class {
  /**
   * @param {?string} content
   * @param {?Array<!SDK.SourceMapEntry>} reverseMappings
   */
  constructor(content, reverseMappings) {
    this.content = content;
    this.reverseMappings = reverseMappings;
  }
};

SDK.TextSourceMap._sourcesListSymbol = Symbol('sourcesList');
