package au.brianramsey.everylist;

import android.app.Activity;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.DialogInterface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.TextView;

import java.io.IOException;
import java.util.Calendar;
import java.util.Locale;

/** The widget's "+" quick-add popup — a Google-Tasks-style floating text field over whatever's
 *  currently on screen, rather than cold-launching the whole app just to focus one input (the
 *  Capacitor WebView can't guarantee an instant-focused input on a fresh app launch). Follows the
 *  same AppTheme.WidgetDialog popup pattern as WidgetConfigActivity's quick-switch, including
 *  calling the API directly with the widget's stored PAT instead of handing off to the SPA.
 *
 *  <p>On lists with deadlines turned on, a clock button next to Add opens the same
 *  date-then-optional-time picker flow the deadline notification's Reschedule popup uses
 *  (RescheduleActivity): a picked deadline lights the clock up in the accent color and shows a
 *  short preview, and travels with the create as `deadline` — the API's createItemValidator
 *  accepts the same field. Hidden entirely on lists with deadlines off, matching the widget's
 *  own chip gating (WidgetPrefs#getUseDeadline) — no chip would render for a deadline this
 *  popup set anyway. */
public class QuickAddActivity extends Activity {

    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private long listId = -1L;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private EditText input;
    private TextView errorView;
    private Button saveButton;
    private ImageButton deadlineButton;
    private TextView deadlinePreview;
    private View card;

    /** The deadline picked so far ('YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm'), or null for none. */
    private String pickedDeadline;

    private static final String STATE_PICKED_DEADLINE = "pickedDeadline";

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
        deadlineButton = findViewById(R.id.quick_add_deadline);
        deadlinePreview = findViewById(R.id.quick_add_deadline_preview);
        card = findViewById(R.id.quick_add_card);

        // The popup is a momentary thing, but a rotation or a process restore mid-pick must not
        // silently drop the deadline the user already chose (the input's text survives on its
        // own; this field wouldn't).
        if (savedInstanceState != null) {
            pickedDeadline = savedInstanceState.getString(STATE_PICKED_DEADLINE);
        }

        if (prefs.getUseDeadline()) {
            deadlineButton.setOnClickListener(v -> showDeadlinePicker());
            refreshDeadlineUi();
        } else {
            // Deadlines are off for this list — no chip would render for it anyway, so the
            // button (and its preview) would only offer a value that shows up nowhere. Also
            // drop anything restored below (a widget refresh between this popup's saves could
            // have flipped useDeadline off while a picked deadline was still in state) so a
            // hidden deadline can't ride along with Add.
            pickedDeadline = null;
            deadlineButton.setVisibility(View.GONE);
            deadlineButton.setEnabled(false);
            deadlinePreview.setVisibility(View.GONE);
        }

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

    // Both pickers hide `card` while shown and restore it when they go away — this popup's own
    // background would otherwise stay visible, dimmed, behind each picker's own narrower dialog
    // window, showing through around its edges since the two windows are sized and gravitated
    // independently (the same reasoning RescheduleActivity documents for its own pickers, which
    // this flow mirrors; its shrinkToWrapContent note applies here too, since both Activities
    // share the AppTheme.WidgetDialog theme whose windowMinWidthMajor/Minor="90%" would stretch
    // the pickers' windows otherwise).

    /** The flow's first step: a date. Cancelling here restores the card and leaves whatever was
     *  picked before untouched. */
    private void showDeadlinePicker() {
        card.setVisibility(View.INVISIBLE);
        Calendar seed = Calendar.getInstance();
        DatePickerDialog dateDialog = new DatePickerDialog(
            this,
            (view, year, month, dayOfMonth) -> showTimePicker(year, month, dayOfMonth),
            seed.get(Calendar.YEAR),
            seed.get(Calendar.MONTH),
            seed.get(Calendar.DAY_OF_MONTH)
        );
        dateDialog.setOnCancelListener(d -> card.setVisibility(View.VISIBLE));
        dateDialog.show();
        shrinkToWrapContent(dateDialog);
    }

