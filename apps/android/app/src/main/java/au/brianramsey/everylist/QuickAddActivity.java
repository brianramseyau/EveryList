package au.brianramsey.everylist;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import java.io.IOException;

/** The widget's "+" quick-add popup — a Google-Tasks-style floating text field over whatever's
 *  currently on screen, rather than cold-launching the whole app just to focus one input (the
 *  Capacitor WebView can't guarantee an instant-focused input on a fresh app launch). Follows the
 *  same AppTheme.WidgetDialog popup pattern as WidgetConfigActivity's quick-switch, including
 *  calling the API directly with the widget's stored PAT instead of handing off to the SPA. */
public class QuickAddActivity extends Activity {

    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private long listId = -1L;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private EditText input;
    private TextView errorView;
    private Button saveButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE);
        setContentView(R.layout.quick_add);

        appWidgetId = getIntent().getIntExtra(
            EveryListWidget.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        WidgetPrefs prefs = new WidgetPrefs(this, appWidgetId);
        listId = prefs.getListId();

        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID || listId <= 0
            || !prefs.hasCredentials()) {
            finish();
            return;
        }

        TextView title = findViewById(R.id.quick_add_title);
        String listName = prefs.getListName();
        title.setText(getString(R.string.quick_add_title,
            listName.isEmpty() ? getString(R.string.widget_default_title) : listName));

        input = findViewById(R.id.quick_add_input);
        errorView = findViewById(R.id.quick_add_error);
        saveButton = findViewById(R.id.quick_add_save);

        saveButton.setOnClickListener(v -> save());
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE
                || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                save();
                return true;
            }
            return false;
        });
        input.requestFocus();
    }

    private void save() {
        String name = input.getText().toString().trim();
        if (TextUtils.isEmpty(name)) {
            finish();
            return;
        }

        saveButton.setEnabled(false);
        errorView.setVisibility(TextView.GONE);

        String token = WidgetPrefs.getGlobalToken(this);
        String serverUrl = WidgetPrefs.getGlobalServerUrl(this);
        final Context appContext = getApplicationContext();
        final int widgetId = appWidgetId;
        final long targetListId = listId;
        new Thread(() -> {
            try {
                WidgetApiClient.createItem(token, serverUrl, targetListId, name);
                WidgetUpdater.handle(appContext, EveryListWidget.ACTION_REFRESH, widgetId, -1L, -1L);
                mainHandler.post(this::finish);
            } catch (IOException e) {
                mainHandler.post(() -> {
                    saveButton.setEnabled(true);
                    errorView.setText(R.string.quick_add_failed);
                    errorView.setVisibility(TextView.VISIBLE);
                });
            }
        }).start();
    }
}
