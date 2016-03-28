## Reporting issues and requesting feature

Please make sure that the issue has not been already reported.

Take time to include as much details as needed to reproduce your problem or justify your request.

Remember that reports are great, but Pull Requests are *so much more awesome*.

## How Betwixt works

Betwixt is an [Electron](http://electron.atom.io/) app that runs a custom Chrome DevTools instance in the frontend and a proxy server in the backend. Backend talks to the frontend over a websocket connection using [Remote Debugging Protocol](https://developer.chrome.com/devtools/docs/debugger-protocol). Proxy server is responsible for capturing traffic and pushing it to the frontend.

## Main goals of the project

Betwixt should nail these two things:

- Capture information about all passing traffic as accurately and transparently as possible (avoid modifying requests, responses and timing).
- Format valid Remote Debugging Protocol messages based on the gathered network information and pass them to the frontend.

DevTools will do the rest.

## Folder structure

- `/src` - Betwixt source files
- `/src/dt` - customized snapshot of Chrome DevTools
- `/src/main.js` - app entry point

## Tips and tricks

All messages sent between backend and frontend can be explored using [Remote Debugging Protocol Viewer](https://chromedevtools.github.io/debugger-protocol-viewer/). However, since some details are not documented, you may want to see how "regular" DevTools are doing things by sniffing the protocol ([as explained in the "Sniffing the protocol" section](https://developer.chrome.com/devtools/docs/debugger-protocol)).

## Versioning

Let's do the [semver](http://semver.org/) thing.

## Testing

`npm test`. ATM it will only run `jshint` and `jscs`. It might be a bit to late for the TDD thing, but tests are still welcome.