package au.brianramsey.everylist;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import android.widget.ScrollView;

/** A {@link ScrollView} that actually caps its own height — plain {@code ScrollView} has no
 *  {@code android:maxHeight} styleable (it's declared on a few other views like ImageView, not on
 *  View/ScrollView generally), so setting that attribute in XML is silently ignored rather than
 *  erroring, which is how widget_config.xml ended up with an uncapped popup for accounts with many
 *  lists. {@link #maxHeightPx} is set from code (WidgetConfigActivity) rather than a custom XML
 *  attribute since this view has exactly one caller. */
public class MaxHeightScrollView extends ScrollView {

    private int maxHeightPx = Integer.MAX_VALUE;

    public MaxHeightScrollView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    void setMaxHeightPx(int maxHeightPx) {
        this.maxHeightPx = maxHeightPx;
    }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        // EXACTLY means the parent (here, the dialog window) is forcing a specific height —
        // honor that rather than override it. Otherwise, cap however much room we were offered
        // (AT_MOST) or given no constraint on at all (UNSPECIFIED) down to our own max.
        if (MeasureSpec.getMode(heightMeasureSpec) != MeasureSpec.EXACTLY) {
            heightMeasureSpec = MeasureSpec.makeMeasureSpec(maxHeightPx, MeasureSpec.AT_MOST);
        }
        super.onMeasure(widthMeasureSpec, heightMeasureSpec);
    }
}
