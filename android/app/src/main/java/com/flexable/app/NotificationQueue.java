package com.flexable.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

/**
 * 결제 알림 원문 큐. NotificationListenerService는 앱(WebView)이 꺼져 있어도 동작하므로 네이티브 저장소에 둔다.
 * 서버가 처리했다고 답한 항목만 ack로 지운다. 서버 저장이 실패하면 남겨 두었다가 다음 실행 때 다시 보낸다.
 */
final class NotificationQueue {

    /** 오래 앱을 열지 않아도 무한히 쌓이지 않게 최근 것만 남긴다. */
    static final int MAX_ITEMS = 300;
    private static final String PREFS = "flexable_notification_queue";
    private static final String KEY = "items";

    private final SharedPreferences prefs;

    NotificationQueue(Context context) {
        this.prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** 같은 id가 이미 있으면 넣지 않는다 (알림 갱신 · 중복 전달). */
    synchronized void add(JSONObject item) throws JSONException {
        JSONArray items = read();
        String id = item.getString("id");
        for (int i = 0; i < items.length(); i++) {
            if (id.equals(items.getJSONObject(i).optString("id"))) {
                return;
            }
        }
        items.put(item);
        while (items.length() > MAX_ITEMS) {
            items.remove(0);
        }
        write(items);
    }

    synchronized JSONArray pending() {
        return read();
    }

    synchronized int ack(Collection<String> ids) throws JSONException {
        Set<String> done = new HashSet<>(ids);
        JSONArray items = read();
        JSONArray remaining = new JSONArray();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.getJSONObject(i);
            if (!done.contains(item.optString("id"))) {
                remaining.put(item);
            }
        }
        write(remaining);
        return items.length() - remaining.length();
    }

    private JSONArray read() {
        try {
            return new JSONArray(prefs.getString(KEY, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private void write(JSONArray items) {
        prefs.edit().putString(KEY, items.toString()).apply();
    }
}
