/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008, 2009 Anthony Ricaud <rik@webkit.org>
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

Network.HARWriter = class {
  /**
   * @param {!Common.OutputStream} stream
   * @param {!Array.<!SDK.NetworkRequest>} requests
   * @param {!Common.Progress} progress
   * @return {!Promise}
   */
  static async write(stream, requests, progress) {
    const compositeProgress = new Common.CompositeProgress(progress);

    const content = await Network.HARWriter._harStringForRequests(requests, compositeProgress);
    if (progress.isCanceled())
      return Promise.resolve();
    return Network.HARWriter._writeToStream(stream, compositeProgress, content);
  }

  /**
   * @param {!Array<!SDK.NetworkRequest>} requests
   * @param {!Common.CompositeProgress} compositeProgress
   * @return {!Promise<string>}
   */
  static async _harStringForRequests(requests, compositeProgress) {
    const progress = compositeProgress.createSubProgress();
    progress.setTitle(Common.UIString('Collecting content\u2026'));
    progress.setTotalWork(requests.length);

    const harLog = await SDK.HARLog.build(requests);
    const promises = [];
    for (let i = 0; i < requests.length; i++) {
      const promise = requests[i].contentData();
      promises.push(promise.then(contentLoaded.bind(null, harLog.entries[i])));
    }

    await Promise.all(promises);
    progress.done();

    if (progress.isCanceled())
      return '';
    return JSON.stringify({log: harLog}, null, Network.HARWriter._jsonIndent);

    function isValidCharacter(code_point) {
      // Excludes non-characters (U+FDD0..U+FDEF, and all codepoints ending in
      // 0xFFFE or 0xFFFF) from the set of valid code points.
      return code_point < 0xD800 || (code_point >= 0xE000 && code_point < 0xFDD0) ||
          (code_point > 0xFDEF && code_point <= 0x10FFFF && (code_point & 0xFFFE) !== 0xFFFE);
    }

    function needsEncoding(content) {
      for (let i = 0; i < content.length; i++) {
        if (!isValidCharacter(content.charCodeAt(i)))
          return true;
      }
      return false;
    }

    /**
     * @param {!Object} entry
     * @param {!SDK.NetworkRequest.ContentData} contentData
     */
    function contentLoaded(entry, contentData) {
      progress.worked();
      let encoded = contentData.encoded;
      if (contentData.content !== null) {
        let content = contentData.content;
        if (content && !encoded && needsEncoding(content)) {
          content = content.toBase64();
          encoded = true;
        }
        entry.response.content.text = content;
      }
      if (encoded)
        entry.response.content.encoding = 'base64';
    }
  }

  /**
   * @param {!Common.OutputStream} stream
   * @param {!Common.CompositeProgress} compositeProgress
   * @param {string} fileContent
   * @return {!Promise}
   */
  static async _writeToStream(stream, compositeProgress, fileContent) {
    const progress = compositeProgress.createSubProgress();
    progress.setTitle(Common.UIString('Writing file\u2026'));
    progress.setTotalWork(fileContent.length);
    for (let i = 0; i < fileContent.length && !progress.isCanceled(); i += Network.HARWriter._chunkSize) {
      const chunk = fileContent.substr(i, Network.HARWriter._chunkSize);
      await stream.write(chunk);
      progress.worked(chunk.length);
    }
    progress.done();
  }
};

/** @const */
Network.HARWriter._jsonIndent = 2;

/** @const */
Network.HARWriter._chunkSize = 100000;
