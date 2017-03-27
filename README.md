![Betwixt](http://i.imgur.com/TKNRxnx.png)

[![Build Status](https://travis-ci.org/kdzwinel/betwixt.svg?branch=master)](https://travis-ci.org/kdzwinel/betwixt)
[![Dependency Status](https://david-dm.org/kdzwinel/betwixt.svg)](https://david-dm.org/kdzwinel/betwixt)

Betwixt will help you analyze web traffic outside the browser using familiar Chrome DevTools interface.

<p align="center"><img src="http://i.imgur.com/8uWwYoc.gif" alt="Betwixt in action" /></p>
<img src="http://i.imgur.com/9mvhdPq.png" alt="Even more Betwixt action!" />

## Installing

Download the [latest release](https://github.com/kdzwinel/betwixt/releases/latest) for your operating system, [build your own bundle](docs/building.md) or [run Betwixt from the source code](docs/building.md).

## Setting up

In order to capture traffic, you'll have to direct it to the proxy created by Betwixt in the background (`http://localhost:8008`).

If you wish to analyze traffic system wide:
- on OS X - `System Preferences → Network → Advanced → Proxies → Web Proxy (HTTP)`
- on Windows - `Settings → Network & Internet → Proxy`
- on Ubuntu - `All Settings → Network → Network Proxy`

![Setting up proxy on Windows 10 and OS X](http://i.imgur.com/ZVldO35.png)

If you want to capture traffic coming from a single terminal use `export http_proxy=http://localhost:8008`.

Capturing encrypted traffic (HTTPS) requires additional step, see [this doc](docs/https.md) for instructions.

## Contributing

All contributors are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) fore more details.

#### License [MIT](LICENSE.md)
