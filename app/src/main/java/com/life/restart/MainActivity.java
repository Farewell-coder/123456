package com.life.restart;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.DocumentsContract;
import android.net.Uri;
import android.widget.Toast;
import android.content.SharedPreferences;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * My Life, My Sim · 单页 WebView 壳
 * - 资源内置 assets/index.html，离线可玩
 * - 固定竖屏（Manifest screenOrientation="portrait" + configChanges 防重建）
 * - DOM Storage 开启（配置 / 存档存 localStorage）
 * - 允许 file:// 跨域，让页面直接请求用户自填的 AI 接口（绕开 CORS）
 * - 注入 window.Android.saveFile()：把存档 JSON 真正落到「下载」目录
 * - 实现 onShowFileChooser：让 <input type="file"> 能拉起系统文件选择器（导入存档）
 */
public class MainActivity extends Activity {

    private static final int REQ_FILE = 1001;
    private static final int REQ_DIR = 1002;
    /** 悬浮窗授权请求码（需求 A） */
    private static final int REQ_OVERLAY = 1003;

    private WebView web;
    private ValueCallback<Uri[]> filePathCallback;
    /** 用户选定的备份目录（SAF tree uri），持久化在 SharedPreferences */
    private Uri saveTreeUri = null;
    /** 上一次写文件失败的原因；供页面显示，避免「静默回退到下载」让人以为路径没生效 */
    private String lastSaveErr = "";
    private SharedPreferences sp(){
        return getSharedPreferences("lr_shell", MODE_PRIVATE);
    }
    /** 把 tree uri 的 docId（如 primary:Software engineer）还原成人类可读路径 */
    private String treePath(){
        try{
            if(saveTreeUri == null) return "";
            String id = DocumentsContract.getTreeDocumentId(saveTreeUri);
            if(id == null) return "";
            int c = id.indexOf(':');
            String vol = c < 0 ? "" : id.substring(0, c);
            String rel = c < 0 ? id : id.substring(c + 1);
            String base = "primary".equals(vol)
                    ? Environment.getExternalStorageDirectory().getAbsolutePath()
                    : (!vol.isEmpty() ? "/storage/" + vol : "");
            return rel.isEmpty() ? base : base + "/" + rel;
        }catch(Exception e){ return ""; }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        // 不缓存：避免更新 APK 后 WebView 仍加载旧的 index.html
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        // file:// 页面直接发跨域请求（个人自用，页面内容完全本地可控）
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setAllowFileAccessFromFileURLs(true);

        web.setBackgroundColor(0xFF0E0E14);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        // 恢复上次选定的备份目录（SAF 持久授权）
        try{
            String u = sp().getString("save_tree", "");
            if(u != null && !u.isEmpty()){
                saveTreeUri = Uri.parse(u);
                try{
                    getContentResolver().takePersistableUriPermission(saveTreeUri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                }catch(Exception ignored){}
            }
        }catch(Exception ignored){}
        web.addJavascriptInterface(new Bridge(), "Android");
        /* 需求 A：把「在页面里跑 JS」的能力交给悬浮窗服务，
           这样面板里的 AI 请求就能直接用游戏里那套配置，不必再配一份。 */
        FloatService.setHost(js -> {
            final String code = js;
            runOnUiThread(() -> {
                try { if (web != null) web.evaluateJavascript(code, null); } catch (Exception ignored) {}
            });
        });

        web.setWebViewClient(new WebViewClient() {
            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleUrl(req.getUrl() == null ? "" : req.getUrl().toString());
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new android.app.AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("好", (d, w) -> result.confirm())
                        .setOnCancelListener(d -> result.confirm())
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new android.app.AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("确定", (d, w) -> result.confirm())
                        .setNegativeButton("取消", (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message,
                                      String defaultValue, JsPromptResult result) {
                final android.widget.EditText et = new android.widget.EditText(MainActivity.this);
                et.setText(defaultValue == null ? "" : defaultValue);
                et.setSelectAllOnFocus(true);
                new android.app.AlertDialog.Builder(MainActivity.this)
                        .setTitle(message)
                        .setView(et)
                        .setPositiveButton("确定", (d, w) -> result.confirm(et.getText().toString()))
                        .setNegativeButton("取消", (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }

            /** 让页面的 <input type="file"> 能拉起系统文件选择器 */
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = cb;
                try {
                    Intent i = params.createIntent();
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(i, REQ_FILE);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });

        setContentView(web);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        }
        if (web.getUrl() == null) {
            web.clearCache(true);
            web.loadUrl("file:///android_asset/index.html?v=0.1.2");
        }
    }

    /** 站内 file:// 放行，其它链接交给系统浏览器 */
    private boolean handleUrl(String url) {
        if (url == null || url.isEmpty()) return false;
        Uri u = Uri.parse(url);
        String scheme = u.getScheme() == null ? "" : u.getScheme();
        if (scheme.equals("file") || scheme.equals("about") || scheme.equals("data")
                || scheme.equals("blob")) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Exception ignored) {
        }
        return true;
    }

    /** 暴露给页面的原生能力（JS 里是 window.Android） */
    public class Bridge {

        /** 系统当前是否处于深色模式（读系统配置，避免 WebView 媒体查询不刷新） */
        @JavascriptInterface
        public boolean isNight() {
            // 1) 权威接口：UiModeManager（跨厂商一致，不受 Activity 是否重建影响）
            try {
                android.app.UiModeManager um = (android.app.UiModeManager)
                        getSystemService(android.content.Context.UI_MODE_SERVICE);
                if (um != null) {
                    int nm = um.getNightMode();
                    if (nm == android.app.UiModeManager.MODE_NIGHT_YES) return true;
                    if (nm == android.app.UiModeManager.MODE_NIGHT_NO) return false;
                }
            } catch (Exception ignored) {
            }
            // 2) 退回 Configuration（覆盖「跟随日落/定时」时 UiModeManager 返回 AUTO 的情况）
            try {
                int m = getResources().getConfiguration().uiMode;
                int m2 = android.content.res.Resources.getSystem().getConfiguration().uiMode;
                return ((m | m2) & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
            } catch (Exception ignored) {
            }
            return false;
        }

        /** 页面切换外观时同步系统状态栏图标（dark=1 表示页面是深色底，需用浅色图标） */
        @JavascriptInterface
        public void applyNight(int dark) {
            final int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().getInsetsController().setSystemBarsAppearance(
                        dark == 1 ? 0 : light, light);
            } else {
                View v = getWindow().getDecorView();
                int sys = v.getSystemUiVisibility();
                v.setSystemUiVisibility(dark == 1 ? (sys & ~light) : (sys | light));
            }
        }

        /** 当前备份目录（可读路径），未选择时返回空串 */
        @JavascriptInterface
        public String getSaveDir() {
            return saveTreeUri == null ? "" : treePath();
        }
        /** 上一次导出失败的原因（空串 = 没出错）；页面用它把「静默回退」提示出来 */
        @JavascriptInterface
        public String getSaveError() {
            return lastSaveErr == null ? "" : lastSaveErr;
        }
        /** 拉起系统目录选择器；选完回调页面 window.__onDirPicked(path) */
        @JavascriptInterface
        public void pickSaveDir() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent it = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                        it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
                        startActivityForResult(it, REQ_DIR);
                    } catch (Exception e) {
                        if (web != null) {
                            web.evaluateJavascript(
                                    "(function(){try{if(window.__onDirErr)window.__onDirErr();}catch(e){}})()",
                                    null);
                        }
                    }
                }
            });
        }
        /**
         * 把文本写到手机存储，成功返回可读落地路径；失败返回空串，让页面回退到 <a download>。
         * Android 10+ 走 MediaStore 写入「下载」目录，无需任何存储权限。
         */
        @JavascriptInterface
        public String saveFile(String name, String content) {
            byte[] bytes;
            try {
                bytes = content.getBytes("UTF-8");
            } catch (Exception e) {
                return "";
            }
            // 0) 已选定备份目录：直接写进那个目录（SAF，无需任何存储权限）
            lastSaveErr = "";
            if (saveTreeUri != null) {
                try {
                    // 关键：createDocument 的 parent 必须是 document URI。
                    // 直接把 tree URI 传进去，会被 DocumentsContract.getDocumentId() 判为
                    // 非法 URI 抛 IllegalArgumentException，再被 catch 吞掉，
                    // 表现就是「选了目录，文件却还是进了下载」。
                    String treeDocId = DocumentsContract.getTreeDocumentId(saveTreeUri);
                    Uri parent = DocumentsContract.buildDocumentUriUsingTree(saveTreeUri, treeDocId);
                    Uri doc = DocumentsContract.createDocument(
                            getContentResolver(), parent, "application/json", name);
                    if (doc != null) {
                        OutputStream os = getContentResolver().openOutputStream(doc);
                        if (os != null) {
                            os.write(bytes);
                            os.flush();
                            os.close();
                            String p = treePath();
                            return (p.isEmpty() ? "" : p + "/") + name;
                        }
                    }
                    if (lastSaveErr.isEmpty()) {
                        lastSaveErr = "所选目录未能创建文件（系统未返回可写文件）";
                    }
                } catch (Exception e) {
                    lastSaveErr = "所选目录写入失败：" + e.getMessage();
                }
            }
            // 1) Android 10+：MediaStore Downloads，无需权限
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    v.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri != null) {
                        OutputStream os = getContentResolver().openOutputStream(uri);
                        if (os != null) {
                            os.write(bytes);
                            os.flush();
                            os.close();
                        }
                        v.clear();
                        v.put(MediaStore.Downloads.IS_PENDING, 0);
                        getContentResolver().update(uri, v, null, null);
                        return "下载/" + name;
                    }
                } catch (Exception e) {
                    if (lastSaveErr.isEmpty()) {
                        lastSaveErr = "写入「下载」目录失败：" + e.getMessage();
                    }
                }
            }
            // 2) 兜底：写到应用外部目录，保证文件真实存在
            try {
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) {
                    dir = new File(Environment.getExternalStorageDirectory(), "MyLifeMySim");
                }
                if (!dir.exists() && !dir.mkdirs()) {
                    return "";
                }
                File f = new File(dir, name);
                FileOutputStream fo = new FileOutputStream(f);
                fo.write(bytes);
                fo.flush();
                fo.close();
                return f.getAbsolutePath();
            } catch (Exception e) {
                if (lastSaveErr.isEmpty()) {
                    lastSaveErr = "兜底目录写入失败：" + e.getMessage();
                }
                return "";
            }
        }

        /**
         * 写二进制文件（诊断 zip 用），content 是 base64 文本。
         * 回退顺序与 saveFile 一致：所选目录（SAF）→ 下载（MediaStore）→ 应用外部目录。
         */
        @JavascriptInterface
        public String saveBytes(String name, String b64) {
            byte[] bytes;
            try {
                bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            } catch (Exception e) {
                return "";
            }
            lastSaveErr = "";
            // 0) 已选定备份目录：直接写进那个目录
            if (saveTreeUri != null) {
                try {
                    String treeDocId = DocumentsContract.getTreeDocumentId(saveTreeUri);
                    Uri parent = DocumentsContract.buildDocumentUriUsingTree(saveTreeUri, treeDocId);
                    Uri doc = DocumentsContract.createDocument(
                            getContentResolver(), parent, "application/zip", name);
                    if (doc != null) {
                        OutputStream os = getContentResolver().openOutputStream(doc);
                        if (os != null) {
                            os.write(bytes);
                            os.flush();
                            os.close();
                            String p = treePath();
                            return (p.isEmpty() ? "" : p + "/") + name;
                        }
                    }
                    if (lastSaveErr.isEmpty()) {
                        lastSaveErr = "所选目录未能创建文件（系统未返回可写文件）";
                    }
                } catch (Exception e) {
                    lastSaveErr = "所选目录写入失败：" + e.getMessage();
                }
            }
            // 1) Android 10+：MediaStore Downloads
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                    v.put(MediaStore.Downloads.MIME_TYPE, "application/zip");
                    v.put(MediaStore.Downloads.IS_PENDING, 1);
                    Uri uri = getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri != null) {
                        OutputStream os = getContentResolver().openOutputStream(uri);
                        if (os != null) {
                            os.write(bytes);
                            os.flush();
                            os.close();
                        }
                        v.clear();
                        v.put(MediaStore.Downloads.IS_PENDING, 0);
                        getContentResolver().update(uri, v, null, null);
                        return "下载/" + name;
                    }
                } catch (Exception e) {
                    if (lastSaveErr.isEmpty()) {
                        lastSaveErr = "写入「下载」目录失败：" + e.getMessage();
                    }
                }
            }
            // 2) 兜底：写到应用外部目录
            try {
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) {
                    dir = new File(Environment.getExternalStorageDirectory(), "MyLifeMySim");
                }
                if (!dir.exists() && !dir.mkdirs()) {
                    return "";
                }
                File f = new File(dir, name);
                FileOutputStream fo = new FileOutputStream(f);
                fo.write(bytes);
                fo.flush();
                fo.close();
                return f.getAbsolutePath();
            } catch (Exception e) {
                if (lastSaveErr.isEmpty()) {
                    lastSaveErr = "兜底目录写入失败：" + e.getMessage();
                }
                return "";
            }
        }

        /** 页面探测用：确认原生导出可用 */
        @JavascriptInterface
        public boolean canSave() {
            return true;
        }

        /** 页面探测用：壳版本号，便于排查 */
        /* ==================== 需求 A：悬浮球 ==================== */

        /** 系统是否已授予「显示在其他应用上层」 */
        @JavascriptInterface
        public boolean floatCanDraw() {
            return FloatService.canDraw(MainActivity.this);
        }

        /** 悬浮球当前是否开着 */
        @JavascriptInterface
        public boolean floatIsOn() {
            return FloatService.isOn(MainActivity.this) && FloatService.isRunning();
        }

        /**
         * 开 / 关悬浮球。
         * 返回 true 表示「开成功了」（没权限时会拉起授权页并返回 false）。
         */
        @JavascriptInterface
        public boolean floatToggle(boolean on) {
            if (!on) {
                FloatService.setOn(MainActivity.this, false);
                try { stopService(new Intent(MainActivity.this, FloatService.class)); } catch (Exception ignored) {}
                return false;
            }
            if (!FloatService.canDraw(MainActivity.this)) {
                // 没权限：拉起系统授权页，回来后再手动点一次开关
                try {
                    Intent i = new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:" + getPackageName()));
                    startActivityForResult(i, REQ_OVERLAY);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "请到系统设置里手动允许悬浮窗权限", Toast.LENGTH_LONG).show();
                }
                return false;
            }
            FloatService.setOn(MainActivity.this, true);
            try { startService(new Intent(MainActivity.this, FloatService.class)); }
            catch (Exception e) { return false; }
            return true;
        }

        /** 悬浮窗面板代发的 AI 结果回传 */
        @JavascriptInterface
        public void floatCb(String cb, String json) {
            FloatService.reply(cb, json);
        }

        /** 悬浮窗面板请求的状态回传 */
        @JavascriptInterface
        public void floatStat(String json) {
            FloatService.postStat(json);
        }
        /** 页面当前主题（1=深色）：让悬浮窗面板跟游戏主题保持一致 */
        @JavascriptInterface
        public void floatTheme(int dark) {
            FloatService.applyTheme(dark);
        }

        @JavascriptInterface
        public int shellVersion() {
            return 2;
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        /* 需求 A：悬浮窗授权回来 —— 已授权就顺手把悬浮球开起来 */
        if (requestCode == REQ_OVERLAY) {
            if (FloatService.canDraw(this)) {
                FloatService.setOn(this, true);
                try { startService(new Intent(this, FloatService.class)); } catch (Exception ignored) {}
                if (web != null) {
                    web.evaluateJavascript(
                            "(function(){try{if(window.floatSync)floatSync();}catch(e){}})()", null);
                }
            } else {
                Toast.makeText(this, "未授予悬浮窗权限，悬浮球无法显示", Toast.LENGTH_SHORT).show();
            }
            return;
        }
        if (requestCode == REQ_DIR) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri u = data.getData();
                try {
                    getContentResolver().takePersistableUriPermission(u,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                } catch (Exception ignored) {
                }
                saveTreeUri = u;
                try { sp().edit().putString("save_tree", u.toString()).apply(); } catch (Exception ignored) {}
                if (web != null) {
                    String p = treePath().replace("'", "");
                    web.evaluateJavascript(
                            "(function(){try{if(window.__onDirPicked)window.__onDirPicked('" + p + "');}catch(e){}})()",
                            null);
                }
            }
            return;
        }
        if (requestCode == REQ_FILE) {
            if (filePathCallback != null) {
                Uri[] res = null;
                if (resultCode == RESULT_OK && data != null) {
                    if (data.getDataString() != null) {
                        res = new Uri[]{Uri.parse(data.getDataString())};
                    } else if (data.getClipData() != null) {
                        int n = data.getClipData().getItemCount();
                        res = new Uri[n];
                        for (int i = 0; i < n; i++) {
                            res[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    }
                }
                filePathCallback.onReceiveValue(res);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // 系统切深浅色时通知页面：只有「跟随系统」模式会让页面跟着变，
        // 「白天 / 黑暗」是页面自己的主题，不受影响；状态栏图标则始终跟系统。
        if (web != null) {
            web.evaluateJavascript(
                    "(function(){try{if(window.__syncTheme)window.__syncTheme();}catch(e){}})()", null);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        // 优先让页面处理：关弹窗 / 暂停人生；页面说没消费才退出
        web.evaluateJavascript(
                "(function(){try{return (window.__back && window.__back())?'1':'0'}catch(e){return '0'}})()",
                value -> {
                    if (value == null || !value.contains("1")) {
                        finish();
                    }
                });
    }

    @Override
    protected void onDestroy() {
        FloatService.setHost(null);
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}