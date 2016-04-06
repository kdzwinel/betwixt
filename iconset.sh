!#/bin/sh

mkdir gfx/icon.iconset
sips -z 16 16     gfx/icon.png --out gfx/icon.iconset/icon_16x16.png
sips -z 32 32     gfx/icon.png --out gfx/icon.iconset/icon_16x16@2x.png
sips -z 32 32     gfx/icon.png --out gfx/icon.iconset/icon_32x32.png
sips -z 64 64     gfx/icon.png --out gfx/icon.iconset/icon_32x32@2x.png
sips -z 128 128   gfx/icon.png --out gfx/icon.iconset/icon_128x128.png
sips -z 256 256   gfx/icon.png --out gfx/icon.iconset/icon_128x128@2x.png
sips -z 256 256   gfx/icon.png --out gfx/icon.iconset/icon_256x256.png
sips -z 512 512   gfx/icon.png --out gfx/icon.iconset/icon_256x256@2x.png
sips -z 512 512   gfx/icon.png --out gfx/icon.iconset/icon_512x512.png
cp gfx/icon.png gfx/icon.iconset/icon_512x512@2x.png
iconutil -c icns gfx/icon.iconset
rm -R gfx/icon.iconset
