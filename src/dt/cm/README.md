# Rolling CodeMirror

## What's this about?
CodeMirror is a third-party library, which supports editing experience in Chrome DevTools. DevTools does not fork CodeMirror, thus all CodeMirror patches should go upstream to http://codemirror.net.
Every once in a while, the CodeMirror dependency (which is located in Source/devtools/front_end/cm/ folder) should be updated to a newer version.

## Updating CodeMirror
This requires the following steps to be done:
1. File `headlesscodemirror.js` is a `runmode-standalone.js` file from CodeMirror distribution, but wrapped in `(function(window) { ... }(this))`
construction. This is needed to support in web workers.
2. File `markselection.js` is a `mark-selection.js` from CodeMirror distribution. The "dash" is removed due to the restriction on the chromium grd generator.
4. File codemirror.css contains both the default theme of CodeMirror and structural css required for it to work. Discard everything in the file up to the word `/* STOP */`.
3. All other files in front_end/cm/ folder should be substituted with their newer versions from the upstream.

## Testing
DevTools wrap CodeMirror via `CodeMirrorTextEditor.js` and `cmdevtools.css` files.
Although there are a couple of automated tests (web_tests/inspector/editor/) to verify overall sanity of the setup, a manual testing is mandatory before
landing a roll. Here is a rough testing scenario outline:
1. Create a new snippet and type in a small function with a few nested for-loops. (The author suggests a bubble-sort). Make sure that:
   * Words `function`, `for`, `var` are highlighted
   * "Smart braces" behavior works
   * "Enter" after opening curly brace adds correct indent
   * Autocompletion works
   * Multiple cursors functionality works as intended - Ctrl+D/Ctrl+U shortcuts
   * Set a breakpoint inside a function, select some text and summon a context menu over it.
2. Make sure there are items such as "Add to Watch", "Evaluate in Console" and "Copy/Paste"
Make sure minified jquery opens nicely in the editor (minified jquery could be found as a resource on http://jquery.com)
   * Verify `jquery.min.js` is formatted via "Pretty print" action
3. Go to the Elements panel, select a node and verify the "Edit it as HTML" command works.

## Committing
The only changes allowed to front_end/cm/ folder are CodeMirror rolls. There's a presubmit check that enforces this, so make sure you include the phrase "roll CodeMirror" into
your patch description.

## Example
Example CodeMirror roll patchset: https://codereview.chromium.org/273763003
