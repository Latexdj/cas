package expo.modules.lmfs

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

// Learning materials live in the app's own external folder
// (Android/data/com.cas.student/files/LM) so they can also be copied in by USB.
// expo-file-system only lets the app write there to files and folders that
// already exist, so it can't create the LM folder or move a finished download
// into place. These two calls do that, and only inside the app's own folder.
class LmFsModule : Module() {
  private fun root(): File {
    val ctx = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    return (ctx.getExternalFilesDir(null) ?: throw IllegalStateException("No app storage")).canonicalFile
  }

  private fun inside(path: String): File {
    val f = File(path.removePrefix("file://")).canonicalFile
    val r = root()
    if (f != r && !f.path.startsWith(r.path + File.separator)) throw IllegalArgumentException("Outside the app folder")
    return f
  }

  override fun definition() = ModuleDefinition {
    Name("LmFs")

    // Creates the folder and any missing parents. True when it exists afterwards.
    Function("mkdirs") { path: String ->
      val d = inside(path)
      d.isDirectory || d.mkdirs()
    }

    // Moves a file, replacing what is there. Falls back to copy and delete.
    Function("move") { from: String, to: String ->
      val a = inside(from); val b = inside(to)
      b.parentFile?.mkdirs()
      if (b.exists()) b.delete()
      if (a.renameTo(b)) true else {
        a.copyTo(b, overwrite = true)
        a.delete()
        true
      }
    }
  }
}
