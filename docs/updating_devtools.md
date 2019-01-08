## Updating DevTools

1. Pull latest https://github.com/ChromeDevTools/devtools-frontend
1. Generate `InspectorBackendCommands.js`
    1. Not sure what's the best way but I generated `protocol.json` from source `ninja -C _build third_party/blink/renderer/core/inspector:protocol_version`
    1. and then used `python scripts/build/code_generator_frontend.py protocol.json --output_js_dir /tmp`
1. Patch original source code with required changes e.g.
    1. disable bunch of modules in `devtools_app.json`, `inspector.json` and `shell.js`
    1. add conext menu, file saving and clipboard support in `host/InspectorFrontendHost.js`
    1. hide some network panel options in `network/NetworkPanel.js`
    1. create connection with electron backend in `sdk/Connections.js`
    1. move missing settings from `sources/module.json` and `console/module.json` to `network/module.json` 
    1. implement context menu in `InspectorFrontendHost.js`
    1. disable soft menu in `ContextMenu.js`
    1. remove unwanted context menu items in `NetworkLogView.js`
    1. remove dataURL filtering from `NetworkLogView.js`
    1. remove ability to reload page from `/module.json`
    1. hide the top toolbar via `rootView.css`
    1. add welcome message to `NetworkLogView.js`

TODO:
- [x] use real context menu
- [x] remove stuff from context menu (clear browser cache)
- [x] make save har work
- [x] make open in new tab use real browser
- [?] fix blocking requests
- [x] default view settings (network panel open) + clearing those settings
- [x] welcome message
- [ ] make searching work
- [x] 'protocol' - undefined
- [x] make 'stop recording' work
- [x] Cannot read property '_setIcon' of undefined
- [x] staled -> TTFB
- [ ] https failures :(
- [x] hide tabs
- [ ] autoupdate
- [x] fix zooming
