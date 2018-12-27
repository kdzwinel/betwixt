// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @implements {TextEditor.CodeMirrorMimeMode}
 */
CmModes.DefaultCodeMirrorMimeMode = function()
{
}

CmModes.DefaultCodeMirrorMimeMode.prototype = {
    /**
     * @param {!Runtime.Extension} extension
     * @override
     */
    install: function(extension)
    {
        var modeFileName = extension.descriptor()["fileName"];
        var modeContent = extension.module().resource(modeFileName);
        self.eval(modeContent + "\n//# sourceURL=" + modeFileName);
    }
}
