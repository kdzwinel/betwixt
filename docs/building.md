## Building

### Setup

To clone and run this repository you'll need [Git](https://git-scm.com) and [Node.js 4.x+](https://nodejs.org/en/download/) (which comes with [npm](http://npmjs.com)) installed on your computer. From your command line:

```bash
# Clone this repository
$ git clone https://github.com/kdzwinel/betwixt.git
# Go into the repository
$ cd betwixt
# Install nodeJS dependencies
$ npm install
```

You can run Betwixt right away using `npm start` or create a bundle.

### Bundles

To create bundles you should use included npm build scripts.

#### Linux

```bash
npm run build:linux
```

The output directory is `betwixt-bin/Betwixt-linux-x64`.

#### Mac OS X

```bash
npm run build:osx
```

The output directory is `betwixt-bin/Betwixt-darwin-x64`.

#### Windows

```bash
npm run build:win
```

It generates two directories, for 32 and 64 bits architectures. The folders are `betwixt-bin/Betwixt-win32-ia32` or `betwixt-bin/Betwixt-win32-x64`

#### Custom build

If none of above builds meets your requirements, you can use the custom build script.


```bash
npm run build:custom -- --platform=<all, linux, darwin, win32> --arch=<all, x86, x64>
```

Adjust `platform` and `arch` parameters to your needs.

For example, if you want to build a binary for windows 32 bits only, you can run `npm run build:custom -- --platform=win32 --arch=x86`.
