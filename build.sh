#!/bin/bash

# clean up after last build
rm -rf build/
rm -rf bin/

mkdir build/
mkdir bin/

# move files required by production app to the /build folder
cp -r dt/ build/dt/
cp -r lib/ build/lib/
cp main.js build/
cp package.json build/

# install all dependencies
cd build/
npm i --production
cd ..

# build packages for all supported OS versions
electron-packager ./build/ Betwixt --out ./bin/ --version=0.35.0 --platform=all --arch=all