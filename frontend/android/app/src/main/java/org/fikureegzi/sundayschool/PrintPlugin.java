package org.fikureegzi.sundayschool;

import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Prints the page shown in the app (its print styles apply) through Android's
 * print screen, which also offers «Save as PDF». The web view has no
 * window.print(), so the web side calls this instead (src/lib/print.ts).
 * The call resolves when the print screen closes, so the page can switch back
 * from its print preparation (light colours) only then.
 */
@CapacitorPlugin(name = "Print")
public class PrintPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        String name = call.getString("name", "Fikure Egzi");
        getActivity().runOnUiThread(() -> {
            PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            if (manager == null) {
                call.reject("Printing is not available on this device.");
                return;
            }
            WebView webView = getBridge().getWebView();
            PrintDocumentAdapter page = webView.createPrintDocumentAdapter(name);
            PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
                @Override
                public void onStart() {
                    page.onStart();
                }

                @Override
                public void onLayout(
                    PrintAttributes oldAttributes,
                    PrintAttributes newAttributes,
                    CancellationSignal cancellationSignal,
                    LayoutResultCallback callback,
                    Bundle extras
                ) {
                    page.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras);
                }

                @Override
                public void onWrite(
                    PageRange[] pages,
                    ParcelFileDescriptor destination,
                    CancellationSignal cancellationSignal,
                    WriteResultCallback callback
                ) {
                    page.onWrite(pages, destination, cancellationSignal, callback);
                }

                @Override
                public void onFinish() {
                    page.onFinish();
                    call.resolve();
                }
            };
            PrintAttributes a4 = new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build();
            manager.print(name, adapter, a4);
        });
    }
}
