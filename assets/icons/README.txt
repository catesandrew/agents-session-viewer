Codex Session Viewer – macOS icon assets

This folder contains three icon options for your Electron + Next.js app:

- codex-chat.icns / codex-chat.png
- codex-search.icns / codex-search.png
- codex-brackets.icns / codex-brackets.png

Recommended default: codex-search.icns (reads well and communicates "search/viewer").

How to use (general Electron packaging):

1) Pick one of the .icns files and copy it into your project, e.g.
   assets/icons/icon.icns

2) Point your packager/builder at it.

Electron Builder (package.json):
  "build": {
    "mac": {
      "icon": "assets/icons/icon.icns"
    }
  }

Electron Forge (forge.config.*):
  packagerConfig: {
    icon: "assets/icons/icon"   // omit extension; Forge uses .icns on macOS
  }

If you only have the PNG and want to generate an ICNS on macOS manually:
  mkdir MyIcon.iconset
  sips -z 16 16     icon.png --out MyIcon.iconset/icon_16x16.png
  sips -z 32 32     icon.png --out MyIcon.iconset/icon_16x16@2x.png
  sips -z 32 32     icon.png --out MyIcon.iconset/icon_32x32.png
  sips -z 64 64     icon.png --out MyIcon.iconset/icon_32x32@2x.png
  sips -z 128 128   icon.png --out MyIcon.iconset/icon_128x128.png
  sips -z 256 256   icon.png --out MyIcon.iconset/icon_128x128@2x.png
  sips -z 256 256   icon.png --out MyIcon.iconset/icon_256x256.png
  sips -z 512 512   icon.png --out MyIcon.iconset/icon_256x256@2x.png
  sips -z 512 512   icon.png --out MyIcon.iconset/icon_512x512.png
  sips -z 1024 1024 icon.png --out MyIcon.iconset/icon_512x512@2x.png
  iconutil -c icns MyIcon.iconset

