using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
using System.Text;
internal static class FilmSpaceLite {
 [STAThread] static int Main(string[] args) {
  Application.EnableVisualStyles();
  try {
   if(args.Length>0 && args[0]=="--select-folder") {
    using(var dialog=new FolderBrowserDialog()){dialog.Description="选择 MP4 输出文件夹";dialog.ShowNewFolderButton=true;if(args.Length>1 && Directory.Exists(args[1]))dialog.SelectedPath=args[1];if(dialog.ShowDialog()==DialogResult.OK){using(var output=new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false))){output.Write(dialog.SelectedPath);}}}return 0;
   }
   if(args.Length==2 && args[0]=="--open-url"){Process.Start(new ProcessStartInfo(args[1]){UseShellExecute=true});return 0;}
   var root=AppDomain.CurrentDomain.BaseDirectory;
   var start=new ProcessStartInfo(Path.Combine(root,"node","node.exe"),"\""+Path.Combine(root,"scripts","launch-film-space-lite.mjs")+"\""){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true};
   using(var task=Process.Start(start)){string errors=task.StandardError.ReadToEnd();task.WaitForExit();if(task.ExitCode!=0)throw new Exception(errors);}
   return 0;
  }catch(Exception error){MessageBox.Show(error.Message,"Film Space Lite 启动失败",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
}
