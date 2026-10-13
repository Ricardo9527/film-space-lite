# Film Space Lite

本地运行的轻量镜头预演工具：MCP 搭景 → 抽象人走位与姿态 → 机位与运镜 → 网页预演 → MP4。

## 下载安装

从 [Releases](https://github.com/Ricardo9527/film-space-lite/releases) 下载完整安装包。

- **Apple Silicon Mac**：解压 App，拖入 Applications，双击启动。包为 ad-hoc 签名，尚未经过 Apple 公证。
- **Windows 11 x64**：解压整个目录，运行 `安装到本机.cmd`；也可直接运行 `Film Space Lite.exe`。**Windows 实机验证待完成。**

安装包携带 Node.js 与 FFmpeg。图标启动本地服务并打开默认浏览器；服务仅监听 127.0.0.1，自动选择空闲端口。网页关闭后服务继续运行，可在 Edit 顶栏退出服务。

## 功能

抽象人、多人物走位与平滑姿态帧、基础几何搭景、GLB 导入、参考图与布景贴图、静态机位、镜头关键帧、时间线、撤销、项目保存与 MP4 导出。导出固定 1080 像素短边，支持横屏、竖屏及多种画幅。

[使用说明](docs/work/film-space-lite-guide.md) · [MCP 插件](plugins/film-space-lite/README.md)

首次启动会在本机 Film Space Lite 数据目录生成 MCP 插件及 `MCP/mcp-config.json`，可接入支持 MCP 的客户端。MP4 从网页启动。

## 从源码运行

需要 Node.js 24 或更新版本，以及 PATH 中可用的 FFmpeg（含 libx264 编码器），也可通过 `FILM_SPACE_FFMPEG` 指定其绝对路径。浏览器端使用仓库自带的 Three.js，无需安装 npm 依赖。

```sh
git clone https://github.com/Ricardo9527/film-space-lite.git
cd film-space-lite
npm start
```

Windows 从源码运行可使用 `node scripts/launch-film-space-lite.mjs --no-open`，手动打开命令输出的网址。原生文件夹选择需要安装包提供的 `Film Space Lite.exe` 位于仓库根目录。

```sh
npm test
```

## 打包

当前安装包在 macOS Apple Silicon 上组装，需 Xcode Command Line Tools。Mac 打包复用已安装 Lite 包中校验匹配的 Node/FFmpeg：

```sh
node scripts/build-film-space-lite.mjs --target mac
```

Windows 交叉打包还需要 `--windows-deps` 指定的 Node/FFmpeg 解压文件、.NET SDK、Roslyn 和 .NET Framework 4.8 引用程序集；精确版本与压缩包校验值见 `native/lite/runtime-lock.json`，目录结构见构建脚本。输出位于 `Builds.noindex/Film-Space-Lite`。Windows 构建与真实 Windows 验收是两个独立步骤。

## 状态与许可

首版为预览版本。Mac/Chrome 核心流程已验证；Windows 11、Safari/Edge 和低内存目标机器仍待验证，不承诺最低配置。项目使用独立 `.filmspace-lite` 格式。

自有源码采用 [MIT](LICENSE)。第三方依赖见 [许可与源码信息](THIRD_PARTY_NOTICES.md)。
