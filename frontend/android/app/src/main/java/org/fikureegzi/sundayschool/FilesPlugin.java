package org.fikureegzi.sundayschool;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Saves a file the page made (a member's QR, an Excel template, a sheet). The
 * web view ignores download links, so the web side calls this instead
 * (src/lib/download.ts). On Android 10 and later images go to Pictures and
 * other files to Downloads, each in a «Fikure Egzi» folder, with no permission
 * needed; older Android has no such folder without a permission, so the file
 * is handed to the share screen, where it can be saved or sent.
 */
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {

    private static final String FOLDER = "Fikure Egzi";

    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data");
        String mime = call.getString("mimeType", "application/octet-stream");
        if (name == null || name.isEmpty() || data == null) {
            call.reject("A file name and its contents are needed.");
            return;
        }
        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("The file could not be read.");
            return;
        }
        String fileName = name.replaceAll("[\\\\/:*?\"<>|]+", " ").trim();
        new Thread(() -> {
            try {
                JSObject result = new JSObject();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    result.put("location", saveToShared(fileName, mime, bytes));
                } else {
                    share(fileName, mime, bytes);
                    result.put("location", "shared");
                }
                call.resolve(result);
            } catch (Exception e) {
                call.reject("The file could not be saved.", e);
            }
        }).start();
    }

    /** Android 10+: into Pictures (images) or Downloads (anything else), visible in the Gallery / Files apps. */
    private String saveToShared(String name, String mime, byte[] bytes) throws IOException {
        boolean image = mime.startsWith("image/");
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(
            MediaStore.MediaColumns.RELATIVE_PATH,
            (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/" + FOLDER
        );
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri collection = image
            ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri uri = resolver.insert(collection, values);
        if (uri == null) throw new IOException("Could not create the file.");
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IOException("Could not open the file.");
            out.write(bytes);
        } catch (IOException e) {
            resolver.delete(uri, null, null);
            throw e;
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return image ? "pictures" : "downloads";
    }

    /** Older Android: through the share screen (save to Drive, Files, Telegram…). */
    private void share(String name, String mime, byte[] bytes) throws IOException {
        File dir = new File(getContext().getCacheDir(), "shared");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Could not prepare the file.");
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        Intent send = new Intent(Intent.ACTION_SEND)
            .setType(mime)
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().runOnUiThread(() -> getActivity().startActivity(Intent.createChooser(send, name)));
    }
}
