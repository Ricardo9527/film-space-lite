# Film Space Lite

本地运行的轻量镜头预演工具：MCP 搭景 → 抽象人走位与姿态 → 机位与运镜 → 网页预演 → MP4。

## 下载安装

从 [Releases](https://github.com/Ricardo9527/film-space-lite/releases) 下载完整安装包。

- **Apple Silicon Mac**：解压 App，拖入 Applications，双击启动。包为 ad-hoc 签名，尚未经过 Apple 公证。
- **Windows 11 x64**：解压整个目录，运行 `安装到本机.cmd`；也可直接运行 `Film Space Lite.exe`。**Windows 实机验证待完成。**

安装包携带 Node.js 与 FFmpeg。图标启动本地服务并打开默认浏览器；服务仅监听 127.0.0.1，自动选择空闲端口。网页关闭后服务继续运行，可在 Edit 顶栏退出服务。

## Agent 安装指南

可以把下面这句话交给本机 Agent：

> 请按照这个仓库 README 的 Agent 安装指南，识别我的系统，安装对应的 Film Space Lite 发布版，并接入当前客户端的 MCP。保留已有项目和其他 MCP 配置，完成启动及 MCP 验证后报告结果。

Agent 在用户要求安装或配置时执行以下流程。默认使用自包含发布包；源码运行适合开发。安装范围是本机桌面环境，MCP 使用本地 **stdio**，需要客户端支持启动本地进程。

### 1. 识别系统与现有安装

| 系统 | 检查方式 | Release 资产名 | 正式安装目录 |
| --- | --- | --- | --- |
| macOS 12+、Apple Silicon | `sw_vers -productVersion`；`uname -m`。若终端运行在 Rosetta 下，再检查 `sysctl -in hw.optional.arm64` | `Film.Space.Lite.app.zip` | `/Applications/Film Space Lite.app` |
| Windows 11、x64 | PowerShell：`Get-CimInstance Win32_OperatingSystem`；`[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture` | `Film.Space.Lite.Windows.11.x64.zip` | `%LOCALAPPDATA%\Programs\Film Space Lite` |

Intel Mac、Windows ARM 和 Linux 当前没有对应发布包。遇到这些平台先报告实际平台与缺少的包，不安装其他架构的包。WSL 或远程 Agent 需要切到运行桌面客户端的 Windows/macOS 主机执行本流程。

检查正式安装目录和下文的数据目录。已有同版本安装时直接验证并接入 MCP；升级前在现有网页点击“退出服务”，等待服务完成保存并退出。用户项目在数据目录的 `Projects` 中，更新只替换程序文件。

### 2. 选择发布版、下载并校验

从 [GitHub Releases API](https://api.github.com/repos/Ricardo9527/film-space-lite/releases) 读取发布列表；用户指定版本时使用 `/releases/tags/<版本>`。未指定版本时按 `published_at` 选择最新非草稿发布，**包含预览版**。当前有用的发行版可能全部是 prerelease，不能只查 `/releases/latest`。

读取所选发布的 `assets`，按上表准确匹配包名，并取同一发布的 `SHA256SUMS.txt`。使用各资产的 `browser_download_url` 下载。若已安装 `gh`，也可用 `gh release download <版本> --repo Ricardo9527/film-space-lite --pattern <资产名> --dir <下载目录>`。使用 ZIP 安装资产，不使用 GitHub 自动生成的 Source code ZIP。

先核对安装包的 SHA-256 与 `SHA256SUMS.txt` 中对应资产名完全一致：Mac 用 `shasum -a 256 <文件>`，Windows 用 `Get-FileHash -Algorithm SHA256 <文件>`。缺少资产或校验不一致就停止并报告。安装包已包含 Node/FFmpeg，无需另装这两个运行时。

将所选 ZIP 保存为仓库内以下路径，供后续命令使用：

- Mac：`Builds.noindex/Film-Space-Lite/Film Space Lite.app.zip`
- Windows：`Builds.noindex/Film-Space-Lite/Film Space Lite Windows 11 x64.zip`

### 3. 安装并首次启动

**Mac**：在仓库根目录执行。使用已校验包内的 Node 调用仓库现有安装器；安装器核对 App 身份、签名和运行时文件，失败会恢复原 App。

```sh
(
  set -eu
  lite_stage=$(mktemp -d "${TMPDIR:-/tmp}/film-space-lite-install.XXXXXX")
  trap 'rm -rf "$lite_stage"' EXIT
  /usr/bin/ditto -x -k 'Builds.noindex/Film-Space-Lite/Film Space Lite.app.zip' "$lite_stage"
  "$lite_stage/Film Space Lite.app/Contents/Resources/runtime/node/bin/node" scripts/install-film-space-lite-macos.mjs
  /usr/bin/open '/Applications/Film Space Lite.app'
)
```

完整 App 的临时副本在结束时清理，长期保留发布 ZIP。若系统阻止这个尚未公证的 App 打开，让用户完成 macOS 的应用打开确认后继续，不关闭系统安全检查。

**Windows**：在仓库根目录用 PowerShell 执行。包内安装脚本复制到当前用户程序目录、创建桌面快捷方式并启动 App。

```powershell
$ErrorActionPreference = 'Stop'
$liteStage = Join-Path ([IO.Path]::GetTempPath()) ('film-space-lite-install-' + [guid]::NewGuid())
try {
    Expand-Archive -LiteralPath 'Builds.noindex/Film-Space-Lite/Film Space Lite Windows 11 x64.zip' -DestinationPath $liteStage
    & (Join-Path $liteStage 'Film Space Lite\安装到本机.cmd')
    if ($LASTEXITCODE -ne 0) { throw "Lite 安装脚本失败：$LASTEXITCODE" }
} finally {
    if (Test-Path -LiteralPath $liteStage) { Remove-Item -LiteralPath $liteStage -Recurse -Force }
}
```

首次启动后，等待本地服务和生成配置就绪；通常数秒。失败时读取数据目录的 `Logs/director-console.log`，保留具体错误。

### 4. 接入当前客户端的 MCP

| 文件 | Mac | Windows |
| --- | --- | --- |
| 数据目录 | `~/Library/Application Support/Film Space Lite` | `%LOCALAPPDATA%\Film Space Lite` |
| 生成配置 | 数据目录下 `MCP/mcp-config.json` | 数据目录下 `MCP\mcp-config.json` |
| 本地插件目录 | 数据目录下 `MCP/film-space-lite` | 数据目录下 `MCP\film-space-lite` |
| 服务登记文件 | 数据目录下 `director-service.json` | 数据目录下 `director-service.json` |

若使用了 `FILM_SPACE_LITE_DATA_DIR`，以该环境变量指定的数据目录为准。读取**本次启动生成的** `mcp-config.json`，取 `mcpServers.film_space_lite_mcp` 中的 `command`、`args`、`cwd` 和 `env`；这些值已指向本机安装路径及包内 Node。

- 支持 JSON MCP 配置的客户端：将 `film_space_lite_mcp` 条目合并到现有配置，保留其他服务器；有同名条目时更新该条目。
- 支持本地插件的客户端：可添加上表的本地插件目录，获得 MCP 与配套 Skill。插件与独立 MCP 二选一，避免重复注册同一组工具。
- 客户端使用其他配置格式：按字段映射，保持参数数组和两个环境变量完整。`start-mcp.mjs` 会自行切到插件目录。

这是一项本地 stdio MCP。网页 URL 和动态服务端口不是 HTTP MCP 接入地址。仓库中的 `.mcp.json` 用于源码插件结构；实际安装优先使用生成配置，避免依赖全局 Node 或当前工作目录。

**Codex 示例**：CLI 注册方式见 [官方 MCP 文档](https://developers.openai.com/codex/mcp)。先用 `codex mcp list` 检查是否已有同名接入，避免和插件重复。以下命令适用于默认数据目录，路径来自已生成配置。

Mac（无需全局 Node）：

```sh
'/Applications/Film Space Lite.app/Contents/Resources/runtime/node/bin/node' --input-type=module - "$HOME/Library/Application Support/Film Space Lite/MCP/mcp-config.json" <<'NODE'
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const entry = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).mcpServers.film_space_lite_mcp;
const args = ['mcp', 'add', 'film_space_lite_mcp'];
for (const [key, value] of Object.entries(entry.env)) args.push('--env', `${key}=${value}`);
args.push('--', entry.command, ...entry.args);
const result = spawnSync('codex', args, {stdio: 'inherit'});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
NODE
```

Windows PowerShell：

```powershell
$liteConfig = Join-Path $env:LOCALAPPDATA 'Film Space Lite\MCP\mcp-config.json'
$entry = (Get-Content -LiteralPath $liteConfig -Raw | ConvertFrom-Json).mcpServers.film_space_lite_mcp
$liteArgs = @('mcp', 'add', 'film_space_lite_mcp')
foreach ($property in $entry.env.PSObject.Properties) {
    $liteArgs += @('--env', "$($property.Name)=$($property.Value)")
}
$liteArgs += @('--', $entry.command) + @($entry.args)
& codex @liteArgs
if ($LASTEXITCODE -ne 0) { throw "Codex MCP 注册失败：$LASTEXITCODE" }
```

如果当前客户端不在 PATH，用它的实际 CLI 路径或原生 MCP 设置入口。配置保存后按客户端要求重新连接 MCP；旧聊天没有自动发现新工具时，新建聊天再检查。云端聊天只有在能访问这台主机并运行本地进程时才可使用此接入。

### 5. 验收后再报告完成

1. 从 `director-service.json` 读取当前 `port` 和 `pid`，请求 `http://127.0.0.1:<port>/health`；确认 `status=ok`、`service=film-space-lite`，端口及 PID 与登记文件一致。不要把端口写死。
2. 确认网页可打开，程序来自正式安装目录。Mac 的版本见 App `Contents/Info.plist`；两平台运行时都有 `runtime-build.json` 可用于核对包内文件。
3. 从客户端执行 MCP `tools/list`，然后调用 `get_film_space_service_status` 和 `list_film_space_projects`。新安装没有项目时，空列表是正常结果。无需为了验收新建或改写用户项目。
4. 报告选用的 Release、系统/架构、安装位置、MCP 客户端、连接结果及具体阻塞。只有文件已写入但客户端尚未重连时，报告“配置已生成/写入，连接待验证”。

以后升级沿用同一路径：保存并退出服务 → 校验新包 → 更新正式安装 → 启动生成新配置 → 同步客户端 MCP 条目并验证。移动安装位置后也需重新生成并接入配置。

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

## 软件更新

打开软件后，后台会检查并下载对应平台的完整更新包，顶部显示下载进度。下载校验完成后，所有页面已保存且连续五分钟没有操作、播放、导出等工作结束后会静默更新。正常关闭全部页面后，服务经过三十秒安静期也可完成更新。刷新和临时断线会等待页面重新连接确认。

需要马上安装时，在提示或帮助中点击「立即更新」。先保存当前编辑和机位草稿；其他页面也需空闲。更新过程中暂时锁定编辑，完成后自动重启并回到项目。项目数据保存在原位置。网络、权限或启动失败会显示具体原因，安装替换失败时恢复旧版；手动检查可重试。帮助保留版本、手动检查、更新说明与发布页入口。

先安装带自动更新功能的版本，后续发布即可后台下载和空闲安装。源码运行使用发布页手动安装。
