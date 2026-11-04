package com.recallmate.mobile;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.AtomicFile;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** The bridge exposes bank operations, never an arbitrary filesystem path. */
@CapacitorPlugin(name = "RecallMateFiles")
public class RecallMateFilesPlugin extends Plugin {
    private static final int MAX_BYTES = 20 * 1024 * 1024;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private boolean pickerBusy = false;

    private File root() throws IOException {
        File root = new File(getContext().getFilesDir(), "recallmate");
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("无法创建应用数据目录");
        return root;
    }

    private File directory(String name) throws IOException {
        File dir = new File(root(), name);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("无法创建题库目录");
        return dir;
    }

    private String id(PluginCall call) throws IOException {
        String id = call.getString("id", "");
        if (!id.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")) throw new IOException("无效的题库 ID");
        return id;
    }

    private void work(PluginCall call, Callable<JSObject> task) {
        io.execute(() -> {
            try { call.resolve(task.call()); }
            catch (Exception error) { call.reject(error.getMessage() == null ? "文件操作失败，请重试" : error.getMessage(), error); }
        });
    }

    private String read(InputStream stream, int limit) throws IOException {
        if (stream == null) throw new IOException("无法打开所选文件");
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int length, total = 0;
            while ((length = input.read(buffer)) != -1) {
                total += length;
                if (total > limit) throw new IOException("文件超过 20 MB，请拆分题库后重试");
                output.write(buffer, 0, length);
            }
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(output.toByteArray())).toString();
        }
    }

    private String read(File file, int limit) throws IOException {
        return read(new AtomicFile(file).openRead(), limit);
    }

    private void write(File file, String text, int limit) throws IOException {
        if (text == null) throw new IOException("缺少保存内容");
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > limit) throw new IOException("保存内容过大，请拆分题库");
        AtomicFile atomic = new AtomicFile(file);
        FileOutputStream stream = null;
        try {
            stream = atomic.startWrite(); stream.write(bytes); stream.getFD().sync(); atomic.finishWrite(stream);
        } catch (IOException error) { if (stream != null) atomic.failWrite(stream); throw error; }
    }

    private void preserve(File file) throws IOException {
        if (!file.exists()) return;
        File target = new File(file.getParentFile(), file.getName() + ".corrupt-" + System.currentTimeMillis() + "-" + UUID.randomUUID());
        try (InputStream input = new FileInputStream(file); FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[8192]; int length;
            while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
            output.getFD().sync();
        }
    }

    private void readOptional(JSObject record, String key, File file, int limit) {
        if (!file.exists() && !new File(file.getPath() + ".bak").exists()) return;
        try { record.put(key, read(file, limit)); }
        catch (IOException error) { record.put(key, ""); }
    }

    private void guardVersion(File file) throws IOException {
        if (!file.exists() && !new File(file.getPath()+".bak").exists()) return;
        String text;
        try { text=read(file,MAX_BYTES); } catch (IOException error) { return; }
        try {
            JSONObject raw=new JSONObject(text),bank=raw.optJSONObject("bank"),session=raw.optJSONObject("session");
            if(raw.optInt("schemaVersion",0)>2||(bank!=null&&bank.optInt("schemaVersion",0)>2)||(session!=null&&session.optInt("schemaVersion",0)>2))
                throw new IOException("题库属于更高版本，禁止覆盖原文件");
        } catch(org.json.JSONException error) { /* Corrupt JSON is preserved separately. */ }
    }

    private void validateLegacyOriginal(String id,String text) throws IOException {
        try {
            JSONObject raw=new JSONObject(text);
            if(raw.optInt("schemaVersion",0)!=1||!id.equals(raw.getJSONObject("bank").optString("id")))throw new IOException("旧题库迁移原件无效，已停止保存");
        } catch(org.json.JSONException error) { throw new IOException("无法验证旧题库迁移原件",error); }
    }

    private void archiveLegacyOriginal(String id,String text) throws IOException {
        validateLegacyOriginal(id,text);
        File archive=new File(directory("migrations"),id+".v1.original.json");
        if(archive.exists()||new File(archive.getPath()+".bak").exists())validateLegacyOriginal(id,read(archive,MAX_BYTES));
        else write(archive,text,MAX_BYTES);
    }

    private String legacyCandidate(File file,String id) {
        try {
            String text=read(file,MAX_BYTES);JSONObject raw=new JSONObject(text);
            if(raw.optInt("schemaVersion",0)==1&&id.equals(raw.getJSONObject("bank").optString("id")))return text;
        } catch(Exception ignored) { /* Validated adapter originals take priority. */ }
        return null;
    }

    @PluginMethod
    public void list(PluginCall call) {
        work(call, () -> {
            File banks = directory("banks"), backups = directory("backups");
            Set<String> ids = new TreeSet<>();
            for (File dir : new File[] { banks, backups }) {
                File[] entries = dir.listFiles();
                if (entries == null) throw new IOException("无法读取题库目录");
                for (File file : entries) {
                    String name = file.getName();
                    if (name.matches("(?i)[0-9a-f-]{36}\\.json(?:\\.bak)?")) ids.add(name.substring(0, 36));
                }
            }
            JSArray records = new JSArray();
            for (String id : ids) {
                JSObject record = new JSObject().put("id", id);
                readOptional(record, "main", new File(banks, id + ".json"), MAX_BYTES);
                readOptional(record, "backup", new File(backups, id + ".json.bak"), MAX_BYTES);
                records.put(record);
            }
            return new JSObject().put("records", records).put("warnings", new JSArray());
        });
    }

    @PluginMethod
    public void write(PluginCall call) {
        work(call, () -> {
            String id = id(call), text = call.getString("text"), previous = call.getString("previous");
            File main = new File(directory("banks"), id + ".json");
            File backup=new File(directory("backups"),id+".json.bak");
            guardVersion(main);guardVersion(backup);
            String legacyOriginal=call.getString("legacyOriginal");
            if(legacyOriginal==null)legacyOriginal=legacyCandidate(main,id);
            if(legacyOriginal==null)legacyOriginal=legacyCandidate(backup,id);
            if(legacyOriginal!=null)archiveLegacyOriginal(id,legacyOriginal);
            if (Boolean.TRUE.equals(call.getBoolean("preserve", false))) preserve(main);
            if (previous != null) write(backup, previous, MAX_BYTES);
            write(main, text, MAX_BYTES);
            return new JSObject();
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        work(call, () -> {
            String id = id(call);
            File main = new File(directory("banks"), id + ".json"), backup = new File(directory("backups"), id + ".json.bak");
            new AtomicFile(main).delete(); new AtomicFile(backup).delete();
            if (main.exists() || backup.exists()) throw new IOException("题库删除失败，请重试");
            return new JSObject();
        });
    }

    @PluginMethod
    public void readSettings(PluginCall call) {
        work(call, () -> {
            JSObject result = new JSObject();
            readOptional(result, "main", new File(root(), "settings.json"), 4096);
            readOptional(result, "backup", new File(root(), "settings.json.bak"), 4096);
            return result;
        });
    }

    @PluginMethod
    public void writeSettings(PluginCall call) {
        work(call, () -> {
            File main = new File(root(), "settings.json");
            if (Boolean.TRUE.equals(call.getBoolean("preserve", false))) preserve(main);
            String previous = call.getString("previous");
            if (previous != null) write(new File(root(), "settings.json.bak"), previous, 4096);
            write(main, call.getString("text"), 4096);
            return new JSObject();
        });
    }

    @PluginMethod
    public void chooseFile(PluginCall call) {
        if (pickerBusy) { call.reject("文件选择器已打开，请先完成或取消"); return; }
        pickerBusy = true;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("*/*");
        try { startActivityForResult(call, intent, "fileChosen"); }
        catch (Exception error) { pickerBusy = false; call.reject("无法打开系统文件选择器", error); }
    }

    @ActivityCallback
    private void fileChosen(PluginCall call, ActivityResult result) {
        pickerBusy = false;
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) { call.resolve(new JSObject().put("cancelled", true)); return; }
        work(call, () -> {
            String name = "题库.txt";
            try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME), sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                    if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex);
                    if (sizeIndex >= 0 && !cursor.isNull(sizeIndex) && cursor.getLong(sizeIndex) > MAX_BYTES) throw new IOException("文件超过 20 MB，请拆分后导入");
                }
            }
            if (!name.toLowerCase(Locale.ROOT).matches(".*\\.(md|txt|json)$")) throw new IOException("请选择 .md、.txt 或 .json 文件");
            return new JSObject().put("name", name).put("text", read(getContext().getContentResolver().openInputStream(uri), MAX_BYTES));
        });
    }

    @PluginMethod
    public void exportFile(PluginCall call) {
        if (pickerBusy) { call.reject("文件选择器已打开，请先完成或取消"); return; }
        String text = call.getString("text");
        if (text == null || text.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) { call.reject("导出内容无效或超过 20 MB"); return; }
        pickerBusy = true;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "RecallMate.recallmate.json"));
        try { startActivityForResult(call, intent, "fileCreated"); }
        catch (Exception error) { pickerBusy = false; call.reject("无法打开系统保存窗口", error); }
    }

    @ActivityCallback
    private void fileCreated(PluginCall call, ActivityResult result) {
        pickerBusy = false;
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) { call.resolve(new JSObject().put("saved", false)); return; }
        work(call, () -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new IOException("无法写入所选位置");
                output.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8)); output.flush();
            }
            return new JSObject().put("saved", true);
        });
    }

    @Override
    protected void handleOnDestroy() { io.shutdown(); }
}
