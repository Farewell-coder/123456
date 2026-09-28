package com.life.restart;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 悬浮球（v0.1.3 D 精简版）
 *
 * 常驻一个可拖动的小圆球，点一下展开面板。面板只保留：
 *   标题行 + 一行本局状态 + 四个等宽按钮：
 *     · 进入调试面板
 *     · 开关无敌模式（文案随状态变化）
 *     · 结束这一局
 *     · 关闭悬浮窗
 *
 * 上一版的聊天区（输入框 / 气泡 / 发送链路）已按要求整体移除 —— 面板不再承担对话职责。
 *
 * 配色跟随游戏主题（浅色 / 深色两套），由页面在 applyTheme() 时通过
 * Android.floatTheme(dark) 推过来，原生不再自己猜深浅。
 *
 * 与页面的契约（页面暴露的全局函数）：
 *   window.__floatStat()     返回 {"dev","ver","life","attr"}
 *   window.__floatDevNow     当前无敌模式状态（布尔）
 *   window.__floatDev(on)    设置无敌模式，返回新值
 *   window.__floatOpenDbg()  无口令打开调试面板
 *   window.__floatEndLife()  按当前属性结束这一局（二次确认在页面侧）
 * 页面回传的原生入口：Android.floatStat(json) / Android.floatTheme(dark)
 */
public class FloatService extends Service {

    public static final String PREFS = "lr_float";
    public static final String KEY_ON = "on";

    /** 由 MainActivity 注入：在 WebView 里跑一段 JS */
    public interface Host { void floatRun(String js); }

    private static Host host;
    public static void setHost(Host h) { host = h; }

    private static FloatService inst;
    public static boolean isRunning() { return inst != null; }

    /** 由 MainActivity 转发：页面回传的 AI 结果
     *  v0.1.3 起悬浮窗已无对话区，此入口保留仅为兼容既有桥接，不再有任何 UI 动作。 */
    public static void reply(String cb, String json) { /* no-op：聊天区已移除 */ }
    /** 由 MainActivity 转发：页面回传的状态 */
    public static void postStat(String json) {
        FloatService s = inst;
        if (s != null) s.onStat(json);
    }
    /** 由 MainActivity 转发：页面当前处于深色(1)还是浅色(0)主题 */
    public static void applyTheme(int dark) {
        int d = dark == 1 ? 1 : 0;
        if (sDark == d) return;
        sDark = d;
        FloatService s = inst;
        if (s != null) {
            s.ui.post(() -> {
                if (s.panel != null) { s.hidePanel(); s.showPanel(); }
            });
        }
    }

