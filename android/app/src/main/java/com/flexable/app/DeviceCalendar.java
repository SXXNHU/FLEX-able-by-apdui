package com.flexable.app;

import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * 기기 캘린더. 기기에 동기화된 Google 계정 캘린더도 여기에 포함되므로 Android에서는 이것으로 Google 캘린더와 연동된다.
 * 일정 읽기에는 READ_CALENDAR 권한이 필요하고, 일정 추가는 캘린더 앱을 띄워 사용자가 직접 저장한다 (쓰기 권한 없음).
 */
final class DeviceCalendar {

    static final class Event {
        final String title;
        final String date;
        final boolean allDay;

        Event(String title, String date, boolean allDay) {
            this.title = title;
            this.date = date;
            this.allDay = allDay;
        }
    }

    private DeviceCalendar() {
    }

    /** from ~ to(포함) 사이의 일정. 반복 일정은 날짜별로 펼친 인스턴스를 읽는다. */
    static List<Event> list(Context context, String from, String to) throws Exception {
        long begin = startOfDay(from, TimeZone.getDefault());
        long end = startOfDay(to, TimeZone.getDefault()) + 24L * 60 * 60 * 1000;
        Uri.Builder uri = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(uri, begin);
        ContentUris.appendId(uri, end);
        String[] projection = {
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.ALL_DAY,
        };
        List<Event> events = new ArrayList<>();
        try (Cursor cursor = context.getContentResolver()
            .query(uri.build(), projection, null, null, CalendarContract.Instances.BEGIN + " ASC")) {
            if (cursor == null) {
                return events;
            }
            while (cursor.moveToNext() && events.size() < 500) {
                String title = cursor.getString(0);
                if (title == null || title.trim().isEmpty()) {
                    continue;
                }
                boolean allDay = cursor.getInt(2) == 1;
                // 종일 일정의 시작 시각은 UTC 자정으로 저장된다.
                TimeZone zone = allDay ? TimeZone.getTimeZone("UTC") : TimeZone.getDefault();
                events.add(new Event(title.trim(), format(cursor.getLong(1), zone), allDay));
            }
        }
        return events;
    }

    /** 캘린더 앱의 일정 추가 화면을 연다. 사용자가 계정 · 시간을 확인하고 저장한다. */
    static Intent insertIntent(String title, String date, String description) throws Exception {
        long begin = startOfDay(date, TimeZone.getTimeZone("UTC"));
        return new Intent(Intent.ACTION_INSERT)
            .setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.Events.TITLE, title)
            .putExtra(CalendarContract.Events.DESCRIPTION, description)
            .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, true)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, begin)
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, begin + 24L * 60 * 60 * 1000);
    }

    private static long startOfDay(String date, TimeZone zone) throws Exception {
        SimpleDateFormat parser = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        parser.setTimeZone(zone);
        parser.setLenient(false);
        Calendar calendar = Calendar.getInstance(zone);
        calendar.setTime(parser.parse(date));
        return calendar.getTimeInMillis();
    }

    private static String format(long millis, TimeZone zone) {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        formatter.setTimeZone(zone);
        return formatter.format(millis);
    }
}
