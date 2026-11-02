package com.repairshelper.app;

import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Capacitor puts the bundled "No internet" page (server.errorPath) over any
        // page that answers with an HTTP error, so a 404 would claim the phone is
        // offline. The site has its own pages for 4xx answers. A 5xx (the server
        // down, Cloudflare answering for it) still gets the offline page and its
        // Try again, as does a connection that fails outright (onReceivedError).
        bridge.setWebViewClient(
            new BridgeWebViewClient(bridge) {
                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                    if (request.isForMainFrame() && errorResponse.getStatusCode() < 500) return;
                    super.onReceivedHttpError(view, request, errorResponse);
                }
            }
        );
    }
}
