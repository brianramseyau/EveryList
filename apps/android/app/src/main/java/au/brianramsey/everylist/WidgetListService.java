package au.brianramsey.everylist;

import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.widget.RemoteViewsService;

/** The RemoteViewsService backing the widget's ListView. The system instantiates this (binding it
 *  with the BIND_REMOTEVIEWS permission) and asks {@link WidgetListViewsFactory} to build each
 *  row from the per-widget snapshot in {@link WidgetPrefs}. */
public class WidgetListService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        int appWidgetId = intent.getIntExtra(
            EveryListWidget.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        return new WidgetListViewsFactory(getApplicationContext(), appWidgetId);
    }
}