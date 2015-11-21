# Betwixt

This tool will help you analyze web traffic outside the browser using familiar Chrome DevTools interface.

![Betwixt in action](http://i.imgur.com/ccgmL2C.gif)

**This project is in an early stage of development, things may break, values may not be accurate. All contributors are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) fore more details.**

## How To Use

To clone and run this repository you'll need [Git](https://git-scm.com) and [Node.js 5.x](https://nodejs.org/en/download/) (which comes with [npm](http://npmjs.com)) installed on your computer. From your command line:

```bash
# Clone this repository
$ git clone https://github.com/kdzwinel/betwixt.git
# Go into the repository
$ cd betwixt
# Install dependencies and run the app
$ npm install && npm start
```

In order to capture traffic, you'll have to direct it to the proxy created by Betwixt in the background (`http://localhost:8008`).

If you wish to analyze traffic system wide:
- on OS X - `System Preferences → Network → Advanced → Proxies → Web Proxy (HTTP)`
- on Ubuntu - `All Settings → Network → Network Proxy`
- on Windows - `PC Settings → Network → Proxy`

![Setting up proxy on OS X](http://i.imgur.com/A8qPJ4F.png)

If you want to capture traffic coming from a single terminal (e.g. wget, npm) use `export http_proxy=http://localhost:8008`.

#### License [MIT](LICENSE.md)
