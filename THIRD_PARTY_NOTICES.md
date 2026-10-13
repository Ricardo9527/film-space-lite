# Third-party software

Film Space Lite's own code is MIT licensed. Third-party code retains its own licenses.

- Three.js: MIT; license in `director-console/vendor/three/LICENSE`.
- Node.js v24.18.0: MIT plus bundled dependency notices, included in each runtime's Node LICENSE. Source: https://nodejs.org/dist/v24.18.0/node-v24.18.0.tar.xz
- macOS FFmpeg 8.1.1: GPL-3.0-or-later, with codec libraries listed in `third-party/sources.json`. Installed Homebrew build recipes and available notices are under `third-party/macos`.
- Windows FFmpeg 8.1.3-14-g330caae0c1: GPL build from BtbN/FFmpeg-Builds. Exact FFmpeg revision and pinned dependency source locations are in `third-party/sources.json`; build scripts and patches are under `third-party/windows-build-recipes`.

FFmpeg is invoked as a separate executable. Its GPL license does not replace the license of Film Space Lite's own source. Retain all runtime notices when redistributing.

The source manifest identifies the upstream source locations and exact revisions used by the bundled components. The accompanying build recipes include dependency download instructions, build flags and patches. Sources retain their original licenses. Binary runtime checksums and versions are in `native/lite/runtime-lock.json`.
