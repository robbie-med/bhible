package org.robbiemed.bhible;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Full-screen WebView around https://bhible.robbiemed.org. The web app is the product:
 * it updates when the site does and works offline through its service worker. This class
 * only supplies what a bare WebView lacks: Back navigation, external links in the browser,
 * the file picker for Import, and a save dialog for Export (window.BHibleAndroid.saveFile).
 */
public class MainActivity extends Activity {
    private static final String HOST = "bhible.robbiemed.org";
    private static final String HOME = "https://" + HOST + "/";
    private static final int REQ_OPEN = 1;
    private static final int REQ_SAVE = 2;

    private static final String OFFLINE_PAGE =
            "<html><body style='background:#0d1117;color:#e6edf3;font:16px sans-serif;padding:32px;line-height:1.6'>"
            + "<h2>BHible can't reach the internet</h2>"
            + "<p>The first launch needs a connection; after that BHible works offline.</p>"
            + "<p>On GrapheneOS, check Settings &rarr; Apps &rarr; BHible &rarr; Permissions &rarr; Network.</p>"
            + "<p><a style='color:#58a6ff' href='" + HOME + "'>Retry</a></p>"
            + "<p style='color:#8b949e'>인터넷에 연결할 수 없습니다. 처음 실행할 때만 연결이 필요합니다.</p>"
            + "</body></html>";

    private WebView web;
    private ValueCallback<Uri[]> pendingPick;
    private String pendingSave;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0D1117"));
        // WebView ignores its own padding, so the system-bar insets go on a wrapper
        FrameLayout root = new FrameLayout(this);
        root.addView(web);
        setContentView(root);
        padForSystemBars(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportMultipleWindows(true); // routes target=_blank / window.open to onCreateWindow
        s.setAllowFileAccess(false);

        web.addJavascriptInterface(new Bridge(), "BHibleAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                if (HOST.equals(req.getUrl().getHost())) return false;
                openExternally(req.getUrl());
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                // Only reachable before the service worker has cached the app (first launch offline)
                if (req.isForMainFrame()) view.loadDataWithBaseURL(null, OFFLINE_PAGE, "text/html", "utf-8", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message resultMsg) {
                // Capture the popup's first URL and hand it to the browser instead
                WebView probe = new WebView(MainActivity.this);
                probe.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                        openExternally(req.getUrl());
                        v.destroy();
                        return true;
                    }
                });
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(probe);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingPick != null) pendingPick.onReceiveValue(null);
                pendingPick = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("*/*");
                try {
                    startActivityForResult(pick, REQ_OPEN);
                } catch (ActivityNotFoundException e) {
                    pendingPick = null;
                    return false;
                }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(urlFrom(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        web.loadUrl(urlFrom(intent));
    }

    private String urlFrom(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        return data != null && HOST.equals(data.getHost()) ? data.toString() : HOME;
    }

    private void openExternally(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    // Android 15 draws apps edge-to-edge; keep the page clear of the status and nav bars
    private void padForSystemBars(View v) {
        v.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                // Consumed here so the WebView doesn't also report them to the page as
                // env(safe-area-inset-*), which would pad the header a second time
                return WindowInsets.CONSUMED;
            }
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
    }

    @Override
    public void onBackPressed() {
        // The reader and other overlays push history entries, so Back closes them first
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
        if (request == REQ_OPEN && pendingPick != null) {
            pendingPick.onReceiveValue(uri != null ? new Uri[]{uri} : null);
            pendingPick = null;
        } else if (request == REQ_SAVE && pendingSave != null) {
            boolean saved = false;
            if (uri != null) {
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    out.write(pendingSave.getBytes(StandardCharsets.UTF_8));
                    saved = true;
                } catch (Exception ignored) {
                }
            }
            pendingSave = null;
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('bhible-saved',{detail:" + saved + "}))", null);
        }
    }

    /** Exposed to the page as window.BHibleAndroid */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String name, String text) {
            runOnUiThread(() -> {
                pendingSave = text;
                Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/json")
                        .putExtra(Intent.EXTRA_TITLE, name);
                startActivityForResult(save, REQ_SAVE);
            });
        }
    }
}
