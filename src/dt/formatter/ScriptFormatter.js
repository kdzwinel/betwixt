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
/**
 * @interface
 */
Formatter.Formatter = function() {};

/**
 * @param {!Common.ResourceType} contentType
 * @param {string} mimeType
 * @param {string} content
 * @param {function(string, !Formatter.FormatterSourceMapping)} callback
 */
Formatter.Formatter.format = function(contentType, mimeType, content, callback) {
  if (contentType.isDocumentOrScriptOrStyleSheet())
    new Formatter.ScriptFormatter(mimeType, content, callback);
  else
    new Formatter.ScriptIdentityFormatter(mimeType, content, callback);
};

/**
 * @param {!Array<number>} lineEndings
 * @param {number} lineNumber
 * @param {number} columnNumber
 * @return {number}
 */
Formatter.Formatter.locationToPosition = function(lineEndings, lineNumber, columnNumber) {
  const position = lineNumber ? lineEndings[lineNumber - 1] + 1 : 0;
  return position + columnNumber;
};

/**
 * @param {!Array<number>} lineEndings
 * @param {number} position
 * @return {!Array<number>}
 */
Formatter.Formatter.positionToLocation = function(lineEndings, position) {
  const lineNumber = lineEndings.upperBound(position - 1);
  let columnNumber;
  if (!lineNumber)
    columnNumber = position;
  else
    columnNumber = position - lineEndings[lineNumber - 1] - 1;
  return [lineNumber, columnNumber];
};

/**
 * @implements {Formatter.Formatter}
 * @unrestricted
 */
Formatter.ScriptFormatter = class {
  /**
   * @param {string} mimeType
   * @param {string} content
   * @param {function(string, !Formatter.FormatterSourceMapping)} callback
   */
  constructor(mimeType, content, callback) {
    content = content.replace(/\r\n?|[\n\u2028\u2029]/g, '\n').replace(/^\uFEFF/, '');
    this._callback = callback;
    this._originalContent = content;

    Formatter.formatterWorkerPool()
        .format(mimeType, content, Common.moduleSetting('textEditorIndent').get())
        .then(this._didFormatContent.bind(this));
  }

  /**
   * @param {!Formatter.FormatterWorkerPool.FormatResult} formatResult
   */
  _didFormatContent(formatResult) {
    const sourceMapping = new Formatter.FormatterSourceMappingImpl(
        this._originalContent.computeLineEndings(), formatResult.content.computeLineEndings(), formatResult.mapping);
    this._callback(formatResult.content, sourceMapping);
  }
};

/**
 * @implements {Formatter.Formatter}
 * @unrestricted
 */
Formatter.ScriptIdentityFormatter = class {
  /**
   * @param {string} mimeType
   * @param {string} content
   * @param {function(string, !Formatter.FormatterSourceMapping)} callback
   */
  constructor(mimeType, content, callback) {
    callback(content, new Formatter.IdentityFormatterSourceMapping());
  }
};

/**
 * @interface
 */
Formatter.FormatterSourceMapping = function() {};

Formatter.FormatterSourceMapping.prototype = {
  /**
   * @param {number} lineNumber
   * @param {number=} columnNumber
   * @return {!Array.<number>}
   */
  originalToFormatted(lineNumber, columnNumber) {},

  /**
   * @param {number} lineNumber
   * @param {number=} columnNumber
   * @return {!Array.<number>}
   */
  formattedToOriginal(lineNumber, columnNumber) {}
};

/**
 * @implements {Formatter.FormatterSourceMapping}
 * @unrestricted
 */
Formatter.IdentityFormatterSourceMapping = class {
  /**
   * @override
   * @param {number} lineNumber
   * @param {number=} columnNumber
   * @return {!Array.<number>}
   */
  originalToFormatted(lineNumber, columnNumber) {
    return [lineNumber, columnNumber || 0];
  }

  /**
   * @override
   * @param {number} lineNumber
   * @param {number=} columnNumber
   * @return {!Array.<number>}
   */
  formattedToOriginal(lineNumber, columnNumber) {
    return [lineNumber, columnNumber || 0];
  }
};

/**
 * @implements {Formatter.FormatterSourceMapping}
 * @unrestricted
 */
Formatter.FormatterSourceMappingImpl = class {
  /**
   * @param {!Array.<number>} originalLineEndings
   * @param {!Array.<number>} formattedLineEndings
   * @param {!Formatter.FormatterWorkerPool.FormatMapping} mapping
   */
  constructor(originalLineEndings, formattedLineEndings, mapping) {
    this._originalLineEndings = originalLineEndings;
    this._formattedLineEndings = formattedLineEndings;
    this._mapping = mapping;
  }

  /**
   * @override
   * @param {number} lineNumber
   * @param {number=} columnNumber
   * @return {!Array.<number>}
   */
  originalToFormatted(lineNumber, columnNumber) {
    const originalPosition =
        Formatter.Formatter.locationToPosition(this._originalLineEndings, lineNumber, columnNumber || 0);
    const formattedPosition =
        this._convertPosition(this._mapping.original, this._mapping.formatted, originalPosition || 0);
    return Formatter.Formatter.positionToLocation(this._formattedLineEndings, formattedPosition);
  }

  /**
   * @override
   * @param {number} lineNumber
   * @param {number=} columnNumber
   * @return {!Array.<number>}
   */
  formattedToOriginal(lineNumber, columnNumber) {
    const formattedPosition =
        Formatter.Formatter.locationToPosition(this._formattedLineEndings, lineNumber, columnNumber || 0);
    const originalPosition = this._convertPosition(this._mapping.formatted, this._mapping.original, formattedPosition);
    return Formatter.Formatter.positionToLocation(this._originalLineEndings, originalPosition || 0);
  }

  /**
   * @param {!Array.<number>} positions1
   * @param {!Array.<number>} positions2
   * @param {number} position
   * @return {number}
   */
  _convertPosition(positions1, positions2, position) {
    const index = positions1.upperBound(position) - 1;
    let convertedPosition = positions2[index] + position - positions1[index];
    if (index < positions2.length - 1 && convertedPosition > positions2[index + 1])
      convertedPosition = positions2[index + 1];
    return convertedPosition;
  }
};
