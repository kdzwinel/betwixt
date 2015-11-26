# Betwixt

This tool will help you analyze web traffic outside the browser using familiar Chrome DevTools interface.

![Betwixt in action](http://i.imgur.com/ccgmL2C.gif)

**This project is in an early stage of development, things may break, values may not be accurate. All contributors are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) fore more details.**

## How To Use

To clone and run this repository you'll need [Git](https://git-scm.com) and [Node.js 5.x](https://nodejs.org/en/download/) (which comes with [npm](http://npmjs.com)) installed on your computer. From your command line:

### How To Install

```bash
# Clone this repository
$ git clone https://github.com/kdzwinel/betwixt.git
# Go into the repository
$ cd betwixt
# Install nodeJS dependencies
$ npm install
# Build your the package application
```

### Build application to your system

There are a few build scripts included in the `package.json` that allows you to create some binaries/bundles to your operating system.

The files created by the following scripts are placed in a folder inside the `bin` folder.

So in your command line:

* change to the directory where you clone this repository
* run one (or more) of the options below

#### Linux

```bash
npm run build:linux
```

The output directory is `bin/Betwixt-linux-x64`

#### Mac OS X

```bash
npm run build:osx
```

The output directory is `bin/Betwixt-darwin-x64`

#### Windows

```bash
npm run build:win
```

It generates two directories, for 32 and 64 bits architectures. The folders are `bin/Betwixt-win32-ia32` or `bin/Betwixt-win32-x64`

#### Custom build

```bash
npm run build:custom -- --platform=<all, linux, darwin, win32> --arch=<all, x86, x64>
```

If none of this builds mets your requirements, you can use the custom build script.
You can send the `platform` and `arch` that you want to build. 

So for example, if you want to build a binary for windows 32 bits only, you can run `npm run build:custom -- --platform=win32 --arch=x86`

## Setting up

In order to capture traffic, you'll have to direct it to the proxy created by Betwixt in the background (`http://localhost:8008`).

If you wish to analyze traffic system wide:
- on OS X - `System Preferences → Network → Advanced → Proxies → Web Proxy (HTTP)`
- on Ubuntu - `All Settings → Network → Network Proxy`
- on Windows - `PC Settings → Network → Proxy`

![Setting up proxy on OS X](http://i.imgur.com/A8qPJ4F.png)

If you want to capture traffic coming from a single terminal (e.g. wget, npm) use `export http_proxy=http://localhost:8008`.

#### License [MIT](LICENSE.md)
