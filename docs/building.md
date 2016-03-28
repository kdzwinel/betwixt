## Building

### Setup

To clone and run this repository you'll need [Git](https://git-scm.com) and [Node.js 4.x+](https://nodejs.org/en/download/) (which comes with [npm](http://npmjs.com)) installed on your computer. From your command line:

```bash
# Clone this repository
$ git clone https://github.com/kdzwinel/betwixt.git
# Go into the repository
$ cd betwixt
# Install dependencies
$ npm install
```

### Running

You can run Betwixt right away using `npm start`.

### Command line configuration options

- `--proxy-port` - change the default port for proxy
- `--ssl-ca-dir` - change the default directory where auto-generated SSL certificates are kept

Example usage: `npm start -- --proxy-port=1234 --ssl-ca-dir="/Users/kdzwinel/Documents/betwixt-certs"`

### Creating a bundle

[build.sh](https://github.com/kdzwinel/betwixt/blob/master/build.sh) is responsible for creating bundles for all supported platforms and architectures. You should be able to easily adjust it to your needs.