    /* ---- 静态状态存取（供 MainActivity 调用） ---- */
    public static boolean isOn(Context c) {
        return c.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(KEY_ON, false);
    }
    public static void setOn(Context c, boolean on) {
        c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_ON, on).apply();
    }
    public static boolean canDraw(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return Settings.canDrawOverlays(c);
    }

    private static int sDark = 0;

    private WindowManager wm;
    private View ball;
    private View panel;
    private WindowManager.LayoutParams ballLp;
    private TextView statTv;
    private TextView devBtn;                 // 「开关无敌模式」按钮，文案随状态变
    private boolean devNow = false;          // 面板上镜像的无敌模式状态
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        inst = this;
        wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (canDraw(this)) addBall();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "stop".equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!isOn(this)) { stopSelf(); return START_NOT_STICKY; }
        if (ball == null && canDraw(this)) { inst = this; addBall(); }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        inst = null;
        hidePanel();
        if (ball != null) {
            try { wm.removeView(ball); } catch (Exception ignored) {}
            ball = null;
        }
        super.onDestroy();
    }

    /* ================= 工具 ================= */

    private void run(String js) {
        Host h = host;
        if (h != null) h.floatRun(js);
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
                getResources().getDisplayMetrics());
    }

    private int overlayType() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        }
        return WindowManager.LayoutParams.TYPE_PHONE;
    }

    private GradientDrawable round(int color, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(dp(radiusDp));
        g.setColor(color);
        return g;
    }

    /* ---- 主题取色：浅色 / 深色两套，跟游戏主题一致 ---- */
    private boolean dark() { return sDark == 1; }
    private int cPanel()     { return dark() ? 0xF71E1E2A : 0xFFFFFFFF; }
    private int cPanelEdge() { return dark() ? 0x1FFFFFFF : 0x14000000; }
    private int cText()      { return dark() ? 0xFFEDEDF5 : 0xFF1B1B2A; }
    private int cDim()       { return dark() ? 0xFF9A9AB4 : 0xFF6E6E86; }
    private int cSoft()      { return dark() ? 0x1FFFFFFF : 0xFFF2F3F7; }
    private int cSoftEdge()  { return dark() ? 0x14FFFFFF : 0x12000000; }
    private int cAcc()       { return 0xFF6B4EE6; }

    /** 整行等宽按钮（四个快捷操作统一规格） */
    private TextView rowBtn(String text, int tintColor, int bgColor) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(13f);
        tv.setTextColor(tintColor);
        tv.setTypeface(null, Typeface.BOLD);
        tv.setGravity(Gravity.CENTER);
        tv.setPadding(dp(10), dp(11), dp(10), dp(11));
        GradientDrawable bg = round(bgColor, 12);
        bg.setStroke(dp(1f), cSoftEdge());
        tv.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        tv.setLayoutParams(lp);
        return tv;
    }

    /* ================= 悬浮球 ================= */

    private void addBall() {
        int size = dp(48);
        GradientDrawable bg = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR, new int[]{ 0xE66B4EE6, 0xE6A55CF0 });
        bg.setShape(GradientDrawable.OVAL);
        bg.setStroke(dp(1.5f), 0x66FFFFFF);

        TextView tv = new TextView(this);
        tv.setText("⚙");
        tv.setTextColor(Color.WHITE);
        tv.setTextSize(19);
        tv.setGravity(Gravity.CENTER);
        tv.setBackground(bg);
        tv.setAlpha(0.93f);
        ball = tv;

        ballLp = new WindowManager.LayoutParams(size, size, overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        ballLp.gravity = Gravity.TOP | Gravity.START;
        ballLp.x = dp(6);
        ballLp.y = dp(260);

        tv.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY;
            int startX, startY;
            boolean moved;
            long downAt;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = e.getRawX(); downY = e.getRawY();
                        startX = ballLp.x; startY = ballLp.y;
                        moved = false; downAt = System.currentTimeMillis();
                        return true;
                    case MotionEvent.ACTION_MOVE: {
                        int dx = (int) (e.getRawX() - downX);
                        int dy = (int) (e.getRawY() - downY);
                        if (Math.abs(dx) > dp(4) || Math.abs(dy) > dp(4)) moved = true;
                        if (moved) {
                            ballLp.x = startX + dx;
                            ballLp.y = Math.max(0, startY + dy);
                            try { wm.updateViewLayout(ball, ballLp); } catch (Exception ignored) {}
                        }
                        return true;
                    }
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (!moved && System.currentTimeMillis() - downAt < 700) togglePanel();
                        return true;
                }
                return false;
            }
        });

        try { wm.addView(ball, ballLp); } catch (Exception ignored) {}
    }

    /* ================= 面板 ================= */

    private void togglePanel() {
        if (panel != null) hidePanel();
        else showPanel();
    }

    private void hidePanel() {
        if (panel != null) {
            try { wm.removeView(panel); } catch (Exception ignored) {}
            panel = null;
        }
        statTv = null; devBtn = null;
    }

    private void showPanel() {
        float density = getResources().getDisplayMetrics().density;
        int W = Math.min((int) (300 * density),
                getResources().getDisplayMetrics().widthPixels - dp(16));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable pbg = round(cPanel(), 20);
        pbg.setStroke(dp(1f), cPanelEdge());
        root.setBackground(pbg);
        int p = dp(14);
        root.setPadding(p, p, p, p);

        /* ---- 标题行：色点 + 标题 + 关闭 ---- */
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);

        View dot = new View(this);
        GradientDrawable dbg = new GradientDrawable();
        dbg.setCornerRadius(dp(5));
        dbg.setColor(cAcc());
        dot.setBackground(dbg);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(dp(9), dp(9));
        dlp.rightMargin = dp(8);
        head.addView(dot, dlp);

        TextView title = new TextView(this);
        title.setText("随身助手");
        title.setTextColor(cText());
        title.setTextSize(15);
        title.setTypeface(null, Typeface.BOLD);
        head.addView(title, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        TextView close = new TextView(this);
        close.setText("✕");
        close.setTextColor(cDim());
        close.setTextSize(14);
        close.setPadding(dp(10), dp(4), dp(4), dp(4));
        close.setOnClickListener(v -> hidePanel());
        head.addView(close);
        root.addView(head);

        /* ---- 状态行：淡底圆角块 ---- */
        statTv = new TextView(this);
        statTv.setTextColor(cDim());
        statTv.setTextSize(11.5f);
        statTv.setLineSpacing(dp(2), 1f);
        GradientDrawable stbg = round(cSoft(), 12);
        stbg.setStroke(dp(1f), cSoftEdge());
        statTv.setBackground(stbg);
        statTv.setPadding(dp(10), dp(8), dp(10), dp(8));
        statTv.setText("读取状态中…");
        LinearLayout.LayoutParams stlp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        stlp.topMargin = dp(10);
        root.addView(statTv, stlp);

        /* ---- 四个等宽整行按钮 ---- */
        TextView dbgBtn = rowBtn("进入调试面板", cAcc(), cSoft());
        dbgBtn.setOnClickListener(v -> {
            hidePanel();
            run("(function(){try{ if(window.__floatOpenDbg) window.__floatOpenDbg(); }catch(e){}})();");
        });
        root.addView(dbgBtn);

        devBtn = rowBtn("开启无敌模式", 0xFF3EA96B, cSoft());
        devBtn.setOnClickListener(v -> {
            boolean next = !devNow;
            run("(function(){try{ if(window.__floatDev) window.__floatDev(" + next + "); }catch(e){}})();");
            ui.postDelayed(FloatService.this::refreshStat, 120);
        });
        root.addView(devBtn);

        TextView endBtn = rowBtn("结束这一局", 0xFFD9962A, cSoft());
        endBtn.setOnClickListener(v -> {
            hidePanel();
            run("(function(){try{ if(window.__floatEndLife) window.__floatEndLife(); }catch(e){}})();");
        });
        root.addView(endBtn);

        TextView closeAllBtn = rowBtn("关闭悬浮窗", 0xFFE0533D, cSoft());
        closeAllBtn.setOnClickListener(v -> {
            FloatService.setOn(FloatService.this, false);
            run("(function(){try{ if(window.floatSync) floatSync(); }catch(e){}})();");
            stopSelf();
        });
        root.addView(closeAllBtn);

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                W, WindowManager.LayoutParams.WRAP_CONTENT, overlayType(),
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.x = dp(8);
        lp.y = dp(64);
        panel = root;
        try { wm.addView(panel, lp); } catch (Exception ignored) { panel = null; }

        refreshStat();
    }

    /* ================= 状态 ================= */

    /** MainActivity 转发：页面状态 */
    public void onStat(final String json) {
        ui.post(() -> {
            if (statTv == null) return;
            try {
                org.json.JSONObject o = new org.json.JSONObject(json);
                devNow = o.optBoolean("dev", false);
                StringBuilder sb = new StringBuilder();
                sb.append("v").append(o.optString("ver", "?"));
                sb.append(" · 无敌模式").append(devNow ? "开" : "关");
                String life = o.optString("life", "未开局");
                if (!android.text.TextUtils.isEmpty(life)) sb.append("\n").append(life);
                String attr = o.optString("attr", "");
                if (!android.text.TextUtils.isEmpty(attr)) sb.append("\n").append(attr);
                statTv.setText(sb.toString());
                if (devBtn != null) {
                    devBtn.setText(devNow ? "关闭无敌模式" : "开启无敌模式");
                    devBtn.setTextColor(devNow ? 0xFFE0533D : 0xFF3EA96B);
                }
            } catch (Exception ignored) {}
        });
    }

    private void refreshStat() {
        run("if(window.__floatStat){ try{ Android.floatStat(window.__floatStat()); }catch(e){} }");
    }
}