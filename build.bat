:: clean up after last build
rmdir /s /q "build/"
rmdir /s /q "bin/"

mkdir -p build\src
mkdir -p bin

:: move files required by production app to the /build folder
xcopy src build\src\ /E/H
xcopy gfx build\gfx\ /E/H
copy /B /Y "package.json" "build\package.json"

:: install all dependencies
cd build
npm i --production
cd ..

:: build packages for all supported OS versions
electron-packager ./build/ Betwixt --out ./bin/ --version=0.36.12 --platform=all --arch=all --icon=./gfx/icon