    /** The second step, only reached from a picked date: an optional time. The negative button
     *  applies the date alone — a deadline doesn't require a time, matching the web overlay's
     *  optional time field. Dismissing by any route (pick, "No time", or cancel) restores the
     *  card; a cancel leaves the previous pick untouched, a pick lands in {@link
     *  #pickedDeadline} via the button callbacks. */
    private void showTimePicker(int year, int month, int dayOfMonth) {
        String datePart = String.format(Locale.US, "%04d-%02d-%02d", year, month + 1, dayOfMonth);
        Calendar now = Calendar.getInstance();
        TimePickerDialog timeDialog = new TimePickerDialog(
            this,
            (view, hourOfDay, minute) ->
                setPickedDeadline(datePart + String.format(Locale.US, "T%02d:%02d", hourOfDay, minute)),
            now.get(Calendar.HOUR_OF_DAY),
            now.get(Calendar.MINUTE),
            false
        );
        timeDialog.setButton(DialogInterface.BUTTON_NEGATIVE, getString(R.string.reschedule_no_time),
            (dialog, which) -> setPickedDeadline(datePart));
        timeDialog.setOnDismissListener(d -> card.setVisibility(View.VISIBLE));
        timeDialog.show();
        shrinkToWrapContent(timeDialog);
    }

    private void setPickedDeadline(String deadline) {
        pickedDeadline = deadline;
        refreshDeadlineUi();
    }

    /** Lights the clock up in the accent color and shows the picked deadline while one is set;
     *  back to a muted placeholder otherwise. Runs once at setup too, so a restored (or
     *  never-picked) state renders consistently.
     *
     *  <p>The preview stays visible with a placeholder rather than being hidden when nothing is
     *  picked: it carries `layout_weight=1`, so the Add button — laid out after it — is pushed to
     *  the row's end by the preview's reserved space. Hiding the preview collapsed that spacer and
     *  let Add jump left to right next to the clock, which is why the button only sat on the right
     *  once a deadline had been picked. The placeholder also keeps the row's height from changing
     *  as a deadline comes and goes. */
    private void refreshDeadlineUi() {
        if (pickedDeadline == null) {
            deadlineButton.setColorFilter(getColor(R.color.widget_muted));
            deadlinePreview.setTextColor(getColor(R.color.widget_muted));
            deadlinePreview.setText(R.string.quick_add_deadline);
        } else {
            deadlineButton.setColorFilter(getColor(R.color.widget_accent));
            deadlinePreview.setTextColor(getColor(R.color.widget_accent));
            deadlinePreview.setText(DeadlineMath.formatDeadline(pickedDeadline));
        }
        deadlinePreview.setVisibility(View.VISIBLE);
    }

    private void shrinkToWrapContent(android.app.Dialog dialog) {
        WindowManager.LayoutParams params = dialog.getWindow().getAttributes();
        params.width = WindowManager.LayoutParams.WRAP_CONTENT;
        params.height = WindowManager.LayoutParams.WRAP_CONTENT;
        dialog.getWindow().setAttributes(params);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(STATE_PICKED_DEADLINE, pickedDeadline);
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
        final String deadline = pickedDeadline;
        new Thread(() -> {
            try {
                // When the submitted name matches an active row, the server's store() is
                // get-or-create and returns that row as-is — the submitted deadline is only
                // applied on a new/restored row. So read the item the response carries and,
                // when its deadline doesn't match what the user picked, PATCH the picked one
                // explicitly. A name-only quick-add (deadline == null) needs none of this.
                if (deadline != null) {
                    String body = WidgetApiClient.createItem(token, serverUrl, targetListId, name, deadline);
                    long itemId = WidgetJson.extractItemId(body);
                    String returnedDeadline = WidgetJson.extractItemDeadline(body);
                    if (itemId > 0 && !deadline.equals(returnedDeadline)) {
                        WidgetApiClient.updateItemDeadline(token, serverUrl, targetListId, itemId, deadline);
                    }
                } else {
                    WidgetApiClient.createItem(token, serverUrl, targetListId, name, null);
                }
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