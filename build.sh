#!/bin/bash

# clean up after last build
rm -rf build/
rm -rf bin/

mkdir build/
mkdir bin/

# move files required by production app to the /build folder
cp -r src/ build/src/
cp package.json build/

# install all dependencies
cd build/
npm i --production
cd ..

# build packages for all supported OS versions
electron-packager ./build/ Betwixt --out ./bin/ --version=0.36.12 --platform=all --arch=all
