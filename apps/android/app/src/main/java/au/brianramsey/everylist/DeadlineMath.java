package au.brianramsey.everylist;

import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/** Mirrors apps/web/src/lib/deadline.ts's `addHoursToDeadline` — already duplicated once in
 *  apps/web/static/push-sw.js (pinned to the original by deadline-sw-parity.spec.ts) for the same
 *  reason this copy exists: {@link DeadlineNotificationActionReceiver} runs outside the WebView/JS
 *  bundle entirely, so it can't import the original. Keep all three in sync — naive local-time
 *  math, no timezone handling, matching the other two. */
final class DeadlineMath {

    private DeadlineMath() {}

    static String addHoursToDeadline(String deadline, int hours, Date now) {
        boolean hasTime = deadline.length() > 10;
        String datePart = deadline.substring(0, 10);
        String[] dateFields = datePart.split("-");
        int year = Integer.parseInt(dateFields[0]);
        int month = Integer.parseInt(dateFields[1]);
        int day = Integer.parseInt(dateFields[2]);

        int hour = 9;
        int minute = 0;
        if (hasTime) {
            String timePart = deadline.substring(11);
            String[] timeFields = timePart.split(":");
            hour = Integer.parseInt(timeFields[0]);
            minute = Integer.parseInt(timeFields[1]);
        }

        Calendar at = Calendar.getInstance();
        at.clear();
        at.set(year, month - 1, day, hour, minute);
        at.add(Calendar.HOUR_OF_DAY, hours);

        Calendar earliest = Calendar.getInstance();
        earliest.setTime(now);
        earliest.add(Calendar.HOUR_OF_DAY, hours);

        Calendar target = at.after(earliest) ? at : earliest;

        return String.format(
            Locale.US,
            "%04d-%02d-%02dT%02d:%02d",
            target.get(Calendar.YEAR),
            target.get(Calendar.MONTH) + 1,
            target.get(Calendar.DAY_OF_MONTH),
            target.get(Calendar.HOUR_OF_DAY),
            target.get(Calendar.MINUTE)
        );
    }
}
