import AppKit
let app = Bundle.main.bundleURL
let runtime = app.appendingPathComponent("Contents/Resources/runtime")
let task = Process()
task.executableURL = runtime.appendingPathComponent("node/bin/node")
task.arguments = [runtime.appendingPathComponent("scripts/launch-film-space-lite.mjs").path]
let errors = Pipe()
task.standardError = errors
do {
 try task.run()
 task.waitUntilExit()
 if task.terminationStatus != 0 {
  let message = String(data: errors.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "启动失败"
  let alert = NSAlert(); alert.messageText = "Film Space Lite 启动失败"; alert.informativeText = message; alert.runModal()
 }
} catch {
 let alert = NSAlert(); alert.messageText = "Film Space Lite 启动失败"; alert.informativeText = error.localizedDescription; alert.runModal()
}
