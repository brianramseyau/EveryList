package au.brianramsey.everylist;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** The widget's configuration screen (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md). Three entry paths:
 *  <ul>
 *    <li><b>Widget placement</b> — launched by the launcher with {@code EXTRA_APPWIDGET_ID}; picks
 *        which granted list to show and the show/hide-completed default, then saves per-widget.</li>
 *    <li><b>App handoff</b> — launched by {@link EveryListWidgetPlugin#configure} right after the
 *        app provisions the shared credentials; the credentials already exist in SharedPreferences
 *        (never in a URI), so this just shows the picker.</li>
 *    <li><b>List selector tap</b> — opened from the widget with the widget id to change its list.</li>
 *  </ul> */
public class WidgetConfigActivity extends Activity {

    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private final List<Long> grantedListIds = new ArrayList<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private RadioGroup listGroup;
    private CheckBox showCompleted;
    private TextView errorView;
    private Button saveButton;
    private Button openAppButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.widget_config);

        listGroup = findViewById(R.id.config_list_group);
        showCompleted = findViewById(R.id.config_show_completed);
        errorView = findViewById(R.id.config_error);
        saveButton = findViewById(R.id.config_save);
        openAppButton = findViewById(R.id.config_open_app);

        appWidgetId = getIntent().getIntExtra(
            EveryListWidget.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);

        if (WidgetPrefs.hasGlobalCredentials(this)) {
            grantedListIds.addAll(WidgetPrefs.getGlobalListIds(this));
        } else {
            showSetUpPrompt();
            return;
        }

        showCompleted.setChecked(
            appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID
                ? new WidgetPrefs(this, appWidgetId).getShowCompleted()
                : WidgetPrefs.getGlobalDefaultShowCompleted(this));

        saveButton.setOnClickListener(v -> save());
        loadListNames();
    }

    private void showSetUpPrompt() {
        findViewById(R.id.config_explain).setVisibility(View.GONE);
        findViewById(R.id.config_list_hint).setVisibility(View.GONE);
        listGroup.setVisibility(View.GONE);
        showCompleted.setVisibility(View.GONE);
        saveButton.setVisibility(View.GONE);
        errorView.setVisibility(View.VISIBLE);
        errorView.setText(R.string.widget_setup_note);
        openAppButton.setVisibility(View.VISIBLE);
        openAppButton.setOnClickListener(v -> {
            Intent open = new Intent(Intent.ACTION_VIEW,
                Uri.parse(EveryListWidget.DEEP_LINK_SCHEME + "://settings/widget"));
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(open);
        });
    }

    /** Fetches the user's lists and fills the picker with the ones this token is granted. */
    private void loadListNames() {
        String token = WidgetPrefs.getGlobalToken(this);
        String serverUrl = WidgetPrefs.getGlobalServerUrl(this);
        final Set<Long> granted = new HashSet<>(grantedListIds);
        new Thread(() -> {
            try {
                List<WidgetModels.WidgetList> lists = WidgetApiClient.fetchLists(token, serverUrl);
                mainHandler.post(() -> showLists(lists, granted));
            } catch (IOException e) {
                mainHandler.post(() -> showError(R.string.config_load_failed));
            }
        }).start();
    }

    private void showLists(List<WidgetModels.WidgetList> lists, Set<Long> granted) {
        listGroup.removeAllViews();
        long current = new WidgetPrefs(this, appWidgetId).getListId();
        boolean any = false;
        for (WidgetModels.WidgetList list : lists) {
            if (!granted.contains(list.id)) continue;
            RadioButton button = new RadioButton(this);
            button.setText(list.name);
            button.setTag(list.id);
            button.setId(View.generateViewId());
            listGroup.addView(button);
            if (list.id == current) button.setChecked(true);
            any = true;
        }
        if (!any) {
            showError(R.string.config_no_lists);
            return;
        }
        findViewById(R.id.config_list_hint).setVisibility(View.GONE);
        if (listGroup.getCheckedRadioButtonId() == View.NO_ID && listGroup.getChildCount() > 0) {
            ((RadioButton) listGroup.getChildAt(0)).setChecked(true);
        }
    }

    private void showError(int resId) {
        errorView.setText(resId);
        errorView.setVisibility(View.VISIBLE);
    }

    private void save() {
        int checkedId = listGroup.getCheckedRadioButtonId();
        if (checkedId == View.NO_ID) {
            showError(R.string.config_pick_a_list);
            return;
        }
        RadioButton selected = findViewById(checkedId);
        long chosenListId = (Long) selected.getTag();
        boolean showCompletedChecked = showCompleted.isChecked();

        WidgetPrefs prefs = new WidgetPrefs(this, appWidgetId);
        if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            prefs.setListId(chosenListId);
            prefs.setShowCompleted(showCompletedChecked);
            prefs.setLastError(null);
            // Render immediately.
            Intent service = new Intent(this, WidgetUpdateService.class)
                .setAction(EveryListWidget.ACTION_REFRESH);
            service.putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId);
            startService(service);
            setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId));
        } else {
            // Provisioned before any widget is placed — remember the defaults for the next one.
            WidgetPrefs.setGlobalDefaults(this, chosenListId, showCompletedChecked);
            Toast.makeText(this, R.string.config_saved_hint, Toast.LENGTH_SHORT).show();
            setResult(RESULT_OK);
        }
        finish();
    }
}