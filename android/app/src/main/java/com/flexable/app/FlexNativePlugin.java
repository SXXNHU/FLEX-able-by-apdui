package com.flexable.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * 웹 앱이 쓰는 기기 기능. 금액 · 가맹점 판단 같은 업무 규칙은 두지 않는다 (서버 담당).
 */
@CapacitorPlugin(
    name = "FlexNative",
    permissions = { @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR }) }
)
public class FlexNativePlugin extends Plugin {

    private SecureStore secureStore;

    @Override
    public void load() {
        secureStore = new SecureStore(getContext());
    }

    /* ───────── 보안 저장소 ───────── */

    @PluginMethod
    public void secureGet(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        JSObject result = new JSObject();
        result.put("value", secureStore.get(key));
        call.resolve(result);
    }

    @PluginMethod
    public void secureSet(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            secureStore.set(key, value);
            call.resolve();
        } catch (Exception e) {
            call.reject("보안 저장소에 저장하지 못했어요.", e);
        }
    }

    @PluginMethod
    public void secureRemove(PluginCall call) {
        String key = call.getString("key");
        if (key != null) {
            secureStore.remove(key);
        }
        call.resolve();
    }

    /* ───────── 결제 알림 ───────── */

    /** 사용자가 시스템 설정에서 이 앱의 알림 접근을 허용했는지 */
    @PluginMethod
    public void notificationAccessStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", NotificationManagerCompat.getEnabledListenerPackages(getContext())
            .contains(getContext().getPackageName()));
        call.resolve(result);
    }

    /** 알림 접근 허용 화면을 연다. 권한 요청 대화상자가 없는 특수 권한이라 사용자가 직접 켠다. */
    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("알림 접근 설정을 열지 못했어요.", "NO_SETTINGS");
        }
    }

    /** 큐에 쌓인 결제 알림 원문. 서버 저장이 끝나면 ackNotifications로 지운다. */
    @PluginMethod
    public void pendingNotifications(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("items", new JSArray(new NotificationQueue(getContext()).pending().toString()));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("알림 큐를 읽지 못했어요.", e);
        }
    }

    @PluginMethod
    public void ackNotifications(PluginCall call) {
        try {
            JSArray ids = call.getArray("ids", new JSArray());
            JSObject result = new JSObject();
            result.put("removed", new NotificationQueue(getContext()).ack(ids.<String>toList()));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("알림 큐를 정리하지 못했어요.", e);
        }
    }

    /* ───────── 캘린더 ───────── */

    @PluginMethod
    public void listCalendarEvents(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            requestPermissionForAlias("calendar", call, "calendarPermissionCallback");
            return;
        }
        readEvents(call);
    }

    @PermissionCallback
    private void calendarPermissionCallback(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) {
            readEvents(call);
        } else {
            call.reject("캘린더 읽기 권한이 없어요. 설정에서 허용해주세요.", "PERMISSION_DENIED");
        }
    }

    private void readEvents(PluginCall call) {
        String from = call.getString("from");
        String to = call.getString("to");
        if (from == null || to == null) {
            call.reject("from and to are required");
            return;
        }
        try {
            JSArray events = new JSArray();
            for (DeviceCalendar.Event event : DeviceCalendar.list(getContext(), from, to)) {
                JSObject item = new JSObject();
                item.put("title", event.title);
                item.put("date", event.date);
                item.put("allDay", event.allDay);
                events.put(item);
            }
            JSObject result = new JSObject();
            result.put("events", events);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("캘린더를 읽지 못했어요.", e);
        }
    }

    @PluginMethod
    public void addCalendarEvent(PluginCall call) {
        String title = call.getString("title");
        String date = call.getString("date");
        if (title == null || date == null) {
            call.reject("title and date are required");
            return;
        }
        try {
            getActivity().startActivity(DeviceCalendar.insertIntent(title, date, call.getString("description", "")));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("캘린더 앱을 찾지 못했어요.", "NO_CALENDAR_APP");
        } catch (Exception e) {
            call.reject("캘린더에 일정을 추가하지 못했어요.", e);
        }
    }
}
